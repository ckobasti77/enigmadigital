/**
 * Čuvar rečnika (ULTRA O15, plan T08 §9.6): svako pravilo pada na svom
 * primeru, komentar i `className` se ne broje, izuzetak mora da ima razlog, i
 * ceo kod prolazi.
 */
import { describe, expect, test } from "vitest";

import {
  DODATNA_ENV_IMENA,
  IZUZECI,
  izuzeciBezRazloga,
  proveriRecnik,
  proveriServer,
  uOpsegu,
  type Izuzetak,
} from "./recnik-cuvar";
import { envCitanja, fajloviKoda, procitaj, rel } from "./izvorni-kod.pomoc";

const ENV = new Set(["IG_WEBHOOK_VERIFY_TOKEN", "ADS_WRITE_ENABLED", "OAUTH_CALLBACK_ORIGIN"]);
const F = "components/app/primer.tsx";
const pravila = (kod: string, put = F, izuzeci: readonly Izuzetak[] = []) =>
  proveriRecnik(put, kod, ENV, izuzeci).map((n) => n.pravilo);

describe("pravila R1–R8 padaju na svom primeru", () => {
  test("R1 SCREAMING_SNAKE u JSX tekstu", () => {
    expect(pravila(`const a = <span>Tip: TEXT_POST</span>;`)).toContain("R1");
  });
  test("R2 ime env promenljive, i u <code>", () => {
    expect(pravila(`const a = <p>Dodaj <code>IG_WEBHOOK_VERIFY_TOKEN</code></p>;`)).toEqual(["R2"]);
  });
  test("R3 OAuthException i kod greške", () => {
    expect(pravila(`const a = <p title="OAuthException 190">x</p>;`)).toContain("R3");
    expect(pravila(`toast.error("Greška (#190)");`)).toContain("R3");
  });
  test("R4 interna oznaka plana", () => {
    expect(pravila(`const a = <h3>Moderacija (Dodatak A.2)</h3>;`)).toContain("R4");
    expect(pravila(`const a = <p>vidi §6.8</p>;`)).toContain("R4");
  });
  test("R5 ⌘ van use-precica.ts", () => {
    expect(pravila(`const a = <kbd>⌘K</kbd>;`)).toContain("R5");
    expect(pravila(`const a = <kbd>⌘K</kbd>;`, "components/app/use-precica.ts")).not.toContain("R5");
  });
  test("R6 snake_case u natpisu, ali ne u <code>, URL-u ni adresi", () => {
    expect(pravila(`const a = <span>{"added_photos"}</span>;`)).toContain("R6");
    expect(pravila(`const a = <p>Polje <code>utm_medium</code></p>;`)).toEqual([]);
    expect(pravila(`const a = <p>Otvori https://x.rs/a_b ili pisi na jo_van@x.rs</p>;`)).toEqual([]);
  });
  test("R7 reč API-ja velikim slovima", () => {
    expect(pravila(`const a = <span aria-label="Status: ACTIVE" />;`)).toContain("R7");
    expect(pravila(`const o = [{ value: "RECENT", label: "Najnovije (RECENT)" }];`)).toContain("R7");
    expect(pravila(`const a = <p><kbd>POST</kbd></p>;`)).toEqual([]);
  });
  test("R8 žargon", () => {
    expect(pravila(`const a = <th>Hook Rate</th>;`)).toContain("R8");
    expect(pravila(`const a = <Field label="Lookalike publika" />;`)).toContain("R8");
    expect(pravila(`setError("Ad set nije nađen");`)).toContain("R8");
  });
  test("tekst kroz ?:, && i šablon se vidi", () => {
    expect(pravila(`const a = <p>{x ? "Aktivna" : "PAUSED"}</p>;`)).toContain("R7");
    expect(pravila(`const a = <p>{ok && \`Status: \${s} PAUSED\`}</p>;`)).toContain("R7");
  });
});

describe("šta se ne vidi", () => {
  test("komentar, className, ključ, value, case i poređenje", () => {
    const kod = `
      // TEXT_POST je sirova vrednost iz API-ja
      /* Ad set → Grupa oglasa */
      const M = { TEXT_POST: "Tekst" };
      function f(t: string) {
        switch (t) { case "PAUSED": return "Pauzirana"; }
        if (t === "CAROUSEL_ALBUM") return "Album";
        return "";
      }
      const a = <div className="TEXT_POST added_photos" data-x="ACTIVE" key="REEL">
        <option value="OUTCOME_LEADS">Upiti</option>
      </div>;
    `;
    expect(pravila(kod)).toEqual([]);
  });
});

describe("izuzeci", () => {
  test("izuzetak važi samo u svom fajlu", () => {
    const izuzeci = [{ fajl: F, sadrzi: "ENIGMA_LEAD_TOKEN", razlog: "korisnik ga upisuje na svom računaru" }];
    const env = new Set(["ENIGMA_LEAD_TOKEN"]);
    const kod = `const a = <code>ENIGMA_LEAD_TOKEN</code>;`;
    expect(proveriRecnik(F, kod, env, izuzeci)).toEqual([]);
    expect(proveriRecnik("components/app/drugi.tsx", kod, env, izuzeci).length).toBeGreaterThan(0);
  });
  test("izuzetak bez razloga obara proveru", () => {
    expect(izuzeciBezRazloga([{ fajl: F, sadrzi: "X_Y", razlog: "" }])).toHaveLength(1);
    expect(izuzeciBezRazloga(IZUZECI)).toEqual([]);
  });
});

describe("R9: poruke grešaka na serveru", () => {
  const S = "convex/primer.ts";
  test("env ime u ConvexError i throw new Error pada", () => {
    expect(proveriServer(S, `throw new ConvexError({ code: "x", message: "Fali ADS_WRITE_ENABLED" });`, ENV, [])).toHaveLength(1);
    expect(proveriServer(S, `throw new ConvexError("Fali OAUTH_CALLBACK_ORIGIN");`, ENV, [])).toHaveLength(1);
    expect(proveriServer(S, `function f() { throw new Error(\`OAuthException \${c}\`); }`, ENV, [])).toHaveLength(1);
  });
  test("ljudska poruka i kod greške prolaze; komentar se ne broji", () => {
    const kod = `
      // ADS_WRITE_ENABLED je prekidač
      const on = process.env.ADS_WRITE_ENABLED;
      throw new ConvexError({ code: "write_disabled", message: "Izmene oglasa su isključene na serveru." });
    `;
    expect(proveriServer(S, kod, ENV, [])).toEqual([]);
  });
});

describe("ceo kod", () => {
  // Poruke servera proverava samo R9 (imena env-a i „OAuthException"), ne R1–R8.
  test("nijedan sirov naziv u components/ i app/; poruke servera bez env imena (R9)", () => {
    const env = new Set<string>(DODATNA_ENV_IMENA);
    for (const f of fajloviKoda(["convex", "lib"])) {
      for (const t of envCitanja(f, procitaj(f))) env.add(t.tekst);
    }
    env.delete("NODE_ENV");
    const nalazi = [
      ...fajloviKoda(["components", "app"])
        .filter((f) => uOpsegu(rel(f)))
        .flatMap((f) => proveriRecnik(rel(f), procitaj(f), env)),
      ...fajloviKoda(["convex"]).flatMap((f) => proveriServer(rel(f), procitaj(f), env)),
    ].map((n) => `${n.putanja}:${n.linija} ${n.pravilo} ${n.isecak}`);
    expect(nalazi).toEqual([]);
  });
});
