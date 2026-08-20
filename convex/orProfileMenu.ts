import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import { decryptCredentials } from "./lib/crypto";
import { createUsageTracker } from "./lib/metaRateLimit";
import {
  getMetaGraphVersion,
  buildMessengerProfileUrl,
  extractGraphApiError,
} from "./lib/instagramApi";
import { buildPostbackPayload, parsePostbackPayload } from "./lib/orButtons";
import {
  ICE_BREAKERS_MAX,
  ICE_BREAKER_QUESTION_MAX,
  MENU_ITEMS_MAX,
  MENU_TITLE_MAX,
  buildIceBreakersField,
  buildPersistentMenuField,
  extractProfileSummary,
  type ProfileIceBreaker,
  type ProfileMenuItem,
} from "./lib/orProfile";

/**
 * Ice breakers and the persistent menu (PLAN.md §4 / OpenReply M3).
 *
 * Default V8 runtime — no "use node": `fetch` and the Web Crypto used by
 * `decryptCredentials` both exist here, the same as in `orSend`.
 *
 * Saving writes our own row; publishing is what puts it on Instagram. The two
 * are separate on purpose — the operator edits without every keystroke
 * reaching Meta, and `publishedAt` is what says whether the two agree.
 *
 * Every function is workspace-scoped via `requireMembership`; the actions get
 * their `workspaceId` from an internal query that did the check, never from
 * the client.
 */

const LINK_URL_MAX = 1000;

function invalid(message: string): never {
  throw new ConvexError({ code: "invalid_argument", message });
}

/** Instagram only opens a full http(s) address from a menu item. */
function requireHttpUrl(value: string, label: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    invalid(`${label} mora biti puna adresa, npr. https://enigmait.rs/ponuda.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    invalid(`${label} mora počinjati sa http:// ili https://.`);
  }
}

const iceBreakerInputValidator = v.object({
  question: v.string(),
  automationId: v.id("orAutomations"),
  // Rides back out to the screen and in again on save: it is the identity of a
  // question already live on the profile, and re-minting it would break a tap
  // arriving from a thread somebody opened a minute ago.
  payload: v.optional(v.string()),
});

const menuItemInputValidator = v.object({
  title: v.string(),
  type: v.union(v.literal("url"), v.literal("postback")),
  url: v.optional(v.string()),
  automationId: v.optional(v.id("orAutomations")),
  payload: v.optional(v.string()),
});

type IceBreakerInput = {
  question: string;
  automationId: Id<"orAutomations">;
  payload?: string;
};

type MenuItemInput = {
  title: string;
  type: "url" | "postback";
  url?: string;
  automationId?: Id<"orAutomations">;
  payload?: string;
};

// ── Queries ──────────────────────────────────────────────────────────────────

const profileMenuViewValidator = v.object({
  iceBreakers: v.array(
    v.object({
      question: v.string(),
      automationId: v.id("orAutomations"),
      // Null once the automation behind it is deleted — the entry still sits
      // on the profile, so the screen has to be able to point at it.
      automationName: v.union(v.string(), v.null()),
      payload: v.union(v.string(), v.null()),
    }),
  ),
  menuItems: v.array(
    v.object({
      title: v.string(),
      type: v.union(v.literal("url"), v.literal("postback")),
      url: v.union(v.string(), v.null()),
      automationId: v.union(v.id("orAutomations"), v.null()),
      automationName: v.union(v.string(), v.null()),
      payload: v.union(v.string(), v.null()),
    }),
  ),
  publishedAt: v.union(v.number(), v.null()),
  publishError: v.union(v.string(), v.null()),
  updatedAt: v.union(v.number(), v.null()),
});

/**
 * What this workspace has saved, with the name of every automation it points
 * at resolved. Returns empty lists when nothing was ever saved, so the screen
 * has one shape to render.
 */
export const getProfileMenu = query({
  args: {},
  returns: profileMenuViewValidator,
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);

    const row = await ctx.db
      .query("orProfileMenus")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .first();

    if (row === null) {
      return {
        iceBreakers: [],
        menuItems: [],
        publishedAt: null,
        publishError: null,
        updatedAt: null,
      };
    }

    // Deleting an automation leaves the id dangling here on purpose: the
    // question is still live on Instagram until the menu is published again.
    const names = new Map<Id<"orAutomations">, string>();
    for (const id of new Set([
      ...row.iceBreakers.map((i) => i.automationId),
      ...row.menuItems.flatMap((m) => (m.automationId ? [m.automationId] : [])),
    ])) {
      const automation = await ctx.db.get(id);
      if (automation !== null && automation.workspaceId === workspaceId) {
        names.set(id, automation.name);
      }
    }

    return {
      iceBreakers: row.iceBreakers.map((iceBreaker) => ({
        question: iceBreaker.question,
        automationId: iceBreaker.automationId,
        automationName: names.get(iceBreaker.automationId) ?? null,
        payload: iceBreaker.payload ?? null,
      })),
      menuItems: row.menuItems.map((item) => ({
        title: item.title,
        type: item.type,
        url: item.url ?? null,
        automationId: item.automationId ?? null,
        automationName:
          item.automationId !== undefined
            ? (names.get(item.automationId) ?? null)
            : null,
        payload: item.payload ?? null,
      })),
      publishedAt: row.publishedAt ?? null,
      publishError: row.publishError ?? null,
      updatedAt: row.updatedAt,
    };
  },
});

