import { describe, expect, test } from "vitest";
import {
  OZNAKA_STATUSA,
  adresaVeze,
  brojVezaRecenica,
  podaciSuStari,
  porukaStatusa,
  statusVeze,
  statusiIzRedova,
  zbirStatusa,
  type RedStatusa,
  type UlazStatusa,
} from "../convex/lib/statusVeze";
import { napraviZadatke, type Snimak } from "../convex/lib/notifications";
import { TOKEN_EXPIRY_WARNING_MS } from "./token-expiry";
import { prikaziBanerDozvole } from "../convex/lib/igPublish";

const SAT = 60 * 60 * 1000;
const DAN = 24 * SAT;
const SADA = 1_760_000_000_000;

/** Zdrava veza: aktivna, prolaz pre sat vremena uspeo, token daleko. */
function ulaz(izmene: Partial<UlazStatusa> = {}): UlazStatusa {
  return {
    provider: "meta_ig",
    status: "active",
    expiresAt: SADA + 40 * DAN,
    lastSyncAt: SADA - SAT,
    poslednjiProlaz: { status: "ok", startedAt: SADA - SAT - 5000, finishedAt: SADA - SAT },
    serverPodesen: true,
    poslednjiUspeh: SADA - SAT,
    ...izmene,
  };
}

function status(izmene: Partial<UlazStatusa> = {}) {
  const u = ulaz(izmene);
  return statusVeze(u.provider, u, SADA);
}

