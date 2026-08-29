"use client";

import { useState, useId, useEffect, useRef, useTransition } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  FileEdit,
  FileText,
  History,
  Image as ImageIcon,
  Info,
  Layers,
  Loader2,
  Lock,
  Save,
  Send,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  User,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FeedbackNote } from "@/components/app/feedback";
import {
  FormGroup,
  FormStack,
  Field,
  CharCount,
  DangerZone,
} from "@/components/app/form-kit";
import { PublishReadinessPanel } from "./publish-readiness-panel";
import {
  POST_CATEGORIES,
  POST_KINDS,
  checkHumanizerRules,
  extractConvexErrorMessage,
  type HumanizerCheckResult,
  type PostCategory,
  type PostItem,
  type PostKind,
  type PostStatus,
} from "./novosti-types";
import { formatDateTime } from "@/lib/format";
import { slugify } from "@/convex/lib/slug";
import { cn } from "@/lib/utils";

export interface NovostiEditorProps {
  initialPost?: Partial<PostItem> | null;
  workspaceId: Id<"workspaces">;
  onBack: () => void;
  onSaved: (post: PostItem) => void;
}

export function NovostiEditor({
  initialPost,
  workspaceId,
  onBack,
  onSaved,
}: NovostiEditorProps) {
  // Form State
  const [postId, setPostId] = useState<Id<"posts"> | undefined>(
    initialPost?._id,
  );
  const [title, setTitle] = useState(initialPost?.title ?? "");
  const [slug, setSlug] = useState(initialPost?.slug ?? "");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(
    Boolean(initialPost?.slug),
  );
  const [kind, setKind] = useState<PostKind>(initialPost?.kind ?? "article");
  const [category, setCategory] = useState<PostCategory>(
    initialPost?.category ?? "kako_radi",
  );
  const [dek, setDek] = useState(initialPost?.dek ?? "");
  const [body, setBody] = useState(initialPost?.body ?? "");
  const [tagsInput, setTagsInput] = useState(
    initialPost?.tags ? initialPost.tags.join(", ") : "",
  );
  const [authorName, setAuthorName] = useState(
    initialPost?.authorName ?? "Enigma IT",
  );
  const [authorRole, setAuthorRole] = useState(initialPost?.authorRole ?? "");
  const [status, setStatus] = useState<PostStatus>(
    initialPost?.status ?? "draft",
  );
  const [publishedAt, setPublishedAt] = useState<number | undefined>(
    initialPost?.publishedAt,
  );
  const [updatedAt, setUpdatedAt] = useState<number>(
    initialPost?.updatedAt ?? Date.now(),
  );

  // Naslovna slika i ALT opis (§4.3, §11)
  const [coverStorageId, setCoverStorageId] = useState<
    Id<"_storage"> | undefined
  >(initialPost?.coverStorageId);
  const [coverAlt, setCoverAlt] = useState(initialPost?.coverAlt ?? "");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Pravilo jedinstvenosti (§2.2, §4.1)
  const [ownProofChecked, setOwnProofChecked] = useState(
    initialPost?.ownProofChecked ?? false,
  );
  const [ownProofNote, setOwnProofNote] = useState(
    initialPost?.ownProofNote ?? "",
  );

  // Humanizer (§4.2)
  const [humanizerPassedAt, setHumanizerPassedAt] = useState<
    number | undefined
  >(initialPost?.humanizerPassedAt);
  const [humanizerResult, setHumanizerResult] =
    useState<HumanizerCheckResult | null>(null);
  const [showHumanizerModal, setShowHumanizerModal] = useState(false);

  // SEO polja
  const [seoTitle, setSeoTitle] = useState(initialPost?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(
    initialPost?.seoDescription ?? "",
  );
  const [canonicalUrl, setCanonicalUrl] = useState(
    initialPost?.canonicalUrl ?? "",
  );

  // Revision state
  const [revisionNote, setRevisionNote] = useState("");
  const [savingRevision, setSavingRevision] = useState(false);

  // Operation state
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Convex mutations
  const createPostMutation = useMutation(api.postsStore.create);
  const updateDraftMutation = useMutation(api.postsStore.updateDraft);
  const saveRevisionMutation = useMutation(api.postsStore.saveRevision);
  const unpublishMutation = useMutation(api.postsStore.unpublish);
  const archiveMutation = useMutation(api.postsStore.archive);
  const generateUploadUrlMutation = useMutation(
    api.threadsPublishStore.generateUploadUrl,
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-generate slug when title changes (if not manually edited)
  useEffect(() => {
    if (!slugManuallyEdited && title.trim()) {
      setSlug(slugify(title));
    }
  }, [title, slugManuallyEdited]);

  // Provera reči za izabranu vrstu posta (§3)
  const wordsCount = body.trim() ? body.trim().split(/\s+/).length : 0;
  const currentKindConfig =
    POST_KINDS.find((k) => k.id === kind) ?? POST_KINDS[0];

  // Sastavljen objekat trenutnog stanja posta za evaluaciju kapija
  const currentPostDraft: Partial<PostItem> & { _id?: Id<"posts"> } = {
    _id: postId,
    workspaceId,
    title,
    slug,
    kind,
    category,
    dek,
    body,
    coverStorageId,
    coverAlt,
    authorName,
    authorRole: authorRole.trim() || undefined,
    tags: tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    status,
    publishedAt,
    updatedAt,
    seoTitle: seoTitle.trim() || undefined,
    seoDescription: seoDescription.trim() || undefined,
    canonicalUrl: canonicalUrl.trim() || undefined,
    ownProofChecked,
    ownProofNote: ownProofNote.trim() || undefined,
    humanizerPassedAt,
  };

  // Upload slike u Convex storage (§11)
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Resetuj greške
    setUploadError(null);

    if (file.size > 10 * 1024 * 1024) {
      setUploadError("Maksimalna veličina slike je 10 MB.");
      return;
    }

    setUploadingImage(true);
    try {
      // 1. Zatraži jednokratni URL za upload od Convex-a
      const uploadUrl = await generateUploadUrlMutation();

      // 2. Otpremi binarni sadržaj fajla
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      if (!res.ok) {
        throw new Error(`Upload na server nije uspeo (HTTP ${res.status}).`);
      }

      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      setCoverStorageId(storageId);
      setSuccessMsg("Naslovna slika je uspešno otpremljena u Convex storage.");
    } catch (err: unknown) {
      setUploadError(
        extractConvexErrorMessage(
          err,
          "Otpremanje slike nije uspelo. Proverite vezu.",
        ),
      );
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveImage = () => {
    setCoverStorageId(undefined);
    setCoverAlt("");
  };

  // Pokreni proveru humanizera (§4)
  const handleRunHumanizer = () => {
    const res = checkHumanizerRules(body);
    setHumanizerResult(res);
    setShowHumanizerModal(true);

    if (res.clean) {
      const now = Date.now();
      setHumanizerPassedAt(now);
    }
  };

  const handleApproveHumanizer = () => {
    const now = Date.now();
    setHumanizerPassedAt(now);
    setShowHumanizerModal(false);
  };

  // Čuvanje nacrta posta (ili kreiranje novog)
  const handleSaveDraft = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMsg("Naslov posta je obavezan.");
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const tagsArray = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      let currentId = postId;

      if (!currentId) {
        // Kreiramo novi post preko Convex mutacije
        const res = await createPostMutation({
          workspaceId,
          title: trimmedTitle,
          slug: slug.trim() || undefined,
          kind,
          category,
          dek: dek.trim() || undefined,
          body: body || undefined,
          authorName: authorName.trim() || undefined,
          authorRole: authorRole.trim() || undefined,
          tags: tagsArray,
        });

        currentId = res.postId;
        setPostId(currentId);
        setStatus("draft");
      }

      // Ažuriramo sva polja posta
      const updateRes = await updateDraftMutation({
        postId: currentId,
        title: trimmedTitle,
        slug: slug.trim() || undefined,
        kind,
        category,
        dek: dek.trim(),
        body: body,
        coverStorageId: coverStorageId ?? undefined,
        coverAlt: coverAlt.trim() || undefined,
        authorName: authorName.trim() || "Enigma IT",
        authorRole: authorRole.trim() || undefined,
        tags: tagsArray,
        seoTitle: seoTitle.trim() || undefined,
        seoDescription: seoDescription.trim() || undefined,
        canonicalUrl: canonicalUrl.trim() || undefined,
        ownProofChecked,
        ownProofNote: ownProofNote.trim() || undefined,
        humanizerPassedAt,
      });

      setUpdatedAt(updateRes.updatedAt);
      setSuccessMsg("Nacrt posta je uspešno sačuvan.");

      // Obavesti roditelja
      onSaved({
        _id: currentId,
        _creationTime: initialPost?._creationTime ?? Date.now(),
        workspaceId,
        slug: slug.trim() || slugify(trimmedTitle),
        locale: "sr-Latn",
        kind,
        category,
        title: trimmedTitle,
        dek: dek.trim(),
        body,
        coverStorageId,
        coverAlt: coverAlt.trim() || undefined,
        authorName: authorName.trim() || "Enigma IT",
        authorRole: authorRole.trim() || undefined,
        tags: tagsArray,
        status,
        publishedAt,
        updatedAt: updateRes.updatedAt,
        seoTitle: seoTitle.trim() || undefined,
        seoDescription: seoDescription.trim() || undefined,
        canonicalUrl: canonicalUrl.trim() || undefined,
        ownProofChecked,
        ownProofNote: ownProofNote.trim() || undefined,
        humanizerPassedAt,
      });
    } catch (err: unknown) {
      setErrorMsg(
        extractConvexErrorMessage(
          err,
          "Čuvanje posta nije uspelo iz nepoznatog razloga.",
        ),
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Snimanje revizije sadržaja
  const handleSaveRevision = async () => {
    if (!postId) {
      setErrorMsg("Post mora biti prvo sačuvan pre snimanja revizije.");
      return;
    }

    setSavingRevision(true);
    try {
      await saveRevisionMutation({
        postId,
        body,
        note: revisionNote.trim() || undefined,
      });
      setRevisionNote("");
      setSuccessMsg("Revizija sadržaja je zabeležena u istoriji.");
    } catch (err: unknown) {
      setErrorMsg(
        extractConvexErrorMessage(err, "Snimanje revizije nije uspelo."),
      );
    } finally {
      setSavingRevision(false);
    }
  };

  // Vraćanje u nacrt (Unpublish)
  const handleUnpublish = async () => {
    if (!postId) return;
    setIsSaving(true);
    setErrorMsg(null);
    try {
      await unpublishMutation({ postId });
      setStatus("draft");
      setSuccessMsg("Post je povučen u status nacrta.");
    } catch (err: unknown) {
      setErrorMsg(
        extractConvexErrorMessage(
          err,
          "Vraćanje posta u nacrt nije uspelo.",
        ),
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Arhiviranje posta
  const handleArchive = async () => {
    if (!postId) return;
    setIsSaving(true);
    setErrorMsg(null);
    try {
      await archiveMutation({ postId });
      setStatus("archived");
      setSuccessMsg("Post je arhiviran.");
    } catch (err: unknown) {
      setErrorMsg(
        extractConvexErrorMessage(err, "Arhiviranje posta nije uspelo."),
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Kad je post objavljen kroz panel
  const handlePublishedSuccess = (pubAt: number) => {
    setStatus("published");
    setPublishedAt(pubAt);
    setSuccessMsg(`Post je zvanično objavljen (${formatDateTime(pubAt)}).`);
    if (postId) {
      onSaved({
        _id: postId,
        _creationTime: initialPost?._creationTime ?? Date.now(),
        workspaceId,
        slug,
        locale: "sr-Latn",
        kind,
        category,
        title,
        dek,
        body,
        coverStorageId,
        coverAlt,
        authorName,
        authorRole,
        tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
        status: "published",
        publishedAt: pubAt,
        updatedAt: Date.now(),
        seoTitle,
        seoDescription,
        canonicalUrl,
        ownProofChecked,
        ownProofNote,
        humanizerPassedAt,
      });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Gornja traka sa navigacijom i brzim statusom */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onBack}
            className="gap-1.5 text-text-muted hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            <span>Nazad na listu</span>
          </Button>
          <span className="text-sm font-semibold text-foreground">
            {postId ? "Uređivanje posta" : "Novi post"}
          </span>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-micro font-medium uppercase tracking-wider",
              status === "published"
                ? "bg-success/15 text-success"
                : status === "archived"
                  ? "bg-muted text-text-muted"
                  : "bg-warning/15 text-warning",
            )}
          >
            {status}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
            disabled={isSaving}
            className="gap-1.5"
          >
            {isSaving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            <span>Sačuvaj nacrt</span>
          </Button>
        </div>
      </div>

      {/* Poruke o grešci ili uspehu na nivou forme */}
      {errorMsg && (
        <FeedbackNote
          tone="danger"
          title="Greška pri snimanju"
          action={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setErrorMsg(null)}
              aria-label="Zatvori grešku"
            >
              <X className="size-3.5" />
            </Button>
          }
        >
          {errorMsg}
        </FeedbackNote>
      )}

      {successMsg && (
        <FeedbackNote
          tone="success"
          title="Uspešno ažurirano"
          action={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setSuccessMsg(null)}
              aria-label="Zatvori obaveštenje"
            >
              <X className="size-3.5" />
            </Button>
          }
        >
          {successMsg}
        </FeedbackNote>
      )}

      {/* Glavna forma organizovana kroz FormStack */}
      <FormStack>
        {/* Grupa 1: Osnovni podaci i kategorizacija (§2, §3) */}
        <FormGroup
          title="1. Osnovni podaci i kategorizacija"
          description="Naslov, slug, podnaslov i raspodela po jednoj od 6 obaveznih tema (§2)."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Naslov posta"
              required
              action={<CharCount value={title.length} max={100} />}
            >
              {({ id, "aria-invalid": invalid }) => (
                <Input
                  id={id}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="npr. Zašto cena softvera skoči tokom izrade"
                  aria-invalid={invalid}
                />
              )}
            </Field>

            <Field
              label="Slug (putanja)"
              required
              hint="Generiše se automatski iz naslova ili ga unesite ručno."
            >
              {({ id }) => (
                <Input
                  id={id}
                  value={slug}
                  onChange={(e) => {
                    setSlugManuallyEdited(true);
                    setSlug(slugify(e.target.value));
                  }}
                  placeholder="zasto-cena-softvera-skoci"
                />
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Vrsta posta (§3) */}
            <Field
              label="Vrsta posta (§3)"
              hint={`${currentKindConfig.wordRange} — ${currentKindConfig.description}`}
            >
              {({ id }) => (
                <select
                  id={id}
                  value={kind}
                  onChange={(e) => setKind(e.target.value as PostKind)}
                  className="h-8 w-full rounded-lg border border-input bg-surface px-2.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {POST_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label} ({k.wordRange})
                    </option>
                  ))}
                </select>
              )}
            </Field>

            {/* Kategorija tema (§2) */}
            <Field
              label="Kategorija teme (§2)"
              hint="Nijedna tema ne sme da nosi više od trećine objava u mesecu."
            >
              {({ id }) => (
                <select
                  id={id}
                  value={category}
                  onChange={(e) => setCategory(e.target.value as PostCategory)}
                  className="h-8 w-full rounded-lg border border-input bg-surface px-2.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {POST_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>

          {/* Podnaslov (Dek) — Kapija 4 */}
          <Field
            label="Podnaslov / Dek (§4.4)"
            required
            action={<CharCount value={dek.length} max={250} />}
            hint="1–2 rečenice: ide u vrh posta, na karticu u listi i u SEO meta opis. Ne sme biti prazan."
          >
            {({ id }) => (
              <Textarea
                id={id}
                value={dek}
                onChange={(e) => setDek(e.target.value)}
                rows={2}
                placeholder="Sažet i konkretan uvod koji odgovara na pitanje šta čitalac dobija iz teksta."
              />
            )}
          </Field>
        </FormGroup>

        {/* Grupa 2: Sadržaj i telo posta (Markdown + Humanizer) */}
        <FormGroup
          title="2. Sadržaj teksta (Markdown)"
          description={`Ukupno reči: ${wordsCount} (Preporučeni opseg za ${currentKindConfig.label}: ${currentKindConfig.wordRange}).`}
          control={
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={handleRunHumanizer}
              className="gap-1 text-xs text-accent-400 hover:bg-accent-400/10"
            >
              <Sparkles className="size-3" />
              <span>Proveri humanizer</span>
            </Button>
          }
        >
          <Field
            label="Telo posta"
            hint="Formatirano u Markdown formatu. Odgovor na pitanje iz naslova stavite u prvih 40–60 reči."
          >
            {({ id }) => (
              <Textarea
                id={id}
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  // Ako je tekst promenjen, označavamo da je potrebna nova provera humanizera
                }}
                rows={14}
                className="font-mono text-xs leading-relaxed"
                placeholder="# Naslov sekcije&#10;&#10;Unesite sadržaj posta u markdown formatu..."
              />
            )}
          </Field>

          {/* Humanizer brzi status ispod editora */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface/50 p-3 text-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-accent-400" />
              <span>
                Humanizer provera:{" "}
                {humanizerPassedAt ? (
                  <span className="font-medium text-success">
                    Prošla ({formatDateTime(humanizerPassedAt)})
                  </span>
                ) : (
                  <span className="font-medium text-warning">
                    Nije pokrenuta ili čeka verifikaciju (§4.2)
                  </span>
                )}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={handleRunHumanizer}
            >
              Pokreni proveru
            </Button>
          </div>
        </FormGroup>

        {/* Grupa 3: Pravilo jedinstvenosti (§2.2, §4.1) */}
        <FormGroup
          title="3. Pravilo jedinstvenosti (§2.2)"
          description="Svaki post mora da odgovori na jedno pitanje pre objave: šta je ovde moje?"
          boxed
        >
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Checkbox
                id="own-proof-checkbox"
                checked={ownProofChecked}
                onCheckedChange={(checked) =>
                  setOwnProofChecked(checked === true)
                }
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label
                  htmlFor="own-proof-checkbox"
                  className="cursor-pointer text-xs font-semibold text-foreground"
                >
                  Šta je ovde moje? (§2.2)
                </Label>
                <p className="text-xs text-text-muted">
                  Prihvatljiv odgovor je tačno jedan od: sopstveni podatak,
                  sopstveni snimak ekrana, sopstveni slučaj, sopstveni dijagram,
                  ili stav koji drugi ne zauzimaju.
                </p>
              </div>
            </div>

            <Field
              label="Čime je dokaz ispunjen (jedna rečenica)"
              required={ownProofChecked}
              hint="npr. Sopstveni podaci iz 2026. produkcionog sistema ili autorski dijagram toka API poziva."
            >
              {({ id }) => (
                <Input
                  id={id}
                  value={ownProofNote}
                  onChange={(e) => setOwnProofNote(e.target.value)}
                  placeholder="Jedna rečenica čime je dokaz ispunjen..."
                />
              )}
            </Field>
          </div>
        </FormGroup>

        {/* Grupa 4: Naslovna slika i ALT opis (§4.3, §11) */}
        <FormGroup
          title="4. Naslovna slika i dijagrami (§11)"
          description="Otpremanje u Convex storage. Kada slika postoji, coverAlt je OBAVEZAN."
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={handleImageUpload}
            className="hidden"
          />

          <div className="space-y-4">
            {coverStorageId ? (
              <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface/50 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-success" />
                    <span className="text-xs font-medium text-foreground">
                      Naslovna slika je u Convex skladištu
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={handleRemoveImage}
                    className="h-7 text-xs text-danger hover:bg-danger/10"
                  >
                    <Trash2 className="size-3.5" />
                    <span>Ukloni sliku</span>
                  </Button>
                </div>

                <p className="font-mono text-micro text-text-muted">
                  Storage ID: {coverStorageId}
                </p>

                {/* coverAlt — OBAVEZNO kad slika postoji (§4.3) */}
                <Field
                  label="Opis slike (coverAlt) — OBAVEZNO"
                  required
                  error={
                    !coverAlt.trim()
                      ? "ALT opis ne sme ostati prazan kada slika postoji (§4 kapija odbija objavu)."
                      : null
                  }
                  hint="Pristupačnost i SEO opis slike za pretraživače i čitače ekrana."
                >
                  {({ id, "aria-invalid": invalid }) => (
                    <Input
                      id={id}
                      value={coverAlt}
                      onChange={(e) => setCoverAlt(e.target.value)}
                      placeholder="npr. Dijagram toka sinhronizacije između klijenta i servera"
                      aria-invalid={invalid}
                    />
                  )}
                </Field>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line p-6 text-center">
                <div className="flex size-10 items-center justify-center rounded-full bg-surface text-text-muted">
                  <ImageIcon className="size-5" />
                </div>
                <p className="mt-2 text-xs font-medium text-foreground">
                  Nema naslovne slike
                </p>
                <p className="mt-0.5 text-micro text-text-muted">
                  PNG, JPG, WebP ili SVG dijagram (do 10 MB).
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage}
                  className="mt-3 gap-1.5"
                >
                  {uploadingImage ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>Slanje u Convex storage…</span>
                    </>
                  ) : (
                    <>
                      <Upload className="size-3.5" />
                      <span>Izaberi i otpremi sliku</span>
                    </>
                  )}
                </Button>
              </div>
            )}

            {uploadError && (
              <FeedbackNote tone="danger" title="Greška pri otpremanju">
                {uploadError}
              </FeedbackNote>
            )}
          </div>
        </FormGroup>

        {/* Grupa 5: Autor, tagovi i SEO polja */}
        <FormGroup
          title="5. Autor, oznake i SEO"
          description="Metapodaci koji hrane pretraživače, RSS i sitemap."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ime autora">
              {({ id }) => (
                <Input
                  id={id}
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Enigma IT"
                />
              )}
            </Field>

            <Field label="Uloga autora (opciono)">
              {({ id }) => (
                <Input
                  id={id}
                  value={authorRole}
                  onChange={(e) => setAuthorRole(e.target.value)}
                  placeholder="npr. Tehnički direktor"
                />
              )}
            </Field>
          </div>

          <Field
            label="Tagovi (odvojeni zarezom)"
            hint="Tagovi se pretražuju u memoriji, ne indeksiraju se u bazi (§5.1)."
          >
            {({ id }) => (
              <Input
                id={id}
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="web, performanse, arhitektura, nextjs"
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="SEO Naslov (opciono)"
              hint="Ako je prazno, koristi se naslov posta."
            >
              {({ id }) => (
                <Input
                  id={id}
                  value={seoTitle}
                  onChange={(e) => setSeoTitle(e.target.value)}
                  placeholder={title || "SEO naslov"}
                />
              )}
            </Field>

            <Field
              label="Kanonski URL (opciono)"
              hint="Kada je post originalno objavljen na drugoj lokaciji."
            >
              {({ id }) => (
                <Input
                  id={id}
                  value={canonicalUrl}
                  onChange={(e) => setCanonicalUrl(e.target.value)}
                  placeholder="https://..."
                />
              )}
            </Field>
          </div>

          <Field
            label="SEO Opis (opciono)"
            hint="Ako je prazno, koristi se podnaslov (dek)."
          >
            {({ id }) => (
              <Textarea
                id={id}
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
                rows={2}
                placeholder={dek || "SEO opis za Google rezultate"}
              />
            )}
          </Field>
        </FormGroup>

        {/* Grupa 6: Revizije i istorija promena */}
        {postId && (
          <FormGroup
            title="6. Zabeleži reviziju sadržaja (§5.2)"
            description="Čuva trenutnu verziju tela posta u postRevisions tabeli."
          >
            <div className="flex flex-wrap items-center gap-3">
              <Input
                value={revisionNote}
                onChange={(e) => setRevisionNote(e.target.value)}
                placeholder="Kratka beleška uz reviziju (npr. Dopuna pasusa o API greškama)..."
                className="min-w-64 flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSaveRevision}
                disabled={savingRevision || !body}
                className="gap-1.5"
              >
                {savingRevision ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <History className="size-3.5" />
                )}
                <span>Snimi reviziju</span>
              </Button>
            </div>
          </FormGroup>
        )}

        {/* Panel 4 kapije pre objave (§4) */}
        <PublishReadinessPanel
          post={currentPostDraft}
          onPublished={handlePublishedSuccess}
          onRunHumanizer={handleRunHumanizer}
          isSaving={isSaving}
        />

        {/* Opasna zona: Vraćanje u nacrt ili arhiviranje */}
        {postId && (
          <DangerZone
            title="Upravljanje statusom posta"
            description="Pomeranje posta iz javnog prikaza u arhivu ili nazad u nacrt."
          >
            <div className="flex items-center gap-2">
              {status === "published" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleUnpublish}
                  disabled={isSaving}
                  className="border-danger/30 text-danger hover:bg-danger/10"
                >
                  Vrati u nacrt (Unpublish)
                </Button>
              )}
              {status !== "archived" && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleArchive}
                  disabled={isSaving}
                >
                  Arhiviraj post
                </Button>
              )}
            </div>
          </DangerZone>
        )}
      </FormStack>

      {/* Humanizer modal / provera pregled */}
      {showHumanizerModal && humanizerResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-overlay/80 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg rounded-xl border border-line bg-surface-raised p-5 shadow-elev-3">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-accent-400" />
                <h4 className="text-sm font-semibold text-foreground">
                  Humanizer provera teksta (§4)
                </h4>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowHumanizerModal(false)}
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="flex items-center justify-between rounded bg-surface p-2.5">
                <span className="text-text-muted">Broj reči:</span>
                <span className="font-semibold text-foreground">
                  {humanizerResult.wordCount} reči (Cilj:{" "}
                  {currentKindConfig.wordRange})
                </span>
              </div>

              <div className="flex items-center justify-between rounded bg-surface p-2.5">
                <span className="text-text-muted">Em crtice (—):</span>
                <span
                  className={cn(
                    "font-semibold",
                    humanizerResult.emDashCount === 0
                      ? "text-success"
                      : "text-danger",
                  )}
                >
                  {humanizerResult.emDashCount} (zahtev: 0)
                </span>
              </div>

              <div className="flex items-center justify-between rounded bg-surface p-2.5">
                <span className="text-text-muted">
                  Konstrukcije „ne samo ... nego":
                </span>
                <span
                  className={cn(
                    "font-semibold",
                    humanizerResult.notOnlyPatternCount === 0
                      ? "text-success"
                      : "text-danger",
                  )}
                >
                  {humanizerResult.notOnlyPatternCount} (zahtev: 0)
                </span>
              </div>

              {humanizerResult.issues.length > 0 ? (
                <div className="rounded-lg border border-danger/30 bg-danger/5 p-3">
                  <p className="font-medium text-danger">
                    Pronađene stavke za ispravku:
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-text-secondary">
                    {humanizerResult.issues.map((iss, i) => (
                      <li key={i}>{iss}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-lg border border-success/30 bg-success/5 p-3">
                  <p className="font-medium text-success">
                    ✓ Tekst je prošao sva merljiva pravila humanizera!
                  </p>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-line pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowHumanizerModal(false)}
              >
                Zatvori
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleApproveHumanizer}
                className="bg-accent-400 text-surface-canvas hover:bg-accent-300"
              >
                Potvrdi proveru
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
