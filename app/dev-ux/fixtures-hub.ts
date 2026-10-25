import { getFunctionName } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PROJEKTI_UX } from "./fixtures-projekti";
import { HOUR, DAY, WS, WS_KLIJENT, WS_SCANME, lcg, now, type Fixture, type R } from "./fixtures-util";

/**
 * Hub „Svi projekti“ u razvojnom prikazu (C16): brojke po projektu
 * (`hubStore.pregledProjekta`) i spisak projekata za 1, 3 ili 20+ projekata
 * (`/?ux=1&rezim=hub&projekata=1|22`).
 *
 * Tri projekta su ista kao u ostatku razvojnog prikaza: Enigma IT (povezana,
 * sa upozorenjem i jednom vezom u grešci), ScanMe (bez ijedne veze, pa je
 * skoro sve „—“) i Klijent d.o.o. (GA4 nije povezan). Ostali projekti (do 22)
 * su izmišljeni i deterministični; jedan od njih namerno pada, da se vidi red
 * u grešci.
 */

type Pregled = R<typeof api.hubStore.pregledProjekta>;
type Stavka = R<typeof api.projekti.mojiProjekti>[number];

const fn = getFunctionName;

/** Izmišljen projekat čiji upit brojki namerno pada (red u grešci). */
export const WS_PADA = "ws_ux_hub_pada_00000000000" as Id<"workspaces">;

function dana(args: Record<string, unknown>): number {
  const od = typeof args.od === "string" ? Date.parse(`${args.od}T00:00:00Z`) : NaN;
  const doDana = typeof args.do === "string" ? Date.parse(`${args.do}T00:00:00Z`) : NaN;
  if (!Number.isFinite(od) || !Number.isFinite(doDana)) return 7;
  return Math.max(1, Math.round((doDana - od) / DAY) + 1);
}

const NEPOVEZANO = { vrednost: null, razlog: "nije_povezano" } as const;

function enigma(args: Record<string, unknown>): Pregled {
  const d = dana(args);
  return {
    posete: { vrednost: Math.round(151 * d), razlog: null },
    noviLeadovi: { vrednost: Math.round(1.3 * d) + 1, razlog: null },
    upiti: { vrednost: 3, razlog: null },
    pratioci: {
      vrednost: 2904,
      razlog: null,
      promena: Math.round(1.5 * d),
      kanali: [
        { kanal: "instagram", vrednost: 2104 },
        { kanal: "facebook", vrednost: 800 },
      ],
    },
    oglasi: { vrednost: Math.round(11.2 * d * 100) / 100, razlog: null, valuta: "EUR" },
    poruke: { vrednost: 5, razlog: null },
    zdravlje: "greska",
    veze: [
      { provider: "ga4", stanje: "ok", razlog: null, lastSyncAt: now - 2 * HOUR, expiresAt: null, greska: null, kvota: null },
      {
        provider: "meta_ig",
        stanje: "upozorenje",
        razlog: "token_istice",
        za: 9,
        lastSyncAt: now - 3 * HOUR,
        expiresAt: now + 9 * DAY,
        greska: null,
        kvota: { stanje: "ok", vrsta: "procenat", potroseno: 12, granica: 100 },
      },
      { provider: "meta_fb", stanje: "ok", razlog: null, lastSyncAt: now - 3 * HOUR, expiresAt: null, greska: null, kvota: { stanje: "ok", vrsta: "procenat", potroseno: 12, granica: 100 } },
      {
        provider: "youtube",
        stanje: "greska",
        razlog: "pao_prolaz",
        lastSyncAt: now - 30 * HOUR,
        expiresAt: null,
        greska: "Dnevna YouTube kvota je potrošena (quotaExceeded).",
        kvota: { stanje: "greska", vrsta: "brojiva", potroseno: 4000, granica: 4000 },
      },
      { provider: "threads", stanje: "ok", razlog: null, lastSyncAt: now - 20 * HOUR, expiresAt: now + 50 * DAY, greska: null, kvota: null },
    ],
  };
}

const SCANME: Pregled = {
  posete: NEPOVEZANO,
  noviLeadovi: { vrednost: 12, razlog: null },
  upiti: { vrednost: 0, razlog: null },
  pratioci: { ...NEPOVEZANO, promena: null, kanali: [] },
  oglasi: { ...NEPOVEZANO, valuta: null },
  poruke: NEPOVEZANO,
  zdravlje: "bez_veza",
  veze: [],
};

const KLIJENT: Pregled = {
  posete: NEPOVEZANO,
  noviLeadovi: { vrednost: 4, razlog: null },
  upiti: { vrednost: 0, razlog: null },
  pratioci: { vrednost: 860, razlog: null, promena: 12, kanali: [{ kanal: "instagram", vrednost: 860 }] },
  oglasi: { ...NEPOVEZANO, valuta: null },
  poruke: { vrednost: 0, razlog: null },
  zdravlje: "ok",
  veze: [
    { provider: "meta_ig", stanje: "ok", razlog: null, lastSyncAt: now - HOUR, expiresAt: now + 40 * DAY, greska: null, kvota: null },
  ],
};

