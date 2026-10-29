import { KorpaEkran } from "@/components/app/prostor/korpa/korpa-ekran";

export const metadata = {
  // Ime projekta dodaje šablon iz layout-a `[projekat]`.
  title: "Korpa",
};

/** Korpa projekta (SPAJANJE P13, S21): `?vrsta=` bira vrstu obrisanog. */
export default function Page() {
  return <KorpaEkran />;
}
