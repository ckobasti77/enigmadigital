"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { LeadScore } from "@/convex/lib/leadScoring";
import {
  Activity,
  ArrowRight,
  CalendarClock,
  ExternalLink,
  Phone,
  PhoneCall,
  PhoneOff,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Chip } from "@/components/app/system/chip";
import { useNow } from "@/components/app/use-now";
import { Unfold } from "@/components/motion/unfold";
import { STRENGTH_HIGH_PCT, STRENGTH_TEXT_CLASS, strengthOf } from "@/lib/strength";
import { formatClockTime, formatDayRelative, localDayDiff, pluralSr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LeadCallStrip } from "./lead-call-strip";
import { LeadGapFillDialog } from "./lead-gap-fill-dialog";
import { LeadRowDialogs, type LeadRowDialogState } from "./lead-row-dialogs";
import { PRIMARY_ACTION_CLASS } from "./lead-row-actions";
import { axisPct, zastoSignals } from "./lead-columns";
import { leadSignalLabel } from "./lead-labels";
import { groupMeetings, type MeetingItem } from "./meetings-panel";
import {
  ROW_EDGE_CLASS,
  isMeetingUnresolved,
  rowEdge,
  telHref,
  type LeadRowItem,
} from "./lead-urgency";
import { useLeadFilters } from "./use-lead-filters";

/**
 * ============================================================================
 * „DANAS" — podrazumevani prikaz leadova (A3, plan O1)
 * ============================================================================
 *
 * Izmereno 9.9.2026 (plan §1.1): stranica se otvarala na tabelu od 178 redova
 * bez ijednog predloga šta prvo; logika hitnosti je postojala u kodu, a ulazna
 * površina je nije koristila. Ovde je red brojeva sa OBJAŠNJENIM imeniocem i
 * tri trake, svaka sa najviše pet kartica i „Vidi sve (N)" koje otvara tabelu
 * sa tačno tim filterom.
 *
 * Sve se čita kroz POSTOJEĆE upite (O8: `convex/` se ne dira): kandidati za
 * „Zovi sada" su `listLeadsFiltered` sa `tel ≥ 40` i `dodir = nikad`, ocene
 * kroz `scoreCompanies`, „Vrati se na" iz `listOverdue` + `listMeetings`,
 * „Dopuni pa zovi" iz `listCompaniesWithGap(bez_telefona)`. Granice tih
 * upita se prenose na ekran, ne prećutkuju.
 *
 * Prazna traka NIKAD ne slavi prazninu: kaže šta nedostaje i šta to rešava.
 */

/** Koliko kandidata se čita po traci (ocene: granica 100 po upitu). */
const KANDIDATA = 50;
const MAX_KARTICA = 5;
const VRATI_SE_DANA = 3;