describe("statusVeze — jedan status po vezi (P3)", () => {
  test("radi: povezano, prolaz uspeo, token daleko, podaci sveži", () => {
    const s = status();
    expect(s.vrednost).toBe("radi");
    expect(s.razlog).toBeNull();
    expect(s.podaciOd).toBe(SADA - SAT);
    expect(porukaStatusa(s, SADA)).toEqual({ recenica: "Instagram radi", radnja: null });
  });

  test("nije povezano: nema reda veze — nije kvar", () => {
    const s = statusVeze("youtube", null, SADA);
    expect(s.vrednost).toBe("nije_povezano");
    expect(s.razlog).toBeNull();
    expect(porukaStatusa(s, SADA)).toEqual({
      recenica: "YouTube nije povezan",
      radnja: { oznaka: "Poveži", href: "/settings?tab=integracije#integracija-youtube" },
    });
  });

  test("veza u prekidu je „nije povezano“, sa razlogom i bez radnje", () => {
    const s = status({ status: "disconnecting" });
    expect(s.vrednost).toBe("nije_povezano");
    expect(s.razlog).toBe("brisanje_u_toku");
    expect(porukaStatusa(s, SADA).radnja).toBeNull();
  });

  test("istekao token (status expired) traži ponovno povezivanje", () => {
    const s = status({ status: "expired", expiresAt: SADA - 3 * DAN, lastSyncAt: SADA - 3 * DAN });
    expect(s.vrednost).toBe("trazi_paznju");
    expect(s.razlog).toBe("token_istekao");
    expect(porukaStatusa(s, SADA)).toEqual({
      recenica: "Instagram: pristup je istekao pre 3 dana",
      radnja: { oznaka: "Poveži ponovo", href: adresaVeze("meta_ig") },
    });
  });

  test("istekao token bez datuma ne izmišlja trajanje", () => {
    const s = status({ status: "expired", expiresAt: undefined });
    expect(porukaStatusa(s, SADA).recenica).toBe("Instagram: pristup je istekao");
  });

  test("token čiji je datum prošao je istekao i kad veza još kaže active", () => {
    expect(status({ expiresAt: SADA - SAT }).razlog).toBe("token_istekao");
  });

  test("ističe za ≤ 7 dana traži pažnju; 8 dana radi", () => {
    const s = status({ expiresAt: SADA + 5 * DAN });
    expect(s.vrednost).toBe("trazi_paznju");
    expect(s.razlog).toBe("token_istice");
    expect(s.za).toBe(5);
    expect(porukaStatusa(s, SADA)).toEqual({
      recenica: "Instagram: pristup ističe za 5 dana",
      radnja: { oznaka: "Poveži ponovo", href: adresaVeze("meta_ig") },
    });
    expect(status({ expiresAt: SADA + 7 * DAN - SAT }).razlog).toBe("token_istice");
    expect(status({ expiresAt: SADA + 8 * DAN }).vrednost).toBe("radi");
    expect(TOKEN_EXPIRY_WARNING_MS).toBe(7 * DAN);
    expect(porukaStatusa(status({ expiresAt: SADA + 12 * SAT }), SADA).recenica).toBe(
      "Instagram: pristup ističe za 1 dan",
    );
  });

  test("pao prolaz posle poslednjeg uspeha traži pažnju i meri starost podataka", () => {
    const s = status({
      lastSyncAt: SADA - 2 * DAN,
      poslednjiUspeh: SADA - 2 * DAN,
      poslednjiProlaz: { status: "error", startedAt: SADA - 2 * SAT, finishedAt: SADA - SAT },
    });
    expect(s.vrednost).toBe("trazi_paznju");
    expect(s.razlog).toBe("pao_prolaz");
    expect(porukaStatusa(s, SADA)).toEqual({
      recenica: "Instagram ne sinhronizuje se 2 dana",
      radnja: { oznaka: "Sinhronizuj", href: adresaVeze("meta_ig") },
    });
  });

  test("pao prolaz posle kog je stiglo nešto svežije više nije kvar", () => {
    const s = status({
      lastSyncAt: SADA - 10 * 60 * 1000,
      poslednjiProlaz: { status: "error", startedAt: SADA - 2 * SAT, finishedAt: SADA - SAT },
    });
    expect(s.vrednost).toBe("radi");
  });

  test("veza koja nikad nije uspela ne dobija izmišljen broj dana", () => {
    const s = status({
      provider: "youtube",
      lastSyncAt: undefined,
      poslednjiUspeh: null,
      poslednjiProlaz: { status: "error", startedAt: SADA - 2 * DAN, finishedAt: SADA - 2 * DAN },
    });
    expect(porukaStatusa(s, SADA).recenica).toBe("YouTube nije nijednom sinhronizovan");
  });

  test("zastao prolaz (teče duže od 15 min) traži pažnju", () => {
    const s = status({
      poslednjiProlaz: { status: "running", startedAt: SADA - 40 * 60 * 1000 },
    });
    expect(s.razlog).toBe("zastao");
  });

  test("podaci stariji od 24 h traže pažnju; „podaci od“ stoji uz broj", () => {
    const s = status({
      lastSyncAt: SADA - 30 * SAT,
      poslednjiUspeh: SADA - 30 * SAT,
      poslednjiProlaz: { status: "ok", startedAt: SADA - 30 * SAT, finishedAt: SADA - 30 * SAT },
    });
    expect(s.vrednost).toBe("trazi_paznju");
    expect(s.razlog).toBe("stari_podaci");
    expect(podaciSuStari(s, SADA)).toBe(true);
    expect(porukaStatusa(s, SADA).recenica).toBe("Instagram: nema novih podataka 1 dan");
    expect(podaciSuStari(status(), SADA)).toBe(false);
  });

  test("Threads se sinhronizuje jednom dnevno: 30 h radi, 50 h traži pažnju", () => {
    const threads = (sati: number) =>
      status({
        provider: "threads",
        lastSyncAt: SADA - sati * SAT,
        poslednjiProlaz: { status: "ok", startedAt: SADA - sati * SAT, finishedAt: SADA - sati * SAT },
      });
    expect(threads(30).vrednost).toBe("radi");
    // „podaci od …" ipak stoji uz broj: natpis je činjenica, ne kvar.
    expect(podaciSuStari(threads(30), SADA)).toBe(true);
    expect(threads(50).razlog).toBe("stari_podaci");
  });

  test("podatak upisan malim prolazom (lastDataAt) čini podatke svežim", () => {
    const s = status({
      lastSyncAt: SADA - 30 * SAT,
      poslednjiProlaz: { status: "ok", startedAt: SADA - 30 * SAT, finishedAt: SADA - 30 * SAT },
      poslednjiPodatak: SADA - 5 * 60 * 1000,
    });
    expect(s.vrednost).toBe("radi");
    expect(s.podaciOd).toBe(SADA - 5 * 60 * 1000);
  });

  test("server nije podešen traži pažnju pre svega ostalog", () => {
    const s = status({ serverPodesen: false, status: "expired" });
    expect(s.razlog).toBe("server_nije_podesen");
    expect(porukaStatusa(s, SADA)).toEqual({
      recenica: "Instagram nije podešen na serveru",
      radnja: { oznaka: "Otvori uputstvo", href: adresaVeze("meta_ig") },
    });
    // Ženski rod naziva menja glagol.
    const fb = statusVeze("meta_fb", { ...ulaz({ serverPodesen: false }), provider: "meta_fb" }, SADA);
    expect(porukaStatusa(fb, SADA).recenica).toBe("Facebook stranica nije podešena na serveru");
    // `null` = ne proverava se, pa ne smeta.
    expect(status({ serverPodesen: null }).vrednost).toBe("radi");
  });

  test("greška veze bez ijednog prolaza traži pažnju", () => {
    const s = status({ status: "error", poslednjiProlaz: null });
    expect(s.razlog).toBe("greska_veze");
  });

  test("rečenica nikad ne nosi tehnički kod greške", () => {
    const s = status({ status: "expired" });
    expect(porukaStatusa(s, SADA).recenica).not.toMatch(/OAuth|190|Exception/);
  });
});

