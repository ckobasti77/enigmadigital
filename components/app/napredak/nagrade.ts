import { pluralSr } from "@/lib/format";

/**
 * ============================================================================
 * ŠTA SE PALI KAD SE NAPREDAK PROMENI (UI Boost §6.9)
 * ============================================================================
 *
 * Čista funkcija, bez React-a i bez Convex-a: prima stanje koje je upravo
 * stiglo i ono što je već viđeno, vraća šta treba pokazati i šta javiti
 * serveru kao viđeno. `useNapredakFeedback` je samo crta.
 *
 * Odvojena je zato što se hook ne može pokrenuti bez prave baze — a ovo jeste
 * mesto na kom bi greška značila toast za radnju koja se nije desila ili
 * proslavu koja se ponavlja. `npm run verify:napredak` je gađa direktno.
 *
 * PRAVILA:
 *   1. Prvi odgovor ne pali +XP ni za šta: sve što je već u `poslednji` je
 *      viđeno. Proslave su izuzetak — server ih šalje baš zato što NISU viđene.
 *   2. Misiju i bonus javljaju proslave; isti događaj u `poslednji` se preskače,
 *      da ne dođu dva toasta za jednu stvar.
 *   3. Tri i više novih događaja odjednom je jedan zbirni toast.
 *   4. Skriven tab: +XP se tiho upiše kao viđen (bio bi star kad se čovek
 *      vrati), a proslave ČEKAJU — ne troše se dok ih niko ne gleda.
 *   5. Stanje koje nije spremno ne pali ništa (XP je tada donja granica).
 */

export type Rang = "bronze" | "silver" | "gold" | "platinum" | "diamond";

/** Ono što funkcija čita iz `napredak.stanje` (uključen oblik). */
export type StanjeZaNagrade = {
  spremno: boolean;
  nivo: { broj: number; zvanje: string; rang: Rang };
  poslednji: ReadonlyArray<{
    id: string;
    vrsta: string;
    naslov: string;
    xp: number;
  }>;
  proslave: ReadonlyArray<{
    kljuc: string;
    vrsta: "misija" | "bonus" | "nivo" | "dostignuce";
    naslov: string;
    xp: number | null;
  }>;
};

export type NagradaToast = {
  id: string;
  title: string;
  xp?: number;
  tone: "xp" | "achievement";
  /** Koliko stoji; bez vrednosti važi podrazumevano za ton (2,5 s za +XP). */
  duration?: number;
  /** Po čemu se bira ikonica: vrsta događaja, ključ misije ili dostignuća. */
  ikona: { tip: "dogadjaj" | "misija" | "dostignuce" | "zbir"; kljuc: string };
};

export type NovNivo = { kljuc: string; level: number; rank: string; tier: Rang };

/** Šta je već viđeno u ovoj sesiji. Funkcija ga dopunjava. */
export type PamcenjeNagrada = {
  /** `null` dok ne stigne prvi spreman odgovor. */
  vidjeni: Set<string> | null;
  prikazane: Set<string>;
};

export function novoPamcenje(): PamcenjeNagrada {
  return { vidjeni: null, prikazane: new Set() };
}

/** Preko ovoliko novih događaja u jednom odgovoru ide jedan zbirni toast. */
export const ZBIRNO_OD = 3;
/** Misija, bonus i dostignuće stoje duže od običnog +XP. */
export const DUZE_MS = 4000;

export function izdvojiNagrade(
  stanje: StanjeZaNagrade,
  pamcenje: PamcenjeNagrada,
  vidljivo: boolean,
): { toasts: NagradaToast[]; nivo: NovNivo | null; potvrdi: string[] } {
  const toasts: NagradaToast[] = [];
  if (!stanje.spremno) return { toasts, nivo: null, potvrdi: [] };

  // ── +XP za nove događaje ───────────────────────────────────────────────────
  const novi: Array<StanjeZaNagrade["poslednji"][number]> = [];
  if (pamcenje.vidjeni === null) {
    pamcenje.vidjeni = new Set(stanje.poslednji.map((p) => p.id));
  } else {
    for (const p of stanje.poslednji) {
      if (pamcenje.vidjeni.has(p.id)) continue;
      pamcenje.vidjeni.add(p.id);
      if (p.vrsta === "misija" || p.vrsta === "bonus" || p.xp <= 0) continue;
      novi.push(p);
    }
  }

  if (vidljivo && novi.length >= ZBIRNO_OD) {
    toasts.push({
      id: `zbir:${novi[0].id}`,
      title: `${novi.length} ${pluralSr(novi.length, "radnja", "radnje", "radnji")}`,
      xp: novi.reduce((zbir, p) => zbir + p.xp, 0),
      tone: "xp",
      ikona: { tip: "zbir", kljuc: "" },
    });
  } else if (vidljivo) {
    // `poslednji` je najnovije-prvo; toastovi se slažu redom kojim se desilo.
    for (const p of [...novi].reverse()) {
      toasts.push({
        id: p.id,
        title: p.naslov,
        xp: p.xp,
        tone: "xp",
        ikona: { tip: "dogadjaj", kljuc: p.vrsta },
      });
    }
  }

  // ── proslave: zarađeno, a još neviđeno ─────────────────────────────────────
  const potvrdi: string[] = [];
  let nivo: NovNivo | null = null;
  if (vidljivo) {
    for (const p of stanje.proslave) {
      if (pamcenje.prikazane.has(p.kljuc)) continue;
      pamcenje.prikazane.add(p.kljuc);
      potvrdi.push(p.kljuc);

      if (p.vrsta === "nivo") {
        nivo = {
          kljuc: p.kljuc,
          level: stanje.nivo.broj,
          rank: stanje.nivo.zvanje,
          tier: stanje.nivo.rang,
        };
      } else if (p.vrsta === "dostignuce") {
        toasts.push({
          id: p.kljuc,
          title: `Novo dostignuće: ${p.naslov}`,
          tone: "achievement",
          duration: DUZE_MS,
          ikona: { tip: "dostignuce", kljuc: p.kljuc.slice("dostignuce:".length) },
        });
      } else if (p.vrsta === "bonus") {
        toasts.push({
          id: p.kljuc,
          title: "Dnevni bonus · sve tri misije",
          xp: p.xp ?? undefined,
          tone: "xp",
          duration: DUZE_MS,
          ikona: { tip: "dogadjaj", kljuc: "bonus" },
        });
      } else {
        toasts.push({
          id: p.kljuc,
          title: `Misija završena · ${p.naslov}`,
          xp: p.xp ?? undefined,
          tone: "xp",
          duration: DUZE_MS,
          ikona: { tip: "misija", kljuc: p.kljuc.split(":")[2] ?? "" },
        });
      }
    }
  }

  return { toasts, nivo, potvrdi };
}
