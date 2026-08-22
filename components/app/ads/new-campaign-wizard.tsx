"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { ConvexError } from "convex/values";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FeedbackNote } from "@/components/app/feedback";
import { Reveal } from "@/components/motion/reveal";
import { TargetingSearchDialog } from "./targeting-search-dialog";
import { cn } from "@/lib/utils";
import {
  Target,
  Users,
  Image as ImageIcon,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Check,
  X,
  Pause,
  Search,
  Info,
  ShieldCheck,
  PlugZap,
} from "lucide-react";

// ── Katalozi (usklađeni sa convex/lib/metaAdsWrite.ts) ──────────────────────

const OBJECTIVES = [
  { value: "OUTCOME_TRAFFIC", label: "Saobraćaj" },
  { value: "OUTCOME_ENGAGEMENT", label: "Angažovanje" },
  { value: "OUTCOME_AWARENESS", label: "Svesnost" },
  { value: "OUTCOME_LEADS", label: "Lidovi" },
  { value: "OUTCOME_SALES", label: "Prodaja" },
] as const;

const BILLING_EVENTS = [
  { value: "IMPRESSIONS", label: "Impresije" },
  { value: "LINK_CLICKS", label: "Klikovi na link" },
  { value: "THRUPLAY", label: "ThruPlay (video)" },
  { value: "POST_ENGAGEMENT", label: "Angažovanje objave" },
] as const;

const OPT_GOAL_LABELS: Record<string, string> = {
  REACH: "Doseg",
  IMPRESSIONS: "Impresije",
  LINK_CLICKS: "Klikovi na link",
  LANDING_PAGE_VIEWS: "Pregledi odredišne strane",
  POST_ENGAGEMENT: "Angažovanje objave",
  THRUPLAY: "ThruPlay (video)",
  OFFSITE_CONVERSIONS: "Konverzije",
  VALUE: "Vrednost (ROAS)",
  LEAD_GENERATION: "Instant lidovi",
  QUALITY_LEAD: "Kvalitetni lidovi",
};

const BILLING_OPT_COMPAT: Record<string, string[]> = {
  IMPRESSIONS: Object.keys(OPT_GOAL_LABELS),
  LINK_CLICKS: ["LINK_CLICKS", "LANDING_PAGE_VIEWS"],
  THRUPLAY: ["THRUPLAY"],
  POST_ENGAGEMENT: ["POST_ENGAGEMENT"],
};

const REQUIRES_PIXEL = ["OFFSITE_CONVERSIONS", "VALUE", "QUALITY_LEAD"];
const REQUIRES_PAGE = ["LEAD_GENERATION"];

const SPECIAL_CATEGORIES = [
  { value: "HOUSING", label: "Stanovanje" },
  { value: "EMPLOYMENT", label: "Zapošljavanje" },
  { value: "CREDIT", label: "Krediti" },
  { value: "ISSUES_ELECTIONS_POLITICS", label: "Politika / izbori" },
  { value: "ONLINE_GAMBLING_AND_GAMING", label: "Kockanje / igre" },
  { value: "FINANCIAL_PRODUCTS_SERVICES", label: "Finansijski proizvodi" },
] as const;

const CTA_TYPES = [
  { value: "LEARN_MORE", label: "Saznaj više" },
  { value: "SHOP_NOW", label: "Kupi odmah" },
  { value: "SIGN_UP", label: "Prijavi se" },
  { value: "SUBSCRIBE", label: "Pretplati se" },
  { value: "DOWNLOAD", label: "Preuzmi" },
  { value: "GET_OFFER", label: "Iskoristi ponudu" },
  { value: "CONTACT_US", label: "Kontaktiraj nas" },
  { value: "SEND_MESSAGE", label: "Pošalji poruku" },
  { value: "APPLY_NOW", label: "Prijavi se sada" },
  { value: "GET_QUOTE", label: "Zatraži ponudu" },
  { value: "ORDER_NOW", label: "Poruči odmah" },
  { value: "BOOK_TRAVEL", label: "Rezerviši" },
  { value: "WATCH_MORE", label: "Gledaj još" },
  { value: "NO_BUTTON", label: "Bez dugmeta" },
] as const;

