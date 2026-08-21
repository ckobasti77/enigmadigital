"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import {
  CalendarClock,
  ChevronDown,
  Crosshair,
  Gauge,
  Info,
  Plus,
  Send,
  X,
  Zap,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  ALT_TEXT_MAX,
  CAPTION_MAX,
  HASHTAG_MAX,
  IRREVERSIBLE_NOTICE,
  KIND_LABELS,
  MENTION_MAX,
  NO_DELETE_NOTICE,
  NO_LIKE_NOTICE,
  PUBLISHED_UNCONFIRMED_LABEL,
  PUBLISH_KINDS,
  SCOPE_NOTICE_BODY,
  SCOPE_NOTICE_TITLE,
  USER_TAGS_MAX,
  acceptsCaption,
  acceptsShareToFeed,
  checkAltText,
  checkAudioName,
  checkCaption,
  checkFile,
  checkImageAspect,
  checkItemCount,
  checkScheduledFor,
  checkTrialGraduationStrategy,
  checkUserTags,
  countHashtags,
  countMentions,
  formatBytes,
  itemRange,
  pluralFiles,
  storyAspectNote,
  checkVideoDuration,
  type PublishKind,
  type UserTagInput,
} from "@/convex/lib/igPublish";
import {
  pickedKindOf,
  probeImageFile,
  probeVideoFile,
  uploadFileToStorage,
} from "@/lib/ig-upload";
import {
  SCHEDULE_TIME_ZONE_LABEL,
  belgradeInputsFor,
  belgradeToEpoch,
  formatBelgrade,
} from "@/lib/belgrade-time";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Reveal } from "@/components/motion/reveal";
import { CountUp } from "@/components/motion/count-up";
import { CharCount, Field, FormGroup, FormStack } from "@/components/app/form-kit";
import { FeedbackNote } from "@/components/app/feedback";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PublishDropzone, type PickedItem } from "./publish-dropzone";
import { PublishPreview } from "./publish-preview";
import { PublishJobsPanel } from "./publish-jobs-panel";

/**
 * Nova objava (F3).
 *
 * The screen is built around one uncomfortable fact: publishing is irreversible
 * and asynchronous at the same time. Irreversible, so nothing leaves without a
 * dialog that says exactly what is about to go out. Asynchronous, so the moment
 * the button is pressed the operator is watching a process that takes minutes
 * and happens somewhere else — and every one of its steps has to be on screen,
 * because "šalje se" covers three different waits of three different lengths.
 *
 * Every rule the composer applies here is applied again on the server
 * (convex/lib/igPublish.ts is shared, not copied). What the browser adds is the
 * two checks that need to decode the file — an image's shape and a video's
 * length — and the ability to refuse before a byte is uploaded.
 */

function convexMessage(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as { message?: string } | undefined;
    if (data?.message) return data.message;
  }
  if (err instanceof Error && err.message.trim().length > 0) return err.message;
  return fallback;
}

/** How often the form's idea of "now" is allowed to move. */
const CLOCK_TICK_MS = 30_000;

/**
 * The current moment, as something a render may legally read.
 *
 * The wall clock is an external mutable source, so it is subscribed to rather
 * than read during render — `Date.now()` in a render body gives two renders of
 * the same state two different answers. Quantising to the tick is what makes
 * the snapshot stable: within one 30-second bucket every read returns the same
 * number, which is exactly the contract `useSyncExternalStore` asks for.
 *
 * The tick is not decoration. "Bar minut u budućnosti" quietly stops being
 * true while a form sits open, and this is what notices.
 */
function useCoarseNow(): number {
  return useSyncExternalStore(
    (onChange) => {
      const timer = setInterval(onChange, CLOCK_TICK_MS);
      return () => clearInterval(timer);
    },
    () => Math.floor(Date.now() / CLOCK_TICK_MS) * CLOCK_TICK_MS,
    // On the server there is no clock worth reporting; the schedule check
    // stays silent until hydration, and the server re-checks it regardless.
    () => 0,
  );
}

type Phase = "idle" | "uploading" | "submitting";

type PublishingLimit = {
  connected: boolean;
  used: number;
  total: number;
  error?: string;
};

