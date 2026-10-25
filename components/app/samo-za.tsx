"use client";

import type { ReactNode } from "react";
import { useMoze } from "./projekat-provider";

/**
 * Deo ekrana koji vidi samo uloga od `uloga` naviše (P9): `urednik` za izmene
 * podataka projekta, `owner` za veze, brisanje, članove i podešavanja.
 * Posmatrač (`client_viewer`) vidi istu stranu bez reda radnji; skriveno dugme
 * ne ostavlja prazno mesto. Backend iste izmene već odbija — ovo samo prati.
 */
export function SamoZa({
  uloga,
  children,
  inace = null,
}: {
  uloga: "urednik" | "owner";
  children: ReactNode;
  /** Šta da stoji umesto sadržaja (npr. tekst bez dugmeta); podrazumevano ništa. */
  inace?: ReactNode;
}) {
  return useMoze(uloga) ? <>{children}</> : <>{inace}</>;
}
