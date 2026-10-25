/**
 * ============================================================================
 * AGREGATI HUBA „SVI PROJEKTI“ (plan C15 §1.2) — čiste funkcije
 * ============================================================================
 *
 * Pravilo broj jedan: nepoznato je `null` sa razlogom (front crta „—“),
 * nikad 0. Nula se vraća samo kad je izmerena (npr. 0 novih leadova).
 */

export type RazlogBrojke =
  | "nije_povezano"
  | "nema_podataka"
  | "previse_podataka"
  | "vise_valuta"
  | "modul_iskljucen";

export type Brojka = {
  vrednost: number | null;
  razlog: RazlogBrojke | null;
  /** Brojanje je stalo na kapi: stvarna vrednost je veća („2.000+“). */
  vise?: boolean;
};

export function nepoznato(razlog: RazlogBrojke): Brojka {
  return { vrednost: null, razlog };
}

/**
 * Broj redova pročitanih sa kapom `kapa + 1`: ako ih ima više od kape,
 * vrednost je kapa i `vise: true`.
 */
export function brojSaKapom(procitano: number, kapa: number): Brojka {
  if (procitano > kapa) return { vrednost: kapa, razlog: null, vise: true };
  return { vrednost: procitano, razlog: null };
}

export type KanalPratilaca = "instagram" | "facebook" | "threads";

export type UlazPratilaca = {
  kanal: KanalPratilaca;
  povezan: boolean;
  /** Poslednji poznat ukupan broj do kraja perioda. */
  kraj: number | null;
  /** Prvi poznat ukupan broj od početka perioda (za promenu). */
  pocetak: number | null;
};

export type Pratioci = Brojka & {
  promena: number | null;
  kanali: { kanal: KanalPratilaca; vrednost: number | null }[];
};

/**
 * Zbir poslednjih poznatih ukupnih brojeva povezanih kanala (odluka F4).
 * Kanal bez reda se ne sabira; promena se računa samo nad kanalima koji
 * imaju obe tačke.
 */
export function zbirPratilaca(ulaz: readonly UlazPratilaca[]): Pratioci {
  const povezani = ulaz.filter((k) => k.povezan);
  const kanali = povezani.map((k) => ({ kanal: k.kanal, vrednost: k.kraj }));
  if (povezani.length === 0) {
    return { ...nepoznato("nije_povezano"), promena: null, kanali };
  }
  const saBrojem = povezani.filter((k) => k.kraj !== null);
  if (saBrojem.length === 0) {
    return { ...nepoznato("nema_podataka"), promena: null, kanali };
  }
  const vrednost = saBrojem.reduce((z, k) => z + (k.kraj ?? 0), 0);
  const saObe = saBrojem.filter((k) => k.pocetak !== null);
  const promena =
    saObe.length === 0
      ? null
      : saObe.reduce((z, k) => z + ((k.kraj ?? 0) - (k.pocetak ?? 0)), 0);
  return { vrednost, razlog: null, promena, kanali };
}

export type RedPotrosnje = { spend: number; hour?: number; breakdownHash: string };

export type Potrosnja = Brojka & { valuta: string | null };

/**
 * Zbir potrošnje oglasa (odluka F5): samo dnevni redovi bez preseka
 * (`breakdownHash === "none"`, bez `hour`), samo kad svi nalozi imaju istu
 * valutu; preko kape čitanja „—“.
 */
export function zbirPotrosnje(ulaz: {
  valute: readonly string[];
  redovi: readonly RedPotrosnje[];
  kapaPredjena: boolean;
}): Potrosnja {
  if (ulaz.valute.length === 0) return { ...nepoznato("nije_povezano"), valuta: null };
  const razlicite = new Set(ulaz.valute.map((v) => v.trim().toUpperCase()));
  if (razlicite.size > 1) return { ...nepoznato("vise_valuta"), valuta: null };
  const valuta = [...razlicite][0] ?? null;
  if (ulaz.kapaPredjena) return { ...nepoznato("previse_podataka"), valuta };
  let zbir = 0;
  let dnevnih = 0;
  for (const r of ulaz.redovi) {
    if (r.breakdownHash !== "none" || r.hour !== undefined) continue;
    if (!Number.isFinite(r.spend)) continue;
    zbir += r.spend;
    dnevnih += 1;
  }
  if (dnevnih === 0) return { ...nepoznato("nema_podataka"), valuta };
  return { vrednost: Math.round(zbir * 100) / 100, razlog: null, valuta };
}
