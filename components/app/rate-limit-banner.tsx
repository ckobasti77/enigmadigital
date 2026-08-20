"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { FeedbackNote } from "@/components/app/feedback";
import { formatClockTime } from "@/lib/format";

/**
 * Traka koja se pojavi kada je preuzimanje podataka ZAISTA zaustavljeno.
 *
 * Ne pojavljuje se na 81 %. Tu Meta ne odbija ništa, ručna sinhronizacija
 * prolazi, a jedino što staje je pozadinski prolaz koji svejedno kreće za dva
 * minuta — traka koja se pali dok sve radi je traka koju čovek nauči da ne
 * čita (V2/4). Blaži nivo sada stoji kao jedan red u Podešavanjima, tamo gde se
 * gleda kad se traži.
 *
 * NE PIŠE IME MREŽE NA KOJOJ SI. Kvota je kvota jedne Meta aplikacije i deli je
 * sve što kroz nju prolazi — Instagram, Facebook stranica i Meta Ads — pa je
 * ista brojka za ceo workspace. Traka koja piše „Instagram ograničava pozive"
 * zato ume da optuži Instagram za prigušenje koje je izazvao izveštaj o
 * oglasima. Ovde stoji ono što se zna: Meta je ta koja usporava, a `network`
 * imenuje samo čije podatke to zaustavlja na ovom ekranu.
 */
export function RateLimitBanner({ network }: { network: string }) {
  const status = useQuery(api.metaSyncStore.rateLimit);

  if (status === undefined || !status.limited) return null;

  const refused = status.state === "backoff";
  const at = status.retryAt;

  // Tri različite rečenice za tri različita nivoa znanja o vremenu, i nijedna
  // ne izmišlja minut koji nemamo.
  const when =
    at === null
      ? "Osvežavanje se nastavlja čim se obim oslobodi."
      : refused
        ? `Sledeći pokušaj u ${formatClockTime(at)}.`
        : `Osvežavanje se nastavlja čim se obim oslobodi, najkasnije u ${formatClockTime(at)}.`;

  return (
    <FeedbackNote
      tone="warning"
      title={
        refused
          ? "Meta je privremeno odbila naše pozive."
          : "Potrošen je skoro ceo dozvoljeni obim poziva ka Meti."
      }
    >
      {`${when} Podaci na ovom ekranu (${network}) su poslednji koje smo uspeli da preuzmemo. Obim se deli između Instagrama, Facebook stranice i oglasa, pa je uzrok mogao biti bilo koji od njih.`}
    </FeedbackNote>
  );
}
