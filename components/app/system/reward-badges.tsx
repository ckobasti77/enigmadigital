"use client";

import type { ComponentType } from "react";
import { Flame, Lock } from "lucide-react";
import { CountUp } from "@/components/motion/count-up";
import { formatNumber, pluralSr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProgressBar } from "./progress";

/**
 * ============================================================================
 * NAGRADE — XP traka, bedž nivoa, niz, dostignuće (UI Boost §3.7, §5.8)
 * ============================================================================
 *
 * Četvrta uloga boje: napredak i nagrada. Zlatna (`--xp`) se u sistemu ne
 * koristi ni za šta drugo, pa „zlatno = zaradio sam" ostaje naučen signal.
 *
 * Ove komponente su PRIKAZ. Ne znaju pravila: koliko XP-a nosi koja radnja,
 * koji nivo je koji rang i kada niz puca odlučuje `convex/lib/napredak.ts`,
 * na jednom mestu. Zato bedž nivoa prima `tier`, a ne računa ga.
 */

type BadgeIcon = ComponentType<{ className?: string }>;

/** XP traka: „1.240 / 1.500 XP". Broj se kotrlja, traka se pomeri. */
export function XpBar({
  xp,
  from,
  to,
  level,
  compact = false,
  className,
}: {
  /** Ukupan XP. */
  xp: number;
  /** Prag tekućeg nivoa. */
  from: number;
  /** Prag sledećeg nivoa. */
  to: number;
  level?: number;
  /** Samo traka, bez reda sa brojevima (kartica igrača u bočnoj traci). */
  compact?: boolean;
  className?: string;
}) {
  const label =
    level !== undefined ? `XP do nivoa ${level + 1}` : "XP do sledećeg nivoa";
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {!compact && (
        <div className="flex items-baseline justify-between gap-3 text-meta">
          <span className="truncate text-text-muted">{label}</span>
          <span className="shrink-0 font-mono tabular-nums text-xp">
            {/* `from` = sama vrednost: pri otvaranju broj stoji, kotrlja se
                tek kad XP stvarno poraste. */}
            <CountUp value={xp} from={xp} format={formatNumber} />
            <span className="text-text-muted"> / {formatNumber(to)} XP</span>
          </span>
        </div>
      )}
      <ProgressBar
        value={xp - from}
        max={to - from}
        tone="xp"
        size={compact ? "sm" : "md"}
        label={label}
      />
    </div>
  );
}

export type Tier = "bronze" | "silver" | "gold" | "platinum" | "diamond";

const TIER_COLOR: Record<Tier, string> = {
  bronze: "text-tier-bronze",
  silver: "text-tier-silver",
  gold: "text-tier-gold",
  platinum: "text-tier-platinum",
  diamond: "text-tier-diamond",
};

const TIER_LABEL: Record<Tier, string> = {
  bronze: "bronza",
  silver: "srebro",
  gold: "zlato",
  platinum: "platina",
  diamond: "dijamant",
};

const LEVEL_SIZE = {
  sm: { box: "size-6", text: "text-meta" },
  md: { box: "size-9", text: "text-ui" },
  lg: { box: "size-14", text: "text-title" },
} as const;

/** Bedž nivoa: heksagon u boji ranga, sa brojem. */
export function LevelBadge({
  level,
  tier,
  rank,
  size = "md",
  className,
}: {
  level: number;
  tier: Tier;
  /** Zvanje („Operativac") — ulazi u naziv za čitač ekrana. */
  rank?: string;
  size?: keyof typeof LEVEL_SIZE;
  className?: string;
}) {
  const s = LEVEL_SIZE[size];
  const name = `Nivo ${level}${rank ? `, ${rank}` : ""} (${TIER_LABEL[tier]})`;
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        s.box,
        TIER_COLOR[tier],
        className,
      )}
    >
      <svg viewBox="0 0 40 40" className="absolute inset-0 size-full" aria-hidden>
        {/* Potez iste boje zaobljuje temena heksagona. */}
        <path
          d="M20 4 33.5 12v16L20 36 6.5 28V12Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth={4}
          strokeLinejoin="round"
        />
        <path
          d="M20 4 33.5 12v16L20 36 6.5 28V12Z"
          fill="none"
          style={{ stroke: "var(--material-edge-strong)" }}
          strokeWidth={1}
          strokeLinejoin="round"
        />
      </svg>
      <span
        className={cn(
          "relative font-mono font-bold leading-none text-text-inverse tabular-nums",
          s.text,
        )}
      >
        {level}
      </span>
    </span>
  );
}

