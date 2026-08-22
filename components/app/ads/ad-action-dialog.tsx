"use client";

import { useState, useMemo } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ConvexError } from "convex/values";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMetric } from "@/convex/lib/metaAdsFormat";
import { resolveMetric } from "@/convex/lib/metaAdsCatalog";
import { cn } from "@/lib/utils";

const spendDef = resolveMetric("spend")!;

export const BUDGET_MIN = 5;
export const BUDGET_MAX = 5000;
export const BUDGET_LIMIT_CURRENCY = "EUR";
import {
  AlertTriangle,
  Flame,
  Loader2,
  Pause,
  Play,
  Copy,
  TrendingUp,
  ShieldAlert,
  Info,
} from "lucide-react";

export type AdActionType = "pause" | "resume" | "budget_change" | "duplicate";
export type AdTargetType = "campaign" | "adset" | "ad";

export interface AdActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionType: AdActionType;
  targetType: AdTargetType;
  targetId: string; // externalId
  targetName: string;
  currentStatus?: string;
  currentDailyBudget?: number;
  spendToday?: number;
  onOptimisticUpdate?: (optimisticData: {
    status?: string;
    dailyBudget?: number;
  }) => void;
  onRollback?: () => void;
  onSuccess?: (result: unknown) => void;
}

const TARGET_TYPE_LABELS: Record<AdTargetType, string> = {
  campaign: "Kampanja",
  adset: "Ad Set",
  ad: "Oglas",
};

export function AdActionDialog(props: AdActionDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <AdActionDialogInner {...props} />}
    </Dialog>
  );
}