// ── Mutations ────────────────────────────────────────────────────────────────

/**
 * Keep the payload a tap already comes back on, mint one when there is none.
 *
 * Same rule as `mintButtonPayloads` in orAutomationsApi: a payload that
 * already names this automation is left alone, because it is sitting in the
 * profile of everyone who has the thread open. A payload naming a different
 * automation is stale — the operator repointed the entry — and gets replaced.
 */
function keepOrMintPayload(
  payload: string | undefined,
  automationId: Id<"orAutomations">,
): string {
  if (
    payload !== undefined &&
    parsePostbackPayload(payload)?.automationId === automationId
  ) {
    return payload;
  }
  return buildPostbackPayload(automationId);
}

/**
 * Save the ice breakers and the menu. Nothing reaches Instagram here — the
 * `publish` action does that, and `publishedAt` is cleared to null when the
 * saved shape stops matching what was published.
 */
export const saveProfileMenu = mutation({
  args: {
    iceBreakers: v.array(iceBreakerInputValidator),
    menuItems: v.array(menuItemInputValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);

    // An entry may only point at an automation from this workspace, and only
    // at one that still exists — the payload is built out of that id.
    const requireOwnAutomation = async (
      automationId: Id<"orAutomations">,
      label: string,
    ): Promise<void> => {
      const automation = await ctx.db.get(automationId);
      if (automation === null || automation.workspaceId !== workspaceId) {
        invalid(`Automatizacija izabrana za „${label}” više ne postoji.`);
      }
    };

    const iceBreakers: {
      question: string;
      automationId: Id<"orAutomations">;
      payload: string;
    }[] = [];
    for (const raw of args.iceBreakers as IceBreakerInput[]) {
      const question = raw.question.trim();
      if (question.length === 0) continue;
      if (question.length > ICE_BREAKER_QUESTION_MAX) {
        invalid(
          `Pitanje može imati najviše ${ICE_BREAKER_QUESTION_MAX} karaktera.`,
        );
      }
      await requireOwnAutomation(raw.automationId, question);
      iceBreakers.push({
        question,
        automationId: raw.automationId,
        payload: keepOrMintPayload(raw.payload, raw.automationId),
      });
    }
    if (iceBreakers.length > ICE_BREAKERS_MAX) {
      invalid(`Instagram prikazuje najviše ${ICE_BREAKERS_MAX} pitanja.`);
    }

    const menuItems: MenuItemInput[] = [];
    for (const raw of args.menuItems as MenuItemInput[]) {
      const title = raw.title.trim();
      if (title.length === 0) continue;
      if (title.length > MENU_TITLE_MAX) {
        invalid(
          `Naziv stavke menija može imati najviše ${MENU_TITLE_MAX} karaktera.`,
        );
      }

      if (raw.type === "url") {
        const url = raw.url?.trim();
        if (!url) {
          invalid(`Unesi link za stavku „${title}”.`);
        }
        if (url.length > LINK_URL_MAX) {
          invalid(`Link može imati najviše ${LINK_URL_MAX} karaktera.`);
        }
        requireHttpUrl(url, "Link u meniju");
        menuItems.push({ title, type: "url", url });
        continue;
      }

      const automationId = raw.automationId;
      if (automationId === undefined) {
        invalid(`Izaberi automatizaciju koju pokreće stavka „${title}”.`);
      }
      await requireOwnAutomation(automationId, title);
      menuItems.push({
        title,
        type: "postback",
        automationId,
        payload: keepOrMintPayload(raw.payload, automationId),
      });
    }
    if (menuItems.length > MENU_ITEMS_MAX) {
      invalid(`Meni može imati najviše ${MENU_ITEMS_MAX} stavki.`);
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("orProfileMenus")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .first();

    if (existing === null) {
      await ctx.db.insert("orProfileMenus", {
        workspaceId,
        iceBreakers,
        menuItems,
        createdAt: now,
        updatedAt: now,
      });
      return null;
    }

    // What is on Instagram is now older than what is saved, so the screen has
    // to say "objavi" again rather than keep showing the old timestamp.
    await ctx.db.patch(existing._id, {
      iceBreakers,
      menuItems,
      publishedAt: undefined,
      publishError: undefined,
      updatedAt: now,
    });
    return null;
  },
});

// ── Internal helpers for the actions ─────────────────────────────────────────

type PublishContext = {
  workspaceId: Id<"workspaces">;
  igUserId: string;
  encryptedCredentials: string;
  iceBreakers: ProfileIceBreaker[];
  menuItems: ProfileMenuItem[];
} | null;

/**
 * Everything an action needs: the membership check, the saved lists and the
 * workspace's Instagram credentials. Null when no Instagram account is
 * connected — there is nothing to write to then.
 */
export const loadPublishContext = internalQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      workspaceId: v.id("workspaces"),
      igUserId: v.string(),
      encryptedCredentials: v.string(),
      iceBreakers: v.array(
        v.object({
          question: v.string(),
          payload: v.optional(v.string()),
        }),
      ),
      menuItems: v.array(
        v.object({
          title: v.string(),
          type: v.union(v.literal("url"), v.literal("postback")),
          url: v.optional(v.string()),
          payload: v.optional(v.string()),
        }),
      ),
    }),
  ),
  handler: async (ctx): Promise<PublishContext> => {
    const { workspaceId } = await requireMembership(ctx);

    const igConn = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "meta_ig"),
      )
      .first();

    if (
      igConn === null ||
      igConn.externalId === undefined ||
      igConn.externalId.length === 0
    ) {
      return null;
    }

    const row = await ctx.db
      .query("orProfileMenus")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .first();

    return {
      workspaceId,
      igUserId: igConn.externalId,
      encryptedCredentials: igConn.encryptedCredentials,
      iceBreakers: (row?.iceBreakers ?? []).map((iceBreaker) => ({
        question: iceBreaker.question,
        payload: iceBreaker.payload,
      })),
      menuItems: (row?.menuItems ?? []).map((item) => ({
        title: item.title,
        type: item.type,
        url: item.url,
        payload: item.payload,
      })),
    };
  },
});

