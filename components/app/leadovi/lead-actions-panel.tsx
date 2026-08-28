"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import type { LeadStage } from "@/convex/leadCrmStore";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  MessageSquare,
  PhoneCall,
  ShieldAlert,
  Tag,
  UserCheck,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { FeedbackNote } from "@/components/app/feedback";
import { useWorkspace } from "@/components/app/workspace-provider";
import { LEAD_STAGE_LABELS, leadStageLabel } from "./lead-labels";
import { formatDateTime } from "@/lib/format";
import { ConvexError } from "convex/values";

type LeadActionsPanelProps = {
  workspaceId: Id<"workspaces">;
  companyId: Id<"leadCompanies">;
  currentAssignment: Doc<"leadAssignments"> | null;
  companyName: string;
};

type ActiveModal =
  | null
  | "stage"
  | "touch"
  | "nextAction"
  | "outcome"
  | "assign"
  | "suppressionConfirm";

export function LeadActionsPanel({
  workspaceId,
  companyId,
  currentAssignment,
  companyName,
}: LeadActionsPanelProps) {
  const { user } = useWorkspace();

  // Mutations
  const assignLead = useMutation(api.leadCrmStore.assignLead);
  const setStage = useMutation(api.leadCrmStore.setStage);
  const logTouch = useMutation(api.leadCrmStore.logTouch);
  const setNextAction = useMutation(api.leadCrmStore.setNextAction);
  const recordOutcome = useMutation(api.leadCrmStore.recordOutcome);
  const addToSuppression = useMutation(api.leadCrmStore.addToSuppressionFromOutcome);

  // Modal states
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states: Promena faze
  const [selectedStage, setSelectedStage] = useState<LeadStage>(
    currentAssignment?.stage ?? "nov",
  );
  const [stageNote, setStageNote] = useState("");

  // Form states: Dodir
  const [touchChannel, setTouchChannel] = useState("poziv");
  const [touchNote, setTouchNote] = useState("");
  const [touchTimeMode, setTouchTimeMode] = useState<"now" | "custom">("now");
  const [customTouchDate, setCustomTouchDate] = useState("");

  // Form states: Sledeći korak
  const [nextActionDate, setNextActionDate] = useState("");
  const [nextActionNote, setNextActionNote] = useState("");

  // Form states: Ishod
  const [outcomeText, setOutcomeText] = useState("");
  const [outcomeNote, setOutcomeNote] = useState("");

  // Form states: Dodela
  const [assignUserId, setAssignUserId] = useState(user?.id ?? "");
  const [assignNote, setAssignNote] = useState("");

  // Suppression predlog podaci
  const [suppressionProposal, setSuppressionProposal] = useState<{
    poklopljeniIzraz?: string;
    razlog?: string;
  } | null>(null);

  const getErrorMessage = (err: unknown): string => {
    if (err instanceof ConvexError) {
      return (err.data as { message?: string })?.message ?? err.message;
    }
    if (err instanceof Error) {
      return err.message;
    }
    return "Došlo je do neočekivane greške.";
  };

  // 1. Promena faze
  const handleSetStage = async () => {
    setErrorMsg(null);
    const cleanNote = stageNote.trim();

    // Pravilo 6: polje mora biti obavezno u formi pre slanja
    if ((selectedStage === "dobijen" || selectedStage === "izgubljen") && !cleanNote) {
      setErrorMsg(`Za fazu „${leadStageLabel(selectedStage)}" napomena sa obrazloženjem je obavezna.`);
      return;
    }

    setIsLoading(true);
    try {
      await setStage({
        workspaceId,
        companyId,
        stage: selectedStage,
        note: cleanNote || undefined,
      });
      setStageNote("");
      setActiveModal(null);
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Beleženje dodira
  const handleLogTouch = async () => {
    setErrorMsg(null);
    setIsLoading(true);
    try {
      let touchedAt: number | undefined = undefined;
      if (touchTimeMode === "custom" && customTouchDate) {
        touchedAt = new Date(customTouchDate).getTime();
      }

      await logTouch({
        workspaceId,
        companyId,
        channel: touchChannel,
        note: touchNote.trim() || undefined,
        touchedAt,
      });
      setTouchNote("");
      setActiveModal(null);
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Postavljanje sledećeg koraka
  const handleSetNextAction = async () => {
    setErrorMsg(null);
    if (!nextActionDate) {
      setErrorMsg("Izaberite datum i vreme sledećeg koraka.");
      return;
    }

    const timestamp = new Date(nextActionDate).getTime();
    if (isNaN(timestamp)) {
      setErrorMsg("Nevažeći format datuma i vremena.");
      return;
    }

    setIsLoading(true);
    try {
      await setNextAction({
        workspaceId,
        companyId,
        nextActionAt: timestamp,
        nextActionNote: nextActionNote.trim() || undefined,
      });
      setNextActionNote("");
      setNextActionDate("");
      setActiveModal(null);
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Beleženje ishoda
  const handleRecordOutcome = async () => {
    setErrorMsg(null);
    const cleanOutcome = outcomeText.trim();
    if (!cleanOutcome) {
      setErrorMsg("Unesite ishod razgovora.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await recordOutcome({
        workspaceId,
        companyId,
        outcome: cleanOutcome,
        note: outcomeNote.trim() || undefined,
      });

      // Pravilo 5: Ako sistem predloži zabranu kontakta, tražimo izričitu potvrdu
      if (res.predlogZaSuppression) {
        setSuppressionProposal({
          poklopljeniIzraz: res.poklopljeniIzraz,
          razlog: res.razlog,
        });
        setActiveModal("suppressionConfirm");
      } else {
        setOutcomeText("");
        setOutcomeNote("");
        setActiveModal(null);
      }
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // Potvrda suppression-a
  const handleConfirmSuppression = async () => {
    setErrorMsg(null);
    setIsLoading(true);
    try {
      await addToSuppression({
        workspaceId,
        companyId,
        kind: "rekao_ne",
        reason: `Dodato nakon ishoda „${outcomeText.trim()}"`,
      });
      setOutcomeText("");
      setOutcomeNote("");
      setSuppressionProposal(null);
      setActiveModal(null);
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // 5. Dodela leada
  const handleAssignLead = async (targetUserId?: string) => {
    setErrorMsg(null);
    const resolvedUserId = (targetUserId || assignUserId || user?.id) as Id<"users">;
    if (!resolvedUserId) {
      setErrorMsg("Korisnik nije izabran.");
      return;
    }

    setIsLoading(true);
    try {
      await assignLead({
        workspaceId,
        companyId,
        ownerUserId: resolvedUserId,
        note: assignNote.trim() || undefined,
      });
      setAssignNote("");
      setActiveModal(null);
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Card className="border-line bg-surface">
        <CardHeader className="border-b border-line pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">
                Operativne radnje i CRM potezi
              </CardTitle>
              <CardDescription className="text-xs text-text-muted mt-0.5">
                Direktne akcije tokom ili neposredno nakon razgovora sa klijentom.
              </CardDescription>
            </div>
            <span className="rounded bg-surface-raised border border-line px-2 py-0.5 text-micro font-medium text-text-muted">
              §9.1 Prodajne radnje
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {/* 1. Zabeleži kontakt */}
            <Button
              variant="outline"
              onClick={() => {
                setErrorMsg(null);
                setActiveModal("touch");
              }}
              className="flex flex-col items-center justify-center gap-1.5 h-auto py-3 text-xs border-line hover:border-line-strong hover:bg-surface-raised cursor-pointer"
            >
              <PhoneCall className="size-4 text-success" />
              <span className="font-semibold text-foreground">Zabeleži dodir</span>
            </Button>

            {/* 2. Sledeći korak */}
            <Button
              variant="outline"
              onClick={() => {
                setErrorMsg(null);
                setActiveModal("nextAction");
              }}
              className="flex flex-col items-center justify-center gap-1.5 h-auto py-3 text-xs border-line hover:border-line-strong hover:bg-surface-raised cursor-pointer"
            >
              <Calendar className="size-4 text-amber-400" />
              <span className="font-semibold text-foreground">Sledeći korak</span>
            </Button>

            {/* 3. Promeni fazu */}
            <Button
              variant="outline"
              onClick={() => {
                setErrorMsg(null);
                setSelectedStage(currentAssignment?.stage ?? "nov");
                setActiveModal("stage");
              }}
              className="flex flex-col items-center justify-center gap-1.5 h-auto py-3 text-xs border-line hover:border-line-strong hover:bg-surface-raised cursor-pointer"
            >
              <Tag className="size-4 text-info" />
              <span className="font-semibold text-foreground">Promeni fazu</span>
            </Button>

            {/* 4. Zabeleži ishod */}
            <Button
              variant="outline"
              onClick={() => {
                setErrorMsg(null);
                setActiveModal("outcome");
              }}
              className="flex flex-col items-center justify-center gap-1.5 h-auto py-3 text-xs border-line hover:border-line-strong hover:bg-surface-raised cursor-pointer"
            >
              <Activity className="size-4 text-purple-400" />
              <span className="font-semibold text-foreground">Zabeleži ishod</span>
            </Button>

            {/* 5. Dodeli lead */}
            <Button
              variant="outline"
              onClick={() => {
                setErrorMsg(null);
                if (user?.id) setAssignUserId(user.id);
                setActiveModal("assign");
              }}
              className="flex flex-col items-center justify-center gap-1.5 h-auto py-3 text-xs border-line hover:border-line-strong hover:bg-surface-raised cursor-pointer col-span-2 sm:col-span-1"
            >
              <UserCheck className="size-4 text-accent-400" />
              <span className="font-semibold text-foreground">Dodeli lead</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* DIJALOG 1: Promena faze */}
      <Dialog open={activeModal === "stage"} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Promena faze prodajnog toka</DialogTitle>
            <DialogDescription>
              Izaberite novu fazu kroz koju prolazi lead „{companyName}".
            </DialogDescription>
          </DialogHeader>

          {errorMsg && (
            <FeedbackNote tone="danger" title="Greška">
              {errorMsg}
            </FeedbackNote>
          )}

          <div className="flex flex-col gap-3 py-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(
                [
                  "nov",
                  "u_radu",
                  "poslata_ponuda",
                  "sastanak",
                  "dobijen",
                  "izgubljen",
                  "odlozen",
                ] as LeadStage[]
              ).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setSelectedStage(st)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-all cursor-pointer text-left ${
                    selectedStage === st
                      ? "border-accent-400 bg-accent-400/10 text-accent-400 ring-1 ring-accent-400"
                      : "border-line bg-surface-raised text-text-muted hover:text-foreground"
                  }`}
                >
                  {leadStageLabel(st)}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-1.5 mt-2">
              <label className="text-xs font-semibold text-foreground">
                Napomena uz promenu faze{" "}
                {(selectedStage === "dobijen" || selectedStage === "izgubljen") && (
                  <span className="text-danger font-bold">* (obavezno)</span>
                )}
              </label>
              <Textarea
                placeholder={
                  selectedStage === "dobijen" || selectedStage === "izgubljen"
                    ? "Obrazložite zašto je lead dobijen ili izgubljen (obavezno polje)..."
                    : "Opciona napomena o razlozima promene faze..."
                }
                value={stageNote}
                onChange={(e) => setStageNote(e.target.value)}
                rows={3}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveModal(null)}
              disabled={isLoading}
            >
              Odustani
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSetStage}
              disabled={isLoading}
              className="bg-accent-400 hover:bg-accent-400/90 text-surface-highest"
            >
              {isLoading ? "Čuvanje..." : "Sačuvaj fazu"}
            </Button>
          </DialogFooter>
          <DialogClose />
        </DialogPopup>
      </Dialog>

      {/* DIJALOG 2: Beleženje dodira */}
      <Dialog open={activeModal === "touch"} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Zabeleži kontakt (dodir)</DialogTitle>
            <DialogDescription>
              Unesite zabeleženu komunikaciju sa klijentom „{companyName}".
            </DialogDescription>
          </DialogHeader>

          {errorMsg && (
            <FeedbackNote tone="danger" title="Greška">
              {errorMsg}
            </FeedbackNote>
          )}

          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">Kanal komunikacije:</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "poziv", label: "Poziv" },
                  { id: "email", label: "E-mail" },
                  { id: "instagram_dm", label: "Instagram DM" },
                  { id: "sastanak", label: "Sastanak" },
                  { id: "sms", label: "SMS" },
                  { id: "ostalo", label: "Ostalo" },
                ].map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setTouchChannel(ch.id)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer text-center ${
                      touchChannel === ch.id
                        ? "border-success bg-success/10 text-success font-bold"
                        : "border-line bg-surface-raised text-text-muted hover:text-foreground"
                    }`}
                  >
                    {ch.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">Vreme kontakta:</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTouchTimeMode("now")}
                  className={`rounded-lg border px-3 py-1 text-xs transition-colors cursor-pointer ${
                    touchTimeMode === "now"
                      ? "border-accent-400 bg-accent-400/10 text-accent-400 font-semibold"
                      : "border-line text-text-muted"
                  }`}
                >
                  Trenutno vreme
                </button>
                <button
                  type="button"
                  onClick={() => setTouchTimeMode("custom")}
                  className={`rounded-lg border px-3 py-1 text-xs transition-colors cursor-pointer ${
                    touchTimeMode === "custom"
                      ? "border-accent-400 bg-accent-400/10 text-accent-400 font-semibold"
                      : "border-line text-text-muted"
                  }`}
                >
                  Unesi tačno vreme
                </button>
              </div>

              {touchTimeMode === "custom" && (
                <Input
                  type="datetime-local"
                  value={customTouchDate}
                  onChange={(e) => setCustomTouchDate(e.target.value)}
                  className="text-xs mt-1"
                />
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">
                Kratka beleška / detalji razgovora:
              </label>
              <Textarea
                placeholder="Šta je rečeno, koji su sledeći koraci, ko se javio..."
                value={touchNote}
                onChange={(e) => setTouchNote(e.target.value)}
                rows={3}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveModal(null)}
              disabled={isLoading}
            >
              Odustani
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleLogTouch}
              disabled={isLoading}
              className="bg-success hover:bg-success/90 text-white"
            >
              {isLoading ? "Čuvanje..." : "Evidentiraj dodir"}
            </Button>
          </DialogFooter>
          <DialogClose />
        </DialogPopup>
      </Dialog>

      {/* DIJALOG 3: Sledeći korak */}
      <Dialog open={activeModal === "nextAction"} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Postavi sledeći korak</DialogTitle>
            <DialogDescription>
              Zakažite termin za sledeći poziv, sastanak ili slanje ponude.
            </DialogDescription>
          </DialogHeader>

          {errorMsg && (
            <FeedbackNote tone="danger" title="Greška">
              {errorMsg}
            </FeedbackNote>
          )}

          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">Datum i vreme sledećeg koraka:</label>
              <Input
                type="datetime-local"
                value={nextActionDate}
                onChange={(e) => setNextActionDate(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">Opis sledećeg koraka / zadatak:</label>
              <Textarea
                placeholder="Npr. Pozovi u 15h nakon što vlasnik pogleda landing stranicu..."
                value={nextActionNote}
                onChange={(e) => setNextActionNote(e.target.value)}
                rows={3}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveModal(null)}
              disabled={isLoading}
            >
              Odustani
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSetNextAction}
              disabled={isLoading}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              {isLoading ? "Čuvanje..." : "Postavi korak"}
            </Button>
          </DialogFooter>
          <DialogClose />
        </DialogPopup>
      </Dialog>

      {/* DIJALOG 4: Ishod komunikacije */}
      <Dialog open={activeModal === "outcome"} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Zabeleži ishod komunikacije</DialogTitle>
            <DialogDescription>
              Unesite konačan ili tekući rezultat komunikacije sa klijentom.
            </DialogDescription>
          </DialogHeader>

          {errorMsg && (
            <FeedbackNote tone="danger" title="Greška">
              {errorMsg}
            </FeedbackNote>
          )}

          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">Ishod:</label>
              <Input
                placeholder="Npr. dogovoren_ugovor, preskupo, rekao_ne, nije_zainteresovan..."
                value={outcomeText}
                onChange={(e) => setOutcomeText(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">Dodatno obrazloženje:</label>
              <Textarea
                placeholder="Detalji o ishodu..."
                value={outcomeNote}
                onChange={(e) => setOutcomeNote(e.target.value)}
                rows={3}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveModal(null)}
              disabled={isLoading}
            >
              Odustani
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleRecordOutcome}
              disabled={isLoading}
              className="bg-purple-500 hover:bg-purple-600 text-white"
            >
              {isLoading ? "Čuvanje..." : "Evidentiraj ishod"}
            </Button>
          </DialogFooter>
          <DialogClose />
        </DialogPopup>
      </Dialog>

      {/* DIJALOG 5: Potvrda predloga za zabranu kontakta (Suppression, Pravilo 5) */}
      <Dialog
        open={activeModal === "suppressionConfirm"}
        onOpenChange={(open) => !open && setActiveModal(null)}
      >
        <DialogPopup className="max-w-lg border-warning/40">
          <DialogHeader>
            <div className="flex items-center gap-2 text-warning">
              <ShieldAlert className="size-5 shrink-0" />
              <DialogTitle className="text-base font-bold text-foreground">
                Predlog za zabranu kontakta („ne diraj")
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-text-muted">
              Prepoznat je izraz odbijanja u unetom ishodu komunikacije.
            </DialogDescription>
          </DialogHeader>

          {errorMsg && (
            <FeedbackNote tone="danger" title="Greška">
              {errorMsg}
            </FeedbackNote>
          )}

          <div className="flex flex-col gap-3 py-2 text-xs">
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text-muted">Poklopljeni izraz:</span>
                <span className="rounded bg-warning/20 px-2 py-0.5 font-mono font-bold text-warning">
                  „{suppressionProposal?.poklopljeniIzraz}"
                </span>
              </div>
              <p className="text-text-muted leading-relaxed">
                <strong>Važno objašnjenje:</strong> Ovaj predlog je nastao automatskim pogađanjem
                reči u slobodnom tekstu ishoda, <strong>a ne pouzdanom proverom</strong>.
              </p>
            </div>

            <p className="text-foreground leading-relaxed">
              Ukoliko potvrdite zabranu, firma <strong>{companyName}</strong> (i njen PIB ukoliko
              postoji) biće dodati na listu zabrane („ne diraj"). Provera se radi{" "}
              <strong>pri uvozu tabela</strong>: ovaj subjekt više neće ući kao nov lead. Sistem{" "}
              <strong>ne sprečava poziv</strong> — lead koji je već u bazi i dalje se može zvati,
              zabrana je oznaka za tim, ne brava.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setActiveModal(null);
                setSuppressionProposal(null);
              }}
              disabled={isLoading}
            >
              Ne dodaj na listu (samo sačuvaj ishod)
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleConfirmSuppression}
              disabled={isLoading}
              className="bg-danger hover:bg-danger/90 text-white"
            >
              {isLoading ? "Dodavanje..." : "Izričito potvrdi zabranu"}
            </Button>
          </DialogFooter>
          <DialogClose />
        </DialogPopup>
      </Dialog>

      {/* DIJALOG 6: Dodela leada */}
      <Dialog open={activeModal === "assign"} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Dodela vlasnika leada</DialogTitle>
            <DialogDescription>
              Dodelite firmu „{companyName}" sebi ili drugom članu tima.
            </DialogDescription>
          </DialogHeader>

          {errorMsg && (
            <FeedbackNote tone="danger" title="Greška">
              {errorMsg}
            </FeedbackNote>
          )}

          <div className="flex flex-col gap-3 py-2">
            {user?.id && (
              <Button
                type="button"
                variant="outline"
                onClick={() => handleAssignLead(user.id)}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-xs border-accent-400/40 bg-accent-400/5 hover:bg-accent-400/10 text-accent-400 font-bold cursor-pointer"
              >
                <UserCheck className="size-4" />
                Preuzmi lead (dodeli sebi)
              </Button>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">ID korisnika za dodelu:</label>
              <Input
                placeholder="Unesite ID člana tima..."
                value={assignUserId}
                onChange={(e) => setAssignUserId(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">Napomena uz dodelu:</label>
              <Textarea
                placeholder="Zašto se lead dodeljuje ovom članu tima..."
                value={assignNote}
                onChange={(e) => setAssignNote(e.target.value)}
                rows={2}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveModal(null)}
              disabled={isLoading}
            >
              Odustani
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => handleAssignLead()}
              disabled={isLoading || !assignUserId.trim()}
              className="bg-accent-400 hover:bg-accent-400/90 text-surface-highest"
            >
              {isLoading ? "Dodeljivanje..." : "Potvrdi dodelu"}
            </Button>
          </DialogFooter>
          <DialogClose />
        </DialogPopup>
      </Dialog>
    </>
  );
}
