import type { Provider } from "./providers";
import { getFacebookAppId, getFacebookAppSecret } from "./facebookApi";
import { getGbpClientId, getGbpClientSecret } from "./gbpApi";
import { getThreadsAppId, getThreadsAppSecret } from "./threadsApi";
import { getYouTubeClientId, getYouTubeClientSecret } from "./youtubeApi";

/**
 * Da li server ima podešavanje bez kog veza ne može da radi (razlog „server
 * nije podešen" u statusu veze, `statusVeze.ts`).
 *
 * Uslovi su isti kao u postojećim proverama Podešavanja i koriste iste čitače
 * okruženja: `instagram.getOAuthConfig`, `facebookStore.setupInfo`,
 * `threadsStore.setupInfo`, `youtubeStore.setupInfo`, `gbpStore.setupInfo`,
 * `orEngine.status` (webhook OpenReply-a).
 * `null` = za tog provajdera se ovo ne proverava (GA4 i Google Ads nose
 * kredencijal u samoj vezi).
 */
export function serverPodesen(provider: Provider): boolean | null {
  switch (provider) {
    case "meta_ig":
      return Boolean(
        process.env.INSTAGRAM_APP_ID?.trim() && process.env.INSTAGRAM_APP_SECRET?.trim(),
      );
    case "meta_fb":
      return Boolean(getFacebookAppId() && getFacebookAppSecret());
    case "threads":
      return Boolean(getThreadsAppId() && getThreadsAppSecret());
    case "youtube":
      return Boolean(getYouTubeClientId() && getYouTubeClientSecret());
    case "google_business":
      return Boolean(getGbpClientId() && getGbpClientSecret());
    case "openreply":
      // Isti uslov kao kartica OpenReply-a (`orEngine.status`): bez tokena za
      // potvrdu webhook-a i tajne aplikacije poruke i komentari ne stižu, pa
      // veza ne radi iako je motor uključen.
      return Boolean(
        process.env.IG_WEBHOOK_VERIFY_TOKEN?.trim() &&
          (process.env.META_APP_SECRET?.trim() || process.env.INSTAGRAM_APP_SECRET?.trim()),
      );
    default:
      return null;
  }
}
