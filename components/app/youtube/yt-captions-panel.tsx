"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import {
  AlertTriangle,
  Captions,
  Loader2,
  RefreshCw,
  Replace,
  Trash2,
  Upload,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  CAPTION_ACCEPT_ATTRIBUTE,
  CAPTION_LANGUAGES,
  CAPTION_NAME_MAX,
  captionLanguageLabel,
  checkCaptionFile,
  formatKilobytes,
} from "@/convex/lib/ytCaptions";
import { QUOTA_COST } from "@/convex/lib/ytQuota";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PillToggle } from "./yt-automation-editor-dialog";
import type { VideoItem } from "./youtube-videos-grid";
import { formatNumber } from "@/lib/format";
import { DUR_UI, EASE_UI } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { FeedbackNote } from "@/components/app/feedback";

gsap.registerPlugin(useGSAP);

/**
 * Caption tracks for one video (Y9).
 *
 * This screen exists because of a price. Everywhere else in the app a click
 * costs one unit or fifty; here sending a subtitle costs 400 — eight automatic
 * replies to real people who commented under a video — and replacing one costs
 * 450. Ten subtitles is half a day's budget.
 *
 * So the cost is not a detail in a tooltip. Every action in this panel states,
 * before the click, what it will spend and what is left afterwards, and the
 * bar underneath shows the day filling up. Nothing here is allowed to surprise
 * anyone after the fact.
 *
 * Even opening the panel costs 50 units, because the list of tracks lives at
 * YouTube. That is why it loads once and refreshes only when asked.
 */

type CaptionTrack = {
  id: string;
  language: string;
  name: string;
  isDraft: boolean;
  trackKind: string;
  lastUpdated: number | null;
};

/**
 * The row-level flow the panel is in the middle of. Null means the ordinary
 * state: the list, and the form for sending a new track. Only one at a time —
 * two open cost previews on screen would be two different numbers claiming to
 * be the next thing that happens.
 */
type PendingAction =
  | { kind: "replace"; track: CaptionTrack }
  | { kind: "delete"; track: CaptionTrack };

function convexMessage(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as { message?: string } | undefined;
    if (data && typeof data.message === "string") return data.message;
  }
  if (err instanceof Error && err.message.length > 0) return err.message;
  return fallback;
}

