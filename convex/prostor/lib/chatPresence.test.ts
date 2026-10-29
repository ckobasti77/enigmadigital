// Preneto iz Devotion packages/backend/convex/lib/chatPresence.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import { CHAT_PRESENCE_REFRESH_MS, CHAT_PRESENCE_TTL_MS } from "./chatPresence";

describe("chat presence timing", () => {
  test("refresh interval is positive and comfortably under the TTL", () => {
    expect(CHAT_PRESENCE_REFRESH_MS).toBeGreaterThan(0);
    expect(CHAT_PRESENCE_REFRESH_MS * 2).toBeLessThan(CHAT_PRESENCE_TTL_MS);
  });
});
