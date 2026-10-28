"use client";

import { useId, useState } from "react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { pravilaPauzira } from "@/convex/lib/pravilaProcena";
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
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  MERE_PRAVILA,
  formatMetricName,
  formatRuleSentence,
  istiCilj,
  pragJeIznos,
  type RuleAction,
  type RuleConditionLike,
  type RuleMetric,
  type RuleOperator,
  type RuleScope,
} from "@/lib/rule-sentence";
import { FeedbackNote } from "@/components/app/feedback";
import { ValutaUpozorenje } from "@/components/app/system/valuta-upozorenje";
import { InfoMere } from "@/components/app/system/naziv-mere";
import type { KljucMere } from "@/lib/mere";
import { useMoze, useProjekatMutation } from "@/components/app/projekat-provider";
import { RuleProbaDialog } from "./rule-proba-dialog";
import { useValutaPravila } from "./use-valuta-pravila";

export interface RuleEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ruleToEdit?: {
    _id: Id<"rules">;
    name: string;
    scope: RuleScope;
    condition: RuleConditionLike;
    action: RuleAction;
    cooldownHours: number;
    enabled: boolean;
  } | null;
  onSaved?: () => void;
}

/** Mera pravila → ključ u rečniku mera (oblačić sa akronimom i definicijom). */
const KLJUC_MERE: Record<RuleMetric, KljucMere> = {
  cpa: "cena_po_rezultatu",
  spend: "potrosnja",
  ctr: "stopa_klikova",
  cpc: "cena_po_kliku",
  roas: "povracaj",
};

const NIVOI: { id: RuleScope; label: string }[] = [
  { id: "campaign", label: "Kampanje" },
  { id: "adset", label: "Grupe oglasa" },
  { id: "account", label: "Ceo nalog" },
];

const OPERATORI: { id: RuleOperator; znak: string; label: string }[] = [
  { id: "gt", znak: ">", label: "Veće od" },
  { id: "gte", znak: "≥", label: "Veće ili jednako" },
  { id: "lt", znak: "<", label: "Manje od" },
  { id: "lte", znak: "≤", label: "Manje ili jednako" },
];

const AKCIJE: { id: RuleAction; label: string }[] = [
  { id: "pause_and_notify", label: "Pauziraj i javi" },
  { id: "pause", label: "Samo pauziraj" },
  { id: "notify", label: "Samo javi" },
];

/** Segmentirana kontrola: uvučen žleb, izabrani segment podignut. */
const ZLEB = "w-full rounded-lg bg-bg-900 p-0.5";
const SEGMENT =
  "touch-target flex-1 cursor-pointer rounded-md! text-text-muted hover:bg-transparent hover:text-foreground aria-pressed:bg-surface-raised aria-pressed:text-foreground aria-pressed:shadow-elev-1";

/** Ključ uslova za koji je proba potvrđena; izmena uslova traži novu probu. */
function kljucProbe(scope: RuleScope, c: RuleConditionLike): string {
  return JSON.stringify([scope, c.metric, c.operator, c.value, c.windowDays, c.minImpressions]);
}

/** Broj iz polja: zarez ili tačka; prazno ili neispravno je `NaN`. */
function broj(tekst: string): number {
  const t = tekst.trim().replace(/\s/g, "").replace(",", ".");
  return t === "" ? Number.NaN : Number(t);
}

export function RuleEditorDialog({
  open,
  onOpenChange,
  ruleToEdit,
  onSaved,
}: RuleEditorDialogProps) {
  // Pravila pravi i menja samo vlasnik; za ostale se dijalog uopšte ne crta.
  const mozeVlasnik = useMoze("owner");
  if (!mozeVlasnik) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-xl sm:max-w-xl">
        <RuleEditorForm
          key={ruleToEdit?._id ?? "new"}
          ruleToEdit={ruleToEdit}
          onClose={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      </DialogPopup>
    </Dialog>
  );
}

