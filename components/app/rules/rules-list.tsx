"use client";

import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FeedbackNote } from "@/components/app/feedback";
import { SamoZa } from "@/components/app/samo-za";
import {
  useMoze,
  useProjekatMutation,
} from "@/components/app/projekat-provider";
import { Chip } from "@/components/app/system/chip";
import { EmptyState } from "@/components/app/system/empty-state";
import { formatRuleSentence } from "@/lib/rule-sentence";
import { cn } from "@/lib/utils";
import {
  Clock,
  History,
  Mail,
  Pause,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  Trash2,
} from "lucide-react";

export interface RulesListProps {
  rules: Doc<"rules">[];
  onEditRule: (rule: Doc<"rules">) => void;
  onEnsureTemplates: () => void;
}

const SCOPE_LABEL: Record<Doc<"rules">["scope"], string> = {
  campaign: "Kampanje",
  adset: "Ad setovi",
  account: "Ceo nalog",
};

/**
 * Pravila kao kartice „čuvara": ko čuva (naziv i štit), šta čuva (uslov kao
 * rečenica), da li je na straži (prekidač) i kada je poslednji put reagovao.
 * Izmena i brisanje su ghost ikonice — glavna radnja kartice je prekidač.
 */
export function RulesList({
  rules,
  onEditRule,
  onEnsureTemplates,
}: RulesListProps) {
  // Uključivanje, izmenu i brisanje sme samo vlasnik; šablone sme i urednik.
  const mozeVlasnik = useMoze("owner");
  const mozeUrednik = useMoze("urednik");
  const toggleRuleMutation = useProjekatMutation(api.rulesStore.toggleRule);
  const deleteRuleMutation = useProjekatMutation(api.rulesStore.deleteRule);

  const [deletingId, setDeletingId] = useState<Id<"rules"> | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Doc<"rules"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async (ruleId: Id<"rules">, currentEnabled: boolean) => {
    setError(null);
    try {
      await toggleRuleMutation({
        ruleId,
        enabled: !currentEnabled,
      });
    } catch (err) {
      console.error("Failed to toggle rule:", err);
      setError("Promena statusa nije uspela. Osveži stranu pa pokušaj ponovo.");
    }
  };

  const handleDelete = async () => {
    const rule = pendingDelete;
    if (!rule) return;
    setPendingDelete(null);
    setDeletingId(rule._id);
    setError(null);
    try {
      await deleteRuleMutation({ ruleId: rule._id });
    } catch (err) {
      console.error("Failed to delete rule:", err);
      setError(`Brisanje pravila „${rule.name}” nije uspelo. Pokušaj ponovo.`);
    } finally {
      setDeletingId(null);
    }
  };

  if (rules.length === 0) {
    return (
      <EmptyState
        icon={ShieldAlert}
        variant="mission"
        title="Postavi prvog čuvara"
        steps={[
          { label: "Učitaj šablone: čuvar CPA i čuvar potrošnje" },
          { label: "Podesi prag i šta pravilo radi kad ga pređe" },
          { label: "Uključi pravilo — evaluator ga proverava na 30 minuta" },
        ]}
        action={
          mozeUrednik ? (
            <Button type="button" variant="secondary" onClick={onEnsureTemplates}>
              <Sparkles aria-hidden />
              Učitaj šablone
            </Button>
          ) : undefined
        }
      >
        Pravilo prati CPA, potrošnju ili konverzije i reaguje kad pređu prag.
      </EmptyState>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {error && (
        <div className="xl:col-span-2">
          <FeedbackNote tone="danger" title={error} />
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Obrisati pravilo?"
        description={
          pendingDelete === null
            ? null
            : `„${pendingDelete.name}” se briše i prestaje da se evaluira. Istorija okidanja ostaje, a radnje koje je pravilo već izvršilo na nalogu se ne poništavaju.`
        }
        confirmLabel="Obriši pravilo"
        busyLabel="Brišem…"
        busy={deletingId !== null}
        onConfirm={handleDelete}
      />

      {rules.map((rule) => {
        const sentence = formatRuleSentence({
          scope: rule.scope,
          condition: rule.condition,
          action: rule.action,
          cooldownHours: rule.cooldownHours,
        });

        const lastFired = rule.lastFiredAt
          ? new Date(rule.lastFiredAt).toLocaleString("sr-RS", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })
          : null;

        const Shield = rule.enabled ? ShieldCheck : ShieldOff;
        const pauses =
          rule.action === "pause_and_notify" || rule.action === "pause";

        return (
          <Card
            key={rule._id}
            className={cn(
              "flex flex-col gap-3 p-5 shadow-card ring-line",
              !rule.enabled && "bg-surface/40",
            )}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-lg border",
                  rule.enabled
                    ? "border-mod-line bg-mod-soft text-mod"
                    : "border-line bg-surface-raised text-text-muted",
                )}
              >
                <Shield className="size-5" aria-hidden />
              </span>

              <div className="min-w-0 flex-1">
                <h3 className="text-copy font-bold break-words text-foreground">
                  {rule.name}
                </h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Chip size="sm" tone="muted">
                    {SCOPE_LABEL[rule.scope]}
                  </Chip>
                  {pauses ? (
                    <Chip size="sm" tone="warning" icon={Pause}>
                      {rule.action === "pause" ? "Samo pauziraj" : "Pauziraj i javi"}
                    </Chip>
                  ) : (
                    <Chip size="sm" tone="info" icon={Mail}>
                      Samo javi
                    </Chip>
                  )}
                </div>
              </div>

              {/* Prekidač je radnja kartice; uz njega stoji stanje rečju, da
                  boja nije jedini nosilac. */}
              {mozeVlasnik ? (
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-ui">
                  <span
                    className={rule.enabled ? "text-foreground" : "text-text-muted"}
                  >
                    {rule.enabled ? "Aktivno" : "Isključeno"}
                  </span>
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={() => handleToggle(rule._id, rule.enabled)}
                    aria-label={`Pravilo ${rule.name}: ${
                      rule.enabled ? "aktivno" : "isključeno"
                    }`}
                    className="cursor-pointer"
                  />
                </label>
              ) : (
                // Ostali vide samo stanje rečju, bez prekidača.
                <span
                  className={cn(
                    "shrink-0 text-ui",
                    rule.enabled ? "text-foreground" : "text-text-muted",
                  )}
                >
                  {rule.enabled ? "Aktivno" : "Isključeno"}
                </span>
              )}
            </div>

            {/* Uslov kao rečenica — ono što čuvar zapravo radi. */}
            <p
              className={cn(
                "text-ui leading-relaxed",
                rule.enabled ? "text-foreground" : "text-text-muted",
              )}
            >
              {sentence}
            </p>

            <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line-soft pt-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-text-muted">
                <span className="inline-flex items-center gap-1">
                  <History className="size-3" aria-hidden />
                  {lastFired ? (
                    <>
                      Poslednje okidanje{" "}
                      <span className="font-mono tabular-nums text-foreground">
                        {lastFired}
                      </span>
                    </>
                  ) : (
                    "Još nije okinulo"
                  )}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" aria-hidden />
                  Pauza između okidanja {rule.cooldownHours} h
                </span>
              </div>

              <SamoZa uloga="owner">
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onEditRule(rule)}
                    aria-label={`Izmeni pravilo ${rule.name}`}
                    title="Izmeni"
                    className="touch-target text-text-muted hover:text-foreground"
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setPendingDelete(rule)}
                    disabled={deletingId === rule._id}
                    aria-label={`Obriši pravilo ${rule.name}`}
                    title="Obriši"
                    className="touch-target text-text-muted hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </SamoZa>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
