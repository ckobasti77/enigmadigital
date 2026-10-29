// Preneto iz Devotion apps/web/components/me/my-day/side-model.test.ts (main @ c05c40f), SPAJANJE S19.
import { describe, expect, test } from "vitest";

import { blockCount, chatSummary, pendingSummary, pendingTitle } from "./side-model";

const CR = { _id: "s1", name: "Cluck Rush", logoUrl: null };
const SM = { _id: "s2", name: "Scan Me", logoUrl: null };

describe("desna kolona Moj dan", () => {
  test("poruke: lično i startupi sa imenima; nula i startup van opsega se preskaču", () => {
    expect(
      chatSummary(
        {
          total: { unreadCount: 6 },
          personal: { unreadCount: 3 },
          byStartup: [
            { workspaceId: "s1", unreadCount: 2 },
            { workspaceId: "s2", unreadCount: 0 },
            { workspaceId: "tuđ", unreadCount: 1 },
          ],
        },
        [CR, SM],
      ),
    ).toEqual({ total: 6, personal: 3, byStartup: [{ workspace: CR, unread: 2 }] });
  });

  test("„Čeka tebe“ (K16): samo ideje za glasanje, sa ideaId; stare vrste ispadaju", () => {
    const idea = {
      kind: "idea_vote" as const,
      ideaId: "i1",
      title: "Novi meni",
      authorName: "Ana Ilić",
      upvotes: 2,
      downvotes: 0,
      workspace: CR,
    };
    expect(
      pendingSummary({
        items: [{ kind: "deletion_vote", ballotId: "b1", title: "Stari logo", workspace: SM }, idea],
        truncated: false,
      }),
    ).toEqual({
      items: [{ key: "idea_vote:i1", title: "Glasaj o ideji „Novi meni“", workspace: CR, ideaId: "i1" }],
      truncated: false,
    });
  });

  test("„Čeka tebe“: tekst po vrsti, ključ po izvoru", () => {
    expect(pendingTitle({ kind: "deletion_vote", ballotId: "b1", title: "Stari logo", workspace: SM })).toBe(
      "Brisanje: „Stari logo“",
    );
    const nesting = {
      kind: "page_nesting" as const,
      requestId: "r1",
      childTitle: "Cenovnik",
      parentTitle: "Prodaja",
      requesterName: "Ana Ilić",
      workspace: CR,
    };
    expect(pendingTitle(nesting)).toBe("Ana Ilić predlaže da „Cenovnik“ pređe pod „Prodaja“");
    expect(pendingTitle({ ...nesting, kind: "idea_nesting", requesterName: null })).toBe(
      "Neko predlaže da „Cenovnik“ pređe pod „Prodaja“",
    );
    // PROSTOR P22 (K16): stare vrste se više ne prikazuju u desnoj koloni.
    expect(
      pendingSummary({
        items: [{ kind: "deletion_vote", ballotId: "b1", title: "Stari logo", workspace: SM }, nesting],
        truncated: true,
      }),
    ).toEqual({ items: [], truncated: true });
  });

  test("broj za sažeti čip samo kad je blok spreman", () => {
    expect(blockCount({ status: "ready", data: { n: 4 } }, (data) => data.n)).toBe(4);
    expect(blockCount<{ n: number }>({ status: "loading" }, (data) => data.n)).toBeNull();
    expect(blockCount<{ n: number }>({ status: "hidden" }, (data) => data.n)).toBeNull();
  });
});
