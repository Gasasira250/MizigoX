# Deployment

Do not purchase domains, cloud accounts, or paid APIs from this repository. Configure them manually.

## Recommended production shape

```text
HTTPS CDN / static host     apps/web/dist     https://app.mizigox.com
HTTPS app server            node dist/server.js   https://api.mizigox.com
Managed PostgreSQL 16       DATABASE_URL + DATABASE_SSL=true
Private object storage      STORAGE_PROVIDER when S3 adapter is connected
Email / SMS                 only after provider keys and *_ENABLED=true
Error monitoring            SENTRY_DSN when you add an SDK
```

Use the architecture already in the repo. Do not add extra services unless you need them.

## Frontend

```bash
# Set VITE_API_BASE_URL to the public API, including /api/v1
VITE_API_BASE_URL=https://api.mizigox.com/api/v1 npm run build -w @mizigox/web
```

Upload `apps/web/dist`. SPA routing must fall back to `index.html`. Example nginx: `infra/nginx.conf.example`.

There must be no localhost API URLs in the production bundle. `VITE_*` values are compile-time.

`apps/web/public/_headers` is a starting point for Cloudflare Pages / Netlify. Confirm Content-Security-Policy against Leaflet OSM tiles (`*.tile.openstreetmap.org`) and `connect-src` to `https://api.mizigox.com` before enforcing CSP in the CDN.

## Backend

```bash
npm run build -w @mizigox/shared
npm run build -w @mizigox/api
npm run db:migrate -w @mizigox/api   # after backup
NODE_ENV=production APP_ENV=production npm run start -w @mizigox/api
```

Production start is **`node dist/server.js`**, not `tsx watch`.

Required production env (see `.env.example`):

- `NODE_ENV=production` or `APP_ENV=production`
- `SEED_ON_BOOT=false`
- `COOKIE_SECURE=true`
- `WEB_ORIGIN=https://app.mizigox.com` (add `WEB_ORIGINS` if needed)
- `APP_PUBLIC_URL` / `API_PUBLIC_URL` for invite and reset links
- `DATABASE_URL` to managed Postgres, `DATABASE_SSL=true` when the provider requires TLS
- New JWT secret, not the local `.env` value

Split-host cookies: `COOKIE_SAMESITE=none` and `COOKIE_SECURE=true`.

Set `MIGRATE_ON_BOOT=false` if you run migrations as a separate release job.

## Database migration process

1. Backup the database (see `docs/BACKUPS.md`).
2. Deploy application artifacts (do not point traffic at a half-started instance if possible).
3. Run `npm run db:migrate -w @mizigox/api` against production `DATABASE_URL`.
4. Confirm `schema_migrations` contains the latest file (currently through `012_production_hardening.sql`).
5. Hit `/api/v1/health` and `/api/v1/health/ready`.
6. Exercise login and one read API per major module.
7. Watch logs for `Unhandled API error` and authentication failures.

Migrations are transactional per file. Avoid destructive SQL unless you have a restore plan. None of the current migrations drop customer data.

## Domain and HTTPS

Placeholders:

- Frontend `https://app.mizigox.com`
- API `https://api.mizigox.com`

Terminate TLS at the load balancer / CDN. Forward `X-Forwarded-Proto: https`. The API refuses non-HTTPS in production (health excluded for internal probes).

## CI/CD

`.github/workflows/ci.yml` installs, lints, typechecks, tests, and builds. `npm audit` is informational (`continue-on-error`). **This workflow does not deploy.** Production deploys need your explicit approval and hosting credentials.
