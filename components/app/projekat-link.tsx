"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useProjekatHref } from "./projekat-provider";

/**
 * `next/link` za ekran aplikacije: `href` je putanja ekrana (`/leadovi`), a
 * adresa nosi prefiks projekta kad je to potrebno (hub). Spoljne adrese,
 * sidra i globalne putanje (`/login`, `/privacy`) prolaze bez izmene.
 */
export function ProjekatLink({
  href,
  ...ostalo
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const ka = useProjekatHref();
  return <Link href={ka(href)} {...ostalo} />;
}
