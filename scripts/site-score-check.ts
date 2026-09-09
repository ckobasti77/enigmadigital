/**
 * ============================================================================
 * DOKAZ: `kvalitetSajta` i signali iz ocene rade kako plan §2.3–2.4 kaže
 * ============================================================================
 *
 * Pokretanje:
 *   npm run verify:site-score
 *   (ili: node --import ./scripts/ts-hooks.mjs scripts/site-score-check.ts)
 *
 * Zašto postoji: ukupna ocena se ne skladišti nego računa pri čitanju, pa
 * greška u težinama ili u renormalizaciji ne bi ostavila trag ni u jednoj
 * tabeli — samo bi svaki sajt tiho dobio pogrešan pojas. Ovde se, bez baze:
 *
 *   1. pun audit (Lighthouse + Claude) daje tačan broj po formuli;
 *   2. bez Lighthousea težine se renormalizuju na sam Claudeov deo;
 *   3. bez Claudea — na Lighthouse deo;
 *   4. bez ičega → `null`, NIKAD nula (§0 pravilo 1);
 *   5. granice pojaseva (39 → loš, 40 → srednji, 69 → srednji, 70 → dobar);
 *   6. signali: pragovi iz §2.3, `nepoznato ≠ poznato` za zakazivanje i
 *      verzija koja se ne vidi nije zastarela verzija.
 *
 * Svi podaci su izmišljeni. Nema mreže, nema ključeva.
 */

import process from "node:process";
import {
  claudeProsek,
  izvediBooking,
  izvediCms,
  kvalitetSajta,
  pojasKvaliteta,
  signaliIzOcene,
  zastarelaTehnologija,
  type ClaudeSud,
} from "../convex/lib/siteScore";

let pao = 0;
function proveri(naziv: string, uslov: boolean, detalj: string): void {
  if (uslov) {
    console.log(`  OK   ${naziv}`);
  } else {
    pao++;
    console.log(`  PAO  ${naziv} -> ${detalj}`);
  }
}

function ocena(n: number) {
  return { ocena: n, obrazlozenje: "test" };
}

const CLAUDE_4: ClaudeSud = {
  model: "test-model",
  ocene: {
    prviUtisak: ocena(4),
    jasnocaPonude: ocena(4),
    putDoKontakta: ocena(4),
    mobilnaUpotrebljivost: ocena(4),
    azurnost: ocena(4),
  },
  glavneMane: [],
  prilikaZaEnigmu: "test",
  preporucenaPonuda: "nista",
};

const LIGHTHOUSE_PUN = {
  mobile: { performance: 40, accessibility: 80, bestPractices: 70, seo: 60 },
  desktop: { performance: 90, accessibility: 85, bestPractices: 75, seo: 65 },
};

