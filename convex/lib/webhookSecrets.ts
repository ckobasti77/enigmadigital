/**
 * ============================================================================
 * WHICH APP SECRET SIGNS A META WEBHOOK (P3, point 7)
 * ============================================================================
 *
 * The signature check and the Settings card used to disagree about this, and
 * the disagreement was invisible.
 *
 * `verifySignature` in http.ts read `META_APP_SECRET` and `INSTAGRAM_APP_SECRET`
 * only. `lib/facebookApi.ts` reads `FACEBOOK_APP_SECRET` first. And the
 * Facebook card tells the operator, in step 4, to set exactly
 * `FACEBOOK_APP_SECRET`. Follow the instructions on the screen and everything
 * looks right — OAuth works, the Page picker works, the six-hourly sync works,
 * the card is green — while every single `POST /facebook/webhook` answers 401.
 * No comment ever arrives, nothing is logged, and Meta eventually unsubscribes
 * the app for failing too often.
 *
 * One module now decides, and everything that has an opinion about app secrets
 * imports it: the verifier, the Settings indicator, and the message shown when
 * a signature does not check out.
 * ============================================================================
 */

export type WebhookRoute = "instagram" | "facebook";

/** Environment variables consulted for a route, in the order they are tried. */
const CANDIDATE_VARS: Record<WebhookRoute, readonly string[]> = {
  // Instagram Login issues its own app id but shares the app's secret, so the
  // shared one stays first here and the Instagram-specific override second.
  instagram: ["META_APP_SECRET", "INSTAGRAM_APP_SECRET", "FACEBOOK_APP_SECRET"],
  // FIRST, because it is the variable the card tells people to set and the one
  // `getFacebookAppSecret()` already prefers.
  facebook: ["FACEBOOK_APP_SECRET", "META_APP_SECRET", "INSTAGRAM_APP_SECRET"],
};

/** Names of the variables a route will try — set or not. */
export function signatureSecretNames(route: WebhookRoute): readonly string[] {
  return CANDIDATE_VARS[route];
}

/** The values actually present, deduplicated, in try order. */
export function signatureSecrets(route: WebhookRoute): string[] {
  const seen = new Set<string>();
  for (const name of CANDIDATE_VARS[route]) {
    const value = process.env[name]?.trim();
    if (value) seen.add(value);
  }
  return [...seen];
}

/** Whether this route can verify a signature at all. */
export function hasSignatureSecret(route: WebhookRoute): boolean {
  return signatureSecrets(route).length > 0;
}

/**
 * What to tell the operator when a signature fails — by variable name.
 *
 * The two cases are genuinely different problems. Nothing set at all is a
 * deployment that was never finished; something set that does not match is a
 * value copied from the wrong app. A single "invalid signature" covers neither.
 */
export function signatureFailureReason(route: WebhookRoute): string {
  const [primary, ...rest] = CANDIDATE_VARS[route];
  const alternatives = rest.join(" / ");
  if (!hasSignatureSecret(route)) {
    return `Nijedna promenljiva sa App Secret-om nije postavljena (${primary}, pa ${alternatives}). Postavi ${primary} na App Secret iz Meta app dashboard-a (Settings → Basic).`;
  }
  return `Potpis se ne poklapa ni sa jednom postavljenom promenljivom (${primary}, ${alternatives}). Proveri da je ${primary} baš App Secret te Meta aplikacije.`;
}
