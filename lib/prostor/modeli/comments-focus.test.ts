// Preneto iz Devotion apps/web/components/workspace/task-page/comments-focus.test.ts (main @ c05c40f), SPAJANJE S12.
import { beforeEach, describe, expect, it } from "vitest";

import { consumeCommentsFocus, requestCommentsFocus, resetCommentsFocus } from "./comments-focus";

describe("comments-focus", () => {
  beforeEach(() => resetCommentsFocus());

  it("zahtev se troši tačno jednom", () => {
    requestCommentsFocus("p1", 1_000);
    expect(consumeCommentsFocus("p1", 2_000)).toBe(true);
    expect(consumeCommentsFocus("p1", 2_000)).toBe(false);
  });

  it("zahtev za drugu stranicu se ne troši", () => {
    requestCommentsFocus("p1", 1_000);
    expect(consumeCommentsFocus("p2", 1_500)).toBe(false);
    expect(consumeCommentsFocus("p1", 1_500)).toBe(true);
  });

  it("zahtev ističe ako strana ne stigne da ga potroši", () => {
    requestCommentsFocus("p1", 1_000);
    expect(consumeCommentsFocus("p1", 1_000 + 10_001)).toBe(false);
  });

  it("bez zahteva nema fokusa", () => {
    expect(consumeCommentsFocus("p1", 5)).toBe(false);
  });
});
