# Design DNA — popis zatečenog (grep, ne procena)

Izmereno skriptom `scripts/dna-inventory.mjs` nad `app/**` i `components/**` (296 fajlova). Datum: 2026-09-09.

## 1. Boje — tokeni koji se STVARNO koriste

Deklarisano u `@theme inline`: 65 tokena boja. Korišćeno: 46.

| token | upotreba |
|---|---|
| `text-muted` | 1766 · alfa koraci: 20, 40, 45, 50, 60, 70, 80 |
| `foreground` | 1100 · alfa koraci: 10, 45, 50, 60, 80, 90 |
| `accent-400` | 793 · alfa koraci: 5, 10, 15, 20, 25, 30, 40, 50, 80, [0.06], [0.03], 60, 70, [0.04], 90 |
| `line` | 733 · alfa koraci: 40, 50, 60, 70 |
| `surface-raised` | 486 · alfa koraci: 10, 20, 30, 40, 50, 60, 70, 80, 95 |
| `line-soft` | 463 · alfa koraci: 50, 60 |
| `danger` | 382 · alfa koraci: 5, 10, 15, 20, 25, 30, 40, 60, 70, 80, 90 |
| `warning` | 344 · alfa koraci: 5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 90 |
| `surface` | 330 · alfa koraci: 20, 30, 40, 50, 60, 70, 80, 85, 90, 95 |
| `success` | 260 · alfa koraci: 5, 10, 15, 20, 30, 40, 80, 90 |
| `muted-foreground` | 161 · alfa koraci: 30, 50, 70 |
| `text-secondary` | 117 |
| `line-strong` | 56 |
| `destructive` | 48 · alfa koraci: 5, 10, 20, 30, 40, 50, 80 |
| `ring` | 41 · alfa koraci: 50 |
| `bg-950` | 38 · alfa koraci: 70, 75, 80, 85, 90 |
| `accent` | 38 · alfa koraci: 10, 15, 20, 30, 40 |
| `muted` | 28 · alfa koraci: 20, 40, 50, 60 |
| `accent-300` | 25 |
| `text-primary` | 25 |
| `text-inverse` | 22 |
| `primary` | 21 · alfa koraci: 70, 80 |
| `input` | 20 · alfa koraci: 30, 50, 80 |
| `bg-900` | 14 |
| `accent-foreground` | 14 |
| `chart-1` | 13 · alfa koraci: 10, 20, 40, 60, 80 |
| `temp-hot` | 13 · alfa koraci: 40, 50 |
| `temp-warm` | 11 · alfa koraci: 40, 50 |
| `primary-foreground` | 10 |
| `popover` | 10 |
| `chart-2` | 9 · alfa koraci: 10, 40 |
| `temp-hot-bg` | 7 |
| `border` | 7 · alfa koraci: 50 |
| `background` | 6 |
| `accent-500` | 5 |
| `accent-600` | 5 |
| `temp-warm-bg` | 5 |
| `popover-foreground` | 4 |
| `sidebar-accent` | 4 · alfa koraci: 50 |
| `surface-overlay` | 4 · alfa koraci: 80 |
| `material-edge` | 3 |
| `temp-cold` | 3 · alfa koraci: 50 |
| `temp-cold-bg` | 2 |
| `secondary` | 2 |
| `secondary-foreground` | 2 |
| `card-foreground` | 1 |

Deklarisani, a nekorišćeni: `bg-800`, `surface-light`, `surface-light-muted`, `text-on-light`, `accent-700`, `accent-glow`, `chart-3`, `chart-4`, `chart-5`, `chart-6`, `chart-grid`, `card`, `sidebar`, `sidebar-foreground`, `sidebar-primary`, `sidebar-primary-foreground`, `sidebar-accent-foreground`, `sidebar-border`, `sidebar-ring`.

### 1a. Klase boja bez tokena (tiho se NE generišu — element ostaje bez boje)

