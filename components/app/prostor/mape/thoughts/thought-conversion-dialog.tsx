"use client";


// Preneto iz Devotion apps/web/components/workspace/thoughts/thought-conversion-dialog.tsx (main @ c05c40f), SPAJANJE S14.
import { useMemo, useState } from "react";
import {
  Lightbulb,
  Link2,
  LoaderCircle,
} from "lucide-react";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogPopup,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { StartupWithAreas } from "@/lib/prostor/rute";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useProjekatMutation } from "@/components/app/projekat-provider";
import { formatNumber, pluralSr } from "@/lib/format";

function titleFromThought(node: Pick<Doc<"thoughtNodes">, "title" | "text">) {
  const explicit = node.title?.trim();
  if (explicit) return explicit;
  const firstLine =
    node.text.split(/\r?\n/).find((line) => line.trim())?.trim() ??
    "Nova misao";
  return firstLine.length > 80
    ? `${firstLine.slice(0, 77).trimEnd()}…`
    : firstLine;
}

export function ThoughtConversionDialog({
  open,
  nodes,
  onOpenChange,
  onConverted,
}: {
  open: boolean;
  workspace: StartupWithAreas;
  nodes: Array<Doc<"thoughtNodes">>;
  onOpenChange: (open: boolean) => void;
  onConverted: (ideaIds: Id<"ideaNodes">[]) => void;
}) {
  const convertToIdeas = useProjekatMutation(api.prostor.thoughts.convertToIdeas);
  const [submitting, setSubmitting] = useState(false);
  const orderedNodes = useMemo(
    () =>
      [...nodes].sort(
        (left, right) =>
          left.y - right.y ||
          left.x - right.x ||
          left._id.localeCompare(right._id),
      ),
    [nodes],
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (orderedNodes.length === 0) return;

    setSubmitting(true);
    try {
      const result = await convertToIdeas({
        nodeIds: orderedNodes.map((node) => node._id),
      });
      onOpenChange(false);
      onConverted(result.ideaIds);
    } catch (error) {
      toast.error(accessErrorMessage(error, "Misli nisu poslate u Ideje."));
    } finally {
      setSubmitting(false);
    }
  }

  const selectedLabel =
    orderedNodes.length === 1
      ? "1 izabrana misao"
      : `Izabrano misli: ${formatNumber(orderedNodes.length)}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !submitting && onOpenChange(next)}
    >
      <DialogPopup className="overflow-hidden p-0 sm:max-w-xl">
        <form onSubmit={submit}>
          <DialogHeader className="border-b border-line-soft px-5 py-5 sm:px-6">
            <DialogTitle>Pošalji u Ideje</DialogTitle>
            <DialogDescription>
              Misao postaje timska ideja; original ostaje privatan.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 px-5 py-5 sm:px-6">
            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">{selectedLabel}</p>
                {orderedNodes.length > 1 ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Link2 className="size-3.5" />
                    Veze se čuvaju
                  </span>
                ) : null}
              </div>
              <div className="mt-2 max-h-36 space-y-0.5 overflow-y-auto pr-1 scrollbar-thin">
                {orderedNodes.map((node) => (
                  <div
                    key={node._id}
                    className="rounded-lg px-2 py-1.5 text-sm"
                  >
                    {titleFromThought(node)}
                  </div>
                ))}
              </div>
            </div>

          </div>

          <DialogFooter className="border-t border-line-soft px-5 py-4 sm:px-6">
            <Button
              type="button"
              variant="ghost"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              Otkaži
            </Button>
            <Button variant="primary" type="submit" disabled={submitting || orderedNodes.length === 0}>
              {submitting ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Lightbulb />
              )}
              {submitting
                ? "Šaljem u Ideje…"
                : orderedNodes.length === 1
                  ? "Pošalji u Ideje"
                  : `Pošalji ${formatNumber(orderedNodes.length)} ${pluralSr(orderedNodes.length, "misao", "misli", "misli")}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
