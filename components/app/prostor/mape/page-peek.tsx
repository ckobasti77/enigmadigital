"use client";


// Preneto iz Devotion apps/web/components/workspace/page-peek.tsx (main @ c05c40f), SPAJANJE S14.
import { useState } from "react";
import { ArrowUpRight, Layers, Lock, MessageSquare } from "lucide-react";

import { MapTaskLine } from "@/components/app/prostor/mape/map/map-card";
import {
  MAP_SERVER_PREVIEW_MAX,
  mapPageText,
  type MapCardContent,
} from "@/lib/prostor/modeli/map-model";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PAGE_KIND_META } from "@/lib/prostor/web/vrste-stranica";
import { useProjekatQueryResult } from "@/components/app/prostor/podaci/projekat";

/** „1 podstranica", „3 podstranice", „9+ podstranica". */
function subpagesWord(count: string): string {
  if (count.endsWith("+")) return "podstranica";
  const value = Number(count);
  const lastDigit = value % 10;
  const lastTwo = value % 100;
  if (lastDigit === 1 && lastTwo !== 11) return "podstranica";
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return "podstranice";
  return "podstranica";
}

/** Najviše teksta u fioci — ceo dokument je jedan klik dalje. */
const PEEK_TEXT_MAX = 1_200;

export type PagePeekPage = {
  _id: Id<"pages">;
  card: MapCardContent;
  text: string;
};

export type PagePeekCommentCount =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; count: number; capped: boolean };

/**
 * Sadržaj fioke „Pregled" (prezentacija, bez upita): meta, isečak sadržaja, broj komentara i „Otvori".
 */
export function PagePeekBody({
  page,
  comments,
}: {
  page: PagePeekPage;
  comments: PagePeekCommentCount;
}) {
  const { card } = page;
  const KindIcon = card.kind && card.kind !== "idea" ? PAGE_KIND_META[card.kind].icon : null;
  const text = mapPageText(card.title, page.text).trim();
  // Server šalje isečak do 480 znakova; pun tekst je jedan klik dalje.
  const clipped = text.length >= Math.min(PEEK_TEXT_MAX, MAP_SERVER_PREVIEW_MAX);
  const shown = clipped ? `${text.slice(0, PEEK_TEXT_MAX).trimEnd()}…` : text;

  return (
    <div className="space-y-5">
      <dl className="space-y-1.5 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <dt className="sr-only">Vrsta</dt>
          <dd className="inline-flex items-center gap-1.5">
            {KindIcon ? <KindIcon className="size-4" aria-hidden="true" /> : null}
            {card.kindLabel}
          </dd>
          {card.locked ? (
            <dd className="inline-flex items-center gap-1">
              <Lock className="size-3.5" aria-hidden="true" /> Zaključano
            </dd>
          ) : null}
        </div>
        {card.byline ? (
          <div className="text-muted-foreground">
            <dt className="sr-only">Autor i poslednja izmena</dt>
            <dd>{card.byline}</dd>
          </div>
        ) : null}
        {card.childCount ? (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <dt className="sr-only">Podstranice</dt>
            <dd className="inline-flex items-center gap-1.5">
              <Layers className="size-4" aria-hidden="true" />
              {card.childCount} {subpagesWord(card.childCount)}
            </dd>
          </div>
        ) : null}
        {card.task ? (
          <div className="pt-1">
            <dt className="sr-only">Zadatak</dt>
            <dd>
              <MapTaskLine task={card.task} title={card.title} />
            </dd>
          </div>
        ) : null}
      </dl>

      <section aria-labelledby="page-peek-text">
        <h3 id="page-peek-text" className="mb-2 text-sm font-semibold">
          Početak sadržaja
        </h3>
        {shown ? (
          <p className="whitespace-pre-line text-sm leading-6 text-foreground">{shown}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Stranica je prazna.</p>
        )}
      </section>

      <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <MessageSquare className="size-4" aria-hidden="true" />
        {comments.status === "loading"
          ? "Komentari se učitavaju…"
          : comments.status === "error"
            ? "Broj komentara nije učitan."
            : comments.count === 0
              ? "Još nema komentara."
              : `Komentari · ${comments.count}${comments.capped ? "+" : ""}`}
      </p>
    </div>
  );
}

/**
 * „Pregled" kartice na Mapi: fioka 28 rem — Mapa ne
 * gubi kontekst, a ceo dokument je dugme „Otvori stranicu".
 */
export function PagePeekDrawer({
  open,
  onOpenChange,
  page,
  comments,
  onOpen,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: PagePeekPage | null;
  comments: PagePeekCommentCount;
  onOpen: (pageId: Id<"pages">) => void;
}) {
  // Sadržaj ostaje dok fioka izlazi (roditelj tada već šalje `null`).
  const [shown, setShown] = useState<PagePeekPage | null>(page);
  if (page !== null && page !== shown) setShown(page);
  if (shown === null) return null;
  const isTask = shown.card.kind === "task";

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={shown.card.title}
      width="28rem"
      onExited={() => setShown(null)}
      footer={
        <Button variant="secondary" className="w-full" onClick={() => onOpen(shown._id)}>
          <ArrowUpRight className="size-4" aria-hidden="true" />
          {isTask ? "Otvori zadatak" : "Otvori stranicu"}
        </Button>
      }
    >
      <PagePeekBody page={shown} comments={comments} />
    </Drawer>
  );
}

/** Kontejner: broj komentara stranice kroz `comments.countFor`. */
export function PagePeek({
  open,
  onOpenChange,
  page,
  onOpen,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: PagePeekPage | null;
  onOpen: (pageId: Id<"pages">) => void;
}) {
  // Greška broja komentara ne obara Mapu — fioka kaže „nije učitan".
  const counts = useProjekatQueryResult(
    api.prostor.comments.countFor,
    page === null
      ? "skip"
      : { targets: [{ kind: "page" as const, id: page._id }] },
  );
  const entry = counts.data?.[0];
  const comments: PagePeekCommentCount = counts.failed
    ? { status: "error" }
    : counts.data === undefined
      ? { status: "loading" }
      : entry === undefined
        ? { status: "error" }
        : { status: "ready", count: entry.count, capped: entry.capped };

  return (
    <PagePeekDrawer
      open={open}
      onOpenChange={onOpenChange}
      page={page}
      comments={comments}
      onOpen={onOpen}
    />
  );
}