| klasa | upotreba | fajlovi |
|---|---|---|
| `bg-surface-sunken` | 15 | components/app/ads/audiences-table.tsx, components/app/ads/create-lookalike-audience-dialog.tsx, components/app/instagram/inbox/chat-view.tsx, components/app/instagram/inbox/conversation-list.tsx, components/app/instagram/inbox/inbox-settings-drawer.tsx, components/app/instagram/inbox/inbox-view.tsx |
| `text-text-soft` | 11 | components/app/leadovi/gaps-panel.tsx, components/app/leadovi/lead-identities-panel.tsx, components/app/leadovi/lead-score-cell.tsx, components/app/leadovi/meetings-panel.tsx, components/app/leadovi/overdue-panel.tsx, components/app/leadovi/provenance-badge.tsx |
| `bg-surface-subtle` | 8 | components/app/ads/ad-preview-dialog.tsx, components/app/ads/capi-section.tsx, components/app/ads/new-campaign-wizard.tsx, components/app/ads/targeting-search-dialog.tsx |
| `border-line-muted` | 4 | app/login/page.tsx, app/pozivnica/[token]/pozivnica-client.tsx |
| `text-info` | 4 | components/app/leadovi/lead-identities-panel.tsx, components/app/leadovi/lead-score-cell.tsx, components/app/leadovi/lead-timeline.tsx |
| `bg-info` | 3 | components/app/leadovi/lead-score-cell.tsx, components/app/leadovi/lead-timeline.tsx |
| `text-warning-400` | 2 | components/app/instagram/instagram-stories.tsx |
| `border-info` | 2 | components/app/leadovi/lead-score-cell.tsx, components/app/leadovi/lead-timeline.tsx |
| `text-surface-canvas` | 2 | components/app/novosti/novosti-editor.tsx, components/app/novosti/publish-readiness-panel.tsx |
| `text-text-subtle` | 2 | components/app/settings/connections-settings.tsx |
| `shadow-inner` | 1 | components/app/ads/ad-preview-dialog.tsx |
| `bg-surface-elevated` | 1 | components/app/analytics/segmented-toggle.tsx |
| `fill-color` | 1 | components/app/leadovi/leads-map-canvas.tsx |
| `fill-outline-color` | 1 | components/app/leadovi/leads-map-canvas.tsx |
| `fill-extrusion` | 1 | components/app/leadovi/leads-map-canvas.tsx |
| `fill-extrusion-color` | 1 | components/app/leadovi/leads-map-canvas.tsx |

### 1b. Sirova Tailwind paleta (zabranjeno pravilom projekta)

