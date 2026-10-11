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
import { runCountEffect } from "../components/motion/count-up-engine";

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
console.log(pao === 0 ? "\nSVE PROLAZI\n" : `\n${pao} PROVERA NIJE PROSLA\n`);
gsap.globalTimeline.clear();
process.exit(pao === 0 ? 0 : 1);
