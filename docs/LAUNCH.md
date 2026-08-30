# Launch

Phase 12 is the last major development phase. Do not start another product phase automatically.

## Environment checklist

Mark complete only when actually configured.

Database

- [ ] Production PostgreSQL
- [ ] `DATABASE_SSL` set as required by the provider
- [ ] Database backups configured
- [ ] Restore tested at least once

Hosting

- [ ] Frontend hosting / CDN configured
- [ ] Backend hosting configured (`node dist/server.js`)
- [ ] Domain configured (`app.mizigox.com` / `api.mizigox.com` or your names)
- [ ] HTTPS active
- [ ] CORS origins set to those HTTPS URLs

Secrets and app config

- [ ] Environment variables configured (not copied from local `.env`)
- [ ] Secrets stored in a secret manager
- [ ] `SEED_ON_BOOT=false`
- [ ] `COOKIE_SECURE=true`
- [ ] JWT secret rotated from any laptop copy

Providers (enable only what you will operate)

- [ ] Email provider configured (required for password-reset and invite email in production)
- [ ] SMS provider configured
- [ ] Payment provider configured — **Payment provider integration remains required before accepting real customer payments.**
- [ ] Object/file storage configured (S3 adapter still needs a connected client)
- [ ] Maps provider configured if you are not using OSM
- [ ] Error monitoring configured
- [ ] Backups configured (duplicate of database backups above)

## Launch checklist

Before launch:

- [ ] Production database created
- [ ] Database backups configured
- [ ] Environment variables configured
- [ ] Secrets secured
- [ ] Frontend deployed
- [ ] Backend deployed
- [ ] HTTPS active
- [ ] Domain configured
- [ ] Database migrations applied
- [ ] Authentication tested
- [ ] RBAC tested
- [ ] Organization isolation tested
- [ ] Customer workflow tested
- [ ] Shipment workflow tested
- [ ] Dispatch tested
- [ ] Tracking tested
- [ ] Invoice workflow tested
- [ ] Payment integration verified
- [ ] Notifications verified
- [ ] Driver workflow tested
- [ ] Customer portal tested
- [ ] POD tested
- [ ] Monitoring configured
- [ ] Error logging verified
- [ ] Production smoke tests passed

Do not check production smoke tests unless they were executed against the production (or a production-identical) environment.

## Smoke test procedure

Run after production configuration is available. Do **not** claim these passed unless they were actually executed.

1. Register via invite / login.
2. Create organization (platform admin) or confirm operator org.
3. Create customer.
4. Create shipment.
5. Create vehicle.
6. Create driver.
7. Create route.
8. Assign vehicle.
9. Assign driver.
10. Dispatch route.
11. Submit a real device location (driver portal). Confirm stale labeling after the live window.
12. Update shipment status through the legal transitions.
13. Complete delivery with POD (signature/evidence if used).
14. Confirm POD stored and shipment `DELIVERED`.
15. Create invoice (totals from line items).
16. Record a MANUAL payment and confirm it as finance (or verify a signed webhook if a provider is live).
17. Verify an in-app notification; email/SMS only if a provider is enabled.
18. Verify an audit log row for the payment or dispatch.
19. Sign in as customer staff and open only that customer’s shipment/invoice.
20. Sign in as driver and open only assigned trips.

## Manual next steps to launch

1. Provision managed Postgres and enable backups.
2. Generate production secrets; store them outside git.
3. Deploy API and web with HTTPS and the placeholder domains (or your chosen names).
4. Run migrations, health checks, then the smoke list above.
5. Connect email before relying on password reset in production.
6. Connect a payment provider before taking live customer payments.
7. Add log drain / Sentry when you have an account.
8. Keep production deploys behind human approval (CI does not deploy).
