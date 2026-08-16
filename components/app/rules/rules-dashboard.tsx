"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Reveal } from "@/components/motion/reveal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RulesList } from "./rules-list";
import { RuleFiringsTable } from "./rule-firings-table";
import { RuleEditorDialog } from "./rule-editor-dialog";
import { cn } from "@/lib/utils";
import {
  ShieldAlert,
  Plus,
  Play,
  History,
  Loader2,
  Clock,
  Zap,
} from "lucide-react";

export function RulesDashboard() {
  const [activeTab, setActiveTab] = useState<"rules" | "firings">("rules");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Doc<"rules"> | null>(null);

  const [evaluating, setEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<string | null>(null);

  const rules = useQuery(api.rulesStore.listRules, {});
  const firings = useQuery(api.rulesStore.listRuleFirings, { limit: 100 });
  const ensureTemplateRules = useMutation(api.rulesStore.ensureTemplateRules);
  const manualEvaluate = useAction(api.rules.manualEvaluateRules);

  // Auto-seed template rules if empty on initial load
  useEffect(() => {
    if (rules !== undefined && rules.length === 0) {
      ensureTemplateRules({}).catch(console.error);
    }
  }, [rules, ensureTemplateRules]);

  const handleOpenNew = () => {
    setEditingRule(null);
    setEditorOpen(true);
  };

  const handleEditRule = (rule: Doc<"rules">) => {
    setEditingRule(rule);
    setEditorOpen(true);
  };

  const handleTriggerEvaluation = async () => {
    setEvaluating(true);
    setEvalResult(null);
    try {
      const res = await manualEvaluate({});
      setEvalResult(
        `Evaluacija završena: Provereno ${res.totalTargetsChecked} objekata za ${res.evaluatedRulesCount} pravila. Zapisano okidanja: ${res.firingsCount}.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Greška pri proveri pravila.";
      setEvalResult(`Greška: ${msg}`);
    } finally {
      setEvaluating(false);
    }
  };

  if (rules === undefined || firings === undefined) {
    return <RulesDashboardSkeleton />;
  }

  const activeCount = rules.filter((r) => r.enabled).length;
  const totalFiringsCount = firings.length;

  return (
    <div className="flex flex-1 flex-col gap-6">
      {/* Header Bar with Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="heading-caps text-xs font-medium text-text-muted">
            Automatizacija & Zaštita
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Pravila & Zaštita Budžeta
          </h1>
          <p className="mt-1 max-w-xl text-xs sm:text-sm text-text-muted">
            Automatski evaluator proverava performanse oglasa svakih 30 minuta i reaguje u slučaju skoka CPA ili potrošnje.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTriggerEvaluation}
            disabled={evaluating}
            className="border-line text-xs font-medium hover:border-accent-400/50 hover:bg-surface-raised"
          >
            {evaluating ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin text-accent-400" />
                <span>Proveravam...</span>
              </>
            ) : (
              <>
                <Play className="mr-1.5 size-3.5 text-accent-400 fill-accent-400" />
                <span>Pokreni proveru sad</span>
              </>
            )}
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleOpenNew}
            className="bg-accent-400 text-surface-dark hover:bg-accent-400/90 font-semibold text-xs inline-flex items-center gap-1.5"
          >
            <Plus className="size-4" />
            <span>Novo pravilo</span>
          </Button>
        </div>
      </div>

      {/* Manual Trigger Result Alert (if triggered) */}
      {evalResult && (
        <Reveal>
          <div className="rounded-xl border border-accent-400/30 bg-accent-400/10 p-3.5 text-xs text-foreground font-medium flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Zap className="size-4 text-accent-400 shrink-0" />
              <span>{evalResult}</span>
            </div>
            <button
              type="button"
              onClick={() => setEvalResult(null)}
              className="text-text-muted hover:text-foreground text-xs"
            >
              ✕
            </button>
          </div>
        </Reveal>
      )}

      {/* Top Stats Overview */}
      <Reveal>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card className="gap-0 py-0 shadow-card ring-line" size="sm">
            <div className="flex h-28 flex-col justify-between px-5 py-4">
              <div className="flex items-center justify-between">
                <p className="heading-caps text-xs font-medium text-text-muted">
                  Ukupno pravila
                </p>
                <ShieldAlert className="size-4 text-accent-400" />
              </div>
              <div>
                <span className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                  {rules.length}
                </span>
                <p className="mt-0.5 text-xs text-text-muted">
                  definisano u nalogu
                </p>
              </div>
            </div>
          </Card>

          <Card className="gap-0 py-0 shadow-card ring-line" size="sm">
            <div className="flex h-28 flex-col justify-between px-5 py-4">
              <div className="flex items-center justify-between">
                <p className="heading-caps text-xs font-medium text-text-muted">
                  Aktivna pravila
                </p>
                <Zap className="size-4 text-success" />
              </div>
              <div>
                <span className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-success">
                  {activeCount}
                </span>
                <p className="mt-0.5 text-xs text-text-muted">
                  aktivno se evaluira
                </p>
              </div>
            </div>
          </Card>

          <Card className="gap-0 py-0 shadow-card ring-line" size="sm">
            <div className="flex h-28 flex-col justify-between px-5 py-4">
              <div className="flex items-center justify-between">
                <p className="heading-caps text-xs font-medium text-text-muted">
                  Ukupno okidanja
                </p>
                <History className="size-4 text-foreground/60" />
              </div>
              <div>
                <span className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                  {totalFiringsCount}
                </span>
                <p className="mt-0.5 text-xs text-text-muted">
                  zabeleženo u istoriji
                </p>
              </div>
            </div>
          </Card>

          <Card className="gap-0 py-0 shadow-card ring-line" size="sm">
            <div className="flex h-28 flex-col justify-between px-5 py-4">
              <div className="flex items-center justify-between">
                <p className="heading-caps text-xs font-medium text-text-muted">
                  Cron evaluator
                </p>
                <Clock className="size-4 text-accent-400" />
              </div>
              <div>
                <span className="font-mono text-xl sm:text-2xl font-bold tracking-tight text-accent-400">
                  Svakih 30m
                </span>
                <p className="mt-0.5 text-xs text-text-muted">
                  automatska provera
                </p>
              </div>
            </div>
          </Card>
        </div>
      </Reveal>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-line pb-px">
        <button
          type="button"
          onClick={() => setActiveTab("rules")}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
            activeTab === "rules"
              ? "border-accent-400 text-foreground"
              : "border-transparent text-text-muted hover:text-foreground hover:border-line-soft",
          )}
        >
          <ShieldAlert className="size-4" />
          <span>Definisana pravila ({rules.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("firings")}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
            activeTab === "firings"
              ? "border-accent-400 text-foreground"
              : "border-transparent text-text-muted hover:text-foreground hover:border-line-soft",
          )}
        >
          <History className="size-4" />
          <span>Istorija okidanja ({firings.length})</span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "rules" ? (
        <Reveal delay={0.05}>
          <RulesList
            rules={rules}
            onEditRule={handleEditRule}
            onEnsureTemplates={() => ensureTemplateRules({})}
          />
        </Reveal>
      ) : (
        <Reveal delay={0.05}>
          <RuleFiringsTable />
        </Reveal>
      )}

      {/* Modal Dialog for Create/Edit */}
      <RuleEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        ruleToEdit={editingRule}
      />
    </div>
  );
}

export function RulesDashboardSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
