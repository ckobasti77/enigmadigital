import { describe, expect, test } from "vitest";

import { nadjiDirektnePozive, proveriFront, proveriSpisak } from "./front-cuvar";
import { proveriPristup, type IzvorniFajl } from "./pristup-cuvar";

function fajl(putanja: string, tekst: string): IzvorniFajl {
  return { putanja, tekst };
}

const DOZVOLJENI = {
  "projekti.ja": "nalog prijavljenog korisnika, bez projekta",
  "invitesStore.getInvite": "ekran pozivnice pre registracije",
} as const;

describe("čuvar fronta", () => {
  test("direktan poziv funkcije projekta pada, a sa spiska prolazi sa razlogom", () => {
    const r = proveriFront(
      [
        fajl(
          "components/app/meni.tsx",
          `import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
export function Meni() {
  const ja = useQuery(api.projekti.ja);
  const veze = useQuery(api.connections.list, { workspaceId });
  return null;
}`,
        ),
      ],
      DOZVOLJENI,
    );
    expect(r.dozvoljeni.map((p) => [p.funkcija, p.razlog])).toEqual([
      ["projekti.ja", "nalog prijavljenog korisnika, bez projekta"],
    ]);
    expect(r.pali).toHaveLength(1);
    expect(r.pali[0]).toMatchObject({
      putanja: "components/app/meni.tsx",
      linija: 5,
      nacin: "useQuery",
      funkcija: "connections.list",
    });
    expect(r.pali[0].razlog).toMatch(/useProjekatQuery/);
  });

  test("prepoznaje useMutation, useAction, usePaginatedQuery, poziv u više redova i `as`", () => {
    const pozivi = nadjiDirektnePozive(
      fajl(
        "components/app/x.tsx",
        `const a = useMutation(api.rulesStore.createRule);
const b = useAction(
  api.metaAds.createLookalikeAudienceAction,
);
const c = usePaginatedQuery((api.leadFiltersStore.listLeadsFiltered as any), {}, { initialNumItems: 5 });
const d = useQuery(api.lib.modul.fn, "skip");`,
      ),
    );
    expect(pozivi.map((p) => [p.nacin, p.funkcija, p.linija])).toEqual([
      ["useMutation", "rulesStore.createRule", 1],
      ["useAction", "metaAds.createLookalikeAudienceAction", 2],
      ["usePaginatedQuery", "leadFiltersStore.listLeadsFiltered", 5],
      ["useQuery", "lib.modul.fn", 6],
    ]);
  });

  test("tolerantne kuke nivoa Ja i useQueries se proveravaju kao direktan poziv (S08, D15)", () => {
    const pozivi = nadjiDirektnePozive(
      fajl(
        "components/app/prostor/ja/x.tsx",
        `const a = useQueryTolerant(api.prostor.inbox.feed, { limit: 5 });
const b = useQueryResult(api.prostor.chat.unreadSummary, {});
const c = useQueryState(api.prostor.myDay.overview, "skip");
const d = useQueries({
  prva: { query: api.prostor.pages.listChildren, args: {} },
  druga: { "query": (api.prostor.pages.childCounts as any), args: {} },
});
const e = useQueries(zahtevi);
const f = useProjekatQueryTolerant(api.prostor.pages.get, { pageId });`,
      ),
    );
    expect(pozivi.map((p) => [p.nacin, p.funkcija, p.linija])).toEqual([
      ["useQueryTolerant", "prostor.inbox.feed", 1],
      ["useQueryResult", "prostor.chat.unreadSummary", 2],
      ["useQueryState", "prostor.myDay.overview", 3],
      ["useQueries", "prostor.pages.listChildren", 5],
      ["useQueries", "prostor.pages.childCounts", 6],
    ]);
    const r = proveriFront(
      [fajl("components/app/prostor/ja/x.tsx", "const a = useQueryTolerant(api.prostor.pages.get, {});")],
      DOZVOLJENI,
    );
    expect(r.pali.map((p) => p.funkcija)).toEqual(["prostor.pages.get"]);
  });

  test("serverska ruta: client.query/mutation/action(api.…) se proverava", () => {
    const r = proveriFront(
      [
        fajl(
          "app/api/auth/callback/x/route.ts",
          `const client = new ConvexHttpClient(url);
await client.action(api.invitesStore.getInvite, { token });
await client.mutation(api.leadCrmStore.assignLead, { workspaceId });`,
        ),
      ],
      DOZVOLJENI,
    );
    expect(r.dozvoljeni.map((p) => [p.nacin, p.funkcija])).toEqual([
      [".action", "invitesStore.getInvite"],
    ]);
    expect(r.pali.map((p) => [p.nacin, p.funkcija])).toEqual([
      [".mutation", "leadCrmStore.assignLead"],
    ]);
  });

  test("hookovi projekta, generička implementacija, komentar i string nisu direktan poziv", () => {
    expect(
      nadjiDirektnePozive(
        fajl(
          "components/app/y.tsx",
          `const a = useProjekatQuery(api.connections.list);
const b = useProjekatMutation(api.rulesStore.createRule);
// useQuery(api.connections.list) u komentaru
const s = "useMutation(api.rulesStore.deleteRule)";
export function useProjekatQueryImpl(upit: unknown, pun: unknown) {
  return useQuery(upit as FunctionReference<"query">, pun);
}
const ref = api.connections.list;`,
        ),
      ),
    ).toEqual([]);
  });

  test("spisak sme da sadrži samo javne funkcije bez projekta", () => {
    const backend = proveriPristup([
      fajl("lib/projekat.ts", "export const projekatQuery = 1;"),
      fajl(
        "projekti.ts",
        `import { prijavljenQuery, platformaQuery } from "./lib/projekat";
export const ja = prijavljenQuery({ args: {}, handler: async () => null });
export const zdravlje = platformaQuery({ args: {}, handler: async () => [] });`,
      ),
      fajl(
        "veze.ts",
        `import { query } from "./_generated/server";
import { projekatQuery } from "./lib/projekat";
export const list = projekatQuery({ args: {}, handler: async () => [] });
// javno: javni blog čita samo objavljene postove
export const objave = query({ args: {}, handler: async () => [] });`,
      ),
    ]);
    expect(
      proveriSpisak(
        {
          "projekti.ja": "nalog",
          "projekti.zdravlje": "stanje platforme",
          "veze.objave": "javni blog",
        },
        backend,
      ),
    ).toEqual([]);
    expect(
      proveriSpisak(
        { "veze.list": "pokušaj", "veze.nepostoji": "nema je", "projekti.ja": " " },
        backend,
      ).map((g) => g.funkcija),
    ).toEqual(["veze.list", "veze.nepostoji", "projekti.ja"]);
  });
});
