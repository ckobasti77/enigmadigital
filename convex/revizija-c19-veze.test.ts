/// <reference types="vite/client" />
/**
 * Revizija C19, veze: isti spoljni nalog može biti povezan u dva projekta dok se
 * veza jednog od njih briše (`disconnecting`). Webhook pripada projektu čija
 * veza živi; deautorizacija i zahtev za brisanje obrađuju SVE redove tog naloga;
 * kraj sinhronizacije ne sme da vrati vezu iz prekida.
 *
 * Vreme je zaleđeno (`useFakeTimers`): zakazani koraci (procena pravila,
 * brisanje podataka) ne smeju da se izvrše usred testa. Veze su upisane
 * direktno u bazu, jer `saveConnectedCredentials` namerno ne dozvoljava dva
 * projekta sa istim nalogom.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { napraviSvet, type Svet } from "./projekatTest.pomoc";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type Provajder = Doc<"connections">["provider"];
type Status = Doc<"connections">["status"];

async function dodajVezu(
  s: Svet,
  o: {
    workspaceId: Id<"workspaces">;
    provider: Provajder;
    status: Status;
    externalId: string;
    externalIdAlt?: string;
  },
): Promise<Id<"connections">> {
  return await s.t.run(async (ctx) =>
    ctx.db.insert("connections", {
      workspaceId: o.workspaceId,
      provider: o.provider,
      encryptedCredentials: "sifrovano",
      status: o.status,
      externalId: o.externalId,
      ...(o.externalIdAlt !== undefined ? { externalIdAlt: o.externalIdAlt } : {}),
    }),
  );
}

const veza = (s: Svet, id: Id<"connections">) => s.t.run(async (ctx) => await ctx.db.get(id));

const odgovori = (s: Svet) => s.t.run(async (ctx) => await ctx.db.query("threadsReplies").collect());

// ── 5. webhook razrešava vezu koja nije u prekidu ────────────────────────────

describe("webhook preskače vezu u prekidu", () => {
  test("Instagram: A u prekidu (stariji red) i B aktivan: nalog pripada B, po ID-u i po profesionalnom ID-u", async () => {
    const s = await napraviSvet();
    await dodajVezu(s, {
      workspaceId: s.wsA,
      provider: "meta_ig",
      status: "disconnecting",
      externalId: "ig-1",
      externalIdAlt: "igpro-1",
    });
    const b = await dodajVezu(s, {
      workspaceId: s.wsB,
      provider: "meta_ig",
      status: "active",
      externalId: "ig-1",
      externalIdAlt: "igpro-1",
    });

    for (const accountId of ["ig-1", "igpro-1"]) {
      expect(
        await s.t.query(internal.instagramStore.resolveConnectionByAccount, { accountId }),
        accountId,
      ).toEqual({ connectionId: b, workspaceId: s.wsB });
    }
  });

  test("Instagram: kad je jedina veza naloga u prekidu, događaj nema projekat; aktivna veza se i dalje nalazi", async () => {
    const s = await napraviSvet();
    await dodajVezu(s, {
      workspaceId: s.wsA,
      provider: "meta_ig",
      status: "disconnecting",
      externalId: "ig-1",
    });
    expect(
      await s.t.query(internal.instagramStore.resolveConnectionByAccount, { accountId: "ig-1" }),
    ).toBeNull();

    // Kontrola: aktivna veza se nalazi, pa prazan odgovor gore nije slučajan.
    const aktivna = await dodajVezu(s, {
      workspaceId: s.wsK,
      provider: "meta_ig",
      status: "active",
      externalId: "ig-2",
    });
    expect(
      await s.t.query(internal.instagramStore.resolveConnectionByAccount, { accountId: "ig-2" }),
    ).toEqual({ connectionId: aktivna, workspaceId: s.wsK });
  });

  test("Facebook stranica: A u prekidu, B aktivan: stranica pripada B; sama u prekidu nema projekat", async () => {
    const s = await napraviSvet();
    await dodajVezu(s, {
      workspaceId: s.wsA,
      provider: "meta_fb",
      status: "disconnecting",
      externalId: "stranica-1",
    });
    expect(
      await s.t.query(internal.facebookStore.resolveConnectionByPage, { pageId: "stranica-1" }),
    ).toBeNull();

    const b = await dodajVezu(s, {
      workspaceId: s.wsB,
      provider: "meta_fb",
      status: "active",
      externalId: "stranica-1",
    });
    expect(
      await s.t.query(internal.facebookStore.resolveConnectionByPage, { pageId: "stranica-1" }),
    ).toEqual({ connectionId: b, workspaceId: s.wsB });
  });

  test("Threads: odgovor sa webhook-a se upisuje u B, a ne u A čija je veza u prekidu", async () => {
    const s = await napraviSvet();
    await dodajVezu(s, {
      workspaceId: s.wsA,
      provider: "threads",
      status: "disconnecting",
      externalId: "th-1",
    });
    await dodajVezu(s, {
      workspaceId: s.wsB,
      provider: "threads",
      status: "active",
      externalId: "th-1",
    });

    await s.t.mutation(internal.threadsStore.recordWebhookReply, {
      id: "odgovor-1",
      accountId: "th-1",
      username: "pera",
      text: "Zdravo",
    });

    const redovi = await odgovori(s);
    expect(redovi.map((r) => [r.workspaceId, r.replyId, r.text, r.source])).toEqual([
      [s.wsB, "odgovor-1", "Zdravo", "webhook"],
    ]);
  });

  test("Threads: kad je jedina veza naloga u prekidu, odgovor se ne upisuje nigde", async () => {
    const s = await napraviSvet();
    await dodajVezu(s, {
      workspaceId: s.wsA,
      provider: "threads",
      status: "disconnecting",
      externalId: "th-1",
    });

    await s.t.mutation(internal.threadsStore.recordWebhookReply, {
      id: "odgovor-1",
      accountId: "th-1",
      text: "Zdravo",
    });

    expect(await odgovori(s)).toEqual([]);
  });
});

describe("ostali Instagram webhook putevi preskaču vezu u prekidu", () => {
  /** Isti Instagram nalog: A se briše (stariji red), B je aktivan. */
  async function nalogUDvaProjekta() {
    const s = await napraviSvet();
    for (const [workspaceId, status] of [
      [s.wsA, "disconnecting"],
      [s.wsB, "active"],
    ] as const) {
      await dodajVezu(s, {
        workspaceId,
        provider: "meta_ig",
        status,
        externalId: "ig-1",
        externalIdAlt: "igpro-1",
      });
    }
    return s;
  }

  test("spominjanje: upisuje se u B, a kad je jedina veza u prekidu ne upisuje se nigde", async () => {
    const s = await nalogUDvaProjekta();

    const upisano = await s.t.mutation(internal.igMentionsStore.recordWebhookMention, {
      accountId: "igpro-1",
      commentId: "komentar-1",
      mediaId: "medija-1",
      text: "@enigma pogledaj",
    });
    expect(upisano).toMatchObject({ workspaceId: s.wsB, igUserId: "ig-1", kind: "comment" });
    const spominjanja = await s.t.run(async (ctx) => await ctx.db.query("igMentions").collect());
    expect(spominjanja.map((m) => m.workspaceId)).toEqual([s.wsB]);

    // Samo A (u prekidu): nema kome da se upiše.
    const samoA = await napraviSvet();
    await dodajVezu(samoA, {
      workspaceId: samoA.wsA,
      provider: "meta_ig",
      status: "disconnecting",
      externalId: "ig-1",
    });
    expect(
      await samoA.t.mutation(internal.igMentionsStore.recordWebhookMention, {
        accountId: "ig-1",
        mediaId: "medija-1",
        text: "@enigma",
      }),
    ).toBeNull();
    expect(await samoA.t.run(async (ctx) => await ctx.db.query("igMentions").collect())).toEqual([]);
  });

  test("poruka u inboksu: nastaje u B", async () => {
    const s = await nalogUDvaProjekta();

    await s.t.mutation(internal.instagramInboxStore.recordInboundMessage, {
      platform: "instagram",
      accountId: "igpro-1",
      igsid: "korisnik-1",
      mid: "poruka-1",
      text: "Zdravo",
      sentAt: 1_700_000_000_000,
    });

    const poruke = await s.t.run(async (ctx) => await ctx.db.query("igMessages").collect());
    expect(poruke.map((p) => [p.workspaceId, p.mid])).toEqual([[s.wsB, "poruka-1"]]);
    const razgovori = await s.t.run(async (ctx) => await ctx.db.query("orConversations").collect());
    expect(razgovori.map((r) => r.workspaceId)).toEqual([s.wsB]);
  });

  test("komentar za OpenReply: nalog se razrešava na B, komentar se zapisuje tamo", async () => {
    const s = await nalogUDvaProjekta();

    const ishod = await s.t.mutation(internal.orIngest.ingestComment, {
      platform: "instagram",
      accountId: "igpro-1",
      commentId: "komentar-1",
      mediaId: "medija-1",
      commenterId: "korisnik-1",
      text: "koliko košta",
    });

    // B postoji, ali OpenReply motor nije uključen; da je nalog ostao na A, odgovor bi bio „nema projekta“.
    expect(ishod).toBe("ignored_engine_off");
    const komentari = await s.t.run(async (ctx) => await ctx.db.query("igComments").collect());
    expect(komentari.map((k) => [k.workspaceId, k.commentId])).toEqual([[s.wsB, "komentar-1"]]);
  });
});

