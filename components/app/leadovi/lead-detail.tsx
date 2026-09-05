"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { GapType } from "@/convex/leadGapsStore";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  Calendar,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  Compass,
  Contact,
  ExternalLink,
  FileSearch,
  Globe,
  Landmark,
  MapPin,
  ScrollText,
  Send,
  ShieldAlert,
  User,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackNote } from "@/components/app/feedback";
import { TabNav, TabPanel } from "@/components/app/tab-nav";
import { useWorkspace } from "@/components/app/workspace-provider";
import { useNow } from "@/components/app/use-now";
import { LeadScoreCell } from "./lead-score-cell";
import { LeadIdentitiesPanel } from "./lead-identities-panel";
import { LeadTimeline } from "./lead-timeline";
import { LeadActionBar } from "./lead-action-bar";
import { LeadGapFillDialog } from "./lead-gap-fill-dialog";
import { ProvenanceBadge } from "./provenance-badge";
import { StageChip, TemperatureSelect } from "./lead-chips";
import { getErrorMessage } from "./lead-quick-dialogs";
import { leadGapLabel, personRoleLabel } from "./lead-labels";
import {
  describeNextUp,
  isMeetingSoon,
  isMeetingUnresolved,
  isNextActionOverdue,
  type LeadRowContact,
  type NextUpTone,
} from "./lead-urgency";
import {
  formatClockTime,
  formatDateTime,
  formatDayRelative,
  formatDaysAgo,
  formatRelativeTime,
} from "@/lib/format";
import { cn } from "@/lib/utils";

type LeadDetailProps = {
  workspaceId: Id<"workspaces">;
  companyId: Id<"leadCompanies">;
};

type ProfileTab = "istorija" | "kontakti" | "firma" | "landing" | "rupe";

const NEXT_UP_TONE: Record<NextUpTone, { box: string; icon: typeof ArrowRight; ink: string }> = {
  danger: { box: "border-danger/40 bg-danger/5", icon: CircleAlert, ink: "text-danger" },
  warning: { box: "border-warning/40 bg-warning/5", icon: CalendarClock, ink: "text-warning" },
  success: { box: "border-success/40 bg-success/5", icon: CircleCheck, ink: "text-success" },
  neutral: { box: "border-line bg-surface", icon: ArrowRight, ink: "text-accent-400" },
  muted: { box: "border-line-soft bg-surface", icon: Compass, ink: "text-text-muted" },
};

const GAP_HINT: Record<GapType, string> = {
  bez_telefona: "Bez broja nema poziva iz tabele — ikona telefona ostaje prigušena.",
  bez_kontakt_osobe: "Nema imena kome se obraćaš; kontakt ide na centralu.",
  bez_vlasnika: "Niko nije zadužen, pa se lead ne pojavljuje ni u čijem redu.",
  bez_sajta: "Ni sajt ni domen nisu zabeleženi — signal „nema sajt” može biti rupa u podacima, ne činjenica.",
  bez_pib: "Bez PIB-a dedupe pri uvozu ne može da prepozna istu firmu.",
};

function TabBadge({ count }: { count: number }) {
  return (
    <span className="ml-0.5 inline-flex min-w-4 items-center justify-center rounded-full border border-line bg-surface-raised px-1.5 py-px font-mono text-micro tabular-nums text-text-muted">
      {count}
    </span>
  );
}

function Fact({
  label,
  children,
  provenance,
  fieldName,
}: {
  label: string;
  children: React.ReactNode;
  provenance?: React.ComponentProps<typeof ProvenanceBadge>["provenance"];
  fieldName: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-2">
      <span className="text-micro text-text-muted">{label}</span>
      <div className="flex items-center gap-1">
        {children}
        <ProvenanceBadge provenance={provenance} fieldName={fieldName} compact />
      </div>
    </div>
  );
}

