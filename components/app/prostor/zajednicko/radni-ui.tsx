// Preneto iz Devotion apps/web/components/workspace/workspace-ui.tsx (main @ c05c40f), SPAJANJE S09.
import type { ComponentType, ReactNode } from "react";
import {
  Blocks,
  Code2,
  Megaphone,
  MoreHorizontal,
  ShoppingBag,
} from "lucide-react";

import { ProjekatZnak } from "@/components/app/projekat-znak";
import { EmptyState as SistemPrazno } from "@/components/app/system/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge, type BadgeTon } from "@/components/ui/badge";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatClockTime, formatShortDateAt } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  AREA_META,
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  type AreaKey,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/prostor/web/projekat";
import { pageKindMeta, type PageKind } from "@/lib/prostor/web/vrste-stranica";

export const AREA_ICONS: Record<AreaKey, ComponentType<{ className?: string }>> = {
  dev: Code2,
  marketing: Megaphone,
  sales: ShoppingBag,
  other: MoreHorizontal,
};

/**
 * Oblasti nemaju boju (kao u Devotionu): boja u Enigmi nosi mesto, radnju,
 * stanje, kategoriju podataka, nagradu ili identitet projekta, a oblast nije
 * ništa od toga. Ključevi ostaju zbog postojećih poziva.
 */
const AREA_NEUTRAL = "text-text-secondary";

export const AREA_TINTS: Record<AreaKey, string> = {
  dev: AREA_NEUTRAL,
  marketing: AREA_NEUTRAL,
  sales: AREA_NEUTRAL,
  other: AREA_NEUTRAL,
};

export function getAreaTint(key: string): string {
  return AREA_TINTS[key as AreaKey] || AREA_NEUTRAL;
}

export function getAreaDescription(key: string): string {
  return AREA_META[key as AreaKey]?.description || "Korisnički definisana oblast projekta";
}

export function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

/** Avatar osobe: slika profila, a dok je nema inicijali (krug, neutralan). */
export function ProfileAvatar({
  profile,
  className,
}: {
  profile: { displayName: string; avatarUrl?: string | null };
  className?: string;
}) {
  return (
    <Avatar className={className}>
      {profile.avatarUrl ? (
        <AvatarImage src={profile.avatarUrl} alt={profile.displayName} />
      ) : null}
      <AvatarFallback>{getInitials(profile.displayName)}</AvatarFallback>
    </Avatar>
  );
}

/** Značka vrste stranice: ista mirna pločica za svaku vrstu, boja je kategorija. */
export function PageKindBadge({
  kind,
  className,
}: {
  kind: PageKind;
  className?: string;
}) {
  const meta = pageKindMeta(kind);
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-md bg-surface-raised",
        meta.textClass,
        className,
      )}
      aria-hidden="true"
    >
      <Icon className="size-4" />
    </span>
  );
}

/**
 * Znak projekta (logo ili inicijali u boji projekta). Veličina i oblik se
 * menjaju kroz `className` (npr. `size-14 rounded-xl`).
 */
export function ProjekatLogo({
  workspace,
  className,
}: {
  workspace: { name: string; logoUrl?: string | null; boja?: string | null };
  className?: string;
}) {
  return (
    <ProjekatZnak
      oznaka
      velicina="md"
      projekat={{
        ime: workspace.name,
        boja: workspace.boja ?? null,
        logoUrl: workspace.logoUrl ?? null,
      }}
      className={cn("size-8 rounded-lg text-ui", className)}
    />
  );
}

export const StartupLogo = ProjekatLogo;

// Stanje zadatka je STANJE (uloga 3 boje): gotovo = uspeh, čeka = upozorenje,
// u toku = informacija; neplanirano i sledeće su neutralni.
const STATUS_TON: Record<TaskStatus, BadgeTon> = {
  backlog: "muted",
  next: "neutral",
  in_progress: "info",
  blocked: "warning",
  done: "success",
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge ton={STATUS_TON[status]} className="gap-1.5">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {TASK_STATUS_META[status].label}
    </Badge>
  );
}

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-meta text-text-secondary">
      <span
        aria-hidden="true"
        className={cn("size-2 rounded-full", TASK_PRIORITY_META[priority].dotClass)}
      />
      {TASK_PRIORITY_META[priority].label}
    </span>
  );
}

/**
 * Prazno stanje: jedna rečenica i jedna radnja, bez ilustracije. `screen` =
 * ceo prikaz je prazan (crta ga sistemsko prazno stanje); `section` = prazna
 * sekcija (jedan red, bez okvira).
 */
export function EmptyState({
  icon: Icon = Blocks,
  title,
  description,
  action,
  className,
  size = "screen",
  headingAs,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  size?: "screen" | "section";
  /**
   * Nivo naslova: „h2“ kad je prazno stanje odmah ispod h1 prikaza (bez
   * preskoka nivoa). Sistemsko prazno stanje ume samo h1/h2, pa „h3“ (i
   * podrazumevano) piše naslov kao običan pasus.
   */
  headingAs?: "h2" | "h3";
}) {
  if (size === "section") {
    return (
      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-2 text-ui", className)}>
        <p className="text-text-muted">
          {title}
          {description ? ` ${description}` : null}
        </p>
        {action}
      </div>
    );
  }
  return (
    <SistemPrazno
      icon={Icon}
      title={title}
      size="sm"
      action={action}
      heading={headingAs === "h2" ? "h2" : undefined}
      className={className}
    >
      {description}
    </SistemPrazno>
  );
}

/**
 * Zaglavlje ekrana: jedan `h1` + meta u istom redu, radnje desno, opcioni red
 * kartica ili filtera ispod. Bez nadnaslova i bez podnaslova-rečenice.
 */
export function ScreenHeader({
  title,
  meta,
  actions,
  below,
  className,
}: {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  below?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h1 className="min-w-0 truncate text-title text-foreground">{title}</h1>
          {meta !== undefined && meta !== null ? (
            <span className="shrink-0 text-ui tabular-nums text-text-muted">{meta}</span>
          ) : null}
        </div>
        {actions ? <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {below ? <div className="mt-4">{below}</div> : null}
    </header>
  );
}

/** Naslov sekcije: 13 px, normalna slova, broj kao meta. */
export function SectionHeading({
  id,
  title,
  count,
  action,
  as: Heading = "h2",
  className,
}: {
  id?: string;
  title: ReactNode;
  count?: ReactNode;
  action?: ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={cn("mb-2 flex min-h-8 items-center justify-between gap-3", className)}>
      <Heading id={id} className="flex min-w-0 items-baseline gap-2 text-ui font-semibold text-foreground">
        <span className="min-w-0 truncate">{title}</span>
        {count !== undefined && count !== null ? (
          <span className="shrink-0 font-normal tabular-nums text-text-muted">{count}</span>
        ) : null}
      </Heading>
      {action ? <div className="flex shrink-0 items-center gap-1">{action}</div> : null}
    </div>
  );
}

/** „15. avg 14:35“ — datum i vreme aktivnosti. */
export function formatActivityTime(timestamp: number) {
  return `${formatShortDateAt(timestamp)} ${formatClockTime(timestamp)}`;
}

export function isToday(timestamp: number | null) {
  if (timestamp === null) return false;
  const date = new Date(timestamp);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

export function memberById(
  members: Array<{ profile: Doc<"profiles"> }>,
  profileId: Doc<"profiles">["_id"] | null,
) {
  if (profileId === null) return null;
  return members.find((member) => member.profile._id === profileId)?.profile ?? null;
}
