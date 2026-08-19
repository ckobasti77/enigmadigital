"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Lock,
  Smartphone,
  Upload,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import {
  DEFAULT_VIDEO_CATEGORY_ID,
  LARGE_FILE_WARNING_BYTES,
  SHORTS_MAX_SECONDS,
  UPLOAD_PRIVACY_LOCK_REASON,
  UPLOAD_PRIVATE_NOTICE,
  VIDEO_ACCEPT_ATTRIBUTE,
  VIDEO_CATEGORIES,
  VIDEO_DESCRIPTION_MAX,
  VIDEO_TAGS_TOTAL_MAX,
  VIDEO_TITLE_MAX,
  checkVideoFile,
  checkVideoMetadata,
  classifyVideoShape,
  formatDurationSeconds,
  formatFileSize,
} from "@/convex/lib/ytUpload";
import type { VideoShape } from "@/convex/lib/ytUpload";
import {
  UploadError,
  probeVideoFile,
  uploadVideoResumable,
} from "@/lib/yt-resumable-upload";
import type { UploadPhase, UploadProgress } from "@/lib/yt-resumable-upload";
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
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

/**
 * Sending a video to YouTube (Y10).
 *
 * Ovaj ekran mora da kaže jednu neprijatnu stvar pre nego što bilo šta uradi:
 * video poslat odavde ostaje privatan. Google zaključava svaki upload preko
 * API-ja iz neproverenog projekta i to se ne skida ni odavde ni iz Studija —
 * samo tako što aplikacija prođe audit. Zato upozorenje stoji iznad dugmeta,
 * uvek vidljivo, a polje za privatnost je zaključano i objašnjava zašto.
 * Ponuditi opciju „javno" koja ne radi bilo bi gore nego je ne ponuditi.
 *
 * Sve ostalo na ekranu služi tome da se dugačko slanje ne pokvari na pola:
 * fajl se proverava pre nego što krene, oblik i trajanje se čitaju iz samog
 * fajla da bi se reklo hoće li ovo biti Short, a traka napretka pokazuje samo
 * ono što je YouTube potvrdio da drži — nikad više.
 */

function convexMessage(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as { message?: string } | undefined;
    if (data && typeof data.message === "string") return data.message;
  }
  if (err instanceof Error && err.message.length > 0) return err.message;
  return fallback;
}

/** What the browser managed to read out of the chosen file. */
type Probe = {
  width: number;
  height: number;
  durationSeconds: number;
} | null;

type Stage = "form" | "uploading" | "done";

// ── the way in ───────────────────────────────────────────────────────────────

/**
 * The header button. Owns the open state so the page stays a server component.
 */
export function YtUploadButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-auto gap-1.5 bg-accent-400 px-3 py-2 text-xs font-semibold text-surface-dark hover:bg-accent-400/90"
      >
        <Upload className="size-3.5" aria-hidden />
        <span>Pošalji video</span>
      </Button>
      <YtUploadDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function YtUploadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Remounted on every open: a dialog that reopened showing the previous
  // upload's progress bar would be lying about what is happening.
  const [instance, setInstance] = useState(0);

  // A transfer in flight keeps the dialog open — closing it would unmount the
  // only thing holding the abort handle, leaving a large upload running with
  // nothing on screen to show it or stop it. "Prekini slanje" is the way out.
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          if (busy) return;
          setInstance((n) => n + 1);
        }
        onOpenChange(next);
      }}
    >
      <DialogPopup className="max-w-2xl sm:max-w-2xl">
        {open && (
          <YtUploadForm
            key={instance}
            onBusyChange={setBusy}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogPopup>
    </Dialog>
  );
}

