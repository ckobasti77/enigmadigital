"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Inbox, MessageSquareReply, Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Reveal } from "@/components/motion/reveal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QuotaWidget } from "./quota-widget";
import {
  YtAutomationsList,
  YtAutomationsListSkeleton,
} from "./yt-automations-list";
import { YtAutomationEditorDialog } from "./yt-automation-editor-dialog";
import { YtCommentLogTable } from "./yt-comment-log-table";
import { TabNav, TabPanel } from "@/components/app/tab-nav";
import { FeedbackNote } from "@/components/app/feedback";

type YtAutomationView = FunctionReturnType<
  typeof api.ytAutomationsApi.listAutomations
>[number];

type ConnectionView = FunctionReturnType<typeof api.connections.list>[number];

type Tab = "automations" | "log";

export function YtAutomationsDashboard() {
  const [tab, setTab] = useState<Tab>("automations");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<YtAutomationView | null>(null);

  const automations = useQuery(api.ytAutomationsApi.listAutomations);
  const connections = useQuery(api.connections.list);

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (automation: YtAutomationView) => {
    setEditing(automation);
    setEditorOpen(true);
  };

  const activeCount = automations?.filter((a) => a.isActive).length ?? 0;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <QuotaWidget />

      <EngineStatusStrip
        connection={connections?.find((c) => c.provider === "youtube")}
        loading={connections === undefined}
        activeCount={activeCount}
      />

      <TabNav
        tabs={[
          {
            id: "automations",
            label:
              automations === undefined
                ? "Automatizacije"
                : `Automatizacije (${automations.length})`,
            icon: MessageSquareReply,
          },
          { id: "log", label: "Log komentara", icon: Inbox },
        ]}
        active={tab}
        onChange={setTab}
        panelId="youtube-automations-panel"
        trailing={
          <Button type="button" size="sm" onClick={openNew}>
            <Plus />
            <span>Nova automatizacija</span>
          </Button>
        }
      />

      <TabPanel id="youtube-automations-panel">
        {tab === "automations" ? (
          automations === undefined ? (
            <YtAutomationsListSkeleton />
          ) : automations.length === 0 ? (
            <Reveal>
              <NoAutomations onCreate={openNew} />
            </Reveal>
          ) : (
            <Reveal>
              <YtAutomationsList automations={automations} onEdit={openEdit} />
            </Reveal>
          )
        ) : (
          <Reveal>
            <YtCommentLogTable />
          </Reveal>
        )}
      </TabPanel>

      <YtAutomationEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        automationToEdit={editing}
      />
    </div>
  );
}

function EngineStatusStrip({
  connection,
  loading,
  activeCount,
}: {
  connection: ConnectionView | undefined;
  loading: boolean;
  activeCount: number;
}) {
  if (loading) {
    return <Skeleton className="h-12 w-full rounded-xl" />;
  }

  if (connection === undefined) {
    return (
      <FeedbackNote tone="danger" title="YouTube nalog nije povezan">
        Nijedna automatizacija ne može da se okine dok kanal ne bude povezan.{" "}
        <SettingsLink>Poveži nalog u podešavanjima</SettingsLink>.
      </FeedbackNote>
    );
  }

  if (connection.status !== "active") {
    return (
      <FeedbackNote
        tone="warning"
        title={
          connection.status === "expired"
            ? "YouTube veza je istekla"
            : "YouTube veza je u grešci"
        }
      >
        Komentari se ne obrađuju.{" "}
        <SettingsLink>Otvori podešavanja</SettingsLink>.
      </FeedbackNote>
    );
  }

  if (activeCount === 0) {
    return (
      <FeedbackNote tone="warning" title="Nijedna automatizacija nije aktivna">
        Nalog je povezan, ali motor ne obilazi komentare dok bar jedna
        automatizacija ne bude uključena.
      </FeedbackNote>
    );
  }

  return (
    <FeedbackNote
      tone="success"
      title="Motor je uključen i obilazi komentare kanala"
    >
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
        <MessageSquareReply className="size-6" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground">
        Napravi prvu automatizaciju
      </h3>
      <p className="mx-auto mt-1 max-w-sm text-xs text-text-muted">
        Izaberi ključnu reč i napiši odgovor. Svako ko tu reč napiše u komentaru
        dobija javan odgovor sa kanala — i, ako hoćeš, komentar ide na
        moderaciju.
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

export function YtAutomationsDashboardSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <Skeleton className="h-[74px] w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-10 w-full rounded-lg" />
      <YtAutomationsListSkeleton />
    </div>
  );
}
