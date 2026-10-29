"use client";

// Preneto iz Devotion apps/web/components/collab/checkpoint-comments-dialog.tsx (main @ c05c40f), SPAJANJE S11.
import { useMemo, useState } from "react";

import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQueryTolerant } from "@/components/app/prostor/podaci/ja";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

import { CommentsSection } from "@/components/app/prostor/saradnja/comments-section";
import type { MentionMember } from "@/components/app/prostor/saradnja/comment-composer";
import { useLiveNow } from "@/components/app/prostor/saradnja/use-live-now";
import { useProjekatQueryTolerant } from "@/components/app/prostor/podaci/projekat";

/**
 * Komentari jednog koraka zadatka (PROSTOR K07 §6.1, cilj `task_checkpoint`):
 * isti Komentari kao na stranici, u dijalogu otvorenom iz reda koraka. Projekat
 * daje okruženje (`useProjekat*`), pa `workspaceId` nije prop.
 */
export function CheckpointCommentsDialog({
  checkpointId,
  title,
  open,
  onOpenChange,
}: {
  checkpointId: Id<"taskCheckpoints"> | null;
  /** Tekst koraka (opis dijaloga). */
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-h-[min(44rem,90vh)] overflow-y-auto sm:max-w-[32rem]">
        <DialogHeader className="pr-8">
          <DialogTitle>Komentari koraka</DialogTitle>
          <DialogDescription>{title}</DialogDescription>
        </DialogHeader>
        {open && checkpointId ? <CheckpointComments checkpointId={checkpointId} /> : null}
        <DialogClose />
      </DialogPopup>
    </Dialog>
  );
}

function CheckpointComments({ checkpointId }: { checkpointId: Id<"taskCheckpoints"> }) {
  const membersResult = useProjekatQueryTolerant(api.prostor.projekat.listMembers, { limit: 50 });
  const profile = useQueryTolerant(api.prostor.profiles.getCurrent, {});
  const [initialNow] = useState(() => Date.now());
  const now = useLiveNow(initialNow);
  const members = useMemo<MentionMember[]>(
    () =>
      (membersResult ?? []).map(({ profile: member }) => ({
        profileId: member._id,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
      })),
    [membersResult],
  );
  return (
    <CommentsSection
      target={{ kind: "task_checkpoint", id: checkpointId }}
      members={members}
      selfProfileId={profile?._id ?? null}
      now={now}
    />
  );
}