export function PublishComposer() {
  const connections = useQuery(api.connections.list);
  const jobs = useQuery(api.instagramPublishStore.listJobs);
  const generateUploadUrl = useMutation(
    api.instagramPublishStore.generateUploadUrl,
  );
  const registerUpload = useMutation(api.instagramPublishStore.registerUpload);
  const createJob = useMutation(api.instagramPublishStore.createJob);
  const fetchLimit = useAction(api.instagramPublish.publishingLimit);

  const [kind, setKind] = useState<PublishKind>("IMAGE");
  const [items, setItems] = useState<PickedItem[]>([]);
  const [caption, setCaption] = useState("");
  const [shareToFeed, setShareToFeed] = useState(true);
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");

  // G7 fields
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [userTags, setUserTags] = useState<UserTagInput[]>([]);
  const [newTagHandle, setNewTagHandle] = useState("");
  const [isPlacingTag, setIsPlacingTag] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const [locationId, setLocationId] = useState("");
  const [altText, setAltText] = useState("");
  const [audioName, setAudioName] = useState("");
  const [trialEnabled, setTrialEnabled] = useState(false);
  const [trialGraduationStrategy, setTrialGraduationStrategy] = useState<
    "MANUAL" | "SS_PERFORMANCE"
  >("MANUAL");

  const [phase, setPhase] = useState<Phase>("idle");
  const [sentBytes, setSentBytes] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dropNotice, setDropNotice] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeJobId, setActiveJobId] = useState<Id<"igPublishJobs"> | null>(
    null,
  );

  /**
   * One send at a time, decided outside React's state.
   *
   * `phase` disables the button, but a disabled button is a RENDERED fact: it
   * arrives one commit after the click that should have caused it, and two
   * clicks inside that window are two uploads and two posts. A ref changes in
   * the same tick as the call, which is the only place the guard can be if it
   * is meant to hold.
   */
  const sending = useRef(false);

  const now = useCoarseNow();

  const nextId = useRef(0);
  // Every object URL ever created here, so none survives the unmount. A tab
  // left open all day with a gigabyte of previews behind it is a real outcome.
  const objectUrls = useRef<string[]>([]);
  useEffect(
    () => () => {
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
      objectUrls.current = [];
    },
    [],
  );

  // ── the 24h allowance ──────────────────────────────────────────────────────
  const [limit, setLimit] = useState<PublishingLimit | null>(null);
  const publishedCount = useMemo(
    () => (jobs ?? []).filter((job) => job.status === "published").length,
    [jobs],
  );

  useEffect(() => {
    let cancelled = false;
    // Re-asked whenever a post of ours lands, because that is the one moment we
    // know the number moved. Everything else that moves it happens on a phone.
    fetchLimit({})
      .then((result) => {
        if (!cancelled) setLimit(result);
      })
      .catch(() => {
        if (!cancelled) setLimit(null);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchLimit, publishedCount]);

  // ── validation, derived and never stored ───────────────────────────────────

  const itemProblems = useMemo(
    () =>
      items.map((item) => {
        const fileProblem = checkFile({
          kind,
          size: item.file.size,
          type: item.file.type,
        });
        if (fileProblem !== null) return fileProblem;

        if (item.kind === "image" && item.width && item.height) {
          return checkImageAspect({
            kind,
            width: item.width,
            height: item.height,
          });
        }
        if (item.kind === "video" && item.durationSeconds) {
          return checkVideoDuration({ kind, seconds: item.durationSeconds });
        }
        return null;
      }),
    [items, kind],
  );

  const storyNote = useMemo(() => {
    if (kind !== "STORY") return null;
    const first = items[0];
    if (!first || !first.width || !first.height) return null;
    return storyAspectNote(first.width, first.height);
  }, [items, kind]);

  const countProblem = checkItemCount(kind, items.length);
  const captionProblem = checkCaption({ kind, caption });
  const hashtags = countHashtags(caption);
  const mentions = countMentions(caption);

  const altTextProblem = useMemo(
    () => checkAltText({ kind, altText: altText.trim() }),
    [kind, altText],
  );
  const userTagsProblem = useMemo(
    () => checkUserTags({ kind, userTags }),
    [kind, userTags],
  );
  const audioNameProblem = useMemo(
    () => checkAudioName({ kind, audioName: audioName.trim() }),
    [kind, audioName],
  );
  const trialProblem = useMemo(
    () =>
      checkTrialGraduationStrategy({
        kind,
        strategy: trialEnabled ? trialGraduationStrategy : undefined,
      }),
    [kind, trialEnabled, trialGraduationStrategy],
  );

  const scheduledFor = useMemo(() => {
    if (!scheduleOn) return null;
    return belgradeToEpoch(scheduleDate, scheduleTime);
  }, [scheduleOn, scheduleDate, scheduleTime]);

  const scheduleProblem = useMemo(() => {
    if (!scheduleOn) return null;
    if (scheduledFor === null) return "Izaberi datum i vreme objave.";
    if (now === 0) return null;
    return checkScheduledFor(scheduledFor, now);
  }, [scheduleOn, scheduledFor, now]);

  const igConnection = (connections ?? []).find(
    (row) => row.provider === "meta_ig",
  );
  const connectionProblem =
    connections === undefined
      ? null
      : igConnection === undefined
        ? "Instagram još nije povezan."
        : igConnection.status === "expired"
          ? "Instagram token je istekao."
          : null;

  const busy = phase !== "idle";
  const ready =
    !busy &&
    connectionProblem === null &&
    countProblem === null &&
    captionProblem === null &&
    scheduleProblem === null &&
    altTextProblem === null &&
    userTagsProblem === null &&
    audioNameProblem === null &&
    trialProblem === null &&
    itemProblems.every((problem) => problem === null);

  // ── picking files ──────────────────────────────────────────────────────────

  /**
   * Everything here happens in the event handler, never inside a state
   * updater. An updater may be called twice for one event and must be a pure
   * function of the previous state — creating object URLs or setting a second
   * piece of state from inside one leaks memory and warns, both quietly.
   */
  const addFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      setErrorMsg(null);

      const { max } = itemRange(kind);
      const room = Math.max(0, max - items.length);
      const accepted = files.slice(0, room);

      setDropNotice(
        files.length > accepted.length
          ? `${KIND_LABELS[kind]} prima najviše ${pluralFiles(max)} — ostatak nije dodat.`
          : null,
      );
      if (accepted.length === 0) return;

      const added = accepted.map((file) => {
        const previewUrl = URL.createObjectURL(file);
        objectUrls.current.push(previewUrl);
        return {
          id: `pick-${nextId.current++}`,
          file,
          previewUrl,
          kind: pickedKindOf(file.type),
        } satisfies PickedItem;
      });

      setItems((previous) => [...previous, ...added]);

      // Measuring is asynchronous and the row is already on screen, so the
      // dimensions arrive a beat later and patch themselves in by id.
      for (const item of added) {
        const probe =
          item.kind === "image"
            ? probeImageFile(item.file)
            : probeVideoFile(item.file);
        void probe.then((result) => {
          if (result === null) return;
          setItems((current) =>
            current.map((row) =>
              row.id === item.id ? { ...row, ...result } : row,
            ),
          );
        });
      }
    },
    [items, kind],
  );

  const releaseUrl = useCallback((url: string) => {
    URL.revokeObjectURL(url);
    objectUrls.current = objectUrls.current.filter((held) => held !== url);
  }, []);

  const removeItem = useCallback(
    (id: string) => {
      const target = items.find((row) => row.id === id);
      if (target) releaseUrl(target.previewUrl);
      setItems((previous) => previous.filter((row) => row.id !== id));
      setDropNotice(null);
    },
    [items, releaseUrl],
  );

  const reorder = useCallback((from: number, to: number) => {
    setItems((previous) => {
      if (
        from < 0 ||
        to < 0 ||
        from >= previous.length ||
        to >= previous.length ||
        from === to
      ) {
        return previous;
      }
      const next = [...previous];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const handleImageClickForTag = useCallback(
    (coords: { x: number; y: number }) => {
      setPendingCoords(coords);
      setIsPlacingTag(false);
    },
    [],
  );

  const addTag = useCallback(() => {
    const clean = newTagHandle.trim().replace(/^@/, "");
    if (!clean) return;
    if (
      userTags.some(
        (t) => t.username.toLowerCase() === clean.toLowerCase(),
      )
    ) {
      return;
    }
    if (userTags.length >= USER_TAGS_MAX) return;

    const tag: UserTagInput = {
      username: clean,
      ...(kind === "IMAGE" && pendingCoords
        ? pendingCoords
        : kind === "IMAGE"
          ? { x: 0.5, y: 0.5 }
          : {}),
    };
    setUserTags((prev) => [...prev, tag]);
    setNewTagHandle("");
    setPendingCoords(null);
    setIsPlacingTag(false);
  }, [newTagHandle, userTags, kind, pendingCoords]);

  const removeTag = useCallback((index: number) => {
    setUserTags((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const extraCount = useMemo(() => {
    let count = 0;
    if (userTags.length > 0) count++;
    if (locationId.trim().length > 0) count++;
    if (kind === "IMAGE" && altText.trim().length > 0) count++;
    if (kind === "REEL" && audioName.trim().length > 0) count++;
    if (kind === "REEL" && trialEnabled) count++;
    return count;
  }, [userTags, locationId, kind, altText, audioName, trialEnabled]);

  const resetForm = useCallback(
    (sent: PickedItem[]) => {
      for (const row of sent) releaseUrl(row.previewUrl);
      setItems([]);
      setCaption("");
      setScheduleOn(false);
      setDropNotice(null);
      setUserTags([]);
      setNewTagHandle("");
      setPendingCoords(null);
      setIsPlacingTag(false);
      setLocationId("");
      setAltText("");
      setAudioName("");
      setTrialEnabled(false);
      setTrialGraduationStrategy("MANUAL");
    },
    [releaseUrl],
  );

  // ── sending ────────────────────────────────────────────────────────────────

  const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);

  const submit = async () => {
    if (sending.current) return;
    sending.current = true;

    setConfirmOpen(false);
    setErrorMsg(null);
    setSentBytes(0);
    setPhase("uploading");

    try {
      const storageIds: Id<"_storage">[] = [];
      let done = 0;
      for (const item of items) {
        const uploadUrl = await generateUploadUrl();
        const storageId = await uploadFileToStorage(
          uploadUrl,
          item.file,
          (loaded) => setSentBytes(done + loaded),
        );
        // Written down the moment it lands, because from here until `createJob`
        // nothing in the database names this file — and if the tab closes or
        // the job is refused, nothing ever would. The receipt is what lets the
        // sweep find it.
        await registerUpload({ storageId: storageId as Id<"_storage"> });
        done += item.file.size;
        setSentBytes(done);
        storageIds.push(storageId as Id<"_storage">);
      }

      setPhase("submitting");
      const jobId = await createJob({
        kind,
        ...(acceptsCaption(kind) && caption.trim().length > 0
          ? { caption: caption.trim() }
          : {}),
        ...(acceptsShareToFeed(kind) ? { shareToFeed } : {}),
        storageIds,
        ...(userTags.length > 0 ? { userTags } : {}),
        ...(locationId.trim().length > 0
          ? { locationId: locationId.trim() }
          : {}),
        ...(kind === "IMAGE" && altText.trim().length > 0
          ? { altText: altText.trim() }
          : {}),
        ...(kind === "REEL" && audioName.trim().length > 0
          ? { audioName: audioName.trim() }
          : {}),
        ...(kind === "REEL" && trialEnabled
          ? { trialGraduationStrategy }
          : {}),
        ...(scheduledFor !== null ? { scheduledFor } : {}),
      });

      setActiveJobId(jobId);
      resetForm(items);
    } catch (err) {
      setErrorMsg(convexMessage(err, "Slanje objave nije uspelo."));
    } finally {
      sending.current = false;
      setPhase("idle");
    }
  };

  const activeJob = useMemo(
    () => (jobs ?? []).find((job) => job._id === activeJobId) ?? null,
    [jobs, activeJobId],
  );

  return (
    <div className="flex flex-1 flex-col gap-8">
      <Reveal>
        <div className="flex flex-col gap-3">
          <FeedbackNote
            tone="warning"
            title={SCOPE_NOTICE_TITLE}
            action={
              <Link
                href="/settings"
                className="text-xs font-medium text-accent-400 underline-offset-4 hover:underline"
              >
                Podešavanja
              </Link>
            }
          >
            {SCOPE_NOTICE_BODY}
          </FeedbackNote>

          {connectionProblem !== null && (
            <FeedbackNote
              tone="danger"
              title={connectionProblem}
              action={
                <Link
                  href="/settings"
                  className="text-xs font-medium text-accent-400 underline-offset-4 hover:underline"
                >
                  Poveži
                </Link>
              }
            >
              Dok nalog nije povezan sa opsegom za objavljivanje, objava ne može
              da se pošalje.
            </FeedbackNote>
          )}
        </div>
      </Reveal>

      <Reveal delay={0.04}>
        <QuotaLine limit={limit} />
      </Reveal>

      <Reveal delay={0.07}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <Card className="p-5 shadow-card">
            <FormStack>
              <FormGroup
                title="Tip objave"
                description="Instagram pravi drugačiji kontejner za svaki od njih, pa se i pravila razlikuju."
              >
                <ToggleGroup
                  value={[kind]}
                  onValueChange={(value) => {
                    const next = value[0] as PublishKind | undefined;
                    if (next) setKind(next);
                  }}
                  spacing={0}
                  aria-label="Tip objave"
                  className="w-fit rounded-lg border border-line bg-card p-0.5"
                >
                  {PUBLISH_KINDS.map((option) => (
                    <ToggleGroupItem
                      key={option}
                      value={option}
                      size="sm"
                      disabled={busy}
                      className="rounded-md! px-3 text-text-secondary aria-pressed:text-accent-400 data-pressed:text-accent-400"
                    >
                      {KIND_LABELS[option]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </FormGroup>

              <FormGroup
                title="Fajl"
                description={
                  kind === "CAROUSEL"
                    ? "Redosled na listi je redosled u carousel-u — prevuci ili koristi strelice."
                    : undefined
                }
              >
                <PublishDropzone
                  kind={kind}
                  items={items}
                  problems={itemProblems}
                  disabled={busy}
                  onAdd={addFiles}
                  onRemove={removeItem}
                  onReorder={reorder}
                />

                {countProblem !== null && items.length > 0 && (
                  <p className="text-xs text-danger">{countProblem}</p>
                )}
                {dropNotice !== null && (
                  <p className="text-xs text-warning">{dropNotice}</p>
                )}
                {storyNote !== null && (
                  <p className="text-xs text-text-muted">{storyNote}</p>
                )}
              </FormGroup>

              {acceptsCaption(kind) && (
                <FormGroup title="Opis">
                  <Field
                    label="Tekst uz objavu"
                    error={captionProblem}
                    action={
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "font-mono text-micro tabular-nums",
                            mentions > MENTION_MAX
                              ? "text-danger"
                              : mentions >= MENTION_MAX - 3
                                ? "text-warning"
                                : "text-text-muted",
                          )}
                        >
                          {mentions}/{MENTION_MAX} @
                        </span>
                        <span
                          className={cn(
                            "font-mono text-micro tabular-nums",
                            hashtags > HASHTAG_MAX
                              ? "text-danger"
                              : hashtags >= HASHTAG_MAX - 5
                                ? "text-warning"
                                : "text-text-muted",
                          )}
                        >
                          {hashtags}/{HASHTAG_MAX} #
                        </span>
                        <CharCount value={caption.length} max={CAPTION_MAX} />
                      </span>
                    }
                  >
                    {(props) => (
                      <Textarea
                        {...props}
                        rows={6}
                        value={caption}
                        disabled={busy}
                        onChange={(event) => setCaption(event.target.value)}
                        placeholder="Šta ide uz objavu…"
                        className="min-h-32"
                      />
                    )}
                  </Field>
                </FormGroup>
              )}

              {acceptsShareToFeed(kind) && (
                <FormGroup
                  title="Feed"
                  control={
                    <Toggle
                      variant="outline"
                      size="sm"
                      pressed={shareToFeed}
                      disabled={busy}
                      onPressedChange={setShareToFeed}
                      className="text-text-muted aria-pressed:text-accent-400"
                    >
                      {shareToFeed ? "Ide i u feed" : "Samo Reels"}
                    </Toggle>
                  }
                >
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Reel se u svakom slučaju pojavljuje u Reels tabu. Ovo
                    odlučuje samo da li stoji i na profilnom feed-u.
                  </p>
                </FormGroup>
              )}

              <FormGroup title="Kada">
                <ToggleGroup
                  value={[scheduleOn ? "later" : "now"]}
                  onValueChange={(value) => {
                    const next = value[0];
                    if (!next) return;
                    const later = next === "later";
                    setScheduleOn(later);
                    if (later && scheduleDate === "") {
                      const start = belgradeInputsFor(Date.now() + 60 * 60_000);
                      setScheduleDate(start.date);
                      setScheduleTime(start.time);
                    }
                  }}
                  spacing={0}
                  aria-label="Vreme objave"
                  className="w-fit rounded-lg border border-line bg-card p-0.5"
                >
                  <ToggleGroupItem
                    value="now"
                    size="sm"
                    disabled={busy}
                    className="rounded-md! px-3 text-text-secondary aria-pressed:text-accent-400 data-pressed:text-accent-400"
                  >
                    <Zap data-icon="inline-start" />
                    Objavi odmah
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="later"
                    size="sm"
                    disabled={busy}
                    className="rounded-md! px-3 text-text-secondary aria-pressed:text-accent-400 data-pressed:text-accent-400"
                  >
                    <CalendarClock data-icon="inline-start" />
                    Zakaži za
                  </ToggleGroupItem>
                </ToggleGroup>

                {scheduleOn && (
                  <div className="space-y-2">
                    <div className="grid max-w-sm grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <Label
                          htmlFor="ig-schedule-date"
                          className="text-xs text-text-muted"
                        >
                          Datum
                        </Label>
                        <Input
                          id="ig-schedule-date"
                          type="date"
                          value={scheduleDate}
                          disabled={busy}
                          onChange={(event) =>
                            setScheduleDate(event.target.value)
                          }
                          className="font-mono text-xs tabular-nums"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label
                          htmlFor="ig-schedule-time"
                          className="text-xs text-text-muted"
                        >
                          Vreme
                        </Label>
                        <Input
                          id="ig-schedule-time"
                          type="time"
                          value={scheduleTime}
                          disabled={busy}
                          onChange={(event) =>
                            setScheduleTime(event.target.value)
                          }
                          className="font-mono text-xs tabular-nums"
                        />
                      </div>
                    </div>

                    {scheduleProblem !== null ? (
                      <p className="text-xs text-danger">{scheduleProblem}</p>
                    ) : (
                      scheduledFor !== null && (
                        <p className="text-xs text-text-muted">
                          Odlazi{" "}
                          <span className="font-mono tabular-nums text-foreground">
                            {formatBelgrade(scheduledFor)}
                          </span>{" "}
                          {SCHEDULE_TIME_ZONE_LABEL}.
                        </p>
                      )
                    )}
                  </div>
                )}
              </FormGroup>

              {/* Sklopivi odeljak „Dodatno“ (G7) */}
              <div className="rounded-xl border border-line-soft bg-surface/30 p-4 transition-colors">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      Dodatno
                    </span>
                    {extraCount > 0 && (
                      <span className="rounded-full bg-accent-400/10 px-2 py-0.5 font-mono text-micro text-accent-400">
                        {extraCount}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-text-muted">
                    <span>{advancedOpen ? "Sakrij" : "Prikaži"}</span>
                    <ChevronDown
                      className={cn(
                        "size-4 transition-transform duration-200",
                        advancedOpen && "rotate-180",
                      )}
                    />
                  </div>
                </button>

                {advancedOpen && (
                  <div className="mt-4 space-y-5 border-t border-line-soft pt-4">
                    {/* 1. Označavanje naloga */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-foreground">
                        Označavanje naloga (@user_tags)
                      </Label>
                      <p className="text-xs text-text-muted">
                        {kind === "IMAGE"
                          ? "Označi javne naloge na slici. Klikni na sliku u pregledu za tačnu poziciju ili dodaj nalog na centar."
                          : kind === "REEL"
                            ? "Označi javne naloge na Reel-u. Instagram za video i Reels ne podržava koordinate, već samo korisničko ime."
                            : "Označi javne naloge na objavi."}
                      </p>

                      <div className="flex flex-wrap items-center gap-2">
                        <div className="relative min-w-[200px] flex-1">
                          <Input
                            type="text"
                            placeholder="Korisničko ime (npr. @profil)"
                            value={newTagHandle}
                            disabled={busy}
                            onChange={(e) => setNewTagHandle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addTag();
                              }
                            }}
                            className="text-xs"
                          />
                        </div>

                        {kind === "IMAGE" &&
                          items.length > 0 &&
                          items[0]?.kind === "image" && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => setIsPlacingTag((prev) => !prev)}
                              className={cn(
                                "text-xs",
                                (isPlacingTag || pendingCoords) &&
                                  "border-accent-400 text-accent-400",
                              )}
                            >
                              <Crosshair className="size-3.5" />
                              {pendingCoords
                                ? `Pozicija (${Math.round(pendingCoords.x * 100)}%, ${Math.round(pendingCoords.y * 100)}%)`
                                : isPlacingTag
                                  ? "Klikni na pregled…"
                                  : "Izaberi poziciju"}
                            </Button>
                          )}

                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={busy || !newTagHandle.trim()}
                          onClick={addTag}
                          className="text-xs"
                        >
                          <Plus className="size-3.5" />
                          Dodaj oznaku
                        </Button>
                      </div>

                      {userTagsProblem && (
                        <p className="text-xs text-danger">{userTagsProblem}</p>
                      )}

                      {userTags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {userTags.map((tag, idx) => (
                            <span
                              key={`${tag.username}-${idx}`}
                              className="inline-flex items-center gap-1 rounded-md border border-line-soft bg-surface-raised px-2 py-1 text-xs text-foreground"
                            >
                              <span>@{tag.username}</span>
                              {typeof tag.x === "number" &&
                                typeof tag.y === "number" && (
                                  <span className="font-mono text-micro text-text-muted">
                                    ({Math.round(tag.x * 100)}%,{" "}
                                    {Math.round(tag.y * 100)}%)
                                  </span>
                                )}
                              <button
                                type="button"
                                onClick={() => removeTag(idx)}
                                className="text-text-muted hover:text-danger"
                                aria-label={`Ukloni oznaku @${tag.username}`}
                              >
                                <X className="size-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 2. Lokacija */}
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="ig-location-id"
                        className="text-xs font-medium text-foreground"
                      >
                        Lokacija (Facebook Page ID)
                      </Label>
                      <Input
                        id="ig-location-id"
                        type="text"
                        placeholder="npr. 104523948572134"
                        value={locationId}
                        disabled={busy}
                        onChange={(e) => setLocationId(e.target.value)}
                        className="font-mono text-xs"
                      />
                      <p className="text-xs leading-relaxed text-text-muted">
                        Instagram traži <strong>ID Facebook stranice</strong>{" "}
                        fizičke lokacije (mesta, lokala ili biznisa), a ne
                        slobodan tekst. ID možete pronaći u URL adresi stranice ili
                        u odeljku „O stranici“ (Page ID).
                      </p>
                    </div>

                    {/* 3. Alt tekst — SAMO ZA SLIKE */}
                    {kind === "IMAGE" && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label
                            htmlFor="ig-alt-text"
                            className="text-xs font-medium text-foreground"
                          >
                            Alt tekst (za pristupačnost)
                          </Label>
                          <CharCount
                            value={altText.length}
                            max={ALT_TEXT_MAX}
                          />
                        </div>
                        <Textarea
                          id="ig-alt-text"
                          rows={2}
                          placeholder="Opis slike za osobe sa oštećenjem vida i pretraživače…"
                          value={altText}
                          disabled={busy}
                          onChange={(e) => setAltText(e.target.value)}
                          className="min-h-16 text-xs"
                        />
                        {altTextProblem && (
                          <p className="text-xs text-danger">
                            {altTextProblem}
                          </p>
                        )}
                        <p className="text-xs text-text-muted">
                          Alt tekst se dodaje samo na slike. Pomaže
                          pristupačnosti i rangiranju sadržaja (do 1000 znakova).
                        </p>
                      </div>
                    )}

                    {/* 4. Ime audio numere — SAMO ZA REELS */}
                    {kind === "REEL" && (
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="ig-audio-name"
                          className="text-xs font-medium text-foreground"
                        >
                          Ime audio numere
                        </Label>
                        <Input
                          id="ig-audio-name"
                          type="text"
                          placeholder="npr. Originalni zvuk — Naziv brenda"
                          value={audioName}
                          disabled={busy}
                          onChange={(e) => setAudioName(e.target.value)}
                          className="text-xs"
                        />
                        <p className="text-xs text-text-muted">
                          Imenuje audio zapis vašeg Reel-a u Instagram audio
                          biblioteci.
                        </p>
                      </div>
                    )}

                    {/* 5. Probni Reels — SAMO ZA REELS */}
                    {kind === "REEL" && (
                      <div className="space-y-3 rounded-lg border border-line-soft bg-surface-raised/40 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold text-foreground">
                              Probni Reel (Trial Reel)
                            </p>
                            <p className="text-xs leading-relaxed text-text-muted">
                              Probni Reel se prvo prikazuje samo publici koja vas
                              ne prati kako bi se testirao algoritam pre
                              objavljivanja vašim pratiocima.
                            </p>
                          </div>
                          <Switch
                            checked={trialEnabled}
                            onCheckedChange={setTrialEnabled}
                            disabled={busy}
                          />
                        </div>

                        {trialEnabled && (
                          <div className="space-y-1.5 border-t border-line-soft pt-2">
                            <Label className="text-xs text-text-muted">
                              Strategija diplomiranja (Graduation Strategy)
                            </Label>
                            <ToggleGroup
                              value={[trialGraduationStrategy]}
                              onValueChange={(val) => {
                                const next = val[0] as
                                  | "MANUAL"
                                  | "SS_PERFORMANCE"
                                  | undefined;
                                if (next) setTrialGraduationStrategy(next);
                              }}
                              spacing={0}
                              aria-label="Strategija probnog Reel-a"
                              className="w-full justify-start rounded-lg border border-line bg-card p-0.5"
                            >
                              <ToggleGroupItem
                                value="MANUAL"
                                size="sm"
                                disabled={busy}
                                className="flex-1 rounded-md! px-3 text-xs text-text-secondary aria-pressed:text-accent-400 data-pressed:text-accent-400"
                              >
                                Ručno (MANUAL)
                              </ToggleGroupItem>
                              <ToggleGroupItem
                                value="SS_PERFORMANCE"
                                size="sm"
                                disabled={busy}
                                className="flex-1 rounded-md! px-3 text-xs text-text-secondary aria-pressed:text-accent-400 data-pressed:text-accent-400"
                              >
                                Po uspehu (SS_PERFORMANCE)
                              </ToggleGroupItem>
                            </ToggleGroup>
                            <p className="text-micro text-text-muted">
                              {trialGraduationStrategy === "MANUAL"
                                ? "Reel ostaje u probnom režimu dok ga ručno ne podelite sa pratiocima."
                                : "Instagram će automatski objaviti Reel svim pratiocima ako postigne dobar angažman među nepraćenom publikom."}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {busy && (
                <UploadProgress
                  phase={phase}
                  sentBytes={sentBytes}
                  totalBytes={totalBytes}
                />
              )}

              {errorMsg !== null && (
                <FeedbackNote tone="danger" title={errorMsg}>
                  Fajlovi su i dalje kod nas — ispravi šta treba i pošalji
                  ponovo.
                </FeedbackNote>
              )}

              {activeJob !== null && !busy && (
                <ActiveJobNote
                  status={activeJob.status}
                  scheduledFor={activeJob.scheduledFor ?? null}
                  error={activeJob.error ?? null}
                  mediaIdUnconfirmed={activeJob.mediaIdUnconfirmed === true}
                  now={now}
                />
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4">
                <p className="text-xs text-text-muted">
                  {IRREVERSIBLE_NOTICE}
                </p>
                <Button
                  type="button"
                  size="lg"
                  disabled={!ready}
                  onClick={() => setConfirmOpen(true)}
                  className="font-semibold"
                >
                  <Send data-icon="inline-start" />
                  {scheduleOn ? "Zakaži objavu" : "Objavi sada"}
                </Button>
              </div>
            </FormStack>
          </Card>

          <div className="xl:sticky xl:top-[calc(var(--chrome-height)+1.5rem)] xl:self-start">
            <p className="heading-caps mb-2 text-micro font-medium text-text-muted">
              Pregled
            </p>
            <PublishPreview
              kind={kind}
              items={items}
              caption={caption}
              scheduledFor={scheduledFor}
              userTags={userTags}
              locationId={locationId.trim() || undefined}
              audioName={
                kind === "REEL" ? audioName.trim() || undefined : undefined
              }
              isPlacingTag={isPlacingTag}
              onImageClick={handleImageClickForTag}
            />
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.09}>
        <PublishJobsPanel />
      </Reveal>

      <Reveal delay={0.1}>
        <Card className="flex flex-col gap-3 p-5 shadow-card">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-surface-raised text-text-muted">
              <Info className="size-4" aria-hidden />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              Šta panel ne radi i zašto
            </h2>
          </div>
          <ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">
            <li className="flex gap-2">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-text-muted" />
              <span>{NO_LIKE_NOTICE}</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-text-muted" />
              <span>{NO_DELETE_NOTICE}</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-text-muted" />
              <span>
                Označavanje proizvoda, saradnici na objavi (collaborators) i
                plaćena partnerstva nisu podržani preko Instagram Login-a
                (zahtevaju Facebook Login).
              </span>
            </li>
          </ul>
        </Card>
      </Reveal>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={scheduleOn ? "Zakazati ovu objavu?" : "Objaviti sada?"}
        description={
          <PublishSummary
            kind={kind}
            items={items}
            caption={caption}
            hashtags={hashtags}
            shareToFeed={shareToFeed}
            scheduledFor={scheduledFor}
            userTags={userTags}
            locationId={locationId.trim() || undefined}
            altText={
              kind === "IMAGE" ? altText.trim() || undefined : undefined
            }
            audioName={
              kind === "REEL" ? audioName.trim() || undefined : undefined
            }
            trialEnabled={kind === "REEL" && trialEnabled}
            trialGraduationStrategy={trialGraduationStrategy}
          />
        }
        confirmLabel={scheduleOn ? "Zakaži" : "Objavi"}
        busyLabel="Šaljem…"
        busy={busy}
        onConfirm={submit}
        tone="accent"
      />
    </div>
  );
}

/** What exactly is about to leave — read before, not discovered after. */
function PublishSummary({
  kind,
  items,
  caption,
  hashtags,
  shareToFeed,
  scheduledFor,
  userTags,
  locationId,
  altText,
  audioName,
  trialEnabled,
  trialGraduationStrategy,
}: {
  kind: PublishKind;
  items: PickedItem[];
  caption: string;
  hashtags: number;
  shareToFeed: boolean;
  scheduledFor: number | null;
  userTags?: UserTagInput[];
  locationId?: string;
  altText?: string;
  audioName?: string;
  trialEnabled?: boolean;
  trialGraduationStrategy?: "MANUAL" | "SS_PERFORMANCE";
}) {
  const trimmed = caption.trim();
  const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);

  return (
    <span className="block space-y-2">
      <span className="block">
        <strong className="text-foreground">{KIND_LABELS[kind]}</strong> ·{" "}
        {pluralFiles(items.length)} ·{" "}
        <span className="font-mono tabular-nums">
          {formatBytes(totalBytes)}
        </span>
      </span>

      <span className="block font-mono text-micro tabular-nums text-text-muted">
        {items.map((item) => item.file.name).join(" · ")}
      </span>

      {acceptsCaption(kind) && (
        <span className="block rounded-md border border-line-soft bg-surface/60 px-2.5 py-1.5 text-xs leading-relaxed text-foreground/90">
          {trimmed.length > 0 ? (
            <>
              {trimmed.length > 220 ? `${trimmed.slice(0, 220)}…` : trimmed}
              <span className="mt-1 block font-mono text-micro text-text-muted">
                {trimmed.length} znakova · {hashtags} hashtagova
              </span>
            </>
          ) : (
            <span className="italic text-text-muted">Bez opisa</span>
          )}
        </span>
      )}

      {acceptsShareToFeed(kind) && (
        <span className="block">
          {shareToFeed
            ? "Pojavljuje se i na profilnom feed-u."
            : "Ostaje samo u Reels tabu."}
        </span>
      )}

      {userTags && userTags.length > 0 && (
        <span className="block text-xs text-text-muted">
          Označeni nalozi:{" "}
          <span className="font-medium text-foreground">
            {userTags.map((t) => `@${t.username}`).join(", ")}
          </span>
        </span>
      )}

      {locationId && (
        <span className="block font-mono text-xs text-text-muted">
          📍 ID lokacije: {locationId}
        </span>
      )}

      {altText && (
        <span className="block text-xs text-text-muted">
          Alt tekst:{" "}
          <span className="italic text-foreground/90">
            {altText.length > 80 ? `${altText.slice(0, 80)}…` : altText}
          </span>
        </span>
      )}

      {audioName && (
        <span className="block text-xs text-text-muted">
          Zvuk: <span className="text-foreground">{audioName}</span>
        </span>
      )}

      {trialEnabled && (
        <span className="block text-xs text-accent-400">
          Probni Reel (
          {trialGraduationStrategy === "MANUAL"
            ? "ručno diplomiranje"
            : "automatski po uspehu"}
          )
        </span>
      )}

      <span className="block">
        {scheduledFor === null ? (
          "Odlazi odmah po potvrdi."
        ) : (
          <>
            Odlazi{" "}
            <span className="font-mono tabular-nums text-foreground">
              {formatBelgrade(scheduledFor)}
            </span>{" "}
            {SCHEDULE_TIME_ZONE_LABEL}. Do tada se može otkazati.
          </>
        )}
      </span>
    </span>
  );
}

/**
 * The 24-hour allowance, as a sentence.
 *
 * The number comes from Meta, not from our own rows: posts made from a phone
 * count against the same hundred and we never see those. When Meta will not
 * answer — most likely because the token predates the publishing scope — the
 * line says so instead of showing a confident zero.
 */
function QuotaLine({ limit }: { limit: PublishingLimit | null }) {
  if (limit === null || !limit.connected) {
    return (
      <div className="rounded-xl border border-line-soft bg-card px-4 py-3">
        <p className="flex items-center gap-2 text-sm text-text-muted">
          <Gauge className="size-4 shrink-0" aria-hidden />
          {limit === null
            ? "Preostala kvota se učitava…"
            : "Kvota je poznata tek kada je Instagram povezan."}
        </p>
      </div>
    );
  }

  if (limit.error !== undefined) {
    return (
      <FeedbackNote tone="warning" title="Kvota se trenutno ne može pročitati">
        {limit.error}
      </FeedbackNote>
    );
  }

  const ratio = limit.total > 0 ? Math.min(1, limit.used / limit.total) : 0;
  const tone = ratio >= 0.9 ? "danger" : ratio >= 0.7 ? "warning" : "normal";
  const left = Math.max(0, limit.total - limit.used);

  return (
    <div
      role="status"
      className={cn(
        "rounded-xl border px-4 py-3",
        tone === "danger"
          ? "border-danger/30 bg-danger/5"
          : tone === "warning"
            ? "border-warning/30 bg-warning/5"
            : "border-line-soft bg-card",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="flex items-center gap-2 text-sm text-foreground">
          <Gauge
            className={cn(
              "size-4 shrink-0",
              tone === "danger"
                ? "text-danger"
                : tone === "warning"
                  ? "text-warning"
                  : "text-accent-400",
            )}
            aria-hidden
          />
          <span>
            Iskorišćeno{" "}
            <CountUp
              value={limit.used}
              format={formatNumber}
              className="font-mono font-medium text-foreground"
            />{" "}
            od{" "}
            <span className="font-mono tabular-nums">
              {formatNumber(limit.total)}
            </span>{" "}
            objava u poslednja 24 h
          </span>
        </p>
        <p className="text-xs text-text-muted">
          ostalo je još{" "}
          <span className="font-mono tabular-nums text-foreground">
            {formatNumber(left)}
          </span>
        </p>
      </div>

      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
        <div
          style={{
            width: `${(ratio * 100).toFixed(1)}%`,
            transitionDuration: "var(--duration-base)",
            transitionTimingFunction: "var(--ease-ui)",
          }}
          className={cn(
            "h-full rounded-full transition-[width]",
            tone === "danger"
              ? "bg-danger"
              : tone === "warning"
                ? "bg-warning"
                : "bg-accent-400",
          )}
        />
      </div>
    </div>
  );
}

/** The bar while bytes are moving, then the wait while Convex takes over. */
function UploadProgress({
  phase,
  sentBytes,
  totalBytes,
}: {
  phase: Phase;
  sentBytes: number;
  totalBytes: number;
}) {
  const ratio =
    phase === "submitting"
      ? 1
      : totalBytes > 0
        ? Math.min(1, sentBytes / totalBytes)
        : 0;

  return (
    <div className="rounded-xl border border-accent-400/30 bg-accent-400/5 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium text-accent-400">
          {phase === "submitting"
            ? "Predajem objavu Instagramu…"
            : "Fajlovi se šalju…"}
        </p>
        <p className="font-mono text-micro tabular-nums text-text-muted">
          {formatBytes(sentBytes)} / {formatBytes(totalBytes)}
        </p>
      </div>
      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
        <div
          style={{
            width: `${(ratio * 100).toFixed(1)}%`,
            transitionDuration: "var(--duration-base)",
            transitionTimingFunction: "var(--ease-ui)",
          }}
          className="h-full rounded-full bg-accent-400 transition-[width]"
        />
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Ne zatvaraj ovu stranicu dok traka ne dođe do kraja — posle toga posao
        nastavlja server i stranica više nije potrebna.
      </p>
    </div>
  );
}

/**
 * Where the post that was just sent currently stands.
 *
 * Reads off the job row rather than off local state on purpose: the row is what
 * the server is actually working from, and it keeps telling the truth after a
 * reload, on another tab, and while the operator is looking at something else.
 */
function ActiveJobNote({
  status,
  scheduledFor,
  error,
  mediaIdUnconfirmed,
  now,
}: {
  status: string;
  scheduledFor: number | null;
  error: string | null;
  mediaIdUnconfirmed: boolean;
  now: number;
}) {
  if (status === "published") {
    // The post is out either way; the difference is whether this row will ever
    // be able to point at it. Saying it here beats a card that quietly never
    // grows a link.
    return mediaIdUnconfirmed ? (
      <FeedbackNote tone="warning" title={PUBLISHED_UNCONFIRMED_LABEL}>
        Objava je otišla na profil, ali Instagram nije potvrdio koja je — ovaj
        red zato ostaje bez linka i brojeva. Proveri profil.
      </FeedbackNote>
    ) : (
      <FeedbackNote tone="success" title="Objava je na profilu">
        Pojaviće se na Instagram ekranu čim se povuku prvi podaci o njoj.
      </FeedbackNote>
    );
  }

  if (status === "failed") {
    return (
      <FeedbackNote tone="danger" title="Objava nije uspela">
        {error ?? "Instagram je odbio objavu."} Pokušaj ponovo iz liste ispod.
      </FeedbackNote>
    );
  }

  if (status === "canceled") {
    return <FeedbackNote tone="warning" title="Objava je otkazana" />;
  }

  if (status === "queued") {
    return (
      <FeedbackNote
        tone="progress"
        title={
          scheduledFor !== null && scheduledFor > now
            ? `Zakazano za ${formatBelgrade(scheduledFor)}`
            : "Objava je u redu za slanje"
        }
      >
        Može se otkazati iz liste ispod dok ne krene.
      </FeedbackNote>
    );
  }

  if (status === "processing") {
    return (
      <FeedbackNote tone="progress" title="Instagram obrađuje fajl…">
        Za video to traje od nekoliko sekundi do nekoliko minuta. Stranica ne
        mora da ostane otvorena.
      </FeedbackNote>
    );
  }

  if (status === "publishing") {
    return (
      <FeedbackNote tone="progress" title="Objava je predata Instagramu…">
        Čeka se potvrda. Ako odgovor izostane, panel sam proverava kontejner —
        objava se ne šalje po drugi put.
      </FeedbackNote>
    );
  }

  return (
    <FeedbackNote tone="progress" title="Šaljem na Instagram…">
      Stranica ne mora da ostane otvorena.
    </FeedbackNote>
  );
}
