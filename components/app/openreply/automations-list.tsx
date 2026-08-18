"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import {
  Check,
  Copy,
  Image as ImageIcon,
  Images,
  Pencil,
  Trash2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatPercent } from "@/lib/format";
import { DmPreview } from "./dm-preview";
import { PillToggle } from "./automation-editor-dialog";
import { cn } from "@/lib/utils";

type AutomationView = FunctionReturnType<
  typeof api.orAutomationsApi.listAutomations
>[number];

function convexMessage(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as { message?: string } | undefined;
    if (data && typeof data.message === "string") return data.message;
  }
  return fallback;
}

export function AutomationsList({
  automations,
  onEdit,
}: {
  automations: AutomationView[];
  onEdit: (automation: AutomationView) => void;
}) {
  const toggleAutomation = useMutation(api.orAutomationsApi.toggleAutomation);
  const deleteAutomation = useMutation(api.orAutomationsApi.deleteAutomation);

  const [busyId, setBusyId] = useState<Id<"orAutomations"> | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleToggle = async (automation: AutomationView) => {
    setBusyId(automation._id);
    setErrorMsg(null);
    try {
      await toggleAutomation({
        automationId: automation._id,
        isActive: !automation.isActive,
      });
    } catch (err) {
      setErrorMsg(convexMessage(err, "Promena statusa nije uspela."));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (automation: AutomationView) => {
    const confirmed = window.confirm(
      `Obrisati automatizaciju „${automation.name}”? DM log i istorija klikova ostaju sačuvani.`,
    );
    if (!confirmed) return;

    setBusyId(automation._id);
    setErrorMsg(null);
    try {
      await deleteAutomation({ automationId: automation._id });
    } catch (err) {
      setErrorMsg(convexMessage(err, "Brisanje nije uspelo."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {errorMsg && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
          {errorMsg}
        </div>
      )}

      {automations.map((automation) => (
        <AutomationCard
          key={automation._id}
          automation={automation}
          busy={busyId === automation._id}
          onEdit={() => onEdit(automation)}
          onToggle={() => handleToggle(automation)}
          onDelete={() => handleDelete(automation)}
        />
      ))}
    </div>
  );
}

function AutomationCard({
  automation,
  busy,
  onEdit,
  onToggle,
  onDelete,
}: {
  automation: AutomationView;
  busy: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const PostIcon = automation.matchAnyPost ? Images : ImageIcon;

  return (
    <Card
      className={cn(
        "gap-0 py-0 shadow-card ring-line transition-opacity",
        !automation.isActive && "opacity-75",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {automation.name}
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
            <span>
              {automation.matchAnyWord ? "Bilo koja reč" : "Sve reči"}
            </span>
            <span aria-hidden>·</span>
            <span>
              {automation.wholeWordMatch ? "Cela reč" : "Deo reči"}
            </span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <PostIcon className="size-3" aria-hidden />
              {automation.matchAnyPost ? (
                "Sve objave"
              ) : (
                <span className="font-mono">
                  Objava {automation.postId ?? "—"}
                </span>
              )}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <PillToggle
            on={automation.isActive}
            onChange={onToggle}
            disabled={busy}
            onLabel="Aktivno"
            offLabel="Isključeno"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onEdit}
            disabled={busy}
            className="border-line text-text-muted hover:text-foreground"
          >
            <Pencil className="size-3" />
            <span>Izmeni</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={onDelete}
            disabled={busy}
            aria-label={`Obriši automatizaciju ${automation.name}`}
            className="border-line text-danger/80 hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 px-5 pt-3">
        {automation.keywords.map((keyword) => (
          <span
            key={keyword}
            className="rounded-md border border-line-soft bg-surface-raised px-2 py-0.5 font-mono text-xs text-foreground"
          >
            {keyword}
          </span>
        ))}
      </div>

      <div className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <DmPreview
          compact
          message={automation.dmMessage}
          linkUrl={automation.trackedLinkUrl ?? automation.linkUrl}
          linkLabel={automation.linkLabel}
          publicReply={
            automation.publicReplyEnabled ? automation.publicReplyMessage : null
          }
        />

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 lg:justify-end">
          <Metric label="Poslato" value={formatNumber(automation.dmsSent)} />
          <Metric
            label="Neuspelo"
            value={formatNumber(automation.dmsFailed)}
            tone={automation.dmsFailed > 0 ? "danger" : "default"}
          />
          <Metric label="Klikovi" value={formatNumber(automation.linkClicks)} />
          <Metric
            label="CTR"
            value={formatPercent(automation.ctr)}
            tone="accent"
          />
        </div>
      </div>

      {automation.trackedLinkUrl && (
        <div className="border-t border-line-soft px-5 py-3">
          <CopyLink url={automation.trackedLinkUrl} />
        </div>
      )}
    </Card>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent" | "danger";
}) {
  return (
    <div>
      <p className="heading-caps text-xs font-medium text-text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 font-mono text-lg tabular-nums",
          tone === "accent"
            ? "text-accent-400"
            : tone === "danger"
              ? "text-danger"
              : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-text-muted">
        {url}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        className="text-text-muted hover:text-foreground"
      >
        {copied ? (
          <>
            <Check className="size-3 text-success" />
            <span>Kopirano</span>
          </>
        ) : (
          <>
            <Copy className="size-3" />
            <span>Kopiraj link</span>
          </>
        )}
      </Button>
    </div>
  );
}

export function AutomationsListSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i} className="gap-0 py-0 shadow-card ring-line">
          <div className="flex items-start justify-between gap-3 px-5 pt-5">
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-7 w-40" />
          </div>
          <div className="flex gap-1.5 px-5 pt-3">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-20" />
          </div>
          <div className="px-5 py-4">
            <Skeleton className="h-14 w-full max-w-sm rounded-2xl" />
          </div>
        </Card>
      ))}
    </div>
  );
}
