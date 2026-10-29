"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { EKRANI } from "@/lib/rutiranje";

/**
 * `next/link` za nivo „Ja“ i za prelaz u drugi projekat (plan S07 §4.4).
 *
 * `ProjekatLink` dodaje prefiks TEKUĆEG projekta, pa bi `/poruke` iz „Ja“
 * postao `/enigma-it/poruke`. Ovde adresa ide kakva jeste: `/`,
 * `/moji-zadaci`, `/inbox`, `/poruke`, `/beleske`, `/projekti`, `/novi`,
 * `/otvori…`, ili `/<slug>/…` (drugi projekat; adresu pravi
 * `hrefUProjektu` / `useProstorNavigacija().href`).
 *
 * Gola putanja ekrana projekta (`/leadovi`, `/zadaci`) ovde je greška — to je
 * posao `ProjekatLink`-a. U razvoju se prijavljuje u konzoli.
 */
const JA_EKRANI = new Set(["poruke", "beleske"]);
const EKRAN: ReadonlySet<string> = new Set<string>(EKRANI);

export function jeJaAdresa(href: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  const prvi = href.split(/[?#]/)[0].split("/").filter(Boolean)[0] ?? "";
  return !EKRAN.has(prvi) || JA_EKRANI.has(prvi);
}

export function JaLink({
  href,
  ...ostalo
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  if (process.env.NODE_ENV !== "production" && !jeJaAdresa(href)) {
    console.error(`JaLink: „${href}“ nije adresa nivoa Ja; za ekran projekta koristi ProjekatLink.`);
  }
  return <Link href={href} {...ostalo} />;
}
