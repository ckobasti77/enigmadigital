"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { FeedbackNote } from "@/components/app/feedback";
import { formatRelativeTime } from "@/lib/format";

/**
 * Kada webhook odbija Metine pozive, i zašto (P3, tačka 7).
 *
 * Ovo je do sada bila tiha petlja: `POST /facebook/webhook` vraća 401, Meta
 * ponavlja, pa na kraju skida pretplatu — a na ekranu je sve zeleno, jer
 * OAuth, birač stranice i sinhronizacija na šest sati rade sa potpuno drugim
 * proverama. Jedini simptom je da komentari nisu stigli, i to tek kada neko
 * primeti da nisu.
 *
 * Zato: brojač odbijenih potpisa, vreme poslednjeg, i rečenica koja imenuje
 * promenljivu koju treba postaviti. Poruka nestaje čim jedan potpis prođe.
 */
export function WebhookSignatureNote({
  route,
}: {
  route: "instagram" | "facebook";
}) {
  const health = useQuery(api.webhookHealth.status);
  if (health === undefined) return null;

  const entry = health.find((item) => item.route === route);
  if (entry === undefined || entry.failures === 0) return null;

  // Jedan zalutao zahtev pre nedelju dana nije kvar. Kvar je kada je poslednji
  // odbijen potpis noviji od poslednjeg prihvaćenog — ili kada prihvaćenog
  // nikad nije ni bilo.
  const broken =
    entry.lastOkAt === null ||
    (entry.lastFailureAt !== null && entry.lastFailureAt > entry.lastOkAt);
  if (!broken) return null;

  return (
    <FeedbackNote
      tone="danger"
      className="mt-4"
      title={`Webhook odbija dolazne pozive (${entry.failures} puta, poslednji ${
        entry.lastFailureAt === null
          ? "nedavno"
          : formatRelativeTime(entry.lastFailureAt)
      })`}
    >
      {entry.reason}
    </FeedbackNote>
  );
}
