"use client";

import { useState } from "react";
import { ProjekatLink } from "@/components/app/projekat-link";
import { useProjekatQuery } from "@/components/app/projekat-provider";
import { Disc } from "lucide-react";
import { api } from "@/convex/_generated/api";
import {
  brojVezaRecenica,
  nazivVeze,
  porukaStatusa,
} from "@/convex/lib/statusVeze";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  RadnjaVeze,
  podaciOdTekst,
  useStatusVeza,
  type StanjeVeza,
} from "@/components/app/system/stanje-veze";
import { formatSyncAge } from "@/lib/format";
import { cn } from "@/lib/utils";
import { QuietBoundary } from "./quiet-boundary";

/**
 * Tačka u gornjoj traci: jedan status svih veza projekta (P3).
 *
 * Zelena je samo kad SVAKA povezana veza radi; čim jedna traži pažnju, tačka
 * je žuta i nosi broj („1 veza traži pažnju"). Nepovezan kanal nije kvar i ne
 * boji tačku. Do ULTRA1 je ova tačka po dizajnu bila uvek zelena i govorila
 * samo o starosti podataka, dok je Instagram tri dana stajao istekao.
 *
 * Klik otvara „zvono filtrirano na veze": samo veze koje traže pažnju, istim
 * rečima kao zvono, kanal i Podešavanja, sa jednom radnjom po vezi. Tri
 * stanja se razlikuju i oblikom, ne samo bojom: puna tačka, tačka sa brojem,
 * prazan prsten (i disk koji se vrti dok prolaz teče, a sve radi).
 */
type Tone = "radi" | "paznja" | "bez_veza" | "tece";

const TEXT: Record<Tone, string> = {
  radi: "text-success",
  tece: "text-info",
  paznja: "text-warning",
  bez_veza: "text-text-muted",
};

type StanjeTacke = {
  tone: Tone;
  headline: string;
  veze: StanjeVeza;
};

/** `undefined` dok odgovor ne stigne. */
function useStanjeTacke(): StanjeTacke | undefined {
  const veze = useStatusVeza();
  const health = useProjekatQuery(api.sync.health);
  // Kada su podaci na ekranu poslednji put postali svežiji — uključujući male
  // ciljane prolaze koji ne otvaraju red u istoriji (F6).
  const freshAt = useProjekatQuery(api.sync.freshness);

  if (veze === undefined || health === undefined) return undefined;
  const { zbir, sada } = veze;

  if (zbir.traziPaznju > 0) {
    return { tone: "paznja", headline: brojVezaRecenica(zbir.traziPaznju), veze };
  }
  if (zbir.radi === 0) {
    return { tone: "bez_veza", headline: "Nijedna veza nije povezana", veze };
  }
  const age = freshAt == null ? null : formatSyncAge(freshAt, sada);
  const tece = health.some((e) => e.status === "running");
  return {
    tone: tece ? "tece" : "radi",
    headline: tece
      ? `Sve veze rade · sinhronizacija teče`
      : age === null
        ? "Sve veze rade"
        : `Sve veze rade · sinhronizovano ${age}`,
    veze,
  };
}

/** `broj` = koliko veza traži pažnju; bez njega se crta samo tačka. */
function Glyph({ tone, broj }: { tone: Tone; broj?: number }) {
  if (tone === "tece") {
    return (
      <Disc
        aria-hidden
        className={cn("size-3.5 shrink-0 motion-safe:animate-spin", TEXT[tone])}
      />
    );
  }
  if (tone === "paznja") {
    return (
      <span aria-hidden className="inline-flex items-center gap-1">
        <span className="size-2 shrink-0 rounded-full bg-warning" />
        {broj !== undefined && (
          <span className="text-meta font-medium leading-none text-warning tabular-nums">
            {broj}
          </span>
        )}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "size-2 shrink-0 rounded-full",
        tone === "radi" ? "bg-success" : "border border-text-muted",
      )}
    />
  );
}

/** Tačka u gornjoj traci. */
export function SyncStatus({ className }: { className?: string }) {
  return (
    <QuietBoundary>
      <SyncDot className={className} />
    </QuietBoundary>
  );
}

