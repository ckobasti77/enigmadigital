"use client";

import { useState } from "react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { pravilaPauzira } from "@/convex/lib/pravilaProcena";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FeedbackNote } from "@/components/app/feedback";
import { SamoZa } from "@/components/app/samo-za";
import {
  useMoze,
  useProjekatMutation,
  useProjekatQuery,
} from "@/components/app/projekat-provider";
import { Chip } from "@/components/app/system/chip";
import { EmptyState } from "@/components/app/system/empty-state";
import {
  formatRuleSentence,
  formatThresholdValue,
  formatVrednostCilja,
  istiCilj,
} from "@/lib/rule-sentence";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RuleProbaDialog, poslednjihDana } from "./rule-proba-dialog";
import {
  Clock,
  History,
  LayoutTemplate,
  Mail,
  Pause,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Trash2,
} from "lucide-react";

export interface RulesListProps {
  rules: Doc<"rules">[];
  onEditRule: (rule: Doc<"rules">) => void;
  onDodajIzSablona: () => void;
  /** Valuta Meta naloga kad je jedna i poznata. */
  valuta?: string;
}

const SCOPE_LABEL: Record<Doc<"rules">["scope"], string> = {
  campaign: "Kampanje",
  adset: "Grupe oglasa",
  account: "Ceo nalog",
};

/**
 * Pravila kao kartice: naziv, uslov kao rečenica, vrednost prema pragu sada,
 * prekidač i poslednje okidanje. Pravilo koje pauzira uključuje se tek posle
 * probe (P5). Izmena i brisanje su ghost ikonice — glavna radnja kartice je
 * prekidač.
 */
export function RulesList({ rules, onEditRule, onDodajIzSablona, valuta }: RulesListProps) {
  // Uključivanje, izmenu, brisanje i šablone sme samo vlasnik.
  const mozeVlasnik = useMoze("owner");
  const toggleRuleMutation = useProjekatMutation(api.rulesStore.toggleRule);
  const deleteRuleMutation = useProjekatMutation(api.rulesStore.deleteRule);

  const [deletingId, setDeletingId] = useState<Id<"rules"> | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Doc<"rules"> | null>(null);
  const [probaZa, setProbaZa] = useState<Doc<"rules"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async (rule: Doc<"rules">) => {
    setError(null);
    // Pauza se ne uključuje bez probe: prekidač otvara probu, a uključuje
    // tek „Uključi pravilo" u njoj.
    if (!rule.enabled && pravilaPauzira(rule.action)) {
      setProbaZa(rule);
      return;
    }
    try {
      await toggleRuleMutation({ ruleId: rule._id, enabled: !rule.enabled });
    } catch (err) {
      if (err instanceof ConvexError && (err.data as { code?: string })?.code === "proba_potrebna") {
        setProbaZa(rule);
        return;
      }
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
        title="Još nema pravila"
        steps={[
          { label: "Izaberi šablon i prag" },
          { label: "Pogledaj probu: šta bi sada pauziralo" },
          { label: "Uključi pravilo; proverava se na 30 minuta" },
        ]}
        action={
          mozeVlasnik ? (
            <Button type="button" variant="primary" onClick={onDodajIzSablona}>
              <LayoutTemplate aria-hidden />
              Dodaj iz šablona
            </Button>
          ) : undefined
        }
      >
        Pravilo pazi na Meta kampanje i javlja ili pauzira kad prođu prag.
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
            : `„${pendingDelete.name}” se briše i prestaje da se proverava. Istorija okidanja ostaje, a radnje koje je pravilo već izvršilo na nalogu se ne poništavaju.`
        }
        confirmLabel="Obriši pravilo"
        busyLabel="Brišem…"
        busy={deletingId !== null}
        onConfirm={handleDelete}
      />

      {probaZa !== null && (
        <RuleProbaDialog
          open
          onOpenChange={(open) => {
            if (!open) setProbaZa(null);
          }}
          naziv={probaZa.name}
          scope={probaZa.scope}
          condition={probaZa.condition}
          ruleId={probaZa._id}
          valuta={valuta}
          onPotvrdi={async () => {
            await toggleRuleMutation({
              ruleId: probaZa._id,
              enabled: true,
              probaPotvrdjena: true,
            });
          }}
        />
      )}

      {rules.map((rule) => (
        <KarticaPravila
          key={rule._id}
          rule={rule}
          valuta={valuta}
          mozeVlasnik={mozeVlasnik}
          brisem={deletingId === rule._id}
          onToggle={() => handleToggle(rule)}
          onEdit={() => onEditRule(rule)}
          onDelete={() => setPendingDelete(rule)}
        />
      ))}
    </div>
  );
}

