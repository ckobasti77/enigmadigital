import { FeedbackNote } from "@/components/app/feedback";
import { jeDrugaValuta, normalizujValutu } from "@/lib/valuta";

/**
 * Upozorenje ispod zaglavlja kad nalog javlja valutu koja nije evro (O16).
 * Iznosi na ekranu ostaju u toj valuti; aplikacija ih ne preračunava. Za evro,
 * praznu ili nepoznatu valutu ne crta ništa.
 */
export function ValutaUpozorenje({
  valuta,
  className,
}: {
  valuta?: string | null;
  className?: string;
}) {
  if (!jeDrugaValuta(valuta)) return null;
  return (
    <FeedbackNote
      tone="warning"
      title={`Nalog radi u ${normalizujValutu(valuta)}; aplikacija ne preračunava.`}
      className={className}
    >
      Iznosi na ovom ekranu su u toj valuti, ne u evrima.
    </FeedbackNote>
  );
}
