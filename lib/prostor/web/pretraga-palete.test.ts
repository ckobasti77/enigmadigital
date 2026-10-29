import { describe, expect, test } from "vitest";
import type { Id, TableNames } from "../../../convex/_generated/dataModel";
import { POGODAKA_PO_GRUPI, grupisiPogotke, terminPretrage, type UlazPretrage } from "./pretraga-palete";

const id = <T extends TableNames>(s: string) => s as Id<T>;

const oblast = { label: "Razvoj" };
const ULAZ: UlazPretrage = {
  stranice: [
    { _id: id<"pages">("pagesux0001"), kind: "document", title: "Plan lansiranja", area: oblast },
    { _id: id<"pages">("pagesux0200"), kind: "task", title: "Pozvati dobavljača", area: oblast },
    { _id: id<"pages">("pagesux0300"), kind: "document", title: "  ", area: null },
  ],
  cvorovi: {
    ideas: [{ _id: id<"ideaNodes">("ideaNodesux0003"), title: null, text: "Lansiranje u martu" }],
    thoughts: [{ _id: id<"thoughtNodes">("thoughtNodesux1"), title: "Pitanja", text: "Šta sa cenom?" }],
  },
  poruke: [
    {
      _id: id<"chatMessages">("chatMessagesux1"),
      channelId: id<"chatChannels">("chatChannelsux0001"),
      channelName: "Opšte",
      body: "Lansiranje pomeramo",
      author: { displayName: "Ana" },
    },
    {
      _id: id<"chatMessages">("chatMessagesux2"),
      channelId: id<"chatChannels">("chatChannelsux0021"),
      channelName: "",
      body: "",
      author: null,
    },
  ],
  firme: [
    { assignment: { companyId: "lc_ux_test_001" }, company: { name: "Test Salon 1", city: "Beograd" } },
    { assignment: { companyId: "lc_ux_test_002" }, company: null },
  ],
};

describe("termin pretrage", () => {
  test("najmanje dva znaka, bez praznina sa strane", () => {
    expect(terminPretrage("")).toBeNull();
    expect(terminPretrage(" a ")).toBeNull();
    expect(terminPretrage("  la ")).toBe("la");
  });

  test("dug upit se seče na 200 znakova (plafon servera)", () => {
    expect(terminPretrage("x".repeat(250))?.length).toBe(200);
  });
});

describe("grupe palete u projektu", () => {
  const grupe = grupisiPogotke(ULAZ, "projekat");

  test("pet grupa radnog dela pa Firme, stalnim redom", () => {
    expect(grupe.map((g) => g.naslov)).toEqual(["Stranice", "Zadaci", "Ideje", "Beleške", "Poruke", "Firme"]);
  });

  test("stranica i zadatak se dele po vrsti i vode na stranicu u projektu", () => {
    const [stranice, zadaci] = grupe;
    expect(stranice.pogoci.map((p) => [p.naslov, p.opis, p.href])).toEqual([
      ["Plan lansiranja", "Razvoj", "/stranica/pagesux0001"],
      ["Bez naslova", "", "/stranica/pagesux0300"],
    ]);
    expect(zadaci.pogoci[0]).toMatchObject({ naslov: "Pozvati dobavljača", href: "/stranica/pagesux0200", uJa: false });
  });

  test("ideja otvara detalj, beleška mapu beleški projekta", () => {
    expect(grupe[2].pogoci[0]).toMatchObject({ naslov: "Lansiranje u martu", opis: "", href: "/ideje?ideja=ideaNodesux0003" });
    expect(grupe[3].pogoci[0]).toMatchObject({ naslov: "Pitanja", opis: "Šta sa cenom?", href: "/beleske" });
  });

  test("poruka vodi u razgovor projekta; prazna je „Prilog“, kanal bez imena „Razgovor“", () => {
    expect(grupe[4].pogoci.map((p) => [p.naslov, p.opis, p.href])).toEqual([
      ["Lansiranje pomeramo", "Opšte · Ana", "/poruke?kanal=chatChannelsux0001"],
      ["Prilog", "Razgovor", "/poruke?kanal=chatChannelsux0021"],
    ]);
  });

  test("firma po imenu vodi na profil u Leadovima; red bez firme izostaje", () => {
    expect(grupe[5].pogoci).toEqual([
      {
        id: "firma:lc_ux_test_001",
        vrsta: "firma",
        naslov: "Test Salon 1",
        opis: "Beograd",
        href: "/leadovi/lc_ux_test_001",
        uJa: false,
      },
    ]);
  });

  test("ključevi su jedinstveni", () => {
    const ids = grupe.flatMap((g) => g.pogoci.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("grupa pokazuje najviše plafon pogodaka, a pamti koliko ih je stiglo", () => {
    const mnogo = Array.from({ length: 9 }, (_, i) => ({
      _id: id<"pages">(`pagesux09${i}0`),
      kind: "document",
      title: `Strana ${i}`,
      area: null,
    }));
    const [g] = grupisiPogotke({ stranice: mnogo }, "projekat");
    expect(g.pogoci).toHaveLength(POGODAKA_PO_GRUPI);
    expect(g.ukupno).toBe(9);
  });

  test("bez pogodaka nema grupa", () => {
    expect(grupisiPogotke({}, "projekat")).toEqual([]);
  });
});

describe("grupe palete u „Ja“", () => {
  test("samo lični razgovori, pun put „Ja“ — podaci projekta se ne prikazuju", () => {
    const grupe = grupisiPogotke(ULAZ, "ja");
    expect(grupe.map((g) => g.naslov)).toEqual(["Poruke"]);
    expect(grupe[0].pogoci[0]).toMatchObject({ href: "/poruke?kanal=chatChannelsux0001", uJa: true });
  });
});
