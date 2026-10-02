# Tech Stack

What Photo Pond is built with, where each piece lives in the code, and why it was chosen. For account setup see [SETUP.md](../SETUP.md); for costs and free-tier limits see [SETUP.md → Costs & Limits](../SETUP.md#costs--limits).

## Overview

```
Browser ──► Vercel (Next.js app + API routes) ──► Neon Postgres   (metadata)
   │                    │
   │                    ├──► Anthropic Claude  (categories, tags, captions)
   │                    ├──► Nominatim (OSM)   (GPS → place name)
   │                    ├──► Resend            (access-request emails)
   │                    └──► Google OAuth      (admin sign-in)
   │
   └── presigned PUT/GET ──► Cloudflare R2     (original photos + thumbnails)
```

Photos never pass through a Vercel function on the way in: the browser uploads straight to R2 with a presigned URL, then asks the server to process the stored file.

## Application

| Layer | Technology | Version | Where |
|---|---|---|---|
| Framework | [Next.js](https://nextjs.org) (App Router, Turbopack) | 16.3 | `app/` |
| UI | [React](https://react.dev) | 19.2 | `app/`, `components/` |
| Language | TypeScript | 5 | everywhere |
| Styling | [Tailwind CSS](https://tailwindcss.com) | 4.3 | `app/globals.css` (theme tokens, grain, animations) |
| Fonts | `next/font/google`: Instrument Serif (display), Hanken Grotesk (body), DM Mono (labels) | — | `app/layout.tsx` |
| Auth | [NextAuth.js](https://next-auth.js.org) with Google provider, JWT sessions | 4.24 | `lib/auth.ts`, `app/api/auth/[...nextauth]` |
| ORM | [Drizzle ORM](https://orm.drizzle.team) + drizzle-kit | 0.45 / 0.31 | `lib/schema.ts`, `lib/index.ts`, `migrations/` |
| DB driver | [postgres.js](https://github.com/porsager/postgres) | 3.4 | `lib/index.ts` |
| Object storage SDK | AWS SDK v3 (S3 client + presigner), pointed at R2 | 3.x | `lib/r2.ts` |
| Image processing | [sharp](https://sharp.pixelplumbing.com) | 0.35 | thumbnails, metadata, downscaling for AI |
| EXIF | [exifr](https://github.com/MikeKovarik/exifr) | 7.1 | `lib/exif.ts` (capture date + offset), GPS in `notify` route |
| AI | [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) — Claude Opus 5.5 vision | 0.131 | `lib/classify.ts` |
| Email | [Resend](https://resend.com) SDK | 6.28 | `app/api/access-requests`, `app/api/admin/requests` |
| Rate limiting | Upstash Redis + `@upstash/ratelimit` | 2.1 | `lib/ratelimit.ts`, used by access requests and magic-link validation |

## Platform services

| Service | Role | Notes |
|---|---|---|
| **Vercel** | Hosting, serverless functions, CI from GitHub | Production: `main` → https://photopond.techforlife.in. Hobby plan (non-commercial) |
| **Neon** | Serverless Postgres | Scales to zero after 5 min idle |
| **Cloudflare R2** | Photo storage (S3-compatible) | Zero egress fees. Bucket CORS allows `PUT` from the production domain and `localhost:3000` |
| **Anthropic** | Photo classification | ~$0.01/photo. Locally can run through a gateway via `ANTHROPIC_BASE_URL` |
| **Nominatim** | Reverse geocoding | Free OSM API, 1 req/s policy — throttled and cached in code |
| **Google Cloud** | OAuth client for admin sign-in | Only `ADMIN_EMAIL` may sign in |
| **Resend** | Transactional email | Access requests and approvals |
| **GoDaddy** | DNS for `techforlife.in` | `photopond` CNAME → Vercel |

## Data model

Defined in `lib/schema.ts`:

| Table | Purpose | Key columns |
|---|---|---|
| `photos` | One row per photo | `r2_key`, `thumbnail_key`, `caption`, `taken_at`, `place`, `lat`/`lng`, `tags[]`, `categories[]`, `visibility` (`public`/`restricted`), `width`/`height`, `tags_pending` |
| `categories` | Gallery categories | `slug` (stored in `photos.categories`), `label`, `source` (`seed`/`admin`/`ai`), `hidden`, `sort_order` |
| `access_requests` | Visitor asks to see a restricted photo | `scope_type`/`scope_id`, requester name/email, `status` |
| `access_grants` | Approved access, redeemed via magic link | `token_hash`, `expires_at`, `revoked_at` |
| `albums`, `users` | Defined for future use | — |

Categories are dynamic, stored in the `categories` table:

- **Seeded** on first read with nature, city, heritage, people, animals, food, documents, other (`DEFAULT_CATEGORIES` in `lib/categories.ts`).
- **AI-created:** the classifier gets the current list and must reuse it; only when nothing fits may it propose one new, general 1–2 word category. Names are normalised and matched against existing ones (singular/plural, label) in `lib/categories.ts`. AI categories show on the gallery once 3 photos use them.
- **Admin-managed** at `/admin/categories`: add, rename (display label only), hide, merge (moves photos) and delete.

## How a photo upload works

1. **Browser** asks `/api/photos/presign` (admin only) for a presigned R2 URL, then `PUT`s the file directly to R2 — avoids Vercel's 4.5 MB request limit.
2. **Browser** calls `/api/photos/notify` for each photo, one at a time.
3. **Server** downloads the original from R2 and:
   - reads the EXIF capture date (`DateTimeOriginal` + UTC offset) and GPS
   - turns GPS into "Locality, Country" via Nominatim (reusing nearby known places, ≥1.1 s between calls)
   - creates a 400×400 WebP thumbnail with sharp and stores it in R2
   - adds auto tags: year, "Month Year", locality, country
   - inserts the `photos` row (caption = what you typed, else the file name)
4. **After the response** (`after()`), Claude classifies a 1024px copy via a strict tool call: categories, 3–6 tags, and a caption (only used if you didn't write one).

Photos that fail classification keep `tags_pending = 1` and can be retried with `scripts/classify-pending.mjs`.

## Front end

| Page | File | Notes |
|---|---|---|
| Gallery | `app/page.tsx` | Masthead, category tabs (only non-empty), year/place filters, edge-to-edge grid |
| Carousel | `components/Lightbox.tsx` | Keyboard/swipe, filmstrip, preloads neighbours; walks the current category/filter |
| Photo page | `app/photo/[photoId]/page.tsx` | Full image + metadata, or request-access form for restricted photos |
| Admin | `app/admin/*` | Upload with captions, manage (thumbnails, preview, edit caption/categories, bulk delete), categories, access requests |

## Scripts

One-off maintenance scripts in `scripts/` (run with `npx dotenv -e .env.local -- node scripts/<name>`):

| Script | What it does |
|---|---|
| `classify-pending.mjs` | Classify photos still marked pending (skips photos edited by the admin); may add new AI categories |
| `backfill-places.js` | Fill missing place names from stored GPS |
| `backfill-taken-at.js` | Re-read EXIF capture dates from the originals |
| `backfill-tags.js` | Add date and place tags to existing photos |
