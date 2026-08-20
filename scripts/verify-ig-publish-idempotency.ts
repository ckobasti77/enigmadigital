/**
 * ============================================================================
 * DOKAZ: `media_publish` se šalje NAJVIŠE jednom po poslu
 * ============================================================================
 *
 * Pokretanje:
 *
 *   node --import ./scripts/ts-hooks.mjs scripts/verify-ig-publish-idempotency.ts
 *
 * Ovo nije simulacija logike — poziva se PRAVI `runPublishJob` iz
 * `convex/instagramPublish.ts`, preko `._handler`, koji Convex ostavlja na
 * registrovanoj funkciji. Lažni su samo `ctx` i `fetch`, dakle baza i Meta.
 *
 * Posle R1 zaštita više ne visi o Metinom `status_code`. `publishStartedAt` je
 * BRAVA: čim je postavljen, nijedan prolaz ne sme da pošalje `media_publish`
 * ponovo — ide u putanju oporavka, ma šta kontejner vraćao. Zato scenariji
 * pokrivaju oba stanja polja, i „FINISHED" više nije dovoljan da se pošalje.
 *
 *   A) `PUBLISHED` + `publishStartedAt` set + objava se prepoznaje u feed-u
 *      → nula `media_publish`, posao se zatvara sa pravim id-em
 *   B) `PUBLISHED` + `publishStartedAt` set + feed sa dva kandidata
 *      → nula `media_publish`, posao se zatvara sa `mediaIdUnconfirmed`
 *   C) `FINISHED` + `publishStartedAt` set + feed prazan (ne može da se potvrdi)
 *      → nula `media_publish`, posao staje kao `failed` i traži čoveka (R1/1a)
 *   D) `FINISHED` + `publishStartedAt` NIJE set (prvi pokušaj) — uobičajen put
 *      → tačno jedan `media_publish`, i `markPublishing` je upisan PRE njega
 *   E) fence token se ne poklapa (`markPublishing` vraća false)
 *      → nula `media_publish`: prolaz koji je izgubio posao ćuti (R1/1)
 *
 * D postoji da A–C ne bi mogli da prođu zato što se objavljivanje pokvarilo
 * uopšte: test koji pokazuje da se poziv ne šalje mora da pokaže i kada se šalje.
 */

import { getFunctionName } from "convex/server";
import { runPublishJob } from "../convex/instagramPublish";
import { encryptCredentials } from "../convex/lib/crypto";

// ── the world the handler runs in ───────────────────────────────────────────

process.env.CREDENTIALS_ENCRYPTION_KEY = "a".repeat(64);

const IG_USER_ID = "17841400000000000";
const CONTAINER_ID = "18000000000000000";
const JOB_ID = "job_test_1";
const CONNECTION_ID = "conn_test_1";
const CAPTION = "Prolećna kolekcija je stigla";
const RUN_TOKEN = "tok_test_1";

type Recorded = { name: string; args: Record<string, unknown> };

type Scenario = {
  label: string;
  containerStatus: string;
  /** Whether a previous run already sent `media_publish` for this job. */
  alreadySent: boolean;
  /** What `GET /me/media` answers when the lost id is looked for. */
  feed: Array<{ id: string; caption?: string; timestamp: string }>;
  /**
   * The fence token every guarded transition answers with. When it differs from
   * the run's own token, the transition reports "false" (job lost) and the run
   * must stop before sending (R1/1).
   */
  ownsJob?: boolean;
};

type Outcome = {
  mutations: Recorded[];
  publishPosts: number;
  requests: string[];
  /**
   * Mutations and HTTP calls in ONE list, in the order they happened.
   *
   * Two separate lists cannot answer "was the state written before the call" —
   * comparing an index in one against an index in the other compares nothing.
   * The ordering is the claim, so the ordering has to be recorded.
   */
  timeline: string[];
};

const PUBLISHED_AT = new Date("2026-08-20T10:00:00.000Z").getTime();

/** The transitions that carry the fence token and answer true/false (R1/1). */
const GUARDED = [
  "markProcessing",
  "markPublishing",
  "markPublished",
  "markFailure",
  "saveChildContainers",
];

/**
 * Everything the handler is allowed to touch, and nothing else.
 *
 * `runMutation` records rather than writes; the claim it answers with is the
 * one shape that matters here — a job that already owns a container, with
 * `publishStartedAt` set or not per scenario. The guarded transitions answer
 * `ownsJob` so the fence path can be exercised too.
 */
