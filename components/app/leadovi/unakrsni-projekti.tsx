"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ChevronDown, Copy, Layers } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FeedbackNote } from "@/components/app/feedback";
import { Chip } from "@/components/app/system/chip";
import {
  useProjekat,
  useProjekatMutation,
  useProjekatQuery,
} from "@/components/app/projekat-provider";
import { getErrorMessage } from "./lead-quick-dialogs";

/**
 * ============================================================================
 * UNAKRSNI LEADOVI U PROFILU FIRME (P13)
 * ============================================================================
 *
 * Firma iz ovog internog projekta postoji ili odgovara drugom internom
 * projektu istog korisnika. Oznake su neutralni čipovi sa imenom projekta:
 * boja projekta pripada samo biraču, znaku, traci i prijavi, pa je ovde nema.
 *
 * Upit se zove samo kad je tekući projekat interni i korisnik ima bar dva
 * interna, nearhivirana članstva — Enigma bez drugih projekata ga ne plaća.
 * ============================================================================
 */

type Unakrsni = FunctionReturnType<typeof api.leadUnakrsnoStore.uDrugimProjektima>;

const POKLAPANJE: Record<Unakrsni[number]["poklapanje"][number], string> = {
  domen: "isti domen",
  telefon: "isti telefon",
  ime_grad: "isto ime i grad",
  kopija: "kopija",
  nisa: "ciljna niša",
};

function useUnakrsni(companyId: Id<"leadCompanies">) {
  const { vrsta } = useProjekat();
  // Direktan poziv je dozvoljen (spisak u scripts/verify-pristup.ts): spisak
  // mojih projekata nema projekat.
  const projekti = useQuery(api.projekti.mojiProjekti, {});
  const interni =
    projekti?.filter((p) => p.vrsta === "interni" && !p.arhiviran).length ?? 0;
  const ukljuceno = vrsta === "interni" && interni >= 2;
  const rezultat = useProjekatQuery(
    api.leadUnakrsnoStore.uDrugimProjektima,
    ukljuceno ? { companyId } : "skip",
  );
  return { rezultat: ukljuceno ? (rezultat ?? []) : [], projekti: projekti ?? [] };
}

/** Čipovi u redu naslova: „Postoji u projektu …“, „Odgovara projektu …“, „Kopija iz …“. */
export function UnakrsneOznake({
  companyId,
  kopijaIz,
}: {
  companyId: Id<"leadCompanies">;
  kopijaIz: Doc<"leadCompanies">["kopijaIz"];
}) {
  const { rezim } = useProjekat();
  const { rezultat, projekti } = useUnakrsni(companyId);

  const izvor = kopijaIz
    ? (projekti.find((p) => p.workspaceId === kopijaIz.workspaceId)?.ime ?? null)
    : null;

  return (
    <>
      {kopijaIz && (
        <Chip size="sm" tone="muted" icon={Copy} title="Firma je kopirana iz drugog projekta">
          {izvor ? `Kopija iz ${izvor}` : "Kopija iz drugog projekta"}
        </Chip>
      )}
      {rezultat.map((r) => {
        const natpis =
          r.stanje === "postoji" ? `Postoji u projektu ${r.ime}` : `Odgovara projektu ${r.ime}`;
        const opis =
          r.stanje === "odgovara" && r.nisa
            ? `Ciljna niša u projektu ${r.ime}: ${r.nisa}`
            : `Poklapanje: ${r.poklapanje.map((p) => POKLAPANJE[p]).join(", ")}`;
        const cip = (
          <Chip size="sm" tone="neutral" icon={Layers} title={opis}>
            {natpis}
          </Chip>
        );
        // Profil u drugom projektu je adresa tog projekta: postoji samo u
        // hubu. Panel je zaključan na jedan projekat, pa je čip bez linka.
        if (rezim === "hub" && r.stanje === "postoji" && r.companyId !== null) {
          return (
            <Link
              key={r.workspaceId}
              href={`/${r.slug}/leadovi/${r.companyId}`}
              className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`${natpis} — otvori profil`}
            >
              {cip}
            </Link>
          );
        }
        return <span key={r.workspaceId}>{cip}</span>;
      })}
    </>
  );
}

