"use client";

import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Potvrda za radnju koja se ne poništava.
 *
 * Namerno je NE traže sve radnje. Kada se sve potvrđuje, ljudi kliknu kroz
 * potvrdu ne pročitavši je, pa potvrda prestane da štiti baš ono zbog čega
 * postoji. Ovde stoji samo pred brisanjem i pred slanjem koje odlazi napolje.
 *
 * Zato ni `window.confirm`: opis mora da kaže šta preživljava radnju — log,
 * istorija, već objavljeni odgovori — a to native prozor ne ume da prikaže.
 * Dijalog uz to hvata fokus, vraća ga na zatvaranju i sluša Escape.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busyLabel,
  busy = false,
  onConfirm,
  tone = "danger",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Šta se tačno dešava, i šta ostaje sačuvano. */
  description: ReactNode;
  confirmLabel: string;
  busyLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  tone?: "danger" | "accent";
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        onOpenChange(next);
      }}
    >
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Otkaži
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onConfirm}
            disabled={busy}
            className={
              tone === "danger"
                ? "bg-danger font-semibold text-text-inverse hover:bg-danger/90"
                : "font-semibold"
            }
          >
            {busy ? (
              <>
                <LoaderCircle className="animate-spin" />
                {busyLabel}
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
