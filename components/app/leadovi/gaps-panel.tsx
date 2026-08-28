"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import type { GapType } from "@/convex/leadGapsStore";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronRight,
  Globe,
  Hash,
  Info,
  Phone,
  UserCheck,
  UserX,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FeedbackNote } from "@/components/app/feedback";
import { LEAD_GAP_LABELS, leadGapLabel } from "./lead-labels";
import { LeadGapFillDialog } from "./lead-gap-fill-dialog";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type GapsPanelProps = {
  workspaceId: Id<"workspaces">;
};

const GAP_CARDS: ReadonlyArray<{
  type: GapType;
  label: string;
  field: "bezTelefona" | "bezKontaktOsobe" | "bezVlasnika" | "bezSajta" | "bezPib";
  icon: typeof Phone;
  description: string;
}> = [
  {
    type: "bez_telefona",
    label: "Bez telefona",
    field: "bezTelefona",
    icon: Phone,
    description: "Leadovi koji čekaju broj telefona za prvi poziv",
  },
  {
    type: "bez_kontakt_osobe",
    label: "Bez kontakt osobe",
    field: "bezKontaktOsobe",
    icon: UserX,
    description: "Firme bez unetog imena direktora, vlasnika ili menadžera",
  },
  {
    type: "bez_vlasnika",
    label: "Bez vlasnika",
    field: "bezVlasnika",
    icon: UserCheck,
    description: "Leadovi koji nisu dodeljeni nijednom operateru",
  },
  {
    type: "bez_sajta",
    label: "Bez sajta",
    field: "bezSajta",
    icon: Globe,
    description: "Firme bez zabeleženog veb-sajta ili domena",
  },
  {
    type: "bez_pib",
    label: "Bez PIB-a",
    field: "bezPib",
    icon: Hash,
    description: "Firme kojima nedostaje poreski identifikacioni broj",
  },
];

