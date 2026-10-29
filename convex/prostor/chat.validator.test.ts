/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/chat.validator.test.ts (main @ c05c40f), SPAJANJE S06.

import { describe, expect, test } from "vitest";

import { chatChannelSummaryValidator } from "./chat";
import { notificationItemValidator } from "./notifications";
import schema from "../schema";

/**
 * Isti razlog kao `pages.validator.test.ts`: `summarizeChannel` vraća
 * `{ ...channel }`, a `withActors` `{ ...row }`, pa returns validator mora da
 * nabroji SVAKO polje tabele (višak obara ekran tek u produkciji). Novo polje u
 * `chatChannels` ili `notifications` obara ovaj test, a ne `listChannels`,
 * `getChannel`, `listConversations`, `inbox.feed` ili `notifications.list` kod
 * korisnika. Validatori smeju da imaju i izvedena polja (nepročitano, akter).
 */
function missingFields(
  tableFields: Record<string, unknown>,
  validatorFields: Record<string, unknown>,
): string[] {
  return Object.keys(tableFields)
    .filter((field) => !(field in validatorFields))
    .sort();
}

describe("validatori sa spread-om prate šemu", () => {
  test("chatChannelSummaryValidator nabraja svako polje `chatChannels`", () => {
    expect(
      missingFields(
        schema.tables.chatChannels.validator.fields,
        chatChannelSummaryValidator.fields,
      ),
    ).toEqual([]);
  });

  test("notificationItemValidator nabraja svako polje `notifications`", () => {
    expect(
      missingFields(
        schema.tables.notifications.validator.fields,
        notificationItemValidator.fields,
      ),
    ).toEqual([]);
  });

  test("sistemska polja su tu", () => {
    for (const validator of [chatChannelSummaryValidator, notificationItemValidator]) {
      expect(Object.keys(validator.fields)).toEqual(
        expect.arrayContaining(["_id", "_creationTime"]),
      );
    }
  });
});
