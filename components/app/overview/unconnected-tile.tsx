"use client";

import { ProjekatLink } from "@/components/app/projekat-link";
import { ArrowUpRight, Unplug } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Pločica kanala koji još nije povezan. Ista visina kao `KpiTile`, da red
 * ostane ravan, i cela je JEDAN link ka Podešavanjima — ne broj koji glumi
 * nulu. Boju daje `data-module` roditelja, pa i nepovezan kanal ostaje u
 * svojoj boji: vidi se koji kanal fali, ne samo da nešto fali.
 */
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
    <ProjekatLink
      href="/settings"
      aria-label={`${label}: ${providerName} nije povezan — otvori Podešavanja`}
      className={cn(
        "group/tile hover-lift flex h-40 cursor-pointer flex-col rounded-xl border border-dashed border-line bg-card/40 px-5 pt-4 pb-4 transition-colors hover:border-mod-line",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-mod-soft text-mod">
          <Unplug className="size-3.5" aria-hidden />
        </span>
        <p className="heading-caps truncate text-meta font-medium text-text-muted">
          {label}
        </p>
      </div>
      <span className="mt-2 block font-mono text-metric font-bold leading-none text-text-muted">
        —
      </span>
      <p className="mt-2 text-ui text-text-muted">{providerName} nije povezan</p>
      <span className="mt-auto inline-flex items-center gap-1 text-ui font-medium text-mod">
        Poveži u Podešavanjima
        <ArrowUpRight className="size-3.5" aria-hidden />
      </span>
    </ProjekatLink>
  );
}
