"use client";

import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  ExternalLink,
  MessageCircle,
  MessageSquareReply,
  ShieldAlert,
  Trash2,
  User,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const HIDE_STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  NOT_HUSHED: { label: "Vidljivo", tone: "border-success/30 bg-success/10 text-success" },
  UNHUSHED: { label: "Otkriveno", tone: "border-success/30 bg-success/10 text-success" },
  HIDDEN: { label: "Sakriveno", tone: "border-warning/30 bg-warning/10 text-warning" },
  COVERED: { label: "Prekriveno", tone: "border-warning/30 bg-warning/10 text-warning" },
  BLOCKED: { label: "Blokirano", tone: "border-danger/30 bg-danger/10 text-danger" },
  RESTRICTED: { label: "Ograničeno", tone: "border-danger/30 bg-danger/10 text-danger" },
};

export function ThreadsRepliesModeration() {
  const mediaList = useQuery(api.threadsStore.mediaList, { limit: 50 });
  const [selectedPostId, setSelectedPostId] = useState<string>("");

  // Postavi prvu objavu kao izabranu kad stignu podaci
  const effectivePostId =
    selectedPostId || (mediaList && mediaList.length > 0 ? mediaList[0].mediaId : "");

  const replies = useQuery(
    api.threadsReplies.listRepliesForPost,
    effectivePostId ? { postId: effectivePostId } : "skip",
  );

  const hideReply = useAction(api.threadsReplies.hideReply);
  const unhideReply = useAction(api.threadsReplies.unhideReply);
  const approvePendingReply = useAction(api.threadsReplies.approvePendingReply);
  const ignorePendingReply = useAction(api.threadsReplies.ignorePendingReply);
  const replyToPost = useMutation(api.threadsReplies.replyToPost);
  const deleteReply = useAction(api.threadsReplies.deleteReply);

  // Stanje filtera (svi odgovori ili samo na čekanju)
  const [filterTab, setFilterTab] = useState<"all" | "pending">("all");

  // Stanje radnji
  const [replyingTo, setReplyingTo] = useState<{
    replyId: string;
    username?: string;
  } | null>(null);
  const [replyText, setReplyText] = useState("");

  const [deletingReplyId, setDeletingReplyId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const filteredReplies = useMemo(() => {
    if (!replies) return [];
    if (filterTab === "pending") {
      return replies.filter((r) => r.approvalStatus === "pending");
    }
    return replies;
  }, [replies, filterTab]);

  const selectedMediaItem = useMemo(
    () => mediaList?.find((m) => m.mediaId === effectivePostId),
    [mediaList, effectivePostId],
  );

  const handleHideToggle = async (replyId: string, currentHideStatus?: string) => {
    setBusy(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      if (currentHideStatus === "HIDDEN" || currentHideStatus === "COVERED") {
        await unhideReply({ replyId });
        setSuccessMsg("Odgovor je uspešno otkriven.");
      } else {
        await hideReply({ replyId });
        setSuccessMsg("Odgovor je uspešno sakriven.");
      }
    } catch (err) {
      if (err instanceof ConvexError) {
        const data = err.data as { message?: string } | undefined;
        setErrorMsg(data?.message ?? "Operacija nije uspela.");
      } else {
        setErrorMsg("Došlo je do greške pri moderaciji odgovora.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleApprovalAction = async (
    replyId: string,
    action: "approve" | "ignore",
  ) => {
    setBusy(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      if (action === "approve") {
        await approvePendingReply({ replyId });
        setSuccessMsg("Odgovor je uspešno odobren i javno objavljen.");
      } else {
        await ignorePendingReply({ replyId });
        setSuccessMsg("Odgovor je ignorisan.");
      }
    } catch (err) {
      if (err instanceof ConvexError) {
        const data = err.data as { message?: string } | undefined;
        setErrorMsg(data?.message ?? "Operacija nije uspela.");
      } else {
        setErrorMsg("Došlo je do greške pri odobravanju odgovora.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyingTo || !replyText.trim()) return;
    setBusy(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await replyToPost({
        replyToId: replyingTo.replyId,
        text: replyText.trim(),
        autoPublishText: true,
      });
      setSuccessMsg("Odgovor je uspešno poslat.");
      setReplyingTo(null);
      setReplyText("");
    } catch (err) {
      if (err instanceof ConvexError) {
        const data = err.data as { message?: string } | undefined;
        setErrorMsg(data?.message ?? "Slanje odgovora nije uspelo.");
      } else {
        setErrorMsg("Došlo je do greške pri slanju odgovora.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingReplyId) return;
    setBusy(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await deleteReply({ replyId: deletingReplyId });
      setSuccessMsg("Odgovor je uspešno obrisan sa Threads-a.");
      setDeletingReplyId(null);
    } catch (err) {
      if (err instanceof ConvexError) {
        const data = err.data as { message?: string } | undefined;
        setErrorMsg(data?.message ?? "Brisanje odgovora nije uspelo.");
      } else {
        setErrorMsg("Došlo je do greške pri brisanju odgovora.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Izbor objave (Dodatak A.2: odgovori su po objavi) ──────────────── */}
      <Card className="p-5 shadow-card ring-line">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-accent-400/10 text-accent-400">
              <MessageCircle className="size-4" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Moderacija odgovora po objavi (Dodatak A.2)
              </h3>
              <p className="text-xs text-text-muted">
                Threads API zahteva izbor konkretne objave za pregled odgovora i odobrenja
              </p>
            </div>
          </div>

          {/* Post Selector */}
          <div className="w-full sm:w-80">
            {mediaList === undefined ? (
              <Skeleton className="h-9 w-full" />
            ) : mediaList.length === 0 ? (
              <span className="text-xs text-text-muted">Nema dostupnih objava</span>
            ) : (
              <select
                aria-label="Izaberi objavu za moderaciju"
                value={effectivePostId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setSelectedPostId(e.target.value)
                }
                className="flex h-9 w-full rounded-md border border-line bg-surface px-3 py-1 text-xs text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {mediaList.map((m) => (
                  <option key={m.mediaId} value={m.mediaId}>
                    {m.text ? `${m.text.slice(0, 45)}...` : `Objava ${m.mediaType}`}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Selected Post Summary Preview */}
        {selectedMediaItem && (
          <div className="mt-4 rounded-lg border border-line-soft bg-surface-raised/40 p-3 text-xs">
            <div className="flex items-center justify-between text-text-muted mb-1">
              <span className="font-mono text-micro uppercase">
                Tip: {selectedMediaItem.mediaType}
              </span>
              {selectedMediaItem.permalink && (
                <a
                  href={selectedMediaItem.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-accent-400"
                >
                  <span>Otvori objavu</span>
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>
            <p className="line-clamp-2 text-foreground/90 font-medium leading-relaxed">
              {selectedMediaItem.text || <span className="italic text-text-muted">Bez teksta</span>}
            </p>
          </div>
        )}
      </Card>

      {/* Poruke o statusu */}
      {errorMsg && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
          <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-success">
          <CheckCircle2 className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ── Lista odgovora sa filterima ──────────────────────────────────── */}
      <Card className="overflow-hidden p-0 shadow-card ring-line">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterTab("all")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                filterTab === "all"
                  ? "bg-accent-400/10 text-accent-400"
                  : "text-text-muted hover:text-foreground",
              )}
            >
              {/* Dok upit traje broj NIJE nula — nije ni poznat. „…" je jedina
                  iskrena oznaka; telo liste u istom trenutku prikazuje skelet,
                  pa bi „(0)" u naslovu tvrdilo suprotno od onoga ispod njega. */}
              Svi odgovori ({replies === undefined ? "…" : replies.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("pending")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                filterTab === "pending"
                  ? "bg-accent-400/10 text-accent-400"
                  : "text-text-muted hover:text-foreground",
              )}
            >
              Na čekanju za odobrenje (
              {replies === undefined
                ? "…"
                : replies.filter((r) => r.approvalStatus === "pending").length}
              )
            </button>
          </div>
        </div>

        {/* Reply list */}
        {replies === undefined ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : filteredReplies.length === 0 ? (
          <div className="p-8 text-center">
            <EmptyState icon={MessageCircle}>
              {filterTab === "pending"
                ? "Nema odgovora koji čekaju na odobrenje za ovu objavu."
                : "Nema zabeleženih odgovora za izabranu objavu."}
            </EmptyState>
          </div>
        ) : (
          <div className="divide-y divide-line/40">
            {filteredReplies.map((reply) => {
              const hideConfig =
                reply.hideStatus && HIDE_STATUS_LABELS[reply.hideStatus]
                  ? HIDE_STATUS_LABELS[reply.hideStatus]
                  : { label: reply.hideStatus ?? "Vidljivo", tone: "border-line bg-surface text-text-muted" };

              const isPending = reply.approvalStatus === "pending";

              return (
                <div
                  key={reply._id}
                  className="flex flex-col gap-3 p-5 transition-colors hover:bg-surface-raised/30 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-raised border border-line text-text-muted">
                      <User className="size-4" />
                    </div>

                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          {reply.username ? `@${reply.username}` : "Korisnik"}
                        </span>
                        {reply.isReplyOwnedByMe && (
                          <span className="rounded bg-accent-400/10 px-1.5 py-0.2 font-mono text-micro text-accent-400">
                            Naš odgovor
                          </span>
                        )}
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.2 font-mono text-micro font-semibold",
                            hideConfig.tone,
                          )}
                        >
                          {hideConfig.label}
                        </span>

                        {isPending && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.2 text-micro font-semibold text-warning">
                            <Clock className="size-3" /> Čeka odobrenje
                          </span>
                        )}

                        {reply.timestamp && (
                          <span className="text-micro text-text-muted">
                            {formatRelativeTime(
                              typeof reply.timestamp === "string"
                                ? new Date(reply.timestamp).getTime()
                                : reply.timestamp,
                            )}
                          </span>
                        )}
                      </div>

                      <p className="text-xs leading-relaxed text-foreground/90 mt-1">
                        {reply.text || <span className="italic text-text-muted">Bez teksta</span>}
                      </p>

                      {reply.permalink && (
                        <a
                          href={reply.permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-micro text-text-muted hover:text-foreground"
                        >
                          <span>Otvori na Threads</span>
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Dugmad za akcije */}
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0 self-end sm:self-start">
                    {/* Odobravanje za pending */}
                    {isPending && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => handleApprovalAction(reply.replyId, "approve")}
                          className="h-7 gap-1 px-2 text-xs text-success border-success/30 hover:bg-success/10"
                        >
                          <Check className="size-3" />
                          <span>Odobri</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => handleApprovalAction(reply.replyId, "ignore")}
                          className="h-7 gap-1 px-2 text-xs text-text-muted hover:text-foreground"
                        >
                          <X className="size-3" />
                          <span>Ignoriši</span>
                        </Button>
                      </>
                    )}

                    {/* Sakrij / Otkrij */}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => handleHideToggle(reply.replyId, reply.hideStatus)}
                      className="h-7 gap-1 px-2 text-xs"
                      title={reply.hideStatus === "HIDDEN" ? "Otkrij odgovor" : "Sakrij odgovor"}
                    >
                      {reply.hideStatus === "HIDDEN" ? (
                        <>
                          <Eye className="size-3 text-accent-400" />
                          <span>Otkrij</span>
                        </>
                      ) : (
                        <>
                          <EyeOff className="size-3 text-warning" />
                          <span>Sakrij</span>
                        </>
                      )}
                    </Button>

                    {/* Odgovori */}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        setReplyingTo({
                          replyId: reply.replyId,
                          username: reply.username,
                        })
                      }
                      className="h-7 gap-1 px-2 text-xs"
                    >
                      <MessageSquareReply className="size-3" />
                      <span>Odgovori</span>
                    </Button>

                    {/* Obriši */}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => setDeletingReplyId(reply.replyId)}
                      className="h-7 size-7 p-0 text-text-muted hover:bg-danger/10 hover:text-danger"
                      title="Obriši odgovor (kvota 100/24h)"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Dijalog / polje za brzi odgovor */}
      {replyingTo && (
        <Card className="p-5 shadow-card ring-line border-accent-400/40">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-foreground">
              Odgovor na komentar korisnika {replyingTo.username ? `@${replyingTo.username}` : ""}
            </h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setReplyingTo(null);
                setReplyText("");
              }}
              className="size-6 p-0"
            >
              <X className="size-3.5" />
            </Button>
          </div>
          <Textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Napiši odgovor..."
            rows={3}
            className="text-xs"
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setReplyingTo(null);
                setReplyText("");
              }}
            >
              Otkaži
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || !replyText.trim()}
              onClick={handleSendReply}
              className="gap-1.5"
            >
              <MessageSquareReply className="size-3.5" />
              <span>Pošalji odgovor</span>
            </Button>
          </div>
        </Card>
      )}

      {/* Dijalog za potvrdu brisanja odgovora (§8 kvota 100/24h) */}
      <ConfirmDialog
        open={deletingReplyId !== null}
        onOpenChange={(open) => !open && setDeletingReplyId(null)}
        title="Obriši odgovor sa Threads-a"
        description="Ova radnja je nepovratna. Odgovor će biti trajno obrisan sa Threads platforme. Brisanje se ubraja u dnevnu kvotu od 100 brisanja u periodu od 24h (§8)."
        confirmLabel="Trajno obriši"
        busyLabel="Briše se..."
        busy={busy}
        onConfirm={handleDeleteConfirm}
        tone="danger"
      />
    </div>
  );
}