function YtUploadForm({
  onBusyChange,
  onClose,
}: {
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
}) {
  const status = useQuery(api.ytUpload.uploadStatus);

  const startUpload = useMutation(api.ytUpload.startUpload);
  const finishUpload = useMutation(api.ytUpload.finishUpload);
  const failUpload = useMutation(api.ytUpload.failUpload);
  const issueUploadToken = useAction(api.ytAuth.issueUploadToken);

  const [file, setFile] = useState<File | null>(null);
  const [probe, setProbe] = useState<Probe>(null);
  const [probing, setProbing] = useState(false);
  const [dragging, setDragging] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [categoryId, setCategoryId] = useState(DEFAULT_VIDEO_CATEGORY_ID);

  const [stage, setStage] = useState<Stage>("form");
  const [phase, setPhase] = useState<UploadPhase>("opening");
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sentVideoId, setSentVideoId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Tells the dialog not to close mid-transfer, and releases the lock however
  // this component goes away.
  useEffect(() => {
    onBusyChange(stage === "uploading");
    return () => onBusyChange(false);
  }, [stage, onBusyChange]);

  const finalTags =
    tagDraft.trim().length > 0 && !tags.includes(tagDraft.trim())
      ? [...tags, tagDraft.trim()]
      : tags;
  const tagsLength = finalTags.join(",").length;

  const fileProblem =
    file === null
      ? null
      : checkVideoFile({
          fileName: file.name,
          size: file.size,
          type: file.type,
        });
  const metadataProblem = checkVideoMetadata({
    title,
    description,
    tags: finalTags,
  });

  const dailyLimitReached =
    status !== undefined && status.uploadsRemaining === 0;
  const notConnected = status !== undefined && !status.connected;

  const canSend =
    stage === "form" &&
    file !== null &&
    fileProblem === null &&
    metadataProblem === null &&
    !dailyLimitReached &&
    !notConnected;

  const chooseFile = useCallback(async (chosen: File | null) => {
    setFile(chosen);
    setProbe(null);
    setErrorMsg(null);
    if (chosen === null) return;

    // A file name is a better starting title than an empty box, and the
    // operator is going to rewrite it anyway. Never overwrites typed text.
    setTitle((current) =>
      current.trim().length > 0
        ? current
        : chosen.name.replace(/\.[^.]+$/, "").slice(0, VIDEO_TITLE_MAX),
    );

    setProbing(true);
    setProbe(await probeVideoFile(chosen));
    setProbing(false);
  }, []);

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

  const handleSend = async () => {
    if (file === null || !canSend) return;

    setStage("uploading");
    setErrorMsg(null);
    setPhase("opening");
    setProgress({ uploadedBytes: 0, totalBytes: file.size, ratio: 0 });

    // Books the day's upload and opens the job row. Also the only place the
    // metadata is assembled — the body below is sent exactly as it comes back,
    // which is what keeps `privacyStatus` out of the browser's hands.
    let jobId: Awaited<ReturnType<typeof startUpload>>["jobId"];
    let metadata: Awaited<ReturnType<typeof startUpload>>["metadata"];
    try {
      const started = await startUpload({
        title: title.trim(),
        description,
        tags: finalTags,
        categoryId,
      });
      jobId = started.jobId;
      metadata = started.metadata;
    } catch (err) {
      setErrorMsg(convexMessage(err, "Slanje nije moglo da počne."));
      setStage("form");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { accessToken } = await issueUploadToken();
      const result = await uploadVideoResumable({
        file,
        accessToken,
        metadata,
        signal: controller.signal,
        onPhase: setPhase,
        onProgress: setProgress,
      });

      await finishUpload({
        jobId,
        videoId: result.videoId,
        title: title.trim(),
      });
      setSentVideoId(result.videoId);
      setStage("done");
    } catch (err) {
      const cancelled = err instanceof UploadError && err.cancelled;
      const message = cancelled
        ? "Slanje je prekinuto."
        : convexMessage(err, "Slanje videa nije uspelo.");

      // The job row is closed even on the way out, so the operator can see
      // afterwards what happened — the sentence below disappears with the
      // dialog, the row does not.
      await failUpload({
        jobId,
        message,
        sessionOpened: err instanceof UploadError ? err.sessionOpened : false,
      }).catch(() => {});

      setErrorMsg(message);
      setStage("form");
    } finally {
      abortRef.current = null;
    }
  };

  // ── after it worked ────────────────────────────────────────────────────────
  if (stage === "done" && sentVideoId !== null) {
    return (
      <UploadDoneView
        videoId={sentVideoId}
        title={title.trim()}
        onClose={onClose}
      />
    );
  }

  const uploading = stage === "uploading";

  return (
    <div className="space-y-4">
      <DialogHeader>
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg border border-accent-400/20 bg-accent-400/10 text-accent-400">
            <Upload className="size-4" />
          </div>
          <div>
            <DialogTitle>Pošalji video</DialogTitle>
            <DialogDescription>
              Fajl ide pravo sa ovog računara na YouTube — ne prolazi kroz naš
              server.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      {errorMsg && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs leading-relaxed text-danger">
          {errorMsg}
        </div>
      )}

      {notConnected && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs leading-relaxed text-danger">
          YouTube nalog nije povezan. Poveži ga u Podešavanjima pa pokušaj
          ponovo.
        </div>
      )}

      <div className="max-h-[58vh] space-y-4 overflow-y-auto pr-1">
        {/* ── Fajl ──────────────────────────────────────────────────────── */}
        <FileDropZone
          file={file}
          problem={fileProblem}
          disabled={uploading}
          dragging={dragging}
          onDraggingChange={setDragging}
          onChange={(chosen) => void chooseFile(chosen)}
        />

        {file !== null && fileProblem === null && (
          <ShapeVerdict probe={probe} probing={probing} />
        )}

        {file !== null && file.size > LARGE_FILE_WARNING_BYTES && (
          <p className="flex items-start gap-1.5 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs leading-relaxed text-foreground">
            <AlertTriangle
              className="mt-0.5 size-3.5 shrink-0 text-warning"
              aria-hidden
            />
            <span>
              Fajl je {formatFileSize(file.size)}. Slanje može trajati dugo —
              ostavi ovaj prozor otvoren dok ne završi. Ako veza pukne, slanje
              se nastavlja odatle, ne iz početka.
            </span>
          </p>
        )}

        {/* ── Napredak ──────────────────────────────────────────────────── */}
        {uploading && progress !== null && (
          <UploadProgressPanel
            phase={phase}
            progress={progress}
            onAbort={() => abortRef.current?.abort()}
          />
        )}

        {/* ── Podaci o videu ────────────────────────────────────────────── */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <Label
              htmlFor="yt-upload-title"
              className="text-xs font-medium text-text-muted"
            >
              Naslov
            </Label>
            <CharCount value={title.length} max={VIDEO_TITLE_MAX} />
          </div>
          <Input
            id="yt-upload-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={uploading}
            placeholder="Naslov koji gledaoci vide"
            className="border-line bg-surface"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <Label
              htmlFor="yt-upload-description"
              className="text-xs font-medium text-text-muted"
            >
              Opis
            </Label>
            <CharCount value={description.length} max={VIDEO_DESCRIPTION_MAX} />
          </div>
          <Textarea
            id="yt-upload-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={uploading}
            rows={4}
            placeholder="O čemu je video…"
            className="border-line bg-surface"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="mb-1.5 block text-xs font-medium text-text-muted">
              Tagovi
            </Label>
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
                    disabled={uploading}
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
                disabled={uploading}
                placeholder={tags.length === 0 ? "marketing, analitika…" : "Dodaj…"}
                className="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
              />
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <p className="text-xs text-text-muted">Enter dodaje tag.</p>
              <CharCount value={tagsLength} max={VIDEO_TAGS_TOTAL_MAX} />
            </div>
          </div>

          <div>
            <Label
              htmlFor="yt-upload-category"
              className="mb-1.5 block text-xs font-medium text-text-muted"
            >
              Kategorija
            </Label>
            <select
              id="yt-upload-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={uploading}
              className="w-full rounded-md border border-line bg-surface px-2.5 py-2 text-xs font-medium text-foreground focus:border-accent-400 focus:outline-hidden"
            >
              {VIDEO_CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-text-muted">
              Može se promeniti kasnije kroz „Izmeni”.
            </p>
          </div>
        </div>

        {/* ── Privatnost, zaključana ────────────────────────────────────── */}
        <PrivacyLock />
      </div>

      {/* Uvek vidljivo, tik iznad dugmeta — ne u tooltipu. */}
      <PrivateModeNotice />

      <DialogFooter className="items-center gap-2 border-t border-line pt-3 sm:justify-between">
        <span className="font-mono text-xs tabular-nums text-text-muted">
          {status === undefined
            ? " "
            : dailyLimitReached
              ? `Dnevni limit dostignut — ${formatNumber(status.uploadLimit)} od ${formatNumber(status.uploadLimit)}`
              : `Danas poslato ${formatNumber(status.uploadsUsed)} od ${formatNumber(status.uploadLimit)}`}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={uploading}
          >
            Otkaži
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSend()}
            disabled={!canSend}
            className="bg-accent-400 font-semibold text-surface-dark hover:bg-accent-400/90"
          >
            {uploading ? "Šaljem…" : "Pošalji na YouTube"}
          </Button>
        </div>
      </DialogFooter>

      {dailyLimitReached && (
        <p className="text-xs leading-relaxed text-danger">
          Danas je poslato {formatNumber(status.uploadLimit)} videa, koliko je
          dnevni limit ove aplikacije. Limit postoji da greška u ponavljanju ne
          okači isti fajl sto puta. Nastavlja se sutra.
        </p>
      )}
      {metadataProblem !== null && file !== null && !uploading && (
        <p className="text-xs text-warning">{metadataProblem}</p>
      )}
    </div>
  );
}

