import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { LeadIcpRuleInput, LeadSignalInput } from "./leadScoring";

/**
 * ============================================================================
 * SIGNAL „CILJNA NIŠA“ (C14, PROJEKTI-PLAN §10)
 * ============================================================================
 *
 * Firma je u niši koju projekat označi kao ciljnu (`niches.ciljna`). Signal se
 * NE upisuje u `leadSignals`: izvodi se pri čitanju iz `leadCompanies.nicheId`
 * (upisuju ga uvoz i generate-leads), isto kao što se i ocena računa pri
 * čitanju. Zato promena oznake niše ili niše firme odmah važi.
 *
 * Izvodi se SAMO kad projekat ima aktivno pravilo za `ciljna_nisa`. Bez tog
 * pravila sve ostaje bajt za bajt isto kao pre C14 (nema dodatnih čitanja, a
 * signal se ne pojavljuje ni u `unmatchedSignalKinds`) — tako Enigma boduje
 * isto kao do sada.
 * ============================================================================
 */

export const CILJNA_NISA = "ciljna_nisa";

/** Da li ijedno aktivno pravilo traži signal ciljne niše. */
export function pravilaTraziCiljnuNisu(
  rules: readonly LeadIcpRuleInput[],
): boolean {
  return rules.some((r) => r.isActive && r.signalKind === CILJNA_NISA);
}

/**
 * Signali firme sa izvedenim signalom ciljne niše. Upisan `ciljna_nisa` (ne
 * bi smeo da postoji) se odbacuje, da baza ne može da nadjača nišu. Vreme
 * opažanja je ulazak firme u bazu: trenutak dodele niše se ne beleži, a Fit
 * osa ionako ne slabi s vremenom.
 */
export function signaliSaCiljnomNisom(
  signals: readonly LeadSignalInput[],
  firma: { createdAt: number },
  uCiljnojNisi: boolean,
): LeadSignalInput[] {
  const bez = signals.filter((s) => s.kind !== CILJNA_NISA);
  if (!uCiljnojNisi) return bez;
  return [...bez, { kind: CILJNA_NISA, observedAt: firma.createdAt }];
}

/** ID-jevi ciljnih niša projekta, preko indeksa (niša je malo po projektu). */
export async function ciljneNise(
  ctx: { db: QueryCtx["db"] },
  workspaceId: Id<"workspaces">,
): Promise<Set<string>> {
  const nise = await ctx.db
    .query("niches")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  return new Set(nise.filter((n) => n.ciljna === true).map((n) => String(n._id)));
}

/** Da li je firma u nekoj od ciljnih niša. */
export function firmaUCiljnojNisi(
  firma: Pick<Doc<"leadCompanies">, "nicheId">,
  ciljne: ReadonlySet<string>,
): boolean {
  return firma.nicheId !== undefined && ciljne.has(String(firma.nicheId));
}