// ── 6. webhook ne menja tuđi red odgovora ────────────────────────────────────

describe("threadsStore.recordWebhookReply: red odgovora je po projektu", () => {
  test("isti replyId u B ostaje kakav je, a A dobija svoj novi red", async () => {
    const s = await napraviSvet();
    await dodajVezu(s, {
      workspaceId: s.wsA,
      provider: "threads",
      status: "active",
      externalId: "th-A",
    });
    const redB = await s.t.run(async (ctx) => {
      const id = await ctx.db.insert("threadsReplies", {
        workspaceId: s.wsB,
        replyId: "odgovor-1",
        text: "B",
        username: "bob",
        source: "sync",
        timestamp: 1_700_000_000_000,
      });
      return (await ctx.db.get(id))!;
    });

    await s.t.mutation(internal.threadsStore.recordWebhookReply, {
      id: "odgovor-1",
      accountId: "th-A",
      username: "ana",
      text: "A",
    });

    const redovi = await odgovori(s);
    expect(redovi).toHaveLength(2);
    // Tuđi red je netaknut, do poslednjeg polja.
    expect(redovi.find((r) => r.workspaceId === s.wsB)).toEqual(redB);
    expect(redovi.find((r) => r.workspaceId === s.wsA)).toMatchObject({
      replyId: "odgovor-1",
      text: "A",
      username: "ana",
      source: "webhook",
    });
  });

  test("ponovljena isporuka ažurira samo red svog projekta", async () => {
    const s = await napraviSvet();
    await dodajVezu(s, {
      workspaceId: s.wsA,
      provider: "threads",
      status: "active",
      externalId: "th-A",
    });
    await s.t.run(async (ctx) => {
      await ctx.db.insert("threadsReplies", {
        workspaceId: s.wsB,
        replyId: "odgovor-1",
        text: "B",
        source: "sync",
      });
    });

    const posalji = (text: string) =>
      s.t.mutation(internal.threadsStore.recordWebhookReply, {
        id: "odgovor-1",
        accountId: "th-A",
        text,
      });
    await posalji("A");
    await posalji("A, izmenjeno");

    const redovi = await odgovori(s);
    expect(redovi).toHaveLength(2);
    expect(redovi.find((r) => r.workspaceId === s.wsA)?.text).toBe("A, izmenjeno");
    expect(redovi.find((r) => r.workspaceId === s.wsB)?.text).toBe("B");
  });
});

