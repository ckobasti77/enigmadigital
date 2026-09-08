"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LeadStage } from "@/convex/leadCrmStore";
import type {
  DodirFilter,
  PlatformaFilter,
  SajtFilter,
} from "@/convex/leadFiltersStore";
import type { Temperatura } from "./lead-chips";
import { ALL_STAGES } from "./lead-chips";

/**
 * ============================================================================
 * FILTERI ŽIVE U URL-u (GL2) — plan §7.1, §O8
 * ============================================================================
 *
 * Izvor istine je adresa u pregledaču, ne `useState` u tabeli. Posledice koje
 * su i razlog za to:
 *
 * - Filtrirana lista je link. Kopiran URL otvara isti presek kod kolege.
 * - Preset je taj isti link sa imenom, pa se stari preset ne kvari kad se
 *   filteri prošire — samo ne koristi dimenzije kojih tada nije bilo.
 * - Tab „Mapa" (GL3) čita ISTI hook. Zato hook ne zna ništa o tabeli i vraća
 *   čist objekat, ne komponentu.
 *
 * NEPOZNATA VREDNOST SE IGNORIŠE, NE BACA GREŠKU. URL menja čovek i lepe ga
 * treće strane; `?temp=vruce` je greška u kucanju, a ne razlog da ekran
 * pukne. Ignorisana vrednost prosto ne postoji u filteru — i kad se URL
 * sledeći put upiše, nestane iz njega.
 */

export type LeadFilters = {
  faza: LeadStage[];
  zaostali: boolean;
  temp: Temperatura[];
  nisa: string[];
  grad: string[];
  sajt: SajtFilter[];
  platforma: PlatformaFilter[];
  koord: "da" | "ne" | null;
  /** Minimalna verovatnoća telefona (0–100); `null` = filter nije zadat. */
  tel: number | null;
  dodir: DodirFilter[];
  q: string;
};

export type MultiGrupa =
  | "faza"
  | "temp"
  | "nisa"
  | "grad"
  | "sajt"
  | "platforma"
  | "dodir";

/** Svi ključevi koje ovaj hook drži u URL-u. Ostali parametri se ne diraju. */
export const FILTER_KLJUCEVI = [
  "faza",
  "zaostali",
  "temp",
  "nisa",
  "grad",
  "sajt",
  "platforma",
  "koord",
  "tel",
  "dodir",
  "q",
] as const;

const TEMPERATURE: readonly Temperatura[] = ["nova_firma", "cold", "warm", "hot"];

const SAJT_VREDNOSTI: readonly SajtFilter[] = [
  "ima",
  "nema",
  "nepoznato",
  "ne_radi",
  "parkiran",
  "drustvene",
  "bez_https",
];

const PLATFORME: readonly PlatformaFilter[] = [
  "instagram",
  "facebook",
  "tiktok",
  "threads",
  "website",
];

const DODIRI: readonly DodirFilter[] = ["7d", "30d", "nikad"];

export const PRAZNI_FILTERI: LeadFilters = {
  faza: [],
  zaostali: false,
  temp: [],
  nisa: [],
  grad: [],
  sajt: [],
  platforma: [],
  koord: null,
  tel: null,
  dodir: [],
  q: "",
};

