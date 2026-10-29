"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Brojevi za podnaslov zaglavlja početne („7 za tebe · 24 otvorena u timu“).
 * Javljaju ih sami blokovi iz svojih pretplata, pa zaglavlje ne pravi drugu
 * pretplatu na isti upit: „Pokušaj ponovo“ bloka tako zaista ponovo montira
 * jedinu pretplatu (druga bi zadržala staru grešku živom). Blok koji padne ili
 * se skine javlja `undefined` i broj nestaje iz podnaslova.
 */
export type BrojeviZaglavlja = { zaTebe?: number; otvorenihUTimu?: number };
type Kljuc = keyof BrojeviZaglavlja;
type Javi = (kljuc: Kljuc, broj: number | undefined) => void;

const JaviContext = createContext<Javi | null>(null);

export function useBrojeviZaglavlja(): { brojevi: BrojeviZaglavlja; javi: Javi } {
  const [brojevi, setBrojevi] = useState<BrojeviZaglavlja>({});
  const javi = useCallback<Javi>((kljuc, broj) => {
    setBrojevi((pre) => (pre[kljuc] === broj ? pre : { ...pre, [kljuc]: broj }));
  }, []);
  return { brojevi, javi };
}

export function JaviBrojProvider({ javi, children }: { javi: Javi; children: ReactNode }) {
  return <JaviContext.Provider value={javi}>{children}</JaviContext.Provider>;
}

/** Blok javlja svoj broj dok je montiran; pri izlasku ga briše. */
export function useJaviBroj(kljuc: Kljuc, broj: number | undefined) {
  const javi = useContext(JaviContext);
  useEffect(() => {
    javi?.(kljuc, broj);
  }, [javi, kljuc, broj]);
  useEffect(() => () => javi?.(kljuc, undefined), [javi, kljuc]);
}