// ── the file ─────────────────────────────────────────────────────────────────

function FileDropZone({
  file,
  problem,
  disabled,
  dragging,
  onDraggingChange,
  onChange,
}: {
  file: File | null;
  problem: string | null;
  disabled: boolean;
  dragging: boolean;
  onDraggingChange: (dragging: boolean) => void;
  onChange: (file: File | null) => void;
}) {
  const inputId = "yt-upload-file";

  return (
    <div>
      <div
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          onDraggingChange(true);
        }}
        onDragLeave={() => onDraggingChange(false)}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          onDraggingChange(false);
          onChange(e.dataTransfer.files?.[0] ?? null);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center transition-colors",
          dragging
            ? "border-accent-400/60 bg-accent-400/5"
            : problem !== null
              ? "border-danger/40 bg-danger/5"
              : "border-line bg-surface/40",
        )}
      >
        {file === null ? (
          <>
            <Upload className="size-5 text-text-muted" aria-hidden />
            <p className="text-xs text-text-muted">
              Prevuci video ovde ili ga izaberi sa računara
            </p>
          </>
        ) : (
          <>
            <p className="min-w-0 max-w-full truncate font-mono text-xs text-foreground">
              {file.name}
            </p>
            <p className="font-mono text-xs tabular-nums text-text-muted">
              {formatFileSize(file.size)}
              {file.type.length > 0 && ` · ${file.type}`}
            </p>
          </>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => document.getElementById(inputId)?.click()}
          className="mt-1 border-line-soft text-text-secondary hover:border-line-strong hover:text-foreground"
        >
          {file === null ? "Izaberi fajl" : "Izaberi drugi fajl"}
        </Button>
        <input
          id={inputId}
          type="file"
          accept={VIDEO_ACCEPT_ATTRIBUTE}
          disabled={disabled}
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          className="sr-only"
        />
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

/**
 * Short or ordinary video — read off the file, never decided by us.
 *
 * The numbers that produced the verdict are shown next to it, because the
 * verdict is not ours to give: YouTube reclassifies the video afterwards by
 * exactly these two properties, and if the operator disagrees the only fix is
 * a different file.
 */
function ShapeVerdict({ probe, probing }: { probe: Probe; probing: boolean }) {
  if (probing) {
    return (
      <p className="text-xs text-text-muted">Čitam dimenzije i trajanje…</p>
    );
  }
  if (probe === null) {
    return (
      <p className="text-xs text-text-muted">
        Browser ne ume da pročita ovaj format, pa se ne može reći hoće li biti
        Short. Slanje i dalje radi.
      </p>
    );
  }

  const shape: VideoShape = classifyVideoShape({
    width: probe.width,
    height: probe.height,
    durationSeconds: probe.durationSeconds,
  });

  const copy: Record<VideoShape, { title: string; body: string }> = {
    short: {
      title: "Ovo će biti Short",
      body: `Vertikalan je i traje ${formatDurationSeconds(probe.durationSeconds)} — do ${SHORTS_MAX_SECONDS / 60} minuta. YouTube ga sam svrstava u Shorts; ne postoji opcija koja to uključuje ili isključuje.`,
    },
    vertical_long: {
      title: "Vertikalan, ali predugačak za Short",
      body: `Traje ${formatDurationSeconds(probe.durationSeconds)}, a granica je ${SHORTS_MAX_SECONDS / 60} minuta. Biće običan video. Ako ti treba Short, skrati fajl pre slanja.`,
    },
    regular: {
      title: "Običan video",
      body: "Širi je nego viši, pa ne ulazi u Shorts bez obzira na trajanje.",
    },
  };

  const tone =
    shape === "short"
      ? "border-success/30 bg-success/5"
      : shape === "vertical_long"
        ? "border-warning/30 bg-warning/5"
        : "border-line bg-surface/40";

  const iconTone =
    shape === "short"
      ? "text-success"
      : shape === "vertical_long"
        ? "text-warning"
        : "text-text-muted";

  return (
    <div className={cn("flex items-start gap-2.5 rounded-xl border p-3.5", tone)}>
      <Smartphone className={cn("mt-0.5 size-4 shrink-0", iconTone)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground">
          {copy[shape].title}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">
          {copy[shape].body}
        </p>
        <p className="mt-1.5 font-mono text-micro tabular-nums text-text-muted">
          {probe.width}×{probe.height} ·{" "}
          {formatDurationSeconds(probe.durationSeconds)}
        </p>
      </div>
    </div>
  );
}

// ── progress ─────────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<UploadPhase, string> = {
  opening: "Otvaram sesiju na YouTube-u…",
  sending: "Šaljem fajl…",
  finishing: "YouTube obrađuje video…",
};

/**
 * How far the file has actually got.
 *
 * The percentage counts only bytes YouTube has confirmed it holds, so it never
 * runs ahead of the transfer — and it moves in 8 MB steps, because that is the
 * chunk and the browser reports nothing in between. Cancelling is offered
 * throughout: a long upload the operator cannot stop is a trap.
 */
function UploadProgressPanel({
  phase,
  progress,
  onAbort,
}: {
  phase: UploadPhase;
  progress: UploadProgress;
  onAbort: () => void;
}) {
  const percent = Math.round(progress.ratio * 100);

  return (
    <div className="rounded-xl border border-accent-400/30 bg-card px-3.5 py-3" role="status">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-xs text-foreground">{PHASE_LABELS[phase]}</p>
        <p className="font-mono text-xs font-semibold tabular-nums text-accent-400">
          {percent}%
        </p>
      </div>

      <ProgressRail ratio={progress.ratio} />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-micro tabular-nums text-text-muted">
          {formatFileSize(progress.uploadedBytes)} od{" "}
          {formatFileSize(progress.totalBytes)}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAbort}
          className="h-6 gap-1 border-danger/40 px-2 text-micro text-danger hover:bg-danger/10 hover:text-danger"
        >
          <X className="size-3" aria-hidden />
          <span>Prekini slanje</span>
        </Button>
      </div>
    </div>
  );
}

