"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ExternalLink, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FeedbackNote } from "@/components/app/feedback";
import { useWorkspace } from "@/components/app/workspace-provider";
import { useNow } from "@/components/app/use-now";
import { DUR_REDUCED, DUR_UI, EASE_UI, MOTION_QUERIES } from "@/lib/motion";
import { holdCssTransition, releaseCssTransition } from "@/components/motion/css-transition";
import { temperatureVar, type Temperatura } from "@/lib/temperature";
import { StageChip } from "./lead-chips";
import { LeadRowActions, type RowDialogKind } from "./lead-row-actions";
import { LeadExpandedRow } from "./lead-expanded-row";
import { LeadCallStrip } from "./lead-call-strip";
import { LeadRowDialogs, type LeadRowDialogState } from "./lead-row-dialogs";
import type { LeadRowItem } from "./lead-urgency";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

/**
 * Bočni panel mape (GL3, plan §8): ISTI red kao u tabeli — `LeadRowActions`
 * (telefon, mejl, sastanak, meni), traka posle poziva i prošireni red — nad
 * firmom koju je čovek kliknuo na mapi. Ništa od toga nije kopirano; panel
 * samo ponovo koristi komponente tabele nad redom koji `getLeadRow` vraća
 * u istom obliku kao `listLeadsFiltered`.
 *
 * Ulaz: klizanje sa desne ivice (16 px) uz opacity, `DUR_UI`/`EASE_UI` — panel
 * je „srednje težine" (kartica), bez prebačaja. Pod `prefers-reduced-motion`
 * samo kratak fade.
 *
 * Panel svetluca (pulsira meki sjaj + tinta ivice) u BOJI TEMPERATURE firme na
 * koju je čovek kliknuo — vizuelno vezuje panel za obojeni pin. Pod
 * `prefers-reduced-motion` sjaj je statičan (bez pulsa).
 */

