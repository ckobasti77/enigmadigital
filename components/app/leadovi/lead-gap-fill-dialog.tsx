"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import type { GapType } from "@/convex/leadGapsStore";
import {
  Phone,
  UserX,
  UserCheck,
  Globe,
  Hash,
  Building2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FeedbackNote } from "@/components/app/feedback";
import { leadGapLabel } from "./lead-labels";
import { useWorkspace } from "@/components/app/workspace-provider";
import { cn } from "@/lib/utils";

type LeadGapFillDialogProps = {
  workspaceId: Id<"workspaces">;
  company: Doc<"leadCompanies"> | null;
  gapType: GapType;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

const LAWFUL_BASIS_OPTIONS = [
  {
    value: "legitimni_interes",
    label: "Legitimni interes (B2B direktni kontakt)",
  },
  {
    value: "javni_podatak_registar",
    label: "Javni podatak (APR / zvanični privredni registar)",
  },
  {
    value: "saglasnost",
    label: "Saglasnost lica (pristanak za kontakt)",
  },
  {
    value: "javno_objavljen_kontakt",
    label: "Javno objavljen kontakt (veb-sajt / Google profil)",
  },
];

export function LeadGapFillDialog({
  workspaceId,
  company,
  gapType,
  isOpen,
  onOpenChange,
  onSuccess,
}: LeadGapFillDialogProps) {
  const { user } = useWorkspace();
  const fillGapMutation = useMutation(api.leadGapFillStore.fillGap);

  // Form states
  const [vrednost, setVrednost] = useState("");
  const [personName, setPersonName] = useState("");
  const [role, setRole] = useState<
    "vlasnik" | "direktor" | "menadzer" | "nepoznato"
  >("vlasnik");
  const [lawfulBasis, setLawfulBasis] = useState("legitimni_interes");
  const [sourceUrl, setSourceUrl] = useState("");
  const [confidence, setConfidence] = useState<"tacno" | "priblizno" | null>(
    null,
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reset forme pri promeni modalnog stanja
  const handleOpenChange = (open: boolean) => {
    onOpenChange(open);
    if (!open) {
      setVrednost("");
      setPersonName("");
      setRole("vlasnik");
      setLawfulBasis("legitimni_interes");
      setSourceUrl("");
      setConfidence(null);
      setErrorMsg(null);
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;

    if (gapType !== "bez_vlasnika" && !confidence) {
      setErrorMsg(
        "Molimo izaberite nivo pouzdanosti podatka (Tačno ako je provereno, ili Približno ako je pretpostavka).",
      );
      return;
    }

    if (
      (gapType === "bez_telefona" || gapType === "bez_kontakt_osobe") &&
      (!lawfulBasis || !sourceUrl.trim())
    ) {
      setErrorMsg(
        "Pravni osnov i URL izvora su obavezni po ZZPL-u za lične kontakt podatke.",
      );
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      await fillGapMutation({
        workspaceId,
        companyId: company._id,
        gapType,
        vrednost: gapType === "bez_kontakt_osobe" ? personName : vrednost,
        personName: personName.trim() ? personName.trim() : undefined,
        role: role,
        lawfulBasis: lawfulBasis ? lawfulBasis.trim() : undefined,
        sourceUrl: sourceUrl.trim() ? sourceUrl.trim() : undefined,
        confidence: (confidence ?? "priblizno") as "tacno" | "priblizno",
        ownerUserId: user?.id as Id<"users"> | undefined,
      });

      onSuccess?.();
      handleOpenChange(false);
    } catch (err: unknown) {
      if (err instanceof ConvexError) {
        const data = err.data as { code?: string; message?: string };
        setErrorMsg(data?.message || err.message);
      } else if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg("Došlo je do greške pri popunjavanju rupe.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!company) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogPopup className="max-w-lg sm:max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg border border-accent-400/40 bg-accent-400/10 text-accent-400">
                <Building2 className="size-4" />
              </div>
              <div>
                <DialogTitle>Popuni: {leadGapLabel(gapType)}</DialogTitle>
                <DialogDescription>
                  Firma: <strong>{company.name}</strong>{" "}
                  {company.city && `(${company.city})`}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {errorMsg && (
            <FeedbackNote tone="danger" title="Greška pri upisu">
              {errorMsg}
            </FeedbackNote>
          )}

          {/* Polja specifična za vrstu rupe */}
          <div className="flex flex-col gap-3.5 py-1">
            {gapType === "bez_telefona" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Broj telefona (obavezno)
                  </label>
                  <Input
                    type="text"
                    placeholder="npr. 0601234567 ili +381113979965"
                    value={vrednost}
                    onChange={(e) => setVrednost(e.target.value)}
                    required
                    className="font-mono"
                  />
                  <span className="text-micro text-text-muted">
                    Automatski se normalizuje u srpski format (+381...).
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Kontakt osoba (opciono)
                    </label>
                    <Input
                      type="text"
                      placeholder="Ime i prezime"
                      value={personName}
                      onChange={(e) => setPersonName(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Uloga osobe
                    </label>
                    <select
                      value={role}
                      onChange={(e) =>
                        setRole(
                          e.target.value as
                            | "vlasnik"
                            | "direktor"
                            | "menadzer"
                            | "nepoznato",
                        )
                      }
                      className="h-8 rounded-lg border border-line bg-surface px-2.5 text-xs text-foreground outline-none focus:border-accent-400"
                    >
                      <option value="vlasnik">Vlasnik</option>
                      <option value="direktor">Direktor</option>
                      <option value="menadzer">Menadžer</option>
                      <option value="nepoznato">Nepoznato</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {gapType === "bez_kontakt_osobe" && (
              <>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Ime i prezime osobe (obavezno)
                    </label>
                    <Input
                      type="text"
                      placeholder="npr. Ana Jovanović"
                      value={personName}
                      onChange={(e) => setPersonName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Uloga osobe
                    </label>
                    <select
                      value={role}
                      onChange={(e) =>
                        setRole(
                          e.target.value as
                            | "vlasnik"
                            | "direktor"
                            | "menadzer"
                            | "nepoznato",
                        )
                      }
                      className="h-8 rounded-lg border border-line bg-surface px-2.5 text-xs text-foreground outline-none focus:border-accent-400"
                    >
                      <option value="vlasnik">Vlasnik</option>
                      <option value="direktor">Direktor</option>
                      <option value="menadzer">Menadžer</option>
                      <option value="nepoznato">Nepoznato</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {gapType === "bez_sajta" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Veb-sajt ili domen (obavezno)
                </label>
                <Input
                  type="text"
                  placeholder="npr. https://mojsalon.rs ili mojsalon.rs"
                  value={vrednost}
                  onChange={(e) => setVrednost(e.target.value)}
                  required
                />
              </div>
            )}

            {gapType === "bez_pib" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-foreground">
                  PIB — 8 ili 9 cifara (obavezno)
                </label>
                <Input
                  type="text"
                  placeholder="npr. 108234567"
                  value={vrednost}
                  onChange={(e) => setVrednost(e.target.value)}
                  required
                  maxLength={9}
                  className="font-mono"
                />
              </div>
            )}

            {gapType === "bez_vlasnika" && (
              <div className="rounded-xl border border-line bg-surface p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <UserCheck className="size-4 text-accent-400" />
                  <span>Preuzimanje vlasništva nad leadom</span>
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  Klikom na potvrdu, postajete zaduženi operater za ovu firmu.
                  Događaj se evidentira u istorijatu leada (§9.1).
                </p>
              </div>
            )}

            {/* Pravni osnov i izvor — OBAVEZNO za lične podatke (§8) */}
            {(gapType === "bez_telefona" ||
              gapType === "bez_kontakt_osobe" ||
              gapType === "bez_sajta" ||
              gapType === "bez_pib") && (
              <div className="rounded-xl border border-line bg-surface p-3 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <ShieldCheck className="size-3.5 text-accent-400" />
                  <span>Pravni osnov i poreklo podatka (§8 ZZPL)</span>
                </div>

                {(gapType === "bez_telefona" ||
                  gapType === "bez_kontakt_osobe") && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-micro font-medium text-text-muted">
                      Pravni osnov obrade (ZZPL / GDPR):
                    </label>
                    <select
                      value={lawfulBasis}
                      onChange={(e) => setLawfulBasis(e.target.value)}
                      className="h-8 rounded-lg border border-line bg-surface-raised px-2 text-xs text-foreground outline-none focus:border-accent-400"
                    >
                      {LAWFUL_BASIS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-micro font-medium text-text-muted">
                    Izvor / URL adresa odakle je podatak uzet:
                  </label>
                  <Input
                    type="text"
                    placeholder="npr. https://companywall.rs/... ili Google Mape"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    required={
                      gapType === "bez_telefona" ||
                      gapType === "bez_kontakt_osobe"
                    }
                  />
                </div>
              </div>
            )}

            {/* Pouzdanost (confidence) — ČOVEK BIRA, NE PODRAZUMEVA SE */}
            {gapType !== "bez_vlasnika" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Pouzdanost podatka (izaberite stepen sigurnosti):
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfidence("tacno")}
                    className={cn(
                      "flex flex-col items-start rounded-lg border p-2.5 text-left transition-colors cursor-pointer",
                      confidence === "tacno"
                        ? "border-success bg-success/10 text-foreground ring-1 ring-success"
                        : "border-line bg-surface hover:bg-surface-raised text-text-muted",
                    )}
                  >
                    <span className="text-xs font-semibold text-foreground">
                      Tačno (potvrđeno)
                    </span>
                    <span className="text-micro text-text-muted mt-0.5">
                      Provereno na sajtu, APR-u ili CompanyWall-u
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfidence("priblizno")}
                    className={cn(
                      "flex flex-col items-start rounded-lg border p-2.5 text-left transition-colors cursor-pointer",
                      confidence === "priblizno"
                        ? "border-warning bg-warning/10 text-foreground ring-1 ring-warning"
                        : "border-line bg-surface hover:bg-surface-raised text-text-muted",
                    )}
                  >
                    <span className="text-xs font-semibold text-foreground">
                      Približno (pretpostavka)
                    </span>
                    <span className="text-micro text-text-muted mt-0.5">
                      Izvedeno iz napomene ili naziva
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-line pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={() => handleOpenChange(false)}
            >
              Otkaži
            </Button>

            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={isSubmitting}
              className="gap-2 font-semibold"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Upisujem podatak...</span>
                </>
              ) : (
                <span>Sačuvaj podatak</span>
              )}
            </Button>
          </DialogFooter>

          <DialogClose />
        </form>
      </DialogPopup>
    </Dialog>
  );
}
