import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/**
 * Čuvar zaštite od objave na pogrešnom nalogu (PROJEKTI-PLAN §7): svaki
 * dijalog koji objavljuje, šalje ili troši novac pokazuje projekat i nalog
 * (`<ObjavljujesKao …>`), a njegova potvrda nosi ime projekta (`potvrda(…)`
 * iz `usePotvrdaProjekta`). Spisak je plan C02 §8.6.
 */

const KOREN = fileURLToPath(new URL("../", import.meta.url));
const kod = (rel: string) =>
  readFileSync(KOREN + rel, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

/** Dijalog ili forma koja sama crta red i potvrdu. */
const SAMI: Record<string, string> = {
  // Objava
  "components/app/instagram/publish-composer.tsx": "Instagram objava (strana i dijalog potvrde)",
  "components/app/threads/threads-composer.tsx": "Threads objava (strana i dijalog potvrde)",
  "components/app/youtube/yt-upload-dialog.tsx": "YouTube upload",
  "components/app/youtube/yt-video-edit-dialog.tsx": "izmena i brisanje YouTube videa",
  "components/app/youtube/yt-thumbnail-dialog.tsx": "YouTube sličica",
  "components/app/youtube/yt-captions-panel.tsx": "YouTube titlovi",
  // Dugme „Objavi post“ je u panelu spremnosti, ne u samom editoru novosti.
  "components/app/novosti/publish-readiness-panel.tsx": "objava novosti na sajt",
  // Javni odgovor
  "components/app/instagram/comment-thread.tsx": "odgovor na Instagram komentar",
  "components/app/instagram/mention-card.tsx": "odgovor na Instagram spominjanje",
  "components/app/facebook/fb-comment-thread.tsx": "odgovor na Facebook komentar",
  "components/app/threads/threads-replies-moderation.tsx": "odgovor na Threads",
  // Poruke
  "components/app/instagram/inbox/chat-view.tsx": "poruka u inbox-u",
  "components/app/openreply/automation-editor-dialog.tsx": "OpenReply automatizacija (DM)",
  "components/app/openreply/profile-menu-panel.tsx": "meni profila na Instagramu",
  "components/app/instagram/inbox/inbox-settings-drawer.tsx": "ledolomci i meni iz inbox-a",
  // Oglasi i budžet
  "components/app/ads/ad-action-dialog.tsx": "pauza, nastavak, budžet, dupliranje",
  "components/app/ads/new-campaign-wizard.tsx": "nova kampanja",
  "components/app/ads/new-hook-version-dialog.tsx": "nova verzija hooka",
  "components/app/ads/create-custom-audience-dialog.tsx": "nova publika",
  "components/app/ads/create-lookalike-audience-dialog.tsx": "nova lookalike publika",
};

/** Panel koji formu za odgovor ne crta sam, nego kroz komponentu sa spiska. */
const PREKO: Record<string, { komponenta: string; fajl: string }> = {
  "components/app/instagram/post-comments-panel.tsx": {
    komponenta: "CommentThread",
    fajl: "components/app/instagram/comment-thread.tsx",
  },
  "components/app/facebook/fb-post-comments-panel.tsx": {
    komponenta: "FbCommentThread",
    fajl: "components/app/facebook/fb-comment-thread.tsx",
  },
};

describe("„Objavljuješ kao …“ u svakom dijalogu koji objavljuje, šalje ili troši novac", () => {
  test("svi fajlovi sa spiska postoje", () => {
    for (const rel of [...Object.keys(SAMI), ...Object.keys(PREKO)]) {
      expect(existsSync(KOREN + rel), rel).toBe(true);
    }
  });

  test.each(Object.entries(SAMI))("%s: red sa projektom i nalogom + potvrda sa imenom projekta (%s)", (rel) => {
    const izvor = kod(rel);
    expect(izvor, `${rel}: nema <ObjavljujesKao`).toMatch(/<ObjavljujesKao\b[^>]*\bkanal=/);
    expect(izvor, `${rel}: nema usePotvrdaProjekta`).toMatch(/\busePotvrdaProjekta\(\)/);
    expect(izvor, `${rel}: potvrda ne nosi ime projekta`).toMatch(/\bpotvrda\(/);
  });

  test.each(Object.entries(PREKO))("%s crta formu kroz komponentu koja ima red", (rel, { komponenta, fajl }) => {
    expect(kod(rel)).toMatch(new RegExp(`<${komponenta}\\b`));
    expect(fajl in SAMI).toBe(true);
  });

  test("dijalog potvrde objave nosi red (Instagram i Threads)", () => {
    for (const rel of [
      "components/app/instagram/publish-composer.tsx",
      "components/app/threads/threads-composer.tsx",
    ]) {
      expect(kod(rel), rel).toMatch(/kao=\{\s*<ObjavljujesKao/);
    }
    expect(kod("components/app/confirm-dialog.tsx")).toMatch(/\{kao\}/);
  });

  test("dijalozi oglasa pokazuju nalog nad kojim radnja zaista ide", () => {
    // Akcija nad kampanjom/setom/oglasom i nova verzija hooka: nalog cilja.
    expect(kod("components/app/ads/ad-action-dialog.tsx")).toMatch(/nalog=\{[^}]*accountName/);
    expect(kod("components/app/ads/new-hook-version-dialog.tsx")).toMatch(/nalog=\{[^}]*accountName/);
    // Publike: prvi Meta nalog oglasa projekta, kao `getMetaAdsAuth`.
    for (const rel of [
      "components/app/ads/create-custom-audience-dialog.tsx",
      "components/app/ads/create-lookalike-audience-dialog.tsx",
    ]) {
      expect(kod(rel), rel).toMatch(/nalozi\.find\(\(n\) => n\.provider === "meta_ads"\)\?\.name/);
    }
    // Čarobnjak: nalog izabran u prvom koraku.
    expect(kod("components/app/ads/new-campaign-wizard.tsx")).toMatch(/nalog=\{account\?\.name\}/);
    // Isti red, isti indeks i isti provajder u akciji publika i u spisku naloga.
    const meta = kod("convex/metaAds.ts");
    const auth = meta.slice(meta.indexOf("async function getMetaAdsAuth"));
    expect(auth.slice(0, 1600)).toMatch(
      /internal\.metaAdsStore\.getAccounts,\s*\{\s*workspaceId,\s*provider: "meta_ads",?\s*\}/,
    );
    const store = kod("convex/metaAdsStore.ts");
    const lista = store.slice(store.indexOf("export const listAccounts"));
    expect(lista.slice(0, 400)).toMatch(/withIndex\("by_workspace"/);
  });
});
