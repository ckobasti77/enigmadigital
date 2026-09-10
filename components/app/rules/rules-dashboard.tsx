"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackNote } from "@/components/app/feedback";
import { TabNav, TabPanel } from "@/components/app/tab-nav";
import { StatTile, StatTileSkeleton } from "@/components/app/system/kpi-tile";
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
import { formatNumber } from "@/lib/format";

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
          <StatTile
            label="Ukupno pravila"
            value={rules.length}
            format={formatNumber}
            note="definisano u nalogu"
            icon={ShieldAlert}
          />
          <StatTile
            label="Aktivna pravila"
            value={activeCount}
            format={formatNumber}
            note="aktivno se evaluira"
            icon={Zap}
            valueClassName="text-success"
          />
          <StatTile
            label="Ukupno okidanja"
            value={totalFiringsCount}
            format={formatNumber}
            note="zabeleženo u istoriji"
            icon={History}
          />
          <StatTile
            label="Cron evaluator"
            value={30}
            format={(v) => `Svakih ${v}m`}
            note="automatska provera"
            icon={Clock}
            valueClassName="text-accent-400"
          />
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
        {Array.from({ length: 4 }).map((_, i) => (
          <StatTileSkeleton key={i} />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