/**
 * The bar. GSAP rather than a CSS transition so the reduced-motion branch is
 * explicit — there each step is simply drawn at its width.
 */
function ProgressRail({ ratio }: { ratio: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = `${(Math.min(1, ratio) * 100).toFixed(1)}%`;

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.to(ref.current, { width, duration: 0.4, ease: "power2.out" });
      });
    },
    { dependencies: [width] },
  );

  return (
    <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
      <div
        ref={ref}
        style={{ width }}
        className="h-full rounded-full bg-accent-400"
      />
    </div>
  );
}

// ── the restriction ──────────────────────────────────────────────────────────

/** The locked privacy field, and the reason it is locked. */
function PrivacyLock() {
  return (
    <div className="rounded-xl border border-line bg-surface/50 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-xs font-medium text-text-muted">Privatnost</Label>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-text-muted">
          <Lock className="size-3" aria-hidden />
          Privatno — zaključano
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-text-muted">
        {UPLOAD_PRIVACY_LOCK_REASON}
      </p>
    </div>
  );
}

/** The sentence that has to be read before the click. */
function PrivateModeNotice() {
  return (
    <div
      className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 p-3.5"
      role="note"
    >
      <AlertTriangle
        className="mt-0.5 size-4 shrink-0 text-warning"
        aria-hidden
      />
      <p className="text-xs leading-relaxed text-foreground">
        {UPLOAD_PRIVATE_NOTICE}
      </p>
    </div>
  );
}

