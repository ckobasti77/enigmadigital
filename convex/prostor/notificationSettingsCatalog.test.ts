// Preneto iz Devotion packages/backend/convex/notificationSettingsCatalog.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import { typeBreaksQuietHours } from "./lib/notificationChannels";
import {
  ALL_SETTINGS_TYPES,
  isRowEnabled,
  NOTIFICATION_SETTINGS_GROUPS,
  toggleRow,
  type SettingsRow,
} from "./lib/notificationSettingsCatalog";

function rowByKey(key: string): SettingsRow {
  const row = NOTIFICATION_SETTINGS_GROUPS.flatMap((g) => g.rows).find(
    (r) => r.key === key,
  );
  if (row === undefined) throw new Error(`Nema reda ${key}`);
  return row;
}

describe("katalog podešavanja", () => {
  test("pokriva svih 15 tipova, bez preklapanja između redova", () => {
    expect(ALL_SETTINGS_TYPES).toHaveLength(15);
    expect(new Set(ALL_SETTINGS_TYPES).size).toBe(15); // svaki tip tačno jednom
  });

  test("komentari imaju svoja dva reda u grupi Tim, bez novog zvuka", () => {
    const mentions = rowByKey("team_comment_mentions");
    const comments = rowByKey("team_comments");
    expect(mentions.types).toEqual(["comment_mention"]);
    expect(comments.types).toEqual(["comment_added"]);
    // Dele zvuk sa chat redovima (`mention`, `channel`) — bez dugmeta za probu.
    expect(mentions.previewSound).toBeNull();
    expect(comments.previewSound).toBeNull();
    // Utišavanje jednog reda ne dira drugi.
    const muted = toggleRow(mentions, [], false);
    expect(muted).toEqual(["comment_mention"]);
    expect(isRowEnabled(comments, muted)).toBe(true);
  });

  test("dugme za probu stoji uz tačno šest redova — po jedan po zvuku", () => {
    const withPreview = NOTIFICATION_SETTINGS_GROUPS.flatMap((g) => g.rows)
      .filter((r) => r.previewSound !== null)
      .map((r) => r.previewSound);
    expect(withPreview.sort()).toEqual([
      "channel",
      "deadline",
      "dm",
      "mention",
      "task",
      "vote",
    ]);
  });

  test("red Rokovi gasi/pali sva tri roka odjednom", () => {
    const row = rowByKey("task_deadlines");
    expect(isRowEnabled(row, [])).toBe(true);

    const muted = toggleRow(row, [], false);
    expect(muted).toEqual(
      expect.arrayContaining([
        "task_due_soon",
        "task_due_today",
        "task_overdue",
      ]),
    );
    expect(isRowEnabled(row, muted)).toBe(false);

    // Ponovno paljenje uklanja sve tipove reda.
    expect(toggleRow(row, muted, true)).toEqual([]);
  });

  test("toggleRow ne dira druge redove i odbacuje nepoznate tipove", () => {
    const dm = rowByKey("chat_dm");
    const next = toggleRow(dm, ["chat_message", "izmišljen_tip"], false);
    expect(next).toContain("chat_message"); // tuđi tip ostaje
    expect(next).toContain("chat_dm");
    expect(next).not.toContain("izmišljen_tip"); // nepoznato se odbacuje
  });
});

describe("tihi sati — koji tipovi probijaju", () => {
  test("mention i svi rokovi (danas/prekoračeno) probijaju; ostalo ne", () => {
    expect(typeBreaksQuietHours("chat_mention")).toBe(true);
    expect(typeBreaksQuietHours("task_due_today")).toBe(true);
    expect(typeBreaksQuietHours("task_overdue")).toBe(true);
    expect(typeBreaksQuietHours("vote_requested")).toBe(true);

    // Pominjanje u komentaru probija kao @ u chatu; običan komentar ne.
    expect(typeBreaksQuietHours("comment_mention")).toBe(true);
    expect(typeBreaksQuietHours("comment_added")).toBe(false);

    // „Uskoro ističe" i „odluka je pala" ne bude noću (override na `active`).
    expect(typeBreaksQuietHours("task_due_soon")).toBe(false);
    expect(typeBreaksQuietHours("request_resolved")).toBe(false);
    // Svakodnevni šum ne probija tihe sate.
    expect(typeBreaksQuietHours("chat_message")).toBe(false);
    expect(typeBreaksQuietHours("chat_dm")).toBe(false);
    expect(typeBreaksQuietHours("puls_ready")).toBe(false);
  });
});
