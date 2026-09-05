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
  Phone,
  PhoneCall,
  Tag,
  UserCheck,
  Users,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { leadStageLabel } from "./lead-labels";
import { ALL_STAGES, stageRequiresNote } from "./lead-chips";
import { getErrorMessage } from "./lead-quick-dialogs";
import {
  isMeetingSoon,
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

const ICON_BUTTON = buttonVariants({ variant: "ghost", size: "icon-sm" });

/**
 * Ikona telefona / koverte (§5). Tri stanja, i nijedno ne laže:
 *  - nema kontakta  → prigušena ikona BEZ radnje, objašnjenje u tooltip-u
 *  - jedan kontakt  → `tel:` / `mailto:` link
 *  - više kontakata → padajući izbor, svaka stavka je link
 * Klik na `tel:` samo javlja roditelju da je poziv pokušan (O2).
 */
function ContactAction({
  kind,
  contacts,
  onPick,
}: {
  kind: "phone" | "email";
  contacts: LeadRowContact[];
  onPick?: (value: string) => void;
}) {
  const Icon = kind === "phone" ? Phone : Mail;
  const noun = kind === "phone" ? "broj" : "e-mail";

  if (contacts.length === 0) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              tabIndex={0}
              aria-disabled="true"
              aria-label={`Nema ${noun} u bazi`}
              className="inline-flex size-7 cursor-not-allowed items-center justify-center rounded-md text-text-muted/40 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          }
        >
          <Icon className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent>Nema {noun} u bazi</TooltipContent>
      </Tooltip>
    );
  }

  if (contacts.length === 1) {
    const only = contacts[0];
    const href = kind === "phone" ? telHref(only.value) : mailHref(only.value);
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <a
              href={href}
              onClick={() => onPick?.(only.value)}
              aria-label={`${kind === "phone" ? "Pozovi" : "Piši na"} ${only.value}`}
              className={cn(ICON_BUTTON, "text-foreground")}
            />
          }
        >
          <Icon className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent>
          <span className={cn(kind === "phone" && "font-mono tabular-nums")}>
            {only.value}
          </span>
          {only.personName && (
            <span className="ml-1.5 text-text-muted">· {only.personName}</span>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  const count = contacts.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${kind === "phone" ? "Pozovi" : "Piši"} — ${count} ${
              kind === "phone"
                ? pluralSr(count, "broj", "broja", "brojeva")
                : pluralSr(count, "adresa", "adrese", "adresa")
            }`}
            className="relative text-foreground"
          />
        }
      >
        <Icon className="size-3.5" />
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 rounded-full bg-surface-raised px-1 font-mono text-[9px] font-bold leading-[14px] tabular-nums text-foreground ring-1 ring-line"
        >
          {count}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          {kind === "phone" ? "Koji broj?" : "Koja adresa?"}
        </DropdownMenuLabel>
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
            <span
              className={cn(
                "truncate",
                kind === "phone" && "font-mono tabular-nums",
              )}
            >
              {c.value}
            </span>
            {c.personName && (
              <span className="ml-auto truncate pl-2 text-micro text-text-muted">
                {c.personName}
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Lista faza kao radio-stavke menija. Faza bez napomene se upisuje odmah;
 * „Dobijen”/„Izgubljen” traže obrazloženje, pa se za njih otvara dijalog.
 * Deli je meni u redu tabele i traka radnji na profilu.
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

/**
 * Kolona „Akcije” (§5): telefon, koverta, kalendar, tri tačke.
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
}: {
  workspaceId: Id<"workspaces">;
  item: LeadRowItem;
  now: number;
  selfUserId?: string;
  onCall: (phone: string) => void;
  onOpenDialog: (kind: RowDialogKind) => void;
  onOpenStageDialog: (stage: LeadStage) => void;
  onError: (message: string) => void;
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
  const meetingSoon = isMeetingSoon(assignment, now);

  return (
    <div className="flex items-center justify-end gap-0.5">
      <ContactAction kind="phone" contacts={item.telefoni} onPick={onCall} />
      <ContactAction kind="email" contacts={item.emailovi} />

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={
                meetingAt !== undefined
                  ? `Sastanak ${formatDayRelative(meetingAt, now)} u ${formatClockTime(meetingAt)} — izmeni`
                  : "Zakaži sastanak"
              }
              onClick={() => onOpenDialog("meeting")}
              className={cn(
                meetingAt === undefined && "text-text-muted",
                meetingAt !== undefined && !meetingSoon && "text-foreground",
                meetingSoon && "text-warning hover:text-warning",
              )}
            />
          }
        >
          {meetingAt !== undefined ? (
            <CalendarClock className="size-3.5" />
          ) : (
            <CalendarPlus className="size-3.5" />
          )}
        </TooltipTrigger>
        <TooltipContent>
          {meetingAt !== undefined ? (
            <>
              Sastanak{" "}
              <span className="font-semibold">
                {formatDayRelative(meetingAt, now)} u {formatClockTime(meetingAt)}
              </span>
              <span className="text-text-muted"> · izmeni ili otkaži</span>
            </>
          ) : (
            "Zakaži sastanak"
          )}
        </TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Više radnji"
              className="text-text-muted hover:text-foreground"
            />
          }
        >
          <Ellipsis className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="truncate">
              {company?.name ?? "Nepoznata firma"}
            </DropdownMenuLabel>
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
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
