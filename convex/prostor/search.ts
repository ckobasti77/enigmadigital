// Preneto iz Devotion packages/backend/convex/search.ts (main @ c05c40f), SPAJANJE S03.
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { requireProfile, requireClanProjekta } from "./lib/auth";
import { listMyActiveWorkspaces, workspaceMiniOf } from "./lib/my_scope";
import { summarizePage } from "./lib/pages";
import { boundedLimit, pageKindValidator } from "./lib/validators";
import { prijavljenQuery, projekatQuery } from "../lib/projekat";

export const pages = prijavljenQuery({
  args: {
    query: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    kind: v.optional(pageKindValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const searchTerm = args.query.trim().slice(0, 200);
    if (searchTerm.length < 2) return [];
    const limit = boundedLimit(args.limit, 20, 50);

    let workspaceIds: Id<"workspaces">[];
    if (args.workspaceId !== undefined) {
      await requireClanProjekta(ctx, args.workspaceId);
      workspaceIds = [args.workspaceId];
    } else {
      // Devotion: prvih 20 članstava. Ovde: prvih 20 owner/urednik projekata
      // (bez client_viewer i arhiviranih), kroz adapter (S01 §3.3).
      workspaceIds = [
        ...(await listMyActiveWorkspaces(ctx, profile._id, 20)).keys(),
      ];
    }

    const result = [];
    const areasById = new Map<string, Doc<"areas"> | null>();
    for (const workspaceId of workspaceIds) {
      const workspaceDoc = await ctx.db.get("workspaces", workspaceId);
      if (workspaceDoc === null || workspaceDoc.arhiviran === true) continue;
      // Samo `_id`, ime i logo: ceo `workspaces` red nosi Enigmina podešavanja.
      const workspace = await workspaceMiniOf(ctx, workspaceDoc);
      const matches = args.kind === undefined
        ? await ctx.db
            .query("pages")
            .withSearchIndex("search_title_and_content", (q) =>
              q
                .search("searchText", searchTerm)
                .eq("workspaceId", workspaceId)
                .eq("archivedAt", null),
            )
            .take(limit)
        : await ctx.db
            .query("pages")
            .withSearchIndex("search_title_and_content", (q) =>
              q
                .search("searchText", searchTerm)
                .eq("workspaceId", workspaceId)
                .eq("kind", args.kind!)
                .eq("archivedAt", null),
            )
            .take(limit);
      for (const page of matches) {
        let area = areasById.get(page.areaId);
        if (area === undefined) {
          area = await ctx.db.get("areas", page.areaId);
          areasById.set(page.areaId, area);
        }
        result.push({ ...summarizePage(page), workspace, area });
        if (result.length === limit) return result;
      }
    }
    return result;
  },
});

const nodeSearchResultValidator = v.object({
  _id: v.union(v.id("ideaNodes"), v.id("thoughtNodes")),
  title: v.union(v.string(), v.null()),
  text: v.string(),
  workspaceId: v.id("workspaces"),
});
const NODE_TEXT_SNIPPET = 280;

/**
 * Full-text pretraga ideja i misli u jednom startupu. Dve tabele — dva indeksa —
 * ali jedan poziv, jer ih klijent prikazuje kao dve grupe uporedo.
 *
 * AUTHZ: ideje su zajedničke (ideas.list filtrira samo po startupId), a misli su
 * PRIVATNE po vlasniku (thoughts.listNodes .eq ownerProfileId). Zato upit nad
 * `thoughtNodes` MORA da .eq-uje `ownerProfileId` na profil pozivaoca — u
 * suprotnom bi pretraga vraćala tuđe privatne misli. Poruke se ovde ne diraju:
 * web zove postojeći `chat.searchMessages`, koji ima svoj kanal-level authz.
 */
export const ideasAndThoughts = projekatQuery({
  uloga: "urednik",
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    ideas: v.array(nodeSearchResultValidator),
    thoughts: v.array(nodeSearchResultValidator),
  }),
  handler: async (ctx, args) => {
    const { profile } = await requireClanProjekta(ctx, args.workspaceId);
    const searchTerm = args.query.trim().slice(0, 200);
    if (searchTerm.length < 2) return { ideas: [], thoughts: [] };
    const limit = boundedLimit(args.limit, 20, 50);

    const ideaMatches = await ctx.db
      .query("ideaNodes")
      .withSearchIndex("search_ideas", (q) =>
        q
          .search("searchText", searchTerm)
          .eq("workspaceId", args.workspaceId)
          .eq("archivedAt", null),
      )
      .take(limit);

    const thoughtMatches = await ctx.db
      .query("thoughtNodes")
      .withSearchIndex("search_thoughts", (q) =>
        q
          .search("searchText", searchTerm)
          .eq("ownerProfileId", profile._id) // ← privatnost misli
          .eq("workspaceId", args.workspaceId)
          .eq("archivedAt", null),
      )
      .take(limit);

    return {
      ideas: ideaMatches.map((node) => ({
        _id: node._id,
        title: node.title,
        text: node.text.slice(0, NODE_TEXT_SNIPPET),
        workspaceId: node.workspaceId,
      })),
      // Upit je `.eq("startupId", args.startupId)`, pa lične beleške
      // (`startupId: null`, PROSTOR P7) ovde nikad ne izlaze.
      thoughts: thoughtMatches.map((node) => ({
        _id: node._id,
        title: node.title,
        text: node.text.slice(0, NODE_TEXT_SNIPPET),
        workspaceId: args.workspaceId,
      })),
    };
  },
});
