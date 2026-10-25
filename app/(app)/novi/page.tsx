import { NoviProjekat } from "@/components/app/hub/novi-projekat";

export const metadata = { title: "Novi projekat · Enigma Digital" };

/**
 * Čarobnjak „Novi projekat“ (hub putanja `/novi`, samo vlasnik platforme).
 * Na panel domenu proxy ovu adresu prepisuje pod projekat domena, gde ne
 * postoji (404): panel nema hub. Kao hub, van je ljuske projekta i boju mesta
 * nosi sam (Kontrolna tabla).
 */
export default function NoviProjekatPage() {
  return (
    <div data-module="tabla" className="flex min-h-full flex-1 flex-col">
      <NoviProjekat />
    </div>
  );
}
