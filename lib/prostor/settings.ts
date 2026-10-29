// Preneto iz Devotion packages/shared/src/settings.ts (main @ c05c40f), SPAJANJE S02.
/**
 * Podešavanja startupa (PROSTOR K20) — kartice, redosled oblasti, provere
 * naziva i tekstovi, isti na webu i telefonu. ČISTO: bez React-a i bez Convex
 * tipova. Ime, opis i logo menja samo admin; oblasti menja svaki član.
 */

export type SettingsTabKey = "opste" | "oblasti" | "tim" | "pozivnice" | "lozinke";

export const SETTINGS_TABS: ReadonlyArray<{ key: SettingsTabKey; label: string; adminOnly: boolean }> = [
  { key: "opste", label: "Opšte", adminOnly: false },
  { key: "oblasti", label: "Oblasti", adminOnly: false },
  { key: "tim", label: "Tim", adminOnly: false },
  { key: "pozivnice", label: "Pozivnice", adminOnly: true },
  { key: "lozinke", label: "Lozinke", adminOnly: true },
];

/** Kartice koje korisnik vidi: Pozivnice i Lozinke samo admin. */
export function visibleSettingsTabs(isAdmin: boolean) {
  return SETTINGS_TABS.filter((tab) => isAdmin || !tab.adminOnly);
}

/** Tražena kartica ako je korisniku dostupna, inače Opšte. */
export function resolveSettingsTab(requested: string | null | undefined, isAdmin: boolean): SettingsTabKey {
  const tab = visibleSettingsTabs(isAdmin).find((item) => item.key === requested);
  return tab ? tab.key : "opste";
}

/** Najduži naziv oblasti (isto kao server). */
export const AREA_LABEL_MAX = 100;
/** Najveći logo u bajtovima (isto kao server). */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export const SETTINGS_TEXT = {
  saved: "Sačuvano.",
  adminOnlyGeneral: "Naziv, opis i logo menja vlasnik projekta.",
  passwordsNote: "Važi za nalog u svim projektima.",
  areaEmpty: "Naziv ne može biti prazan.",
  areaCreated: "Oblast je dodata.",
  areaRenamed: "Oblast je preimenovana.",
  areasReordered: "Redosled je sačuvan.",
  memberAdded: "Član je dodat.",
  memberRemoved: "Član je uklonjen.",
  inviteCreated: "Pozivnica je napravljena.",
  inviteRevoked: "Pozivnica je opozvana.",
  linkCopied: "Link je kopiran.",
  logoRemoved: "Logo je uklonjen.",
  logoTooBig: "Logo može imati najviše 2 MB.",
  logoUploadFailed: "Logo nije poslat.",
  notSaved: "Promena nije sačuvana.",
} as const;

export type AreaLabelResult = { ok: true; label: string } | { ok: false; error: string };

/** Naziv oblasti bez viška razmaka; prazan ili predug se odbija pre slanja. */
export function cleanAreaLabel(value: string): AreaLabelResult {
  const label = value.trim();
  if (label.length === 0) return { ok: false, error: SETTINGS_TEXT.areaEmpty };
  if (label.length > AREA_LABEL_MAX) {
    return { ok: false, error: `Naziv može imati najviše ${AREA_LABEL_MAX} znakova.` };
  }
  return { ok: true, label };
}

/**
 * Novi redosled posle pomeranja stavke za jedno mesto (`-1` gore, `1` dole).
 * `null` kad se stavka ne može pomeriti (prva gore, poslednja dole).
 */
export function moveInOrder<T>(ids: ReadonlyArray<T>, index: number, direction: -1 | 1): T[] | null {
  const target = index + direction;
  if (index < 0 || index >= ids.length || target < 0 || target >= ids.length) return null;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Potvrda uklanjanja člana (menja ono što tim vidi, pa se pita). */
export function removeMemberQuestion(displayName: string): string {
  return `Ukloniti ${displayName} iz projekta? Gubi pristup odmah.`;
}

export function memberRoleLabel(role: "admin" | "member"): string {
  return role === "admin" ? "Admin" : "Član";
}

export type InviteStatus = "active" | "claimed" | "revoked" | "expired";

export function inviteStatus(
  invite: { claimedAt: number | null; revokedAt: number | null; expiresAt: number },
  now: number,
): InviteStatus {
  if (invite.claimedAt !== null) return "claimed";
  if (invite.revokedAt !== null) return "revoked";
  return invite.expiresAt <= now ? "expired" : "active";
}

export const INVITE_STATUS_LABEL: Record<InviteStatus, string> = {
  active: "Aktivna",
  claimed: "Prihvaćena",
  revoked: "Opozvana",
  expired: "Istekla",
};

/** Pozivnica se može opozvati samo dok je aktivna. */
export function canRevokeInvite(status: InviteStatus): boolean {
  return status === "active";
}
