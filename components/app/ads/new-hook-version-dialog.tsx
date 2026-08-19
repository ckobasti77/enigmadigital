"use client";

import { useState, useMemo } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ConvexError } from "convex/values";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Info,
  Layers,
  Loader2,
  ShieldAlert,
  Sparkles,
  ExternalLink,
} from "lucide-react";

export interface NewHookVersionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceAdId: string; // externalId
  sourceAdName: string;
  sourceHookLabel?: string;
  sourcePrimaryText?: string;
  sourceHeadline?: string;
  thumbnailUrl?: string;
  onSuccess?: (result: {
    copiedAdId?: string;
    name: string;
    hookLabel: string;
  }) => void;
}

export function NewHookVersionDialog(props: NewHookVersionDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <NewHookVersionDialogLoader {...props} />}
    </Dialog>
  );
}

function NewHookVersionDialogLoader(props: NewHookVersionDialogProps) {
  const liveDetails = useQuery(api.adActionsStore.getAdCreativeDetails, {
    adExternalId: props.sourceAdId,
  });

  return (
    <NewHookVersionDialogForm
      key={props.sourceAdId + (liveDetails ? "-ready" : "-init")}
      liveDetails={liveDetails}
      {...props}
    />
  );
}

interface FormProps extends NewHookVersionDialogProps {
  liveDetails?: {
    name: string;
    hookLabel: string | null;
    primaryText: string | null;
    headline: string | null;
    adSetName: string;
    campaignName: string;
    existingAdCount: number;
  } | null;
}

