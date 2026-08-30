# Operations

## Logging

The API logs JSON lines (`level`, `time`, `service`, `message`). `LOG_LEVEL` is `debug | info | warn | error`.

Logged on purpose:

- Process start/stop
- Authentication failures (no password, no access token)
- Unhandled API errors (message hidden in production)
- Notification emit failures
- Password reset email skip/failure (no token)

Redacted: keys whose names look like password/token/secret/authorization, and `postgres://user:pass@` URIs.

Do not log refresh cookies, payment webhook secrets, or full card/mobile-money credentials. Invitation emails may include a one-time invite URL when a live email provider is enabled — treat email as a sensitive channel.

## Monitoring

`SENTRY_DSN` is reserved. No error SDK is initialized until you add one and set the DSN. **Monitoring is not active** in a default deploy.

Until then, ship stdout logs to your host’s log drain (CloudWatch, GCP Logging, Papertrail, etc.).

## Health

| Endpoint                   | Meaning                       |
| -------------------------- | ----------------------------- |
| `GET /api/v1/health`       | Process is up                 |
| `GET /api/v1/health/ready` | PostgreSQL accepts `SELECT 1` |

Public responses do not include credentials or SQL errors. Use `/ready` as the load-balancer health check after migrations.

## Rate limits

In-memory, per Node process: login 20/15min, register 20/15min, forgot-password 5/15min, refresh 60/15min, tracking ingest (env), webhooks, public track. Multi-instance production should put a shared limiter (Redis or API gateway) in front; the in-process limiter still provides a baseline.

`Retry-After` is set when a bucket is exhausted.

## Notification and payment workers

A notification worker runs in-process with the API. It retries deliveries up to `NOTIFICATION_MAX_ATTEMPTS`. Failed provider calls are logged without secrets.

Payment success is never inferred from the browser.
