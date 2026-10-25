"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ProjekatLink } from "@/components/app/projekat-link";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { LeadScore, InvalidRule } from "@/convex/lib/leadScoring";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  Keyboard,
  Rows2,
  Rows4,
  User,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FeedbackNote } from "@/components/app/feedback";
import { Chip } from "@/components/app/system/chip";
import { ChipOverflow } from "@/components/app/system/chip-overflow";
import { Monogram } from "@/components/app/system/monogram";
import { SegmentedToggle } from "@/components/app/analytics/segmented-toggle";
import {
  useMoze,
  useProjekat,
  useProjekatHref,
  useProjekatQuery,
} from "@/components/app/projekat-provider";
import { useNow } from "@/components/app/use-now";
import { Unfold } from "@/components/motion/unfold";
import { useSetExitLatch } from "@/components/motion/exit-latch";
import { LinkChip } from "@/components/app/link-chip";
import { LeadScoreCell } from "./lead-score-cell";
import { LeadExportDialog } from "./lead-export-dialog";
import { LeadRowActions, type RowDialogKind } from "./lead-row-actions";
import { LeadExpandedRow } from "./lead-expanded-row";
import { LeadCallStrip } from "./lead-call-strip";
import { LeadFilterBar, SEARCH_INPUT_ID } from "./lead-filter-bar";
import { LeadGapFillDialog } from "./lead-gap-fill-dialog";
import { LeadStateChip } from "./lead-state-chip";
import { PhoneConfidenceRing } from "./phone-confidence";
import { SiteStatusBadge } from "./site-status-badge";
import { useLeadFilters } from "./use-lead-filters";
import { LeadRowDialogs, type LeadRowDialogState } from "./lead-row-dialogs";
import { leadSignalLabel, leadSignalShortLabel } from "./lead-labels";
import {
  EXPAND_COLUMN_PX,
  LEAD_COLUMNS,
  LEAD_COLUMN_LABEL,
  LEAD_COLUMN_WIDTH,
  ZASTO_MAX,
  columnValues,
  nextStep,
  phoneSummary,
  sameValueColumns,
  siteSummary,
  zastoSorted,
  type LeadColumnKey,
} from "./lead-columns";
import { signalSlot } from "@/lib/signal-colors";
import {
  ROW_EDGE_CLASS,
  rowEdge,
  type LeadRowItem,
} from "./lead-urgency";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;
const DENSITY_KEY = "enigma.leadovi.density";

function readDensity(): Density {
  try {
    return typeof window !== "undefined" &&
      localStorage.getItem(DENSITY_KEY) === "compact"
      ? "compact"
      : "comfortable";
  } catch {
    return "comfortable";
  }
}

type SortKey = "fit" | "intent" | "name" | "lastTouch" | "nextAction" | "signals";
type SortDirection = "asc" | "desc";
type Density = "compact" | "comfortable";

type LeadsTableProps = {
  onInvalidRulesFound?: (invalidRules: InvalidRule[]) => void;
};

/**
 * Poredi dva opciona vremena tako da red BEZ vrednosti uvek završi na kraju
 * liste, nezavisno od smera sortiranja. Vraća `null` kad obe vrednosti postoje.
 */
function compareOptionalTime(
  a: number | undefined,
  b: number | undefined,
): number | null {
  const aMissing = a === undefined;
  const bMissing = b === undefined;
  if (!aMissing && !bMissing) return null;
  if (aMissing && bMissing) return 0;
  return aMissing ? 1 : -1;
}

/** Dugme za sortiranje unutar zaglavlja — jedno zaglavlje može da nosi dva ključa. */
function SortButton({
  label,
  sortKey: key,
  activeKey,
  direction,
  onSort,
  title,
  compact = false,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey | null;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
  title?: string;
  /** Zaglavlje sa dva ključa u uskoj koloni: strelica se crta tek kad je ključ aktivan. */
  compact?: boolean;
}) {
  const active = activeKey === key;
  return (
    <button
      type="button"
      onClick={() => onSort(key)}
      title={title ?? `Sortiraj po: ${label}`}
      aria-pressed={active}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1 rounded-sm hover:text-foreground",
        active && "text-foreground",
      )}
    >
      <span>{label}</span>
      {active ? (
        direction === "asc" ? (
          <ArrowUp className="size-3.5 text-mod" />
        ) : (
          <ArrowDown className="size-3.5 text-mod" />
        )
      ) : compact ? null : (
        <ArrowUpDown className="size-3 opacity-40" />
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ćelije — svaka crta TAČNO ono što `lead-columns.ts` opisuje kao string
// ─────────────────────────────────────────────────────────────────────────────

/**
 * „Zašto": do tri stvarna signala kao čipovi u boji svoje kategorije, ostatak
 * kao „+N". Bez signala — „—".
 *
 * U tabeli (`row`) čip se NE seče: stane ceo ili ga nema (`ChipOverflow` meri
 * širinu), a natpis je kratak oblik — pun je u oblačiću. Na kartici (`wrap`)
 * čipovi se prelamaju, pa nose pun natpis.
 */
function ZastoCell({
  item,
  layout,
}: {
  item: LeadRowItem;
  layout: "row" | "wrap";
}) {
  // Niz signala je nov pri svakom očitavanju upita; ključ čuva merenje od
  // ponavljanja dok se sami signali ne promene.
  const kljuc = item.signali.join("|");
  const svi = useMemo(
    () => zastoSorted(item),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kljuc],
  );
  const stavke = useMemo(
    () =>
      svi.map((kind) => ({
        key: kind,
        label: leadSignalShortLabel(kind),
        category: signalSlot(kind),
        title: leadSignalLabel(kind),
      })),
    [svi],
  );
  if (svi.length === 0) return <Dash />;

  if (layout === "row") return <ChipOverflow items={stavke} max={ZASTO_MAX} />;

  const prikazani = svi.slice(0, ZASTO_MAX);
  const ostatak = svi.slice(ZASTO_MAX);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {prikazani.map((kind) => (
        <Chip key={kind} size="sm" category={signalSlot(kind)} className="max-w-full">
          {leadSignalLabel(kind)}
        </Chip>
      ))}
      {ostatak.length > 0 && (
        <span
          className="font-mono text-meta tabular-nums text-text-muted"
          title={`još ${ostatak.length}: ${ostatak.map(leadSignalLabel).join(", ")}`}
        >
          +{ostatak.length}
        </span>
      )}
    </div>
  );
}

