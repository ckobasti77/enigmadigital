"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { LeadStage } from "@/convex/leadCrmStore";
import {
  Activity,
  Calendar,
  CalendarClock,
  CalendarPlus,
  Ellipsis,
  ExternalLink,
  Mail,
  MapPin,
  MapPinOff,
  Phone,
  PhoneCall,
  PhoneOff,
  Tag,
  UserCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { leadStageLabel } from "./lead-labels";
import { ALL_STAGES, stageRequiresNote } from "./lead-chips";
import { getErrorMessage } from "./lead-quick-dialogs";
import { primaryAction, type PrimaryAction } from "./lead-columns";
import {
  mailHref,
  telHref,
  type LeadRowContact,
  type LeadRowItem,
} from "./lead-urgency";
import { formatClockTime, formatDayRelative, pluralSr } from "@/lib/format";
import { cn } from "@/lib/utils";

export type RowDialogKind =
  | "meeting"
  | "nextAction"
  | "outcome"
  | "touch"
  | "assign";

/**
 * Lista faza kao radio-stavke menija. Faza bez napomene se upisuje odmah;
 * „Dobijen”/„Izgubljen” traže obrazloženje, pa se za njih otvara dijalog.
 * Deli je meni u redu tabele, čip stanja i traka radnji na profilu.
 */
export function StageMenuItems({
  current,
  onPick,
}: {
  current: LeadStage;
  onPick: (stage: LeadStage) => void;
}) {
  return (
    <DropdownMenuRadioGroup
      value={current}
      onValueChange={(value) => onPick(value as LeadStage)}
    >
      {ALL_STAGES.map((st) => (
        <DropdownMenuRadioItem key={st} value={st}>
          <span>{leadStageLabel(st)}</span>
          {stageRequiresNote(st) && (
            <span className="ml-auto pl-3 text-micro text-text-muted">
              + obrazloženje
            </span>
          )}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

/**
 * Hook za promenu faze bez dijaloga (§8: „modal ostaje samo tamo gde treba
 * napomena”). Vraća funkciju koja ili odmah upiše fazu ili, kad je potrebno
 * obrazloženje, preda roditelju da otvori dijalog.
 */
export function useStagePick({
  workspaceId,
  companyId,
  current,
  onNeedsNote,
  onError,
}: {
  workspaceId: Id<"workspaces">;
  companyId: Id<"leadCompanies">;
  current: LeadStage;
  onNeedsNote: (stage: LeadStage) => void;
  onError: (message: string) => void;
}) {
  const setStage = useMutation(api.leadCrmStore.setStage);
  return async (stage: LeadStage) => {
    if (stage === current) return;
    if (stageRequiresNote(stage)) {
      onNeedsNote(stage);
      return;
    }
    try {
      await setStage({ workspaceId, companyId, stage });
    } catch (err) {
      onError(getErrorMessage(err));
    }
  };
}

/** Klasa primarnog dugmeta u redu — ista kao radnja u bloku „Danas" (A2). */
export const PRIMARY_ACTION_CLASS =
  "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-accent-400/40 bg-accent-400/10 px-2.5 text-meta font-medium text-accent-400 transition-colors hover:border-accent-400/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Stavke „Pozovi" / „Piši" u meniju (§5). Tri stanja, i nijedno ne laže:
 *  - nema kontakta  → onemogućena stavka koja kaže zašto
 *  - jedan kontakt  → stavka je `tel:` / `mailto:` link
 *  - više kontakata → podmeni, svaka stavka je link
 */
function ContactMenuItems({
  kind,
  contacts,
  onPick,
}: {
  kind: "phone" | "email";
  contacts: LeadRowContact[];
  onPick?: (value: string) => void;
}) {
  const Icon = kind === "phone" ? Phone : Mail;
  const verb = kind === "phone" ? "Pozovi" : "Piši";
  const noun = kind === "phone" ? "broj" : "e-mail";

  if (contacts.length === 0) {
    return (
      <DropdownMenuItem disabled>
        {kind === "phone" ? <PhoneOff /> : <Mail />}
        Nema {noun} u bazi
      </DropdownMenuItem>
    );
  }

  if (contacts.length === 1) {
    const only = contacts[0];
    const href = kind === "phone" ? telHref(only.value) : mailHref(only.value);
    return (
      <DropdownMenuItem render={<a href={href} onClick={() => onPick?.(only.value)} />}>
        <Icon />
        <span>{verb}</span>
        <span className={cn("ml-auto truncate pl-3 text-micro text-text-muted", kind === "phone" && "font-mono tabular-nums")}>
          {only.value}
        </span>
      </DropdownMenuItem>
    );
  }

  const count = contacts.length;
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Icon />
        {verb}
        <span className="ml-auto pl-3 text-micro text-text-muted">
          {count}{" "}
          {kind === "phone"
            ? pluralSr(count, "broj", "broja", "brojeva")
            : pluralSr(count, "adresa", "adrese", "adresa")}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-64">
        {contacts.map((c) => (
          <DropdownMenuItem
            key={c.value}
            render={
              <a
                href={kind === "phone" ? telHref(c.value) : mailHref(c.value)}
                onClick={() => onPick?.(c.value)}
              />
            }
          >
            <Icon className="text-accent-400" />
            <span className={cn("truncate", kind === "phone" && "font-mono tabular-nums")}>
              {c.value}
            </span>
            {c.personName && (
              <span className="ml-auto truncate pl-2 text-micro text-text-muted">
                {c.personName}
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/**
 * Primarno dugme reda (A3, O2): jedno, i menja se po stanju — Pozovi →
 * Zabeleži ishod → Zakaži (vidi `primaryAction`). Ostalo je pod „…".
 */
export function LeadPrimaryButton({
  action,
  companyId,
  onCall,
  onOpenDialog,
  onFill,
  className,
}: {
  action: PrimaryAction;
  companyId: Id<"leadCompanies">;
  onCall: (phone: string) => void;
  onOpenDialog: (kind: RowDialogKind) => void;
  /** Otvara dijalog dopune rupe „bez telefona"; bez njega „Dopuni" vodi na profil. */
  onFill?: () => void;
  className?: string;
}) {
  const classes = cn(PRIMARY_ACTION_CLASS, className);
  switch (action.kind) {
    case "call":
      return (
        <a
          href={telHref(action.phone ?? "")}
          onClick={() => onCall(action.phone ?? "")}
          className={classes}
          data-primary-action="call"
        >
          <Phone className="size-3.5" aria-hidden />
          {action.label}
        </a>
      );
    case "outcome":
      return (
        <button type="button" onClick={() => onOpenDialog("outcome")} className={classes} data-primary-action="outcome">
          <Activity className="size-3.5" aria-hidden />
          {action.label}
        </button>
      );
    case "schedule":
      return (
        <button type="button" onClick={() => onOpenDialog("meeting")} className={classes} data-primary-action="schedule">
          <CalendarPlus className="size-3.5" aria-hidden />
          {action.label}
        </button>
      );
    case "fill":
      return onFill ? (
        <button type="button" onClick={onFill} className={classes} data-primary-action="fill">
          <PhoneOff className="size-3.5" aria-hidden />
          {action.label}
        </button>
      ) : (
        <Link href={`/leadovi/${companyId}`} className={classes} data-primary-action="open">
          <ExternalLink className="size-3.5" aria-hidden />
          Otvori
        </Link>
      );
    case "open":
      return (
        <Link href={`/leadovi/${companyId}`} className={classes} data-primary-action="open">
          <ExternalLink className="size-3.5" aria-hidden />
          {action.label}
        </Link>
      );
  }
}

/**
 * Kolona „Akcije” (A3, O2): jedno primarno dugme + „…" sa SVIM radnjama koje
 * su postojale pre (poziv, mejl, sastanak, faza, sledeći korak, ishod, dodir,
 * dodela, profil, mapa). Ništa nije nestalo — samo je jedno dugme dobilo
 * prvenstvo.
 */
export function LeadRowActions({
  workspaceId,
  item,
  now,
  selfUserId,
  onCall,
  onOpenDialog,
  onOpenStageDialog,
  onError,
  onFill,
  className,
}: {
  workspaceId: Id<"workspaces">;
  item: LeadRowItem;
  now: number;
  selfUserId?: string;
  onCall: (phone: string) => void;
  onOpenDialog: (kind: RowDialogKind) => void;
  onOpenStageDialog: (stage: LeadStage) => void;
  onError: (message: string) => void;
  /** Dopuna rupe „bez telefona" (A3): kad je nema, „Dopuni" vodi na profil. */
  onFill?: () => void;
  className?: string;
}) {
  const { assignment, company } = item;
  const companyId = assignment.companyId;
  const assignLead = useMutation(api.leadCrmStore.assignLead);
  const pickStage = useStagePick({
    workspaceId,
    companyId,
    current: assignment.stage,
    onNeedsNote: onOpenStageDialog,
    onError,
  });

  const isMine =
    selfUserId !== undefined && String(assignment.ownerUserId) === selfUserId;

  const assignSelf = async () => {
    if (!selfUserId) return;
    try {
      await assignLead({
        workspaceId,
        companyId,
        ownerUserId: selfUserId as Id<"users">,
      });
    } catch (err) {
      onError(getErrorMessage(err));
    }
  };

  const meetingAt = assignment.meetingAt;
  const action = primaryAction(item, now);

  return (
    <div className={cn("flex items-center justify-end gap-1", className)}>
      <LeadPrimaryButton
        action={action}
        companyId={companyId}
        onCall={onCall}
        onOpenDialog={onOpenDialog}
        onFill={onFill}
      />

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Više radnji — ${company?.name ?? "firma"}`}
              className="text-text-muted hover:text-foreground"
            />
          }
        >
          <Ellipsis className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="truncate">
              {company?.name ?? "Nepoznata firma"}
            </DropdownMenuLabel>
            <ContactMenuItems kind="phone" contacts={item.telefoni} onPick={onCall} />
            <ContactMenuItems kind="email" contacts={item.emailovi} />
            <DropdownMenuItem onClick={() => onOpenDialog("meeting")}>
              {meetingAt !== undefined ? <CalendarClock /> : <CalendarPlus />}
              {meetingAt !== undefined ? (
                <>
                  <span>Sastanak</span>
                  <span className="ml-auto pl-3 text-micro text-text-muted">
                    {formatDayRelative(meetingAt, now)} {formatClockTime(meetingAt)} · izmeni
                  </span>
                </>
              ) : (
                "Zakaži sastanak…"
              )}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Tag />
                Promeni fazu
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52">
                <StageMenuItems current={assignment.stage} onPick={pickStage} />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onClick={() => onOpenDialog("nextAction")}>
              <Calendar />
              Sledeći korak…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onOpenDialog("outcome")}>
              <Activity />
              Zabeleži ishod…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onOpenDialog("touch")}>
              <PhoneCall />
              Zabeleži dodir…
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {selfUserId && !isMine && (
            <DropdownMenuItem onClick={assignSelf}>
              <UserCheck />
              Dodeli meni
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => onOpenDialog("assign")}>
            <Users />
            Dodeli drugom…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href={`/leadovi/${companyId}`} />}>
            <ExternalLink />
            Otvori profil
          </DropdownMenuItem>
          {/* GL4: otvara mapu sa letom do firme. Firma bez koordinata nema
              gde da se pokaže — stavka je onemogućena i kaže zašto. */}
          {company?.lat !== undefined && company?.lng !== undefined ? (
            <DropdownMenuItem
              render={<Link href={`/leadovi?tab=map&firma=${companyId}`} />}
            >
              <MapPin />
              Prikaži na mapi
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled>
              <MapPinOff />
              Nema koordinata za mapu
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
