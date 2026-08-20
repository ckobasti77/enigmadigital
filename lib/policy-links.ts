/**
 * Policy destinations the app is required to point at (YA2).
 *
 * Kept in one module because the same three URLs appear on the YouTube screens,
 * in the disconnect dialog and in the "Podaci i pristup" panel — and a
 * compliance link that rots in one of those places is worth less than no link.
 */

/** Where a person revokes this app's access to their Google account. */
export const GOOGLE_PERMISSIONS_URL = "https://myaccount.google.com/permissions";

/** Required attribution targets on every screen showing YouTube data. */
export const YOUTUBE_TERMS_URL = "https://www.youtube.com/t/terms";
export const GOOGLE_PRIVACY_URL = "https://policies.google.com/privacy";

/**
 * Where a person revokes this app's access on the Meta side. Meta has no
 * single per-app page like Google's, so this is the closest thing: the
 * business tools list an app appears in once it has been granted anything.
 */
export const META_BUSINESS_APPS_URL =
  "https://www.facebook.com/settings?tab=business_tools";