/**
 * Niz dana. „U opasnosti" (posle 17 h, dan još nije uračunat) nosi i tekst,
 * ne samo topliju boju — i ne treperi: beskonačna animacija na radnom ekranu
 * je šum.
 */
export function StreakFlame({
  days,
  state = "active",
  size = "md",
  className,
}: {
  days: number;
  state?: "active" | "at-risk" | "idle";
  size?: "sm" | "md";
  className?: string;
}) {
  const idle = state === "idle" || days <= 0;
  const atRisk = !idle && state === "at-risk";
  const text = idle
    ? "Niz nije započet"
    : `Niz: ${days} ${pluralSr(days, "dan", "dana", "dana")} zaredom${atRisk ? ", u opasnosti" : ""}`;
  return (
    <span
      title={text}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 font-mono font-bold leading-none tabular-nums",
        size === "sm" ? "text-ui" : "text-copy",
        idle ? "text-text-muted" : "text-foreground",
        className,
      )}
    >
      <Flame
        aria-hidden
        className={cn(
          size === "sm" ? "size-4" : "size-5",
          idle ? "text-text-muted" : atRisk ? "text-streak-hot" : "text-streak",
        )}
      />
      <span aria-hidden>{idle ? 0 : days}</span>
      {atRisk && size === "md" && (
        <span aria-hidden className="font-sans text-meta font-medium text-streak">
          u opasnosti
        </span>
      )}
      <span className="sr-only">{text}</span>
    </span>
  );
}

export type Rarity = "common" | "rare" | "epic" | "legendary";

const RARITY: Record<Rarity, { vars: string; label: string }> = {
  common: { vars: "[--rar:var(--rarity-common)]", label: "Obično" },
  rare: { vars: "[--rar:var(--rarity-rare)]", label: "Retko" },
  epic: { vars: "[--rar:var(--rarity-epic)]", label: "Epsko" },
  legendary: { vars: "[--rar:var(--rarity-legendary)]", label: "Legendarno" },
};

/**
 * Dostignuće. Zaključano je tiho i sa katancem — vidi se da postoji i šta
 * traži, ali ne svetli. Otključano nosi boju retkosti; obojenu senku ima
 * samo legendarno.
 */
export function AchievementBadge({
  icon: Icon,
  title,
  description,
  rarity,
  locked = false,
  progress,
  unlockedAt,
  size = "md",
  className,
}: {
  icon: BadgeIcon;
  title: string;
  /** Šta je trebalo (ili treba) uraditi. */
  description?: string;
  rarity: Rarity;
  locked?: boolean;
  /** Dokle se stiglo na zaključanom („3 / 10") — već formatirano. */
  progress?: string;
  /** Već formatiran datum otključavanja. */
  unlockedAt?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const r = RARITY[rarity];
  const meta = locked
    ? progress
      ? `Zaključano · ${progress}`
      : "Zaključano"
    : unlockedAt
      ? `${r.label} · ${unlockedAt}`
      : r.label;
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3",
        size === "sm" && "gap-2",
        r.vars,
        className,
      )}
    >
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-full border",
          size === "sm" ? "size-9" : "size-12",
          locked
            ? "border-line-soft bg-surface-raised/40 text-text-muted"
            : "border-(--rar) bg-[color-mix(in_oklab,var(--rar)_14%,var(--surface))] text-(--rar)",
          !locked && rarity === "legendary" && "shadow-reward",
        )}
      >
        <Icon className={size === "sm" ? "size-4" : "size-5"} aria-hidden />
        {locked && (
          <span className="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full border border-line bg-surface-raised text-text-muted">
            <Lock className="size-2.5" aria-hidden />
          </span>
        )}
      </span>
      <div className="min-w-0">
        <p
          className={cn(
            "truncate text-ui font-medium",
            locked ? "text-text-muted" : "text-foreground",
          )}
        >
          {title}
        </p>
        {description && size === "md" && (
          <p className="truncate text-meta text-text-muted">{description}</p>
        )}
        <p
          className={cn(
            "truncate text-meta",
            locked ? "text-text-muted" : "text-(--rar)",
          )}
        >
          {meta}
        </p>
      </div>
    </div>
  );
}
