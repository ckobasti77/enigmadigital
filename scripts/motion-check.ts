/**
 * ============================================================================
 * DOKAZ: pokret ne odstupa od specifikacije (A8 §1, specifikacija u A1 §2)
 * ============================================================================
 *
 * Pokretanje:
 *   npm run verify:pokret
 *   (ili: node --import ./scripts/ts-hooks.mjs scripts/motion-check.ts)
 *
 * Zašto postoji: trajanja i krive su odlučene u A1 i stoje na dva mesta —
 * `lib/motion.ts` (GSAP) i `app/globals.css` (CSS). Dva broja koja moraju da
 * budu ista, a nijedan alat ih ne poredi, raziđu se prvom sledećom izmenom.
 * Uz to, „prekidiv prelaz" i „bez keyframe biblioteke" su tvrdnje koje se u
 * izveštaju lako napišu, a u kodu lako izgube — pa se ovde mere, ne tvrde.
 *
 * Bez baze, bez mreže, bez pregledača. Ovo NE dokazuje kako pokret izgleda —
 * to rade snimci i sonda u pregledaču; ovo dokazuje da ugovor stoji.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import {
  DUR_COUNT,
  DUR_FRESH,
  DUR_MOMENTUM,
  DUR_REDUCED,
  DUR_UI,
  MAX_REVEAL_DELAY,
  REVEAL_BUDGET,
  STAGGER_MAX,
  clampRevealDelay,
  resolveStagger,
} from "../lib/motion";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const citaj = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

let pao = 0;
function proveri(naziv: string, uslov: boolean, detalj: string): void {
  if (uslov) {
    console.log(`  OK   ${naziv}`);
  } else {
    pao++;
    console.log(`  PAO  ${naziv} -> ${detalj}`);
  }
}

const css = citaj("app", "globals.css");
const motionTs = citaj("lib", "motion.ts");

/** Vrednost CSS promenljive iz `:root` bloka (prva deklaracija pobeđuje). */
function cssToken(ime: string): string | null {
  const m = css.match(new RegExp(`^\\s*--${ime}:\\s*([^;]+);`, "m"));
  return m ? m[1].trim() : null;
}

function msToken(ime: string): number | null {
  const v = cssToken(ime);
  if (!v) return null;
  const m = v.match(/^(\d+(?:\.\d+)?)ms$/);
  return m ? Number(m[1]) : null;
}

// ---------------------------------------------------------------------------
console.log("\n1. CSS i GSAP govore iste brojeve");
// ---------------------------------------------------------------------------

const durBase = msToken("duration-base");
const durPress = msToken("duration-press");
const durFast = msToken("duration-fast");
const durMomentum = msToken("duration-momentum");

proveri(
  "--duration-base == DUR_UI",
  durBase !== null && Math.round(DUR_UI * 1000) === durBase,
  `css=${durBase} ts=${DUR_UI * 1000}`,
);
proveri(
  "--duration-momentum == DUR_MOMENTUM",
  durMomentum !== null && Math.round(DUR_MOMENTUM * 1000) === durMomentum,
  `css=${durMomentum} ts=${DUR_MOMENTUM * 1000}`,
);
proveri(
  "--duration-fast == DUR_REDUCED (reduced motion je isti broj u oba sveta)",
  durFast !== null && Math.round(DUR_REDUCED * 1000) === durFast,
  `css=${durFast} ts=${DUR_REDUCED * 1000}`,
);

const easeUi = cssToken("ease-ui");
proveri(
  "--ease-ui je tacan blizanac CustomEase krive iz lib/motion.ts",
  easeUi === "cubic-bezier(0.2, 0.8, 0.2, 1)" &&
    /CustomEase\.create\(\s*"ui",\s*"0\.2,0\.8,0\.2,1"\s*\)/.test(motionTs),
  `css=${easeUi}`,
);

// ---------------------------------------------------------------------------
console.log("\n2. Specifikacija iz A1: 150–200 ms za sve sto ulazi, ≤ 100 ms odziv");
// ---------------------------------------------------------------------------

proveri(
  "trajanje ulaska je u rasponu 150–200 ms",
  durBase !== null && durBase >= 150 && durBase <= 200,
  `--duration-base=${durBase}ms`,
);
proveri(
  "odziv na pritisak je ≤ 100 ms",
  durPress !== null && durPress <= 100,
  `--duration-press=${durPress}ms`,
);
proveri(
  "prelaz brojaca pri svezem podatku je ≤ trajanja ulaska",
  DUR_UI <= 0.2 && DUR_FRESH < DUR_UI,
  `DUR_UI=${DUR_UI} DUR_FRESH=${DUR_FRESH}`,
);
proveri(
  "prvo odbrojavanje (DUR_COUNT) ne probija budzet ulaska ekrana dvostruko",
  DUR_COUNT <= 2 * DUR_UI + 0.15,
  `DUR_COUNT=${DUR_COUNT}`,
);

