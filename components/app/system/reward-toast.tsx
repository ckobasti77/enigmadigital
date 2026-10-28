"use client";

import {
  Children,
  useEffect,
  useRef,
  type ComponentType,
  type ReactNode,
} from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Sparkles, X } from "lucide-react";
import { CountUp } from "@/components/motion/count-up";
import { holdCssTransition, releaseCssTransition } from "@/components/motion/css-transition";
import { formatNumber } from "@/lib/format";
import {
  DUR_REDUCED,
  DUR_TOAST_IN,
  DUR_TOAST_OUT,
  EASE_REWARD,
  EASE_UI,
  MOTION_QUERIES,
} from "@/lib/motion";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

/**
 * ============================================================================
 * TOAST NAGRADE — „+15 XP · Ishod zabeležen" (UI Boost §5.8, §6.9)
 * ============================================================================
 *
 * Povratna informacija da je radnja ostavila trag: dole desno, zlatan, sa
 * brojem koji se odbroji. Nikad ne traži klik i nikad ne stoji preko posla.
 *
 * Trajanja iz plana: ulaz 250 ms, izlaz 180 ms (ulaz je uvek duži — čovek
 * gleda ono što stiže, ne ono što odlazi). +XP toast se sam zatvara posle
 * 2,5 s, ostali posle 4 s. Odbrojavanje staje dok je miš ili fokus na toastu.
 *
 * Ovo je PRIKAZ jednog toasta. Ko ga pali i kada (promena stanja napretka iz
 * Convex-a) odlučuje pozivalac; `RewardToastViewport` drži najviše tri.
 *
 * Pod reduced-motion toast se samo pretopi i nestane bez izlaznog pokreta.
 */
type ToastIcon = ComponentType<{ className?: string }>;

export type RewardToastTone = "xp" | "achievement" | "level";

export function RewardToast({
  title,
  xp,
  icon: Icon = Sparkles,
  tone = "xp",
  duration,
  onDismiss,
}: {
  /** Šta se desilo („Ishod zabeležen", „Novo dostignuće: Prvi kontakt"). */
  title: string;
  /** Zarađen XP. Bez njega toast nosi samo naslov. */
  xp?: number;
  icon?: ToastIcon;
  tone?: RewardToastTone;
  /** Koliko stoji, u ms. Podrazumevano 2500 za `xp`, 4000 za ostale. */
  duration?: number;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaving = useRef(false);
  // Izlazak pale tajmer i dugme, dakle posle efekta; `contextSafe` ga veže za
  // isti GSAP kontekst, pa se tvin ugasi ako toast nestane usred izlaska.
  const leaveRef = useRef<() => void>(() => {});
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  }, [onDismiss]);

  const stay = duration ?? (tone === "xp" ? 2500 : 4000);

  useGSAP(
    (_context, contextSafe) => {
      const el = ref.current;
      if (!el) return;

      const leave = () => {
        if (leaving.current) return;
        leaving.current = true;
        if (window.matchMedia(MOTION_QUERIES.still).matches) {
          dismiss.current();
          return;
        }
        gsap.to(el, {
          opacity: 0,
          y: 8,
          duration: DUR_TOAST_OUT,
          ease: "power2.in",
          overwrite: true,
          onComplete: () => dismiss.current(),
        });
      };
      leaveRef.current = contextSafe ? contextSafe(leave) : leave;

      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        if (ctx.conditions?.still) {
          holdCssTransition(el);
          gsap.set(el, { opacity: 0 });
          gsap.to(el, {
            opacity: 1,
            duration: DUR_REDUCED,
            ease: "none",
            overwrite: "auto",
            onComplete: () => releaseCssTransition(el),
          });
          return;
        }
        // Dva tvina, jedan pokret: dolazak je miran, a skala prebaci — to je
        // razlika između obaveštenja i nagrade.
        gsap.set(el, { opacity: 0, y: 12, scale: 0.94 });
        gsap.to(el, {
          opacity: 1,
          y: 0,
          duration: DUR_TOAST_IN,
          ease: EASE_UI,
          overwrite: "auto",
        });
        gsap.to(el, { scale: 1, duration: DUR_TOAST_IN, ease: EASE_REWARD });
      });
    },
    { scope: ref },
  );

  const leave = () => leaveRef.current();

  const arm = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(leave, stay);
  };
  const hold = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => {
    arm();
    return hold;
    // Odbrojavanje kreće jednom, pri montiranju; `arm` čita aktuelne vrednosti.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      role="status"
      onPointerEnter={hold}
      onPointerLeave={arm}
      onFocus={hold}
      onBlur={arm}
      className={cn(
        "pointer-events-auto flex w-full items-center gap-3 rounded-xl border bg-surface-raised py-2.5 pr-2 pl-3",
        tone === "xp" ? "border-xp-line shadow-reward" : "border-line shadow-elev-2",
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-xp-soft text-xp">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        {xp !== undefined && (
          <p className="text-copy font-bold leading-tight text-xp tabular-nums">
            <CountUp value={xp} from={0} format={(v) => `+${formatNumber(v)} XP`} />
          </p>
        )}
        <p
          className={cn(
            "truncate",
            xp !== undefined
              ? "text-meta text-text-muted"
              : "text-ui font-medium text-foreground",
          )}
        >
          {title}
        </p>
      </div>
      <button
        type="button"
        onClick={leave}
        aria-label="Zatvori obaveštenje"
        className="touch-target flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface hover:text-foreground"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

/**
 * Mesto za toastove: dole desno, iznad donje trake na telefonu. Drži najviše
 * tri poslednja — četvrti gura najstariji, da nagrade nikad ne prekriju ekran.
 * Sam okvir ne hvata klik.
 */
export function RewardToastViewport({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).slice(-3);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-24 z-50 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2 md:bottom-4"
    >
      {items}
    </div>
  );
}
