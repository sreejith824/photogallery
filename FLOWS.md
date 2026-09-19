# PhotoGallery — Flow Diagrams

Complete sequence diagrams for all major use cases.

---

## 1. Admin Authentication & Sign-In

```mermaid
sequenceDiagram
    participant Admin as Admin Browser
    participant NextAuth as NextAuth.js
    participant Google as Google OAuth
    participant App as Backend

    Admin->>NextAuth: Clicks "Sign in with Google"
    NextAuth->>Google: Redirects to Google login
    Google->>Admin: OAuth consent screen
    Admin->>Google: Approves access
    Google->>NextAuth: Returns auth code
    NextAuth->>Google: Exchanges code for token
    Google-->>NextAuth: ID token + user info
    NextAuth->>App: Validates email === ADMIN_EMAIL
    App-->>NextAuth: Session created (JWT)
    NextAuth-->>Admin: Sets secure httpOnly cookie
    Admin->>Admin: Redirected to /admin dashboard
```

---

## 2. Admin Photo Upload (Complete Flow)

```mermaid
sequenceDiagram
    participant Admin as Admin Browser
    participant App as Backend
    participant R2 as Cloudflare R2
    participant Claude as Claude API
    participant DB as PostgreSQL (Neon)
    participant Nominatim as Reverse Geocode API

    Note over Admin: Admin at /admin/upload
    Admin->>App: POST /api/photos/presign<br/>(requires admin auth)
    App->>App: Generates unique s3Key<br/>with timestamp
    App->>R2: Generates presigned PUT URL<br/>(valid 1 hour)
    App-->>Admin: Returns presignedUrl

    Note over Admin: Admin selects photo file
    Admin->>Admin: Extracts EXIF locally<br/>(date, GPS, dimensions)
    Admin->>R2: PUT file directly to R2<br/>(via presigned URL)<br/>bypasses Lambda 4.5MB limit
    R2-->>Admin: 200 OK

    Admin->>App: POST /api/photos/notify<br/>{ s3Key, exif metadata }
    App->>App: Creates thumbnail via sharp
    App->>R2: Uploads thumbnail to R2
    App->>Nominatim: Reverse-geocode GPS<br/>{ lat, lng } → place name
    Nominatim-->>App: Returns city/country
    App->>DB: INSERT photos row<br/>{ r2_key, thumbnail_key,<br/>taken_at, place,<br/>lat, lng, tagsPending: 1 }
    DB-->>App: Returns created photo ID
    App-->>Admin: { photoId, status: 'pending_tags' }

    Note over App,Claude: Background processing (after response sent)
    App->>Claude: Vision API call<br/>image_url (R2 presigned GET)<br/>"Caption this photo + list 5 tags"
    Claude-->>App: Returns { caption, tags }
    App->>DB: UPDATE photos<br/>{ caption, tags, tagsPending: 0 }
    Note over App: Photo now fully indexed
```

---

## 3. User Browsing Public Gallery

```mermaid
sequenceDiagram
    participant User as User Browser
    participant App as Backend
    participant DB as PostgreSQL (Neon)
    participant R2 as Cloudflare R2

    User->>App: GET /api/photos<br/>(public, no auth)
    App->>DB: SELECT photos<br/>WHERE visibility='public'
    DB-->>App: Returns photo metadata<br/>{ id, caption, tags, taken_at,<br/>place, r2_key }
    App-->>User: Returns JSON array

    Note over User: Gallery rendered<br/>Grid with thumbnails
    User->>App: GET /api/photos/[photoId]/thumbnail
    App->>R2: Generates presigned GET URL<br/>(valid 24 hours)
    App-->>User: Redirects to R2<br/>Temporary S3 redirect
    User->>R2: Fetches thumbnail
    R2-->>User: Returns thumbnail image

    Note over User: User clicks to view full photo
    User->>App: GET /photo/[photoId]
    App->>DB: SELECT photo<br/>WHERE id=[photoId]
    DB-->>App: Returns photo metadata
    App-->>User: Renders photo detail page

    User->>App: GET /api/photos/[photoId]
    App->>R2: Generates presigned GET URL<br/>(valid 24 hours)
    App-->>User: Returns presigned URL
    User->>R2: Fetches full-size photo
    R2-->>User: Returns image
```

