# MizigoX API

Base path: `/api/v1`. JSON request and response bodies. Authenticated routes expect `Authorization: Bearer <accessToken>` and send the refresh cookie `mx_refresh` on `/api/v1/auth` (httpOnly).

Success envelope:

```json
{ "data": {}, "meta": { "requestId": "…" } }
```

Error envelope:

```json
{ "error": { "code": "UNAUTHORIZED", "message": "…", "details": [], "requestId": "…" } }
```

List endpoints that support paging return `meta.page`, `meta.pageSize`, and `meta.total`.

## Public

| Method | Path                           | Notes                                                              |
| ------ | ------------------------------ | ------------------------------------------------------------------ |
| GET    | `/health`                      | Liveness. No secrets.                                              |
| GET    | `/health/ready`                | Database ping. Failures do not include connection strings.         |
| GET    | `/public/track/:token`         | Public shipment tracking. Token format `mxt_…`. Rate limited.      |
| GET    | `/public/track/config`         | Map/freshness config. Rate limited.                                |
| POST   | `/webhooks/payments/:provider` | HMAC required when `PAYMENT_WEBHOOK_SECRET` is set. Uses raw body. |

## Authentication

| Method   | Path                    | Notes                                                |
| -------- | ----------------------- | ---------------------------------------------------- |
| POST     | `/auth/login`           | Rate limited. Lockout after 8 failures.              |
| POST     | `/auth/register`        | Invite token required.                               |
| POST     | `/auth/refresh`         | Cookie. Rate limited.                                |
| POST     | `/auth/logout`          | Revokes refresh token.                               |
| POST     | `/auth/forgot-password` | Always `{ accepted: true }`. Does not return tokens. |
| POST     | `/auth/reset-password`  | Hashed one-time token. Revokes sessions.             |
| GET      | `/auth/me`              | Current user.                                        |
| POST     | `/auth/change-password` | Revokes sessions.                                    |
| GET/POST | `/auth/invites`         | `users.manage`.                                      |

Passwords: min 12 characters, letter + number, argon2id.

## Authenticated modules

All of the following require a valid access token. Permissions are enforced **on the server** (`requirePermission` / `requireAnyPermission`). Frontend menus are not a security boundary.

- `/customers` — customer organizations, contacts, addresses, balances
- `/shipments` — booking, status, history (POD required before `DELIVERED` except `viaPod`)
- `/vehicles`, `/drivers`, `/fleet` — fleet and documents
- `/routes`, `/dispatch` — planning and dispatch
- `/tracking` — live board, history, location submit, tracking tokens
- `/invoices`, `/payments`, `/billing` — finance
- `/notifications` — in-app center, preferences, deliveries (no client-chosen recipients)
- `/dashboards/*`, `/search`, `/profile`, `/organizations/:id/settings` — portals
- `/driver/trips`, `/pod` — driver workflow and proof of delivery
- `/admin/users`, `/audit` — administration
- `/identity` — countries/currencies reference data

Organization isolation is applied in services: operator users see their operator tenant; customer users see their customer tenant; platform admins see across tenants according to role.

## Payments

Invoice totals are calculated server-side from line items. Clients cannot mark a payment successful. `MANUAL` payments stay pending until a user with payment confirm permission confirms them. Card/mobile-money providers return “not configured” until gateway credentials exist.

**Payment provider integration remains required before accepting real customer payments.**

## Tracking

Location submit validates coordinates and timestamps. Freshness buckets (live / recent / stale / offline) come from environment seconds. Public pages never receive other organizations’ shipments. Tokens are hashed at rest.

## Notifications

Recipients are resolved from memberships and roles. Preferences only toggle channels/categories for the signed-in user. Live email/SMS/push stay off until `NOTIFICATION_*_ENABLED` and provider credentials are set.