function formatTrackDate(timestamp: number | null): string {
  if (timestamp === null) return "—";
  return new Date(timestamp).toLocaleDateString("sr-Latn-RS", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function YtCaptionsPanel({
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
      <DialogPopup className="max-w-3xl sm:max-w-3xl">
        {video !== null && (
          <YtCaptionsContent
            key={video.videoId}
            video={video}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogPopup>
    </Dialog>
  );
}

function YtCaptionsContent({
  video,
  onClose,
}: {
  video: VideoItem;
  onClose: () => void;
}) {
  const quota = useQuery(api.ytMedia.mediaQuotaStatus);

  const listCaptions = useAction(api.ytCaptions.listCaptions);
  const uploadCaption = useAction(api.ytCaptions.uploadCaption);
  const updateCaption = useAction(api.ytCaptions.updateCaption);
  const deleteCaption = useAction(api.ytCaptions.deleteCaption);
  const generateUploadUrl = useMutation(api.ytCaptions.generateCaptionUploadUrl);

  const [tracks, setTracks] = useState<CaptionTrack[] | null>(null);
  const [listing, setListing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // The upload form.
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("sr");
  const [name, setName] = useState("");
  const [isDraft, setIsDraft] = useState(false);

  // The per-row flows: replacing a track's file, or deleting it.
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setListing(true);
    setListError(null);
    try {
      setTracks(await listCaptions({ videoId: video.videoId }));
    } catch (err) {
      setListError(convexMessage(err, "Titlovi se ne mogu učitati."));
    } finally {
      setListing(false);
    }
  }, [listCaptions, video.videoId]);

  // Once, on open. 50 units a time is too much to spend on a poll, so this is
  // the only automatic load there is — everything after it is a button.
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void refresh();
  }, [refresh]);

  /** Put the file in Convex storage; the action reads it from there. */
  const putInStorage = async (chosen: File): Promise<Id<"_storage">> => {
    const url = await generateUploadUrl();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": chosen.type.length > 0 ? chosen.type : "text/plain",
      },
      body: chosen,
    });
    if (!res.ok) {
      throw new Error("Fajl nije stigao do servera. Pokušaj ponovo.");
    }
    const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
    return storageId;
  };

  const fileProblem =
    file === null
      ? null
      : checkCaptionFile({ fileName: file.name, size: file.size });
  const replacementProblem =
    replacementFile === null
      ? null
      : checkCaptionFile({
          fileName: replacementFile.name,
          size: replacementFile.size,
        });

  const handleUpload = async () => {
    if (file === null || fileProblem !== null) return;
    setSubmitting(true);
    setActionError(null);
    setNotice(null);
    try {
      const storageId = await putInStorage(file);
      await uploadCaption({
        videoId: video.videoId,
        storageId,
        language,
        name: name.trim(),
        isDraft,
      });
      setFile(null);
      setName("");
      setPending(null);
      setNotice("Titl je poslat na YouTube.");
      await refresh();
    } catch (err) {
      setActionError(convexMessage(err, "Slanje titla nije uspelo."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReplace = async (track: CaptionTrack) => {
    if (replacementFile === null || replacementProblem !== null) return;
    setSubmitting(true);
    setActionError(null);
    setNotice(null);
    try {
      const storageId = await putInStorage(replacementFile);
      await updateCaption({ captionId: track.id, storageId });
      setReplacementFile(null);
      setPending(null);
      setNotice("Titl je zamenjen.");
      await refresh();
    } catch (err) {
      setActionError(convexMessage(err, "Zamena titla nije uspela."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (track: CaptionTrack) => {
    setSubmitting(true);
    setActionError(null);
    setNotice(null);
    try {
      await deleteCaption({ captionId: track.id });
      setPending(null);
      setNotice("Titl je obrisan.");
      await refresh();
    } catch (err) {
      setActionError(convexMessage(err, "Brisanje titla nije uspelo."));
    } finally {
      setSubmitting(false);
    }
  };

  const openPending = (next: PendingAction) => {
    setActionError(null);
    setNotice(null);
    setReplacementFile(null);
    setPending(next);
  };

  return (
    <div className="space-y-4">
      <DialogHeader>
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg border border-accent-400/20 bg-accent-400/10 text-accent-400">
            <Captions className="size-4" />
          </div>
          <div className="min-w-0">
            <DialogTitle>Titlovi</DialogTitle>
            <DialogDescription className="truncate">
              {video.title}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      {actionError && (
        <FeedbackNote tone="danger" title={actionError} />
      )}
      {notice && (
        <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-success">
          {notice}
        </div>
      )}

      <div className="max-h-[62vh] space-y-4 overflow-y-auto pr-1">
        {/* ── Postojeći titlovi ─────────────────────────────────────────── */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-foreground">
                Postojeći titlovi
              </h3>
              <p className="mt-0.5 text-xs text-text-muted">
                Spisak se čita sa YouTube-a i košta {QUOTA_COST.captionsList}{" "}
                jedinica po učitavanju.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={listing || submitting}
              className="h-7 gap-1.5 border-line-soft px-2 text-xs text-text-secondary hover:border-line-strong hover:text-foreground"
            >
              <RefreshCw
                className={cn("size-3", listing && "animate-spin")}
                aria-hidden
              />
              <span>Osveži ({QUOTA_COST.captionsList})</span>
            </Button>
          </div>

          {listError !== null ? (
            <FeedbackNote tone="danger" title={listError} />
          ) : tracks === null ? (
            <div className="space-y-1.5">
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
          ) : tracks.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line bg-surface/40 px-3 py-6 text-center text-xs text-text-muted">
              Ovaj video još nema nijedan titl.
            </p>
          ) : (
            <CaptionTable
              tracks={tracks}
              disabled={submitting || listing}
              onReplace={(track) => openPending({ kind: "replace", track })}
              onDelete={(track) => openPending({ kind: "delete", track })}
            />
          )}
        </section>

        {/* ── Zamena ili brisanje jednog titla ──────────────────────────── */}
        {pending !== null && pending.kind === "replace" && (
          <section className="space-y-3 rounded-xl border border-line-strong bg-surface-raised/40 p-3.5">
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Replace className="size-3.5 text-accent-400" aria-hidden />
                Zameni titl — {captionLanguageLabel(pending.track.language)}
                {pending.track.name.length > 0 && ` · ${pending.track.name}`}
              </h3>
              <p className="mt-1 text-xs text-text-muted">
                Menja se samo fajl. Jezik, naziv i status ostaju kakvi jesu.
              </p>
            </div>

            <CaptionFilePicker
              file={replacementFile}
              problem={replacementProblem}
              disabled={submitting}
              onChange={setReplacementFile}
              inputId="yt-caption-replacement"
            />

            <CostPanel
              label="Zamena ovog titla"
              cost={QUOTA_COST.captionsUpdate}
              quota={quota}
              retryWarning
            />

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPending(null)}
                disabled={submitting}
              >
                Otkaži
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleReplace(pending.track)}
                disabled={
                  submitting ||
                  replacementFile === null ||
                  replacementProblem !== null ||
                  !affordable(quota, QUOTA_COST.captionsUpdate)
                }
                className="font-semibold"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    <span>Zamenjujem…</span>
                  </>
                ) : (
                  `Zameni za ${formatNumber(QUOTA_COST.captionsUpdate)} jedinica`
                )}
              </Button>
            </div>
          </section>
        )}

        {pending !== null && pending.kind === "delete" && (
          <section className="space-y-3 rounded-xl border border-danger/30 bg-danger/5 p-3.5">
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-danger">
                <Trash2 className="size-3.5" aria-hidden />
                Obrisati titl — {captionLanguageLabel(pending.track.language)}
                {pending.track.name.length > 0 && ` · ${pending.track.name}`}?
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-foreground">
                Gledaoci ga odmah prestaju viđati. Brisanje košta{" "}
                {QUOTA_COST.captionsDelete} jedinica, a vraćanje istog titla
                nazad košta {formatNumber(QUOTA_COST.captionsInsert)} — osam
                puta više. Zadrži fajl.
              </p>
            </div>

            <CostPanel
              label="Brisanje ovog titla"
              cost={QUOTA_COST.captionsDelete}
              quota={quota}
            />

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPending(null)}
                disabled={submitting}
              >
                Otkaži
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleDelete(pending.track)}
                disabled={
                  submitting || !affordable(quota, QUOTA_COST.captionsDelete)
                }
                className="bg-danger font-semibold text-text-inverse hover:bg-danger/90"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    <span>Brišem…</span>
                  </>
                ) : (
                  "Obriši titl"
                )}
              </Button>
            </div>
          </section>
        )}

        {/* ── Slanje novog titla ────────────────────────────────────────── */}
        {pending === null && (
          <section className="space-y-3 rounded-xl border border-line bg-surface/50 p-3.5">
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Upload className="size-3.5 text-accent-400" aria-hidden />
                Pošalji novi titl
              </h3>
            </div>

            <CaptionFilePicker
              file={file}
              problem={fileProblem}
              disabled={submitting}
              onChange={setFile}
              inputId="yt-caption-file"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label
                  htmlFor="yt-caption-language"
                  className="mb-1.5 block text-xs font-medium text-text-muted"
                >
                  Jezik
                </Label>
                <select
                  id="yt-caption-language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-md border border-line bg-surface px-2.5 py-2 text-xs font-medium text-foreground focus:border-accent-400 focus:outline-hidden"
                >
                  {CAPTION_LANGUAGES.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label} ({option.code})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-text-muted">
                  Pogrešan jezik YouTube prihvata bez greške — titl se pojavi
                  tamo gde ga niko ne traži.
                </p>
              </div>

              <div>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <Label
                    htmlFor="yt-caption-name"
                    className="text-xs font-medium text-text-muted"
                  >
                    Naziv
                  </Label>
                  <span
                    className={cn(
                      "font-mono text-xs tabular-nums",
                      name.length > CAPTION_NAME_MAX
                        ? "text-danger"
                        : "text-text-muted",
                    )}
                  >
                    {name.length}/{CAPTION_NAME_MAX}
                  </span>
                </div>
                <Input
                  id="yt-caption-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                  placeholder="npr. Srpski (prevod)"
                  className="border-line bg-surface"
                />
                <p className="mt-1 text-xs text-text-muted">
                  Ono što gledalac vidi u meniju titlova. Može ostati prazno.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface p-3">
              <div>
                <span className="text-xs font-semibold text-foreground">
                  Radna verzija
                </span>
                <p className="mt-0.5 text-xs text-text-muted">
                  Titl stoji na videu ali ga gledaoci ne vide — pregledaj ga u
                  Studiju pa objavi.
                </p>
              </div>
              <PillToggle
                on={isDraft}
                onChange={setIsDraft}
                disabled={submitting}
                onLabel="Ne objavljuje se"
                offLabel="Objavljuje se odmah"
              />
            </div>

            {/* Uvek vidljivo, tik iznad dugmeta. */}
            <CostPanel
              label="Slanje ovog titla"
              cost={QUOTA_COST.captionsInsert}
              quota={quota}
              retryWarning
            />

            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                onClick={() => void handleUpload()}
                disabled={
                  submitting ||
                  file === null ||
                  fileProblem !== null ||
                  name.length > CAPTION_NAME_MAX ||
                  !affordable(quota, QUOTA_COST.captionsInsert)
                }
                className="font-semibold"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    <span>Šaljem…</span>
                  </>
                ) : (
                  `Pošalji titl za ${formatNumber(QUOTA_COST.captionsInsert)} jedinica`
                )}
              </Button>
            </div>
          </section>
        )}
      </div>

      <DialogFooter className="items-center border-t border-line pt-3 sm:justify-between">
        <span className="font-mono text-xs text-text-muted">
          {video.videoId}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClose}
          disabled={submitting}
        >
          Zatvori
        </Button>
      </DialogFooter>
    </div>
  );
}

