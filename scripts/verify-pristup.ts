/**
 * ============================================================================
 * ČUVAR PRISTUPA: nijedna javna Convex funkcija mimo omotača projekta
 * ============================================================================
 *
 * Pokretanje:
 *
 *   npm run verify:pristup
 *   node --import ./scripts/ts-hooks.mjs scripts/verify-pristup.ts
 *
 * 1. Backend (strogo, od C07): prolazi kroz sve `.ts` fajlove u `convex/` (bez
 *    `_generated/` i testova) i pada za svaku javnu `query` / `mutation` /
 *    `action` koja nije napravljena omotačem iz `convex/lib/projekat.ts`
 *    (`projekat*`, `prijavljen*`, `platforma*`) niti ima komentar
 *    `// javno: <razlog>` u liniji tačno iznad definicije.
 * 2. Front: u `app/`, `components/` i `lib/` direktan `useQuery/useMutation/
 *    useAction(api.…)` (i `client.query/mutation/action(api.…)` u serverskim
 *    rutama) dozvoljen je samo za funkcije bez projekta sa spiska ispod. Sve
 *    ostalo ide kroz `useProjekatQuery/Mutation/Action`.
 *
 * Pravila su u `lib/pristup-cuvar.ts` i `lib/front-cuvar.ts` (testovi pored).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { proveriFront, proveriSpisak } from "../lib/front-cuvar";
import { convexPreskace, proveriPristup, type IzvorniFajl } from "../lib/pristup-cuvar";

/**
 * Funkcije bez projekta koje front sme da zove direktno (plan C02 §5.4).
 * Ključ je `modul.funkcija` kako ga vidi `api`; svaka stavka ima razlog.
 * Skripta proverava i da je svaka stavka zaista javna funkcija BEZ projekta.
 */
