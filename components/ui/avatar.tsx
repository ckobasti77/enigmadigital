"use client";

import * as React from "react";
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
import { cn } from "@/lib/utils";

/**
 * Avatar osobe (P11): slika profila, a dok se ne učita ili je nema, inicijali.
 * Base UI Avatar sam bira između slike i zamene, bez treptaja polomljene
 * slike. Krug razlikuje osobu od projekta (`ProjekatZnak` je zaobljen
 * kvadrat). Inicijali su neutralni: boja projekta pripada samo znaku projekta.
 */
const VELICINA = {
  xs: "size-5 text-meta",
  sm: "size-6 text-meta",
  md: "size-8 text-meta",
  lg: "size-10 text-ui",
} as const;

type VelicinaAvatara = keyof typeof VELICINA;

function Avatar({
  className,
  size = "md",
  ...props
}: AvatarPrimitive.Root.Props & { size?: VelicinaAvatara }) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full border border-line-soft bg-surface-raised align-middle",
        VELICINA[size],
        className,
      )}
      {...props}
    />
  );
}

function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("size-full object-cover", className)}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: AvatarPrimitive.Fallback.Props) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center font-medium uppercase leading-none text-text-secondary",
        className,
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback };
export type { VelicinaAvatara };
