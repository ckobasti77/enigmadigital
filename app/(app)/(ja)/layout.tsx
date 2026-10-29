import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";

/**
 * Ljuska ličnog nivoa „Ja“ (SPAJANJE P13–P14, plan S07 D1): Danas, Moji
 * zadaci, Inbox, Poruke, Beleške, hub „Svi projekti“ i čarobnjak novog
 * projekta. Ista ljuska kao u projektu, bez `ProjekatProvider`-a: traka levo
 * i meni „Ja“ pored nje.
 *
 * Panel domen (zaključan na jedan projekat) nema „Ja“: proxy tamo sve
 * prepisuje pod projekat, pa ova strana tamo ne stiže. Provera je odbrana.
 */
export default async function JaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const h = await headers();
  if (h.get("x-panel-rezim") === "panel") notFound();
  return <AppShell opseg="ja">{children}</AppShell>;
}