function main(): void {
  console.log("=".repeat(78));
  console.log("PROVERA KVALITETA SAJTA (siteScore)");
  console.log("=".repeat(78));

  console.log("\n1. Pun audit — formula sa svim težinama");
  // 0,25·40 + 0,15·60 + 0,10·80 + 0,10·70 + 0,40·(4×20) = 10 + 9 + 8 + 7 + 32 = 66
  const pun = kvalitetSajta({ lighthouse: LIGHTHOUSE_PUN, claude: CLAUDE_4 });
  proveri("pun audit daje 66", pun === 66, String(pun));
  proveri("mobilni performance je merodavan (ne desktop 90)", pun !== null && pun < 75, String(pun));
  proveri("pojas za 66 je srednji", pun !== null && pojasKvaliteta(pun) === "srednji", String(pun));

  console.log("\n2. Bez Lighthousea — samo Claude, renormalizovano");
  const samoClaude = kvalitetSajta({ claude: CLAUDE_4 });
  proveri("samo Claude 4/5 daje 80", samoClaude === 80, String(samoClaude));
  proveri("claudeProsek je 4", claudeProsek(CLAUDE_4) === 4, String(claudeProsek(CLAUDE_4)));

  console.log("\n3. Bez Claudea — samo Lighthouse, renormalizovano");
  // (10 + 9 + 8 + 7) / 0,60 = 34 / 0,6 = 56,67 → 57
  const samoLh = kvalitetSajta({ lighthouse: LIGHTHOUSE_PUN });
  proveri("samo Lighthouse daje 57", samoLh === 57, String(samoLh));

  console.log("\n4. Delimičan Lighthouse — kategorija koje nema se preskače");
  // samo performance 40 → 40 (jedina komponenta)
  const samoPerf = kvalitetSajta({ lighthouse: { mobile: { performance: 40 } } });
  proveri("samo performance 40 daje 40", samoPerf === 40, String(samoPerf));
  // mobilni bez SEO, desktop ima SEO 65 → SEO se uzima sa desktopa
  const desktopSeo = kvalitetSajta({
    lighthouse: { mobile: { performance: 40 }, desktop: { seo: 65 } },
  });
  // (0,25·40 + 0,15·65) / 0,40 = (10 + 9,75) / 0,4 = 49,375 → 49
  proveri("SEO sa desktopa kad mobilni nema", desktopSeo === 49, String(desktopSeo));

  console.log("\n5. Bez ičega → null, nikad nula");
  proveri("prazan audit → null", kvalitetSajta({}) === null, String(kvalitetSajta({})));
  proveri("undefined → null", kvalitetSajta(undefined) === null, String(kvalitetSajta(undefined)));
  proveri(
    "prazan lighthouse objekat → null",
    kvalitetSajta({ lighthouse: { mobile: {} } }) === null,
    String(kvalitetSajta({ lighthouse: { mobile: {} } })),
  );

  console.log("\n6. Granice pojaseva");
  proveri("39 → loš", pojasKvaliteta(39) === "los", pojasKvaliteta(39));
  proveri("40 → srednji", pojasKvaliteta(40) === "srednji", pojasKvaliteta(40));
  proveri("69 → srednji", pojasKvaliteta(69) === "srednji", pojasKvaliteta(69));
  proveri("70 → dobar", pojasKvaliteta(70) === "dobar", pojasKvaliteta(70));
  proveri("0 → loš", pojasKvaliteta(0) === "los", pojasKvaliteta(0));
  proveri("100 → dobar", pojasKvaliteta(100) === "dobar", pojasKvaliteta(100));

  console.log("\n7. Signali iz ocene (plan §2.3)");
  const losSajt = {
    lighthouse: { mobile: { performance: 30, seo: 50 } },
    claude: {
      ...CLAUDE_4,
      ocene: {
        prviUtisak: ocena(2),
        jasnocaPonude: ocena(2),
        putDoKontakta: ocena(2),
        mobilnaUpotrebljivost: ocena(3),
        azurnost: ocena(2),
      },
      klikovaDoKontakta: 3,
    },
    tehnologije: [
      { ime: "Joomla", kategorija: "CMS", verzija: "3.9.2", pouzdanost: 100 },
      { ime: "jQuery", kategorija: "JavaScript libraries", verzija: "1.12", pouzdanost: 100 },
    ],
  };
  const signali = signaliIzOcene(losSajt, { trebaZakazivanje: true }).map((s) => s.kind);
  proveri("sajt_spor (perf 30)", signali.includes("sajt_spor"), signali.join(","));
  proveri("sajt_los_seo (SEO 50)", signali.includes("sajt_los_seo"), signali.join(","));
  proveri("sajt_slab_ux (prosek 2,2)", signali.includes("sajt_slab_ux"), signali.join(","));
  proveri("sajt_bez_puta_do_kontakta", signali.includes("sajt_bez_puta_do_kontakta"), signali.join(","));
  proveri("sajt_zastarela_tehnologija (Joomla 3)", signali.includes("sajt_zastarela_tehnologija"), signali.join(","));
  proveri("sajt_bez_zakazivanja (niša traži, nema alat)", signali.includes("sajt_bez_zakazivanja"), signali.join(","));
  proveri("tačno 6 signala", signali.length === 6, String(signali.length));

  const dobarSajt = {
    lighthouse: { mobile: { performance: 85, seo: 92 } },
    claude: { ...CLAUDE_4, klikovaDoKontakta: 1 },
    tehnologije: [
      { ime: "WordPress", kategorija: "CMS", verzija: "6.5", pouzdanost: 100 },
      { ime: "Joomla", kategorija: "CMS", pouzdanost: 50 },
    ],
    booking: "Calendly",
  };
  const bezSignala = signaliIzOcene(dobarSajt, { trebaZakazivanje: true });
  proveri("dobar sajt nema signala", bezSignala.length === 0, bezSignala.map((s) => s.kind).join(","));
  proveri(
    "Joomla bez verzije NIJE zastarela (nepoznato ≠ poznato)",
    zastarelaTehnologija([{ ime: "Joomla", kategorija: "CMS", pouzdanost: 50 }]) === null,
    "prijavljena kao zastarela",
  );
  proveri(
    "Flash je zastareo bez obzira na verziju",
    zastarelaTehnologija([{ ime: "Adobe Flash", kategorija: "Widgets", pouzdanost: 80 }]) !== null,
    "nije prijavljen",
  );

  const nepoznatoZakazivanje = signaliIzOcene(
    { tehnologije: [] },
    { trebaZakazivanje: undefined },
  );
  proveri(
    "niša bez trebaZakazivanje → nema sajt_bez_zakazivanja",
    !nepoznatoZakazivanje.some((s) => s.kind === "sajt_bez_zakazivanja"),
    nepoznatoZakazivanje.map((s) => s.kind).join(","),
  );
  const saFormom = signaliIzOcene({ formaZaTermin: true }, { trebaZakazivanje: true });
  proveri(
    "forma za termin gasi sajt_bez_zakazivanja",
    !saFormom.some((s) => s.kind === "sajt_bez_zakazivanja"),
    saFormom.map((s) => s.kind).join(","),
  );
  const svakiImaValue = signaliIzOcene(losSajt, { trebaZakazivanje: true }).every(
    (s) => typeof s.value === "string" && s.value.length > 0,
  );
  proveri("svaki signal nosi obrazloženje (value)", svakiImaValue, "prazan value");

  console.log("\n8. Izvođenje imena iz liste tehnologija");
  const tehnologije = [
    { ime: "WooCommerce", kategorija: "Ecommerce", pouzdanost: 100 },
    { ime: "WordPress", kategorija: "CMS", pouzdanost: 100 },
    { ime: "Drupal", kategorija: "CMS", pouzdanost: 30 },
    { ime: "Calendly", kategorija: "Appointment scheduling", pouzdanost: 90 },
  ];
  proveri("CMS = najpouzdaniji u kategoriji", izvediCms(tehnologije) === "WordPress", String(izvediCms(tehnologije)));
  proveri("booking = Calendly", izvediBooking(tehnologije) === "Calendly", String(izvediBooking(tehnologije)));
  proveri("bez liste → undefined", izvediCms(undefined) === undefined, String(izvediCms(undefined)));
  proveri(
    "pogodak ispod 60 (samo DOM/implies) ne imenuje CMS",
    izvediCms([{ ime: "Magento", kategorija: "CMS", pouzdanost: 50 }]) === undefined,
    String(izvediCms([{ ime: "Magento", kategorija: "CMS", pouzdanost: 50 }])),
  );

  console.log("");
  if (pao > 0) {
    console.error(`NEUSPEH: palo provera: ${pao}`);
    process.exit(1);
  }
  console.log("✓ Sve provere kvaliteta sajta prolaze.");
}

main();
