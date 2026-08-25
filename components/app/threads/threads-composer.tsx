"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  FileImage,
  FileVideo,
  Gauge,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  Loader2,
  Lock,
  Plus,
  Radio,
  Send,
  Trash2,
  Type,
  Upload,
  Video,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  ALT_TEXT_MAX_CHARS,
  CAROUSEL_MAX_ITEMS,
  CAROUSEL_MIN_ITEMS,
  IMAGE_MAX_BYTES,
  MEDIA_TYPE_LABELS,
  POLL_OPTION_MAX_CHARS,
  TEXT_MAX_BYTES,
  TOPIC_TAG_MAX_CHARS,
  VIDEO_MAX_BYTES,
  checkAltText,
  checkAutoPublishText,
  checkFile,
  checkItemCount,
  checkLinkAttachment,
  checkPollAttachment,
  checkScheduledFor,
  checkSpoilerMedia,
  checkText,
  checkTopicTag,
  utf8ByteLength,
  type ThreadsPublishMediaType,
} from "@/convex/lib/threadsPublish";
import {
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
import { Field, FormGroup, FormStack } from "@/components/app/form-kit";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type PickedFile = {
  file: File;
  previewUrl: string;
  kind: "image" | "video";
};

type ReplyControl =
  | "everyone"
  | "accounts_you_follow"
  | "mentioned_only"
  | "parent_post_author_only"
  | "followers_only";

export function ThreadsComposer({ onJobCreated }: { onJobCreated?: () => void }) {
  const getPublishingLimit = useAction(api.threadsPublish.publishingLimit);
  const generateUploadUrl = useMutation(api.threadsPublishStore.generateUploadUrl);
  const registerUpload = useMutation(api.threadsPublishStore.registerUpload);
  const createJob = useMutation(api.threadsPublishStore.createJob);

  // Stanje kvote
  const [quota, setQuota] = useState<{
    connected: boolean;
    used?: number;
    total?: number;
    error?: string;
  } | null>(null);
  const [loadingQuota, setLoadingQuota] = useState(true);

  const fetchQuota = useCallback(async () => {
    setLoadingQuota(true);
    try {
      const res = await getPublishingLimit({});
      setQuota(res);
    } catch {
      setQuota(null);
    } finally {
      setLoadingQuota(false);
    }
  }, [getPublishingLimit]);

  useEffect(() => {
    fetchQuota();
  }, [fetchQuota]);

  // Forma
  const [mediaType, setMediaType] = useState<ThreadsPublishMediaType>("TEXT");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [replyControl, setReplyControl] = useState<ReplyControl>("everyone");
  const [topicTag, setTopicTag] = useState("");
  const [quotePostId, setQuotePostId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [geoCodes, setGeoCodes] = useState("");
  const [isGhostPost, setIsGhostPost] = useState(false);
  const [enableReplyApprovals, setEnableReplyApprovals] = useState(false);
  const [crossreshareToIg, setCrossreshareToIg] = useState(false);
  const [crossreshareDarkMode, setCrossreshareDarkMode] = useState(false);

  // Polja samo za TEXT
  const [linkAttachment, setLinkAttachment] = useState("");
  const [hasPoll, setHasPoll] = useState(false);
  const [pollA, setPollA] = useState("");
  const [pollB, setPollB] = useState("");
  const [pollC, setPollC] = useState("");
  const [pollD, setPollD] = useState("");
  const [autoPublishText, setAutoPublishText] = useState(false);

  // Polja samo za medije (IMAGE, VIDEO, CAROUSEL)
  const [altText, setAltText] = useState("");
  const [isSpoilerMedia, setIsSpoilerMedia] = useState(false);

  // Zakazivanje
  const [isScheduled, setIsScheduled] = useState(false);
  const defaultBelgrade = useMemo(
    () => belgradeInputsFor(Date.now() + 60 * 60 * 1000),
    [],
  );
  const [scheduledDate, setScheduledDate] = useState(defaultBelgrade.date);
  const [scheduledTime, setScheduledTime] = useState(defaultBelgrade.time);

  // Status slanja
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Brojač UTF-8 bajtova za tekst (§4.2)
  const textBytes = useMemo(() => utf8ByteLength(text.trim()), [text]);
  const textBytesLeft = TEXT_MAX_BYTES - textBytes;
  const isTextOverLimit = textBytesLeft < 0;

  // Promena tipa objave čisti irelevantne fajlove
  const handleMediaTypeChange = (type: ThreadsPublishMediaType) => {
    setMediaType(type);
    if (type === "TEXT") {
      setFiles([]);
      setAltText("");
      setIsSpoilerMedia(false);
    } else {
      setLinkAttachment("");
      setHasPoll(false);
      setAutoPublishText(false);
      if (type === "IMAGE" || type === "VIDEO") {
        if (files.length > 1) {
          setFiles(files.slice(0, 1));
        }
      }
    }
  };

  // Dodavanje fajlova
  const handleFilesChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files;
    if (!chosen || chosen.length === 0) return;

    setErrorMsg(null);
    const newFiles: PickedFile[] = [];

    for (let i = 0; i < chosen.length; i++) {
      const f = chosen[i];
      const mime = f.type.toLowerCase();
      const isImg = mime.startsWith("image/");
      const isVid = mime.startsWith("video/");

      if (!isImg && !isVid) {
        setErrorMsg(`Format "${f.name}" nije podržan. Dozvoljeni su JPEG/PNG za slike i MP4/MOV za video.`);
        continue;
      }

      // Klijentska provera veličine i tipa (§4.3)
      const err = checkFile({
        mediaType,
        size: f.size,
        type: f.type,
      });

      if (err) {
        setErrorMsg(err);
        continue;
      }

      newFiles.push({
        file: f,
        previewUrl: URL.createObjectURL(f),
        kind: isVid ? "video" : "image",
      });
    }

    if (mediaType === "IMAGE" || mediaType === "VIDEO") {
      if (newFiles.length > 0) {
        setFiles([newFiles[0]]);
      }
    } else if (mediaType === "CAROUSEL") {
      const combined = [...files, ...newFiles].slice(0, CAROUSEL_MAX_ITEMS);
      setFiles(combined);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const item = prev[index];
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((_, idx) => idx !== index);
    });
  };

  // Validacija forme pre slanja
  const validationError = useMemo((): string | null => {
    // 1. Provera teksta
    const textErr = checkText({ mediaType, text });
    if (textErr) return textErr;

    // Za tekstualnu objavu tekst ili anketa su obavezni
    if (mediaType === "TEXT" && text.trim().length === 0 && !hasPoll) {
      return "Tekstualna objava mora imati unet tekst ili anketu.";
    }

    // 2. Provera fajlova
    const countErr = checkItemCount(mediaType, files.length);
    if (countErr) return countErr;

    // 3. Provera specifičnih polja
    const altErr = checkAltText({ mediaType, altText });
    if (altErr) return altErr;

    const topicErr = checkTopicTag(topicTag);
    if (topicErr) return topicErr;

    if (hasPoll && mediaType === "TEXT") {
      const pollErr = checkPollAttachment({
        mediaType,
        pollAttachment: {
          option_a: pollA,
          option_b: pollB,
          ...(pollC.trim() ? { option_c: pollC } : {}),
          ...(pollD.trim() ? { option_d: pollD } : {}),
        },
      });
      if (pollErr) return pollErr;
    }

    const linkErr = checkLinkAttachment({ mediaType, linkAttachment });
    if (linkErr) return linkErr;

    const autoPubErr = checkAutoPublishText({ mediaType, autoPublishText });
    if (autoPubErr) return autoPubErr;

    const spoilerErr = checkSpoilerMedia({ mediaType, isSpoilerMedia });
    if (spoilerErr) return spoilerErr;

    if (isScheduled) {
      const epoch = belgradeToEpoch(scheduledDate, scheduledTime);
      if (epoch === null) return "Neispravan format zakazanog datuma ili vremena.";
      const schedErr = checkScheduledFor(epoch, Date.now());
      if (schedErr) return schedErr;
    }

    return null;
  }, [
    mediaType,
    text,
    files,
    altText,
    topicTag,
    hasPoll,
    pollA,
    pollB,
    pollC,
    pollD,
    linkAttachment,
    autoPublishText,
    isSpoilerMedia,
    isScheduled,
    scheduledDate,
    scheduledTime,
  ]);

  // Izvršenje slanja (upload fajlova + kreiranje posla)
  const submitJob = async () => {
    setBusy(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const uploadedStorageIds: Id<"_storage">[] = [];

      // Upload fajlova u Convex storage ako ih ima
      for (let i = 0; i < files.length; i++) {
        const item = files[i];
        setProgressMsg(
          files.length > 1
            ? `Slanje fajla ${i + 1} od ${files.length}...`
            : "Slanje fajla na server...",
        );

        const uploadUrl = await generateUploadUrl();
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": item.file.type },
          body: item.file,
        });

        if (!response.ok) {
          throw new Error(`Upload fajla "${item.file.name}" nije uspeo.`);
        }

        const { storageId } = (await response.json()) as {
          storageId: Id<"_storage">;
        };
        await registerUpload({ storageId });
        uploadedStorageIds.push(storageId);
      }

      setProgressMsg("Upisivanje posla za objavljivanje...");

      const scheduledForEpoch = isScheduled
        ? (belgradeToEpoch(scheduledDate, scheduledTime) ?? undefined)
        : undefined;

      const countriesList = geoCodes
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter((c) => c.length === 2);

      await createJob({
        mediaType,
        text: text.trim() ? text.trim() : undefined,
        storageIds: uploadedStorageIds.length > 0 ? uploadedStorageIds : undefined,
        scheduledFor: scheduledForEpoch,
        replyControl,
        allowlistedCountryCodes:
          countriesList.length > 0 ? countriesList : undefined,
        // Alt tekst je vezan za MEDIJ (§4.2). Polje je u formi sakriveno kad je
        // tip TEXT, ali stanje preživi promenu tipa — pa bi korisnik koji je
        // upisao alt tekst uz sliku pa se predomislio na tekst dobio odbijenicu
        // za polje koje više ne vidi. Odbaciti ga ovde je jedino ponašanje koje
        // se poklapa sa onim što je na ekranu.
        altText:
          mediaType !== "TEXT" && altText.trim() ? altText.trim() : undefined,
        linkAttachment:
          mediaType === "TEXT" && linkAttachment.trim()
            ? linkAttachment.trim()
            : undefined,
        quotePostId: quotePostId.trim() ? quotePostId.trim() : undefined,
        topicTag: topicTag.trim() ? topicTag.trim() : undefined,
        isSpoilerMedia: mediaType !== "TEXT" ? isSpoilerMedia : undefined,
        isGhostPost: isGhostPost || undefined,
        enableReplyApprovals: enableReplyApprovals || undefined,
        crossreshareToIg: crossreshareToIg || undefined,
        crossreshareToIgDarkMode:
          crossreshareToIg ? crossreshareDarkMode || undefined : undefined,
        locationId: locationId.trim() ? locationId.trim() : undefined,
        autoPublishText:
          mediaType === "TEXT" && autoPublishText ? true : undefined,
        pollAttachment:
          hasPoll && mediaType === "TEXT" && pollA && pollB
            ? {
                option_a: pollA.trim(),
                option_b: pollB.trim(),
                ...(pollC.trim() ? { option_c: pollC.trim() } : {}),
                ...(pollD.trim() ? { option_d: pollD.trim() } : {}),
              }
            : undefined,
      });

      setSuccessMsg(
        isScheduled
          ? `Objava je uspešno zakazana za ${formatBelgrade(scheduledForEpoch!)}.`
          : "Objava je uspešno stavljena u red za slanje.",
      );

      // Reset forme
      setText("");
      setFiles([]);
      setAltText("");
      setTopicTag("");
      setQuotePostId("");
      setLocationId("");
      setGeoCodes("");
      setLinkAttachment("");
      setHasPoll(false);
      setPollA("");
      setPollB("");
      setPollC("");
      setPollD("");
      setIsGhostPost(false);
      setEnableReplyApprovals(false);
      setCrossreshareToIg(false);
      setIsSpoilerMedia(false);
      setAutoPublishText(false);
      setIsScheduled(false);

      fetchQuota();
      onJobCreated?.();
    } catch (err) {
      if (err instanceof ConvexError) {
        const data = err.data as { message?: string } | undefined;
        setErrorMsg(data?.message ?? "Došlo je do greške pri kreiranju objave.");
      } else if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg("Došlo je do neočekivane greške.");
      }
    } finally {
      setBusy(false);
      setProgressMsg(null);
      setConfirmOpen(false);
    }
  };

  const handlePublishClick = () => {
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }
    if (isScheduled) {
      submitJob();
    } else {
      setConfirmOpen(true);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Kvota objavljivanja (§8) ─────────────────────────────────────── */}
      <Card className="flex flex-wrap items-center justify-between gap-4 p-4 shadow-card ring-line">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-accent-400/10 text-accent-400">
            <Gauge className="size-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-foreground">
              Kvota objavljivanja (24h prozor)
            </h3>
            <p className="text-micro text-text-muted">
              Maksimalno 250 objava po Threads nalogu u pokretnom periodu od 24h
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {loadingQuota ? (
            <span className="text-text-muted">Učitavanje kvote...</span>
          ) : quota?.total !== undefined && quota?.used !== undefined ? (
            <div className="flex items-center gap-1.5 font-mono">
              <span className="font-semibold text-foreground">
                {formatNumber(quota.used)} / {formatNumber(quota.total)}
              </span>
              <span className="text-text-muted">iskorišćeno</span>
            </div>
          ) : (
            <span className="font-medium text-warning">
              Kvota nije pročitana
            </span>
          )}
        </div>
      </Card>

      {/* ── Glavna forma kompozera ────────────────────────────────────────── */}
      <Card className="p-6 shadow-card ring-line">
        <FormStack>
          {/* 1. Izbor tipa objave */}
          <FormGroup
            title="Tip objave"
            description="Izaberi format koji odgovara sadržaju (tekst, slika, video ili carousel)"
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(["TEXT", "IMAGE", "VIDEO", "CAROUSEL"] as const).map((type) => {
                const Icon =
                  type === "TEXT"
                    ? Type
                    : type === "IMAGE"
                      ? ImageIcon
                      : type === "VIDEO"
                        ? Video
                        : Layers;
                const active = mediaType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleMediaTypeChange(type)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-2 rounded-xl border p-4 text-xs font-semibold transition-all",
                      active
                        ? "border-accent-400 bg-accent-400/10 text-accent-400 shadow-xs"
                        : "border-line bg-surface text-text-muted hover:border-line-strong hover:text-foreground",
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                    <span>{MEDIA_TYPE_LABELS[type]}</span>
                  </button>
                );
              })}
            </div>
          </FormGroup>

          {/* 2. Tekst objave sa UTF-8 bajt brojačem (§4.2) */}
          <FormGroup
            title="Tekst objave"
            description="Tekst objave na Threads-u (do 500 UTF-8 bajtova; emoji zauzimaju više bajtova)"
          >
            <Field
              label="Sadržaj teksta"
              action={
                <span
                  className={cn(
                    "font-mono text-micro tabular-nums",
                    isTextOverLimit
                      ? "font-bold text-danger"
                      : textBytesLeft <= 50
                        ? "text-warning"
                        : "text-text-muted",
                  )}
                >
                  {isTextOverLimit
                    ? `${Math.abs(textBytesLeft)} bajtova preko limita`
                    : `${textBytesLeft} / ${TEXT_MAX_BYTES} bajtova preostalo`}
                </span>
              }
              error={isTextOverLimit ? "Tekst objave premašuje maksimalnih 500 UTF-8 bajtova." : null}
            >
              {(props) => (
                <Textarea
                  {...props}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Šta ima novo? Podeli misli ili priču..."
                  rows={4}
                  className="resize-y"
                />
              )}
            </Field>

            {/* Auto publish text samo za TEXT */}
            {mediaType === "TEXT" && (
              <div className="mt-3 flex items-center justify-between rounded-lg border border-line-soft bg-surface-raised/40 p-3">
                <div className="flex flex-col">
                  <Label htmlFor="autoPublishText" className="text-xs font-semibold text-foreground">
                    Automatsko objavljivanje (auto_publish_text)
                  </Label>
                  <span className="text-micro text-text-muted">
                    Preskače kreiranje posebnog kontejnera za brže slanje čistog teksta
                  </span>
                </div>
                <Switch
                  id="autoPublishText"
                  checked={autoPublishText}
                  onCheckedChange={setAutoPublishText}
                />
              </div>
            )}
          </FormGroup>

          {/* 3. Upload medija (Samo uz IMAGE / VIDEO / CAROUSEL) */}
          {mediaType !== "TEXT" && (
            <FormGroup
              title={
                mediaType === "IMAGE"
                  ? "Slika (maks 8 MB, JPEG/PNG)"
                  : mediaType === "VIDEO"
                    ? "Video (maks 1 GB, MP4/MOV)"
                    : `Carousel slajdovi (${files.length}/${CAROUSEL_MAX_ITEMS}, min ${CAROUSEL_MIN_ITEMS})`
              }
              description="Mediji se proveravaju u pregledaču pre uploada"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple={mediaType === "CAROUSEL"}
                accept={
                  mediaType === "IMAGE"
                    ? "image/jpeg,image/png"
                    : mediaType === "VIDEO"
                      ? "video/mp4,video/quicktime"
                      : "image/jpeg,image/png,video/mp4,video/quicktime"
                }
                onChange={handleFilesChosen}
                className="hidden"
              />

              {files.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {files.map((item, idx) => (
                    <div
                      key={idx}
                      className="group relative aspect-square overflow-hidden rounded-lg border border-line bg-surface"
                    >
                      {item.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.previewUrl}
                          alt="Pregled"
                          className="size-full object-cover"
                        />
                      ) : (
                        <video
                          src={item.previewUrl}
                          className="size-full object-cover"
                        />
                      )}

                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
                        className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-bg-950/80 text-foreground transition-opacity hover:bg-danger hover:text-text-inverse"
                        title="Ukloni fajl"
                      >
                        <X className="size-3.5" aria-hidden="true" />
                      </button>

                      <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-bg-950/80 px-1.5 py-0.5 text-micro font-mono text-text-muted">
                        {item.kind === "image" ? (
                          <FileImage className="size-3" />
                        ) : (
                          <FileVideo className="size-3" />
                        )}
                        <span>{(item.file.size / (1024 * 1024)).toFixed(1)} MB</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Dugme za dodavanje fajlova */}
              {(mediaType === "CAROUSEL" || files.length === 0) && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line p-6 text-xs text-text-muted transition-colors hover:border-accent-400 hover:text-foreground"
                >
                  <Upload className="size-6 text-accent-400" aria-hidden="true" />
                  <span>
                    {mediaType === "IMAGE"
                      ? "Izaberi sliku sa računara"
                      : mediaType === "VIDEO"
                        ? "Izaberi video sa računara"
                        : "Dodaj slike ili video snimke u carousel"}
                  </span>
                </button>
              )}

              {/* Alt tekst za medije (§4.2) */}
              <div className="mt-4">
                <Field
                  label="Alt tekst za osobe sa oštećenim vidom (alt_text)"
                  hint="Opis sadržaja slike ili videa (do 1000 karaktera)"
                  error={altText.length > ALT_TEXT_MAX_CHARS ? "Alt tekst premašuje 1000 karaktera." : null}
                >
                  {(props) => (
                    <Input
                      {...props}
                      value={altText}
                      onChange={(e) => setAltText(e.target.value)}
                      placeholder="Npr. Detaljan prikaz infografika sa tabelom rezultata..."
                    />
                  )}
                </Field>
              </div>

              {/* Spoiler media switch */}
              <div className="mt-3 flex items-center justify-between rounded-lg border border-line-soft bg-surface-raised/40 p-3">
                <div className="flex flex-col">
                  <Label htmlFor="isSpoilerMedia" className="text-xs font-semibold text-foreground">
                    Označi medij kao spoiler (is_spoiler_media)
                  </Label>
                  <span className="text-micro text-text-muted">
                    Zamućuje medij dok korisnik ne dodirne objavu
                  </span>
                </div>
                <Switch
                  id="isSpoilerMedia"
                  checked={isSpoilerMedia}
                  onCheckedChange={setIsSpoilerMedia}
                />
              </div>
            </FormGroup>
          )}

          {/* 4. Opcije samo za TEXT: Link prilog i Anketa */}
          {mediaType === "TEXT" && (
            <FormGroup
              title="Prilozi teksta (Link / Anketa)"
              description="Dozvoljeno isključivo uz čisto tekstualne objave"
            >
              <Field
                label="Prilog linka (link_attachment)"
                hint="Odredišni URL koji se prikazuje kao kartica sa pregledom"
              >
                {(props) => (
                  <Input
                    {...props}
                    type="url"
                    value={linkAttachment}
                    onChange={(e) => setLinkAttachment(e.target.value)}
                    placeholder="https://primer.rs/blog/novi-clanak"
                  />
                )}
              </Field>

              {/* Anketa */}
              <div className="mt-4 rounded-xl border border-line-soft bg-surface-raised/40 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Radio className="size-4 text-accent-400" aria-hidden="true" />
                    <Label htmlFor="hasPollToggle" className="text-xs font-semibold text-foreground">
                      Dodaj anketu (poll_attachment)
                    </Label>
                  </div>
                  <Switch
                    id="hasPollToggle"
                    checked={hasPoll}
                    onCheckedChange={setHasPoll}
                  />
                </div>

                {hasPoll && (
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Opcija A *" required>
                      {(props) => (
                        <Input
                          {...props}
                          value={pollA}
                          onChange={(e) => setPollA(e.target.value)}
                          maxLength={POLL_OPTION_MAX_CHARS}
                          placeholder="Maks 25 karaktera"
                        />
                      )}
                    </Field>
                    <Field label="Opcija B *" required>
                      {(props) => (
                        <Input
                          {...props}
                          value={pollB}
                          onChange={(e) => setPollB(e.target.value)}
                          maxLength={POLL_OPTION_MAX_CHARS}
                          placeholder="Maks 25 karaktera"
                        />
                      )}
                    </Field>
                    <Field label="Opcija C (opciono)">
                      {(props) => (
                        <Input
                          {...props}
                          value={pollC}
                          onChange={(e) => setPollC(e.target.value)}
                          maxLength={POLL_OPTION_MAX_CHARS}
                          placeholder="Maks 25 karaktera"
                        />
                      )}
                    </Field>
                    <Field label="Opcija D (opciono)">
                      {(props) => (
                        <Input
                          {...props}
                          value={pollD}
                          onChange={(e) => setPollD(e.target.value)}
                          maxLength={POLL_OPTION_MAX_CHARS}
                          placeholder="Maks 25 karaktera"
                        />
                      )}
                    </Field>
                  </div>
                )}
              </div>
            </FormGroup>
          )}

          {/* 5. Napredna podešavanja objave (§4.2) */}
          <FormGroup
            title="Podešavanja vidljivosti i interakcije"
            description="Kontrola ko sme da odgovara, tag teme, citiranje i geo-gating"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Reply control */}
              <div className="space-y-1.5">
                <Label htmlFor="replyControlSelect" className="text-xs font-medium text-text-muted">
                  Ko sme da odgovara (reply_control)
                </Label>
                <select
                  id="replyControlSelect"
                  value={replyControl}
                  onChange={(e) => setReplyControl(e.target.value as ReplyControl)}
                  className="flex h-9 w-full rounded-md border border-line bg-surface px-3 py-1 text-xs text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="everyone">Svi (everyone)</option>
                  <option value="accounts_you_follow">Nalozi koje pratiš</option>
                  <option value="mentioned_only">Samo spomenuti nalozi</option>
                  <option value="parent_post_author_only">Samo autor roditeljske objave</option>
                  <option value="followers_only">Samo pratioci</option>
                </select>
              </div>

              {/* Topic tag */}
              <Field
                label="Tema (topic_tag)"
                hint="1–50 karaktera, bez tačke (.) i znaka (&)"
              >
                {(props) => (
                  <Input
                    {...props}
                    value={topicTag}
                    onChange={(e) => setTopicTag(e.target.value)}
                    maxLength={TOPIC_TAG_MAX_CHARS}
                    placeholder="npr. marketing, tehnologija"
                  />
                )}
              </Field>

              {/* Quote post id */}
              <Field
                label="Citiraj objavu (quote_post_id)"
                hint="ID objave na Threads-u koju citiraš"
              >
                {(props) => (
                  <Input
                    {...props}
                    value={quotePostId}
                    onChange={(e) => setQuotePostId(e.target.value)}
                    placeholder="Threads Media ID"
                  />
                )}
              </Field>

              {/* Geo gating */}
              <Field
                label="Ograniči po državama (allowlisted_country_codes)"
                hint="ISO kodovi razdvojeni zarezom, npr. RS, BA, ME"
              >
                {(props) => (
                  <Input
                    {...props}
                    value={geoCodes}
                    onChange={(e) => setGeoCodes(e.target.value)}
                    placeholder="RS, ME, BA, HR"
                  />
                )}
              </Field>
            </div>

            {/* Prekidači za Ghost post, Odobravanje odgovora, Cross-share */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex items-center justify-between rounded-lg border border-line-soft bg-surface-raised/40 p-3">
                <div className="flex flex-col pr-2">
                  <Label htmlFor="ghostPost" className="text-xs font-semibold text-foreground">
                    Ghost objava
                  </Label>
                  <span className="text-micro text-text-muted">
                    Samoarhivira se nakon 24h
                  </span>
                </div>
                <Switch
                  id="ghostPost"
                  checked={isGhostPost}
                  onCheckedChange={setIsGhostPost}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-line-soft bg-surface-raised/40 p-3">
                <div className="flex flex-col pr-2">
                  <Label htmlFor="replyApprovals" className="text-xs font-semibold text-foreground">
                    Odobravanje odgovora
                  </Label>
                  <span className="text-micro text-text-muted">
                    Ručno odobravanje pre javnog prikaza
                  </span>
                </div>
                <Switch
                  id="replyApprovals"
                  checked={enableReplyApprovals}
                  onCheckedChange={setEnableReplyApprovals}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-line-soft bg-surface-raised/40 p-3">
                <div className="flex flex-col pr-2">
                  <Label htmlFor="crossIg" className="text-xs font-semibold text-foreground">
                    IG Story deljenje
                  </Label>
                  <span className="text-micro text-text-muted">
                    Cross-share na Instagram Story
                  </span>
                </div>
                <Switch
                  id="crossIg"
                  checked={crossreshareToIg}
                  onCheckedChange={setCrossreshareToIg}
                />
              </div>
            </div>

            {crossreshareToIg && (
              <div className="mt-2 flex items-center justify-between rounded-lg border border-line-soft bg-surface-raised/40 p-3">
                <div className="flex flex-col">
                  <Label htmlFor="crossDarkMode" className="text-xs font-semibold text-foreground">
                    Tamna tema za Story stiker (crossreshare_to_ig_dark_mode)
                  </Label>
                  <span className="text-micro text-text-muted">
                    Prikazuje Threads karticu u tamnom režimu na Story-ju
                  </span>
                </div>
                <Switch
                  id="crossDarkMode"
                  checked={crossreshareDarkMode}
                  onCheckedChange={setCrossreshareDarkMode}
                />
              </div>
            )}
          </FormGroup>

          {/* 6. Zakazivanje objave */}
          <FormGroup
            title="Vreme objavljivanja"
            description="Objavi odmah ili zakaži za određeni datum i vreme po beogradskom vremenu"
          >
            <div className="flex items-center justify-between rounded-lg border border-line-soft bg-surface-raised/40 p-3">
              <div className="flex items-center gap-2">
                <CalendarClock className="size-4 text-accent-400" aria-hidden="true" />
                <Label htmlFor="scheduleToggle" className="text-xs font-semibold text-foreground">
                  Zakaži za kasnije
                </Label>
              </div>
              <Switch
                id="scheduleToggle"
                checked={isScheduled}
                onCheckedChange={setIsScheduled}
              />
            </div>

            {isScheduled && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Datum">
                  {(props) => (
                    <Input
                      {...props}
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                    />
                  )}
                </Field>
                <Field label="Vreme (po beogradskom vremenu)">
                  {(props) => (
                    <Input
                      {...props}
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                    />
                  )}
                </Field>
              </div>
            )}
          </FormGroup>

          {/* Poruke o grešci / uspehu */}
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

          {/* Dugme za slanje */}
          <div className="flex items-center justify-end gap-3 border-t border-line-soft pt-4">
            <Button
              type="button"
              onClick={handlePublishClick}
              disabled={busy || isTextOverLimit}
              className="gap-2 font-semibold"
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  <span>{progressMsg ?? "Obrada..."}</span>
                </>
              ) : isScheduled ? (
                <>
                  <CalendarClock className="size-4" aria-hidden="true" />
                  <span>Zakaži objavu</span>
                </>
              ) : (
                <>
                  <Send className="size-4" aria-hidden="true" />
                  <span>Objavi na Threads</span>
                </>
              )}
            </Button>
          </div>
        </FormStack>
      </Card>

      {/* Dijalog za potvrdu direktnog objavljivanja */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Objavi odmah na Threads"
        description="Ova radnja je nepovratna. Objava će odmah biti poslata na Threads nalog i postati javno vidljiva posetiocima."
        confirmLabel="Potvrdi i objavi"
        busyLabel="Šalje se..."
        busy={busy}
        onConfirm={submitJob}
        tone="accent"
      />
    </div>
  );
}
