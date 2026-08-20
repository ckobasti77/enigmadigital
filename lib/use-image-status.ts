"use client";

import { useState } from "react";

export type ImageStatus = "loading" | "loaded" | "error";

/** One retry. Not three: a picture that is really gone should stop asking. */
const MAX_RETRIES = 1;

/**
 * The loading / loaded / failed state of one `<img>`, with a single retry.
 *
 * Two things were wrong with computing this once in `useState` and leaving it
 * there (V2/7):
 *
 *   1. It never noticed `src` changing. A card that swapped pictures kept the
 *      old verdict — including the verdict "there is no picture".
 *   2. A single transient failure was final. One 502 from the /ig-media/ proxy
 *      and the card sat on its placeholder until it was unmounted, which on a
 *      dashboard nobody navigates away from means all day.
 *
 * The retry re-requests the same address with a `r=` marker so the browser
 * cannot serve the failure back out of its own cache. The proxy ignores query
 * parameters it does not know, and its per-post claim keeps a retry from
 * turning into a second call to Instagram.
 */
export function useImageStatus(src: string | undefined): {
  /** What to put on the `<img>` — carries the retry marker after a failure. */
  src: string | undefined;
  status: ImageStatus;
  onLoad: () => void;
  onError: () => void;
} {
  const [state, setState] = useState<{
    /** Which `src` this verdict is about. */
    key: string | undefined;
    status: ImageStatus;
    attempt: number;
  }>(() => ({ key: src, status: src ? "loading" : "error", attempt: 0 }));

  // Adjusted during render rather than in an effect: an effect would let one
  // frame through in which the new picture is drawn under the old verdict.
  if (state.key !== src) {
    setState({ key: src, status: src ? "loading" : "error", attempt: 0 });
  }

  const fresh = state.key === src;
  const status: ImageStatus = fresh ? state.status : src ? "loading" : "error";
  const attempt = fresh ? state.attempt : 0;

  return {
    src: src === undefined || attempt === 0 ? src : withRetryMarker(src, attempt),
    status,
    onLoad: () => setState({ key: src, status: "loaded", attempt }),
    onError: () =>
      setState(
        attempt < MAX_RETRIES
          ? { key: src, status: "loading", attempt: attempt + 1 }
          : { key: src, status: "error", attempt },
      ),
  };
}

function withRetryMarker(src: string, attempt: number): string {
  return `${src}${src.includes("?") ? "&" : "?"}r=${attempt}`;
}
