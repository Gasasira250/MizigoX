# MizigoX

Freight and logistics platform for Rwanda first, designed to expand across East Africa.

Phase 1 establishes the production foundation: a TypeScript monorepo, Express API, PostgreSQL identity model, JWT authentication, RBAC, and a React admin shell. Business modules such as shipments start in Phase 2.

Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Workspace

```text
apps/api          Express + TypeScript REST API
apps/web          React + Vite + TypeScript + Tailwind
packages/shared   Shared enums, permissions, contracts
infra             PostgreSQL via Docker Compose
```

## Prerequisites

- Node.js 20+
- PostgreSQL 16 (Docker Compose or a local instance)

## Setup

```bash
cp .env.example .env
# Replace JWT_ACCESS_SECRET and SEED_ADMIN_PASSWORD
docker compose -f infra/docker-compose.yml up -d
npm install
npm run build
npm run db:migrate
npm run db:seed
```

The API also migrates and seeds on boot when `SEED_ON_BOOT=true`.

## Develop

```bash
npm run dev
```

- Web: http://localhost:5173
- API health: http://localhost:3001/api/v1/health
- API readiness: http://localhost:3001/api/v1/health/ready

Sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from your local `.env`.

## Checks

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```
