import { Camera, Layers, Users } from "lucide-react";
import {
  PLATFORM_LABELS,
  PLATFORM_SHORT_LABELS,
  type AutomationPlatform,
} from "@/convex/lib/orPlatform";
import { cn } from "@/lib/utils";

/**
 * Which platform something belongs to, said in words.
 *
 * The icon is decoration and is marked as such: lucide ships no brand marks, so
 * a camera is not "Instagram" to anyone who has not been told, and a screen
 * that carries two platforms cannot afford a label only regulars can read. The
 * text is the identification; the icon only makes it findable at a glance.
 *
 * Cyan stays out of it. A platform is not an interactive element and not a key
 * metric, and lighting every card in the list with the accent colour would
 * spend it on something nobody has to act on.
 */
export function PlatformBadge({
  platform,
  short = false,
  className,
}: {
  platform: AutomationPlatform;
  /** Short label for a row that already carries other badges. */
  short?: boolean;
  className?: string;
}) {
  const Icon =
    platform === "facebook" ? Users : platform === "both" ? Layers : Camera;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border border-line-soft bg-surface-raised px-1.5 py-0.5 text-micro font-medium text-text-secondary",
        className,
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {short ? PLATFORM_SHORT_LABELS[platform] : PLATFORM_LABELS[platform]}
    </span>
  );
}