/** „Sajt": link + bedž stanja (+ pojas kvaliteta); „nema sajt" je signal; neprovereno je „—". */
function SiteCell({ item, size }: { item: LeadRowItem; size: "sm" | "md" }) {
  const s = siteSummary(item);
  const company = item.company;
  if (s.kind === "neprovereno" || !company) return <Dash />;
  if (s.kind === "nema") {
    return (
      <span
        className="inline-flex h-6 items-center whitespace-nowrap rounded-md border border-temp-hot/50 bg-temp-hot-bg px-2 text-meta font-medium leading-none text-foreground"
        title="Firma nema sajt — prilika za ponudu."
      >
        nema sajt
      </span>
    );
  }
  const badge = (
    <SiteStatusBadge
      status={company.sajtStatus}
      https={company.sajtHttps}
      proverenAt={company.sajtProverenAt}
      napomena={company.sajtNapomena}
      kvalitet={item.sajtOcena?.kvalitet}
      size="sm"
    />
  );
  // Kompaktan red je jedan red visine: bedž sa dva dela („radi · bez HTTPS-a",
  // pojas kvaliteta) ne ostavlja mesta za link, pa ostaje samo stanje — link
  // je u proširenom redu i na profilu.
  const dugBedz =
    company.sajtHttps === false || typeof item.sajtOcena?.kvalitet === "number";
  if (!s.href || (size === "sm" && dugBedz)) return badge;
  return (
    <div className={cn("flex min-w-0 gap-1", size === "md" ? "flex-col items-start" : "items-center")}>
      <LinkChip vrsta="website" size="sm" href={s.href} className="max-w-full" />
      {badge}
    </div>
  );
}

/** „Telefon": prsten procene, ili poštena reč zašto prstena nema. */
function PhoneCell({ item }: { item: LeadRowItem }) {
  const p = phoneSummary(item);
  switch (p.kind) {
    case "nema":
      return <Dash title="Nema broja telefona u bazi." />;
    case "bez_procene":
      return (
        <span className="text-meta text-text-muted" title="Broj postoji, ali niko nije procenio čiji je.">
          bez procene
        </span>
      );
    case "nije_moguce":
      return (
        <span className="text-meta text-text-muted" title="Pokušano, ali nema nijednog dokaza čiji je broj.">
          nije moguće proceniti
        </span>
      );
    case "procena":
      return <PhoneConfidenceRing verovatnoca={p.verovatnoca} />;
  }
}

const NEXT_TONE = {
  danger: "text-danger font-medium",
  warning: "text-warning font-medium",
  neutral: "text-foreground",
  muted: "text-text-muted",
} as const;

/** „Sledeći korak": planiran rok (datum) ili predlog izveden iz stanja (prigušen). */
function NextStepCell({ item, now, size }: { item: LeadRowItem; now: number; size: "sm" | "md" }) {
  const k = nextStep(item, now);
  if (k.text === "—") return <Dash />;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span
        className={cn("truncate whitespace-nowrap text-ui", NEXT_TONE[k.tone], !k.planned && "italic")}
        title={k.planned ? undefined : "Predlog izveden iz stanja — rok nije upisan. Upiši ga kroz „Sledeći korak…”."}
      >
        {k.text}
      </span>
      {size === "md" && k.note && (
        <span className="line-clamp-1 text-meta text-text-muted">„{k.note}”</span>
      )}
    </div>
  );
}

function Dash({ title }: { title?: string }) {
  return (
    <span className="text-text-muted" title={title} aria-label={title ?? "nema podatka"}>
      —
    </span>
  );
}

/**
 * Firma: monogram u boji niše, naziv (najteži element reda, 15 px / 700), pa
 * grad · niša u drugom redu. Kolona ima bar 220 px (`LEAD_COLUMN_WIDTH`).
 */