// ---------------------------------------------------------------------------
console.log("\n3. Budzet ekrana: talas nikad ne prelazi 300 ms");
// ---------------------------------------------------------------------------

for (const n of [1, 2, 3, 6, 12, 40]) {
  const stagger = resolveStagger(n);
  const ukupno = DUR_UI + stagger * (n - 1);
  proveri(
    `${n} elemenata: ukupno ${Math.round(ukupno * 1000)} ms ≤ ${REVEAL_BUDGET * 1000} ms`,
    ukupno <= REVEAL_BUDGET + 1e-9 && stagger <= STAGGER_MAX + 1e-9,
    `stagger=${stagger}`,
  );
}
proveri(
  "clampRevealDelay nikad ne pusti kasnjenje preko MAX_REVEAL_DELAY",
  clampRevealDelay(10) === MAX_REVEAL_DELAY &&
    clampRevealDelay(-1) === 0 &&
    clampRevealDelay(Number.NaN) === 0,
  "granicne vrednosti",
);

// ---------------------------------------------------------------------------
console.log("\n4. prefers-reduced-motion gasi sve osim neprozirnosti");
// ---------------------------------------------------------------------------

const reduceBlok = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
proveri(
  "globalno pravilo suzava prelaze na `opacity`",
  /transition-property:\s*opacity\s*!important/.test(reduceBlok),
  "nema `transition-property: opacity !important` u reduce bloku",
);
proveri(
  "pomeraj pri ulasku pada na 0",
  /--motion-distance:\s*0px/.test(reduceBlok),
  "nema --motion-distance: 0px",
);
proveri(
  "utiskivanje pod prstom (transform) nestaje",
  /--press-scale:\s*1\s*;/.test(reduceBlok),
  "nema --press-scale: 1",
);
proveri(
  "ulazni/izlazni keyframe-i gube pomeraj, skaliranje i rotaciju",
  ["--tw-enter-scale: 1", "--tw-exit-scale: 1", "--tw-enter-translate-y: 0", "--tw-exit-translate-y: 0"].every(
    (s) => reduceBlok.includes(s),
  ),
  "bar jedan tw- token nije neutralisan",
);

// Svaka komponenta pokreta mora da ima obe grane matchMedia-e — inace pod
// reduced-motion ostaje GSAP tvin koji CSS pravilo ne moze da zaustavi.
for (const fajl of ["reveal.tsx", "arrive.tsx", "materialize.tsx", "unfold.tsx", "count-up.tsx"]) {
  const src = citaj("components", "motion", fajl);
  proveri(
    `components/motion/${fajl} ima granu za reduced motion`,
    src.includes("MOTION_QUERIES") && src.includes("conditions?.still"),
    "nema `ctx.conditions?.still` granu",
  );
}

// ---------------------------------------------------------------------------
console.log("\n5. Prekidivi prelazi (A8 §1): prosireni red, fioka filtera, panel zvona");
// ---------------------------------------------------------------------------

const unfold = citaj("components", "motion", "unfold.tsx");
proveri(
  "Unfold zna za kontrolisan `open` (animira i izlazak)",
  /open\?:\s*boolean/.test(unfold) && unfold.includes("kontrolisan"),
  "nema `open` prop",
);
// Prekidivost je JEDNO svojstvo: bez `overwrite: "auto"` novi tvin se naslaže
// preko starog i visina poskoči. Zato se traži da ga nosi SVAKI `gsap.to` u
// komponenti, a ne da ga negde ima (komentar iznad se ne broji).
const tvinovi = unfold.split("gsap.to(").slice(1);
const bezOverwrite = tvinovi.filter((seg) => !seg.slice(0, 400).includes('overwrite: "auto"'));
proveri(
  'svaki tvin u Unfold-u je `overwrite: "auto"` (krece od zatecene vrednosti)',
  tvinovi.length >= 4 && bezOverwrite.length === 0,
  `tvinova=${tvinovi.length} bez overwrite=${bezOverwrite.length}`,
);
proveri(
  "prekinut izlazak se ne nulira pre ponovnog otvaranja",
  unfold.includes("gsap.isTweening(el)"),
  "nema provere `gsap.isTweening`",
);

const table = citaj("components", "app", "leadovi", "leads-table.tsx");
proveri(
  "prosireni red tabele ostaje montiran dok traje izlazak",
  table.includes("useSetExitLatch") && /<Unfold open=\{isExpanded\}>/.test(table),
  "nema kapije ili `Unfold open`",
);

