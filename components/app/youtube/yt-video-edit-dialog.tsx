"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { AlertTriangle, Loader2, Pencil, Trash2, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import {
  VIDEO_CATEGORIES,
  VIDEO_DESCRIPTION_MAX,
  VIDEO_TAGS_TOTAL_MAX,
  VIDEO_TITLE_MAX,
} from "@/convex/lib/ytUpload";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PillToggle,
  SegmentedControl,
} from "./yt-automation-editor-dialog";
import type { VideoItem } from "./youtube-videos-grid";
import { cn } from "@/lib/utils";

/**
 * Editing one video's metadata (Y7).
 *
 * The screen only stores a video's title, so this form cannot show the
 * description, tags, category or privacy the video has right now. That is not
 * a gap to paper over: `videos.update` REPLACES every part it is sent, so a
 * form that silently submitted its own empty fields would wipe a description
 * nobody meant to touch.
 *
 * So the form sends only what the operator explicitly changed, and says so on
 * every field. A field left alone is never in the payload, and the action
 * leaves that part of the video exactly as it found it.
 */

// The limits and the category list are the same ones the upload dialog and
// the mutations use (convex/lib/ytUpload.ts) — one list, or the two forms
// drift and one of them starts offering a category the API refuses.

type PrivacyStatus = "public" | "unlisted" | "private";

const PRIVACY_OPTIONS: { value: PrivacyStatus; label: string }[] = [
  { value: "public", label: "Javno" },
  { value: "unlisted", label: "Nelistirano" },
  { value: "private", label: "Privatno" },
];

/** Pull the friendly message out of a thrown ConvexError, else a fallback. */
function convexMessage(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as { message?: string } | undefined;
    if (data && typeof data.message === "string") return data.message;
  }
  return fallback;
}

