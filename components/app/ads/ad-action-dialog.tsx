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
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
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

    const minEur = 5;
    const maxEur = 5000;
    const current = effectiveDailyBudget ?? 20;
    const minAllowed50 = Math.round(current * 0.5 * 100) / 100;
    const maxAllowed50 = Math.round(current * 1.5 * 100) / 100;

    if (!isBudgetValidNum) {
      return {
        valid: false,
        percentChange: 0,
        minAllowed: minAllowed50,
        maxAllowed: maxAllowed50,
        minEur,
        maxEur,
        error: "Unesite validan iznos budžeta veći od 0 €.",
      };
    }

    const percentChange = Math.round(
      ((newBudgetNum - current) / current) * 100,
    );

    if (newBudgetNum < minEur) {
      return {
        valid: false,
        percentChange,
        minAllowed: minAllowed50,
        maxAllowed: maxAllowed50,
        minEur,
        maxEur,
        error: `Iznos mora biti najmanje ${minEur} € (BUDGET_MIN_EUR).`,
      };
    }

    if (newBudgetNum > maxEur) {
      return {
        valid: false,
        percentChange,
        minAllowed: minAllowed50,
        maxAllowed: maxAllowed50,
        minEur,
        maxEur,
        error: `Iznos ne sme prelaziti ${maxEur} € (BUDGET_MAX_EUR).`,
      };
    }

    if (newBudgetNum < minAllowed50 || newBudgetNum > maxAllowed50) {
      return {
        valid: false,
        percentChange,
        minAllowed: minAllowed50,
        maxAllowed: maxAllowed50,
        minEur,
        maxEur,
        error: `Promena prelazi limit od ±50% (${minAllowed50} € – ${maxAllowed50} €).`,
      };
    }

    return {
      valid: true,
      percentChange,
      minAllowed: minAllowed50,
      maxAllowed: maxAllowed50,
      minEur,
      maxEur,
      error: null,
    };
  }, [actionType, newBudgetNum, isBudgetValidNum, effectiveDailyBudget]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    try {
      if (actionType === "pause" || actionType === "resume") {
        const nextStatus = actionType === "pause" ? "PAUSED" : "ACTIVE";
        // Optimistic update
        onOptimisticUpdate?.({ status: nextStatus });

        const result = await pauseResumeAction({
          targetType,
          targetId,
          desiredStatus: nextStatus,
        });

        onSuccess?.(result);
        onOpenChange(false);
      } else if (actionType === "budget_change") {
        if (!budgetGuardrails || !budgetGuardrails.valid) {
          throw new Error(
            budgetGuardrails?.error || "Neispravan iznos budžeta.",
          );
        }

        // Optimistic update
        onOptimisticUpdate?.({ dailyBudget: newBudgetNum });

        const result = await changeBudgetAction({
          targetType: targetType as "campaign" | "adset",
          targetId,
          newDailyBudget: newBudgetNum,
        });

        onSuccess?.(result);
        onOpenChange(false);
      } else if (actionType === "duplicate") {
        const cleanName = duplicateName.trim() || undefined;

        const result = await duplicateAdAction({
          adId: targetId,
          newName: cleanName,
        });

        onSuccess?.(result);
        onOpenChange(false);
      }
    } catch (err: unknown) {
      console.error("Greška pri izvršavanju akcije:", err);
      // Rollback optimistic update
      onRollback?.();

      let friendlyMsg = "Došlo je do greške pri izvršavanju akcije.";
      if (err instanceof ConvexError) {
        const data = err.data as { message?: string; code?: string } | undefined;
        if (data?.message) {
          friendlyMsg = data.message;
        }
      } else if (err instanceof Error && err.message) {
        friendlyMsg = err.message;
      }
      setErrorMessage(friendlyMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DialogPopup className="sm:max-w-md">
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            {actionType === "pause" && (
              <span className="flex size-7 items-center justify-center rounded-lg bg-danger/10 text-danger border border-danger/20">
                <Pause className="size-4" />
              </span>
            )}
            {actionType === "resume" && (
              <span className="flex size-7 items-center justify-center rounded-lg bg-success/10 text-success border border-success/20">
                <Play className="size-4" />
              </span>
            )}
            {actionType === "budget_change" && (
              <span className="flex size-7 items-center justify-center rounded-lg bg-accent-400/10 text-accent-400 border border-accent-400/20">
                <TrendingUp className="size-4" />
              </span>
            )}
            {actionType === "duplicate" && (
              <span className="flex size-7 items-center justify-center rounded-lg bg-surface-raised text-foreground border border-line">
                <Copy className="size-4" />
              </span>
            )}

            <div>
              <DialogTitle>
                {actionType === "pause" && "Pauziranje"}
                {actionType === "resume" && "Aktivacija"}
                {actionType === "budget_change" && "Promena budžeta"}
                {actionType === "duplicate" && "Dupliranje oglasa"}
                {" · "}
                <span className="text-accent-400">{TARGET_TYPE_LABELS[targetType]}</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-text-muted mt-0.5">
                {effectiveName}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4 text-xs">
          {/* Target Info Card & Live Spend Context */}
          <div className="rounded-lg border border-line bg-surface/50 p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between text-text-muted">
              <span>Ciljni objekat:</span>
              <span className="font-mono text-foreground font-medium truncate max-w-xs">
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
                  {formatNumber(effectiveDailyBudget)} € / dan
                </span>
              </div>
            )}

            <div className="flex items-center justify-between text-text-muted border-t border-line-soft pt-1.5 mt-0.5">
              <span className="flex items-center gap-1">
                <Flame className="size-3 text-warning" />
                <span>Potrošnja danas:</span>
              </span>
              <span className="font-mono font-bold text-warning tabular-nums">
                {formatNumber(effectiveSpendToday)} €
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
                  <strong className="text-warning">{formatNumber(effectiveSpendToday)} €</strong>.
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
                  Novi dnevni budžet (€)
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted font-mono">
                    €
                  </span>
                  <Input
                    id="new-budget"
                    type="number"
                    step="0.01"
                    min="1"
                    value={newBudgetStr}
                    onChange={(e) => setNewBudgetStr(e.target.value)}
                    className="pl-8 font-mono text-sm"
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

                  <div className="flex items-center justify-between text-[11px] text-text-muted">
                    <span>Dozvoljeni raspon (±50%):</span>
                    <span className="font-mono">
                      {budgetGuardrails.minAllowed} € – {budgetGuardrails.maxAllowed} €
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
        </div>

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
                ? "bg-danger text-danger-foreground hover:bg-danger/90"
                : actionType === "resume"
                  ? "bg-success text-success-foreground hover:bg-success/90"
                  : "bg-accent-400 text-slate-950 hover:bg-accent-300",
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
