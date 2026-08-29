"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
  Loader2,
  Lock,
  Sparkles,
  Info,
  X,
  FileCheck2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FeedbackNote } from "@/components/app/feedback";
import {
  evaluatePublishGates,
  extractConvexErrorMessage,
  type PostItem,
  type PublishGateStatus,
} from "./novosti-types";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface PublishReadinessPanelProps {
  post: Partial<PostItem> & { _id?: Id<"posts"> };
  onPublished?: (publishedAt: number) => void;
  onRunHumanizer?: () => void;
  isSaving?: boolean;
}

export function PublishReadinessPanel({
  post,
  onPublished,
  onRunHumanizer,
  isSaving = false,
}: PublishReadinessPanelProps) {
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);

  const publishMutation = useMutation(api.postsStore.publish);

  const gates: PublishGateStatus = evaluatePublishGates(post);
  const isDraftOrUnpublished = post.status !== "published";

  const handlePublish = async () => {
    if (!post._id) {
      setPublishError("Post mora prvo biti sačuvan pre nego što se može objaviti.");
      return;
    }

    if (!gates.allPassed) {
      setPublishError("Sve 4 kapije moraju biti ispunjene pre objavljivanja.");
      return;
    }

    setIsPublishing(true);
    setPublishError(null);
    setPublishSuccess(null);

    try {
      const result = await publishMutation({ postId: post._id });
      setPublishSuccess(
        `Post je uspešno objavljen! (${formatDateTime(result.publishedAt)})`,
      );
      if (onPublished) {
        onPublished(result.publishedAt);
      }
    } catch (err: unknown) {
      // Prikazujemo TAČNU poruku iz ConvexError greške (§4)
      const exactMessage = extractConvexErrorMessage(
        err,
        "Objavljivanje nije uspelo iz nepoznatog razloga.",
      );
      setPublishError(exactMessage);
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <Card className="rounded-xl border border-line bg-surface/70 p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <FileCheck2 className="size-4 text-accent-400" />
            <h3 className="heading-caps text-micro font-medium text-foreground">
              Spremnost za objavu (§4 Kapije)
            </h3>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            Ovo su blokade, ne upozorenja. Publish mutacija odbija objavu dok
            sve četiri kapije nisu ispunjene.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {gates.allPassed ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success">
              <CheckCircle2 className="size-3.5" />
              Sve kapije ispunjene
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning">
              <Lock className="size-3.5" />
              Blokirano ({[
                gates.ownProof.passed,
                gates.humanizer.passed,
                gates.coverAlt.passed,
                gates.dek.passed,
              ].filter(Boolean).length} / 4)
            </span>
          )}
        </div>
      </div>

      {/* Spisak 4 kapije sa stanjima */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {/* Kapija 1 */}
        <GateItem
          title="1. Vlasnički dokaz (§2.2, §4.1)"
          passed={gates.ownProof.passed}
          reason={gates.ownProof.reason}
          extraNote={gates.ownProof.note}
        />

        {/* Kapija 2 */}
        <GateItem
          title="2. Humanizer provera (§4.2)"
          passed={gates.humanizer.passed}
          reason={
            gates.humanizer.passed && gates.humanizer.timestamp
              ? `Verifikovano ${formatDateTime(gates.humanizer.timestamp)}`
              : gates.humanizer.reason
          }
          action={
            !gates.humanizer.passed && onRunHumanizer ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={onRunHumanizer}
                className="mt-1.5 h-6 text-xs text-accent-400 hover:bg-accent-400/10"
              >
                <Sparkles className="size-3" />
                <span>Pokreni proveru sad</span>
              </Button>
            ) : undefined
          }
        />

        {/* Kapija 3 */}
        <GateItem
          title="3. Naslovna slika i ALT opis (§4.3)"
          passed={gates.coverAlt.passed}
          reason={gates.coverAlt.reason}
        />

        {/* Kapija 4 */}
        <GateItem
          title="4. Podnaslov / dek (§4.4)"
          passed={gates.dek.passed}
          reason={gates.dek.reason}
        />
      </div>

      {/* Poruka o uspehu ili grešci */}
      {publishError && (
        <div className="mt-4">
          <FeedbackNote
            tone="danger"
            title="Objavljivanje je odbijeno"
            action={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setPublishError(null)}
                aria-label="Zatvori grešku"
              >
                <X className="size-3.5" />
              </Button>
            }
          >
            {publishError}
          </FeedbackNote>
        </div>
      )}

      {publishSuccess && (
        <div className="mt-4">
          <FeedbackNote
            tone="success"
            title="Objava uspešna"
            action={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setPublishSuccess(null)}
                aria-label="Zatvori potvrdu"
              >
                <X className="size-3.5" />
              </Button>
            }
          >
            {publishSuccess}
          </FeedbackNote>
        </div>
      )}

      {/* Dugme za objavljivanje */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <div className="text-xs text-text-muted">
          {!post._id ? (
            <span>Post mora prvo biti kreiran/sačuvan kao nacrt.</span>
          ) : !gates.allPassed ? (
            <span>
              Dugme je zaključano dok sve četiri kapije ne budu zelene.
            </span>
          ) : (
            <span className="text-success">
              Svi uslovi su ispunjeni. Post je spreman za objavu na sajtu.
            </span>
          )}
        </div>

        <Button
          type="button"
          onClick={handlePublish}
          disabled={!gates.allPassed || isPublishing || isSaving || !post._id}
          className={cn(
            "gap-2 font-medium transition-all",
            gates.allPassed
              ? "bg-accent-400 text-surface-canvas hover:bg-accent-300"
              : "opacity-60",
          )}
        >
          {isPublishing ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <span>Objavljujem…</span>
            </>
          ) : (
            <>
              <Send className="size-4" />
              <span>{post.status === "published" ? "Ponovo objavi" : "Objavi post"}</span>
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}

function GateItem({
  title,
  passed,
  reason,
  extraNote,
  action,
}: {
  title: string;
  passed: boolean;
  reason: string;
  extraNote?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between rounded-lg border p-3 text-xs transition-colors",
        passed
          ? "border-success/30 bg-success/5"
          : "border-line bg-surface/50",
      )}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-foreground">{title}</span>
          {passed ? (
            <span className="flex items-center gap-1 font-medium text-success">
              <CheckCircle2 className="size-3.5 shrink-0" />
              <span>Ispunjeno</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 font-medium text-warning">
              <XCircle className="size-3.5 shrink-0 text-danger" />
              <span className="text-text-muted">Čeka uslov</span>
            </span>
          )}
        </div>
        <p className="mt-1 leading-relaxed text-text-muted">{reason}</p>
        {extraNote && (
          <p className="mt-1.5 rounded bg-surface px-2 py-1 font-mono text-micro text-text-secondary">
            Dokaz: „{extraNote}”
          </p>
        )}
      </div>

      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
