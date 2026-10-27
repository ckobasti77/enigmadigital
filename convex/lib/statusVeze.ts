/**
 * ============================================================================
 * JEDAN STATUS VEZE (P3 iz `docs/ULTRA-PLAN.md`, plan `docs/ultra/planovi/T03.md` §1)
 * ============================================================================
 *
 * Svaka veza ima tačno jedan status, i njega čitaju svi koji o vezi govore:
 * tačka u gornjoj traci, red stanja u zaglavlju kanala, „podaci od …" uz fokus
 * broj, Podešavanja → Integracije, pregled sinhronizacije na tabli i zvono.
 * Pre ovoga je jedna istekla veza istovremeno bila „Povezan ✓" na kanalu,
 * „Aktivno" u Podešavanjima, zelena tačka u traci i „Hitno" u zvonu.
 *
 *   Radi           povezano, poslednji prolaz uspeo, token ne ističe za 7
 *                  dana, podaci mlađi od praga (24 h; Threads 48 h, jer se
 *                  redovno sinhronizuje jednom dnevno);
 *   Traži pažnju   server nije podešen, token istekao ili ističe za ≤ 7 dana,
 *                  veza javlja grešku, poslednji prolaz pao, prolaz zastao,
 *                  ili podaci stariji od praga — uvek sa razlogom i radnjom;
 *   Nije povezano  nema veze, ili je veza prekinuta i podaci se brišu. To nije
 *                  kvar i ne boji tačku.
 *
 * Čista funkcija: ne čita bazu ni sat. Pravila starosti i tokena su ona iz
 * `zdravljeVeza.ts` (hub i birač projekta), pa obe strane po konstrukciji daju
 * isti odgovor. Ulaz pravi `citajUlazeStatusa` (`vezeProjekta.ts`).
 *
 * Napomena o uvozu: ovaj modul uzima nazive i `trajanje` iz `notifications.ts`,
 * a `notifications.ts` uzima `porukaStatusa` odavde. Oba modula koriste uvezeno
 * samo unutar funkcija, nikad pri učitavanju, pa je kružni uvoz bezbedan.
 */

import type { Provider } from "./providers";
import {
  INTEGRACIJA_NAZIV,
  mnozina,
  trajanje,
  type IntegracijaUKvaru,
} from "./notifications";
import {
  PODACI_STARI_MS,
  razlogZdravlja,
  type RazlogZdravlja,
  type VezaZaZdravlje,
} from "./zdravljeVeza";

export type VrednostStatusa = "radi" | "trazi_paznju" | "nije_povezano";

/** Razlozi za „Traži pažnju", po redu provere. */
export type RazlogPaznje =
  | "server_nije_podesen"
  | "token_istekao"
  | "greska_veze"
  | "pao_prolaz"
  | "token_istice"
  | "zastao"
  | "stari_podaci";

export type RazlogStatusa = RazlogPaznje | "brisanje_u_toku";

export type UlazStatusa = VezaZaZdravlje & {
  provider: Provider;
  /**
   * `false` = server nema podešavanje bez kog veza ne može da radi; `null` =
   * za tog provajdera se to ne proverava.
   */
  serverPodesen: boolean | null;
  /** Kraj poslednjeg USPEŠNOG prolaza; `null` = nikad (nije isto što i „davno"). */
  poslednjiUspeh: number | null;
};

export type StatusVeze = {
  provider: Provider;
  vrednost: VrednostStatusa;
  razlog: RazlogStatusa | null;
  /** Dani do isteka tokena ili sati bez podataka, za rečenicu. */
  za?: number;
  /** Kada su podaci poslednji put postali svežiji; `null` = nikad. */
  podaciOd: number | null;
  /** Kada token ističe; `null` = ne ističe ili se ne zna. */
  istice: number | null;
  poslednjiUspeh: number | null;
};

/**
 * Veze o kojima status govori, redom kao u Podešavanjima. `google_business`
 * ulazi samo kad je povezan (nema karticu u Podešavanjima); `leads` nije veza
 * koju vlasnik održava (ulaz skilla), pa ne ulazi nikad.
 */
