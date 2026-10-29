// Preneto iz Devotion packages/shared/src/mentions.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import {
  insertMention,
  MAX_COMMENT_MENTIONS,
  mentionQueryAt,
  parseCommentSegments,
  serializeComment,
  type MentionCandidate,
} from "./mentions";

const ANA: MentionCandidate = { profileId: "p-ana", displayName: "Ana" };
const ANASTASIJA: MentionCandidate = {
  profileId: "p-anastasija",
  displayName: "Anastasija",
};
const DJORDJE: MentionCandidate = { profileId: "p-dj", displayName: "Đorđe" };

describe("mentionQueryAt", () => {
  test("@ na početku teksta i posle razmaka otvara upit", () => {
    expect(mentionQueryAt("@an", 3)).toEqual({ query: "an", start: 0 });
    expect(mentionQueryAt("Hej @an", 7)).toEqual({ query: "an", start: 4 });
    expect(mentionQueryAt("Hej\n@a", 6)).toEqual({ query: "a", start: 4 });
    expect(mentionQueryAt("Hej @", 5)).toEqual({ query: "", start: 4 });
    expect(mentionQueryAt("@Đor", 4)).toEqual({ query: "Đor", start: 0 });
  });

  test("e-adresa nije pominjanje", () => {
    expect(mentionQueryAt("ana@posta", 9)).toBeNull();
    expect(mentionQueryAt("pisi na ana@posta", 17)).toBeNull();
  });

  test("razmak između @ i kursora zatvara upit", () => {
    expect(mentionQueryAt("@ana je", 7)).toBeNull();
    expect(mentionQueryAt("bez znaka", 9)).toBeNull();
  });

  test("kursor u sredini reči koristi samo tekst pre kursora", () => {
    expect(mentionQueryAt("Hej @anastasija", 7)).toEqual({
      query: "an",
      start: 4,
    });
    expect(mentionQueryAt("Hej @anastasija", 100)).toEqual({
      query: "anastasija",
      start: 4,
    });
    expect(mentionQueryAt("@", 0)).toBeNull();
  });

  test("predugačak upit se ne nudi", () => {
    expect(mentionQueryAt(`@${"a".repeat(40)}`, 41)).toBeNull();
  });
});

describe("insertMention", () => {
  test("zamenjuje otvoreni upit imenom i razmakom", () => {
    expect(insertMention("Hej @an", 7, ANA)).toEqual({
      text: "Hej @Ana ",
      caret: 9,
    });
    expect(insertMention("Hej @an, vidi", 7, ANA)).toEqual({
      text: "Hej @Ana , vidi",
      caret: 9,
    });
  });

  test("bez otvorenog upita ubacuje na kursor", () => {
    expect(insertMention("Hej ", 4, ANA)).toEqual({
      text: "Hej @Ana ",
      caret: 9,
    });
    expect(insertMention("ana@posta", 9, ANA)).toEqual({
      text: "ana@posta@Ana ",
      caret: 14,
    });
  });
});

