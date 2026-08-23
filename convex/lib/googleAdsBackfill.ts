/**
 * ============================================================================
 * GOOGLE ADS CONVERSION ATTRIBUTION & DYNAMIC BACKFILL CALCULATOR (GA4)
 * ============================================================================
 *
 * Google Ads pripisuje konverzije retroaktivno — broj konverzija za određeni dan
 * menja se sve do isteka prozora pripisivanja (attribution lookback window).
 * Za razliku od Meta fiksnog 28-dnevnog restatement prozora, Google Ads prozor
 * je dinamičan i podešava se po svakoj pojedinačnoj konverzionoj akciji u
 * rasponu od 1 do 90 dana (click_through_lookup_window_days).
 *
 * Pravila:
 *   - Dubina backfill-a = NAJVEĆI prozor među AKTIVNIM (ENABLED) konverzionim akcijama naloga.
 *   - Vrednost se striktno ograničava na opseg [1, 90] dana.
 *   - Pauzirane ("PAUSED") i uklonjene ("REMOVED") akcije se ignorišu i ne utiču na dubinu.
 *   - Fiksnih 30 dana je pogrešno: krade podatke nalogu sa 90 dana, a troši kvotu nalogu sa 7.
 *   - Ako prozor NE MOŽE da se odredi (nema akcija, nema aktivnih akcija, ili kod svih
 *     nedostaje / iznosi 0): backfill se NE POKREĆE. Vraća se `{ skipped: true, reason }`.
 *     Nepoznato stanje nije dozvola da se pretpostavi 30 dana!
 * ============================================================================
 */

export interface GoogleAdsConversionActionItem {
  readonly id: string;
  readonly name: string;
  readonly status: string; // "ENABLED", "PAUSED", "REMOVED", "HIDDEN", "UNKNOWN"
  readonly category?: string;
  readonly type?: string;
  readonly primaryForGoal?: boolean;
  readonly countingType?: string;
  readonly attributionModel?: string;
  readonly clickThroughLookupWindowDays?: number;
  readonly viewThroughLookupWindowDays?: number;
}

export type GoogleAdsBackfillDepthResult =
  | {
      readonly depth: number;
      readonly skipped: false;
      readonly activeActionsCount: number;
      readonly maxWindowFound: number;
    }
  | {
      readonly depth?: undefined;
      readonly skipped: true;
      readonly reason: string;
    };

/**
 * Dinamički određuje dubinu istorijskog backfill-a na osnovu aktivnih konverzionih akcija.
 *
 * @param actions Lista konverzionih akcija sa Google Ads naloga
 * @returns Rezultat sa izračunatom dubinom [1, 90] ili skipped: true sa razlogom
 */
export function calculateGoogleAdsBackfillDepth(
  actions?: readonly GoogleAdsConversionActionItem[] | null,
): GoogleAdsBackfillDepthResult {
  if (!actions || actions.length === 0) {
    return {
      skipped: true,
      reason:
        "Nalog nema definisanih konverzionih akcija (conversion_action). Dubina backfill-a se ne može odrediti, retroaktivni dohvat konverzija je preskočen.",
    };
  }

  // Filtriramo samo AKTIVNE konverzione akcije ("ENABLED")
  // Google Ads API status: ENABLED = 2 ili string "ENABLED"
  const activeActions = actions.filter((a) => {
    if (!a || typeof a !== "object") return false;
    const s = String(a.status || "").trim().toUpperCase();
    return s === "ENABLED" || s === "2";
  });

  if (activeActions.length === 0) {
    return {
      skipped: true,
      reason:
        "Nema aktivnih (ENABLED) konverzionih akcija na nalogu. Iz pauziranih, uklonjenih ili skrivenih akcija se ne računa prozor pripisivanja, pa je retroaktivni backfill preskočen.",
    };
  }

  // Izdvajamo validne numeričke prozore pripisivanja (> 0)
  const validWindows = activeActions
    .map((a) => a.clickThroughLookupWindowDays)
    .filter(
      (w): w is number =>
        w !== undefined &&
        w !== null &&
        typeof w === "number" &&
        Number.isFinite(w) &&
        w > 0,
    );

  if (validWindows.length === 0) {
    return {
      skipped: true,
      reason:
        "Aktivne konverzione akcije nemaju definisan prozor pripisivanja (click_through_lookup_window_days nedostaje ili je 0). Dubina se ne sme proizvoljno pretpostaviti (npr. 30 dana), pa je retroaktivni backfill preskočen.",
    };
  }

  // Najveći prozor među aktivnim akcijama
  const maxWindow = Math.max(...validWindows);

  // Ograničavamo na opseg [1, 90] dana
  const clampedDepth = Math.max(1, Math.min(90, Math.round(maxWindow)));

  return {
    depth: clampedDepth,
    skipped: false,
    activeActionsCount: activeActions.length,
    maxWindowFound: maxWindow,
  };
}
