/**
 * Koje kartice podešavanja projekta vidi koja uloga (SPAJANJE S21, P9). Čisto:
 * stranica `settings` samo filtrira spisak kartica kroz ovu funkciju, a
 * backend iste izmene već odbija (ovo samo ne nudi ono što bi puklo).
 *
 * - „Sajt i oglasi“ i „Pristup“: samo vlasnik projekta.
 * - „Integracije“: ne vidi ih posmatrač (urednik vidi stanje veza).
 * - „Oblasti“: urednik i vlasnik (posmatrač ne vidi radni deo).
 * - „Lozinke“ i „AI“: vlasnik projekta koji je ujedno vlasnik platforme.
 * - Dok uloga nije stigla (`null`) crtaju se sve kartice osim „Lozinke“ i „AI“.
 */
import type { Uloga } from "../../../convex/lib/uloge";

export type KarticaPodesavanja =
  | "integracije"
  | "projekat"
  | "oblasti"
  | "sajt"
  | "mozak"
  | "ai"
  | "pristup"
  | "lozinke"
  | "istorija"
  | "moderacija"
  | "napredak";

export function vidiKarticu(
  kartica: KarticaPodesavanja,
  uloga: Uloga | null,
  platformaVlasnik: boolean,
): boolean {
  if (kartica === "lozinke" || kartica === "ai") return uloga === "owner" && platformaVlasnik;
  if (uloga === null || uloga === "owner") return true;
  if (kartica === "sajt" || kartica === "pristup") return false;
  if (uloga === "client_viewer") return kartica !== "integracije" && kartica !== "oblasti";
  return true;
}
