import { Suspense } from "react";
import { notFound } from "next/navigation";
import { StranicaEkran } from "@/components/app/prostor/dokumenti/ekrani";
import { jeOblikId } from "@/lib/prostor/web/oblik-id";

export const metadata = {
  // Ime projekta dodaje šablon iz layout-a `[projekat]`.
  title: "Stranica",
};

/**
 * Stranica kao dokument tima (`?tab=mapa`, SPAJANJE P13). Server proverava
 * samo oblik ID-ja; postojanje i pripadnost projektu proverava backend.
 * Karticu čita klijent (`useSearchParams`), zato Suspense.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ stranicaId: string }>;
}) {
  const { stranicaId } = await params;
  if (!jeOblikId(stranicaId)) notFound();
  return (
    <Suspense>
      <StranicaEkran stranicaId={stranicaId} />
    </Suspense>
  );
}
