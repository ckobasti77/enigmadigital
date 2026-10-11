/**
 * ============================================================================
 * DOKAZ: <CountUp> uvek pokaže vrednost koju je dobio (regresija na A8 bug)
 * ============================================================================
 *
 * Pokretanje:
 *   npm run verify:brojevi
 *   (ili: node --import ./scripts/ts-hooks.mjs scripts/count-up-check.ts)
 *
 * ŠTA SE DOKAZUJE: posle promene `value` tekst u DOM-u odgovara NOVOJ
 * vrednosti — i pri prvom prikazu i pri ažuriranju, u obe grane pokreta
 * (motion i reduced). Ovo je ISHOD, ne ugovor: A8-ova ista greška je prošla
 * kroz `verify:pokret` (47 provera) jer je merila da tvin postoji, a ne šta
 * na kraju piše na ekranu. Cela aplikacija je posle toga pokazivala „0".
 *
 * KAKO, bez jsdom-a: rep ne dozvoljava nove zavisnosti, a Node-ov ugrađeni TS
 * ne transformiše JSX, pa se `.tsx` komponenta ne može uvesti ni izvršiti u
 * skripti. Zato se dokazuje BAŠ onaj kod koji komponenta pokreće — `runCountEffect`
 * iz `count-up-engine.ts` je izvučen upravo za ovo — nad:
 *   • modelom React-ovog tekstualnog čvora: `emit` (u komponenti `setState`)
 *     je jedini kanal do teksta, tačno kao što React piše svoj `nodeValue`;
 *   • pravim GSAP-om, doguranim do kraja preko `tween.progress(1)` (isto što
 *     bi u pregledaču uradio ticker) i do sredine preko `progress(0.5)`;
 *   • elementom čiji `textContent` PUCA ako se dotakne — tako da povratak na
 *     stari pristup (`el.textContent = …`) obara test.
 */

import process from "node:process";
import gsap from "gsap";
import { precisionStep, runCountEffect } from "../components/motion/count-up-engine";

let pao = 0;
function proveri(naziv: string, uslov: boolean, detalj: string): void {
  if (uslov) {
    console.log(`  OK   ${naziv}`);
  } else {
    pao++;
    console.log(`  PAO  ${naziv} -> ${detalj}`);
  }
}

const format = (v: number) => String(Math.round(v));

/**
 * Model React-ovog tekstualnog čvora: React drži JEDAN čvor i menja mu
 * `data`. `emit` radi isto što bi React uradio na `setDisplay`.
 */
class OwnedTextNode {
  data = "";
}

/**
 * Element nad kojim smemo samo neprozirnost. Pisanje u `textContent`/`innerText`
 * je tačno ono što je A8 radio i što je razbilo React-ov čvor — ovde puca.
 */
function pravElement() {
  const style = {
    setProperty() {},
    removeProperty() {},
  };
  const el = { style, opacity: 1 } as unknown as HTMLElement;
  for (const prop of ["textContent", "innerText"] as const) {
    Object.defineProperty(el, prop, {
      get: () => "",
      set: () => {
        throw new Error(`<CountUp> je pisao broj u el.${prop} — to razbija React-ov čvor (A8 bug)`);
      },
    });
  }
  return el;
}

/** Odigra jedan efekat i vrati zabeležene emit-e + finalni tekst čvora. */
function odigraj(opts: {
  reduced: boolean;
  isUpdate: boolean;
  from: number;
  current: number;
  value: number;
  /** 0..1 — koliko daleko dogurati tvin pre finalnog `progress(1)`. */
  usput?: number;
}) {
  const node = new OwnedTextNode();
  node.data = format(opts.isUpdate ? opts.current : opts.value);
  const emiti: number[] = [];
  const emit = (v: number) => {
    emiti.push(v);
    node.data = format(v);
  };

  const tween = runCountEffect({
    el: pravElement(),
    reduced: opts.reduced,
    isUpdate: opts.isUpdate,
    from: opts.from,
    current: opts.current,
    value: opts.value,
    emit,
  });

  let usputTekst: string | null = null;
  if (tween && opts.usput !== undefined) {
    tween.progress(opts.usput);
    usputTekst = node.data;
  }
  if (tween) tween.progress(1);

  return { node, emiti, usputTekst, tween };
}

