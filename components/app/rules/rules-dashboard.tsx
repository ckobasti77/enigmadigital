"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackNote } from "@/components/app/feedback";
import { TabNav, TabPanel } from "@/components/app/tab-nav";
import { Chip } from "@/components/app/system/chip";
import { PageHeader } from "@/components/app/system/page-header";
import { RulesList } from "./rules-list";
import { RuleFiringsTable } from "./rule-firings-table";
import { RuleEditorDialog } from "./rule-editor-dialog";
import {
  ShieldAlert,
  Plus,
  Play,
  History,
  Clock,
  X,
  Zap,
} from "lucide-react";

const DESCRIPTION =
  "Čuvari oglasa: provera na 30 minuta, reakcija kad CPA ili potrošnja pređu prag.";

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
      <PageHeader
        variant="module"
        description={DESCRIPTION}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={handleTriggerEvaluation}
              loading={evaluating}
            >
              {!evaluating && <Play aria-hidden />}
              {evaluating ? "Proveravam…" : "Pokreni proveru sad"}
            </Button>
            <Button type="button" variant="primary" onClick={handleOpenNew}>
              <Plus aria-hidden />
              Novo pravilo
            </Button>
          </>
        }
      />

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

      {/* Četiri broja kao jedan red čipova: fokus ekrana su kartice čuvara
          ispod. „Provera na 30 min" je podešavanje, ne mera — ispisuje se bez
          odbrojavanja (F7), a „aktivna" je zelena samo kad ih stvarno ima. */}
      <div className="flex flex-wrap items-center gap-2">
        <Chip icon={ShieldAlert} count={rules.length}>
          Pravila
        </Chip>
        <Chip
          icon={Zap}
          tone={activeCount > 0 ? "success" : "muted"}
          count={activeCount}
        >
          Aktivna
        </Chip>
        <Chip icon={History} count={totalFiringsCount}>
          Okidanja u istoriji
        </Chip>
        <Chip icon={Clock} tone="muted">
          Provera na 30 min
        </Chip>
      </div>

      <TabNav
        tabs={[
          {
            id: "rules",
            label: `Čuvari (${rules.length})`,
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
          <div>
            <RulesList
              rules={rules}
              onEditRule={handleEditRule}
              onEnsureTemplates={() => ensureTemplateRules({})}
            />
          </div>
        ) : (
          <div>
            <RuleFiringsTable />
          </div>
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

/** Zaglavlje je isto kao na učitanom ekranu, pa podaci ništa ne pomeraju. */
export function RulesDashboardSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader variant="module" description={DESCRIPTION} />
      <Skeleton className="h-7 w-96 max-w-full rounded-md" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </div>
  );
}
