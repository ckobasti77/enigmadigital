"use client";

// Preneto iz Devotion apps/web/components/workspace/member-password-dialog.tsx (main @ c05c40f), SPAJANJE S21.
import { useState } from "react";
import { useAction } from "convex/react";
import { Eye, EyeOff, KeyRound, LoaderCircle } from "lucide-react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogPopup,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import { lozinkaValjana, prvaGreskaLozinke } from "@/lib/password-rules";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { useProjekatAction } from "@/components/app/projekat-provider";

/**
 * Mali dijalog za postavljanje NOVE lozinke jednom članu. Otvara ga kartica „Lozinke“ u
 * podešavanjima projekta (`lozinke-kartica.tsx`). Naslov nosi ime člana
 * (potvrda), a poziv ide na `adminAuth.adminSetPassword`. Pravila lozinke su
 * Enigmina (`lib/password-rules.ts`). Lozinka se nigde ne pamti niti vraća.
 */
export function MemberPasswordDialog({
  target,
  onOpenChange,
}: {
  target: { profileId: Id<"profiles">; displayName: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const changePassword = useProjekatAction(api.prostor.adminAuth.adminSetPassword);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  function reset() {
    setPassword("");
    setShow(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!target || !lozinkaValjana(password) || busy) return;
    setBusy(true);
    try {
      await changePassword({ profileId: target.profileId, newPassword: password });
      toast.success(`Lozinka za ${target.displayName} je promenjena.`);
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(accessErrorMessage(error, "Lozinka nije promenjena."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-text-muted" aria-hidden="true" /> Nova lozinka
          </DialogTitle>
          <DialogDescription>
            {target
              ? `Nova lozinka za ${target.displayName}. Ranije prijave tog člana se poništavaju.`
              : null}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="member-new-password">Nova lozinka</Label>
            <div className="relative">
              <Input
                id="member-new-password"
                type={show ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Najmanje 8 znakova"
                autoComplete="off"
                autoFocus
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShow((prev) => !prev)}
                aria-label={show ? "Sakrij lozinku" : "Prikaži lozinku"}
                aria-pressed={show}
                className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-md text-text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="text-meta leading-5 text-text-muted">
              {prvaGreskaLozinke(password) ??
                "Bar 8 znakova, veliko i malo slovo, cifra i jedan znak."}
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Otkaži
            </Button>
            <Button variant="primary" type="submit" disabled={busy || !lozinkaValjana(password)}>
              {busy ? <LoaderCircle className="animate-spin" /> : <KeyRound />}
              Postavi novu lozinku
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
