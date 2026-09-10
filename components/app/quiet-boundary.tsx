"use client";

import { Component, type ReactNode } from "react";

/**
 * Granica za prateće delove ljuske (stanje sinhronizacije, zvono, bedževi).
 *
 * Sve troje sedi u ljusci, dakle na SVAKOM ekranu, i sve troje čita upit koji
 * traži članstvo u radnom prostoru — a taj upit ume da pukne (nalog bez
 * članstva, istekla sesija, prekid veze u toku). Bez ove granice bi jedno
 * očitavanje oborilo celu aplikaciju.
 *
 * Kada padne, ne prikazuje se ništa. Prateća informacija koja ne stigne mora
 * da ćuti, a ne da stane na put onome zbog čega je ekran otvoren; sve što
 * takva stavka nudi dostupno je i iz navigacije.
 */
export class QuietBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
