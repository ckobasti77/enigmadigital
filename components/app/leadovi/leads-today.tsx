"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useProjekatQuery } from "@/components/app/projekat-provider";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import type { LeadScore } from "@/convex/lib/leadScoring";
import { PRAVILA_XP } from "@/convex/lib/napredak";
import {
  Activity,
  ArrowRight,
  CalendarClock,
  ExternalLink,
  Phone,
  PhoneCall,
  PhoneOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Chip } from "@/components/app/system/chip";
import { FocusCard } from "@/components/app/system/focus-card";
import { ProgressBar, ProgressRing } from "@/components/app/system/progress";
import { StreakFlame } from "@/components/app/system/reward-badges";
import { REZIM_POZIVA_HREF } from "@/components/app/nav-items";
import {
  stanjeNiza,
  useNapredak,
  useSada,
} from "@/components/app/napredak/use-napredak";
import { useNow } from "@/components/app/use-now";
import { Unfold } from "@/components/motion/unfold";
import { CountUp } from "@/components/motion/count-up";
import { kvalitetBaze, type KvalitetKljuc } from "@/lib/lead-quality";
import { signalSlot } from "@/lib/signal-colors";
import { STRENGTH_HIGH_PCT } from "@/lib/strength";
import {
  formatClockTime,
  formatDayRelative,
  formatNumber,
  localDayDiff,
  pluralSr,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { LeadCallStrip } from "./lead-call-strip";
import { LeadGapFillDialog } from "./lead-gap-fill-dialog";
import { LeadRowDialogs, type LeadRowDialogState } from "./lead-row-dialogs";
import { axisPct, zastoSignals } from "./lead-columns";
import { leadSignalLabel } from "./lead-labels";
import { groupMeetings, type MeetingItem } from "./meetings-panel";
import { WorkCard, WorkSection } from "./work-card";
import {
  isMeetingUnresolved,
  rowEdge,
  telHref,
  type LeadRowItem,
} from "./lead-urgency";
import { useLeadFilters } from "./use-lead-filters";
import { KANDIDATA, useNisaZa, useZoviSada, type ZoviSada } from "./use-zovi-sada";

/**
 * ============================================================================
 * „DANAS" — podrazumevani prikaz leadova (A3, plan O1; tabla zadataka u B6)
 * ============================================================================
 *
 * Izmereno 9.9.2026 (plan §1.1): stranica se otvarala na tabelu od 178 redova
 * bez ijednog predloga šta prvo; logika hitnosti je postojala u kodu, a ulazna
 * površina je nije koristila. Ovde su tri trake, svaka sa najviše pet kartica
 * i „Vidi sve (N)" koje otvara tabelu sa tačno tim filterom.
 *
 * B6 (UI Boost §8): ekran sada ima JEDAN fokus — traku „Danas X / Y poziva"
 * sa jedinim primarnim dugmetom, „Započni režim poziva". Šest pločica brojeva
 * je postalo jedan red čipova (isti brojevi, isti filteri na klik), a pored
 * fokusa stoji merač Kvalitet baze koji kaže šta dopuniti i vodi na taj filter.
 *
 * Sve se čita kroz POSTOJEĆE upite (O8): kandidati za „Zovi sada" su
 * `listLeadsFiltered` sa `tel ≥ 40` i `dodir = nikad` (`use-zovi-sada.ts`),
 * ocene kroz `scoreCompanies`, „Vrati se na" iz `listOverdue` + `listMeetings`,
 * „Dopuni pa zovi" iz `listCompaniesWithGap(bez_telefona)`. Granice tih upita
 * se prenose na ekran, ne prećutkuju.
 *
 * Prazna traka NIKAD ne slavi prazninu: kaže šta nedostaje i šta to rešava.
 */

const MAX_KARTICA = 5;
const VRATI_SE_DANA = 3;

/** XP koji nosi jedan poziv sa zabeleženim ishodom: dodir + ishod, iz pravila. */
const XP_POZIV = PRAVILA_XP.dodir.xp + PRAVILA_XP.ishod.xp;

export function LeadsToday() {
  const now = useNow();
  const { applyQuery, setNav } = useLeadFilters();
  const napredak = useNapredak();
  // Isključen Napredak ne prikazuje ništa od XP-a — ni čip na kartici.
  const saXp = napredak?.ukljucen === true;

  const facet = useProjekatQuery(api.leadFiltersStore.countLeadsByFacet);
  const gaps = useProjekatQuery(api.leadGapsStore.listGaps);
  const zovi = useZoviSada();
  const overdue = useProjekatQuery(api.leadCrmStore.listOverdue, { limit: KANDIDATA });
  const meetingsData = useProjekatQuery(api.leadCrmStore.listMeetings);
  const bezBroja = useProjekatQuery(api.leadGapsStore.listCompaniesWithGap, {
    gapType: "bez_telefona",
    limit: KANDIDATA,
  });
  const nisaZa = useNisaZa();

  const bezBrojaIds = useMemo(
    () => (bezBroja?.companies ?? []).map((c) => c._id),
    [bezBroja],
  );
  const dopuniScores = useProjekatQuery(
    api.leadScoringStore.scoreCompanies,
    bezBrojaIds.length > 0 ? { companyIds: bezBrojaIds } : "skip",
  ) as Record<string, LeadScore> | undefined;

  const [dialog, setDialog] = useState<LeadRowDialogState | null>(null);
  const [callStrip, setCallStrip] = useState<{ companyId: string; phone: string } | null>(null);
  const [fillCompany, setFillCompany] = useState<Doc<"leadCompanies"> | null>(null);

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
  const facetZna = facet !== undefined && !facet.prekoracen ? facet : null;

  // ── Kvalitet baze: četiri dela, svaki u svom imeniocu ──
  const kvalitet = useMemo(() => {
    if (facet === undefined || gaps === undefined) return undefined;
    return kvalitetBaze({
      // Odsečeno prebrojavanje nije broj — taj deo ne ulazi u prosek.
      telefon: gaps.nepotpuno ? null : { fali: gaps.bezTelefona, od: gaps.ukupnoFirmi },
      procena: facet.prekoracen ? null : { fali: facet.bezProcene, od: facet.ukupno },
      sajt: facet.prekoracen ? null : { fali: facet.kvalitet.neocenjen, od: facet.sajt.ima },
      nisa: facet.prekoracen ? null : { fali: facet.bezNise, od: facet.ukupno },
    });
  }, [facet, gaps]);

  const otvoriDeoKvaliteta = (kljuc: KvalitetKljuc) => {
    if (kljuc === "telefon") setNav({ tab: "gaps" });
    else if (kljuc === "procena") otvoriTabelu("bezProcene=1");
    else if (kljuc === "sajt") otvoriTabelu("kvalitet=neocenjen");
    // Filter „bez niše" ne postoji; niše se dodeljuju iz Podešavanja leadova.
    else setNav({ tab: "niche" });
  };

  const izabraniZovi = zovi?.kandidati.slice(0, MAX_KARTICA) ?? [];

  return (
    <div className="flex flex-col gap-6">
      {/* ── Fokus dana + Kvalitet baze ── */}
      <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-center">
        <DanasFokus zovi={zovi} />
        <KvalitetBazeMerac kvalitet={kvalitet} onOtvori={otvoriDeoKvaliteta} />
      </div>

      {/* ── Red brojeva sa objašnjenim imeniocem (O1, O7) ── */}
      <section aria-label="Brojevi leadova" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <BrojCip
            value={gaps?.ukupnoFirmi}
            najmanje={gaps?.nepotpuno}
            label="u bazi"
            hint="Sve firme, i one bez vlasnika — vide se u Rupama u podacima."
            onClick={() => setNav({ tab: "gaps" })}
          />
          <BrojCip
            value={facetZna?.ukupno}
            label="u preseku"
            hint="Leadovi sa vlasnikom — redovi tabele, bez ijednog filtera."
            onClick={() => otvoriTabelu("")}
          />
          <span className="px-1 text-meta text-text-muted">od toga</span>
          <BrojCip
            value={facetZna?.tel["0"]}
            label="sa procenom telefona"
            hint="Bar jedan broj ima procenu da pripada baš toj osobi."
            onClick={() => otvoriTabelu("tel=0")}
          />
          <BrojCip
            value={facetZna?.sajt.ima}
            label="sa sajtom"
            hint="Firme sa upisanim sajtom; „nismo gledali” ne ulazi ovde."
            onClick={() => otvoriTabelu("sajt=ima")}
          />
          <BrojCip
            value={facetZna?.dodir.nikad}
            label="nikad dodirnuto"
            hint="Leadovi bez ijednog zabeleženog dodira."
            onClick={() => otvoriTabelu("dodir=nikad")}
          />
          <BrojCip
            value={facetZna?.koord.da}
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
      <WorkSection
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
            facetZna && facetZna.tel["0"] === 0 ? (
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
                procena telefona za ostale ({facetZna ? facetZna.ukupno - facetZna.tel["40"] : "—"} bez nje).
              </>
            )
          ) : undefined
        }
      >
        {izabraniZovi.map(({ item, fit }) => {
          const company = item.company;
          const phone = item.telefoni[0]?.value;
          const strip = callStrip?.companyId === String(item.assignment.companyId) ? callStrip.phone : null;
          const z = zastoSignals(item);
          return (
            <WorkCard
              key={item.assignment._id}
              edge={rowEdge(item, now)}
              href={`/leadovi/${item.assignment.companyId}`}
              name={company?.name ?? "Nepoznata firma"}
              meta={[company?.city, nisaZa(company)].filter(Boolean).join(" · ")}
              monogram={{ seed: nisaZa(company) }}
              aside={fit !== null ? <FitPrsten fit={fit} /> : undefined}
              zasto={
                <>
                  {z.shown.map((k) => (
                    <SignalCip key={k} kind={k} />
                  ))}
                  {z.rest > 0 && <span className="font-mono text-meta tabular-nums text-text-muted">+{z.rest}</span>}
                  {z.shown.length === 0 && <span className="text-meta text-text-muted">bez signala</span>}
                </>
              }
              primary={
                phone ? (
                  <span className="flex items-center gap-2">
                    <Button
                      render={<a href={telHref(phone)} />}
                      nativeButton={false}
                      variant="secondary"
                      size="sm"
                      onClick={() => setCallStrip({ companyId: String(item.assignment.companyId), phone })}
                    >
                      <Phone data-icon="inline-start" aria-hidden />
                      Pozovi
                    </Button>
                    {saXp && (
                      <Chip
                        tone="xp"
                        size="sm"
                        className="font-mono tabular-nums"
                        title={`Poziv (+${PRAVILA_XP.dodir.xp} XP) i zabeležen ishod (+${PRAVILA_XP.ishod.xp} XP)`}
                      >
                        +{XP_POZIV} XP
                      </Chip>
                    )}
                  </span>
                ) : null
              }
              secondary={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDialog({ kind: "outcome", item })}
                  className="text-text-muted"
                >
                  <Activity data-icon="inline-start" aria-hidden />
                  Zabeleži ishod
                </Button>
              }
            >
              {strip && (
                <Unfold>
                  <LeadCallStrip
                    companyId={item.assignment.companyId}
                    phone={strip}
                    onClose={() => setCallStrip(null)}
                    onScheduleMeeting={() => setDialog({ kind: "meeting", item, calledPhone: strip })}
                    onRecordOutcome={() => setDialog({ kind: "outcome", item })}
                    onNextStep={() => setDialog({ kind: "nextAction", item })}
                    className="mt-2 rounded-lg border border-mod-line bg-mod-soft px-3 py-2"
                  />
                </Unfold>
              )}
            </WorkCard>
          );
        })}
      </WorkSection>

      {/* ── Vrati se na ── */}
      <WorkSection
        naslov="Vrati se na"
        icon={CalendarClock}
        kriterijum={`ima zaostao korak · ima sastanak bez ishoda · ima sastanak u naredna ${VRATI_SE_DANA} dana`}
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
              upišeš iz reda („Sledeći korak…”){facetZna && facetZna.dodir.nikad > 0 ? (
                <> — a {facetZna.dodir.nikad} {pluralSr(facetZna.dodir.nikad, "firma", "firme", "firmi")} još nema ni prvi dodir.</>
              ) : "."}
            </>
          ) : undefined
        }
        praznoAkcija={
          facetZna && facetZna.dodir.nikad > 0
            ? { label: "Nikad dodirnuti", onClick: () => otvoriTabelu("dodir=nikad") }
            : undefined
        }
      >
        {vrati?.stavke.map(({ item, razlog, tone, kind }) => {
          const company = item.company;
          const bezIshoda = kind === "sastanak_bez_ishoda" || isMeetingUnresolved(item.assignment, now);
          return (
            <WorkCard
              key={item.assignment._id}
              edge={rowEdge(item, now)}
              href={`/leadovi/${item.assignment.companyId}`}
              name={company?.name ?? "Nepoznata firma"}
              meta={[company?.city, nisaZa(company)].filter(Boolean).join(" · ")}
              monogram={{ seed: nisaZa(company) }}
              zasto={
                <span className={cn("text-meta", tone === "danger" ? "font-medium text-danger" : tone === "warning" ? "font-medium text-warning" : "text-foreground")}>
                  {razlog}
                </span>
              }
              primary={
                bezIshoda ? (
                  <Button variant="secondary" size="sm" onClick={() => setDialog({ kind: "outcome", item })}>
                    <Activity data-icon="inline-start" aria-hidden />
                    Zabeleži ishod
                  </Button>
                ) : (
                  <Button
                    render={<Link href={`/leadovi/${item.assignment.companyId}`} />}
                    nativeButton={false}
                    variant="secondary"
                    size="sm"
                  >
                    <ExternalLink data-icon="inline-start" aria-hidden />
                    Otvori
                  </Button>
                )
              }
              secondary={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDialog({ kind: "touch", item })}
                  className="text-text-muted"
                >
                  <PhoneCall data-icon="inline-start" aria-hidden />
                  Zabeleži dodir
                </Button>
              }
            />
          );
        })}
      </WorkSection>

      {/* ── Dopuni pa zovi ── */}
      <WorkSection
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
            <WorkCard
              key={company._id}
              edge={null}
              href={`/leadovi/${company._id}`}
              name={company.name}
              meta={[company.city, nisaZa(company)].filter(Boolean).join(" · ")}
              monogram={{ seed: nisaZa(company) }}
              aside={<FitPrsten fit={fit} />}
              zasto={
                <>
                  <Chip size="sm" tone="warning">nema broj</Chip>
                  {signali.map((k) => (
                    <SignalCip key={k} kind={k} />
                  ))}
                </>
              }
              primary={
                <Button variant="secondary" size="sm" onClick={() => setFillCompany(company)}>
                  <PhoneOff data-icon="inline-start" aria-hidden />
                  Dopuni
                </Button>
              }
            />
          );
        })}
      </WorkSection>

      <LeadRowDialogs dialog={dialog} onClose={() => setDialog(null)} />
      {fillCompany && (
        <LeadGapFillDialog
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
// Fokus: „Danas X / Y poziva" + jedino primarno dugme
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fokus ekrana. Sa Napretkom: prsten današnjih poziva naspram dnevnog tempa,
 * XP dana i niz. Bez njega (isključen, upit pao, dan se još sabira): samo
 * koliko firmi čeka — bez ijednog XP broja. Dugme je isto u oba slučaja i
 * crta se samo kad ima koga zvati: mrtvo primarno dugme je gore od nijednog.
 */
function DanasFokus({ zovi }: { zovi: ZoviSada | null }) {
  const stanje = useNapredak();
  const sada = useSada();
  const napredak = stanje?.ukljucen && stanje.spremno ? stanje : null;
  // Stariji backend (frontend stigao pre Convex funkcija) nema ove brojeve.
  const danas = napredak?.brojeviDanas;
  const nedelja = napredak?.prstenovi.find((p) => p.kljuc === "pozivi");

  const ucitava = zovi === null || !zovi.ocenjeno;
  const uRedu = zovi?.kandidati.length ?? 0;
  const preostalo = danas ? Math.max(0, danas.ciljPoziva - danas.pozivi) : 0;

  return (
    <FocusCard
      aside={
        ucitava ? (
          <Skeleton className="h-9 w-52 rounded-lg" />
        ) : uRedu > 0 ? (
          <div className="flex flex-col items-start gap-1.5 md:items-end">
            <Button
              render={<Link href={REZIM_POZIVA_HREF} />}
              nativeButton={false}
              variant="primary"
              size="lg"
              className="touch-target px-4"
            >
              <PhoneCall data-icon="inline-start" aria-hidden />
              Započni režim poziva
              <ArrowRight data-icon="inline-end" aria-hidden />
            </Button>
            <span className="text-meta text-text-muted">
              <span className="font-mono tabular-nums text-foreground">{uRedu}</span>{" "}
              {pluralSr(uRedu, "firma", "firme", "firmi")} u redu, jedna po jedna
            </span>
          </div>
        ) : (
          <p className="max-w-56 text-meta text-text-muted md:text-right">
            Red za pozive je prazan — razlog i sledeći korak su u traci „Zovi sada”.
          </p>
        )
      }
    >
      <div className="flex min-w-0 items-center gap-4">
        {danas ? (
          <span
            title={`Dnevni tempo: nedeljni cilj poziva (${nedelja?.cilj ?? "—"}) podeljen na radne dane`}
          >
            <ProgressRing
              value={danas.pozivi}
              max={danas.ciljPoziva}
              size={64}
              stroke={7}
              label="Pozivi danas"
            >
              <span className="text-title font-bold text-foreground">{danas.pozivi}</span>
            </ProgressRing>
          </span>
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-mod-line bg-mod-soft text-mod">
            <PhoneCall className="size-6" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {danas ? (
            <>
              <h2 className="text-title font-bold text-foreground">
                Danas{" "}
                <span className="tabular-nums">
                  {danas.pozivi} / {danas.ciljPoziva}
                </span>{" "}
                {pluralSr(danas.ciljPoziva, "poziv", "poziva", "poziva")}
              </h2>
              <p className="text-ui text-text-muted">
                {preostalo > 0
                  ? `još ${preostalo} do dnevnog tempa`
                  : "dnevni tempo je ispunjen"}
                {nedelja && (
                  <>
                    {" · nedelja "}
                    <span className="font-mono whitespace-nowrap tabular-nums text-foreground">
                      {nedelja.vrednost} / {nedelja.cilj}
                    </span>
                  </>
                )}
              </p>
            </>
          ) : (
            <>
              <h2 className="text-title font-bold text-foreground">Zovi sada</h2>
              <p className="text-ui text-text-muted">
                {ucitava
                  ? "Slažem red za pozive…"
                  : uRedu > 0
                    ? `${uRedu} ${pluralSr(uRedu, "firma čeka", "firme čekaju", "firmi čeka")} prvi poziv, najjači Fit prvi`
                    : "Trenutno nema firme koja ispunjava uslove za poziv"}
              </p>
            </>
          )}
          {napredak && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {napredak.xp.danas > 0 && (
                <Chip tone="xp" size="sm" className="font-mono tabular-nums">
                  +{formatNumber(napredak.xp.danas)} XP danas
                </Chip>
              )}
              <StreakFlame
                days={napredak.niz.dani}
                state={stanjeNiza(napredak.niz, sada)}
                size="sm"
              />
            </div>
          )}
        </div>
      </div>
    </FocusCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Kvalitet baze
// ─────────────────────────────────────────────────────────────────────────────

const DOPUNA: Record<
  KvalitetKljuc,
  { tekst: (n: number) => string; dugme: string }
> = {
  telefon: {
    tekst: (n) => `kad dopuniš telefon za ${n} ${pluralSr(n, "firmu", "firme", "firmi")}`,
    dugme: "Otvori firme bez broja",
  },
  procena: {
    tekst: (n) => `kad proceniš čiji je broj za ${n} ${pluralSr(n, "firmu", "firme", "firmi")}`,
    dugme: "Otvori bez procene",
  },
  sajt: {
    tekst: (n) => `kad oceniš ${n} ${pluralSr(n, "sajt", "sajta", "sajtova")}`,
    dugme: "Otvori neocenjene",
  },
  nisa: {
    tekst: (n) => `kad dodeliš nišu za ${n} ${pluralSr(n, "firmu", "firme", "firmi")}`,
    dugme: "Otvori niše",
  },
};

/**
 * Merač koji uči: jedan procenat, četiri dela sa imeniocem, i jedna rečenica
 * koja kaže šta dopuniti da procenat najviše poraste — sa dugmetom koje
 * otvara baš taj spisak. `undefined` = brojevi još stižu; `null` = ne mogu da
 * se izračunaju (odsečeno prebrojavanje), i to piše.
 */
function KvalitetBazeMerac({
  kvalitet,
  onOtvori,
}: {
  kvalitet: ReturnType<typeof kvalitetBaze> | undefined;
  onOtvori: (kljuc: KvalitetKljuc) => void;
}) {
  if (kvalitet === undefined) {
    return <Skeleton className="h-28 w-full rounded-xl" />;
  }
  const sledece = kvalitet?.sledece ?? null;

  return (
    <section
      aria-label="Kvalitet baze"
      className="flex min-w-0 flex-col gap-2 lg:border-l lg:border-line-soft lg:pl-6"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="heading-caps text-meta font-medium text-text-muted">
          Kvalitet baze
        </h2>
        <span className="font-mono text-title font-bold tabular-nums text-foreground">
          {kvalitet ? `${kvalitet.pct} %` : "—"}
        </span>
      </div>

      {kvalitet === null ? (
        <p className="text-ui text-text-muted">
          Baza je veća od granice prebrojavanja, pa se procenat ne računa.
        </p>
      ) : (
        <>
          <ProgressBar value={kvalitet.pct} max={100} label="Kvalitet baze" size="sm" />
          <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-meta text-text-muted">
            {kvalitet.delovi.map((deo) => (
              <li key={deo.kljuc} title={`${deo.ima} od ${deo.od}`}>
                {deo.naziv}{" "}
                <span className="font-mono tabular-nums text-foreground">{deo.pct} %</span>
              </li>
            ))}
          </ul>
          {sledece ? (
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-0.5">
              <p className="min-w-0 text-ui text-foreground">
                <span className="font-mono font-bold tabular-nums text-mod">
                  +{sledece.dobitak} %
                </span>{" "}
                {DOPUNA[sledece.deo.kljuc].tekst(sledece.deo.fali)}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOtvori(sledece.deo.kljuc)}
                className="touch-target shrink-0"
              >
                {DOPUNA[sledece.deo.kljuc].dugme}
                <ArrowRight data-icon="inline-end" aria-hidden />
              </Button>
            </div>
          ) : (
            <p className="text-ui text-text-muted">
              Svaka firma ima telefon, procenu broja, ocenjen sajt i nišu.
            </p>
          )}
        </>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Delovi
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Jedan broj sa imeniocem — čip koji postavlja filter. `undefined` = „—",
 * nikad 0 kao „ne znamo". Broj pri otvaranju STOJI; prelazi (ne skače) tek
 * kad se presek promeni, jer se menja svaki put kad se upiše ishod (A8 §1).
 * „≥" ostaje van brojke: prefiks nije broj.
 */
function BrojCip({
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
      className="touch-target inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-line bg-surface-raised px-2.5 text-ui transition-colors hover:border-mod-line focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="font-mono font-bold tabular-nums text-foreground">
        {value === undefined ? (
          "—"
        ) : (
          <>
            {najmanje ? "≥ " : ""}
            <CountUp value={value} format={(v) => String(Math.round(v))} />
          </>
        )}
      </span>
      <span className="text-text-muted">{label}</span>
    </button>
  );
}

/** Signal kao čip u boji svoje kategorije (`lib/signal-colors.ts`). */
function SignalCip({ kind }: { kind: string }) {
  const natpis = leadSignalLabel(kind);
  return (
    <Chip size="sm" category={signalSlot(kind)} title={natpis}>
      {natpis}
    </Chip>
  );
}

/** Fit kao mali prsten sa brojem: jačina se vidi pre nego što se pročita. */
function FitPrsten({ fit }: { fit: number }) {
  return (
    <span title={`Fit — profil kupca: ${fit} od 100`}>
      <ProgressRing value={fit} max={100} size={40} stroke={4} label="Fit — profil kupca">
        <span className="text-meta font-bold text-foreground">{fit}</span>
      </ProgressRing>
    </span>
  );
}
