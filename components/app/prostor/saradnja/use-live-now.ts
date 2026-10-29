"use client";

// Preneto iz Devotion apps/web/components/collab/use-live-now.ts (main @ c05c40f), SPAJANJE S11.
import { useEffect, useState } from "react";

/** „pre N min" se osvežava na ovoliko (dovoljno za meta tekst, bez treptanja). */
const LIVE_NOW_MS = 30_000;

/**
 * Sat za relativna vremena u saradnji („pre 5 min", „Ana · upravo"). `now`
 * ljuske (`useToday`) tiče samo u ponoć i na fokus, pa bi „pre N min" stajalo.
 */
export function useLiveNow(now: number): number {
  const [tick, setTick] = useState(now);
  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), LIVE_NOW_MS);
    return () => window.clearInterval(timer);
  }, []);
  return Math.max(now, tick);
}
