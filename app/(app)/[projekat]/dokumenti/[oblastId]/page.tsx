import { notFound } from "next/navigation";
import { EkranUskoro } from "@/components/app/prostor/ekran-uskoro";
import { jeOblikId } from "@/lib/prostor/web/oblik-id";

export const metadata = {
  // Ime projekta dodaje šablon iz layout-a `[projekat]`.
  title: "Dokumenti",
};

/**
 * Oblast projekta (`?tab=pregled|zadaci|dokumenti|mapa`, SPAJANJE P13).
 * Server proverava samo oblik ID-ja; postojanje i pripadnost projektu
 * proverava backend. Sadržaj donosi kasniji korak.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ oblastId: string }>;
}) {
  const { oblastId } = await params;
  if (!jeOblikId(oblastId)) notFound();
  return <EkranUskoro naslov="Oblast" />;
}
