"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { KOLACIC_PROJEKAT, jeIspravanSlug } from "@/lib/rutiranje";
import { countOpenByStartup, fromOverview, groupMyDay } from "@/lib/prostor/my-day";
import { railBadges, type RailBadges } from "@/lib/prostor/web/opseg";
import { useToday } from "./prostor/zajednicko/use-danas";
import { initialsOf } from "./system/player-card";
import { useSada } from "./napredak/use-napredak";

/**
 * ============================================================================
 * PODACI LJUSKE U OBA OPSEGA (SPAJANJE P14, plan S07 §2.4, §11.1)
 * ============================================================================
 *
 * Traka, meni „Ja“, zvono u „Ja“ i donja traka čitaju iste lične upite, pa ih
 * Convex klijent svodi na jednu pretplatu po upitu: spisak projekata, nalog,
 * profil radnog dela, nepročitano (Inbox + poruke) i stanje projekata.
 *
 * Upiti radnog dela traže profil. Profil nastaje lenjo (`ensureCurrent` u
 * kapiji prijave), pa nepročitano čeka da profil postoji: inače bi prvi ulaz
 * novog naloga bacio grešku i bedž bi ostao ugašen do sledeće navigacije.
 * Ko ipak čita nešto što ume da pukne, stoji iza `QuietBoundary`.
 */

/** Isti pomeraj kao zvono (`use-sta-me-ceka.ts`), da broj bude isti. */
const POMERAJ_MIN = -new Date().getTimezoneOffset();

export type ProjekatTrake = {
  workspaceId: Id<"workspaces">;
  slug: string;
  ime: string;
  boja: string | null;
  logoUrl: string | null;
  uloga: "owner" | "urednik" | "client_viewer";
  moduli: string[] | null;
};

/**
 * Moji projekti za traku i spiskove „Ja“, redom članstva. Arhiviran projekat
 * nije za brzi prelazak (ostaje u „Svi projekti“), osim tekućeg, da izabrana
 * pločica uvek ima gde da stoji. `undefined` dok se čita.
 */
export function useProjektiTrake(tekuciSlug: string | null): ProjekatTrake[] | undefined {
  const projekti = useQuery(api.projekti.mojiProjekti);
  return useMemo(
    () =>
      projekti
        ?.filter((p) => !p.arhiviran || p.slug === tekuciSlug)
        .map((p) => ({
          workspaceId: p.workspaceId,
          slug: p.slug,
          ime: p.ime,
          boja: p.boja,
          logoUrl: p.logoUrl,
          uloga: p.uloga,
          moduli: p.moduli,
        })),
    [projekti, tekuciSlug],
  );
}

export type JaNalog = {
  ime: string;
  email: string | null;
  inicijali: string;
  avatarUrl: string | null;
  platformaVlasnik: boolean;
  /** Profil radnog dela postoji (posmatrač ga nema, O5). */
  imaProfil: boolean;
};

/**
 * Nalog i profil prijavljenog korisnika: ime iz profila radnog dela (ime koje
 * tim vidi), a dok ga nema iz naloga. `undefined` dok se čita.
 */
export function useJaNalog(): JaNalog | undefined {
  const ja = useQuery(api.projekti.ja);
  const profil = useQuery(api.prostor.profiles.getCurrent);
  return useMemo(() => {
    if (ja === undefined) return undefined;
    const ime = profil?.displayName ?? ja.ime ?? ja.email ?? "Nalog";
    return {
      ime,
      email: profil?.email ?? ja.email,
      inicijali: initialsOf(profil?.displayName ?? ja.ime ?? ja.email),
      avatarUrl: profil?.avatarUrl ?? null,
      platformaVlasnik: ja.platformaVlasnik,
      imaProfil: profil !== undefined && profil !== null,
    };
  }, [ja, profil]);
}

/**
 * Nepročitano za traku i meni „Ja“: zbir Inboxa i poruka i tačka po
 * projektu. Čeka profil (vidi gore). Baca kad upit padne — pozivalac je iza
 * `QuietBoundary`.
 */