export const PROVAJDERI_STATUSA: readonly Provider[] = [
  "ga4",
  "openreply",
  "meta_ig",
  "meta_fb",
  "threads",
  "meta_ads",
  "google_ads",
  "youtube",
];

/** Spisak provajdera za koje se računa status, uz ulaze koje upit vrati. */
export function provajderiStatusa(ulazi: readonly { provider: Provider }[]): Provider[] {
  const out = [...PROVAJDERI_STATUSA];
  if (ulazi.some((u) => u.provider === "google_business")) out.push("google_business");
  return out;
}

/** Natpis „podaci od …" stoji uz broj kad su podaci stariji od ovoga (§5.1). */
export const PODACI_OD_PRAG_MS = PODACI_STARI_MS;

const RAZLOG_IZ_ZDRAVLJA: Record<RazlogZdravlja, RazlogPaznje> = {
  token_istekao: "token_istekao",
  token_istice: "token_istice",
  greska_veze: "greska_veze",
  pao_prolaz: "pao_prolaz",
  zastao: "zastao",
  stari_podaci: "stari_podaci",
};

function najnovije(...vrednosti: (number | undefined | null)[]): number | null {
  let best: number | null = null;
  for (const v of vrednosti) {
    if (v === undefined || v === null || v <= 0) continue;
    if (best === null || v > best) best = v;
  }
  return best;
}

export function statusVeze(
  provider: Provider,
  ulaz: UlazStatusa | null,
  sada: number,
): StatusVeze {
  if (ulaz === null) {
    return {
      provider,
      vrednost: "nije_povezano",
      razlog: null,
      podaciOd: null,
      istice: null,
      poslednjiUspeh: null,
    };
  }

  const prolaz = ulaz.poslednjiProlaz;
  const podaciOd = najnovije(
    ulaz.lastSyncAt,
    prolaz?.status === "ok" ? (prolaz.finishedAt ?? prolaz.startedAt) : null,
    ulaz.poslednjiPodatak,
  );
  const osnova = {
    provider,
    podaciOd,
    istice: ulaz.expiresAt ?? null,
    poslednjiUspeh: ulaz.poslednjiUspeh,
  };

  if (ulaz.status === "disconnecting") {
    return { ...osnova, vrednost: "nije_povezano", razlog: "brisanje_u_toku" };
  }
  if (ulaz.serverPodesen === false) {
    return { ...osnova, vrednost: "trazi_paznju", razlog: "server_nije_podesen" };
  }

  const z = razlogZdravlja(ulaz, sada);
  if (z.razlog === null) return { ...osnova, vrednost: "radi", razlog: null };
  return {
    ...osnova,
    vrednost: "trazi_paznju",
    razlog: RAZLOG_IZ_ZDRAVLJA[z.razlog],
    ...(z.za !== undefined ? { za: z.za } : {}),
  };
}

export type ZbirStatusa = {
  radi: number;
  traziPaznju: number;
  nijePovezano: number;
  /** Prva veza koja traži pažnju (redom kao u Podešavanjima). */
  prvaPaznja: Provider | null;
  /** Prva nepovezana veza, za „Poveži …" kad sve ostalo radi. */
  prvaNepovezana: Provider | null;
};

export function zbirStatusa(statusi: readonly StatusVeze[]): ZbirStatusa {
  const zbir: ZbirStatusa = {
    radi: 0,
    traziPaznju: 0,
    nijePovezano: 0,
    prvaPaznja: null,
    prvaNepovezana: null,
  };
  for (const s of statusi) {
    if (s.vrednost === "radi") zbir.radi++;
    else if (s.vrednost === "trazi_paznju") {
      zbir.traziPaznju++;
      zbir.prvaPaznja ??= s.provider;
    } else {
      zbir.nijePovezano++;
      if (s.razlog !== "brisanje_u_toku") zbir.prvaNepovezana ??= s.provider;
    }
  }
  return zbir;
}

// ── reči ─────────────────────────────────────────────────────────────────────

