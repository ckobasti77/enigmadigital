"use client";

import { Check, Circle, ListPlus } from "lucide-react";

import { FeedbackNote } from "@/components/app/feedback";
import { ProjekatLink } from "@/components/app/projekat-link";
import { useMoze } from "@/components/app/projekat-provider";
import { useDokumenti } from "@/components/app/prostor/dokumenti/dokumenti-kontekst";
import { useProjekatQueryState } from "@/components/app/prostor/podaci/projekat";
import { DueChip } from "@/components/app/prostor/zadaci/due-chip";
import { useNoviZadatakSaVezom } from "@/components/app/prostor/zadaci/napravi-zadatak";
import { PriorityDot } from "@/components/app/prostor/zadaci/priority-dot";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { STATUS_LABELS } from "@/lib/prostor/task-sort";
import type { QueryState } from "@/components/app/prostor/podaci/ja";
import type { FunctionReturnType } from "convex/server";
import { vezaZaFirmu } from "@/lib/prostor/web/veze-zadatka";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * ZADACI FIRME — dodatak profilu firme (SPAJANJE P19, S23)
 * ============================================================================
 *
 * Zadaci tima vezani za ovu firmu i „Novi zadatak“ koji otvara deljeni dijalog
 * sa vezom. Logika Leadova se ne menja: ovaj odeljak samo čita zadatke radnog
 * dela. Posmatrač (`client_viewer`) i nalog bez profila radnog dela odeljak
 * ne vide.
 */

type ZadaciFirme = FunctionReturnType<typeof api.prostor.veze.zadaciFirme>;

export type ZadaciFirmeStanje = {
  /** Odeljak postoji (urednik ili vlasnik, profil radnog dela nije odsutan). */
  vidljivo: boolean;
  stanje: QueryState<ZadaciFirme>;
  /** Otvoreni zadaci za bedž jezička; `undefined` dok stižu. */
  otvorenih: number | undefined;
};

/** Jedna pretplata za jezičak (bedž) i odeljak. */
export function useZadaciFirme(companyId: Id<"leadCompanies">): ZadaciFirmeStanje {
  const sme = useMoze("urednik");
  const { profil } = useDokumenti();
  const vidljivo = sme && profil !== null;
  const stanje = useProjekatQueryState(
    api.prostor.veze.zadaciFirme,
    vidljivo ? { leadCompanyId: companyId } : "skip",
  );
  return {
    vidljivo,
    stanje,
    otvorenih:
      stanje.status === "ready"
        ? stanje.data.zadaci.filter((z) => z.taskStatus !== "done").length
        : undefined,
  };
}

export function FirmaZadaci({
  companyId,
  companyName,
  stanje,
  now,
}: {
  companyId: Id<"leadCompanies">;
  companyName: string;
  stanje: QueryState<ZadaciFirme>;
  now: number;
}) {
  const otvori = useNoviZadatakSaVezom();
  const novi = () => otvori?.(vezaZaFirmu({ id: companyId, naziv: companyName }));

  return (
    // Spisak počinje odmah ispod zaglavlja (bez razmaka kartice).
    <Card className="gap-0 border-line bg-surface">
      <CardHeader className="border-b border-line pb-3">
        <CardTitle className="text-sm font-semibold text-foreground">Zadaci za ovu firmu</CardTitle>
        <CardDescription className="text-xs text-text-muted">
          Posao tima vezan za firmu. Svaki zadatak vodi nazad na ovaj profil.
        </CardDescription>
        {otvori ? (
          <CardAction>
            <Button type="button" variant="outline" size="sm" onClick={novi}>
              <ListPlus data-icon="inline-start" />
              Novi zadatak
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {stanje.status === "loading" ? (
          <ul aria-hidden="true" className="flex flex-col divide-y divide-line-soft">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex h-10 items-center gap-3 px-4">
                <Skeleton className="size-4 rounded-full" />
                <Skeleton className="h-3.5 w-1/2" />
              </li>
            ))}
          </ul>
        ) : stanje.status === "error" ? (
          <div className="p-4">
            <FeedbackNote tone="danger" title="Zadaci nisu učitani">
              Osveži stranicu. Ako se ponovi, otvori Zadatke projekta.
            </FeedbackNote>
          </div>
        ) : stanje.data.zadaci.length === 0 ? (
          <p className="px-4 py-6 text-xs text-text-muted">
            Nema zadataka za ovu firmu. {otvori ? "„Novi zadatak“ ga pravi i veže za nju." : null}
          </p>
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-line-soft">
              {stanje.data.zadaci.map((z) => {
                const gotov = z.taskStatus === "done";
                return (
                  <li key={z._id}>
                    <ProjekatLink
                      href={`/stranica/${z._id}`}
                      className="flex min-h-10 items-center gap-3 px-4 py-1.5 transition-colors pointer-coarse:min-h-11 hover:bg-surface-control-hover focus-visible:bg-surface-control-hover focus-visible:outline-none"
                    >
                      {gotov ? (
                        <Check className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
                      ) : (
                        <Circle className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
                      )}
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-ui",
                          gotov ? "text-text-muted" : "text-foreground",
                        )}
                      >
                        {z.title}
                      </span>
                      <span className="hidden shrink-0 text-meta text-text-muted sm:inline">
                        <span className="sr-only">Status: </span>
                        {STATUS_LABELS[z.taskStatus ?? "backlog"]}
                      </span>
                      <DueChip dueDate={z.dueDate} now={now} done={gotov} />
                      <PriorityDot priority={gotov ? null : (z.taskPriority ?? null)} />
                    </ProjekatLink>
                  </li>
                );
              })}
            </ul>
            {stanje.data.odseceno ? (
              <p className="border-t border-line-soft px-4 py-2 text-meta text-text-muted">
                Prikazano je najnovijih {stanje.data.zadaci.length}; ostali su u Zadacima projekta.
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
