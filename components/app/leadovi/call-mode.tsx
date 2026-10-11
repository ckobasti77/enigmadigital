"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CalendarPlus,
  ExternalLink,
  Globe,
  ListPlus,
  Phone,
  PhoneCall,
  PhoneMissed,
  PhoneOff,
  ShieldAlert,
  SkipForward,
  ThumbsDown,
  ThumbsUp,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackLine } from "@/components/app/feedback";
import { Chip, TemperatureChip, type ChipTone } from "@/components/app/system/chip";
import { EmptyState } from "@/components/app/system/empty-state";
import { FocusCard } from "@/components/app/system/focus-card";
import { Monogram } from "@/components/app/system/monogram";
import { ProgressBar, ProgressRing } from "@/components/app/system/progress";
import { useNapredak } from "@/components/app/napredak/use-napredak";
import { useNow } from "@/components/app/use-now";
import { DUR_REDUCED, DUR_UI, EASE_UI, MOTION_QUERIES } from "@/lib/motion";
import { signalSlot } from "@/lib/signal-colors";
import { formatDaysAgo, formatNumber, pluralSr } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  LEAD_OUTCOME_LABELS,
  leadOutcomeLabel,
  leadSignalLabel,
  leadTouchChannelLabel,
  personRoleLabel,
} from "./lead-labels";
import { getErrorMessage } from "./lead-quick-dialogs";
import { LeadRowDialogs, type LeadRowDialogState } from "./lead-row-dialogs";
import { PhoneConfidenceRing } from "./phone-confidence";
import { telHref, type LeadRowItem } from "./lead-urgency";
import { useNisaZa, useZoviSada, type ZoviKandidat } from "./use-zovi-sada";

gsap.registerPlugin(useGSAP);

/**
 * ============================================================================
 * REŽIM POZIVA — jedna firma na ekranu (UI Boost §8, B6)
 * ============================================================================
 *
 * Posao koji ovaj prikaz skraćuje: telefon je u ruci, a posle svakog poziva
 * treba naći sledeću firmu, videti zašto je vredi zvati, i upisati kako je
 * prošlo. Ovde je to jedan pritisak tastera po koraku — `p` zove, `1–4`
 * beleži ishod, sledeća firma dolazi sama.
 *
 * ZAŠTO ADRESA, A NE PREKLOPNI PANEL. Režim živi u `?rezim=poziv` i crta se
 * u strani, umesto jezičaka:
 *   - u njega vode ⌘K, misija „Pozovi…" i dugme na „Danas" — običnim linkom;
 *   - „nazad" u pregledaču iz njega izlazi, a osvežavanje ga ne gubi;
 *   - dijalog sastanka se otvara NAD stranom, a ne nad drugim dijalogom
 *     (ugnježdeni dijalozi dele zamku fokusa i Esc).
 *
 * RED JE ZAMRZNUT. Spisak „Zovi sada" se menja čim se upiše ishod (firma
 * ispada iz „nikad dodirnut"), pa bi živa lista preuređivala red pod prstima.
 * Zato se pri ulasku uzme prvih `SESIJA` firmi i ide redom; sledeća tura
 * („Još N firmi") uzima sveže kandidate, bez onih koji su već prošli.
 *
 * NIŠTA SE NE UPISUJE BEZ PRITISKA. `tel:` ne dokazuje da je razgovor
 * obavljen. Ishodi idu kroz POSTOJEĆE mutacije i sa istim značenjem kao traka
 * posle poziva (`lead-call-strip.tsx`):
 *   1 Nije se javio      → `recordOutcome` (pokušaj, bez dodira)
 *   2 Zainteresovan      → `logTouch` „poziv" + `recordOutcome`
 *   3 Nije zainteresovan → `logTouch` „poziv" + `recordOutcome`
 *   4 Zakazan sastanak   → postojeći dijalog sastanka (nudi i upis poziva)
 * „Drugi ishod" otvara postojeći dijalog sa celom zatvorenom listom.
 *
 * XP se ovde ne računa: toast pali ljuska kad se `napredak.stanje` promeni, a
 * „XP u sesiji" je razlika tog istog broja. Kombo je broj uzastopnih firmi sa
 * zabeleženim ishodom u ovoj sesiji — brojanje stvarnih upisa, ne nagrada.
 */

