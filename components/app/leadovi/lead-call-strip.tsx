"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Activity,
  CalendarPlus,
  Calendar,
  PhoneCall,
  PhoneMissed,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackLine } from "@/components/app/feedback";
import { getErrorMessage } from "./lead-quick-dialogs";
import { cn } from "@/lib/utils";

type Phase = "ask" | "answered" | "missed";

/**
 * Traka posle `tel:` klika (§5): „Pozvao si — kako je prošlo?”
 *
 * `tel:` link ne dokazuje da je razgovor obavljen (§2/O2), pa se OVDE ništa
 * ne upisuje bez klika:
 *   - „Javio se”      → `logTouch` kanal „poziv” (ostvaren dodir)
 *   - „Nije se javio” → `recordOutcome` „nije_se_javio” (pokušaj, bez dodira —
 *                        poslednji dodir ostaje onaj stvarni)
 *   - „Zakaži sastanak” → otvara dijalog sastanka; tamo se poziv može upisati
 *                        kao dodir uz izričito čekiranje
 * „Zatvori” samo sklanja traku.
 */
export function LeadCallStrip({
  workspaceId,
  companyId,
  phone,
  onClose,
  onScheduleMeeting,
  onRecordOutcome,
  onNextStep,
  className,
}: {
  workspaceId: Id<"workspaces">;
  companyId: Id<"leadCompanies">;
  phone: string;
  onClose: () => void;
  onScheduleMeeting: () => void;
  onRecordOutcome: () => void;
  onNextStep: () => void;
  className?: string;
}) {
  const logTouch = useMutation(api.leadCrmStore.logTouch);
  const recordOutcome = useMutation(api.leadCrmStore.recordOutcome);
  const [phase, setPhase] = useState<Phase>("ask");
  const [busy, setBusy] = useState<"answered" | "missed" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const answered = async () => {
    setError(null);
    setBusy("answered");
    try {
      await logTouch({
        workspaceId,
        companyId,
        channel: "poziv",
        note: `Poziv na ${phone}`,
      });
      setPhase("answered");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const missed = async () => {
    setError(null);
    setBusy("missed");
    try {
      await recordOutcome({
        workspaceId,
        companyId,
        outcome: "nije_se_javio",
        note: `Poziv na ${phone}`,
      });
      setPhase("missed");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      role="region"
      aria-label="Beleženje poziva"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 text-xs",
        className,
      )}
    >
      <PhoneCall className="size-4 shrink-0 text-accent-400" aria-hidden />

      {phase === "ask" && (
        <>
          <span className="text-foreground">
            Pozvao si{" "}
            <span className="font-mono font-semibold tabular-nums">{phone}</span>{" "}
            — kako je prošlo?
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={answered}
              className="text-xs"
            >
              <PhoneCall />
              {busy === "answered" ? "Beležim…" : "Javio se"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={missed}
              className="text-xs"
            >
              <PhoneMissed />
              {busy === "missed" ? "Beležim…" : "Nije se javio"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={onScheduleMeeting}
              className="text-xs"
            >
              <CalendarPlus />
              Zakaži sastanak
            </Button>
          </div>
        </>
      )}

      {phase === "answered" && (
        <>
          <FeedbackLine tone="success">Poziv zabeležen kao dodir.</FeedbackLine>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={onRecordOutcome} className="text-xs">
              <Activity />
              Zabeleži ishod
            </Button>
            <Button size="sm" variant="outline" onClick={onNextStep} className="text-xs">
              <Calendar />
              Sledeći korak
            </Button>
            <Button size="sm" variant="outline" onClick={onScheduleMeeting} className="text-xs">
              <CalendarPlus />
              Zakaži sastanak
            </Button>
          </div>
        </>
      )}

      {phase === "missed" && (
        <>
          <FeedbackLine tone="success">
            Zabeleženo: nije se javio. Poslednji dodir nije promenjen.
          </FeedbackLine>
          <Button size="sm" variant="outline" onClick={onNextStep} className="text-xs">
            <Calendar />
            Kad ponovo zvati?
          </Button>
        </>
      )}

      {error && <FeedbackLine tone="danger">{error}</FeedbackLine>}

      <Button
        size="icon-xs"
        variant="ghost"
        onClick={onClose}
        aria-label="Zatvori traku"
        className="ml-auto text-text-muted hover:text-foreground"
      >
        <X />
      </Button>
    </div>
  );
}
