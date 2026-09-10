import { cn } from "@/lib/utils";

/**
 * Verovatnoća da telefon pripada baš toj osobi (GL2, plan §6).
 *
 * TRI RAZLIČITA STANJA, TRI RAZLIČITA PRIKAZA:
 * - broj + traka  → procena postoji
 * - siv tekst „nije moguće proceniti" → pokušano, nema nijednog dokaza
 * - ništa → nikad ni procenjivano
 *
 * Nula se NE prikazuje ni u jednom od poslednja dva slučaja. Traka na nuli
 * izgleda kao „sigurno nije ta osoba", a to nije ono što znamo (§0 pravilo 4).
 *
 * Boje po planu: crvena < 40, žuta 40–69, zelena ≥ 70 — postojeći tokeni
 * `danger` / `warning` / `success`, bez novih hex vrednosti.
 */

export function verovatnocaTon(v: number): "danger" | "warning" | "success" {
  if (v >= 70) return "success";
  if (v >= 40) return "warning";
  return "danger";
}

const TRAKA: Record<"danger" | "warning" | "success", string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  success: "bg-success",
};

const TEKST: Record<"danger" | "warning" | "success", string> = {
  danger: "text-danger",
  warning: "text-warning",
  success: "text-success",
};

const RING_R = 6;
const RING_C = 2 * Math.PI * RING_R;

/**
 * Prsten procene za kolonu „Telefon" (A3, O2): mali kružni merač + procenat.
 * Ispuna nosi jačinu (crvena < 40, žuta 40–69, zelena ≥ 70), a neispunjen deo
 * je svetliji korak ISTE boje, pa se stanje čita i preko praznog dela (pravilo
 * merača iz dataviz skilla). Broj je u tekstualnom tonu iste skale, tabularan.
 *
 * Tri druga stanja NE crtaju prsten: „bez procene" (ima broj, niko nije
 * procenio), „nije moguće proceniti" (pokušano, bez dokaza) i „—" (nema
 * broja). Prsten na nuli bi značio „sigurno nije ta osoba", a to ne znamo.
 */
export function PhoneConfidenceRing({
  verovatnoca,
  className,
}: {
  verovatnoca: number;
  className?: string;
}) {
  const ton = verovatnocaTon(verovatnoca);
  const deo = Math.min(100, Math.max(0, verovatnoca)) / 100;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", TEKST[ton], className)}
      title={`Verovatnoća da broj pripada toj osobi: ${verovatnoca} od 100`}
    >
      <svg
        viewBox="0 0 16 16"
        className="size-4 shrink-0 -rotate-90"
        role="img"
        aria-label={`Verovatnoća da broj pripada toj osobi: ${verovatnoca} od 100`}
      >
        <circle cx="8" cy="8" r={RING_R} fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth="2.5" />
        <circle
          cx="8"
          cy="8"
          r={RING_R}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${(RING_C * deo).toFixed(2)} ${RING_C.toFixed(2)}`}
        />
      </svg>
      <span className="font-mono text-ui font-medium tabular-nums">{verovatnoca} %</span>
    </span>
  );
}

export function PhoneConfidence({
  verovatnoca,
  nijeMoguceProceniti,
  obrazlozenje,
  izvor,
  compact = false,
  className,
}: {
  verovatnoca?: number;
  nijeMoguceProceniti?: boolean;
  obrazlozenje?: string;
  izvor?: "skill" | "covek";
  /** Bez trake i obrazloženja — samo procenat, za tabelu i prošireni red. */
  compact?: boolean;
  className?: string;
}) {
  if (verovatnoca === undefined) {
    if (!nijeMoguceProceniti) return null;
    return (
      <span
        className={cn("text-micro text-text-muted", className)}
        title={obrazlozenje}
      >
        nije moguće proceniti
      </span>
    );
  }

  const ton = verovatnocaTon(verovatnoca);

  if (compact) {
    return (
      <span
        className={cn("font-mono text-micro font-semibold tabular-nums", TEKST[ton], className)}
        title={obrazlozenje}
      >
        {verovatnoca} %
      </span>
    );
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className="flex items-center gap-2">
        <div
          className="h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-surface-raised"
          role="img"
          aria-label={`Verovatnoća da broj pripada toj osobi: ${verovatnoca} od 100`}
        >
          <div
            className={cn("h-full rounded-full", TRAKA[ton])}
            style={{ width: `${Math.max(2, Math.min(100, verovatnoca))}%` }}
          />
        </div>
        <span
          className={cn("font-mono text-xs font-semibold tabular-nums", TEKST[ton])}
        >
          {verovatnoca} %
        </span>
        {izvor === "covek" && (
          <span className="rounded border border-line bg-surface-raised px-1.5 py-px text-micro text-text-muted">
            ispravio čovek
          </span>
        )}
      </div>
      {obrazlozenje && (
        <p className="text-micro leading-relaxed text-text-muted">{obrazlozenje}</p>
      )}
    </div>
  );
}
