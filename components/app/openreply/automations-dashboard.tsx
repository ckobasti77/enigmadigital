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
import { TabNav, TabPanel } from "@/components/app/tab-nav";
import { FeedbackNote } from "@/components/app/feedback";

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

      <TabNav
        tabs={[
          {
            id: "automations",
            label:
              automations === undefined
                ? "Automatizacije"
                : `Automatizacije (${automations.length})`,
            icon: MessageCircleReply,
          },
          {
            id: "profile",
            label: "Ledolomci i meni",
            icon: MessageCircleQuestion,
          },
          { id: "log", label: "DM log", icon: Inbox },
        ]}
        active={tab}
        onChange={setTab}
        panelId="openreply-panel"
        trailing={
          <Button type="button" size="sm" onClick={openNew}>
            <Plus />
            <span>Nova automatizacija</span>
          </Button>
        }
      />

      <TabPanel id="openreply-panel">
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
      </TabPanel>

      <AutomationEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        automationToEdit={editing}
      />
    </div>
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
      <FeedbackNote tone="danger" title="Instagram nalog nije povezan">
        Nijedna automatizacija ne može da se okine dok nalog ne bude povezan.{" "}
        <SettingsLink>Poveži nalog u podešavanjima</SettingsLink>.
      </FeedbackNote>
    );
  }

  if (!engine.enabled) {
    return (
      <FeedbackNote tone="warning" title="Motor automatizacija je isključen">
        Komentari se ne obrađuju.{" "}
        <SettingsLink>Uključi ga u podešavanjima</SettingsLink>.
      </FeedbackNote>
    );
  }

  if (!engine.verifyTokenSet || !engine.appSecretSet) {
    return (
      <FeedbackNote tone="warning" title="Webhook nije do kraja podešen">
        Motor je uključen, ali nedostaje{" "}
        {[
          !engine.verifyTokenSet ? "IG_WEBHOOK_VERIFY_TOKEN" : null,
          !engine.appSecretSet ? "META_APP_SECRET" : null,
        ]
          .filter(Boolean)
          .join(" i ")}
        . <SettingsLink>Otvori podešavanja</SettingsLink>.
      </FeedbackNote>
    );
  }

  return (
    <FeedbackNote tone="success" title="Motor je uključen i sluša komentare">
      <span className="font-mono tabular-nums">{activeCount}</span>{" "}
      {activeCount === 1 ? "aktivna automatizacija" : "aktivnih automatizacija"}.
    </FeedbackNote>
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
          className="font-semibold"
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
