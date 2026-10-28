"use client";

import { useId, useState } from "react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import {
  SABLONI_PRAVILA,
  formatVrednostPravila,
  type SablonPravila,
} from "@/convex/lib/pravilaProcena";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackNote } from "@/components/app/feedback";
import {
  useMoze,
  useProjekatMutation,
  useProjekatQuery,
} from "@/components/app/projekat-provider";
import { pluralSr } from "@/lib/format";
import { formatRuleSentence } from "@/lib/rule-sentence";
import { ChevronLeft, ChevronRight, Mail, Pause } from "lucide-react";

const REDOSLED: readonly SablonPravila[] = ["skupa_konverzija", "skok_potrosnje"];

/** Šta predlog meri, za rečenicu ispod polja. */
const OSNOVA_PREDLOGA: Record<SablonPravila, string> = {
  skupa_konverzija: "cene po rezultatu",
  skok_potrosnje: "dnevne potrošnje",
};

/** Upisan prag: zarez ili tačka za decimale; prazno i nepozitivno nije prag. */
export function procitajPrag(tekst: string): number | null {
  const t = tekst.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "" || !/^\d*\.?\d+$/.test(t)) return null;
  const x = Number(t);
  return Number.isFinite(x) && x > 0 ? x : null;
}

function pragUPolje(x: number): string {
  return String(x).replace(".", ",");
}

/**
 * „Dodaj iz šablona" (P5): izbor šablona, pa prag. Prag je predlog iz podataka
 * Meta naloga (dvostruka medijana za 28 dana) ili ga upisuje čovek; bez praga
 * se pravilo ne dodaje. Pravilo nastaje isključeno.
 */
export function RuleSablonDialog({
  open,
  onOpenChange,
  valuta,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  valuta?: string;
}) {
  const mozeVlasnik = useMoze("owner");
  if (!mozeVlasnik) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-lg">
        {open && <SablonSadrzaj valuta={valuta} onZatvori={() => onOpenChange(false)} />}
      </DialogPopup>
    </Dialog>
  );
}

function SablonSadrzaj({
  valuta,
  onZatvori,
}: {
  valuta?: string;
  onZatvori: () => void;
}) {
  const [sablon, setSablon] = useState<SablonPravila | null>(null);

  return sablon === null ? (
    <IzborSablona valuta={valuta} onIzaberi={setSablon} onZatvori={onZatvori} />
  ) : (
    <PragSablona
      key={sablon}
      sablon={sablon}
      valuta={valuta}
      onNazad={() => setSablon(null)}
      onZatvori={onZatvori}
    />
  );
}

function IzborSablona({
  valuta,
  onIzaberi,
  onZatvori,
}: {
  valuta?: string;
  onIzaberi: (s: SablonPravila) => void;
  onZatvori: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Dodaj iz šablona</DialogTitle>
        <DialogDescription>Izaberi šablon; prag biraš u sledećem koraku.</DialogDescription>
      </DialogHeader>

      <ul className="flex flex-col gap-2">
        {REDOSLED.map((id) => {
          const s = SABLONI_PRAVILA[id];
          const pauzira = s.action !== "notify";
          const Ikonica = pauzira ? Pause : Mail;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onIzaberi(id)}
                className="group flex w-full items-start gap-3 rounded-lg border border-line bg-surface px-3.5 py-3 text-left transition-colors duration-(--duration-fast) ease-(--ease-ui) outline-none hover:border-line-control hover:bg-surface-raised focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Ikonica className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-copy font-semibold text-foreground">{s.naziv}</span>
                  <span className="text-ui text-text-muted">
                    {formatRuleSentence(
                      {
                        scope: s.scope,
                        condition: { ...s.condition, value: 0 },
                        action: s.action,
                        cooldownHours: s.cooldownHours,
                      },
                      valuta,
                      "prag",
                    )}
                  </span>
                </span>
                <ChevronRight
                  className="mt-0.5 size-4 shrink-0 text-text-muted transition-transform duration-(--duration-fast) ease-(--ease-ui) group-hover:translate-x-0.5"
                  aria-hidden
                />
              </button>
            </li>
          );
        })}
      </ul>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onZatvori}>
          Odustani
        </Button>
      </DialogFooter>
    </>
  );
}

