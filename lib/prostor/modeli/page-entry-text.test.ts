// Preneto iz Devotion apps/web/components/workspace/page-entry-text.test.ts (main @ c05c40f), SPAJANJE S10.
import { describe, expect, test } from "vitest";

import { pageEntryDisplayText } from "./page-entry-text";

describe("pageEntryDisplayText", () => {
  test("pretvara raniji HTML unos u čitljiv običan tekst", () => {
    expect(
      pageEntryDisplayText(
        "<p>Prvi red<br>Drugi &amp; treći</p><ul><li>Stavka</li></ul>",
      ),
    ).toBe("Prvi red\nDrugi & treći\n• Stavka");
  });

  test("uklanja izvršivi markup pre React prikaza", () => {
    const display = pageEntryDisplayText(
      '<img src=x onerror="globalThis.__xss = true"><svg onload="globalThis.__xss = true"></svg><script>globalThis.__xss = true</script>',
    );

    expect(display).toBe("globalThis.__xss = true");
    expect(display).not.toMatch(/<|>|onerror|onload|script/i);
  });

  test("čuva običan tekst, nove redove i literalne znakove poređenja", () => {
    expect(pageEntryDisplayText("Volim <3\n2 < 3 & 4 > 1")).toBe(
      "Volim <3\n2 < 3 & 4 > 1",
    );
  });
});
