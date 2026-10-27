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

## Design system (ULTRA — docs/ULTRA-PLAN.md §1 and §3; DESIGN.md has the detail)

- The target is a calm **work desk, not a report**: only what needs the owner lights up. The screen's focus is work (next company, first inquiry, the queue that waits), never a reward. Dark slate stays the only page theme (`bg-background` = `#070d19`). Surfaces step up: `bg-card` → `bg-surface-raised`.
- **Color is information, with these roles:** (1) PLACE — every module has its own color (`--mod-*`, activated by `data-module` on the route). It appears ONLY on the active sidebar item, the page-header icon and the top-of-page aurora (≤ 10 %) — never on titles, numbers (FocusCard, KpiTile), tile labels, charts, buttons, switches or glow. Module color says "where you are", not "what to click". (2) ACTION — **one primary-action color in the whole app** (brand cyan `--accent-400` `#58c4ff`, dark text), the same on every screen; `primary` no longer reads `--mod-strong`. `primary` and `link` buttons and switches in the "on" state use it. (3) STATE — success / warning / danger / info: red only for errors and lateness, yellow for warnings; lead interest is not an edge color. (4) CATEGORY — chart series, signal chips, niche monograms, only from the validated `--chart-1..6` palette via `lib/signal-colors.ts`. (5) PROGRESS & REWARD — XP gold, streak orange, level tiers, achievement rarity; gold only at the moment of reward on work screens (and for XP, level and achievements on the Napredak page). A color without one of these roles is not added.
- **Sixth role — (6) IDENTITY (project color, multi-project):** says *whose* screen this is, never where you are in it (that stays the module color). It comes from data (`workspaces.brend.boja`) through `lib/boja-projekta.ts`, which picks the text color (≥ 4.5:1) and keeps the color ≥ 3:1 against the page; the element that sets it carries `data-projekat` and reads `--projekat`, `--projekat-tekst`, `--projekat-soft` (default = Kontrolna tabla cyan). It appears ONLY on the project picker, the project mark (`ProjekatZnak`: logo or initials — picker, panel logo, ⌘K, „Objavljuješ kao …“ rows), the 2 px bar at the top of the shell and the login screen. Modules keep their own colors; no other component may use the project color.
- Components read tokens — `var(--mod)`, `--mod-strong`, `--mod-soft`, `--mod-line`, `--mod-glow` for place (only where place is allowed), the action token for actions — never a module's raw value, never hex, never the raw Tailwind palette (`slate-*`, `cyan-*`, …).
- **One focus and one `primary` button per view** (solid action color, dark text, `data-variant="primary"`). Button roles: `primary`, `secondary` (neutral surface, no module color), `outline`, `ghost`, `destructive` (always with confirmation), `link` (action color). There is no `default`: every Button declares its role. Row actions in tables are `ghost` icons revealed on row hover/focus.
- Gradients and glow ONLY for: progress (rings, bars, meters), the screen's focus card, rewards (XP, level, achievement, celebration), and the top-of-page aurora (≤ 10 % module color). Never on text, table rows, or arbitrary cards; glow is never in the module color.
- Aeonik everywhere; scale 12 / 13 / 15 / 20 / 28 plus `text-hero` (40) for the single focus number of a screen. Nothing below 12 px (chart axes and SVG text included). Uppercase only for group labels. Page subtitles are one line (≤ 90 chars).
- **Numbers:** Aeonik with `tabular-nums` — focus numbers, tiles and numbers in text. `font-mono` ONLY for IDs, code and numeric table columns. Words, dates in a sentence and labels are never mono.
- **Connection status:** exactly one status per connection, from one derived function: **Radi** (connected, last sync succeeded, token not expiring within 7 days, data younger than 24 h), **Traži pažnju** (token expired or expiring soon, last sync failed, data older than 24 h, or server not configured — always with a reason and one action), **Nije povezano**. The top-bar dot is green only when every connected connection works, otherwise yellow with a count („1 veza traži pažnju“); an unconnected channel is not a fault and does not color the dot. A warning strip sits at the top of the affected screen, with one action. Messages are human; technical codes only in Settings details.
- **Honest numbers:** zero only when zero was measured; otherwise „—“ with the reason. **Currency:** everything is in euros, no conversion; the app writes the currency the source reports. If a source ever reports another currency, the amount stays in that currency with a warning and never gets the € sign. Never hard-code „€“.
- **Gamification is "Tiha" (quiet):** work screens keep only weekly goals and the streak. XP, level and achievements live on the Napredak page — no XP chips on work cards, no XP toast after every action. Napredak never carries the primary button. Gamification is derived from real Convex events only — no XP without an event, no invented numbers. It can be switched off per user.
- **Language:** Serbian everywhere, Latin script, sentence case. Metrics have a Serbian name with the acronym in a tooltip that also works on tap („Cena po rezultatu“, tooltip „CPA“). No raw API values, env-variable names or internal plan references (`§…`, phase IDs, step IDs) in user-visible text.
- Motion: GSAP `useGSAP` inside `gsap.matchMedia()` with a reduced-motion branch. Personality: "Corporate" for UI (150–200 ms, `--ease-ui`), "Playful" only for rewards (up to 600 ms; level-up up to 1.2 s; `--duration-reward`, `--ease-reward` — overshoot ONLY for rewards). Celebration only for a new level and an achievement. At most 1–2 animated elements per view; work screens never animate their sections on load and never reveal on scroll. Animate only `transform`/`opacity`. Accuracy beats motion: a number on screen never differs from the data; a hidden tab gets no animation.
- Density: lists and tables with 36–40 px rows. Cards only where elevation carries hierarchy (the focus and things that move — company, post); secondary groups use dividers and spacing. No box in a box, no thick left edge (edges are 1 px). Shadows are tinted and quiet, never a neon halo. Icons: lucide only, one stroke width (1.75), no emoji.
- **Touch:** ≥ 44 px targets under `pointer: coarse` are a property of the primitives (Button in every size, Tabs/ToggleGroup, select trigger, Switch/Checkbox hit area, clickable Chip, `WorkCard` title link) — not something added by hand. Desktop sizes do not change.
- Design skills for UI work live in `.claude/skills/`: `impeccable` first, plus `ui-ux-pro-max`, `design-dna` (target profile `docs/ultra/dna-cilj.json`), `design-taste-frontend` (DESIGN_VARIANCE 4, MOTION_INTENSITY 3, VISUAL_DENSITY 7; GSAP instead of Framer, lucide instead of Phosphor), `motion-design`, `gsap-*`. When a skill conflicts with this file, this file wins.
- Reference viewports: 1536×695 (the owner's real screen), 1440×900, 390×844. A screen's focus and its primary button must fit above the fold at 1536×695.

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
