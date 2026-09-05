"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Flame,
  Loader2,
  Pencil,
  Plus,
  SlidersHorizontal,
  Target,
  Trash2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { LEAD_SIGNAL_KINDS, type LeadSignalKind } from "@/convex/lib/leadNormalize";
import { leadSignalLabel } from "./lead-labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { FeedbackNote, type FeedbackTone } from "@/components/app/feedback";
import { cn } from "@/lib/utils";

/**
 * Ekran „Ocenjivanje" — podešavanje ICP pravila po kojima se računaju Fit i
 * Intent ose leadova. Backend je gotov (convex/leadScoringStore.ts); ovaj panel
 * ga samo vozi: listIcpRules, upsertIcpRule, setIcpRuleActive, deleteIcpRule i
 * seedDefaultIcpRules. Ocena se nigde ne dira — ona se i dalje računa isključivo
 * pri čitanju.
 *
 * Tri stanja se NIKADA ne smeju pomešati:
 *   - učitavanje  → skeletoni (nešto stiže)
 *   - prazno      → mirna ponuda da se ubace podrazumevana pravila (stanje SADA)
 *   - neuspeh     → crvena poruka sa razlogom i ponovnim pokušajem
 * Prazno nije greška i ne sme da liči na grešku.
 */

type RuleDoc = Doc<"leadIcpRules">;
type Axis = "fit" | "intent";

/**
 * Broj podrazumevanih pravila (DEFAULT_ICP_RULES u convex/leadScoringStore.ts:
 * 6 za Fit + 6 za Intent). Ne uvozi se odatle jer taj modul povlači Convex
 * server (`./_generated/server`) u klijentski bundle. Ako se skup ikada promeni,
 * stvarni broj ubačenih pravila stiže iz `seed(...)` i prikazuje se u potvrdi —
 * on je merodavan, ova konstanta je samo najava.
 */
const DEFAULT_RULE_COUNT = 12;

const AXIS_META: Record<
  Axis,
  { label: string; desc: string; icon: typeof Target }
> = {
  fit: {
    label: "Fit",
    desc: "Koliko firma strukturno odgovara našim uslugama.",
    icon: Target,
  },
  intent: {
    label: "Intent",
    desc: "Koliko je firma trenutno zainteresovana i aktivna na tržištu.",
    icon: Flame,
  },
};

type Notice = { tone: FeedbackTone; title: string };

