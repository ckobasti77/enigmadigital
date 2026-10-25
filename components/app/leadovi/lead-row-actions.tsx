"use client";

import Link from "next/link";
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
import { useProjekatMutation } from "@/components/app/projekat-provider";
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
  companyId,
  current,
  onNeedsNote,
  onError,
}: {
  companyId: Id<"leadCompanies">;
  current: LeadStage;
  onNeedsNote: (stage: LeadStage) => void;
  onError: (message: string) => void;
}) {
  const setStage = useProjekatMutation(api.leadCrmStore.setStage);
  return async (stage: LeadStage) => {
    if (stage === current) return;
    if (stageRequiresNote(stage)) {
      onNeedsNote(stage);
      return;
    }
    try {
      await setStage({ companyId, stage });
    } catch (err) {
      onError(getErrorMessage(err));
    }
  };
}

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
            <Icon className="text-mod" />
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
 * Kako se glavna radnja reda crta (UI Boost §4.2):
 *   - `full`  puno dugme u boji modula — SAMO aktivni red tabele (red pod
 *             kursorom tastature, ili prvi kad kursora nema);
 *   - `icon`  ghost ikonica — svi ostali redovi tabele; vidi se na hover ili
 *             fokus reda;
 *   - `card`  tinta modula sa natpisom — kartice (telefon, radni redovi).
 * Izmereno 11.10.2026: 25 istih cijan dugmadi „Pozovi" u tabeli — jedina boja
 * na ekranu, ponovljena 25 puta, bila je šum umesto putokaza.
 */
export type ActionAppearance = "full" | "icon" | "card";

const ACTION_ICON: Record<PrimaryAction["kind"], typeof Phone> = {
  call: Phone,
  outcome: Activity,
  schedule: CalendarPlus,
  fill: PhoneOff,
  open: ExternalLink,
};

/**
 * Glavna radnja reda (A3, O2): jedna, i menja se po stanju — Pozovi →
 * Zabeleži ishod → Zakaži (vidi `primaryAction`). Ostalo je pod „…".
 */
export function LeadPrimaryButton({
  action,
  companyId,
  onCall,
  onOpenDialog,
  onFill,
  appearance = "card",
  className,
}: {
  action: PrimaryAction;
  companyId: Id<"leadCompanies">;
  onCall: (phone: string) => void;
  onOpenDialog: (kind: RowDialogKind) => void;
  /** Otvara dijalog dopune rupe „bez telefona"; bez njega „Dopuni" vodi na profil. */
  onFill?: () => void;
  appearance?: ActionAppearance;
  className?: string;
}) {
  // „Dopuni" bez dijaloga dopune je u stvari „Otvori profil".
  const kind: PrimaryAction["kind"] =
    action.kind === "fill" && !onFill ? "open" : action.kind;
  const label = action.kind === "fill" && !onFill ? "Otvori" : action.label;
  const Icon = ACTION_ICON[kind];
  // U tabeli je kolona radnji uska: pun natpis ostaje u oblačiću i za čitač.
  const natpis = appearance === "full" && kind === "outcome" ? "Ishod" : label;

  const shared = {
    variant:
      appearance === "full"
        ? ("primary" as const)
        : appearance === "icon"
          ? ("ghost" as const)
          : ("secondary" as const),
    size: appearance === "icon" ? ("icon-sm" as const) : ("sm" as const),
    title: appearance === "card" ? undefined : label,
    "aria-label": appearance === "card" ? undefined : label,
    "data-primary-action": kind,
    className: cn(appearance === "icon" && "text-mod hover:text-mod", className),
  };
  const body = (
    <>
      <Icon data-icon={appearance === "icon" ? undefined : "inline-start"} aria-hidden />
      {appearance !== "icon" && natpis}
    </>
  );

  switch (kind) {
    case "call":
      return (
        <Button
          {...shared}
          render={<a href={telHref(action.phone ?? "")} />}
          nativeButton={false}
          onClick={() => onCall(action.phone ?? "")}
        >
          {body}
        </Button>
      );
    case "outcome":
      return (
        <Button {...shared} onClick={() => onOpenDialog("outcome")}>
          {body}
        </Button>
      );
    case "schedule":
      return (
        <Button {...shared} onClick={() => onOpenDialog("meeting")}>
          {body}
        </Button>
      );
    case "fill":
      return (
        <Button {...shared} onClick={onFill}>
          {body}
        </Button>
      );
    case "open":
      return (
        <Button
          {...shared}
          render={<Link href={`/leadovi/${companyId}`} />}
          nativeButton={false}
        >
          {body}
        </Button>
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
  item,
  now,
  selfUserId,
  onCall,
  onOpenDialog,
  onOpenStageDialog,
  onError,
  onFill,
  appearance = "card",
  className,
}: {
  item: LeadRowItem;
  now: number;
  selfUserId?: string;
  onCall: (phone: string) => void;
  onOpenDialog: (kind: RowDialogKind) => void;
  onOpenStageDialog: (stage: LeadStage) => void;
  onError: (message: string) => void;
  /** Dopuna rupe „bez telefona" (A3): kad je nema, „Dopuni" vodi na profil. */
  onFill?: () => void;
  /** `icon` se vidi tek na hover ili fokus reda (`group/row`); vidi `ActionAppearance`. */
  appearance?: ActionAppearance;
  className?: string;
}) {
  const { assignment, company } = item;
  const companyId = assignment.companyId;
  const assignLead = useProjekatMutation(api.leadCrmStore.assignLead);
  const pickStage = useStagePick({
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
    <div
      className={cn(
        "flex items-center justify-end gap-1",
        // Miran red je tih: ikonice se pojave kad je red pod mišem, kad je
        // fokus u njemu ili dok je njegov meni otvoren. Na dodir (bez hover-a)
        // su uvek tu — inače bi bile nedohvatljive.
        appearance === "icon" &&
          "opacity-0 transition-opacity duration-(--duration-fast) group-hover/row:opacity-100 group-focus-within/row:opacity-100 has-aria-expanded:opacity-100 [@media(hover:none)]:opacity-100",
        className,
      )}
    >
      <LeadPrimaryButton
        action={action}
        companyId={companyId}
        onCall={onCall}
        onOpenDialog={onOpenDialog}
        onFill={onFill}
        appearance={appearance}
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