function SyncDot({ className }: { className?: string }) {
  const state = useStanjeTacke();
  const [open, setOpen] = useState(false);

  if (state === undefined) {
    return <Skeleton className={cn("size-8 rounded-lg", className)} />;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`${state.headline}. Otvori stanje veza.`}
        title={state.headline}
        className={cn(
          "inline-flex h-8 min-w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg px-1.5 transition-colors hover:bg-surface-raised",
          open && "bg-surface-raised",
          className,
        )}
      >
        <Glyph tone={state.tone} broj={state.veze.zbir.traziPaznju} />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0"
      >
        <PanelVeza state={state} onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

/** Zvono filtrirano na veze: samo veze koje traže pažnju, istim rečima. */
function PanelVeza({
  state,
  onNavigate,
}: {
  state: StanjeTacke;
  onNavigate: () => void;
}) {
  const { statusi, sada } = state.veze;
  const paznja = statusi.filter((s) => s.vrednost === "trazi_paznju");

  return (
    <div className="flex max-h-[70vh] flex-col">
      <div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-line-soft px-3 py-2.5">
        <p className="text-ui font-medium text-foreground">Veze</p>
        <span className={cn("text-meta", TEXT[state.tone])}>{state.headline}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {paznja.length === 0 ? (
          <p className="px-3 py-4 text-meta leading-relaxed text-text-muted">
            {state.tone === "bez_veza"
              ? "Nijedan kanal još nije povezan. Veze se povezuju u Podešavanjima."
              : "Svaka povezana veza radi: prolaz je uspeo, pristup ne ističe uskoro i podaci su sveži."}
          </p>
        ) : (
          <ul className="flex flex-col">
            {paznja.map((s) => {
              const podaciOd = podaciOdTekst(s, sada);
              return (
                <li
                  key={s.provider}
                  className="flex items-start gap-2.5 border-b border-line-soft px-3 py-2.5 last:border-b-0"
                >
                  <span
                    aria-hidden
                    className="mt-1.5 size-2 shrink-0 rounded-full bg-warning"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-ui text-foreground">
                      {porukaStatusa(s, sada).recenica}
                    </p>
                    {podaciOd && (
                      <p className="text-meta text-text-muted">{podaciOd}</p>
                    )}
                  </div>
                  <RadnjaVeze
                    status={s}
                    sada={sada}
                    onNavigate={onNavigate}
                    className="text-ui"
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line-soft px-3 py-2">
        <span className="text-meta text-text-muted">
          {nepovezaneTekst(state)}
        </span>
        <ProjekatLink
          href="/settings?tab=integracije"
          onClick={onNavigate}
          className="touch-target inline-flex items-center text-meta font-medium text-accent-400 underline-offset-4 hover:underline"
        >
          Sve veze u Podešavanjima
        </ProjekatLink>
      </div>
    </div>
  );
}

/** „Nije povezano: YouTube" — nepovezan kanal nije kvar, ali se ne krije. */
function nepovezaneTekst(state: StanjeTacke): string {
  const nepovezane = state.veze.statusi.filter(
    (s) => s.vrednost === "nije_povezano" && s.razlog === null,
  );
  if (nepovezane.length === 0) return `${state.veze.zbir.radi} radi`;
  return `${state.veze.zbir.radi} radi · nije povezano: ${nepovezane
    .map((s) => nazivVeze(s.provider))
    .join(", ")}`;
}

/** Ista rečenica kao tekst — za meni korisnika (na telefonu tačke nema). */
export function SyncStatusLine({ className }: { className?: string }) {
  return (
    <QuietBoundary>
      <SyncLine className={className} />
    </QuietBoundary>
  );
}

function SyncLine({ className }: { className?: string }) {
  const state = useStanjeTacke();
  if (state === undefined) return null;

  return (
    <p className={cn("flex items-center gap-2 text-meta", className)}>
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        <Glyph tone={state.tone} />
      </span>
      <span className={cn("truncate", TEXT[state.tone])}>{state.headline}</span>
    </p>
  );
}
