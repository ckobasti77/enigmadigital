import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Provider } from "@/convex/lib/providers";

/** Display names for each integration, shared across the Settings surface. */
export const PROVIDER_LABELS: Record<Provider, string> = {
  ga4: "Google Analytics 4",
  meta_ig: "Instagram",
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
  openreply: "OpenReply",
};

type Tone = "success" | "warning" | "danger" | "muted" | "accent";

const pillClasses: Record<Tone, string> = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  muted: "bg-surface-raised text-text-muted",
  accent: "bg-accent-400/10 text-accent-400",
};

const dotClasses: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  muted: "bg-text-muted",
  accent: "bg-accent-400",
};

/** Small status chip: a colored dot + label. Reused for connection + sync status. */
export function StatusPill({
  tone,
  children,
  pulse = false,
}: {
  tone: Tone;
  children: ReactNode;
  pulse?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        pillClasses[tone],
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          dotClasses[tone],
          pulse && "motion-safe:animate-pulse",
        )}
      />
      {children}
    </span>
  );
}
