"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { putanjaEkrana } from "@/lib/rutiranje";
import { useZapamceniPeriod } from "./date-range-picker";
import { resolveScreen } from "./nav-items";
import { useProjekat } from "./projekat-provider";

/**
 * `next/link` za ekran aplikacije: `href` je putanja ekrana (`/leadovi`), a
 * adresa nosi prefiks projekta kad je to potrebno (hub). Spoljne adrese,
 * sidra i globalne putanje (`/login`, `/privacy`) prolaze bez izmene.
 *
 * Link ka ekranu koji radi nad periodom nosi period zapamćen za projekat
 * (P4), osim kad adresa već ima svoj.
 */
export function ProjekatLink({
  href,
  ...ostalo
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const { prefiks } = useProjekat();
  const zapamcen = useZapamceniPeriod();
  const putanja = href.split(/[?#]/)[0];
  const period = href.startsWith("/") && resolveScreen(putanja)?.range === true ? zapamcen : null;
  return <Link href={putanjaEkrana(href, prefiks, period)} {...ostalo} />;
}