---

## 4. User Views Restricted Photo (Locked)

```mermaid
sequenceDiagram
    participant User as User Browser
    participant App as Backend
    participant DB as PostgreSQL (Neon)

    Note over User: User (not logged in)<br/>Browsing gallery
    User->>App: GET /api/photos (public)
    App->>DB: SELECT visibility FROM photos
    DB-->>App: Returns { visibility: 'restricted' }
    App-->>User: Marks photo as "locked"<br/>Shows lock icon + blur

    Note over User: User clicks locked photo
    User->>App: GET /photo/[photoId]
    App->>DB: SELECT FROM photos<br/>WHERE id=[photoId]
    App->>App: Checks: visibility='restricted'<br/>&& no admin session
    App-->>User: Shows photo detail with<br/>"Request Access" button
```

---

## 5. Visitor Requests Photo Access

```mermaid
sequenceDiagram
    participant Visitor as Visitor Browser
    participant App as Backend
    participant DB as PostgreSQL (Neon)
    participant Resend as Resend Email
    participant Admin as Admin Email

    Note over Visitor: At /photo/[photoId]<br/>Restricted photo
    Visitor->>App: Fills RequestAccessForm<br/>{ name, email, message }
    Visitor->>App: POST /api/access-requests<br/>(rate-limited: Upstash Redis)

    App->>DB: Check for existing pending<br/>request from this email
    alt Request already exists
        App-->>Visitor: Error: "Already requested"
    else Create new request
        App->>DB: INSERT accessRequests<br/>{ scopeType: 'photo',<br/>scopeId: photoId,<br/>requesterEmail, requesterName,<br/>message, status: 'pending' }
        DB-->>App: Returns request ID

        Note over App,Resend: Notify admin
        App->>Resend: Send email to ADMIN_EMAIL<br/>Subject: "New access request from [name]"<br/>Body: Includes photo ID +<br/>link to /admin/requests
        Resend-->>Admin: Email delivered
        App-->>Visitor: { status: 'success' }
    end
```

---

## 6. Admin Reviews & Approves Access Requests

```mermaid
sequenceDiagram
    participant Admin as Admin Browser
    participant App as Backend
    participant DB as PostgreSQL (Neon)
    participant Redis as Upstash Redis
    participant Resend as Resend Email
    participant Visitor as Visitor Email

    Note over Admin: At /admin/requests
    Admin->>App: GET /api/admin/requests
    App->>DB: SELECT FROM accessRequests<br/>WHERE status='pending'
    DB-->>App: Returns pending requests
    App-->>Admin: Renders request queue

    Note over Admin: Admin reviews request
    Admin->>App: POST /api/admin/requests<br/>{ requestId, action: 'approve' }

    alt Action = 'approve'
        App->>App: Generates random 32-byte<br/>token (crypto.randomBytes)
        App->>App: Hashes token with SHA-256
        App->>DB: INSERT accessGrants<br/>{ email, scopeType: 'photo',<br/>scopeId: photoId,<br/>tokenHash, expiresAt: now()+30d }
        DB-->>App: Returns grant ID

        App->>DB: UPDATE accessRequests<br/>SET status='approved',<br/>decidedAt=now()

        Note over App,Resend: Send approval magic link
        App->>Resend: Send email to requesterEmail<br/>Subject: "Photo Access Approved"<br/>Link: /share/[token]<br/>(30-day expiry noted)
        Resend-->>Visitor: Magic link email delivered
        App-->>Admin: { status: 'approved' }

    else Action = 'deny'
        App->>DB: UPDATE accessRequests<br/>SET status='denied',<br/>decidedAt=now()
        App->>Resend: Send email to requesterEmail<br/>Subject: "Photo Access Denied"
        Resend-->>Visitor: Denial email sent
        App-->>Admin: { status: 'denied' }
    end
```

---

## 7. Visitor Uses Magic Link

