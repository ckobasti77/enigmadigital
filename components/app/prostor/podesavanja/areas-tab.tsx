"use client";

// Preneto iz Devotion apps/web/components/workspace/settings/areas-tab.tsx (main @ c05c40f), SPAJANJE S21.
import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, X } from "lucide-react";
import { AREA_LABEL_MAX, cleanAreaLabel } from "@/lib/prostor";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";

export type SettingsArea = { _id: string; label: string };

export type AreasTabProps = {
  areas: ReadonlyArray<SettingsArea>;
  busy: boolean;
  /** Posmatrač vidi spisak bez radnji. */
  canEdit: boolean;
  /** `true` kad je izmena sačuvana (red izlazi iz izmene). */
  onRename: (areaId: string, label: string) => Promise<boolean>;
  onMove: (index: number, direction: -1 | 1) => void;
  onCreate: (label: string) => Promise<boolean>;
};

/** Oblasti: preimenuj, pomeri gore/dole, nova oblast. Menja svaki član. */
export function AreasTab({
  areas,
  busy,
  canEdit,
  onRename,
  onMove,
  onCreate,
}: AreasTabProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newError, setNewError] = useState<string | null>(null);

  function startEdit(area: SettingsArea) {
    setEditingId(area._id);
    setDraft(area.label);
    setError(null);
  }

  async function commitEdit(areaId: string) {
    const cleaned = cleanAreaLabel(draft);
    if (!cleaned.ok) {
      setError(cleaned.error);
      return;
    }
    if (await onRename(areaId, cleaned.label)) setEditingId(null);
  }

  async function submitNew(event: React.FormEvent) {
    event.preventDefault();
    const cleaned = cleanAreaLabel(newLabel);
    if (!cleaned.ok) {
      setNewError(cleaned.error);
      return;
    }
    setNewError(null);
    if (await onCreate(cleaned.label)) setNewLabel("");
  }

  return (
    <div className="max-w-xl space-y-6">
      {areas.length === 0 ? (
        <EmptyState size="section" title="Nema oblasti." />
      ) : (
        <ul className="space-y-0.5" aria-label="Oblasti">
          {areas.map((area, index) => (
            <li
              key={area._id}
              className="flex min-h-10 items-center gap-2 rounded-lg px-2 py-1 hover:bg-surface-raised"
            >
              {editingId === area._id ? (
                <form
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void commitEdit(area._id);
                  }}
                >
                  <Input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    maxLength={AREA_LABEL_MAX}
                    aria-label={`Naziv oblasti ${area.label}`}
                    aria-invalid={error ? true : undefined}
                    className="h-8 min-w-40 flex-1"
                    autoFocus
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setEditingId(null);
                    }}
                  />
                  <Button
                    variant="secondary"
                    type="submit"
                    size="sm"
                    disabled={busy}
                  >
                    <Check aria-hidden="true" /> Sačuvaj
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingId(null)}
                  >
                    <X aria-hidden="true" /> Otkaži
                  </Button>
                  {error ? (
                    <p role="alert" className="w-full text-meta text-danger">
                      {error}
                    </p>
                  ) : null}
                </form>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-ui">
                    {area.label}
                  </span>
                  {canEdit ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Preimenuj ${area.label}`}
                        disabled={busy}
                        onClick={() => startEdit(area)}
                      >
                        <Pencil aria-hidden="true" /> Preimenuj
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Pomeri ${area.label} gore`}
                        disabled={busy || index === 0}
                        onClick={() => onMove(index, -1)}
                      >
                        <ArrowUp aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Pomeri ${area.label} dole`}
                        disabled={busy || index === areas.length - 1}
                        onClick={() => onMove(index, 1)}
                      >
                        <ArrowDown aria-hidden="true" />
                      </Button>
                    </>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <form onSubmit={submitNew} className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              maxLength={AREA_LABEL_MAX}
              placeholder="Naziv nove oblasti"
              aria-label="Naziv nove oblasti"
              aria-invalid={newError ? true : undefined}
              className="min-w-48 flex-1"
            />
            <Button type="submit" variant="outline" disabled={busy}>
              <Plus aria-hidden="true" /> Nova oblast
            </Button>
          </div>
          {newError ? (
            <p role="alert" className="text-meta text-danger">
              {newError}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
