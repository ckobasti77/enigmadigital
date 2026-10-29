import { EkranUskoro } from "@/components/app/prostor/ekran-uskoro";

export const metadata = {
  // Ime projekta dodaje šablon iz layout-a `[projekat]`.
  title: "Beleške",
};

/** Radni deo projekta (SPAJANJE P13). Sadržaj donosi kasniji korak. */
export default function Page() {
  return <EkranUskoro naslov="Beleške" />;
}
