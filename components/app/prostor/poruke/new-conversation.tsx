"use client";


// Preneto iz Devotion apps/web/components/workspace/chat/new-conversation.tsx (main @ c05c40f), SPAJANJE S15.
import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "@/lib/toast";
import {
  ChevronDown,
  Hash,
  LoaderCircle,
  MessageSquarePlus,
  Plus,
  UserPlus,
} from "lucide-react";

import { useVlasnikPlatforme } from "@/components/app/prostor/poruke/uloge";
import { ProfileAvatar } from "@/components/app/prostor/zajednicko/radni-ui";
import type {
  ProfileWithAvatar,
  StartupMember,
  StartupWithAreas,
} from "@/lib/prostor/rute";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { useProjekatMutation } from "@/components/app/projekat-provider";

export function NewConversation({
  workspace,
  profile,
  members,
  onCreated,
}: {
  workspace: StartupWithAreas;
  profile: ProfileWithAvatar;
  members: StartupMember[] | undefined;
  onCreated: (channelId: Id<"chatChannels">) => void;
}) {
  const vlasnikPlatforme = useVlasnikPlatforme();
  const [dmOpen, setDmOpen] = useState(false);
  const [channelOpen, setChannelOpen] = useState(false);

  return (
    <>
      {/* Jedina primarna radnja ekrana. Kanale tima otvara samo vlasnik
          platforme, pa ostali dobijaju jedno dugme bez menija. */}
      {vlasnikPlatforme ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" variant="primary" size="sm" />}
          >
            Novo
            <ChevronDown data-icon="inline-end" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => setDmOpen(true)}>
              <UserPlus className="size-4" /> Nova poruka
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setChannelOpen(true)}>
              <MessageSquarePlus className="size-4" /> Novi kanal
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => setDmOpen(true)}
        >
          <Plus data-icon="inline-start" aria-hidden="true" />
          Nova poruka
        </Button>
      )}

      <NewDirectMessageDialog
        open={dmOpen}
        onOpenChange={setDmOpen}
        profile={profile}
        members={members}
        onCreated={onCreated}
      />
      {vlasnikPlatforme ? (
        <NewChannelDialog
          open={channelOpen}
          onOpenChange={setChannelOpen}
          workspace={workspace}
          profile={profile}
          members={members}
          onCreated={onCreated}
        />
      ) : null}
    </>
  );
}

function NewDirectMessageDialog({
  open,
  onOpenChange,
  profile,
  members,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: ProfileWithAvatar;
  members: StartupMember[] | undefined;
  onCreated: (channelId: Id<"chatChannels">) => void;
}) {
  const openDirectMessage = useProjekatMutation(api.prostor.chat.openDirectMessage);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<Id<"profiles"> | null>(null);

  const candidates = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (members ?? [])
      .filter((member) => member.profile._id !== profile._id)
      .filter(
        (member) =>
          term.length === 0 ||
          member.profile.displayName.toLowerCase().includes(term),
      );
  }, [members, profile._id, query]);

  async function start(otherProfileId: Id<"profiles">) {
    setBusyId(otherProfileId);
    try {
      // `workspaceId` ubacuje kuka projekta.
      const channelId = await openDirectMessage({ otherProfileId });
      onOpenChange(false);
      setQuery("");
      onCreated(channelId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Razgovor nije otvoren.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova poruka</DialogTitle>
          <DialogDescription>
            Izaberi člana tima da započneš direktan razgovor.
          </DialogDescription>
        </DialogHeader>
        <Input
          aria-label="Pretraži članove"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Pretraži članove…"
          autoFocus
        />
        <div className="scrollbar-thin max-h-72 space-y-1 overflow-y-auto">
          {members === undefined ? (
            <p className="px-2 py-6 text-center text-ui text-text-muted">
              Učitavanje članova…
            </p>
          ) : candidates.length === 0 ? (
            <p className="px-2 py-6 text-center text-ui text-text-muted">
              {query.trim()
                ? `Nema rezultata za „${query.trim()}".`
                : "Nema drugih članova u ovom projektu."}
            </p>
          ) : (
            candidates.map((member) => (
              <button
                key={member.profile._id}
                type="button"
                disabled={busyId !== null}
                onClick={() => void start(member.profile._id)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-control-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyId === member.profile._id ? (
                  <LoaderCircle className="size-8 shrink-0 animate-spin text-text-muted" />
                ) : (
                  <ProfileAvatar profile={member.profile} className="size-8" />
                )}
                <span className="min-w-0 flex-1 truncate text-ui font-medium">
                  {member.profile.displayName}
                </span>
              </button>
            ))
          )}
        </div>
      </DialogPopup>
    </Dialog>
  );
}

function NewChannelDialog({
  open,
  onOpenChange,
  workspace,
  profile,
  members,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: StartupWithAreas;
  profile: ProfileWithAvatar;
  members: StartupMember[] | undefined;
  onCreated: (channelId: Id<"chatChannels">) => void;
}) {
  const createChannel = useMutation(api.prostor.chat.createChannel);
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [selected, setSelected] = useState<Set<Id<"profiles">>>(new Set());
  const [busy, setBusy] = useState(false);

  const selectable = useMemo(
    () => (members ?? []).filter((member) => member.profile._id !== profile._id),
    [members, profile._id],
  );

  function toggle(profileId: Id<"profiles">) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(profileId)) next.delete(profileId);
      else next.add(profileId);
      return next;
    });
  }

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const channelId = await createChannel({
        workspaceId: workspace._id,
        name: name.trim(),
        isPrivate,
        memberProfileIds: [...selected],
      });
      onOpenChange(false);
      setName("");
      setIsPrivate(false);
      setSelected(new Set());
      onCreated(channelId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kanal nije kreiran.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novi kanal</DialogTitle>
          <DialogDescription>
            Kanal za temu izvan oblasti. Privatan kanal vide samo dodati članovi.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="new-channel-name" className="text-ui font-medium">
              Naziv
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-line-control bg-card px-2.5">
              <Hash className="size-4 shrink-0 text-text-muted" />
              <Input
                id="new-channel-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="npr. lansiranje"
                autoFocus
                maxLength={120}
                className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5">
            <Checkbox
              checked={isPrivate}
              onCheckedChange={(checked) => setIsPrivate(checked)}
            />
            <span className="text-ui">
              Privatan kanal
              <span className="block text-meta text-text-muted">
                Vidljiv samo dodatim članovima.
              </span>
            </span>
          </label>

          <div className="space-y-1.5">
            <p className="text-ui font-medium">Članovi</p>
            <div className="scrollbar-thin max-h-48 space-y-1 overflow-y-auto rounded-lg border border-line-soft p-1">
              {members === undefined ? (
                <p className="px-2 py-3 text-meta text-text-muted">
                  Učitavanje članova…
                </p>
              ) : selectable.length === 0 ? (
                <p className="px-2 py-3 text-meta text-text-muted">
                  Nema drugih članova.
                </p>
              ) : (
                selectable.map((member) => (
                  <label
                    key={member.profile._id}
                    className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-control-hover"
                  >
                    <Checkbox
                      checked={selected.has(member.profile._id)}
                      onCheckedChange={() => toggle(member.profile._id)}
                    />
                    <ProfileAvatar profile={member.profile} className="size-6" />
                    <span className="min-w-0 flex-1 truncate text-ui">
                      {member.profile.displayName}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Otkaži
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={busy || !name.trim()}
            onClick={() => void submit()}
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
            Kreiraj kanal
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
