"use client";

import * as React from "react";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "@/lib/utils";

/**
 * Kartice (P11): Base UI Tabs, sa tastaturom (strelice, Home/End) i
 * `aria` vezama između kartice i panela.
 *
 * Dva izgleda, kao u Devotionu:
 * - `line` (kartice ekrana: oblast, Korpa) — isti izgled kao `TabNav`:
 *   podvučena izabrana kartica u boji radnje, ostale prigušene;
 * - `pill` (prekidač prikaza: Lista · Tabla) — izabrana kartica je podignuta
 *   površina, bez boje.
 *
 * Izabrana kartica nosi Base UI atribut `data-active` (ne Radix atribut
 * stanja). Pod `pointer: coarse` kartica ima najmanje 44 px.
 */
type TabsVarijanta = "line" | "pill";

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-3", className)}
      {...props}
    />
  );
}

function TabsList({
  className,
  variant = "line",
  ...props
}: TabsPrimitive.List.Props & { variant?: TabsVarijanta }) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(
        "group/tabs",
        variant === "line"
          ? "tab-scroll flex max-w-full items-center gap-1 border-b border-line"
          : "inline-flex w-fit items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap text-ui font-medium text-text-muted outline-none transition-colors duration-(--duration-fast) ease-(--ease-ui) hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-disabled:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        // line: podvučena kartica ekrana (kao TabNav)
        "group-data-[variant=line]/tabs:-mb-px group-data-[variant=line]/tabs:border-b-2 group-data-[variant=line]/tabs:border-transparent group-data-[variant=line]/tabs:px-3.5 group-data-[variant=line]/tabs:py-2 group-data-[variant=line]/tabs:pointer-coarse:min-h-11",
        "group-data-[variant=line]/tabs:hover:border-line-soft group-data-[variant=line]/tabs:data-active:border-radnja group-data-[variant=line]/tabs:data-active:text-foreground",
        // pill: prekidač prikaza
        "group-data-[variant=pill]/tabs:h-8 group-data-[variant=pill]/tabs:rounded-md group-data-[variant=pill]/tabs:px-2.5 group-data-[variant=pill]/tabs:pointer-coarse:min-h-11",
        "group-data-[variant=pill]/tabs:data-active:bg-surface-raised group-data-[variant=pill]/tabs:data-active:text-foreground group-data-[variant=pill]/tabs:data-active:shadow-elev-1",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn(
        "outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