export function YtVideoEditDialog({
  video,
  onOpenChange,
}: {
  video: VideoItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog
      open={video !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <DialogPopup className="max-w-2xl sm:max-w-2xl">
        {video !== null && (
          <YtVideoEditForm
            key={video.videoId}
            video={video}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogPopup>
    </Dialog>
  );
}

function YtVideoEditForm({
  video,
  onClose,
}: {
  video: VideoItem;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(video.title);

  const [editDescription, setEditDescription] = useState(false);
  const [description, setDescription] = useState("");

  const [editTags, setEditTags] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");

  // "" means "leave this alone" for both of these.
  const [categoryId, setCategoryId] = useState("");
  const [privacyStatus, setPrivacyStatus] = useState<PrivacyStatus | "">("");

  const [submitting, setSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const updateVideoMetadata = useAction(api.ytVideos.updateVideoMetadata);
  const deleteVideo = useAction(api.ytVideos.deleteVideo);

  const finalTags =
    tagDraft.trim().length > 0 && !tags.includes(tagDraft.trim())
      ? [...tags, tagDraft.trim()]
      : tags;
  const tagsLength = finalTags.join(",").length;

  const titleChanged = title.trim() !== video.title.trim();
  const hasChanges =
    titleChanged ||
    editDescription ||
    editTags ||
    categoryId !== "" ||
    privacyStatus !== "";

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (tag.length === 0) return;
    setTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    setTagDraft("");
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagDraft);
    } else if (e.key === "Backspace" && tagDraft.length === 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    try {
      await updateVideoMetadata({
        videoId: video.videoId,
        // Only what was actually changed. Everything omitted here is read off
        // YouTube and written back untouched.
        ...(titleChanged ? { title: title.trim() } : {}),
        ...(editDescription ? { description } : {}),
        ...(editTags ? { tags: finalTags } : {}),
        ...(categoryId !== "" ? { categoryId } : {}),
        ...(privacyStatus !== "" ? { privacyStatus } : {}),
      });
      onClose();
    } catch (err) {
      setErrorMsg(convexMessage(err, "Čuvanje nije uspelo. Pokušaj ponovo."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await deleteVideo({ videoId: video.videoId });
      onClose();
    } catch (err) {
      setErrorMsg(convexMessage(err, "Brisanje nije uspelo. Pokušaj ponovo."));
      setConfirmingDelete(false);
    } finally {
      setSubmitting(false);
    }
  };

  // The confirmation takes over the whole dialog rather than stacking a second
  // one on top: what is about to be lost deserves the full width, and there is
  // nothing on the form worth reading while deciding.
  if (confirmingDelete) {
    return (
      <div className="space-y-4">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg border border-danger/30 bg-danger/10 text-danger">
              <Trash2 className="size-4" />
            </div>
            <div>
              <DialogTitle>Obrisati video sa YouTube-a?</DialogTitle>
              <DialogDescription>
                Ovo se ne može vratiti — ni odavde, ni iz YouTube Studija.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {errorMsg && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
            {errorMsg}
          </div>
        )}

        <div className="space-y-3 rounded-xl border border-danger/30 bg-danger/5 p-4">
          <p className="text-sm font-semibold text-foreground">{video.title}</p>
          <p className="text-xs leading-relaxed text-foreground">
            Sa videom nestaju i pregledi, vreme gledanja, lajkovi i svi
            komentari ispod njega. Postojeći linkovi i ugrađeni plejeri prestaju
            da rade odmah. YouTube nema kantu za otpatke.
          </p>
          <p className="text-xs text-text-muted">
            Ako ti treba samo da ga niko ne vidi, zatvori ovo i postavi
            privatnost na „Privatno” — to se može vratiti.
          </p>
        </div>

        <DialogFooter className="border-t border-line pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfirmingDelete(false)}
            disabled={submitting}
          >
            Otkaži
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleDelete}
            disabled={submitting}
            className="bg-danger font-semibold text-surface-dark hover:bg-danger/90"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                <span>Brišem…</span>
              </>
            ) : (
              "Obriši video zauvek"
            )}
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg border border-accent-400/20 bg-accent-400/10 text-accent-400">
            <Pencil className="size-4" />
          </div>
          <div>
            <DialogTitle>Izmeni video</DialogTitle>
            <DialogDescription>
              Menja se samo ono što ovde dodirneš. Ostalo se čita sa YouTube-a i
              vraća nepromenjeno.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      {errorMsg && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
          {errorMsg}
        </div>
      )}

      <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        {/* Naslov */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <Label className="text-xs font-medium text-text-muted">
              Naslov
            </Label>
            <CharCount value={title.length} max={VIDEO_TITLE_MAX} />
          </div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={submitting}
            className="border-line bg-surface"
          />
        </div>

        {/* Opis */}
        <div className="space-y-2.5 rounded-xl border border-line bg-surface/50 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-xs font-semibold text-foreground">
                Opis
              </span>
              <p className="mt-0.5 text-xs text-text-muted">
                Ono što upišeš postaje ceo opis — ne dopunjuje postojeći.
              </p>
            </div>
            <PillToggle
              on={editDescription}
              onChange={setEditDescription}
              disabled={submitting}
              onLabel="Menja se"
              offLabel="Ostaje kakav jeste"
            />
          </div>

          {editDescription && (
            <div>
              <Textarea
                placeholder="Novi opis videa…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={submitting}
                rows={6}
                className="border-line bg-surface"
              />
              <div className="mt-1 flex justify-end">
                <CharCount
                  value={description.length}
                  max={VIDEO_DESCRIPTION_MAX}
                />
              </div>
            </div>
          )}
        </div>

        {/* Tagovi */}
        <div className="space-y-2.5 rounded-xl border border-line bg-surface/50 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-xs font-semibold text-foreground">
                Tagovi
              </span>
              <p className="mt-0.5 text-xs text-text-muted">
                Lista se zamenjuje u celini. YouTube meri sve tagove zajedno.
              </p>
            </div>
            <PillToggle
              on={editTags}
              onChange={setEditTags}
              disabled={submitting}
              onLabel="Menjaju se"
              offLabel="Ostaju kakvi jesu"
            />
          </div>

          {editTags && (
            <div>
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface p-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-md border border-line-soft bg-surface-raised px-2 py-0.5 font-mono text-xs text-foreground"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() =>
                        setTags((prev) => prev.filter((t) => t !== tag))
                      }
                      disabled={submitting}
                      className="text-text-muted transition-colors hover:text-danger"
                      aria-label={`Ukloni tag ${tag}`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={() => addTag(tagDraft)}
                  disabled={submitting}
                  placeholder={
                    tags.length === 0 ? "marketing, analitika…" : "Dodaj…"
                  }
                  className="min-w-32 flex-1 bg-transparent px-1 py-0.5 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
                />
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <p className="text-xs text-text-muted">
                  Enter ili zarez dodaje tag.
                </p>
                <CharCount value={tagsLength} max={VIDEO_TAGS_TOTAL_MAX} />
              </div>
            </div>
          )}
        </div>

        {/* Kategorija */}
        <div>
          <Label className="mb-1.5 block text-xs font-medium text-text-muted">
            Kategorija
          </Label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={submitting}
            className="w-full rounded-md border border-line bg-surface px-2.5 py-2 text-xs font-medium text-foreground focus:border-accent-400 focus:outline-hidden"
          >
            <option value="">Ostaje kakva jeste</option>
            {VIDEO_CATEGORIES.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        </div>

        {/* Privatnost */}
        <div>
          <Label className="mb-1.5 block text-xs font-medium text-text-muted">
            Privatnost
          </Label>
          <SegmentedControl
            value={privacyStatus}
            onChange={(value) => setPrivacyStatus(value as PrivacyStatus | "")}
            disabled={submitting}
            options={[
              { value: "", label: "Ostaje kakva jeste" },
              ...PRIVACY_OPTIONS,
            ]}
          />
        </div>

        {/* Brisanje videa */}
        <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 p-3.5">
          <AlertTriangle
            className="mt-0.5 size-3.5 shrink-0 text-danger"
            aria-hidden
          />
          <div className="flex-1 text-xs leading-relaxed text-foreground">
            <p className="font-semibold text-danger">Brisanje videa</p>
            <p className="mt-1">
              Video, njegova statistika i svi komentari ispod njega nestaju
              trajno. Za privremeno sklanjanje postoji privatnost.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmingDelete(true)}
              disabled={submitting}
              className="mt-2.5 border-danger/40 text-danger hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 className="mr-1.5 size-3.5" />
              Obriši video
            </Button>
          </div>
        </div>
      </div>

      <DialogFooter className="items-center gap-2 border-t border-line pt-3 sm:justify-between">
        <span className="font-mono text-xs text-text-muted">
          {video.videoId}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            Otkaži
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={submitting || !hasChanges}
            className="bg-accent-400 font-semibold text-surface-dark hover:bg-accent-400/90"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                <span>Čuvam…</span>
              </>
            ) : (
              "Sačuvaj izmene"
            )}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

/**
 * How much of a YouTube limit is used up. Shown before sending because the
 * API answers a too-long title with a 400 and nothing else — by then the
 * operator has already lost the click.
 */
function CharCount({ value, max }: { value: number; max: number }) {
  return (
    <span
      className={cn(
        "font-mono text-xs tabular-nums",
        value > max ? "text-danger" : "text-text-muted",
      )}
    >
      {value}/{max}
    </span>
  );
}