/** Koliko firmi čini jednu turu. */
const SESIJA = 10;

type BrziIshod = "nije_se_javio" | "zainteresovan" | "nije_zainteresovan";
type Ishod = BrziIshod | "sastanak" | "drugo" | "preskoceno";

type Zapis = {
  item: LeadRowItem;
  ishod: Ishod;
  /** `recordOutcome` je predložio zabranu kontakta — potvrđuje je čovek. */
  predlogZabrane: boolean;
};

const BRZI: ReadonlyArray<{
  taster: string;
  ishod: BrziIshod;
  ikona: typeof Phone;
}> = [
  { taster: "1", ishod: "nije_se_javio", ikona: PhoneMissed },
  { taster: "2", ishod: "zainteresovan", ikona: ThumbsUp },
  { taster: "3", ishod: "nije_zainteresovan", ikona: ThumbsDown },
];

const ISHOD_PRIKAZ: Record<Ishod, { natpis: string; tone: ChipTone }> = {
  nije_se_javio: { natpis: LEAD_OUTCOME_LABELS.nije_se_javio, tone: "neutral" },
  zainteresovan: { natpis: LEAD_OUTCOME_LABELS.zainteresovan, tone: "success" },
  nije_zainteresovan: {
    natpis: LEAD_OUTCOME_LABELS.nije_zainteresovan,
    tone: "muted",
  },
  sastanak: { natpis: "Zakazan sastanak", tone: "success" },
  drugo: { natpis: "Ishod zabeležen", tone: "neutral" },
  preskoceno: { natpis: "Preskočeno", tone: "muted" },
};

/** Otvoren meni, dijalog ili paleta: tasteri pripadaju njima, ne režimu. */
function nestoJeOtvoreno(): boolean {
  return (
    document.querySelector(
      '[role="dialog"], [role="menu"], [role="listbox"], [data-slot="popover-content"]',
    ) !== null
  );
}

