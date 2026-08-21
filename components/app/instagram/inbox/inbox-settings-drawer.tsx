"use client";

import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import {
  HelpCircle,
  Menu as MenuIcon,
  MessageSquare,
  Plus,
  Send,
  Trash2,
  X,
  Info,
  Sparkles,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { FeedbackNote, type FeedbackTone } from "@/components/app/feedback";
import {
  ICE_BREAKERS_MAX,
  ICE_BREAKER_QUESTION_MAX,
  MENU_ITEMS_MAX,
  MENU_TITLE_MAX,
} from "@/convex/lib/orProfile";
import { BUTTON_TITLE_MAX, QUICK_REPLIES_MAX } from "@/convex/lib/orButtons";
import { cn } from "@/lib/utils";

interface InboxSettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InboxSettingsDrawer({
  open,
  onOpenChange,
}: InboxSettingsDrawerProps) {
  const [activeTab, setActiveTab] = useState<"icebreakers" | "menu" | "quickreplies">(
    "icebreakers",
  );

  const profileData = useQuery(api.orProfileMenu.getProfileMenu, {});
  const automations = useQuery(api.orAutomationsApi.listAutomations, {});

  const saveMenuMutation = useMutation(api.orProfileMenu.saveProfileMenu);
  const publishAction = useAction(api.orProfileMenu.publish);

  // Local state for Ice Breakers
  const [iceBreakers, setIceBreakers] = useState<
    Array<{ question: string; automationId: string; payload?: string }>
  >([]);
  const [menuItems, setMenuItems] = useState<
    Array<{
      title: string;
      type: "url" | "postback";
      url?: string;
      automationId?: string;
      payload?: string;
    }>
  >([]);

  // Quick replies sample / local configuration
  const [savedQuickReplies, setSavedQuickReplies] = useState<string[]>([
    "Koje je radno vreme?",
    "Gde se nalazite?",
    "Cenovnik usluga",
    "Kontakt telefon",
  ]);
  const [newQuickReply, setNewQuickReply] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: FeedbackTone;
    title: string;
  } | null>(null);

  // Initialize from server when loaded
  const [initialized, setInitialized] = useState(false);
  if (profileData && !initialized) {
    if (Array.isArray(profileData.iceBreakers) && profileData.iceBreakers.length > 0) {
      setIceBreakers(
        (
          profileData.iceBreakers as Array<{
            question: string;
            automationId?: string;
            payload?: string | null;
          }>
        ).map((ib) => ({
          question: ib.question,
          automationId: ib.automationId ?? "",
          payload: ib.payload ?? undefined,
        })),
      );
    }
    if (Array.isArray(profileData.menuItems) && profileData.menuItems.length > 0) {
      setMenuItems(
        (
          profileData.menuItems as Array<{
            title: string;
            type: "url" | "postback";
            url?: string | null;
            automationId?: string | null;
            payload?: string | null;
          }>
        ).map((m) => ({
          title: m.title,
          type: m.type,
          url: m.url ?? undefined,
          automationId: m.automationId ?? "",
          payload: m.payload ?? undefined,
        })),
      );
    }
    setInitialized(true);
  }

  const handleAddIceBreaker = () => {
    if (iceBreakers.length >= ICE_BREAKERS_MAX) return;
    const defaultAutomationId = automations && automations.length > 0 ? automations[0]._id : "";
    setIceBreakers([...iceBreakers, { question: "", automationId: defaultAutomationId }]);
  };

  const handleRemoveIceBreaker = (idx: number) => {
    setIceBreakers(iceBreakers.filter((_, i) => i !== idx));
  };

  const handleSaveAndPublishProfile = async () => {
    try {
      setIsSaving(true);
      setFeedback(null);

      // Validate that each ice breaker has an automation selected
      const validIceBreakers = iceBreakers.filter(
        (ib) => ib.question.trim().length > 0,
      );
      for (const ib of validIceBreakers) {
        if (!ib.automationId) {
          setFeedback({
            tone: "warning",
            title: "Izaberite automatizaciju za svako pitanje ledolomca.",
          });
          setIsSaving(false);
          return;
        }
      }

      // Validate menu items
      const validMenuItems = menuItems.filter(
        (m) => m.title.trim().length > 0,
      );
      for (const m of validMenuItems) {
        if (m.type === "postback" && !m.automationId) {
          setFeedback({
            tone: "warning",
            title: "Izaberite automatizaciju za svaku stavku menija koja nije link.",
          });
          setIsSaving(false);
          return;
        }
      }

      // 1. Save to database
      await saveMenuMutation({
        iceBreakers: validIceBreakers.map((ib) => ({
          question: ib.question,
          automationId: ib.automationId as Id<"orAutomations">,
          payload: ib.payload,
        })),
        menuItems: validMenuItems.map((m) => ({
          title: m.title,
          type: m.type,
          url: m.type === "url" ? m.url?.trim() || undefined : undefined,
          automationId:
            m.type === "postback"
              ? (m.automationId as Id<"orAutomations">)
              : undefined,
          payload: m.payload,
        })),
      });

      // 2. Publish to Instagram Messenger Profile
      await publishAction({});
      setFeedback({
        tone: "success",
        title: "Podešavanja su uspešno objavljena na Instagram profilu!",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Greška pri čuvanju podešavanja.";
      setFeedback({ tone: "danger", title: msg });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddQuickReply = () => {
    if (!newQuickReply.trim() || savedQuickReplies.length >= QUICK_REPLIES_MAX)
      return;
    setSavedQuickReplies([...savedQuickReplies, newQuickReply.trim()]);
    setNewQuickReply("");
  };

  const handleRemoveQuickReply = (idx: number) => {
    setSavedQuickReplies(savedQuickReplies.filter((_, i) => i !== idx));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
            <Sparkles className="size-5 text-accent" />
            Podešavanja Instagram Inbox-a
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Upravljajte ledolomcima (Ice Breakers), menijem profila i brzim odgovorima.
          </DialogDescription>
        </DialogHeader>

        {/* Tab Navigation */}
        <div className="flex rounded-lg border border-line bg-surface-sunken p-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => setActiveTab("icebreakers")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md transition-colors",
              activeTab === "icebreakers"
                ? "bg-surface-raised font-semibold text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <HelpCircle className="size-4" />
            Ledolomci ({iceBreakers.length}/{ICE_BREAKERS_MAX})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("menu")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md transition-colors",
              activeTab === "menu"
                ? "bg-surface-raised font-semibold text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <MenuIcon className="size-4" />
            Meni profila ({menuItems.length}/{MENU_ITEMS_MAX})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("quickreplies")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md transition-colors",
              activeTab === "quickreplies"
                ? "bg-surface-raised font-semibold text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <MessageSquare className="size-4" />
            Brzi odgovori ({savedQuickReplies.length}/{QUICK_REPLIES_MAX})
          </button>
        </div>

        {feedback && (
          <FeedbackNote tone={feedback.tone} title={feedback.title} className="my-2" />
        )}

        {/* Tab 1: Ledolomci (Ice Breakers) */}
        {activeTab === "icebreakers" && (
          <div className="space-y-4 pt-2">
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
              <Info className="size-4 shrink-0 mt-0.5" />
              <div>
                <strong>Važna napomena za Ledolomce:</strong> Prikazuju se isključivo na
                mobilnoj Instagram aplikaciji kada korisnik prvi put započne prepisku sa vašim
                nalogom. <em>Ne prikazuju se na desktop pretraživačima.</em>
              </div>
            </div>

            <div className="space-y-3">
              {iceBreakers.map((ib, idx) => (
                <Card key={idx} className="p-3 bg-surface-raised border border-line space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Pitanje #{idx + 1}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {ib.question.length} / {ICE_BREAKER_QUESTION_MAX} znakova
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={ib.question}
                      maxLength={ICE_BREAKER_QUESTION_MAX}
                      placeholder="npr. Koje je vaše radno vreme?"
                      onChange={(e) => {
                        const updated = [...iceBreakers];
                        updated[idx].question = e.target.value;
                        setIceBreakers(updated);
                      }}
                      className="flex-1 text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveIceBreaker(idx)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  {/* Automation selector */}
                  <div className="pt-1">
                    <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                      Pokreće automatizaciju:
                    </label>
                    <select
                      value={ib.automationId}
                      onChange={(e) => {
                        const updated = [...iceBreakers];
                        updated[idx].automationId = e.target.value;
                        setIceBreakers(updated);
                      }}
                      className="w-full text-xs rounded-md border border-line bg-surface px-2.5 py-1.5 text-foreground"
                    >
                      <option value="">-- Izaberi automatizaciju --</option>
                      {automations?.map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.name} ({a.trigger})
                        </option>
                      ))}
                    </select>
                  </div>
                </Card>
              ))}

              {iceBreakers.length < ICE_BREAKERS_MAX && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddIceBreaker}
                  className="w-full flex items-center justify-center gap-2 border-dashed py-3"
                >
                  <Plus className="size-4" />
                  Dodaj ledolomac ({iceBreakers.length}/{ICE_BREAKERS_MAX})
                </Button>
              )}
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button
                onClick={handleSaveAndPublishProfile}
                disabled={isSaving}
                className="font-medium"
              >
                <Send className="size-4 mr-1.5" />
                {isSaving ? "Objavljivanje..." : "Sačuvaj i objavi na Instagram"}
              </Button>
            </div>
          </div>
        )}

        {/* Tab 2: Meni profila (Persistent Menu) */}
        {activeTab === "menu" && (
          <div className="space-y-4 pt-2">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Meni profila stoji u dnu ekrana za unos u Instagram aplikaciji i omogućava
              brzi pristup linkovima ili automatizovanim odgovorima.
            </p>

            <div className="space-y-3">
              {menuItems.map((item, idx) => (
                <Card key={idx} className="p-3 bg-surface-raised border border-line space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Stavka menija #{idx + 1}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {item.title.length} / {MENU_TITLE_MAX}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={item.title}
                      maxLength={MENU_TITLE_MAX}
                      placeholder="Naslov stavke (npr. Poseti naš sajt)"
                      onChange={(e) => {
                        const updated = [...menuItems];
                        updated[idx].title = e.target.value;
                        setMenuItems(updated);
                      }}
                      className="flex-1 text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setMenuItems(menuItems.filter((_, i) => i !== idx))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  {item.type === "url" && (
                    <Input
                      value={item.url ?? ""}
                      placeholder="https://primer.rs"
                      onChange={(e) => {
                        const updated = [...menuItems];
                        updated[idx].url = e.target.value;
                        setMenuItems(updated);
                      }}
                      className="text-sm font-mono"
                    />
                  )}
                </Card>
              ))}

              {menuItems.length < MENU_ITEMS_MAX && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setMenuItems([
                      ...menuItems,
                      { title: "", type: "url", url: "https://" },
                    ])
                  }
                  className="w-full flex items-center justify-center gap-2 border-dashed py-3"
                >
                  <Plus className="size-4" />
                  Dodaj stavku menija ({menuItems.length}/{MENU_ITEMS_MAX})
                </Button>
              )}
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button
                onClick={handleSaveAndPublishProfile}
                disabled={isSaving}
                className="font-medium"
              >
                <Send className="size-4 mr-1.5" />
                {isSaving ? "Objavljivanje..." : "Sačuvaj i objavi na Instagram"}
              </Button>
            </div>
          </div>
        )}

        {/* Tab 3: Brzi odgovori (Quick Replies) */}
        {activeTab === "quickreplies" && (
          <div className="space-y-4 pt-2">
            <div className="text-xs text-muted-foreground leading-relaxed">
              Brzi odgovori su dugmad koja se mogu poslati uz poruku. Korisnik jednim dodirom
              šalje odgovor. Instagram ograničava dužinu dugmeta na najviše 20 znakova.
            </div>

            {/* Add new quick reply with live truncation preview */}
            <div className="space-y-2 rounded-lg border border-line bg-surface-sunken p-3">
              <span className="text-xs font-semibold text-foreground">
                Novi brzi odgovor
              </span>
              <div className="flex gap-2">
                <Input
                  value={newQuickReply}
                  maxLength={BUTTON_TITLE_MAX}
                  placeholder="npr. Pošalji katalog"
                  onChange={(e) => setNewQuickReply(e.target.value)}
                  className="text-sm"
                />
                <Button
                  onClick={handleAddQuickReply}
                  disabled={!newQuickReply.trim() || savedQuickReplies.length >= QUICK_REPLIES_MAX}
                >
                  <Plus className="size-4 mr-1" />
                  Dodaj
                </Button>
              </div>

              {/* Live Preview of Truncation */}
              {newQuickReply.length > 0 && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[11px] text-muted-foreground">Prikaz na IG:</span>
                  <span className="inline-flex items-center rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
                    {newQuickReply.slice(0, BUTTON_TITLE_MAX)}
                    {newQuickReply.length > BUTTON_TITLE_MAX && "…"}
                  </span>
                  <span className="text-[11px] text-muted-foreground ml-auto">
                    {newQuickReply.length} / {BUTTON_TITLE_MAX} znakova
                  </span>
                </div>
              )}
            </div>

            {/* List of saved quick replies */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">
                Sačuvani brzi odgovori ({savedQuickReplies.length}/{QUICK_REPLIES_MAX})
              </span>
              <div className="flex flex-wrap gap-2">
                {savedQuickReplies.map((qr, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-raised px-3 py-1 text-xs font-medium text-foreground shadow-sm"
                  >
                    <span>{qr.slice(0, BUTTON_TITLE_MAX)}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveQuickReply(idx)}
                      className="text-muted-foreground hover:text-destructive transition-colors ml-1"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogPopup>
    </Dialog>
  );
}
