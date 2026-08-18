"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Inbox, MessageCircleReply, MessageCircleQuestion, Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Reveal } from "@/components/motion/reveal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AutomationsList,
  AutomationsListSkeleton,
} from "./automations-list";
import { AutomationEditorDialog } from "./automation-editor-dialog";
import { DmLogTable } from "./dm-log-table";
import { ProfileMenuPanel } from "./profile-menu-panel";
import { cn } from "@/lib/utils";

type AutomationView = FunctionReturnType<
  typeof api.orAutomationsApi.listAutomations
>[number];

type Tab = "automations" | "profile" | "log";

export function AutomationsDashboard() {
  const [tab, setTab] = useState<Tab>("automations");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AutomationView | null>(null);

  const automations = useQuery(api.orAutomationsApi.listAutomations);
  const engine = useQuery(api.orEngine.status);

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (automation: AutomationView) => {
    setEditing(automation);
    setEditorOpen(true);
  };

  const activeCount = automations?.filter((a) => a.isActive).length ?? 0;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <EngineStatusStrip engine={engine} activeCount={activeCount} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-px">
        <div className="flex items-center gap-2">
          <TabButton
            active={tab === "automations"}
            onClick={() => setTab("automations")}
            icon={MessageCircleReply}
            label={
              automations === undefined
                ? "Automatizacije"
                : `Automatizacije (${automations.length})`
            }
          />
          <TabButton
            active={tab === "profile"}
            onClick={() => setTab("profile")}
            icon={MessageCircleQuestion}
            label="Ledolomci i meni"
          />
          <TabButton
            active={tab === "log"}
            onClick={() => setTab("log")}
            icon={Inbox}
            label="DM log"
          />
        </div>

        <Button
          type="button"
          size="sm"
          onClick={openNew}
          className="mb-2 bg-accent-400 font-semibold text-surface-dark hover:bg-accent-400/90"
        >
          <Plus className="size-4" />
          <span>Nova automatizacija</span>
        </Button>
      </div>

      {tab === "automations" ? (
        automations === undefined ? (
          <AutomationsListSkeleton />
        ) : automations.length === 0 ? (
          <Reveal>
            <NoAutomations onCreate={openNew} />
          </Reveal>
        ) : (
          <Reveal>
            <AutomationsList automations={automations} onEdit={openEdit} />
          </Reveal>
        )
      ) : tab === "profile" ? (
        <Reveal>
          <ProfileMenuPanel />
        </Reveal>
      ) : (
        <Reveal>
          <DmLogTable />
        </Reveal>
      )}

      <AutomationEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        automationToEdit={editing}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Inbox;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2 text-sm font-medium transition-colors",
        active
          ? "border-accent-400 text-foreground"
          : "border-transparent text-text-muted hover:border-line-soft hover:text-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden />
      <span>{label}</span>
    </button>
  );
}

/**
 * One line that answers "is this thing actually live right now?". Automations
 * only fire when the Instagram account is connected AND the engine is on, and
 * both of those are switched in Settings.
 */
function EngineStatusStrip({
  engine,
  activeCount,
}: {
  engine: FunctionReturnType<typeof api.orEngine.status> | undefined;
  activeCount: number;
}) {
  if (engine === undefined) {
    return <Skeleton className="h-12 w-full rounded-xl" />;
  }

  if (!engine.igConnected) {
    return (
      <StatusStrip tone="danger">
        Instagram nalog nije povezan, pa nijedna automatizacija ne može da se
        okine.{" "}
        <SettingsLink>Poveži nalog u podešavanjima</SettingsLink>.
      </StatusStrip>
    );
  }

  if (!engine.enabled) {
    return (
      <StatusStrip tone="warning">
        Motor automatizacija je isključen — komentari se ne obrađuju.{" "}
        <SettingsLink>Uključi ga u podešavanjima</SettingsLink>.
      </StatusStrip>
    );
  }

  if (!engine.verifyTokenSet || !engine.appSecretSet) {
    return (
      <StatusStrip tone="warning">
        Motor je uključen, ali webhook nije do kraja podešen (
        {[
          !engine.verifyTokenSet ? "IG_WEBHOOK_VERIFY_TOKEN" : null,
          !engine.appSecretSet ? "META_APP_SECRET" : null,
        ]
          .filter(Boolean)
          .join(", ")}
        ). <SettingsLink>Otvori podešavanja</SettingsLink>.
      </StatusStrip>
    );
  }

  return (
    <StatusStrip tone="success">
      Motor je uključen i sluša komentare.{" "}
      <span className="font-mono tabular-nums">{activeCount}</span>{" "}
      {activeCount === 1 ? "aktivna automatizacija" : "aktivnih automatizacija"}.
    </StatusStrip>
  );
}

function StatusStrip({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm",
        tone === "success"
          ? "border-line-soft bg-card text-muted-foreground"
          : tone === "warning"
            ? "border-warning/30 bg-warning/5 text-foreground"
            : "border-danger/30 bg-danger/5 text-foreground",
      )}
    >
      <span
        className={cn(
          "mt-1.5 size-1.5 shrink-0 rounded-full",
          tone === "success"
            ? "bg-success"
            : tone === "warning"
              ? "bg-warning"
              : "bg-danger",
        )}
        aria-hidden
      />
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}

function SettingsLink({ children }: { children: React.ReactNode }) {
  return (
    <Link
      href="/settings"
      className="text-accent-400 underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  );
}

function NoAutomations({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="border border-dashed border-line bg-card p-8 text-center ring-0">
      <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-accent-400/10 text-accent-400">
        <MessageCircleReply className="size-6" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground">
        Napravi prvu automatizaciju
      </h3>
      <p className="mx-auto mt-1 max-w-sm text-xs text-text-muted">
        Izaberi ključnu reč, napiši poruku i dodaj link. Svako ko tu reč napiše u
        komentaru dobija poruku u roku od nekoliko sekundi.
      </p>
      <div className="mt-5">
        <Button
          type="button"
          size="sm"
          onClick={onCreate}
          className="bg-accent-400 font-semibold text-surface-dark hover:bg-accent-400/90"
        >
          <Plus className="size-4" />
          <span>Nova automatizacija</span>
        </Button>
      </div>
    </Card>
  );
}

export function AutomationsDashboardSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-10 w-full rounded-lg" />
      <AutomationsListSkeleton />
    </div>
  );
}