/** Izmišljen projekat broj `i` (od 4 do 22), deterministično. */
function izmisljen(i: number, args: Record<string, unknown>): Pregled {
  const r = lcg(1000 + i);
  const d = dana(args);
  const imaGa4 = r() > 0.3;
  const imaIg = r() > 0.4;
  const imaOglase = r() > 0.6;
  const stanje = r();
  const zdravlje: "ok" | "upozorenje" = stanje > 0.85 ? "upozorenje" : "ok";
  return {
    posete: imaGa4 ? { vrednost: Math.round((20 + r() * 300) * d), razlog: null } : NEPOVEZANO,
    noviLeadovi: { vrednost: Math.floor(r() * 3 * d), razlog: null },
    upiti: { vrednost: Math.floor(r() * 3), razlog: null },
    pratioci: imaIg
      ? {
          vrednost: Math.round(300 + r() * 9000),
          razlog: null,
          promena: Math.round((r() - 0.3) * 40),
          kanali: [{ kanal: "instagram", vrednost: Math.round(300 + r() * 9000) }],
        }
      : { ...NEPOVEZANO, promena: null, kanali: [] },
    oglasi: imaOglase
      ? { vrednost: Math.round(r() * 40 * d * 100) / 100, razlog: null, valuta: "RSD" }
      : { ...NEPOVEZANO, valuta: null },
    poruke: imaIg ? { vrednost: Math.floor(r() * 6), razlog: null } : NEPOVEZANO,
    zdravlje: imaGa4 || imaIg ? zdravlje : "bez_veza",
    veze: [
      ...(imaGa4
        ? [
            {
              provider: "ga4" as const,
              stanje: zdravlje,
              razlog: zdravlje === "upozorenje" ? ("stari_podaci" as const) : null,
              ...(zdravlje === "upozorenje" ? { za: 31 } : {}),
              lastSyncAt: now - (zdravlje === "upozorenje" ? 31 : 2) * HOUR,
              expiresAt: null,
              greska: null,
              kvota: null,
            },
          ]
        : []),
      ...(imaIg
        ? [{ provider: "meta_ig" as const, stanje: "ok" as const, razlog: null, lastSyncAt: now - HOUR, expiresAt: null, greska: null, kvota: null }]
        : []),
    ],
  };
}

const IMENA = [
  "Pekara Đorđević", "Studio Lumen", "Auto centar Mitić", "Kafić Lipa", "Hotel Zlatibor Vista",
  "Salon Bella", "Restoran Dva jelena", "Frizerski studio Ana", "Turistička agencija Sever",
  "Butik Linea", "Apoteka Zdravlje", "Teretana Forma", "Vinarija Brdo", "Pivnica Kod Mike",
  "Dečji vrtić Sunce", "Stomatolog Dr Ilić", "Cvećara Ruža", "Pet shop Šapa", "Optika Vid",
];

function slugOd(ime: string): string {
  return ime
    .toLowerCase()
    .replace(/đ/g, "dj")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const BOJE = ["#38bdf8", "#22c55e", "#a78bfa", "#f472b6", "#2dd4bf", "#60a5fa", null];

/** Spisak projekata za `projekata=N`: prva tri iz fiksture, ostali izmišljeni. */
export function projektiUx(n: number): Stavka[] {
  const prvi = PROJEKTI_UX.slice(0, Math.max(1, Math.min(3, n)));
  const out: Stavka[] = [...prvi];
  for (let i = 4; i <= n; i++) {
    const ime = IMENA[(i - 4) % IMENA.length];
    out.push({
      workspaceId: (i === 7 ? WS_PADA : `ws_ux_hub_${String(i).padStart(2, "0")}_000000000000`) as Id<"workspaces">,
      slug: slugOd(ime),
      ime,
      kratkoIme: null,
      boja: BOJE[i % BOJE.length],
      logoUrl: null,
      uloga: i % 5 === 0 ? "urednik" : "owner",
      vrsta: i % 4 === 0 ? "klijent" : "interni",
      arhiviran: false,
      redosled: i,
      moduli: null,
    });
  }
  // Jedan arhiviran projekat uz pun spisak: grupa „Arhivirani“ ispod.
  if (n > 3) {
    out.push({
      workspaceId: "ws_ux_hub_arhiv_00000000000" as Id<"workspaces">,
      slug: "stari-sajt",
      ime: "Stari sajt",
      kratkoIme: null,
      boja: null,
      logoUrl: null,
      uloga: "owner",
      vrsta: "interni",
      arhiviran: true,
      redosled: null,
      moduli: null,
    });
  }
  return out;
}

export function pregledUx(args: Record<string, unknown>): Pregled {
  const ws = args.workspaceId;
  if (ws === WS || ws === undefined) return enigma(args);
  if (ws === WS_SCANME) return SCANME;
  if (ws === WS_KLIJENT) return KLIJENT;
  if (ws === WS_PADA) {
    throw new Error("Razvojni prikaz: brojke ovog projekta namerno padaju");
  }
  const m = typeof ws === "string" ? /^ws_ux_hub_(\d+)_/.exec(ws) : null;
  return izmisljen(m ? Number(m[1]) : 4, args);
}

export const FIXTURES_HUB: Record<string, Fixture> = {
  [fn(api.hubStore.pregledProjekta)]: (args) => pregledUx(args),
};
