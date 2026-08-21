"use client";

import { AlertCircle, Clock, Globe, Info } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { formatNumber } from "@/lib/format";

type ReportMeta = FunctionReturnType<typeof api.analytics.reportMeta>;

/**
 * Data quality banner & footer metadata for GA4 reports.
 *
 * Surfaces 3-state data honesty indicators:
 *   - subjectToThresholding: Google dropped low-user rows for privacy.
 *   - dataLossFromOtherRow: cardinality limits pushed dimensions into (other).
 *   - sampled: report was sampled across subset of sessions.
 *   - emptyReason: explicit explanation for empty dataset.
 *
 * Always renders property timezone and standard 2-6h processing delay disclaimer.
 */
export function DataQualityNotice({ meta }: { meta?: ReportMeta }) {
  if (!meta) return null;

  const hasWarnings =
    Boolean(meta.subjectToThresholding) ||
    Boolean(meta.dataLossFromOtherRow) ||
    Boolean(meta.sampled) ||
    Boolean(meta.emptyReason);

  return (
    <div className="flex flex-col gap-3">
      {hasWarnings && (
        <div className="flex flex-col gap-2 rounded-lg border border-line-soft bg-surface-raised/40 p-3.5 text-xs">
          {meta.emptyReason && (
            <div className="flex items-start gap-2 text-text-secondary">
              <Info className="mt-0.5 size-3.5 shrink-0 text-accent-400" />
              <span>{meta.emptyReason}</span>
            </div>
          )}

          {meta.subjectToThresholding && (
            <div className="flex items-start gap-2 text-warning">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <span>
                Google je mogao da izostavi redove sa malim brojem korisnika.
                Prikazane brojke su donja granica.
              </span>
            </div>
          )}

          {meta.dataLossFromOtherRow && (
            <div className="flex items-start gap-2 text-text-secondary">
              <Info className="mt-0.5 size-3.5 shrink-0 text-text-muted" />
              <span>Deo podataka je sabijen u red (other).</span>
            </div>
          )}

          {meta.sampled && (
            <div className="flex items-start gap-2 text-warning">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <span>
                {meta.samplesReadCount !== undefined &&
                meta.samplingSpaceSize !== undefined
                  ? `Izveštaj je uzorkovan: pročitano ${formatNumber(meta.samplesReadCount)} od ${formatNumber(meta.samplingSpaceSize)}.`
                  : "Izveštaj je uzorkovan."}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Standard metadata footer */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-1 text-micro text-text-muted">
        <div className="flex items-center gap-1.5">
          <Clock className="size-3 text-text-muted" aria-hidden />
          <span>
            Podaci za danas i juče su privremeni; obrada kasni 2-6 sati.
          </span>
        </div>
        {meta.timeZone && (
          <div className="flex items-center gap-1.5 font-mono">
            <Globe className="size-3 text-text-muted" aria-hidden />
            <span>Vremenska zona propertija: {meta.timeZone}</span>
          </div>
        )}
      </div>
    </div>
  );
}