describe("zbir i redovi upita", () => {
  const red = (r: Partial<RedStatusa> & Pick<RedStatusa, "provider">): RedStatusa => ({
    status: "active",
    expiresAt: null,
    lastSyncAt: SADA - SAT,
    poslednjiProlaz: { status: "ok", startedAt: SADA - SAT, finishedAt: SADA - SAT },
    poslednjiPodatak: null,
    serverPodesen: null,
    poslednjiUspeh: SADA - SAT,
    ...r,
  });

  test("statusi idu redom Podešavanja; nepovezani kanali ne boje zbir", () => {
    const statusi = statusiIzRedova(
      [
        red({ provider: "ga4" }),
        red({ provider: "meta_ig", status: "expired", expiresAt: SADA - DAN }),
        red({ provider: "meta_fb", expiresAt: SADA + 5 * DAN }),
        red({ provider: "leads" }),
      ],
      SADA,
    );
    expect(statusi.map((s) => s.provider)).toEqual([
      "ga4",
      "openreply",
      "meta_ig",
      "meta_fb",
      "threads",
      "meta_ads",
      "google_ads",
      "youtube",
    ]);
    const zbir = zbirStatusa(statusi);
    expect(zbir).toEqual({
      radi: 1,
      traziPaznju: 2,
      nijePovezano: 5,
      prvaPaznja: "meta_ig",
      prvaNepovezana: "openreply",
    });
  });

  test("google_business ulazi samo kad je povezan", () => {
    const sa = statusiIzRedova([red({ provider: "google_business" })], SADA);
    expect(sa.map((s) => s.provider)).toContain("google_business");
    expect(statusiIzRedova([], SADA).map((s) => s.provider)).not.toContain("google_business");
  });

  test("broj veza u rečenici", () => {
    expect(brojVezaRecenica(1)).toBe("1 veza traži pažnju");
    expect(brojVezaRecenica(2)).toBe("2 veze traže pažnju");
    expect(brojVezaRecenica(5)).toBe("5 veza traži pažnju");
    expect(brojVezaRecenica(21)).toBe("21 veza traži pažnju");
    expect(OZNAKA_STATUSA.trazi_paznju).toBe("Traži pažnju");
  });
});