type Cilj = { workspaceId: Id<"workspaces">; slug: string; ime: string };

/**
 * „Kopiraj u <projekat>“ (secondary): samo za projekte koje firma odgovara i
 * u kojima je korisnik urednik. Više ciljeva = jedno dugme sa menijem.
 * Pozivalac ga umotava u `SamoZa uloga="urednik"`.
 */
export function KopirajUProjekat({
  companyId,
  companyName,
}: {
  companyId: Id<"leadCompanies">;
  companyName: string;
}) {
  const { rezim } = useProjekat();
  const { rezultat } = useUnakrsni(companyId);
  const kopiraj = useProjekatMutation(api.leadUnakrsnoStore.kopirajUProjekat);
  const [cilj, setCilj] = useState<Cilj | null>(null);
  const [busy, setBusy] = useState(false);
  const [ishod, setIshod] = useState<
    | { vrsta: "ok"; ime: string; slug: string; companyId: Id<"leadCompanies"> }
    | { vrsta: "greska"; poruka: string }
    | null
  >(null);

  const ciljevi: Cilj[] = rezultat
    .filter((r) => r.stanje === "odgovara" && r.mozeKopirati)
    .map((r) => ({ workspaceId: r.workspaceId, slug: r.slug, ime: r.ime }));

  if (ciljevi.length === 0 && ishod === null) return null;

  async function potvrdi() {
    if (cilj === null) return;
    setBusy(true);
    try {
      const r = await kopiraj({ companyId, ciljWorkspaceId: cilj.workspaceId });
      setIshod({ vrsta: "ok", ime: cilj.ime, slug: r.slug, companyId: r.companyId });
      setCilj(null);
    } catch (err) {
      setIshod({ vrsta: "greska", poruka: getErrorMessage(err) });
      setCilj(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {ciljevi.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {ciljevi.length === 1 ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="touch-target"
              onClick={() => {
                setIshod(null);
                setCilj(ciljevi[0]);
              }}
            >
              <Copy data-icon="inline-start" aria-hidden />
              Kopiraj u {ciljevi[0].ime}
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button type="button" variant="secondary" size="sm" className="touch-target" />}>
                <Copy data-icon="inline-start" aria-hidden />
                Kopiraj u projekat
                <ChevronDown data-icon="inline-end" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Firma odgovara projektima</DropdownMenuLabel>
                  {ciljevi.map((c) => (
                    <DropdownMenuItem
                      key={c.workspaceId}
                      onClick={() => {
                        setIshod(null);
                        setCilj(c);
                      }}
                    >
                      {c.ime}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <span className="text-meta text-text-muted">
            Kopija nosi poreklo; faza i beleške ostaju ovde.
          </span>
        </div>
      )}

      {ishod?.vrsta === "ok" && (
        <FeedbackNote
          tone="success"
          title={`Kopirano u ${ishod.ime}`}
          action={
            rezim === "hub" ? (
              <Link
                href={`/${ishod.slug}/leadovi/${ishod.companyId}`}
                className="text-ui font-medium text-mod underline-offset-4 hover:underline"
              >
                Otvori
              </Link>
            ) : undefined
          }
        />
      )}
      {ishod?.vrsta === "greska" && (
        <FeedbackNote tone="danger" title="Firma nije kopirana">
          {ishod.poruka}
        </FeedbackNote>
      )}

      <ConfirmDialog
        open={cilj !== null}
        onOpenChange={(open) => {
          if (!open) setCilj(null);
        }}
        tone="accent"
        title={cilj ? `Kopiraj ${companyName} u ${cilj.ime}?` : "Kopiraj firmu?"}
        description="Kopiraju se podaci o firmi, osobe i kontakti sa izvorom. Faza, beleške i istorija ostaju ovde."
        confirmLabel={cilj ? `Kopiraj · ${cilj.ime}` : "Kopiraj"}
        busyLabel="Kopiram…"
        busy={busy}
        onConfirm={() => void potvrdi()}
      />
    </div>
  );
}
