"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { MessageSquare, RefreshCw, Sparkles } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { ConversationList } from "./conversation-list";
import { ChatView } from "./chat-view";
import { InboxSettingsDrawer } from "./inbox-settings-drawer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FeedbackNote } from "@/components/app/feedback";
import { cn } from "@/lib/utils";

export function InboxView() {
  const [selectedIgsid, setSelectedIgsid] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{
    tone: "success" | "danger";
    title: string;
  } | null>(null);

  const syncAction = useAction(api.instagramInbox.syncConversations);

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      setSyncFeedback(null);
      const res = await syncAction({});
      setSyncFeedback({
        tone: "success",
        title: `Sinhronizovano ${res.syncedConversations} razgovora i ${res.syncedMessages} poruka sa Instagrama.`,
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Greška pri sinhronizaciji sa Instagrama.";
      setSyncFeedback({ tone: "danger", title: msg });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-3">
      {syncFeedback && (
        <FeedbackNote
          tone={syncFeedback.tone}
          title={syncFeedback.title}
          className="shrink-0 animate-in fade-in-0"
        />
      )}

      {/* Main 2-pane Inbox container */}
      <Card className="flex-1 flex overflow-hidden border border-line bg-surface rounded-xl shadow-xs min-h-[600px] h-[calc(100vh-12rem)]">
        {/* Left pane: Conversation List */}
        <div
          className={cn(
            "w-full lg:w-80 xl:w-96 shrink-0 h-full flex flex-col",
            selectedIgsid ? "hidden lg:flex" : "flex",
          )}
        >
          <ConversationList
            selectedIgsid={selectedIgsid}
            onSelectConversation={setSelectedIgsid}
            onOpenSettings={() => setSettingsOpen(true)}
            onSync={handleSync}
            isSyncing={isSyncing}
          />
        </div>

        {/* Right pane: Chat View or Empty State */}
        <div
          className={cn(
            "flex-1 h-full min-w-0 flex flex-col bg-surface-sunken/10",
            selectedIgsid ? "flex" : "hidden lg:flex",
          )}
        >
          {selectedIgsid ? (
            <ChatView
              igsid={selectedIgsid}
              onBack={() => setSelectedIgsid(null)}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground space-y-4">
              <div className="size-14 rounded-full bg-surface-raised border border-line flex items-center justify-center text-muted-foreground shadow-2xs">
                <MessageSquare className="size-7 text-accent" />
              </div>
              <div className="max-w-sm space-y-1.5">
                <h3 className="text-base font-semibold text-foreground">
                  Izaberite razgovor
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Izaberite razgovor sa leve strane da biste pregledali istoriju
                  poruka i odgovorili korisniku unutar dozvoljenog 24h prozora.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSettingsOpen(true)}
                  className="text-xs font-medium"
                >
                  <Sparkles className="size-3.5 mr-1.5 text-accent" />
                  Ledolomci i meni
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSync}
                  disabled={isSyncing}
                  className="text-xs font-medium"
                >
                  <RefreshCw
                    className={cn(
                      "size-3.5 mr-1.5",
                      isSyncing && "animate-spin",
                    )}
                  />
                  Sinhronizuj
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Settings Modal (Ledolomci / Meni / Brzi odgovori) */}
      <InboxSettingsDrawer
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  );
}
