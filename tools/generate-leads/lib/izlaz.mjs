/**
 * ============================================================================
 * RADNI FOLDER RUNA (`out/<run-id>/`) i ispis
 * ============================================================================
 *
 * Jedan run = jedan folder. U njemu:
 *
 *   run.json        stanje runa (grad, niša, broj, filter, Places pozivi…)
 *   kandidati.json  Places rezultati — PRIVREMENO, briše se na kraju runa (§3)
 *   firme.json      ono što je Claude pročitao sa stranica; ulaz za skor i slanje
 *   payload.json    telo koje je poslato (ili bi bilo poslato uz --dry-run)
 *   nisa-opis.txt   predlog opisa niše, koji ingest šema ne prenosi
 *
 * `out/` je u `.gitignore` — u njemu su imena, telefoni i mejlovi stvarnih
 * ljudi i to ne sme da uđe u repo (§0 pravilo 6).
 *
 * Pisanje je „prvo .tmp pa rename": prekinut run ne sme da ostavi pola JSON-a
 * koje sledeća komanda pročita kao prazan spisak firmi.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OVDE = dirname(fileURLToPath(import.meta.url));

/** `tools/generate-leads/` — koren alata, bez obzira odakle je pozvan. */
export const KOREN = resolve(OVDE, "..");

export const OUT = join(KOREN, "out");

export function putanjaRuna(runId) {
  return join(OUT, runId);
}

export function napraviRun(runId) {
  const dir = putanjaRuna(runId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function upisiJson(runId, ime, podaci) {
  const dir = putanjaRuna(runId);
  mkdirSync(dir, { recursive: true });
  const cilj = join(dir, ime);
  const privremeni = `${cilj}.tmp`;
  writeFileSync(privremeni, `${JSON.stringify(podaci, null, 2)}\n`, "utf8");
  renameSync(privremeni, cilj);
  return cilj;
}

export function upisiTekst(runId, ime, tekst) {
  const dir = putanjaRuna(runId);
  mkdirSync(dir, { recursive: true });
  const cilj = join(dir, ime);
  writeFileSync(cilj, tekst.endsWith("\n") ? tekst : `${tekst}\n`, "utf8");
  return cilj;
}

export function postojiFajl(runId, ime) {
  return existsSync(join(putanjaRuna(runId), ime));
}

/**
 * Čita JSON runa. Fajl koji ne postoji i fajl koji je pokvaren su DVE različite
 * poruke: prvo znači „nisi pokrenuo prethodni korak", drugo „neko ga je ručno
 * menjao i pokvario".
 */
export function citajJson(runId, ime) {
  const putanja = join(putanjaRuna(runId), ime);
  if (!existsSync(putanja)) {
    throw new Error(
      `Nema ${ime} u out/${runId}/. Pokreni prethodni korak (vidi README) ili proveri --run.`,
    );
  }
  const sirovo = readFileSync(putanja, "utf8");
  try {
    return JSON.parse(sirovo);
  } catch (err) {
    throw new Error(`out/${runId}/${ime} nije ispravan JSON: ${err.message}`);
  }
}

/** Briše `kandidati.json` — Places podaci ne žive posle runa (§3, §O3). */
export function obrisiKandidate(runId) {
  const putanja = join(putanjaRuna(runId), "kandidati.json");
  if (!existsSync(putanja)) return false;
  rmSync(putanja);
  return true;
}

/** Id runa: `2026-09-08-beograd-frizerski-saloni`. Čitljiv i sortabilan. */
export function napraviRunId(datum, gradSlug, nisaSlug) {
  const d = datum.toISOString().slice(0, 10);
  return `${d}-${gradSlug}-${nisaSlug}`;
}

export function ispisi(poruka = "") {
  process.stdout.write(`${poruka}\n`);
}

export function ispisiGresku(poruka) {
  process.stderr.write(`${poruka}\n`);
}
