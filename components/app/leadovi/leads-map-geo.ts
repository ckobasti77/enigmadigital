/**
 * Geometrija mape leadova koju dele MapLibre sloj (GL7, pinovi + senka) i
 * three.js sloj (GL4/GL7, prsten za hot + beacon za sastanke, na tlu). Jedan
 * izvor za dimenzije pina, da se prsten i senka uvek slažu sa pinom koji čovek
 * vidi.
 *
 * GL7: heksagoni (visina = fit skor) su uklonjeni; lead je Google-stil pin.
 * Visina više ne nosi fit — fit ostaje u hover kartici i bočnom panelu.
 */

/**
 * Dimenzije pina u prirodnim (CSS) pikselima. Slika se crta `pixelRatio`
 * gušće (oštre crte na nagnutoj mapi). Deljeno između crtanja slike
 * (`leads-map-pin.ts`) i efekata na tlu (`leads-map-three-layer.ts`).
 */
export const PIN = {
  /** Poluprečnik glave (kruga tela) pina. */
  glavaR: 11,
  /** Rastojanje od centra glave do šiljka (dužina tela). */
  telo: 24,
  /** Poluprečnik unutrašnjeg kruga (temperatura). */
  krugR: 6.5,
  /** Prazan prostor sa strane i na vrhu (za ivicu). */
  padStrana: 3,
  padVrh: 3,
  /** Slika se crta 2× gušće za oštrinu na nagnutoj mapi. */
  pixelRatio: 2,
} as const;

/** Širina glave pina u pikselima — mera za prsten i senku na tlu. */
export const PIN_SIRINA_PX = 2 * PIN.glavaR;

export function metaraPoPikselu(lat: number, zoom: number): number {
  return (156_543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

/** Širina glave pina izražena u metrima na datoj širini i zoomu. */
export function pinSirinaM(lat: number, zoom: number): number {
  return PIN_SIRINA_PX * metaraPoPikselu(lat, zoom);
}
