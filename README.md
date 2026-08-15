# Enigma Command Center

Internal marketing analytics dashboard for Enigma IT — GA4, Instagram insights, OpenReply and (later) Meta/Google Ads in one place. Convex is the system of record; the dashboard reads only from Convex.

- Architecture and build order: [PLAN.md](./PLAN.md)
- Conventions for coding sessions: [CLAUDE.md](./CLAUDE.md)

## Commands

```bash
npm run dev          # Next.js on http://localhost:3000
npm run convex:dev   # Convex dev deployment (writes .env.local on first run)
npm run lint
npm run typecheck
npm run build
```
