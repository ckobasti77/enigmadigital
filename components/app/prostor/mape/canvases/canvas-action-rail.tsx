"use client";


// Preneto iz Devotion apps/web/components/workspace/canvases/canvas-action-rail.tsx (main @ c05c40f), SPAJANJE S14.
import type { ComponentType, KeyboardEvent } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatNumber, pluralSr } from "@/lib/format";
import { cn } from "@/lib/utils";

import styles from "@/components/app/prostor/mape/canvases/canvas-action-rail.module.css";

export type CanvasActionRailIcon = ComponentType<{ className?: string }>;

export type CanvasActionRailItem = {
  id: string;
  label: string;
  icon: CanvasActionRailIcon;
  onSelect: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  tone?: "neutral" | "note" | "task";
};

export type CanvasActionRailSection = {
  id: string;
  items: CanvasActionRailItem[];
  variant?: "actions" | "switch";
  ariaLabel?: string;
};

/** „1 stavka", „3 stavke", „12 stavki". */
function itemsLabel(count: number) {
  return `${formatNumber(count)} ${pluralSr(count, "stavka", "stavke", "stavki")}`;
}

export function CanvasActionRail({
  ariaLabel,
  identity,
  sections,
  className,
}: {
  ariaLabel: string;
  identity: {
    label: string;
    icon: CanvasActionRailIcon;
    count?: number;
    pendingCount?: number;
    className?: string;
  };
  sections: CanvasActionRailSection[];
  className?: string;
}) {
  const IdentityIcon = identity.icon;
  const visibleSections = sections.filter((section) => section.items.length > 0);
  const identityDescription = [
    identity.label,
    identity.count === undefined ? null : itemsLabel(identity.count),
    identity.pendingCount ? `${identity.pendingCount} na čekanju` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <TooltipProvider delay={350}>
      <div
        className={cn(
          styles.rail,
          "nodrag nopan nowheel",
          className,
        )}
        role="toolbar"
        aria-label={ariaLabel}
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <Tooltip>
          <TooltipTrigger render={<div className={cn(
                styles.item,
                styles.expandable,
                styles.identity,
                "bg-surface-control text-foreground",
                identity.className,
              )}
              aria-label={identityDescription}
              tabIndex={0} />}>
              <span className={styles.label} aria-hidden="true">
                <span className={cn(styles.labelText, "text-xs font-semibold")}>
                  {identity.label}
                </span>
                {identity.count === undefined ? null : (
                  <span className={styles.count}>{identity.count}</span>
                )}
              </span>
              <span className={styles.iconCell} aria-hidden="true">
                <IdentityIcon className="size-4" />
                {identity.pendingCount ? (
                  <span className={styles.pendingDot} />
                ) : null}
              </span>
            </TooltipTrigger>
          <TooltipContent side="left">
            {identityDescription}
          </TooltipContent>
        </Tooltip>

        {visibleSections.map((section) => (
          <div
            key={section.id}
            className={
              section.variant === "switch"
                ? styles.switchSection
                : "contents"
            }
            role={section.variant === "switch" ? undefined : "group"}
            aria-label={
              section.variant === "switch"
                ? undefined
                : (section.ariaLabel ?? section.id)
            }
          >
            <span className={styles.separator} aria-hidden="true" />
            {section.variant === "switch" ? (
              <div
                className={styles.switchGroup}
                role="radiogroup"
                aria-label={section.ariaLabel ?? section.id}
              >
                {section.items.map((item, index) => {
                  const Icon = item.icon;
                  const activeIndex = section.items.findIndex(
                    (candidate) => candidate.active && !candidate.disabled,
                  );
                  const firstEnabledIndex = section.items.findIndex(
                    (candidate) => !candidate.disabled,
                  );
                  const moveSelection = (
                    event: KeyboardEvent<HTMLButtonElement>,
                  ) => {
                    const keys = [
                      "ArrowUp",
                      "ArrowDown",
                      "ArrowLeft",
                      "ArrowRight",
                      "Home",
                      "End",
                    ];
                    if (!keys.includes(event.key)) return;
                    event.preventDefault();
                    const enabledIndexes = section.items.flatMap(
                      (candidate, candidateIndex) =>
                        candidate.disabled ? [] : [candidateIndex],
                    );
                    if (enabledIndexes.length === 0) return;
                    const currentPosition = Math.max(
                      0,
                      enabledIndexes.indexOf(index),
                    );
                    const nextPosition =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? enabledIndexes.length - 1
                          : event.key === "ArrowUp" ||
                              event.key === "ArrowLeft"
                            ? (currentPosition -
                                1 +
                                enabledIndexes.length) %
                              enabledIndexes.length
                            : (currentPosition + 1) %
                              enabledIndexes.length;
                    const nextIndex = enabledIndexes[nextPosition];
                    section.items[nextIndex].onSelect();
                    const nextButton =
                      event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(
                        `[data-switch-index="${nextIndex}"]`,
                      );
                    nextButton?.focus();
                  };

                  return (
                    <Tooltip key={item.id}>
                      <TooltipTrigger render={<button type="button"
                          role="radio"
                          data-switch-index={index}
                          className={cn(
                            styles.switchItem,
                            styles.button,
                            item.className,
                          )}
                          aria-label={item.label}
                          aria-checked={Boolean(item.active)}
                          tabIndex={
                            item.active ||
                            (activeIndex < 0 && index === firstEnabledIndex)
                              ? 0
                              : -1
                          }
                          disabled={item.disabled}
                          onClick={item.onSelect}
                          onKeyDown={moveSelection} />}>
                          {item.active ? (
                            <span
                              className={cn(
                                styles.switchIndicator,
                                item.tone === "note" &&
                                  styles.switchIndicatorNote,
                                item.tone === "task" &&
                                  styles.switchIndicatorTask,
                              )}
                              aria-hidden="true"
                            />
                          ) : null}
                          <Icon
                            className={cn(styles.switchIcon, "size-4")}
                          />
                        </TooltipTrigger>
                      <TooltipContent side="left">
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            ) : (
              section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Tooltip key={item.id}>
                    <TooltipTrigger render={<button type="button"
                        className={cn(
                          styles.item,
                          styles.expandable,
                          styles.actionItem,
                          styles.button,
                          "bg-card text-foreground",
                          item.active &&
                            "bg-surface-control-hover text-foreground ring-1 ring-line-strong",
                          item.className,
                        )}
                        aria-label={item.label}
                        aria-pressed={
                          item.active === undefined
                            ? undefined
                            : item.active
                        }
                        disabled={item.disabled}
                        onClick={item.onSelect} />}>
                        <span className={styles.label} aria-hidden="true">
                          <span
                            className={cn(
                              styles.labelText,
                              "text-xs font-semibold",
                            )}
                          >
                            {item.label}
                          </span>
                        </span>
                        <span
                          className={styles.iconCell}
                          aria-hidden="true"
                        >
                          <Icon className="size-4" />
                        </span>
                      </TooltipTrigger>
                    <TooltipContent side="left">
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                );
              })
            )}
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}
