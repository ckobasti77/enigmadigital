import { internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { projekatMutation, projekatQuery } from "./lib/projekat";
import { citajKanale, citajLeadove, citajUvoze } from "./notificationsStore";
import { napraviZadatke, type Zadatak } from "./lib/notifications";
import {
  DAN,
  GRANICE_CILJA,
  MAPA_DANA,
  OPSEG_TRAJNO,
  PODRAZUMEVANO,
  danKljuc,
  dodajDane,
  generisiMisije,
  izvedi,
  izvediProfil,
  jeDanKljuc,
  obracunajDan,
  parsirajProslavu,
  pocetakDana,
  pomerajMin,
  ponedeljak,
  praznaOsnova,
  primeniDan,
  razlikaDana,
  stanjeIskljuceno,
  type Dogadjaj,
  type MisijaDef,
  type NaOtvaranju,
  type Osnova,
  type Podesavanja,
  type Posao,
  type Potvrde,
  type UlazIzvedi,
} from "./lib/napredak";
import { podesavanjaValidator } from "./lib/napredakValidators";

/**
 * ============================================================================
 * NAPREDAK — XP, NIVOI, MISIJE, NIZ, DOSTIGNUĆA (B4, ui-boost-plan.md §6)
 * ============================================================================
 *
 * Pravila su u `convex/lib/napredak.ts` (čista, dokazana u `npm run
 * verify:napredak`). Ovaj fajl radi samo dve stvari: čita događaje iz tabela
 * u kojima već postoje i svodi ih na jedan oblik, i pamti ono što bi bilo
 * preskupo izvoditi svaki put.
 *
 * KAKO SE NE ČITA CELA ISTORIJA. `stanje` je pretplaćen u ljusci, na svakom
 * ekranu, i ponovo se izvršava pri svakom upisu koji dira njegov opseg. Zato:
 *
 *   - zaključeni dani stoje kao ZBIR (`osnova`) na redu sidra u `napredakDan`
 *     i više se nikad ne sabiraju iz događaja;
 *   - uživo se izvode samo OTVORENI dani: dan pre sidra, sidro i sve posle
 *     njega. XP = zbir + otvoreni dani.
 *
 * Dan pre sidra je otvoren zato što dodir i ishod smeju da se upišu unazad
 * (jutarnji upis jučerašnjeg poziva). Dalje unazad upis ne donosi XP
 * (`KASNJENJE_DANA`), pa zaključen dan ne može da se promeni naknadno.
 *
 * UPIT NE ČITA SAT. „Danas" je dan poslednjeg reda u `napredakDan` (sidro),
 * koji upisuje mutacija `zamrzniDan`. Klijent poredi `stanje.dan` sa svojim
 * beogradskim datumom i zove `zamrzniDan` kad se razlikuju. Tako upit ostaje
 * funkcija baze, kešira se između tabova i ne laže posle ponoći.
 *
 * TROŠAK po izvršenju `stanje`: članstvo 1, podešavanja 1, redovi dana ≤ 12,
 * potvrde ≤ 40, pa po jedan opseg indeksa za svaki izvor i svaki otvoren dan
 * — tipično 60–150 dokumenata. Jedini krupni dokumenti su redovi uvoza, i oni
 * se čitaju najviše `CAP_REDOVA` po danu. `zamrzniDan` jednom dnevno čita isto
 * što i zvono (`notificationsStore.staMeCeka`).
 */

// ── granice čitanja (po izvoru i po DANU) ────────────────────────────────────

const CAP_LEAD = 600;
const CAP_DOPUNA = 100;
/** XP kapa je 100 redova dnevno; preko toga red više ne menja ništa. */
const CAP_REDOVA = 120;
const CAP_UVOZA = 50;
const CAP_OBJAVA = 100;
const CAP_CLANAKA = 50;
const CAP_MODERACIJA = 300;
const CAP_OGLASA = 100;
const CAP_PRAVILA = 50;
/** Koliko događaja jedne firme se gleda da bi se našao raniji isti prelaz. */
const CAP_ISTORIJA_FIRME = 200;
const CAP_REDOVA_DANA = 12;
const CAP_POTVRDA_DANA = 20;
const CAP_POTVRDA_TRAJNIH = 100;

/** Koliko dana zaostatka `zamrzniDan` zaključava odmah, u istoj transakciji. */
const ODMAH_DANA = 3;
/** Koliko dana zaključava jedan zakazan korak. */
const MAKS_DANA_KORAK = 14;
/** Najviše potvrda u jednom pozivu `potvrdi`. */
const MAKS_POTVRDA = 30;

// ── podešavanja ──────────────────────────────────────────────────────────────

async function redPodesavanja(
  ctx: QueryCtx,
  userId: Id<"users">,
  workspaceId: Id<"workspaces">,
): Promise<Doc<"napredakPodesavanja"> | null> {
  return await ctx.db
    .query("napredakPodesavanja")
    .withIndex("by_user_workspace", (q) =>
      q.eq("userId", userId).eq("workspaceId", workspaceId),
    )
    .first();
}

/** Red iz baze preko podrazumevanih vrednosti — polje koje fali je podrazumevano. */
function izReda(red: Doc<"napredakPodesavanja"> | null): Podesavanja {
  return {
    ukljucen: red?.ukljucen ?? PODRAZUMEVANO.ukljucen,
    vikendNePrekida: red?.vikendNePrekida ?? PODRAZUMEVANO.vikendNePrekida,
    ciljPozivi: red?.ciljPozivi ?? PODRAZUMEVANO.ciljPozivi,
    ciljSastanci: red?.ciljSastanci ?? PODRAZUMEVANO.ciljSastanci,
    ciljObjave: red?.ciljObjave ?? PODRAZUMEVANO.ciljObjave,
  };
}

async function ucitajPodesavanja(
  ctx: QueryCtx,
  userId: Id<"users">,
  workspaceId: Id<"workspaces">,
): Promise<Podesavanja> {
  return izReda(await redPodesavanja(ctx, userId, workspaceId));
}

// ── redovi dana ──────────────────────────────────────────────────────────────

type RedDana = Doc<"napredakDan"> & { dan: string };

function jeRedDana(red: Doc<"napredakDan">): red is RedDana {
  return red.dan !== undefined && jeDanKljuc(red.dan);
}

/** Sidro: poslednji dan koji je zamrznut. Red bez ispravnog datuma se preskače. */
async function ucitajSidro(
  ctx: QueryCtx,
  userId: Id<"users">,
  workspaceId: Id<"workspaces">,
): Promise<RedDana | null> {
  const red = await ctx.db
    .query("napredakDan")
    .withIndex("by_user_workspace_dan", (q) =>
      q.eq("userId", userId).eq("workspaceId", workspaceId),
    )
    .order("desc")
    .first();
  return red !== null && jeRedDana(red) ? red : null;
}

async function ucitajRedove(
  ctx: QueryCtx,
  userId: Id<"users">,
  workspaceId: Id<"workspaces">,
  odDana: string,
  doDana: string | null,
  najvise: number,
): Promise<RedDana[]> {
  const redovi = await ctx.db
    .query("napredakDan")
    .withIndex("by_user_workspace_dan", (q) => {
      const od = q
        .eq("userId", userId)
        .eq("workspaceId", workspaceId)
        .gte("dan", odDana);
      return doDana === null ? od : od.lte("dan", doDana);
    })
    .take(najvise);
  return redovi.filter(jeRedDana);
}

// ── događaji: svaka tabela na isti oblik ─────────────────────────────────────

type Opseg = { od: number; doPre: number | null };

function uOpsegu(t: number | undefined, o: Opseg): t is number {
  return t !== undefined && t >= o.od && (o.doPre === null || t < o.doPre);
}

type Ucitano = { dogadjaji: Dogadjaj[]; odseceno: boolean };

/** Radnje moderacije koje se broje. Prekidači (prikaži, lajk) se ne broje. */
const MODERACIJA_BROJI = new Set(["reply", "hide", "delete"]);

/**
 * Da li je isti prelaz faze za ovu firmu već zabeležen ranije („1 po firmi").
 * Gleda sve autore: ponudu je firma dobila jednom, ko god da ju je poslao.
 */
async function vecZabelezeno(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  ev: Doc<"leadStageEvents">,
): Promise<boolean> {
  const istorija = await ctx.db
    .query("leadStageEvents")
    .withIndex("by_workspace_company", (q) =>
      q.eq("workspaceId", workspaceId).eq("companyId", ev.companyId),
    )
    .take(CAP_ISTORIJA_FIRME);
  return istorija.some(
    (r) =>
      r._id !== ev._id &&
      r.kind === "faza" &&
      r.toValue === ev.toValue &&
      (r.occurredAt < ev.occurredAt ||
        (r.occurredAt === ev.occurredAt && r._creationTime < ev._creationTime)),
  );
}

async function izLeadDogadjaja(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  ev: Doc<"leadStageEvents">,
): Promise<Dogadjaj | null> {
  const osnova = {
    id: String(ev._id),
    at: ev.occurredAt,
    // Jedini izvor u kom se vreme događaja i vreme upisa razlikuju.
    upisanAt: ev._creationTime,
    autor: String(ev.actorUserId),
    firma: String(ev.companyId),
  };
  switch (ev.kind) {
    case "dodir":
      return { ...osnova, vrsta: "dodir", podvrsta: ev.toValue };
    case "ishod":
      return { ...osnova, vrsta: "ishod", podvrsta: ev.toValue };
    case "sledeci_korak": {
      if (ev.toValue === undefined) return null;
      // `fromValue` je prethodni rok; ako je već bio prošao, korak je bio zaostao.
      const prethodni = ev.fromValue === undefined ? NaN : Number(ev.fromValue);
      const zaostao = Number.isFinite(prethodni) && prethodni < ev.occurredAt;
      return {
        ...osnova,
        vrsta: "sledeci_korak",
        ...(zaostao ? { podvrsta: "zaostao" } : {}),
      };
    }
    case "sastanak":
      // Dogovoren nosi termin u `toValue`; otkazan ga nema, a stari termin je
      // u `fromValue`.
      return ev.toValue !== undefined
        ? { ...osnova, vrsta: "sastanak", meta: ev.toValue }
        : {
            ...osnova,
            vrsta: "sastanak_otkazan",
            ...(ev.fromValue !== undefined ? { meta: ev.fromValue } : {}),
          };
    case "faza": {
      if (ev.toValue !== "poslata_ponuda" && ev.toValue !== "dobijen") {
        return null;
      }
      return {
        ...osnova,
        vrsta: ev.toValue === "dobijen" ? "dobijen" : "ponuda",
        ranije: await vecZabelezeno(ctx, workspaceId, ev),
      };
    }
    default:
      // „dodela" nije radnja koja donosi napredak.
      return null;
  }
}

/** Izvori koji imaju indeks po vremenu — čitaju se po jednom opsegu (danu). */
async function izOpsega(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  userId: Id<"users">,
  o: Opseg,
): Promise<Ucitano> {
  const [lead, dopune, redovi, igObjave, thObjave, igMod, fbMod, oglasi] =
    await Promise.all([
      ctx.db
        .query("leadStageEvents")
        .withIndex("by_workspace_actor_time", (q) => {
          const od = q
            .eq("workspaceId", workspaceId)
            .eq("actorUserId", userId)
            .gte("occurredAt", o.od);
          return o.doPre === null ? od : od.lt("occurredAt", o.doPre);
        })
        .take(CAP_LEAD + 1),
      ctx.db
        .query("leadIdentities")
        .withIndex("by_workspace_creator_time", (q) => {
          const od = q
            .eq("workspaceId", workspaceId)
            .eq("createdBy", userId)
            .gte("createdAt", o.od);
          return o.doPre === null ? od : od.lt("createdAt", o.doPre);
        })
        .take(CAP_DOPUNA + 1),
      ctx.db
        .query("leadImportRows")
        .withIndex("by_workspace_resolver_time", (q) => {
          const od = q
            .eq("workspaceId", workspaceId)
            .eq("resolvedBy", userId)
            .gte("resolvedAt", o.od);
          return o.doPre === null ? od : od.lt("resolvedAt", o.doPre);
        })
        .take(CAP_REDOVA + 1),
      ctx.db
        .query("igPublishJobs")
        .withIndex("by_workspace_published", (q) => {
          const od = q.eq("workspaceId", workspaceId).gte("publishedAt", o.od);
          return o.doPre === null ? od : od.lt("publishedAt", o.doPre);
        })
        .take(CAP_OBJAVA + 1),
      ctx.db
        .query("threadsPublishJobs")
        .withIndex("by_workspace_published", (q) => {
          const od = q.eq("workspaceId", workspaceId).gte("publishedAt", o.od);
          return o.doPre === null ? od : od.lt("publishedAt", o.doPre);
        })
        .take(CAP_OBJAVA + 1),
      ctx.db
        .query("igModerationLogs")
        .withIndex("by_workspace_created", (q) => {
          const od = q.eq("workspaceId", workspaceId).gte("createdAt", o.od);
          return o.doPre === null ? od : od.lt("createdAt", o.doPre);
        })
        .take(CAP_MODERACIJA + 1),
      ctx.db
        .query("fbModerationLogs")
        .withIndex("by_workspace_created", (q) => {
          const od = q.eq("workspaceId", workspaceId).gte("createdAt", o.od);
          return o.doPre === null ? od : od.lt("createdAt", o.doPre);
        })
        .take(CAP_MODERACIJA + 1),
      ctx.db
        .query("adActions")
        .withIndex("by_workspace_executed", (q) => {
          const od = q.eq("workspaceId", workspaceId).gte("executedAt", o.od);
          return o.doPre === null ? od : od.lt("executedAt", o.doPre);
        })
        .take(CAP_OGLASA + 1),
    ]);

  const dogadjaji: Dogadjaj[] = [];

  for (const ev of lead.slice(0, CAP_LEAD)) {
    const d = await izLeadDogadjaja(ctx, workspaceId, ev);
    if (d !== null) dogadjaji.push(d);
  }

  for (const identitet of dopune.slice(0, CAP_DOPUNA)) {
    if (identitet.kind !== "phone" || identitet.createdAt === undefined) continue;
    dogadjaji.push({
      id: String(identitet._id),
      vrsta: "dopuna",
      at: identitet.createdAt,
      upisanAt: identitet.createdAt,
      autor: identitet.createdBy ? String(identitet.createdBy) : null,
      firma: String(identitet.companyId),
    });
  }

  for (const red of redovi.slice(0, CAP_REDOVA)) {
    if (red.resolvedAt === undefined) continue;
    dogadjaji.push({
      id: String(red._id),
      vrsta: "red",
      at: red.resolvedAt,
      upisanAt: red.resolvedAt,
      autor: red.resolvedBy ? String(red.resolvedBy) : null,
    });
  }

  for (const posao of igObjave.slice(0, CAP_OBJAVA)) {
    if (posao.status !== "published" || posao.publishedAt === undefined) continue;
    dogadjaji.push({
      id: String(posao._id),
      vrsta: "objava",
      at: posao.publishedAt,
      upisanAt: posao.publishedAt,
      autor: String(posao.createdBy),
    });
  }

  for (const posao of thObjave.slice(0, CAP_OBJAVA)) {
    if (posao.status !== "published" || posao.publishedAt === undefined) continue;
    // Automatski odgovori nemaju `createdBy` → `autor: null` → 0 XP.
    const autor = posao.createdBy ? String(posao.createdBy) : null;
    if (posao.replyToId !== undefined) {
      // Odgovor na tuđu objavu nije objava, nego odgovor — ista kapa kao
      // moderacija na Instagramu i Facebooku.
      dogadjaji.push({
        id: String(posao._id),
        vrsta: "moderacija",
        at: posao.publishedAt,
        upisanAt: posao.publishedAt,
        autor,
        podvrsta: "reply",
        meta: `th:${posao.replyToId}`,
      });
    } else {
      dogadjaji.push({
        id: String(posao._id),
        vrsta: "objava",
        at: posao.publishedAt,
        upisanAt: posao.publishedAt,
        autor,
      });
    }
  }

  for (const log of igMod.slice(0, CAP_MODERACIJA)) {
    if (log.status !== "done" || !MODERACIJA_BROJI.has(log.action)) continue;
    dogadjaji.push({
      id: String(log._id),
      vrsta: "moderacija",
      at: log.createdAt,
      upisanAt: log.createdAt,
      autor: String(log.userId),
      podvrsta: log.action,
      meta: `ig:${log.commentId ?? log.mediaId ?? String(log._id)}`,
    });
  }

  for (const log of fbMod.slice(0, CAP_MODERACIJA)) {
    if (log.status !== "done" || !MODERACIJA_BROJI.has(log.action)) continue;
    dogadjaji.push({
      id: String(log._id),
      vrsta: "moderacija",
      at: log.createdAt,
      upisanAt: log.createdAt,
      autor: String(log.userId),
      podvrsta: log.action,
      meta: `fb:${log.commentId ?? log.postId ?? String(log._id)}`,
    });
  }

  for (const radnja of oglasi.slice(0, CAP_OGLASA)) {
    // Samo uspela radnja: red se upisuje kao „pending" PRE poziva ka mreži.
    if (radnja.status !== "success") continue;
    dogadjaji.push({
      id: String(radnja._id),
      vrsta: "oglas",
      at: radnja.executedAt,
      upisanAt: radnja.executedAt,
      autor: radnja.userId ? String(radnja.userId) : null,
    });
  }

  return {
    dogadjaji,
    odseceno:
      lead.length > CAP_LEAD ||
      dopune.length > CAP_DOPUNA ||
      redovi.length > CAP_REDOVA ||
      igObjave.length > CAP_OBJAVA ||
      thObjave.length > CAP_OBJAVA ||
      igMod.length > CAP_MODERACIJA ||
      fbMod.length > CAP_MODERACIJA ||
      oglasi.length > CAP_OGLASA,
  };
}

/**
 * Izvori bez indeksa po vremenu događaja (uvozi, članci, pravila). Tabele su
 * male, pa se čitaju jednom za ceo raspon i filtriraju u memoriji.
 */
async function vanOpsega(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  o: Opseg,
): Promise<Ucitano> {
  const [uvozi, clanci, pravila] = await Promise.all([
    ctx.db
      .query("leadImports")
      .withIndex("by_workspace_status", (q) =>
        q.eq("workspaceId", workspaceId).eq("status", "primenjen"),
      )
      .order("desc")
      .take(CAP_UVOZA + 1),
    // `publishedAt` je uvek ≥ `firstPublishedAt`, pa članak čija je PRVA objava
    // u rasponu sigurno ima `publishedAt` ≥ početka raspona.
    ctx.db
      .query("posts")
      .withIndex("by_workspace_status_published", (q) =>
        q
          .eq("workspaceId", workspaceId)
          .eq("status", "published")
          .gte("publishedAt", o.od),
      )
      .take(CAP_CLANAKA + 1),
    // Convex dodaje `_creationTime` na kraj svakog indeksa.
    ctx.db
      .query("rules")
      .withIndex("by_workspace", (q) => {
        const od = q.eq("workspaceId", workspaceId).gte("_creationTime", o.od);
        return o.doPre === null ? od : od.lt("_creationTime", o.doPre);
      })
      .take(CAP_PRAVILA + 1),
  ]);

  const dogadjaji: Dogadjaj[] = [];

  for (const uvoz of uvozi.slice(0, CAP_UVOZA)) {
    if (!uOpsegu(uvoz.appliedAt, o)) continue;
    // `appliedBy` se upisuje od B4; stariji uvozi pamte samo ko je poslao fajl.
    const autor = uvoz.appliedBy ?? uvoz.uploadedBy;
    dogadjaji.push({
      id: String(uvoz._id),
      vrsta: "uvoz",
      at: uvoz.appliedAt,
      upisanAt: uvoz.appliedAt,
      autor: autor ? String(autor) : null,
    });
  }

  for (const clanak of clanci.slice(0, CAP_CLANAKA)) {
    if (!uOpsegu(clanak.firstPublishedAt, o)) continue;
    dogadjaji.push({
      id: String(clanak._id),
      vrsta: "clanak",
      at: clanak.firstPublishedAt,
      upisanAt: clanak.firstPublishedAt,
      autor: clanak.publishedBy ? String(clanak.publishedBy) : null,
    });
  }

  for (const pravilo of pravila.slice(0, CAP_PRAVILA)) {
    dogadjaji.push({
      id: String(pravilo._id),
      vrsta: "pravilo",
      at: pravilo._creationTime,
      upisanAt: pravilo._creationTime,
      // Šabloni i pravila pre B4 nemaju autora → 0 XP.
      autor: pravilo.createdBy ? String(pravilo.createdBy) : null,
    });
  }

  return {
    dogadjaji,
    odseceno:
      uvozi.length > CAP_UVOZA ||
      clanci.length > CAP_CLANAKA ||
      pravila.length > CAP_PRAVILA,
  };
}

/**
 * Svi događaji u zadatim opsezima. Opsezi su susedni dani (granice čitanja
 * važe PO DANU, da gust jučerašnji dan ne pojede današnji), poređani po vremenu.
 */
async function ucitajDogadjaje(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  userId: Id<"users">,
  opsezi: readonly Opseg[],
): Promise<Ucitano> {
  if (opsezi.length === 0) return { dogadjaji: [], odseceno: false };
  const ceo: Opseg = {
    od: opsezi[0].od,
    doPre: opsezi[opsezi.length - 1].doPre,
  };
  const delovi = await Promise.all([
    vanOpsega(ctx, workspaceId, ceo),
    ...opsezi.map((o) => izOpsega(ctx, workspaceId, userId, o)),
  ]);
  return {
    dogadjaji: delovi.flatMap((d) => d.dogadjaji),
    odseceno: delovi.some((d) => d.odseceno),
  };
}

/** Jedan opseg po danu od `odDana` do `doDana`, pa (opciono) sve posle toga. */
function opseziDana(
  odDana: string,
  doDana: string,
  otvorenKraj: boolean,
): Opseg[] {
  const out: Opseg[] = [];
  for (let dan = odDana; dan <= doDana; dan = dodajDane(dan, 1)) {
    out.push({ od: pocetakDana(dan), doPre: pocetakDana(dodajDane(dan, 1)) });
  }
  if (otvorenKraj) {
    out.push({ od: pocetakDana(dodajDane(doDana, 1)), doPre: null });
  }
  return out;
}

// ── potvrde i pravila ────────────────────────────────────────────────────────

async function redoviPotvrda(
  ctx: QueryCtx,
  userId: Id<"users">,
  workspaceId: Id<"workspaces">,
  opseg: string,
  najvise: number,
): Promise<Doc<"napredakPotvrde">[]> {
  return await ctx.db
    .query("napredakPotvrde")
    .withIndex("by_user_workspace_opseg", (q) =>
      q.eq("userId", userId).eq("workspaceId", workspaceId).eq("opseg", opseg),
    )
    .take(najvise);
}

async function ucitajPotvrde(
  ctx: QueryCtx,
  userId: Id<"users">,
  workspaceId: Id<"workspaces">,
  sidro: string,
): Promise<Potvrde> {
  const [dnevne, trajne] = await Promise.all([
    redoviPotvrda(ctx, userId, workspaceId, sidro, CAP_POTVRDA_DANA),
    redoviPotvrda(ctx, userId, workspaceId, OPSEG_TRAJNO, CAP_POTVRDA_TRAJNIH),
  ]);
  let nivo = 1;
  const trajniKljucevi: string[] = [];
  for (const red of trajne) {
    if (red.kljuc === undefined) continue;
    if (red.kljuc === "nivo") nivo = Math.max(nivo, red.vrednost ?? 1);
    else trajniKljucevi.push(red.kljuc);
  }
  return {
    dnevne: dnevne.flatMap((r) => (r.kljuc === undefined ? [] : [r.kljuc])),
    trajne: trajniKljucevi,
    nivo,
  };
}

/** Kada je napravljeno korisnikovo pravilo koje je SADA uključeno; `null` ako nema. */
async function aktivnoPravilo(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  userId: Id<"users">,
): Promise<number | null> {
  const ukljucena = await ctx.db
    .query("rules")
    .withIndex("by_workspace_and_enabled", (q) =>
      q.eq("workspaceId", workspaceId).eq("enabled", true),
    )
    .take(CAP_PRAVILA);
  let najranije: number | null = null;
  for (const pravilo of ukljucena) {
    if (pravilo.createdBy !== userId) continue;
    if (najranije === null || pravilo._creationTime < najranije) {
      najranije = pravilo._creationTime;
    }
  }
  return najranije;
}

// ── ulaz za izvođenje ────────────────────────────────────────────────────────

function osnovaReda(red: Doc<"napredakDan"> | null): Osnova {
  return red?.osnova ?? praznaOsnova();
}

/** Sve što `izvedi` / `izvediProfil` traže, pročitano iz baze. */
async function pripremiUlaz(
  ctx: QueryCtx,
  userId: Id<"users">,
  workspaceId: Id<"workspaces">,
  podesavanja: Podesavanja,
): Promise<UlazIzvedi> {
  const sidroRed = await ucitajSidro(ctx, userId, workspaceId);
  if (sidroRed === null) {
    return {
      korisnik: String(userId),
      sidro: null,
      prviDan: false,
      odseceno: false,
      osnova: praznaOsnova(),
      dogadjaji: [],
      misijePoDanu: {},
      naOtvaranjuPoDanu: {},
      aktivnoPraviloAt: null,
      podesavanja,
      potvrde: { dnevne: [], trajne: [], nivo: 1 },
    };
  }

  const sidro = sidroRed.dan;
  const osnova = osnovaReda(sidroRed);
  const juce = dodajDane(sidro, -1);

  const [ucitano, redovi, potvrde, aktivnoPraviloAt] = await Promise.all([
    ucitajDogadjaje(ctx, workspaceId, userId, opseziDana(juce, sidro, true)),
    ucitajRedove(ctx, userId, workspaceId, juce, null, CAP_REDOVA_DANA),
    ucitajPotvrde(ctx, userId, workspaceId, sidro),
    // Jednom otključano ostaje otključano — pravila se tada više ne čitaju.
    osnova.otkljucano["cuvar_budzeta"] === undefined
      ? aktivnoPravilo(ctx, workspaceId, userId)
      : Promise.resolve(null),
  ]);

  const misijePoDanu: Record<string, MisijaDef[]> = {};
  const naOtvaranjuPoDanu: Record<string, NaOtvaranju> = {};
  for (const red of redovi) {
    if (red.misije !== undefined) misijePoDanu[red.dan] = red.misije;
    if (red.naOtvaranju !== undefined) naOtvaranjuPoDanu[red.dan] = red.naOtvaranju;
  }

  return {
    korisnik: String(userId),
    sidro,
    prviDan: sidroRed.prvi === true,
    odseceno: ucitano.odseceno,
    osnova,
    dogadjaji: ucitano.dogadjaji,
    misijePoDanu,
    naOtvaranjuPoDanu,
    aktivnoPraviloAt,
    podesavanja,
    potvrde,
  };
}

// ── izlazni oblici ───────────────────────────────────────────────────────────

const retkostValidator = v.union(
  v.literal("common"),
  v.literal("rare"),
  v.literal("epic"),
  v.literal("legendary"),
);

const stanjeIskljucenoValidator = v.object({
  ukljucen: v.literal(false),
  podesavanja: podesavanjaValidator,
});

const stanjeUkljucenoValidator = v.object({
  ukljucen: v.literal(true),
  spremno: v.boolean(),
  odseceno: v.boolean(),
  dan: v.union(v.string(), v.null()),
  prviDan: v.boolean(),
  xp: v.object({ ukupno: v.number(), danas: v.number() }),
  brojeviDanas: v.object({
    pozivi: v.number(),
    ishodi: v.number(),
    ciljPoziva: v.number(),
  }),
  nivo: v.object({
    broj: v.number(),
    zvanje: v.string(),
    rang: v.union(
      v.literal("bronze"),
      v.literal("silver"),
      v.literal("gold"),
      v.literal("platinum"),
      v.literal("diamond"),
    ),
    xpOd: v.number(),
    xpDo: v.number(),
    uNivou: v.number(),
    zaSledeci: v.number(),
    procenat: v.number(),
  }),
  niz: v.object({
    dani: v.number(),
    najduzi: v.number(),
    danasUracunat: v.boolean(),
    opasnostOd: v.union(v.number(), v.null()),
    vikendNePrekida: v.boolean(),
  }),
  misije: v.array(
    v.object({
      kljuc: v.string(),
      naslov: v.string(),
      oblast: v.string(),
      cilj: v.number(),
      napredak: v.number(),
      preostalo: v.number(),
      xp: v.number(),
      zavrsena: v.boolean(),
      veza: v.string(),
    }),
  ),
  bonus: v.object({
    xp: v.number(),
    moguc: v.boolean(),
    osvojen: v.boolean(),
    preostaloMisija: v.number(),
  }),
  prstenovi: v.array(
    v.object({
      kljuc: v.union(
        v.literal("pozivi"),
        v.literal("sastanci"),
        v.literal("objave"),
      ),
      naziv: v.string(),
      vrednost: v.number(),
      cilj: v.number(),
      procenat: v.number(),
      pun: v.boolean(),
    }),
  ),
  poslednji: v.array(
    v.object({
      id: v.string(),
      vrsta: v.string(),
      naslov: v.string(),
      xp: v.number(),
      at: v.number(),
    }),
  ),
  proslave: v.array(
    v.object({
      kljuc: v.string(),
      vrsta: v.union(
        v.literal("misija"),
        v.literal("bonus"),
        v.literal("nivo"),
        v.literal("dostignuce"),
      ),
      naslov: v.string(),
      xp: v.union(v.number(), v.null()),
      retkost: v.union(retkostValidator, v.null()),
      at: v.number(),
    }),
  ),
  sledece: v.union(
    v.object({
      kljuc: v.string(),
      naziv: v.string(),
      vrednost: v.number(),
      cilj: v.number(),
    }),
    v.null(),
  ),
  podesavanja: podesavanjaValidator,
});

const profilValidator = v.union(
  v.object({ ukljucen: v.literal(false) }),
  v.object({
    ukljucen: v.literal(true),
    spremno: v.boolean(),
    dostignuca: v.array(
      v.object({
        kljuc: v.string(),
        naziv: v.string(),
        uslov: v.string(),
        retkost: retkostValidator,
        otkljucanoAt: v.union(v.number(), v.null()),
        napredak: v.union(
          v.object({ vrednost: v.number(), cilj: v.number() }),
          v.null(),
        ),
      }),
    ),
    otkljucano: v.number(),
    ukupno: v.number(),
    rekordi: v.array(
      v.object({
        kljuc: v.string(),
        naziv: v.string(),
        vrednost: v.number(),
        dan: v.union(v.string(), v.null()),
      }),
    ),
    mapa: v.object({
      od: v.union(v.string(), v.null()),
      do: v.union(v.string(), v.null()),
      maks: v.number(),
      dani: v.array(v.object({ dan: v.string(), xp: v.number() })),
    }),
    zbir: v.object({
      dodiri: v.number(),
      pozivi: v.number(),
      sastanci: v.number(),
      objave: v.number(),
      moderacije: v.number(),
      dopune: v.number(),
      danaSaXp: v.number(),
    }),
  }),
);

// ── upiti ────────────────────────────────────────────────────────────────────

/**
 * XP, nivo, niz, misije dana, nedeljni prstenovi i poslednji događaji.
 *
 * Kad je Napredak isključen vraća se oblik BEZ ijednog XP polja — ljuska ne
 * može ni slučajno da nacrta broj koji korisnik nije tražio.
 */
export const stanje = projekatQuery({
  args: {},
  returns: v.union(stanjeIskljucenoValidator, stanjeUkljucenoValidator),
  handler: async (ctx, args) => {
    const { userId } = ctx.projekat;

    const podesavanja = await ucitajPodesavanja(
      ctx,
      userId,
      args.workspaceId,
    );
    if (!podesavanja.ukljucen) return stanjeIskljuceno(podesavanja);

    return izvedi(
      await pripremiUlaz(ctx, userId, args.workspaceId, podesavanja),
    );
  },
});

/** Dostignuća, lični rekordi i mapa aktivnosti za 12 nedelja. */
export const profil = projekatQuery({
  args: {},
  returns: profilValidator,
  handler: async (ctx, args) => {
    const { userId } = ctx.projekat;

    const podesavanja = await ucitajPodesavanja(
      ctx,
      userId,
      args.workspaceId,
    );
    if (!podesavanja.ukljucen) return { ukljucen: false as const };

    const ulaz = await pripremiUlaz(
      ctx,
      userId,
      args.workspaceId,
      podesavanja,
    );
    const zakljuceniDani: Array<{ dan: string; xp: number }> = [];
    if (ulaz.sidro !== null) {
      const redovi = await ucitajRedove(
        ctx,
        userId,
        args.workspaceId,
        dodajDane(ulaz.sidro, -(MAPA_DANA - 1)),
        ulaz.sidro,
        MAPA_DANA + 1,
      );
      for (const red of redovi) {
        if (red.xp !== undefined) zakljuceniDani.push({ dan: red.dan, xp: red.xp });
      }
    }
    return izvediProfil({ ...ulaz, zakljuceniDani });
  },
});

// ── mutacije: podešavanja i potvrde ──────────────────────────────────────────

function proveriCilj(
  naziv: keyof typeof GRANICE_CILJA,
  vrednost: number | undefined,
): number | undefined {
  if (vrednost === undefined) return undefined;
  const { min, max } = GRANICE_CILJA[naziv];
  if (!Number.isInteger(vrednost) || vrednost < min || vrednost > max) {
    throw new ConvexError({
      code: "bad_request",
      message: `Cilj mora biti ceo broj između ${min} i ${max}.`,
    });
  }
  return vrednost;
}

/** Podešavanja → Napredak. Menja samo ono što je poslato. */
export const podesi = projekatMutation({
  // Lični red pozivaoca: i posmatrač podešava svoj Napredak.
  uloga: "client_viewer",
  args: {
    ukljucen: v.optional(v.boolean()),
    vikendNePrekida: v.optional(v.boolean()),
    ciljPozivi: v.optional(v.number()),
    ciljSastanci: v.optional(v.number()),
    ciljObjave: v.optional(v.number()),
  },
  returns: podesavanjaValidator,
  handler: async (ctx, args) => {
    const { userId } = ctx.projekat;

    const izmena = {
      ...(args.ukljucen !== undefined ? { ukljucen: args.ukljucen } : {}),
      ...(args.vikendNePrekida !== undefined
        ? { vikendNePrekida: args.vikendNePrekida }
        : {}),
      ...(args.ciljPozivi !== undefined
        ? { ciljPozivi: proveriCilj("ciljPozivi", args.ciljPozivi) }
        : {}),
      ...(args.ciljSastanci !== undefined
        ? { ciljSastanci: proveriCilj("ciljSastanci", args.ciljSastanci) }
        : {}),
      ...(args.ciljObjave !== undefined
        ? { ciljObjave: proveriCilj("ciljObjave", args.ciljObjave) }
        : {}),
      updatedAt: Date.now(),
    };

    const postojeci = await redPodesavanja(
      ctx,
      userId,
      args.workspaceId,
    );
    if (postojeci) {
      await ctx.db.patch(postojeci._id, izmena);
    } else {
      await ctx.db.insert("napredakPodesavanja", {
        workspaceId: args.workspaceId,
        userId,
        ...izmena,
      });
    }
    return await ucitajPodesavanja(ctx, userId, args.workspaceId);
  },
});

/**
 * Upisuje da su proslave viđene. Ključ koji sistem ne ume da napravi se
 * odbija — red za njega niko nikad ne bi pročitao.
 */
async function upisiPotvrde(
  ctx: MutationCtx,
  userId: Id<"users">,
  workspaceId: Id<"workspaces">,
  kljucevi: readonly string[],
): Promise<number> {
  const now = Date.now();
  const poOpsegu = new Map<string, Doc<"napredakPotvrde">[]>();
  let upisano = 0;

  for (const sirov of new Set(kljucevi)) {
    const p = parsirajProslavu(sirov);
    if (p === null) {
      throw new ConvexError({
        code: "bad_request",
        message: "Nepoznata proslava.",
      });
    }
    let redovi = poOpsegu.get(p.opseg);
    if (redovi === undefined) {
      redovi = await redoviPotvrda(
        ctx,
        userId,
        workspaceId,
        p.opseg,
        CAP_POTVRDA_TRAJNIH,
      );
      poOpsegu.set(p.opseg, redovi);
    }
    const postojeci = redovi.find((r) => r.kljuc === p.kljuc);

    if (p.vrednost !== undefined) {
      // Nivo se pamti kao jedan red sa najvišom viđenom vrednošću.
      if (postojeci) {
        if ((postojeci.vrednost ?? 0) >= p.vrednost) continue;
        await ctx.db.patch(postojeci._id, {
          vrednost: p.vrednost,
          potvrdjenoAt: now,
        });
        postojeci.vrednost = p.vrednost;
      } else {
        const id = await ctx.db.insert("napredakPotvrde", {
          workspaceId,
          userId,
          opseg: p.opseg,
          kljuc: p.kljuc,
          vrednost: p.vrednost,
          potvrdjenoAt: now,
        });
        const novi = await ctx.db.get(id);
        if (novi) redovi.push(novi);
      }
      upisano++;
      continue;
    }

    if (postojeci) continue;
    const id = await ctx.db.insert("napredakPotvrde", {
      workspaceId,
      userId,
      opseg: p.opseg,
      kljuc: p.kljuc,
      potvrdjenoAt: now,
    });
    const novi = await ctx.db.get(id);
    if (novi) redovi.push(novi);
    upisano++;
  }
  return upisano;
}

/** „Video sam" — proslava se posle osvežavanja ne ponavlja. */
export const potvrdi = projekatMutation({
  uloga: "client_viewer",
  args: {
    kljucevi: v.array(v.string()),
  },
  returns: v.object({ potvrdjeno: v.number() }),
  handler: async (ctx, args) => {
    const { userId } = ctx.projekat;

    if (args.kljucevi.length > MAKS_POTVRDA) {
      throw new ConvexError({
        code: "bad_request",
        message: `Najviše ${MAKS_POTVRDA} potvrda odjednom.`,
      });
    }
    const potvrdjeno = await upisiPotvrde(
      ctx,
      userId,
      args.workspaceId,
      args.kljucevi,
    );
    return { potvrdjeno };
  },
});

// ── zaključavanje dana ───────────────────────────────────────────────────────

/**
 * Zaključava dane od `osnova.do + 1` do `doDana`: svaki dan se obračuna iz
 * događaja, doda na zbir i upiše u svoj red (XP, brojači, „uračunat").
 *
 * Posle ovoga se događaji tih dana više ne čitaju — čita se zbir.
 */
async function zakljuciDo(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  userId: Id<"users">,
  pocetna: Osnova,
  doDana: string,
  podesavanja: Podesavanja,
): Promise<Osnova> {
  if (pocetna.do === null || pocetna.do >= doDana) return pocetna;
  const prvi = dodajDane(pocetna.do, 1);
  const now = Date.now();

  const [ucitano, redovi, aktivnoPraviloAt] = await Promise.all([
    ucitajDogadjaje(ctx, workspaceId, userId, opseziDana(prvi, doDana, false)),
    ucitajRedove(ctx, userId, workspaceId, prvi, doDana, MAKS_DANA_KORAK + 2),
    pocetna.otkljucano["cuvar_budzeta"] === undefined
      ? aktivnoPravilo(ctx, workspaceId, userId)
      : Promise.resolve(null),
  ]);
  const redPoDanu = new Map<string, RedDana>();
  for (const red of redovi) redPoDanu.set(red.dan, red);

  let osnova = pocetna;
  for (let dan = prvi; dan <= doDana; dan = dodajDane(dan, 1)) {
    const red = redPoDanu.get(dan);
    const rez = primeniDan(osnova, {
      dan,
      obracun: obracunajDan(ucitano.dogadjaji, String(userId), dan),
      misije: red?.misije ?? [],
      naOtvaranju: red?.naOtvaranju ?? null,
      podesavanja,
      finalan: true,
      aktivnoPraviloAt,
    });
    osnova = rez.osnova;

    const zakljucak = {
      zakljucenAt: now,
      xp: rez.dan.xp,
      uracunat: rez.dan.uracunat,
      brojevi: rez.dan.brojevi,
    };
    if (red) {
      await ctx.db.patch(red._id, zakljucak);
    } else if (rez.dan.xp > 0) {
      // Dan koji niko nije otvorio, a nešto se desilo (zakazana objava):
      // red postoji samo zbog mape aktivnosti.
      await ctx.db.insert("napredakDan", {
        workspaceId,
        userId,
        dan,
        ...zakljucak,
      });
    }
  }
  return osnova;
}

/** Vreme najstarijeg događaja koji bi korisniku mogao da donese XP. */
async function najstarijiDogadjaj(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  userId: Id<"users">,
): Promise<number | null> {
  const [lead, dopuna, red, igObjava, thObjava, igMod, fbMod, oglas, uvozi] =
    await Promise.all([
      ctx.db
        .query("leadStageEvents")
        .withIndex("by_workspace_actor_time", (q) =>
          q.eq("workspaceId", workspaceId).eq("actorUserId", userId),
        )
        .first(),
      ctx.db
        .query("leadIdentities")
        .withIndex("by_workspace_creator_time", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("createdBy", userId)
            .gte("createdAt", 0),
        )
        .first(),
      ctx.db
        .query("leadImportRows")
        .withIndex("by_workspace_resolver_time", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("resolvedBy", userId)
            .gte("resolvedAt", 0),
        )
        .first(),
      ctx.db
        .query("igPublishJobs")
        .withIndex("by_workspace_published", (q) =>
          q.eq("workspaceId", workspaceId).gte("publishedAt", 0),
        )
        .first(),
      ctx.db
        .query("threadsPublishJobs")
        .withIndex("by_workspace_published", (q) =>
          q.eq("workspaceId", workspaceId).gte("publishedAt", 0),
        )
        .first(),
      ctx.db
        .query("igModerationLogs")
        .withIndex("by_workspace_created", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .first(),
      ctx.db
        .query("fbModerationLogs")
        .withIndex("by_workspace_created", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .first(),
      ctx.db
        .query("adActions")
        .withIndex("by_workspace_executed", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .first(),
      ctx.db
        .query("leadImports")
        .withIndex("by_workspace_status", (q) =>
          q.eq("workspaceId", workspaceId).eq("status", "primenjen"),
        )
        .take(CAP_UVOZA),
    ]);

  const vremena: number[] = [];
  const dodaj = (t: number | undefined): void => {
    if (t !== undefined && Number.isFinite(t)) vremena.push(t);
  };
  dodaj(lead?.occurredAt);
  dodaj(dopuna?.createdAt);
  dodaj(red?.resolvedAt);
  dodaj(igObjava?.publishedAt);
  dodaj(thObjava?.publishedAt);
  dodaj(igMod?.createdAt);
  dodaj(fbMod?.createdAt);
  dodaj(oglas?.executedAt);
  for (const uvoz of uvozi) dodaj(uvoz.appliedAt);
  return vremena.length > 0 ? Math.min(...vremena) : null;
}

/**
 * Prvi dan: sve što je korisnik zaradio PRE nego što je Napredak postojao
 * upisuje se kao viđeno. Istorija se računa (pošten početak sa stvarnim
 * XP-om), ali prvo otvaranje ne zatrpava ekran proslavama za stare stvari.
 */
async function potvrdiZateceno(
  ctx: MutationCtx,
  userId: Id<"users">,
  workspaceId: Id<"workspaces">,
  podesavanja: Podesavanja,
): Promise<void> {
  const zateceno = izvedi(
    await pripremiUlaz(ctx, userId, workspaceId, podesavanja),
  );
  if (!zateceno.ukljucen || zateceno.proslave.length === 0) return;
  await upisiPotvrde(
    ctx,
    userId,
    workspaceId,
    zateceno.proslave.map((p) => p.kljuc),
  );
}

// ── zamrzavanje dana ─────────────────────────────────────────────────────────

function posao(zadatak: Zadatak | undefined): Posao {
  return zadatak
    ? { broj: zadatak.broj, hitnost: zadatak.hitnost, veza: zadatak.veza }
    : { broj: 0 };
}

/** Kanali sa kojih se može objaviti — bez njih misija „Objavi" nije moguća. */
const KANALI_ZA_OBJAVU = new Set(["meta_ig", "threads"]);

/** Koliko dana je prošlo od poslednje objave; `null` = nikad. */
async function danaOdObjave(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  now: number,
): Promise<number | null> {
  const [ig, th, clanak] = await Promise.all([
    ctx.db
      .query("igPublishJobs")
      .withIndex("by_workspace_published", (q) =>
        q.eq("workspaceId", workspaceId).gte("publishedAt", 0),
      )
      .order("desc")
      .first(),
    // Odgovor nije objava — gleda se nekoliko poslednjih da se nađe prava.
    ctx.db
      .query("threadsPublishJobs")
      .withIndex("by_workspace_published", (q) =>
        q.eq("workspaceId", workspaceId).gte("publishedAt", 0),
      )
      .order("desc")
      .take(10),
    ctx.db
      .query("posts")
      .withIndex("by_workspace_status_published", (q) =>
        q.eq("workspaceId", workspaceId).eq("status", "published"),
      )
      .order("desc")
      .first(),
  ]);
  const vremena: number[] = [];
  if (ig?.publishedAt !== undefined) vremena.push(ig.publishedAt);
  const thObjava = th.find((p) => p.replyToId === undefined);
  if (thObjava?.publishedAt !== undefined) vremena.push(thObjava.publishedAt);
  if (clanak?.publishedAt !== undefined) vremena.push(clanak.publishedAt);
  if (vremena.length === 0) return null;
  return Math.max(0, Math.floor((now - Math.max(...vremena)) / DAN));
}

/**
 * Zamrzava današnji dan: bira misije iz živog stanja i upisuje red sidra.
 *
 * ZAŠTO ZASEBNA MUTACIJA, a ne „prva mutacija dana":
 *   - upit ne može da piše, pa neko mora da pozove mutaciju;
 *   - cron u ponoć bi misije birao iz stanja u 00:00, pre jutarnje
 *     sinhronizacije, i pravio redove za dane kad niko nije otvorio aplikaciju;
 *   - kačenje na domenske mutacije (dodir, ishod, objava…) bi isti kod razvuklo
 *     kroz desetak fajlova, a dan u kom je čovek samo gledao ostao bi bez misija.
 *
 * Zato je klijent zove kad `stanje.dan` nije današnji beogradski datum. Poziv
 * je idempotentan: drugi tab dobija `novo: false`. Dan se računa iz SERVERSKOG
 * sata, nikad iz argumenta.
 */
export const zamrzniDan = projekatMutation({
  uloga: "client_viewer",
  args: {},
  returns: v.object({
    dan: v.string(),
    novo: v.boolean(),
    misija: v.number(),
  }),
  handler: async (ctx, args) => {
    const { userId } = ctx.projekat;

    const workspaceId = args.workspaceId;
    const now = Date.now();
    const dan = danKljuc(now);

    const podesavanja = await ucitajPodesavanja(ctx, userId, workspaceId);
    // Isključen Napredak ne pravi redove. Kad se ponovo uključi, zaostali dani
    // se zaključe iz događaja — XP se ne gubi, samo se ne prikazuje.
    if (!podesavanja.ukljucen) return { dan, novo: false, misija: 0 };

    const prethodni = await ucitajSidro(ctx, userId, workspaceId);
    if (prethodni !== null && prethodni.dan >= dan) {
      return { dan, novo: false, misija: prethodni.misije?.length ?? 0 };
    }

    // ── zbir do prekjuče ─────────────────────────────────────────────────────
    const cilj = dodajDane(dan, -2);
    let osnova: Osnova;
    if (prethodni?.osnova !== undefined && prethodni.osnova.do !== null) {
      osnova = prethodni.osnova;
    } else {
      // Prvi put: istorija sa autorom se računa od svog prvog događaja.
      const najstariji = await najstarijiDogadjaj(ctx, workspaceId, userId);
      const pocetak = najstariji === null ? null : danKljuc(najstariji);
      osnova = {
        ...praznaOsnova(),
        do: pocetak !== null && pocetak <= cilj ? dodajDane(pocetak, -1) : cilj,
      };
    }
    const zaostatak = osnova.do === null ? 0 : razlikaDana(cilj, osnova.do);
    if (zaostatak > 0 && zaostatak <= ODMAH_DANA) {
      osnova = await zakljuciDo(ctx, workspaceId, userId, osnova, cilj, podesavanja);
    }
    const kasni = zaostatak > ODMAH_DANA;

    // ── živo stanje: isti čitači kao zvono ───────────────────────────────────
    const pomeraj = pomerajMin(now);
    const [uvozi, leadovi, kanali, veze, primenjen, odObjave, ovaNedelja] =
      await Promise.all([
        citajUvoze(ctx, workspaceId),
        citajLeadove(ctx, workspaceId, now, pomeraj),
        citajKanale(ctx, workspaceId),
        ctx.db
          .query("connections")
          .withIndex("by_workspace_provider", (q) =>
            q.eq("workspaceId", workspaceId),
          )
          .take(20),
        ctx.db
          .query("leadImports")
          .withIndex("by_workspace_status", (q) =>
            q.eq("workspaceId", workspaceId).eq("status", "primenjen"),
          )
          .first(),
        danaOdObjave(ctx, workspaceId, now),
        // Korisnikovi lead događaji od ponedeljka: sastanci nedelje i „da li
        // je ikad zvao" za prvi cilj.
        ctx.db
          .query("leadStageEvents")
          .withIndex("by_workspace_actor_time", (q) =>
            q
              .eq("workspaceId", workspaceId)
              .eq("actorUserId", userId)
              .gte("occurredAt", pocetakDana(ponedeljak(dan))),
          )
          .take(CAP_LEAD),
      ]);

    const zadaci = napraviZadatke({
      now,
      pomerajMin: pomeraj,
      uvoziUPregledu: uvozi.uPregledu,
      uvoziSaNerazresenim: uvozi.saNerazresenim,
      uvoziOdseceni: uvozi.odseceni,
      // Kvar integracije nije posao koji misija može da zada.
      integracijeUKvaru: [],
      ...leadovi,
      kanali,
    });
    const zadatak = (kljuc: string): Zadatak | undefined =>
      zadaci.find((z) => z.kljuc === kljuc);

    // Komentari na oba kanala su jedna misija; veza vodi tamo gde ih je više.
    const komentari = zadaci.filter(
      (z) =>
        z.kljuc === "kanali.bez_odgovora:ig_komentari" ||
        z.kljuc === "kanali.bez_odgovora:fb_komentari",
    );
    const najviseKomentara = komentari.reduce<Zadatak | undefined>(
      (a, b) => (a === undefined || b.broj > a.broj ? b : a),
      undefined,
    );

    const nedeljaDogadjaji: Dogadjaj[] = [];
    for (const ev of ovaNedelja) {
      const d = await izLeadDogadjaja(ctx, workspaceId, ev);
      if (d !== null) nedeljaDogadjaji.push(d);
    }
    let sastanciNedelje = 0;
    let pozivaNedelje = 0;
    for (let d = ponedeljak(dan); d <= dan; d = dodajDane(d, 1)) {
      const brojevi = obracunajDan(nedeljaDogadjaji, String(userId), d).brojevi;
      sastanciNedelje += brojevi.sastanci;
      pozivaNedelje += brojevi.pozivi;
    }

    const nereseniRedovi = uvozi.saNerazresenim.reduce(
      (zbir, u) => zbir + u.broj,
      0,
    );

    const misije = generisiMisije(
      {
        zoviSada: leadovi.zoviSada,
        // Dok zaključavanje istorije kasni, zbir još ne zna — tada se ne
        // pretpostavlja „nikad nije zvao".
        bezPozivaDoSad:
          !kasni && osnova.brojaci.pozivi === 0 && pozivaNedelje === 0,
        ukupnoDodela: leadovi.ukupnoDodela,
        zaostali: posao(zadatak("leadovi.zaostali")),
        nereseniRedovi: posao(zadatak("uvoz.nerazreseni")),
        uvoziUPregledu: posao(zadatak("uvoz.u_pregledu")),
        bezTelefona: posao(zadatak("leadovi.bez_telefona")),
        komentari: {
          broj: komentari.reduce((zbir, z) => zbir + z.broj, 0),
          ...(najviseKomentara
            ? { hitnost: najviseKomentara.hitnost, veza: najviseKomentara.veza }
            : {}),
        },
        mozeObjava: veze.some(
          (veza) =>
            KANALI_ZA_OBJAVU.has(veza.provider) &&
            veza.status !== "disconnecting",
        ),
        danaOdObjave: odObjave,
        sastanciNedelje,
        ciljSastanci: podesavanja.ciljSastanci,
      },
      dan,
    );

    await ctx.db.insert("napredakDan", {
      workspaceId,
      userId,
      dan,
      misije,
      zamrznutoAt: now,
      prvi: prethodni === null,
      naOtvaranju: {
        zaostali: leadovi.zaostaliKoraci,
        nereseniRedovi,
        imaPrimenjenUvoz: primenjen !== null,
        odseceno: leadovi.zaostaliOdsecen || uvozi.odseceni,
        at: now,
      },
      osnova,
    });

    // Potvrde misija i bonusa starijih dana više ničemu ne služe.
    const stare = await ctx.db
      .query("napredakPotvrde")
      .withIndex("by_user_workspace_opseg", (q) =>
        q
          .eq("userId", userId)
          .eq("workspaceId", workspaceId)
          .lt("opseg", dodajDane(dan, -1)),
      )
      .take(50);
    for (const red of stare) await ctx.db.delete(red._id);

    if (kasni) {
      await ctx.scheduler.runAfter(0, internal.napredak.nastaviZakljucavanje, {
        workspaceId,
        userId,
      });
    } else if (prethodni === null) {
      await potvrdiZateceno(ctx, userId, workspaceId, podesavanja);
    }

    return { dan, novo: true, misija: misije.length };
  },
});

/**
 * Nastavlja zaključavanje kad je zaostatak veći od `ODMAH_DANA` (prvo
 * uključivanje sa istorijom, povratak posle odmora). Jedan korak zaključa
 * najviše `MAKS_DANA_KORAK` dana i zakaže sledeći, da nijedna transakcija ne
 * čita istoriju odjednom.
 */
export const nastaviZakljucavanje = internalMutation({
  args: { workspaceId: v.id("workspaces"), userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sidroRed = await ucitajSidro(ctx, args.userId, args.workspaceId);
    if (sidroRed === null || sidroRed.osnova === undefined) return null;

    const cilj = dodajDane(sidroRed.dan, -2);
    const osnova: Osnova = sidroRed.osnova;
    if (osnova.do === null || osnova.do >= cilj) return null;

    const podesavanja = await ucitajPodesavanja(
      ctx,
      args.userId,
      args.workspaceId,
    );
    const granica = dodajDane(osnova.do, MAKS_DANA_KORAK);
    const korakDo = granica < cilj ? granica : cilj;
    const nova = await zakljuciDo(
      ctx,
      args.workspaceId,
      args.userId,
      osnova,
      korakDo,
      podesavanja,
    );
    await ctx.db.patch(sidroRed._id, { osnova: nova });

    if (nova.do !== null && nova.do < cilj) {
      await ctx.scheduler.runAfter(0, internal.napredak.nastaviZakljucavanje, {
        workspaceId: args.workspaceId,
        userId: args.userId,
      });
    } else if (sidroRed.prvi === true) {
      await potvrdiZateceno(ctx, args.userId, args.workspaceId, podesavanja);
    }
    return null;
  },
});
