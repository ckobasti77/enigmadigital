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

## Design system (UI Boost — ui-boost-plan.md §3–§5)

- Dark slate stays the only page theme (`bg-background` = `#070d19`). Surfaces step up: `bg-card` → `bg-surface-raised`.
- **Color is information, with exactly four roles:** (1) PLACE — every module has its own color (`--mod-*`, activated by `data-module` on the route; sidebar icons always in their module color); (2) STATE — success / warning / danger / info + lead temperature; (3) CATEGORY — chart series, signal chips, niche monograms, only from the validated `--chart-1..6` palette via `lib/signal-colors.ts`; (4) PROGRESS & REWARD — XP gold, streak orange, level tiers, achievement rarity. A color without one of these roles is not added. Gold is reserved for rewards.
- Components read `var(--mod)`, `--mod-strong`, `--mod-soft`, `--mod-line`, `--mod-glow` — never a module's raw value, never hex, never the raw Tailwind palette (`slate-*`, `cyan-*`, …).
- **One focus and one `primary` button per view** (solid module color, dark text, `data-variant="primary"`). Everything else: `secondary` (module tint), `outline`, `ghost`. Row actions in tables are `ghost` icons revealed on row hover/focus.
- Gradients and glow ONLY for: progress (rings, bars, meters), the screen's focus card, rewards (XP, level, achievement, celebration), and the top-of-page aurora (≤ 10 % module color). Never on text, table rows, or arbitrary cards.
- Aeonik everywhere; scale 12 / 13 / 15 / 20 / 28 plus `text-hero` (40) for the single focus number of a screen. `font-mono` + `tabular-nums` for metric numerals. Page subtitles are one line (≤ 90 chars).
- Motion: GSAP `useGSAP` inside `gsap.matchMedia()` with a reduced-motion branch. Personality: "Corporate" for UI (150–200 ms, `--ease-ui`), "Playful" only for rewards (up to 600 ms; level-up up to 1.2 s; `--duration-reward`, `--ease-reward` — overshoot ONLY for rewards). At most 1–2 animated elements per view; work screens never animate their sections on load. Animate only `transform`/`opacity`. Accuracy beats motion: a number on screen never differs from the data; a hidden tab gets no animation.
- Cards only where elevation carries hierarchy (focus, mission, company, post); secondary groups use dividers and spacing. Shadows are tinted and quiet, never a neon halo. Icons: lucide only, one stroke width (1.75), no emoji. Touch targets ≥ 44 px on mobile.
- Design skills for UI work live in `.claude/skills/`: `impeccable` first, plus `ui-ux-pro-max`, `design-dna` (`nocni-run/ux/dna-boost.json`), `design-taste-frontend` (DESIGN_VARIANCE 4, MOTION_INTENSITY 4, VISUAL_DENSITY 6; GSAP instead of Framer, lucide instead of Phosphor), `motion-design`, `gsap-*`. When a skill conflicts with this file, this file wins.
- Gamification ("Napredak") is derived from real Convex events only — no XP without an event, no invented numbers. It can be switched off per user.
- Reference viewports: 1536×695 (the owner's real screen), 1440×900, 390×844. A screen's focus and its primary button must fit above the fold at 1536×695.
- No internal plan references (`§…`, phase IDs) in user-visible text.

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

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
