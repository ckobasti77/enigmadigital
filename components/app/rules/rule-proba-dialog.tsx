"use client";

import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackNote } from "@/components/app/feedback";
import { useProjekatQuery } from "@/components/app/projekat-provider";
import { pluralSr } from "@/lib/format";
import {
  formatMetricName,
  formatOperatorSymbol,
  formatThresholdValue,
  type RuleConditionLike,
  type RuleScope,
} from "@/lib/rule-sentence";
import { Info } from "lucide-react";

export type ProbaPravila = FunctionReturnType<typeof api.rulesStore.probaPravila>;

/** Najviše redova u spisku; ostatak je „i još N". */
const NAJVISE_REDOVA = 8;

const brojFmt = new Intl.NumberFormat("sr-Latn-RS", { maximumFractionDigits: 0 });

/** Imenica cilja u akuzativu („pauziralo bi 2 kampanje"). */
export function ciljAkuzativ(n: number, scope: RuleScope): string {
  switch (scope) {
    case "campaign":
      return pluralSr(n, "kampanju", "kampanje", "kampanja");
    case "adset":
      return pluralSr(n, "grupu oglasa", "grupe oglasa", "grupa oglasa");
    case "account":
      return pluralSr(n, "nalog", "naloga", "naloga");
  }
}

/** Imenica cilja u nominativu („3 kampanje se ne procenjuju"). */
export function ciljNominativ(n: number, scope: RuleScope): string {
  switch (scope) {
    case "campaign":
      return pluralSr(n, "kampanja", "kampanje", "kampanja");
    case "adset":
      return pluralSr(n, "grupa oglasa", "grupe oglasa", "grupa oglasa");
    case "account":
      return pluralSr(n, "nalog", "naloga", "naloga");
  }
}

const NIJEDAN: Record<RuleScope, string> = {
  campaign: "nijednu kampanju",
  adset: "nijednu grupu oglasa",
  account: "nijedan nalog",
};

/** „poslednji dan", „poslednja 3 dana", „poslednjih 7 dana". */
export function poslednjihDana(n: number): string {
  if (n === 1) return "poslednji dan";
  return `${pluralSr(n, "poslednji", "poslednja", "poslednjih")} ${n} dana`;
}

/**
 * Proba pre uključivanja pravila koje pauzira (P5): šta bi pravilo SADA
 * pauziralo nad podacima iz baze, sa nazivom, vrednošću i pragom. Uključivanje
 * je moguće tek kad proba stigne; upit ne zove Metu.
 */
export function RuleProbaDialog({
  open,
  onOpenChange,
  naziv,
  scope,
  condition,
  ruleId,
  valuta,
  onPotvrdi,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  naziv?: string;
  scope: RuleScope;
  condition: RuleConditionLike;
  ruleId?: Id<"rules">;
  valuta?: string;
  /** Uključuje pravilo sa potvrđenom probom; greška ostaje u dijalogu. */
  onPotvrdi: () => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-lg">
        {open && (
          <ProbaSadrzaj
            naziv={naziv}
            scope={scope}
            condition={condition}
            ruleId={ruleId}
            valuta={valuta}
            onPotvrdi={onPotvrdi}
            onZatvori={() => onOpenChange(false)}
          />
        )}
      </DialogPopup>
    </Dialog>
  );
}

