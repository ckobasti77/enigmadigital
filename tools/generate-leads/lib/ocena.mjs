/**
 * ============================================================================
 * KVALITET SAJTA — JS kopija `convex/lib/siteScore.ts` (plan §2.4)
 * ============================================================================
 *
 * Skill ispisuje ukupnu ocenu u terminalu (`oceni-sajt`) pre nego što išta
 * stigne u aplikaciju, pa mu treba ISTA formula. Dve kopije iste funkcije se
 * razilaze; zato `self-test --strogo` pušta iste ulaze kroz obe i pada ako se
 * brojevi ne poklope (kao i za šemu tela).
 *
 * Ukupna ocena se NIKAD ne upisuje u telo ingesta — aplikacija je računa pri
 * čitanju (§0 pravilo 2).
 */

export const POJAS_GRANICE = { srednji: 40, dobar: 70 };

const TEZINE = {
  performance: 0.25,
  seo: 0.15,
  accessibility: 0.1,
  bestPractices: 0.1,
  claude: 0.4,
};

const konacan = (x) => typeof x === "number" && Number.isFinite(x);

export function claudeProsek(claude) {
  if (!claude || !claude.ocene) return null;
  const v = [
    claude.ocene.prviUtisak?.ocena,
    claude.ocene.jasnocaPonude?.ocena,
    claude.ocene.putDoKontakta?.ocena,
    claude.ocene.mobilnaUpotrebljivost?.ocena,
    claude.ocene.azurnost?.ocena,
  ];
  if (!v.every(konacan)) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function kategorija(lighthouse, ime) {
  const m = lighthouse?.mobile?.[ime];
  if (konacan(m)) return m;
  const d = lighthouse?.desktop?.[ime];
  if (konacan(d)) return d;
  return null;
}

/** 0–100 ili `null` („nije ocenjeno"). Isti brojevi kao `siteScore.ts`. */
export function kvalitetSajta(audit) {
  if (!audit) return null;
  const komponente = [];
  const perf = kategorija(audit.lighthouse, "performance");
  if (perf !== null) komponente.push([perf, TEZINE.performance]);
  const seo = kategorija(audit.lighthouse, "seo");
  if (seo !== null) komponente.push([seo, TEZINE.seo]);
  const a11y = kategorija(audit.lighthouse, "accessibility");
  if (a11y !== null) komponente.push([a11y, TEZINE.accessibility]);
  const bp = kategorija(audit.lighthouse, "bestPractices");
  if (bp !== null) komponente.push([bp, TEZINE.bestPractices]);
  const prosek = claudeProsek(audit.claude);
  if (prosek !== null) komponente.push([prosek * 20, TEZINE.claude]);
  if (komponente.length === 0) return null;
  const tezina = komponente.reduce((a, [, t]) => a + t, 0);
  const zbir = komponente.reduce((a, [v, t]) => a + v * t, 0);
  return Math.max(0, Math.min(100, Math.round(zbir / tezina)));
}

export function pojasKvaliteta(k) {
  if (k < POJAS_GRANICE.srednji) return "los";
  if (k < POJAS_GRANICE.dobar) return "srednji";
  return "dobar";
}

export const POJAS_NATPISI = { los: "loš", srednji: "srednji", dobar: "dobar" };

/**
 * Prva tehnologija u kategoriji, po pouzdanosti (isto kao `izvediCms` i dr. u
 * `siteScore.ts`). Pogodak ispod 60 (samo DOM heuristika ili `implies`) ne
 * sme da imenuje CMS/webshop/zakazivanje — lažan „Magento" na WordPress sajtu
 * bi otišao u filter i u profil kao činjenica.
 */
export const PRAG_POUZDANOSTI_IMENA = 60;

export function prvaUKategoriji(tehnologije, kategorijaIme) {
  if (!Array.isArray(tehnologije)) return undefined;
  const t = tehnologije
    .filter((x) => x.kategorija === kategorijaIme && x.pouzdanost >= PRAG_POUZDANOSTI_IMENA)
    .sort((a, b) => b.pouzdanost - a.pouzdanost)[0];
  return t?.ime;
}
