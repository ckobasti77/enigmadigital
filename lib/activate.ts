import type { KeyboardEvent } from "react";

/**
 * Propsi koji red tabele ili karticu čine dostupnim i sa tastature.
 *
 * Klikabilan `<tr>` ili `<div>` je za miša gotov posao, a za tastaturu ne
 * postoji: ne prima fokus, nema ulogu, i Enter na njemu ne radi ništa. Ovo je
 * tih način da se ceo ekran izgubi za nekoga ko ne koristi miša.
 *
 * Fokusni prsten dolazi sam — pravilo iz `globals.css` hvata sve što ima
 * `role="button"` ili `tabindex`, pa se ovde ne piše nijedna klasa.
 */
export function activatable(onActivate: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (event: KeyboardEvent) => {
      // Razmak se hvata na `keydown` da stranica ne odskroluje, a okida se
      // tek kada je to jedini cilj — unutar reda ume da bude i pravo dugme.
      if (event.target !== event.currentTarget) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onActivate();
      }
    },
  };
}
