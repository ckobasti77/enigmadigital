"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import {
  Film,
  Loader2,
  MessageSquareReply,
  Pencil,
  PlaySquare,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatNumber } from "@/lib/format";
import { YtCommentPreview } from "./yt-comment-preview";
import {
  MODERATION_LABELS,
  PillToggle,
} from "./yt-automation-editor-dialog";
import { cn } from "@/lib/utils";

type YtAutomationView = FunctionReturnType<
  typeof api.ytAutomationsApi.listAutomations
>[number];

function convexMessage(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as { message?: string } | undefined;
    if (data && typeof data.message === "string") return data.message;
  }
  return fallback;
}

/**
 * What a match actually does, in one phrase. Deletion and moderation never
 * appear together — the editor stores one or the other (Y7).
 */
function actionLabel(automation: YtAutomationView): string {
  if (automation.deleteEnabled) {
    return automation.replyEnabled ? "Odgovor + brisanje" : "Samo brisanje";
  }
  if (automation.replyEnabled && automation.moderationEnabled) {
    return "Odgovor + moderacija";
  }
  if (automation.replyEnabled) return "Samo odgovor";
  return "Samo moderacija";
}

export function YtAutomationsList({
  automations,
  onEdit,
}: {
  automations: YtAutomationView[];
  onEdit: (automation: YtAutomationView) => void;
}) {
  const toggleAutomation = useMutation(api.ytAutomationsApi.toggleAutomation);
  const deleteAutomation = useMutation(api.ytAutomationsApi.deleteAutomation);

  const [busyId, setBusyId] = useState<Id<"ytAutomations"> | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<YtAutomationView | null>(
    null,
  );

  const handleToggle = async (automation: YtAutomationView) => {
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

  const handleDelete = async (automation: YtAutomationView) => {
    setBusyId(automation._id);
    setErrorMsg(null);
    try {
      await deleteAutomation({ automationId: automation._id });
      setPendingDelete(null);
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
          onDelete={() => setPendingDelete(automation)}
        />
      ))}

      <DeleteConfirmDialog
        automation={pendingDelete}
        busy={pendingDelete !== null && busyId === pendingDelete._id}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete !== null) void handleDelete(pendingDelete);
        }}
      />
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
  automation: YtAutomationView;
  busy: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const ScopeIcon = automation.matchAnyVideo ? PlaySquare : Film;

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
            <span className="inline-flex items-center gap-1 text-foreground">
              {automation.replyEnabled ? (
                <MessageSquareReply className="size-3" aria-hidden />
              ) : automation.deleteEnabled ? (
                <Trash2 className="size-3" aria-hidden />
              ) : (
                <ShieldCheck className="size-3" aria-hidden />
              )}
              {actionLabel(automation)}
            </span>
            <span aria-hidden>·</span>
            <span>{automation.matchAnyWord ? "Bilo koja reč" : "Sve reči"}</span>
            <span aria-hidden>·</span>
            <span>{automation.wholeWordMatch ? "Cela reč" : "Deo reči"}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <ScopeIcon className="size-3" aria-hidden />
              {automation.matchAnyVideo ? (
                "Svi videi"
              ) : (
                <span className="font-mono">Video {automation.videoId}</span>
              )}
            </span>
            {automation.deleteEnabled && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1 text-danger">
                  <Trash2 className="size-3" aria-hidden />
                  Briše komentar nepovratno
                </span>
              </>
            )}
            {automation.moderationEnabled &&
              automation.moderationStatus !== null && (
                <>
                  <span aria-hidden>·</span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1",
                      automation.moderationStatus === "rejected"
                        ? "text-danger"
                        : "text-accent-400",
                    )}
                  >
                    <ShieldCheck className="size-3" aria-hidden />
                    {MODERATION_LABELS[automation.moderationStatus]}
                    {automation.markAsSpam && " + blokada autora"}
                  </span>
                </>
              )}
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
        {automation.replyEnabled ? (
          <YtCommentPreview compact message={automation.replyMessage ?? ""} />
        ) : (
          <p className="text-xs text-text-muted">
            {automation.deleteEnabled
              ? "Bez javnog odgovora — automatizacija samo briše komentar."
              : "Bez javnog odgovora — automatizacija samo moderiše komentar."}
          </p>
        )}

        <div className="lg:justify-self-end">
          <p className="heading-caps text-xs font-medium text-text-muted">
            Odgovora (7 dana)
          </p>
          <p className="mt-0.5 font-mono text-lg tabular-nums text-accent-400">
            {formatNumber(automation.repliesLast7Days)}
          </p>
        </div>
      </div>
    </Card>
  );
}

/**
 * Deleting is confirmed in a real dialog rather than `window.confirm`: the
 * native one cannot say what survives the delete, and here that is the point —
 * the replies already posted under the videos stay posted.
 */
function DeleteConfirmDialog({
  automation,
  busy,
  onCancel,
  onConfirm,
}: {
  automation: YtAutomationView | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={automation !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Obrisati automatizaciju?</DialogTitle>
          <DialogDescription>
            {automation === null
              ? null
              : `„${automation.name}” se briše i više neće odgovarati na komentare. Log komentara ostaje sačuvan, a odgovori koji su već objavljeni ostaju na YouTube-u.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={busy}
          >
            Otkaži
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onConfirm}
            disabled={busy}
            className="bg-danger font-semibold text-surface-dark hover:bg-danger/90"
          >
            {busy ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                <span>Brišem…</span>
              </>
            ) : (
              "Obriši"
            )}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

export function YtAutomationsListSkeleton() {
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
            <Skeleton className="h-12 w-full max-w-sm rounded-lg" />
          </div>
        </Card>
      ))}
    </div>
  );
}
