"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * „Kopiraj uputstvo za programera" (ULTRA O15, plan T08 §9.4).
 *
 * Ekran kaže ljudskom rečenicom šta ne radi („Webhook za Instagram još nije
 * podešen na serveru"); imena env promenljivih i koraci za server idu samo u
 * međuspremnik, ne na ekran. Tekst uputstva je konstanta van JSX-a.
 */
export const UPUTSTVO = {
  instagramApp: [
    "Instagram povezivanje: na Convex deploymentu postavi env promenljive",
    "INSTAGRAM_APP_ID i INSTAGRAM_APP_SECRET (Meta app → Instagram → API setup with Instagram login).",
    "Posle toga u Podešavanjima → Integracije klikni „Poveži Instagram“.",
  ].join("\n"),
  facebookApp: [
    "Facebook povezivanje: na Convex deploymentu postavi env promenljive",
    "FACEBOOK_APP_ID i FACEBOOK_APP_SECRET (Meta app → Settings → Basic).",
    "App Secret je isti kao za Instagram; App ID nije, Instagram Login ima svoj.",
    "Verify token za webhook je isti IG_WEBHOOK_VERIFY_TOKEN koji koristi Instagram.",
  ].join("\n"),
  oauthPovratak: [
    "Povezivanje kanala (Instagram, Facebook, Threads, YouTube) traži env promenljivu",
    "OAUTH_CALLBACK_ORIGIN na Convex deploymentu: samo https://<domen panela>, bez putanje.",
    "Primer: OAUTH_CALLBACK_ORIGIN=https://digital.enigmait.rs",
  ].join("\n"),
} as const;

/** Uputstvo za webhook kojem fale tajne na serveru. */
export function uputstvoZaWebhook(kanal: string, nedostaje: readonly string[]): string {
  return [
    `${kanal} webhook: na Convex deploymentu nedostaje ${nedostaje.join(" i ")}.`,
    "Bez toga webhook odbija dolazne pozive (potpis ili verify token ne mogu da se provere).",
  ].join("\n");
}

export function UputstvoProgramera({
  uputstvo,
  className,
}: {
  uputstvo: string;
  className?: string;
}) {
  const [kopirano, setKopirano] = useState(false);
  const tajmer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (tajmer.current) clearTimeout(tajmer.current);
    },
    [],
  );

  async function kopiraj() {
    try {
      await navigator.clipboard.writeText(uputstvo);
      setKopirano(true);
      if (tajmer.current) clearTimeout(tajmer.current);
      tajmer.current = setTimeout(() => setKopirano(false), 2000);
    } catch {
      // Međuspremnik nije dostupan (nesiguran kontekst); dugme ostaje kakvo je.
    }
  }

  const Ikona = kopirano ? Check : Copy;
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={kopiraj}
      className={cn("w-fit", className)}
    >
      <Ikona className="size-3.5" strokeWidth={1.75} aria-hidden />
      <span aria-live="polite">{kopirano ? "Kopirano" : "Kopiraj uputstvo za programera"}</span>
    </Button>
  );
}
