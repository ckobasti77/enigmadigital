"use client";

// Preneto iz Devotion apps/web/components/workspace/page/page-side-column.tsx (main @ c05c40f), SPAJANJE S10.
import { LoaderCircle, Lock, LockOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProfileAvatar } from "@/components/app/prostor/zajednicko/radni-ui";

import { lastEditLabel } from "@/lib/prostor/modeli/page-document-model";

export type PageSideFactsProps = {
  author: { displayName: string; avatarUrl: string | null } | null;
  lastEdit: { editorName: string | null; at: number };
  lock: {
    locked: boolean;
    canLock: boolean;
    canUnlock: boolean;
    busy: boolean;
    onLock: () => void;
    onUnlock: () => void;
  };
  now: number;
};

/**
 * Bočna kolona dokumenta (K07 §5.6, ≥ `lg`): Autor, Izmena, Zaključano (+
 * Zaključaj/Otključaj kome je dozvoljeno). Ispod `lg` ovi podaci su meta red
 * ispod naslova, pa se crta samo „Povezano".
 */
export function PageSideFacts({ author, lastEdit, lock, now }: PageSideFactsProps) {
  return (
    <dl className="hidden space-y-3 text-sm lg:block">
      <div>
        <dt className="text-xs text-muted-foreground">Autor</dt>
        <dd className="mt-1 flex min-w-0 items-center gap-2">
          {author ? (
            <>
              <ProfileAvatar profile={author} className="size-5" />
              <span className="truncate">{author.displayName}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Nepoznat</span>
          )}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Izmena</dt>
        <dd className="mt-1 truncate">{lastEditLabel(lastEdit.editorName, lastEdit.at, now)}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Zaključano</dt>
        <dd className="mt-1 flex items-center justify-between gap-2">
          <span>{lock.locked ? "Da" : "Ne"}</span>
          {lock.canLock || lock.canUnlock ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={lock.busy}
              onClick={lock.canUnlock ? lock.onUnlock : lock.onLock}
            >
              {lock.busy ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : lock.canUnlock ? (
                <LockOpen aria-hidden="true" />
              ) : (
                <Lock aria-hidden="true" />
              )}
              {lock.canUnlock ? "Otključaj" : "Zaključaj"}
            </Button>
          ) : null}
        </dd>
      </div>
    </dl>
  );
}
