"use client";

// Preneto iz Devotion apps/web/components/workspace/create-area-dialog.tsx (main @ c05c40f), SPAJANJE S10.
import { useState } from "react";
import { FolderPlus, LoaderCircle } from "lucide-react";
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
import type { StartupWithAreas } from "@/lib/prostor/rute";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { useProjekatMutation } from "@/components/app/projekat-provider";

export function CreateAreaDialog({
  open,
  onOpenChange,
  workspace,
  onCreated,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: StartupWithAreas;
  onCreated?: (areaId: Id<"areas">) => void;
  /** Kuda fokus posle zatvaranja; dijalog se otvara spolja (nema svoj okidač). */
  finalFocus?: () => HTMLElement | boolean;
}) {
  const createArea = useProjekatMutation(api.prostor.projekat.createArea);
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (label.trim().length === 0) return;
    setSubmitting(true);
    try {
      const areaId = await createArea({
        label: label.trim(),
      });
      toast.success("Oblast je dodata.");
      setLabel("");
      onOpenChange(false);
      if (onCreated) {
        onCreated(areaId);
      }
    } catch (error) {
      toast.error(accessErrorMessage(error, "Oblast nije dodata."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-md gap-0 p-0" finalFocus={finalFocus}>
        <form onSubmit={submit}>
          <DialogHeader className="border-b border-line-soft px-5 py-5 sm:px-6">
            <DialogTitle>Nova oblast</DialogTitle>
            <DialogDescription className="sr-only">
              Nova oblast u projektu {workspace.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-5 py-5 sm:px-6">
            <div className="space-y-2">
              <Label htmlFor="new-area-label">Naziv oblasti</Label>
              <Input
                id="new-area-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Na primer: Finansije"
                maxLength={100}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="border-t border-line-soft px-5 py-4 sm:px-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Otkaži
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={submitting || label.trim().length === 0}
            >
              {submitting ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <FolderPlus />
              )}
              Dodaj
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
