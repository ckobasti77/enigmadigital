"use client";

import Link from "next/link";
import { ArrowUpRight, Unplug } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function UnconnectedTile({
  label,
  providerName,
  className,
}: {
  label: string;
  providerName: string;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "group relative flex h-40 flex-col justify-between border-dashed border-line-soft bg-surface/40 p-4 transition-colors hover:border-line-strong hover:bg-surface/60 shadow-card ring-line",
        className,
      )}
      size="sm"
    >
      <div>
        <div className="flex items-center justify-between gap-1">
          <p className="heading-caps text-xs font-medium text-text-muted">
            {label}
          </p>
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[0.625rem] font-medium text-warning">
            <span className="size-1 rounded-full bg-warning motion-safe:animate-pulse" />
            Čeka konekciju
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2 text-text-muted">
          <div className="flex size-7 items-center justify-center rounded-md border border-line-soft bg-surface-raised/50">
            <Unplug className="size-3.5 text-text-muted" />
          </div>
          <p className="text-xs text-text-muted">{providerName} nije povezan</p>
        </div>
      </div>

      <Link
        href="/settings"
        className="mt-auto flex items-center justify-between rounded-md border border-line-soft bg-surface-raised/40 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent-400/50 hover:bg-surface-raised hover:text-accent-400"
      >
        <span>Poveži u Podešavanjima</span>
        <ArrowUpRight className="size-3 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent-400" />
      </Link>
    </Card>
  );
}