export function useNeprocitano(): {
  bedzevi: RailBadges;
  inbox: { count: number; capped: boolean } | null;
  poruke: number | null;
  /** Nepročitane poruke po projektu (`workspaceId` → broj). */
  porukePoProjektu: Record<string, number>;
} {
  const profil = useQuery(api.prostor.profiles.getCurrent);
  const ima = profil !== undefined && profil !== null;
  const inbox = useQuery(api.prostor.inbox.unreadCounts, ima ? {} : "skip");
  const chat = useQuery(api.prostor.chat.unreadSummary, ima ? {} : "skip");
  return useMemo(
    () => ({
      bedzevi: railBadges(inbox, chat),
      inbox: inbox ? inbox.total : null,
      poruke: chat ? chat.total.unreadCount : null,
      porukePoProjektu: Object.fromEntries(
        (chat?.byStartup ?? []).map((s) => [s.workspaceId, s.unreadCount]),
      ),
    }),
    [inbox, chat],
  );
}

export type StanjeProjekta = {
  zdravlje: "ok" | "upozorenje" | "greska" | "bez_veza";
  ceka: number | null;
};

/**
 * Stanje projekata (tačka veza i broj „čeka te“) iz `stanjeProjekata`, po
 * projektu. Vreme stiže sa tačnošću od minuta (upit ne čita sat). Baca kad
 * upit padne — pozivalac je iza `QuietBoundary`.
 */
export function useStanjeProjekata(): Map<string, StanjeProjekta> | undefined {
  const sada = useSada();
  const odgovor = useQuery(
    api.projekti.stanjeProjekata,
    sada > 0 ? { sada, pomerajMin: POMERAJ_MIN } : "skip",
  );
  return useMemo(
    () =>
      odgovor === undefined
        ? undefined
        : new Map<string, StanjeProjekta>(
            odgovor.map((s) => [s.workspaceId, { zdravlje: s.zdravlje, ceka: s.ceka }]),
          ),
    [odgovor],
  );
}

/**
 * Poslednji projekat u hubu (kolačić `ep_projekat`, piše ga
 * `ProjekatProvider`). Donja traka u „Ja“ ga nudi kao „Projekat“. Čita se
 * posle montiranja, jer server ne zna kolačić klijentske navigacije.
 */
export function usePoslednjiProjekat(): string | null {
  const vrednost = useSyncExternalStore(
    bezPromena,
    () =>
      document.cookie
        .split("; ")
        .find((deo) => deo.startsWith(`${KOLACIC_PROJEKAT}=`))
        ?.slice(KOLACIC_PROJEKAT.length + 1) ?? null,
    () => null,
  );
  return vrednost !== null && jeIspravanSlug(vrednost) ? vrednost : null;
}

/** Kolačić nema događaj promene; čita se pri svakom crtanju. */
function bezPromena(): () => void {
  return () => {};
}

/**
 * Brojevi menija „Ja“ iz Moj dan (`myDay.overview`, isti upit kao ekran
 * Danas): otvoreno za danas (prekoračeno + danas + planirano) i moji otvoreni
 * dodeljeni zadaci po projektu. Čeka profil; baca kad upit padne — pozivalac
 * je iza `QuietBoundary`. `undefined` dok se čita.
 */
export function useBrojeviJa():
  | { danas: number; odseceno: boolean; otvorenoPoProjektu: Record<string, number> }
  | undefined {
  const profil = useQuery(api.prostor.profiles.getCurrent);
  const ima = profil !== undefined && profil !== null;
  const dan = useToday();
  const pregled = useQuery(
    api.prostor.myDay.overview,
    ima ? { dayKey: dan.dayKey, doneSince: dan.doneSince } : "skip",
  );
  return useMemo(() => {
    if (pregled === undefined) return undefined;
    const ulaz = fromOverview(pregled, dan.now);
    const { counts } = groupMyDay(ulaz);
    return {
      danas: counts.overdue + counts.today + counts.planned,
      odseceno: pregled.capped.tasks || pregled.capped.personal,
      otvorenoPoProjektu: countOpenByStartup(ulaz.items),
    };
  }, [pregled, dan.now]);
}
