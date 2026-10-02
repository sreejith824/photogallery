# Tech Stack

What Photo Pond is built with, where each piece lives in the code, and why it was chosen. For account setup see [SETUP.md](../SETUP.md); for costs and free-tier limits see [SETUP.md → Costs & Limits](../SETUP.md#costs--limits).

## Overview

```
Browser ──► Vercel CDN ──► Next.js app + API routes (Vercel functions)
   │        (cached GETs)        │
   │                             ├──► Neon Postgres     (metadata)
   │                             ├──► Anthropic Claude  (categories, tags, captions)
   │                             ├──► Nominatim (OSM)   (GPS → place name)
   │                             ├──► Upstash Redis     (rate limits for public forms)
   │                             ├──► Resend            (access-request emails)
   │                             └──► Google OAuth      (admin sign-in)
   │
   └── presigned PUT/GET ──► Cloudflare R2  (original photos + thumbnails)
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
| `photos` | One row per photo | `r2_key`, `thumbnail_key`, `caption`, `taken_at`, `place`, `lat`/`lng`, `tags[]`, `categories[]`, `visibility` (`public`/`restricted`), `width`/`height`, `tags_pending`, `content_hash` (SHA-256, unique), `perceptual_hash` (64-bit difference hash) |
| `categories` | Gallery categories | `slug` (stored in `photos.categories`), `label`, `source` (`seed`/`admin`/`ai`), `hidden`, `sort_order` |
| `access_requests` | Visitor asks to see a restricted photo | `scope_type`/`scope_id`, requester name/email, `status` |
| `access_grants` | Approved access, redeemed via magic link | `token_hash`, `expires_at`, `revoked_at` |
| `albums`, `users` | Defined for future use | — |

Categories are dynamic, stored in the `categories` table:

- **Seeded** on first read with nature, city, heritage, people, animals, food, documents, other (`DEFAULT_CATEGORIES` in `lib/categories.ts`).
- **AI-created:** the classifier gets the current list and must reuse it; only when nothing fits may it propose one new, general 1–2 word category. Names are normalised and matched against existing ones (singular/plural, label) in `lib/categories.ts`. AI categories show on the gallery once 3 photos use them.
- **Admin-managed** at `/admin/categories`: add, rename (display label only), hide, merge (moves photos) and delete.

## How a photo upload works

0. **Browser** hashes each selected file (SHA-256) and asks `/api/admin/photos/duplicates` which already exist. Exact duplicates, including the same file picked twice, are marked "Skipped: duplicate" and never uploaded.
1. **Browser** asks `/api/photos/presign` (admin only) for a presigned R2 URL, then `PUT`s the file directly to R2 — avoids Vercel's 4.5 MB request limit.
2. **Browser** calls `/api/photos/notify` for each photo, one at a time.
3. **Server** downloads the original from R2 and first checks for duplicates, before any other work:
   - **exact duplicate** (same SHA-256): deletes the just-uploaded file and returns `409`; the unique index on `content_hash` also catches two simultaneous uploads
   - **lookalike** (difference hash within 4 of 64 bits of an already-classified photo, e.g. a resized copy or burst shot): reuses that photo's categories, tags and caption instead of calling Claude, and the upload page shows "Looks like …"

   Then it:
   - reads the EXIF capture date (`DateTimeOriginal` + UTC offset) and GPS
   - turns GPS into "Locality, Country" via Nominatim (reusing nearby known places, ≥1.1 s between calls)
   - creates a 400×400 WebP thumbnail with sharp and stores it in R2
   - adds auto tags: year, "Month Year", locality, country
   - inserts the `photos` row (caption = what you typed, else the file name)
4. **After the response** (`after()`, skipped for lookalikes), Claude classifies a 1024px copy via a strict tool call: categories, 3–6 tags, and a caption (only used if you didn't write one).

Photos that fail classification keep `tags_pending = 1` and can be retried with `scripts/classify-pending.mjs`.

## Caching & traffic protection

Two separate mechanisms, used by different requests:

- **Vercel CDN** caches what visitors *read* (public `GET` responses), driven by the `Cache-Control` headers the route handlers set.
- **Upstash Redis** counts requests to the two public *forms* for rate limiting. It never stores pages or photos.

### What the CDN caches

| Endpoint | Content | CDN (`s-maxage`) | Browser (`max-age`) | Then |
|---|---|---|---|---|
| `/api/photos/[id]/thumbnail` | 400×400 WebP thumbnail (bytes) | 7 days | 1 day | `stale-while-revalidate` 1 day |
| `/api/photos` | Gallery list: photo data (captions, dates, places, categories), no images | 60 s | — | `stale-while-revalidate` 5 min |
| `/api/categories` | Category list for the tabs | 60 s | — | `stale-while-revalidate` 5 min |
| `/api/photos/[id]` (public photos) | Photo details + a 24 h presigned link to the full image | 1 hour | — | `stale-while-revalidate` 10 min |
| `/api/photos/[id]` (restricted photos) | — | never (`private, no-store`) | never | — |
| `/api/admin/*`, auth, uploads | — | never | never | — |

**Full-size photos are not cached by Vercel.** The browser downloads them directly from Cloudflare R2 using the presigned link from `/api/photos/[id]`; R2 has no egress fees. Caching that JSON for an hour is safe because the link inside stays valid for 24 hours.

**How a request flows:**

```
Visitor ─► Vercel CDN ──hit──► cached response (no function, no DB, no R2)
               │
              miss (first request per region, or TTL expired)
               ▼
         Route handler ─► Neon / R2 ─► response + Cache-Control ─► stored at the CDN
```

The cache is per Vercel region: the first visitor in each region causes one miss. With `stale-while-revalidate`, an expired entry is still served immediately while the CDN refreshes it in the background.

**Trade-offs:**

- New uploads and edits appear on the public gallery within about a minute (the `/api/photos` TTL). The admin pages use the uncached `/api/admin/photos`, so they always show the current state.
- Thumbnail keys are unique per upload and never change, so long caching is safe. A deleted photo's thumbnail can stay reachable at its URL until the CDN copy expires (up to 7 days).
- Nothing purges the CDN on edits; entries simply expire. If instant updates ever matter, add a Vercel cache purge on admin edits.

### Rate limits (Upstash)

Defined in `lib/ratelimit.ts` (sliding windows, one Redis command per request):

| Endpoint | Limit | Protects |
|---|---|---|
| `POST /api/access-requests` | 5 / hour per IP, 3 / day per email + photo | Database, admin inbox, Resend's 100 emails/day |
| `POST /api/share/validate` | 20 / minute per IP | Magic-link token guessing |

Over the limit returns `429` with `Retry-After`. If the Upstash variables are missing or Redis errors, requests are allowed (fail open). Admin endpoints aren't rate limited; they require the admin's Google login.

### Platform protection

Vercel's automatic DDoS mitigation sits in front of everything on all plans, and Attack Mode / WAF custom rules are available in the Vercel dashboard. See [SETUP.md → Costs & Limits](../SETUP.md#costs--limits) for how this maps to the free-tier allowances.

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
| `backfill-hashes.mjs` | Fingerprint existing photos for duplicate detection and report exact duplicates and lookalikes (deletes nothing) |