const DOZVOLJENI_DIREKTNI: Readonly<Record<string, string>> = {
  "projekti.mojiProjekti":
    "spisak projekata prijavljenog korisnika; provider iz njega bira projekat, pa ga ne može zvati kroz projekat",
  "projekti.mojProjekat":
    "provider razrešava projekat po slugu; tuđ i nepostojeći slug daju null",
  "projekti.ja": "nalog prijavljenog korisnika (meni korisnika); radi i u hubu, bez projekta",
  "projekti.kreirajProjekat": "pravljenje novog projekta (vlasnik platforme); projekat još ne postoji",
  "projekti.proveriSlug":
    "čarobnjak novog projekta (vlasnik platforme) proverava adresu dok se kuca; projekat još ne postoji",
  "projekti.javniBrend":
    "ekran prijave na panel domenu (serverska strana, pre prijave): samo ime, boja i logo mapiranog hosta",
  "projekti.stanjeProjekata":
    "birač projekta: tačka veza i broj „šta me čeka“ za sve projekte prijavljenog korisnika; čita samo njegova članstva",
  "invitesStore.getInvite": "ekran pozivnice pre registracije; pristup dokazuje token, nalog još ne postoji",
  "invitesStore.pripremiRegistraciju": "registracija preko pozivnice; pristup dokazuje token",
  "invitesStore.trebaSetup": "ekran prijave pita da li treba prvi admin nalog; vraća samo da/ne",
  "invitesStore.pripremiAdminSetup": "prvi admin nalog; pristup dokazuje ADMIN_SETUP_CODE",
  "invitesStore.prihvatiPozivnicu":
    "prijavljen korisnik prihvata pozivnicu u drugi projekat; projekat nosi token pozivnice, a adresa mora da se poklapa",
  "postsPublic.listPublished": "javni blog sajta po slugu projekta; samo objavljene objave",
  "webhookHealth.status": "stanje webhook-a cele platforme; samo vlasnik platforme",
  "facebook.completeOAuthFromCallback": "OAuth povratak (serverska ruta); projekat nosi potpisano OAuth stanje",
  "gbp.completeOAuthFromCallback": "OAuth povratak (serverska ruta); projekat nosi potpisano OAuth stanje",
  "instagram.completeOAuthFromCallback": "OAuth povratak (serverska ruta); projekat nosi potpisano OAuth stanje",
  "threads.completeOAuthFromCallback": "OAuth povratak (serverska ruta); projekat nosi potpisano OAuth stanje",
  "youtube.completeOAuthFromCallback": "OAuth povratak (serverska ruta); projekat nosi potpisano OAuth stanje",
  "threadsStore.getDeletionStatus": "javna strana statusa brisanja podataka po kodu potvrde",
  "oauthPovratak.procitaj":
    "OAuth povratak (serverska ruta, pre razmene): adresa panela iz jednokratnog state-a, proverena na serveru",
  "oauthPovratak.stanje":
    "kartica Integracije pita da li je OAUTH_CALLBACK_ORIGIN podešen na serveru; vraća samo da/ne",
  "napredak.stanje":
    "lični napredak preko svih projekata (P12): XP, niz i misije iz projekata u kojima je korisnik član",
  "napredak.profil": "lični napredak preko svih projekata (P12): dostignuća, rekordi i mapa aktivnosti",
  "napredak.podesi": "lična podešavanja napretka (P12); važe u svim projektima korisnika",
  "napredak.potvrdi": "lične potvrde viđenih proslava napretka (P12)",
  "napredak.zamrzniDan":
    "lični dan napretka (P12); misije bira iz projekata u kojima je korisnik urednik ili vlasnik",
  // SPAJANJE S09 (plan S07 §3.2): ljuska u oba opsega i profil radnog dela.
  "prostor.profiles.ensureCurrent": "lični profil radnog dela (P6): kapija prijave ga pravi lenjo, posle prijave",
  "prostor.profiles.getCurrent": "lični profil i avatar (P6): traka, meni korisnika i dijalog profila",
  "prostor.profiles.updateCurrent": "lični profil (P6): ime koje tim vidi, menja ga samo vlasnik profila",
  "prostor.storage.generateAvatarUploadUrl": "lični avatar (P6): dozvola za otpremanje slike sopstvenog profila",
  "prostor.storage.setAvatar": "lični avatar (P6): slika sopstvenog profila, uz jednokratnu dozvolu",
  "prostor.storage.removeAvatar": "lični avatar (P6): uklanja sliku sopstvenog profila",
  "prostor.inbox.unreadCounts":
    "bedž „Ja“ u traci: nepročitano iz mojih projekata (lična obaveštenja, opseg mojih projekata)",
  "prostor.chat.unreadSummary":
    "bedž „Ja“ u traci i ćelija Poruke: nepročitane poruke iz mojih razgovora",
  "prostor.myDay.overview": "broj Danas u meniju „Ja“: moj dan kroz sve moje projekte (opseg 50)",
  // S12 (plan S07 §3.2): panel zadatka i radnje reda.
  "prostor.myDay.plan": "panel zadatka i red: „Dodaj u Moj dan“ — lični plan dana",
  "prostor.myDay.unplan": "panel zadatka i red: „Ukloni iz Moj dan“ — lični plan dana",
  "prostor.personalTasks.get": "panel zadatka: lični zadatak (bez projekta)",
  "prostor.personalTasks.update": "panel zadatka: izmena ličnog zadatka (bez projekta)",
  "prostor.personalTasks.setStatus": "panel zadatka: završi lični zadatak (bez projekta)",
  "prostor.personalTasks.archive": "panel zadatka: obriši lični zadatak (bez projekta)",
  "prostor.personalTasks.restore": "panel zadatka: „Poništi“ brisanje ličnog zadatka (bez projekta)",
};

const koren = fileURLToPath(new URL("../", import.meta.url));
const korenConvex = join(koren, "convex");

function skupiConvex(dir: string, izlaz: IzvorniFajl[]): void {
  for (const ulaz of readdirSync(dir, { withFileTypes: true })) {
    const puna = join(dir, ulaz.name);
    if (ulaz.isDirectory()) {
      if (ulaz.name === "_generated" || ulaz.name === "node_modules") continue;
      skupiConvex(puna, izlaz);
      continue;
    }
    if (!/\.tsx?$/.test(ulaz.name)) continue;
    if (/\.(test|spec)\.tsx?$/.test(ulaz.name) || ulaz.name.endsWith(".d.ts")) continue;
    // Convex ne deployuje fajl sa više tačaka u imenu (npr. `*.pomoc.ts`).
    if (convexPreskace(ulaz.name)) continue;
    izlaz.push({
      putanja: relative(korenConvex, puna).replace(/\\/g, "/"),
      tekst: readFileSync(puna, "utf8"),
    });
  }
}