function PragSablona({
  sablon,
  valuta,
  onNazad,
  onZatvori,
}: {
  sablon: SablonPravila;
  valuta?: string;
  onNazad: () => void;
  onZatvori: () => void;
}) {
  const s = SABLONI_PRAVILA[sablon];
  const poljeId = useId();
  const pomocId = useId();
  const predlog = useProjekatQuery(api.rulesStore.predlogPraga, { sablon });
  const dodaj = useProjekatMutation(api.rulesStore.dodajIzSablona);

  // `null` dok korisnik ne kuca: polje tada nosi predlog čim stigne.
  const [unos, setUnos] = useState<string | null>(null);
  const [radim, setRadim] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  const valutaPraga = valuta ?? predlog?.valuta ?? undefined;
  const tekst = unos ?? (predlog && predlog.prag !== null ? pragUPolje(predlog.prag) : "");
  const prag = procitajPrag(tekst);

  const potvrdi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (prag === null) return;
    setRadim(true);
    setGreska(null);
    try {
      await dodaj({ sablon, prag });
      onZatvori();
    } catch (err) {
      const poruka =
        err instanceof ConvexError
          ? (err.data as { message?: string })?.message
          : undefined;
      setGreska(poruka ?? "Pravilo nije dodato. Pokušaj ponovo.");
    } finally {
      setRadim(false);
    }
  };

  return (
    <form onSubmit={potvrdi} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{s.naziv}</DialogTitle>
        <DialogDescription>
          {s.action === "notify"
            ? "Javlja mejlom kad kampanja pređe prag."
            : "Pauzira kampanju i javlja mejlom kad pređe prag."}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={poljeId}>Prag{valutaPraga ? ` (${valutaPraga})` : ""}</Label>
        {predlog === undefined ? (
          <Skeleton className="h-8 w-40 rounded-lg" />
        ) : (
          <Input
            id={poljeId}
            inputMode="decimal"
            autoComplete="off"
            required
            value={tekst}
            onChange={(e) => setUnos(e.target.value)}
            aria-describedby={pomocId}
            aria-invalid={tekst !== "" && prag === null ? true : undefined}
            className="w-40 tabular-nums"
            disabled={radim}
            autoFocus
          />
        )}
        <p id={pomocId} className="text-meta text-text-muted">
          {predlog === undefined
            ? "Računam predlog iz podataka naloga…"
            : predlog.prag !== null && predlog.osnova !== null
              ? `Predlog: dvostruka medijana ${OSNOVA_PREDLOGA[sablon]} za poslednjih 28 dana (${formatVrednostPravila(
                  s.condition.metric,
                  predlog.osnova.medijana,
                  valutaPraga,
                )} iz ${predlog.osnova.kampanja} ${pluralSr(
                  predlog.osnova.kampanja,
                  "kampanje",
                  "kampanje",
                  "kampanja",
                )}).`
              : predlog.razlog === "vise_valuta"
                ? "Meta nalozi rade u više valuta, pa predlog ne može da se izračuna; upiši prag u valuti naloga."
                : `Nema dovoljno podataka za predlog; upiši prag${valutaPraga ? ` u ${valutaPraga}` : ""}.`}
        </p>
        {tekst !== "" && prag === null && (
          <p className="text-meta text-danger">Prag je broj veći od nule, npr. 25 ili 12,5.</p>
        )}
      </div>

      <p className="text-ui text-text-muted">
        Pravilo nastaje isključeno.
        {s.action === "notify"
          ? " Uključuješ ga prekidačem na kartici."
          : " Pre uključivanja vidiš probu: šta bi sada pauziralo."}
      </p>

      {greska && <FeedbackNote tone="danger" title={greska} />}

      <DialogFooter className="sm:justify-between">
        <Button type="button" variant="ghost" onClick={onNazad} disabled={radim}>
          <ChevronLeft aria-hidden />
          Drugi šablon
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="ghost" onClick={onZatvori} disabled={radim}>
            Odustani
          </Button>
          <Button type="submit" variant="primary" loading={radim} disabled={prag === null}>
            {radim ? "Dodajem…" : "Dodaj pravilo"}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
