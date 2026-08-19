"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { FeedbackNote } from "@/components/app/feedback";
import { formatClockTime } from "@/lib/format";

/**
 * Traka koja se pojavi kada Meta počne da usporava pozive.
 *
 * Nijedna brojka i nijedan kod nisu u tekstu. „Instagram privremeno ograničava
 * pozive" je celina onoga što operater može da uradi povodom toga — a to je
 * ništa, osim da zna zašto brojevi kasne i kada prestaju da kasne. Procenat
 * potrošnje kvote je naša briga, ne njegova.
 *
 * Ne prikazuje se dok je sve u redu: traka koja stalno stoji prestane da bude
 * upozorenje i postane deo pozadine.
 */
export function RateLimitBanner({ network }: { network: string }) {
  const status = useQuery(api.metaSyncStore.rateLimit);

  if (status === undefined || !status.limited) return null;

  return (
    <FeedbackNote
      tone="warning"
      title={`${network} privremeno ograničava pozive.`}
    >
      {status.retryAt === null
        ? "Osvežavanje se nastavlja samo čim se limit oslobodi. Podaci na ekranu su poslednji koje smo uspeli da preuzmemo."
        : `Sledeći pokušaj u ${formatClockTime(status.retryAt)}. Podaci na ekranu su poslednji koje smo uspeli da preuzmemo.`}
    </FeedbackNote>
  );
}