/** Stamp the outcome of a publish / removal on the row. */
export const recordPublishResult = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    publishedAt: v.optional(v.number()),
    publishError: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("orProfileMenus")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .first();

    if (row === null) {
      return null;
    }

    await ctx.db.patch(row._id, {
      publishedAt: args.publishedAt,
      publishError: args.publishError,
    });
    return null;
  },
});

// ── Actions ──────────────────────────────────────────────────────────────────

/** Shared preamble: context + a decrypted token, or a Serbian error. */
async function loadToken(
  ctx: ActionCtx,
): Promise<{ context: NonNullable<PublishContext>; token: string }> {
  const context: PublishContext = await ctx.runQuery(
    internal.orProfileMenu.loadPublishContext,
    {},
  );

  if (context === null) {
    throw new ConvexError({
      code: "invalid",
      message: "Prvo poveži Instagram nalog.",
    });
  }

  let token: string;
  try {
    token = await decryptCredentials(context.encryptedCredentials);
  } catch {
    throw new ConvexError({
      code: "invalid",
      message: "Neuspela dekripcija Instagram tokena.",
    });
  }

  return { context, token };
}

/** Read the Graph API's own message out of a failed response. */
async function graphError(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  return extractGraphApiError(body).slice(0, 300);
}

/**
 * Put the saved ice breakers and menu on the Instagram account.
 *
 * A field with nothing in it is DELETE-d rather than POSTed empty: Meta clears
 * a messenger profile field by deleting it, so removing the last ice breaker
 * and publishing has to actually take it off the profile.
 */
