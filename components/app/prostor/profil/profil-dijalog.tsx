// Preneto iz Devotion apps/web/components/workspace/profile-dialog.tsx (main @ c05c40f), SPAJANJE S09.
"use client";

import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { initialsOf } from "@/components/app/system/player-card";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { toast } from "@/lib/toast";

/** Najveća slika profila (isto kao provera na serveru, `storage.setAvatar`). */
const NAJVECA_SLIKA = 5 * 1024 * 1024;
const VRSTE_SLIKE = "image/png,image/jpeg,image/webp";

/**
 * Profil radnog dela (SPAJANJE P6, paritet red 9): ime i slika koje tim vidi
 * uz zadatke, poruke i komentare. Nalog (adresa, lozinka) je Enigmin i ovde se
 * samo čita. Otvara se iz menija korisnika.
 *
 * Profil nastaje lenjo (`ensureCurrent` u kapiji prijave). Dok ga nema (ili
 * ga posmatrač nema uopšte, O5), dijalog to kaže i ne nudi čuvanje.
 */
export function ProfilDijalog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="gap-0 p-0 sm:max-w-md">
        {/* Telo se montira tek kad je dijalog otvoren: polja kreću od
            sačuvanog imena pri svakom otvaranju. */}
        {open && <TeloProfila zatvori={() => onOpenChange(false)} />}
      </DialogPopup>
    </Dialog>
  );
}

function TeloProfila({ zatvori }: { zatvori: () => void }) {
  const profil = useQuery(api.prostor.profiles.getCurrent);

  if (profil === undefined) {
    return (
      <div className="flex min-h-48 items-center justify-center p-6">
        <LoaderCircle className="size-5 animate-spin text-text-muted" aria-label="Učitavam profil" />
      </div>
    );
  }

  if (profil === null) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <DialogHeader>
          <DialogTitle>Moj profil</DialogTitle>
          <DialogDescription>
            Profil još nije spreman. Pokušaj ponovo za trenutak; nastaje pri
            prvom ulasku u radni deo projekta.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={zatvori}>
            Zatvori
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return <FormaProfila profil={profil} zatvori={zatvori} />;
}

type Profil = NonNullable<FunctionReturnType<typeof api.prostor.profiles.getCurrent>>;

function FormaProfila({ profil, zatvori }: { profil: Profil; zatvori: () => void }) {
  const updateCurrent = useMutation(api.prostor.profiles.updateCurrent);
  const generateUploadUrl = useMutation(api.prostor.storage.generateAvatarUploadUrl);
  const setAvatar = useMutation(api.prostor.storage.setAvatar);
  const removeAvatar = useMutation(api.prostor.storage.removeAvatar);
  const [ime, setIme] = useState(profil.displayName);
  const [slika, setSlika] = useState<File | null>(null);
  const [pregled, setPregled] = useState<string | null>(null);
  const [radi, setRadi] = useState(false);
  const izborRef = useRef<HTMLInputElement>(null);

  const ocisceno = ime.trim();
  const izmenjeno = slika !== null || ocisceno !== profil.displayName;

  function izaberi(fajl: File | null) {
    if (fajl && fajl.size > NAJVECA_SLIKA) {
      toast.error("Slika može imati najviše 5 MB.");
      if (izborRef.current) izborRef.current.value = "";
      return;
    }
    if (pregled) URL.revokeObjectURL(pregled);
    setSlika(fajl);
    setPregled(fajl ? URL.createObjectURL(fajl) : null);
  }

  async function sacuvaj(e: FormEvent) {
    e.preventDefault();
    if (!ocisceno || radi) return;
    setRadi(true);
    try {
      if (slika) {
        const dozvola = await generateUploadUrl({});
        const odgovor = await fetch(dozvola.uploadUrl, {
          method: "POST",
          headers: { "Content-Type": slika.type },
          body: slika,
        });
        if (!odgovor.ok) throw new Error("Slika nije otpremljena. Pokušaj ponovo.");
        const { storageId } = (await odgovor.json()) as { storageId: Id<"_storage"> };
        await setAvatar({ storageId, token: dozvola.token });
      }
      if (ocisceno !== profil.displayName) {
        await updateCurrent({ displayName: ocisceno });
      }
      toast.success("Profil je sačuvan.");
      zatvori();
    } catch (greska) {
      toast.error(accessErrorMessage(greska, "Profil nije sačuvan."));
    } finally {
      setRadi(false);
    }
  }

  async function ukloniSliku() {
    setRadi(true);
    try {
      await removeAvatar({});
      izaberi(null);
      toast.success("Slika profila je uklonjena.");
    } catch (greska) {
      toast.error(accessErrorMessage(greska, "Slika nije uklonjena."));
    } finally {
      setRadi(false);
    }
  }

  const prikaz = pregled ?? profil.avatarUrl;

  return (
    <form onSubmit={sacuvaj} className="flex flex-col">
      <DialogHeader className="border-b border-line px-6 py-5">
        <DialogTitle>Moj profil</DialogTitle>
        <DialogDescription>
          Ime i slika koje tim vidi uz tvoje zadatke, poruke i komentare.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-5 px-6 py-5">
        <div className="flex items-center gap-4">
          <Avatar size="lg" className="size-16 text-title">
            {prikaz && <AvatarImage src={prikaz} alt="" />}
            <AvatarFallback>{initialsOf(ocisceno || profil.displayName)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col items-start gap-1.5">
            <input
              ref={izborRef}
              id="profil-slika"
              type="file"
              accept={VRSTE_SLIKE}
              className="sr-only"
              onChange={(e) => izaberi(e.target.files?.[0] ?? null)}
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={radi}
                onClick={() => izborRef.current?.click()}
              >
                <ImagePlus aria-hidden />
                {prikaz ? "Promeni sliku" : "Dodaj sliku"}
              </Button>
              {profil.avatarUrl && !slika && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={radi}
                  onClick={() => void ukloniSliku()}
                >
                  <Trash2 aria-hidden />
                  Ukloni
                </Button>
              )}
            </div>
            <p className="text-meta text-text-muted">PNG, JPG ili WebP, najviše 5 MB.</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="profil-ime">Ime koje tim vidi</Label>
          <Input
            id="profil-ime"
            value={ime}
            onChange={(e) => setIme(e.target.value)}
            maxLength={80}
            autoComplete="name"
            aria-invalid={ocisceno.length === 0 || undefined}
          />
          {ocisceno.length === 0 && (
            <p className="text-meta text-danger">Ime ne sme biti prazno.</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="profil-adresa">Adresa e-pošte</Label>
          <Input id="profil-adresa" value={profil.email} disabled />
          <p className="text-meta text-text-muted">Adresa naloga se ovde ne menja.</p>
        </div>
      </div>

      <DialogFooter className="border-t border-line px-6 py-4">
        <Button type="button" variant="ghost" onClick={zatvori} disabled={radi}>
          Otkaži
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={radi || !ocisceno || !izmenjeno}
          aria-busy={radi || undefined}
        >
          {radi && <LoaderCircle className="animate-spin" aria-hidden />}
          Sačuvaj profil
        </Button>
      </DialogFooter>
    </form>
  );
}
