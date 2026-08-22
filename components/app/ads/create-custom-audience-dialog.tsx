"use client";

import { useState } from "react";
import { useAction } from "convex/react";
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
import { Textarea } from "@/components/ui/textarea";
import { FeedbackNote } from "@/components/app/feedback";
import { ShieldCheck, Loader2, Users } from "lucide-react";

interface CreateCustomAudienceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tosStatus: "accepted" | "not_accepted" | "unknown";
  onSuccess?: () => void;
}

export function CreateCustomAudienceDialog({
  open,
  onOpenChange,
  tosStatus,
  onSuccess,
}: CreateCustomAudienceDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [customerText, setCustomerText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createCustomAudience = useAction(api.metaAds.createCustomAudienceAction);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Naziv publike je obavezan.");
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
      // Parse customer rows from textarea (each line can be email or phone or "email,phone,firstName,lastName")
      const lines = customerText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      const users: Array<{
        email?: string;
        phone?: string;
        firstName?: string;
        lastName?: string;
        city?: string;
        country?: string;
        zip?: string;
      }> = [];

      for (const line of lines) {
        if (line.includes(",")) {
          const parts = line.split(",").map((p) => p.trim());
          users.push({
            email: parts[0] || undefined,
            phone: parts[1] || undefined,
            firstName: parts[2] || undefined,
            lastName: parts[3] || undefined,
            city: parts[4] || undefined,
            country: parts[5] || undefined,
            zip: parts[6] || undefined,
          });
        } else if (line.includes("@")) {
          users.push({ email: line });
        } else if (/\d/.test(line)) {
          users.push({ phone: line });
        }
      }

      await createCustomAudience({
        name: name.trim(),
        description: description.trim() || undefined,
        customerFileSource: "USER_PROVIDED_ONLY",
        users: users.length > 0 ? users : undefined,
      });

      setName("");
      setDescription("");
      setCustomerText("");
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Došlo je do greške pri kreiranju publike.";
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
            <Users className="size-5 text-accent-400" />
            Nova prilagođena publika
          </DialogTitle>
          <DialogDescription>
            Kreirajte Custom publiku na osnovu liste kupaca ili klijenata.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
          {error && (
            <FeedbackNote tone="danger" title="Greška pri kreiranju">
              {error}
            </FeedbackNote>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="custom-audience-name">Naziv publike *</Label>
            <Input
              id="custom-audience-name"
              placeholder="npr. Kupci 2026 - Newsletter lista"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="custom-audience-desc">Opis (opciono)</Label>
            <Input
              id="custom-audience-desc"
              placeholder="Kratak opis svrhe ili izvora publike"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="custom-audience-data">
              Korisnički podaci (opciono, po jedan u redu ili CSV)
            </Label>
            <Textarea
              id="custom-audience-data"
              rows={4}
              placeholder="marko@primer.rs&#10;0641234567&#10;petar@primer.rs, 0659876543, Petar, Petrović"
              value={customerText}
              onChange={(e) => setCustomerText(e.target.value)}
              disabled={submitting}
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-text-muted">
              Možete uneti email adrese, brojeve telefona (npr. 064... automatski postaje 38164...) ili CSV redove.
            </p>
          </div>

          <div className="rounded-lg border border-accent-400/20 bg-accent-400/5 p-3 text-xs text-text-muted">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <ShieldCheck className="size-4 text-accent-400" />
              Automatska SHA-256 zaštita privatnosti
            </div>
            <p className="mt-1 leading-relaxed">
              Svi lični podaci (email, telefon, ime) se pre slanja na Meta Marketing API
              normalizuju i kriptografski heširaju (SHA-256). Sirovi podaci se nikada ne čuvaju u bazi u čistom tekstu.
            </p>
          </div>

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
              disabled={submitting || !name.trim() || tosStatus !== "accepted"}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Kreiranje...
                </>
              ) : (
                "Kreiraj publiku"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
