import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { Provider } from "./providers";

/**
 * ============================================================================
 * ISTI SPOLJNI NALOG U DVA PROJEKTA (plan C10 E3, §5.6)
 * ============================================================================
 *
 * Webhook-ovi, `orIngest` i inbox traže vezu po spoljnom ID-u i uzimaju prvi
 * pogodak, pa bi isti Instagram nalog, Facebook stranica ili Threads nalog u
 * dva projekta tiho slao poruke i komentare u pogrešan projekat. Zato se kod
 * ta tri kanala povezivanje naloga koji je već povezan u drugom projektu
 * odbija. Kod ostalih (YouTube, Meta i Google oglasi, GA4) cron radi po vezi,
 * pa se veza upisuje uz upozorenje. Rizik nije samo dupla kvota (C19): oba
 * projekta mogu da menjaju isti nalog (pravila oglasa, automatizacije
 * komentara na istom YouTube kanalu odgovaraju dvaput), pa to upozorenje kaže.
 *
 * Veza u prekidu (`disconnecting`) se ne broji: posle prekida u jednom
 * projektu, drugi sme da poveže isti nalog. Poruke ne otkrivaju ime drugog
 * projekta.
 * ============================================================================
 */

export const NALOG_U_DRUGOM_PROJEKTU = {
  code: "nalog_u_drugom_projektu",
  message: "Ovaj nalog je već povezan u drugom projektu. Prvo prekini vezu tamo.",
} as const;

export const UPOZORENJE_NALOG_DRUGDE =
  "Isti nalog je povezan i u drugom projektu: oba troše njegovu kvotu i oba mogu da ga menjaju. Automatska pravila i automatizacije komentara uključi samo u jednom.";

/** Kanali čiji webhook upisuje u prvi pronađeni projekat: tu se odbija. */
export const ODBIJA_DRUGDE: ReadonlySet<Provider> = new Set<Provider>([
  "meta_ig",
  "meta_fb",
  "threads",
]);

/**
 * Da li je neki od `ids` već povezan za `provider` u DRUGOM projektu.
 * `externalIdAlt` je spoljni ID samo kod Instagrama (profesionalni nalog);
 * kod Facebooka je to ime stranice, a kod Google oglasa MCC koji projekti
 * smeju da dele. Tabela veza je mala (najviše po jedna veza provajdera po
 * projektu), pa ide isti obrazac kao `resolveConnectionByAccount`.
 */
export async function nalogPovezanDrugde(
  db: QueryCtx["db"],
  provider: Provider,
  ids: readonly (string | undefined)[],
  workspaceId: Id<"workspaces">,
): Promise<boolean> {
  const trazeni = ids.filter((id): id is string => typeof id === "string" && id.length > 0);
  if (trazeni.length === 0) return false;
  const veze = await db
    .query("connections")
    .withIndex("by_provider", (q) => q.eq("provider", provider))
    .collect();
  return veze.some(
    (c) =>
      c.workspaceId !== workspaceId &&
      c.status !== "disconnecting" &&
      ((c.externalId !== undefined && trazeni.includes(c.externalId)) ||
        (provider === "meta_ig" &&
          c.externalIdAlt !== undefined &&
          trazeni.includes(c.externalIdAlt))),
  );
}

/** Odbij povezivanje ako je nalog već povezan u drugom projektu (pre upisa). */
export async function odbijAkoJeDrugde(
  db: QueryCtx["db"],
  provider: Provider,
  ids: readonly (string | undefined)[],
  workspaceId: Id<"workspaces">,
): Promise<void> {
  if (await nalogPovezanDrugde(db, provider, ids, workspaceId)) {
    throw new ConvexError(NALOG_U_DRUGOM_PROJEKTU);
  }
}

/** Upozorenje za kanale bez webhook-a, ili `null`. */
export async function upozorenjeAkoJeDrugde(
  db: QueryCtx["db"],
  provider: Provider,
  ids: readonly (string | undefined)[],
  workspaceId: Id<"workspaces">,
): Promise<string | null> {
  return (await nalogPovezanDrugde(db, provider, ids, workspaceId))
    ? UPOZORENJE_NALOG_DRUGDE
    : null;
}
