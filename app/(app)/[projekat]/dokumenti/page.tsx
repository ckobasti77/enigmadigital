import { Suspense } from "react";
import { DokumentiEkran } from "@/components/app/prostor/dokumenti/ekrani";

export const metadata = {
  // Ime projekta dodaje šablon iz layout-a `[projekat]`.
  title: "Dokumenti",
};

/** Spisak oblasti projekta (SPAJANJE P13); jedna oblast vodi pravo na nju. */
export default function Page() {
  return (
    <Suspense>
      <DokumentiEkran />
    </Suspense>
  );
}