const CUSTOM_EVENTS = [
  { value: "PURCHASE", label: "Kupovina" },
  { value: "LEAD", label: "Lid" },
  { value: "COMPLETE_REGISTRATION", label: "Registracija" },
  { value: "ADD_TO_CART", label: "Dodavanje u korpu" },
  { value: "INITIATE_CHECKOUT", label: "Započeta kupovina" },
  { value: "ADD_PAYMENT_INFO", label: "Podaci o plaćanju" },
  { value: "VIEW_CONTENT", label: "Pregled sadržaja" },
  { value: "SEARCH", label: "Pretraga" },
  { value: "CONTACT", label: "Kontakt" },
  { value: "SUBSCRIBE", label: "Pretplata" },
  { value: "START_TRIAL", label: "Probni period" },
  { value: "SUBMIT_APPLICATION", label: "Prijava" },
  { value: "DONATE", label: "Donacija" },
  { value: "SCHEDULE", label: "Zakazivanje" },
] as const;

const STEPS = [
  { n: 1, label: "Cilj i budžet", icon: Target },
  { n: 2, label: "Publika i plasman", icon: Users },
  { n: 3, label: "Kreativ i pregled", icon: ImageIcon },
] as const;

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

// ── Sitni gradivni elementi ─────────────────────────────────────────────────

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-text-muted">
        {label}
      </Label>
      {children}
      {hint && <p className="text-micro leading-relaxed text-text-muted">{hint}</p>}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "border border-accent-400/30 bg-accent-400/10 text-accent-400"
          : "border border-line bg-surface-raised text-text-muted hover:bg-surface-subtle hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function SectionCard({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-card p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {desc && <p className="mt-0.5 text-xs leading-relaxed text-text-muted">{desc}</p>}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((s, i) => {
        const done = current > s.n;
        const active = current === s.n;
        const Icon = s.icon;
        return (
          <li key={s.n} className="flex flex-1 items-center gap-2">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                  done && "border-accent-400/40 bg-accent-400/15 text-accent-400",
                  active && "border-accent-400 bg-accent-400 text-primary-foreground",
                  !done && !active && "border-line bg-surface-raised text-text-muted",
                )}
              >
                {done ? <Check className="size-4" /> : <Icon className="size-4" />}
              </span>
              <div className="hidden flex-col sm:flex">
                <span className="text-micro uppercase tracking-wide text-text-muted">
                  Korak {s.n}
                </span>
                <span
                  className={cn(
                    "text-xs font-medium",
                    active ? "text-foreground" : "text-text-muted",
                  )}
                >
                  {s.label}
                </span>
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <span
                className={cn(
                  "h-px flex-1",
                  current > s.n ? "bg-accent-400/40" : "bg-line",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ── Glavni čarobnjak ─────────────────────────────────────────────────────────

type PlanResult = FunctionReturnType<typeof api.adActions.validateCampaignPlan>;
type CreateResult = FunctionReturnType<typeof api.adActions.createCampaignFull>;
type PixelsResult = FunctionReturnType<typeof api.metaAds.listAdPixelsAction>;

export function NewCampaignWizard() {
  const accounts = useQuery(api.metaAdsStore.listAccounts, {});
  const context = useQuery(api.metaAdsStore.getCreationContext, {});
  const pagePosts = useQuery(api.metaAdsStore.listPagePostsForCreative, { limit: 30 });

  const validatePlan = useAction(api.adActions.validateCampaignPlan);
  const createFull = useAction(api.adActions.createCampaignFull);
  const listPixels = useAction(api.metaAds.listAdPixelsAction);

  // Zahtev-nonce: jednom po pokušaju, sprečava dva klika → dve kampanje.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Nalog
  const metaAccounts = useMemo(
    () => (accounts ?? []).filter((a) => a.provider === "meta_ads"),
    [accounts],
  );
  const [accountExternalId, setAccountExternalId] = useState<string>("");
  const account = useMemo(
    () => metaAccounts.find((a) => a.externalId === accountExternalId) ?? metaAccounts[0],
    [metaAccounts, accountExternalId],
  );
  const currency = account?.currency || "";
  const resolvedAccountId = account?.externalId ?? "";

  // Korak 1
  const [campaignName, setCampaignName] = useState("");
  const [objective, setObjective] = useState<string>("OUTCOME_TRAFFIC");
  const [dailyBudget, setDailyBudget] = useState("20");
  const [specialCats, setSpecialCats] = useState<string[]>([]);

  // Korak 2
  const [countries, setCountries] = useState("RS");
  const [ageMin, setAgeMin] = useState("18");
  const [ageMax, setAgeMax] = useState("65");
  const [gender, setGender] = useState<"all" | "male" | "female">("all");
  const [billingEvent, setBillingEvent] = useState<string>("IMPRESSIONS");
  const [optimizationGoal, setOptimizationGoal] = useState<string>("LINK_CLICKS");
  const [pixelId, setPixelId] = useState("");
  const [customEventType, setCustomEventType] = useState("PURCHASE");
  const [pixels, setPixels] = useState<PixelsResult["pixels"]>([]);
  const [pixelsLoading, setPixelsLoading] = useState(false);
  const [pixelsError, setPixelsError] = useState<string | null>(null);
  const [targetingOpen, setTargetingOpen] = useState(false);

  // Korak 3
  const [creativeKind, setCreativeKind] = useState<"existing_post" | "link">(
    "existing_post",
  );
  const [objectStoryId, setObjectStoryId] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [primaryText, setPrimaryText] = useState("");
  const [headline, setHeadline] = useState("");
  const [pictureUrl, setPictureUrl] = useState("");
  const [ctaType, setCtaType] = useState("LEARN_MORE");

  // Rezime + slanje
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResult | null>(null);

  const isConversionPixel = REQUIRES_PIXEL.includes(optimizationGoal);
  const isConversionPage = REQUIRES_PAGE.includes(optimizationGoal);
  const allowedGoals = BILLING_OPT_COMPAT[billingEvent] ?? [];
  const hasFbPage = Boolean(context?.fbPageId);
  const hasPosts = (pagePosts ?? []).length > 0;

  const budgetNum = parseFloat(dailyBudget);

  // ── Sastavljanje payload-a ────────────────────────────────────────────────
  const buildPayload = () => {
    const geo: Record<string, unknown> = {};
    const countryList = countries
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    if (countryList.length > 0) geo.countries = countryList;

    const targeting: Record<string, unknown> = {
      geo_locations: geo,
      age_min: parseInt(ageMin, 10) || 18,
      age_max: parseInt(ageMax, 10) || 65,
    };
    if (gender === "male") targeting.genders = [1];
    if (gender === "female") targeting.genders = [2];

    let promotedObject:
      | { pixelId?: string; customEventType?: string; pageId?: string }
      | undefined;
    if (isConversionPixel) {
      promotedObject = { pixelId: pixelId || undefined, customEventType };
    } else if (isConversionPage) {
      promotedObject = { pageId: context?.fbPageId ?? undefined };
    }

    const creative =
      creativeKind === "existing_post"
        ? { kind: "existing_post" as const, objectStoryId }
        : {
            kind: "link" as const,
            pageId: context?.fbPageId ?? "",
            instagramActorId: context?.igActorId ?? undefined,
            link: linkUrl,
            message: primaryText,
            name: headline || undefined,
            picture: pictureUrl || undefined,
            callToActionType: ctaType,
          };

    return {
      accountExternalId: resolvedAccountId,
      campaign: {
        name: campaignName.trim(),
        objective,
        specialAdCategories: specialCats,
      },
      adSet: {
        name: `${campaignName.trim()} — Ad set`,
        dailyBudget: Number.isFinite(budgetNum) ? budgetNum : 0,
        billingEvent,
        optimizationGoal,
        targeting,
        promotedObject,
      },
      ad: {
        name: `${campaignName.trim()} — Oglas`,
        creative,
      },
    };
  };

  // ── Radnje ────────────────────────────────────────────────────────────────
  const loadPixels = async () => {
    if (!resolvedAccountId) return;
    setPixelsLoading(true);
    setPixelsError(null);
    try {
      const res = await listPixels({ accountExternalId: resolvedAccountId });
      if (res.success) {
        setPixels(res.pixels);
        if (res.pixels.length > 0 && !pixelId) setPixelId(res.pixels[0].id);
      } else {
        setPixelsError(res.error ?? "Učitavanje piksela nije uspelo.");
      }
    } catch (e) {
      setPixelsError(e instanceof Error ? e.message : "Greška pri učitavanju piksela.");
    } finally {
      setPixelsLoading(false);
    }
  };

  const handleGoalChange = (goal: string) => {
    setOptimizationGoal(goal);
    if (REQUIRES_PIXEL.includes(goal) && pixels.length === 0) {
      void loadPixels();
    }
  };

  const runValidate = async () => {
    setValidating(true);
    setError(null);
    setPlan(null);
    try {
      const res = await validatePlan(buildPayload());
      setPlan(res);
    } catch (err: unknown) {
      setError(extractErr(err));
    } finally {
      setValidating(false);
    }
  };

  const goToStep3 = () => {
    setStep(3);
    void runValidate();
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await createFull({ requestId, ...buildPayload() });
      setResult(res);
    } catch (err: unknown) {
      setError(extractErr(err));
    } finally {
      setSubmitting(false);
    }
  };

  const resetWizard = () => {
    setResult(null);
    setPlan(null);
    setError(null);
    setStep(1);
    setRequestId(crypto.randomUUID());
  };

  // ── Validacija po koraku (za dugme „Dalje") ───────────────────────────────
  const step1Valid =
    campaignName.trim().length > 0 &&
    Number.isFinite(budgetNum) &&
    budgetNum > 0 &&
    Boolean(resolvedAccountId);
  const step2Valid =
    countries.trim().length > 0 &&
    allowedGoals.includes(optimizationGoal) &&
    (!isConversionPixel || (pixelId.trim().length > 0 && customEventType.length > 0)) &&
    (!isConversionPage || hasFbPage);
  const step3Valid =
    creativeKind === "existing_post"
      ? objectStoryId.trim().length > 0
      : hasFbPage &&
        linkUrl.trim().length > 0 &&
        /^https?:\/\//i.test(linkUrl.trim()) &&
        primaryText.trim().length > 0;

  // ── Prazna stanja ─────────────────────────────────────────────────────────
  if (accounts === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-11 w-full animate-pulse rounded-lg bg-surface-raised" />
        <div className="h-64 w-full animate-pulse rounded-xl bg-surface-raised" />
      </div>
    );
  }
  if (metaAccounts.length === 0) {
    return (
      <FeedbackNote
        tone="warning"
        title="Nijedan Meta Ads nalog nije povezan"
        action={
          <Link href="/settings">
            <Button size="sm" variant="outline">
              Podešavanja
            </Button>
          </Link>
        }
      >
        Poveži Meta Ads nalog i pokreni sinhronizaciju, pa se vrati na kreiranje kampanje.
      </FeedbackNote>
    );
  }

  // ── Rezultat (uspeh / delimično) ──────────────────────────────────────────
  if (result) {
    return <ResultPanel result={result} onReset={resetWizard} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <Stepper current={step} />

      <Reveal key={step}>
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <SectionCard
              title="Nalog i cilj"
              desc="Kampanja se pravi u izabranom nalogu; cilj određuje kako Meta isporučuje oglas."
            >
              <Field label="Meta Ads nalog" htmlFor="acc">
                <select
                  id="acc"
                  className={SELECT_CLASS}
                  value={resolvedAccountId}
                  onChange={(e) => setAccountExternalId(e.target.value)}
                >
                  {metaAccounts.map((a) => (
                    <option key={a._id} value={a.externalId}>
                      {a.name} ({a.currency || "?"})
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Naziv kampanje" htmlFor="cname">
                <Input
                  id="cname"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="npr. Leto 2026 — Saobraćaj"
                />
              </Field>

              <Field label="Cilj kampanje">
                <div className="flex flex-wrap gap-2">
                  {OBJECTIVES.map((o) => (
                    <Chip
                      key={o.value}
                      active={objective === o.value}
                      onClick={() => setObjective(o.value)}
                    >
                      {o.label}
                    </Chip>
                  ))}
                </div>
              </Field>
            </SectionCard>

            <SectionCard
              title="Budžet"
              desc="Dnevni budžet ide na ad set. Gornju granicu čuva META_ADS_MAX_DAILY_BUDGET i proverava se pri kreiranju."
            >
              <Field label={`Dnevni budžet${currency ? ` (${currency})` : ""}`} htmlFor="budget">
                <div className="relative max-w-[220px]">
                  {currency && (
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-text-muted">
                      {currency}
                    </span>
                  )}
                  <Input
                    id="budget"
                    type="number"
                    min="1"
                    step="0.01"
                    value={dailyBudget}
                    onChange={(e) => setDailyBudget(e.target.value)}
                    className={cn("font-mono", currency ? "pl-12" : "pl-3")}
                  />
                </div>
              </Field>

              <Field
                label="Posebne kategorije oglasa (special_ad_categories)"
                hint="Obavezno za stanovanje, zapošljavanje, kredite i politiku. Ako se ne odnosi ni na jednu, ostavi prazno."
              >
                <div className="flex flex-wrap gap-2">
                  {SPECIAL_CATEGORIES.map((c) => (
                    <Chip
                      key={c.value}
                      active={specialCats.includes(c.value)}
                      onClick={() =>
                        setSpecialCats((prev) =>
                          prev.includes(c.value)
                            ? prev.filter((x) => x !== c.value)
                            : [...prev, c.value],
                        )
                      }
                    >
                      {c.label}
                    </Chip>
                  ))}
                </div>
              </Field>
            </SectionCard>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-5">
            <SectionCard
              title="Publika"
              desc="Ad set mora imati bar geografske lokacije. Interesovanja možeš da istražiš i dodaš kasnije iz kataloga."
            >
              <Field label="Države (ISO kodovi, npr. RS, ME, BA)" htmlFor="countries">
                <Input
                  id="countries"
                  value={countries}
                  onChange={(e) => setCountries(e.target.value)}
                  placeholder="RS"
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Uzrast od" htmlFor="agemin">
                  <Input
                    id="agemin"
                    type="number"
                    min="13"
                    max="65"
                    value={ageMin}
                    onChange={(e) => setAgeMin(e.target.value)}
                    className="font-mono"
                  />
                </Field>
                <Field label="Uzrast do" htmlFor="agemax">
                  <Input
                    id="agemax"
                    type="number"
                    min="13"
                    max="65"
                    value={ageMax}
                    onChange={(e) => setAgeMax(e.target.value)}
                    className="font-mono"
                  />
                </Field>
              </div>

              <Field label="Pol">
                <div className="flex flex-wrap gap-2">
                  <Chip active={gender === "all"} onClick={() => setGender("all")}>
                    Svi
                  </Chip>
                  <Chip active={gender === "male"} onClick={() => setGender("male")}>
                    Muški
                  </Chip>
                  <Chip active={gender === "female"} onClick={() => setGender("female")}>
                    Ženski
                  </Chip>
                </div>
              </Field>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => setTargetingOpen(true)}
              >
                <Search className="mr-1.5 size-3.5" />
                Istraži interesovanja i lokacije
              </Button>
            </SectionCard>

            <SectionCard
              title="Plasman i optimizacija"
              desc="Naplata i optimizacija moraju biti kompatibilne. Konverzioni ciljevi traže piksel ili stranicu."
            >
              <Field label="Događaj naplate (billing_event)">
                <div className="flex flex-wrap gap-2">
                  {BILLING_EVENTS.map((b) => (
                    <Chip
                      key={b.value}
                      active={billingEvent === b.value}
                      onClick={() => {
                        setBillingEvent(b.value);
                        const allowed = BILLING_OPT_COMPAT[b.value] ?? [];
                        if (!allowed.includes(optimizationGoal)) {
                          handleGoalChange(allowed[0]);
                        }
                      }}
                    >
                      {b.label}
                    </Chip>
                  ))}
                </div>
              </Field>

              <Field label="Cilj optimizacije (optimization_goal)" htmlFor="optgoal">
                <select
                  id="optgoal"
                  className={SELECT_CLASS}
                  value={optimizationGoal}
                  onChange={(e) => handleGoalChange(e.target.value)}
                >
                  {allowedGoals.map((g) => (
                    <option key={g} value={g}>
                      {OPT_GOAL_LABELS[g] ?? g}
                    </option>
                  ))}
                </select>
              </Field>

              {isConversionPixel && (
                <div className="flex flex-col gap-4 rounded-lg border border-line-soft bg-surface-raised/40 p-4">
                  <div className="flex items-center gap-1.5 text-xs text-text-muted">
                    <Info className="size-3.5 text-accent-400" />
                    Konverziona optimizacija: izaberi piksel i događaj (promoted_object).
                  </div>
                  <Field label="Piksel" htmlFor="pixel">
                    <div className="flex items-center gap-2">
                      <select
                        id="pixel"
                        className={SELECT_CLASS}
                        value={pixelId}
                        onChange={(e) => setPixelId(e.target.value)}
                        disabled={pixelsLoading}
                      >
                        <option value="">— izaberi piksel —</option>
                        {pixels.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={loadPixels}
                        disabled={pixelsLoading}
                      >
                        {pixelsLoading ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          "Učitaj"
                        )}
                      </Button>
                    </div>
                  </Field>
                  {pixelsError && (
                    <FeedbackNote tone="danger" title="Pikseli">
                      {pixelsError}
                    </FeedbackNote>
                  )}
                  <Field label="Događaj konverzije (custom_event_type)" htmlFor="cevent">
                    <select
                      id="cevent"
                      className={SELECT_CLASS}
                      value={customEventType}
                      onChange={(e) => setCustomEventType(e.target.value)}
                    >
                      {CUSTOM_EVENTS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}

              {isConversionPage && (
                <FeedbackNote
                  tone={hasFbPage ? "progress" : "danger"}
                  title={
                    hasFbPage
                      ? "Instant lidovi koriste povezanu Facebook stranicu"
                      : "Nedostaje Facebook stranica"
                  }
                >
                  {hasFbPage
                    ? `Stranica „${context?.fbPageName ?? context?.fbPageId}" ide u promoted_object.`
                    : "Za instant lidove poveži Facebook stranicu (meta_fb) u Podešavanjima."}
                </FeedbackNote>
              )}
            </SectionCard>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-5">
            <SectionCard
              title="Kreativ"
              desc="Promoviši postojeću objavu ili sastavi novi link-oglas."
            >
              <div className="flex flex-wrap gap-2">
                <Chip
                  active={creativeKind === "existing_post"}
                  onClick={() => setCreativeKind("existing_post")}
                  disabled={!hasPosts}
                >
                  Postojeća objava
                </Chip>
                <Chip
                  active={creativeKind === "link"}
                  onClick={() => setCreativeKind("link")}
                  disabled={!hasFbPage}
                >
                  Novi link-oglas
                </Chip>
              </div>

              {creativeKind === "existing_post" &&
                (hasPosts ? (
                  <Field label="Objava za promociju" htmlFor="post">
                    <select
                      id="post"
                      className={SELECT_CLASS}
                      value={objectStoryId}
                      onChange={(e) => setObjectStoryId(e.target.value)}
                    >
                      <option value="">— izaberi objavu —</option>
                      {(pagePosts ?? []).map((p) => (
                        <option key={p.objectStoryId} value={p.objectStoryId}>
                          {(p.message || p.statusType || p.objectStoryId).slice(0, 80)}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <FeedbackNote tone="warning" title="Nema sinhronizovanih objava stranice">
                    Sinhronizuj Facebook stranicu ili sastavi novi link-oglas.
                  </FeedbackNote>
                ))}

              {creativeKind === "link" &&
                (hasFbPage ? (
                  <div className="flex flex-col gap-4">
                    <Field label="Odredišni link" htmlFor="link">
                      <Input
                        id="link"
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        placeholder="https://digital.enigmait.rs/..."
                      />
                    </Field>
                    <Field label="Primarni tekst" htmlFor="ptext">
                      <Textarea
                        id="ptext"
                        value={primaryText}
                        onChange={(e) => setPrimaryText(e.target.value)}
                        placeholder="Poruka koja se prikazuje iznad oglasa"
                        rows={3}
                      />
                    </Field>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field label="Naslov (opciono)" htmlFor="headline">
                        <Input
                          id="headline"
                          value={headline}
                          onChange={(e) => setHeadline(e.target.value)}
                        />
                      </Field>
                      <Field label="Dugme (CTA)" htmlFor="cta">
                        <select
                          id="cta"
                          className={SELECT_CLASS}
                          value={ctaType}
                          onChange={(e) => setCtaType(e.target.value)}
                        >
                          {CTA_TYPES.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <Field
                      label="URL slike (opciono)"
                      htmlFor="picture"
                      hint="Javno dostupna slika; Meta je preuzima. Bez upload-a."
                    >
                      <Input
                        id="picture"
                        value={pictureUrl}
                        onChange={(e) => setPictureUrl(e.target.value)}
                        placeholder="https://.../slika.jpg"
                      />
                    </Field>
                  </div>
                ) : (
                  <FeedbackNote tone="danger" title="Nedostaje Facebook stranica">
                    Za link-oglas poveži Facebook stranicu (meta_fb) u Podešavanjima.
                  </FeedbackNote>
                ))}
            </SectionCard>

            <SummaryPanel
              accountName={account?.name}
              currency={currency}
              objective={OBJECTIVES.find((o) => o.value === objective)?.label ?? objective}
              campaignName={campaignName.trim()}
              dailyBudget={dailyBudget}
              countries={countries}
              optimizationGoal={OPT_GOAL_LABELS[optimizationGoal] ?? optimizationGoal}
              creativeLabel={
                creativeKind === "existing_post"
                  ? "Postojeća objava"
                  : "Novi link-oglas"
              }
              plan={plan}
              validating={validating}
              onRevalidate={runValidate}
            />
          </div>
        )}
      </Reveal>

      {error && (
        <FeedbackNote tone="danger" title="Greška">
          {error}
        </FeedbackNote>
      )}

      {/* Navigacija */}
      <div className="flex items-center justify-between border-t border-line pt-4">
        {step > 1 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
            disabled={submitting}
          >
            <ArrowLeft className="mr-1.5 size-3.5" />
            Nazad
          </Button>
        ) : (
          <Link href="/ads">
            <Button type="button" variant="ghost" size="sm">
              <ArrowLeft className="mr-1.5 size-3.5" />
              Otkaži
            </Button>
          </Link>
        )}

        {step === 1 && (
          <Button size="sm" onClick={() => setStep(2)} disabled={!step1Valid}>
            Dalje
            <ArrowRight className="ml-1.5 size-3.5" />
          </Button>
        )}
        {step === 2 && (
          <Button size="sm" onClick={goToStep3} disabled={!step2Valid}>
            Dalje
            <ArrowRight className="ml-1.5 size-3.5" />
          </Button>
        )}
        {step === 3 && (
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || validating || !step3Valid || plan?.ok !== true}
            className="bg-primary text-primary-foreground hover:bg-primary/80"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                Kreiram na Meta API...
              </>
            ) : (
              <>
                <Pause className="mr-1.5 size-3.5" />
                Kreiraj kao pauzirano
              </>
            )}
          </Button>
        )}
      </div>

      <TargetingSearchDialog open={targetingOpen} onOpenChange={setTargetingOpen} />
    </div>
  );
}

// ── Rezime + ishod validate_only ─────────────────────────────────────────────

function CheckRow({
  ok,
  label,
  error,
  pending,
}: {
  ok: boolean;
  label: string;
  error?: string;
  pending?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
          pending
            ? "bg-text-muted/20 text-text-muted"
            : ok
              ? "bg-success/15 text-success"
              : "bg-danger/15 text-danger",
        )}
      >
        {pending ? "·" : ok ? <Check className="size-3" /> : <X className="size-3" />}
      </span>
      <div className="min-w-0">
        <span className="text-foreground">{label}</span>
        {error && <p className="text-danger">{error}</p>}
      </div>
    </div>
  );
}

