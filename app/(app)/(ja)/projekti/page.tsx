import { SviProjekti } from "@/components/app/hub/svi-projekti";

export const metadata = { title: "Svi projekti · Enigma Digital" };

/**
 * Hub „Svi projekti“ (`/projekti`; do SPAJANJA je bio na `/`, koji je sada
 * Danas). Stoji u ljusci „Ja“, pa zaglavlje i boju mesta daje ljuska. Na
 * panel domenu proxy adresu prepisuje pod projekat domena, gde ne postoji.
 */
export default function SviProjektiPage() {
  return <SviProjekti uLjusci />;
}