function NewHookVersionDialogForm({
  onOpenChange,
  sourceAdId,
  sourceAdName,
  sourceHookLabel,
  sourcePrimaryText,
  sourceHeadline,
  liveDetails,
  onSuccess,
}: FormProps) {
  const effectiveAdName = liveDetails?.name || sourceAdName;
  const effectivePrimaryText =
    liveDetails?.primaryText ||
    sourcePrimaryText ||
    "Iskoristite priliku za rast vašeg poslovanja. Saznajte kako naša platforma automatizuje vaše procese.";
  const effectiveHeadline =
    liveDetails?.headline || sourceHeadline || effectiveAdName;
  const effectiveHookLabel = liveDetails?.hookLabel || sourceHookLabel || "";
  const existingCount = liveDetails?.existingAdCount ?? 1;

  // Maximum allowed hook copies (default 5, configurable via MAX_HOOK_COPIES)
  const maxCopies = 5;
  const isLimitReached = existingCount >= maxCopies;

  // Next suggested hook letter (e.g. Hook D if Hook C exists)
  const suggestedHookLabel = useMemo(() => {
    if (effectiveHookLabel) {
      return `${effectiveHookLabel} (Nova)`;
    }
    const letters = ["A", "B", "C", "D", "E", "F"];
    const nextLetter = letters[Math.min(existingCount, letters.length - 1)];
    return `Hook ${nextLetter}`;
  }, [effectiveHookLabel, existingCount]);

  // Form states initialized purely on mount
  const [hookLabel, setHookLabel] = useState<string>(suggestedHookLabel);
  const [adName, setAdName] = useState<string>(
    `${effectiveAdName} - ${suggestedHookLabel} (Kopija)`,
  );
  const [primaryText, setPrimaryText] = useState<string>(effectivePrimaryText);
  const [headline, setHeadline] = useState<string>(effectiveHeadline);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const createHookVersionAction = useAction(api.adActions.createHookVersion);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedHookLabel = hookLabel.trim();
    const trimmedAdName = adName.trim();
    const trimmedPrimaryText = primaryText.trim();
    const trimmedHeadline = headline.trim();

    if (!trimmedHookLabel) {
      setErrorMessage("Unesite oznaku hook-a (npr. Hook D — Socijalni dokaz).");
      return;
    }
    if (!trimmedAdName) {
      setErrorMessage("Unesite naziv novog oglasa.");
      return;
    }
    if (!trimmedPrimaryText) {
      setErrorMessage("Primarni tekst (hook tekst) ne sme biti prazan.");
      return;
    }

    if (isLimitReached) {
      setErrorMessage(
        `Dostignut je maksimalan broj kopija po Ad Setu (${maxCopies}). Nije moguće kreirati dodatne verzije.`,
      );
      return;
    }

    setLoading(true);

    try {
      const result = await createHookVersionAction({
        sourceAdId,
        newName: trimmedAdName,
        hookLabel: trimmedHookLabel,
        primaryText: trimmedPrimaryText,
        headline: trimmedHeadline.length > 0 ? trimmedHeadline : undefined,
      });

      if (result.success) {
        onSuccess?.({
          copiedAdId: result.copiedAdId,
          name: result.name,
          hookLabel: result.hookLabel,
        });
        onOpenChange(false);
      }
    } catch (err: unknown) {
      console.error("Greška pri kreiranju nove hook verzije:", err);
      let userMsg = "Došlo je do greške pri kreiranju nove verzije oglasa.";

      if (err instanceof ConvexError) {
        const data = err.data as { code?: string; message?: string };
        userMsg = data.message || err.message;
      } else if (err instanceof Error) {
        userMsg = err.message;
      }

      setErrorMessage(userMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DialogPopup className="sm:max-w-2xl bg-surface-raised border border-line p-0 overflow-hidden shadow-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col">
        {/* Modal Header */}
        <div className="p-6 border-b border-line bg-card/60">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-accent-400/10 text-accent-400 border border-accent-400/20">
                <Sparkles className="size-4" />
              </span>
              <div>
                <p className="heading-caps text-[0.625rem] font-semibold text-accent-400 tracking-wider">
                  Kreativna iteracija · Nova verzija
                </p>
                <DialogTitle className="text-lg font-bold text-foreground">
                  Kreiraj novu verziju hook-a
                </DialogTitle>
              </div>
            </div>
            <DialogDescription className="text-xs text-text-muted mt-2">
              Duplira oglas{" "}
              <strong className="text-foreground">{effectiveAdName}</strong> u
              istom Ad Setu ({liveDetails?.adSetName || "Ad Set"}) sa novim
              tekstom, u bezbednom stanju{" "}
              <span className="font-mono text-amber-400 font-semibold">
                PAUSED (čeka aktivaciju)
              </span>
              .
            </DialogDescription>
          </DialogHeader>

          {/* Ad Set Capacity & Safety Guardrail Meter */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line-soft bg-surface/80 px-3.5 py-2.5 text-xs">
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-text-muted" />
              <span className="text-text-muted">Kapacitet Ad Seta:</span>
              <span
                className={cn(
                  "font-mono font-semibold",
                  isLimitReached
                    ? "text-danger"
                    : existingCount >= maxCopies - 1
                      ? "text-warning"
                      : "text-foreground",
                )}
              >
                {existingCount} / {maxCopies} verzija
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-micro text-text-muted">
              <span className="size-1.5 rounded-full bg-success" />
              <span>ADS_WRITE_ENABLED & Audit aktivan</span>
            </div>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-6 space-y-5 max-h-[65vh] overflow-y-auto">
          {/* Documentation Banner: What can be edited via API vs Ads Manager */}
          <div className="rounded-lg border border-accent-400/20 bg-accent-400/[0.03] p-4 text-xs space-y-3">
            <div className="flex items-center gap-2 text-accent-400 font-semibold">
              <Info className="size-4 shrink-0" />
              <span>
                Mogućnosti izmene kreative (Marketing API vs Ads Manager)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-md border border-line-soft bg-surface/60 p-3 space-y-1.5">
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 text-success shrink-0" />
                  <span>Dozvoljeno menjati ovde (API):</span>
                </p>
                <ul className="list-disc list-inside space-y-1 text-micro text-text-muted pl-1">
                  <li>
                    <strong className="text-foreground/90">
                      Primarni tekst
                    </strong>{" "}
                    — promena hook uvoda ili kuke
                  </li>
                  <li>
                    <strong className="text-foreground/90">Naslov</strong> —
                    istaknuti tekst pored CTA dugmeta
                  </li>
                  <li>
                    <strong className="text-foreground/90">
                      Oznaka hook-a
                    </strong>{" "}
                    — za poređenje u Hook Battle
                  </li>
                  <li>
                    <strong className="text-foreground/90">
                      PAUSED status
                    </strong>{" "}
                    — oglas je bezbedno pauziran
                  </li>
                </ul>
              </div>

              <div className="rounded-md border border-line-soft bg-surface/60 p-3 space-y-1.5">
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <ExternalLink className="size-3.5 text-text-muted shrink-0" />
                  <span>Zahteva Meta Ads Manager:</span>
                </p>
                <ul className="list-disc list-inside space-y-1 text-micro text-text-muted pl-1">
                  <li>Zamena video ili slikovnog fajla (novi video render)</li>
                  <li>Promena poziva na akciju (CTA: Saznaj više, Kupite)</li>
                  <li>Odredišni URL link sajta i UTM parametri</li>
                  <li>Carousel i Advantage+ višestruki rasporedi</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Hook Label */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-text-muted font-medium">
                Oznaka verzije hook-a <span className="text-danger">*</span>
              </Label>
              <Input
                value={hookLabel}
                onChange={(e) => {
                  setHookLabel(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="npr. Hook D — Socijalni dokaz"
                disabled={loading || isLimitReached}
                className="h-9 text-xs"
              />
              <p className="text-[0.625rem] text-text-muted">
                Prikazuje se na vrhu kolone u Hook Battle pregledu.
              </p>
            </div>

            {/* Ad Name */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-text-muted font-medium">
                Naziv novog oglasa u Meti <span className="text-danger">*</span>
              </Label>
              <Input
                value={adName}
                onChange={(e) => {
                  setAdName(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="Naziv novog oglasa"
                disabled={loading || isLimitReached}
                className="h-9 text-xs font-mono"
              />
              <p className="text-[0.625rem] text-text-muted">
                Prepoznatljivo ime u Meta Ads Manageru.
              </p>
            </div>
          </div>

          {/* Primary Text (Hook Copy) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-text-muted font-medium">
                Primarni tekst (Hook / Body Copy){" "}
                <span className="text-danger">*</span>
              </Label>
              <span className="text-[0.625rem] font-mono text-text-muted">
                {primaryText.length} karaktera
              </span>
            </div>
            <Textarea
              value={primaryText}
              onChange={(e) => {
                setPrimaryText(e.target.value);
                setErrorMessage(null);
              }}
              placeholder="Unesite novi uvod, kuku ili prodajni tekst..."
              rows={4}
              disabled={loading || isLimitReached}
              className="text-xs leading-relaxed resize-y min-h-[96px]"
            />
            <p className="text-[0.625rem] text-text-muted">
              Tekst koji se prikazuje iznad videa/slike na Instagram i Facebook
              feed-u.
            </p>
          </div>

          {/* Headline (Naslov) */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-text-muted font-medium">
              Naslov oglasa (Headline)
            </Label>
            <Input
              value={headline}
              onChange={(e) => {
                setHeadline(e.target.value);
                setErrorMessage(null);
              }}
              placeholder="npr. Besplatna konsultacija za vaš tim"
              disabled={loading || isLimitReached}
              className="h-9 text-xs"
            />
            <p className="text-[0.625rem] text-text-muted">
              Kratak naslov pored dugmeta za poziv na akciju (CTA).
            </p>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* Limit Reached Banner */}
          {isLimitReached && (
            <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
              <ShieldAlert className="size-4 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">
                Dostignut je limit od {maxCopies} verzija oglasa po Ad Setu
                (MAX_HOOK_COPIES). Pauzirajte ili arhivirajte nepotrebne
                verzije pre dodavanja novih.
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-line bg-card/40 flex items-center justify-between gap-3">
          <DialogClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={loading}
                className="text-xs text-text-muted hover:text-foreground"
              >
                Otkaži
              </Button>
            }
          />

          <Button
            type="submit"
            size="sm"
            disabled={loading || isLimitReached}
            className="text-xs bg-accent-400 text-slate-950 hover:bg-accent-300 font-semibold gap-1.5 shadow-sm"
          >
            {loading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Kreira se kopija...</span>
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                <span>Kreiraj PAUSED verziju</span>
              </>
            )}
          </Button>
        </div>
      </form>
    </DialogPopup>
  );
}
