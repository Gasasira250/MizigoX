# MizigoX

MizigoX is a multi-tenant freight and logistics operating system, Rwanda-first, designed to expand across East Africa. It is a real application: TypeScript monorepo, Express API, PostgreSQL, JWT sessions, RBAC, and a React web client for operations, finance, customers, and drivers.

This is not a prototype with sample cargo. Business records persist in PostgreSQL. GPS is live only when a device submits a location. Payments stay pending until a finance user confirms an offline payment or a configured provider webhook is verified. Email and SMS are not sent unless a provider is enabled.

## Architecture

```text
Browser (apps/web)
  → HTTPS
API (apps/api, Express)
  → PostgreSQL 16
  → Local or configured object storage (POD files)
  → Optional email / SMS / payment / maps providers
```

Recommended production hostnames (placeholders until you purchase and configure DNS):

- Frontend: `https://app.mizigox.com`
- API: `https://api.mizigox.com`

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the product model (platform / operator / customer organizations) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for hosting.

## Technologies

- Node.js 20+, TypeScript
- Express 5 API, Zod validation, argon2id passwords, JWT access tokens, httpOnly refresh cookies
- PostgreSQL 16, SQL migrations in `apps/api/src/db/migrations`
- React 19, Vite, Tailwind CSS, React Router
- Shared contracts in `packages/shared`

## Repository structure

```text
apps/api          REST API (production start: node dist/server.js)
apps/web          Operations, customer, and driver portals
packages/shared   Enums, permissions, payloads
infra             Local Postgres Compose, nginx example
docs              Deployment, security, backups, launch
```

## Local development

```bash
cp .env.example .env
# Replace JWT_ACCESS_SECRET and SEED_ADMIN_PASSWORD
docker compose -f infra/docker-compose.yml up -d
npm install
npm run build
npm run db:migrate
npm run db:seed
npm run dev
```

- Web: http://localhost:5173 (Vite proxies `/api` to the API)
- API: http://localhost:3001
- Health: http://localhost:3001/api/v1/health
- Ready: http://localhost:3001/api/v1/health/ready

Sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env`. New users cannot self-register; an administrator creates an invite.

`SEED_ON_BOOT=true` is for local/dev only. Production configuration rejects seeding on boot.

## Environment variables

Copy [.env.example](.env.example). Required values are validated at API startup. Never commit:

- Passwords, JWT secrets, database URLs with credentials
- Payment, email, SMS, or cloud keys

Production rules (when `NODE_ENV=production` or `APP_ENV=production`):

- `SEED_ON_BOOT=false`
- `COOKIE_SECURE=true` (HTTPS)
- Distinct long JWT secret (already min 32 characters)

Frontend production builds bake `VITE_API_BASE_URL` (for example `https://api.mizigox.com/api/v1`). Local Vite can leave it unset and use the `/api` proxy.

## Database

Migrations are SQL files applied in order. `npm run db:migrate` runs them. The API also migrates on boot when `MIGRATE_ON_BOOT=true`. Prefer an explicit migrate step in production after a backup. See [docs/BACKUPS.md](docs/BACKUPS.md) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Testing and quality

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

CI on GitHub Actions runs the same checks against Postgres 16. Production deploy is not automatic.

## Production start

API (after `npm run build` and migrations):

```bash
NODE_ENV=production npm run start
```

That runs `node dist/server.js` — not `tsx watch`. Serve `apps/web/dist` from a CDN or nginx with SPA fallback. Details: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

| Topic                 | Document                                 |
| --------------------- | ---------------------------------------- |
| API overview          | [docs/API.md](docs/API.md)               |
| Authentication & RBAC | [docs/SECURITY.md](docs/SECURITY.md)     |
| Deployment & HTTPS    | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| Backups & DR          | [docs/BACKUPS.md](docs/BACKUPS.md)       |
| Logging & health      | [docs/OPERATIONS.md](docs/OPERATIONS.md) |
| Launch & smoke tests  | [docs/LAUNCH.md](docs/LAUNCH.md)         |

## Launch status

MizigoX is **not ready for production** until you configure hosting, a managed database, HTTPS, secrets, backups, and the external providers you need (email, and payment if you will take card/mobile-money live). The application code is prepared for that work; it does not purchase cloud services or domains for you.
