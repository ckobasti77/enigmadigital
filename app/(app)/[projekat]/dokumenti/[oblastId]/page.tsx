import { Suspense } from "react";
import { notFound } from "next/navigation";
import { OblastEkran } from "@/components/app/prostor/dokumenti/ekrani";
import { jeOblikId } from "@/lib/prostor/web/oblik-id";

export const metadata = {
  // Ime projekta dodaje šablon iz layout-a `[projekat]`.
  title: "Dokumenti",
};

/**
 * Oblast projekta (`?tab=pregled|zadaci|dokumenti|mapa`, SPAJANJE P13).
 * Server proverava samo oblik ID-ja; postojanje i pripadnost projektu
 * proverava backend. Karticu čita klijent (`useSearchParams`), zato Suspense.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ oblastId: string }>;
}) {
  const { oblastId } = await params;
  if (!jeOblikId(oblastId)) notFound();
  return (
    <Suspense>
      <OblastEkran oblastId={oblastId} />
    </Suspense>
  );
}
