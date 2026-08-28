"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  Globe,
  HelpCircle,
  Info,
  Link2,
  MapPin,
  Send,
  ShieldAlert,
  ShieldCheck,
  Tag,
  User,
  Users,
  Zap,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackNote } from "@/components/app/feedback";
import { LeadScoreCell } from "./lead-score-cell";
import { LeadIdentitiesPanel } from "./lead-identities-panel";
import { LeadTimeline } from "./lead-timeline";
import { LeadActionsPanel } from "./lead-actions-panel";
import { ProvenanceBadge } from "./provenance-badge";
import { leadStageLabel, personRoleLabel } from "./lead-labels";
import { formatDateTime, formatRelativeTime, formatDurationMs } from "@/lib/format";
import { cn } from "@/lib/utils";

type LeadDetailProps = {
  workspaceId: Id<"workspaces">;
  companyId: Id<"leadCompanies">;
};

export function LeadDetail({ workspaceId, companyId }: LeadDetailProps) {
  // 1. Podaci o firmi, osobama, identitetima, signalima i poreklu
  const detail = useQuery(api.leadDetailStore.getLeadDetail, {
    workspaceId,
    companyId,
  });

  // 2. CRM stanje (vlasnik, faza, sledeći korak, istorija)
  const crm = useQuery(api.leadCrmStore.getLeadCrm, {
    workspaceId,
    companyId,
  });

  // 3. Ocenjivanje (fit i intent osa)
  const score = useQuery(api.leadScoringStore.scoreCompany, {
    workspaceId,
    companyId,
  });

  // 4. Landing tracker status (§7)
  const landing = useQuery(api.leadLandingStore.landingStatus, {
    workspaceId,
    companyId,
  });

  // §0 Pravilo: useQuery === undefined → Skeleton, NIKADA 0 niti delimični podaci
  if (
    detail === undefined ||
    crm === undefined ||
    score === undefined ||
    landing === undefined
  ) {
    return <LeadDetailSkeleton />;
  }

  const company = detail.company;
  const assignment = crm.assignment;
  const now = Date.now();

  const isOverdue =
    assignment?.nextActionAt !== undefined && assignment.nextActionAt < now;
  const overdueDurationMs = isOverdue
    ? now - (assignment?.nextActionAt ?? now)
    : 0;

  const prov = detail.provenanceByField;

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Navigacija nazad */}
      <div className="flex items-center justify-between">
        <Link
          href="/leadovi"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          <span>Nazad na sve leadove</span>
        </Link>

        <div className="flex items-center gap-2 text-micro text-text-muted">
          <span>Radni prostor ID:</span>
          <span className="font-mono">{workspaceId.slice(0, 10)}...</span>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* 1. ZAGLAVLJE: Naziv firme, grad, faza, vlasnik, obe ose ocene */}
      {/* ════════════════════════════════════════════════════════════ */}
      <Card className="border-line bg-surface overflow-hidden">
        <div className="border-b border-line bg-surface-raised/40 p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            {/* Naziv i osnovni detalji */}
            <div className="flex flex-col gap-2 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-foreground sm:text-2xl break-words">
                  {company.name}
                </h1>

                {/* Poreklo naziva firme */}
                <ProvenanceBadge
                  provenance={prov.name ?? prov["leadCompanies:name"]}
                  fieldName="Naziv firme"
                />

                {/* Oznaka porekla uvoza */}
                <span
                  className={cn(
                    "rounded px-2 py-0.5 text-micro font-semibold border",
                    company.origin === "inbound"
                      ? "bg-accent-400/10 text-accent-400 border-accent-400/30"
                      : "bg-surface-raised text-text-muted border-line",
                  )}
                >
                  {company.origin === "inbound" ? "Inbound" : "Uvoz"}
                </span>

                {/* Faza toka */}
                <span className="rounded-lg bg-info/10 border border-info/30 px-2.5 py-1 text-xs font-bold text-info">
                  Faza: {leadStageLabel(assignment?.stage ?? "nov")}
                </span>
              </div>

              {/* Lokacija i adresa */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-text-muted">
                {(company.city || company.municipality || company.street) && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <MapPin className="size-3.5 text-text-soft shrink-0" />
                    {/*
                      Poreklo ide PO POLJU (§2.4), ne po redu. Ranije je ovde
                      stajala jedna oznaka nad spojenim tekstom, sa uzmicanjem
                      `prov.city ?? prov.street ?? prov.municipality` — pa je
                      uz vrednost grada mogla da stoji oznaka porekla ULICE.
                      Baš ovde to najviše boli: grad izveden iz beogradske
                      opštine ima `priblizno`, dok je ulica pročitana iz tabele
                      i ima `tacno`. Jedna oznaka nad oba je nužno netačna za
                      jedno od njih.
                    */}
                    {(
                      [
                        { vrednost: company.street, polje: "street", naziv: "Ulica" },
                        { vrednost: company.municipality, polje: "municipality", naziv: "Opština" },
                        { vrednost: company.city, polje: "city", naziv: "Grad" },
                      ] as const
                    )
                      .filter((d) => Boolean(d.vrednost))
                      .map((d, i, sve) => (
                        <span key={d.polje} className="inline-flex items-center gap-1">
                          <span>{d.vrednost}</span>
                          <ProvenanceBadge
                            provenance={
                              prov[d.polje] ?? prov[`leadCompanies:${d.polje}`]
                            }
                            fieldName={d.naziv}
                            compact
                          />
                          {i < sve.length - 1 && (
                            <span className="text-text-soft">,</span>
                          )}
                        </span>
                      ))}
                  </div>
                )}

                {company.addressNeedsVerification && (
                  <span className="rounded bg-warning/10 border border-warning/30 px-1.5 py-0.2 text-micro font-semibold text-warning">
                    (proveriti adresu)
                  </span>
                )}

                {company.website && (
                  <div className="flex items-center gap-1.5">
                    <Globe className="size-3.5 text-text-soft shrink-0" />
                    <a
                      href={
                        company.website.startsWith("http")
                          ? company.website
                          : `https://${company.website}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent-400 hover:underline inline-flex items-center gap-0.5 truncate max-w-[200px]"
                    >
                      <span>{company.website.replace(/^https?:\/\//, "")}</span>
                      <ExternalLink className="size-2.5 shrink-0" />
                    </a>
                    <ProvenanceBadge
                      provenance={prov.website ?? prov["leadCompanies:website"]}
                      fieldName="Sajt"
                      compact
                    />
                  </div>
                )}

                {/* Vlasnik leada u timu */}
                <div className="flex items-center gap-1.5">
                  <User className="size-3.5 text-text-soft shrink-0" />
                  <span>
                    Vlasnik leada:{" "}
                    <strong className="text-foreground">
                      {assignment ? "Dodeljen" : "Nije dodeljen"}
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Obe ose ocene (Fit i Intent) */}
            <div className="flex items-center gap-2.5 shrink-0">
              <LeadScoreCell axis="fit" score={score?.fit} className="w-32" />
              <LeadScoreCell axis="intent" score={score?.intent} className="w-32" />
            </div>
          </div>
        </div>

        {/* Dodatna polja firme sa poreklom (PIB, Matični broj, Delatnost, CompanyWall) */}
        <div className="grid grid-cols-2 divide-x divide-line border-b border-line bg-surface p-3 sm:grid-cols-4 text-micro text-text-muted">
          {/* PIB */}
          <div className="flex flex-col gap-0.5 px-2">
            <span className="text-text-soft">PIB:</span>
            <div className="flex items-center gap-1">
              <span className="font-mono font-semibold text-foreground">
                {company.pib || "—"}
              </span>
              {company.pib && (
                <ProvenanceBadge
                  provenance={prov.pib ?? prov["leadCompanies:pib"]}
                  fieldName="PIB"
                  compact
                />
              )}
            </div>
          </div>

          {/* Matični broj */}
          <div className="flex flex-col gap-0.5 px-2">
            <span className="text-text-soft">Matični broj:</span>
            <div className="flex items-center gap-1">
              <span className="font-mono font-semibold text-foreground">
                {company.maticniBroj || "—"}
              </span>
              {company.maticniBroj && (
                <ProvenanceBadge
                  provenance={prov.maticniBroj ?? prov["leadCompanies:maticniBroj"]}
                  fieldName="Matični broj"
                  compact
                />
              )}
            </div>
          </div>

          {/* Šifra delatnosti */}
          <div className="flex flex-col gap-0.5 px-2">
            <span className="text-text-soft">Šifra delatnosti:</span>
            <div className="flex items-center gap-1">
              <span className="font-mono font-semibold text-foreground">
                {company.sifraDelatnosti || "—"}
              </span>
              {company.sifraDelatnosti && (
                <ProvenanceBadge
                  provenance={prov.sifraDelatnosti ?? prov["leadCompanies:sifraDelatnosti"]}
                  fieldName="Šifra delatnosti"
                  compact
                />
              )}
            </div>
          </div>

          {/* CompanyWall */}
          <div className="flex flex-col gap-0.5 px-2">
            <span className="text-text-soft">CompanyWall profil:</span>
            <div className="flex items-center gap-1">
              {company.companyWallUrl ? (
                <a
                  href={company.companyWallUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent-400 hover:underline inline-flex items-center gap-0.5 truncate max-w-[120px]"
                >
                  <span>Profil</span>
                  <ExternalLink className="size-2.5" />
                </a>
              ) : (
                <span>—</span>
              )}
              {company.companyWallUrl && (
                <ProvenanceBadge
                  provenance={prov.companyWallUrl ?? prov["leadCompanies:companyWallUrl"]}
                  fieldName="CompanyWall"
                  compact
                />
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* 2. SLEDEĆI POTEZ: nextActionAt + nextActionNote, i kašnjenje  */}
      {/* ════════════════════════════════════════════════════════════ */}
      <Card
        className={cn(
          "border-line bg-surface",
          isOverdue && "border-danger/40 bg-danger/5",
        )}
      >
        <CardHeader className="border-b border-line pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar
                className={cn(
                  "size-4",
                  isOverdue ? "text-danger" : "text-amber-400",
                )}
              />
              <CardTitle className="text-sm font-semibold text-foreground">
                Sledeći korak i planirani potez
              </CardTitle>
            </div>

            {isOverdue && (
              <span className="rounded bg-danger/10 border border-danger/30 px-2 py-0.5 text-xs font-bold text-danger">
                Kasni {formatDurationMs(overdueDurationMs)}
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-4">
          {assignment?.nextActionAt ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-sm font-bold",
                      isOverdue ? "text-danger" : "text-foreground",
                    )}
                  >
                    {formatDateTime(assignment.nextActionAt)}
                  </span>
                  <span className="text-xs text-text-muted">
                    ({formatRelativeTime(assignment.nextActionAt)})
                  </span>
                </div>

                {assignment.lastTouchAt && (
                  <div className="text-xs text-text-muted">
                    Poslednji dodir:{" "}
                    <strong>{formatDateTime(assignment.lastTouchAt)}</strong> (
                    {formatRelativeTime(assignment.lastTouchAt)})
                  </div>
                )}
              </div>

              {assignment.nextActionNote ? (
                <div className="mt-1 rounded-lg border border-line bg-surface p-3 text-xs italic text-foreground">
                  „{assignment.nextActionNote}"
                </div>
              ) : (
                <div className="text-xs text-text-muted italic">
                  Nema unete napomene uz planirani korak.
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1 py-1 text-xs text-text-muted sm:flex-row sm:items-center sm:justify-between">
              <span>Nije zakazan sledeći korak za ovaj lead.</span>
              {assignment?.lastTouchAt && (
                <span>
                  Poslednji dodir:{" "}
                  <strong>{formatDateTime(assignment.lastTouchAt)}</strong> (
                  {formatRelativeTime(assignment.lastTouchAt)})
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* 3. KONTAKTI: leadIdentities panel sa ZZPL pravnim osnovom    */}
      {/* ════════════════════════════════════════════════════════════ */}
      <LeadIdentitiesPanel
        identities={detail.identities}
        people={detail.people}
        provenanceByField={detail.provenanceByField}
      />

      {/* ════════════════════════════════════════════════════════════ */}
      {/* 4. LANDING STRANICE: landingStatus (§7)                       */}
      {/* ════════════════════════════════════════════════════════════ */}
      <Card className="border-line bg-surface">
        <CardHeader className="border-b border-line pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">
                Besplatna landing stranica (Landing Tracker §7)
              </CardTitle>
              <CardDescription className="text-xs text-text-muted mt-0.5">
                Praćenje otvaranja stranice pripremljene za klijenta pre poziva ili sastanka.
              </CardDescription>
            </div>
            <span className="rounded bg-surface-raised border border-line px-2 py-0.5 text-micro font-medium text-text-muted">
              §7 Signal interesovanja
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-4">
          {/* Pravilo 3: Tri stanja se NE SMEJU stopiti:
              1) nema stranice
              2) stranica napravljena ali nije poslata
              3) poslata a nijednom otvorena
              + 4) otvorena bar jednom */}
          {!landing.hasLanding || landing.landings.length === 0 ? (
            // STANJE 1: Nema stranice
            <div className="py-6 text-center text-xs text-text-muted">
              Nema kreirane landing stranice za ovu firmu.
            </div>
          ) : (
            <div className="space-y-4">
              {landing.landings.map((l) => {
                const isSent = l.status === "poslata" || l.sentAt !== undefined;
                const isOpened = l.openCount > 0;

                return (
                  <div
                    key={l.landingId}
                    className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised/30 p-3.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground">
                          {l.label || "Glavna landing stranica"}
                        </span>

                        {/* Prikaz tačnog statusa */}
                        {!isSent ? (
                          // STANJE 2: Napravljena ali nije poslata
                          <span className="rounded bg-surface-raised border border-line px-2 py-0.5 text-micro font-semibold text-text-muted">
                            Napravljena (nije poslata)
                          </span>
                        ) : !isOpened ? (
                          // STANJE 3: Poslata a nijednom otvorena
                          <span className="rounded bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-micro font-semibold text-amber-500">
                            Poslata (0 otvaranja)
                          </span>
                        ) : (
                          // STANJE 4: Otvorena
                          <span className="rounded bg-success/10 border border-success/30 px-2 py-0.5 text-micro font-bold text-success">
                            Otvorena {l.openCount} puta
                          </span>
                        )}
                      </div>

                      {/* Vreme slanja */}
                      {l.sentAt && (
                        <div className="text-micro text-text-muted">
                          Poslata: <strong>{formatDateTime(l.sentAt)}</strong>{" "}
                          {l.sentVia && `(preko ${l.sentVia})`}
                        </div>
                      )}
                    </div>

                    {/* Detalji otvaranja */}
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 rounded-lg border border-line bg-surface p-2.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-micro text-text-muted">Status pregleda:</span>
                        <span className="font-semibold text-foreground">
                          {!isSent
                            ? "Stranica je pripremljena u sistemu, ali još uvek nije poslata klijentu."
                            : !isOpened
                              ? "Stranica je poslata, ali klijent je do ovog trenutka nije nijednom otvorio."
                              : `Klijent je otvorio stranicu ukupno ${l.openCount} puta.`}
                        </span>
                      </div>

                      {isOpened && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-micro text-text-muted">Poslednje otvaranje:</span>
                          <span className="font-semibold text-foreground">
                            {l.lastOpenedAt ? (
                              <>
                                {formatDateTime(l.lastOpenedAt)} ({formatRelativeTime(l.lastOpenedAt)})
                              </>
                            ) : (
                              "—"
                            )}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Upozorenje za trackedLinkMissing */}
                    {l.trackedLinkMissing && (
                      <div className="flex items-center gap-2 rounded bg-warning/10 border border-warning/30 p-2 text-micro text-warning">
                        <AlertTriangle className="size-3.5 shrink-0" />
                        <span>Praćeni link nije pronađen u sistemu (trackedLinkMissing).</span>
                      </div>
                    )}

                    {/* Informacije o ignorisanim bot i overCap posetama */}
                    {(l.botHitsIgnored > 0 || l.overCapIgnored > 0) && (
                      <div className="flex flex-col gap-1 border-t border-line-soft pt-2 text-micro text-text-muted">
                        {l.botHitsIgnored > 0 && (
                          <div className="flex items-center gap-1.5">
                            <Bot className="size-3 text-text-soft" />
                            <span>
                              Zanemareno <strong>{l.botHitsIgnored}</strong> automatskih poseta
                              (pretraživački roboti i preview servisi nisu uračunati u stvarna otvaranja).
                            </span>
                          </div>
                        )}
                        {l.overCapIgnored > 0 && (
                          <div className="flex items-center gap-1.5">
                            <ShieldAlert className="size-3 text-text-soft" />
                            <span>
                              Zanemareno <strong>{l.overCapIgnored}</strong> poseta koje prelaze
                              bezbednosni limit učestalosti na linku.
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* 5. VREMENSKA OSA: signals i stageEvents spojeni po vremenu   */}
      {/* ════════════════════════════════════════════════════════════ */}
      <LeadTimeline
        signals={detail.signals}
        stageEvents={crm.events}
        signalsTruncated={detail.signalsTruncated}
      />

      {/* ════════════════════════════════════════════════════════════ */}
      {/* 6. RADNJE: dodela, promena faze, dodir, sledeći korak, ishod  */}
      {/* ════════════════════════════════════════════════════════════ */}
      <LeadActionsPanel
        workspaceId={workspaceId}
        companyId={companyId}
        currentAssignment={assignment}
        companyName={company.name}
      />
    </div>
  );
}

function LeadDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-5 w-36" />

      {/* Header Skeleton */}
      <Card className="border-line bg-surface p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-28 rounded-lg" />
            <Skeleton className="h-10 w-28 rounded-lg" />
          </div>
        </div>
      </Card>

      {/* Next Action Skeleton */}
      <Card className="border-line bg-surface p-4">
        <Skeleton className="h-6 w-48 mb-2" />
        <Skeleton className="h-12 w-full" />
      </Card>

      {/* Contacts Skeleton */}
      <Card className="border-line bg-surface p-4">
        <Skeleton className="h-6 w-48 mb-4" />
        <div className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </Card>

      {/* Timeline Skeleton */}
      <Card className="border-line bg-surface p-4">
        <Skeleton className="h-6 w-48 mb-4" />
        <div className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </Card>
    </div>
  );
}