function skupiFront(dir: string, izlaz: IzvorniFajl[]): void {
  for (const ulaz of readdirSync(dir, { withFileTypes: true })) {
    const puna = join(dir, ulaz.name);
    if (ulaz.isDirectory()) {
      if (ulaz.name === "node_modules" || ulaz.name.startsWith(".")) continue;
      skupiFront(puna, izlaz);
      continue;
    }
    if (!/\.tsx?$/.test(ulaz.name) || ulaz.name.endsWith(".d.ts")) continue;
    izlaz.push({
      putanja: relative(koren, puna).replace(/\\/g, "/"),
      tekst: readFileSync(puna, "utf8"),
    });
  }
}

let pada = false;

// ── 1. Backend ───────────────────────────────────────────────────────────────
const convexFajlovi: IzvorniFajl[] = [];
skupiConvex(korenConvex, convexFajlovi);
const rezultat = proveriPristup(convexFajlovi);

const ukupno =
  rezultat.omotacem.length + rezultat.javne.length + rezultat.pale.length;
console.log(
  `Javnih Convex funkcija: ${ukupno} (omotačem ${rezultat.omotacem.length}, ` +
    `označene kao javne ${rezultat.javne.length}, bez omotača ${rezultat.pale.length}).`,
);
for (const j of rezultat.javne) {
  console.log(`  javno  convex/${j.putanja}:${j.linija} ${j.ime} — ${j.obrazlozenje}`);
}

if (rezultat.pale.length > 0) {
  pada = true;
  console.error("\nJavne funkcije mimo omotača projekta:");
  for (const p of rezultat.pale) {
    console.error(`  convex/${p.putanja}:${p.linija} ${p.ime} (${p.vrsta}) — ${p.razlog}`);
  }
  console.error(
    "\nNapravi funkciju omotačem iz convex/lib/projekat.ts (projekatQuery/Mutation/Action, " +
      "prijavljen*, platforma*), pretvori je u internu, ili (samo kad namerno radi bez " +
      "prijave) dodaj `// javno: <razlog>` u liniju iznad.",
  );
}

// ── 2. Front ─────────────────────────────────────────────────────────────────
const frontFajlovi: IzvorniFajl[] = [];
for (const dir of ["app", "components", "lib"]) skupiFront(join(koren, dir), frontFajlovi);
const front = proveriFront(frontFajlovi, DOZVOLJENI_DIREKTNI);
const spisak = proveriSpisak(DOZVOLJENI_DIREKTNI, rezultat);

console.log(
  `\nDirektnih poziva Convex funkcija na frontu: ${front.dozvoljeni.length + front.pali.length} ` +
    `(sa spiska funkcija bez projekta ${front.dozvoljeni.length}, nedozvoljenih ${front.pali.length}).`,
);
for (const d of front.dozvoljeni) {
  console.log(`  ${d.putanja}:${d.linija} ${d.nacin}(api.${d.funkcija})`);
}

if (spisak.length > 0) {
  pada = true;
  console.error("\nNeispravne stavke spiska dozvoljenih direktnih poziva:");
  for (const g of spisak) console.error(`  ${g.funkcija} — ${g.razlog}`);
}
if (front.pali.length > 0) {
  pada = true;
  console.error("\nDirektni pozivi funkcija projekta mimo useProjekat* hookova:");
  for (const p of front.pali) {
    console.error(`  ${p.putanja}:${p.linija} ${p.nacin}(api.${p.funkcija}) — ${p.razlog}`);
  }
}

if (pada) process.exit(1);
console.log(
  "\nČuvar pristupa: svaka javna funkcija ide kroz omotač ili je označena, " +
    "a front zove funkcije projekta samo kroz useProjekat* hookove.",
);