function AdActionDialogInner({
  onOpenChange,
  actionType,
  targetType,
  targetId,
  targetName,
  currentStatus = "ACTIVE",
  currentDailyBudget,
  spendToday = 0,
  onOptimisticUpdate,
  onRollback,
  onSuccess,
}: AdActionDialogProps) {
  // Live target context from database
  const liveContext = useQuery(api.adActionsStore.getTargetContext, {
    targetType,
    targetId,
  });

  const effectiveName = liveContext?.name || targetName;
  const effectiveStatus = liveContext?.status || currentStatus;
  const effectiveDailyBudget =
    liveContext?.dailyBudget ?? currentDailyBudget;
  const effectiveSpendToday =
    liveContext?.spendToday ?? spendToday;

  const accountCurrency = liveContext?.currency || undefined;

  // Form states initialized on mount
  const [newBudgetStr, setNewBudgetStr] = useState<string>(() => {
    if (actionType === "budget_change") {
      return effectiveDailyBudget !== undefined && effectiveDailyBudget > 0
        ? String(effectiveDailyBudget)
        : "20";
    }
    return "";
  });

  const [duplicateName, setDuplicateName] = useState<string>(() => {
    if (actionType === "duplicate") {
      return `${effectiveName} (Kopija)`;
    }
    return "";
  });

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Actions
  const pauseResumeAction = useAction(api.adActions.pauseResume);
  const changeBudgetAction = useAction(api.adActions.changeBudget);
  const duplicateAdAction = useAction(api.adActions.duplicateAd);

  // Budget calculations and guardrails
  const newBudgetNum = parseFloat(newBudgetStr);
  const isBudgetValidNum = !isNaN(newBudgetNum) && newBudgetNum > 0;

  const budgetGuardrails = useMemo(() => {
    if (actionType !== "budget_change") return null;

    const minBudget = BUDGET_MIN;
    const maxBudget = BUDGET_MAX;

    // Nepoznata valuta i nepoznat trenutni budzet oboje znace da ogradu nije
    // moguce izracunati. Nijedno se ne sme popuniti pretpostavkom — ovde se
    // menja iznos koji se stvarno trosi.
    if (!accountCurrency || !accountCurrency.trim()) {
      return {
        valid: false,
        percentChange: 0,
        minAllowed: undefined,
        maxAllowed: undefined,
        minBudget,
        maxBudget,
        error:
          "Valuta naloga nije poznata, pa granice budžeta ne mogu da se provere. Pokreni sinhronizaciju naloga pa pokušaj ponovo.",
      };
    }

    if (accountCurrency.trim().toUpperCase() !== BUDGET_LIMIT_CURRENCY.toUpperCase()) {
      return {
        valid: false,
        percentChange: 0,
        minAllowed: undefined,
        maxAllowed: undefined,
        minBudget,
        maxBudget,
        error: `Granica budzeta je zadata u ${BUDGET_LIMIT_CURRENCY}, a nalog radi u ${accountCurrency}. Podesi granicu u valuti naloga pre nego sto menjas budzet.`,
      };
    }

    if (effectiveDailyBudget === undefined || effectiveDailyBudget <= 0) {
      return {
        valid: false,
        percentChange: 0,
        minAllowed: undefined,
        maxAllowed: undefined,
        minBudget,
        maxBudget,
        error:
          "Trenutni dnevni budžet nije poznat, pa ograda od ±50% ne može da se izračuna. Pokreni sinhronizaciju naloga pa pokušaj ponovo.",
      };
    }

    const current = effectiveDailyBudget;
    const minAllowed50 = Math.round(current * 0.5 * 100) / 100;
    const maxAllowed50 = Math.round(current * 1.5 * 100) / 100;

    if (!isBudgetValidNum) {
      return {
        valid: false,
        percentChange: 0,
        minAllowed: minAllowed50,
        maxAllowed: maxAllowed50,
        minBudget,
        maxBudget,
        error: "Unesite validan iznos budžeta veći od 0.",
      };
    }

    const percentChange = Math.round(
      ((newBudgetNum - current) / current) * 100,
    );

    if (newBudgetNum < minBudget) {
      return {
        valid: false,
        percentChange,
        minAllowed: minAllowed50,
        maxAllowed: maxAllowed50,
        minBudget,
        maxBudget,
        error: `Iznos mora biti najmanje ${formatMetric(minBudget, spendDef, BUDGET_LIMIT_CURRENCY)} (BUDGET_MIN).`,
      };
    }

    if (newBudgetNum > maxBudget) {
      return {
        valid: false,
        percentChange,
        minAllowed: minAllowed50,
        maxAllowed: maxAllowed50,
        minBudget,
        maxBudget,
        error: `Iznos ne sme prelaziti ${formatMetric(maxBudget, spendDef, BUDGET_LIMIT_CURRENCY)} (BUDGET_MAX).`,
      };
    }

    if (newBudgetNum < minAllowed50 || newBudgetNum > maxAllowed50) {
      return {
        valid: false,
        percentChange,
        minAllowed: minAllowed50,
        maxAllowed: maxAllowed50,
        minBudget,
        maxBudget,
        error: `Promena prelazi limit od ±50% (${formatMetric(minAllowed50, spendDef, accountCurrency)} – ${formatMetric(maxAllowed50, spendDef, accountCurrency)}).`,
      };
    }

    return {
      valid: true,
      percentChange,
      minAllowed: minAllowed50,
      maxAllowed: maxAllowed50,
      minBudget,
      maxBudget,
      error: null,
    };
  }, [actionType, newBudgetNum, isBudgetValidNum, effectiveDailyBudget, accountCurrency]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setErrorMessage(null);

    // Guardrail pre-check
    if (actionType === "budget_change" && budgetGuardrails && !budgetGuardrails.valid) {
      setErrorMessage(budgetGuardrails.error);
      return;
    }

    setLoading(true);

    try {
      if (actionType === "pause" || actionType === "resume") {
        const nextStatus = actionType === "pause" ? "PAUSED" : "ACTIVE";
        onOptimisticUpdate?.({ status: nextStatus });

        const res = await pauseResumeAction({
          targetType,
          targetId,
          desiredStatus: nextStatus,
        });
        onSuccess?.(res);
        onOpenChange(false);
      } else if (actionType === "budget_change") {
        onOptimisticUpdate?.({ dailyBudget: newBudgetNum });

        const res = await changeBudgetAction({
          targetType: targetType as "campaign" | "adset",
          targetId,
          newDailyBudget: newBudgetNum,
        });
        onSuccess?.(res);
        onOpenChange(false);
      } else if (actionType === "duplicate") {
        const res = await duplicateAdAction({
          adId: targetId,
          newName: duplicateName.trim() || undefined,
        });
        onSuccess?.(res);
        onOpenChange(false);
      }
    } catch (err: unknown) {
      onRollback?.();
      if (err instanceof ConvexError) {
        const data = err.data as { code?: string; message?: string; details?: string };
        setErrorMessage(data?.message || err.message);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("Došlo je do neočekivane greške.");
      }
    } finally {
      setLoading(false);
    }
  };

  const getDialogIcon = () => {
    switch (actionType) {
      case "pause":
        return <Pause className="size-5 text-warning" />;
      case "resume":
        return <Play className="size-5 text-success" />;
      case "budget_change":
        return <TrendingUp className="size-5 text-accent-400" />;
      case "duplicate":
        return <Copy className="size-5 text-accent-400" />;
    }
  };

  const getDialogTitle = () => {
    switch (actionType) {
      case "pause":
        return `Pauziraj ${TARGET_TYPE_LABELS[targetType]}`;
      case "resume":
        return `Aktiviraj ${TARGET_TYPE_LABELS[targetType]}`;
      case "budget_change":
        return `Promeni dnevni budžet (${TARGET_TYPE_LABELS[targetType]})`;
      case "duplicate":
        return "Dupliraj oglas (Nova Hook iteracija)";
    }
  };

  return (
    <DialogPopup className="sm:max-w-md">
      <DialogHeader>
        <div className="flex items-center gap-2.5">
          <div className="rounded-md border border-line bg-surface p-2">
            {getDialogIcon()}
          </div>
          <div>
            <DialogTitle>{getDialogTitle()}</DialogTitle>
            <DialogDescription>
              Sigurnosne provere su aktivne za ovu akciju.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
        {/* Target Meta Context Banner */}
        <div className="rounded-lg border border-line bg-surface/60 p-3 text-xs space-y-1.5 font-sans">
          <div className="flex items-center justify-between">
            <span className="text-text-muted">Meta Naziv:</span>
            <span className="font-semibold text-foreground truncate max-w-[220px]" title={effectiveName}>
              {effectiveName}
            </span>
          </div>

          <div className="flex items-center justify-between text-text-muted">
            <span>Trenutni status:</span>
            <span className="inline-flex items-center gap-1.5 font-mono text-foreground">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  effectiveStatus === "ACTIVE" ? "bg-success" : "bg-text-muted",
                )}
              />
              {effectiveStatus}
            </span>
          </div>

          {effectiveDailyBudget !== undefined && (
            <div className="flex items-center justify-between text-text-muted">
              <span>Trenutni dnevni budžet:</span>
              <span className="font-mono text-foreground font-medium">
                {formatMetric(effectiveDailyBudget, spendDef, accountCurrency)} / dan
              </span>
            </div>
          )}

          <div className="flex items-center justify-between text-text-muted border-t border-line-soft pt-1.5 mt-0.5">
            <span className="flex items-center gap-1">
              <Flame className="size-3 text-warning" />
              <span>Potrošnja danas:</span>
            </span>
            <span className="font-mono font-bold text-warning tabular-nums">
              {formatMetric(effectiveSpendToday, spendDef, accountCurrency)}
            </span>
          </div>
        </div>

        {/* Form Content: Pause / Resume confirmation */}
        {(actionType === "pause" || actionType === "resume") && (
          <div className="rounded-lg border border-line-soft bg-surface-raised/40 p-3 text-xs leading-relaxed text-foreground">
            {actionType === "pause" ? (
              <p>
                Ova akcija će odmah <strong>pauzirati</strong> prikazivanje ovog{" "}
                {TARGET_TYPE_LABELS[targetType].toLowerCase()} na Meta platformi.
                Današnja potrošnja do ovog trenutka iznosi{" "}
                <strong className="text-warning">{formatMetric(effectiveSpendToday, spendDef, accountCurrency)}</strong>.
              </p>
            ) : (
              <p>
                Ova akcija će <strong>aktivirati</strong> prikazivanje ovog{" "}
                {TARGET_TYPE_LABELS[targetType].toLowerCase()} na Meta platformi.
              </p>
            )}
          </div>
        )}

        {/* Form Content: Budget Change */}
        {actionType === "budget_change" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-budget" className="text-xs text-text-muted">
                Novi dnevni budžet {accountCurrency ? `(${accountCurrency})` : ""}
              </Label>
              <div className="relative">
                {accountCurrency && (
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted font-mono text-xs">
                    {accountCurrency}
                  </span>
                )}
                <Input
                  id="new-budget"
                  type="number"
                  step="0.01"
                  min="1"
                  value={newBudgetStr}
                  onChange={(e) => setNewBudgetStr(e.target.value)}
                  className={cn("font-mono text-sm", accountCurrency ? "pl-14" : "pl-3")}
                  placeholder="20.00"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {/* Guardrails Feedback Box */}
            {budgetGuardrails && (
              <div
                className={cn(
                  "rounded-lg border p-3 flex flex-col gap-1 text-xs",
                  budgetGuardrails.valid
                    ? "border-accent-400/30 bg-accent-400/5 text-foreground"
                    : "border-danger/30 bg-danger/5 text-danger",
                )}
              >
                <div className="flex items-center justify-between font-mono">
                  <span className="text-text-muted">Procentualna promena:</span>
                  <span
                    className={cn(
                      "font-bold",
                      budgetGuardrails.percentChange > 0
                        ? "text-accent-400"
                        : budgetGuardrails.percentChange < 0
                          ? "text-warning"
                          : "text-foreground",
                    )}
                  >
                    {budgetGuardrails.percentChange > 0 ? "+" : ""}
                    {budgetGuardrails.percentChange}%
                  </span>
                </div>

                <div className="flex items-center justify-between text-micro text-text-muted">
                  <span>Dozvoljeni raspon (±50%):</span>
                  <span className="font-mono">
                    {formatMetric(budgetGuardrails.minAllowed, spendDef, accountCurrency)} – {formatMetric(budgetGuardrails.maxAllowed, spendDef, accountCurrency)}
                  </span>
                </div>

                {budgetGuardrails.error && (
                  <div className="flex items-center gap-1.5 text-danger font-medium mt-1 pt-1 border-t border-danger/20">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    <span>{budgetGuardrails.error}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Form Content: Duplicate Ad */}
        {actionType === "duplicate" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="duplicate-name" className="text-xs text-text-muted">
                Naziv novog oglasa
              </Label>
              <Input
                id="duplicate-name"
                type="text"
                value={duplicateName}
                onChange={(e) => setDuplicateName(e.target.value)}
                className="text-xs"
                placeholder="Kreativa Hook V2 (Kopija)"
                disabled={loading}
              />
            </div>

            <div className="rounded-lg border border-line-soft bg-surface-raised/40 p-3 flex items-start gap-2 text-xs text-text-muted">
              <Info className="size-4 text-accent-400 shrink-0 mt-0.5" />
              <p>
                Duplirani oglas se automatski kreira u statusu{" "}
                <strong className="text-foreground">PAUSED (Pauzirano)</strong>{" "}
                kako bi se sprečila neželjena potrošnja pre finalnog pregleda.
              </p>
            </div>
          </div>
        )}

        {/* Error Message Alert */}
        {errorMessage && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 flex items-start gap-2 text-xs text-danger">
            <ShieldAlert className="size-4 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold">Greška pri izvršavanju</span>
              <span className="leading-normal">{errorMessage}</span>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <DialogClose render={<Button variant="outline" size="sm" type="button" disabled={loading} />}>
            Otkaži
          </DialogClose>

          <Button
            type="submit"
            size="sm"
            disabled={
              loading ||
              (actionType === "budget_change" && !budgetGuardrails?.valid)
            }
            className={cn(
              "font-medium",
              actionType === "pause"
                ? "bg-danger text-text-inverse hover:bg-danger/90"
                : actionType === "resume"
                  ? "bg-success text-text-inverse hover:bg-success/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/80",
            )}
          >
            {loading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Izvršavam na Meta API...</span>
              </>
            ) : (
              <>
                {actionType === "pause" && "Potvrdi pauziranje"}
                {actionType === "resume" && "Potvrdi aktivaciju"}
                {actionType === "budget_change" && "Potvrdi promenu budžeta"}
                {actionType === "duplicate" && "Dupliraj oglas"}
              </>
            )}
          </Button>
        </DialogFooter>
      </form>
    </DialogPopup>
  );
}
