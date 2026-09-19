# PhotoGallery Setup Guide

Complete configuration guide for all SaaS platforms and services used in this project.

## Quick Overview

| Service | Purpose | Cost | Setup Time |
|---------|---------|------|-----------|
| **Neon** | PostgreSQL Database | Free tier (unlimited) | 5 min |
| **Cloudflare R2** | Photo Storage | Free tier (10GB, zero egress) | 5 min |
| **Google Cloud** | OAuth Authentication | Free | 10 min |
| **Vercel** | Hosting & Deployment | Free tier | 5 min |
| **Resend** | Email Delivery | Free tier (generous) | 5 min |
| **Anthropic** | AI Auto-tagging | Pay-per-use (~cents) | 5 min |
| **Upstash Redis** | Rate Limiting | Free tier | 5 min |

---

## 1. Database — Neon (PostgreSQL)

**What it does:** Serverless PostgreSQL database. Stores photos, users, access requests, and grants.

### Setup

1. Go to **https://console.neon.tech**
2. Sign up with email or GitHub
3. Create a new project (defaults are fine)
4. Copy the **Connection String** from the dashboard
5. Add to `.env.local`:
   ```
   DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
   ```

### For Vercel

1. In Vercel project settings → **Storage**
2. Click **Create Database** → Select **Neon**
3. Authorize your Neon account
4. This auto-links your Neon project and enables **per-preview-deployment database branching**
   - Each PR gets its own isolated Neon branch (great for testing)
   - Merges to `main` run migrations on production

### Local Development

```bash
npm run db:migrate  # Runs migrations
npm run dev         # Starts dev server
```

---

## 2. Storage — Cloudflare R2

**What it does:** S3-compatible object storage. Stores photo originals and thumbnails. **Zero egress fees** (matters for gallery views).

### Setup

1. Go to **https://dash.cloudflare.com**
2. Sign up if needed
3. Navigate to **R2** (left sidebar)
4. Click **Create Bucket**
   - Name: `photogallery` (or your choice)
   - Location: pick closest to you
   - Leave defaults (no public access initially)
5. Click the bucket → **Settings** → scroll to **S3 API Credentials**
6. Click **Create API Token**
   - Account ID: copy this
   - Access Key ID: copy this
   - Secret Access Key: copy this (only shown once!)
7. Add to `.env.local`:
   ```
   R2_ACCOUNT_ID=your_account_id
   R2_ACCESS_KEY=your_access_key_id
   R2_SECRET_KEY=your_secret_access_key
   R2_BUCKET_NAME=photogallery
   R2_PUBLIC_URL=https://{account-id}.r2.cloudflarestorage.com
   ```

### For Production (Optional Custom Domain)

1. In R2 bucket settings, find **Custom Domain**
2. Enter your domain (e.g., `photos.techforlife.in`)
3. Follow Cloudflare DNS instructions
4. Update `R2_PUBLIC_URL` to your custom domain in Vercel

---

## 3. Authentication — Google OAuth

**What it does:** Lets you (the admin) sign in with your Google account. Only admin can upload.

### Setup

1. Go to **https://console.cloud.google.com**
2. Sign in with your Google account
3. Create a new project (or use existing)
   - Project name: `PhotoGallery` (or your choice)
4. Enable the **Google+ API**:
   - Search "Google+ API" in the search bar
   - Click it → **Enable**
5. Create OAuth credentials:
   - Click **Create Credentials** → **OAuth client ID**
   - Choose **Web application**
   - Authorized JavaScript origins:
     ```
     http://localhost:3000
     https://yourdomain.com
     ```
   - Authorized redirect URIs:
     ```
     http://localhost:3000/api/auth/callback/google
     https://yourdomain.com/api/auth/callback/google
     ```
   - Click **Create**
6. Copy the credentials:
   - **Client ID** → copy
   - **Client Secret** → copy (keep private!)