export function LeadsToday({ workspaceId }: { workspaceId: Id<"workspaces"> }) {
  const now = useNow();
  const { applyQuery, setNav } = useLeadFilters();

  const facet = useQuery(api.leadFiltersStore.countLeadsByFacet, { workspaceId });
  const gaps = useQuery(api.leadGapsStore.listGaps, { workspaceId });
  const zoviData = useQuery(api.leadFiltersStore.listLeadsFiltered, {
    workspaceId,
    tel: 40,
    dodir: ["nikad"],
    strana: 1,
    poStrani: KANDIDATA,
  });
  const overdue = useQuery(api.leadCrmStore.listOverdue, { workspaceId, limit: KANDIDATA });
  const meetingsData = useQuery(api.leadCrmStore.listMeetings, { workspaceId });
  const bezBroja = useQuery(api.leadGapsStore.listCompaniesWithGap, {
    workspaceId,
    gapType: "bez_telefona",
    limit: KANDIDATA,
  });
  const niches = useQuery(api.nichesStore.listNiches, { workspaceId });

  const zoviItems = useMemo(
    () => (zoviData?.items ?? []) as LeadRowItem[],
    [zoviData],
  );
  const zoviIds = useMemo(
    () => zoviItems.map((i) => i.company?._id).filter((id): id is Id<"leadCompanies"> => Boolean(id)),
    [zoviItems],
  );
  const zoviScores = useQuery(
    api.leadScoringStore.scoreCompanies,
    zoviIds.length > 0 ? { workspaceId, companyIds: zoviIds } : "skip",
  ) as Record<string, LeadScore> | undefined;

  const bezBrojaIds = useMemo(
    () => (bezBroja?.companies ?? []).map((c) => c._id),
    [bezBroja],
  );
  const dopuniScores = useQuery(
    api.leadScoringStore.scoreCompanies,
    bezBrojaIds.length > 0 ? { workspaceId, companyIds: bezBrojaIds } : "skip",
  ) as Record<string, LeadScore> | undefined;

  const nisaPoId = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of niches ?? []) m.set(String(n._id), n.naziv);
    return m;
  }, [niches]);
  const nisaZa = (company: Doc<"leadCompanies"> | null) =>
    company?.nicheId ? (nisaPoId.get(String(company.nicheId)) ?? null) : null;

  const [dialog, setDialog] = useState<LeadRowDialogState | null>(null);
  const [callStrip, setCallStrip] = useState<{ companyId: string; phone: string } | null>(null);
  const [fillCompany, setFillCompany] = useState<Doc<"leadCompanies"> | null>(null);

  // ── Zovi sada: ima telefon, procena ≥ 40 %, nikad dodirnut, Fit ≥ prosek ──
  const zovi = useMemo(() => {
    if (!zoviData) return null;
    const saOcenom = zoviItems.map((item) => ({
      item,
      fit: item.company ? axisPct(zoviScores?.[item.company._id]?.fit) : null,
    }));
    const merljivi = saOcenom.filter((x) => x.fit !== null) as { item: LeadRowItem; fit: number }[];
    const prosek =
      merljivi.length > 0
        ? Math.round(merljivi.reduce((s, x) => s + x.fit, 0) / merljivi.length)
        : null;
    // Bez ijedne merljive ocene (npr. još nema pravila) Fit ne filtrira —
    // ostala tri kriterijuma i dalje važe, i to se ispisuje.
    const izabrani = (prosek === null ? saOcenom : merljivi.filter((x) => x.fit >= prosek))
      .sort((a, b) => (b.fit ?? -1) - (a.fit ?? -1))
      .slice(0, MAX_KARTICA);
    return { izabrani, prosek, ukupno: zoviData.ukupno, ocenjeno: zoviScores !== undefined || zoviIds.length === 0 };
  }, [zoviData, zoviItems, zoviScores, zoviIds.length]);

  // ── Vrati se na: zaostali + sastanci (prošli bez ishoda, i u naredna 3 dana) ──
  const vrati = useMemo(() => {
    if (!overdue || !meetingsData) return null;
    const groups = groupMeetings(meetingsData.items as MeetingItem[], meetingsData.now);
    const uskoro = [...groups.danas, ...groups.sutra, ...groups.oveNedelje].filter(
      (m) => localDayDiff(m.meetingAt, now) <= VRATI_SE_DANA,
    );
    type Stavka = { item: LeadRowItem; razlog: string; tone: "danger" | "warning" | "neutral"; kind: "sastanak_bez_ishoda" | "zaostao" | "sastanak" };
    const stavke: Stavka[] = [];
    const videne = new Set<string>();
    const dodaj = (s: Stavka) => {
      const key = String(s.item.assignment.companyId);
      if (videne.has(key)) return;
      videne.add(key);
      stavke.push(s);
    };
    const kaoRed = (m: MeetingItem): LeadRowItem => ({
      assignment: m.assignment,
      company: m.company,
      telefoni: [],
      emailovi: [],
      platforme: [],
      osobe: [],
      signali: [],
    });
    for (const m of groups.prosliBezIshoda) {
      dodaj({
        item: kaoRed(m),
        razlog: `Sastanak ${formatDayRelative(m.meetingAt, now)} ${formatClockTime(m.meetingAt)} — ishod nije zabeležen`,
        tone: "danger",
        kind: "sastanak_bez_ishoda",
      });
    }
    const zaostali = [...(overdue.items as (LeadRowItem & { delayMs: number })[])].sort(
      (a, b) => b.delayMs - a.delayMs,
    );
    for (const z of zaostali) {
      const dana = localDayDiff(now, z.assignment.nextActionAt ?? now);
      dodaj({
        item: z,
        razlog:
          (dana <= 0 ? `Rok istekao danas u ${formatClockTime(z.assignment.nextActionAt ?? now)}` : `Kasni ${dana} ${pluralSr(dana, "dan", "dana", "dana")}`) +
          (z.assignment.nextActionNote ? ` — „${z.assignment.nextActionNote}”` : ""),
        tone: "danger",
        kind: "zaostao",
      });
    }
    for (const m of uskoro.sort((a, b) => a.meetingAt - b.meetingAt)) {
      dodaj({
        item: kaoRed(m),
        razlog: `Sastanak ${formatDayRelative(m.meetingAt, now)} u ${formatClockTime(m.meetingAt)}${m.meetingNote ? ` — „${m.meetingNote}”` : ""}`,
        tone: "warning",
        kind: "sastanak",
      });
    }
    return {
      stavke: stavke.slice(0, MAX_KARTICA),
      ukupno: stavke.length,
      zaostalih: overdue.count,
      sastanaka: groups.prosliBezIshoda.length + uskoro.length,
      mozdaImaJos: overdue.mozdaImaJos || meetingsData.mozdaImaJos,
    };
  }, [overdue, meetingsData, now]);

  // ── Dopuni pa zovi: nema telefon, a Fit je visok ──
  const dopuni = useMemo(() => {
    if (!bezBroja) return null;
    const ocenjeni = bezBroja.companies
      .map((company) => {
        const score = dopuniScores?.[company._id];
        return { company, fit: axisPct(score?.fit), score };
      })
      .filter((x): x is { company: Doc<"leadCompanies">; fit: number; score: LeadScore } => x.fit !== null && x.score !== undefined);
    const visoki = ocenjeni.filter((x) => x.fit >= STRENGTH_HIGH_PCT).sort((a, b) => b.fit - a.fit);
    return {
      izabrani: visoki.slice(0, MAX_KARTICA),
      ukupno: visoki.length,
      pregledano: bezBroja.companies.length,
      odseceno: bezBroja.companies.length >= KANDIDATA,
      ocenjeno: dopuniScores !== undefined || bezBrojaIds.length === 0,
      bezOcene: bezBroja.companies.length > 0 && ocenjeni.length === 0 && dopuniScores !== undefined,
    };
  }, [bezBroja, dopuniScores, bezBrojaIds.length]);

  const otvoriTabelu = (qs: string) => applyQuery(qs, { tab: "leads" });

  const ukupnoBezTelefona = gaps?.bezTelefona ?? null;

  return (
    <div className="flex flex-col gap-8">
      {/* ── Red brojeva sa objašnjenim imeniocem (O1, O7) ── */}
      <section aria-label="Brojevi leadova" className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Broj
            value={gaps?.ukupnoFirmi}
            najmanje={gaps?.nepotpuno}
            label="u bazi"
            hint="Sve firme, i one bez vlasnika — vide se u Rupama u podacima."
            onClick={() => setNav({ tab: "gaps" })}
          />
          <Broj
            value={facet?.prekoracen ? undefined : facet?.ukupno}
            label="u preseku"
            hint="Leadovi sa vlasnikom — redovi tabele, bez ijednog filtera."
            onClick={() => otvoriTabelu("")}
          />
          <Broj
            value={facet?.prekoracen ? undefined : facet?.tel["0"]}
            label="sa procenom telefona"
            hint="Bar jedan broj ima procenu da pripada baš toj osobi."
            onClick={() => otvoriTabelu("tel=0")}
          />
          <Broj
            value={facet?.prekoracen ? undefined : facet?.sajt.ima}
            label="sa sajtom"
            hint="Firme sa upisanim sajtom; „nismo gledali” ne ulazi ovde."
            onClick={() => otvoriTabelu("sajt=ima")}
          />
          <Broj
            value={facet?.prekoracen ? undefined : facet?.dodir.nikad}
            label="nikad dodirnuto"
            hint="Leadovi bez ijednog zabeleženog dodira."
            onClick={() => otvoriTabelu("dodir=nikad")}
          />
          <Broj
            value={facet?.prekoracen ? undefined : facet?.koord.da}
            label="na mapi"
            hint="Leadovi sa koordinatama — samo oni se crtaju na mapi."
            onClick={() => applyQuery("koord=da", { tab: "map" })}
          />
        </div>
        {facet?.prekoracen && (
          <p className="text-meta text-text-muted">
            Radni prostor ima više od {facet.granica} dodela, pa se brojevi preseka ne računaju.
          </p>
        )}
      </section>

      {/* ── Zovi sada ── */}
      <Traka
        naslov="Zovi sada"
        icon={PhoneCall}
        kriterijum={
          zovi?.prosek !== null && zovi?.prosek !== undefined
            ? `ima telefon · procena ≥ 40 % · nikad dodirnut · Fit ≥ prosek (${zovi.prosek} %)`
            : "ima telefon · procena ≥ 40 % · nikad dodirnut"
        }
        ukupno={zovi?.ukupno}
        vidiSve={
          zovi && zovi.ukupno > 0
            ? { label: `Vidi sve (${zovi.ukupno})`, onClick: () => otvoriTabelu("tel=40&dodir=nikad") }
            : undefined
        }
        loading={zovi === null || !zovi.ocenjeno}
        prazno={
          zovi && zovi.ukupno === 0 ? (
            facet && !facet.prekoracen && facet.tel["0"] === 0 ? (
              <>
                Nijedna firma nema procenu čiji je broj, pa ni jedna ne prelazi prag od 40 %.
                Procena stiže iz skilla (<code className="font-mono text-meta">obogati --polja osobe</code>) ili se upisuje na profilu firme.
                {ukupnoBezTelefona !== null && ukupnoBezTelefona > 0 && (
                  <> Uz to, {ukupnoBezTelefona} {pluralSr(ukupnoBezTelefona, "firma nema", "firme nemaju", "firmi nema")} broj — traka „Dopuni pa zovi”.</>
                )}
              </>
            ) : (
              <>
                Sve firme sa pouzdanim brojem (procena ≥ 40 %) već su dodirnute.
                Sledeći poziv čeka u traci „Vrati se na”, a nove kandidate donosi
                procena telefona za ostale ({facet && !facet.prekoracen ? facet.ukupno - facet.tel["40"] : "—"} bez nje).
              </>
            )
          ) : undefined
        }
      >
        {zovi?.izabrani.map(({ item, fit }) => {
          const company = item.company;
          const phone = item.telefoni[0]?.value;
          const strip = callStrip?.companyId === String(item.assignment.companyId) ? callStrip.phone : null;
          const z = zastoSignals(item);
          return (
            <Kartica
              key={item.assignment._id}
              edge={rowEdge(item, now)}
              companyId={item.assignment.companyId}
              name={company?.name ?? "Nepoznata firma"}
              meta={[company?.city, nisaZa(company)].filter(Boolean).join(" · ")}
              zasto={
                <>
                  {fit !== null && <FitOznaka fit={fit} />}
                  {z.shown.map((k) => (
                    <Chip key={k} size="sm" tone="neutral" title={leadSignalLabel(k)}>
                      {leadSignalLabel(k)}
                    </Chip>
                  ))}
                  {z.rest > 0 && <span className="font-mono text-meta tabular-nums text-text-muted">+{z.rest}</span>}
                  {z.shown.length === 0 && fit === null && <span className="text-meta text-text-muted">bez signala</span>}
                </>
              }
              primary={
                phone ? (
                  <a
                    href={telHref(phone)}
                    onClick={() => setCallStrip({ companyId: String(item.assignment.companyId), phone })}
                    className={PRIMARY_ACTION_CLASS}
                  >
                    <Phone className="size-3.5" aria-hidden />
                    Pozovi
                  </a>
                ) : null
              }
              secondary={
                <button
                  type="button"
                  onClick={() => setDialog({ kind: "outcome", item })}
                  className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-meta text-text-muted transition-colors hover:text-foreground"
                >
                  <Activity className="size-3.5" aria-hidden />
                  Zabeleži ishod
                </button>
              }
            >
              {strip && (
                <Unfold>
                  <LeadCallStrip
                    workspaceId={workspaceId}
                    companyId={item.assignment.companyId}
                    phone={strip}
                    onClose={() => setCallStrip(null)}
                    onScheduleMeeting={() => setDialog({ kind: "meeting", item, calledPhone: strip })}
                    onRecordOutcome={() => setDialog({ kind: "outcome", item })}
                    onNextStep={() => setDialog({ kind: "nextAction", item })}
                    className="mt-2 rounded-lg border border-line-soft bg-accent-400/5 px-3 py-2"
                  />
                </Unfold>
              )}
            </Kartica>
          );
        })}
      </Traka>

      {/* ── Vrati se na ── */}
      <Traka
        naslov="Vrati se na"
        icon={CalendarClock}
        kriterijum={`zaostao korak · sastanak bez ishoda · sastanak u naredna ${VRATI_SE_DANA} dana`}
        ukupno={vrati?.ukupno}
        vidiSve={
          vrati && vrati.ukupno > 0
            ? {
                label: vrati.zaostalih > 0 ? `Vidi sve zaostale (${vrati.zaostalih}${vrati.mozdaImaJos ? "+" : ""})` : `Sastanci (${vrati.sastanaka})`,
                onClick: () => (vrati.zaostalih > 0 ? otvoriTabelu("zaostali=1") : setNav({ tab: "meetings" })),
              }
            : undefined
        }
        dodatniLink={
          vrati && vrati.zaostalih > 0 && vrati.sastanaka > 0
            ? { label: `Sastanci (${vrati.sastanaka})`, onClick: () => setNav({ tab: "meetings" }) }
            : undefined
        }
        loading={vrati === null}
        prazno={
          vrati && vrati.ukupno === 0 ? (
            <>
              Nema zaostalih koraka ni sastanka u naredna {VRATI_SE_DANA} dana. Rok nastaje tek kad ga
              upišeš iz reda („Sledeći korak…”){facet && !facet.prekoracen && facet.dodir.nikad > 0 ? (
                <> — a {facet.dodir.nikad} {pluralSr(facet.dodir.nikad, "firma", "firme", "firmi")} još nema ni prvi dodir.</>
              ) : "."}
            </>
          ) : undefined
        }
        praznoAkcija={
          facet && !facet.prekoracen && facet.dodir.nikad > 0
            ? { label: "Nikad dodirnuti", onClick: () => otvoriTabelu("dodir=nikad") }
            : undefined
        }
      >
        {vrati?.stavke.map(({ item, razlog, tone, kind }) => {
          const company = item.company;
          const bezIshoda = kind === "sastanak_bez_ishoda" || isMeetingUnresolved(item.assignment, now);
          return (
            <Kartica
              key={item.assignment._id}
              edge={rowEdge(item, now)}
              companyId={item.assignment.companyId}
              name={company?.name ?? "Nepoznata firma"}
              meta={[company?.city, nisaZa(company)].filter(Boolean).join(" · ")}
              zasto={
                <span className={cn("text-meta", tone === "danger" ? "font-medium text-danger" : tone === "warning" ? "font-medium text-warning" : "text-foreground")}>
                  {razlog}
                </span>
              }
              primary={
                bezIshoda ? (
                  <button type="button" onClick={() => setDialog({ kind: "outcome", item })} className={PRIMARY_ACTION_CLASS}>
                    <Activity className="size-3.5" aria-hidden />
                    Zabeleži ishod
                  </button>
                ) : (
                  <Link href={`/leadovi/${item.assignment.companyId}`} className={PRIMARY_ACTION_CLASS}>
                    <ExternalLink className="size-3.5" aria-hidden />
                    Otvori
                  </Link>
                )
              }
              secondary={
                <button
                  type="button"
                  onClick={() => setDialog({ kind: "touch", item })}
                  className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-meta text-text-muted transition-colors hover:text-foreground"
                >
                  <PhoneCall className="size-3.5" aria-hidden />
                  Zabeleži dodir
                </button>
              }
            />
          );
        })}
      </Traka>

      {/* ── Dopuni pa zovi ── */}
      <Traka
        naslov="Dopuni pa zovi"
        icon={PhoneOff}
        kriterijum={`nema telefon · Fit ≥ ${STRENGTH_HIGH_PCT} %`}
        ukupno={dopuni?.ukupno}
        najmanje={dopuni?.odseceno}
        vidiSve={
          ukupnoBezTelefona !== null && ukupnoBezTelefona > 0
            ? { label: `Sve bez broja (${ukupnoBezTelefona})`, onClick: () => setNav({ tab: "gaps" }) }
            : undefined
        }
        loading={dopuni === null || !dopuni.ocenjeno}
        prazno={
          dopuni && dopuni.ukupno === 0 ? (
            dopuni.pregledano === 0 ? (
              <>Svaka firma u bazi ima bar jedan broj. Sledeći korak je procena čiji je broj — traka „Zovi sada”.</>
            ) : dopuni.bezOcene ? (
              <>
                {dopuni.pregledano} {pluralSr(dopuni.pregledano, "firma nema", "firme nemaju", "firmi nema")} broj, ali nijedna nema
                izmeren Fit (nema pravila ili signala), pa se ne zna koju prvo dopuniti. Podesi ocenjivanje ili ih otvori sve u Rupama.
              </>
            ) : (
              <>
                {dopuni.pregledano} {pluralSr(dopuni.pregledano, "firma nema", "firme nemaju", "firmi nema")} broj, ali nijedna sa
                Fit-om ≥ {STRENGTH_HIGH_PCT} %. Dopuna se isplati kad je profil kupca jak — ostale su u Rupama u podacima.
              </>
            )
          ) : undefined
        }
        praznoAkcija={
          ukupnoBezTelefona !== null && ukupnoBezTelefona > 0
            ? { label: `Rupe u podacima (${ukupnoBezTelefona})`, onClick: () => setNav({ tab: "gaps" }) }
            : undefined
        }
      >
        {dopuni?.izabrani.map(({ company, fit, score }) => {
          const signali = [...new Set(score.fit.contributions.map((c) => c.signalKind))].slice(0, 3);
          return (
            <Kartica
              key={company._id}
              edge={null}
              companyId={company._id}
              name={company.name}
              meta={[company.city, nisaZa(company)].filter(Boolean).join(" · ")}
              zasto={
                <>
                  <FitOznaka fit={fit} />
                  <Chip size="sm" tone="warning">nema broj</Chip>
                  {signali.map((k) => (
                    <Chip key={k} size="sm" tone="neutral" title={leadSignalLabel(k)}>
                      {leadSignalLabel(k)}
                    </Chip>
                  ))}
                </>
              }
              primary={
                <button type="button" onClick={() => setFillCompany(company)} className={PRIMARY_ACTION_CLASS}>
                  <PhoneOff className="size-3.5" aria-hidden />
                  Dopuni
                </button>
              }
            />
          );
        })}
      </Traka>

      <LeadRowDialogs workspaceId={workspaceId} dialog={dialog} onClose={() => setDialog(null)} />
      {fillCompany && (
        <LeadGapFillDialog
          workspaceId={workspaceId}
          company={fillCompany}
          gapType="bez_telefona"
          isOpen
          onOpenChange={(open) => {
            if (!open) setFillCompany(null);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Delovi
// ─────────────────────────────────────────────────────────────────────────────

/** Jedan broj sa imeniocem — dugme koje postavlja filter. `undefined` = „—", nikad 0 kao „ne znamo". */
function Broj({
  value,
  najmanje,
  label,
  hint,
  onClick,
}: {
  value: number | undefined;
  najmanje?: boolean;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className="flex cursor-pointer flex-col items-start gap-0.5 rounded-lg border border-line bg-card px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-surface-raised"
    >
      <span className="font-mono text-title font-bold leading-none text-foreground tabular-nums">
        {value === undefined ? "—" : `${najmanje ? "≥ " : ""}${value}`}
      </span>
      <span className="text-meta text-text-muted">{label}</span>
    </button>
  );
}

function FitOznaka({ fit }: { fit: number }) {
  return (
    <span className="inline-flex items-baseline gap-1 text-meta text-text-muted" title="Fit — profil kupca">
      Fit
      <span className={cn("font-mono text-ui font-medium tabular-nums", STRENGTH_TEXT_CLASS[strengthOf(fit)])}>
        {fit}
      </span>
    </span>
  );
}

function Traka({
  naslov,
  icon: Icon,
  kriterijum,
  ukupno,
  najmanje,
  vidiSve,
  dodatniLink,
  loading,
  prazno,
  praznoAkcija,
  children,
}: {
  naslov: string;
  icon: React.ComponentType<{ className?: string }>;
  kriterijum: string;
  ukupno: number | undefined;
  najmanje?: boolean;
  vidiSve?: { label: string; onClick: () => void };
  dodatniLink?: { label: string; onClick: () => void };
  loading: boolean;
  prazno?: ReactNode;
  praznoAkcija?: { label: string; onClick: () => void };
  children?: ReactNode;
}) {
  return (
    <section aria-label={naslov} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="inline-flex items-center gap-2 text-title font-bold text-foreground">
          <Icon className="size-4 text-text-muted" aria-hidden />
          {naslov}
          {ukupno !== undefined && (
            <span className="font-mono text-ui font-medium tabular-nums text-text-muted">
              {najmanje ? "≥ " : ""}{ukupno}
            </span>
          )}
        </h2>
        <span className="text-meta text-text-muted">{kriterijum}</span>
        <span className="ml-auto flex items-center gap-3">
          {dodatniLink && (
            <button type="button" onClick={dodatniLink.onClick} className="cursor-pointer text-meta text-text-muted underline-offset-2 hover:text-foreground hover:underline">
              {dodatniLink.label}
            </button>
          )}
          {vidiSve && (
            <button
              type="button"
              onClick={vidiSve.onClick}
              className="inline-flex cursor-pointer items-center gap-1 text-meta font-medium text-accent-400 underline-offset-2 hover:underline"
            >
              {vidiSve.label}
              <ArrowRight className="size-3.5" aria-hidden />
            </button>
          )}
        </span>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : prazno ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line px-4 py-3 text-ui text-text-muted">
          <p className="min-w-0 flex-1">{prazno}</p>
          {praznoAkcija && (
            <button
              type="button"
              onClick={praznoAkcija.onClick}
              className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-line bg-surface-raised px-2.5 text-meta font-medium text-foreground transition-colors hover:border-line-strong"
            >
              {praznoAkcija.label}
              <ArrowRight className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
      )}
    </section>
  );
}

function Kartica({
  edge,
  companyId,
  name,
  meta,
  zasto,
  primary,
  secondary,
  children,
}: {
  edge: ReturnType<typeof rowEdge>;
  companyId: Id<"leadCompanies">;
  name: string;
  meta: string;
  zasto: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <article
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border border-l-4 border-line bg-card px-4 py-3 shadow-card",
        edge ? ROW_EDGE_CLASS[edge] : "border-l-line-strong",
      )}
    >
      <div className="min-w-0">
        <Link
          href={`/leadovi/${companyId}`}
          className="block truncate text-copy font-bold text-foreground transition-colors hover:text-accent-400 hover:underline"
        >
          {name}
        </Link>
        <p className="truncate text-meta text-text-muted">{meta || "—"}</p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">{zasto}</div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        {primary ?? <span className="text-meta text-text-muted">—</span>}
        {secondary}
      </div>
      {children}
    </article>
  );
}
