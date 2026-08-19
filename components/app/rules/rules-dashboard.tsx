"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Reveal } from "@/components/motion/reveal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackNote } from "@/components/app/feedback";
import { TabNav, TabPanel } from "@/components/app/tab-nav";
import { RulesList } from "./rules-list";
import { RuleFiringsTable } from "./rule-firings-table";
import { RuleEditorDialog } from "./rule-editor-dialog";
import {
  ShieldAlert,
  Plus,
  Play,
  History,
  Loader2,
  Clock,
  X,
  Zap,
} from "lucide-react";

/** Ishod ručne provere: šta se desilo i šta sad. */
type EvalResult = { ok: boolean; title: string; detail: string };

export function RulesDashboard() {
  const [activeTab, setActiveTab] = useState<"rules" | "firings">("rules");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Doc<"rules"> | null>(null);

  const [evaluating, setEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);

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
      setEvalResult({
        ok: true,
        title:
          res.firingsCount > 0
            ? `Provera završena — ${res.firingsCount} okidanja`
            : "Provera završena — nijedno pravilo nije okinulo",
        detail: `Prošlo je ${res.evaluatedRulesCount} pravila preko ${res.totalTargetsChecked} objekata.`,
      });
    } catch (err: unknown) {
      setEvalResult({
        ok: false,
        title: "Provera nije završena",
        detail:
          err instanceof Error
            ? `${err.message} Proveri vezu sa Meta Ads nalogom u Podešavanjima.`
            : "Proveri vezu sa Meta Ads nalogom u Podešavanjima pa pokušaj ponovo.",
      });
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
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleTriggerEvaluation}
          disabled={evaluating}
          className="border-line hover:border-accent-400/50 hover:bg-surface-raised"
        >
          {evaluating ? (
            <>
              <Loader2 className="animate-spin text-accent-400" />
              <span>Proveravam…</span>
            </>
          ) : (
            <>
              <Play className="fill-accent-400 text-accent-400" />
              <span>Pokreni proveru sad</span>
            </>
          )}
        </Button>

        <Button type="button" size="sm" onClick={handleOpenNew}>
          <Plus />
          <span>Novo pravilo</span>
        </Button>
      </div>

      {/* Ručna provera: dok teče, kad se završi, i šta ako pukne. */}
      {evaluating && (
        <FeedbackNote tone="progress" title="Evaluator proverava pravila…">
          Prolazi kroz aktivna pravila i njihove ciljeve. Ostani na ekranu —
          rezultat stiže ovde.
        </FeedbackNote>
      )}

      {evalResult && !evaluating && (
        <FeedbackNote
          tone={evalResult.ok ? "success" : "danger"}
          title={evalResult.title}
          action={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setEvalResult(null)}
              aria-label="Zatvori poruku"
            >
              <X className="size-3.5" />
            </Button>
          }
        >
          {evalResult.detail}
        </FeedbackNote>
      )}

      {/* Top Stats Overview */}
      <Reveal>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card className="gap-0 py-0 shadow-card ring-line" size="sm">
            <div className="flex h-28 flex-col justify-between px-5 py-4">
              <div className="flex items-center justify-between">
                <p className="heading-caps text-micro font-medium text-text-muted">
                  Ukupno pravila
                </p>
                <ShieldAlert className="size-4 text-accent-400" />
              </div>
              <div>
                <span className="font-mono text-2xl sm:text-3xl font-bold text-foreground">
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
                <p className="heading-caps text-micro font-medium text-text-muted">
                  Aktivna pravila
                </p>
                <Zap className="size-4 text-success" />
              </div>
              <div>
                <span className="font-mono text-2xl sm:text-3xl font-bold text-success">
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
                <p className="heading-caps text-micro font-medium text-text-muted">
                  Ukupno okidanja
                </p>
                <History className="size-4 text-foreground/60" />
              </div>
              <div>
                <span className="font-mono text-2xl sm:text-3xl font-bold text-foreground">
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
                <p className="heading-caps text-micro font-medium text-text-muted">
                  Cron evaluator
                </p>
                <Clock className="size-4 text-accent-400" />
              </div>
              <div>
                <span className="font-mono text-xl sm:text-2xl font-bold text-accent-400">
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

      <TabNav
        tabs={[
          {
            id: "rules",
            label: `Definisana pravila (${rules.length})`,
            icon: ShieldAlert,
          },
          {
            id: "firings",
            label: `Istorija okidanja (${firings.length})`,
            icon: History,
          },
        ]}
        active={activeTab}
        onChange={setActiveTab}
        panelId="rules-panel"
      />

      <TabPanel id="rules-panel">
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
      </TabPanel>

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