7. Add to `.env.local`:
   ```
   GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your_client_secret
   ```

### Important

- **Never commit** `GOOGLE_CLIENT_SECRET` to git
- Never download the JSON file to your repo (delete it if you did)
- Use `.env.local` (gitignored) for local dev

---

## 4. Authentication — NextAuth Secret

**What it does:** Encrypts session tokens. Must be a strong random secret.

### Generate Secret

```bash
openssl rand -base64 32
```

Copy the output and add to `.env.local`:

```
NEXTAUTH_SECRET=your_generated_secret_here
NEXTAUTH_URL=http://localhost:3000  # local dev
```

For production (Vercel), set `NEXTAUTH_URL` to your actual domain.

---

## 5. Email Service — Resend

**What it does:** Sends transactional emails. Notifies admin of access requests and sends approval magic links to requesters.

### Setup

1. Go to **https://resend.com**
2. Sign up (free tier generous for projects like this)
3. Verify your email
4. Navigate to **API Keys** (left sidebar)
5. Click **Create API Key**
   - Copy it (only shown once)
6. Add to `.env.local`:
   ```
   RESEND_API_KEY=re_your_api_key_here
   ADMIN_EMAIL=your-email@gmail.com
   ```

### How It's Used

- Admin gets notified when someone requests access to a restricted photo
- Requester gets a magic link email when admin approves their request
- Requester gets notified if admin denies their request

---

## 6. AI Auto-Tagging — Anthropic (Claude)

**What it does:** Automatically captions and tags photos when you upload them. Uses Claude Vision API.

### Setup

1. Go to **https://console.anthropic.com**
2. Sign in with your account (create one if needed)
3. Navigate to **API Keys** (left sidebar)
4. Click **Create Key**
   - Name: `PhotoGallery`
5. Copy the key (only shown once)
6. Add to `.env.local`:
   ```
   ANTHROPIC_API_KEY=sk-ant-v0-xxxxxxxxxxxxx
   ```

### Cost

- Per-image: ~$0.01 (rough estimate based on image size + tokens used)
- 1,000 photos = ~$10
- Free tier or paid account both work

### How It's Used

When you upload a photo:
1. EXIF data extracted (date, GPS)
2. GPS reverse-geocoded to place name
3. Thumbnail generated
4. **Claude Vision called in background** to generate caption + tags
5. Photo record updated with `caption` and `tags`

The background call happens *after* your upload completes, so the UI is responsive.

---

## 7. Rate Limiting — Upstash Redis

**What it does:** Prevents abuse by rate-limiting uploads and access requests. Free tier is generous.

### Setup

1. Go to **https://console.upstash.com**
2. Sign up (free tier available)
3. Click **Create Database**
   - Type: **Redis**
   - Region: **Global** (lowest latency)
4. Once created, view the database → copy:
   - **UPSTASH_REDIS_REST_URL** (endpoint URL)
   - **UPSTASH_REDIS_REST_TOKEN** (auth token)
5. Add to `.env.local`:
   ```
   UPSTASH_REDIS_REST_URL=https://xxxxx.upstash.io
   UPSTASH_REDIS_REST_TOKEN=your_token_here
   ```

### How It's Used

- `/api/access-requests` — limits how many requests a visitor can submit (spam protection)
- `/api/photos/presign` & `/api/photos/notify` — limits upload frequency (protects your Claude API bill)

---

## 8. Hosting & Deployment — Vercel

**What it does:** Hosts your app. Auto-deploys when you push to GitHub.

### Setup

1. Go to **https://vercel.com**
2. Sign in with GitHub
3. Click **Add New...** → **Project**
4. Select your GitHub repo: `sreejith824/photogallery`
5. Click **Import**
6. Configure:
   - **Build Command:** `npm run db:migrate && next build`
   - **Output Directory:** `.next`
   - Leave others as default
7. Click **Deploy**

### Add Environment Variables

In Vercel project dashboard, go to **Settings** → **Environment Variables**

