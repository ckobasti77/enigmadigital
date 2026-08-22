"use client";

import { useEffect, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FeedbackNote } from "@/components/app/feedback";
import {
  RefreshCw,
  Clock,
  ExternalLink,
  Smartphone,
  Monitor,
  Camera,
  Layers,
  Sparkles,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/format";

const AD_FORMAT_OPTIONS = [
  { value: "DESKTOP_FEED_STANDARD", label: "Desktop Feed", icon: Monitor },
  { value: "MOBILE_FEED_STANDARD", label: "Mobile Feed", icon: Smartphone },
  { value: "INSTAGRAM_STANDARD", label: "Instagram Feed", icon: Camera },
  { value: "INSTAGRAM_STORY", label: "Instagram Story", icon: Layers },
];

interface AdPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adId: Id<"ads">;
  adName: string;
}

export function AdPreviewDialog({
  open,
  onOpenChange,
  adId,
  adName,
}: AdPreviewDialogProps) {
  const [format, setFormat] = useState("DESKTOP_FEED_STANDARD");
  const [loading, setLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<{
    previewHtml?: string;
    previewFetchedAt?: number;
    isStale?: boolean;
    warning?: string;
    error?: string;
  } | null>(null);

  const getPreview = useAction(api.metaAds.getAdPreviewAction);
  const creative = useQuery(api.metaAdsStore.getAdCreative, { adId });

  const handleManualRefresh = async () => {
    setLoading(true);
    try {
      const res = await getPreview({
        adId,
        adFormat: format,
      });

      if (res.success) {
        setPreviewResult({
          previewHtml: res.previewHtml,
          previewFetchedAt: res.previewFetchedAt,
          isStale: res.isStale,
          warning: res.warning,
        });
      } else {
        setPreviewResult({
          error: res.error || "Nije moguće učitati pregled oglasa sa Meta API-ja.",
        });
      }
    } catch (err: unknown) {
      setPreviewResult({
        error: err instanceof Error ? err.message : "Greška pri učitavanju pregleda.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    if (!open) {
      return;
    }

    Promise.resolve().then(async () => {
      if (!active) return;
      setLoading(true);
      try {
        const res = await getPreview({ adId, adFormat: format });
        if (!active) return;
        if (res.success) {
          setPreviewResult({
            previewHtml: res.previewHtml,
            previewFetchedAt: res.previewFetchedAt,
            isStale: res.isStale,
            warning: res.warning,
          });
        } else {
          setPreviewResult({
            error: res.error || "Nije moguće učitati pregled oglasa sa Meta API-ja.",
          });
        }
      } catch (err: unknown) {
        if (!active) return;
        setPreviewResult({
          error:
            err instanceof Error ? err.message : "Greška pri učitavanju pregleda.",
        });
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [open, adId, format, getPreview]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden p-6 gap-4 bg-surface border-line">
        <DialogHeader className="flex flex-row items-center justify-between gap-4 pb-2 border-b border-line">
          <div className="flex flex-col gap-1 min-w-0">
            <DialogTitle className="text-base font-bold text-foreground truncate" title={adName}>
              Pregled oglasa: {adName}
            </DialogTitle>
            <DialogDescription className="text-xs text-text-muted flex items-center gap-2">
              <span>Interaktivni Meta oglasni pregled</span>
              {previewResult?.previewFetchedAt && (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-text-muted/80">
                  <Clock className="size-3" />
                  {formatRelativeTime(previewResult.previewFetchedAt)}
                </span>
              )}
            </DialogDescription>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleManualRefresh}
              disabled={loading}
              className="text-xs"
            >
              <RefreshCw className={`mr-1.5 size-3.5 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Učitavanje..." : "Osveži"}
            </Button>
          </div>
        </DialogHeader>

        {/* Format Selector Tabs */}
        <div className="flex flex-wrap gap-2 pt-1">
          {AD_FORMAT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = format === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFormat(opt.value)}
                disabled={loading}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-accent-400/10 text-accent-400 border border-accent-400/30"
                    : "bg-surface-raised border border-line text-text-muted hover:text-foreground hover:bg-surface-subtle"
                }`}
              >
                <Icon className="size-3.5" />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* Stale Warning (C2) */}
        {previewResult?.isStale && previewResult.warning && (
          <FeedbackNote tone="warning" title="Prikazan je sačuvani pregled">
            <p className="text-xs mt-0.5">
              {previewResult.warning} Pregled je zabeležen{" "}
              {previewResult.previewFetchedAt
                ? formatRelativeTime(previewResult.previewFetchedAt)
                : "ranije"}
              .
            </p>
          </FeedbackNote>
        )}

        {/* Error State (C2: Never blank empty box) */}
        {!loading && previewResult?.error && (
          <FeedbackNote tone="danger" title="Neuspešno učitavanje pregleda">
            <p className="text-xs mt-0.5">{previewResult.error}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={handleManualRefresh}
              className="mt-3 text-xs"
            >
              <RefreshCw className="mr-1.5 size-3" />
              Pokušaj ponovo
            </Button>
          </FeedbackNote>
        )}

        {/* Loading Spinner */}
        {loading && (
          <div className="flex flex-col items-center justify-center h-[420px] rounded-lg border border-line bg-surface-subtle gap-3">
            <RefreshCw className="size-6 text-accent-400 animate-spin" />
            <span className="text-xs text-text-muted">Povlačenje iframe pregleda sa Meta servera...</span>
          </div>
        )}

        {/* Iframe Preview Container (C3) */}
        {!loading && previewResult?.previewHtml && (
          <div className="flex-1 overflow-auto rounded-lg border border-line bg-white shadow-inner flex items-center justify-center p-2 min-h-[420px]">
            {/*
              BEZBEDNOSNO PRAVILO (C3):
              Iframe sandbox NIKADA ne sme sadržati "allow-same-origin" niti "allow-top-navigation".
              Meta API ubacuje spoljni HTML u dokument aplikacije. Kako bi se sprečilo curenje
              kolačića/sesije ili preotimanje navigacije, dozvoljen je isključivo "allow-scripts".
            */}
            <iframe
              srcDoc={previewResult.previewHtml}
              sandbox="allow-scripts"
              className="w-full h-[520px] rounded border-0"
              title={`Meta Preview - ${adName}`}
            />
          </div>
        )}

        {/* Creative Text & Metadata Footer */}
        {creative && (
          <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-3 text-xs">
            <div className="flex items-center gap-1.5 text-text-muted font-medium">
              <Sparkles className="size-3.5 text-accent-400" />
              <span>Tekst i podaci kreativa:</span>
            </div>
            {creative.titleText && (
              <div>
                <span className="text-text-muted">Naslov: </span>
                <span className="font-semibold text-foreground">{creative.titleText}</span>
              </div>
            )}
            {creative.bodyText && (
              <div>
                <span className="text-text-muted">Primarni tekst: </span>
                <span className="text-foreground">{creative.bodyText}</span>
              </div>
            )}
            {creative.callToActionType && (
              <div>
                <span className="text-text-muted">Poziv na akciju (CTA): </span>
                <span className="font-mono text-foreground font-semibold">{creative.callToActionType}</span>
              </div>
            )}
            {creative.linkUrl && (
              <div className="flex items-center gap-1">
                <span className="text-text-muted">Odredišni link: </span>
                <a
                  href={creative.linkUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent-400 hover:underline inline-flex items-center gap-1 truncate max-w-md"
                >
                  {creative.linkUrl}
                  <ExternalLink className="size-3" />
                </a>
              </div>
            )}
          </div>
        )}
      </DialogPopup>
    </Dialog>
  );
}
