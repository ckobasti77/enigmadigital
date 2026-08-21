/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import {
  Clock,
  MessageCircle,
  Search,
  XCircle,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format";
import { RevealGroup } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

export type FilterType = "all" | "unread" | "expiring";

interface ConversationListProps {
  selectedIgsid: string | null;
  onSelectConversation: (igsid: string) => void;
  onOpenSettings: () => void;
  onSync: () => void;
  isSyncing: boolean;
}

export function ConversationList({
  selectedIgsid,
  onSelectConversation,
  onOpenSettings,
  onSync,
  isSyncing,
}: ConversationListProps) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");

  const conversations = useQuery(
    api.instagramInboxStore.listConversations,
    {
      filter,
      search: search.trim().length > 0 ? search.trim() : undefined,
    },
  );

  return (
    <div className="flex h-full flex-col border-r border-line bg-surface">
      {/* Header & Search */}
      <div className="p-3.5 space-y-3 border-b border-line">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessageCircle className="size-5 text-accent" />
            <h2 className="text-base font-semibold text-foreground">
              Instagram poruke
            </h2>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={onSync}
              disabled={isSyncing}
              title="Sinhronizuj razgovore sa Instagrama"
              className="size-8 text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={cn("size-4", isSyncing && "animate-spin")} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenSettings}
              title="Podešavanja ledolomaca i menija"
              className="size-8 text-muted-foreground hover:text-foreground"
            >
              <SlidersHorizontal className="size-4" />
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pretraži po imenu ili poruci..."
            className="pl-8 text-xs bg-surface-raised h-8"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex rounded-lg border border-line bg-surface-sunken p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "flex-1 py-1.5 px-2 rounded-md transition-colors text-center",
              filter === "all"
                ? "bg-surface-raised font-semibold text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Svi
          </button>
          <button
            type="button"
            onClick={() => setFilter("unread")}
            className={cn(
              "flex-1 py-1.5 px-2 rounded-md transition-colors text-center",
              filter === "unread"
                ? "bg-surface-raised font-semibold text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Nepročitani
          </button>
          <button
            type="button"
            onClick={() => setFilter("expiring")}
            className={cn(
              "flex-1 py-1.5 px-2 rounded-md transition-colors text-center",
              filter === "expiring"
                ? "bg-surface-raised font-semibold text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Prozor ističe
          </button>
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto divide-y divide-line/60">
        {conversations === undefined ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-3 items-center animate-pulse">
                <div className="size-10 rounded-full bg-muted/60" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-24 bg-muted/60 rounded" />
                  <div className="h-3 w-40 bg-muted/40 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground space-y-2">
            <MessageCircle className="size-8 mx-auto text-muted-foreground/50" />
            <p className="text-sm font-medium">Nema pronađenih razgovora</p>
            <p className="text-xs">
              {filter === "unread"
                ? "Sve poruke su pročitane."
                : filter === "expiring"
                  ? "Nema razgovora kojima uskoro ističe 24h prozor."
                  : "Poruke koje stignu na Instagram nalog pojaviće se ovde."}
            </p>
          </div>
        ) : (
          <RevealGroup className="divide-y divide-line/40">
            {conversations.map((conv) => {
              const isSelected = selectedIgsid === conv.igsid;
              const hasUnread = (conv.unreadCount ?? 0) > 0;
              const isExpiringSoon =
                conv.isWindowOpen && conv.windowRemainingMs <= 4 * 60 * 60 * 1000;

              return (
                <button
                  key={conv.igsid}
                  type="button"
                  onClick={() => onSelectConversation(conv.igsid)}
                  className={cn(
                    "w-full text-left p-3 transition-colors flex items-start gap-3 hover:bg-surface-raised/80",
                    isSelected && "bg-surface-raised border-l-2 border-accent font-medium",
                  )}
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    {conv.profilePic ? (
                      <img
                        src={conv.profilePic}
                        alt={conv.username ?? "Korisnik"}
                        className="size-10 rounded-full object-cover border border-line"
                      />
                    ) : (
                      <div className="size-10 rounded-full bg-accent/15 text-accent font-semibold flex items-center justify-center text-sm border border-accent/20">
                        {(conv.name || conv.username || "IG").slice(0, 2).toUpperCase()}
                      </div>
                    )}

                    {/* Unread indicator dot */}
                    {hasUnread && (
                      <span className="absolute -top-0.5 -right-0.5 size-3 bg-accent rounded-full border-2 border-surface" />
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className={cn(
                        "text-xs truncate font-semibold",
                        hasUnread ? "text-foreground font-bold" : "text-foreground/90",
                      )}>
                        {conv.name || (conv.username ? `@${conv.username}` : `Korisnik #${conv.igsid.slice(-4)}`)}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatRelativeTime(conv.lastMessageAt)}
                      </span>
                    </div>

                    {/* Last message preview */}
                    <p className={cn(
                      "text-xs truncate leading-snug",
                      hasUnread ? "text-foreground font-medium" : "text-muted-foreground",
                    )}>
                      {conv.lastMessageText || "Nema poruka"}
                    </p>

                    {/* Status & 24h Window Badge */}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      {/* Unread count */}
                      {hasUnread && (
                        <span className="inline-flex items-center rounded-full bg-accent text-accent-foreground px-1.5 py-0.2 text-[10px] font-bold">
                          {conv.unreadCount}
                        </span>
                      )}

                      {/* 24h Window Badge */}
                      {conv.isWindowOpen ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                            isExpiringSoon
                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse"
                              : "bg-surface-sunken text-muted-foreground border border-line",
                          )}
                          title={`Preostalo vreme u 24h prozoru za odgovor: ${conv.windowFormatted}`}
                        >
                          <Clock className="size-2.5" />
                          <span>{conv.windowFormatted}</span>
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 rounded-md bg-destructive/10 text-destructive border border-destructive/20 px-1.5 py-0.5 text-[10px] font-medium"
                          title="Prozor za odgovor od 24h je istekao."
                        >
                          <XCircle className="size-2.5" />
                          <span>Istekao prozor</span>
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </RevealGroup>
        )}
      </div>
    </div>
  );
}
