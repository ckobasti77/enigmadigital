"use client";


// Preneto iz Devotion apps/web/components/workspace/chat/channel-list.tsx (main @ c05c40f), SPAJANJE S15.
import { Hash, MessagesSquare } from "lucide-react";

import { NewConversation } from "@/components/app/prostor/poruke/new-conversation";
import {
  AREA_ICONS,
  EmptyState,
  getAreaTint,
  ProfileAvatar,
} from "@/components/app/prostor/zajednicko/radni-ui";
import type {
  ProfileWithAvatar,
  StartupMember,
  StartupWithAreas,
} from "@/lib/prostor/rute";
import { CountBadge } from "@/components/app/system/count-badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Id } from "@/convex/_generated/dataModel";
import {
  CHAT_SECTIONS,
  channelDisplayName,
  channelSection,
  type ChatChannel,
} from "@/lib/prostor/web/chat";
import { hubMentionLabel, hubUnreadLabel } from "@/lib/prostor";
import type { AreaKey } from "@/lib/prostor/web/projekat";
import { cn } from "@/lib/utils";

export function ChannelList({
  workspace,
  profile,
  channels,
  members,
  activeChannelId,
  onSelectChannel,
}: {
  workspace: StartupWithAreas;
  profile: ProfileWithAvatar;
  channels: ChatChannel[] | undefined;
  members: StartupMember[] | undefined;
  activeChannelId?: Id<"chatChannels">;
  onSelectChannel: (channelId: Id<"chatChannels">) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line-soft px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-ui font-semibold text-foreground">
            Razgovori
          </h2>
        </div>
        <NewConversation
          workspace={workspace}
          profile={profile}
          members={members}
          onCreated={onSelectChannel}
        />
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {channels === undefined ? (
          <div className="space-y-2 px-1">
            {[0, 1, 2, 3, 4].map((item) => (
              <Skeleton key={item} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : channels.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title="Nema razgovora"
            description="Započni novi razgovor pomoću dugmeta iznad."
            className="mx-1 border-none bg-transparent"
          />
        ) : (
          CHAT_SECTIONS.map((section) => {
            const sectionChannels = channels.filter(
              (channel) => channelSection(channel.kind) === section.id,
            );
            if (sectionChannels.length === 0) return null;
            return (
              <section key={section.id} className="space-y-0.5">
                <p className="heading-caps px-3 pb-1 text-meta text-text-muted">
                  {section.label}
                </p>
                {sectionChannels.map((channel) => (
                  <ChannelRow
                    key={channel._id}
                    workspace={workspace}
                    channel={channel}
                    active={channel._id === activeChannelId}
                    onSelect={() => onSelectChannel(channel._id)}
                  />
                ))}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

function ChannelRow({
  workspace,
  channel,
  active,
  onSelect,
}: {
  workspace: StartupWithAreas;
  channel: ChatChannel;
  active: boolean;
  onSelect: () => void;
}) {
  const name = channelDisplayName(channel);
  const areaKey =
    channel.kind === "area"
      ? workspace.areas.find((area) => area._id === channel.areaId)?.key
      : undefined;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex min-h-12 w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition-colors",
        // Izabran razgovor je izbor, ne radnja: neutralna podloga, bez boje radnje.
        active
          ? "bg-surface-control-hover text-foreground"
          : "text-text-secondary hover:bg-surface-control",
      )}
    >
      <ChannelIcon channel={channel} areaKey={areaKey} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ui font-semibold">{name}</span>
        <span className="block truncate text-meta text-text-muted">
          {channel.lastMessagePreview || "Bez poruka"}
        </span>
      </span>
      <UnreadIndicator channel={channel} />
    </button>
  );
}

function ChannelIcon({
  channel,
  areaKey,
}: {
  channel: ChatChannel;
  areaKey: string | undefined;
}) {
  if (channel.kind === "dm") {
    return channel.otherParticipant ? (
      <ProfileAvatar
        profile={channel.otherParticipant}
        className="size-8 shrink-0"
      />
    ) : (
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-control text-text-secondary">
        <Hash className="size-4" />
      </span>
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
    <span className="grid size-8 shrink-0 place-items-center text-text-secondary">
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}

/**
 * Nepročitano: pominjanja uvek nose broj (bitna su); kanal utišan na „samo @"
 * dobija tihu tačku umesto broja; inače brojčani bedž (04-CHAT.md §5). Sve je
 * neutralno — nepročitana poruka je posao koji čeka, ne greška ni radnja.
 */
function UnreadIndicator({ channel }: { channel: ChatChannel }) {
  if (channel.mentionCount > 0) {
    return (
      <span
        role="img"
        aria-label={hubMentionLabel(channel.mentionCount)}
        className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-surface-raised px-1.5 text-meta font-semibold leading-none tabular-nums text-foreground ring-1 ring-line"
      >
        @{channel.mentionCount > 99 ? "99+" : channel.mentionCount}
      </span>
    );
  }
  if (channel.unreadCount > 0) {
    if (channel.notificationLevel === "mentions") {
      return (
        <span className="size-2 shrink-0 rounded-full bg-text-muted">
          <span className="sr-only">Nova poruka</span>
        </span>
      );
    }
    return (
      <CountBadge
        count={channel.unreadCount}
        tone="neutral"
        label={hubUnreadLabel(channel.unreadCount)}
      />
    );
  }
  return null;
}