export function LeadDetail({ workspaceId, companyId }: LeadDetailProps) {
  const { user } = useWorkspace();
  const now = useNow();
  const [tab, setTab] = useState<ProfileTab>("istorija");
  const [gapToFill, setGapToFill] = useState<GapType | null>(null);
  const [temperatureError, setTemperatureError] = useState<string | null>(null);
  const setCompanyTemperatura = useMutation(api.leadCrmStore.setCompanyTemperatura);

  // 1. Podaci o firmi, osobama, identitetima, signalima i poreklu
  const detail = useQuery(api.leadDetailStore.getLeadDetail, { workspaceId, companyId });
  // 2. CRM stanje (vlasnik, faza, sledeći korak, sastanak, istorija)
  const crm = useQuery(api.leadCrmStore.getLeadCrm, { workspaceId, companyId });
  // 3. Ocenjivanje (fit i intent osa)
  const score = useQuery(api.leadScoringStore.scoreCompany, { workspaceId, companyId });
  // 4. Landing tracker status (§7)
  const landing = useQuery(api.leadLandingStore.landingStatus, { workspaceId, companyId });

  // Telefoni i mejlovi za traku radnji — iz identiteta koji su već učitani,
  // sa imenom osobe samo kad identitet nosi `personId` (isto pravilo kao §3).
  const contacts = useMemo(() => {
    const phones: LeadRowContact[] = [];
    const emails: LeadRowContact[] = [];
    if (!detail) return { phones, emails };
    const names = new Map(detail.people.map((p) => [p._id, p.name] as const));
    for (const identity of detail.identities) {
      if (identity.kind !== "phone" && identity.kind !== "email") continue;
      if (!identity.value.trim()) continue;
      const entry: LeadRowContact = { value: identity.value };
      const name = identity.personId ? names.get(identity.personId) : undefined;
      if (name) entry.personName = name;
      (identity.kind === "phone" ? phones : emails).push(entry);
    }
    return { phones, emails };
  }, [detail]);

  // §0 Pravilo: useQuery === undefined → Skeleton, NIKADA 0 niti delimični podaci
  if (detail === undefined || crm === undefined || score === undefined || landing === undefined) {
    return <LeadDetailSkeleton />;
  }

  const company = detail.company;
  const assignment = crm.assignment;
  const prov = detail.provenanceByField;

  const overdue = assignment ? isNextActionOverdue(assignment, now) : false;
  const meetingSoon = assignment ? isMeetingSoon(assignment, now) : false;
  const meetingUnresolved = assignment ? isMeetingUnresolved(assignment, now) : false;
  const nextUp = describeNextUp(assignment, now);
  const NextUpIcon = NEXT_UP_TONE[nextUp.tone].icon;
  const isMine = user?.id !== undefined && assignment !== null && String(assignment.ownerUserId) === user.id;

  // Rupe za OVU firmu, po istim pravilima kao `leadGapsStore.listCompaniesWithGap`,
  // ali iz podataka koji su već ovde — bez novog upita.
  const gaps: GapType[] = [];
  if (!detail.identities.some((i) => i.kind === "phone" && i.value.trim())) gaps.push("bez_telefona");
  if (detail.people.length === 0) gaps.push("bez_kontakt_osobe");
  if (!assignment) gaps.push("bez_vlasnika");
  if (
    !company.website?.trim() &&
    !company.domainNormalized?.trim() &&
    !detail.identities.some((i) => i.kind === "website" && i.value.trim())
  ) {
    gaps.push("bez_sajta");
  }
  if (!company.pib?.trim()) gaps.push("bez_pib");

  const historyCount = crm.events.length + detail.signals.length;

  const locationParts = (
    [
      { vrednost: company.street, polje: "street", naziv: "Ulica" },
      { vrednost: company.municipality, polje: "municipality", naziv: "Opština" },
      { vrednost: company.city, polje: "city", naziv: "Grad" },
    ] as const
  ).filter((d) => Boolean(d.vrednost));

  return (
    <div className="flex flex-col gap-6 pb-12">
      <Link
        href="/leadovi"
        className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        <span>Nazad na sve leadove</span>
      </Link>

      {/* ── Zaglavlje: naziv, činjenice u jednom redu, „šta je sledeće”, radnje ── */}
      <Card className="overflow-hidden border-line bg-surface">
        <div className="flex flex-col gap-4 border-b border-line bg-surface-raised/40 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="break-words text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  {company.name}
                </h1>
                <ProvenanceBadge
                  provenance={prov.name ?? prov["leadCompanies:name"]}
                  fieldName="Naziv firme"
                  compact
                />
                <span
                  className={cn(
                    "rounded border px-2 py-0.5 text-micro font-semibold",
                    company.origin === "inbound"
                      ? "border-accent-400/30 bg-accent-400/10 text-accent-400"
                      : "border-line bg-surface-raised text-text-muted",
                  )}
                >
                  {company.origin === "inbound" ? "Inbound" : "Uvoz"}
                </span>
              </div>

              {/* Jedan red činjenica (§8): grad · temperatura · faza · sledeći korak · sastanak · vlasnik */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-muted">
                {company.city ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5 shrink-0" />
                    {company.city}
                    {company.municipality && `, ${company.municipality}`}
                    {company.addressNeedsVerification && (
                      <span className="text-warning">(proveriti adresu)</span>
                    )}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5 shrink-0" />
                    grad nije zabeležen
                  </span>
                )}

                <TemperatureSelect
                  ariaLabel="Temperatura leada"
                  value={company.temperatura}
                  onChange={async (t) => {
                    setTemperatureError(null);
                    try {
                      await setCompanyTemperatura({ workspaceId, companyId, temperatura: t });
                    } catch (err) {
                      setTemperatureError(getErrorMessage(err));
                    }
                  }}
                />

                <StageChip stage={assignment?.stage ?? "nov"} />

                <span className="inline-flex items-center gap-1.5">
                  <Calendar className={cn("size-3.5 shrink-0", overdue && "text-danger")} />
                  {assignment?.nextActionAt !== undefined ? (
                    <span className={overdue ? "font-semibold text-danger" : "font-medium text-foreground"}>
                      {formatDayRelative(assignment.nextActionAt, now)} u{" "}
                      {formatClockTime(assignment.nextActionAt)}
                      {overdue && " · kasni"}
                    </span>
                  ) : (
                    <span>nema sledećeg koraka</span>
                  )}
                </span>

                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock
                    className={cn(
                      "size-3.5 shrink-0",
                      meetingUnresolved ? "text-danger" : meetingSoon && "text-warning",
                    )}
                  />
                  {assignment?.meetingAt !== undefined ? (
                    <span
                      className={cn(
                        "font-medium",
                        meetingUnresolved
                          ? "text-danger"
                          : meetingSoon
                            ? "text-warning"
                            : "text-foreground",
                      )}
                    >
                      sastanak {formatDayRelative(assignment.meetingAt, now)} u{" "}
                      {formatClockTime(assignment.meetingAt)}
                      {meetingUnresolved && " · bez ishoda"}
                    </span>
                  ) : (
                    <span>nema sastanka</span>
                  )}
                </span>

                <span className="inline-flex items-center gap-1.5" title={assignment ? String(assignment.ownerUserId) : undefined}>
                  <User className="size-3.5 shrink-0" />
                  {assignment ? (
                    <span className={cn(isMine && "font-medium text-foreground")}>
                      {isMine ? "vlasnik: ti" : "vlasnik: član tima"}
                    </span>
                  ) : (
                    <span>bez vlasnika</span>
                  )}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2.5">
              <LeadScoreCell axis="fit" score={score?.fit} className="w-32" />
              <LeadScoreCell axis="intent" score={score?.intent} className="w-32" />
            </div>
          </div>

          {temperatureError && (
            <FeedbackNote tone="danger" title="Temperatura nije sačuvana">
              {temperatureError}
            </FeedbackNote>
          )}

          {/* „Šta je sledeće” — jedna rečenica iz stanja (§8) */}
          <div
            className={cn(
              "flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm",
              NEXT_UP_TONE[nextUp.tone].box,
            )}
            role="status"
          >
            <NextUpIcon className={cn("size-4 shrink-0", NEXT_UP_TONE[nextUp.tone].ink)} aria-hidden />
            <p className="min-w-0">
              <span className="text-text-muted">Šta je sledeće: </span>
              <span className="font-medium text-foreground">{nextUp.text}</span>
            </p>
          </div>
        </div>

        <div className="p-3 sm:px-5 sm:py-3.5">
          <LeadActionBar
            workspaceId={workspaceId}
            companyId={companyId}
            companyName={company.name}
            assignment={assignment}
            phones={contacts.phones}
            emails={contacts.emails}
          />
        </div>
      </Card>

      {/* ── Jezičci: istorija, kontakti, firma i poreklo, landing, rupe ── */}
      <TabNav
        panelId="lead-profile-panel"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "istorija", label: "Istorija", icon: ScrollText, badge: <TabBadge count={historyCount} /> },
          { id: "kontakti", label: "Kontakti", icon: Contact, badge: <TabBadge count={detail.identities.length} /> },
          { id: "firma", label: "Firma i poreklo", icon: Landmark },
          { id: "landing", label: "Landing", icon: Send },
          { id: "rupe", label: "Rupe u podacima", icon: FileSearch, badge: <TabBadge count={gaps.length} /> },
        ]}
      />

      <TabPanel id="lead-profile-panel" className="flex flex-col gap-4">
        {tab === "istorija" && (
          <>
            {crm.eventsTruncated && (
              <FeedbackNote tone="warning" title="Prikazan je deo istorije">
                Učitano je {crm.events.length} najskorijih CRM događaja od{" "}
                {crm.procitanoDogadjaja} pročitanih; stariji nisu u ovom pregledu.
              </FeedbackNote>
            )}
            <LeadTimeline
              signals={detail.signals}
              stageEvents={crm.events}
              signalsTruncated={detail.signalsTruncated}
            />
          </>
        )}

        {tab === "kontakti" && (
          <>
            <Card className="border-line bg-surface">
              <CardHeader className="border-b border-line pb-3">
                <CardTitle className="text-sm font-semibold text-foreground">
                  Osobe ({detail.people.length})
                </CardTitle>
                <CardDescription className="text-xs text-text-muted">
                  Kome se obraćaš i u kojoj ulozi.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                {detail.people.length === 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
                    <span>Nema kontakt osobe u bazi — kontakt ide na centralu firme.</span>
                    <Button size="xs" variant="outline" onClick={() => setGapToFill("bez_kontakt_osobe")}>
                      Dodaj osobu
                    </Button>
                  </div>
                ) : (
                  <ul className="flex flex-col divide-y divide-line-soft">
                    {detail.people.map((p) => (
                      <li key={p._id} className="flex flex-wrap items-center gap-2 py-2 text-xs first:pt-0 last:pb-0">
                        <User className="size-3.5 text-text-muted" aria-hidden />
                        <span className="font-semibold text-foreground">{p.name}</span>
                        <span className="rounded border border-line bg-surface-raised px-1.5 py-px text-micro text-text-muted">
                          {personRoleLabel(p.role)}
                          {p.roleConfidence === "verovatno" && " · verovatno"}
                          {p.roleConfidence === "nepoznato" && " · pouzdanost nepoznata"}
                        </span>
                        <ProvenanceBadge
                          provenance={prov[`person_${p._id}`] ?? prov[String(p._id)]}
                          fieldName="Osoba"
                          compact
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <LeadIdentitiesPanel
              identities={detail.identities}
              people={detail.people}
              provenanceByField={detail.provenanceByField}
            />
          </>
        )}

        {tab === "firma" && (
          <Card className="border-line bg-surface">
            <CardHeader className="border-b border-line pb-3">
              <CardTitle className="text-sm font-semibold text-foreground">
                Podaci o firmi i poreklo svakog polja
              </CardTitle>
              <CardDescription className="text-xs text-text-muted">
                Uz svaku vrednost stoji odakle je: pročitana, izvedena, ili poreklo nije zabeleženo.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 p-4 text-xs">
              <div className="grid grid-cols-2 gap-y-3 divide-x divide-line sm:grid-cols-4">
                <Fact label="PIB" fieldName="PIB" provenance={prov.pib ?? prov["leadCompanies:pib"]}>
                  <span className="font-mono font-semibold tabular-nums text-foreground">
                    {company.pib?.trim() || "nema"}
                  </span>
                </Fact>
                <Fact label="Matični broj" fieldName="Matični broj" provenance={prov.maticniBroj ?? prov["leadCompanies:maticniBroj"]}>
                  <span className="font-mono font-semibold tabular-nums text-foreground">
                    {company.maticniBroj?.trim() || "nema"}
                  </span>
                </Fact>
                <Fact label="Šifra delatnosti" fieldName="Šifra delatnosti" provenance={prov.sifraDelatnosti ?? prov["leadCompanies:sifraDelatnosti"]}>
                  <span className="font-mono font-semibold tabular-nums text-foreground">
                    {company.sifraDelatnosti?.trim() || "nema"}
                  </span>
                </Fact>
                <Fact label="CompanyWall" fieldName="CompanyWall" provenance={prov.companyWallUrl ?? prov["leadCompanies:companyWallUrl"]}>
                  {company.companyWallUrl ? (
                    <a
                      href={company.companyWallUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 text-accent-400 hover:underline"
                    >
                      Profil <ExternalLink className="size-2.5" />
                    </a>
                  ) : (
                    <span className="text-text-muted">nema</span>
                  )}
                </Fact>
              </div>

              <div className="flex flex-col gap-2 border-t border-line-soft pt-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <MapPin className="size-3.5 shrink-0 text-text-muted" />
                  {locationParts.length === 0 ? (
                    <span className="text-text-muted">Adresa nije zabeležena.</span>
                  ) : (
                    locationParts.map((d, i) => (
                      <span key={d.polje} className="inline-flex items-center gap-1">
                        <span className="text-foreground">{d.vrednost}</span>
                        <ProvenanceBadge
                          provenance={prov[d.polje] ?? prov[`leadCompanies:${d.polje}`]}
                          fieldName={d.naziv}
                          compact
                        />
                        {i < locationParts.length - 1 && <span className="text-text-muted">,</span>}
                      </span>
                    ))
                  )}
                  {company.addressNeedsVerification && (
                    <span className="rounded border border-warning/30 bg-warning/10 px-1.5 py-px text-micro font-semibold text-warning">
                      proveriti adresu
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Globe className="size-3.5 shrink-0 text-text-muted" />
                  {company.website ? (
                    <>
                      <a
                        href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-[260px] items-center gap-0.5 truncate text-accent-400 hover:underline"
                      >
                        <span>{company.website.replace(/^https?:\/\//, "")}</span>
                        <ExternalLink className="size-2.5 shrink-0" />
                      </a>
                      <ProvenanceBadge provenance={prov.website ?? prov["leadCompanies:website"]} fieldName="Sajt" compact />
                    </>
                  ) : (
                    <span className="text-text-muted">Sajt nije zabeležen.</span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-line-soft pt-3 text-micro text-text-muted">
                <span>
                  Prvi izvor: <strong className="text-foreground">{company.firstSeenSource ?? "nije zabeležen"}</strong>
                </span>
                <span>
                  U bazi od: <strong className="text-foreground">{formatDateTime(company.createdAt)}</strong>
                </span>
                <span>
                  Poslednja izmena: <strong className="text-foreground">{formatRelativeTime(company.updatedAt)}</strong>
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {tab === "landing" && (
          <Card className="border-line bg-surface">
            <CardHeader className="border-b border-line pb-3">
              <CardTitle className="text-sm font-semibold text-foreground">
                Besplatna landing stranica
              </CardTitle>
              <CardDescription className="text-xs text-text-muted">
                Praćenje otvaranja stranice pripremljene za klijenta pre poziva ili sastanka.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              {/* Četiri stanja koja se NE SMEJU stopiti: nema stranice / napravljena, nije poslata / poslata, nijednom otvorena / otvorena */}
              {!landing.hasLanding || landing.landings.length === 0 ? (
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
                            {!isSent ? (
                              <span className="rounded border border-line bg-surface-raised px-2 py-0.5 text-micro font-semibold text-text-muted">
                                Napravljena (nije poslata)
                              </span>
                            ) : !isOpened ? (
                              <span className="rounded border border-warning/30 bg-warning/10 px-2 py-0.5 text-micro font-semibold text-warning">
                                Poslata (0 otvaranja)
                              </span>
                            ) : (
                              <span className="rounded border border-success/30 bg-success/10 px-2 py-0.5 text-micro font-bold text-success">
                                Otvorena {l.openCount} puta
                              </span>
                            )}
                          </div>
                          {l.sentAt && (
                            <div className="text-micro text-text-muted">
                              Poslata: <strong>{formatDateTime(l.sentAt)}</strong>{" "}
                              {l.sentVia && `(preko ${l.sentVia})`}
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 gap-2 rounded-lg border border-line bg-surface p-2.5 sm:grid-cols-2">
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
                                    {formatDateTime(l.lastOpenedAt)} ({formatDaysAgo(l.lastOpenedAt, now)})
                                  </>
                                ) : (
                                  "vreme nije zabeleženo"
                                )}
                              </span>
                            </div>
                          )}
                        </div>

                        {l.trackedLinkMissing && (
                          <div className="flex items-center gap-2 rounded border border-warning/30 bg-warning/10 p-2 text-micro text-warning">
                            <AlertTriangle className="size-3.5 shrink-0" />
                            <span>Praćeni link nije pronađen u sistemu (trackedLinkMissing).</span>
                          </div>
                        )}

                        {(l.botHitsIgnored > 0 || l.overCapIgnored > 0) && (
                          <div className="flex flex-col gap-1 border-t border-line-soft pt-2 text-micro text-text-muted">
                            {l.botHitsIgnored > 0 && (
                              <div className="flex items-center gap-1.5">
                                <Bot className="size-3" />
                                <span>
                                  Zanemareno <strong>{l.botHitsIgnored}</strong> automatskih poseta (roboti i preview servisi nisu uračunati).
                                </span>
                              </div>
                            )}
                            {l.overCapIgnored > 0 && (
                              <div className="flex items-center gap-1.5">
                                <ShieldAlert className="size-3" />
                                <span>
                                  Zanemareno <strong>{l.overCapIgnored}</strong> poseta preko bezbednosnog limita učestalosti.
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
        )}

        {tab === "rupe" && (
          <Card className="border-line bg-surface">
            <CardHeader className="border-b border-line pb-3">
              <CardTitle className="text-sm font-semibold text-foreground">
                Rupe u podacima ({gaps.length})
              </CardTitle>
              <CardDescription className="text-xs text-text-muted">
                Šta fali ovoj firmi da bi se sa njom radilo iz tabele. Ista pravila kao na
                jezičku „Rupe u podacima” svih leadova.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {gaps.length === 0 ? (
                <div className="flex flex-col items-center gap-1 p-10 text-center">
                  <CircleCheck className="size-8 text-success" aria-hidden />
                  <p className="text-sm font-semibold text-foreground">Nema rupa</p>
                  <p className="text-xs text-text-muted">
                    Telefon, kontakt osoba, vlasnik, sajt i PIB su popunjeni.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {gaps.map((gap) => (
                    <li
                      key={gap}
                      className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-sm font-semibold text-foreground">{leadGapLabel(gap)}</span>
                        <span className="text-xs text-text-muted">{GAP_HINT[gap]}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 text-xs"
                        onClick={() => setGapToFill(gap)}
                      >
                        Popuni
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </TabPanel>

      {gapToFill && (
        <LeadGapFillDialog
          workspaceId={workspaceId}
          company={company}
          gapType={gapToFill}
          isOpen
          onOpenChange={(open) => {
            if (!open) setGapToFill(null);
          }}
        />
      )}
    </div>
  );
}

function LeadDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-5 w-36" />

      <Card className="border-line bg-surface p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-32 rounded-lg" />
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
        </div>
        <Skeleton className="mt-4 h-10 w-full rounded-lg" />
        <div className="mt-4 flex flex-wrap gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-28 rounded-lg" />
          ))}
        </div>
      </Card>

      <div className="flex gap-2 border-b border-line pb-3">
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>

      <Card className="border-line bg-surface p-4">
        <Skeleton className="mb-4 h-6 w-48" />
        <div className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </Card>
    </div>
  );
}
