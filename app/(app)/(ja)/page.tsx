import { EkranUskoro } from "@/components/app/prostor/ekran-uskoro";

export const metadata = { title: "Danas · Enigma Digital" };

/**
 * `/` je Danas iz svih projekata (SPAJANJE O7, P17): Moj dan, Čeka te i
 * misije. Do koraka koji ga pravi stoji privremeno prazno stanje (plan S07
 * D19); hub „Svi projekti“ je na `/projekti`.
 */
export default function DanasPage() {
  return <EkranUskoro naslov="Danas" />;
}
