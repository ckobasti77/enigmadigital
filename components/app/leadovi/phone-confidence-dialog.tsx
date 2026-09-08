"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
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
import { Textarea } from "@/components/ui/textarea";
import { FeedbackNote } from "@/components/app/feedback";
import { getErrorMessage } from "./lead-quick-dialogs";
import { PhoneConfidence } from "./phone-confidence";
import { cn } from "@/lib/utils";

/**
 * „Ispravi procenu" (GL2, plan §6).
 *
 * Aplikacija NE računa verovatnoću — računa je skill po pravilniku iz §6, a
 * ovde čovek prepravlja ono što vidi. Zato je obrazloženje obavezno: bez njega
 * bi za mesec dana stajao broj bez ijednog traga zašto.
 *
 * „Nije moguće proceniti" je izbor ravnopravan broju, a ne prazno polje —
 * pravilo 4 iz §0 zabranjuje da se nepoznato piše kao 50 %.
 */
export function PhoneConfidenceDialog({
  workspaceId,
  identity,
  personName,
  open,
  onOpenChange,
}: {
  workspaceId: Id<"workspaces">;
  identity: Doc<"leadIdentities">;
  personName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const setPhoneConfidence = useMutation(api.leadDetailStore.setPhoneConfidence);

  const [rezim, setRezim] = useState<"broj" | "nije">(
    identity.nijeMoguceProceniti === true ? "nije" : "broj",
  );
  const [vrednost, setVrednost] = useState<string>(
    identity.verovatnoca !== undefined ? String(identity.verovatnoca) : "",
  );
  const [obrazlozenje, setObrazlozenje] = useState(
    identity.verovatnocaObrazlozenje ?? "",
  );
  const [greska, setGreska] = useState<string | null>(null);
  const [cuvam, setCuvam] = useState(false);

  const broj = Number(vrednost);
  const brojIspravan =
    vrednost.trim() !== "" && Number.isFinite(broj) && broj >= 0 && broj <= 95;
  const moze =
    obrazlozenje.trim().length > 0 && (rezim === "nije" || brojIspravan);

  const sacuvaj = async () => {
    setCuvam(true);
    setGreska(null);
    try {
      await setPhoneConfidence({
        workspaceId,
        identityId: identity._id,
        verovatnoca: rezim === "broj" ? Math.round(broj) : undefined,
        nijeMoguceProceniti: rezim === "nije" ? true : undefined,
        obrazlozenje,
      });
      onOpenChange(false);
    } catch (err) {
      setGreska(getErrorMessage(err));
    } finally {
      setCuvam(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (cuvam) return;
        onOpenChange(next);
      }}
    >
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Ispravi procenu telefona</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            Koliko je verovatno da ovaj broj pripada baš osobi{" "}
            <strong className="text-foreground">{personName}</strong>, a ne
            centrali firme. Gornja granica je 95 — 100 bi značilo da smo pozvali
            i potvrdili.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          {identity.verovatnoca !== undefined ||
          identity.nijeMoguceProceniti === true ? (
            <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface-raised/40 p-3">
              <span className="text-micro font-semibold uppercase tracking-wider text-text-muted">
                Trenutno
              </span>
              <PhoneConfidence
                verovatnoca={identity.verovatnoca}
                nijeMoguceProceniti={identity.nijeMoguceProceniti}
                obrazlozenje={identity.verovatnocaObrazlozenje}
                izvor={identity.verovatnocaIzvor}
              />
            </div>
          ) : (
            <p className="text-xs text-text-muted">
              Ovaj broj još nije procenjivan.
            </p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {(["broj", "nije"] as const).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={rezim === r}
                onClick={() => setRezim(r)}
                className={cn(
                  "cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  rezim === r
                    ? "border-accent-400 bg-accent-400/15 text-accent-400"
                    : "border-line bg-surface-raised text-text-muted hover:border-line-strong hover:text-foreground",
                )}
              >
                {r === "broj" ? "Unesi procenu" : "Nije moguće proceniti"}
              </button>
            ))}
          </div>

          {rezim === "broj" && (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="verovatnoca-input"
                className="text-xs font-medium text-text-muted"
              >
                Procena (0–95)
              </label>
              <Input
                id="verovatnoca-input"
                inputMode="numeric"
                value={vrednost}
                onChange={(e) => setVrednost(e.target.value)}
                aria-invalid={vrednost.trim() !== "" && !brojIspravan}
                className="h-8 w-24 font-mono text-xs tabular-nums"
              />
              {vrednost.trim() !== "" && !brojIspravan && (
                <p className="text-xs text-danger">
                  Unesi ceo broj između 0 i 95.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="obrazlozenje-input"
              className="text-xs font-medium text-text-muted"
            >
              Obrazloženje (obavezno)
            </label>
            <Textarea
              id="obrazlozenje-input"
              value={obrazlozenje}
              onChange={(e) => setObrazlozenje(e.target.value)}
              placeholder="Najjači dokaz, pa najjači kontra-dokaz. Bez ponavljanja samog broja."
              className="min-h-20 text-xs"
            />
            <p className="text-micro text-text-muted">
              Sirov broj se u obrazloženju ne ponavlja — stoji odmah iznad.
            </p>
          </div>

          {greska && (
            <FeedbackNote tone="danger" title="Procena nije sačuvana">
              {greska}
            </FeedbackNote>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={cuvam}
          >
            Otkaži
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!moze || cuvam}
            onClick={() => void sacuvaj()}
          >
            {cuvam ? "Čuvam…" : "Sačuvaj procenu"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
