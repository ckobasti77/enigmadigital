import { getFunctionName, type FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { dateKeysBetween } from "@/lib/date-range";
import {
  DAY,
  HOUR,
  WS,
  lcg,
  now,
  range,
  tekuciPeriod,
  type Fixture,
  type R,
} from "./fixtures-util";

/**
 * Sintetički podaci za ekrane kanala: /facebook, /threads i /youtube.
 *
 * Sve je izmišljeno i očigledno lažno („Test Salon", test.salon, example.com).
 * Slike i sličice su namerno odsutne (pictureUrl / thumbnailUrl / mediaUrl):
 * ekrani tada crtaju neutralni rezervni prikaz, a snimak ne zavisi od mreže.
 *
 * Svaka konstanta je tipizirana preko `R<>` prave Convex funkcije, pa `tsc`
 * obara fixture čim se oblik odgovora promeni. Tamo gde funkcija vraća
 * `v.any()` (Threads automatizacije) tip dolazi iz `Doc<>` tabele.
 *
 * `PRAZNO_KANALI` je ono što pravi backend vraća za nepovezan kanal (nalog bez
 * veza). `connections.list` NAMERNO nije ovde — njega za prazan nalog rešava
 * pozivalac, jer ga YouTube ekran čita da bi znao da li je kanal povezan.
 */

const fn = getFunctionName;



/** Dani koje upit traži; bez argumenata, tekući period. */
function dani(args: Record<string, unknown>): string[] {
  const from = typeof args.from === "string" ? args.from : range.from;
  const to = typeof args.to === "string" ? args.to : range.to;
  return dateKeysBetween(from, to);
}

const danUMs = (date: string, sat = 6) => Date.parse(`${date}T0${sat}:00:00Z`);

// ════════════════════════════════════════════════════════════════════════════
// Facebook
// ════════════════════════════════════════════════════════════════════════════

const fbPageInfo: R<typeof api.facebookStore.pageInfo> = {
  pageId: "000000000000001",
  pageName: "Test Salon stranica",
  status: "active",
  expiresAt: null,
  lastSyncAt: now - 3 * HOUR,
};

function fbDaily(args: Record<string, unknown>): R<typeof api.facebookStore.dailyHistory> {
  const rnd = lcg(101);
  let fans = 1840;
  const out: R<typeof api.facebookStore.dailyHistory> = [];
  dani(args).forEach((date, i) => {
    fans += Math.round(rnd() * 4) - (i % 11 === 6 ? 2 : 0);
    // Nekoliko dana bez izveštaja: Facebook ih ne vrati, red ne postoji.
    if (i % 9 === 4) return;
    const spike = i % 13 === 7 ? 1.9 : 1;
    const impressions = Math.round((420 + rnd() * 900) * spike);
    out.push({
      date,
      impressions,
      engagements: Math.round(impressions * (0.04 + rnd() * 0.05)),
      fans,
    });
  });
  return out;
}

type FbPost = R<typeof api.facebookStore.postsList>[number];

function fbPost(
  n: number,
  daysAgo: number,
  over: Partial<FbPost> & Pick<FbPost, "message" | "statusType" | "likes" | "comments" | "shares">,
): FbPost {
  return {
    _id: `fbpost_test_${n}` as Id<"fbPagePosts">,
    postId: `000000000000001_90000000000${n}`,
    permalink: `https://example.com/fb/post-${n}`,
    publishedAt: now - daysAgo * DAY,
    syncedAt: now - 3 * HOUR,
    ...over,
  };
}

const fbPosts: R<typeof api.facebookStore.postsList> = [
  fbPost(1, 1, {
    message: "Nova usluga u Test Salonu: balayage uz besplatnu konsultaciju. Termini ovog vikenda.",
    statusType: "added_photos",
    likes: 96,
    comments: 18,
    shares: 11,
    impressions: 4210,
    reach: 3380,
    clicks: 142,
    likedByUs: true,
  }),
  fbPost(2, 3, {
    message: "Pogledajte kako izgleda jedan dan u salonu (video, 40 sekundi).",
    statusType: "added_video",
    likes: 58,
    comments: 7,
    shares: 5,
    impressions: 2890,
    reach: 2310,
    clicks: 64,
  }),
  fbPost(3, 6, {
    message: "Radno vreme za praznike: petak 9–15, subota zatvoreno.",
    statusType: "mobile_status_update",
    likes: 31,
    comments: 4,
    shares: 2,
    impressions: 1740,
    reach: 1502,
    clicks: 12,
  }),
  fbPost(4, 9, {
    message: "Podelili smo savet o nezi farbane kose.",
    statusType: "shared_story",
    likes: 22,
    comments: 2,
    shares: 3,
    impressions: 1260,
    reach: 1044,
    clicks: 38,
  }),
  fbPost(5, 13, {
    message: "Pitanje nedelje: koju boju biste probali? Odgovorite u komentarima.",
    statusType: "mobile_status_update",
    likes: 44,
    comments: 29,
    shares: 1,
    impressions: 2380,
    reach: 1980,
    clicks: 9,
  }),
  // Slab post: skoro bez dosega.
  fbPost(6, 17, {
    message: "Test objava.",
    statusType: "mobile_status_update",
    likes: 2,
    comments: 0,
    shares: 0,
    impressions: 118,
    reach: 96,
    clicks: 0,
  }),
  // Objava bez uvida (poslednji poziv nije vratio brojeve).
  fbPost(7, 21, {
    message: "Galerija radova: pramenovi i šišanje.",
    statusType: "added_photos",
    likes: 37,
    comments: 5,
    shares: 2,
  }),
  // Obrisana sa Facebooka: brojevi ostaju, red je označen.
  fbPost(8, 25, {
    message: "Stara akcija koja je povučena sa stranice.",
    statusType: "added_photos",
    likes: 19,
    comments: 3,
    shares: 0,
    impressions: 940,
    reach: 802,
    clicks: 21,
    deletedAt: now - 5 * DAY,
  }),
];

const fbSetupInfo: R<typeof api.facebookStore.setupInfo> = {
  webhookUrl: "https://example.com/facebook/webhook",
  appConfigured: true,
  verifyTokenSet: true,
  appSecretSet: true,
};

type FbThread = R<typeof api.fbCommentsStore.listThreads>[number];

function fbThread(
  n: number,
  minutesAgo: number,
  over: Partial<FbThread> & Pick<FbThread, "text" | "authorName" | "postId">,
): FbThread {
  const post = fbPosts.find((p) => p.postId === over.postId) ?? null;
  return {
    _id: `fbcomment_test_${n}` as Id<"fbComments">,
    commentId: `90000000000${n}_8000${n}`,
    permalink: `https://example.com/fb/comment-${n}`,
    timestamp: now - minutesAgo * 60_000,
    likeCount: 0,
    hidden: false,
    isOurs: false,
    repliedByUs: false,
    post:
      post === null
        ? null
        : {
            message: post.message,
            permalink: post.permalink,
            statusType: post.statusType,
            publishedAt: post.publishedAt,
          },
    replies: [],
    ...over,
  };
}

const fbThreads: R<typeof api.fbCommentsStore.listThreads> = [
  fbThread(1, 12, {
    postId: fbPosts[0].postId,
    authorName: "Test Korisnik 1",
    text: "Koliko košta balayage za dugu kosu?",
    likeCount: 2,
  }),
  fbThread(2, 95, {
    postId: fbPosts[0].postId,
    authorName: "Test Korisnik 2",
    text: "Predivno! Mogu li da zakažem za subotu?",
    likeCount: 4,
    repliedByUs: true,
    automationName: "Termin: ključna reč „zakazati”",
    replies: [
      {
        _id: "fbcomment_test_21" as Id<"fbComments">,
        commentId: "900000000001_80001_r1",
        text: "Zdravo! Pošaljite nam poruku sa željenim terminom i javljamo se u roku od sat vremena.",
        authorName: "Test Salon stranica",
        timestamp: now - 90 * 60_000,
        likedByUs: false,
        hidden: false,
        isOurs: true,
        automationName: "Termin: ključna reč „zakazati”",
      },
    ],
  }),
  fbThread(3, 260, {
    postId: fbPosts[1].postId,
    authorName: "Test Korisnik 3",
    text: "Gde se tačno nalazite?",
  }),
  fbThread(4, 540, {
    postId: fbPosts[4].postId,
    authorName: "Test Korisnik 4",
    text: "Kupite jeftine pratioce na example.com/spam",
    hidden: true,
  }),
  fbThread(5, 1300, {
    postId: fbPosts[4].postId,
    authorName: "Test Korisnik 5",
    text: "Ljubičasta, naravno.",
    likeCount: 1,
    likedByUs: true,
  }),
  fbThread(6, 2900, {
    postId: fbPosts[7].postId,
    authorName: "Test Korisnik 6",
    text: "Komentar koji je autor kasnije obrisao.",
    deletedAt: now - 2 * DAY,
  }),
];

const fbMatchesFilter = (t: FbThread, filter: string): boolean => {
  switch (filter) {
    case "unanswered":
      return !t.isOurs && !t.repliedByUs && !t.hidden && t.deletedAt === undefined;
    case "hidden":
      return t.hidden && t.deletedAt === undefined;
    case "deleted":
      return t.deletedAt !== undefined;
    default:
      return true;
  }
};

function fbListThreads(args: Record<string, unknown>): R<typeof api.fbCommentsStore.listThreads> {
  const filter = typeof args.filter === "string" ? args.filter : "unanswered";
  const needle = typeof args.search === "string" ? args.search.trim().toLowerCase() : "";
  return fbThreads.filter(
    (t) =>
      fbMatchesFilter(t, filter) &&
      (typeof args.postId !== "string" || t.postId === args.postId) &&
      (needle === "" ||
        t.text.toLowerCase().includes(needle) ||
        t.authorName.toLowerCase().includes(needle) ||
        t.replies.some((r) => r.text.toLowerCase().includes(needle))),
  );
}

const fbFilterCounts: R<typeof api.fbCommentsStore.filterCounts> = {
  all: fbThreads.length,
  unanswered: fbThreads.filter((t) => fbMatchesFilter(t, "unanswered")).length,
  hidden: fbThreads.filter((t) => fbMatchesFilter(t, "hidden")).length,
  deleted: fbThreads.filter((t) => fbMatchesFilter(t, "deleted")).length,
  cap: 100,
};

// ════════════════════════════════════════════════════════════════════════════
// Threads
// ════════════════════════════════════════════════════════════════════════════

function thViewsSeries(args: Record<string, unknown>) {
  const rnd = lcg(202);
  return dani(args)
    .map((date, i) => {
      const spike = i % 10 === 3 ? 2.4 : 1;
      return {
        date,
        views: i % 12 === 8 ? null : Math.round((90 + rnd() * 260) * spike),
      };
    })
    // Dani pre prve sinhronizacije ne postoje u bazi.
    .filter((_, i) => i % 15 !== 11);
}

const thLastSync = {
  startedAt: now - 3 * HOUR,
  finishedAt: now - 3 * HOUR + 9_000,
  status: "ok" as const,
  error: undefined,
  itemsWritten: 64,
};

function thOverview(args: Record<string, unknown>): R<typeof api.threadsStore.accountOverview> {
  const dailyViews = thViewsSeries(args);
  return {
    connected: true,
    username: "@test.salon",
    status: "active",
    lastSync: thLastSync,
    views: dailyViews.reduce((sum, d) => sum + (d.views ?? 0), 0),
    dailyViews,
    followersCount: 1264,
    clicks: 187,
    replies: 342,
    quotes: 28,
    reposts: 96,
    likes: 2478,
    totalsFetchedAt: now - 3 * HOUR,
  };
}

function thFollowerHistory(
  args: Record<string, unknown>,
): R<typeof api.threadsStore.followerHistory> {
  const rnd = lcg(303);
  let followers = 1180;
  return dani(args)
    .map((date, i) => {
      followers += Math.round(rnd() * 5) - (i % 8 === 5 ? 1 : 0);
      return {
        date,
        takenAt: danUMs(date),
        followersCount: i % 17 === 9 ? null : followers,
      };
    })
    .filter((_, i) => i % 14 !== 10);
}

type ThMedia = R<typeof api.threadsStore.mediaList>[number];

function thPost(
  n: number,
  daysAgo: number,
  over: Partial<ThMedia> & Pick<ThMedia, "mediaType" | "text" | "insights">,
): ThMedia {
  return {
    _id: `thpost_test_${n}` as Id<"threadsPosts">,
    mediaId: `1780000000000000${n}`,
    mediaProductType: "THREADS",
    permalink: `https://example.com/threads/post-${n}`,
    timestamp: new Date(now - daysAgo * DAY).toISOString(),
    username: "test.salon",
    mediaUrl: null,
    thumbnailUrl: null,
    children: null,
    isQuotePost: false,
    isReply: false,
    hasReplies: true,
    syncedAt: now - 3 * HOUR,
    ...over,
  };
}

function thInsights(
  views: number,
  likes: number,
  replies: number,
  reposts: number,
  quotes: number,
  shares: number,
): ThMedia["insights"] {
  return {
    date: new Date(now).toISOString().slice(0, 10),
    views,
    likes,
    replies,
    reposts,
    quotes,
    shares,
  };
}

const thMedia: R<typeof api.threadsStore.mediaList> = [
  thPost(1, 1, {
    mediaType: "TEXT_POST",
    text: "Nova sezona, nove boje. Koji trend vam je omiljeni ove jeseni?",
    insights: thInsights(5120, 214, 41, 18, 6, 12),
  }),
  thPost(2, 3, {
    mediaType: "IMAGE",
    text: "Pre i posle: korekcija boje u dva termina.",
    insights: thInsights(2980, 133, 17, 9, 2, 7),
  }),
  thPost(3, 5, {
    mediaType: "CAROUSEL_ALBUM",
    text: "Pet saveta za negu kose zimi.",
    isQuotePost: false,
    insights: thInsights(1860, 88, 9, 14, 3, 21),
  }),
  thPost(4, 8, {
    mediaType: "VIDEO",
    text: "Kratki vodič: kako da zakažete termin online.",
    insights: thInsights(1210, 49, 6, 3, 0, 4),
  }),
  thPost(5, 12, {
    mediaType: "TEXT_POST",
    text: "Radno vreme se menja od ponedeljka.",
    hasReplies: false,
    insights: thInsights(640, 12, 0, 1, 0, 0),
  }),
  thPost(6, 16, {
    mediaType: "TEXT_POST",
    text: "Test.",
    hasReplies: false,
    insights: thInsights(74, 1, 0, 0, 0, 0),
  }),
  // Objava za koju uvidi još nisu stigli.
  thPost(7, 20, {
    mediaType: "IMAGE",
    text: "Galerija iz salona.",
    insights: null,
  }),
];

const thDemographics: R<typeof api.threadsStore.demographicsSummary> = {
  state: "value",
  date: new Date(now - DAY).toISOString().slice(0, 10),
  takenAt: now - 8 * HOUR,
  ageGender: [
    { age: "18-24", gender: "F", value: 142 },
    { age: "18-24", gender: "M", value: 38 },
    { age: "25-34", gender: "F", value: 311 },
    { age: "25-34", gender: "M", value: 94 },
    { age: "35-44", gender: "F", value: 226 },
    { age: "35-44", gender: "M", value: 71 },
    { age: "45-54", gender: "F", value: 108 },
    { age: "45-54", gender: "M", value: 33 },
    { age: "55-64", gender: "F", value: 27 },
  ],
  countries: [
    { name: "RS", value: 1012 },
    { name: "BA", value: 74 },
    { name: "ME", value: 51 },
    { name: "HR", value: 38 },
    { name: "DE", value: 22 },
  ],
  cities: [
    { name: "Beograd", value: 468 },
    { name: "Novi Sad", value: 189 },
    { name: "Niš", value: 97 },
    { name: "Kragujevac", value: 61 },
    { name: "Subotica", value: 44 },
  ],
};

const thAttribution: R<typeof api.threadsFunnels.getThreadsLinkAttributionSummary> = {
  matchedLinks: [
    {
      trackedLinkId: "trackedlink_test_1" as Id<"orTrackedLinks">,
      slug: "termin",
      shortUrl: "https://example.com/r/termin",
      destinationUrl: "https://example.com/zakazivanje",
      label: "Zakazivanje termina",
      threadsClicks: 96,
      siteClicks: 71,
      dailyBreakdown: [],
    },
    {
      trackedLinkId: "trackedlink_test_2" as Id<"orTrackedLinks">,
      slug: "cenovnik",
      shortUrl: "https://example.com/r/cenovnik",
      destinationUrl: "https://example.com/cenovnik",
      label: "Cenovnik usluga",
      threadsClicks: 41,
      siteClicks: 33,
      dailyBreakdown: [],
    },
    {
      trackedLinkId: "trackedlink_test_3" as Id<"orTrackedLinks">,
      slug: "akcija",
      shortUrl: "https://example.com/r/akcija",
      destinationUrl: "https://example.com/akcija",
      label: "Jesenja akcija",
      threadsClicks: 28,
      siteClicks: undefined,
      dailyBreakdown: [],
    },
  ],
  unmatchedSummary: {
    unmatchedCount: 2,
    unmatchedTotalThreadsClicks: 22,
    unmatchedUrls: [
      {
        rawUrl: "https://example.com/blog/nega-kose",
        normalizedUrl: "example.com/blog/nega-kose",
        date: new Date(now - 4 * DAY).toISOString().slice(0, 10),
        threadsClicks: 14,
      },
      {
        rawUrl: "https://example.com/o-nama",
        normalizedUrl: "example.com/o-nama",
        date: new Date(now - 9 * DAY).toISOString().slice(0, 10),
        threadsClicks: 8,
      },
    ],
  },
};

const thUnmatchedUrls: R<typeof api.threadsFunnels.listUnmatchedUrls> = [
  {
    _id: "thlink_test_1" as Id<"threadsLinkAttribution">,
    date: new Date(now - 4 * DAY).toISOString().slice(0, 10),
    rawUrl: "https://example.com/blog/nega-kose",
    normalizedUrl: "example.com/blog/nega-kose",
    threadsClicks: 14,
    updatedAt: now - 3 * HOUR,
  },
  {
    _id: "thlink_test_2" as Id<"threadsLinkAttribution">,
    date: new Date(now - 9 * DAY).toISOString().slice(0, 10),
    rawUrl: "https://example.com/o-nama",
    normalizedUrl: "example.com/o-nama",
    threadsClicks: 8,
    updatedAt: now - 3 * HOUR,
  },
];

const thAutomationIds = [
  "thauto_test_1" as Id<"threadsAutomations">,
  "thauto_test_2" as Id<"threadsAutomations">,
];

const thAutomations: Doc<"threadsAutomations">[] = [
  {
    _id: thAutomationIds[0],
    _creationTime: now - 14 * DAY,
    workspaceId: WS,
    name: "Odgovor na pitanje o ceni",
    trigger: "reply_to_our_post",
    keywords: ["cena", "koliko košta", "cenovnik"],
    matchType: "contains",
    caseSensitive: false,
    matchAnyKeyword: true,
    matchAnyPost: true,
    actionType: "public_reply",
    replyText: "Cenovnik je ovde, a za tačnu cenu pošaljite poruku.",
    linkUrl: "https://example.com/r/cenovnik",
    mode: "live",
    dailyLimit: 20,
    cooldownMinutesPerAuthor: 60,
    maxRepliesPerThread: 3,
    isActive: true,
    createdAt: now - 14 * DAY,
    updatedAt: now - 2 * DAY,
  },
  {
    _id: thAutomationIds[1],
    _creationTime: now - 3 * DAY,
    workspaceId: WS,
    name: "Termin (probno, skica)",
    trigger: "mention",
    keywords: ["termin", "zakazati"],
    matchType: "contains",
    caseSensitive: false,
    matchAnyKeyword: true,
    matchAnyPost: true,
    actionType: "public_reply",
    replyText: "Termin možete zakazati preko linka u biografiji.",
    mode: "draft",
    dailyLimit: 10,
    cooldownMinutesPerAuthor: 120,
    maxRepliesPerThread: 1,
    isActive: false,
    createdAt: now - 3 * DAY,
    updatedAt: now - 3 * DAY,
  },
];

function thLog(
  n: number,
  minutesAgo: number,
  over: Partial<Doc<"threadsAutomationLogs">> &
    Pick<Doc<"threadsAutomationLogs">, "status" | "mode" | "actionType">,
): Doc<"threadsAutomationLogs"> {
  const created = now - minutesAgo * 60_000;
  return {
    _id: `thlog_test_${n}` as Id<"threadsAutomationLogs">,
    _creationTime: created,
    workspaceId: WS,
    automationId: thAutomationIds[0],
    trigger: "reply_to_our_post",
    sourceReplyId: `1790000000000000${n}`,
    authorId: `test_korisnik_${n}`,
    matchedKeyword: "cena",
    date: new Date(created).toISOString().slice(0, 10),
    createdAt: created,
    ...over,
  };
}

const thLogs: Doc<"threadsAutomationLogs">[] = [
  thLog(1, 18, { status: "executed", mode: "live", actionType: "public_reply" }),
  thLog(2, 140, {
    status: "rejected_cooldown",
    mode: "live",
    actionType: "public_reply",
    reason: "cooldown_active",
  }),
  thLog(3, 420, {
    status: "draft_simulated",
    mode: "draft",
    actionType: "public_reply",
    automationId: thAutomationIds[1],
    trigger: "mention",
    matchedKeyword: "termin",
  }),
  thLog(4, 900, {
    status: "failed",
    mode: "live",
    actionType: "public_reply",
    matchedKeyword: "koliko košta",
    reason: "api_error",
    errorMessage: "Threads API je odbio zahtev (test greška).",
  }),
  thLog(5, 2100, {
    status: "skipped_no_match",
    mode: "live",
    actionType: "public_reply",
    matchedKeyword: undefined,
  }),
];



const thJobs: R<typeof api.threadsPublishStore.listJobs> = [
  {
    _id: "thjob_test_1" as Id<"threadsPublishJobs">,
    mediaType: "TEXT",
    text: "Sutra u 10h otvaramo termine za novembar.",
    itemCount: 0,
    status: "queued",
    scheduledFor: now + 20 * HOUR,
    attempts: 0,
    filesDeleted: false,
    cancellable: true,
    createdAt: now - 2 * HOUR,
    updatedAt: now - 2 * HOUR,
  },
  {
    _id: "thjob_test_2" as Id<"threadsPublishJobs">,
    mediaType: "IMAGE",
    text: "Nova frizura meseca.",
    itemCount: 1,
    status: "published",
    attempts: 1,
    publishedMediaId: "17800000000000001",
    publishedAt: now - 1 * DAY,
    filesDeleted: true,
    cancellable: false,
    createdAt: now - 1 * DAY - HOUR,
    updatedAt: now - 1 * DAY,
  },
  {
    _id: "thjob_test_3" as Id<"threadsPublishJobs">,
    mediaType: "VIDEO",
    text: "Kratki video iz salona.",
    itemCount: 1,
    status: "failed",
    attempts: 3,
    error: "Obrada videa nije uspela (test greška).",
    filesDeleted: false,
    cancellable: false,
    createdAt: now - 3 * DAY,
    updatedAt: now - 3 * DAY + HOUR,
  },
];

const thSearchQuota: R<typeof api.threadsSearch.getSearchQuotaInfo> = {
  keywordSearch: { used: 340, total: 2200 },
  profileLookup: { used: 85, total: 1000 },
};

const thSetupInfo: R<typeof api.threadsStore.setupInfo> = { isConfigured: true };

const thReplies: R<typeof api.threadsReplies.listRepliesForPost> = [
  {
    _id: "threply_test_1" as Id<"threadsReplies">,
    replyId: "17900000000000001",
    text: "Koliko košta farbanje i šišanje zajedno?",
    username: "test.korisnik1",
    permalink: "https://example.com/threads/reply-1",
    timestamp: new Date(now - 40 * 60_000).toISOString(),
    mediaType: "TEXT_POST",
    isReply: true,
    isReplyOwnedByMe: false,
    approvalStatus: "pending",
    hideStatus: "NOT_HUSHED",
    source: "webhook",
  },
  {
    _id: "threply_test_2" as Id<"threadsReplies">,
    replyId: "17900000000000002",
    text: "Hvala svima! Termini su otvoreni do kraja meseca.",
    username: "test.salon",
    permalink: "https://example.com/threads/reply-2",
    timestamp: new Date(now - 5 * HOUR).toISOString(),
    mediaType: "TEXT_POST",
    isReply: true,
    isReplyOwnedByMe: true,
    approvalStatus: "approved",
    hideStatus: "NOT_HUSHED",
    source: "sync",
  },
  {
    _id: "threply_test_3" as Id<"threadsReplies">,
    replyId: "17900000000000003",
    text: "Spam sadržaj (test).",
    username: "test.spam",
    permalink: "https://example.com/threads/reply-3",
    timestamp: new Date(now - 1 * DAY).toISOString(),
    mediaType: "TEXT_POST",
    isReply: true,
    isReplyOwnedByMe: false,
    hideStatus: "HIDDEN",
    source: "sync",
  },
];

// ════════════════════════════════════════════════════════════════════════════
// YouTube
// ════════════════════════════════════════════════════════════════════════════

function ytDaily(args: Record<string, unknown>): R<typeof api.youtubeStore.dailyTotals> {
  const rnd = lcg(404);
  const out: R<typeof api.youtubeStore.dailyTotals> = [];
  dani(args).forEach((date, i) => {
    // Par dana bez ijednog pregleda: YouTube ne vrati red.
    if (i % 10 === 5) return;
    const spike = i % 14 === 9 ? 3 : 1;
    const views = Math.round((70 + rnd() * 160) * spike);
    out.push({
      date,
      views,
      estimatedMinutesWatched: Math.round(views * (2.1 + rnd() * 1.6)),
      averageViewDuration: Math.round(95 + rnd() * 70),
      averageViewPercentage: Math.round((32 + rnd() * 26) * 10) / 10,
      subscribersGained: Math.round(rnd() * 5),
      subscribersLost: Math.round(rnd() * 1.4),
      likes: Math.round(views * (0.03 + rnd() * 0.03)),
      comments: Math.round(views * rnd() * 0.006),
      shares: Math.round(views * rnd() * 0.004),
      syncedAt: now - 3 * HOUR,
    });
  });
  return out;
}

const ytTraffic: R<typeof api.youtubeStore.trafficSources> = [
  { sourceType: "YT_SEARCH", views: 1840, estimatedMinutesWatched: 4210 },
  { sourceType: "SUGGESTED_VIDEO", views: 1260, estimatedMinutesWatched: 3380 },
  { sourceType: "SHORTS", views: 910, estimatedMinutesWatched: 640 },
  { sourceType: "NO_LINK_OTHER", views: 540, estimatedMinutesWatched: 1120 },
  { sourceType: "EXT_URL", views: 322, estimatedMinutesWatched: 810 },
  { sourceType: "YT_CHANNEL", views: 205, estimatedMinutesWatched: 560 },
  { sourceType: "PLAYLIST", views: 96, estimatedMinutesWatched: 330 },
  { sourceType: "NOTIFICATION", views: 41, estimatedMinutesWatched: 118 },
];

type YtVideo = R<typeof api.youtubeStore.videos>[number];

function ytVideo(
  n: number,
  daysAgo: number,
  over: Partial<YtVideo> & Pick<YtVideo, "title" | "views" | "likes" | "comments">,
): YtVideo {
  return {
    _id: `ytvideo_test_${n}` as Id<"ytVideoStats">,
    videoId: `testVideo${String(n).padStart(2, "0")}A`,
    publishedAt: now - daysAgo * DAY,
    thumbnailUrl: undefined,
    duration: undefined,
    estimatedMinutesWatched: undefined,
    averageViewPercentage: undefined,
    syncedAt: now - 3 * HOUR,
    ...over,
  };
}

const ytVideos: R<typeof api.youtubeStore.videos> = [
  ytVideo(1, 4, {
    title: "Kako izgleda balayage korak po korak",
    duration: "PT8M42S",
    views: 6240,
    likes: 318,
    comments: 47,
    estimatedMinutesWatched: 14820,
    averageViewPercentage: 54.2,
  }),
  ytVideo(2, 11, {
    title: "5 grešaka pri nezi farbane kose",
    duration: "PT6M05S",
    views: 3980,
    likes: 201,
    comments: 29,
    estimatedMinutesWatched: 8110,
    averageViewPercentage: 47.8,
  }),
  ytVideo(3, 18, {
    title: "Dan u salonu (Shorts)",
    duration: "PT0M41S",
    views: 2710,
    likes: 140,
    comments: 12,
    estimatedMinutesWatched: 905,
    averageViewPercentage: 88.1,
  }),
  ytVideo(4, 26, {
    title: "Pitanja i odgovori: cene i termini",
    duration: "PT12M30S",
    views: 1450,
    likes: 62,
    comments: 21,
    estimatedMinutesWatched: 4010,
    averageViewPercentage: 36.4,
  }),
  ytVideo(5, 40, {
    title: "Predstavljanje salona",
    duration: "PT1H02M33S",
    views: 530,
    likes: 14,
    comments: 3,
    estimatedMinutesWatched: 1240,
    averageViewPercentage: 19.6,
  }),
  // Slab video, i bez podataka o zadržavanju.
  ytVideo(6, 55, {
    title: "Test snimak",
    duration: "PT0M12S",
    views: 21,
    likes: 0,
    comments: 0,
  }),
];

const ytSetupInfo: R<typeof api.youtubeStore.setupInfo> = { isConfigured: true };

const ytAutomationIds = [
  "ytauto_test_1" as Id<"ytAutomations">,
  "ytauto_test_2" as Id<"ytAutomations">,
  "ytauto_test_3" as Id<"ytAutomations">,
];

const ytAutomations: R<typeof api.ytAutomationsApi.listAutomations> = [
  {
    _id: ytAutomationIds[0],
    name: "Odgovor na pitanja o ceni",
    keywords: ["cena", "koliko košta"],
    matchAnyWord: true,
    wholeWordMatch: false,
    matchAnyVideo: true,
    videoId: null,
    replyEnabled: true,
    replyMessage: "Cenovnik je u opisu videa, a za tačnu cenu pišite nam poruku.",
    moderationEnabled: false,
    moderationStatus: null,
    markAsSpam: false,
    deleteEnabled: false,
    isActive: true,
    createdAt: now - 20 * DAY,
    updatedAt: now - 6 * DAY,
    repliesLast7Days: 9,
  },
  {
    _id: ytAutomationIds[1],
    name: "Sumnjivi linkovi, zadrži na pregled",
    keywords: ["example.com/spam", "besplatni pratioci"],
    matchAnyWord: true,
    wholeWordMatch: false,
    matchAnyVideo: true,
    videoId: null,
    replyEnabled: false,
    replyMessage: null,
    moderationEnabled: true,
    moderationStatus: "heldForReview",
    markAsSpam: false,
    deleteEnabled: false,
    isActive: true,
    createdAt: now - 12 * DAY,
    updatedAt: now - 12 * DAY,
    repliesLast7Days: 3,
  },
  {
    _id: ytAutomationIds[2],
    name: "Termin za video o balayage-u",
    keywords: ["termin"],
    matchAnyWord: true,
    wholeWordMatch: true,
    matchAnyVideo: false,
    videoId: "testVideo01A",
    replyEnabled: true,
    replyMessage: "Termin zakažite preko linka ispod videa.",
    moderationEnabled: false,
    moderationStatus: null,
    markAsSpam: false,
    deleteEnabled: false,
    isActive: false,
    createdAt: now - 4 * DAY,
    updatedAt: now - 4 * DAY,
    repliesLast7Days: 0,
  },
];

type YtLog = R<typeof api.ytAutomationsApi.listCommentLogs>[number];

function ytLog(
  n: number,
  minutesAgo: number,
  over: Partial<YtLog> & Pick<YtLog, "status" | "commentText">,
): YtLog {
  return {
    _id: `ytlog_test_${n}` as Id<"ytCommentLogs">,
    automationId: ytAutomationIds[0],
    automationName: ytAutomations[0].name,
    commentId: `UgyTestKomentar${n}`,
    videoId: "testVideo01A",
    videoTitle: ytVideos[0].title,
    authorName: `Test Gledalac ${n}`,
    matchedKeyword: "cena",
    attempts: 1,
    repliedAt: null,
    deletedAt: null,
    errorMessage: null,
    createdAt: now - minutesAgo * 60_000,
    ...over,
  };
}

const ytLogs: R<typeof api.ytAutomationsApi.listCommentLogs> = [
  ytLog(1, 25, {
    status: "replied",
    commentText: "Koja je cena balayage-a za kratku kosu?",
    repliedAt: now - 24 * 60_000,
  }),
  ytLog(2, 190, {
    status: "moderated",
    automationId: ytAutomationIds[1],
    automationName: ytAutomations[1].name,
    matchedKeyword: "example.com/spam",
    commentText: "Besplatni pratioci na example.com/spam",
    repliedAt: now - 189 * 60_000,
  }),
  ytLog(3, 640, {
    status: "failed",
    commentText: "Koliko košta farbanje?",
    attempts: 3,
    errorMessage: "YouTube je odbio odgovor (test greška).",
  }),
  ytLog(4, 1500, {
    status: "skipped_quota",
    commentText: "Cena za šišanje i feniranje?",
    errorMessage: "Dnevna kvota je potrošena.",
  }),
  ytLog(5, 2600, {
    status: "skipped_no_match",
    matchedKeyword: null,
    commentText: "Sjajan video, hvala!",
  }),
  ytLog(6, 4100, {
    status: "deleted",
    commentText: "Komentar uklonjen iz kanala.",
    repliedAt: now - 4000 * 60_000,
    deletedAt: now - 3 * DAY,
  }),
];

function ytListLogs(args: Record<string, unknown>): R<typeof api.ytAutomationsApi.listCommentLogs> {
  const rows =
    typeof args.status === "string" ? ytLogs.filter((l) => l.status === args.status) : ytLogs;
  return typeof args.limit === "number" ? rows.slice(0, Math.max(1, args.limit)) : rows;
}

// Meka granica je 8 000, medijska 6 000; potrošeno 2 350 (50 jedinica po odgovoru).
const ytQuotaStatus: R<typeof api.ytAutomationsApi.quotaStatus> = {
  unitsUsed: 2350,
  unitsRemaining: 5650,
  repliesLeft: 113,
  softLimit: 8000,
};

const ytMediaQuota: R<typeof api.ytMedia.mediaQuotaStatus> = {
  unitsUsed: 2350,
  unitsRemaining: 3650,
  mediaLimit: 6000,
};

type YtJob = R<typeof api.ytMedia.recentJobs>[number];
type YtJobIn = Partial<YtJob> & Pick<YtJob, "_id" | "kind" | "status" | "unitsSpent" | "createdAt">;

const ytRecentJobs: R<typeof api.ytMedia.recentJobs> = ([
  {
    _id: "ytjob_test_1" as Id<"ytMediaJobs">,
    kind: "upload",
    videoId: "testVideo07A",
    title: "Nov video (privatan)",
    status: "done",
    unitsSpent: 0,
    createdAt: now - 3 * HOUR,
    finishedAt: now - 3 * HOUR + 140_000,
  },
  {
    _id: "ytjob_test_2" as Id<"ytMediaJobs">,
    kind: "thumbnail",
    videoId: "testVideo01A",
    title: ytVideos[0].title,
    status: "failed",
    unitsSpent: 50,
    errorMessage: "Sličica je veća od 2 MB (test greška).",
    createdAt: now - 1 * DAY,
    finishedAt: now - 1 * DAY + 4_000,
  },
  {
    _id: "ytjob_test_3" as Id<"ytMediaJobs">,
    kind: "metadata",
    videoId: "testVideo02A",
    title: ytVideos[1].title,
    status: "done",
    unitsSpent: 50,
    createdAt: now - 2 * DAY,
    finishedAt: now - 2 * DAY + 3_000,
  },
  {
    _id: "ytjob_test_4" as Id<"ytMediaJobs">,
    kind: "caption",
    videoId: "testVideo03A",
    title: ytVideos[2].title,
    status: "skipped_quota",
    unitsSpent: 0,
    errorMessage: "Medijska kvota za danas je potrošena.",
    createdAt: now - 3 * DAY,
    finishedAt: now - 3 * DAY + 1_000,
  },
  {
    _id: "ytjob_test_5" as Id<"ytMediaJobs">,
    kind: "upload",
    title: "Prekinut unos",
    status: "pending",
    unitsSpent: 0,
    createdAt: now - 5 * DAY,
  },
] satisfies YtJobIn[]).map(
  (job): YtJob => ({
    ...job,
    videoId: job.videoId,
    title: job.title,
    errorMessage: job.errorMessage,
    finishedAt: job.finishedAt,
  }),
);

const ytPlaylists: R<typeof api.ytPlaylists.playlists> = [
  { playlistId: "PLtestPlaylist0001", title: "Nega kose", itemCount: 7 },
  { playlistId: "PLtestPlaylist0002", title: "Pre i posle", itemCount: 12 },
  { playlistId: "PLtestPlaylist0003", title: "Shorts iz salona", itemCount: 4 },
];

const ytUploadStatus: R<typeof api.ytUpload.uploadStatus> = {
  uploadsUsed: 1,
  uploadsRemaining: 99,
  uploadLimit: 100,
  connected: true,
};

// ════════════════════════════════════════════════════════════════════════════
// Razrešavanje po imenu funkcije
// ════════════════════════════════════════════════════════════════════════════

export const FIXTURES_KANALI: Record<string, Fixture> = {
  // Facebook
  [fn(api.facebookStore.pageInfo)]: () => fbPageInfo,
  [fn(api.facebookStore.dailyHistory)]: (args) => (tekuciPeriod(args) ? fbDaily(args) : []),
  [fn(api.facebookStore.postsList)]: (args) =>
    typeof args.limit === "number" ? fbPosts.slice(0, Math.max(1, args.limit)) : fbPosts,
  [fn(api.facebookStore.setupInfo)]: () => fbSetupInfo,
  [fn(api.fbCommentsStore.filterCounts)]: () => fbFilterCounts,
  [fn(api.fbCommentsStore.listThreads)]: (args) => fbListThreads(args),

  // Threads
  [fn(api.threadsStore.accountOverview)]: (args) => thOverview(args),
  [fn(api.threadsStore.followerHistory)]: (args) => thFollowerHistory(args),
  [fn(api.threadsStore.mediaList)]: (args) =>
    typeof args.limit === "number" ? thMedia.slice(0, Math.max(1, args.limit)) : thMedia,
  [fn(api.threadsStore.demographicsSummary)]: () => thDemographics,
  [fn(api.threadsStore.setupInfo)]: () => thSetupInfo,
  [fn(api.threadsFunnels.getThreadsLinkAttributionSummary)]: () => thAttribution,
  [fn(api.threadsFunnels.listUnmatchedUrls)]: () => thUnmatchedUrls,
  [fn(api.threadsAutomations.listAutomations)]: () => thAutomations,
  [fn(api.threadsAutomations.listAutomationLogs)]: (args) =>
    typeof args.automationId === "string"
      ? thLogs.filter((l) => l.automationId === args.automationId)
      : thLogs,
  [fn(api.threadsPublishStore.listJobs)]: () => thJobs,
  [fn(api.threadsSearch.getSearchQuotaInfo)]: () => thSearchQuota,
  [fn(api.threadsReplies.listRepliesForPost)]: () => thReplies,

  // YouTube
  [fn(api.youtubeStore.dailyTotals)]: (args) => (tekuciPeriod(args) ? ytDaily(args) : []),
  [fn(api.youtubeStore.trafficSources)]: (args) => (tekuciPeriod(args) ? ytTraffic : []),
  [fn(api.youtubeStore.videos)]: (args) =>
    typeof args.limit === "number" ? ytVideos.slice(0, Math.max(1, args.limit)) : ytVideos,
  [fn(api.youtubeStore.setupInfo)]: () => ytSetupInfo,
  [fn(api.ytAutomationsApi.listAutomations)]: () => ytAutomations,
  [fn(api.ytAutomationsApi.listCommentLogs)]: (args) => ytListLogs(args),
  [fn(api.ytAutomationsApi.quotaStatus)]: () => ytQuotaStatus,
  [fn(api.ytMedia.mediaQuotaStatus)]: () => ytMediaQuota,
  [fn(api.ytMedia.recentJobs)]: () => ytRecentJobs,
  [fn(api.ytPlaylists.playlists)]: () => ytPlaylists,
  [fn(api.ytUpload.uploadStatus)]: () => ytUploadStatus,

  // Instagram: dnevna dozvola objava kompozera. To je akcija; lažni klijent
  // i akcije razrešava po imenu, pa kompozer ima šta da nacrta.
  [fn(api.instagramPublish.publishingLimit)]: () =>
    ({ connected: true, used: 3, total: 100 }) satisfies FunctionReturnType<
      typeof api.instagramPublish.publishingLimit
    >,
};

// ════════════════════════════════════════════════════════════════════════════
// Prazan nalog: ono što backend vraća za nepovezan kanal
// ════════════════════════════════════════════════════════════════════════════

export const PRAZNO_KANALI: Record<string, Fixture> = {
  // Instagram bez veze: kompozer pokazuje da nalog nije povezan.
  [fn(api.instagramPublish.publishingLimit)]: () =>
    ({ connected: false, used: 0, total: 0 }) satisfies FunctionReturnType<
      typeof api.instagramPublish.publishingLimit
    >,

  // Facebook: bez povezane stranice pageInfo je null, a liste su prazne.
  [fn(api.facebookStore.pageInfo)]: () => null satisfies R<typeof api.facebookStore.pageInfo>,
  [fn(api.facebookStore.dailyHistory)]: () => [],
  [fn(api.facebookStore.postsList)]: () => [],
  [fn(api.facebookStore.setupInfo)]: () => ({
    webhookUrl: null,
    appConfigured: false,
    verifyTokenSet: false,
    appSecretSet: false,
  }) satisfies R<typeof api.facebookStore.setupInfo>,
  [fn(api.fbCommentsStore.filterCounts)]: () => ({
    all: 0,
    unanswered: 0,
    hidden: 0,
    deleted: 0,
    cap: 100,
  }) satisfies R<typeof api.fbCommentsStore.filterCounts>,
  [fn(api.fbCommentsStore.listThreads)]: () => [],

  // Threads: ekran se zaustavlja na `overview.connected === false`.
  [fn(api.threadsStore.accountOverview)]: () => ({
    connected: false,
    username: null,
    status: null,
    lastSync: null,
    views: null,
    dailyViews: [],
    followersCount: null,
    clicks: null,
    replies: null,
    quotes: null,
    reposts: null,
    likes: null,
    totalsFetchedAt: null,
  }) satisfies R<typeof api.threadsStore.accountOverview>,
  [fn(api.threadsStore.followerHistory)]: () => [],
  [fn(api.threadsStore.mediaList)]: () => [],
  [fn(api.threadsStore.demographicsSummary)]: () => ({
    state: "empty",
    reason: "Nema zabeleženih demografskih podataka za Threads nalog.",
    date: null,
    takenAt: null,
    ageGender: [],
    countries: [],
    cities: [],
  }) satisfies R<typeof api.threadsStore.demographicsSummary>,
  [fn(api.threadsStore.setupInfo)]: () => ({ isConfigured: false }) satisfies R<
    typeof api.threadsStore.setupInfo
  >,
  [fn(api.threadsFunnels.getThreadsLinkAttributionSummary)]: () => ({
    matchedLinks: [],
    unmatchedSummary: {
      unmatchedCount: 0,
      unmatchedTotalThreadsClicks: undefined,
      unmatchedUrls: [],
    },
  }) satisfies R<typeof api.threadsFunnels.getThreadsLinkAttributionSummary>,
  [fn(api.threadsFunnels.listUnmatchedUrls)]: () => [],
  [fn(api.threadsAutomations.listAutomations)]: () => [],
  [fn(api.threadsAutomations.listAutomationLogs)]: () => [],
  [fn(api.threadsPublishStore.listJobs)]: () => [],
  [fn(api.threadsSearch.getSearchQuotaInfo)]: () => ({
    keywordSearch: { used: 0, total: 2200 },
    profileLookup: { used: 0, total: 1000 },
  }) satisfies R<typeof api.threadsSearch.getSearchQuotaInfo>,
  [fn(api.threadsReplies.listRepliesForPost)]: () => [],

  // YouTube: ekran gleda `connections.list` (rešava pozivalac); ostalo je prazno.
  [fn(api.youtubeStore.dailyTotals)]: () => [],
  [fn(api.youtubeStore.trafficSources)]: () => [],
  [fn(api.youtubeStore.videos)]: () => [],
  [fn(api.youtubeStore.setupInfo)]: () => ({ isConfigured: false }) satisfies R<
    typeof api.youtubeStore.setupInfo
  >,
  [fn(api.ytAutomationsApi.listAutomations)]: () => [],
  [fn(api.ytAutomationsApi.listCommentLogs)]: () => [],
  [fn(api.ytAutomationsApi.quotaStatus)]: () => ({
    unitsUsed: 0,
    unitsRemaining: 8000,
    repliesLeft: 160,
    softLimit: 8000,
  }) satisfies R<typeof api.ytAutomationsApi.quotaStatus>,
  [fn(api.ytMedia.mediaQuotaStatus)]: () => ({
    unitsUsed: 0,
    unitsRemaining: 6000,
    mediaLimit: 6000,
  }) satisfies R<typeof api.ytMedia.mediaQuotaStatus>,
  [fn(api.ytMedia.recentJobs)]: () => [],
  [fn(api.ytPlaylists.playlists)]: () => [],
  [fn(api.ytUpload.uploadStatus)]: () => ({
    uploadsUsed: 0,
    uploadsRemaining: 100,
    uploadLimit: 100,
    connected: false,
  }) satisfies R<typeof api.ytUpload.uploadStatus>,
};
