import type { LinkChipVrsta } from "@/components/app/link-chip";

/**
 * Iz `leadIdentities` reda u props za `LinkChip` (GL2, §7.2).
 *
 * `value` u bazi je ono što je izvor dao: čas pun URL, čas `@handle`, čas gol
 * domen. Ovde se to jednom pretvara u adresu, umesto da svaki ekran pogađa.
 * Vrednost koja se ne da pretvoriti u adresu vraća `null` — mrtav link je gori
 * od nikakvog.
 */

const OSNOVE: Partial<Record<LinkChipVrsta, string>> = {
  instagram: "https://www.instagram.com/",
  facebook: "https://www.facebook.com/",
  tiktok: "https://www.tiktok.com/@",
  threads: "https://www.threads.net/@",
};

export function identityKindToVrsta(kind: string): LinkChipVrsta | null {
  switch (kind) {
    case "instagram":
    case "facebook":
    case "tiktok":
    case "threads":
    case "website":
    case "phone":
    case "email":
      return kind;
    default:
      return null;
  }
}

export function platformHref(vrsta: LinkChipVrsta, value: string): string | null {
  const clean = value.trim();
  if (!clean) return null;

  if (vrsta === "phone" || vrsta === "email") return null; // ide kroz telHref/mailHref
  if (/^https?:\/\//i.test(clean)) return clean;

  if (vrsta === "website") {
    // Domen bez sheme. `https` je namerno podrazumevano: sajt koji radi samo
    // na `http` biće preusmeren, a obrnuto ne bi bilo.
    return `https://${clean.replace(/^\/+/, "")}`;
  }

  const osnova = OSNOVE[vrsta];
  if (!osnova) return null;
  const handle = clean.replace(/^@/, "").replace(/^\/+/, "");
  if (!handle) return null;
  return `${osnova}${handle}`;
}

/** Google Maps link iz `placeId` — jedino Places polje koje smemo da čuvamo (§3). */
export function googleMapsHref(placeId?: string): string | null {
  const clean = placeId?.trim();
  if (!clean) return null;
  return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(clean)}`;
}