function citajListu(raw: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const deo of raw.split(",")) {
    const clean = deo.trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

function samoPoznate<T extends string>(
  vrednosti: string[],
  dozvoljene: readonly T[],
): T[] {
  return vrednosti.filter((x): x is T => (dozvoljene as readonly string[]).includes(x));
}

export function parseLeadFilters(params: URLSearchParams): LeadFilters {
  const telRaw = params.get("tel");
  // Plan piše prag kao „>=70"; u URL-u stoji goli broj, ali se stari oblik
  // i dalje čita da zalepljen link iz plana ne bi tiho izgubio filter.
  const telBroj = telRaw ? Number(telRaw.replace(/^>=/, "").trim()) : NaN;
  const koordRaw = params.get("koord");

  return {
    faza: samoPoznate(citajListu(params.get("faza")), ALL_STAGES),
    zaostali: params.get("zaostali") === "1",
    temp: samoPoznate(citajListu(params.get("temp")), TEMPERATURE),
    // Slug niše i naziv grada su podaci, ne šifarnik — provera je samo da
    // vrednost nije prazna. Nepostojeći slug prosto ne pogađa nijednu firmu.
    nisa: citajListu(params.get("nisa")),
    grad: citajListu(params.get("grad")),
    sajt: samoPoznate(citajListu(params.get("sajt")), SAJT_VREDNOSTI),
    platforma: samoPoznate(citajListu(params.get("platforma")), PLATFORME),
    koord: koordRaw === "da" || koordRaw === "ne" ? koordRaw : null,
    tel:
      Number.isFinite(telBroj) && telBroj >= 0 && telBroj <= 100
        ? Math.round(telBroj)
        : null,
    dodir: samoPoznate(citajListu(params.get("dodir")), DODIRI),
    q: params.get("q")?.trim() ?? "",
  };
}

/** Isti oblik nazad u `search` deo URL-a — bez vodećeg „?". */
export function filtersToQuery(filters: LeadFilters): string {
  const p = new URLSearchParams();
  if (filters.faza.length) p.set("faza", filters.faza.join(","));
  if (filters.zaostali) p.set("zaostali", "1");
  if (filters.temp.length) p.set("temp", filters.temp.join(","));
  if (filters.nisa.length) p.set("nisa", filters.nisa.join(","));
  if (filters.grad.length) p.set("grad", filters.grad.join(","));
  if (filters.sajt.length) p.set("sajt", filters.sajt.join(","));
  if (filters.platforma.length) p.set("platforma", filters.platforma.join(","));
  if (filters.koord) p.set("koord", filters.koord);
  if (filters.tel !== null) p.set("tel", String(filters.tel));
  if (filters.dodir.length) p.set("dodir", filters.dodir.join(","));
  if (filters.q) p.set("q", filters.q);
  return p.toString();
}

/** Koliko grupa filtera je aktivno — broj koji piše u sklopljenoj traci. */
export function brojAktivnihGrupa(filters: LeadFilters): number {
  let n = 0;
  if (filters.faza.length) n++;
  if (filters.zaostali) n++;
  if (filters.temp.length) n++;
  if (filters.nisa.length) n++;
  if (filters.grad.length) n++;
  if (filters.sajt.length) n++;
  if (filters.platforma.length) n++;
  if (filters.koord) n++;
  if (filters.tel !== null) n++;
  if (filters.dodir.length) n++;
  if (filters.q) n++;
  return n;
}

/**
 * Argumenti za `listLeadsFiltered` / `countLeadsByFacet`. Prazna grupa se ne
 * šalje kao prazan niz nego se izostavlja: „filter nije zadat" i „filter je
 * zadat, ali bez ijedne vrednosti" nisu isto pitanje.
 */
export function filtersToArgs(filters: LeadFilters) {
  return {
    faza: filters.faza.length ? filters.faza : undefined,
    zaostali: filters.zaostali ? true : undefined,
    temp: filters.temp.length ? filters.temp : undefined,
    nisa: filters.nisa.length ? filters.nisa : undefined,
    grad: filters.grad.length ? filters.grad : undefined,
    sajt: filters.sajt.length ? filters.sajt : undefined,
    platforma: filters.platforma.length ? filters.platforma : undefined,
    koord: filters.koord ?? undefined,
    tel: filters.tel ?? undefined,
    dodir: filters.dodir.length ? filters.dodir : undefined,
    q: filters.q || undefined,
  };
}

export function useLeadFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = useMemo(
    () => parseLeadFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const upisi = useCallback(
    (sledeci: LeadFilters) => {
      // Parametri koji nisu naši (npr. `?import=`) se prenose netaknuti —
      // filter traka nije vlasnik cele adrese.
      const p = new URLSearchParams(searchParams.toString());
      for (const kljuc of FILTER_KLJUCEVI) p.delete(kljuc);
      const nas = new URLSearchParams(filtersToQuery(sledeci));
      for (const [k, val] of nas.entries()) p.set(k, val);
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  const toggle = useCallback(
    (grupa: MultiGrupa, vrednost: string) => {
      const trenutne = filters[grupa] as string[];
      const sledece = trenutne.includes(vrednost)
        ? trenutne.filter((x) => x !== vrednost)
        : [...trenutne, vrednost];
      upisi({ ...filters, [grupa]: sledece } as LeadFilters);
    },
    [filters, upisi],
  );

  const setZaostali = useCallback(
    (value: boolean) => upisi({ ...filters, zaostali: value }),
    [filters, upisi],
  );

  const setKoord = useCallback(
    (value: "da" | "ne" | null) => upisi({ ...filters, koord: value }),
    [filters, upisi],
  );

  const setTel = useCallback(
    (value: number | null) => upisi({ ...filters, tel: value }),
    [filters, upisi],
  );

  const setQ = useCallback(
    (value: string) => upisi({ ...filters, q: value.trim() }),
    [filters, upisi],
  );

  const clearGroup = useCallback(
    (grupa: keyof LeadFilters) => {
      const prazna = PRAZNI_FILTERI[grupa];
      upisi({ ...filters, [grupa]: prazna } as LeadFilters);
    },
    [filters, upisi],
  );

  const clearAll = useCallback(() => upisi(PRAZNI_FILTERI), [upisi]);

  /** Otvara sačuvan preset — preset JE query string, ne kopija stanja. */
  const applyQuery = useCallback(
    (qs: string) => {
      upisi(parseLeadFilters(new URLSearchParams(qs.replace(/^\?/, ""))));
    },
    [upisi],
  );

  const queryString = useMemo(() => filtersToQuery(filters), [filters]);
  const args = useMemo(() => filtersToArgs(filters), [filters]);
  const aktivnihGrupa = useMemo(() => brojAktivnihGrupa(filters), [filters]);

  return {
    filters,
    args,
    queryString,
    aktivnihGrupa,
    toggle,
    setZaostali,
    setKoord,
    setTel,
    setQ,
    clearGroup,
    clearAll,
    applyQuery,
  };
}