function RuleEditorForm({
  ruleToEdit,
  onClose,
  onSaved,
}: {
  ruleToEdit?: RuleEditorDialogProps["ruleToEdit"];
  onClose: () => void;
  onSaved?: () => void;
}) {
  const isEditing = !!ruleToEdit;
  const ids = {
    naziv: useId(),
    nivo: useId(),
    mera: useId(),
    operator: useId(),
    prag: useId(),
    prozor: useId(),
    prikazi: useId(),
    akcija: useId(),
    pauza: useId(),
    ukljuceno: useId(),
  };

  // Pravila rade nad Meta oglasima; prag je u valuti tog naloga. Valuta se
  // piše samo kad je jedna i poznata — nikad se ne pretpostavlja evro.
  const { valuta, drugaValuta } = useValutaPravila();

  const [name, setName] = useState(ruleToEdit?.name ?? "");
  const [scope, setScope] = useState<RuleScope>(ruleToEdit?.scope ?? "campaign");
  const [metric, setMetric] = useState<RuleMetric>(ruleToEdit?.condition.metric ?? "cpa");
  const [operator, setOperator] = useState<RuleOperator>(
    ruleToEdit?.condition.operator ?? "gt",
  );
  // Prag nema podrazumevanu vrednost: prag koji niko nije izabrao ne sme da radi.
  const [pragTekst, setPragTekst] = useState(
    ruleToEdit ? String(ruleToEdit.condition.value).replace(".", ",") : "",
  );
  const [prozorTekst, setProzorTekst] = useState(String(ruleToEdit?.condition.windowDays ?? 3));
  const [prikaziTekst, setPrikaziTekst] = useState(
    String(ruleToEdit?.condition.minImpressions ?? 1000),
  );
  const [action, setAction] = useState<RuleAction>(ruleToEdit?.action ?? "pause_and_notify");
  const [pauzaTekst, setPauzaTekst] = useState(String(ruleToEdit?.cooldownHours ?? 24));
  // Novo pravilo počinje isključeno.
  const [enabled, setEnabled] = useState<boolean>(ruleToEdit?.enabled ?? false);

  const value = broj(pragTekst);
  const windowDays = broj(prozorTekst);
  const minImpressions = broj(prikaziTekst);
  const cooldownHours = broj(pauzaTekst);
  const condition: RuleConditionLike = {
    metric,
    operator,
    value,
    windowDays,
    minImpressions,
  };

  // Aktivno pravilo koje već pauzira je prošlo probu za svoj sačuvan uslov.
  const [probaZa, setProbaZa] = useState<string | null>(
    ruleToEdit && ruleToEdit.enabled && pravilaPauzira(ruleToEdit.action)
      ? kljucProbe(ruleToEdit.scope, ruleToEdit.condition)
      : null,
  );
  const [probaOtvorena, setProbaOtvorena] = useState<"ukljuci" | "sacuvaj" | null>(null);
  const probaPotvrdjena = probaZa === kljucProbe(scope, condition);
  const trebaProba = enabled && pravilaPauzira(action) && !probaPotvrdjena;

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const createRuleMutation = useProjekatMutation(api.rulesStore.createRule);
  const updateRuleMutation = useProjekatMutation(api.rulesStore.updateRule);

  const greskaUnosa = (): string | null => {
    if (!name.trim()) return "Upiši naziv pravila.";
    if (!Number.isFinite(value) || value < 0) return "Prag je broj, npr. 25 ili 12,5.";
    if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 90)
      return "Prozor je od 1 do 90 dana.";
    if (!Number.isInteger(minImpressions) || minImpressions < 0)
      return "Najmanje prikaza je ceo broj, 0 ili više.";
    if (!Number.isInteger(cooldownHours) || cooldownHours < 1 || cooldownHours > 720)
      return "Pauza je od 1 do 720 h.";
    return null;
  };

  const sacuvaj = async (saProbom: boolean) => {
    setSubmitting(true);
    setErrorMsg(null);
    const telo = {
      name: name.trim(),
      scope,
      condition,
      action,
      cooldownHours,
      enabled,
      probaPotvrdjena: saProbom || undefined,
    };
    try {
      if (isEditing && ruleToEdit) {
        await updateRuleMutation({ ruleId: ruleToEdit._id, ...telo });
      } else {
        await createRuleMutation(telo);
      }
      onClose();
      onSaved?.();
    } catch (err: unknown) {
      const podaci = err instanceof ConvexError ? (err.data as { message?: string }) : null;
      setErrorMsg(
        podaci?.message ?? (err instanceof Error ? err.message : "Pravilo nije sačuvano."),
      );
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const greska = greskaUnosa();
    if (greska) {
      setErrorMsg(greska);
      return;
    }
    // Pauza po uslovu za koji proba nije viđena: prvo proba, pa čuvanje.
    if (trebaProba) {
      setProbaOtvorena("sacuvaj");
      return;
    }
    await sacuvaj(probaPotvrdjena && enabled && pravilaPauzira(action)).catch(() => {});
  };

  const handleUkljuceno = (sledece: boolean) => {
    if (sledece && pravilaPauzira(action) && !probaPotvrdjena) {
      const greska = greskaUnosa();
      if (greska) {
        setErrorMsg(greska);
        return;
      }
      setProbaOtvorena("ukljuci");
      return;
    }
    setEnabled(sledece);
  };

  const livePreview = formatRuleSentence(
    {
      scope,
      condition: {
        ...condition,
        value: Number.isFinite(value) ? value : 0,
        windowDays: Number.isFinite(windowDays) ? windowDays : 1,
        minImpressions: Number.isFinite(minImpressions) ? minImpressions : 0,
      },
      action,
      cooldownHours: Number.isFinite(cooldownHours) ? cooldownHours : undefined,
    },
    valuta,
    Number.isFinite(value) ? undefined : "prag",
  );


  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{isEditing ? "Izmeni pravilo" : "Novo pravilo"}</DialogTitle>
        <DialogDescription>
          Pravilo prati Meta kampanje i javlja ili pauzira kad pređu prag.
        </DialogDescription>
      </DialogHeader>

      <ValutaUpozorenje valuta={drugaValuta} />

      {errorMsg && <FeedbackNote tone="danger" title={errorMsg} />}

      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.naziv}>Naziv</Label>
          <Input
            id={ids.naziv}
            placeholder="npr. Skupa konverzija"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label id={ids.nivo}>Nivo</Label>
          <ToggleGroup
            value={[scope]}
            onValueChange={(v) => {
              if (v[0]) setScope(v[0] as RuleScope);
            }}
            spacing={0}
            aria-labelledby={ids.nivo}
            className={ZLEB}
          >
            {NIVOI.map((n) => (
              <ToggleGroupItem key={n.id} value={n.id} size="sm" className={SEGMENT}>
                {n.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <fieldset className="flex flex-col gap-3 border-t border-line-soft pt-4">
          <legend className="sr-only">Uslov</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor={ids.mera}>Mera</Label>
                <InfoMere mera={KLJUC_MERE[metric]} />
              </div>
              <Select<RuleMetric>
                id={ids.mera}
                label="Mera"
                value={metric}
                onValueChange={setMetric}
                disabled={submitting}
                options={MERE_PRAVILA.map((m) => ({
                  value: m,
                  label: formatMetricName(m),
                }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label id={ids.operator}>Uslov</Label>
              <ToggleGroup
                value={[operator]}
                onValueChange={(v) => {
                  if (v[0]) setOperator(v[0] as RuleOperator);
                }}
                spacing={0}
                aria-labelledby={ids.operator}
                className={`${ZLEB} sm:w-auto`}
              >
                {OPERATORI.map((o) => (
                  <ToggleGroupItem
                    key={o.id}
                    value={o.id}
                    size="sm"
                    aria-label={o.label}
                    title={o.label}
                    className={`${SEGMENT} min-w-9 tabular-nums`}
                  >
                    {o.znak}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.prag}>
                Prag{pragJeIznos(metric) && valuta ? ` (${valuta})` : metric === "ctr" ? " (%)" : ""}
              </Label>
              <Input
                id={ids.prag}
                inputMode="decimal"
                autoComplete="off"
                placeholder="npr. 25"
                value={pragTekst}
                onChange={(e) => setPragTekst(e.target.value)}
                className="tabular-nums"
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.prozor}>Prozor (dana)</Label>
              <Input
                id={ids.prozor}
                inputMode="numeric"
                value={prozorTekst}
                onChange={(e) => setProzorTekst(e.target.value)}
                className="tabular-nums"
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.prikazi}>Najmanje prikaza</Label>
              <Input
                id={ids.prikazi}
                inputMode="numeric"
                value={prikaziTekst}
                onChange={(e) => setPrikaziTekst(e.target.value)}
                className="tabular-nums"
                disabled={submitting}
              />
            </div>
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5 border-t border-line-soft pt-4">
          <Label id={ids.akcija}>Kad pređe prag</Label>
          <ToggleGroup
            value={[action]}
            onValueChange={(v) => {
              if (v[0]) setAction(v[0] as RuleAction);
            }}
            spacing={0}
            aria-labelledby={ids.akcija}
            className={ZLEB}
          >
            {AKCIJE.map((a) => (
              <ToggleGroupItem key={a.id} value={a.id} size="sm" className={SEGMENT}>
                {a.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.pauza}>Pauza za {istiCilj(scope)} (h)</Label>
            <Input
              id={ids.pauza}
              inputMode="numeric"
              value={pauzaTekst}
              onChange={(e) => setPauzaTekst(e.target.value)}
              className="w-28 tabular-nums"
              disabled={submitting}
            />
          </div>

          <label
            htmlFor={ids.ukljuceno}
            className="flex min-h-8 cursor-pointer items-center gap-2 text-ui"
          >
            <Switch
              id={ids.ukljuceno}
              checked={enabled}
              onCheckedChange={handleUkljuceno}
              disabled={submitting}
              className="cursor-pointer"
            />
            <span className={enabled ? "text-foreground" : "text-text-muted"}>Uključeno</span>
          </label>
        </div>

        {trebaProba && (
          <p className="text-meta text-text-muted">
            Uslov se promenio; pre čuvanja vidiš probu za novi uslov.
          </p>
        )}

        <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface px-3.5 py-3">
          <span className="text-meta text-text-muted">Pravilo rečima</span>
          <p className="text-ui text-foreground">„{livePreview}”</p>
        </div>
      </div>

      <DialogFooter className="border-t border-line pt-3">
        <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
          Odustani
        </Button>
        <Button type="submit" variant="primary" loading={submitting}>
          {submitting ? "Čuvam…" : isEditing ? "Sačuvaj izmene" : "Dodaj pravilo"}
        </Button>
      </DialogFooter>

      {probaOtvorena !== null && (
        <RuleProbaDialog
          open
          onOpenChange={(open) => {
            if (!open) setProbaOtvorena(null);
          }}
          naziv={name.trim() || undefined}
          scope={scope}
          condition={condition}
          ruleId={ruleToEdit?._id}
          valuta={valuta}
          onPotvrdi={async () => {
            const kljuc = kljucProbe(scope, condition);
            if (probaOtvorena === "ukljuci") {
              // Prekidač u uredniku: proba je viđena, pravilo se uključuje
              // pri čuvanju.
              setProbaZa(kljuc);
              setEnabled(true);
              return;
            }
            setProbaZa(kljuc);
            await sacuvaj(true);
          }}
        />
      )}
    </form>
  );
}
