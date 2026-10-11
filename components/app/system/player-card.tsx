import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ProgressRing } from "./progress";
import { LevelBadge, StreakFlame, XpBar, type Tier } from "./reward-badges";

/**
 * ============================================================================
 * KARTICA IGRAČA — dno bočne trake (UI Boost §7.1)
 * ============================================================================
 *
 * Ko radi i koliko je napredovao, na mestu koje se vidi sa svakog ekrana.
 * Komponenta je PRIKAZ: ne čita Convex i ne zna pravila napretka. Ko je montira
 * daje joj tri stvari, i od njih zavisi oblik:
 *
 *   bez `progress`      identitet — inicijali, naslov i jedan red ispod
 *   `progress="off"`    isto, a red ispod kaže „Napredak isključen"
 *   `progress={…}`      bedž nivoa, zvanje, plamen niza i XP traka
 *
 * U šini ikonica nema mesta za traku, pa XP nosi prsten oko bedža nivoa.
 *
 * Visina je ista u sva tri oblika, pa uključivanje napretka ne pomera
 * navigaciju iznad kartice. Sa `href` je cela kartica veza; bez njega nije
 * klikabilna — kartica ne nudi klik koji nikuda ne vodi.
 *
 * Zlatna (XP traka) je ovde jedina boja, i to namerno: kartica nije modul
 * nego nagrada, pa ne čita `--mod`.
 */
export type PlayerProgress = {
  /** Zvanje („Operativac"). */
  rank: string;
  level: number;
  tier: Tier;
  /** Ukupan XP i pragovi tekućeg i sledećeg nivoa. */
  xp: number;
  xpFrom: number;
  xpTo: number;
  streakDays: number;
  streakState?: "active" | "at-risk" | "idle";
};

/** Do dva slova: prva slova prve dve reči, ili prva dva slova jedine. */
export function initialsOf(text: string | null | undefined): string {
  const words = (text ?? "").trim().split(/[\s@._-]+/).filter(Boolean);
  if (words.length === 0) return "—";
  const letters =
    words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0];
  return letters.toLocaleUpperCase("sr-Latn");
}

/** Monogram osobe. Neutralan: osoba nije modul, pa nema boju mesta. */
export function PlayerAvatar({
  initials,
  size = "md",
  className,
}: {
  initials: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-surface-raised font-bold leading-none text-foreground ring-1 ring-line",
        size === "sm" ? "size-7 text-meta" : "size-8 text-meta",
        className,
      )}
    >
      {initials}
    </span>
  );
}

export function PlayerCard({
  initials,
  title,
  subtitle,
  progress,
  href,
  rail = false,
  loading = false,
  className,
}: {
  initials: string;
  /** Prvi red u obliku identiteta: ime radnog prostora. */
  title: string;
  /** Drugi red u obliku identiteta: nalog. */
  subtitle?: string;
  progress?: PlayerProgress | "off";
  /** Kuda vodi klik (ekran napretka). Bez veze kartica nije klikabilna. */
  href?: string;
  /** Šina ikonica: ostaje samo monogram, odnosno bedž nivoa. */
  rail?: boolean;
  loading?: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <div
        className={cn(
          "flex h-12 min-w-0 items-center gap-2.5 rounded-lg px-2",
          rail && "justify-center px-0",
          className,
        )}
      >
        <Skeleton className="size-8 shrink-0 rounded-full" />
        {!rail && (
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2.5 w-28" />
          </div>
        )}
      </div>
    );
  }

  const on = progress !== undefined && progress !== "off" ? progress : null;
  const name = on
    ? `Napredak: ${on.rank}, nivo ${on.level}`
    : progress === "off"
      ? `${title}. Napredak je isključen.`
      : title;

  const mark = on ? (
    <LevelBadge level={on.level} tier={on.tier} rank={on.rank} />
  ) : (
    <PlayerAvatar initials={initials} />
  );

  const body = rail ? (
    on ? (
      <ProgressRing
        value={on.xp - on.xpFrom}
        max={on.xpTo - on.xpFrom}
        size={40}
        stroke={3}
        tone="xp"
        label={`XP do nivoa ${on.level + 1}`}
      >
        <LevelBadge level={on.level} tier={on.tier} rank={on.rank} size="sm" />
      </ProgressRing>
    ) : (
      mark
    )
  ) : on ? (
    <>
      {mark}
      <span data-nav-fade className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-ui font-medium text-foreground">
            {on.rank}
          </span>
          <StreakFlame
            days={on.streakDays}
            state={on.streakState}
            size="sm"
          />
        </span>
        <XpBar
          xp={on.xp}
          from={on.xpFrom}
          to={on.xpTo}
          level={on.level}
          compact
        />
      </span>
    </>
  ) : (
    <>
      {mark}
      <span data-nav-fade className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-ui font-medium text-foreground">
          {title}
        </span>
        <span className="truncate text-meta text-text-muted">
          {progress === "off" ? "Napredak isključen" : (subtitle ?? "—")}
        </span>
      </span>
    </>
  );

  const shape = cn(
    "flex h-12 min-w-0 items-center gap-2.5 rounded-lg px-2",
    rail && "justify-center px-0",
    className,
  );

  if (!href) {
    return (
      <div className={shape} title={rail ? name : undefined}>
        {body}
        {rail && <span className="sr-only">{name}</span>}
      </div>
    );
  }

  return (
    <Link
      href={href}
      aria-label={name}
      title={rail ? name : undefined}
      className={cn(
        shape,
        "cursor-pointer transition-colors hover:bg-sidebar-accent/60",
      )}
    >
      {body}
    </Link>
  );
}
