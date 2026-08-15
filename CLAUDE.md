# Enigma Command Center

Internal marketing analytics dashboard for Enigma IT (later client-facing): GA4 + Instagram insights + OpenReply + Meta/Google Ads aggregated into one real-time dashboard, with Convex as the system of record.

**Read the PLAN.md section referenced in the task before coding.** PLAN.md is the source of truth for architecture, data model, sync strategy and milestone order.

## Stack

- **Next.js 16** (App Router, TypeScript, React 19) — this is NOT the Next.js you know: APIs and conventions may differ from training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next code. Heed deprecation notices.
- **Convex 1.44** — database, cron, real-time, auth. `convex/` folder, `ConvexClientProvider` in `components/providers`.
- **Tailwind CSS 4** — mandatory for all styling. Tokens live in `app/globals.css` (`@theme inline`); there is no `tailwind.config`.
- **shadcn/ui** (`base-nova` style, `@base-ui/react`) — base for every UI component.
- **GSAP** (`gsap` + `@gsap/react`) — all motion.
- **Recharts** — charts (use `chart-1..6` tokens).
- Not yet added (planned per PLAN.md §1): Convex Auth (M1 second half).

## Folder conventions

- `app/` — routes and layouts only. No business logic.
- `components/ui/` — shadcn primitives (`npx shadcn@latest add <name>`). Restyle only via tokens in `globals.css`; never edit variants to hardcoded colors.
- `components/providers/` — client providers (Convex).
- `components/motion/` — GSAP wrappers (`Reveal`, …).
- `convex/` — schema, queries/mutations/actions, crons. `convex/_generated/` is generated; never edit.
- `lib/` — pure helpers (`lib/utils.ts` exports `cn`).
- `public/assets/fonts/aeonik/` — Aeonik `.otf` files (loaded via `next/font/local` in `app/layout.tsx`).

## Design system

- Dark slate is the only page theme (`bg-background` = `#070d19`). Surfaces step up: `bg-card` → `bg-surface-raised`. White (`surface-light`) is a surface for light contexts, never a page theme.
- **Cyan (`accent-400` / `primary`) is strategic: interactive elements and key metrics only. Never decorative**, never as hover tint (`--accent` in shadcn is a slate step on purpose).
- Aeonik everywhere (`font-sans` = `var(--font-aeonik)`); optional uppercase tracking via `.heading-caps`. `font-mono` + `tabular-nums` for metric numerals.
- Borders: `border` (default = `--line`), `border-line-soft`, `border-line-strong`. Text: `text-foreground`, `text-muted-foreground`, `text-text-muted`.
- Charts: `chart-1..6` + `chart-grid`. Status: `success` / `warning` / `danger`.
- Motion is purposeful only: `.hover-lift`, subtle reveals, number transitions. Always respect `prefers-reduced-motion`.
- Tone: engineered, confident, no agency-style ornament. No gradients-for-decoration, no glow-for-glow.
- Use tokens, never raw Tailwind palette colors (`slate-*`, `cyan-*`) and never default shadcn grey.

## UI stack rules

1. **shadcn/ui is the base** for every component (Button, Dialog, Table, Tabs, Skeleton, …) — added via CLI, restyled through the semantic tokens in `globals.css`. No inline colors, no shadcn defaults.
2. **All motion via GSAP `useGSAP`** from `@gsap/react` — inside `gsap.matchMedia()` with a reduced-motion branch. No CSS keyframe libraries for motion, no framer-motion.
3. **Before every UI task, invoke the `impeccable` design skill** first, then code. If it is not available in the session, say so and use `frontend-design` instead.

## Coding rules

- Minimal, surgical changes. No speculative abstractions. Every change traceable to the task.
- Read the PLAN.md section referenced in the task before coding.
- `../enigmait` is the read-only design reference — never modify it.
- Do not commit unless asked.

## Commands

```bash
npm run dev          # Next.js dev server
npm run convex:dev   # or: npx convex dev
npm run lint
npm run typecheck
npm run build
npx shadcn@latest add <component>
```
