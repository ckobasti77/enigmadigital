import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { osigurajZaduzenje, vlasnikNoveFirme } from "./lib/leadZaduzenje";

/**
 * ============================================================================
 * NAKNADNO ZADUŽENJE ZA FIRME BEZ NJEGA (ULTRA-PLAN §4 tačka 4, P8)
 * ============================================================================
 *
 * Firme napravljene pre nego što je svaki nastanak firme dobio zaduženje
 * (upit sa sajta, poruka sa mreže, kopija iz drugog projekta) nemaju
 * `leadAssignments` red, pa se ne vide u Tabeli, na Mapi ni u redu poziva.
 *
 * Pravila:
 * - Radi u serijama: jedna strana `leadCompanies`, pa zakazuje sledeću.
 * - Idempotentna: firma koja već ima zaduženje se preskače, pa drugo
 *   puštanje ne menja ništa.
 * - Zadužen je član koji je firmu napravio (`createdBy`, ako je i dalje
 *   urednik ili vlasnik projekta), inače vlasnik projekta — isto pravilo kao
 *   za novu firmu (`lib/leadZaduzenje.ts`). Projekat bez ijednog vlasnika se
 *   preskače i broji, zaduženje se ne izmišlja.
 * - `probno: true` samo broji i ništa ne upisuje.
 *
 * Pušta je Jovan, ne noćni run (P8). Komanda je u `docs/ULTRA1-PROGRESS.md`
 * (sekcija T02).
 */

const PODRAZUMEVANA_SERIJA = 100;
const NAJVECA_SERIJA = 200;

const zbirValidator = v.object({
  pregledano: v.number(),
  dodeljeno: v.number(),
  vecImaju: v.number(),
  bezVlasnika: v.number(),
});

type Zbir = {
  pregledano: number;
  dodeljeno: number;
  vecImaju: number;
  bezVlasnika: number;
};

export const dodeliBezZaduzenja = internalMutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    probno: v.optional(v.boolean()),
    velicina: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
    // Zbir prethodnih serija, da poslednja serija u logu kaže ukupno.
    dosad: v.optional(zbirValidator),
  },
  returns: v.object({
    serija: zbirValidator,
    ukupno: zbirValidator,
    gotovo: v.boolean(),
    probno: v.boolean(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ serija: Zbir; ukupno: Zbir; gotovo: boolean; probno: boolean }> => {
    const probno = args.probno === true;
    const numItems = Math.min(
      Math.max(Math.floor(args.velicina ?? PODRAZUMEVANA_SERIJA), 1),
      NAJVECA_SERIJA,
    );

    const workspaceId = args.workspaceId;
    const upit =
      workspaceId === undefined
        ? ctx.db.query("leadCompanies")
        : ctx.db
            .query("leadCompanies")
            .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId));
    const strana = await upit.paginate({ numItems, cursor: args.cursor ?? null });

    const serija: Zbir = { pregledano: 0, dodeljeno: 0, vecImaju: 0, bezVlasnika: 0 };
    const now = Date.now();

    for (const firma of strana.page) {
      serija.pregledano++;
      const postoji = await ctx.db
        .query("leadAssignments")
        .withIndex("by_workspace_company", (q) =>
          q.eq("workspaceId", firma.workspaceId).eq("companyId", firma._id),
        )
        .first();
      if (postoji !== null) {
        serija.vecImaju++;
        continue;
      }

      const vlasnik = await vlasnikNoveFirme(ctx, firma.workspaceId, firma.createdBy);
      if (vlasnik === null) {
        serija.bezVlasnika++;
        continue;
      }

      if (!probno) {
        await osigurajZaduzenje(ctx, {
          workspaceId: firma.workspaceId,
          companyId: firma._id,
          ownerUserId: vlasnik,
          // Radnju ne izvodi član nego sistem; događaj traži autora, pa je to
          // onaj ko je zadužen, a napomena kaže kako je nastao.
          actorUserId: vlasnik,
          now,
          napomena:
            "Zaduženje dodato naknadno: firma ga nije imala, pa se nije videla u Tabeli, na Mapi ni u redu poziva.",
        });
      }
      serija.dodeljeno++;
    }

    const dosad = args.dosad ?? { pregledano: 0, dodeljeno: 0, vecImaju: 0, bezVlasnika: 0 };
    const ukupno: Zbir = {
      pregledano: dosad.pregledano + serija.pregledano,
      dodeljeno: dosad.dodeljeno + serija.dodeljeno,
      vecImaju: dosad.vecImaju + serija.vecImaju,
      bezVlasnika: dosad.bezVlasnika + serija.bezVlasnika,
    };

    if (!strana.isDone) {
      await ctx.scheduler.runAfter(0, internal.leadZaduzenja.dodeliBezZaduzenja, {
        workspaceId: args.workspaceId,
        probno: args.probno,
        velicina: numItems,
        cursor: strana.continueCursor,
        dosad: ukupno,
      });
    } else {
      console.log(
        `dodeliBezZaduzenja${probno ? " (probno, ništa nije upisano)" : ""}: ` +
          `pregledano ${ukupno.pregledano}, ` +
          `${probno ? "dobilo bi" : "dobilo"} zaduženje ${ukupno.dodeljeno}, ` +
          `već imalo ${ukupno.vecImaju}, bez vlasnika projekta ${ukupno.bezVlasnika}.`,
      );
    }

    return { serija, ukupno, gotovo: strana.isDone, probno };
  },
});