// ---------------------------------------------------------------------------
console.log("\n1. Prvi prikaz, pokret uključen: odbroji od `from`, završi na `value`");
// ---------------------------------------------------------------------------
{
  const { node, emiti, usputTekst } = odigraj({
    reduced: false,
    isUpdate: false,
    from: 0,
    current: 0,
    value: 40,
    usput: 0.5,
  });
  proveri("tekst na kraju == nova vrednost (40)", node.data === "40", `data=${node.data}`);
  proveri("prvi emit je `from` (0) — odbrojavanje kreće od nule", emiti[0] === 0, `emiti[0]=${emiti[0]}`);
  proveri(
    "na pola puta broj je između 0 i 40 (prelazi, ne skače)",
    usputTekst !== null && Number(usputTekst) > 0 && Number(usputTekst) < 40,
    `usput=${usputTekst}`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n2. Ažuriranje, pokret uključen: pređi od ZATEČENE vrednosti do nove");
// ---------------------------------------------------------------------------
{
  const { node, emiti, usputTekst } = odigraj({
    reduced: false,
    isUpdate: true,
    from: 0,
    current: 40,
    value: 178,
    usput: 0.5,
  });
  proveri("tekst na kraju == nova vrednost (178)", node.data === "178", `data=${node.data}`);
  proveri(
    "prelaz kreće od zatečene (40), ne od nule — prekidiv",
    emiti[0] === 40,
    `emiti[0]=${emiti[0]}`,
  );
  proveri(
    "na pola puta broj je između 40 i 178",
    usputTekst !== null && Number(usputTekst) > 40 && Number(usputTekst) < 178,
    `usput=${usputTekst}`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n3. Reduced motion: tačan broj se upiše ODMAH (grana bez odbrojavanja)");
// ---------------------------------------------------------------------------
{
  const prvi = odigraj({ reduced: true, isUpdate: false, from: 0, current: 0, value: 40 });
  proveri("prvi prikaz: tekst == 40 bez tvin-a broja", prvi.node.data === "40", `data=${prvi.node.data}`);
  proveri("upisano je tačno jednom, tačna vrednost", prvi.emiti.length === 1 && prvi.emiti[0] === 40, `emiti=${prvi.emiti}`);

  const azur = odigraj({ reduced: true, isUpdate: true, from: 0, current: 40, value: 178 });
  proveri("ažuriranje: tekst == 178 odmah", azur.node.data === "178", `data=${azur.node.data}`);
  proveri("upisana tačno nova vrednost", azur.emiti.length === 1 && azur.emiti[0] === 178, `emiti=${azur.emiti}`);
}

// ---------------------------------------------------------------------------
console.log("\n4. Bug iz A8 se ne može ponoviti: broj nikad ne ide u el.textContent");
// ---------------------------------------------------------------------------
{
  // `pravElement()` puca na pisanje u textContent. Da `runCountEffect` piše broj
  // preko čvora (kao A8), sve gornje scene bi već pukle. Ovde još potvrđujemo
  // da zamka radi, pa gornji „OK" nešto znače.
  let zamkaRadi = false;
  try {
    (pravElement() as unknown as { textContent: string }).textContent = "0";
  } catch {
    zamkaRadi = true;
  }
  proveri("zamka na el.textContent zaista puca (test ima zube)", zamkaRadi, "zamka ne puca");

  // Terminalna tačnost i kad se tvin ne dogura ručno: onUpdate na progress(1)
  // upiše tačnu vrednost čak i ako onComplete izostane.
  const { node } = odigraj({ reduced: false, isUpdate: true, from: 0, current: 5, value: 999 });
  proveri("terminalni tekst je tačno `value` (999)", node.data === "999", `data=${node.data}`);
}

// ---------------------------------------------------------------------------
console.log("\n5. Međuvrednosti su na preciznosti cilja (F7/F8): nikad „Svakih 19.814826m\"");
// ---------------------------------------------------------------------------
{
  // Format koji sam NE zaokružuje — tačno onaj sa ekrana Pravila.
  const sirov = (v: number) => `Svakih ${v}m`;
  const tekstovi: string[] = [];
  const emiti: number[] = [];
  const tween = runCountEffect({
    el: pravElement(),
    reduced: false,
    isUpdate: false,
    from: 0,
    current: 0,
    value: 30,
    emit: (v) => {
      emiti.push(v);
      tekstovi.push(sirov(v));
    },
  });
  for (const p of [0.07, 0.13, 0.37, 0.5, 0.81, 0.97, 1]) tween?.progress(p);
  proveri(
    "ceo cilj (30) → svaka međuvrednost je ceo broj",
    emiti.length > 3 && emiti.every(Number.isInteger),
    `emiti=${emiti}`,
  );
  proveri(
    "tekst na svakom kadru je „Svakih <ceo broj>m\"",
    tekstovi.every((t) => /^Svakih \d+m$/.test(t)),
    `tekstovi=${tekstovi}`,
  );
  proveri("kraj je tačno 30", emiti[emiti.length - 1] === 30, `kraj=${emiti[emiti.length - 1]}`);

  const odnos: number[] = [];
  const t2 = runCountEffect({
    el: pravElement(),
    reduced: false,
    isUpdate: false,
    from: 0,
    current: 0,
    value: 0.37,
    emit: (v) => odnos.push(v),
  });
  for (const p of [0.07, 0.13, 0.37, 0.5, 0.81, 0.97, 1]) t2?.progress(p);
  proveri(
    "cilj na dve decimale (0,37) → međuvrednosti najviše na dve decimale",
    odnos.length > 3 && odnos.every((v) => (String(v).split(".")[1]?.length ?? 0) <= 2),
    `emiti=${odnos}`,
  );
  proveri("kraj je tačno 0,37", odnos[odnos.length - 1] === 0.37, `kraj=${odnos[odnos.length - 1]}`);

  proveri(
    "korak: 40 → 1, 0,37 → 0,01, 1e-9 → bez zaokruživanja",
    precisionStep(40) === 1 && precisionStep(0.37) === 0.01 && precisionStep(1e-9) === null,
    `${precisionStep(40)} / ${precisionStep(0.37)} / ${precisionStep(1e-9)}`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n6. Skriven tab (F8): tačan broj ODMAH, bez tvina koji čeka kadrove");
// ---------------------------------------------------------------------------
{
  for (const isUpdate of [false, true]) {
    const emiti: number[] = [];
    const tween = runCountEffect({
      el: pravElement(),
      reduced: false,
      isUpdate,
      from: 0,
      current: 40,
      value: 178,
      emit: (v) => emiti.push(v),
      hidden: true,
    });
    proveri(
      `${isUpdate ? "ažuriranje" : "prvi prikaz"}: upisano jednom, tačno 178, tvina nema`,
      tween === null && emiti.length === 1 && emiti[0] === 178,
      `tween=${tween === null ? "null" : "postoji"} emiti=${emiti}`,
    );
  }
}

// ---------------------------------------------------------------------------
console.log("\n7. Stari tvin ne vraća staru brojku: prethodni se gasi pre novog");
// ---------------------------------------------------------------------------
{
  // Prvi prikaz traje duže (DUR_COUNT) od prelaza na svež podatak (DUR_UI).
  // Bez gašenja, prvi tvin završi POSLE drugog i na ekranu ostane 40.
  const scena = (gasi: boolean) => {
    const node = new OwnedTextNode();
    const emit = (v: number) => {
      node.data = format(v);
    };
    const osnova = { el: pravElement(), reduced: false, from: 0, emit };
    const t0 = gsap.globalTimeline.time();
    const prvi = runCountEffect({ ...osnova, isUpdate: false, current: 0, value: 40 });
    runCountEffect({
      ...osnova,
      isUpdate: true,
      current: 12,
      value: 178,
      previous: gasi ? prvi : null,
    });
    // Sat teče kao u pregledaču: prvo prođe kraći prelaz, pa duže odbrojavanje.
    gsap.updateRoot(t0 + 0.3);
    gsap.updateRoot(t0 + 2);
    return node.data;
  };
  const bez = scena(false);
  proveri(
    "kontrola: BEZ gašenja stari tvin pregazi novu vrednost (test ima zube)",
    bez === "40",
    `data=${bez}`,
  );
  const sa = scena(true);
  proveri("sa gašenjem na ekranu ostaje nova vrednost (178)", sa === "178", `data=${sa}`);
}

// ---------------------------------------------------------------------------
console.log(pao === 0 ? "\nSVE PROLAZI\n" : `\n${pao} PROVERA NIJE PROSLA\n`);
gsap.globalTimeline.clear();
process.exit(pao === 0 ? 0 : 1);