function makeCtx(outcome: Outcome, encrypted: string, scenario: Scenario) {
  const ownsJob = scenario.ownsJob ?? true;
  return {
    runMutation: async (ref: unknown, args: Record<string, unknown>) => {
      const name = getFunctionName(ref as Parameters<typeof getFunctionName>[0]);
      outcome.mutations.push({ name, args });
      outcome.timeline.push(`mutation ${name}`);

      if (name.endsWith("claimJob")) {
        return {
          workspaceId: "ws_test_1",
          connectionId: CONNECTION_ID,
          igUserId: IG_USER_ID,
          encryptedCredentials: encrypted,
          kind: "REEL",
          caption: CAPTION,
          shareToFeed: true,
          mediaUrls: ["https://example.convex.site/ig-upload/kg1"],
          contentTypes: ["video/mp4"],
          storageIds: ["kg1"],
          containerId: CONTAINER_ID,
          processingSince: PUBLISHED_AT - 60_000,
          ...(scenario.alreadySent ? { publishStartedAt: PUBLISHED_AT } : {}),
          attempts: 2,
          fresh: true,
          runToken: RUN_TOKEN,
        };
      }
      // A guarded transition answers true = "you still own the job".
      if (GUARDED.some((suffix) => name.endsWith(suffix))) {
        return ownsJob;
      }
      return null;
    },
    runQuery: async () => null,
    runAction: async () => null,
    scheduler: { runAfter: async () => null, runAt: async () => null },
    storage: { get: async () => null },
  };
}

/**
 * Meta, replaced by something that counts.
 *
 * `POST /media_publish` is the call under test: it answers normally, so a
 * handler that sends it gets a plausible reply and the test still catches it —
 * counting is the assertion, not breaking.
 */
function makeFetch(scenario: Scenario, outcome: Outcome) {
  return async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    const method = init?.method ?? "GET";
    outcome.requests.push(`${method} ${url.split("?")[0]}`);
    outcome.timeline.push(`fetch ${method} ${url.split("?")[0]}`);

    const body = (payload: unknown) =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    if (url.includes("/media_publish")) {
      outcome.publishPosts++;
      return body({ id: "17999999999999999" });
    }
    if (url.includes("/me/media")) {
      return body({ data: scenario.feed });
    }
    if (url.includes(CONTAINER_ID)) {
      return body({ status_code: scenario.containerStatus });
    }
    throw new Error(`Neočekivan poziv u testu: ${method} ${url}`);
  };
}

async function run(scenario: Scenario): Promise<Outcome> {
  const outcome: Outcome = {
    mutations: [],
    publishPosts: 0,
    requests: [],
    timeline: [],
  };
  const encrypted = await encryptCredentials("IGQ-token-za-test");

  const realFetch = globalThis.fetch;
  globalThis.fetch = makeFetch(scenario, outcome) as typeof fetch;
  try {
    const handler = (
      runPublishJob as unknown as {
        _handler: (ctx: unknown, args: unknown) => Promise<unknown>;
      }
    )._handler;
    await handler(makeCtx(outcome, encrypted, scenario), { jobId: JOB_ID });
  } finally {
    globalThis.fetch = realFetch;
  }
  return outcome;
}

// ── assertions ──────────────────────────────────────────────────────────────

let failures = 0;

function check(label: string, ok: boolean, detail: string): void {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.log(`  ✗ ${label}\n      ${detail}`);
  }
}

function mutation(outcome: Outcome, suffix: string): Recorded | undefined {
  return outcome.mutations.find((row) => row.name.endsWith(suffix));
}

