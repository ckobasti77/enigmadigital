"use client";

import { useState, useMemo } from "react";
import {
  useMoze,
  useProjekatAction,
  useProjekatQuery,
} from "@/components/app/projekat-provider";
import {
  ObjavljujesKao,
  usePotvrdaProjekta,
} from "@/components/app/objavljujes-kao";
import { api } from "@/convex/_generated/api";
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
import { Label } from "@/components/ui/label";
import { FeedbackNote } from "@/components/app/feedback";
import { formatAudienceSize } from "@/convex/lib/metaAdsApi";
import { Loader2, Sparkles, AlertCircle } from "lucide-react";

interface AudienceOption {
  audienceId: string;
  name: string;
  subtype: string;
  approximateCountLower?: number;
  approximateCountUpper?: number;
}

interface CreateLookalikeAudienceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tosStatus: "accepted" | "not_accepted" | "unknown";
  audiences: AudienceOption[];
  onSuccess?: () => void;
}

/** Publiku pravi samo vlasnik; za ostale se dijalog uopšte ne crta. */
export function CreateLookalikeAudienceDialog(
  props: CreateLookalikeAudienceDialogProps,
) {
  const mozeVlasnik = useMoze("owner");
  if (!mozeVlasnik) return null;
  return <CreateLookalikeAudienceDialogInner {...props} />;
}

