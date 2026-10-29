"use client";


// Preneto iz Devotion apps/web/components/workspace/chat/conversation-pane.tsx (main @ c05c40f), SPAJANJE S15.
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "@/lib/toast";
import {
  Archive,
  ArrowLeft,
  AtSign,
  Bell,
  BellOff,
  Check,
  ExternalLink,
  Hash,
  MessagesSquare,
  MoreVertical,
  Settings2,
  Upload,
  Users,
} from "lucide-react";
import { chatConversationPermissions, personalSubtitle } from "@/lib/prostor";

import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ChannelMembersDialog } from "@/components/app/prostor/poruke/channel-members-dialog";
import { MessageComposer } from "@/components/app/prostor/poruke/message-composer";
import { MessageList } from "@/components/app/prostor/poruke/message-list";
import { useAttachmentSender } from "@/components/app/prostor/poruke/use-attachment-sender";
import { useChatPresence } from "@/components/app/prostor/poruke/use-chat-presence";
import {
  ulogaCeta,
  useVlasnikPlatforme,
} from "@/components/app/prostor/poruke/uloge";
import {
  AREA_ICONS,
  getAreaTint,
  ProfileAvatar,
} from "@/components/app/prostor/zajednicko/radni-ui";
import type {
  ProfileWithAvatar,
  StartupWithAreas,
} from "@/lib/prostor/rute";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  channelDisplayName,
  type ChatChannel,
  type ChatMember,
  type ChatMessage,
} from "@/lib/prostor/web/chat";
import type { AreaKey } from "@/lib/prostor/web/projekat";
import { cn } from "@/lib/utils";

const NOTIFICATION_OPTIONS = [
  { level: "all" as const, label: "Sva obaveštenja", icon: Bell },
  { level: "mentions" as const, label: "Samo pominjanja", icon: AtSign },
  { level: "none" as const, label: "Bez obaveštenja", icon: BellOff },
];

