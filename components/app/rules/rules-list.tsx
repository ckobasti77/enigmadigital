"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatRuleSentence } from "@/lib/rule-sentence";
import { cn } from "@/lib/utils";
import {
  ShieldAlert,
  Edit2,
  Trash2,
  Clock,
  Sparkles,
  Mail,
  Pause,
} from "lucide-react";

export interface RulesListProps {
  rules: Doc<"rules">[];
  onEditRule: (rule: Doc<"rules">) => void;
  onEnsureTemplates: () => void;
}

export function RulesList({
  rules,
  onEditRule,
  onEnsureTemplates,
}: RulesListProps) {
  const toggleRuleMutation = useMutation(api.rulesStore.toggleRule);
  const deleteRuleMutation = useMutation(api.rulesStore.deleteRule);

  const [deletingId, setDeletingId] = useState<Id<"rules"> | null>(null);

  const handleToggle = async (ruleId: Id<"rules">, currentEnabled: boolean) => {
    try {
      await toggleRuleMutation({
        ruleId,
        enabled: !currentEnabled,
      });
    } catch (err) {
      console.error("Failed to toggle rule:", err);
    }
  };

  const handleDelete = async (ruleId: Id<"rules">) => {
    if (confirm("Da li ste sigurni da želite da obrišete ovo pravilo?")) {
      setDeletingId(ruleId);
      try {
        await deleteRuleMutation({ ruleId });
      } catch (err) {
        console.error("Failed to delete rule:", err);
      } finally {
        setDeletingId(null);
      }
    }
  };

  if (rules.length === 0) {
    return (
      <Card className="p-8 text-center bg-card border-line border-dashed">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-accent-400/10 text-accent-400 mb-4">
          <ShieldAlert className="size-6" />
        </div>
        <h3 className="text-base font-bold text-foreground">
          Nema kreiranih pravila
        </h3>
        <p className="text-xs text-text-muted mt-1 max-w-sm mx-auto">
          Automatizuj praćenje CPA, potrošnje i konverzija pomoću predefinisanih šablona ili kreiraj novo pravilo.
        </p>
        <div className="mt-5">
          <Button
            type="button"
            size="sm"
            onClick={onEnsureTemplates}
            className="bg-accent-400 text-surface-dark hover:bg-accent-400/90 font-semibold inline-flex items-center gap-1.5"
          >
            <Sparkles className="size-4" />
            <span>Učitaj šablone (CPA & Spend Guard)</span>
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {rules.map((rule) => {
        const sentence = formatRuleSentence({
          scope: rule.scope,
          condition: rule.condition,
          action: rule.action,
          cooldownHours: rule.cooldownHours,
        });

        const lastFiredText = rule.lastFiredAt
          ? `Zadnje aktiviranje: ${new Date(rule.lastFiredAt).toLocaleString("sr-RS", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}`
          : "Nije još aktivirano";

        return (
          <Card
            key={rule._id}
            className={cn(
              "p-5 bg-card border-line shadow-card transition-all duration-150 relative overflow-hidden",
              !rule.enabled && "opacity-75 bg-surface/40",
            )}
          >
            {/* Top Row: Title, Scope, Action Badge, Toggle Switch */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-foreground">
                    {rule.name}
                  </h3>

                  {/* Scope Badge */}
                  <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] font-mono text-text-muted border border-line">
                    {rule.scope === "campaign"
                      ? "Kampanje"
                      : rule.scope === "adset"
                        ? "Ad Setovi"
                        : "Ceo nalog"}
                  </span>

                  {/* Action Badge */}
                  {rule.action === "pause_and_notify" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 border border-warning/30 px-2 py-0.5 text-[10px] font-semibold text-warning">
                      <Pause className="size-2.5" />
                      <span>Pauziraj i javi</span>
                    </span>
                  ) : rule.action === "pause" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 border border-warning/30 px-2 py-0.5 text-[10px] font-semibold text-warning">
                      <Pause className="size-2.5" />
                      <span>Samo pauziraj</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent-400/10 border border-accent-400/30 px-2 py-0.5 text-[10px] font-semibold text-accent-400">
                      <Mail className="size-2.5" />
                      <span>Samo javi</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-[11px] text-text-muted">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    <span>Cooldown: {rule.cooldownHours}h</span>
                  </span>
                  <span>•</span>
                  <span>{lastFiredText}</span>
                </div>
              </div>

              {/* Toggle Switch + Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggle(rule._id, rule.enabled)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer",
                    rule.enabled
                      ? "border-success/40 bg-success/15 text-success hover:bg-success/20"
                      : "border-line bg-surface text-text-muted hover:text-foreground hover:bg-surface-raised",
                  )}
                >
                  <span
                    className={cn(
                      "size-2 rounded-full transition-colors",
                      rule.enabled ? "bg-success" : "bg-text-muted/40",
                    )}
                  />
                  <span>{rule.enabled ? "Aktivno" : "Isključeno"}</span>
                </button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onEditRule(rule)}
                  className="h-7 px-2.5 text-xs text-text-muted hover:text-foreground border-line"
                >
                  <Edit2 className="size-3 mr-1" />
                  <span>Izmeni</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(rule._id)}
                  disabled={deletingId === rule._id}
                  className="h-7 px-2 text-xs text-danger/80 hover:text-danger hover:bg-danger/10 border-line"
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </div>

            {/* Plain-Language Rule Preview Sentence Banner */}
            <div className="mt-3 rounded-lg border border-line bg-surface/60 px-3.5 py-2.5 text-xs text-foreground font-medium flex items-center gap-2">
              <span className="text-accent-400 font-semibold text-[11px] uppercase tracking-wider shrink-0">
                Pravilo:
              </span>
              <p className="leading-relaxed">„{sentence}”</p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