// ── 7. deautorizacija i brisanje po zahtevu Mete obrađuju sve redove ─────────

describe("Threads deautorizacija i zahtev za brisanje", () => {
  const purgeRun = (s: Svet, workspaceId: Id<"workspaces">, connectionId: Id<"connections">) =>
    s.t.run(async (ctx) =>
      ctx.db.insert("purgeRuns", {
        workspaceId,
        provider: "threads",
        connectionId,
        connectionGeneration: 0,
        startedAt: 1,
        updatedAt: 1,
        status: "running",
        stepIndex: 0,
        deletedTotal: 0,
        fenceToken: 1,
        resumes: 0,
        revokeStatus: "pending",
        revokeAttempts: 0,
      }),
    );

  const brisanja = (s: Svet) => s.t.run(async (ctx) => await ctx.db.query("purgeRuns").collect());

  test("deautorizacija ne dira vezu u prekidu, a aktivne veze tog naloga postaju expired", async () => {
    const s = await napraviSvet();
    const a = await dodajVezu(s, {
      workspaceId: s.wsA,
      provider: "threads",
      status: "disconnecting",
      externalId: "th-1",
    });
    const b = await dodajVezu(s, {
      workspaceId: s.wsB,
      provider: "threads",
      status: "active",
      externalId: "th-1",
    });
    const k = await dodajVezu(s, {
      workspaceId: s.wsK,
      provider: "threads",
      status: "active",
      externalId: "th-1",
    });
    const drugiNalog = await dodajVezu(s, {
      workspaceId: s.wsA,
      provider: "threads",
      status: "active",
      externalId: "th-2",
    });

    await s.t.mutation(internal.threadsStore.markExpiredByExternalId, { externalId: "th-1" });

    // „expired“ bi zaustavio brisanje koje je u toku, pa veza u prekidu ostaje u prekidu.
    expect((await veza(s, a))?.status).toBe("disconnecting");
    expect((await veza(s, b))?.status).toBe("expired");
    expect((await veza(s, k))?.status).toBe("expired");
    // Drugi nalog nije dirnut.
    expect((await veza(s, drugiNalog))?.status).toBe("active");
  });

  test("zahtev za brisanje: A se već briše (ima run), B je aktivan: pokreće se i brisanje B", async () => {
    const s = await napraviSvet();
    const a = await dodajVezu(s, {
      workspaceId: s.wsA,
      provider: "threads",
      status: "disconnecting",
      externalId: "th-1",
    });
    const b = await dodajVezu(s, {
      workspaceId: s.wsB,
      provider: "threads",
      status: "active",
      externalId: "th-1",
    });
    const runA = await purgeRun(s, s.wsA, a);

    const { confirmationCode } = await s.t.mutation(
      internal.threadsStore.triggerDataDeletionByExternalId,
      { externalId: "th-1" },
    );

    // Kod potvrde je run koji je već postojao (prvi pronađen).
    expect(confirmationCode).toBe(runA);
    expect((await veza(s, b))?.status).toBe("disconnecting");
    expect((await veza(s, a))?.status).toBe("disconnecting");

    const redovi = await brisanja(s);
    expect(redovi).toHaveLength(2);
    expect(redovi.find((r) => r.workspaceId === s.wsB)).toMatchObject({
      provider: "threads",
      connectionId: b,
      status: "running",
    });
    // Run projekta A je isti kakav je bio, ne pokreće se drugi.
    expect(redovi.find((r) => r._id === runA)).toMatchObject({ startedAt: 1, updatedAt: 1 });
  });

  test("zahtev za brisanje: A u prekidu bez runa, B aktivan: oba dobijaju run, kod je prvi", async () => {
    const s = await napraviSvet();
    const a = await dodajVezu(s, {
      workspaceId: s.wsA,
      provider: "threads",
      status: "disconnecting",
      externalId: "th-1",
    });
    const b = await dodajVezu(s, {
      workspaceId: s.wsB,
      provider: "threads",
      status: "active",
      externalId: "th-1",
    });

    const { confirmationCode } = await s.t.mutation(
      internal.threadsStore.triggerDataDeletionByExternalId,
      { externalId: "th-1" },
    );

    expect((await veza(s, a))?.status).toBe("disconnecting");
    expect((await veza(s, b))?.status).toBe("disconnecting");
    const redovi = await brisanja(s);
    expect(redovi.map((r) => r.workspaceId).sort()).toEqual([s.wsA, s.wsB].sort());
    const runA = redovi.find((r) => r.workspaceId === s.wsA);
    expect(confirmationCode).toBe(runA?._id);
  });

  test("zahtev za brisanje: nalog koji nigde ne postoji vraća kod „završeno“, bez runa", async () => {
    const s = await napraviSvet();
    await dodajVezu(s, {
      workspaceId: s.wsA,
      provider: "threads",
      status: "active",
      externalId: "th-2",
    });

    const { confirmationCode } = await s.t.mutation(
      internal.threadsStore.triggerDataDeletionByExternalId,
      { externalId: "th-nepoznat" },
    );

    expect(confirmationCode).toMatch(/^del_completed_/);
    expect(await brisanja(s)).toEqual([]);
  });
});

