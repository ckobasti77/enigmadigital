import { notFound } from "next/navigation";
import { EkranUskoro } from "@/components/app/prostor/ekran-uskoro";
import { jeOblikId } from "@/lib/prostor/web/oblik-id";

export const metadata = {
  // Ime projekta dodaje šablon iz layout-a `[projekat]`.
  title: "Stranica",
};

/**
 * Stranica ili zadatak na celu stranu (`?tab=mapa`, SPAJANJE P13). Server
 * proverava samo oblik ID-ja; postojanje i pripadnost projektu proverava
 * backend. Sadržaj donosi kasniji korak.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ stranicaId: string }>;
}) {
  const { stranicaId } = await params;
  if (!jeOblikId(stranicaId)) notFound();
  return <EkranUskoro naslov="Stranica" />;
}
