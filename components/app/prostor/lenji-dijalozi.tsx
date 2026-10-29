"use client";

import dynamic from "next/dynamic";

/**
 * ============================================================================
 * LENJI DIJALOZI LJUSKE (SPAJANJE S28)
 * ============================================================================
 *
 * Dijalozi radnog dela koje ljuska drži na svakoj strani (zvono, meni
 * korisnika), a otvaraju se samo na klik. Njihov kod nije u prvom učitavanju
 * Enigminih ekrana, nego stiže odmah posle njega. Montirani su kao i pre
 * (zatvoreni), pa se otvaraju i ponašaju isto.
 */
export const NotificationSettingsDialog = dynamic(
  () => import("./inbox/notification-settings-dialog").then((m) => m.NotificationSettingsDialog),
  { ssr: false },
);

export const ProfilDijalog = dynamic(
  () => import("./profil/profil-dijalog").then((m) => m.ProfilDijalog),
  { ssr: false },
);