export function ConversationPane({
  workspace,
  profile,
  channel,
  members,
  onOpenList,
  onOpenPage,
  splitAt = "lg",
  contextLabel,
  onOpenInStartup,
  onOpenGroupSettings,
  preview,
  animateArrivals = false,
}: {
  /** Projekat kanala; `null` za lični razgovor (ili projekat van liste ljuske). */
  workspace: StartupWithAreas | null;
  profile: ProfileWithAvatar;
  channel: ChatChannel;
  /**
   * Članovi opsega: tim projekta za kanal projekta, članovi razgovora
   * (`chat.channelMembers`) za lični razgovor.
   */
  members: ChatMember[] | undefined;
  onOpenList: () => void;
  onOpenPage: (pageId: Id<"pages">) => void;
  /** Od koje širine lista i razgovor stoje jedno pored drugog (tada se „Nazad“ krije). */
  splitAt?: "lg" | "xl";
  /** Ispred podnaslova (globalne Poruke: ime projekta kanala). */
  contextLabel?: string;
  /** Stavka menija „Otvori u projektu“ (globalne Poruke, kanal projekta). */
  onOpenInStartup?: () => void;
  /** Stavka menija „Podešavanja grupe“ (lična grupa). */
  onOpenGroupSettings?: () => void;
  /** Izlog: statične poruke, bez pretplate, čitanja i prisustva. */
  preview?: ChatMessage[];
  /** Nova poruka ulazi kratkim springom (globalne Poruke). */
  animateArrivals?: boolean;
}) {
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  /**
   * Broji poslate poruke. Samo signal za `MessageList` da skoči na dno —
   * raste pri svakom slanju, vrednost ne znači ništa osim „upravo je poslato".
   */
  const [sentTick, setSentTick] = useState(0);
  /**
   * Gleda li korisnik dno ovog razgovora. Jedini potrošač je prisustvo: dok je
   * `true` (i prozor vidljiv), nova poruka u OVOM kanalu ne pravi obaveštenje —
   * korisnik ju je video uživo (`docs/mobile/lanac5/PLAN.md` §1.3).
   */
  const [atBottom, setAtBottom] = useState(true);
  /** Brojač `dragenter`/`dragleave` — ulazak u dete-element inače gasi overlay. */
  const dragDepthRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const vlasnikPlatforme = useVlasnikPlatforme();
  const markChannelRead = useMutation(api.prostor.chat.markChannelRead);
  const setNotificationLevel = useMutation(api.prostor.chat.setNotificationLevel);
  const archiveChannel = useMutation(api.prostor.chat.archiveChannel);

  // Otvaranje kanala i svaka nova poruka (lastMessageAt) čiste nepročitano —
  // prikaz je u prvom planu dok je montiran (04-CHAT.md §5).
  const live = preview === undefined;
  useEffect(() => {
    if (!live) return;
    void markChannelRead({ channelId: channel._id }).catch(() => {
      // Neuspelo označavanje ne sme da blokira čitanje.
    });
  }, [channel._id, channel.lastMessageAt, markChannelRead, live]);

  useChatPresence(channel._id, atBottom && live);

  const handleSent = useCallback(() => {
    setReplyTo(null);
    setSentTick((tick) => tick + 1);
  }, []);

  const { uploading, sendAttachment, sendFiles } = useAttachmentSender({
    channel,
    replyTo,
    onSent: handleSent,
  });

  const name = channelDisplayName(channel);
  const personal = channel.workspaceId === null;
  const areaKey =
    channel.kind === "area"
      ? workspace?.areas.find((area) => area._id === channel.areaId)?.key
      : undefined;
  const baseSubtitle = personal
    ? personalSubtitle(
        channel.kind,
        channel.kind === "custom" ? (members?.length ?? null) : null,
      )
    : conversationSubtitle(channel, areaKey, workspace);
  const subtitle = contextLabel ? `${contextLabel} · ${baseSubtitle}` : baseSubtitle;

  async function changeLevel(level: "all" | "mentions" | "none") {
    try {
      await setNotificationLevel({ channelId: channel._id, level });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Podešavanje nije sačuvano.",
      );
    }
  }

  async function archive() {
    setArchiving(true);
    try {
      await archiveChannel({ channelId: channel._id });
      setArchiveOpen(false);
      toast.success("Razgovor je arhiviran.");
      onOpenList();
    } catch (error) {
      setArchiveOpen(false);
      toast.error(
        error instanceof Error ? error.message : "Razgovor nije arhiviran.",
      );
    } finally {
      setArchiving(false);
    }
  }

  // Lični razgovor se ne arhivira i nema članstvo koje vodi vlasnik platforme:
  // grupom upravlja njen vlasnik kroz „Podešavanja grupe“. Radnje vlasnika
  // platforme su ogledalo serverskih gejtova (`chat.archiveChannel`,
  // `chat.setChannelMembers`: samo vlasnik platforme i samo `custom` kanal).
  const permissions = chatConversationPermissions(
    ulogaCeta(vlasnikPlatforme),
    channel,
  );
  const canArchive = permissions.canArchive;
  const canManageMembers = permissions.canManageMembers;
  const showGroupSettings =
    permissions.canOpenGroupSettings && onOpenGroupSettings !== undefined;
  const showOpenInStartup = !personal && onOpenInStartup !== undefined;

  /** Ima li drag uopšte fajlove — prevučen tekst ne sme da otvori zonu za slanje. */
  function dragHasFiles(event: React.DragEvent<HTMLDivElement>): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes("Files");
  }

  return (
    <div
      className="relative flex h-full min-h-0 flex-col bg-background"
      onDragEnter={(event) => {
        if (!dragHasFiles(event)) return;
        dragDepthRef.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        // Bez ovoga pregledač otvori fajl umesto da ga preda `onDrop`-u.
        if (!dragHasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!dragHasFiles(event)) return;
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        if (!dragHasFiles(event)) return;
        event.preventDefault();
        dragDepthRef.current = 0;
        setDragging(false);
        sendFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line-soft bg-background px-3 sm:px-4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("size-9 shrink-0", splitAt === "xl" ? "xl:hidden" : "lg:hidden")}
          aria-label="Nazad na razgovore"
          onClick={onOpenList}
        >
          <ArrowLeft className="size-4" />
        </Button>

        <ConversationIcon channel={channel} areaKey={areaKey} personal={personal} />

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-copy font-semibold">{name}</h2>
          <p className="truncate text-meta text-text-muted">{subtitle}</p>
        </div>

        {channel.kind === "thread" && channel.anchorType === "page" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0"
            onClick={() => onOpenPage(channel.anchorId as Id<"pages">)}
          >
            <ExternalLink className="size-4" /> Otvori
          </Button>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0"
              aria-label="Opcije razgovora" />}>
              <MoreVertical className="size-4" />
            </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {showOpenInStartup || showGroupSettings ? (
              <>
                {showOpenInStartup ? (
                  <DropdownMenuItem onClick={() => onOpenInStartup?.()}>
                    <ExternalLink className="size-4" /> Otvori u projektu
                  </DropdownMenuItem>
                ) : null}
                {showGroupSettings ? (
                  <DropdownMenuItem onClick={() => onOpenGroupSettings?.()}>
                    <Settings2 className="size-4" /> Podešavanja grupe
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuGroup>
              <DropdownMenuLabel>Obaveštenja</DropdownMenuLabel>
              {NOTIFICATION_OPTIONS.map((option) => {
                const active = channel.notificationLevel === option.level;
                const Icon = option.icon;
                return (
                  <DropdownMenuItem
                    key={option.level}
                    onClick={() => void changeLevel(option.level)}
                  >
                    <Icon className="size-4" />
                    <span className="flex-1">{option.label}</span>
                    {active ? (
                      <Check
                        className="size-4 text-foreground"
                        aria-hidden="true"
                      />
                    ) : null}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
            {canManageMembers ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setMembersOpen(true)}>
                  <Users className="size-4" /> Članovi kanala
                </DropdownMenuItem>
              </>
            ) : null}
            {canArchive ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setArchiveOpen(true)}
                >
                  <Archive className="size-4" /> Arhiviraj razgovor
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <MessageList
        channel={channel}
        profile={profile}
        members={members}
        onReply={setReplyTo}
        onAtBottomChange={setAtBottom}
        scrollToBottomSignal={sentTick}
        preview={preview}
        animateArrivals={animateArrivals}
      />

      <MessageComposer
        channel={channel}
        profile={profile}
        members={members}
        replyTo={replyTo}
        uploading={uploading}
        sendAttachment={sendAttachment}
        sendFiles={sendFiles}
        onCancelReply={() => setReplyTo(null)}
        onSent={handleSent}
      />

      {/* Jedini ulaz je stavka „Članovi kanala" u meniju iznad. */}
      {canManageMembers ? (
        <ChannelMembersDialog
          open={membersOpen}
          onOpenChange={setMembersOpen}
          channel={channel}
          profile={profile}
          members={members}
        />
      ) : null}

      {canArchive ? (
        <ConfirmDialog
          open={archiveOpen}
          onOpenChange={setArchiveOpen}
          title="Arhivirati razgovor?"
          description={`Razgovor „${name}“ nestaje sa spiska svih članova. Poruke u njemu ostaju sačuvane, ali ga u aplikaciji ne možeš vratiti.`}
          confirmLabel="Arhiviraj"
          busyLabel="Arhiviram…"
          busy={archiving}
          onConfirm={() => void archive()}
        />
      ) : null}

      {/* Zona za puštanje pokriva CEO prozor razgovora — fajl se ne mora spustiti
          baš na spajalicu. `pointer-events-none` da ne pojede `dragover` roditelja
          (bez toga overlay treperi dok se prelazi preko njega). Obris je neutralan:
          puštanje fajla nije ni stanje ni primarna radnja, pa nema boje radnje. */}
      {dragging ? (
        <div
          role="status"
          className="pointer-events-none absolute inset-2 z-40 grid place-items-center rounded-xl border-2 border-dashed border-line-strong bg-surface-raised"
        >
          <div className="flex flex-col items-center gap-2 text-foreground">
            <Upload className="size-8" aria-hidden="true" />
            <p className="text-ui font-semibold">Pusti da pošalješ</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ConversationIcon({
  channel,
  areaKey,
  personal,
}: {
  channel: ChatChannel;
  areaKey: string | undefined;
  personal: boolean;
}) {
  if (personal && channel.kind === "custom") {
    return (
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Users className="size-4" aria-hidden="true" />
      </span>
    );
  }
  if (channel.kind === "dm" && channel.otherParticipant) {
    return (
      <ProfileAvatar
        profile={channel.otherParticipant}
        className="size-8 shrink-0"
      />
    );
  }
  if (channel.kind === "area" && areaKey) {
    const Icon = AREA_ICONS[areaKey as AreaKey] ?? Hash;
    return (
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg",
          getAreaTint(areaKey),
        )}
      >
        <Icon className="size-4" />
      </span>
    );
  }
  const Icon = channel.kind === "thread" ? MessagesSquare : Hash;
  return (
    <span className="grid size-8 shrink-0 place-items-center text-muted-foreground">
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}

function conversationSubtitle(
  channel: ChatChannel,
  areaKey: string | undefined,
  workspace: StartupWithAreas | null,
): string {
  switch (channel.kind) {
    case "startup":
      return "Ceo tim · svi članovi";
    case "area": {
      const area = workspace?.areas.find((item) => item.key === areaKey);
      return area ? `Kanal oblasti · ${area.label}` : "Kanal oblasti";
    }
    case "custom":
      return channel.isPrivate ? "Privatan kanal" : "Kanal";
    case "thread":
      return "Diskusija";
    case "dm":
      return "Direktna poruka";
    default:
      return "Razgovor";
  }
}
