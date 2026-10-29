import { AktivnostEkran } from "@/components/app/prostor/pocetna/aktivnost-ekran";

export const metadata = {
  // Ime projekta dodaje šablon iz layout-a `[projekat]`.
  title: "Aktivnost",
};

/** Aktivnost projekta (SPAJANJE P13, S20): ko je šta menjao, najnovije prvo. */
export default function Page() {
  return <AktivnostEkran />;
}