Add all these (copy from your `.env.local`):

```
DATABASE_URL
ADMIN_EMAIL
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
NEXTAUTH_SECRET
NEXTAUTH_URL
R2_ACCOUNT_ID
R2_ACCESS_KEY
R2_SECRET_KEY
R2_BUCKET_NAME
R2_PUBLIC_URL
RESEND_API_KEY
ANTHROPIC_API_KEY
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

**Tip:** Set different values per environment (Development/Preview/Production) if needed. For most, they're the same.

### Per-Preview Database Branching

1. In Vercel project → **Storage** tab
2. Click the Neon database card → **Configure**
3. Check **Enable Neon integrations for preview deployments**
4. Now each PR gets its own isolated Neon branch (safe for testing)

---

## Local Development Checklist

Before running `npm run dev`:

```bash
# 1. Create .env.local with all vars from .env.example
cp .env.example .env.local

# 2. Fill in all credentials:
#   - DATABASE_URL (from Neon)
#   - GOOGLE_CLIENT_ID/SECRET (from Google Cloud)
#   - R2_* (from Cloudflare)
#   - RESEND_API_KEY (from Resend)
#   - ANTHROPIC_API_KEY (from Anthropic)
#   - UPSTASH_REDIS_REST_* (from Upstash)
#   - ADMIN_EMAIL (your email)
#   - NEXTAUTH_SECRET (generated random)

# 3. Install dependencies
npm install

# 4. Run migrations
npm run db:migrate

# 5. Start dev server
npm run dev

# 6. Open browser
open http://localhost:3000
```

---

## Production Deployment Checklist

Before your first production deploy:

- [ ] All env vars set in Vercel dashboard (Development, Preview, Production)
- [ ] Google OAuth redirect URIs include your production domain
- [ ] `NEXTAUTH_URL` set to your production domain in Vercel
- [ ] Neon-Vercel integration enabled for per-preview branching
- [ ] R2 bucket name and region correct
- [ ] Custom domain (if using) pointed to Vercel and Cloudflare
- [ ] Test flow on production:
  - Sign in with Google as admin
  - Upload a test photo (check auto-tagging works)
  - Mark photo as restricted
  - Request access in incognito window
  - Approve from admin panel
  - Follow magic link, verify access granted

---

## Troubleshooting

### Photo Upload Fails
- Check R2 credentials in `.env.local`
- Check Vercel Build Command includes `npm run db:migrate`
- Check Anthropic API key is valid (Claude tagging runs in background)

### Email Not Sending
- Check Resend API key in `.env.local`
- Check `ADMIN_EMAIL` is correct
- Verify Resend account is verified (check Resend dashboard)

### Sign In Fails
- Check Google Client ID/Secret in `.env.local`
- Check authorized redirect URI includes your domain in Google Cloud Console
- Check `NEXTAUTH_SECRET` is set

### Database Connection Error
- Check `DATABASE_URL` format (should include `?sslmode=require`)
- Verify Neon database is running (check Neon console)
- Check network access (Neon is accessible globally by default)

---

## Cost Summary (Monthly)

| Service | Cost |
|---------|------|
| Neon | Free (free tier) |
| Cloudflare R2 | Free (free tier, zero egress) |
| Google OAuth | Free |
| Vercel | Free (free tier) |
| Resend | Free (free tier, up to 100 emails/day) |
| Anthropic | ~$0-5 (pay-per-use, ~$0.01/photo) |
| Upstash Redis | Free (free tier) |
| **Total** | **~$0-5/month** |

---

## Next Steps

1. ✅ Set up all SaaS accounts (follow order above)
2. ✅ Add all credentials to `.env.local`
3. ✅ Run `npm run dev` locally and test
4. ✅ Push to GitHub
5. ✅ Deploy to Vercel
6. ✅ Add production env vars to Vercel
7. ✅ Test production flow

Happy uploading! 📸