export function GapsPanel({ workspaceId }: GapsPanelProps) {
  const [selectedGap, setSelectedGap] = useState<GapType | null>("bez_telefona");
  const [gapFillCompany, setGapFillCompany] = useState<Doc<"leadCompanies"> | null>(null);

  const gaps = useQuery(api.leadGapsStore.listGaps, {
    workspaceId,
  });

  const gapDetails = useQuery(
    api.leadGapsStore.listCompaniesWithGap,
    selectedGap
      ? {
          workspaceId,
          gapType: selectedGap,
          limit: 100,
        }
      : "skip",
  );

  if (gaps === undefined) {
    return <GapsPanelSkeleton />;
  }

  const denominatorLabel = gaps.nepotpuno
    ? `prebrojano ${gaps.ukupnoFirmi} firmi, ima ih još`
    : `${gaps.ukupnoFirmi} ${gaps.ukupnoFirmi === 1 ? "firme" : "firmi"}`;

  return (
    <div className="flex flex-col gap-6">
      {/* Obavezna upozorenja o nepotpunosti ili potencijalno lažnim rupama (§9.2) */}
      {gaps.moguceLazneRupe && (
        <FeedbackNote
          tone="warning"
          title="Upozorenje: Moguće lažne rupe zbog limita u relacijama"
        >
          Neki redovi mogu biti prikazani kao rupe jer povezana tabela
          (kontakt osobe, identifikatori ili dodela) nije pročitana do kraja
          zbog zaštitnog limita transakcije.
        </FeedbackNote>
      )}

      {gaps.nepotpuno && (
        <FeedbackNote
          tone="warning"
          title="Uzorak prebrojavanja je delimičan"
        >
          Pregledano je ukupno {gaps.ukupnoFirmi} firmi. Baza sadrži više zapisa, pa
          svaki prikazani broj predstavlja stanje u okviru analiziranog uzorka.
        </FeedbackNote>
      )}

      {/* Kartice sa rupama - svaka sa obaveznim imeniocem */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {GAP_CARDS.map((card) => {
          const count = gaps[card.field];
          const isSelected = selectedGap === card.type;
          const Icon = card.icon;

          return (
            <button
              key={card.type}
              type="button"
              onClick={() => setSelectedGap(card.type)}
              className={cn(
                "flex flex-col items-start rounded-xl border p-4 text-left transition-all duration-150 cursor-pointer",
                isSelected
                  ? "border-accent-400 bg-surface-raised ring-2 ring-accent-400/40 shadow-sm"
                  : "border-line bg-surface hover:border-line-strong hover:bg-surface-raised/50",
              )}
            >
              <div className="flex w-full items-center justify-between">
                <div
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg border",
                    isSelected
                      ? "border-accent-400/50 bg-accent-400/10 text-accent-400"
                      : "border-line bg-surface-raised text-text-muted",
                  )}
                >
                  <Icon className="size-4" />
                </div>
                <span className="text-micro font-semibold uppercase tracking-wider text-text-muted">
                  Zadatak
                </span>
              </div>

              <div className="mt-3 flex flex-col">
                <span className="text-sm font-semibold text-foreground">
                  {card.label}
                </span>
                <span className="mt-1 text-2xl font-bold text-foreground">
                  {count}{" "}
                  <span className="text-xs font-normal text-text-muted">
                    od {gaps.ukupnoFirmi}
                  </span>
                </span>
              </div>

              <div className="mt-2 text-micro text-text-muted">
                {card.description}
              </div>

              <div className="mt-3 flex w-full items-center justify-between border-t border-line-soft pt-2 text-micro">
                <span className="text-text-soft">
                  {gaps.nepotpuno ? "Uzorak" : "Ukupno"}: {denominatorLabel}
                </span>
                <ChevronRight
                  className={cn(
                    "size-3.5 transition-transform",
                    isSelected ? "text-accent-400 translate-x-0.5" : "text-text-muted",
                  )}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* Tabela sa firmama koje imaju izabranu rupu */}
      {selectedGap && (
        <Card className="border-line bg-surface">
          <CardHeader className="border-b border-line pb-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base font-bold text-foreground">
                  Zadaci za dopunu: {leadGapLabel(selectedGap)}
                </CardTitle>
                <CardDescription className="text-xs text-text-muted">
                  Spisak firmi kojima nedostaje ovaj podatak. Rupa koja se vidi se popunjava.
                </CardDescription>
              </div>
              {gapDetails && (
                <div className="flex items-center gap-2 text-xs font-semibold text-text-muted">
                  <span>
                    Prikazano: <strong>{gapDetails.companies.length}</strong> firmi
                  </span>
                  {gapDetails.nepotpuno && (
                    <span className="rounded bg-warning/10 px-2 py-0.5 text-micro font-bold text-warning">
                      (uzorak od {gapDetails.pregledanoFirmi} pregledanih)
                    </span>
                  )}
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {gapDetails === undefined ? (
              <div className="p-6 space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : gapDetails.companies.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center text-text-muted">
                <CheckCircle2 className="size-10 text-success mb-2" />
                <p className="text-sm font-semibold text-foreground">
                  Nema evidentiranih rupa ove vrste!
                </p>
                <p className="mt-1 text-xs text-text-muted max-w-sm">
                  Sve pregledane firme imaju popunjen podatak za kategoriju „{leadGapLabel(selectedGap)}".
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-line bg-surface-raised/40 hover:bg-surface-raised/40">
                      <TableHead className="font-semibold text-text-muted">Firma</TableHead>
                      <TableHead className="font-semibold text-text-muted">Grad i adresa</TableHead>
                      <TableHead className="font-semibold text-text-muted">Poreklo unosa</TableHead>
                      <TableHead className="font-semibold text-text-muted">Sajt / Domen</TableHead>
                      <TableHead className="font-semibold text-text-muted">PIB</TableHead>
                      <TableHead className="font-semibold text-text-muted">Evidentirano</TableHead>
                      <TableHead className="font-semibold text-text-muted text-right">Akcija</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gapDetails.companies.map((company: Doc<"leadCompanies">) => {
                      const hasWebsite = Boolean(company.website || company.domainNormalized);
                      const hasPib = Boolean(company.pib);

                      return (
                        <TableRow
                          key={company._id}
                          className="border-line transition-colors hover:bg-surface-raised/60 cursor-pointer"
                          onClick={() => setGapFillCompany(company)}
                        >
                          <TableCell className="font-medium text-foreground">
                            <div className="flex items-center gap-2">
                              <Building2 className="size-4 shrink-0 text-text-muted" />
                              <div className="flex flex-col">
                                <span className="font-semibold">{company.name}</span>
                                {company.addressNeedsVerification && (
                                  <span className="text-micro font-medium text-warning">
                                    (proveriti adresu)
                                  </span>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="text-xs text-text-muted">
                            {company.city ? (
                              <span>
                                {company.city}
                                {company.municipality && `, ${company.municipality}`}
                                {company.street && ` (${company.street})`}
                              </span>
                            ) : (
                              <span className="text-text-soft">Nije navedeno</span>
                            )}
                          </TableCell>

                          <TableCell className="text-xs">
                            <span
                              className={cn(
                                "rounded px-2 py-0.5 text-micro font-semibold",
                                company.origin === "inbound"
                                  ? "bg-accent-400/10 text-accent-400 border border-accent-400/30"
                                  : "bg-surface-raised text-text-muted border border-line",
                              )}
                            >
                              {company.origin === "inbound" ? "Inbound" : "Uvoz"}
                              {company.firstSeenSource && ` (${company.firstSeenSource})`}
                            </span>
                          </TableCell>

                          <TableCell className="text-xs">
                            {hasWebsite ? (
                              <span className="text-foreground">
                                {company.domainNormalized || company.website}
                              </span>
                            ) : (
                              <span className="rounded bg-danger/10 px-1.5 py-0.5 text-micro font-semibold text-danger">
                                Nema sajt
                              </span>
                            )}
                          </TableCell>

                          <TableCell className="text-xs">
                            {hasPib ? (
                              <span className="font-mono text-foreground">{company.pib}</span>
                            ) : (
                              <span className="rounded bg-warning/10 px-1.5 py-0.5 text-micro font-semibold text-warning">
                                Nema PIB
                              </span>
                            )}
                          </TableCell>

                          <TableCell className="text-xs text-text-muted whitespace-nowrap">
                            {formatDateTime(company.createdAt)}
                          </TableCell>

                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setGapFillCompany(company)}
                              className="h-7 px-2.5 text-micro font-semibold text-accent-400 border-accent-400/30 bg-accent-400/5 hover:bg-accent-400/15"
                            >
                              Popuni rupu
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dijalog za popunjavanje konkretne rupe (§9.2) */}
      {selectedGap && gapFillCompany && (
        <LeadGapFillDialog
          workspaceId={workspaceId}
          company={gapFillCompany}
          gapType={selectedGap}
          isOpen={Boolean(gapFillCompany)}
          onOpenChange={(open) => {
            if (!open) setGapFillCompany(null);
          }}
        />
      )}
    </div>
  );
}

function GapsPanelSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
