"use client";

import { useEffect, useRef, useState } from "react";
import { DUR_UI } from "@/lib/motion";

/**
 * Koliko dugo roditelj drži čvor u DOM-u posle zatvaranja. `Unfold` sam
 * animira izlazak, ali ne može da spreči roditelja da mu odmah ispod nogu
 * odmontira `<tr>`. Malo duže od tvina, da poslednji kadar ne padne u prazno.
 */
export const EXIT_LATCH_MS = Math.round(DUR_UI * 1000) + 60;

/**
 * Za skup otvorenih ključeva (prošireni redovi tabele — može ih biti više
 * odjednom): vraća ključeve koji su upravo izbačeni i još animiraju izlazak.
 *
 * Postoji zato što se red tabele crta u petlji, a ne kao komponenta, pa bi
 * kapija po redu bila hook u petlji. Ovako je jedan hook na nivou tabele.
 *
 * Ponovno otvaranje u toku izlaska poništava tajmer — kapija se nikad ne
 * zatvori ispod sadržaja koji se opet otvara.
 */
export function useSetExitLatch(
  otvoreni: ReadonlySet<string>,
  ms = EXIT_LATCH_MS,
): ReadonlySet<string> {
  const [izlaze, setIzlaze] = useState<ReadonlySet<string>>(() => new Set());
  const prethodni = useRef(otvoreni);
  const tajmeri = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const bili = prethodni.current;
    prethodni.current = otvoreni;
    const tm = tajmeri.current;

    const skini = (kljuc: string) =>
      setIzlaze((cur) => {
        if (!cur.has(kljuc)) return cur;
        const next = new Set(cur);
        next.delete(kljuc);
        return next;
      });

    for (const kljuc of otvoreni) {
      const t = tm.get(kljuc);
      if (!t) continue;
      clearTimeout(t);
      tm.delete(kljuc);
      skini(kljuc);
    }

    for (const kljuc of bili) {
      if (otvoreni.has(kljuc) || tm.has(kljuc)) continue;
      setIzlaze((cur) => new Set(cur).add(kljuc));
      tm.set(
        kljuc,
        setTimeout(() => {
          tm.delete(kljuc);
          skini(kljuc);
        }, ms),
      );
    }
  }, [otvoreni, ms]);

  useEffect(() => {
    const tm = tajmeri.current;
    return () => {
      for (const t of tm.values()) clearTimeout(t);
      tm.clear();
    };
  }, []);

  return izlaze;
}