/** Naziv veze kakav stoji u rečenici („Instagram", „Facebook stranica"). */
export function nazivVeze(provider: Provider): string {
  return INTEGRACIJA_NAZIV[provider] ?? provider;
}

/** Nazivi ženskog roda („Facebook stranica", „Lead mašina") menjaju glagol. */
const ZENSKI_ROD: ReadonlySet<Provider> = new Set(["meta_fb", "leads"]);

function rod(provider: Provider, muski: string, zenski: string): string {
  return ZENSKI_ROD.has(provider) ? zenski : muski;
}

/** Sidro kartice veze u Podešavanjima; jedina adresa svih radnji statusa. */
export function adresaVeze(provider: Provider): string {
  return `/settings?tab=integracije#integracija-${provider}`;
}

/** „1 veza traži pažnju", „2 veze traže pažnju", „5 veza traži pažnju". */
export function brojVezaRecenica(broj: number): string {
  return `${broj} ${mnozina(broj, "veza traži", "veze traže", "veza traži")} pažnju`;
}

/**
 * Rečenica o vezi i jedna radnja — iste reči na svakom mestu. Tehnički kod
 * greške (npr. tekst koji je Meta vratila) ovde nikad ne ulazi; ostaje samo u
 * detaljima kartice u Podešavanjima. Datum „podaci od …" dodaje ekran, jer ga
 * zvono ne prikazuje.
 */
export function porukaStatusa(
  s: StatusVeze,
  sada: number,
): { recenica: string; radnja: { oznaka: string; href: string } | null } {
  const naziv = nazivVeze(s.provider);
  const href = adresaVeze(s.provider);
  const sinhronizuj = { oznaka: "Sinhronizuj", href };

  switch (s.razlog) {
    case null:
      return s.vrednost === "radi"
        ? { recenica: `${naziv} radi`, radnja: null }
        : {
            recenica: `${naziv} ${rod(s.provider, "nije povezan", "nije povezana")}`,
            radnja: { oznaka: "Poveži", href },
          };
    case "brisanje_u_toku":
      return {
        recenica: `${naziv}: veza je prekinuta, brisanje podataka je u toku`,
        radnja: null,
      };
    case "server_nije_podesen":
      return {
        recenica: `${naziv} ${rod(s.provider, "nije podešen", "nije podešena")} na serveru`,
        radnja: { oznaka: "Otvori uputstvo", href },
      };
    case "token_istekao":
      return {
        recenica:
          s.istice !== null && s.istice <= sada
            ? `${naziv}: pristup je istekao pre ${trajanje(sada - s.istice)}`
            : `${naziv}: pristup je istekao`,
        radnja: { oznaka: "Poveži ponovo", href },
      };
    case "token_istice": {
      const dana = Math.max(1, s.za ?? 1);
      return {
        recenica: `${naziv}: pristup ističe za ${dana} ${mnozina(dana, "dan", "dana", "dana")}`,
        radnja: { oznaka: "Poveži ponovo", href },
      };
    }
    case "greska_veze":
    case "pao_prolaz":
    case "zastao":
      return {
        recenica:
          s.poslednjiUspeh === null
            ? `${naziv} ${rod(s.provider, "nije nijednom sinhronizovan", "nije nijednom sinhronizovana")}`
            : `${naziv} ne sinhronizuje se ${trajanje(Math.max(0, sada - s.poslednjiUspeh))}`,
        radnja: sinhronizuj,
      };
    case "stari_podaci":
      return {
        recenica:
          s.podaciOd === null
            ? `${naziv}: nema novih podataka`
            : `${naziv}: nema novih podataka ${trajanje(Math.max(0, sada - s.podaciOd))}`,
        radnja: sinhronizuj,
      };
  }
}

/** Kratka oznaka statusa („Radi", „Traži pažnju", „Nije povezano"). */
export const OZNAKA_STATUSA: Record<VrednostStatusa, string> = {
  radi: "Radi",
  trazi_paznju: "Traži pažnju",
  nije_povezano: "Nije povezano",
};

/** Da li uz broj treba „podaci od …": postoji podatak i stariji je od 24 h. */
export function podaciSuStari(s: StatusVeze, sada: number): boolean {
  return s.podaciOd !== null && sada - s.podaciOd > PODACI_OD_PRAG_MS;
}

