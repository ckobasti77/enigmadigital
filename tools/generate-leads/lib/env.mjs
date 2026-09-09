/**
 * ============================================================================
 * PROMENLJIVE OKRUŽENJA (plan §10.1)
 * ============================================================================
 *
 * Četiri promenljive žive na Jovanovoj mašini (user-level), nikad u repou i
 * nikad u `SKILL.md` (§0 pravilo 12).
 *
 * IMENUJE SE PROMENLJIVA KOJA FALI, NIKAD VREDNOST ONE KOJA POSTOJI. Poruka
 * „ENIGMA_INGEST_TOKEN nije postavljen" je pomoć; ispis vrednosti bi bio
 * curenje tokena u terminal, u istoriju komandi i u izveštaj.
 *
 * Svaka komanda traži SAMO ono što joj treba: `score` i `self-test` rade bez
 * ijednog ključa, pa nema razloga da staju zbog Places ključa koji neće zvati.
 * Sve četiri zajedno proverava komanda `proveri-env`, koju skill zove na
 * početku toka.
 */

export const PROMENLJIVE = {
  GOOGLE_PLACES_API_KEY: {
    cemu: "Places Text Search (otkrivanje kandidata)",
    gde: "Google Cloud → APIs & Services → Credentials",
  },
  ENIGMA_INGEST_TOKEN: {
    cemu: "Bearer token za slanje u aplikaciju",
    gde: "digital.enigmait.rs → Podešavanja → Pristup → Tokeni za uvoz",
  },
  ENIGMA_INGEST_URL: {
    cemu: "adresa ingest rute",
    // EU deployment ima region u hostu: `<deployment>.eu-west-1.convex.site`.
    // Bez regiona `<deployment>.convex.site` vraća 404. Tačan host: Convex
    // dashboard → Settings → URL & Deploy Key → HTTP Actions URL.
    gde:
      "https://<deployment>.convex.site/generate-leads/ingest ILI (EU region) " +
      "https://<deployment>.eu-west-1.convex.site/generate-leads/ingest — tačan " +
      "host je HTTP Actions URL u Convex dashboardu (Settings → URL & Deploy Key)",
  },
  ENIGMA_CONTACT_EMAIL: {
    cemu: "kontakt u User-Agent zaglavlju (Nominatim i provera sajtova)",
    gde: "tvoj poslovni email",
  },
  // GL10 (sajt-ocena-plan.md §1.1, §7): Lighthouse preko PageSpeed Insights.
  // Bez ključa PSI radi sa anonimnom kvotom koja se potroši za desetak
  // poziva, pa je ključ obavezan za `audit-site`; ostale komande ga ne traže.
  PAGESPEED_API_KEY: {
    cemu: "PageSpeed Insights API (Lighthouse za ocenu sajta)",
    gde:
      `Google Cloud → APIs & Services → Library → „PageSpeed Insights API" → Enable → ` +
      "Credentials → nov ključ ograničen na taj API (Places ključ se ne deli)",
  },
};

export class EnvGreska extends Error {
  constructor(nedostaju) {
    const spisak = nedostaju
      .map((ime) => `  ${ime} — ${PROMENLJIVE[ime].cemu}\n      gde se uzima: ${PROMENLJIVE[ime].gde}`)
      .join("\n");
    super(
      `Nedostaju promenljive okruženja:\n${spisak}\n\n` +
        "Postavi ih (PowerShell, jednom, pa otvori NOVI prozor):\n" +
        '  [Environment]::SetEnvironmentVariable("IME", "<vrednost>", "User")',
    );
    this.name = "EnvGreska";
    this.nedostaju = nedostaju;
  }
}

/**
 * Vraća tražene promenljive ili baca `EnvGreska` sa imenima onih koje fale.
 *
 * @param {string[]} imena
 * @returns {Record<string, string>}
 */
export function trazi(imena) {
  const vrednosti = {};
  const nedostaju = [];

  for (const ime of imena) {
    const vrednost = process.env[ime];
    if (typeof vrednost !== "string" || vrednost.trim().length === 0) {
      nedostaju.push(ime);
      continue;
    }
    vrednosti[ime] = vrednost.trim();
  }

  if (nedostaju.length > 0) throw new EnvGreska(nedostaju);
  return vrednosti;
}

/** Postoji li promenljiva — bez čitanja vrednosti. Za `proveri-env`. */
export function postoji(ime) {
  const vrednost = process.env[ime];
  return typeof vrednost === "string" && vrednost.trim().length > 0;
}