function ProbaSadrzaj({
  naziv,
  scope,
  condition,
  ruleId,
  valuta,
  onPotvrdi,
  onZatvori,
}: {
  naziv?: string;
  scope: RuleScope;
  condition: RuleConditionLike;
  ruleId?: Id<"rules">;
  valuta?: string;
  onPotvrdi: () => Promise<void>;
  onZatvori: () => void;
}) {
  const proba = useProjekatQuery(api.rulesStore.probaPravila, {
    scope,
    condition,
    ruleId,
  });
  const [radim, setRadim] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  const potvrdi = async () => {
    setRadim(true);
    setGreska(null);
    try {
      await onPotvrdi();
      onZatvori();
    } catch (err) {
      const poruka =
        err instanceof ConvexError
          ? (err.data as { message?: string })?.message
          : err instanceof Error
            ? err.message
            : undefined;
      setGreska(poruka ?? "Uključivanje nije uspelo. Pokušaj ponovo.");
    } finally {
      setRadim(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Proba pre uključivanja</DialogTitle>
        <DialogDescription>
          {naziv ? `„${naziv}": šta bi pravilo uradilo sada.` : "Šta bi pravilo uradilo sada."}
        </DialogDescription>
      </DialogHeader>

      {proba === undefined ? (
        <div className="flex flex-col gap-2" aria-busy>
          <Skeleton className="h-5 w-56 rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
      ) : (
        <TeloProbe proba={proba} scope={scope} condition={condition} valuta={valuta ?? proba.valuta} />
      )}

      {greska && <FeedbackNote tone="danger" title={greska} />}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onZatvori} disabled={radim}>
          Odustani
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={potvrdi}
          loading={radim}
          disabled={proba === undefined}
        >
          {radim ? "Uključujem…" : "Uključi pravilo"}
        </Button>
      </DialogFooter>
    </>
  );
}

function TeloProbe({
  proba,
  scope,
  condition,
  valuta,
}: {
  proba: ProbaPravila;
  scope: RuleScope;
  condition: RuleConditionLike;
  valuta?: string | null;
}) {
  const aktivni = proba.pogodjeni.filter((p) => !p.uPauzi);
  const mera = formatMetricName(condition.metric);
  const op = formatOperatorSymbol(condition.operator);
  const iznos = (x: number) => formatThresholdValue(condition.metric, x, valuta);
  const prikazani = proba.pogodjeni.slice(0, NAJVISE_REDOVA);
  const jos = proba.pogodjeni.length - prikazani.length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-copy font-semibold text-foreground">
        {aktivni.length > 0
          ? `Sada bi pauziralo: ${aktivni.length} ${ciljAkuzativ(aktivni.length, scope)}`
          : `Sada ne bi pauziralo ${NIJEDAN[scope]}.`}
      </p>

      {prikazani.length > 0 && (
        <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
          {prikazani.map((p) => (
            <li key={p.targetId} className="flex flex-col gap-0.5 py-2">
              <span className="truncate text-ui font-medium text-foreground" title={p.naziv}>
                {p.naziv}
              </span>
              <span className="text-meta text-text-muted">
                {mera}{" "}
                <span className="tabular-nums text-foreground">{iznos(p.vrednost)}</span> {op}{" "}
                prag <span className="tabular-nums">{iznos(p.prag)}</span>
                {p.uPauzi && p.cekaJosSati !== null && (
                  <> · već okinuto, čeka još {p.cekaJosSati} h</>
                )}
                {p.status !== "ACTIVE" && <> · već nije aktivna na Meti</>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {jos > 0 && (
        <p className="text-meta text-text-muted">
          i još {jos} {ciljNominativ(jos, scope)}
        </p>
      )}

      {aktivni.length === 0 && proba.najblizi && (
        <p className="text-ui text-text-muted">
          Najbliža pragu: <span className="text-foreground">{proba.najblizi.naziv}</span>{" "}
          <span className="tabular-nums text-foreground">{iznos(proba.najblizi.vrednost)}</span>
          {proba.najblizi.procenatPraga !== null ? (
            <> · <span className="tabular-nums">{proba.najblizi.procenatPraga}</span> % praga</>
          ) : (
            <> · prag {iznos(condition.value)}</>
          )}
        </p>
      )}

      {proba.ispodMinPrikaza > 0 && (
        <p className="text-meta text-text-muted">
          {proba.ispodMinPrikaza} {ciljNominativ(proba.ispodMinPrikaza, scope)} ispod{" "}
          {brojFmt.format(condition.minImpressions)} prikaza{" "}
          {pluralSr(proba.ispodMinPrikaza, "se ne procenjuje", "se ne procenjuju", "se ne procenjuje")}.
        </p>
      )}

      {!proba.pisanjeUkljuceno && (
        <FeedbackNote
          tone="warning"
          title="Pauziranje je sada isključeno na serveru; pravilo bi samo poslalo mejl."
        />
      )}

      <p className="flex items-start gap-1.5 text-meta text-text-muted">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        Proba čita podatke iz baze za {poslednjihDana(proba.prozorDana)} i ništa ne menja na
        Meti.
      </p>
    </div>
  );
}
