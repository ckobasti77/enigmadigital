"use client";

import { ArrowUpRight, Bell, Building2, MessageSquare, type LucideIcon } from "lucide-react";

import { ProjekatLink } from "@/components/app/projekat-link";
import { useProjekatQueryState } from "@/components/app/prostor/podaci/projekat";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  adresaFirme,
  NAZIV_IZVORA,
  type IzvorVrsta,
  type IzvorZadatka,
} from "@/lib/prostor/web/veze-zadatka";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * VEZE ZADATKA (SPAJANJE P19, S23)
 * ============================================================================
 *
 * Zadatak radnog dela zna za firmu iz Leadova i za povod iz kog je nastao
 * (komentar bez odgovora, stavka „Čeka te“). Ovde su:
 *   - `FirmaCip` i `IzvorCip`: veze na zadatku (panel i puna strana) koje
 *     vode nazad, oblikom kao čipovi metapodataka, bez boje radnje;
 *   - `FirmaOznaka`: ime firme u redu liste (red je dugme, pa oznaka nije
 *     link — u firmu se ide iz zadatka);
 *   - `napravi-zadatak.tsx`: radnja koja otvara dijalog „Novi zadatak“ sa
 *     vezom.
 */

const cipKlasa =
  "inline-flex h-9 max-w-full items-center gap-1.5 rounded-full border border-line bg-card px-3 text-sm text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11";

const IKONA_IZVORA: Record<IzvorVrsta, LucideIcon> = {
  komentar_ig: MessageSquare,
  komentar_fb: MessageSquare,
  ceka_te: Bell,
};

/** Firma na zadatku: link na profil firme u Leadovima. */
export function FirmaCip({ leadCompanyId }: { leadCompanyId: Id<"leadCompanies"> }) {
  const firma = useProjekatQueryState(api.prostor.veze.firma, { leadCompanyId });
  if (firma.status === "loading") return <Skeleton className="h-9 w-40 rounded-full" />;
  if (firma.status === "error" || firma.data === null) {
    // Firma je obrisana ili spojena sa drugom: veza ostaje zapisana, ali ne vodi nikud.
    return (
      <span className={cn(cipKlasa, "border-dashed bg-transparent text-muted-foreground hover:bg-transparent")}>
        <Building2 className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">Firma više nije u Leadovima</span>
      </span>
    );
  }
  return (
    <ProjekatLink
      href={adresaFirme(firma.data._id)}
      className={cipKlasa}
      aria-label={`Firma: ${firma.data.name}. Otvori profil firme`}
    >
      <Building2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="text-muted-foreground">Firma:</span>
      <span className="min-w-0 truncate font-medium">{firma.data.name}</span>
      <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </ProjekatLink>
  );
}

/** Povod zadatka: link na ekran komentara ili na posao iz „Čeka te“. */
export function IzvorCip({ izvor }: { izvor: IzvorZadatka }) {
  const Ikona = IKONA_IZVORA[izvor.vrsta];
  return (
    <ProjekatLink
      href={izvor.putanja}
      className={cipKlasa}
      title={izvor.naslov}
      aria-label={`${NAZIV_IZVORA[izvor.vrsta]}: ${izvor.naslov}. Otvori`}
    >
      <Ikona className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="shrink-0 text-muted-foreground">{NAZIV_IZVORA[izvor.vrsta]}:</span>
      <span className="min-w-0 truncate font-medium">{izvor.naslov}</span>
      <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </ProjekatLink>
  );
}

/** Red veza u rasporedu zadatka; bez veza ga nema. */
export function VezeZadatka({
  leadCompanyId,
  izvor,
}: {
  leadCompanyId?: Id<"leadCompanies">;
  izvor?: IzvorZadatka;
}) {
  if (leadCompanyId === undefined && izvor === undefined) return null;
  return (
    <div role="group" aria-label="Veze zadatka" className="flex flex-wrap gap-2">
      {leadCompanyId !== undefined ? <FirmaCip leadCompanyId={leadCompanyId} /> : null}
      {izvor !== undefined ? <IzvorCip izvor={izvor} /> : null}
    </div>
  );
}

/**
 * Ime firme u redu liste zadataka (deo naslova reda, ne zaseban link). Tiho:
 * dok ime stiže drži mesto, a obrisana firma ne crta ništa.
 */
export function FirmaOznaka({ leadCompanyId, className }: { leadCompanyId: string; className?: string }) {
  const firma = useProjekatQueryState(api.prostor.veze.firma, {
    leadCompanyId: leadCompanyId as Id<"leadCompanies">,
  });
  if (firma.status === "error" || (firma.status === "ready" && firma.data === null)) return null;
  const ime = firma.status === "ready" ? firma.data?.name : undefined;
  return (
    <span
      className={cn("inline-flex min-w-0 max-w-[12rem] shrink items-center gap-1 text-meta text-muted-foreground", className)}
      title={ime ? `Firma: ${ime}` : undefined}
    >
      <Building2 className="size-3.5 shrink-0" aria-hidden="true" />
      {ime === undefined ? (
        <Skeleton className="h-3 w-16" />
      ) : (
        <>
          <span className="sr-only">Firma: </span>
          <span className="min-w-0 truncate">{ime}</span>
        </>
      )}
    </span>
  );
}
