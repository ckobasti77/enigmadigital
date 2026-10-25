"use client";

import { Component, useEffect, type ReactNode } from "react";
import {
  postaviIzvorNapretka,
  useNapredakPretplata,
} from "./use-napredak";

/**
 * ============================================================================
 * IZVOR NAPRETKA — jedina pretplata, iza granice greške
 * ============================================================================
 *
 * Montira se jednom, u ljusci. Sve površine Napretka (kartica igrača, ⌘K,
 * nagrade, ekran, Podešavanja) čitaju ono što ova komponenta upiše, pa nijedna
 * od njih ne može da obori ekran kad upit padne — ista zaštita koju
 * `QuietBoundary` daje zvonu i bedževima.
 */
function Pretplata() {
  const stanje = useNapredakPretplata();
  useEffect(() => {
    postaviIzvorNapretka({ stanje, pao: false });
  }, [stanje]);
  // Odjava: sledeći čitalac ne sme da vidi tuđe. Prelazak na drugi projekat
  // ne menja ništa — napredak je jedan za korisnika (P12).
  useEffect(() => () => postaviIzvorNapretka(null), []);
  return null;
}

/**
 * Granica greške za delove Napretka. Bez `fallback` ćuti (prateći deo ljuske);
 * sa njim kaže da nešto nije dostupno, umesto da ostavi prazninu bez
 * objašnjenja.
 */
export class GranicaNapretka extends Component<
  { children: ReactNode; fallback?: ReactNode; onPad?: () => void },
  { pao: boolean }
> {
  state = { pao: false };

  static getDerivedStateFromError() {
    return { pao: true };
  }

  componentDidCatch() {
    this.props.onPad?.();
  }

  render() {
    return this.state.pao ? (this.props.fallback ?? null) : this.props.children;
  }
}

export function NapredakIzvor() {
  return (
    <GranicaNapretka
      onPad={() => postaviIzvorNapretka({ stanje: undefined, pao: true })}
    >
      <Pretplata />
    </GranicaNapretka>
  );
}