export const publish = action({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const { context, token } = await loadToken(ctx);

    const iceBreakers = buildIceBreakersField(context.iceBreakers);
    const persistentMenu = buildPersistentMenuField(context.menuItems);

    if (iceBreakers === null && persistentMenu === null) {
      throw new ConvexError({
        code: "invalid",
        message:
          "Dodaj bar jedno pitanje ili stavku menija, ili ih ukloni sa Instagrama.",
      });
    }

    const url = buildMessengerProfileUrl(getMetaGraphVersion());
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    // Two writes to graph.instagram.com behind one button, and both count
    // against the allowance the schedulers ration (P2).
    const tracker = createUsageTracker();
    try {
      const fail = async (message: string): Promise<never> => {
        await ctx.runMutation(internal.orProfileMenu.recordPublishResult, {
          workspaceId: context.workspaceId,
          publishError: message,
        });
        throw new ConvexError({ code: "invalid", message });
      };

      const body: Record<string, unknown> = { platform: "instagram" };
      if (iceBreakers !== null) body.ice_breakers = iceBreakers;
      if (persistentMenu !== null) body.persistent_menu = persistentMenu;

      try {
        const res = await tracker.fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          return await fail(await graphError(res));
        }
      } catch (err) {
        const rawMsg = err instanceof Error ? err.message : String(err);
        return await fail(extractGraphApiError(rawMsg).slice(0, 300));
      }

      const emptyFields = [
        ...(iceBreakers === null ? ["ice_breakers"] : []),
        ...(persistentMenu === null ? ["persistent_menu"] : []),
      ];

      // Clearing a field means DELETE-ing it, so emptying the menu and
      // publishing actually takes it off the profile. A field that was never set
      // answers with an error, which is the ordinary case here — the publish
      // itself already succeeded, so it is logged and not surfaced as a failed
      // publish. "Proveri šta je objavljeno" is what settles any doubt.
      if (emptyFields.length > 0) {
        try {
          const res = await tracker.fetch(url, {
            method: "DELETE",
            headers,
            body: JSON.stringify({ fields: emptyFields }),
          });
          if (!res.ok) {
            console.warn(
              "OpenReply: brisanje praznih polja messenger profila nije uspelo",
              emptyFields.join(","),
              await graphError(res),
            );
          }
        } catch (err) {
          console.warn(
            "OpenReply: brisanje praznih polja messenger profila nije uspelo",
            emptyFields.join(","),
            err instanceof Error ? err.message : String(err),
          );
        }
      }

      await ctx.runMutation(internal.orProfileMenu.recordPublishResult, {
        workspaceId: context.workspaceId,
        publishedAt: Date.now(),
      });
      return null;
    } finally {
      await tracker.flush(ctx, context.workspaceId);
    }
  },
});

/**
 * Take both fields off the Instagram account. What is saved here stays saved,
 * so publishing puts it back.
 */
export const unpublish = action({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const { context, token } = await loadToken(ctx);

    const tracker = createUsageTracker();
    try {
      const res = await tracker.fetch(buildMessengerProfileUrl(getMetaGraphVersion()), {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: ["ice_breakers", "persistent_menu"],
        }),
      });

      if (!res.ok) {
        const message = await graphError(res);
        await ctx.runMutation(internal.orProfileMenu.recordPublishResult, {
          workspaceId: context.workspaceId,
          publishError: message,
        });
        throw new ConvexError({ code: "invalid", message });
      }
    } catch (err) {
      if (err instanceof ConvexError) throw err;
      const rawMsg = err instanceof Error ? err.message : String(err);
      throw new ConvexError({
        code: "invalid",
        message: extractGraphApiError(rawMsg).slice(0, 300),
      });
    } finally {
      await tracker.flush(ctx, context.workspaceId);
    }

    await ctx.runMutation(internal.orProfileMenu.recordPublishResult, {
      workspaceId: context.workspaceId,
    });
    return null;
  },
});

/**
 * What Instagram is showing right now, straight from the account — the only
 * way to tell that a publish from another tool (or another app) overwrote
 * ours. Read one field per request, the documented form.
 */
export const fetchLiveProfile = action({
  args: {},
  returns: v.object({
    iceBreakerQuestions: v.array(v.string()),
    menuTitles: v.array(v.string()),
  }),
  handler: async (
    ctx,
  ): Promise<{ iceBreakerQuestions: string[]; menuTitles: string[] }> => {
    const { context, token } = await loadToken(ctx);

    const base = buildMessengerProfileUrl(getMetaGraphVersion());

    const tracker = createUsageTracker();
    const readField = async (field: string): Promise<unknown> => {
      const url = new URL(base);
      url.searchParams.set("fields", field);
      const res = await tracker.fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new ConvexError({
          code: "invalid",
          message: await graphError(res),
        });
      }
      return (await res.json()) as unknown;
    };

    try {
      const iceBreakers = extractProfileSummary(
        await readField("ice_breakers"),
      );
      const menu = extractProfileSummary(await readField("persistent_menu"));
      return {
        iceBreakerQuestions: iceBreakers.iceBreakerQuestions,
        menuTitles: menu.menuTitles,
      };
    } catch (err) {
      if (err instanceof ConvexError) throw err;
      const rawMsg = err instanceof Error ? err.message : String(err);
      throw new ConvexError({
        code: "invalid",
        message: extractGraphApiError(rawMsg).slice(0, 300),
      });
    } finally {
      await tracker.flush(ctx, context.workspaceId);
    }
  },
});
