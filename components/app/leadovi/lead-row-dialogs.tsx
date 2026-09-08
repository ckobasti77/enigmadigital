"use client";

import type { Id } from "@/convex/_generated/dataModel";
import type { LeadStage } from "@/convex/leadCrmStore";
import {
  AssignDialog,
  MeetingDialog,
  NextActionDialog,
  OutcomeDialog,
  StageDialog,
  TouchDialog,
} from "./lead-quick-dialogs";
import type { LeadRowItem } from "./lead-urgency";

/**
 * Koji dijalog je otvoren nad kojim redom. Jedan primerak po ekranu — dijalog
 * se montira tek kad se otvori, pa početno stanje forme dolazi iz reda.
 */
export type LeadRowDialogState =
  | { kind: "meeting"; item: LeadRowItem; calledPhone?: string }
  | { kind: "nextAction" | "outcome" | "touch" | "assign"; item: LeadRowItem }
  | { kind: "stage"; item: LeadRowItem; stage: LeadStage };

/**
 * Dijalozi radnji iz reda (§5, §8) — sastanak, sledeći korak, ishod, dodir,
 * dodela, zatvorena faza. Ranije su živeli kao `switch` unutar tabele; mapa
 * (GL3) ima isti panel radnji nad istim redom, pa je izbor dijaloga izvučen
 * ovde da se ne kopira.
 */
export function LeadRowDialogs({
  workspaceId,
  dialog,
  onClose,
}: {
  workspaceId: Id<"workspaces">;
  dialog: LeadRowDialogState | null;
  onClose: () => void;
}) {
  if (!dialog) return null;

  const base = {
    workspaceId,
    companyId: dialog.item.assignment.companyId,
    companyName: dialog.item.company?.name ?? "Nepoznata firma",
    open: true,
    onOpenChange: (open: boolean) => {
      if (!open) onClose();
    },
  };
  const a = dialog.item.assignment;

  switch (dialog.kind) {
    case "meeting":
      return (
        <MeetingDialog
          {...base}
          current={
            a.meetingAt !== undefined
              ? { meetingAt: a.meetingAt, meetingNote: a.meetingNote }
              : null
          }
          currentStage={a.stage}
          calledPhone={dialog.calledPhone}
        />
      );
    case "nextAction":
      return (
        <NextActionDialog
          {...base}
          current={
            a.nextActionAt !== undefined
              ? { nextActionAt: a.nextActionAt, nextActionNote: a.nextActionNote }
              : null
          }
        />
      );
    case "outcome":
      return <OutcomeDialog {...base} />;
    case "touch":
      return <TouchDialog {...base} />;
    case "assign":
      return <AssignDialog {...base} currentOwnerUserId={a.ownerUserId} />;
    case "stage":
      return (
        <StageDialog {...base} currentStage={a.stage} initialStage={dialog.stage} />
      );
  }
}