export function CallMode({
  workspaceId,
  onExit,
}: {
  workspaceId: Id<"workspaces">;
  onExit: () => void;
}) {
  const now = useNow();
  const zovi = useZoviSada(workspaceId);
  const nisaZa = useNisaZa(workspaceId);
  const stanje = useNapredak();
  const napredak = stanje?.ukljucen && stanje.spremno ? stanje : null;

  const logTouch = useMutation(api.leadCrmStore.logTouch);
  const recordOutcome = useMutation(api.leadCrmStore.recordOutcome);

  const [red, setRed] = useState<ZoviKandidat[] | null>(null);
  const [index, setIndex] = useState(0);
  const [zapisi, setZapisi] = useState<Zapis[]>([]);
  const [pozvano, setPozvano] = useState(false);
  const [cuva, setCuva] = useState<BrziIshod | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const [telefonIdx, setTelefonIdx] = useState(0);
  const [dialog, setDialog] = useState<LeadRowDialogState | null>(null);
  const [xpNaPocetku, setXpNaPocetku] = useState<number | null>(null);

  // Dodir upisan, a ishod pao: ponovni pokušaj ne sme da upiše dodir dvaput.
  const dodirUpisan = useRef(new Set<string>());
  // Dijalog javlja „sačuvano" pre nego što se zatvori; zatvaranje bez toga je
  // odustajanje i ne pomera red.
  const sacuvanoUDijalogu = useRef<LeadRowDialogState["kind"] | null>(null);
  const pozoviRef = useRef<HTMLAnchorElement>(null);
  const karticaRef = useRef<HTMLDivElement>(null);
  // Firma za koju je kartica poslednji put doklizila. Pri ulasku se poklapa sa
  // prvom firmom, pa se ulazak ne animira — ekran se otvara u zadatak.
  const animiranaFirma = useRef<string | null>(null);

  const prosle = useMemo(
    () => new Set(zapisi.map((z) => String(z.item.assignment.companyId))),
    [zapisi],
  );

  // Zamrzavanje reda: jednom po turi, čim stignu i spisak i ocene.
  if (red === null && zovi !== null && zovi.ocenjeno) {
    setRed(
      zovi.kandidati
        .filter(
          (k) =>
            k.item.telefoni.length > 0 &&
            !prosle.has(String(k.item.assignment.companyId)),
        )
        .slice(0, SESIJA),
    );
  }
  if (xpNaPocetku === null && napredak) setXpNaPocetku(napredak.xp.ukupno);

  const trenutni = red !== null && index < red.length ? red[index] : null;
  const telefoni = trenutni?.item.telefoni ?? [];
  const telefon = telefoni[Math.min(telefonIdx, telefoni.length - 1)]?.value;

  const saIshodom = zapisi.filter((z) => z.ishod !== "preskoceno").length;
  const sastanaka = zapisi.filter((z) => z.ishod === "sastanak").length;
  const preskoceno = zapisi.length - saIshodom;
  // Kombo: koliko poslednjih firmi zaredom ima zabeležen ishod.
  let kombo = 0;
  for (let i = zapisi.length - 1; i >= 0 && zapisi[i].ishod !== "preskoceno"; i--) kombo++;
  const xpSesije =
    napredak && xpNaPocetku !== null
      ? Math.max(0, napredak.xp.ukupno - xpNaPocetku)
      : null;

  const dalje = (zapis: Zapis) => {
    setZapisi((z) => [...z, zapis]);
    setIndex((i) => i + 1);
    setPozvano(false);
    setGreska(null);
    setTelefonIdx(0);
  };

  const zabelezi = async (ishod: BrziIshod) => {
    if (!trenutni || !telefon || cuva !== null) return;
    const companyId = trenutni.item.assignment.companyId;
    const kljuc = String(companyId);
    const beleska = `Poziv na ${telefon}`;
    setCuva(ishod);
    setGreska(null);
    try {
      if (ishod !== "nije_se_javio" && !dodirUpisan.current.has(kljuc)) {
        await logTouch({ workspaceId, companyId, channel: "poziv", note: beleska });
        dodirUpisan.current.add(kljuc);
      }
      const res = await recordOutcome({
        workspaceId,
        companyId,
        outcome: ishod,
        note: beleska,
      });
      dalje({
        item: trenutni.item,
        ishod,
        predlogZabrane: Boolean(res?.predlogZaSuppression),
      });
    } catch (err) {
      setGreska(getErrorMessage(err));
    } finally {
      setCuva(null);
    }
  };

  const zakazi = () => {
    if (!trenutni || cuva !== null) return;
    sacuvanoUDijalogu.current = null;
    setDialog({ kind: "meeting", item: trenutni.item, calledPhone: telefon });
  };

  const drugiIshod = () => {
    if (!trenutni || cuva !== null) return;
    sacuvanoUDijalogu.current = null;
    setDialog({ kind: "outcome", item: trenutni.item });
  };

  const preskoci = () => {
    if (!trenutni || cuva !== null) return;
    dalje({ item: trenutni.item, ishod: "preskoceno", predlogZabrane: false });
  };

  const zatvoriDijalog = () => {
    const sacuvano = sacuvanoUDijalogu.current;
    const otvoren = dialog;
    sacuvanoUDijalogu.current = null;
    setDialog(null);
    // Dijalog nad firmom iz dnevnika (sledeći korak) ne pomera red.
    if (!sacuvano || !otvoren || !trenutni) return;
    if (otvoren.item.assignment._id !== trenutni.item.assignment._id) return;
    if (sacuvano === "meeting") {
      dalje({ item: trenutni.item, ishod: "sastanak", predlogZabrane: false });
    } else if (sacuvano === "outcome") {
      dalje({ item: trenutni.item, ishod: "drugo", predlogZabrane: false });
    }
  };

  // Tastatura: p pozovi · 1–4 ishod · n sledeća · Esc izlaz.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const meta = e.target as HTMLElement | null;
      if (
        meta &&
        (meta.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(meta.tagName))
      ) {
        return;
      }
      if (nestoJeOtvoreno()) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onExit();
        return;
      }
      const taster = e.key.toLowerCase();
      if (taster === "p") {
        e.preventDefault();
        pozoviRef.current?.click();
      } else if (taster === "n") {
        e.preventDefault();
        preskoci();
      } else if (taster === "4") {
        e.preventDefault();
        zakazi();
      } else {
        const brzi = BRZI.find((b) => b.taster === taster);
        if (brzi) {
          e.preventDefault();
          void zabelezi(brzi.ishod);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Nova firma: fokus na „Pozovi" (Enter zove), i kartica doklizi sa strane.
  // Jedini pokret ovog prikaza — promena firme JE događaj koji treba videti.
  const firmaKljuc = trenutni ? String(trenutni.item.assignment._id) : null;
  useGSAP(
    () => {
      if (firmaKljuc === null) return;
      pozoviRef.current?.focus({ preventScroll: true });
      const prethodna = animiranaFirma.current;
      animiranaFirma.current = firmaKljuc;
      if (prethodna === null || prethodna === firmaKljuc) return;
      const el = karticaRef.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        if (ctx.conditions?.still) {
          gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: DUR_REDUCED });
          return;
        }
        gsap.fromTo(
          el,
          { opacity: 0, x: 16 },
          {
            opacity: 1,
            x: 0,
            duration: DUR_UI,
            ease: EASE_UI,
            overwrite: "auto",
            clearProps: "transform,opacity",
          },
        );
      });
    },
    { dependencies: [firmaKljuc], scope: karticaRef, revertOnUpdate: true },
  );

  const ucitava = red === null;
  const ukupno = red?.length ?? 0;
  const kraj = red !== null && index >= red.length;
  const josKandidata =
    zovi?.kandidati.filter(
      (k) =>
        k.item.telefoni.length > 0 &&
        !prosle.has(String(k.item.assignment.companyId)),
    ).length ?? 0;

  const novaTura = () => {
    setRed(null);
    setIndex(0);
  };

  return (
    <div className="flex flex-1 flex-col gap-5">
      {/* ── Zaglavlje režima: izlaz, naziv, dokle se stiglo ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onExit}
          className="touch-target gap-1.5 text-text-muted"
        >
          <ArrowLeft data-icon="inline-start" aria-hidden />
          Danas
          <Kbd k="Esc" className="ml-1 hidden md:inline-block" />
        </Button>
        <span className="hidden h-4 w-px bg-line-soft sm:block" aria-hidden />
        <h2 className="inline-flex items-center gap-2 text-title font-bold text-foreground">
          <PhoneCall className="size-4 text-mod" aria-hidden />
          Režim poziva
        </h2>
        {ukupno > 0 && (
          <div className="ml-auto flex min-w-48 flex-1 items-center gap-3 sm:max-w-xs sm:flex-none">
            <ProgressBar
              value={Math.min(index, ukupno)}
              max={ukupno}
              label="Firme u ovoj turi"
              size="sm"
              className="flex-1"
            />
            <span className="shrink-0 font-mono text-ui font-bold tabular-nums text-foreground">
              {Math.min(index, ukupno)} / {ukupno}
            </span>
          </div>
        )}
      </div>

      {/* Čitač ekrana čuje koja je firma došla; oko to vidi po kartici. */}
      <p className="sr-only" aria-live="polite">
        {trenutni
          ? `Firma ${index + 1} od ${ukupno}: ${trenutni.item.company?.name ?? "Nepoznata firma"}`
          : kraj && ukupno > 0
            ? "Tura je završena."
            : ""}
      </p>

      {ucitava ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : ukupno === 0 && zapisi.length === 0 ? (
        <EmptyState
          icon={PhoneOff}
          title="Nema firme za poziv"
          action={
            <Button variant="outline" onClick={onExit}>
              <ArrowLeft data-icon="inline-start" aria-hidden />
              Nazad na Danas
            </Button>
          }
        >
          U red ulazi firma koja ima telefon sa procenom ≥ 40 %, nikad nije
          dodirnuta i ima Fit bar na proseku. Šta fali i kako se dopunjava piše
          u trakama „Zovi sada” i „Dopuni pa zovi”.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
          {trenutni ? (
            <FocusCard>
              <div ref={karticaRef} className="flex min-w-0 flex-col gap-5">
                <Firma
                  kandidat={trenutni}
                  nisa={nisaZa(trenutni.item.company)}
                  now={now}
                  telefoni={telefoni.map((t) => t.value)}
                  telefonIdx={Math.min(telefonIdx, telefoni.length - 1)}
                  onTelefon={setTelefonIdx}
                />

                {/* ── Poziv ── */}
                <div className="flex flex-wrap items-center gap-2">
                  {telefon && (
                    <Button
                      render={<a ref={pozoviRef} href={telHref(telefon)} />}
                      nativeButton={false}
                      variant={pozvano ? "outline" : "primary"}
                      size="lg"
                      onClick={() => setPozvano(true)}
                      className="touch-target flex-1 px-4 sm:flex-none"
                    >
                      <Phone data-icon="inline-start" aria-hidden />
                      {pozvano ? "Pozovi ponovo" : "Pozovi"}
                      <Kbd k="P" tone={pozvano ? "plain" : "inverse"} className="ml-1 hidden md:inline-block" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={preskoci}
                    disabled={cuva !== null}
                    className="touch-target text-text-muted"
                  >
                    <SkipForward data-icon="inline-start" aria-hidden />
                    Preskoči
                    <Kbd k="N" className="ml-1 hidden md:inline-block" />
                  </Button>
                </div>

                {/* ── Ishod: uvek dostupan (broj se može okrenuti i ručno),
                       a posle „Pozovi" postaje ono što se sledeće gleda ── */}
                <div className="flex flex-col gap-2 border-t border-line-soft pt-4">
                  <p
                    className={cn(
                      "text-ui font-medium",
                      pozvano ? "text-foreground" : "text-text-muted",
                    )}
                  >
                    {pozvano ? "Kako je prošlo?" : "Posle poziva — kako je prošlo?"}
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {BRZI.map(({ taster, ishod, ikona: Ikona }) => (
                      <Button
                        key={ishod}
                        data-ishod={ishod}
                        variant={pozvano ? "secondary" : "outline"}
                        size="lg"
                        loading={cuva === ishod}
                        disabled={cuva !== null}
                        onClick={() => void zabelezi(ishod)}
                        className="touch-target justify-start"
                      >
                        {cuva !== ishod && <Ikona data-icon="inline-start" aria-hidden />}
                        <span className="truncate">{LEAD_OUTCOME_LABELS[ishod]}</span>
                        <Kbd k={taster} className="ml-auto hidden md:inline-block" />
                      </Button>
                    ))}
                    <Button
                      variant={pozvano ? "secondary" : "outline"}
                      size="lg"
                      disabled={cuva !== null}
                      onClick={zakazi}
                      className="touch-target justify-start"
                    >
                      <CalendarPlus data-icon="inline-start" aria-hidden />
                      <span className="truncate">Zakaži sastanak…</span>
                      <Kbd k="4" className="ml-auto hidden md:inline-block" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={cuva !== null}
                      onClick={drugiIshod}
                      className="touch-target -ml-2 text-text-muted"
                    >
                      <ListPlus data-icon="inline-start" aria-hidden />
                      Drugi ishod ili napomena…
                    </Button>
                    {greska && (
                      <FeedbackLine tone="danger">
                        Nije sačuvano: {greska} Pritisni ishod ponovo.
                      </FeedbackLine>
                    )}
                  </div>
                </div>
              </div>
            </FocusCard>
          ) : (
            <Kraj
              saIshodom={saIshodom}
              sastanaka={sastanaka}
              preskoceno={preskoceno}
              xpSesije={xpSesije}
              josKandidata={josKandidata}
              onJos={novaTura}
              onExit={onExit}
            />
          )}

          <Sesija
            workspaceId={workspaceId}
            zapisi={zapisi}
            saIshodom={saIshodom}
            sastanaka={sastanaka}
            // Kombo je deo Napretka: kad je isključen, ne crta se.
            kombo={napredak ? kombo : 0}
            xpSesije={xpSesije}
            nisaZa={nisaZa}
            onSledeciKorak={(item) => setDialog({ kind: "nextAction", item })}
          />
        </div>
      )}

      <LeadRowDialogs
        workspaceId={workspaceId}
        dialog={dialog}
        onClose={zatvoriDijalog}
        onSaved={(kind) => {
          sacuvanoUDijalogu.current = kind;
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Firma: ime, zašto je na spisku, telefon, poslednji kontakt
// ─────────────────────────────────────────────────────────────────────────────

function Firma({
  kandidat,
  nisa,
  now,
  telefoni,
  telefonIdx,
  onTelefon,
}: {
  kandidat: ZoviKandidat;
  nisa: string | null;
  now: number;
  telefoni: string[];
  telefonIdx: number;
  onTelefon: (i: number) => void;
}) {
  const { item, fit } = kandidat;
  const company = item.company;
  const a = item.assignment;
  const naziv = company?.name ?? "Nepoznata firma";
  const signali = [...new Set(item.signali)];
  const osoba = item.osobe[0];
  const telefon = telefoni[telefonIdx];
  const sajt = company?.website
    ? company.website.startsWith("http")
      ? company.website
      : `https://${company.website}`
    : null;

  return (
    <>
      <div className="flex min-w-0 items-start gap-4">
        <Monogram name={naziv} seed={nisa} size="lg" className="mt-1" />
        <div className="min-w-0 flex-1">
          <h3 className="text-metric font-bold text-balance text-foreground">
            {naziv}
          </h3>
          <p className="truncate text-ui text-text-muted">
            {[company?.city, company?.municipality, nisa].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        {fit !== null && (
          <span
            className="flex shrink-0 flex-col items-center gap-1"
            title={`Fit — profil kupca: ${fit} od 100`}
          >
            <ProgressRing value={fit} max={100} size={56} stroke={6} label="Fit — profil kupca">
              <span className="text-copy font-bold text-foreground">{fit}</span>
            </ProgressRing>
            <span className="text-meta text-text-muted">Fit</span>
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-meta font-medium text-text-muted">Zašto je na spisku</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {signali.map((k) => (
            <Chip key={k} size="sm" category={signalSlot(k)}>
              {leadSignalLabel(k)}
            </Chip>
          ))}
          <Chip size="sm" tone="neutral">
            nikad dodirnut
          </Chip>
          {company?.temperatura && (
            <TemperatureChip temperatura={company.temperatura} size="sm" />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-meta font-medium text-text-muted">Telefon</p>
          <p className="font-mono text-metric font-bold tabular-nums text-foreground">
            {telefon ?? "—"}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ui text-text-muted">
            {osoba ? (
              <span className="min-w-0 truncate">
                <span className="text-foreground">{osoba.name}</span>
                {" · "}
                {personRoleLabel(osoba.role)}
              </span>
            ) : (
              <span>kontakt osoba nije upisana</span>
            )}
            {osoba?.verovatnoca !== undefined ? (
              <PhoneConfidenceRing verovatnoca={osoba.verovatnoca} />
            ) : (
              <span>bez procene čiji je broj</span>
            )}
          </div>
          {telefoni.length > 1 && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {telefoni.map((broj, i) => (
                <Chip
                  key={broj}
                  size="sm"
                  tone="neutral"
                  active={i === telefonIdx}
                  onClick={() => onTelefon(i)}
                  className="touch-target font-mono tabular-nums"
                >
                  {broj}
                </Chip>
              ))}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-meta font-medium text-text-muted">Poslednji kontakt</p>
          <p className="text-copy font-medium text-foreground">
            {a.lastTouchAt !== undefined
              ? `${formatDaysAgo(a.lastTouchAt, now)}${item.poslednjiDodir ? ` · ${leadTouchChannelLabel(item.poslednjiDodir.channel)}` : ""}`
              : "Nije bilo razgovora"}
          </p>
          {a.outcome && a.outcomeAt !== undefined && (
            <p className="text-ui text-text-muted">
              Poslednji ishod: {leadOutcomeLabel(a.outcome)},{" "}
              {formatDaysAgo(a.outcomeAt, now)}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-ui">
            <Link
              href={`/leadovi/${a.companyId}`}
              target="_blank"
              className="inline-flex cursor-pointer items-center gap-1 font-medium text-mod underline-offset-2 hover:underline"
            >
              Profil firme
              <ExternalLink className="size-3.5" aria-hidden />
            </Link>
            {sajt && (
              <a
                href={sajt}
                target="_blank"
                rel="noreferrer"
                className="inline-flex cursor-pointer items-center gap-1 text-text-muted underline-offset-2 hover:text-foreground hover:underline"
              >
                <Globe className="size-3.5" aria-hidden />
                Sajt
              </a>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sesija: koliko je urađeno, kombo, XP i dnevnik
// ─────────────────────────────────────────────────────────────────────────────

const DNEVNIK_PRIKAZANO = 6;

function Sesija({
  workspaceId,
  zapisi,
  saIshodom,
  sastanaka,
  kombo,
  xpSesije,
  nisaZa,
  onSledeciKorak,
}: {
  workspaceId: Id<"workspaces">;
  zapisi: Zapis[];
  saIshodom: number;
  sastanaka: number;
  kombo: number;
  xpSesije: number | null;
  nisaZa: ReturnType<typeof useNisaZa>;
  onSledeciKorak: (item: LeadRowItem) => void;
}) {
  const poslednji = [...zapisi].reverse();
  const vidljivi = poslednji.slice(0, DNEVNIK_PRIKAZANO);
  const skriveno = poslednji.length - vidljivi.length;

  return (
    <aside aria-label="Ova sesija" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 className="heading-caps text-meta font-medium text-text-muted">
          Ova sesija
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="module" icon={PhoneCall}>
            <span className="font-mono tabular-nums">{saIshodom}</span>{" "}
            {pluralSr(saIshodom, "poziv", "poziva", "poziva")}
          </Chip>
          {sastanaka > 0 && (
            <Chip tone="success" icon={CalendarPlus}>
              <span className="font-mono tabular-nums">{sastanaka}</span>{" "}
              {pluralSr(sastanaka, "sastanak", "sastanka", "sastanaka")}
            </Chip>
          )}
          {kombo >= 2 && (
            <Chip tone="neutral" icon={Zap} className="[&_svg]:text-streak">
              <span className="font-mono font-bold tabular-nums text-streak">{kombo}</span>{" "}
              zaredom
            </Chip>
          )}
          {xpSesije !== null && xpSesije > 0 && (
            <Chip tone="xp" className="font-mono tabular-nums">
              +{formatNumber(xpSesije)} XP
            </Chip>
          )}
        </div>
      </div>

      {vidljivi.length === 0 ? (
        <p className="text-ui text-text-muted">
          Ovde se ređaju firme koje prođu, sa ishodom koji si zabeležio.
        </p>
      ) : (
        <ul className="divide-y divide-line-soft border-y border-line-soft">
          {vidljivi.map((zapis) => (
            <ZapisRed
              key={zapis.item.assignment._id}
              workspaceId={workspaceId}
              zapis={zapis}
              nisa={nisaZa(zapis.item.company)}
              onSledeciKorak={onSledeciKorak}
            />
          ))}
        </ul>
      )}
      {skriveno > 0 && (
        <p className="text-meta text-text-muted">
          i još {skriveno} ranije u ovoj sesiji
        </p>
      )}

      <p className="hidden flex-wrap items-center gap-x-3 gap-y-1.5 text-meta text-text-muted md:flex">
        <span><Kbd k="P" /> pozovi</span>
        <span><Kbd k="1" />–<Kbd k="4" /> ishod</span>
        <span><Kbd k="N" /> sledeća</span>
        <span><Kbd k="Esc" /> izlaz</span>
      </p>
    </aside>
  );
}

function ZapisRed({
  workspaceId,
  zapis,
  nisa,
  onSledeciKorak,
}: {
  workspaceId: Id<"workspaces">;
  zapis: Zapis;
  nisa: string | null;
  onSledeciKorak: (item: LeadRowItem) => void;
}) {
  const addToSuppression = useMutation(api.leadCrmStore.addToSuppressionFromOutcome);
  const [zabrana, setZabrana] = useState<"predlog" | "cuva" | "dodato" | "greska">("predlog");
  const { item, ishod } = zapis;
  const naziv = item.company?.name ?? "Nepoznata firma";
  const prikaz = ISHOD_PRIKAZ[ishod];

  const potvrdiZabranu = async () => {
    setZabrana("cuva");
    try {
      await addToSuppression({
        workspaceId,
        companyId: item.assignment.companyId,
        kind: "rekao_ne",
        reason: `Dodato nakon ishoda „${prikaz.natpis}”`,
      });
      setZabrana("dodato");
    } catch {
      setZabrana("greska");
    }
  };

  return (
    <li className="flex flex-col gap-1.5 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Monogram name={naziv} seed={nisa} size="sm" />
        <Link
          href={`/leadovi/${item.assignment.companyId}`}
          target="_blank"
          className="min-w-0 flex-1 truncate text-ui font-medium text-foreground underline-offset-2 hover:text-mod hover:underline"
        >
          {naziv}
        </Link>
        <Chip size="sm" tone={prikaz.tone}>
          {prikaz.natpis}
        </Chip>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Sledeći korak za ${naziv}`}
          title="Kad se sledeći put javljaš"
          onClick={() => onSledeciKorak(item)}
          className="touch-target text-text-muted"
        >
          <Calendar aria-hidden />
        </Button>
      </div>
      {zapis.predlogZabrane && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-7 text-meta text-text-muted">
          <ShieldAlert className="size-3.5 shrink-0 text-warning" aria-hidden />
          {zabrana === "dodato" ? (
            <span>Firma je na listi „ne diraj”.</span>
          ) : (
            <>
              <span>
                {zabrana === "greska"
                  ? "Nije dodato. Pokušaj ponovo:"
                  : "Predlog: lista „ne diraj”."}
              </span>
              <Button
                variant="outline"
                size="xs"
                loading={zabrana === "cuva"}
                onClick={() => void potvrdiZabranu()}
                className="touch-target"
              >
                Dodaj na listu
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Kraj ture
// ─────────────────────────────────────────────────────────────────────────────

function Kraj({
  saIshodom,
  sastanaka,
  preskoceno,
  xpSesije,
  josKandidata,
  onJos,
  onExit,
}: {
  saIshodom: number;
  sastanaka: number;
  preskoceno: number;
  xpSesije: number | null;
  josKandidata: number;
  onJos: () => void;
  onExit: () => void;
}) {
  const sledecih = Math.min(SESIJA, josKandidata);
  return (
    <FocusCard
      title="Tura je završena"
      action={
        sledecih > 0 ? (
          <>
            <Button variant="primary" size="lg" onClick={onJos} className="touch-target px-4">
              Još {sledecih} {pluralSr(sledecih, "firma", "firme", "firmi")}
              <ArrowRight data-icon="inline-end" aria-hidden />
            </Button>
            <Button variant="ghost" size="lg" onClick={onExit} className="touch-target text-text-muted">
              Nazad na Danas
            </Button>
          </>
        ) : (
          <Button variant="primary" size="lg" onClick={onExit} className="touch-target px-4">
            <ArrowLeft data-icon="inline-start" aria-hidden />
            Nazad na Danas
          </Button>
        )
      }
    >
      <p className="text-copy text-foreground">
        <span className="font-mono font-bold tabular-nums">{saIshodom}</span>{" "}
        {pluralSr(saIshodom, "poziv", "poziva", "poziva")} sa zabeleženim ishodom
        {sastanaka > 0 && (
          <>
            {", od toga "}
            <span className="font-mono font-bold tabular-nums">{sastanaka}</span>{" "}
            {pluralSr(sastanaka, "sastanak", "sastanka", "sastanaka")}
          </>
        )}
        {preskoceno > 0 && (
          <span className="text-text-muted">
            {" · "}
            {preskoceno} {pluralSr(preskoceno, "preskočena", "preskočene", "preskočeno")}
          </span>
        )}
        .
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {xpSesije !== null && xpSesije > 0 && (
          <Chip tone="xp" className="font-mono tabular-nums">
            +{formatNumber(xpSesije)} XP u ovoj sesiji
          </Chip>
        )}
        <span className="text-ui text-text-muted">
          {sledecih > 0
            ? `U redu čeka još ${josKandidata} ${pluralSr(josKandidata, "firma", "firme", "firmi")}.`
            : "Red za pozive je prazan — nove kandidate donosi procena telefona i dopuna brojeva."}
        </span>
      </div>
    </FocusCard>
  );
}

/** Taster uz radnju. Na telefonu se ne crta — tamo tastature nema. */
function Kbd({
  k,
  tone = "plain",
  className,
}: {
  k: string;
  /** `inverse` za taster na punom (primarnom) dugmetu. */
  tone?: "plain" | "inverse";
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "rounded border px-1.5 py-px font-mono text-meta leading-none",
        tone === "inverse"
          ? "border-text-inverse/30 text-text-inverse"
          : "border-line bg-surface text-foreground",
        className,
      )}
    >
      {k}
    </kbd>
  );
}