export function LeadsMapPanel({
  workspaceId,
  companyId,
  temperatura,
  onClose,
  className,
}: {
  workspaceId: Id<"workspaces">;
  companyId: Id<"leadCompanies">;
  /** Temperatura izabrane firme — boja u kojoj panel svetluca. */
  temperatura?: Temperatura;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const { user } = useWorkspace();
  const now = useNow();
  const data = useQuery(api.leadFiltersStore.getLeadRow, { workspaceId, companyId });

  const [dialog, setDialog] = useState<LeadRowDialogState | null>(null);
  const [pozivBroj, setPozivBroj] = useState<string | null>(null);
  const [greska, setGreska] = useState<string | null>(null);

  // Boja sjaja/ivice = ista promenljiva koju nosi pin (`lib/temperature.ts`).
  const boja = temperatura ? temperatureVar(temperatura) : null;

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        const still = Boolean(ctx.conditions?.still);
        if (still) holdCssTransition(el);
        gsap.set(el, still ? { opacity: 0 } : { opacity: 0, x: 16, willChange: "transform, opacity" });
        gsap.to(el, {
          opacity: 1,
          ...(still ? {} : { x: 0 }),
          duration: still ? DUR_REDUCED : DUR_UI,
          ease: still ? "none" : EASE_UI,
          overwrite: "auto",
          onComplete: () => {
            el.style.removeProperty("will-change");
            releaseCssTransition(el);
          },
        });
      });
    },
    { scope: ref, dependencies: [companyId] },
  );

  // Svetlucanje panela u boji temperature (ambijentni sloj). Animira samo
  // `--sjaj` (jačinu sjaja), koji box-shadow čita — bez alokacija, jedan
  // element. Pod reduced-motion: statičan sjaj, bez pulsa.
  useGSAP(
    () => {
      const el = ref.current;
      if (!el || !boja) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        if (ctx.conditions?.still) {
          gsap.set(el, { "--sjaj": 0.6 });
          return;
        }
        gsap.fromTo(
          el,
          { "--sjaj": 0.35 },
          { "--sjaj": 1, duration: 1.15, ease: "sine.inOut", repeat: -1, yoyo: true },
        );
      });
    },
    { scope: ref, dependencies: [companyId, boja] },
  );

  const item = data?.item as LeadRowItem | null | undefined;
  const company = item?.company ?? null;

  const openDialog = (kind: RowDialogKind) => {
    if (item) setDialog({ kind, item });
  };

  return (
    <aside
      ref={ref}
      aria-label="Izabrana firma na mapi"
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-line bg-surface/95 text-xs shadow-(--elev-3) backdrop-blur-md",
        className,
      )}
      // Ivica u tinti temperature + meki sjaj čija jačina (`--sjaj`) pulsira
      // (GSAP gore). Inline nadjačava `border-line`/`shadow-(--elev-3)`.
      style={
        boja
          ? {
              borderColor: `color-mix(in srgb, ${boja} 45%, var(--line))`,
              boxShadow: `var(--elev-3), 0 0 calc(var(--sjaj, 0.5) * 22px) calc(var(--sjaj, 0.5) * 1px) ${boja}`,
            }
          : undefined
      }
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <TooltipProvider delay={150}>
        {/* Zaglavlje */}
        <div className="flex items-start gap-2 border-b border-line bg-surface-raised/40 px-3.5 py-3">
          <div className="min-w-0 flex-1">
            {data === undefined ? (
              <>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="mt-1.5 h-3.5 w-24" />
              </>
            ) : item === null ? (
              <p className="font-medium text-foreground">Firma više nema dodelu</p>
            ) : (
              <>
                <Link
                  href={`/leadovi/${companyId}`}
                  className="line-clamp-2 text-sm font-semibold text-foreground hover:text-accent-400"
                >
                  {company?.name ?? "Nepoznata firma"}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-text-muted">
                  {company?.city && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3" aria-hidden />
                      {company.city}
                    </span>
                  )}
                  {item && <StageChip stage={item.assignment.stage} className="text-micro" />}
                </div>
              </>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zatvori panel"
            onClick={onClose}
            className="-mr-1 -mt-1 shrink-0 text-text-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </Button>
        </div>

        {/* Radnje — isti red kao u tabeli */}
        {item && (
          <div className="flex items-center justify-between gap-2 border-b border-line-soft px-3.5 py-2">
            <Link
              href={`/leadovi/${companyId}`}
              className="inline-flex items-center gap-1 text-micro font-medium text-text-muted hover:text-foreground"
            >
              <ExternalLink className="size-3" aria-hidden />
              Otvori profil
            </Link>
            <LeadRowActions
              workspaceId={workspaceId}
              item={item}
              now={now}
              selfUserId={user?.id}
              onCall={setPozivBroj}
              onOpenDialog={openDialog}
              onOpenStageDialog={(stage) => setDialog({ kind: "stage", item, stage })}
              onError={setGreska}
            />
          </div>
        )}

        {greska && (
          <FeedbackNote
            tone="danger"
            title="Radnja nije sačuvana"
            className="mx-3.5 mt-3"
            action={
              <Button size="xs" variant="ghost" onClick={() => setGreska(null)}>
                Zatvori
              </Button>
            }
          >
            {greska}
          </FeedbackNote>
        )}

        {item && pozivBroj && (
          <LeadCallStrip
            workspaceId={workspaceId}
            companyId={companyId}
            phone={pozivBroj}
            onClose={() => setPozivBroj(null)}
            onScheduleMeeting={() =>
              setDialog({ kind: "meeting", item, calledPhone: pozivBroj })
            }
            onRecordOutcome={() => openDialog("outcome")}
            onNextStep={() => openDialog("nextAction")}
            className="border-b border-line-soft bg-accent-400/5 px-3.5 py-2.5"
          />
        )}

        {/* Sadržaj proširenog reda, u jednoj koloni */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {data === undefined ? (
            <div className="flex flex-col gap-3 p-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : !item ? (
            <p className="p-4 text-text-muted">
              Lead je u međuvremenu ostao bez vlasnika, pa nije više ni u
              tabeli ni na mapi. Vidi jezičak „Rupe u podacima”.
            </p>
          ) : (
            <LeadExpandedRow
              workspaceId={workspaceId}
              item={item}
              now={now}
              onCall={setPozivBroj}
              onOpenDialog={openDialog}
              stacked
            />
          )}
        </div>

        <LeadRowDialogs
          workspaceId={workspaceId}
          dialog={dialog}
          onClose={() => setDialog(null)}
        />
      </TooltipProvider>
    </aside>
  );
}
