/**
 * TH15 — zašto sync ne povlači nove objave.
 *
 * Objave su dokazano na profilu (@itenigma, provereno 26.08.2026), a
 * `threadsPosts` u bazi i posle tri sync-a i dalje ima samo stare. Ova skripta
 * poziva ISTI endpoint koji sync poziva, dva puta:
 *
 *   A) sa `since` (30 dana unazad) — tačno kako `syncThreads` radi
 *   B) bez `since` — da se vidi da li je `since` ono što odseca nove objave
 *
 * Ispisuje SAMO id, media_type i timestamp. Token se ne ispisuje nigde.
 */
import { readFileSync } from "node:fs";

const TOKEN = readFileSync(".threads-probe-token", "utf8").trim();
const USER_ID = process.env.THREADS_USER_ID?.trim();

if (!TOKEN) {
  console.error("Nema tokena u .threads-probe-token — prekidam.");
  process.exit(1);
}
if (!USER_ID) {
  console.error("Nema THREADS_USER_ID u okruženju — prekidam.");
  console.error("Pokreni sa: THREADS_USER_ID=28983614471241198 npx tsx scripts/th15-posts-check.ts");
  process.exit(1);
}

const BASE = "https://graph.threads.com";
const FIELDS = "id,media_type,media_product_type,timestamp,text";

async function fetchPosts(label: string, since?: number) {
  const url = new URL(`${BASE}/${USER_ID}/threads`);
  url.searchParams.set("fields", FIELDS);
  url.searchParams.set("limit", "50");
  if (since !== undefined) url.searchParams.set("since", String(since));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const body = await res.text();

  console.log(`\n─── ${label} ─── HTTP ${res.status}`);
  if (!res.ok) {
    // Telo greške NE ispisujemo sirovo — Meta ume da vrati poslatu vrednost.
    console.log("Zahtev odbijen. Prva 200 karaktera odgovora:");
    console.log(body.slice(0, 200).replace(/[A-Za-z0-9_-]{30,}/g, "[REDACTED]"));
    return;
  }

  const json = JSON.parse(body) as {
    data?: Array<{ id: string; media_type?: string; timestamp?: string; text?: string }>;
    paging?: { next?: string };
  };
  const items = json.data ?? [];
  console.log(`Vraćeno objava: ${items.length}${json.paging?.next ? " (ima sledeću stranicu)" : ""}`);
  for (const it of items) {
    const t = (it.text ?? "").slice(0, 40).replace(/\s+/g, " ");
    console.log(`  ${it.timestamp ?? "—"}  ${String(it.media_type ?? "—").padEnd(14)}  ${it.id}  "${t}"`);
  }
}

// Projekat nema `"type": "module"` u package.json, pa tsx transpajlira u CJS —
// a top-level `await` u CJS ne postoji. Zato sve ide kroz `main()`, isto kao
// `scripts/probe-threads-fields.ts`.
async function main(): Promise<void> {
  const since = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);

  await fetchPosts(`A) SA since=${since} (kako sync radi)`, since);
  await fetchPosts("B) BEZ since", undefined);

  console.log("\nAko A vrati manje objava nego B — krivac je `since` parametar.");
  console.log("Ako oba vrate isto malo — Meta jos nije indeksirala nove objave.");
}

main().catch((err) => {
  console.error("Fatalna greška:", err);
  process.exit(1);
});
