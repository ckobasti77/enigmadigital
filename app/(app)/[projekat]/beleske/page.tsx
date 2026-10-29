import { BeleskeEkran } from "@/components/app/prostor/mape/ekrani";

export const metadata = {
  // Ime projekta dodaje šablon iz layout-a `[projekat]`.
  title: "Beleške",
};

/** Mapa beleški projekta (SPAJANJE P13, S14). Mapa se učitava dinamički. */
export default function Page() {
  return <BeleskeEkran />;
}
