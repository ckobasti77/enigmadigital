import { NoviProjekat } from "@/components/app/hub/novi-projekat";

export const metadata = { title: "Novi projekat · Enigma Digital" };

/**
 * Čarobnjak „Novi projekat“ (hub putanja `/novi`, samo vlasnik platforme).
 * Na panel domenu proxy ovu adresu prepisuje pod projekat domena, gde ne
 * postoji (404): panel nema hub. Stoji u ljusci „Ja“ (SPAJANJE), pa
 * zaglavlje i boju mesta daje ljuska.
 */
export default function NoviProjekatPage() {
  return <NoviProjekat uLjusci />;
}
