# Photo Pond

A personal photo gallery — moments, places and the light in between.

**Live:** https://photopond.techforlife.in

Photo Pond is a Next.js app for publishing a personal photo archive. Upload photos and it reads the date and location from the photo, turns GPS into a place name, generates thumbnails, and uses Claude to sort each photo into categories with tags and a caption. Visitors browse by category in an editorial-style gallery with a full-screen carousel; restricted photos can be requested and shared through magic links.

## Features

**Gallery**
- Editorial layout with category tabs (only categories that have photos), year and place filters
- Full-screen carousel that steps through the current category or all photos — keyboard, swipe, filmstrip
- Photo pages with date, place and tags; restricted photos show a request-access form

**Smart processing on upload**
- Capture date from EXIF (`DateTimeOriginal` with its UTC offset)
- GPS → "Locality, Country" via OpenStreetMap Nominatim
- Automatic tags: year, month, locality, country
- AI categories, descriptive tags and a caption from Claude vision. Starts with nature, city, heritage, people, animals, food, documents, other; the AI reuses these and only creates a new category when nothing fits (shown on the gallery once 3 photos use it)

**Admin** (one Google account only)
- Upload from laptop or phone (file picker or camera), with an optional caption per photo; files go straight to storage, no size cap from the host
- Manage photos: thumbnails, carousel preview, edit caption and categories, select-all and bulk delete
- Manage categories: add, rename, hide, merge and delete
- Review access requests and send magic links

## Documentation

| Doc | What's in it |
|---|---|
| [SETUP.md](SETUP.md) | Step-by-step setup of every service (Neon, R2, Google OAuth, Vercel, Resend, Anthropic), environment variables, troubleshooting |
| [SETUP.md → Costs & Limits](SETUP.md#costs--limits) | What each service costs, free-tier storage/compute limits, which limit you'll hit first, when to upgrade |
| [docs/TECH_STACK.md](docs/TECH_STACK.md) | Libraries and services used, data model, upload pipeline, where things live in the code |
| [FLOWS.md](FLOWS.md) | Design doc: sequence diagrams for sign-in, upload, browsing, access requests and magic links |

> FLOWS.md captures the intended design. Some flows in it aren't built yet: revoking access, the visibility toggle in the admin UI, tag filtering, and Upstash rate limiting.

## Tech stack at a glance

| | |
|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Auth | NextAuth.js + Google, restricted to `ADMIN_EMAIL` |
| Data | Neon Postgres via Drizzle ORM |
| Storage | Cloudflare R2 (presigned uploads/downloads) |
| Processing | sharp, exifr, Nominatim, Claude Opus 5.5 (Anthropic SDK) |
| Email | Resend |
| Hosting | Vercel, deployed from `main` |

Details in [docs/TECH_STACK.md](docs/TECH_STACK.md).

## Getting started

Prerequisites: Node.js 20+, and accounts set up as described in [SETUP.md](SETUP.md).

```bash
npm install
cp .env.example .env.local   # fill in the values, see SETUP.md
npm run db:migrate           # create/update tables in Neon
npm run dev                  # http://localhost:3000
```

Sign in at http://localhost:3000/admin with the Google account set as `ADMIN_EMAIL`.

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Push `lib/schema.ts` to the database (drizzle-kit) |
| `npm run db:generate` | Generate a SQL migration from schema changes |

Maintenance scripts (backfills, re-running AI classification) are listed in [docs/TECH_STACK.md → Scripts](docs/TECH_STACK.md#scripts).

## Project structure

```
app/
  page.tsx                 Gallery (landing page)
  photo/[photoId]/         Photo page
  admin/                   Admin: upload, manage photos, access requests
  api/                     Route handlers (photos, admin, auth, access requests, share links)
components/                Lightbox carousel, edit dialog, request-access form
lib/                       auth, db schema, R2, EXIF, AI classification, categories
scripts/                   One-off backfill / classification scripts
migrations/                Drizzle SQL migrations
docs/                      Tech stack documentation
```

## Deployment

Pushing to `main` deploys to production on Vercel (https://photopond.techforlife.in). Production needs the same environment variables as `.env.local`, with `NEXTAUTH_URL=https://photopond.techforlife.in` and an `ANTHROPIC_API_KEY` that has credit. See [SETUP.md → Production Deployment Checklist](SETUP.md#production-deployment-checklist).