function KarticaPravila({
  rule,
  valuta,
  mozeVlasnik,
  brisem,
  onToggle,
  onEdit,
  onDelete,
}: {
  rule: Doc<"rules">;
  valuta?: string;
  mozeVlasnik: boolean;
  brisem: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const sentence = formatRuleSentence(
    { scope: rule.scope, condition: rule.condition, action: rule.action },
    valuta,
  );

  const lastFired = rule.lastFiredAt
    ? formatDateTime(rule.lastFiredAt)
    : null;

  const Shield = rule.enabled ? ShieldCheck : ShieldOff;
  const pauses = pravilaPauzira(rule.action);
  const stanje = rule.enabled ? "Uključeno" : "Isključeno";

  return (
    <Card
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
          <h3 className="text-copy font-bold break-words text-foreground">{rule.name}</h3>
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

        {/* Prekidač je radnja kartice; uz njega stoji stanje rečju, da boja
            nije jedini nosilac. */}
        {mozeVlasnik ? (
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-ui">
            <span className={rule.enabled ? "text-foreground" : "text-text-muted"}>{stanje}</span>
            <Switch
              checked={rule.enabled}
              onCheckedChange={onToggle}
              aria-label={`Pravilo ${rule.name}: ${stanje.toLowerCase()}`}
              className="cursor-pointer"
            />
          </label>
        ) : (
          <span
            className={cn("shrink-0 text-ui", rule.enabled ? "text-foreground" : "text-text-muted")}
          >
            {stanje}
          </span>
        )}
      </div>

      {/* Uslov kao rečenica — ono što pravilo zapravo radi. */}
      <p
        className={cn(
          "text-ui leading-relaxed",
          rule.enabled ? "text-foreground" : "text-text-muted",
        )}
      >
        {sentence}
      </p>

      <VrednostPremaPragu rule={rule} valuta={valuta} />

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line-soft pt-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-text-muted">
          <span className="inline-flex items-center gap-1">
            <History className="size-3" aria-hidden />
            {lastFired ? (
              <>
                Poslednje okidanje{" "}
                <span className="tabular-nums text-foreground">{lastFired}</span>
              </>
            ) : (
              "Još nije okinulo"
            )}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" aria-hidden />
            Pauza za {istiCilj(rule.scope)} {rule.cooldownHours} h
          </span>
        </div>

        <SamoZa uloga="owner">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onEdit}
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
              onClick={onDelete}
              disabled={brisem}
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
}

/**
 * Vrednost prema pragu SADA, iz iste probe koja prethodi uključivanju (isti
 * argumenti, pa Convex drži jednu pretplatu): koliko je najbliži cilj blizu
 * praga. Bez podataka piše „—" sa razlogom, ne nulu.
 */
function VrednostPremaPragu({ rule, valuta }: { rule: Doc<"rules">; valuta?: string }) {
  const proba = useProjekatQuery(api.rulesStore.probaPravila, {
    scope: rule.scope,
    condition: rule.condition,
    ruleId: rule._id,
  });

  if (proba === undefined) {
    return <Skeleton className="h-4 w-64 max-w-full rounded-md" />;
  }

  const cond = rule.condition;
  const iznos = (x: number) => formatThresholdValue(cond.metric, x, valuta ?? proba.valuta);
  const n = proba.najblizi;

  if (n === null) {
    return (
      <p className="text-ui text-text-muted">
        —{" "}
        {proba.ispodMinPrikaza > 0
          ? `nijedan cilj nema dovoljno prikaza za ${poslednjihDana(proba.prozorDana)}`
          : `nema podataka za ${poslednjihDana(proba.prozorDana)}`}
      </p>
    );
  }

  const jos = proba.pogodjeni.length - 1;
  return (
    <p className="text-ui text-text-muted">
      {n.preko ? "Sada ispunjava uslov: " : "Sada najbliža pragu: "}
      <span className="text-foreground">{n.naziv}</span>{" "}
      <span className="tabular-nums text-foreground">
        {formatVrednostCilja(cond.metric, n.vrednost, n.izmereno, valuta ?? proba.valuta)}
      </span>
      {n.procenatPraga !== null ? (
        <>
          {" "}
          · <span className="tabular-nums">{n.procenatPraga}</span> % praga
        </>
      ) : (
        <> · prag {iznos(cond.value)}</>
      )}
      {n.preko && jos > 0 && <> · i još {jos}</>}
    </p>
  );
}
