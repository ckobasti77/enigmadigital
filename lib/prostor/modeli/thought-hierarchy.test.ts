// Preneto iz Devotion apps/web/components/workspace/thoughts/thought-hierarchy.test.ts (main @ c05c40f), SPAJANJE S14.
import { describe, expect, it } from "vitest";

import { isThoughtDescendant } from "./thought-hierarchy";

describe("isThoughtDescendant", () => {
  const nodes = new Map([
    ["parent", {}],
    ["child", { parentThoughtId: "parent" }],
    ["grandchild", { parentThoughtId: "child" }],
    ["sibling", { parentThoughtId: "parent" }],
    ["standalone", {}],
  ]);

  it("recognizes direct and deeply nested descendants", () => {
    expect(isThoughtDescendant("child", "parent", nodes)).toBe(true);
    expect(isThoughtDescendant("grandchild", "parent", nodes)).toBe(true);
  });

  it("does not treat parents, siblings, or standalone nodes as descendants", () => {
    expect(isThoughtDescendant("parent", "child", nodes)).toBe(false);
    expect(isThoughtDescendant("sibling", "child", nodes)).toBe(false);
    expect(isThoughtDescendant("standalone", "parent", nodes)).toBe(false);
  });

  it("stops safely if malformed data contains a cycle", () => {
    const cyclicNodes = new Map([
      ["first", { parentThoughtId: "second" }],
      ["second", { parentThoughtId: "first" }],
    ]);

    expect(isThoughtDescendant("first", "outside", cyclicNodes)).toBe(false);
  });
});
