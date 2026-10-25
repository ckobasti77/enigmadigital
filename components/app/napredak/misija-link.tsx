"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { ProjekatLink } from "@/components/app/projekat-link";
import { useProjekat } from "@/components/app/projekat-provider";
import type { Misija } from "./use-napredak";
import { odredisteMisije } from "./napredak-ikone";

/**
 * Veza dugmeta misije (P12, C16). Misija tekućeg projekta ide kroz
 * `ProjekatLink`; misija drugog projekta u hubu vodi pravo u taj projekat
 * (`/<slug>/…`, zato `next/link`); u panelu prelaza nema, pa se crta isti
 * element bez adrese.
 */
export function MisijaLink({
  misija,
  ...ostalo
}: Omit<ComponentProps<"a">, "href"> & { misija: Misija }) {
  const { slug, rezim } = useProjekat();
  const kuda = odredisteMisije(misija, { slug, rezim });
  if (kuda === null) {
    return (
      <span
        {...(ostalo as ComponentProps<"span">)}
        aria-disabled="true"
        title={misija.projekat ? `Otvori projekat ${misija.projekat.ime} u hubu` : undefined}
      />
    );
  }
  if (kuda.vrsta === "projekat") return <Link href={kuda.href} {...ostalo} />;
  return <ProjekatLink href={kuda.href} {...ostalo} />;
}
