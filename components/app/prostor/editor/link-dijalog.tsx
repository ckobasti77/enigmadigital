"use client";

// Preneto iz Devotion apps/web/components/workspace/notes/note-link-dialog.tsx (main @ c05c40f), SPAJANJE S10.
import { useId, useState } from "react";
import { Link2Off } from "lucide-react";

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
import { normalizeNoteLinkHref } from "@/lib/prostor/web/note-link";

/** Snimak selekcije u trenutku otvaranja dijaloga. */
export type NoteLinkDraft = {
  /** Obeleženi tekst koji postaje link — prikazuje se da se vidi na šta se lepi. */
  text: string;
  /** Adresa postojećeg linka; prazno kad se link tek dodaje. */
  href: string;
  /** Sadržaj polja. Editor ga drži da dijalog ne bi imao svoju kopiju stanja. */
  input: string;
};

export function NoteLinkDialog({
  open,
  draft,
  onInputChange,
  onClose,
  onSubmit,
  onRemove,
}: {
  open: boolean;
  /** Ostaje popunjen i posle zatvaranja da sadržaj ne trepne tokom animacije. */
  draft: NoteLinkDraft | null;
  onInputChange: (input: string) => void;
  onClose: () => void;
  /** Adresa je već proverena kroz `normalizeNoteLinkHref`. */
  onSubmit: (href: string) => void;
  onRemove: () => void;
}) {
  const inputId = useId();
  // Pamti se tačan tekst koji nije prošao proveru — greška tako nestaje sama
  // kad se unos promeni i ne traži čišćenje pri zatvaranju.
  const [rejected, setRejected] = useState<string | null>(null);

  const input = draft?.input ?? "";
  const invalid = rejected !== null && rejected === input;
  const isEdit = draft !== null && draft.href !== "";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPopup
        className="sm:max-w-md"
        // Polje za adresu je prvi element kroz koji se tabuje, pa ga dijalog
        // sam fokusira i označi postojeću adresu — prvi sledeći unos je zamenjuje.
        // Vraćanje fokusa na zatvaranju je isključeno jer editor tada sam vraća
        // kursor u tekst; dijalog bi ga odveo na dugme alatne trake.
        finalFocus={false}
      >
        <DialogHeader>
          <DialogTitle>{isEdit ? "Izmeni link" : "Dodaj link"}</DialogTitle>
          <DialogDescription>
            {draft !== null && draft.text !== "" ? (
              <>
                Klik na{" "}
                <span className="font-semibold text-foreground">
                  „{draft.text}“
                </span>{" "}
                vodiće na ovu adresu.
              </>
            ) : (
              "Klik na obeleženi tekst vodiće na ovu adresu."
            )}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            const href = normalizeNoteLinkHref(input);
            if (href === null) {
              setRejected(input);
              return;
            }
            onSubmit(href);
          }}
        >
          <label
            className="block text-ui font-medium"
            htmlFor={inputId}
          >
            Adresa
          </label>
          <Input
            id={inputId}
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="primer.rs/stranica"
            aria-invalid={invalid}
            aria-describedby={`${inputId}-hint`}
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
          />
          <p
            id={`${inputId}-hint`}
            role={invalid ? "alert" : undefined}
            className={
              invalid
                ? "text-meta font-medium text-danger"
                : "text-meta text-text-muted"
            }
          >
            {invalid
              ? "Adresa nije ispravna. Probaj „primer.rs/stranica“, „mail@primer.rs“ ili celu adresu sa https://."
              : "Bez protokola se dodaje https://, a unos sa @ postaje mejl."}
          </p>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Otkaži
            </Button>
            {isEdit ? (
              <Button type="button" variant="outline" onClick={onRemove}>
                <Link2Off className="size-4" />
                Ukloni link
              </Button>
            ) : null}
            <Button variant="primary" type="submit">{isEdit ? "Sačuvaj" : "Dodaj link"}</Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
