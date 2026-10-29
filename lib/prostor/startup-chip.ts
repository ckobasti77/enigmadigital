// Preneto iz Devotion packages/shared/src/startup-chip.ts (main @ c05c40f), SPAJANJE S02.
/**
 * Čip startupa — potpisni detalj ličnog nivoa (PLAN §7): mala pločica sa
 * logom ili inicijalima i tonom izvedenim iz imena. Ista funkcija na webu i
 * telefonu, da isti startup svuda ima istu boju. Boja NIJE ovde — ton je
 * indeks tokena (`--startup-tone-1…8` na webu, `startupTones` na telefonu).
 */

export const STARTUP_TONES = 8;

/** Stabilan ton 0…7 iz imena (FNV-1a), nezavisan od velikih/malih slova. */
export function startupTone(name: string): number {
  const normalized = name.trim().toLowerCase();
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % STARTUP_TONES;
}

/** „Cluck Rush" → „CR", „Enigma" → „EN", prazno → „?". */
export function startupInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return "?";
  if (words.length === 1) {
    return Array.from(words[0]).slice(0, 2).join("").toUpperCase();
  }
  return (Array.from(words[0])[0] + Array.from(words[1])[0]).toUpperCase();
}
