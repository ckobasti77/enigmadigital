"use client";

import { useRef } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { DUR_REDUCED, EASE_UI, MOTION_QUERIES, WILL_CHANGE } from "@/lib/motion";

/**
 * Prelaz između ekrana: 200 ms fade i 8 px podizanja, i ništa više.
 *
 * Kratko je namerno. Ovo je tabla koju operater otvara desetak puta dnevno i
 * kroz koju se kreće brzo; klizanje cele stranice bi svaki put stajalo između
 * njega i podataka. Osam piksela je taman toliko da se oseti smena sadržaja, a
 * da se ne pročita kao pokret.
 *
 * Animira se ISKLJUČIVO telo. Bočna i gornja traka su ljuska — one ostaju gde
 * jesu, jer su one jedini fiksni orijentir dok se sadržaj menja.
 */
const DUR_ROUTE = 0.2;
const ROUTE_Y = 8;

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Ključ je putanja: svaka ruta dobija svež okvir, pa se ulaz odigra tačno
  // jednom po ekranu umesto pri svakom ažuriranju podataka iz Convex-a.
  return <PageFrame key={pathname}>{children}</PageFrame>;
}

function PageFrame({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        const still = Boolean(ctx.conditions?.still);
        gsap.set(
          el,
          still ? { opacity: 0 } : { opacity: 0, y: ROUTE_Y, willChange: WILL_CHANGE },
        );
        gsap.to(el, {
          opacity: 1,
          ...(still ? {} : { y: 0 }),
          duration: still ? DUR_REDUCED : DUR_ROUTE,
          ease: still ? "none" : EASE_UI,
          overwrite: "auto",
          onComplete: () => {
            // Zaostala transformacija na omotaču pravi novi blok sadržaja i
            // zarobila bi svaki `position: fixed` element ispod sebe.
            gsap.set(el, { clearProps: "transform,willChange" });
          },
        });
      });
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className="flex w-full flex-1 flex-col">
      {children}
    </div>
  );
}
