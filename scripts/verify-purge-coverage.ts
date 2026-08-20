/**
 * ============================================================================
 * DOKAZ: nijedna tabela nekog providera ne ostaje van brisanja
 * ============================================================================
 *
 * Pokretanje (radi se i automatski, kao prvi korak `npm run build`):
 *
 *   node --import ./scripts/ts-hooks.mjs scripts/verify-purge-coverage.ts
 *
 * Zašto postoji: garancija brisanja iz YA2 nije bila garancija nego spisak u
 * jednoj funkciji. Tabela dodata šest meseci kasnije ne upisuje se sama ni u
 * jedan spisak, ništa je ne prijavi, i prekid veze tiho prestane da bude
 * brisanje. Taj kvar se ne vidi u testu koji proverava da brisanje radi — jer
 * brisanje i dalje radi, samo ne za sve.
 *
 * Ovde se, dakle, ne proverava da li brisanje radi, nego da li je POTPUNO.
 * Tri provere, i sve tri obaraju build:
 *
 *   1. Svaka tabela u šemi čije ime počinje prefiksom nekog providera
 *      (`yt`, `ig`, `fb`, `meta`, `ga4`, `gads`, `ad`, `or`) mora imati odluku
 *      u `TABLE_OWNERSHIP` — ili je neko briše, ili je izuzeta sa napisanim
 *      razlogom. Ćutanje nije opcija.
 *   2. Suvišan ključ u `TABLE_OWNERSHIP` (tabela koje više nema, ili prefiks
 *      koji je dodat u tip a ne i u `PROVIDER_TABLE_PREFIXES`) je isto greška.
 *   3. Ako mapa tvrdi da tabelu briše provider X, korak tog providera zaista
 *      mora da je navede. Inače mapa opisuje nameru, a ne kod.
 *
 * TypeScript hvata samo prvu od te tri, i to samo dok se tip
 * `ProviderPrefixedTable` i lista prefiksa poklapaju. Ovo hvata i ostalo.
 */

import schema from "../convex/schema";
import {
  PROVIDER_TABLE_PREFIXES,
  PURGE_STEPS,
  TABLE_OWNERSHIP,
} from "../convex/lib/purgeMap";
import { ALL_PROVIDERS, type Provider } from "../convex/lib/providers";

const problems: string[] = [];
const notes: string[] = [];

// ── 1 + 2: šema naspram mape ────────────────────────────────────────────────

const schemaTables = Object.keys(
  (schema as unknown as { tables: Record<string, unknown> }).tables,
).sort();

const prefixed = schemaTables.filter((table) =>
  PROVIDER_TABLE_PREFIXES.some((prefix) => table.startsWith(prefix)),
);

const owned = new Set(Object.keys(TABLE_OWNERSHIP));

for (const table of prefixed) {
  if (!owned.has(table)) {
    problems.push(
      `Tabela "${table}" po imenu pripada nekom provideru, a nema odluku u TABLE_OWNERSHIP (convex/lib/purgeMap.ts). Dodaj je u spisak brisanja ili je izuzmi sa razlogom.`,
    );
  }
}

const prefixedSet = new Set(prefixed);
for (const table of owned) {
  if (!prefixedSet.has(table)) {
    problems.push(
      `TABLE_OWNERSHIP ima ključ "${table}" kojeg nema u šemi (ili se ne poklapa ni sa jednim prefiksom). Obriši ga ili uskladi PROVIDER_TABLE_PREFIXES.`,
    );
  }
}

// ── 3: mapa naspram stvarnih koraka ─────────────────────────────────────────

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

for (const [table, disposition] of Object.entries(TABLE_OWNERSHIP)) {
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
        `TABLE_OWNERSHIP kaže da "${provider}" briše "${table}", ali nijedan korak u PURGE_STEPS["${provider}"] tu tabelu ne dodiruje.`,
      );
    }
  }
}

// ── izveštaj ────────────────────────────────────────────────────────────────

console.log("Pokrivenost brisanja (P3)\n");
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
  `\n✓ ${prefixed.length} tabela sa prefiksom providera, svaka sa odlukom, svaki spisak se poklapa sa kodom.`,
);