async function main(): Promise<void> {
  const publishedAtIso = new Date(PUBLISHED_AT + 2_000).toISOString();

  // ── A ─────────────────────────────────────────────────────────────────────
  console.log(
    "\nA) PUBLISHED + već poslato, objava se prepoznaje u feed-u po opisu i vremenu",
  );
  const a = await run({
    label: "A",
    containerStatus: "PUBLISHED",
    alreadySent: true,
    feed: [{ id: "17888888888888888", caption: CAPTION, timestamp: publishedAtIso }],
  });
  check(
    "media_publish NIJE poslat",
    a.publishPosts === 0,
    `poslat ${a.publishPosts} put(a): ${a.requests.join(" | ")}`,
  );
  check(
    "upisan je pravi publishedMediaId",
    mutation(a, "markPublished")?.args.publishedMediaId === "17888888888888888",
    `upisano: ${JSON.stringify(mutation(a, "markPublished")?.args)}`,
  );
  check(
    "markPublishing NIJE upisan (poziv se nikada nije spremao)",
    mutation(a, "markPublishing") === undefined,
    "medjustanje je upisano iako poziv ne sme da se pošalje",
  );
  check(
    "markFailure NIJE pozvan",
    mutation(a, "markFailure") === undefined,
    `posao je oboren: ${JSON.stringify(mutation(a, "markFailure")?.args)}`,
  );

  // ── B ─────────────────────────────────────────────────────────────────────
  console.log(
    "\nB) PUBLISHED + već poslato, feed ne razaznaje koja je objava (dva kandidata)",
  );
  const b = await run({
    label: "B",
    containerStatus: "PUBLISHED",
    alreadySent: true,
    feed: [
      { id: "17111111111111111", caption: CAPTION, timestamp: publishedAtIso },
      { id: "17222222222222222", caption: CAPTION, timestamp: publishedAtIso },
    ],
  });
  check(
    "media_publish NIJE poslat",
    b.publishPosts === 0,
    `poslat ${b.publishPosts} put(a): ${b.requests.join(" | ")}`,
  );
  check(
    "posao je zatvoren kao objavljen, sa oznakom da ID nije potvrđen",
    mutation(b, "markPublished")?.args.mediaIdUnconfirmed === true,
    `upisano: ${JSON.stringify(mutation(b, "markPublished")?.args)}`,
  );
  check(
    "izmišljeni publishedMediaId nije upisan",
    mutation(b, "markPublished")?.args.publishedMediaId === undefined,
    `upisano: ${JSON.stringify(mutation(b, "markPublished")?.args)}`,
  );

  // ── C ─────────────────────────────────────────────────────────────────────
  console.log(
    "\nC) FINISHED + već poslato, feed prazan — brava drži, poziv se NE ponavlja (R1/1a)",
  );
  const c = await run({
    label: "C",
    containerStatus: "FINISHED",
    alreadySent: true,
    feed: [],
  });
  check(
    "media_publish NIJE poslat iako kontejner vraća FINISHED",
    c.publishPosts === 0,
    `poslat ${c.publishPosts} put(a): ${c.requests.join(" | ")}`,
  );
  check(
    "posao je zaustavljen kao neuspeh koji traži čoveka",
    mutation(c, "markFailure")?.args.terminal === true,
    `upisano: ${JSON.stringify(mutation(c, "markFailure")?.args)}`,
  );
  check(
    "markPublished NIJE pozvan (ne izmišlja se uspeh)",
    mutation(c, "markPublished") === undefined,
    `upisano: ${JSON.stringify(mutation(c, "markPublished")?.args)}`,
  );

  // ── D ─────────────────────────────────────────────────────────────────────
  console.log(
    "\nD) FINISHED + prvi pokušaj (publishStartedAt nije set) — objava se šalje",
  );
  const d = await run({
    label: "D",
    containerStatus: "FINISHED",
    alreadySent: false,
    feed: [],
  });
  check(
    "media_publish je poslat tačno jednom",
    d.publishPosts === 1,
    `poslat ${d.publishPosts} put(a): ${d.requests.join(" | ")}`,
  );
  const publishingAt = d.timeline.findIndex((step) =>
    step.endsWith("markPublishing"),
  );
  const callAt = d.timeline.findIndex((step) => step.includes("/media_publish"));
  check(
    "markPublishing je upisan PRE poziva media_publish",
    publishingAt !== -1 && callAt !== -1 && publishingAt < callAt,
    `redosled: ${d.timeline.join(" → ")}`,
  );
  check(
    "posao je zatvoren kao objavljen",
    mutation(d, "markPublished")?.args.publishedMediaId === "17999999999999999",
    `upisano: ${JSON.stringify(mutation(d, "markPublished")?.args)}`,
  );

  // ── E ─────────────────────────────────────────────────────────────────────
  console.log(
    "\nE) FINISHED + prvi pokušaj, ali fence token se ne poklapa — prolaz ćuti (R1/1)",
  );
  const e = await run({
    label: "E",
    containerStatus: "FINISHED",
    alreadySent: false,
    feed: [],
    ownsJob: false,
  });
  check(
    "media_publish NIJE poslat (posao je preuzeo drugi prolaz)",
    e.publishPosts === 0,
    `poslat ${e.publishPosts} put(a): ${e.requests.join(" | ")}`,
  );
  check(
    "markPublished NIJE pozvan sa uspehom",
    mutation(e, "markPublished") === undefined,
    `upisano: ${JSON.stringify(mutation(e, "markPublished")?.args)}`,
  );

  console.log(
    failures === 0
      ? "\nSve provere prolaze.\n"
      : `\n${failures} provera nije prošla.\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

void main();