| klasa | upotreba | fajlovi |
|---|---|---|
| `bg-amber-500` | 9 | app/deletion-status/page.tsx, components/app/instagram/inbox/chat-view.tsx, components/app/instagram/inbox/conversation-list.tsx, components/app/instagram/inbox/inbox-settings-drawer.tsx, components/app/threads/threads-automations.tsx, components/app/threads/threads-search.tsx |
| `bg-white` | 9 | components/app/ads/ad-preview-dialog.tsx, components/app/threads/threads-search.tsx |
| `border-amber-500` | 8 | app/deletion-status/page.tsx, components/app/instagram/inbox/chat-view.tsx, components/app/instagram/inbox/conversation-list.tsx, components/app/instagram/inbox/inbox-settings-drawer.tsx, components/app/threads/threads-automations.tsx, components/app/threads/threads-search.tsx |
| `text-amber-400` | 7 | app/deletion-status/page.tsx, components/app/instagram/inbox/chat-view.tsx, components/app/instagram/inbox/conversation-list.tsx, components/app/leadovi/lead-timeline.tsx, components/app/threads/threads-search.tsx |
| `text-white` | 7 | app/deletion-status/page.tsx, components/app/instagram/instagram-stories.tsx, components/app/instagram/publish-preview.tsx, components/app/leadovi/leads-dashboard.tsx |
| `text-amber-300` | 4 | components/app/instagram/inbox/chat-view.tsx, components/app/threads/threads-automations.tsx, components/app/threads/threads-search.tsx |
| `bg-black` | 4 | components/app/instagram/instagram-stories.tsx |
| `text-red-500` | 3 | components/app/instagram/inbox/chat-view.tsx |
| `text-amber-200` | 3 | components/app/instagram/inbox/inbox-settings-drawer.tsx, components/app/threads/threads-search.tsx |
| `text-blue-400` | 3 | components/app/leadovi/lead-identities-panel.tsx, components/app/threads/threads-search.tsx |
| `bg-emerald-500` | 2 | app/deletion-status/page.tsx |
| `text-emerald-400` | 2 | app/deletion-status/page.tsx |
| `border-emerald-500` | 2 | app/deletion-status/page.tsx |
| `text-emerald-500` | 2 | components/app/ads/capi-section.tsx |
| `text-amber-600` | 2 | components/app/instagram/inbox/chat-view.tsx, components/app/instagram/inbox/conversation-list.tsx |
| `from-black` | 2 | components/app/instagram/instagram-stories.tsx |
| `via-black` | 2 | components/app/instagram/instagram-stories.tsx |
| `text-purple-400` | 2 | components/app/instagram/mention-card.tsx, components/app/leadovi/lead-timeline.tsx |
| `ring-white` | 2 | components/app/instagram/post-detail/post-profile-actions.tsx, components/app/instagram/post-detail/post-story-funnel.tsx |
| `bg-blue-500` | 2 | components/app/threads/threads-search.tsx |
| `bg-rose-500` | 1 | app/deletion-status/page.tsx |
| `text-rose-400` | 1 | app/deletion-status/page.tsx |
| `border-rose-500` | 1 | app/deletion-status/page.tsx |
| `text-amber-700` | 1 | components/app/instagram/inbox/chat-view.tsx |
| `fill-red-500` | 1 | components/app/instagram/inbox/chat-view.tsx |
| `text-sky-300` | 1 | components/app/instagram/inbox/chat-view.tsx |
| `text-amber-500` | 1 | components/app/instagram/inbox/chat-view.tsx |
| `text-amber-900` | 1 | components/app/instagram/inbox/inbox-settings-drawer.tsx |
| `bg-purple-500` | 1 | components/app/instagram/mention-card.tsx |
| `border-red-500` | 1 | components/app/instagram/post-detail/post-detail-header.tsx |
| `bg-red-500` | 1 | components/app/instagram/post-detail/post-detail-header.tsx |
| `text-red-400` | 1 | components/app/instagram/post-detail/post-detail-header.tsx |
| `border-white` | 1 | components/app/instagram/publish-preview.tsx |
| `text-pink-400` | 1 | components/app/leadovi/lead-identities-panel.tsx |
| `border-blue-500` | 1 | components/app/threads/threads-search.tsx |
| `text-blue-300` | 1 | components/app/threads/threads-search.tsx |
| `text-blue-200` | 1 | components/app/threads/threads-search.tsx |

### 1c. Proizvoljne vrednosti boja (`[...]` / `(--...)`)

