import type { ComponentType } from "react";

/**
 * Branded, one-line empty state used by every not-yet-connected route.
 * A muted icon + a single line — no clutter.
 */
export function EmptyState({
  icon: Icon,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-24 text-center">
      <div className="flex size-12 items-center justify-center rounded-full border border-line-soft text-text-muted">
        <Icon className="size-5" />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
