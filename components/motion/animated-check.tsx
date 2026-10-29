"use client";

// Preneto iz Devotion apps/web/components/motion/animated-check.tsx (main @ c05c40f), SPAJANJE S08.

import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { DUR_REDUCED, DUR_UI, EASE_UI, MOTION_QUERIES } from "@/lib/motion";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

type AnimatedCheckProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Šta se štiklira, za čitač ekrana (npr. „Završi: Pozovi dobavljača"). */
  label: string;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
};

const BOX = { sm: "size-[1.125rem]", md: "size-5" } as const;
const MARK = { sm: "size-3", md: "size-3.5" } as const;

/**
 * Kvačica zadatka (P12): na štikliranje se krug puni od centra i kvačica se
 * iscrtava; poništavanje je isto, unazad. Boja je boja radnje (isto kao
 * `Checkbox` i `Switch` u stanju „uključeno").
 *
 * Pokret je Enigmin (`DUR_UI`, `EASE_UI`), bez Devotion opruge sa prebačajem:
 * završen zadatak nije nagrada (prebačaj je samo za nagrade, P27). Prekidivo:
 * svaka promena kreće od trenutnog stanja na ekranu (`overwrite: "auto"`).
 * Prvo crtanje se ne animira. Smanjen pokret: samo neprozirnost.
 */
export function AnimatedCheck({
  checked,
  onCheckedChange,
  label,
  disabled = false,
  size = "md",
  className,
}: AnimatedCheckProps) {
  const [initiallyChecked] = useState(checked);
  const rootRef = useRef<HTMLButtonElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const markRef = useRef<SVGPathElement>(null);
  const settled = useRef(checked);

  useGSAP(
    () => {
      if (settled.current === checked) return;
      settled.current = checked;
      const fill = fillRef.current;
      const mark = markRef.current;
      if (!fill || !mark) return;

      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        if (ctx.conditions?.still) {
          gsap.set(fill, { scale: 1 });
          gsap.set(mark, { strokeDashoffset: 0 });
          gsap.to([fill, mark], {
            opacity: checked ? 1 : 0,
            duration: DUR_REDUCED,
            ease: "none",
            overwrite: "auto",
          });
          return;
        }
        gsap.set(mark, { opacity: 1 });
        gsap.to(fill, {
          scale: checked ? 1 : 0,
          opacity: checked ? 1 : 0,
          duration: DUR_UI,
          ease: EASE_UI,
          overwrite: "auto",
        });
        gsap.to(mark, {
          strokeDashoffset: checked ? 0 : 1,
          duration: DUR_UI,
          ease: EASE_UI,
          overwrite: "auto",
        });
      });
    },
    { dependencies: [checked], scope: rootRef },
  );

  return (
    <button
      ref={rootRef}
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        // Meta mišem 24 px (WCAG 2.5.8), na dodir 44 px.
        "group grid size-6 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:size-11",
        className,
      )}
    >
      <span
        className={cn(
          "relative grid place-items-center rounded-full border-[1.5px] bg-surface transition-colors duration-(--duration-fast) ease-(--ease-ui)",
          checked
            ? "border-radnja"
            : "border-line-control group-hover:border-radnja group-disabled:group-hover:border-line-control",
          BOX[size],
        )}
      >
        <span
          ref={fillRef}
          aria-hidden="true"
          className="absolute -inset-px rounded-full bg-radnja"
          style={{
            opacity: initiallyChecked ? 1 : 0,
            transform: `scale(${initiallyChecked ? 1 : 0})`,
          }}
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          className={cn("relative text-radnja-tekst", MARK[size])}
        >
          <path
            ref={markRef}
            d="M3.6 8.5 6.7 11.4 12.6 4.9"
            pathLength={1}
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={1}
            style={{ strokeDashoffset: initiallyChecked ? 0 : 1 }}
          />
        </svg>
      </span>
    </button>
  );
}