| klasa | upotreba | fajlovi |
|---|---|---|
| `border-l-[3px]` | 6 | components/app/leadovi/import-row-dialog.tsx, components/app/leadovi/leads-table.tsx |
| `bg-[var(--row-bg)]` | 5 | components/app/leadovi/import-review-table.tsx |
| `bg-[var(--row-hover-bg)]` | 5 | components/app/leadovi/import-review-table.tsx |
| `border-[var(--temp-cold)]` | 4 | components/app/leadovi/import-review-table.tsx, components/app/leadovi/import-row-dialog.tsx |
| `text-[var(--temp-cold)]` | 4 | components/app/leadovi/import-review-table.tsx, components/app/leadovi/import-row-dialog.tsx |
| `bg-[var(--temp-cold-bg)]` | 4 | components/app/leadovi/import-review-table.tsx, components/app/leadovi/import-row-dialog.tsx |
| `border-[var(--temp-warm)]` | 4 | components/app/leadovi/import-review-table.tsx, components/app/leadovi/import-row-dialog.tsx |
| `text-[var(--temp-warm)]` | 4 | components/app/leadovi/import-review-table.tsx, components/app/leadovi/import-row-dialog.tsx |
| `bg-[var(--temp-warm-bg)]` | 4 | components/app/leadovi/import-review-table.tsx, components/app/leadovi/import-row-dialog.tsx |
| `border-[var(--temp-hot)]` | 4 | components/app/leadovi/import-review-table.tsx, components/app/leadovi/import-row-dialog.tsx |
| `text-[var(--temp-hot)]` | 4 | components/app/leadovi/import-review-table.tsx, components/app/leadovi/import-row-dialog.tsx |
| `bg-[var(--temp-hot-bg)]` | 4 | components/app/leadovi/import-review-table.tsx, components/app/leadovi/import-row-dialog.tsx |
| `shadow-[inset_0_1px_0_0_var(--row-ring),inset_0_-1px_0_0_var(--row-ring)]` | 3 | components/app/leadovi/import-review-table.tsx |
| `bg-[var(--chart-1)]` | 2 | components/app/analytics/ads-timeseries-chart.tsx |
| `bg-[var(--chart-2)]` | 2 | components/app/analytics/ads-timeseries-chart.tsx |
| `bg-[var(--temp-cold)]` | 2 | components/app/leadovi/import-row-dialog.tsx |
| `bg-[var(--temp-warm)]` | 2 | components/app/leadovi/import-row-dialog.tsx |
| `bg-[var(--temp-hot)]` | 2 | components/app/leadovi/import-row-dialog.tsx |
| `stroke-[3.5]` | 1 | components/app/analytics/retention-dashboard.tsx |
| `border-l-[var(--temp-cold)]` | 1 | components/app/leadovi/import-row-dialog.tsx |
| `border-l-[var(--temp-warm)]` | 1 | components/app/leadovi/import-row-dialog.tsx |
| `border-l-[var(--temp-hot)]` | 1 | components/app/leadovi/import-row-dialog.tsx |
| `shadow-[inset_0_-2px_0_0_var(--color-accent-400)]` | 1 | components/app/section-nav.tsx |
| `shadow-[inset_0_-2px_0_0_var(--color-line-soft)]` | 1 | components/app/section-nav.tsx |
| `border-(--color-border)` | 1 | components/ui/chart.tsx |
| `bg-(--color-bg)` | 1 | components/ui/chart.tsx |
| `border-[1.5px]` | 1 | components/ui/chart.tsx |
| `ring-[3px]` | 1 | components/ui/toggle.tsx |

### 1d. Heks / rgba literali u TSX-u (van globals.css)

| fajl | heks literala |
|---|---|
| `components/ui/chart.tsx` | 5 |
| `components/app/analytics/retention-dashboard.tsx` | 1 |

