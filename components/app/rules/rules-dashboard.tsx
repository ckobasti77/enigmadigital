"use client";

import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackNote } from "@/components/app/feedback";
import {
  useMoze,
  useProjekatAction,
  useProjekatQuery,
} from "@/components/app/projekat-provider";
import { TabNav, TabPanel } from "@/components/app/tab-nav";
import { Chip } from "@/components/app/system/chip";
import { PageHeader } from "@/components/app/system/page-header";
import { ValutaUpozorenje } from "@/components/app/system/valuta-upozorenje";
import { RulesList } from "./rules-list";
import { RuleFiringsTable } from "./rule-firings-table";
import { RuleEditorDialog } from "./rule-editor-dialog";
import { RuleSablonDialog } from "./rule-sablon-dialog";
import { useValutaPravila } from "./use-valuta-pravila";
import {
  ShieldAlert,
  Plus,
  Play,
  History,
  X,
  Zap,
  LayoutTemplate,
} from "lucide-react";

const DESCRIPTION =
  "Pravila za Meta oglase: javljaju ili pauziraju kampanju kad pređe prag.";

/** Ishod ručne provere: šta se desilo i šta sad. */
type EvalResult = { ok: boolean; title: string; detail: string };

export function RulesDashboard() {
  const [activeTab, setActiveTab] = useState<"rules" | "firings">("rules");
  const [editorOpen, setEditorOpen] = useState(false);
  const [sablonOpen, setSablonOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Doc<"rules"> | null>(null);

  const [evaluating, setEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);

  // Čitanje spiska ništa ne upisuje: šabloni se dodaju samo kroz „Dodaj iz
  // šablona", sa pragom koji je vlasnik video (P5).
  const rules = useProjekatQuery(api.rulesStore.listRules);
  const firings = useProjekatQuery(api.rulesStore.listRuleFirings, { limit: 100 });
  const manualEvaluate = useProjekatAction(api.rules.manualEvaluateRules);
  const { valuta, drugaValuta } = useValutaPravila();

  // Pravila, šablone i ručnu proveru sme samo vlasnik.
  const mozeVlasnik = useMoze("owner");

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
      const res = await manualEvaluate();
      setEvalResult({
        ok: true,
        title:
          res.firingsCount > 0
            ? `Provera završena — ${res.firingsCount} okidanja`
            : "Provera završena — nijedno pravilo nije okinulo",
        detail: `Prošlo je ${res.evaluatedRulesCount} pravila preko ${res.totalTargetsChecked} ciljeva.`,
      });
    } catch (err: unknown) {
      setEvalResult({
        ok: false,
        title: "Provera nije završena",
        detail:
          err instanceof Error
            ? `${err.message} Proveri vezu sa Meta oglasima u Podešavanjima.`
            : "Proveri vezu sa Meta oglasima u Podešavanjima pa pokušaj ponovo.",
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
  const prazno = rules.length === 0;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        variant="module"
        description={DESCRIPTION}
        actions={
          mozeVlasnik ? (
            <>
              {/* Na telefonu samo ikonica: tri dugmeta inače ne staju u red. */}
              <Button
                type="button"
                variant="outline"
                onClick={handleTriggerEvaluation}
                loading={evaluating}
                title="Pokreni proveru sad"
              >
                {!evaluating && <Play aria-hidden />}
                <span className="max-sm:sr-only">
                  {evaluating ? "Proveravam…" : "Pokreni proveru sad"}
                </span>
              </Button>
              <Button type="button" variant="outline" onClick={handleOpenNew}>
                <Plus aria-hidden />
                Novo pravilo
              </Button>
              {/* Jedino primarno dugme ekrana; u praznom stanju ga nosi
                  prazno stanje, pa ga zaglavlje tada ne ponavlja. */}
              {!prazno && (
                <Button type="button" variant="primary" onClick={() => setSablonOpen(true)}>
                  <LayoutTemplate aria-hidden />
                  Dodaj iz šablona
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      <ValutaUpozorenje valuta={drugaValuta} />

      {/* Ručna provera: dok teče, kad se završi, i šta ako pukne. */}
      {evaluating && (
        <FeedbackNote tone="progress" title="Proveravam uključena pravila…">
          Prolazi kroz uključena pravila i njihove ciljeve. Ostani na ekranu —
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

      {/* Tri broja kao jedan red čipova: fokus ekrana su kartice pravila
          ispod. Učestalost provere i obim su tihi tekst, ne mera. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Chip icon={ShieldAlert} count={rules.length}>
            Pravila
          </Chip>
          <Chip
            icon={Zap}
            tone={activeCount > 0 ? "success" : "muted"}
            count={activeCount}
          >
            Uključena
          </Chip>
          <Chip icon={History} count={totalFiringsCount}>
            Okidanja u istoriji
          </Chip>
        </div>
        <p className="text-meta text-text-muted">
          Čuva samo Meta oglase · Proverava se na 30 min
        </p>
      </div>

      <TabNav
        tabs={[
          {
            id: "rules",
            label: `Pravila (${rules.length})`,
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
              valuta={valuta}
              onEditRule={handleEditRule}
              onDodajIzSablona={() => setSablonOpen(true)}
            />
          </div>
        ) : (
          <div>
            <RuleFiringsTable />
          </div>
        )}
      </TabPanel>

      <RuleEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        ruleToEdit={editingRule}
      />
      <RuleSablonDialog open={sablonOpen} onOpenChange={setSablonOpen} valuta={valuta} />
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
