import { Hourglass } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/system/empty-state";

/**
 * Privremeno prazno stanje ekrana radnog dela (SPAJANJE S09, plan S07 D19).
 * Ruta postoji od ljuske, a sadržaj ekrana donosi kasniji korak, koji ovu
 * komponentu zamenjuje pravim kontejnerom. Jedna komponenta za sve takve
 * ekrane, da se lako nađu i da nijedan ne ostane kao mrtva strana.
 */
export function EkranUskoro({ naslov }: { naslov: string }) {
  return (
    <div className="flex w-full flex-1 flex-col gap-6">
      <PageHeader variant="module" title={naslov} />
      <EmptyState icon={Hourglass} size="lg" title="Ovaj ekran stiže uskoro.">
        Mesto u meniju i adresa već rade, a sadržaj stiže sa sledećim
        izmenama.
      </EmptyState>
    </div>
  );
}
