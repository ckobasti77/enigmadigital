"use client";

import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FeedbackNote } from "@/components/app/feedback";
import { AudiencesTable } from "./audiences-table";
import { CapiSection } from "./capi-section";
import { CreateCustomAudienceDialog } from "./create-custom-audience-dialog";
import { CreateLookalikeAudienceDialog } from "./create-lookalike-audience-dialog";
import { TargetingSearchDialog } from "./targeting-search-dialog";
import { formatRelativeTime } from "@/lib/format";
import {
  Users,
  Sparkles,
  Globe,
  Layers,
  RefreshCw,
  Loader2,
  ExternalLink,
  Search,
} from "lucide-react";

export function AudiencesView() {
  const audiencesData = useQuery(api.metaAdsStore.listAudiences, {});
  const tosData = useQuery(api.metaAdsStore.getAudienceTos, {});

  const syncAudiences = useAction(api.metaAds.syncAudiencesAction);
  const checkTos = useAction(api.metaAds.checkAudienceTosAction);

  const [syncing, setSyncing] = useState(false);
  const [checkingTos, setCheckingTos] = useState(false);
  const [openCustomDialog, setOpenCustomDialog] = useState(false);
  const [openLookalikeDialog, setOpenLookalikeDialog] = useState(false);
  const [openTargetingDialog, setOpenTargetingDialog] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "danger" | "warning";
    message: string;
  } | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setFeedback(null);
    try {
      const res = await syncAudiences({});
      setFeedback({
        tone: "success",
        message: `Sinhronizovano ${res.count} publika sa Meta Marketing API-ja.`,
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Došlo je do greške pri sinhronizaciji publika.";
      setFeedback({ tone: "danger", message: msg });
    } finally {
      setSyncing(false);
    }
  };

  const handleCheckTos = async () => {
    setCheckingTos(true);
    setFeedback(null);
    try {
      const res = await checkTos({});
      if (res.status === "accepted") {
        setFeedback({
          tone: "success",
          message:
            "Custom Audience Uslovi korišćenja (ToS) su uspešno prihvaćeni i verifikovani!",
        });
      } else if (res.status === "not_accepted") {
        setFeedback({
          tone: "warning",
          message:
            "Uslovi korišćenja još uvek nisu prihvaćeni u Meta Business Suite-u. Pratite uputstvo u baneru.",
        });
      } else {
        setFeedback({
          tone: "warning",
          message: `Ne mogu da proverim status uslova.${res.error ? ` Razlog: ${res.error}.` : ""} Pokušajte ponovo za koji trenutak.`,
        });
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Provera ToS statusa nije uspela.";
      setFeedback({ tone: "danger", message: msg });
    } finally {
      setCheckingTos(false);
    }
  };

  const audiences = audiencesData?.audiences ?? [];
  const tosStatus = tosData?.status ?? "unknown";
  const tosAccepted = tosStatus === "accepted";
  const adAccountExternalId = tosData?.externalId;

  // Counts by subtype
  const customCount = audiences.filter((a) => a.subtype === "CUSTOM").length;
  const lookalikeCount = audiences.filter((a) => a.subtype === "LOOKALIKE").length;
  const webCount = audiences.filter(
    (a) => a.subtype === "WEBSITE" || a.subtype === "ENGAGEMENT",
  ).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Action and Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {audiencesData?.syncedAt ? (
            <span className="text-xs text-text-muted">
              Poslednja sinhronizacija:{" "}
              <span className="font-medium text-foreground">
                {formatRelativeTime(audiencesData.syncedAt)}
              </span>
            </span>
          ) : (
            <span className="text-xs text-text-muted">
              Publike nisu sinhronizovane
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className="text-xs"
          >
            <RefreshCw
              className={`mr-1.5 size-3.5 ${syncing ? "animate-spin" : ""}`}
            />
            {syncing ? "Sinhronizacija..." : "Osveži publike"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpenTargetingDialog(true)}
            className="text-xs"
          >
            <Search className="mr-1.5 size-3.5" />
            Istraži ciljanje
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => setOpenCustomDialog(true)}
            disabled={!tosAccepted}
            title={
              !tosAccepted
                ? "Morate prihvatiti Meta ToS pre kreiranja publika"
                : undefined
            }
            className="text-xs"
          >
            <Users className="mr-1.5 size-3.5" />
            Nova prilagođena publika
          </Button>

          <Button
            size="sm"
            onClick={() => setOpenLookalikeDialog(true)}
            disabled={!tosAccepted}
            title={
              !tosAccepted
                ? "Morate prihvatiti Meta ToS pre kreiranja publika"
                : undefined
            }
            className="text-xs"
          >
            <Sparkles className="mr-1.5 size-3.5" />
            Nova Lookalike publika
          </Button>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <FeedbackNote
          tone={feedback.tone}
          title={
            feedback.tone === "success"
              ? "Uspešno"
              : feedback.tone === "warning"
                ? "Pažnja"
                : "Greška"
          }
        >
          {feedback.message}
        </FeedbackNote>
      )}

      {/* ToS Gate Banner (When unaccepted or unknown) */}
      {tosStatus === "unknown" && (
        <FeedbackNote
          tone="warning"
          title="Status Custom Audience Uslova korišćenja (ToS) nije potvrđen"
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={handleCheckTos}
              disabled={checkingTos}
              className="text-xs border-warning/40 text-warning hover:bg-warning/10"
            >
              {checkingTos ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Proveravam...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-1.5 size-3.5" />
                  Proveri ponovo
                </>
              )}
            </Button>
          }
        >
          <p className="mt-1">
            Ne mogu da proverim da li su uslovi korišćenja prihvaćeni za nalog{" "}
            <strong className="font-mono text-foreground">
              {adAccountExternalId ? `act_${adAccountExternalId}` : "ad nalog"}
            </strong>.
            {tosData?.lastError ? ` Razlog: ${tosData.lastError}.` : ""}{" "}
            Pokušajte ponovo za koji trenutak klikom na dugme „Proveri ponovo”.
          </p>
        </FeedbackNote>
      )}

      {tosStatus === "not_accepted" && (
        <FeedbackNote
          tone="warning"
          title="Meta Custom Audience Uslovi korišćenja (ToS) nisu prihvaćeni"
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={handleCheckTos}
              disabled={checkingTos}
              className="text-xs border-warning/40 text-warning hover:bg-warning/10"
            >
              {checkingTos ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Proveravam...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-1.5 size-3.5" />
                  Proveri ponovo
                </>
              )}
            </Button>
          }
        >
          <div className="flex flex-col gap-2 mt-1">
            <p>
              Sistemski korisnik (API token) po pravilima platforme Meta Marketing API ne može sam da potpiše Uslove korišćenja.
              Da biste mogli da kreirate nove prilagođene ili Lookalike publike, vlasnik ili administrator Meta Business Suite naloga mora jednokratno da prihvati Custom Audience ToS za oglasni nalog{" "}
              <strong className="font-mono text-foreground">
                {adAccountExternalId ? `act_${adAccountExternalId}` : "vaš ad nalog"}
              </strong>.
            </p>
            <div className="rounded-md border border-warning/20 bg-warning/5 p-2 text-xs">
              <span className="font-semibold text-foreground">Uputstvo za prihvatanje:</span>
              <ol className="mt-1 list-decimal list-inside space-y-1 text-text-muted">
                <li>
                  Prijavite se na{" "}
                  <a
                    href="https://business.facebook.com"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-foreground underline inline-flex items-center gap-0.5"
                  >
                    Meta Business Suite <ExternalLink className="size-3" />
                  </a>{" "}
                  sa administratorskim nalogom.
                </li>
                <li>
                  Idite na <strong>Podešavanja poslovanja (Business Settings)</strong> &gt; <strong>Nalozi za oglašavanje (Ad Accounts)</strong> i izaberite nalog.
                </li>
                <li>
                  Otvorite <strong>Meta Ads Manager &gt; Publike (Audiences)</strong> i prihvatite Custom Audience ToS dijalog.
                </li>
                <li>
                  Nakon potvrde, kliknite na dugme <strong>„Proveri ponovo”</strong> desno.
                </li>
              </ol>
            </div>
          </div>
        </FeedbackNote>
      )}

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-line bg-surface-raised shadow-card">
          <CardContent className="flex items-center gap-3.5 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-accent-400/10 text-accent-400">
              <Layers className="size-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-text-muted">Ukupno publika</span>
              <span className="font-mono text-2xl font-bold text-foreground">
                {audiences.length}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-line bg-surface-raised shadow-card">
          <CardContent className="flex items-center gap-3.5 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-success/10 text-success">
              <Users className="size-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-text-muted">Korisničke liste</span>
              <span className="font-mono text-2xl font-bold text-foreground">
                {customCount}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-line bg-surface-raised shadow-card">
          <CardContent className="flex items-center gap-3.5 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-accent-400/10 text-accent-400">
              <Sparkles className="size-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-text-muted">Lookalike publike</span>
              <span className="font-mono text-2xl font-bold text-foreground">
                {lookalikeCount}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-line bg-surface-raised shadow-card">
          <CardContent className="flex items-center gap-3.5 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <Globe className="size-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-text-muted">Veb-sajt / Angažovanje</span>
              <span className="font-mono text-2xl font-bold text-foreground">
                {webCount}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Audiences Table */}
      <AudiencesTable audiences={audiences} />

      {/* Meta Conversions API (CAPI) Section (B5) */}
      <CapiSection />

      {/* Dialogs */}
      <CreateCustomAudienceDialog
        open={openCustomDialog}
        onOpenChange={setOpenCustomDialog}
        tosStatus={tosStatus}
        onSuccess={() => {
          setFeedback({
            tone: "success",
            message: "Prilagođena publika je uspešno kreirana!",
          });
        }}
      />

      <CreateLookalikeAudienceDialog
        open={openLookalikeDialog}
        onOpenChange={setOpenLookalikeDialog}
        tosStatus={tosStatus}
        audiences={audiences}
        onSuccess={() => {
          setFeedback({
            tone: "success",
            message: "Lookalike publika je uspešno kreirana!",
          });
        }}
      />

      {/* Read-only Targeting Search Dialog (C5) */}
      <TargetingSearchDialog
        open={openTargetingDialog}
        onOpenChange={setOpenTargetingDialog}
      />
    </div>
  );
}
