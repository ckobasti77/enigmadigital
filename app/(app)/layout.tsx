import { headers } from "next/headers";
import { AuthGate } from "@/components/app/auth-gate";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Prijava za lični nivo „Ja“, hub „Svi projekti“ i sve ekrane projekta;
  // ljusku daju layout-i `(ja)` i `[projekat]`.
  //
  // Traka projekata (SPAJANJE P14) postoji samo u hubu: panel domen je
  // zaključan na jedan projekat, pa tamo njenu širinu gasi `data-traka="ne"`
  // (globals.css). Atribut stoji iznad kapije prijave, da i zamena ljuske dok
  // se sesija proverava ima tačnu širinu. `contents` ne pravi kutiju, pa
  // raspored strane ostaje isti.
  const h = await headers();
  const panel = h.get("x-panel-rezim") === "panel";
  return (
    <div data-traka={panel ? "ne" : undefined} className="contents">
      <AuthGate>{children}</AuthGate>
    </div>
  );
}
