"use client";
// Preneto iz Devotion apps/web/lib/use-today.ts (main @ c05c40f), SPAJANJE S08.

import { useEffect, useState } from "react";

import { msUntilNextDay, nextToday, todayOf, type Today } from "@/lib/prostor/web/danas";

/**
 * `{ now, dayKey, doneSince }` za lični nivo. Osvežava se u lokalnu ponoć i
 * kad se kartica vrati u fokus (posle spavanja računara), a ne na svaki
 * render — argumenti `myDay.overview` ostaju stabilni ceo dan (plan K07, E3).
 */
export function useToday(): Today {
  const [today, setToday] = useState<Today>(() => todayOf(Date.now()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      setToday((previous) => nextToday(previous, Date.now()));
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(refresh, msUntilNextDay(Date.now()));
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    timer = setTimeout(refresh, msUntilNextDay(Date.now()));
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return today;
}