| fajl | rgba( literala |
|---|---|
| `components/app/leadovi/import-review-table.tsx` | 7 |
| `components/app/leadovi/leads-map-color.ts` | 3 |
| `components/app/ads/retention-strip.tsx` | 2 |
| `components/app/ads/age-gender-heat-table.tsx` | 1 |

| fajl | inline style sa bojom |
|---|---|
| `components/app/analytics/retention-dashboard.tsx` | 3 |
| `components/app/instagram/population-pyramid-chart.tsx` | 3 |
| `components/app/analytics/channel-comparison-chart.tsx` | 2 |
| `components/app/analytics/device-chart.tsx` | 2 |
| `components/app/instagram/breakdown-chart.tsx` | 2 |
| `components/app/instagram/post-detail/post-story-funnel.tsx` | 2 |
| `components/app/timeline-chart.tsx` | 2 |
| `components/app/ads/hourly-chart.tsx` | 1 |
| `components/app/analytics/chart-card.tsx` | 1 |
| `components/app/analytics/time-of-day-heatmap.tsx` | 1 |
| `components/app/instagram/post-detail/post-profile-actions.tsx` | 1 |
| `components/ui/chart.tsx` | 1 |

## 2. Tipografija

Deklarisane veličine u `@theme`: `primary`, `secondary`, `muted`, `inverse`, `on-light`, `secondary-vibrant`, `muted-vibrant`, `display`, `display--line-height`, `display--letter-spacing`, `display--font-weight`, `h1`, `h1--line-height`, `h1--letter-spacing`, `h1--font-weight`, `h2`, `h2--line-height`, `h2--letter-spacing`, `h2--font-weight`, `body`, `body--line-height`, `body--letter-spacing`, `body--font-weight`, `small`, `small--line-height`, `small--letter-spacing`, `small--font-weight`, `micro`, `micro--line-height`, `micro--letter-spacing`, `micro--font-weight`, `xs--line-height`, `xs--letter-spacing`, `sm--line-height`, `sm--letter-spacing`, `base--line-height`, `base--letter-spacing`, `lg--line-height`, `lg--letter-spacing`, `xl--line-height`, `xl--letter-spacing`, `2xl--line-height`, `2xl--letter-spacing`, `3xl--line-height`, `3xl--letter-spacing`, `4xl--line-height`, `4xl--letter-spacing`, `5xl--line-height`, `5xl--letter-spacing`, `6xl--line-height`, `6xl--letter-spacing`.

### 2a. Veličine teksta (klase)

| klasa | upotreba |
|---|---|
| `xs` | 1457 |
| `micro` | 586 |
| `sm` | 251 |
| `base` | 49 |
| `[11px]` | 49 |
| `2xl` | 43 |
| `[10px]` | 30 |
| `lg` | 29 |
| `xl` | 28 |
| `3xl` | 16 |
| `h2` | 9 |
| `[var(--temp-cold)]` | 4 |
| `[var(--temp-warm)]` | 4 |
| `[var(--temp-hot)]` | 4 |
| `h1` | 3 |
| `[0.8rem]` | 3 |
| `[9px]` | 2 |
| `4xl` | 1 |
| `5xl` | 1 |

Ukupno različitih veličina u upotrebi: 19.

### 2b. Težine

| težina | upotreba |
|---|---|
| `medium` | 715 |
| `semibold` | 592 |
| `bold` | 141 |
| `normal` | 19 |

Aeonik nosi 300/400/700 — `medium` i `semibold` se tiho zaokružuju na 400 ili 700.

### 2c. Familije

| familija | upotreba |
|---|---|
| `mono` | 673 |
| `sans` | 20 |
| `heading` | 1 |

`tabular-nums` kao klasa: 320 mesta (brojevi bez nje se ne mogu izbrojati grep-om).

## 3. Razmaci (p/m/gap/space)

| vrednost | upotreba |
|---|---|
| `2 (8px, mreža 8)` | 1119 |
| `3 (12px, mreža 4)` | 908 |
| `1 (4px, mreža 4)` | 792 |
| `1.5 (6px, mreža van)` | 709 |
| `4 (16px, mreža 8)` | 665 |
| `2.5 (10px, mreža van)` | 399 |
| `0.5 (2px, mreža van)` | 386 |
| `5 (20px, mreža 4)` | 291 |
| `6 (24px, mreža 8)` | 211 |
| `0 (0px, mreža 8)` | 185 |
| `8 (32px, mreža 8)` | 129 |
| `3.5 (14px, mreža van)` | 127 |
| `auto (?, mreža ?)` | 55 |
| `px (1px, mreža van)` | 27 |
| `12 (48px, mreža 8)` | 22 |
| `10 (40px, mreža 8)` | 19 |
| `0.2 (0.8px, mreža van)` | 13 |
| `16 (64px, mreža 8)` | 11 |
| `[var(--gutter)] (?, mreža ?)` | 10 |
| `7 (28px, mreža 4)` | 10 |
| `(--card-spacing) (?, mreža ?)` | 6 |
| `11 (44px, mreža 4)` | 4 |
| `24 (96px, mreža 8)` | 4 |
| `[1px] (?, mreža ?)` | 3 |
| `14 (56px, mreža 8)` | 2 |
| `9 (36px, mreža 4)` | 2 |
| `[var(--sidebar-width)] (?, mreža ?)` | 2 |
| `[2px] (?, mreža ?)` | 2 |
| `20 (80px, mreža 8)` | 1 |
| `4.5 (18px, mreža van)` | 1 |

Ukupno 6115 razmaka; 3669 (60 %) NIJE na mreži od 8 px.

### 3a. Visine kontrola (`h-*`)

| h- | upotreba |
|---|---|
| `8` | 88 |
| `9` | 85 |
| `4` | 84 |
| `full` | 56 |
| `6` | 52 |
| `7` | 51 |
| `3` | 40 |
| `3.5` | 39 |
| `10` | 32 |
| `5` | 30 |
| `12` | 27 |
| `1.5` | 25 |
| `28` | 22 |
| `11` | 16 |
| `64` | 15 |
| `16` | 13 |
| `20` | 12 |
| `2.5` | 10 |
| `14` | 10 |
| `32` | 8 |
| `40` | 7 |
| `96` | 6 |
| `48` | 6 |
| `56` | 6 |
| `24` | 5 |

## 4. Radijusi

| klasa | upotreba |
|---|---|
| `rounded-lg` | 419 |
| `rounded-full` | 209 |
| `rounded-xl` | 186 |
| `rounded` | 173 |
| `rounded-md` | 157 |
| `rounded-xs` | 24 |
| `rounded-2xl` | 11 |
| `rounded-[4px]` | 10 |
| `rounded-sm` | 9 |
| `rounded-none` | 4 |
| `rounded-l-[4px]` | 2 |
| `rounded-r-[4px]` | 2 |
| `rounded-[3px]` | 2 |
| `rounded-r-lg` | 2 |
| `rounded-t-xl` | 2 |
| `rounded-b-xl` | 2 |
| `rounded-[2px]` | 2 |
| `rounded-t` | 1 |
| `rounded-br-xs` | 1 |
| `rounded-bl-xs` | 1 |
| `rounded-bl-sm` | 1 |
| `rounded-b-none` | 1 |
| `rounded-b-2xl` | 1 |
| `rounded-l-lg` | 1 |
| `rounded-t-lg` | 1 |
| `rounded-b-lg` | 1 |

Deklarisano: `sm`, `md`, `lg`, `xl`, `2xl`, `3xl`, `4xl`.

## 5. Senke

| klasa | upotreba |
|---|---|
| `card` | 173 |
| `xs` | 24 |
| `sm` | 20 |
| `elev-2` | 10 |
| `md` | 6 |
| `elev-1` | 4 |
| `(--elev-1)` | 4 |
| `elev-3` | 3 |
| `[inset_0_1px_0_0_var(--row-ring),inset_0_-1px_0_0_var(--row-ring)]` | 3 |
| `xl` | 2 |
| `2xs` | 2 |
| `(--elev-3)` | 2 |
| `inner` | 1 |
| `2xl` | 1 |
| `none` | 1 |
| `(--elev-2)` | 1 |
| `[inset_0_-2px_0_0_var(--color-accent-400)]` | 1 |
| `[inset_0_-2px_0_0_var(--color-line-soft)]` | 1 |
| `lg` | 1 |

Deklarisano: `elevated`, `elev-0`, `elev-1`, `elev-2`, `elev-3`, `card`, `2xs`, `xs`, `sm`, `md`, `lg`, `xl`, `2xl`.

## 6. Pokret

| klasa / css | upotreba |
|---|---|
| `transition-colors` | 236 |
| `animate-spin` | 101 |
| `animate-pulse` | 36 |
| `transition-all` | 30 |
| `transition-opacity` | 26 |
| `transition-transform` | 21 |
| `duration-300` | 12 |
| `animate-in` | 10 |
| `duration-(--duration-base)` | 9 |
| `duration-150` | 8 |
| `animate-out` | 8 |
| `transition-[width]` | 6 |
| `duration-200` | 5 |
| `duration-100` | 4 |
| `ease-(--ease-ui)` | 3 |
| `transition` | 2 |
| `css:100ms` | 1 |
| `css:150ms` | 1 |
| `css:240ms` | 1 |
| `css:340ms` | 1 |
| `animate-ping` | 1 |
| `duration-500` | 1 |
| `transition-[translate,background-color]` | 1 |
| `duration-(--duration-fast)` | 1 |

GSAP `duration:` vrednosti u TSX/TS: `DUR_UI` ×9, `DUR_REDUCED` ×4, `LET_TRAJANJE_S` ×1, `1.15` ×1, `DUR_FRESH` ×1, `DUR_COUNT` ×1.

Deklarisani tokeni: trajanja `press`, `fast`, `base`, `momentum`; krive `ui`, `momentum`, `out-expo`, `expo`.

## 7. Duplikati istog namena (različiti recepti klasa)

- **Čip (inline-flex + rounded + border + px + sitan tekst)**: 78 različitih recepata za 93 upotreba
- **Kartica (rounded-xl + bg-card/bg-surface)**: 56 različitih recepata za 93 upotreba
- **Natpis pločice (heading-caps + text-micro)**: 18 različitih recepata za 64 upotreba
- **Prazno stanje (centrirano, veliki vertikalni razmak)**: 23 različitih recepata za 34 upotreba

Najčešći recepti čipa:

- ×4 `inline-flex items-center gap-1 rounded-md border border-line-soft bg-surface-raised px-2 py-0.5 font-mono text-xs text-foreground`
- ×3 `inline-flex items-center rounded-md border px-1.5 py-0.5 text-micro font-medium`
- ×3 `inline-flex items-center gap-1 rounded border border-line bg-surface-raised px-1.5 py-px text-micro text-text-muted`
- ×2 `inline-flex items-center rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 border border-emerald-500/20`
- ×2 `inline-flex items-center rounded-full border border-accent-400/30 bg-accent-400/10 px-2.5 py-0.5 text-xs font-semibold text-accent-400`
- ×2 `inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors`
- ×2 `inline-flex rounded-md border px-2 py-0.5 text-xs font-medium`
- ×2 `inline-flex items-center gap-1.5 rounded-md border border-accent-400/40 bg-accent-400/10 px-3 py-1.5 text-xs font-semibold text-accent-400 hover:bg-accent-400/20 transition-colors`

Najčešći recepti kartice:

- ×9 `space-y-3 rounded-xl border border-line bg-surface/50 p-3.5`
- ×9 `rounded-xl border bg-card p-6 shadow-card`
- ×7 `space-y-2.5 rounded-xl border border-line bg-surface/50 p-3.5`
- ×4 `rounded-xl border border-line bg-surface-raised/40 p-4 text-xs leading-relaxed text-text-muted sm:text-sm`
- ×3 `rounded-xl border border-line bg-surface/50 p-3.5`
- ×2 `rounded-xl border bg-card p-8 shadow-elev-1`
- ×2 `rounded-xl border border-line bg-card p-5`
- ×2 `rounded-xl border border-line bg-surface overflow-hidden`

## 8. Prazna stanja koja slave prazninu (zelena kvačica + „Nema …")

- `components/app/leadovi/gaps-panel.tsx`
- `components/app/leadovi/overdue-panel.tsx`
- `components/app/novosti/novosti-table.tsx`
- `components/app/settings/action-audit-log.tsx`

