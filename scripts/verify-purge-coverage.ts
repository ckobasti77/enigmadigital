/**
 * ============================================================================
 * DOKAZ: nijedna tabela ne ostaje bez odluke o brisanju
 * ============================================================================
 *
 * Pokretanje (radi se i automatski, kao prvi korak `npm run build` i
 * `npm run deploy:convex`):
 *
 *   node --import ./scripts/ts-hooks.mjs scripts/verify-purge-coverage.ts
 *
 * Zašto postoji: garancija brisanja iz YA2 nije bila garancija nego spisak u
 * jednoj funkciji. Tabela dodata šest meseci kasnije ne upisuje se sama ni u
 * jedan spisak, ništa je ne prijavi, i prekid veze tiho prestane da bude
 * brisanje. Taj kvar se ne vidi u testu koji proverava da brisanje radi — jer
 * brisanje i dalje radi, samo ne za sve.
 *
 * Ovde se, dakle, ne proverava da li brisanje radi, nego da li je POTPUNO — i
 * to za SVAKU tabelu u šemi, ne samo za one čije ime počinje prefiksom
 * providera (R1/4e). Ranije su `ruleFirings` (imena oglasa), `rules`, `syncRuns`
 * i `pinnedBattles` prolazili nezapaženo baš zato što im ime ne počinje
 * prefiksom.
 *
 * Četiri provere, i sve obaraju build:
 *
 *   1. SVAKA aplikaciona tabela u šemi (sve osim auth tabela, koje dolaze iz
 *      `@convex-dev/auth` i izvode se odavde automatski) mora imati odluku — u
 *      `TABLE_OWNERSHIP` (prefiksi) ili u `EXTRA_TABLE_OWNERSHIP` (ostalo). Ili
 *      je neko briše, ili je izuzeta sa napisanim razlogom. Ćutanje nije opcija.
 *   2. Suvišan ključ u mapama (tabela koje više nema) je isto greška.
 *   3. Ako mapa tvrdi da tabelu briše provider X, korak tog providera zaista
 *      mora da je navede. Inače mapa opisuje nameru, a ne kod.
 *   4. Izuzeće bez razloga je greška.
 */

import { authTables } from "@convex-dev/auth/server";
import schema from "../convex/schema";
import {
  EXTRA_TABLE_OWNERSHIP,
  PURGE_STEPS,
  TABLE_OWNERSHIP,
} from "../convex/lib/purgeMap";
import { ALL_PROVIDERS, type Provider } from "../convex/lib/providers";

type Disposition =
  | { readonly purgedBy: readonly Provider[] }
  | { readonly excluded: string };

const problems: string[] = [];
const notes: string[] = [];

// ── priprema ────────────────────────────────────────────────────────────────

const schemaTables = Object.keys(
  (schema as unknown as { tables: Record<string, unknown> }).tables,
).sort();

// Auth tabele stižu iz @convex-dev/auth i njima upravlja ta biblioteka. Izvode
// se iz `authTables` da spisak nikada ne zastari kad se biblioteka nadogradi.
const authTableNames = new Set(Object.keys(authTables));

// Aplikacione tabele = sve osim auth tabela.
const appTables = schemaTables.filter((table) => !authTableNames.has(table));

const ownership: Record<string, Disposition> = {
  ...(TABLE_OWNERSHIP as Record<string, Disposition>),
  ...EXTRA_TABLE_OWNERSHIP,
};
const ownedKeys = new Set(Object.keys(ownership));

// ── 1: svaka aplikaciona tabela ima odluku ──────────────────────────────────

for (const table of appTables) {
  if (!ownedKeys.has(table)) {
    problems.push(
      `Tabela "${table}" nema odluku o brisanju. Dodaj je u TABLE_OWNERSHIP (ako ime počinje prefiksom providera) ili u EXTRA_TABLE_OWNERSHIP (convex/lib/purgeMap.ts) — obriši je kroz neki provajder ili je izuzmi sa razlogom.`,
    );
  }
}

// ── 2: nema suvišnih ključeva ────────────────────────────────────────────────

for (const table of ownedKeys) {
  if (!schemaTables.includes(table)) {
    problems.push(
      `Odluka postoji za "${table}", ali te tabele nema u šemi. Obriši ključ.`,
    );
  } else if (authTableNames.has(table)) {
    problems.push(
      `Auth tabela "${table}" ne treba odluku ovde — njome upravlja @convex-dev/auth. Ukloni ključ.`,
    );
  }
}

// ── 3 + 4: mapa naspram stvarnih koraka, i izuzeća sa razlogom ───────────────

const stepTablesByProvider = new Map<Provider, Set<string>>();
for (const provider of ALL_PROVIDERS) {
  const steps = PURGE_STEPS[provider] ?? [];
  const tables = new Set<string>();
  for (const step of steps) {
    for (const table of step.tables) {
      if (!schemaTables.includes(table)) {
        problems.push(
          `Korak brisanja za "${provider}" navodi tabelu "${table}" koje nema u šemi.`,
        );
      }
      tables.add(table);
    }
  }
  stepTablesByProvider.set(provider, tables);
}

for (const [table, disposition] of Object.entries(ownership)) {
  if ("excluded" in disposition) {
    if (disposition.excluded.trim().length === 0) {
      problems.push(`Tabela "${table}" je izuzeta bez razloga.`);
    } else {
      notes.push(`izuzeto · ${table} — ${disposition.excluded}`);
    }
    continue;
  }
  if (disposition.purgedBy.length === 0) {
    problems.push(`Tabela "${table}" ima prazan spisak providera.`);
    continue;
  }
  for (const provider of disposition.purgedBy) {
    const tables = stepTablesByProvider.get(provider);
    if (tables === undefined) {
      problems.push(
        `Tabela "${table}" tvrdi da je briše nepoznat provider "${provider}".`,
      );
      continue;
    }
    if (!tables.has(table)) {
      problems.push(
        `TABLE mapa kaže da "${provider}" briše "${table}", ali nijedan korak u PURGE_STEPS["${provider}"] tu tabelu ne dodiruje.`,
      );
    }
  }
}

// ── izveštaj ────────────────────────────────────────────────────────────────

console.log("Pokrivenost brisanja (P3 / R1)\n");
for (const provider of ALL_PROVIDERS) {
  const tables = [...(stepTablesByProvider.get(provider) ?? [])].sort();
  console.log(
    `  ${provider.padEnd(12)} ${
      tables.length === 0 ? "— nema podataka za brisanje" : tables.join(", ")
    }`,
  );
}
console.log("");
for (const note of notes.sort()) console.log(`  ${note}`);

if (problems.length > 0) {
  console.error("\nPokrivenost brisanja NIJE potpuna:\n");
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `\n✓ ${appTables.length} aplikacionih tabela (+ ${authTableNames.size} auth), svaka sa odlukom, svaki spisak se poklapa sa kodom.`,
);