function SummaryPanel({
  accountName,
  currency,
  objective,
  campaignName,
  dailyBudget,
  countries,
  optimizationGoal,
  creativeLabel,
  plan,
  validating,
  onRevalidate,
}: {
  accountName?: string;
  currency: string;
  objective: string;
  campaignName: string;
  dailyBudget: string;
  countries: string;
  optimizationGoal: string;
  creativeLabel: string;
  plan: PlanResult | null;
  validating: boolean;
  onRevalidate: () => void;
}) {
  const rows: Array<[string, string]> = [
    ["Nalog", accountName ?? "—"],
    ["Kampanja", campaignName || "—"],
    ["Cilj", objective],
    ["Dnevni budžet", `${dailyBudget} ${currency}`.trim()],
    ["Publika", countries.toUpperCase()],
    ["Optimizacija", optimizationGoal],
    ["Kreativ", creativeLabel],
  ];

  return (
    <div className="rounded-xl border border-accent-400/20 bg-accent-400/[0.04] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldCheck className="size-4 text-accent-400" />
          Rezime pre slanja
        </h2>
        <Button type="button" variant="outline" size="sm" onClick={onRevalidate} disabled={validating}>
          {validating ? <Loader2 className="size-3.5 animate-spin" /> : "Proveri ponovo"}
        </Button>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map(([k, val]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 border-b border-line-soft py-1.5">
            <dt className="text-xs text-text-muted">{k}</dt>
            <dd className="truncate text-right text-xs font-medium text-foreground" title={val}>
              {val}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex flex-col gap-2 rounded-lg border border-line bg-surface p-3.5">
        <div className="mb-0.5 text-xs font-medium text-text-muted">
          Provera (validate_only)
        </div>
        {validating && !plan ? (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Loader2 className="size-3.5 animate-spin text-accent-400" />
            Proveravam kod Mete...
          </div>
        ) : plan ? (
          <>
            <CheckRow
              ok={plan.campaign.codeOk && plan.campaign.metaValidateOk !== false}
              label="Kampanja — Meta validate_only"
              error={plan.campaign.error}
            />
            <CheckRow ok={plan.adSet.codeOk} label="Ad set — provera koda" error={plan.adSet.error} />
            <CheckRow ok={plan.ad.codeOk} label="Oglas — provera koda" error={plan.ad.error} />
            <CheckRow
              ok={plan.gate.ok}
              label="Budžet i valuta"
              error={plan.gate.ok ? undefined : plan.gate.message}
            />
            <p className="mt-1 text-micro leading-relaxed text-text-muted">
              Ad set i oglas Meta dodatno proverava pri samom kreiranju (validate_only im traži
              pravi roditeljski ID). Sve se kreira pauzirano.
            </p>
          </>
        ) : (
          <div className="text-xs text-text-muted">Pokreni proveru da vidiš ishod.</div>
        )}
      </div>
    </div>
  );
}

// ── Rezultat kreiranja ───────────────────────────────────────────────────────

function ResultPanel({
  result,
  onReset,
}: {
  result: CreateResult;
  onReset: () => void;
}) {
  const partial = result.status === "partial";
  return (
    <div className="flex flex-col gap-5">
      <FeedbackNote
        tone={partial ? "warning" : "success"}
        title={
          partial
            ? "Kampanja je delimično kreirana — sve je pauzirano"
            : "Kampanja je kreirana — sve je pauzirano"
        }
      >
        {partial
          ? "Deo objekata je napravljen, a jedan korak nije prošao. Ništa ne troši budžet jer je sve pauzirano. Ispod je šta postoji; možeš da dovršiš ili obrišeš u Ads Manageru, ili da pokušaš ponovo."
          : "Kampanja, ad set i oglas su napravljeni sa statusom PAUSED. Pokreni ih kada budeš spreman/na iz pregleda kampanja."}
      </FeedbackNote>

      <div className="rounded-xl border border-line bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Pause className="size-4 text-warning" />
          Napravljeno (PAUZIRANO)
        </h2>
        <ul className="flex flex-col gap-2 text-xs">
          <CreatedRow
            label="Kampanja"
            name={result.campaign?.name}
            id={result.campaign?.externalId ?? result.created?.campaignId}
          />
          <CreatedRow
            label="Ad set"
            name={result.adSet?.name}
            id={result.adSet?.externalId ?? result.created?.adSetId}
          />
          <CreatedRow label="Oglas" name={result.ad?.name} id={result.ad?.externalId} />
        </ul>
        {partial && result.message && (
          <p className="mt-3 border-t border-line-soft pt-3 text-xs text-danger">
            Prekid na koraku „{result.failedAt}”: {result.message}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Link href="/ads">
          <Button size="sm">
            <PlugZap className="mr-1.5 size-3.5" />
            Idi na kampanje
          </Button>
        </Link>
        <Button size="sm" variant="outline" onClick={onReset}>
          Nova kampanja
        </Button>
      </div>
    </div>
  );
}

function CreatedRow({
  label,
  name,
  id,
}: {
  label: string;
  name?: string;
  id?: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-line-soft bg-surface-raised/40 px-3 py-2">
      <div className="min-w-0">
        <span className="text-text-muted">{label}: </span>
        <span className="text-foreground">{name ?? (id ? "—" : "nije napravljeno")}</span>
      </div>
      {id && <span className="shrink-0 font-mono text-micro text-text-muted">{id}</span>}
    </li>
  );
}

// ── Pomoćne ──────────────────────────────────────────────────────────────────

function extractErr(err: unknown): string {
  if (err instanceof ConvexError) {
    const data = err.data as { message?: string } | undefined;
    return data?.message || err.message;
  }
  if (err instanceof Error) return err.message;
  return "Došlo je do neočekivane greške.";
}
