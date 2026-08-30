# Database backups

Backups are **not** configured by this repository. Do not treat local Docker volumes as a disaster-recovery plan.

## What to configure (managed PostgreSQL)

Pick one provider (examples: Amazon RDS, Google Cloud SQL, Azure Database, Neon, Supabase, Crunchy Bridge, a VPS with PostgreSQL). Then enable **that provider’s** backup product.

Recommended starting policy for MizigoX production:

| Item         | Suggested starting point                                        | Status in this repo                                    |
| ------------ | --------------------------------------------------------------- | ------------------------------------------------------ |
| Frequency    | Continuous WAL / PITR plus a daily full snapshot                | Not configured                                         |
| Retention    | At least 7 daily + 4 weekly                                     | Not configured                                         |
| Location     | Provider region + optional cross-region copy                    | Not configured                                         |
| Encryption   | Provider default at rest + TLS in transit (`DATABASE_SSL=true`) | App supports TLS; backup encryption is on the provider |
| Restore test | Restore to a scratch instance quarterly                         | Not configured                                         |

## Restore process (generic)

1. Create a new instance from the snapshot / PITR timestamp.
2. Point a staging API at the restored `DATABASE_URL` (never overwrite production until verified).
3. Run `GET /api/v1/health/ready`.
4. Sign in, open one shipment, one invoice, one route.
5. If good, fail over DNS or swap the production connection string during a maintenance window.

## Disaster recovery

RPO/RTO are determined by the provider you choose, not by MizigoX code. Document them in your runbook after backups are enabled.

Application object storage (`var/storage` locally) is **not** in the database dump. If you store POD files locally, back up that directory separately. When you connect S3-compatible storage, enable bucket versioning and a lifecycle policy on the provider.

## Local development only

`infra/docker-compose.yml` Postgres is disposable. Example logical dump (development):

```bash
docker exec -t mizigox-postgres pg_dump -U mizigox mizigox > mizigox-dev.dump.sql
```

Do not use that command as proof that production backups work.
