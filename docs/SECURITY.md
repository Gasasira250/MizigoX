# Security

## Secrets

Never commit `.env`, API keys, JWT secrets, database passwords, or provider credentials. Search the tree for `CHANGE_ME` leftovers before launch. If a secret was ever committed, rotate it; removing it from git history is not enough.

Local Docker Postgres (`mizigox` / `mizigox`) is for development only.

## Authentication

- Passwords hashed with **argon2id**
- Access JWT (`JWT_ACCESS_TTL_SECONDS`, default 15 minutes)
- Opaque refresh tokens stored as SHA-256 hashes, httpOnly cookie `mx_refresh`, path `/api/v1/auth`
- Cookie flags: `COOKIE_SECURE`, `COOKIE_SAMESITE` (`lax` | `strict` | `none`). `none` requires `secure` (needed when the SPA and API are on different sites, e.g. `app.mizigox.com` and `api.mizigox.com`)
- Account lockout: 8 failed logins, 15 minutes
- Login/register/forgot/reset/refresh rate limits
- Inactive and unverified users cannot sign in
- Password reset: hashed tokens, 30-minute expiry, always-200 forgot response, sessions revoked on reset
- Invites required for registration

Do not weaken these settings for development convenience in production.

## Authorization (RBAC)

Roles include Super Admin, Operations Admin, Finance Admin, Company Admin, Logistics Manager, Finance Officer, Customer Admin/Staff, and Driver. Permission codes use dots (`shipments.read`). Every sensitive route uses server-side `authenticate` plus permission checks. IDOR and cross-organization access are rejected in services (typically 403 or 404).

Frontend `can()` is display-only.

## API protections

- Helmet: nosniff, frame deny, referrer no-referrer, HSTS in production
- CORS allow-list from `WEB_ORIGIN` + `WEB_ORIGINS` (credentials on)
- JSON body limit 2 MB; mutating requests must be `application/json`
- Raw-body HMAC for payment webhooks
- Parameterized SQL (`pg` queries); Zod input validation
- Production 500 responses do not include stack traces or SQL
- HTTPS required in production (honors `X-Forwarded-Proto` behind a proxy)
- Health endpoints omit connection strings

## Files

POD uploads: PNG/JPEG/WebP/PDF, size cap, sanitized names, org-prefixed storage keys, path traversal rejected on read. Storage keys are not returned on POD payloads. `STORAGE_PROVIDER=s3` is reserved until an S3 client is connected.

Vehicle/driver document rows may store an external key/URL entered by staff; they are not public buckets in this repo.

## Payments

- Server-calculated invoice totals (`NUMERIC`)
- Unique invoice and payment numbers
- Idempotency keys and unique provider event ids
- Customers cannot confirm payments
- Webhooks rejected without a configured secret and valid HMAC

**Payment provider integration remains required before accepting real customer payments.** Do not simulate provider success in production.

## Tracking

Driver/vehicle ownership and org checks on location ingest. Public tokens are unguessable (`mxt_` + 48 random bytes) and hashed. Stale GPS is labeled from configured thresholds. The product does not invent coordinates.

## Notifications

Users cannot set arbitrary recipients on notify APIs. Password reset tokens are never written to in-app notifications.

## Remaining risks (accepted for launch planning)

- In-memory rate limits are per process (use a shared store if you run multiple API instances)
- SMTP/SES adapters are not fully implemented (Resend/SendGrid HTTP are)
- S3 adapter is not implemented (fail closed)
- Audit logs may contain business identifiers (emails on failed login for unknown users)
- No dedicated WAF; place one in front of production if you expose the API publicly
