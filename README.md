# MizigoX

Freight and logistics management platform, designed first for Rwanda and built to expand across East Africa.

This repository is being rebuilt as a production system (React, Vite, TypeScript, Tailwind CSS, Node.js, Express, PostgreSQL, JWT). The current Vite + React UI is a prototype only.

## Architecture

The system design, data model, API shape, RBAC, and phased plan are in:

**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**

Phase 1 (foundation: monorepo, identity, auth, RBAC, country configuration) starts only after that document is approved.

## Current prototype

The checked-in app is a frontend-only Vite starter with a local-state Shipments page. It will be replaced when Phase 1 lands.

```bash
npm install
npm run dev
```