```mermaid
sequenceDiagram
    participant Visitor as Visitor Browser
    participant App as Backend
    participant DB as PostgreSQL (Neon)

    Note over Visitor: Visitor receives email<br/>with magic link: /share/[token]
    Visitor->>Visitor: Clicks magic link
    Visitor->>App: GET /share/[token]

    Note over App: Client-side page component
    App-->>Visitor: Renders "Validating..."

    Visitor->>App: POST /api/share/validate<br/>{ token }

    App->>App: Hashes token with SHA-256
    App->>DB: SELECT FROM accessGrants<br/>WHERE tokenHash=[hashed]<br/>AND expiresAt > now()<br/>AND revokedAt IS NULL
    DB-->>App: Returns matching grant

    alt Grant valid & not expired
        App->>App: Sets secure httpOnly cookie<br/>name: access_[photoId]<br/>value: token<br/>maxAge: 30 days<br/>secure: true (prod)<br/>sameSite: lax
        App-->>Visitor: { photoId }
        Visitor->>Visitor: Redirects to /photo/[photoId]
        Visitor->>App: GET /photo/[photoId]
        App->>App: Checks: httpOnly cookie<br/>exists && valid
        App-->>Visitor: Renders photo (UNLOCKED)

    else Token invalid/expired/revoked
        App-->>Visitor: { error: "Invalid or expired link" }
        Visitor->>Visitor: Shows error message
    end
```

---

## 8. Visitor Views Restricted Photo (With Active Grant)

```mermaid
sequenceDiagram
    participant Visitor as Visitor Browser
    participant App as Backend
    participant DB as PostgreSQL (Neon)
    participant R2 as Cloudflare R2

    Note over Visitor: Visitor already clicked<br/>magic link (has cookie)
    Visitor->>App: GET /photo/[photoId]
    App->>App: Checks: httpOnly cookie<br/>access_[photoId] exists
    App->>DB: Validates cookie token<br/>against accessGrants<br/>(expiry, revoked, hash)
    DB-->>App: ✓ Valid grant
    App-->>Visitor: Renders photo detail<br/>(photo is UNLOCKED)

    Visitor->>App: GET /api/photos/[photoId]
    App->>R2: Generates presigned GET URL<br/>(valid 24 hours)
    App-->>Visitor: Returns presigned URL
    Visitor->>R2: Fetches full-size photo
    R2-->>Visitor: Returns image
```

---

## 9. Admin Revokes Photo Access

```mermaid
sequenceDiagram
    participant Admin as Admin Browser
    participant App as Backend
    participant DB as PostgreSQL (Neon)

    Note over Admin: At /admin/grants<br/>Lists active grants
    Admin->>App: GET /api/admin/grants
    App->>DB: SELECT FROM accessGrants<br/>WHERE revokedAt IS NULL<br/>AND expiresAt > now()
    DB-->>App: Returns active grants
    App-->>Admin: Displays list<br/>(requester email, expiry, photo)

    Note over Admin: Admin wants to revoke
    Admin->>App: POST /api/admin/grants<br/>{ grantId, action: 'revoke' }
    App->>DB: UPDATE accessGrants<br/>SET revokedAt=now()<br/>WHERE id=grantId
    DB-->>App: ✓ Revoked

    Note over Admin: From now on...
    Note over Admin: Visitor tries to access photo
    App->>DB: SELECT FROM accessGrants<br/>WHERE tokenHash=[...]<br/>AND revokedAt IS NULL
    DB-->>App: No matching grant<br/>(revokedAt is set)
    App-->>Admin: { error: "Access revoked" }
```

---

## 10. Photo Visibility Toggle (Admin Edit)

```mermaid
sequenceDiagram
    participant Admin as Admin Browser
    participant App as Backend
    participant DB as PostgreSQL (Neon)

    Note over Admin: At /admin/photo/[photoId]/edit
    Admin->>App: GET /api/admin/photos/[photoId]
    App->>DB: SELECT * FROM photos<br/>WHERE id=[photoId]
    DB-->>App: Returns photo metadata
    App-->>Admin: Renders edit form<br/>(visibility: 'public' | 'restricted')

    Note over Admin: Admin changes from public<br/>to restricted
    Admin->>App: POST /api/admin/photos/[photoId]<br/>{ visibility: 'restricted' }
    App->>DB: UPDATE photos<br/>SET visibility='restricted'<br/>WHERE id=photoId
    DB-->>App: ✓ Updated

    Note over Admin: Effect: Photo now requires<br/>access request to view
```

