"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatRuleSentence,
  type RuleAction,
  type RuleMetric,
  type RuleOperator,
  type RuleScope,
} from "@/lib/rule-sentence";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Shield,
  Clock,
  Eye,
  Sliders,
} from "lucide-react";

export interface RuleEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ruleToEdit?: {
    _id: Id<"rules">;
    name: string;
    scope: RuleScope;
    condition: {
      metric: RuleMetric;
      operator: RuleOperator;
      value: number;
      windowDays: number;
      minImpressions: number;
    };
    action: RuleAction;
    cooldownHours: number;
    enabled: boolean;
  } | null;
  onSaved?: () => void;
}

export function RuleEditorDialog({
  open,
  onOpenChange,
  ruleToEdit,
  onSaved,
}: RuleEditorDialogProps) {
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

  const [name, setName] = useState(ruleToEdit?.name ?? "");
  const [scope, setScope] = useState<RuleScope>(ruleToEdit?.scope ?? "campaign");
  const [metric, setMetric] = useState<RuleMetric>(
    ruleToEdit?.condition.metric ?? "cpa",
  );
  const [operator, setOperator] = useState<RuleOperator>(
    ruleToEdit?.condition.operator ?? "gt",
  );
  const [value, setValue] = useState<number>(ruleToEdit?.condition.value ?? 15);
  const [windowDays, setWindowDays] = useState<number>(
    ruleToEdit?.condition.windowDays ?? 3,
  );
  const [minImpressions, setMinImpressions] = useState<number>(
    ruleToEdit?.condition.minImpressions ?? 1000,
  );
  const [action, setAction] = useState<RuleAction>(
    ruleToEdit?.action ?? "pause_and_notify",
  );
  const [cooldownHours, setCooldownHours] = useState<number>(
    ruleToEdit?.cooldownHours ?? 24,
  );
  const [enabled, setEnabled] = useState<boolean>(
    ruleToEdit?.enabled ?? true,
  );

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const createRuleMutation = useMutation(api.rulesStore.createRule);
  const updateRuleMutation = useMutation(api.rulesStore.updateRule);

  // Live plain-language preview
  const livePreview = formatRuleSentence({
    scope,
    condition: {
      metric,
      operator,
      value: Number.isFinite(value) ? value : 0,
      windowDays: Number.isFinite(windowDays) ? windowDays : 1,
      minImpressions: Number.isFinite(minImpressions) ? minImpressions : 0,
    },
    action,
    cooldownHours: Number.isFinite(cooldownHours) ? cooldownHours : 24,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg("Unesite naziv pravila.");
      return;
    }
    if (value < 0 || isNaN(value)) {
      setErrorMsg("Vrednost praga mora biti validan nenegativan broj.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      if (isEditing && ruleToEdit) {
        await updateRuleMutation({
          ruleId: ruleToEdit._id,
          name: name.trim(),
          scope,
          condition: {
            metric,
            operator,
            value: Number(value),
            windowDays: Number(windowDays),
            minImpressions: Number(minImpressions),
          },
          action,
          cooldownHours: Number(cooldownHours),
          enabled,
        });
      } else {
        await createRuleMutation({
          name: name.trim(),
          scope,
          condition: {
            metric,
            operator,
            value: Number(value),
            windowDays: Number(windowDays),
            minImpressions: Number(minImpressions),
          },
          action,
          cooldownHours: Number(cooldownHours),
          enabled,
        });
      }

      onClose();
      if (onSaved) onSaved();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Greška pri čuvanju pravila.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-accent-400/10 border border-accent-400/20 text-accent-400">
                <Sliders className="size-4" />
              </div>
              <div>
                <DialogTitle>
                  {isEditing ? "Izmeni pravilo" : "Novo automatizovano pravilo"}
                </DialogTitle>
                <DialogDescription>
                  Definiši uslove nad ad metrikama i automatske akcije za zaštitu budžeta.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {errorMsg && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
              {errorMsg}
            </div>
          )}

          {/* Form Fields */}
          <div className="space-y-3.5 max-h-[60vh] overflow-y-auto pr-1">
            {/* Rule Name */}
            <div>
              <Label className="text-xs text-text-muted font-medium mb-1.5 block">
                Naziv pravila
              </Label>
              <Input
                placeholder="npr. CPA Guard (maksimalno €15 po konverziji)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-surface border-line"
                disabled={submitting}
              />
            </div>

            {/* Scope Selection */}
            <div>
              <Label className="text-xs text-text-muted font-medium mb-1.5 block">
                Nivo primene (Scope)
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "campaign", label: "Kampanje" },
                  { id: "adset", label: "Ad Setovi" },
                  { id: "account", label: "Ceo nalog" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setScope(item.id as RuleScope)}
                    className={cn(
                      "flex items-center justify-center py-2 px-3 rounded-lg border text-xs font-medium transition-all",
                      scope === item.id
                        ? "border-accent-400 bg-accent-400/10 text-accent-400 font-semibold"
                        : "border-line bg-surface text-text-muted hover:text-foreground hover:bg-surface-raised",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Condition: Metric, Operator, Threshold */}
            <div className="rounded-xl border border-line bg-surface/50 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Shield className="size-3.5 text-accent-400" />
                  <span>Uslov za aktiviranje</span>
                </span>
                <span className="text-[10px] font-mono text-text-muted">
                  adInsights prozor
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <Label className="text-[11px] text-text-muted block mb-1">
                    Metrika
                  </Label>
                  <select
                    value={metric}
                    onChange={(e) => setMetric(e.target.value as RuleMetric)}
                    className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-foreground focus:outline-hidden focus:border-accent-400 font-medium"
                    disabled={submitting}
                  >
                    <option value="cpa">CPA (€)</option>
                    <option value="spend">Potrošnja (€)</option>
                    <option value="ctr">CTR (%)</option>
                    <option value="cpc">CPC (€)</option>
                    <option value="roas">ROAS (x)</option>
                  </select>
                </div>

                <div>
                  <Label className="text-[11px] text-text-muted block mb-1">
                    Operator
                  </Label>
                  <select
                    value={operator}
                    onChange={(e) => setOperator(e.target.value as RuleOperator)}
                    className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-foreground focus:outline-hidden focus:border-accent-400 font-medium"
                    disabled={submitting}
                  >
                    <option value="gt">Veće od (&gt;)</option>
                    <option value="gte">Veće ili jednako (≥)</option>
                    <option value="lt">Manje od (&lt;)</option>
                    <option value="lte">Manje ili jednako (≤)</option>
                  </select>
                </div>

                <div>
                  <Label className="text-[11px] text-text-muted block mb-1">
                    Prag vrednosti
                  </Label>
                  <Input
                    type="number"
                    step="any"
                    min={0}
                    value={value}
                    onChange={(e) => setValue(parseFloat(e.target.value) || 0)}
                    className="bg-surface border-line text-xs font-mono h-8"
                    disabled={submitting}
                  />
                </div>
              </div>

              {/* Lookback Window & Noise Filter (Min Impressions) */}
              <div className="grid grid-cols-2 gap-2.5 pt-1 border-t border-line/60">
                <div>
                  <Label className="text-[11px] text-text-muted block mb-1">
                    Vremenski prozor
                  </Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={1}
                      max={90}
                      value={windowDays}
                      onChange={(e) =>
                        setWindowDays(parseInt(e.target.value, 10) || 1)
                      }
                      className="bg-surface border-line text-xs font-mono h-8 w-20"
                      disabled={submitting}
                    />
                    <span className="text-xs text-text-muted">dana</span>
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] text-text-muted block mb-1">
                    Min. impresija (šum)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    step={100}
                    value={minImpressions}
                    onChange={(e) =>
                      setMinImpressions(parseInt(e.target.value, 10) || 0)
                    }
                    className="bg-surface border-line text-xs font-mono h-8"
                    disabled={submitting}
                  />
                </div>
              </div>
            </div>

            {/* Action Selection */}
            <div>
              <Label className="text-xs text-text-muted font-medium mb-1.5 block">
                Akcija pri ispunjenju uslova
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    id: "pause_and_notify",
                    label: "Pauziraj i javi",
                    sub: "Pauza + Email",
                  },
                  {
                    id: "pause",
                    label: "Samo pauziraj",
                    sub: "Automatska pauza",
                  },
                  {
                    id: "notify",
                    label: "Samo javi",
                    sub: "Email alert",
                  },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setAction(item.id as RuleAction)}
                    className={cn(
                      "flex flex-col items-center justify-center p-2.5 rounded-lg border text-center transition-all",
                      action === item.id
                        ? "border-accent-400 bg-accent-400/10 text-accent-400"
                        : "border-line bg-surface text-text-muted hover:text-foreground hover:bg-surface-raised",
                    )}
                  >
                    <span className="text-xs font-semibold">{item.label}</span>
                    <span className="text-[10px] text-text-muted mt-0.5">
                      {item.sub}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Cooldown & Enabled toggle */}
            <div className="grid grid-cols-2 gap-3 items-center pt-1">
              <div>
                <Label className="text-xs text-text-muted font-medium mb-1 flex items-center gap-1">
                  <Clock className="size-3 text-text-muted" />
                  <span>Period mirovanja</span>
                </Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={1}
                    max={720}
                    value={cooldownHours}
                    onChange={(e) =>
                      setCooldownHours(parseInt(e.target.value, 10) || 1)
                    }
                    className="bg-surface border-line text-xs font-mono h-8 w-24"
                    disabled={submitting}
                  />
                  <span className="text-xs text-text-muted">sati</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setEnabled(!enabled)}
                  className={cn(
                    "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                    enabled
                      ? "border-success/40 bg-success/10 text-success"
                      : "border-line bg-surface text-text-muted",
                  )}
                >
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      enabled ? "bg-success" : "bg-text-muted/40",
                    )}
                  />
                  <span>{enabled ? "Pravilo je aktivno" : "Pravilo je pauzirano"}</span>
                </button>
              </div>
            </div>

            {/* Plain-Language Preview Sentence */}
            <div className="rounded-xl border border-accent-400/30 bg-accent-400/5 p-3.5 mt-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-accent-400 uppercase tracking-wider mb-1.5">
                <Eye className="size-3.5" />
                <span>Pregled pravila prirodnim jezikom</span>
              </div>
              <p className="text-xs sm:text-sm font-medium text-foreground leading-relaxed">
                „{livePreview}”
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-line">
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
              type="submit"
              size="sm"
              className="bg-accent-400 text-surface-dark font-semibold hover:bg-accent-400/90"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  <span>Čuvanje...</span>
                </>
              ) : isEditing ? (
                "Sačuvaj izmene"
              ) : (
                "Kreiraj pravilo"
              )}
            </Button>
          </DialogFooter>
        </form>
  );
}
