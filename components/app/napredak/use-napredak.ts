"use client";

import { useSyncExternalStore } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { nizUOpasnosti } from "@/convex/lib/napredak";
import type { PlayerProgress } from "@/components/app/system/player-card";
import { useWorkspace } from "@/components/app/workspace-provider";

/**
 * ============================================================================
 * NAPREDAK — JEDAN IZVOR ZA SVE POVRŠINE (UI Boost §6)
 * ============================================================================
 *
 * Kartica igrača, ⌘K, ekran `/napredak`, Podešavanja i povratna informacija
 * (toast, nov nivo) čitaju ISTI upit sa istim argumentom. Convex klijent
 * deduplikuje pretplatu po (funkcija, argumenti), pa pet površina košta
 * koliko i jedna.
 *
 * Upit NE čita sat — „danas" je dan koji je poslednji put zamrznut. Sve što
 * zavisi od trenutka (niz „u opasnosti" posle 17 h, prelazak u novi dan)
 * računa se ovde, iz `useSada()`.
 *
 * GREŠKA UPITA NE SME DA OBORI LJUSKU. Kartica igrača, ⌘K i hook za nagrade
 * žive u ljusci, na svakom ekranu; da svako od njih zove `useQuery`, jedan
 * pad upita bi srušio celu aplikaciju. Zato postoji tačno JEDNA pretplata
 * (`NapredakIzvor`, iza granice greške), koja rezultat upisuje ovde, a svi
 * ostali čitaju odavde i ne mogu da bace. Kad upit padne, `useNapredak()`
 * vraća `undefined` (kartica ostaje identitet, misija nema), a
 * `useNapredakPao()` kaže ekranu da to nije učitavanje nego kvar.
 */

export type NapredakStanje = FunctionReturnType<typeof api.napredak.stanje>;
export type NapredakUkljucen = Extract<NapredakStanje, { ukljucen: true }>;
export type NapredakProfil = FunctionReturnType<typeof api.napredak.profil>;
export type Misija = NapredakUkljucen["misije"][number];

// ── jedan izvor ──────────────────────────────────────────────────────────────

type Izvor = { stanje: NapredakStanje | undefined; pao: boolean };

const PRAZAN_IZVOR: Izvor = { stanje: undefined, pao: false };
let izvor: Izvor = PRAZAN_IZVOR;
const citaoci = new Set<() => void>();

/** Upisuje ga samo `NapredakIzvor` (pretplata i njena granica greške). */
export function postaviIzvorNapretka(sledeci: Izvor | null): void {
  izvor = sledeci ?? PRAZAN_IZVOR;
  for (const javi of citaoci) javi();
}

function prijaviIzvor(javi: () => void): () => void {
  citaoci.add(javi);
  return () => {
    citaoci.delete(javi);
  };
}

/**
 * Pretplata na `napredak.stanje`. Zove je SAMO `NapredakIzvor`; svi ostali
 * čitaju `useNapredak()`. Ovaj hook baca kad upit padne — zato i stoji iza
 * granice.
 */
export function useNapredakPretplata(): NapredakStanje | undefined {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id as Id<"workspaces"> | undefined;
  return useQuery(api.napredak.stanje, workspaceId ? { workspaceId } : "skip");
}

/**
 * `undefined` dok se ne zna radni prostor, dok odgovor ne stigne — ili kad je
 * upit pao (vidi `useNapredakPao`). Nikad ne baca.
 */
export function useNapredak(): NapredakStanje | undefined {
  return useSyncExternalStore(
    prijaviIzvor,
    () => izvor.stanje,
    () => undefined,
  );
}

/** Upit je pao: `undefined` iz `useNapredak()` tada nije učitavanje. */
export function useNapredakPao(): boolean {
  return useSyncExternalStore(
    prijaviIzvor,
    () => izvor.pao,
    () => false,
  );
}

// ── zastoj zamrzavanja ───────────────────────────────────────────────────────

let zastoj = false;

