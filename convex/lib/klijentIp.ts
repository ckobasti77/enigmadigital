/**
 * The RAW client IP — the same source `hashClientIp` (in `http.ts`) reads
 * (first `x-forwarded-for` entry, then `x-real-ip`), but unhashed.
 *
 * This is the ONE place a raw address is read. It goes nowhere but Meta's
 * Conversions API `client_ip_address`, which is the one field Meta requires to
 * be unhashed for matching — a hash is refused there, so the salted digest that
 * feeds `orLinkClicks` cannot double as an identifier. It must never be logged,
 * put in a URL, or written to `orLinkClicks` or `leadInbound`; callers keep it
 * isolated to the `recordCapiEvent` call and the store drops it the moment
 * sending ends. (Moved here from `http.ts` in C17 so `/projekti/lead` can use
 * the same function.)
 */
export function extractClientIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  return (
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    undefined
  );
}
