"use client";


// Preneto iz Devotion apps/web/components/workspace/chat/channel-members-dialog.tsx (main @ c05c40f), SPAJANJE S15.
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "@/lib/toast";
import { LoaderCircle } from "lucide-react";

import { ProfileAvatar } from "@/components/app/prostor/zajednicko/radni-ui";
import type { ProfileWithAvatar } from "@/lib/prostor/rute";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogPopup,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ChatChannel, ChatMember } from "@/lib/prostor/web/chat";
import { cn } from "@/lib/utils";

/**
 * „Članovi kanala" nad postojećim custom kanalom. Do faze P3 su se članovi birali
 * SAMO pri kreiranju (`new-conversation.tsx`), pa je privatan kanal bio ćorsokak
 * na obe platforme — `chat.setChannelMembers` nije postojala.
 *
 * Vlasnik kanala je čekiran i zaključan: server ga nikad ne uklanja, pa kvadratić
 * koji ništa ne radi ne sme ni da postoji. Sopstveni red se ne nudi (isti izbor
 * kao `NewChannelDialog`).
 *
 * Bez „Poništi" trake — web reverziju ima kroz sam dijalog (otvori, odčekiraj,
 * sačuvaj); traka je konvencija mobilnog klijenta (`apps/mobile/src/lib/undo.ts`).
 */
export function ChannelMembersDialog({
  open,
  onOpenChange,
  channel,
  profile,
  members,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: ChatChannel;
  profile: ProfileWithAvatar;
  members: ChatMember[] | undefined;
}) {
  const current = useQuery(
    api.prostor.chat.channelMembers,
    open ? { channelId: channel._id } : "skip",
  );
  const setChannelMembers = useMutation(api.prostor.chat.setChannelMembers);
  /**
   * `null` = korisnik još nije dirao kvadratiće, pa se prikazuje živo stanje sa
   * servera. Prvi klik „zamrzava" izbor u `draft` i od tada tuđa izmena ne pomera
   * kvadratić pod kursorom. Bez efekta i bez `setState` u renderu.
   */
  const [draft, setDraft] = useState<Set<Id<"profiles">> | null>(null);
  const [busy, setBusy] = useState(false);

  const initial = useMemo(
    () =>
      new Set(
        (current ?? [])
          .map((row) => row.profile._id)
          .filter((profileId) => profileId !== profile._id),
      ),
    [current, profile._id],
  );
  const selected = draft ?? initial;

  const ownerIds = useMemo(
    () =>
      new Set(
        (current ?? [])
          .filter((row) => row.role === "owner")
          .map((row) => row.profile._id),
      ),
    [current],
  );
  const selectable = useMemo(
    () => (members ?? []).filter((member) => member.profile._id !== profile._id),
    [members, profile._id],
  );

  const loading = current === undefined || members === undefined;

  /** Zatvaranje uvek vraća `draft` na `null` — sledeće otvaranje kreće od servera. */
  function change(next: boolean) {
    if (!next) setDraft(null);
    onOpenChange(next);
  }

  function toggle(profileId: Id<"profiles">) {
    const next = new Set(selected);
    if (next.has(profileId)) next.delete(profileId);
    else next.add(profileId);
    setDraft(next);
  }

  async function submit() {
    setBusy(true);
    try {
      await setChannelMembers({
        channelId: channel._id,
        memberProfileIds: [...selected],
      });
      toast.success("Članovi kanala su izmenjeni.");
      change(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Članovi nisu sačuvani.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>Članovi kanala</DialogTitle>
          <DialogDescription>
            Kanal vide samo označeni članovi. Tvorac kanala ostaje uvek.
          </DialogDescription>
        </DialogHeader>

        <div className="scrollbar-thin max-h-72 space-y-1 overflow-y-auto rounded-lg border border-line-soft p-1">
          {loading ? (
            <div className="space-y-1 p-1">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : selectable.length === 0 ? (
            <p className="px-2 py-3 text-meta text-text-muted">
              U timu nema drugih članova.
            </p>
          ) : (
            selectable.map((member) => {
              const isOwner = ownerIds.has(member.profile._id);
              const checked = isOwner || selected.has(member.profile._id);
              return (
                <label
                  key={member.profile._id}
                  className={cn(
                    "flex min-h-10 items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors",
                    // Tvorac je zaključan: server ga nikad ne uklanja.
                    isOwner
                      ? "cursor-not-allowed opacity-60"
                      : "cursor-pointer hover:bg-surface-control-hover",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    disabled={isOwner || busy}
                    onCheckedChange={() => toggle(member.profile._id)}
                  />
                  <ProfileAvatar profile={member.profile} className="size-6" />
                  <span className="min-w-0 flex-1 truncate text-ui">
                    {member.profile.displayName}
                  </span>
                  {isOwner ? (
                    <span className="shrink-0 text-meta text-text-muted">
                      Tvorac kanala
                    </span>
                  ) : null}
                </label>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => change(false)}>
            Otkaži
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={busy || loading}
            onClick={() => void submit()}
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
            Sačuvaj
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