/**
 * Današnji dan nije mogao da se otvori (`zamrzniDan` je pao i posle ponovnih
 * pokušaja). Upisuje ga hook za nagrade; ekran po njemu razlikuje „sabiram"
 * od „ne ide" — skeleton koji nikad ne prođe bio bi laž.
 */
export function postaviZastojNapretka(sledeci: boolean): void {
  if (zastoj === sledeci) return;
  zastoj = sledeci;
  for (const javi of citaoci) javi();
}

export function useNapredakZastoj(): boolean {
  return useSyncExternalStore(
    prijaviIzvor,
    () => zastoj,
    () => false,
  );
}

/** Samo na ekranu Napredak, i tamo iza granice greške — ovaj hook baca. */
export function useNapredakProfil(): NapredakProfil | undefined {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id as Id<"workspaces"> | undefined;
  return useQuery(api.napredak.profil, workspaceId ? { workspaceId } : "skip");
}

// ── sat ──────────────────────────────────────────────────────────────────────

const MINUT = 60_000;
/** Koliko često se proverava da li je minut prošao. */
const KORAK_MS = 15_000;

let sada = Date.now();
const slusaoci = new Set<() => void>();
let tajmer: ReturnType<typeof setInterval> | null = null;

function osvezi(): void {
  const t = Date.now();
  if (Math.floor(t / MINUT) === Math.floor(sada / MINUT)) return;
  sada = t;
  for (const javi of slusaoci) javi();
}

function prijaviSat(javi: () => void): () => void {
  slusaoci.add(javi);
  // Modul je možda učitan davno pre prvog čitaoca; React posle prijave sam
  // ponovo uzme snimak.
  sada = Date.now();
  if (tajmer === null) {
    tajmer = setInterval(osvezi, KORAK_MS);
    // Tab koji se vraća iz pozadine ne čeka sledeći otkucaj.
    document.addEventListener("visibilitychange", osvezi);
  }
  return () => {
    slusaoci.delete(javi);
    if (slusaoci.size === 0 && tajmer !== null) {
      clearInterval(tajmer);
      tajmer = null;
      document.removeEventListener("visibilitychange", osvezi);
    }
  };
}

/**
 * Trenutak, sa tačnošću od minuta. Jedan tajmer za sve čitaoce; menja se
 * najviše jednom u minutu, pa ništa ne crta ponovo bez razloga. Na serveru je
 * `0` — čitaoci to tretiraju kao „ne zna se".
 */
export function useSada(): number {
  return useSyncExternalStore(prijaviSat, () => sada, () => 0);
}

function prijaviVidljivost(javi: () => void): () => void {
  document.addEventListener("visibilitychange", javi);
  return () => document.removeEventListener("visibilitychange", javi);
}

/** Da li je tab vidljiv. Skriven tab ne dobija ni toast ni proslavu. */
export function useVidljivo(): boolean {
  return useSyncExternalStore(
    prijaviVidljivost,
    () => document.visibilityState === "visible",
    () => true,
  );
}

// ── izvedeno za prikaz ───────────────────────────────────────────────────────

export function stanjeNiza(
  niz: NapredakUkljucen["niz"],
  now: number,
): "active" | "at-risk" | "idle" {
  if (niz.dani <= 0) return "idle";
  return now > 0 && nizUOpasnosti(niz, now) ? "at-risk" : "active";
}

/**
 * Šta kartica igrača crta. `undefined` = identitet (podatak još nije stigao
 * ili dan još nije zamrznut — tada je XP donja granica i ne prikazuje se).
 */
export function napredakZaKarticu(
  stanje: NapredakStanje | undefined,
  now: number,
): PlayerProgress | "off" | undefined {
  if (stanje === undefined) return undefined;
  if (!stanje.ukljucen) return "off";
  if (!stanje.spremno) return undefined;
  return {
    rank: stanje.nivo.zvanje,
    level: stanje.nivo.broj,
    tier: stanje.nivo.rang,
    xp: stanje.xp.ukupno,
    xpFrom: stanje.nivo.xpOd,
    xpTo: stanje.nivo.xpDo,
    streakDays: stanje.niz.dani,
    streakState: stanjeNiza(stanje.niz, now),
  };
}