describe("serializeComment", () => {
  test("običan tekst: jedan <p> po redu, escape specijalnih znakova", () => {
    expect(serializeComment('a < b & "c"', []).content).toBe(
      "<p>a &lt; b &amp; &quot;c&quot;</p>",
    );
    expect(serializeComment("<script>x</script>", []).content).toBe(
      "<p>&lt;script&gt;x&lt;/script&gt;</p>",
    );
    expect(serializeComment("jedan\ndva", []).content).toBe(
      "<p>jedan</p><p>dva</p>",
    );
  });

  test("prazni redovi u sredini ostaju, na kraju se seku; prazan tekst je prazan", () => {
    expect(serializeComment("a\n\nb\n\n", []).content).toBe(
      "<p>a</p><p></p><p>b</p>",
    );
    expect(serializeComment("   \n ", [])).toEqual({
      content: "",
      mentionProfileIds: [],
    });
  });

  test("pominjanje postaje span sa id-jem, a id ide u spisak", () => {
    expect(serializeComment("Hej @Ana, vidi", [ANA])).toEqual({
      content: '<p>Hej <span data-mention-id="p-ana">@Ana</span>, vidi</p>',
      mentionProfileIds: ["p-ana"],
    });
    expect(serializeComment("@Đorđe pogledaj", [DJORDJE]).mentionProfileIds)
      .toEqual(["p-dj"]);
  });

  test("obrisano @Ime iz teksta izbacuje id", () => {
    expect(serializeComment("Hej Ana", [ANA])).toEqual({
      content: "<p>Hej Ana</p>",
      mentionProfileIds: [],
    });
  });

  test("isti član više puta se šalje jednom, a duže ime pobeđuje kraće", () => {
    const result = serializeComment("@Ana i opet @Ana", [ANA]);
    expect(result.mentionProfileIds).toEqual(["p-ana"]);
    expect(result.content.match(/data-mention-id/g)).toHaveLength(2);

    const long = serializeComment("@Anastasija, @Ana", [ANA, ANASTASIJA]);
    expect(long.mentionProfileIds).toEqual(["p-anastasija", "p-ana"]);
  });

  test("@Ana ne pogađa početak dužeg imena koje nije izabrano", () => {
    expect(serializeComment("@Anastasija", [ANA])).toEqual({
      content: "<p>@Anastasija</p>",
      mentionProfileIds: [],
    });
  });

  test("@ u e-adresi nije pominjanje", () => {
    expect(serializeComment("ana@Ana.rs", [ANA]).mentionProfileIds).toEqual([]);
  });

  test("više od 20 različitih pominjanja: višak ostaje običan tekst", () => {
    const members = Array.from({ length: 25 }, (_, index) => ({
      profileId: `p-${index}`,
      displayName: `Clan${String.fromCharCode(65 + index)}`,
    }));
    const text = members.map((member) => `@${member.displayName}`).join(" ");
    const result = serializeComment(text, members);
    expect(result.mentionProfileIds).toHaveLength(MAX_COMMENT_MENTIONS);
    expect(result.mentionProfileIds).toEqual(
      members.slice(0, MAX_COMMENT_MENTIONS).map((member) => member.profileId),
    );
    expect(result.content.match(/data-mention-id/g)).toHaveLength(
      MAX_COMMENT_MENTIONS,
    );
    expect(result.content).toContain("@ClanU");
  });
});

describe("parseCommentSegments", () => {
  test("kružni test: serialize → parse vraća tekst, pominjanja i prelome", () => {
    const { content } = serializeComment(
      "Hej @Ana, vidi <b> & ovo\n\nPozdrav @Đorđe",
      [ANA, DJORDJE],
    );
    expect(parseCommentSegments(content)).toEqual([
      { kind: "text", text: "Hej " },
      { kind: "mention", profileId: "p-ana", label: "@Ana" },
      { kind: "text", text: ", vidi <b> & ovo" },
      { kind: "break" },
      { kind: "break" },
      { kind: "text", text: "Pozdrav " },
      { kind: "mention", profileId: "p-dj", label: "@Đorđe" },
    ]);
  });

  test("stari HTML se svodi na tekst, bez tagova", () => {
    expect(
      parseCommentSegments("<p><strong>Važno</strong> je</p><p>Drugi red</p>"),
    ).toEqual([
      { kind: "text", text: "Važno je" },
      { kind: "break" },
      { kind: "text", text: "Drugi red" },
    ]);
    expect(
      parseCommentSegments('<img src=x onerror="alert(1)">Tekst člana'),
    ).toEqual([{ kind: "text", text: "Tekst člana" }]);
  });

  test("običan tekst sa novim redovima i entiteti", () => {
    expect(parseCommentSegments("prvi\ndrugi")).toEqual([
      { kind: "text", text: "prvi" },
      { kind: "break" },
      { kind: "text", text: "drugi" },
    ]);
    expect(parseCommentSegments("a&nbsp;b &lt;c&gt; &amp; &quot;d&quot;")).toEqual(
      [{ kind: "text", text: 'a b <c> & "d"' }],
    );
    expect(parseCommentSegments("jedan<br>dva<br/>tri")).toEqual([
      { kind: "text", text: "jedan" },
      { kind: "break" },
      { kind: "text", text: "dva" },
      { kind: "break" },
      { kind: "text", text: "tri" },
    ]);
  });

  test("prazni redovi sa početka i kraja se seku, prazan sadržaj nema delova", () => {
    expect(parseCommentSegments("<p></p><p>a</p><p></p>")).toEqual([
      { kind: "text", text: "a" },
    ]);
    expect(parseCommentSegments("")).toEqual([]);
  });

  test("span bez id-ja nije pominjanje, a labela se nikad ne vraća kao HTML", () => {
    expect(parseCommentSegments("<span>@Ana</span>")).toEqual([
      { kind: "text", text: "@Ana" },
    ]);
    expect(
      parseCommentSegments(
        '<p><span data-mention-id="p-1"><b>@Ana</b></span></p>',
      ),
    ).toEqual([{ kind: "mention", profileId: "p-1", label: "@Ana" }]);
  });
});
