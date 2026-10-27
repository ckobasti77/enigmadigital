import type { api } from "@/convex/_generated/api";
import type { RedStatusa } from "@/convex/lib/statusVeze";
import type { R } from "./fixtures-util";

/**
 * Redovi upita `statusVeza.lista` za razvojni prikaz, izvedeni iz ISTIH veza i
 * prolaza koje vraćaju `connections.list` i `sync.health` (`fixtures.ts`).
 * Tako tačka u gornjoj traci, red stanja kanala, Podešavanja i zvono crtaju
 * jedno stanje, a ne četiri izmišljena (jedan status veze, P3).
 *
 * Četiri stanja iz plana (§5.8) žive u `fixtures.ts`:
 *   - GA4, OpenReply, Meta i Google oglasi, YouTube: rade;
 *   - Instagram: pristup je istekao pre 3 dana;
 *   - Facebook stranica: pristup ističe za 5 dana;
 *   - Threads: poslednji prolaz je pao posle uspeha pre 2 dana.
 */

/** Provajderi za koje server proverava podešavanje; u razvojnom prikazu je sve podešeno. */
const SA_PODESAVANJEM = new Set(["meta_ig", "meta_fb", "threads", "youtube", "google_business"]);

export function redoviStatusa(
  veze: R<typeof api.connections.list>,
  prolazi: R<typeof api.sync.health>,
): R<typeof api.statusVeza.lista> {
  return veze.map((veza): RedStatusa => {
    const prolaz = prolazi.find((p) => p.provider === veza.provider) ?? null;
    const uspeh = prolaz?.status === "ok" ? (prolaz.finishedAt ?? prolaz.startedAt) : null;
    return {
      provider: veza.provider,
      status: veza.status,
      expiresAt: veza.expiresAt,
      lastSyncAt: veza.lastSyncAt,
      poslednjiProlaz:
        prolaz === null
          ? null
          : {
              // „stale" je oznaka ekrana zdravlja, ne stanje u bazi: u bazi je to
              // prolaz koji i dalje „teče".
              status: prolaz.status === "stale" ? "running" : prolaz.status,
              startedAt: prolaz.startedAt,
              finishedAt: prolaz.finishedAt,
            },
      poslednjiPodatak: null,
      serverPodesen: SA_PODESAVANJEM.has(veza.provider) ? true : null,
      poslednjiUspeh: uspeh ?? veza.lastSyncAt,
    };
  });
}
