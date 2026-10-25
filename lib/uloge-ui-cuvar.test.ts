import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { KOREN, procitaj } from "./izvorni-kod.pomoc";

/**
 * Čuvar uloga u UI-ju (plan C10 §7.4, §8.1): svaki ekran sa izmenama prati
 * ulogu kroz `useMoze` ili `<SamoZa>` (`client_viewer` ne vidi dugmad za
 * izmene, `urednik` ne vidi veze, brisanje, članove ni podešavanja projekta).
 * Backend te izmene već odbija; čuvar pazi da UI ne ponudi dugme koje puca.
 * Spisak je tabela iz plana; nov ekran sa izmenama ide ovde.
 */
const FAJLOVI = [
  // Leadovi
  "components/app/leadovi/lead-row-actions.tsx",
  "components/app/leadovi/lead-action-bar.tsx",
  "components/app/leadovi/lead-detail.tsx",
  "components/app/leadovi/call-mode.tsx",
  "components/app/leadovi/import-dashboard.tsx",
  "components/app/leadovi/niches-panel.tsx",
  "components/app/leadovi/scoring-rules-panel.tsx",
  "components/app/leadovi/lead-quick-dialogs.tsx",
  // Novosti
  "components/app/novosti/novosti-dashboard.tsx",
  "components/app/novosti/novosti-editor.tsx",
  "components/app/novosti/publish-readiness-panel.tsx",
  // Objava i odgovori
  "components/app/instagram/publish-composer.tsx",
  "components/app/threads/threads-composer.tsx",
  "components/app/youtube/yt-upload-dialog.tsx",
  "components/app/youtube/yt-video-edit-dialog.tsx",
  "components/app/youtube/yt-captions-panel.tsx",
  "components/app/youtube/yt-thumbnail-dialog.tsx",
  "components/app/instagram/comment-thread.tsx",
  "components/app/facebook/fb-comment-thread.tsx",
  "components/app/instagram/inbox/chat-view.tsx",
  "components/app/openreply/automation-editor-dialog.tsx",
  "components/app/openreply/automations-dashboard.tsx",
  "components/app/openreply/automations-list.tsx",
  "components/app/openreply/profile-menu-panel.tsx",
  // Sinhronizacija, oznake, šabloni pravila. „Sinhronizuj“ je u `SyncFooter`
  // (connections-settings); `sync-status.tsx` je samo tačka sa linkom, bez
  // radnje, pa nije na spisku iako ga tabela plana pominje.
  "components/app/ads/hook-label-editor.tsx",
  "components/app/rules/rules-dashboard.tsx",
  // Samo vlasnik
  "components/app/settings/connections-settings.tsx",
  "components/app/ads/ad-action-dialog.tsx",
  "components/app/ads/new-campaign-wizard.tsx",
  "components/app/ads/new-hook-version-dialog.tsx",
  "components/app/ads/create-custom-audience-dialog.tsx",
  "components/app/ads/create-lookalike-audience-dialog.tsx",
  "components/app/ads/capi-section.tsx",
  "components/app/rules/rules-list.tsx",
  "components/app/rules/rule-editor-dialog.tsx",
  "components/app/threads/threads-jobs-panel.tsx",
  "components/app/settings/members-panel.tsx",
  "components/app/settings/invites-panel.tsx",
  "components/app/settings/ingest-tokens-panel.tsx",
  "components/app/settings/purge-state.tsx",
] as const;

describe("uloge u UI-ju", () => {
  test("spisak ne sadrži nepostojeći fajl", () => {
    const nema = FAJLOVI.filter((f) => !existsSync(join(KOREN, f)));
    expect(nema).toEqual([]);
  });

  test("svaki ekran sa izmenama koristi useMoze ili <SamoZa>", () => {
    const bez = FAJLOVI.filter((f) => {
      const kod = procitaj(join(KOREN, f));
      return !/\buseMoze\(/.test(kod) && !/<SamoZa\b/.test(kod);
    });
    expect(bez).toEqual([]);
  });

  test("useMoze i SamoZa čitaju istu proveru uloge kao backend (imaUlogu)", () => {
    const provider = procitaj(join(KOREN, "components/app/projekat-provider.tsx"));
    expect(provider).toMatch(/export function useMoze\(/);
    expect(provider).toMatch(/imaUlogu\(uloga, minimalna\)/);
    const samoZa = procitaj(join(KOREN, "components/app/samo-za.tsx"));
    expect(samoZa).toMatch(/useMoze\(uloga\)/);
  });
});
