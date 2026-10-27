import { getFunctionName } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Fixture, R } from "./fixtures-util";

/**
 * Pošteni brojevi u razvojnom prikazu: pregledi profila na Instagramu.
 *
 * Meta je preglede profila slala za prethodni period, a za tekući nije. Ekran
 * zato pokazuje „—" sa razlogom, a ne nulu: nula se piše samo kad je izmerena.
 * Ostale mere upita (`MetricExplorer`) ostaju prazne, kao i pre.
 */

const DAN_MS = 24 * 60 * 60 * 1000;
/** Tekući period podrazumevano pokriva poslednjih 28 dana. */
const TEKUCI_PERIOD_DANA = 28;

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function preglediProfila(args: Record<string, unknown>): R<typeof api.instagramStore.metricSeries> {
  if (args.metric !== "profile_views" || args.dimensionKey !== undefined) return [];
  const od = String(args.from);
  const doDatuma = String(args.to);
  // Poslednji dan sa merenjem: dan pre početka tekućeg perioda.
  const granica = iso(new Date(Date.now() - TEKUCI_PERIOD_DANA * DAN_MS));
  const redovi: R<typeof api.instagramStore.metricSeries> = [];
  for (
    let d = new Date(`${od}T00:00:00Z`);
    iso(d) <= doDatuma;
    d = new Date(d.getTime() + DAN_MS)
  ) {
    const datum = iso(d);
    if (datum >= granica) break;
    redovi.push({
      date: datum,
      dimensionKeys: [],
      dimensionValues: [],
      value: 18 + (d.getUTCDate() % 7) * 3,
      state: "value",
      reason: undefined,
    });
  }
  return redovi;
}

export const FIXTURES_BROJEVI: Record<string, Fixture> = {
  [getFunctionName(api.instagramStore.metricSeries)]: preglediProfila,
};