function CreateLookalikeAudienceDialogInner({
  open,
  onOpenChange,
  tosStatus,
  audiences,
  onSuccess,
}: CreateLookalikeAudienceDialogProps) {
  const [name, setName] = useState("");
  const [seedAudienceId, setSeedAudienceId] = useState("");
  const [country, setCountry] = useState("RS");
  const [specMode, setSpecMode] = useState<"ratio" | "type">("ratio");
  const [ratioPct, setRatioPct] = useState(1); // 1% = 0.01
  const [lookalikeType, setLookalikeType] = useState<"similarity" | "reach">("similarity");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createLookalikeAudience = useProjekatAction(
    api.metaAds.createLookalikeAudienceAction,
  );
  const potvrda = usePotvrdaProjekta();
  // Publika nastaje na nalogu koji akcija uzima: prvi Meta nalog oglasa
  // projekta (`getMetaAdsAuth`), istim indeksom i redom kao ovaj spisak.
  const nalozi = useProjekatQuery(api.metaAdsStore.listAccounts);

  // Filter seed audiences to those with valid size
  const seedOptions = useMemo(() => {
    return audiences.map((aud) => {
      const sizeFmt = formatAudienceSize(
        aud.approximateCountLower,
        aud.approximateCountUpper,
      );
      const isEligible =
        aud.approximateCountLower !== undefined &&
        aud.approximateCountLower >= 100;
      return {
        ...aud,
        sizeLabel: sizeFmt.label,
        isEligible,
      };
    });
  }, [audiences]);

  const selectedSeed = seedOptions.find((s) => s.audienceId === seedAudienceId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Naziv Lookalike publike je obavezan.");
      return;
    }

    if (!seedAudienceId) {
      setError("Morate izabrati izvornu (seed) publiku.");
      return;
    }

    if (!selectedSeed?.isEligible) {
      setError(
        "Izabrana seed publika nema potvrđenu procenu od najmanje 100 korisnika iz iste zemlje. Meta zahteva najmanje 100 korisnika pre kreiranja Lookalike publike.",
      );
      return;
    }

    if (tosStatus === "unknown") {
      setError(
        "Ne mogu da proverim da li su uslovi prihvaćeni. Pokušajte ponovo za koji trenutak.",
      );
      return;
    }

    if (tosStatus === "not_accepted") {
      setError(
        "Kreiranje publike je blokirano jer Uslovi korišćenja (ToS) nisu prihvaćeni u Meta Business Suite-u.",
      );
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Lookalike spec: EITHER ratio OR type, NEVER BOTH
      const spec: { country: string; ratio?: number; type?: string } = {
        country: country.trim().toUpperCase() || "RS",
      };

      if (specMode === "ratio") {
        spec.ratio = Math.round(ratioPct) / 100; // 1% -> 0.01, 5% -> 0.05
      } else {
        spec.type = lookalikeType;
      }

      await createLookalikeAudience({
        name: name.trim(),
        seedAudienceId,
        spec,
      });

      setName("");
      setSeedAudienceId("");
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Došlo je do greške pri kreiranju Lookalike publike.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-xl">
        <DialogClose />
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-mod" />
            Nova Lookalike (slična) publika
          </DialogTitle>
          <DialogDescription>
            Kreirajte publiku korisnika sličnih vašim postojećim kupcima ili posetiocima.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
          {error && (
            <FeedbackNote tone="danger" title="Greška pri kreiranju">
              {error}
            </FeedbackNote>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lookalike-name">Naziv Lookalike publike *</Label>
            <Input
              id="lookalike-name"
              placeholder="npr. Slični kupcima 1% - Srbija"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="seed-audience-select">
              Izvorna (Seed) publika * (zahteva ≥ 100 korisnika)
            </Label>
            <select
              id="seed-audience-select"
              value={seedAudienceId}
              onChange={(e) => {
                setSeedAudienceId(e.target.value);
                const s = seedOptions.find((opt) => opt.audienceId === e.target.value);
                if (s && !name) {
                  setName(`Lookalike (${s.name}) - ${country}`);
                }
              }}
              disabled={submitting}
              className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              required
            >
              <option value="">-- Izaberite izvornu publiku --</option>
              {seedOptions.map((opt) => (
                <option
                  key={opt.audienceId}
                  value={opt.audienceId}
                  disabled={!opt.isEligible}
                >
                  {opt.name} ({opt.sizeLabel}) {!opt.isEligible ? "— [Ispod praga od 100]" : ""}
                </option>
              ))}
            </select>
            {selectedSeed && !selectedSeed.isEligible && (
              <p className="flex items-center gap-1 text-[11px] text-danger">
                <AlertCircle className="size-3" />
                Ova publika ima manje od 100 korisnika ili nepoznatu procenu i ne može poslužiti kao seed.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lookalike-country">Ciljna država (ISO kod) *</Label>
              <Input
                id="lookalike-country"
                placeholder="RS, US, DE..."
                value={country}
                onChange={(e) => setCountry(e.target.value.toUpperCase())}
                maxLength={2}
                disabled={submitting}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Način optimizacije *</Label>
              <div className="flex rounded-md border border-line bg-surface-sunken p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setSpecMode("ratio")}
                  className={`flex-1 rounded py-1 font-medium transition-colors ${
                    specMode === "ratio"
                      ? "bg-surface-raised text-foreground shadow-sm"
                      : "text-text-muted hover:text-foreground"
                  }`}
                >
                  Procenat (1% – 20%)
                </button>
                <button
                  type="button"
                  onClick={() => setSpecMode("type")}
                  className={`flex-1 rounded py-1 font-medium transition-colors ${
                    specMode === "type"
                      ? "bg-surface-raised text-foreground shadow-sm"
                      : "text-text-muted hover:text-foreground"
                  }`}
                >
                  Tip (Sličnost/Doseg)
                </button>
              </div>
            </div>
          </div>

          {specMode === "ratio" ? (
            <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-sunken p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="lookalike-ratio" className="text-xs">
                  Veličina publike (Odnos / Ratio)
                </Label>
                <span className="font-mono text-sm font-semibold text-mod">
                  {ratioPct}% (odnos { (ratioPct / 100).toFixed(2) })
                </span>
              </div>
              <input
                id="lookalike-ratio"
                type="range"
                min={1}
                max={20}
                step={1}
                value={ratioPct}
                onChange={(e) => setRatioPct(Number(e.target.value))}
                disabled={submitting}
                className="h-2 w-full cursor-pointer accent-mod"
              />
              <div className="flex justify-between text-[10px] text-text-muted">
                <span>1% (Najsličniji)</span>
                <span>10% (Uravnoteženo)</span>
                <span>20% (Širok doseg)</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-sunken p-3">
              <Label className="text-xs">Tip sličnosti</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setLookalikeType("similarity")}
                  className={`rounded-md border p-2 text-left text-xs transition-colors ${
                    lookalikeType === "similarity"
                      ? "border-mod bg-mod-soft text-foreground"
                      : "border-line bg-surface-raised text-text-muted"
                  }`}
                >
                  <p className="font-medium text-foreground">Sličnost (similarity)</p>
                  <p className="text-[10px] text-text-muted mt-0.5">Maksimalna sličnost sa izvornom publikom</p>
                </button>
                <button
                  type="button"
                  onClick={() => setLookalikeType("reach")}
                  className={`rounded-md border p-2 text-left text-xs transition-colors ${
                    lookalikeType === "reach"
                      ? "border-mod bg-mod-soft text-foreground"
                      : "border-line bg-surface-raised text-text-muted"
                  }`}
                >
                  <p className="font-medium text-foreground">Doseg (reach)</p>
                  <p className="text-[10px] text-text-muted mt-0.5">Veći obuhvat korisnika</p>
                </button>
              </div>
            </div>
          )}

          <ObjavljujesKao
            kanal="meta_ads"
            radnja="Praviš"
            nalog={
              nalozi === undefined
                ? undefined
                : (nalozi.find((n) => n.provider === "meta_ads")?.name ?? null)
            }
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Otkaži
            </Button>
            <Button
              type="submit"
              disabled={
                submitting ||
                !name.trim() ||
                !seedAudienceId ||
                !selectedSeed?.isEligible ||
                tosStatus !== "accepted"
              }
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Kreiranje...
                </>
              ) : (
                potvrda("Kreiraj Lookalike")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