function CompanyCell({
  item,
  nisa,
  size,
}: {
  item: LeadRowItem;
  nisa: string | null;
  size: "sm" | "md";
}) {
  const company = item.company;
  const companyId = item.assignment.companyId;
  const naziv = company ? company.name : "Nepoznata firma";
  const meta = [company?.city, nisa].filter(Boolean).join(" · ");
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Monogram name={naziv} seed={nisa} size={size === "md" ? "md" : "sm"} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <ProjekatLink
            href={`/leadovi/${companyId}`}
            title={company?.name}
            className={cn(
              "truncate font-bold text-foreground underline-offset-2 transition-colors hover:text-mod hover:underline",
              size === "md" ? "text-copy" : "text-ui",
            )}
          >
            {naziv}
          </ProjekatLink>
          {company?.origin === "inbound" && (
            <Chip size="sm" tone="module">
              Inbound
            </Chip>
          )}
          {size === "sm" && meta && (
            // Naziv deli red sa gradom i nišom: oni dobijaju samo ono što ostane.
            <span className="min-w-0 flex-1 truncate text-meta text-text-muted">· {meta}</span>
          )}
        </div>
        {size === "md" && (
          <span className="truncate text-meta text-text-muted">
            {meta || "—"}
            {company?.addressNeedsVerification && (
              <span className="text-warning"> · proveriti adresu</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/** Kolona „Fit / Intent": dva tanka merača jedan ispod drugog; u kompaktnom redu jedan red. */
function ScoreCell({ score, size }: { score: LeadScore | undefined; size: "sm" | "md" }) {
  if (size === "sm") {
    return (
      <div className="flex items-center gap-3">
        <LeadScoreCell axis="fit" score={score?.fit} variant="inline" />
        <LeadScoreCell axis="intent" score={score?.intent} variant="inline" />
      </div>
    );
  }
  return (
    <div className="flex w-full max-w-28 flex-col gap-1.5">
      <LeadScoreCell axis="fit" score={score?.fit} variant="meter" className="min-w-0" />
      <LeadScoreCell axis="intent" score={score?.intent} variant="meter" className="min-w-0" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabela
// ─────────────────────────────────────────────────────────────────────────────

export function LeadsTable({ onInvalidRulesFound }: LeadsTableProps) {
  const { korisnik, uloga } = useProjekat();
  // Posmatrač pregleda tabelu, ali tasteri p / i / s ne otvaraju beleženje.
  const moze = useMoze("urednik");
  const router = useRouter();
  const ka = useProjekatHref();
  // Izvor istine za filtere je URL (GL2, plan §7.1) — ne `useState` ovde.
  const { filters, args, aktivnihGrupa, clearAll } = useLeadFilters();
  const [page, setPage] = useState<number>(1);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [actionError, setActionError] = useState<string | null>(null);
  // Gustina je navika, ne stanje podataka — sme u localStorage.
  const [density, setDensity] = useState<Density>(readDensity);
  // Otvoreni redovi se NE pamte između učitavanja (§6).
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [callStrip, setCallStrip] = useState<{ assignmentId: string; phone: string } | null>(null);
  // Redovi koji su upravo skupljeni i još animiraju izlazak — bez ovoga bi
  // roditeljski `<tr>` nestao u prvom kadru i skupljanje bi bilo rez (A8 §1).
  const seSkupljaju = useSetExitLatch(expanded);
  const [dialog, setDialog] = useState<LeadRowDialogState | null>(null);
  const [fillCompany, setFillCompany] = useState<Doc<"leadCompanies"> | null>(null);
  // Red pod kursorom tastature (`j`/`k`); `null` dok se tastatura ne upotrebi.
  const [cursor, setCursor] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  // Kolone koje svima pišu isto se same sakrivaju; ovim ih čovek vraća.
  const [prikaziSveKolone, setPrikaziSveKolone] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const changeDensity = (next: Density) => {
    setDensity(next);
    try {
      localStorage.setItem(DENSITY_KEY, next);
    } catch {
      /* isto */
    }
  };

  const activeData = useProjekatQuery(api.leadFiltersStore.listLeadsFiltered, {
    ...args,
    strana: page,
    poStrani: PAGE_SIZE,
  });

  // Niša po firmi za ćeliju „Firma" (naziv + grad + niša). Red nosi samo
  // `nicheId`; imena stižu iz šifarnika koji čita i jezičak „Niše".
  const niches = useProjekatQuery(api.nichesStore.listNiches);
  const nisaPoId = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of niches ?? []) m.set(String(n._id), n.naziv);
    return m;
  }, [niches]);

  const isLoading = activeData === undefined;
  const now = useNow();

  const totalItems = activeData?.ukupno ?? 0;
  const totalPages = activeData?.ukupnoStrana ?? 1;
  const validPage = activeData?.strana ?? page;

  const currentPageItems: LeadRowItem[] = useMemo(() => {
    if (!activeData) return [];
    return activeData.items as LeadRowItem[];
  }, [activeData]);

  // Tvrda granica SCORE_COMPANIES_LIMIT (100): ocene SAMO za tekuću stranu.
  const currentPageCompanyIds = useMemo(() => {
    return currentPageItems
      .map((item) => item.company?._id)
      .filter((id): id is Id<"leadCompanies"> => Boolean(id));
  }, [currentPageItems]);

  const scoresQuery = useProjekatQuery(
    api.leadScoringStore.scoreCompanies,
    currentPageCompanyIds.length > 0
      ? { companyIds: currentPageCompanyIds }
      : "skip",
  );
  const scores = scoresQuery as Record<string, LeadScore> | undefined;

  // Prosleđivanje nevalidnih pravila roditelju — `useEffect`, jer je setState
  // roditelja propratni efekat, ne izračunavanje.
  useEffect(() => {
    if (scores && onInvalidRulesFound) {
      const invalidRulesMap = new Map<string, InvalidRule>();
      for (const score of Object.values(scores)) {
        if (score && Array.isArray(score.invalidRules)) {
          for (const rule of score.invalidRules) {
            const key = `${rule.ruleName}-${rule.signalKind}-${rule.razlog}`;
            if (!invalidRulesMap.has(key)) invalidRulesMap.set(key, rule);
          }
        }
      }
      onInvalidRulesFound(Array.from(invalidRulesMap.values()));
    }
  }, [scores, onInvalidRulesFound]);

  // Sortiranje SE RADI ISKLJUČIVO UNUTAR TEKUĆE STRANE (§4, KORAK 4)
  const sortedItems = useMemo(() => {
    if (!sortKey) return currentPageItems;
    return [...currentPageItems].sort((a, b) => {
      const scoreA = a.company ? scores?.[a.company._id] : undefined;
      const scoreB = b.company ? scores?.[b.company._id] : undefined;
      let comparison = 0;
      switch (sortKey) {
        case "fit":
          comparison = (scoreA?.fit.points ?? -1) - (scoreB?.fit.points ?? -1);
          break;
        case "intent":
          comparison = (scoreA?.intent.points ?? -1) - (scoreB?.intent.points ?? -1);
          break;
        case "name":
          comparison = (a.company?.name ?? "").localeCompare(b.company?.name ?? "", "sr");
          break;
        // „Nikad dodirnut" i „nema sledećeg koraka" NISU vreme 0 — idu na kraj u oba smera.
        case "lastTouch": {
          const rank = compareOptionalTime(a.assignment.lastTouchAt, b.assignment.lastTouchAt);
          if (rank !== null) return rank;
          comparison = (a.assignment.lastTouchAt as number) - (b.assignment.lastTouchAt as number);
          break;
        }
        case "nextAction": {
          const rank = compareOptionalTime(a.assignment.nextActionAt, b.assignment.nextActionAt);
          if (rank !== null) return rank;
          comparison = (a.assignment.nextActionAt as number) - (b.assignment.nextActionAt as number);
          break;
        }
        case "signals":
          comparison = a.signali.length - b.signali.length;
          break;
      }
      return sortDir === "asc" ? comparison : -comparison;
    });
  }, [currentPageItems, sortKey, sortDir, scores]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === "desc") setSortDir("asc");
      else setSortKey(null);
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const toggleExpanded = useCallback((assignmentId: string) => {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(assignmentId)) next.delete(assignmentId);
      else next.add(assignmentId);
      return next;
    });
  }, []);

  // ── Tastatura (O2, A7 §4): j/k, Enter, Space, p/i/s (radnje reda), /, Esc ──
  // Jedan slušalac na dokumentu; ne dira kucanje u poljima ni otvoren dijalog.
  const focusRow = useCallback((assignmentId: string) => {
    setCursor(assignmentId);
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-lead-row="${assignmentId}"]:not([hidden])`,
    );
    // Dve kopije reda postoje (tabela za ≥ md, kartica ispod) — fokusira se
    // ona koja je vidljiva.
    const vidljiv = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>(`[data-lead-row="${assignmentId}"]`) ?? [],
    ).find((n) => n.offsetParent !== null) ?? el;
    vidljiv?.focus({ preventScroll: false });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const typing =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || Boolean(t?.isContentEditable);

      if (e.key === "/" && !typing) {
        const search = document.getElementById(SEARCH_INPUT_ID) as HTMLInputElement | null;
        if (search) {
          e.preventDefault();
          search.focus();
          search.select();
        }
        return;
      }
      if (typing || dialog || fillCompany) return;
      // Otvoren meni / popover ima svoju tastaturu.
      if (t?.closest("[role=menu],[role=dialog],[data-slot=popover-content]")) return;

      const ids = sortedItems.map((i) => i.assignment._id as string);
      if (ids.length === 0) return;
      const idx = cursor ? ids.indexOf(cursor) : -1;
      const naRedu = t?.closest("[data-lead-row]") !== null;

      switch (e.key) {
        case "j":
        case "ArrowDown": {
          if (e.key === "ArrowDown" && !naRedu) return;
          e.preventDefault();
          focusRow(ids[Math.min(idx + 1, ids.length - 1)]);
          break;
        }
        case "k":
        case "ArrowUp": {
          if (e.key === "ArrowUp" && !naRedu) return;
          e.preventDefault();
          focusRow(ids[Math.max(idx - 1, 0)]);
          break;
        }
        case "Enter": {
          // Enter na dugmetu/linku unutar reda ostaje njihov.
          if (!naRedu || tag === "BUTTON" || tag === "A") return;
          const id = cursor ?? ids[0];
          const item = sortedItems.find((i) => i.assignment._id === id);
          if (item) {
            e.preventDefault();
            router.push(ka(`/leadovi/${item.assignment.companyId}`));
          }
          break;
        }
        case " ": {
          if (!naRedu || tag === "BUTTON" || tag === "A") return;
          if (!cursor) return;
          e.preventDefault();
          toggleExpanded(cursor);
          break;
        }
        // Radnje reda bez miša (A7 §4): p = Pozovi, i = Zabeleži ishod,
        // s = Sledeći korak. Tok „nađi → vidi zašto → pozovi → zabeleži ishod"
        // staje u 4 pritiska: j (fokusiraj red) · Space (vidi zašto) · p · i.
        case "p": {
          if (!moze || tag === "BUTTON" || tag === "A") return;
          const id = cursor ?? ids[0];
          // Isti put kao klik na primarno dugme „Pozovi" — pozove tel: i
          // otvori traku „Pozvao si — kako je prošlo?".
          const vidljivRed = Array.from(
            listRef.current?.querySelectorAll<HTMLElement>(`[data-lead-row="${id}"]`) ?? [],
          ).find((n) => n.offsetParent !== null);
          const dugmePoziva = vidljivRed?.querySelector<HTMLAnchorElement>(
            '[data-primary-action="call"]',
          );
          if (dugmePoziva) {
            e.preventDefault();
            dugmePoziva.click();
          } else {
            // Red nije u stanju poziva (već zvan): pozovi prvi poznati broj.
            const item = sortedItems.find((i) => i.assignment._id === id);
            const phone = item?.telefoni[0]?.value;
            if (phone) {
              e.preventDefault();
              setCallStrip({ assignmentId: id, phone });
            }
          }
          break;
        }
        case "i": {
          if (!moze || tag === "BUTTON" || tag === "A") return;
          const id = cursor ?? ids[0];
          const item = sortedItems.find((i) => i.assignment._id === id);
          if (item) {
            e.preventDefault();
            setDialog({ kind: "outcome", item });
          }
          break;
        }
        case "s": {
          if (!moze || tag === "BUTTON" || tag === "A") return;
          const id = cursor ?? ids[0];
          const item = sortedItems.find((i) => i.assignment._id === id);
          if (item) {
            e.preventDefault();
            setDialog({ kind: "nextAction", item });
          }
          break;
        }
        case "Escape": {
          if (callStrip) {
            setCallStrip(null);
          } else if (expanded.size > 0) {
            setExpanded(new Set());
          } else if (cursor) {
            setCursor(null);
            (document.activeElement as HTMLElement | null)?.blur();
          }
          break;
        }
        case "?":
          setShowKeys((s) => !s);
          break;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sortedItems, cursor, dialog, fillCompany, callStrip, expanded, focusRow, router, ka, toggleExpanded, moze]);

  // Filter čita najviše 2000 dodela; preko toga lista nije potpuna, i to se piše.
  const odsecenoNaGranici = activeData?.prekoracen === true;
  const pregledano = activeData?.pregledano;

  const startItemIndex = (validPage - 1) * PAGE_SIZE + 1;
  const endItemIndex = Math.min(validPage * PAGE_SIZE, totalItems);

  const size: "sm" | "md" = density === "compact" ? "sm" : "md";
  // Kompaktno = STVARNO jedan red: ~28 px sadržaja (čip 24 + line-height) +
  // 2×2 px = ~32 px. Izmereno Playwright-om pre A3: „kompaktno" je bilo 68 px.
  const cell = density === "compact" ? "px-2 py-0.5 align-middle leading-none" : "px-3 py-2.5 align-middle";
  const selfUserId = korisnik?.id;

  // ── Kolone koje se same sakrivaju (F10) ──
  // Kolona čija je vrednost ista u ≥ 90 % redova prikazanog preseka ne
  // razdvaja redove — sakriva se, uz napomenu šta je u njoj pisalo. Meri se
  // nad ISTIM stringovima koje tabela crta (`columnValues`), i tek kad stignu
  // ocene: dok ih nema, „Fit / Intent" je svuda „—" i sakrio bi se bez razloga.
  const oceneStigle = scores !== undefined || currentPageCompanyIds.length === 0;
  const isteVrednosti = useMemo(() => {
    if (!oceneStigle) return [];
    return sameValueColumns(
      sortedItems.map((item) =>
        columnValues(
          item,
          item.company ? scores?.[item.company._id] : undefined,
          now,
          selfUserId,
        ),
      ),
    );
  }, [oceneStigle, sortedItems, scores, now, selfUserId]);
  const sakriveno = useMemo(
    () => new Set<LeadColumnKey>(prikaziSveKolone ? [] : isteVrednosti.map((c) => c.key)),
    [prikaziSveKolone, isteVrednosti],
  );
  const vidi = (kolona: LeadColumnKey) => !sakriveno.has(kolona);
  const showOwner = vidi("vlasnik");

  const columnCount = 1 + LEAD_COLUMNS.filter(vidi).length;
  // Puno dugme ima samo aktivni red: onaj pod kursorom tastature, ili prvi
  // dok kursora nema (UI Boost §4.2). Ostali redovi nose ghost ikonice.
  const aktivniRed = cursor ?? (sortedItems[0]?.assignment._id as string | undefined);
  const sirina = (kolona: LeadColumnKey) => ({ width: LEAD_COLUMN_WIDTH[kolona] });

  const emptyMessage =
    aktivnihGrupa > 0
      ? "Nijedan lead ne odgovara ovom preseku filtera."
      : "U radnom prostoru još nema nijednog dodeljenog leada.";

  const rowProps = (assignmentId: string) => ({
    "data-lead-row": assignmentId,
    tabIndex: -1,
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      if (e.target === e.currentTarget) setCursor(assignmentId);
    },
  });

  const renderRow = (item: LeadRowItem): ReactNode[] => {
    const company = item.company;
    const assignment = item.assignment;
    const companyId = assignment.companyId;
    const score: LeadScore | undefined = company ? scores?.[company._id] : undefined;
    const edge = rowEdge(item, now);
    const edgeClass = edge ? ROW_EDGE_CLASS[edge] : "border-l-transparent";
    const isExpanded = expanded.has(assignment._id);
    // Red ostaje u DOM-u dok traje izlazna animacija (`useSetExitLatch`).
    const drziExpand = isExpanded || seSkupljaju.has(assignment._id);
    const stripPhone = callStrip?.assignmentId === assignment._id ? callStrip.phone : null;
    const isMine = selfUserId !== undefined && String(assignment.ownerUserId) === selfUserId;
    const expandId = `lead-expand-${assignment._id}`;
    const nisa = company?.nicheId ? (nisaPoId.get(String(company.nicheId)) ?? null) : null;
    const jeKursor = cursor === assignment._id;

    const openDialog = (kind: RowDialogKind) => setDialog({ kind, item });
    const actions = (
      <LeadRowActions
        item={item}
        now={now}
        selfUserId={selfUserId}
        onCall={(phone) => setCallStrip({ assignmentId: assignment._id, phone })}
        onOpenDialog={openDialog}
        onOpenStageDialog={(stage) => setDialog({ kind: "stage", item, stage })}
        onError={setActionError}
        onFill={company ? () => setFillCompany(company) : undefined}
        appearance={assignment._id === aktivniRed ? "full" : "icon"}
      />
    );
    const stateChip = company ? (
      <LeadStateChip
        companyId={company._id}
        companyName={company.name}
        stage={assignment.stage}
        temperatura={company.temperatura}
        size="sm"
        onOpenStageDialog={(stage) => setDialog({ kind: "stage", item, stage })}
        onError={setActionError}
      />
    ) : (
      <Dash title="Nepoznata firma." />
    );

    return [
      <TableRow
        key={assignment._id}
        {...rowProps(assignment._id)}
        className={cn(
          "group/row border-line border-l-4 outline-none transition-colors hover:bg-surface-raised has-aria-expanded:bg-surface-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mod",
          edgeClass,
          jeKursor && "bg-surface-raised/60",
          (isExpanded || stripPhone) && "border-b-0 bg-surface-raised",
        )}
      >
        {/* 0. Strelica */}
        <TableCell className={cn(cell, "w-8 pr-0")}>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-expanded={isExpanded}
            aria-controls={expandId}
            aria-label={isExpanded ? "Skupi red" : "Proširi red"}
            onClick={() => toggleExpanded(assignment._id)}
            className="text-text-muted hover:text-foreground"
          >
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform duration-(--duration-base)",
                isExpanded && "rotate-180",
              )}
            />
          </Button>
        </TableCell>

        {/* 1. Firma */}
        <TableCell className={cn(cell, "overflow-hidden")}>
          <CompanyCell item={item} nisa={nisa} size={size} />
        </TableCell>

        {/* 2. Fit / Intent */}
        {vidi("fitIntent") && (
          <TableCell className={cell}>
            <ScoreCell score={score} size={size} />
          </TableCell>
        )}

        {/* 3. Zašto */}
        {vidi("zasto") && (
          <TableCell className={cn(cell, "overflow-hidden")}>
            <ZastoCell item={item} layout="row" />
          </TableCell>
        )}

        {/* 4. Sajt */}
        {vidi("sajt") && (
          <TableCell className={cn(cell, "overflow-hidden")}>
            <SiteCell item={item} size={size} />
          </TableCell>
        )}

        {/* 5. Telefon */}
        {vidi("telefon") && (
          <TableCell className={cn(cell, "whitespace-nowrap")}>
            <PhoneCell item={item} />
          </TableCell>
        )}

        {/* 6. Stanje */}
        {vidi("stanje") && <TableCell className={cell}>{stateChip}</TableCell>}

        {/* 7. Vlasnik — sakriva se sam kad svima piše isto */}
        {showOwner && (
          <TableCell className={cn(cell, "text-meta text-text-muted")}>
            <span className="inline-flex items-center gap-1.5" title={String(assignment.ownerUserId)}>
              <User className="size-3.5 shrink-0" aria-hidden />
              <span className={cn(isMine && "font-medium text-foreground")}>
                {isMine ? "Ti" : "Član tima"}
              </span>
            </span>
          </TableCell>
        )}

        {/* 8. Sledeći korak */}
        {vidi("sledeciKorak") && (
          <TableCell className={cn(cell, "overflow-hidden")}>
            <NextStepCell item={item} now={now} size={size} />
          </TableCell>
        )}

        {/* 9. Akcije — lepljivo desno */}
        <TableCell
          className={cn(
            cell,
            "sticky right-0 z-[1] border-l border-line-soft bg-surface transition-colors group-hover/row:bg-surface-raised",
            (isExpanded || stripPhone || jeKursor) && "bg-surface-raised",
          )}
        >
          {actions}
        </TableCell>
      </TableRow>,

      stripPhone ? (
        <TableRow
          key={`${assignment._id}-call`}
          className={cn("border-line border-l-4 bg-surface-raised hover:bg-surface-raised", edgeClass, isExpanded && "border-b-0")}
        >
          <TableCell colSpan={columnCount} className="whitespace-normal p-0">
            <Unfold>
              <LeadCallStrip
                companyId={companyId}
                phone={stripPhone}
                onClose={() => setCallStrip(null)}
                onScheduleMeeting={() => setDialog({ kind: "meeting", item, calledPhone: stripPhone })}
                onRecordOutcome={() => openDialog("outcome")}
                onNextStep={() => openDialog("nextAction")}
                className="border-t border-line-soft bg-mod-soft px-4 py-2.5"
              />
            </Unfold>
          </TableCell>
        </TableRow>
      ) : null,

      drziExpand ? (
        <TableRow
          key={`${assignment._id}-expand`}
          id={expandId}
          className={cn("border-line border-l-4 bg-surface-raised/40 hover:bg-surface-raised/40", edgeClass)}
        >
          <TableCell colSpan={columnCount} className="whitespace-normal p-0 align-top">
            <Unfold open={isExpanded}>
              <LeadExpandedRow
                item={item}
                now={now}
                onCall={(phone) => setCallStrip({ assignmentId: assignment._id, phone })}
                onOpenDialog={openDialog}
              />
            </Unfold>
          </TableCell>
        </TableRow>
      ) : null,
    ];
  };

  /** Kartica za uzak ekran (< md): isti podaci, iste radnje, bez vodoravnog klizanja. */
  const renderCard = (item: LeadRowItem): ReactNode => {
    const company = item.company;
    const assignment = item.assignment;
    const companyId = assignment.companyId;
    const score: LeadScore | undefined = company ? scores?.[company._id] : undefined;
    const edge = rowEdge(item, now);
    const edgeClass = edge ? ROW_EDGE_CLASS[edge] : "border-l-transparent";
    const isExpanded = expanded.has(assignment._id);
    const stripPhone = callStrip?.assignmentId === assignment._id ? callStrip.phone : null;
    const isMine = selfUserId !== undefined && String(assignment.ownerUserId) === selfUserId;
    const nisa = company?.nicheId ? (nisaPoId.get(String(company.nicheId)) ?? null) : null;
    const openDialog = (kind: RowDialogKind) => setDialog({ kind, item });
    const k = nextStep(item, now);

    return (
      <article
        key={assignment._id}
        {...rowProps(assignment._id)}
        aria-label={company?.name ?? "Nepoznata firma"}
        className={cn(
          "flex flex-col gap-2.5 border-b border-l-4 border-line px-3 py-3 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mod",
          edgeClass,
          cursor === assignment._id && "bg-surface-raised/60",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <CompanyCell item={item} nisa={nisa} size="md" />
          {company && (
            <LeadStateChip
              companyId={company._id}
              companyName={company.name}
              stage={assignment.stage}
              temperatura={company.temperatura}
              size="sm"
              onOpenStageDialog={(stage) => setDialog({ kind: "stage", item, stage })}
              onError={setActionError}
            />
          )}
        </div>

        {/* Jedan red: Fit · Intent · čipovi „zašto" (prelamaju se). */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <ScoreCell score={score} size="sm" />
          <ZastoCell item={item} layout="wrap" />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-text-muted">
          <span className="inline-flex min-w-0 items-center gap-1">
            <span>Sajt</span>
            <SiteCell item={item} size="sm" />
          </span>
          <span className="inline-flex items-center gap-1">
            <span>Telefon</span>
            <PhoneCell item={item} />
          </span>
          {showOwner && (
            <span className="inline-flex items-center gap-1">
              <User className="size-3" aria-hidden />
              {isMine ? "Ti" : "Član tima"}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className={cn("min-w-0 truncate text-ui", NEXT_TONE[k.tone], !k.planned && "italic")}>
            {k.text === "—" ? "" : k.text}
            {k.note && <span className="text-meta text-text-muted"> „{k.note}”</span>}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-expanded={isExpanded}
              aria-label={isExpanded ? "Skupi" : "Proširi"}
              onClick={() => toggleExpanded(assignment._id)}
              className="text-text-muted hover:text-foreground"
            >
              <ChevronDown className={cn("size-3.5 transition-transform duration-(--duration-base)", isExpanded && "rotate-180")} />
            </Button>
            <LeadRowActions
              item={item}
              now={now}
              selfUserId={selfUserId}
              onCall={(phone) => setCallStrip({ assignmentId: assignment._id, phone })}
              onOpenDialog={openDialog}
              onOpenStageDialog={(stage) => setDialog({ kind: "stage", item, stage })}
              onError={setActionError}
              onFill={company ? () => setFillCompany(company) : undefined}
            />
          </div>
        </div>

        {stripPhone && (
          <Unfold>
            <LeadCallStrip
              companyId={companyId}
              phone={stripPhone}
              onClose={() => setCallStrip(null)}
              onScheduleMeeting={() => setDialog({ kind: "meeting", item, calledPhone: stripPhone })}
              onRecordOutcome={() => openDialog("outcome")}
              onNextStep={() => openDialog("nextAction")}
              className="rounded-lg border border-mod-line bg-mod-soft px-3 py-2"
            />
          </Unfold>
        )}
        {(isExpanded || seSkupljaju.has(assignment._id)) && (
          <Unfold open={isExpanded}>
            <div className="rounded-lg border border-line-soft bg-surface-raised/40">
              <LeadExpandedRow
                item={item}
                now={now}
                stacked
                onCall={(phone) => setCallStrip({ assignmentId: assignment._id, phone })}
                onOpenDialog={openDialog}
              />
            </div>
          </Unfold>
        )}
      </article>
    );
  };

  const headCls = "text-meta font-medium text-text-muted";

  return (
    <TooltipProvider delay={150}>
      <div className="flex flex-col gap-5" ref={listRef}>
        {/* Filteri (GL2, §7.1) — izvor istine je URL, ne stanje ove tabele */}
        <LeadFilterBar />

        {/* Straničenje, gustina i izvoz */}
        <div className="flex flex-wrap items-center gap-3">
          {!isLoading && totalItems > 0 && (
            <div className="text-ui text-text-muted">
              Prikazano{" "}
              <strong className="font-mono tabular-nums text-foreground">
                {startItemIndex}–{endItemIndex}
              </strong>{" "}
              od <strong className="font-mono tabular-nums text-foreground">{totalItems}</strong>{" "}
              {odsecenoNaGranici ? "pregledanih" : "u preseku"}
            </div>
          )}
          {isteVrednosti.length > 0 && (
            <p className="hidden min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-meta text-text-muted md:flex">
              <span>{prikaziSveKolone ? "Isto u svakom redu:" : "Sakriveno:"}</span>
              {isteVrednosti.map((c, i) => (
                <span key={c.key}>
                  <span className="font-medium text-foreground">{LEAD_COLUMN_LABEL[c.key]}</span>
                  {" — "}
                  {c.share === 1 ? "svima" : `u ${Math.floor(c.share * 100)} % redova`} „{c.value}”
                  {i < isteVrednosti.length - 1 ? " ·" : ""}
                </span>
              ))}
              <button
                type="button"
                aria-pressed={prikaziSveKolone}
                onClick={() => setPrikaziSveKolone((v) => !v)}
                className="cursor-pointer font-medium text-mod underline-offset-2 hover:underline"
              >
                {prikaziSveKolone ? "Sakrij ih" : "Prikaži"}
              </button>
            </p>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Prečice na tastaturi"
              aria-pressed={showKeys}
              title="Prečice: j/k redovi · Enter profil · Space proširi · p pozovi · i ishod · s sledeći korak · / pretraga · Esc zatvori"
              onClick={() => setShowKeys((s) => !s)}
              className="hidden text-text-muted hover:text-foreground md:inline-flex"
            >
              <Keyboard className="size-4" />
            </Button>
            <SegmentedToggle
              ariaLabel="Gustina tabele"
              value={density}
              onChange={changeDensity}
              options={[
                { value: "compact", label: "Kompaktno", icon: Rows4 },
                { value: "comfortable", label: "Udobno", icon: Rows2 },
              ]}
              className="hidden md:inline-flex"
            />
            {/* Izvoz kontakata traži urednika; posmatraču upit ne bi prošao. */}
            {uloga !== "client_viewer" && (
              <LeadExportDialog
                initialStage={filters.faza.length === 1 ? filters.faza[0] : undefined}
              />
            )}
          </div>
        </div>

        {showKeys && (
          <div className="hidden flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line-soft bg-surface-raised/50 px-3 py-2 text-meta text-text-muted md:flex">
            <Kbd k="j" /> <Kbd k="k" /> redovi ·
            <Kbd k="Enter" /> profil ·
            <Kbd k="Space" /> proširi ·
            {moze && (
              <>
                <Kbd k="p" /> pozovi ·
                <Kbd k="i" /> ishod ·
                <Kbd k="s" /> sledeći korak ·
              </>
            )}
            <Kbd k="/" /> pretraga ·
            <Kbd k="Esc" /> zatvori ·
            <Kbd k="?" /> ovaj spisak
          </div>
        )}

        {odsecenoNaGranici && (
          <FeedbackNote tone="warning" title="Lista nije potpuna">
            Filter je pregledao {pregledano} dodela, koliko upit najviše čita.
            Ima ih još iza te granice — broj pogodaka, strane i brojevi uz
            chipove važe samo za pregledani deo. Suzi filter (npr. po fazi ili
            gradu) da bi lista bila potpuna.
          </FeedbackNote>
        )}

        {sortKey && (
          <div className="flex items-center gap-2 rounded-lg border border-line-soft bg-surface-raised/50 px-3 py-2 text-meta text-text-muted">
            <Info className="size-3.5 shrink-0 text-mod" />
            <span>
              Sortiranje ({sortKey}, {sortDir === "asc" ? "rastuće" : "opadajuće"}) se
              primenjuje <strong>isključivo unutar prikazane strane od 25 leadova</strong>.
            </span>
          </div>
        )}

        {actionError && (
          <FeedbackNote
            tone="danger"
            title="Radnja nije sačuvana"
            action={
              <Button size="xs" variant="ghost" onClick={() => setActionError(null)}>
                Zatvori
              </Button>
            }
          >
            {actionError}
          </FeedbackNote>
        )}

        {/* Glavna tabela leadova (≥ md) */}
        <Card className="hidden border-line bg-surface md:block 2xl:overflow-visible">
          {/* Širine su fiksne (`table-fixed`, `LEAD_COLUMN_WIDTH`) da tabela
              STANE u karticu na 1440 px umesto da probija i krije kolone iza
              lepljivih Akcija; ispod te širine kartica kliza, strana ne.
              Od 1536 px tabela sigurno staje, pa omotači više ne seku — i
              zaglavlje može da se zalepi ispod gornje trake dok se lista
              prelistava (25 redova je više od dva ekrana na 695 px visine). */}
          <CardContent className="overflow-x-auto p-0 2xl:overflow-visible 2xl:[&_[data-slot=table-container]]:overflow-visible">
            <Table className={cn("table-fixed", density === "compact" ? "text-meta" : "text-ui")}>
              <TableHeader className="2xl:sticky 2xl:top-(--chrome-height) 2xl:z-10">
                <TableRow className="border-line bg-[color-mix(in_srgb,var(--surface-raised)_50%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--surface-raised)_50%,var(--surface))] 2xl:[&>th:first-child]:rounded-tl-xl 2xl:[&>th:last-child]:rounded-tr-xl">
                  <TableHead style={{ width: EXPAND_COLUMN_PX }} className="border-l-4 border-l-transparent pr-0">
                    <span className="sr-only">Proširi</span>
                  </TableHead>
                  <TableHead style={sirina("firma")} className={headCls} aria-sort={sortKey === "name" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
                    <SortButton label={LEAD_COLUMN_LABEL.firma} sortKey="name" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                  </TableHead>
                  {vidi("fitIntent") && (
                    <TableHead style={sirina("fitIntent")} className={headCls}>
                      <span className="inline-flex items-center gap-1">
                        <SortButton compact label="Fit" sortKey="fit" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                        <span className="opacity-50">/</span>
                        <SortButton compact label="Intent" sortKey="intent" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                      </span>
                    </TableHead>
                  )}
                  {vidi("zasto") && (
                    <TableHead style={sirina("zasto")} className={headCls}>
                      <SortButton label={LEAD_COLUMN_LABEL.zasto} sortKey="signals" activeKey={sortKey} direction={sortDir} onSort={handleSort} title="Sortiraj po broju signala" />
                    </TableHead>
                  )}
                  {vidi("sajt") && <TableHead style={sirina("sajt")} className={headCls}>{LEAD_COLUMN_LABEL.sajt}</TableHead>}
                  {vidi("telefon") && <TableHead style={sirina("telefon")} className={headCls}>{LEAD_COLUMN_LABEL.telefon}</TableHead>}
                  {vidi("stanje") && <TableHead style={sirina("stanje")} className={headCls}>{LEAD_COLUMN_LABEL.stanje}</TableHead>}
                  {showOwner && <TableHead style={sirina("vlasnik")} className={headCls}>{LEAD_COLUMN_LABEL.vlasnik}</TableHead>}
                  {vidi("sledeciKorak") && (
                    <TableHead style={sirina("sledeciKorak")} className={cn(headCls, "whitespace-normal")}>
                      <span className="inline-flex flex-wrap items-center gap-x-1.5">
                        <SortButton compact label={LEAD_COLUMN_LABEL.sledeciKorak} sortKey="nextAction" activeKey={sortKey} direction={sortDir} onSort={handleSort} />
                        <span className="opacity-50">·</span>
                        <SortButton compact label="dodir" sortKey="lastTouch" activeKey={sortKey} direction={sortDir} onSort={handleSort} title="Sortiraj po poslednjem dodiru" />
                      </span>
                    </TableHead>
                  )}
                  <TableHead style={sirina("akcije")} className={cn(headCls, "sticky right-0 z-[2] border-l border-line-soft bg-[color-mix(in_srgb,var(--surface-raised)_50%,var(--surface))] text-right")}>
                    {LEAD_COLUMN_LABEL.akcije}
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody className="2xl:[&>tr:last-child>td:last-child]:rounded-br-xl">
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={`skeleton-${i}`} className="border-line border-l-4 border-l-transparent">
                      <TableCell className={cell}><Skeleton className="size-5 rounded-md" /></TableCell>
                      <TableCell className={cell}><Skeleton className="h-8 w-44" /></TableCell>
                      <TableCell className={cell}><Skeleton className="h-8 w-20" /></TableCell>
                      <TableCell className={cell}><Skeleton className="h-6 w-40" /></TableCell>
                      <TableCell className={cell}><Skeleton className="h-6 w-24" /></TableCell>
                      <TableCell className={cell}><Skeleton className="h-4 w-14" /></TableCell>
                      <TableCell className={cell}><Skeleton className="h-6 w-28" /></TableCell>
                      {showOwner && <TableCell className={cell}><Skeleton className="h-4 w-10" /></TableCell>}
                      <TableCell className={cell}><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell className={cn(cell, "sticky right-0 border-l border-line-soft bg-surface")}><Skeleton className="ml-auto h-7 w-20" /></TableCell>
                    </TableRow>
                  ))
                ) : sortedItems.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={columnCount} className="whitespace-normal py-12 text-center text-text-muted">
                      <div className="flex flex-col items-center gap-2">
                        <span>{emptyMessage}</span>
                        {aktivnihGrupa > 0 && (
                          <Button size="xs" variant="outline" onClick={clearAll}>
                            Očisti filtere
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedItems.map(renderRow)
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Kartice (< md): ista lista, bez vodoravnog klizanja */}
        <Card className="border-line bg-surface md:hidden">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex flex-col gap-3 p-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full rounded-lg" />
                ))}
              </div>
            ) : sortedItems.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-text-muted">
                <span>{emptyMessage}</span>
                {aktivnihGrupa > 0 && (
                  <Button size="xs" variant="outline" onClick={clearAll}>
                    Očisti filtere
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex flex-col [&>article:last-child]:border-b-0">
                {sortedItems.map(renderCard)}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Kontrole straničenja */}
        {!isLoading && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-line pt-3">
            <div className="text-ui text-text-muted">
              Strana <strong className="font-mono tabular-nums">{validPage}</strong> od{" "}
              <strong className="font-mono tabular-nums">{totalPages}</strong> (po 25 leadova)
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.max(validPage - 1, 1))}
                disabled={validPage <= 1}
                className="cursor-pointer gap-1"
              >
                <ChevronLeft className="size-3.5" />
                Prethodna
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.min(validPage + 1, totalPages))}
                disabled={validPage >= totalPages}
                className="cursor-pointer gap-1"
              >
                Sledeća
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Dijalozi radnji iz reda — jedan primerak, vezan za izabrani red */}
        <LeadRowDialogs dialog={dialog} onClose={() => setDialog(null)} />

        {/* „Dopuni" (primarno dugme reda bez broja) → postojeći dijalog rupe „bez telefona" */}
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
    </TooltipProvider>
  );
}

function Kbd({ k }: { k: string }) {
  return (
    <kbd className="rounded border border-line bg-surface px-1.5 py-px font-mono text-meta text-foreground">
      {k}
    </kbd>
  );
}
