import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/**
 * Čuvar linkova u dva režima (plan C02 §7.7–7.8, D16). U hubu je projekat u
 * putanji (`/scanme/leadovi`), u panelu nije (`/leadovi`), pa:
 *   - interni link ekrana ide kroz `<ProjekatLink>`, nikad direktno kroz
 *     `next/link` (zaboravljen prefiks bi u hubu vodio na pogrešan projekat);
 *   - putanju ekrana daje `useEkranPutanja()`; pun `usePathname()` smeju samo
 *     mesta kojima treba baš adresa iz pregledača.
 */

const KOREN = fileURLToPath(new URL("../", import.meta.url));

/** Fajlovi kojima je `next/link` dozvoljen, sa razlogom. */
const NEXT_LINK_DOZVOLJEN: Record<string, string> = {
  "components/app/projekat-link.tsx": "omotač: jedino mesto koje pravi link ekrana",
  "components/app/projekat-nedostupan.tsx":
    "vodi VAN projekta, na hub „Svi projekti“ (`/`); kroz projekat bi `/` postao kontrolna tabla",
  "components/app/projekat-birac.tsx":
    "vodi VAN tekućeg projekta: na isti ekran drugog projekta (`/<slug>/…`) i na hub (`/`)",
  "components/app/napredak/misija-link.tsx":
    "misija iz drugog projekta (P12) vodi u taj projekat (`/<slug>/…`); misija tekućeg ide kroz `ProjekatLink`",
  "components/app/leadovi/unakrsni-projekti.tsx":
    "unakrsni lead (P13) vodi na profil firme u DRUGOM projektu (`/<slug>/leadovi/…`), samo u hubu",
  "components/app/ja-link.tsx":
    "omotač za linkove nivoa Ja i za prelaz u drugi projekat (`/<slug>/…`); kroz `ProjekatLink` bi dobili prefiks tekućeg projekta (SPAJANJE S08)",
};
/** Hub je van projekta: veze idu eksplicitno na `/<slug>`. */
const NEXT_LINK_FASCIKLA = "components/app/hub/";

/** Fajlovi kojima je pun `usePathname()` dozvoljen, sa razlogom. */
const PATHNAME_DOZVOLJEN: Record<string, string> = {
  "components/app/projekat-provider.tsx": "`useEkranPutanja` skida prefiks projekta",
  "components/app/page-transition.tsx": "ključ animacije strane; nov projekat je nova strana",
  "components/app/date-range-picker.tsx": "`router.replace` na istu adresu, sa prefiksom",
  "components/app/leadovi/use-lead-filters.ts": "`router.replace` na istu adresu, sa prefiksom",
};

function fajlovi(dir: string, out: string[] = []): string[] {
  for (const ulaz of readdirSync(dir, { withFileTypes: true })) {
    const put = join(dir, ulaz.name);
    if (ulaz.isDirectory()) fajlovi(put, out);
    else if (/\.(ts|tsx)$/.test(ulaz.name) && !/\.test\.ts$/.test(ulaz.name)) out.push(put);
  }
  return out;
}

/** Kod bez komentara (komentar sme da pominje `usePathname()`). */
function bezKomentara(izvor: string): string {
  return izvor
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

const APLIKACIJA = [join(KOREN, "components", "app"), join(KOREN, "app", "(app)")]
  .flatMap((dir) => fajlovi(dir))
  .map((put) => ({
    rel: relative(KOREN, put).split(sep).join("/"),
    kod: bezKomentara(readFileSync(put, "utf8")),
  }));

describe("linkovi u oba režima", () => {
  test("skup fajlova nije prazan (putanje su tačne)", () => {
    expect(APLIKACIJA.length).toBeGreaterThan(100);
    expect(APLIKACIJA.some((f) => f.rel === "app/(app)/[projekat]/layout.tsx")).toBe(true);
  });

  test("next/link samo u omotaču, hubu i izlazu iz projekta", () => {
    const pali = APLIKACIJA.filter(
      (f) =>
        /from\s+["']next\/link["']/.test(f.kod) &&
        !(f.rel in NEXT_LINK_DOZVOLJEN) &&
        !f.rel.startsWith(NEXT_LINK_FASCIKLA),
    ).map((f) => f.rel);
    expect(pali).toEqual([]);
  });

  test("usePathname samo gde treba adresa iz pregledača", () => {
    const pali = APLIKACIJA.filter(
      (f) => /\busePathname\s*\(/.test(f.kod) && !(f.rel in PATHNAME_DOZVOLJEN),
    ).map((f) => f.rel);
    expect(pali).toEqual([]);
  });

  test("useQueryZaProjekat (upit za zadati projekat) samo u hubu", () => {
    // Van huba projekat daje provider (`useProjekatQuery`); hook sa zadatim
    // projektom bi tamo mogao da pita pogrešan projekat (C16, plan C15 §1.4).
    const pali = APLIKACIJA.filter(
      (f) =>
        /\buseQueryZaProjekat\s*\(/.test(f.kod) &&
        f.rel !== "components/app/projekat-provider.tsx" &&
        !f.rel.startsWith(NEXT_LINK_FASCIKLA),
    ).map((f) => f.rel);
    expect(pali).toEqual([]);
    expect(/\buseQueryZaProjekat\s*\(/.test(bezKomentara("const r = useQueryZaProjekat(ws, api.a.b);"))).toBe(true);
  });

  test("spiskovi izuzetaka ne sadrže fajl koji ne postoji", () => {
    const postoje = new Set(APLIKACIJA.map((f) => f.rel));
    for (const rel of [...Object.keys(NEXT_LINK_DOZVOLJEN), ...Object.keys(PATHNAME_DOZVOLJEN)]) {
      expect(postoje.has(rel), rel).toBe(true);
    }
  });

  test("čuvar hvata prekršaj (provera same provere)", () => {
    expect(/from\s+["']next\/link["']/.test(bezKomentara('import Link from "next/link";'))).toBe(true);
    expect(/\busePathname\s*\(/.test(bezKomentara("const p = usePathname();"))).toBe(true);
    expect(/\busePathname\s*\(/.test(bezKomentara("// koristi usePathname() ovde"))).toBe(false);
    expect(/\busePathname\s*\(/.test(bezKomentara("/** pun `usePathname()` */"))).toBe(false);
    expect(bezKomentara('const u = "https://x.rs/a"; // kraj')).toBe('const u = "https://x.rs/a"; ');
  });
});