// ── the table ────────────────────────────────────────────────────────────────

function CaptionTable({
  tracks,
  disabled,
  onReplace,
  onDelete,
}: {
  tracks: CaptionTrack[];
  disabled: boolean;
  onReplace: (track: CaptionTrack) => void;
  onDelete: (track: CaptionTrack) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <Table className="text-xs">
        <TableHeader>
          <TableRow className="border-line-soft bg-surface-raised/50 hover:bg-transparent">
            <TableHead className="h-9 pl-3 text-xs font-medium text-text-muted">
              Jezik
            </TableHead>
            <TableHead className="h-9 text-xs font-medium text-text-muted">
              Naziv
            </TableHead>
            <TableHead className="h-9 text-xs font-medium text-text-muted">
              Status
            </TableHead>
            <TableHead className="h-9 text-xs font-medium text-text-muted">
              Datum
            </TableHead>
            <TableHead className="h-9 pr-3 text-right text-xs font-medium text-text-muted">
              Akcija
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tracks.map((track) => {
            // YouTube's own transcription. It cannot be replaced or deleted
            // through the API — a 403, with the units already gone — so the
            // buttons are not offered rather than offered and refused.
            const automatic = track.trackKind === "ASR";
            return (
              <TableRow
                key={track.id}
                className="border-line-soft hover:bg-surface-raised/40"
              >
                <TableCell className="py-2 pl-3 text-xs text-foreground">
                  {captionLanguageLabel(track.language)}
                  <span className="ml-1.5 font-mono text-micro text-text-muted">
                    {track.language}
                  </span>
                </TableCell>
                <TableCell className="py-2 text-xs text-text-secondary">
                  {track.name.length > 0 ? track.name : "—"}
                </TableCell>
                <TableCell className="py-2">
                  <StatusPill track={track} automatic={automatic} />
                </TableCell>
                <TableCell className="py-2 font-mono text-xs whitespace-nowrap tabular-nums text-text-muted">
                  {formatTrackDate(track.lastUpdated)}
                </TableCell>
                <TableCell className="py-2 pr-3 text-right">
                  {automatic ? (
                    <span className="text-micro text-text-muted">
                      YouTube ga sam pravi
                    </span>
                  ) : (
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onReplace(track)}
                        disabled={disabled}
                        className="h-6 gap-1 border-line-soft px-2 text-micro text-text-secondary hover:border-line-strong hover:text-foreground"
                      >
                        <Replace className="size-3" aria-hidden />
                        <span>Zameni</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onDelete(track)}
                        disabled={disabled}
                        className="h-6 gap-1 border-danger/40 px-2 text-micro text-danger hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 className="size-3" aria-hidden />
                        <span>Obriši</span>
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function StatusPill({
  track,
  automatic,
}: {
  track: CaptionTrack;
  automatic: boolean;
}) {
  const label = automatic
    ? "Automatski"
    : track.isDraft
      ? "Radna verzija"
      : "Objavljen";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-micro font-medium",
        automatic
          ? "border-line bg-surface text-text-muted"
          : track.isDraft
            ? "border-warning/30 bg-warning/10 text-warning"
            : "border-success/30 bg-success/10 text-success",
      )}
    >
      {label}
    </span>
  );
}

// ── the file picker ──────────────────────────────────────────────────────────

function CaptionFilePicker({
  file,
  problem,
  disabled,
  onChange,
  inputId,
}: {
  file: File | null;
  problem: string | null;
  disabled: boolean;
  onChange: (file: File | null) => void;
  inputId: string;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => document.getElementById(inputId)?.click()}
          className="border-line-soft text-text-secondary hover:border-line-strong hover:text-foreground"
        >
          {file === null ? "Izaberi fajl" : "Izaberi drugi fajl"}
        </Button>
        <input
          id={inputId}
          type="file"
          accept={CAPTION_ACCEPT_ATTRIBUTE}
          disabled={disabled}
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          className="sr-only"
        />
        {file === null ? (
          <span className="text-xs text-text-muted">
            .srt ili .vtt, najviše 1 MB
          </span>
        ) : (
          <span className="min-w-0 truncate font-mono text-xs text-foreground">
            {file.name}{" "}
            <span className="text-text-muted">({formatKilobytes(file.size)})</span>
          </span>
        )}
      </div>

      {problem !== null && (
        <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-danger">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span>{problem}</span>
        </p>
      )}
    </div>
  );
}

// ── the price, before the click ──────────────────────────────────────────────

type MediaQuota =
  | { unitsUsed: number; unitsRemaining: number; mediaLimit: number }
  | undefined;

function affordable(quota: MediaQuota, cost: number): boolean {
  // Undefined means the budget has not loaded yet. Blocking the button then
  // would be wrong in the common case, so the backend stays the authority —
  // it refuses and says why, without spending anything.
  return quota === undefined || quota.unitsRemaining >= cost;
}

/**
 * What this click costs and what is left after it.
 *
 * The one thing on this screen that has to be read before the click, so it is
 * stated in units AND drawn as a bar: the filled part is today, the outlined
 * part is what this operation adds. When it no longer fits, the panel says so
 * in a sentence instead of leaving the arithmetic to the reader.
 */
function CostPanel({
  label,
  cost,
  quota,
  retryWarning = false,
}: {
  label: string;
  cost: number;
  quota: MediaQuota;
  /** Insert and update may pay twice if the multipart body is refused. */
  retryWarning?: boolean;
}) {
  if (quota === undefined) {
    return <Skeleton className="h-[86px] w-full rounded-xl" />;
  }

  const fits = quota.unitsRemaining >= cost;
  const after = Math.max(0, quota.unitsRemaining - cost);

  return (
    <div
      className={cn(
        "rounded-xl border px-3.5 py-3",
        fits ? "border-line-soft bg-card" : "border-danger/30 bg-danger/5",
      )}
      role="status"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-xs text-foreground">
          {label}:{" "}
          <span className="font-mono font-semibold tabular-nums text-accent-400">
            {formatNumber(cost)}
          </span>{" "}
          jedinica
        </p>
        <p className="font-mono text-xs tabular-nums text-text-muted">
          danas potrošeno {formatNumber(quota.unitsUsed)} od{" "}
          {formatNumber(quota.mediaLimit)}
        </p>
      </div>

      <CostBar
        used={quota.unitsUsed}
        pending={cost}
        limit={quota.mediaLimit}
        fits={fits}
      />

      {fits ? (
        <p className="mt-2 text-xs text-text-muted">
          Posle ovoga ostaje{" "}
          <span className="font-mono tabular-nums text-foreground">
            {formatNumber(after)}
          </span>{" "}
          jedinica za izmene danas.
          {retryWarning && (
            <>
              {" "}
              Ako prvi pokušaj ne prođe, rezervni put košta još{" "}
              <span className="font-mono tabular-nums">
                {formatNumber(cost)}
              </span>
              .
            </>
          )}
        </p>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-danger">
          Ostalo je samo {formatNumber(quota.unitsRemaining)} jedinica za
          izmene, a ovo traži {formatNumber(cost)}. Ostatak dnevnog budžeta je
          rezervisan za automatske odgovore na komentare i ne troši se ovde.
          Pokušaj sutra.
        </p>
      )}
    </div>
  );
}

/**
 * Today's media budget as one bar: what is spent, then what this click adds.
 *
 * GSAP rather than a CSS transition so the reduced-motion branch is explicit —
 * there the pending segment is simply drawn at its width.
 */
function CostBar({
  used,
  pending,
  limit,
  fits,
}: {
  used: number;
  pending: number;
  limit: number;
  fits: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const usedRatio = limit > 0 ? Math.min(1, used / limit) : 1;
  const pendingRatio =
    limit > 0 ? Math.min(1 - usedRatio, pending / limit) : 0;
  const pendingWidth = `${(pendingRatio * 100).toFixed(1)}%`;

  const played = useRef(false);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const first = !played.current;
      played.current = true;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // Samo prvi prikaz kreće od nule. Kada stigne nova procena iz
        // Convex-a, traka klizi od zatečene širine — inače bi se pri svakom
        // ažuriranju vraćala na nulu i ponovo rasla pred korisnikom.
        if (first) gsap.set(el, { width: 0 });
        gsap.to(el, {
          width: pendingWidth,
          duration: DUR_UI,
          ease: EASE_UI,
          overwrite: "auto",
        });
      });
    },
    { dependencies: [pendingWidth] },
  );

  return (
    <div className="mt-2.5 flex h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
      <div
        style={{ width: `${(usedRatio * 100).toFixed(1)}%` }}
        className="h-full bg-text-muted/50"
      />
      <div
        ref={ref}
        style={{ width: pendingWidth }}
        className={cn("h-full", fits ? "bg-accent-400" : "bg-danger")}
      />
    </div>
  );
}
