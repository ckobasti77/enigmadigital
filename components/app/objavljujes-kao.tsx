"use client";

import { useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useProjekat, useProjekatQuery } from "./projekat-provider";
import { ProjekatZnak } from "./projekat-znak";

/**
 * ============================================================================
 * „OBJAVLJUJEŠ KAO …“ — zaštita od objave na pogrešnom nalogu (PROJEKTI-PLAN §7)
 * ============================================================================
 *
 * Kad isti čovek radi pet projekata, najskuplja greška je objava, poruka ili
 * budžet na pogrešnom nalogu. Svaki dijalog koji objavljuje, šalje ili troši
 * novac zato pokazuje znak projekta, nalog i ime projekta, tačno iznad svoje
 * potvrde, a potvrda nosi ime projekta („Objavi · Enigma IT“).
 *
 *   [EI] Objavljuješ kao @enigma.it · Enigma IT
 *   [EI] Pauziraš na nalogu Enigma Ads · Enigma IT
 *   [EI] Objavljuješ na sajtu · Enigma IT
 *
 * Nalog se čita iz veze tog projekta. Kad nije poznat, piše „—“, a razlog je
 * u oblačiću: nepoznato nije prazan string ni ime nekog drugog naloga.
 */

export type KanalObjave =
  | "instagram"
  | "facebook"
  | "threads"
  | "youtube"
  | "meta_ads"
  | "google_ads"
  | "sajt";

const PROVAJDER = {
  instagram: "meta_ig",
  facebook: "meta_fb",
  threads: "threads",
  youtube: "youtube",
} as const;

const NAZIV_KANALA: Record<KanalObjave, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  threads: "Threads",
  youtube: "YouTube",
  meta_ads: "Meta oglasi",
  google_ads: "Google oglasi",
  sajt: "sajt",
};

const OGLASI = new Set<KanalObjave>(["meta_ads", "google_ads"]);

function saAt(handle: string): string {
  return handle.startsWith("@") ? handle : `@${handle}`;
}

/** Nalog na kanalu tekućeg projekta: `undefined` dok se čita, `null` kad nije poznat. */
function useNalog(kanal: KanalObjave): string | null | undefined {
  const drustveni = kanal in PROVAJDER;
  const veze = useProjekatQuery(api.connections.list, drustveni ? {} : "skip");
  const nalozi = useProjekatQuery(api.metaAdsStore.listAccounts, OGLASI.has(kanal) ? {} : "skip");

  if (kanal === "sajt") return null;
  if (OGLASI.has(kanal)) {
    if (nalozi === undefined) return undefined;
    return nalozi.find((n) => n.provider === kanal)?.name ?? null;
  }
  if (veze === undefined) return undefined;
  const veza = veze.find((v) => v.provider === PROVAJDER[kanal as keyof typeof PROVAJDER]);
  if (veza === undefined) return null;
  if (kanal === "facebook") return veza.externalIdAlt;
  if (kanal === "youtube") return veza.accountHandle;
  return veza.accountHandle ? saAt(veza.accountHandle) : null;
}

/**
 * Ime projekta na potvrdnom dugmetu: `potvrda("Objavi")` → „Objavi · Enigma IT“.
 * Dok projekat nije učitan, natpis ostaje bez sufiksa.
 */
export function usePotvrdaProjekta(): (natpis: string) => string {
  const { ime, kratkoIme } = useProjekat();
  const potpis = kratkoIme ?? ime;
  return useCallback(
    (natpis: string) => (potpis ? `${natpis} · ${potpis}` : natpis),
    [potpis],
  );
}

export function ObjavljujesKao({
  kanal,
  radnja = "Objavljuješ",
  nalog: zadatNalog,
  className,
}: {
  kanal: KanalObjave;
  /** Glagol u drugom licu: „Objavljuješ“, „Šalješ“, „Odgovaraš“, „Pauziraš“… */
  radnja?: string;
  /**
   * Nalog koji dijalog već zna tačno (npr. nalog oglasa izabrane kampanje).
   * Bez njega se čita veza projekta za taj kanal.
   */
  nalog?: string | null;
  className?: string;
}) {
  const { ime, brend } = useProjekat();
  const procitan = useNalog(kanal);
  const nalog = zadatNalog !== undefined ? zadatNalog : procitan;
  const imeProjekta = ime ?? "—";

  const veznik = kanal === "sajt" ? "na sajtu" : OGLASI.has(kanal) ? "na nalogu" : "kao";
  const razlog =
    nalog === null && kanal !== "sajt"
      ? `Nalog nije poznat: ${NAZIV_KANALA[kanal]} nije povezan u ovom projektu.`
      : undefined;

  return (
    <p
      data-slot="objavljujes-kao"
      className={cn("flex min-w-0 items-center gap-2 text-meta text-text-secondary", className)}
    >
      {ime !== null && (
        <ProjekatZnak
          projekat={{ ime, boja: brend.boja, logoUrl: brend.logoUrl }}
          velicina="xs"
        />
      )}
      <span className="min-w-0 truncate" title={razlog}>
        {radnja} {veznik}
        {kanal !== "sajt" && (
          <>
            {" "}
            {nalog === undefined ? (
              <Skeleton className="inline-block h-3 w-20 align-middle" />
            ) : (
              <span className="font-medium text-foreground">{nalog ?? "—"}</span>
            )}
          </>
        )}
        <span aria-hidden className="text-text-muted">
          {" · "}
        </span>
        <span className="sr-only">, projekat </span>
        <span className="font-medium text-foreground">{imeProjekta}</span>
      </span>
    </p>
  );
}