// ── 8. kraj sinhronizacije ne vraća vezu iz prekida ──────────────────────────

describe("sync.finishSyncRun i sync.failSyncRun", () => {
  async function veziSaProlazom(s: Svet, status: Status) {
    return await s.t.run(async (ctx) => {
      const connectionId = await ctx.db.insert("connections", {
        workspaceId: s.wsA,
        provider: "meta_ig",
        encryptedCredentials: "sifrovano",
        externalId: "ig-1",
        status,
      });
      const syncRunId = await ctx.db.insert("syncRuns", {
        workspaceId: s.wsA,
        provider: "meta_ig",
        connectionId,
        startedAt: Date.now(),
        status: "running",
        itemsWritten: 0,
      });
      return { connectionId, syncRunId };
    });
  }

  const prolaz = (s: Svet, id: Id<"syncRuns">) => s.t.run(async (ctx) => await ctx.db.get(id));

  test("uspešan kraj prolaza zatvara prolaz, ali veza u prekidu ostaje u prekidu", async () => {
    const s = await napraviSvet();
    const { connectionId, syncRunId } = await veziSaProlazom(s, "disconnecting");

    await s.t.mutation(internal.sync.finishSyncRun, { syncRunId, itemsWritten: 5 });

    expect(await prolaz(s, syncRunId)).toMatchObject({ status: "ok", itemsWritten: 5 });
    const posle = await veza(s, connectionId);
    expect(posle?.status).toBe("disconnecting");
    // Ni „poslednja sinhronizacija“ se ne upisuje na vezu koja se briše.
    expect(posle?.lastSyncAt).toBeUndefined();
  });

  test("neuspešan kraj prolaza zatvara prolaz, ali veza u prekidu ostaje u prekidu", async () => {
    const s = await napraviSvet();
    const { connectionId, syncRunId } = await veziSaProlazom(s, "disconnecting");

    await s.t.mutation(internal.sync.failSyncRun, { syncRunId, error: "token odbijen" });

    expect(await prolaz(s, syncRunId)).toMatchObject({ status: "error", error: "token odbijen" });
    expect((await veza(s, connectionId))?.status).toBe("disconnecting");
  });

  test("kontrola: veza u grešci posle uspešnog prolaza postaje aktivna, istekla ostaje istekla", async () => {
    const s = await napraviSvet();
    const greska = await veziSaProlazom(s, "error");
    const istekla = await veziSaProlazom(s, "expired");

    await s.t.mutation(internal.sync.finishSyncRun, { syncRunId: greska.syncRunId, itemsWritten: 1 });
    await s.t.mutation(internal.sync.finishSyncRun, { syncRunId: istekla.syncRunId, itemsWritten: 1 });

    const posleGreske = await veza(s, greska.connectionId);
    expect(posleGreske?.status).toBe("active");
    expect(posleGreske?.lastSyncAt).toBeTypeOf("number");
    expect((await veza(s, istekla.connectionId))?.status).toBe("expired");
  });

  test("kontrola: aktivna veza posle neuspelog prolaza prelazi u grešku", async () => {
    const s = await napraviSvet();
    const { connectionId, syncRunId } = await veziSaProlazom(s, "active");

    await s.t.mutation(internal.sync.failSyncRun, { syncRunId, error: "timeout" });

    expect((await veza(s, connectionId))?.status).toBe("error");
  });
});