// ── ulaz iz upita ────────────────────────────────────────────────────────────

/** Red koji vraća `statusVeza.lista` (Convex vraća `null`, ne `undefined`). */
export type RedStatusa = {
  provider: Provider;
  status: "active" | "error" | "expired" | "disconnecting";
  expiresAt: number | null;
  lastSyncAt: number | null;
  poslednjiProlaz: {
    status: "running" | "ok" | "error";
    startedAt: number;
    finishedAt: number | null;
  } | null;
  poslednjiPodatak: number | null;
  serverPodesen: boolean | null;
  poslednjiUspeh: number | null;
};

export function ulazIzReda(red: RedStatusa): UlazStatusa {
  return {
    provider: red.provider,
    status: red.status,
    ...(red.expiresAt !== null ? { expiresAt: red.expiresAt } : {}),
    ...(red.lastSyncAt !== null ? { lastSyncAt: red.lastSyncAt } : {}),
    ...(red.poslednjiPodatak !== null ? { poslednjiPodatak: red.poslednjiPodatak } : {}),
    poslednjiProlaz:
      red.poslednjiProlaz === null
        ? null
        : {
            status: red.poslednjiProlaz.status,
            startedAt: red.poslednjiProlaz.startedAt,
            ...(red.poslednjiProlaz.finishedAt !== null
              ? { finishedAt: red.poslednjiProlaz.finishedAt }
              : {}),
          },
    serverPodesen: red.serverPodesen,
    poslednjiUspeh: red.poslednjiUspeh,
  };
}

/** Status za svaki provajder sa spiska, iz redova upita. */
export function statusiIzRedova(
  redovi: readonly RedStatusa[],
  sada: number,
): StatusVeze[] {
  const poProvajderu = new Map(redovi.map((r) => [r.provider, r]));
  return provajderiStatusa(redovi).map((provider) => {
    const red = poProvajderu.get(provider);
    return statusVeze(provider, red ? ulazIzReda(red) : null, sada);
  });
}

/**
 * Veze koje traže pažnju, kao stavke zvona (`notifications.ts`, „Šta me
 * čeka"). Ista funkcija statusa, pa zvono ne može da kaže drugo nego tačka,
 * kanal i Podešavanja. Nepovezana veza i veza u prekidu nisu kvar.
 */
export function integracijeUKvaru(
  redovi: readonly RedStatusa[],
  sada: number,
): IntegracijaUKvaru[] {
  const poProvajderu = new Map(redovi.map((r) => [r.provider, r]));
  const out: IntegracijaUKvaru[] = [];
  for (const s of statusiIzRedova(redovi, sada)) {
    if (s.vrednost !== "trazi_paznju" || s.razlog === null) continue;
    if (s.razlog === "brisanje_u_toku") continue;
    const red = poProvajderu.get(s.provider);

    // Kada je kvar primećen: istek tokena, kraj neuspelog (ili početak
    // zaglavljenog) prolaza, trenutak poslednjeg podatka — inače sada.
    let primecenAt = sada;
    if (s.razlog === "token_istekao") {
      primecenAt = s.istice ?? red?.lastSyncAt ?? sada;
    } else if (
      s.razlog === "pao_prolaz" ||
      s.razlog === "zastao" ||
      s.razlog === "greska_veze"
    ) {
      const prolaz = red?.poslednjiProlaz ?? null;
      primecenAt = prolaz?.finishedAt ?? prolaz?.startedAt ?? red?.lastSyncAt ?? sada;
    } else if (s.razlog === "stari_podaci" && s.podaciOd !== null) {
      primecenAt = s.podaciOd;
    }

    out.push({
      provider: s.provider,
      razlog: s.razlog,
      posledniUspehAt: s.poslednjiUspeh,
      primecenAt: Math.min(primecenAt, sada),
      ...(s.za !== undefined ? { za: s.za } : {}),
      istice: s.istice,
      podaciOd: s.podaciOd,
    });
  }
  return out;
}