const drawer = citaj("components", "app", "system", "side-drawer.tsx");
proveri(
  "fioka filtera koristi CSS PRELAZ, ne keyframe animaciju",
  drawer.includes("transition-[transform,opacity]") &&
    !/animate-(in|out)/.test(drawer),
  "fioka i dalje ima animate-in/animate-out",
);
proveri(
  "fioka zadrzava neprozirnost pod reduced motion",
  drawer.includes("data-starting-style:opacity-0") &&
    drawer.includes("data-closed:opacity-0"),
  "nema opacity u prelazu fioke",
);

const popover = citaj("components", "ui", "popover.tsx");
proveri(
  "panel zvona (Popover) koristi CSS PRELAZ, ne keyframe animaciju",
  popover.includes("transition-[opacity,scale]") && !/animate-(in|out)/.test(popover),
  "popover i dalje ima animate-in/animate-out",
);
proveri(
  "panel zvona ima i pocetno i zavrsno stanje (inace nema izlaska)",
  popover.includes("data-starting-style:") && popover.includes("data-closed:"),
  "nedostaje data-starting-style ili data-closed",
);

const bell = citaj("components", "app", "notifications-bell.tsx");
proveri(
  "„Sklonjeno” u zvonu se razmotava prekidivo",
  /<Unfold open=\{prikaziSklonjene\}>/.test(bell),
  "nema Unfold nad spiskom sklonjenih",
);

// ---------------------------------------------------------------------------
console.log("\n6. Odziv na radnju u ≤ 100 ms");
// ---------------------------------------------------------------------------

const pressBlok = css.slice(css.indexOf("Odziv na pritisak"));
proveri(
  "svako dugme dobija odziv na `:active`, ne na `click`",
  /:active[\s\S]{0,200}scale:\s*var\(--press-scale\)/.test(pressBlok),
  "nema pravila `:active { scale: var(--press-scale) }`",
);
proveri(
  "trajanje tog odziva je --duration-press",
  /transition-duration:\s*var\(--duration-press\)/.test(pressBlok),
  "odziv ne koristi --duration-press",
);
proveri(
  "sklanjanje stavke u zvonu je optimisticko (ne ceka server)",
  bell.includes("sklanjam") && /<Unfold open=\{!sklanjam\}>/.test(bell),
  "nema optimistickog stanja",
);
proveri(
  "neuspela mutacija vraca stavku i kaze zasto",
  /catch\s*\([\s\S]{0,120}setSklanjam\(false\)/.test(bell) && bell.includes("setGreska"),
  "greska se guta",
);

// ---------------------------------------------------------------------------
console.log("\n7. Brojaci prelaze, ne skacu");
// ---------------------------------------------------------------------------

const countUp = citaj("components", "motion", "count-up.tsx");
proveri(
  "svez podatak se PREĐE od stare do nove vrednosti",
  countUp.includes("const proxy = { v: prethodna }") && countUp.includes("duration: DUR_UI"),
  "nova vrednost se i dalje upisuje skokom",
);
proveri(
  "pod reduced motion se brojka upise odmah (cifre koje se vrte JESU pokret)",
  /conditions\?\.still[\s\S]{0,200}el\.textContent = format\(value\)/.test(countUp),
  "nema grane koja gasi odbrojavanje",
);
proveri(
  "red brojeva na „Danas” koristi CountUp",
  citaj("components", "app", "leadovi", "leads-today.tsx").includes("<CountUp"),
  "brojevi preseka i dalje skacu",
);
proveri(
  "KPI plocica koristi CountUp",
  citaj("components", "app", "system", "kpi-tile.tsx").includes("CountUp"),
  "KPI brojka i dalje skace",
);

// ---------------------------------------------------------------------------
console.log("\n8. Bez nove zavisnosti za pokret");
// ---------------------------------------------------------------------------

const pkg = JSON.parse(citaj("package.json")) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const svi = { ...pkg.dependencies, ...pkg.devDependencies };
for (const zabranjen of ["framer-motion", "motion", "react-spring", "@react-spring/web", "animejs", "auto-animate", "@formkit/auto-animate"]) {
  proveri(`nema zavisnosti \`${zabranjen}\``, !(zabranjen in svi), "dodata je nova biblioteka pokreta");
}
proveri("gsap i @gsap/react jesu u package.json", "gsap" in svi && "@gsap/react" in svi, "GSAP nedostaje");

// ---------------------------------------------------------------------------
console.log(pao === 0 ? "\nSVE PROLAZI\n" : `\n${pao} PROVERA NIJE PROSLA\n`);
process.exit(pao === 0 ? 0 : 1);
