import { GOOGLE_PRIVACY_URL, YOUTUBE_TERMS_URL } from "@/lib/policy-links";

/**
 * Attribution required on every screen that shows YouTube data (YA2).
 *
 * The policy asks that the source be obvious, not that it shout — so this sits
 * at the foot of the page in muted small print, above a hairline that separates
 * it from the data it describes. The two links are the only accent-coloured
 * things in it, because they are the only things here that can be pressed.
 */
export function YouTubeAttribution() {
  return (
    <p className="mt-10 border-t border-line-soft pt-4 text-xs leading-relaxed text-text-muted">
      Podaci sa YouTube-a preuzeti preko YouTube API Services.{" "}
      <a
        href={YOUTUBE_TERMS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent-400 underline underline-offset-2 transition-colors hover:text-accent-300"
      >
        YouTube Terms of Service
      </a>
      <span aria-hidden className="px-1.5">
        |
      </span>
      <a
        href={GOOGLE_PRIVACY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent-400 underline underline-offset-2 transition-colors hover:text-accent-300"
      >
        Google Privacy Policy
      </a>
    </p>
  );
}