---

## 11. Admin Edits Photo Metadata

```mermaid
sequenceDiagram
    participant Admin as Admin Browser
    participant App as Backend
    participant DB as PostgreSQL (Neon)

    Note over Admin: At /admin/photo/[photoId]/edit
    Admin->>Admin: Edits: caption, tags,<br/>people tags, album
    Admin->>App: POST /api/admin/photos/[photoId]<br/>{ caption, tags, people,<br/>albumId }
    App->>DB: UPDATE photos<br/>SET caption, tags,<br/>people, albumId
    DB-->>App: ✓ Updated
    App-->>Admin: { status: 'success' }

    Note over Admin: Next time gallery loads,<br/>updated metadata visible
```

---

## 12. Gallery Filter by Year, Place, Tags

```mermaid
sequenceDiagram
    participant User as User Browser
    participant App as Backend
    participant DB as PostgreSQL (Neon)

    Note over User: Gallery page /
    User->>App: GET /api/photos?year=2024&place=NYC
    App->>DB: SELECT FROM photos<br/>WHERE visibility='public'<br/>AND YEAR(taken_at)=2024<br/>AND place LIKE 'NYC%'
    DB-->>App: Returns filtered photos
    App-->>User: Returns JSON array

    Note over User: Gallery re-renders<br/>with filtered results
    User->>App: GET /api/photos?tags=mountain
    App->>DB: SELECT FROM photos<br/>WHERE visibility='public'<br/>AND tags @> ARRAY['mountain']
    DB-->>App: Returns matching photos
    App-->>User: Gallery updates
```

---

## Use Cases Summary

| # | Flow | Participants | Key Features |
|---|------|--------------|--------------|
| 1 | Admin Sign In | Admin, Google OAuth | JWT session, email validation |
| 2 | Photo Upload | Admin, R2, Claude, DB | Direct R2 upload, background tagging |
| 3 | Browse Public | User, DB, R2 | Thumbnails, metadata, filters |
| 4 | View Restricted (Locked) | User, DB | Lock icon, request form shown |
| 5 | Request Access | Visitor, DB, Resend | Dedup check, admin email notify |
| 6 | Admin Approve/Deny | Admin, DB, Resend | Token generation, magic link email |
| 7 | Magic Link Validation | Visitor, DB | Token hash, cookie set |
| 8 | View Restricted (Granted) | Visitor, DB, R2 | Cookie validates grant |
| 9 | Revoke Access | Admin, DB | Mark grant revoked |
| 10 | Toggle Visibility | Admin, DB | Public ↔ Restricted |
| 11 | Edit Metadata | Admin, DB | Manual tags, people, album |
| 12 | Filter Gallery | User, DB | By year, place, tags |

---

## Data Security & Access Patterns

### Public Flow (No Auth Required)
- `GET /api/photos` — public photos only
- `GET /photo/[id]` — public photos only; restricted shows request form
- `GET /api/photos/[id]/thumbnail` — redirects to presigned URL

### Restricted + Grant Flow (Cookie-Based)
- Visitor clicks magic link → token validated → httpOnly cookie set
- Cookie checked on every restricted photo view
- Cookie valid for 30 days or until revoked
- Token never exposed in client-side code (httpOnly prevents XSS leakage)

### Admin Flow (Session-Based)
- NextAuth JWT session + middleware email check
- Protected routes: `/admin/*`, `/api/admin/*`
- Every admin action logged implicitly (timestamps in DB)

### Rate Limiting (Upstash Redis)
- `/api/access-requests` — 10 requests per hour per IP
- `/api/photos/presign` — 5 requests per hour per admin (prevent accidental bill shock)
- `/api/photos/notify` — tied to presign (part of upload flow)

---

## Error Scenarios

| Scenario | Handling |
|----------|----------|
| Photo upload > 4.5MB | Bypassed via presigned URL → direct R2 upload |
| Claude API timeout | Queued via `after()` → retryable in logs |
| Magic link expired | User sees error, can request again |
| Token revoked mid-session | Next photo view fails (cookie still valid, but grant revoked in DB) |
| Spam access requests | Rate limited by Upstash (10/hour/IP) |
| Admin not verified email | Middleware blocks `/admin` access |