// ── after it worked ──────────────────────────────────────────────────────────

function UploadDoneView({
  videoId,
  title,
  onClose,
}: {
  videoId: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <DialogHeader>
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg border border-success/30 bg-success/10 text-success">
            <CheckCircle2 className="size-4" />
          </div>
          <div className="min-w-0">
            <DialogTitle>Video je poslat</DialogTitle>
            <DialogDescription className="truncate">{title}</DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-3 rounded-xl border border-warning/40 bg-warning/10 p-3.5">
        <p className="text-xs leading-relaxed text-foreground">
          Stoji na kanalu kao <strong>privatan</strong> i niko ga osim vlasnika
          naloga ne vidi. To se ne menja odavde — otvori YouTube Studio ako
          treba da bude javan.
        </p>
        <p className="text-xs text-text-muted">
          Pregledi i ostale brojke stižu posle prve sinhronizacije.
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface/50 px-3 py-2">
        <span className="text-xs text-text-muted">ID videa</span>
        <span className="font-mono text-xs text-foreground">{videoId}</span>
      </div>

      <DialogFooter className="items-center border-t border-line pt-3 sm:justify-between">
        <a
          href={`https://studio.youtube.com/video/${videoId}/edit`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-400 underline-offset-4 hover:underline"
        >
          <span>Otvori u YouTube Studiju</span>
          <ExternalLink className="size-3" aria-hidden />
        </a>
        <Button type="button" size="sm" variant="outline" onClick={onClose}>
          Zatvori
        </Button>
      </DialogFooter>
    </div>
  );
}

/** How much of a YouTube limit is used up, shown before the API refuses it. */
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
