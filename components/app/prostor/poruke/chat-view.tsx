"use client";

// Preneto iz Devotion apps/web/components/workspace/chat-view.tsx (main @ c05c40f), SPAJANJE S15.
import { useMemo } from "react";
import { MessagesSquare } from "lucide-react";

import { ChannelList } from "@/components/app/prostor/poruke/channel-list";
import { ConversationPane } from "@/components/app/prostor/poruke/conversation-pane";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import type {
  ProfileWithAvatar,
  StartupMember,
  StartupWithAreas,
} from "@/lib/prostor/rute";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useProjekatQuery } from "@/components/app/projekat-provider";

export function ChatView({
  workspace,
  profile,
  channelId,
  onSelectChannel,
  onOpenList,
  onOpenPage,
}: {
  workspace: StartupWithAreas;
  profile: ProfileWithAvatar;
  channelId?: Id<"chatChannels">;
  onSelectChannel: (channelId: Id<"chatChannels">) => void;
  onOpenList: () => void;
  onOpenPage: (pageId: Id<"pages">) => void;
}) {
  const channels = useProjekatQuery(api.prostor.chat.listChannels);
  const members: StartupMember[] | undefined = useProjekatQuery(api.prostor.projekat.listMembers, {
    limit: 50,
  });

  const activeChannel = useMemo(
    () => channels?.find((channel) => channel._id === channelId) ?? null,
    [channels, channelId],
  );

  // Mobilni drill-down: izabran kanal skriva listu, prazan izbor skriva
  // razgovor. Na `lg+` obe kolone stoje jedna pored druge.
  return (
    <div className="flex h-full min-h-0">
      <div
        className={cn(
          "min-h-0 w-full shrink-0 flex-col border-line lg:flex lg:w-80 lg:min-w-72 lg:border-r",
          channelId ? "hidden lg:flex" : "flex",
        )}
      >
        <ChannelList
          workspace={workspace}
          profile={profile}
          channels={channels}
          members={members}
          activeChannelId={channelId}
          onSelectChannel={onSelectChannel}
        />
      </div>

      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col",
          channelId ? "flex" : "hidden lg:flex",
        )}
      >
        {activeChannel ? (
          <ConversationPane
            key={activeChannel._id}
            workspace={workspace}
            profile={profile}
            channel={activeChannel}
            members={members}
            onOpenList={onOpenList}
            onOpenPage={onOpenPage}
            // Ulaz nove poruke i u porukama projekta (K19), isto kao u „Ja“.
            animateArrivals
          />
        ) : channelId && channels === undefined ? (
          <div role="status" aria-busy="true" className="flex h-full flex-col gap-4 p-6">
            <span className="sr-only">Učitavanje razgovora</span>
            <Skeleton className="h-6 w-48" />
            <div className="mt-auto space-y-3">
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="ml-auto h-10 w-1/2" />
              <Skeleton className="h-10 w-3/5" />
            </div>
          </div>
        ) : channelId ? (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyState
              icon={MessagesSquare}
              title="Razgovor ne postoji"
              description="Možda je arhiviran ili nemaš pristup."
              action={
                <Button type="button" variant="outline" size="sm" onClick={onOpenList}>
                  Nazad na razgovore
                </Button>
              }
              className="max-w-md"
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyState
              icon={MessagesSquare}
              title="Izaberi razgovor"
              description="Otvori kanal ili poruku iz liste."
              className="max-w-md"
            />
          </div>
        )}
      </div>
    </div>
  );
}
