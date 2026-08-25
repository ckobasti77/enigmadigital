"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Edit2,
  Eye,
  FileText,
  Filter,
  Flame,
  HelpCircle,
  Inbox,
  Lock,
  MessageSquareReply,
  Plus,
  Radio,
  RefreshCw,
  Shield,
  ShieldAlert,
  Sliders,
  Trash2,
  User,
  Zap,
} from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogPopup,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { Field, FormGroup, FormStack } from "@/components/app/form-kit";
import { TabNav, TabPanel } from "@/components/app/tab-nav";
import { formatNumber, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type AutomationDoc = FunctionReturnType<
  typeof api.threadsAutomations.listAutomations
>[number];

type LogDoc = FunctionReturnType<
  typeof api.threadsAutomations.listAutomationLogs
>[number];

type TriggerType = "reply_to_our_post" | "mention" | "keyword";
type MatchType = "exact" | "contains";
type ActionType = "public_reply" | "hide" | "ignore" | "approve_pending";

const LOG_STATUS_CONFIG: Record<
  string,
  { label: string; tone: string; description: string }
> = {
  executed: {
    label: "Izvršeno uživo",
    tone: "border-success/40 bg-success/10 text-success font-semibold",
    description: "Poslat je stvarni javni odgovor na Threads",
  },
  draft_simulated: {
    label: "Simulirano u skici",
    tone: "border-accent-400/40 bg-accent-400/10 text-accent-400 font-semibold",
    description: "Zabeleženo u logu bez slanja na Threads",
  },
  rejected_limit: {
    label: "Odbijeno: dnevni limit",
    tone: "border-warning/40 bg-warning/10 text-warning font-semibold",
    description: "Dostignut maksimalni dnevni broj odgovora za ovo pravilo",
  },
  rejected_cooldown: {
    label: "Odbijeno: cooldown",
    tone: "border-warning/40 bg-warning/10 text-warning font-semibold",
    description: "Korisnik je već primio odgovor unutar definisanog intervala",
  },
  rejected_thread_limit: {
    label: "Odbijeno: limit po niti",
    tone: "border-warning/40 bg-warning/10 text-warning font-semibold",
    description: "Dostignut maksimalan broj odgovora u ovoj niti",
  },
  failed: {
    label: "Neuspešno",
    tone: "border-danger/40 bg-danger/10 text-danger font-semibold",
    description: "Greška pri izvršenju API poziva",
  },
  skipped_no_match: {
    label: "Nema poklapanja",
    tone: "border-line bg-surface text-text-muted",
    description: "Ključne reči nisu pronađene u sadržaju",
  },
};

export function ThreadsAutomations() {
  const [tab, setTab] = useState<"rules" | "log">("rules");
  const automations = useQuery(api.threadsAutomations.listAutomations);
  const logs = useQuery(api.threadsAutomations.listAutomationLogs, { limit: 100 });

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<AutomationDoc | null>(null);

  // Dijalozi za potvrdu
  const [deletingId, setDeletingId] = useState<Id<"threadsAutomations"> | null>(null);
  const [pendingGoLive, setPendingGoLive] = useState<AutomationDoc | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleAutomation = useMutation(api.threadsAutomations.toggleAutomation);
  const updateAutomation = useMutation(api.threadsAutomations.updateAutomation);
  const deleteAutomation = useMutation(api.threadsAutomations.deleteAutomation);

  const handleToggleActive = async (id: Id<"threadsAutomations">, current: boolean) => {
    try {
      await toggleAutomation({ id, isActive: !current });
    } catch {
      // Ignorisanje
    }
  };

  const handleGoLiveConfirm = async () => {
    if (!pendingGoLive) return;
    setBusy(true);
    try {
      await updateAutomation({
        id: pendingGoLive._id,
        name: pendingGoLive.name,
        mode: "live",
        keywords: pendingGoLive.keywords,
        matchType: pendingGoLive.matchType,
        caseSensitive: pendingGoLive.caseSensitive,
        matchAnyKeyword: pendingGoLive.matchAnyKeyword,
        matchAnyPost: pendingGoLive.matchAnyPost,
        postId: pendingGoLive.postId,
        actionType: pendingGoLive.actionType,
        replyText: pendingGoLive.replyText,
        linkUrl: pendingGoLive.linkUrl,
        topicTag: pendingGoLive.topicTag,
        autoPublishText: pendingGoLive.autoPublishText,
        dailyLimit: pendingGoLive.dailyLimit,
        cooldownMinutesPerAuthor: pendingGoLive.cooldownMinutesPerAuthor,
        maxRepliesPerThread: pendingGoLive.maxRepliesPerThread,
      });
      setPendingGoLive(null);
    } catch {
      // Error
    } finally {
      setBusy(false);
    }
  };

  const handleGoDraft = async (item: AutomationDoc) => {
    try {
      await updateAutomation({
        id: item._id,
        name: item.name,
        mode: "draft",
        keywords: item.keywords,
        matchType: item.matchType,
        caseSensitive: item.caseSensitive,
        matchAnyKeyword: item.matchAnyKeyword,
        matchAnyPost: item.matchAnyPost,
        postId: item.postId,
        actionType: item.actionType,
        replyText: item.replyText,
        linkUrl: item.linkUrl,
        topicTag: item.topicTag,
        autoPublishText: item.autoPublishText,
        dailyLimit: item.dailyLimit,
        cooldownMinutesPerAuthor: item.cooldownMinutesPerAuthor,
        maxRepliesPerThread: item.maxRepliesPerThread,
      });
    } catch {
      // Error
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    setBusy(true);
    try {
      await deleteAutomation({ id: deletingId });
      setDeletingId(null);
    } catch {
      // Error
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Upozorenje za OpenReply (§9) ─────────────────────────────────── */}
      <Card className="flex items-start gap-3 border-accent-400/30 bg-accent-400/5 p-4 shadow-card ring-line">
        <HelpCircle className="size-5 shrink-0 text-accent-400 mt-0.5" aria-hidden="true" />
        <div className="text-xs leading-relaxed text-text-muted">
          <strong className="text-foreground">OpenReply za Threads (§9):</strong> Threads nema
          direktne poruke (DM). Automatizacije odgovaraju isključivo{" "}
          <strong className="text-foreground">javnim komentarom</strong> sa praćenim linkom.
          Zbog zaštite naloga od neželjene pošte (spam), sva pravila se podrazumevano kreiraju u{" "}
          <code className="text-accent-400 font-mono">draft</code> režimu simulacije.
        </div>
      </Card>

      {/* ── Tabovi (Pravila / Log izvršenja) ─────────────────────────────── */}
      <TabNav
        tabs={[
          {
            id: "rules",
            label:
              automations === undefined
                ? "Pravila automatizacije"
                : `Pravila automatizacije (${automations.length})`,
            icon: Zap,
          },
          {
            id: "log",
            label: logs === undefined ? "Log izvršenja" : `Log izvršenja (${logs.length})`,
            icon: Inbox,
          },
        ]}
        active={tab}
        onChange={setTab}
        panelId="threads-automations-panel"
        trailing={
          tab === "rules" ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setEditingAutomation(null);
                setEditorOpen(true);
              }}
              className="gap-1.5 font-semibold"
            >
              <Plus className="size-4" />
              <span>Novo pravilo</span>
            </Button>
          ) : null
        }
      />

      <TabPanel id="threads-automations-panel">
        {tab === "rules" ? (
          <div className="flex flex-col gap-4">
            {automations === undefined ? (
              <div className="space-y-3">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
            ) : automations.length === 0 ? (
              <EmptyState icon={Zap}>
                Nema kreiranih pravila automatizacije za Threads. Kliknite na „Novo pravilo” da kreirate prvo pravilo.
              </EmptyState>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {automations.map((item) => (
                  <AutomationCard
                    key={item._id}
                    item={item}
                    onToggleActive={() => handleToggleActive(item._id, item.isActive)}
                    onEdit={() => {
                      setEditingAutomation(item);
                      setEditorOpen(true);
                    }}
                    onDelete={() => setDeletingId(item._id)}
                    onRequestLive={() => setPendingGoLive(item)}
                    onRequestDraft={() => handleGoDraft(item)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <AutomationLogsTable logs={logs} />
        )}
      </TabPanel>

      {/* Editor Dialog */}
      <AutomationEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        existing={editingAutomation}
      />

      {/* Confirm Dialog: Draft -> Live */}
      <ConfirmDialog
        open={pendingGoLive !== null}
        onOpenChange={(open) => !open && setPendingGoLive(null)}
        title="Prebaci pravilo u UŽIVO (Live) režim"
        description="Prelazak na režim 'Uživo' znači da će ovo pravilo automatski i javno objavljivati odgovore na Threads-u u ime vašeg povezanog naloga čim se prepoznaju zadate ključne reči. Da li ste sigurni?"
        confirmLabel="Aktiviraj Uživo"
        busyLabel="Aktiviranje..."
        busy={busy}
        onConfirm={handleGoLiveConfirm}
        tone="accent"
      />

      {/* Confirm Dialog: Delete */}
      <ConfirmDialog
        open={deletingId !== null}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title="Obriši pravilo automatizacije"
        description="Da li ste sigurni da želite da obrišete ovo pravilo? Istorija izvršenja i logovi će ostati sačuvani."
        confirmLabel="Obriši pravilo"
        busyLabel="Brisanje..."
        busy={busy}
        onConfirm={handleDeleteConfirm}
        tone="danger"
      />
    </div>
  );
}

function AutomationCard({
  item,
  onToggleActive,
  onEdit,
  onDelete,
  onRequestLive,
  onRequestDraft,
}: {
  item: AutomationDoc;
  onToggleActive: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRequestLive: () => void;
  onRequestDraft: () => void;
}) {
  const isDraft = item.mode === "draft";

  return (
    <Card
      className={cn(
        "flex flex-col justify-between p-5 shadow-card ring-line transition-colors",
        !item.isActive && "opacity-60",
      )}
    >
      <div>
        {/* Top bar: Name, Mode badge, Active Switch */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft pb-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-foreground">{item.name}</h3>

            {/* Mode badge with explicit text (§4) */}
            {isDraft ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-accent-400/40 bg-accent-400/10 px-2.5 py-0.5 text-micro font-semibold text-accent-400">
                <FileText className="size-3" />
                <span>Skica (simulacija)</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2.5 py-0.5 text-micro font-semibold text-success">
                <Zap className="size-3" />
                <span>Uživo (javno slanje)</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-micro text-text-muted">
                {item.isActive ? "Uključeno" : "Isključeno"}
              </span>
              <Switch checked={item.isActive} onCheckedChange={onToggleActive} />
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={onEdit}
                className="size-7 p-0 text-text-muted hover:text-foreground"
                title="Izmeni pravilo"
              >
                <Edit2 className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                className="size-7 p-0 text-text-muted hover:bg-danger/10 hover:text-danger"
                title="Obriši pravilo"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Režim objašnjenje (§4: mode mora biti očigledan) */}
        <div className="mt-3 text-xs leading-relaxed text-text-muted">
          {isDraft ? (
            <p className="rounded-md bg-accent-400/5 px-2.5 py-1.5 border border-accent-400/20 text-text-secondary">
              ℹ️ <strong>Režim skice:</strong> Pravilo se ocenjuje i upisuje u log, ali se ništa ne šalje na Threads.
            </p>
          ) : (
            <p className="rounded-md bg-success/5 px-2.5 py-1.5 border border-success/20 text-text-secondary">
              ⚡ <strong>Režim uživo:</strong> Pravilo automatski objavljuje javne odgovore na Threads nalogu.
            </p>
          )}
        </div>

        {/* Details & Keywords */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
          <div>
            <span className="text-text-muted font-medium">Ključne reči:</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {item.keywords.map((kw: string, i: number) => (
                <span
                  key={i}
                  className="rounded bg-surface-raised border border-line px-1.5 py-0.5 font-mono text-micro text-foreground"
                >
                  {kw}
                </span>
              ))}
            </div>
          </div>

          <div>
            <span className="text-text-muted font-medium">Odgovor:</span>
            <p className="mt-1 line-clamp-2 text-foreground/90 font-mono text-micro">
              {item.replyText || "—"}
            </p>
            {item.linkUrl && (
              <span className="mt-0.5 block truncate text-micro text-accent-400">
                Link: {item.linkUrl}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Vidljivi brojevi limita (§4) ─────────────────────────────────── */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-3">
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-text-muted">
          <span title="Maksimalno izvršenja u 24h">
            Dnevni limit:{" "}
            <strong className="text-foreground">{formatNumber(item.dailyLimit)}</strong>
          </span>
          <span title="Pauza pre ponovnog odgovora istom autoru">
            Cooldown:{" "}
            <strong className="text-foreground">{item.cooldownMinutesPerAuthor} min</strong>
          </span>
          <span title="Maksimalan broj odgovora u istoj niti">
            Max po niti:{" "}
            <strong className="text-foreground">{item.maxRepliesPerThread}</strong>
          </span>
        </div>

        <div>
          {isDraft ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onRequestLive}
              className="h-7 text-xs font-semibold text-success border-success/30 hover:bg-success/10"
            >
              Prebaci u Uživo
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={onRequestDraft}
              className="h-7 text-xs font-medium text-text-muted hover:text-foreground"
            >
              Vrati u Skicu
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function AutomationLogsTable({ logs }: { logs?: LogDoc[] }) {
  if (logs === undefined) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <EmptyState icon={Inbox}>
        Nema zabeleženih logova izvršenja automatizacija.
      </EmptyState>
    );
  }

  return (
    <Card className="overflow-hidden p-0 shadow-card ring-line">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-surface-raised/40">
            <TableRow className="border-b border-line text-xs">
              <TableHead className="py-2.5 font-medium">Vreme</TableHead>
              <TableHead className="py-2.5 font-medium">Korisnik / Odgovor</TableHead>
              <TableHead className="py-2.5 font-medium">Ključna reč</TableHead>
              <TableHead className="py-2.5 font-medium">Status ishoda (§4)</TableHead>
              <TableHead className="py-2.5 font-medium">Detalj / Greška</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-line/40 text-xs">
            {logs.map((log) => {
              const statusCfg =
                LOG_STATUS_CONFIG[log.status] ?? {
                  label: log.status,
                  tone: "border-line bg-surface text-text-muted",
                  description: "",
                };

              return (
                <TableRow key={log._id} className="hover:bg-surface-raised/50">
                  {/* Vreme */}
                  <TableCell className="py-2.5 text-text-muted whitespace-nowrap font-mono text-micro">
                    {formatRelativeTime(log.createdAt)}
                  </TableCell>

                  {/* Korisnik / Reply ID */}
                  <TableCell className="py-2.5 font-mono text-text-secondary">
                    {log.authorId ? `@${log.authorId}` : log.sourceReplyId}
                  </TableCell>

                  {/* Ključna reč */}
                  <TableCell className="py-2.5 font-mono text-foreground">
                    {log.matchedKeyword ? (
                      <span className="rounded bg-surface-raised border border-line px-1.5 py-0.5 text-micro">
                        {log.matchedKeyword}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>

                  {/* 7 Zasebnih statusa (§4) */}
                  <TableCell className="py-2.5 whitespace-nowrap">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-micro",
                        statusCfg.tone,
                      )}
                      title={statusCfg.description}
                    >
                      {statusCfg.label}
                    </span>
                  </TableCell>

                  {/* Detalj / Greška */}
                  <TableCell className="py-2.5 max-w-xs truncate text-text-muted">
                    {log.errorMessage ? (
                      <span className="text-danger font-mono text-micro">{log.errorMessage}</span>
                    ) : log.reason ? (
                      <span className="font-mono text-micro">{log.reason}</span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function AutomationEditorDialog({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: AutomationDoc | null;
}) {
  const createAutomation = useMutation(api.threadsAutomations.createAutomation);
  const updateAutomation = useMutation(api.threadsAutomations.updateAutomation);

  const [name, setName] = useState(existing?.name ?? "");
  const [trigger, setTrigger] = useState<TriggerType>(
    existing?.trigger ?? "reply_to_our_post",
  );
  const [keywordsStr, setKeywordsStr] = useState(
    existing?.keywords ? existing.keywords.join(", ") : "",
  );
  const [matchType, setMatchType] = useState<MatchType>(
    existing?.matchType ?? "contains",
  );
  const [caseSensitive, setCaseSensitive] = useState(
    existing?.caseSensitive ?? false,
  );
  const [matchAnyKeyword, setMatchAnyKeyword] = useState(
    existing?.matchAnyKeyword ?? true,
  );
  const [requireExactPhrase, setRequireExactPhrase] = useState(
    existing?.requireExactPhrase ?? false,
  );
  const [matchAnyPost, setMatchAnyPost] = useState(
    existing?.matchAnyPost ?? true,
  );
  const [postId, setPostId] = useState(existing?.postId ?? "");
  const [actionType, setActionType] = useState<ActionType>(
    existing?.actionType ?? "public_reply",
  );
  const [replyText, setReplyText] = useState(existing?.replyText ?? "");
  const [linkUrl, setLinkUrl] = useState(existing?.linkUrl ?? "");
  const [topicTag, setTopicTag] = useState(existing?.topicTag ?? "");
  const [autoPublishText, setAutoPublishText] = useState(
    existing?.autoPublishText ?? true,
  );

  // Zaštitni limiti (§9)
  const [dailyLimit, setDailyLimit] = useState(
    existing?.dailyLimit?.toString() ??
      (existing?.trigger === "keyword" ? "20" : "50"),
  );
  const [cooldown, setCooldown] = useState(
    existing?.cooldownMinutesPerAuthor?.toString() ?? "60",
  );
  const [maxPerThread, setMaxPerThread] = useState(
    existing?.maxRepliesPerThread?.toString() ?? "2",
  );

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reset kada se promeni `existing`
  useMemo(() => {
    setName(existing?.name ?? "");
    setTrigger(existing?.trigger ?? "reply_to_our_post");
    setKeywordsStr(existing?.keywords ? existing.keywords.join(", ") : "");
    setMatchType(existing?.matchType ?? "contains");
    setCaseSensitive(existing?.caseSensitive ?? false);
    setMatchAnyKeyword(existing?.matchAnyKeyword ?? true);
    setRequireExactPhrase(existing?.requireExactPhrase ?? false);
    setMatchAnyPost(existing?.matchAnyPost ?? true);
    setPostId(existing?.postId ?? "");
    setActionType(existing?.actionType ?? "public_reply");
    setReplyText(existing?.replyText ?? "");
    setLinkUrl(existing?.linkUrl ?? "");
    setTopicTag(existing?.topicTag ?? "");
    setAutoPublishText(existing?.autoPublishText ?? true);
    setDailyLimit(
      existing?.dailyLimit?.toString() ??
        (existing?.trigger === "keyword" ? "20" : "50"),
    );
    setCooldown(existing?.cooldownMinutesPerAuthor?.toString() ?? "60");
    setMaxPerThread(existing?.maxRepliesPerThread?.toString() ?? "2");
    setErrorMsg(null);
  }, [existing]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg("Naziv pravila je obavezan.");
      return;
    }

    const keywords = keywordsStr
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    if (keywords.length === 0) {
      setErrorMsg("Unesite bar jednu ključnu reč.");
      return;
    }

    if (trigger === "keyword") {
      for (const kw of keywords) {
        if (kw.length < 3) {
          setErrorMsg(
            `Ključna reč "${kw}" je prekratka. Za okidač po ključnoj reči minimum je 3 karaktera (zaštita od spama).`,
          );
          return;
        }
      }
    }

    if (actionType === "public_reply" && !replyText.trim()) {
      setErrorMsg("Tekst odgovora je obavezan za javni odgovor.");
      return;
    }

    const dLimit = parseInt(dailyLimit, 10);
    const cd = parseInt(cooldown, 10);
    const mThread = parseInt(maxPerThread, 10);

    if (isNaN(dLimit) || dLimit <= 0) {
      setErrorMsg("Dnevni limit mora biti broj veći od 0.");
      return;
    }

    if (trigger === "keyword" && dLimit > 50) {
      setErrorMsg(
        "Maksimalni dozvoljeni dnevni limit za okidač po ključnoj reči je 50 (zaštita naloga od suspenzije).",
      );
      return;
    }

    if (isNaN(cd) || cd < 0) {
      setErrorMsg("Cooldown mora biti 0 ili pozitivan broj.");
      return;
    }
    if (isNaN(mThread) || mThread <= 0) {
      setErrorMsg("Maksimalan broj po niti mora biti veći od 0.");
      return;
    }

    setBusy(true);
    setErrorMsg(null);

    try {
      if (existing) {
        await updateAutomation({
          id: existing._id,
          name: name.trim(),
          keywords,
          matchType,
          caseSensitive,
          matchAnyKeyword,
          requireExactPhrase,
          matchAnyPost,
          postId: matchAnyPost ? undefined : postId.trim() || undefined,
          actionType,
          replyText: replyText.trim() ? replyText.trim() : undefined,
          linkUrl: linkUrl.trim() ? linkUrl.trim() : undefined,
          topicTag: topicTag.trim() ? topicTag.trim() : undefined,
          autoPublishText,
          dailyLimit: dLimit,
          cooldownMinutesPerAuthor: cd,
          maxRepliesPerThread: mThread,
        });
      } else {
        await createAutomation({
          name: name.trim(),
          trigger,
          keywords,
          matchType,
          caseSensitive,
          matchAnyKeyword,
          requireExactPhrase,
          matchAnyPost,
          postId: matchAnyPost ? undefined : postId.trim() || undefined,
          actionType,
          replyText: replyText.trim() ? replyText.trim() : undefined,
          linkUrl: linkUrl.trim() ? linkUrl.trim() : undefined,
          topicTag: topicTag.trim() ? topicTag.trim() : undefined,
          autoPublishText,
          dailyLimit: dLimit,
          cooldownMinutesPerAuthor: cd,
          maxRepliesPerThread: mThread,
        });
      }

      onOpenChange(false);
    } catch (err) {
      if (err instanceof ConvexError) {
        const data = err.data as { message?: string } | undefined;
        setErrorMsg(data?.message ?? "Čuvanje nije uspelo.");
      } else {
        setErrorMsg("Došlo je do greške pri čuvanju pravila.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existing ? "Izmena pravila automatizacije" : "Novo pravilo automatizacije"}
          </DialogTitle>
          <DialogDescription>
            Pravilo se kreira u bezbednom <code className="text-accent-400 font-mono">draft</code> režimu za testiranje.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-6 pt-2">
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
              <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          <FormStack>
            {/* Osnovni podaci */}
            <FormGroup title="Osnovna podešavanja">
              <Field label="Naziv pravila *" required>
                {(props) => (
                  <Input
                    {...props}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="npr. Odgovor na reč 'CENA'"
                  />
                )}
              </Field>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="triggerSelect" className="text-xs font-medium text-text-muted">Okidač</Label>
                  <select
                    id="triggerSelect"
                    aria-label="Okidač"
                    value={trigger}
                    disabled={Boolean(existing)}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setTrigger(e.target.value as TriggerType)
                    }
                    className="flex h-9 w-full rounded-md border border-line bg-surface px-3 py-1 text-xs text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="reply_to_our_post">Odgovor na našu objavu</option>
                    <option value="mention">Spominjanje naloga (@mention)</option>
                    <option value="keyword">Ključna reč u javnom sadržaju (keyword search)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="actionTypeSelect" className="text-xs font-medium text-text-muted">Akcija</Label>
                  <select
                    id="actionTypeSelect"
                    aria-label="Akcija"
                    value={actionType}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setActionType(e.target.value as ActionType)
                    }
                    className="flex h-9 w-full rounded-md border border-line bg-surface px-3 py-1 text-xs text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="public_reply">Javni odgovor sa porukom</option>
                    <option value="hide">Sakrij odgovor</option>
                    <option value="ignore">Ignoriši</option>
                    <option value="approve_pending">Odobri odgovor na čekanju</option>
                  </select>
                </div>
              </div>

              {trigger === "keyword" && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-micro text-amber-300">
                  ⚠️ <strong>Zaštita naloga od spama (§9):</strong> Svaka ključna reč mora imati bar 3 karaktera. Preporučeni dnevni limit je 20 (maksimum 50).
                </div>
              )}
            </FormGroup>

            {/* Ključne reči */}
            <FormGroup title="Prepoznavanje ključnih reči">
              <Field
                label="Ključne reči (razdvojene zarezom) *"
                hint="Primer: cena, link, info, katalog"
                required
              >
                {(props) => (
                  <Input
                    {...props}
                    value={keywordsStr}
                    onChange={(e) => setKeywordsStr(e.target.value)}
                    placeholder="cena, ponuda, popust"
                  />
                )}
              </Field>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="matchTypeSelect" className="text-xs font-medium text-text-muted">Tip poklapanja</Label>
                  <select
                    id="matchTypeSelect"
                    aria-label="Tip poklapanja"
                    value={matchType}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setMatchType(e.target.value as MatchType)
                    }
                    className="flex h-9 w-full rounded-md border border-line bg-surface px-3 py-1 text-xs text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="contains">Sadrži reč (contains)</option>
                    <option value="exact">Tačno poklapanje (exact)</option>
                  </select>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-line-soft bg-surface-raised/40 p-2.5">
                  <Label htmlFor="exactPhrase" className="text-xs text-foreground">
                    Cela fraza (granica reči)
                  </Label>
                  <Switch
                    id="exactPhrase"
                    checked={requireExactPhrase}
                    onCheckedChange={setRequireExactPhrase}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-line-soft bg-surface-raised/40 p-2.5">
                  <Label htmlFor="caseSens" className="text-xs text-foreground">
                    Razlikuj VELIKA/mala slova
                  </Label>
                  <Switch
                    id="caseSens"
                    checked={caseSensitive}
                    onCheckedChange={setCaseSensitive}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-line-soft bg-surface-raised/40 p-2.5">
                  <Label htmlFor="anyKw" className="text-xs text-foreground">
                    Bilo koja reč (OR)
                  </Label>
                  <Switch
                    id="anyKw"
                    checked={matchAnyKeyword}
                    onCheckedChange={setMatchAnyKeyword}
                  />
                </div>
              </div>
            </FormGroup>

            {/* Sadržaj odgovora */}
            {actionType === "public_reply" && (
              <FormGroup title="Sadržaj javnog odgovora">
                <Field label="Tekst javnog odgovora *" required>
                  {(props) => (
                    <Textarea
                      {...props}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Pozdrav! Više detalja i naručivanje možete pogledati ovde..."
                      rows={3}
                    />
                  )}
                </Field>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field
                    label="Praćeni link za sajt (linkUrl)"
                    hint="Biće automatski konvertovan u /r/ link"
                  >
                    {(props) => (
                      <Input
                        {...props}
                        type="url"
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        placeholder="https://primer.rs/ponuda"
                      />
                    )}
                  </Field>

                  <Field label="Topic tag (opciono)">
                    {(props) => (
                      <Input
                        {...props}
                        value={topicTag}
                        onChange={(e) => setTopicTag(e.target.value)}
                        placeholder="npr. pomoc"
                      />
                    )}
                  </Field>
                </div>
              </FormGroup>
            )}

            {/* Zaštitni limiti (§9) */}
            <FormGroup
              title="Sigurnosni limiti i cooldown (§9)"
              description="Sprečavaju spam sankcije i prekomerno odgovaranje istim korisnicima"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field
                  label="Dnevni limit *"
                  hint="Maksimalno odgovora u 24h"
                  required
                >
                  {(props) => (
                    <Input
                      {...props}
                      type="number"
                      min={1}
                      value={dailyLimit}
                      onChange={(e) => setDailyLimit(e.target.value)}
                    />
                  )}
                </Field>

                <Field
                  label="Cooldown (minuti) *"
                  hint="Pauza za istog autora"
                  required
                >
                  {(props) => (
                    <Input
                      {...props}
                      type="number"
                      min={0}
                      value={cooldown}
                      onChange={(e) => setCooldown(e.target.value)}
                    />
                  )}
                </Field>

                <Field
                  label="Max po niti *"
                  hint="Limit po jednoj temi"
                  required
                >
                  {(props) => (
                    <Input
                      {...props}
                      type="number"
                      min={1}
                      value={maxPerThread}
                      onChange={(e) => setMaxPerThread(e.target.value)}
                    />
                  )}
                </Field>
              </div>
            </FormGroup>
          </FormStack>

          <DialogFooter className="border-t border-line-soft pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Otkaži
            </Button>
            <Button type="submit" disabled={busy} className="font-semibold">
              {busy ? "Čuvanje..." : existing ? "Sačuvaj izmene" : "Kreiraj pravilo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