export function ScoringRulesPanel({
  workspaceId,
}: {
  workspaceId: Id<"workspaces">;
}) {
  const rules = useQuery(api.leadScoringStore.listIcpRules, { workspaceId });

  const [form, setForm] = useState<{ mode: "new"; axis?: Axis } | { mode: "edit"; rule: RuleDoc } | null>(null);
  const [toDelete, setToDelete] = useState<RuleDoc | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const setActive = useMutation(api.leadScoringStore.setIcpRuleActive);

  const byAxis = useMemo(() => {
    const groups: Record<Axis, RuleDoc[]> = { fit: [], intent: [] };
    for (const rule of rules ?? []) groups[rule.axis].push(rule);
    for (const axis of ["fit", "intent"] as const) {
      groups[axis].sort((a, b) => b.weight - a.weight);
    }
    return groups;
  }, [rules]);

  async function handleToggle(rule: RuleDoc, isActive: boolean) {
    try {
      await setActive({ workspaceId, ruleId: rule._id, isActive });
    } catch (err) {
      setNotice({
        tone: "danger",
        title:
          err instanceof Error
            ? err.message
            : "Promena stanja pravila nije uspela.",
      });
    }
  }

  const dialogs = (
    <>
      {form && (
        <RuleFormDialog
          workspaceId={workspaceId}
          initial={form.mode === "edit" ? form.rule : undefined}
          defaultAxis={form.mode === "new" ? form.axis : undefined}
          onClose={() => setForm(null)}
          onSaved={(mode) =>
            setNotice({
              tone: "success",
              title:
                mode === "edit"
                  ? "Pravilo je izmenjeno."
                  : "Novo pravilo je dodato.",
            })
          }
        />
      )}
      {toDelete && (
        <DeleteRuleDialog
          workspaceId={workspaceId}
          rule={toDelete}
          onClose={() => setToDelete(null)}
          onDeleted={(name) =>
            setNotice({ tone: "warning", title: `Pravilo „${name}” je obrisano.` })
          }
        />
      )}
    </>
  );

  // 1) UČITAVANJE
  if (rules === undefined) {
    return (
      <>
        <ScoringSkeleton />
        {dialogs}
      </>
    );
  }

  // 2) PRAZNO — trenutno stanje korisnika: nijedno pravilo ne postoji.
  if (rules.length === 0) {
    return (
      <>
        <EmptyScoring
          workspaceId={workspaceId}
          onAddManually={() => setForm({ mode: "new" })}
          notice={notice}
        />
        {dialogs}
      </>
    );
  }

  // 3) POPUNJENO
  return (
    <div className="flex flex-1 flex-col gap-6">
      {notice && (
        <FeedbackNote
          tone={notice.tone}
          title={notice.title}
          action={
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-xs font-medium text-text-muted transition-colors hover:text-foreground"
            >
              Zatvori
            </button>
          }
        />
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-prose">
          <p className="text-sm text-text-muted">
            Težine žive u bazi da bi se kalibrisale bez novog deploy-a. Ocena se
            računa pri čitanju iz aktivnih pravila — isključeno pravilo ostaje na
            ekranu, ali ne ulazi u zbir.
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setForm({ mode: "new" })}
        >
          <Plus className="size-3.5" />
          <span>Dodaj pravilo</span>
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {(["fit", "intent"] as const).map((axis) => (
          <AxisColumn
            key={axis}
            axis={axis}
            rules={byAxis[axis]}
            onAdd={() => setForm({ mode: "new", axis })}
            onEdit={(rule) => setForm({ mode: "edit", rule })}
            onDelete={(rule) => setToDelete(rule)}
            onToggle={handleToggle}
          />
        ))}
      </div>

      {dialogs}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Prazno stanje                                                               */
/* -------------------------------------------------------------------------- */

function EmptyScoring({
  workspaceId,
  onAddManually,
  notice,
}: {
  workspaceId: Id<"workspaces">;
  onAddManually: () => void;
  notice: Notice | null;
}) {
  const seed = useMutation(api.leadScoringStore.seedDefaultIcpRules);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSeed() {
    setSeeding(true);
    setError(null);
    try {
      // Uspeh preusmerava komponentu u popunjeno stanje (listIcpRules je
      // reaktivan), pa se potvrda računa tamo. Ovde ostaje samo neuspeh.
      const res = await seed({ workspaceId });
      if (!res.seeded) {
        // Neko je u međuvremenu već ubacio pravila (dve iste sesije). Nije
        // greška — lista će se sama osvežiti; ostavljamo mirnu belešku.
        setError(null);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ubacivanje podrazumevanih pravila nije uspelo.",
      );
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center py-10">
      <div className="w-full max-w-xl">
        {/* Neuspeh je crven i odvojen — nikad ne izgleda kao prazno stanje. */}
        {error && (
          <FeedbackNote
            tone="danger"
            title={error}
            className="mb-6"
          >
            Pravila nisu ubačena. Proveri vezu i pokušaj ponovo — ovo je greška
            pri upisu, a ne stanje „nema pravila”.
          </FeedbackNote>
        )}
        {notice && !error && (
          <FeedbackNote tone={notice.tone} title={notice.title} className="mb-6" />
        )}

        <div className="rounded-2xl border border-line bg-surface/60 p-8 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-accent-400/25 bg-accent-400/10 text-accent-400">
            <SlidersHorizontal className="size-6" />
          </div>

          <h2 className="mt-5 text-h2 text-foreground">
            Ocenjivanje još nije uključeno
          </h2>
          <p className="mx-auto mt-2.5 max-w-md text-sm leading-relaxed text-text-muted">
            Nijedno pravilo bodovanja ne postoji, pa se{" "}
            <span className="text-foreground">Fit</span> i{" "}
            <span className="text-foreground">Intent</span> ocene ne računaju —
            zato svaka firma u tabeli stoji kao{" "}
            <span className="font-medium text-foreground">„Nema pravila”</span>.
            Podrazumevani skup pokriva {DEFAULT_RULE_COUNT} signala, kalibrisan za
            Enigmine usluge, i odmah vraća ocene u tabelu.
          </p>

          <div className="mx-auto mt-6 grid max-w-sm grid-cols-2 gap-3 text-left">
            {(["fit", "intent"] as const).map((axis) => {
              const meta = AXIS_META[axis];
              const Icon = meta.icon;
              return (
                <div
                  key={axis}
                  className="rounded-xl border border-line bg-surface px-3.5 py-3"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-text-muted" />
                    <span className="text-sm font-medium text-foreground">
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-1 text-micro leading-relaxed text-text-muted">
                    6 pravila
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-7 flex flex-col items-center gap-3">
            <Button
              size="lg"
              className="w-full gap-2 font-semibold sm:w-auto"
              onClick={handleSeed}
              disabled={seeding}
            >
              {seeding ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Ubacivanje…</span>
                </>
              ) : (
                <>
                  <Plus className="size-4" />
                  <span>Ubaci {DEFAULT_RULE_COUNT} podrazumevanih pravila</span>
                </>
              )}
            </Button>
            <button
              type="button"
              onClick={onAddManually}
              disabled={seeding}
              className="text-sm font-medium text-accent-400 transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              Ili dodaj prvo pravilo ručno
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Kolona po osi                                                               */
/* -------------------------------------------------------------------------- */

function AxisColumn({
  axis,
  rules,
  onAdd,
  onEdit,
  onDelete,
  onToggle,
}: {
  axis: Axis;
  rules: RuleDoc[];
  onAdd: () => void;
  onEdit: (rule: RuleDoc) => void;
  onDelete: (rule: RuleDoc) => void;
  onToggle: (rule: RuleDoc, isActive: boolean) => void;
}) {
  const meta = AXIS_META[axis];
  const Icon = meta.icon;
  const activeSum = rules
    .filter((r) => r.isActive)
    .reduce((sum, r) => sum + r.weight, 0);
  const activeCount = rules.filter((r) => r.isActive).length;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
      <header className="flex items-start justify-between gap-3 border-b border-line-soft pb-3">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex size-8 items-center justify-center rounded-lg border border-line bg-surface-raised text-text-muted">
            <Icon className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {meta.label}
            </h3>
            <p className="mt-0.5 text-micro leading-relaxed text-text-muted">
              {meta.desc}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-lg font-semibold tabular-nums text-foreground">
            {activeSum}
          </div>
          <div className="text-micro text-text-muted">
            zbir aktivnih težina
          </div>
        </div>
      </header>

      {rules.length === 0 ? (
        <p className="py-6 text-center text-xs text-text-muted">
          Nema pravila za ovu osu.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rules.map((rule) => (
            <RuleRow
              key={rule._id}
              rule={rule}
              onEdit={() => onEdit(rule)}
              onDelete={() => onDelete(rule)}
              onToggle={(isActive) => onToggle(rule, isActive)}
            />
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between pt-1">
        <span className="text-micro text-text-muted">
          {activeCount} aktivno · {rules.length} ukupno
        </span>
        <Button
          size="xs"
          variant="ghost"
          className="gap-1 text-text-muted hover:text-foreground"
          onClick={onAdd}
        >
          <Plus className="size-3" />
          <span>Dodaj</span>
        </Button>
      </div>
    </section>
  );
}

function RuleRow({
  rule,
  onEdit,
  onDelete,
  onToggle,
}: {
  rule: RuleDoc;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (isActive: boolean) => void;
}) {
  return (
    <li
      className={cn(
        "rounded-lg border border-line bg-surface px-3.5 py-3 transition-colors",
        !rule.isActive && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium text-foreground">
              {rule.name}
            </span>
            <span className="rounded bg-surface-raised px-1.5 py-0.5 text-micro text-text-muted">
              {leadSignalLabel(rule.signalKind)}
            </span>
          </div>
          {rule.rationale ? (
            <p className="mt-1.5 text-xs leading-relaxed text-text-muted">
              {rule.rationale}
            </p>
          ) : (
            <p className="mt-1.5 text-xs italic text-warning">
              Bez obrazloženja — težina se posle šest meseci menja nasumično.
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <div className="font-mono text-sm font-semibold tabular-nums text-foreground">
              {rule.weight}
            </div>
            <div className="text-micro text-text-muted">težina</div>
          </div>
          <Switch
            checked={rule.isActive}
            onCheckedChange={onToggle}
            aria-label={
              rule.isActive
                ? `Isključi pravilo ${rule.name}`
                : `Uključi pravilo ${rule.name}`
            }
          />
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-end gap-1 border-t border-line-soft pt-2">
        <Button
          size="xs"
          variant="ghost"
          className="gap-1 text-text-muted hover:text-foreground"
          onClick={onEdit}
        >
          <Pencil className="size-3" />
          <span>Izmeni</span>
        </Button>
        <Button
          size="xs"
          variant="ghost"
          className="gap-1 text-text-muted hover:text-danger"
          onClick={onDelete}
        >
          <Trash2 className="size-3" />
          <span>Obriši</span>
        </Button>
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Dodavanje / izmena                                                          */
/* -------------------------------------------------------------------------- */

function RuleFormDialog({
  workspaceId,
  initial,
  defaultAxis,
  onClose,
  onSaved,
}: {
  workspaceId: Id<"workspaces">;
  initial?: RuleDoc;
  defaultAxis?: Axis;
  onClose: () => void;
  onSaved: (mode: "new" | "edit") => void;
}) {
  const isEditing = !!initial;
  const upsert = useMutation(api.leadScoringStore.upsertIcpRule);

  const [name, setName] = useState(initial?.name ?? "");
  const [axis, setAxis] = useState<Axis>(initial?.axis ?? defaultAxis ?? "fit");
  const [signalKind, setSignalKind] = useState<LeadSignalKind>(
    (initial?.signalKind as LeadSignalKind) ?? "nema_sajt",
  );
  const [weight, setWeight] = useState<string>(
    initial ? String(initial.weight) : "20",
  );
  const [rationale, setRationale] = useState(initial?.rationale ?? "");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Unesi naziv pravila.");
      return;
    }
    const weightNum = Number(weight);
    if (!Number.isFinite(weightNum) || weightNum <= 0) {
      setError("Težina mora biti broj veći od nule.");
      return;
    }
    // Šema drži obrazloženje opciono; ekran ga traži namerno: težina bez
    // objašnjenja se posle šest meseci menja nasumično jer niko ne zna zašto
    // je postavljena.
    const trimmedRationale = rationale.trim();
    if (!trimmedRationale) {
      setError("Upiši obrazloženje — zašto baš ova težina.");
      return;
    }

    setSubmitting(true);
    try {
      await upsert({
        workspaceId,
        ruleId: initial?._id,
        name: trimmedName,
        axis,
        signalKind,
        weight: weightNum,
        rationale: trimmedRationale,
        isActive: initial?.isActive ?? true,
      });
      onSaved(isEditing ? "edit" : "new");
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Čuvanje pravila nije uspelo.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPopup className="max-w-lg sm:max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Izmeni pravilo" : "Novo pravilo ocenjivanja"}
            </DialogTitle>
            <DialogDescription>
              Pravilo dodaje svoju težinu na osu kada firma ima odgovarajući
              signal.
            </DialogDescription>
          </DialogHeader>

          {error && <FeedbackNote tone="danger" title={error} />}

          <div className="space-y-3.5">
            <div>
              <Label htmlFor="rule-name" className="mb-1.5 block text-xs font-medium text-text-muted">
                Naziv pravila
              </Label>
              <Input
                id="rule-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="npr. Nema sajt"
                disabled={submitting}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block text-xs font-medium text-text-muted">
                  Osa
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["fit", "intent"] as const).map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAxis(a)}
                      disabled={submitting}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                        axis === a
                          ? "border-accent-400 bg-accent-400/10 text-accent-400"
                          : "border-line bg-surface text-text-muted hover:text-foreground",
                      )}
                    >
                      {AXIS_META[a].label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="rule-weight" className="mb-1.5 block text-xs font-medium text-text-muted">
                  Težina
                </Label>
                <Input
                  id="rule-weight"
                  type="number"
                  min={1}
                  step={1}
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="font-mono tabular-nums"
                  disabled={submitting}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="rule-signal" className="mb-1.5 block text-xs font-medium text-text-muted">
                Tip signala
              </Label>
              <select
                id="rule-signal"
                value={signalKind}
                onChange={(e) => setSignalKind(e.target.value as LeadSignalKind)}
                disabled={submitting}
                className="h-8 w-full rounded-lg border border-line bg-surface px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
              >
                {LEAD_SIGNAL_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {leadSignalLabel(kind)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="rule-rationale" className="mb-1.5 block text-xs font-medium text-text-muted">
                Obrazloženje težine
              </Label>
              <Textarea
                id="rule-rationale"
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder="Zašto baš ova težina — jedna rečenica koja će imati smisla i za šest meseci."
                disabled={submitting}
                className="min-h-20 text-sm"
              />
              <p className="mt-1 text-micro text-text-muted">
                Obavezno. Broj bez objašnjenja se kasnije menja nasumično.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 border-t border-line pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={submitting}
            >
              Otkaži
            </Button>
            <Button type="submit" size="sm" className="font-semibold" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  <span>Čuvanje…</span>
                </>
              ) : isEditing ? (
                "Sačuvaj izmene"
              ) : (
                "Dodaj pravilo"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Brisanje uz potvrdu                                                         */
/* -------------------------------------------------------------------------- */

function DeleteRuleDialog({
  workspaceId,
  rule,
  onClose,
  onDeleted,
}: {
  workspaceId: Id<"workspaces">;
  rule: RuleDoc;
  onClose: () => void;
  onDeleted: (name: string) => void;
}) {
  const remove = useMutation(api.leadScoringStore.deleteIcpRule);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setSubmitting(true);
    setError(null);
    try {
      await remove({ workspaceId, ruleId: rule._id });
      onDeleted(rule.name);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Brisanje pravila nije uspelo.",
      );
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPopup className="max-w-md sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Obriši pravilo?</DialogTitle>
          <DialogDescription>
            Pravilo{" "}
            <span className="font-medium text-foreground">„{rule.name}”</span>{" "}
            ({AXIS_META[rule.axis].label}, težina {rule.weight}) trajno se uklanja.
            Ocene koje su ga uračunavale odmah se preračunavaju.
          </DialogDescription>
        </DialogHeader>

        {error && <FeedbackNote tone="danger" title={error} className="mt-2" />}

        <DialogFooter className="gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            Otkaži
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="gap-1.5 font-semibold"
            onClick={handleDelete}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Brisanje…</span>
              </>
            ) : (
              <>
                <Trash2 className="size-3.5" />
                <span>Obriši pravilo</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Učitavanje                                                                  */
/* -------------------------------------------------------------------------- */

function ScoringSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-80 rounded-md" />
        <Skeleton className="h-7 w-28 rounded-lg" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {[0, 1].map((col) => (
          <div key={col} className="rounded-xl border border-line bg-card p-4">
            <div className="flex items-center justify-between border-b border-line-soft pb-3">
              <Skeleton className="h-9 w-40 rounded-lg" />
              <Skeleton className="h-9 w-16 rounded-lg" />
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