describe("ista veza, iste reči: tačka, kanal, Podešavanja i zvono", () => {
  test("zvono za svaku vezu koja traži pažnju piše rečenicu i radnju statusa", () => {
    const slucajevi: UlazStatusa[] = [
      ulaz({ status: "expired", expiresAt: SADA - 3 * DAN }),
      ulaz({ provider: "meta_fb", expiresAt: SADA + 5 * DAN }),
      ulaz({
        provider: "threads",
        lastSyncAt: SADA - 2 * DAN,
        poslednjiUspeh: SADA - 2 * DAN,
        poslednjiProlaz: { status: "error", startedAt: SADA - SAT, finishedAt: SADA - SAT },
      }),
      ulaz({ provider: "youtube", serverPodesen: false }),
    ];
    for (const u of slucajevi) {
      const s = statusVeze(u.provider, u, SADA);
      expect(s.vrednost).toBe("trazi_paznju");
      const poruka = porukaStatusa(s, SADA);

      const snimak = prazanSnimak();
      snimak.integracijeUKvaru = [
        {
          provider: s.provider,
          razlog: s.razlog as Exclude<typeof s.razlog, null | "brisanje_u_toku">,
          posledniUspehAt: s.poslednjiUspeh,
          primecenAt: SADA - SAT,
          ...(s.za !== undefined ? { za: s.za } : {}),
          istice: s.istice,
          podaciOd: s.podaciOd,
        },
      ];
      const [zadatak] = napraviZadatke(snimak);
      expect(zadatak.naslov).toBe(poruka.recenica);
      expect(zadatak.radnja).toBe(poruka.radnja?.oznaka);
      expect(zadatak.veza).toBe(poruka.radnja?.href);
      expect(zadatak.kljuc).toBe(`sinhronizacija.greska:${s.provider}`);
      expect(zadatak.bedz).toBe("/settings");
    }
  });
});

describe("kompozer: baner o dozvoli samo kad dozvola stvarno fali", () => {
  test("veza u redu i ima dozvolu → nema banera", () => {
    // Zdrava veza: status „radi", a Meta je odgovorila na pitanje o kvoti.
    expect(status().vrednost).toBe("radi");
    expect(prikaziBanerDozvole({ nedostajeOpseg: undefined, vezaNeRadi: false })).toBe(false);
    expect(prikaziBanerDozvole({ nedostajeOpseg: false, vezaNeRadi: false })).toBe(false);
    // Dok odgovor o kvoti ne stigne, baner se ne nagađa.
    expect(prikaziBanerDozvole({ nedostajeOpseg: null, vezaNeRadi: false })).toBe(false);
  });

  test("dozvola fali → baner; istekla ili nepovezana veza ima svoju poruku", () => {
    expect(prikaziBanerDozvole({ nedostajeOpseg: true, vezaNeRadi: false })).toBe(true);
    expect(prikaziBanerDozvole({ nedostajeOpseg: true, vezaNeRadi: true })).toBe(false);
  });
});

function prazanSnimak(): Snimak {
  return {
    now: SADA,
    pomerajMin: 0,
    uvoziUPregledu: [],
    uvoziSaNerazresenim: [],
    uvoziOdseceni: false,
    integracijeUKvaru: [],
    zaostaliKoraci: 0,
    zaostaliOdsecen: false,
    sastanciDanas: [],
    sastanciProsliBezIshoda: 0,
    nikadDodirnut: 0,
    ukupnoDodela: 0,
    dodeleOdsecene: false,
    bezTelefona: 0,
    ukupnoFirmi: 0,
    firmeOdsecene: false,
    bezProcene: 0,
    procenaOdsecena: false,
    neocenjenSajt: 0,
    kanali: [],
  };
}
