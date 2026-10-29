// Preneto iz Devotion apps/web/hooks/use-push-notifications.ts i
// components/workspace/notifications-panel.tsx (main @ c05c40f), SPAJANJE S17.
/**
 * Web push na ovom uređaju — ČISTO (vitest): stanje prekidača, tekstovi i
 * pretvaranje javnog VAPID ključa. Kuka `use-push-notifications.ts` čita
 * pregledač i zove ovo.
 *
 * Bez javnog ključa (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`) web push nije podešen:
 * prekidač se ne prikazuje i ništa se ne registruje (plan S07 §10 S17).
 */

export type PushState =
  /** Pregledač ne podržava push (npr. iOS Safari bez dodate aplikacije). */
  | "unsupported"
  /** Nema javnog VAPID ključa: push nije podešen, prekidač se ne crta. */
  | "unconfigured"
  | "checking"
  /** Dozvola nije ni tražena. */
  | "idle"
  /** Dozvola data, ali ovaj uređaj nije pretplaćen. */
  | "permitted"
  | "enabled"
  /** Korisnik je blokirao obaveštenja; ponovno traženje iz koda nije moguće. */
  | "blocked";

export type PushUlaz = {
  podrzano: boolean;
  javniKljuc: string;
  dozvola: "default" | "denied" | "granted";
  pretplacen: boolean;
};

/** Javni ključ je podešen (prazan string ili samo razmaci se ne računaju). */
export function pushPodesen(javniKljuc: string | undefined | null): boolean {
  return (javniKljuc ?? "").trim().length > 0;
}

/** Stanje prekidača redom provera kao Devotion: podrška → ključ → dozvola → pretplata. */
export function stanjePusha(ulaz: PushUlaz): PushState {
  if (!ulaz.podrzano) return "unsupported";
  if (!pushPodesen(ulaz.javniKljuc)) return "unconfigured";
  if (ulaz.dozvola === "denied") return "blocked";
  if (ulaz.dozvola === "default") return "idle";
  return ulaz.pretplacen ? "enabled" : "permitted";
}

/** Može li se uključiti sa ovog stanja (dugme „Uključi obaveštenja“). */
export function mozeUkljuciti(stanje: PushState): boolean {
  return stanje === "idle" || stanje === "permitted";
}

/**
 * Tekst prekidača po stanju. `checking` i `unconfigured` nemaju tekst: prvo
 * se čeka, a drugo se ne prikazuje uopšte.
 */
export const PUSH_TEKST: Record<PushState, { naslov: string; opis: string } | null> = {
  checking: null,
  unconfigured: null,
  unsupported: {
    naslov: "Ovaj pregledač ne može da prima obaveštenja",
    opis: "Otvori aplikaciju u Chrome-u na računaru ili je dodaj na početni ekran telefona.",
  },
  idle: {
    naslov: "Obaveštenja na ovom uređaju",
    opis: "Zvuk i poruka i kad je aplikacija zatvorena: dodele, rokovi, pominjanja i poruke.",
  },
  permitted: {
    naslov: "Obaveštenja na ovom uređaju",
    opis: "Dozvola postoji, ali ovaj uređaj još nije prijavljen za prijem.",
  },
  enabled: {
    naslov: "Obaveštenja su uključena",
    opis: "Ovaj uređaj prima obaveštenja i kad je aplikacija zatvorena.",
  },
  blocked: {
    naslov: "Obaveštenja su blokirana u pregledaču",
    opis: "Klikni na ikonicu levo od adrese, izaberi Obaveštenja i prebaci na „Dozvoli“, pa osveži stranu.",
  },
};

/** VAPID ključ stiže kao base64url tekst, a `PushManager` traži bajtove. */
export function base64UrlUBajtove(base64Url: string): Uint8Array<ArrayBuffer> {
  const dopuna = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + dopuna).replace(/-/g, "+").replace(/_/g, "/");
  const sirovo = atob(base64);
  const izlaz = new Uint8Array(new ArrayBuffer(sirovo.length));
  for (let i = 0; i < sirovo.length; i += 1) izlaz[i] = sirovo.charCodeAt(i);
  return izlaz;
}
