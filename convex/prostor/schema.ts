// Preneto iz Devotion packages/backend/convex/schema.ts (main @ c05c40f), SPAJANJE S02.
import { defineTable } from "convex/server";
import { v } from "convex/values";
import {
  chatAnchorTypeValidator,
  chatChannelKindValidator,
  chatMemberRoleValidator,
  chatMessageKindValidator,
  chatNotificationLevelValidator,
  checkpointItemValidator,
  ideaStageValidator,
  notificationTargetTypeValidator,
  notificationTypeValidator,
  pageFileCategoryValidator,
  pageKindValidator,
  taskCheckpointCanvasEndpointValidator,
  taskPriorityValidator,
  taskStatusValidator,
  trashStateValidator,
} from "./lib/validators";

/** Devotion uloga profila; ostaje u šemi, uvek `"member"`, ne čita se (P7). */
const role = v.union(v.literal("admin"), v.literal("member"));
const areaKey = v.string();
const thoughtColor = v.union(
  v.literal("neutral"),
  v.literal("violet"),
  v.literal("blue"),
  v.literal("green"),
  v.literal("amber"),
  v.literal("rose"),
);

/**
 * Tabele radnog dela (SPAJANJE, plan S01 §2). Šire se u `convex/schema.ts`
 * odmah posle auth tabela. Projekat je `workspaceId` (P5); lični redovi imaju
 * `| null`. Odluke o brisanju su u `convex/lib/purgeMap.ts`.
 */
export const prostorTabele = {
  profiles: defineTable({
    userId: v.id("users"),
    displayName: v.string(),
    email: v.string(),
    role,
    avatarStorageId: v.optional(v.id("_storage")),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_avatarStorageId", ["avatarStorageId"])
    .index("by_role_and_archivedAt", ["role", "archivedAt"]),

  avatarUploads: defineTable({
    profileId: v.id("profiles"),
    tokenHash: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_profileId_and_createdAt", ["profileId", "createdAt"]),

  areas: defineTable({
    workspaceId: v.id("workspaces"),
    key: areaKey,
    label: v.string(),
    position: v.number(),
    createdAt: v.number(),
  })
    .index("by_workspaceId_and_key", ["workspaceId", "key"])
    .index("by_workspaceId_and_position", ["workspaceId", "position"]),

  thoughtCanvases: defineTable({
    workspaceId: v.id("workspaces"),
    ownerProfileId: v.id("profiles"),
    x: v.number(),
    y: v.number(),
    zoom: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_ownerProfileId_and_workspaceId", [
    "ownerProfileId",
    "workspaceId",
  ])
    // Svaka tabela sa projektom ima indeks koji počinje projektom (S01 §2.3).
    .index("by_workspaceId", ["workspaceId"]),

  thoughtNodes: defineTable({
    // PROSTOR P7: `null` = lična beleška van startupa (vidi je samo vlasnik,
    // nema Mapu). Mapa (`thoughtCanvases`) postoji samo po startupu.
    workspaceId: v.union(v.id("workspaces"), v.null()),
    ownerProfileId: v.id("profiles"),
    title: v.union(v.string(), v.null()),
    text: v.string(),
    // Denormalizovan title+text za full-text pretragu (search_thoughts). Održava se
    // na svakom upisu preko nodeSearchText (ideas/thoughts mutacije + backfill).
    // EXPAND faza: opcionalno dok backfill ne popuni stare redove. Narrow (→ v.string())
    // tek kada verifySearchTextBackfill vrati remaining 0 — vidi docs/mobile/ZA-POPRAVKU.md.
    searchText: v.optional(v.string()),
    x: v.number(),
    y: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    parentThoughtId: v.optional(v.id("thoughtNodes")),
    color: thoughtColor,
    isParent: v.optional(v.boolean()),
    conversionCount: v.number(),
    lastConvertedIdeaId: v.optional(v.id("ideaNodes")),
    lastConvertedPageId: v.union(v.id("pages"), v.null()),
    lastConvertedAt: v.union(v.number(), v.null()),
    // Poruka iz koje je misao nastala (chat „Pretvori u…", 04-CHAT.md 5c).
    sourceMessageId: v.optional(v.id("chatMessages")),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index(
      "by_ownerProfileId_and_workspaceId_and_archivedAt_and_updatedAt",
      ["ownerProfileId", "workspaceId", "archivedAt", "updatedAt"],
    )
    // Beleške u „Ja" (PROSTOR P7): moje beleške kroz sve startupe i lične.
    .index("by_ownerProfileId_and_archivedAt_and_updatedAt", [
      "ownerProfileId",
      "archivedAt",
      "updatedAt",
    ])
    .index("by_parentThoughtId_and_archivedAt", [
      "parentThoughtId",
      "archivedAt",
    ])
    // AUTHZ: misli su PRIVATNE po vlasniku — thoughts.listNodes filtrira po
    // .eq("ownerProfileId", profile._id). Zato ownerProfileId MORA biti
    // filterField i upit ga MORA .eq-ovati; filter samo po startupId bi curio
    // tuđe privatne misli iz istog startupa. Provereno: search.ideasAndThoughts.
    .searchIndex("search_thoughts", {
      searchField: "searchText",
      filterFields: ["ownerProfileId", "workspaceId", "archivedAt"],
    })
    // Svaka tabela sa projektom ima indeks koji počinje projektom (S01 §2.3).
    .index("by_workspaceId", ["workspaceId"]),

  thoughtEdges: defineTable({
    // PROSTOR P7: isti `startupId` kao njene dve beleške (`null` = lične).
    workspaceId: v.union(v.id("workspaces"), v.null()),
    ownerProfileId: v.id("profiles"),
    nodeAId: v.id("thoughtNodes"),
    nodeBId: v.id("thoughtNodes"),
    pairKey: v.string(),
    label: v.union(v.string(), v.null()),
    archivedAt: v.union(v.number(), v.null()),
    // Only edges hidden as a consequence of archiving nodes carry these
    // markers. A manually archived edge keeps them empty and stays archived
    // when either endpoint is restored later.
    archivedByNode: v.optional(v.boolean()),
    archivedForNodeIds: v.optional(v.array(v.id("thoughtNodes"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_ownerProfileId_and_workspaceId_and_pairKey", [
      "ownerProfileId",
      "workspaceId",
      "pairKey",
    ])
    .index(
      "by_ownerProfileId_and_workspaceId_and_archivedAt_and_updatedAt",
      ["ownerProfileId", "workspaceId", "archivedAt", "updatedAt"],
    )
    .index(
      "by_ownerProfileId_and_workspaceId_and_nodeAId_and_archivedAt",
      ["ownerProfileId", "workspaceId", "nodeAId", "archivedAt"],
    )
    .index(
      "by_ownerProfileId_and_workspaceId_and_nodeBId_and_archivedAt",
      ["ownerProfileId", "workspaceId", "nodeBId", "archivedAt"],
    )
    .index(
      "by_ownerProfileId_and_workspaceId_and_nodeAId_and_archivedByNode",
      ["ownerProfileId", "workspaceId", "nodeAId", "archivedByNode"],
    )
    .index(
      "by_ownerProfileId_and_workspaceId_and_nodeBId_and_archivedByNode",
      ["ownerProfileId", "workspaceId", "nodeBId", "archivedByNode"],
    )
    // Svaka tabela sa projektom ima indeks koji počinje projektom (S01 §2.3).
    .index("by_workspaceId", ["workspaceId"]),

  pageBodies: defineTable({
    pageId: v.id("pages"),
    content: v.string(),
    updatedAt: v.number(),
  }).index("by_pageId", ["pageId"]),

  pages: defineTable({
    workspaceId: v.id("workspaces"),
    areaId: v.id("areas"),
    parentPageId: v.union(v.id("pages"), v.null()),
    kind: pageKindValidator,
    title: v.string(),
    searchText: v.string(),
    revision: v.number(),
    treeRevision: v.optional(v.number()),
    canvasPreview: v.optional(v.string()),
    position: v.number(),
    taskStatus: v.union(taskStatusValidator, v.null()),
    taskPriority: v.union(taskPriorityValidator, v.null()),
    // Deprecated projekcija prvog izvršioca. `taskAssignees` je kanonski izvor;
    // ovo polje postoji da bi indeksi po izvršiocu i `pageSummaryValidator`
    // ostali upotrebljivi.
    assigneeProfileId: v.union(v.id("profiles"), v.null()),
    dueDate: v.union(v.number(), v.null()),
    instructions: v.optional(v.string()),
    // Deprecated rollback projection. taskCheckpoints is the canonical source.
    checkpoints: v.optional(v.array(checkpointItemValidator)),
    checkpointTotal: v.optional(v.number()),
    checkpointCompleted: v.optional(v.number()),
    checkpointRevision: v.optional(v.number()),
    // Sažeci za `file` i `table` kartice, da kanvas ne mora da čita priloge i
    // redove svake kartice posebno.
    fileCount: v.optional(v.number()),
    filePreviewStorageId: v.optional(v.id("_storage")),
    filePrimaryCategory: v.optional(pageFileCategoryValidator),
    tableRowCount: v.optional(v.number()),
    tableColumnCount: v.optional(v.number()),
    taskSortAt: v.number(),
    // Trenutak prelaska u „Gotovo”. `updatedAt` nije upotrebljiv kao izvor jer
    // svaka kasnija izmena završenog zadatka pomera nedelju u kojoj je završen.
    completedAt: v.optional(v.union(v.number(), v.null())),
    // Poruka iz koje je zadatak/beleška nastao (chat „Pretvori u…", 04-CHAT.md
    // 5c). Bez indeksa u v1: skok je entitet→poruka; obrnuti smer ide preko
    // sistemske poruke u kanalu, ne upitom.
    sourceMessageId: v.optional(v.id("chatMessages")),
    /** P19: firma iz Leadova na koju se zadatak odnosi (S23). */
    leadCompanyId: v.optional(v.id("leadCompanies")),
    createdByProfileId: v.id("profiles"),
    updatedByProfileId: v.id("profiles"),
    // Zaključavanje (PROSTOR P1): naslov, sadržaj, osobine, premeštanje i
    // brisanje zaključane stranice menjaju samo autor, vlasnik startupa i admin.
    // Odsutno ili `null` = otključana.
    lockedAt: v.optional(v.union(v.number(), v.null())),
    lockedByProfileId: v.optional(v.union(v.id("profiles"), v.null())),
    // Korpa (PROSTOR P3): ko je obrisao, i da li je stranica koren poteza
    // (`root`, vidi se u Korpi) ili podstranica obrisana istim potezom
    // (`descendant` + `archivedWithPageId`). Vraćanje briše sva četiri polja.
    archivedByProfileId: v.optional(v.id("profiles")),
    trashState: v.optional(trashStateValidator),
    archivedWithPageId: v.optional(v.id("pages")),
    trashDescendantCount: v.optional(v.number()),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspaceId_and_trashState_and_archivedAt", [
      "workspaceId",
      "trashState",
      "archivedAt",
    ])
    .index("by_areaId_and_kind_and_parentPageId_and_archivedAt_and_position", [
      "areaId",
      "kind",
      "parentPageId",
      "archivedAt",
      "position",
    ])
    .index("by_areaId_and_parentPageId_and_archivedAt_and_position", [
      "areaId",
      "parentPageId",
      "archivedAt",
      "position",
    ])
    .index("by_workspace_area_parent_active_position", [
      "workspaceId",
      "areaId",
      "parentPageId",
      "archivedAt",
      "position",
    ])
    .index("by_parentPageId_and_archivedAt", ["parentPageId", "archivedAt"])
    .index("by_workspaceId_and_kind_and_archivedAt", [
      "workspaceId",
      "kind",
      "archivedAt",
    ])
    .index("by_workspace_kind_active_sort", [
      "workspaceId",
      "kind",
      "archivedAt",
      "taskSortAt",
    ])
    .index("by_workspaceId_and_kind_and_taskStatus_and_archivedAt", [
      "workspaceId",
      "kind",
      "taskStatus",
      "archivedAt",
    ])
    .index("by_workspace_status_active_sort", [
      "workspaceId",
      "kind",
      "taskStatus",
      "archivedAt",
      "taskSortAt",
    ])
    .index("by_assigneeProfileId_and_kind_and_archivedAt", [
      "assigneeProfileId",
      "kind",
      "archivedAt",
    ])
    .index("by_assigneeProfileId_and_kind_and_taskStatus_and_archivedAt", [
      "assigneeProfileId",
      "kind",
      "taskStatus",
      "archivedAt",
    ])
    .index("by_workspaceId_and_assigneeProfileId_and_archivedAt", [
      "workspaceId",
      "assigneeProfileId",
      "archivedAt",
    ])
    .index("by_workspace_assignee_active_sort", [
      "workspaceId",
      "assigneeProfileId",
      "archivedAt",
      "taskSortAt",
    ])
    .index(
      "by_workspace_and_assigneeProfileId_and_taskStatus_and_archivedAt",
      [
        "workspaceId",
        "assigneeProfileId",
        "taskStatus",
        "archivedAt",
      ],
    )
    .index(
      "by_workspace_assignee_status_sort",
      [
        "workspaceId",
        "assigneeProfileId",
        "taskStatus",
        "archivedAt",
        "taskSortAt",
      ],
    )
    .index("by_workspaceId_and_archivedAt_and_updatedAt", [
      "workspaceId",
      "archivedAt",
      "updatedAt",
    ])
    .index("by_areaId_and_kind_and_archivedAt_and_updatedAt", [
      "areaId",
      "kind",
      "archivedAt",
      "updatedAt",
    ])
    .index("by_workspace_area_kind_active_updated", [
      "workspaceId",
      "areaId",
      "kind",
      "archivedAt",
      "updatedAt",
    ])
    // P19: zadaci firme iz Leadova, uvek u okviru projekta.
    .index("by_workspaceId_and_leadCompanyId_and_archivedAt", [
      "workspaceId",
      "leadCompanyId",
      "archivedAt",
    ])
    .searchIndex("search_title_and_content", {
      searchField: "searchText",
      filterFields: ["workspaceId", "kind", "archivedAt"],
    }),

  taskCheckpoints: defineTable({
    workspaceId: v.id("workspaces"),
    areaId: v.id("areas"),
    taskPageId: v.id("pages"),
    legacyId: v.string(),
    text: v.string(),
    completed: v.boolean(),
    position: v.number(),
    // Vezan korak se ne može završiti dok prethodni nije gotov. `undefined` je
    // isto što i `false` — zapisi od pre uvođenja lanca ostaju slobodni.
    chainedToPrevious: v.optional(v.boolean()),
    createdByProfileId: v.id("profiles"),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_taskPageId_and_archivedAt_and_position", [
      "taskPageId",
      "archivedAt",
      "position",
    ])
    .index("by_taskPageId_and_legacyId", ["taskPageId", "legacyId"])
    // Svaka tabela sa projektom ima indeks koji počinje projektom (S01 §2.3).
    .index("by_workspaceId", ["workspaceId"]),

  // Kanonski spisak izvršilaca zadatka. `pages.assigneeProfileId` je samo
  // projekcija prvog reda odavde — postoji da bi postojeći indeksi i wire
  // ugovori nastavili da rade, isto kao `pages.checkpoints` uz `taskCheckpoints`.
  // Kolone su ograničene (64) pa staju u jedan dokument; redovi su
  // neograničeni pa idu u zasebnu tabelu, po pravilu iz Convex guidelines.
  pageTableColumns: defineTable({
    workspaceId: v.id("workspaces"),
    areaId: v.id("areas"),
    pageId: v.id("pages"),
    columns: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        width: v.optional(v.number()),
      }),
    ),
    revision: v.number(),
    updatedByProfileId: v.id("profiles"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_pageId", ["pageId"])
    // Svaka tabela sa projektom ima indeks koji počinje projektom (S01 §2.3).
    .index("by_workspaceId", ["workspaceId"]),

  pageTableRows: defineTable({
    workspaceId: v.id("workspaces"),
    areaId: v.id("areas"),
    pageId: v.id("pages"),
    rowKey: v.string(),
    position: v.number(),
    // `columnId -> tekst`. Ceo red je jedan dokument, pa izmena jedne ćelije
    // prepisuje samo taj red.
    cells: v.record(v.string(), v.string()),
    updatedByProfileId: v.id("profiles"),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_pageId_and_archivedAt_and_position", [
      "pageId",
      "archivedAt",
      "position",
    ])
    .index("by_pageId_and_rowKey", ["pageId", "rowKey"])
    // Svaka tabela sa projektom ima indeks koji počinje projektom (S01 §2.3).
    .index("by_workspaceId", ["workspaceId"]),

  // Prilozi „fajl” oblačića. Jedan oblačić drži više fajlova; kategorija se
  // izvodi iz `contentType` na serveru, klijent je ne bira.
  pageFiles: defineTable({
    workspaceId: v.id("workspaces"),
    areaId: v.id("areas"),
    pageId: v.id("pages"),
    storageId: v.id("_storage"),
    name: v.string(),
    contentType: v.string(),
    size: v.number(),
    category: pageFileCategoryValidator,
    position: v.number(),
    uploadedByProfileId: v.id("profiles"),
    // Korpa (PROSTOR P3/P19): uklonjen prilog je `root` u Korpi; blob ostaje.
    // Prilog koji je `prune` sklonio iz beleške ima `archivedAt` bez
    // `trashState` (nije u Korpi, vraća ga „Vrati ovu verziju").
    archivedByProfileId: v.optional(v.id("profiles")),
    trashState: v.optional(trashStateValidator),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_pageId_and_archivedAt_and_position", [
      "pageId",
      "archivedAt",
      "position",
    ])
    .index("by_workspaceId_and_trashState_and_archivedAt", [
      "workspaceId",
      "trashState",
      "archivedAt",
    ])
    .index("by_storageId", ["storageId"]),

  pageFileUploads: defineTable({
    pageId: v.id("pages"),
    profileId: v.id("profiles"),
    tokenHash: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_profileId_and_createdAt", ["profileId", "createdAt"]),

  taskAssignees: defineTable({
    workspaceId: v.id("workspaces"),
    taskPageId: v.id("pages"),
    profileId: v.id("profiles"),
    // Ogledala sa `pages`, da lista „Moji zadaci” može da se sortira i filtrira
    // bez čitanja svake stranice. Osvežavaju se u istoj mutaciji kao i zadatak.
    taskStatus: v.union(taskStatusValidator, v.null()),
    taskSortAt: v.number(),
    addedByProfileId: v.id("profiles"),
    // Samo skidanje sa zadatka. Arhiviranje same stranice se namerno ne ogleda
    // ovde — grana može imati 250 stranica, pa bi to probilo transakciju.
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_task_active_created", [
      "taskPageId",
      "archivedAt",
      "createdAt",
    ])
    .index("by_task_and_profile", ["taskPageId", "profileId"])
    .index("by_profile_active_sort", [
      "profileId",
      "archivedAt",
      "taskSortAt",
    ])
    .index("by_profile_status_active_sort", [
      "profileId",
      "taskStatus",
      "archivedAt",
      "taskSortAt",
    ])
    .index("by_workspace_profile_active_sort", [
      "workspaceId",
      "profileId",
      "archivedAt",
      "taskSortAt",
    ])
    .index("by_workspace_profile_status_active_sort", [
      "workspaceId",
      "profileId",
      "taskStatus",
      "archivedAt",
      "taskSortAt",
    ])
    // „Završeno od" za lični nivo (Moj dan, Moji zadaci svuda). `updatedAt` se
    // osvežava pri svakoj promeni statusa kroz `syncTaskAssigneeMirrors`.
    .index("by_profile_status_active_updated", [
      "profileId",
      "taskStatus",
      "archivedAt",
      "updatedAt",
    ]),

  // --- Lični nivo „Ja" (docs/LICNO-PLAN.md §4.1–4.2) -----------------------
  //
  // Privatne obaveze van startupa: vidi ih i menja ISKLJUČIVO vlasnik. Brisanje
  // je arhiva (`archivedAt`), da bi „Poništi" mogao da vrati zadatak.
  personalTasks: defineTable({
    profileId: v.id("profiles"),
    title: v.string(),
    // Odsutno = bez beleške (prazna beleška se ne čuva).
    notes: v.optional(v.string()),
    status: v.union(v.literal("open"), v.literal("done")),
    priority: v.union(taskPriorityValidator, v.null()),
    // Lokalno podne (ms), kao rok startup zadatka.
    dueDate: v.union(v.number(), v.null()),
    // Rok, ili za zadatak bez roka `8e15 − createdAt` (najnoviji prvi posle
    // zadataka sa rokom). `createdAt`, ne `updatedAt`, da redosled bude stabilan.
    sortAt: v.number(),
    completedAt: v.union(v.number(), v.null()),
    archivedAt: v.union(v.number(), v.null()),
    // Trag posle `moveToStartup`: zadatak je postao ova stranica.
    movedToPageId: v.optional(v.id("pages")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_profile_status_archived_sort", [
      "profileId",
      "status",
      "archivedAt",
      "sortAt",
    ])
    .index("by_profile_status_archived_completed", [
      "profileId",
      "status",
      "archivedAt",
      "completedAt",
    ]),

  // Plan dana: stavka je referenca na startup zadatak ILI lični zadatak, za
  // lokalni dan uređaja (`dayKey` = "YYYY-MM-DD"). Isti `refKey` najviše jednom
  // po danu; cilj koji više nije dostupan se tiho preskače pri čitanju.
  myDayEntries: defineTable({
    profileId: v.id("profiles"),
    dayKey: v.string(),
    refKind: v.union(v.literal("task"), v.literal("personal")),
    taskPageId: v.union(v.id("pages"), v.null()),
    personalTaskId: v.union(v.id("personalTasks"), v.null()),
    // "task:<id>" | "personal:<id>"
    refKey: v.string(),
    position: v.number(),
    createdAt: v.number(),
  })
    .index("by_profile_day_position", ["profileId", "dayKey", "position"])
    .index("by_profile_ref", ["profileId", "refKey", "dayKey"]),

  taskCheckpointCanvasPlacements: defineTable({
    workspaceId: v.id("workspaces"),
    areaId: v.id("areas"),
    canvasRootPageId: v.union(v.id("pages"), v.null()),
    checkpointId: v.id("taskCheckpoints"),
    x: v.number(),
    y: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    updatedByProfileId: v.id("profiles"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_checkpointId_and_canvasRootPageId", [
      "checkpointId",
      "canvasRootPageId",
    ])
    .index("by_workspaceId_and_areaId_and_canvasRootPageId", [
      "workspaceId",
      "areaId",
      "canvasRootPageId",
    ]),

  taskCheckpointCanvasEdges: defineTable({
    workspaceId: v.id("workspaces"),
    areaId: v.id("areas"),
    rootPageId: v.union(v.id("pages"), v.null()),
    endpointA: taskCheckpointCanvasEndpointValidator,
    endpointB: taskCheckpointCanvasEndpointValidator,
    endpointAKey: v.string(),
    endpointBKey: v.string(),
    endpointAPageId: v.id("pages"),
    endpointBPageId: v.id("pages"),
    pairKey: v.string(),
    authorProfileId: v.id("profiles"),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_scope_active_pair", [
      "workspaceId",
      "areaId",
      "rootPageId",
      "archivedAt",
      "pairKey",
    ])
    .index("by_endpointAKey_and_archivedAt", [
      "endpointAKey",
      "archivedAt",
    ])
    .index("by_endpointBKey_and_archivedAt", [
      "endpointBKey",
      "archivedAt",
    ])
    .index("by_endpointAPageId_and_archivedAt", [
      "endpointAPageId",
      "archivedAt",
    ])
    .index("by_endpointBPageId_and_archivedAt", [
      "endpointBPageId",
      "archivedAt",
    ]),

  ideaCanvases: defineTable({
    workspaceId: v.id("workspaces"),
    ownerProfileId: v.id("profiles"),
    x: v.number(),
    y: v.number(),
    zoom: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_ownerProfileId_and_workspaceId", [
    "ownerProfileId",
    "workspaceId",
  ])
    // Svaka tabela sa projektom ima indeks koji počinje projektom (S01 §2.3).
    .index("by_workspaceId", ["workspaceId"]),

  ideaNodes: defineTable({
    workspaceId: v.id("workspaces"),
    authorProfileId: v.id("profiles"),
    title: v.union(v.string(), v.null()),
    text: v.string(),
    // Denormalizovan title+text za full-text pretragu (search_ideas). Održava se
    // na svakom upisu preko nodeSearchText (ideas/thoughts mutacije + backfill).
    // EXPAND faza: opcionalno dok backfill ne popuni stare redove. Narrow (→ v.string())
    // tek kada verifySearchTextBackfill vrati remaining 0 — vidi docs/mobile/ZA-POPRAVKU.md.
    searchText: v.optional(v.string()),
    x: v.number(),
    y: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    parentIdeaId: v.optional(v.id("ideaNodes")),
    color: thoughtColor,
    isParent: v.optional(v.boolean()),
    convertedPageId: v.union(v.id("pages"), v.null()),
    convertedAt: v.union(v.number(), v.null()),
    // Poruka iz koje je ideja nastala (chat „Pretvori u…", 04-CHAT.md 5c).
    sourceMessageId: v.optional(v.id("chatMessages")),
    // Korpa (PROSTOR P3): obrisana ideja je uvek `root`.
    archivedByProfileId: v.optional(v.id("profiles")),
    trashState: v.optional(trashStateValidator),
    // Faza (PROSTOR P6): odsutno = `predlog`; menjaju je autor, vlasnik
    // startupa i admin (`ideas.setStage`).
    stage: v.optional(ideaStageValidator),
    stageChangedAt: v.optional(v.number()),
    stageChangedByProfileId: v.optional(v.id("profiles")),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspaceId_and_archivedAt_and_updatedAt", [
      "workspaceId",
      "archivedAt",
      "updatedAt",
    ])
    .index("by_workspaceId_and_trashState_and_archivedAt", [
      "workspaceId",
      "trashState",
      "archivedAt",
    ])
    // „Čeka tebe" (PROSTOR P22): ideje u fazi „Razmatra se", najnovije prvo.
    .index("by_workspaceId_and_stage_and_archivedAt_and_stageChangedAt", [
      "workspaceId",
      "stage",
      "archivedAt",
      "stageChangedAt",
    ])
    .index("by_parentIdeaId_and_archivedAt", [
      "parentIdeaId",
      "archivedAt",
    ])
    // Ideje su zajedničke celoj ekipi (ideas.list filtrira samo po startupId),
    // pa je filter po startupId dovoljan — za razliku od misli.
    .searchIndex("search_ideas", {
      searchField: "searchText",
      filterFields: ["workspaceId", "archivedAt"],
    }),

  ideaVotes: defineTable({
    workspaceId: v.id("workspaces"),
    ideaId: v.id("ideaNodes"),
    profileId: v.id("profiles"),
    voteType: v.union(v.literal("up"), v.literal("down")),
    createdAt: v.number(),
  })
    .index("by_ideaId_and_profileId", ["ideaId", "profileId"])
    .index("by_ideaId", ["ideaId"])
    .index("by_workspaceId", ["workspaceId"]),

  ideaEdges: defineTable({
    workspaceId: v.id("workspaces"),
    authorProfileId: v.id("profiles"),
    nodeAId: v.id("ideaNodes"),
    nodeBId: v.id("ideaNodes"),
    pairKey: v.string(),
    label: v.union(v.string(), v.null()),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspaceId_and_pairKey", ["workspaceId", "pairKey"])
    .index("by_workspaceId_and_archivedAt", ["workspaceId", "archivedAt"]),

  pageEntries: defineTable({
    pageId: v.id("pages"),
    authorProfileId: v.id("profiles"),
    content: v.string(),
    position: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_pageId_and_position", ["pageId", "position"]),

  pageEdges: defineTable({
    workspaceId: v.id("workspaces"),
    areaId: v.id("areas"),
    nodeAId: v.id("pages"),
    nodeBId: v.id("pages"),
    pairKey: v.string(),
    label: v.union(v.string(), v.null()),
    authorProfileId: v.optional(v.id("profiles")),
    archivedAt: v.optional(v.union(v.number(), v.null())),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_areaId_and_pairKey", ["areaId", "pairKey"])
    .index("by_areaId", ["areaId"])
    // Svaka tabela sa projektom ima indeks koji počinje projektom (S01 §2.3).
    .index("by_workspaceId", ["workspaceId"]),

  contentContributions: defineTable({
    workspaceId: v.id("workspaces"),
    targetKind: v.union(
      v.literal("idea"),
      v.literal("page"),
      v.literal("area"),
      v.literal("task_checkpoint"),
      v.literal("recovered"),
    ),
    targetKey: v.string(),
    targetId: v.string(),
    authorProfileId: v.optional(v.id("profiles")),
    attribution: v.union(v.literal("author"), v.literal("legacy_neutral")),
    content: v.string(),
    sourceKind: v.optional(
      v.union(
        v.literal("idea_original"),
        v.literal("page_entry"),
        v.literal("page_body"),
      ),
    ),
    sourceId: v.optional(v.string()),
    moderationStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
      ),
    ),
    archivedAt: v.union(v.number(), v.null()),
    // PROSTOR (K04): komentar. Pomenuti aktivni članovi (≤ 20, bez autora i
    // duplikata — server filtrira) i trenutak poslednje izmene TEKSTA (odsutno =
    // nikad menjan; `updatedAt` se pomera i pri moderaciji i vraćanju).
    mentionProfileIds: v.optional(v.array(v.id("profiles"))),
    editedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_targetKey_and_archivedAt_and_createdAt", [
      "targetKey",
      "archivedAt",
      "createdAt",
    ])
    .index("by_authorProfileId_and_archivedAt_and_createdAt", [
      "authorProfileId",
      "archivedAt",
      "createdAt",
    ])
    .index("by_sourceKind_and_sourceId", ["sourceKind", "sourceId"])
    // Svaka tabela sa projektom ima indeks koji počinje projektom (S01 §2.3).
    .index("by_workspaceId", ["workspaceId"]),

  recoveredContent: defineTable({
    workspaceId: v.id("workspaces"),
    title: v.string(),
    sourceKind: v.union(v.literal("idea"), v.literal("page")),
    sourceTargetId: v.string(),
    createdByProfileId: v.id("profiles"),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_workspaceId_and_archivedAt_and_createdAt", [
    "workspaceId",
    "archivedAt",
    "createdAt",
  ]),

  deletionRequests: defineTable({
    workspaceId: v.id("workspaces"),
    targetKind: v.union(
      v.literal("idea"),
      v.literal("idea_edge"),
      v.literal("page"),
      v.literal("page_edge"),
      v.literal("page_relation"),
      v.literal("task_checkpoint_edge"),
      v.literal("task_checkpoint"),
      v.literal("contribution"),
      v.literal("recovered"),
    ),
    targetId: v.string(),
    targetTitle: v.string(),
    requesterProfileId: v.id("profiles"),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("withdrawn"),
      v.literal("cancelled"),
    ),
    eligibleCount: v.number(),
    approveCount: v.number(),
    rejectCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    resolvedAt: v.union(v.number(), v.null()),
  })
    .index("by_workspaceId_and_status_and_createdAt", [
      "workspaceId",
      "status",
      "createdAt",
    ])
    .index("by_targetKind_and_targetId_and_status", [
      "targetKind",
      "targetId",
      "status",
    ])
    .index("by_requesterProfileId_and_status_and_createdAt", [
      "requesterProfileId",
      "status",
      "createdAt",
    ]),

  deletionBallots: defineTable({
    requestId: v.id("deletionRequests"),
    workspaceId: v.id("workspaces"),
    profileId: v.id("profiles"),
    vote: v.union(
      v.literal("pending"),
      v.literal("approve"),
      v.literal("reject"),
      v.literal("excused"),
      // PROSTOR P4: glasanje je ugašeno; `migrations.closeLegacyRequests`
      // otvorene listiće zatvara ovom vrednošću.
      v.literal("cancelled"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_requestId_and_profileId", ["requestId", "profileId"])
    .index("by_profileId_and_vote_and_createdAt", [
      "profileId",
      "vote",
      "createdAt",
    ])
    // Svaka tabela sa projektom ima indeks koji počinje projektom (S01 §2.3).
    .index("by_workspaceId", ["workspaceId"]),

  nestingRequests: defineTable({
    workspaceId: v.id("workspaces"),
    childIdeaId: v.id("ideaNodes"),
    parentIdeaId: v.id("ideaNodes"),
    requesterProfileId: v.id("profiles"),
    parentAuthorProfileId: v.id("profiles"),
    proposedX: v.optional(v.number()),
    proposedY: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("withdrawn"),
      v.literal("cancelled"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    resolvedAt: v.union(v.number(), v.null()),
  })
    .index("by_parentAuthorProfileId_and_status_and_createdAt", [
      "parentAuthorProfileId",
      "status",
      "createdAt",
    ])
    .index("by_requesterProfileId_and_status_and_createdAt", [
      "requesterProfileId",
      "status",
      "createdAt",
    ])
    .index("by_childIdeaId_and_parentIdeaId_and_status", [
      "childIdeaId",
      "parentIdeaId",
      "status",
    ])
    .index("by_workspaceId_and_status_and_updatedAt", [
      "workspaceId",
      "status",
      "updatedAt",
    ]),

  pageCanvasNodes: defineTable({
    workspaceId: v.id("workspaces"),
    areaId: v.id("areas"),
    pageId: v.id("pages"),
    x: v.number(),
    y: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_pageId", ["pageId"])
    .index("by_areaId", ["areaId"])
    // Svaka tabela sa projektom ima indeks koji počinje projektom (S01 §2.3).
    .index("by_workspaceId", ["workspaceId"]),

  pageCanvases: defineTable({
    workspaceId: v.id("workspaces"),
    areaId: v.id("areas"),
    ownerProfileId: v.id("profiles"),
    kind: pageKindValidator,
    x: v.number(),
    y: v.number(),
    zoom: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_ownerProfileId_and_areaId_and_kind", [
    "ownerProfileId",
    "areaId",
    "kind",
  ])
    // Svaka tabela sa projektom ima indeks koji počinje projektom (S01 §2.3).
    .index("by_workspaceId", ["workspaceId"]),

  areaBodies: defineTable({
    workspaceId: v.id("workspaces"),
    areaId: v.id("areas"),
    ownerProfileId: v.id("profiles"),
    content: v.string(),
    revision: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_areaId", ["areaId"])
    .index("by_workspaceId_and_updatedAt", ["workspaceId", "updatedAt"]),

  pageCanvasPlacements: defineTable({
    workspaceId: v.id("workspaces"),
    areaId: v.id("areas"),
    rootPageId: v.union(v.id("pages"), v.null()),
    pageId: v.id("pages"),
    x: v.number(),
    y: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    updatedByProfileId: v.id("profiles"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_pageId", ["pageId"])
    .index("by_workspaceId_and_areaId_and_rootPageId", [
      "workspaceId",
      "areaId",
      "rootPageId",
    ]),

  pageCanvasEdgesV2: defineTable({
    workspaceId: v.id("workspaces"),
    areaId: v.id("areas"),
    rootPageId: v.union(v.id("pages"), v.null()),
    nodeAId: v.id("pages"),
    nodeBId: v.id("pages"),
    pairKey: v.string(),
    label: v.union(v.string(), v.null()),
    authorProfileId: v.optional(v.id("profiles")),
    attribution: v.union(v.literal("author"), v.literal("legacy_neutral")),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index(
      "by_scope_active_pair",
      [
        "workspaceId",
        "areaId",
        "rootPageId",
        "archivedAt",
        "pairKey",
      ],
    )
    .index("by_nodeAId_and_archivedAt", ["nodeAId", "archivedAt"])
    .index("by_nodeBId_and_archivedAt", ["nodeBId", "archivedAt"]),

  pageCanvasViewports: defineTable({
    workspaceId: v.id("workspaces"),
    areaId: v.id("areas"),
    rootPageId: v.union(v.id("pages"), v.null()),
    viewerProfileId: v.id("profiles"),
    x: v.number(),
    y: v.number(),
    zoom: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index(
    "by_viewerProfileId_and_workspaceId_and_areaId_and_rootPageId",
    ["viewerProfileId", "workspaceId", "areaId", "rootPageId"],
  ).index("by_rootPageId", ["rootPageId"])
    // Svaka tabela sa projektom ima indeks koji počinje projektom (S01 §2.3).
    .index("by_workspaceId", ["workspaceId"]),

  pageNestingRequests: defineTable({
    workspaceId: v.id("workspaces"),
    areaId: v.id("areas"),
    childPageId: v.id("pages"),
    sourceParentPageId: v.union(v.id("pages"), v.null()),
    targetParentPageId: v.id("pages"),
    requesterProfileId: v.id("profiles"),
    parentAuthorProfileId: v.id("profiles"),
    expectedTreeRevision: v.number(),
    proposedPosition: v.optional(v.number()),
    proposedX: v.optional(v.number()),
    proposedY: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("withdrawn"),
      v.literal("cancelled"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    resolvedAt: v.union(v.number(), v.null()),
  })
    .index("by_childPageId_and_status_and_updatedAt", [
      "childPageId",
      "status",
      "updatedAt",
    ])
    .index("by_targetParentPageId_and_status_and_createdAt", [
      "targetParentPageId",
      "status",
      "createdAt",
    ])
    .index("by_parentAuthorProfileId_and_status_and_createdAt", [
      "parentAuthorProfileId",
      "status",
      "createdAt",
    ])
    .index("by_requesterProfileId_and_status_and_createdAt", [
      "requesterProfileId",
      "status",
      "createdAt",
    ])
    .index("by_workspace_and_parentAuthorProfileId_and_status_and_createdAt", [
      "workspaceId",
      "parentAuthorProfileId",
      "status",
      "createdAt",
    ])
    .index("by_workspaceId_and_requesterProfileId_and_status_and_createdAt", [
      "workspaceId",
      "requesterProfileId",
      "status",
      "createdAt",
    ])
    .index("by_workspaceId_and_status_and_updatedAt", [
      "workspaceId",
      "status",
      "updatedAt",
    ]),

  pageRelations: defineTable({
    workspaceId: v.id("workspaces"),
    areaId: v.id("areas"),
    // Deprecated par: relacija je nekad spajala isključivo belešku i zadatak.
    // Kanon su `pageAId`/`pageBId`; stara polja se i dalje upisuju da bi
    // rollback aplikacije radio bez vraćanja baze.
    notePageId: v.id("pages"),
    taskPageId: v.id("pages"),
    pageAId: v.optional(v.id("pages")),
    pageBId: v.optional(v.id("pages")),
    pairKey: v.string(),
    label: v.union(v.string(), v.null()),
    authorProfileId: v.id("profiles"),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_areaId_and_archivedAt_and_createdAt", [
      "areaId",
      "archivedAt",
      "createdAt",
    ])
    .index("by_areaId_and_pairKey_and_archivedAt", [
      "areaId",
      "pairKey",
      "archivedAt",
    ])
    .index("by_workspace_area_active_created", [
      "workspaceId",
      "areaId",
      "archivedAt",
      "createdAt",
    ])
    .index("by_scope_pair_active", [
      "workspaceId",
      "areaId",
      "pairKey",
      "archivedAt",
    ])
    // Jedinstvenost para je na nivou startupa otkako relacije smeju da spajaju
    // stranice iz različitih oblasti; `by_scope_pair_active` ostaje zbog
    // rollback-a aplikacije, kao i deprecated polja iznad.
    .index("by_workspaceId_and_pairKey_and_archivedAt", [
      "workspaceId",
      "pairKey",
      "archivedAt",
    ])
    .index("by_notePageId_and_archivedAt", ["notePageId", "archivedAt"])
    .index("by_taskPageId_and_archivedAt", ["taskPageId", "archivedAt"])
    .index("by_pageAId_and_archivedAt", ["pageAId", "archivedAt"])
    .index("by_pageBId_and_archivedAt", ["pageBId", "archivedAt"]),

  notifications: defineTable({
    recipientProfileId: v.id("profiles"),
    // `null` = lično obaveštenje (poruka iz ličnog razgovora, van startupa).
    workspaceId: v.union(v.id("workspaces"), v.null()),
    type: notificationTypeValidator,
    title: v.string(),
    body: v.optional(v.string()),
    targetType: notificationTargetTypeValidator,
    targetId: v.union(v.string(), v.null()),
    // `null` kad je pošiljalac sistem (cron podsetnici).
    actorProfileId: v.union(v.id("profiles"), v.null()),
    // Sprečava da isti podsetnik uđe dva puta; `null` za događaje.
    dedupeKey: v.union(v.string(), v.null()),
    readAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
  })
    .index("by_recipient_and_workspace_and_readAt", [
      "recipientProfileId",
      "workspaceId",
      "readAt",
    ])
    .index("by_recipient_and_workspace_and_createdAt", [
      "recipientProfileId",
      "workspaceId",
      "createdAt",
    ])
    // Globalni Inbox (`inbox.ts`): feed i brojači iz svih startupa bez
    // nabrajanja startupa jedan po jedan.
    .index("by_recipient_and_createdAt", ["recipientProfileId", "createdAt"])
    .index("by_recipient_and_readAt", ["recipientProfileId", "readAt"])
    .index("by_dedupeKey", ["dedupeKey"])
    // Svaka tabela sa projektom ima indeks koji počinje projektom (S01 §2.3).
    .index("by_workspaceId", ["workspaceId"]),

  pushSubscriptions: defineTable({
    profileId: v.id("profiles"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
    // Broj neuspelih dostava; posle praga se pretplata gasi.
    failureCount: v.number(),
    lastSuccessAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_endpoint", ["endpoint"])
    .index("by_profileId", ["profileId"]),

  // Native push tokeni (Expo), paralelno sa web `pushSubscriptions`. Isti
  // korisnik može imati oba — desktop browser i telefon — i obe dostave rade
  // nezavisno (docs/mobile/03-NOTIFIKACIJE.md sekcija 2).
  expoPushTokens: defineTable({
    profileId: v.id("profiles"),
    // ExponentPushToken[...]; jedinstven po uređaju, upsert ide preko by_token.
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android")),
    deviceName: v.union(v.string(), v.null()),
    appVersion: v.string(),
    // Koju generaciju kanala uređaj poznaje (sekcija 4.1 — Android zaključava
    // zvuk za kanal, pa se novi zvuk isporučuje kroz novi `_vN` kanal).
    channelVersion: v.number(),
    // LEGACY: podešavanja su preseljena u `notificationSettings` (po profilu, ne
    // po uređaju — sekcija 7). Polja su ostavljena OPCIONA da postojeći redovi i
    // dalje validiraju bez migracije; `save` ih više ne upisuje, dostava ih ne
    // čita. Ukloniti kad se stari redovi presele.
    mutedTypes: v.optional(v.array(notificationTypeValidator)),
    quietHoursStart: v.optional(v.union(v.number(), v.null())),
    quietHoursEnd: v.optional(v.union(v.number(), v.null())),
    lastSeenAt: v.number(),
    // Broj neuspelih dostava; posle praga se token gasi (kao kod weba).
    failureCount: v.number(),
    createdAt: v.number(),
  })
    .index("by_profileId", ["profileId"])
    .index("by_token", ["token"]),

  // Podešavanja obaveštenja PO PROFILU (ne po uređaju): isključen tip važi na
  // svim uređajima i na webu i na mobilnom (docs/mobile/03-NOTIFIKACIJE.md
  // sekcija 7). Jedan red po profilu, kreira se lenjo pri prvoj izmeni; njegovo
  // odsustvo znači podrazumevano stanje (ništa utišano, bez tihih sati). Obe
  // grane dostave (`push.ts`, `expoPush.ts`) čitaju odavde.
  notificationSettings: defineTable({
    profileId: v.id("profiles"),
    // Utišani tipovi; prazno = ništa nije utišano. Filtrira i web i native push.
    mutedTypes: v.array(notificationTypeValidator),
    // Tihi sati kao minuti od ponoći u Europe/Belgrade; `null` = isključeno.
    // Primenjuju se na SERVERU; `mention` i `deadline` ih probijaju (sekcija 7).
    quietHoursStart: v.union(v.number(), v.null()),
    quietHoursEnd: v.union(v.number(), v.null()),
    updatedAt: v.number(),
  }).index("by_profileId", ["profileId"]),

  activities: defineTable({
    workspaceId: v.id("workspaces"),
    actorProfileId: v.id("profiles"),
    action: v.union(
      v.literal("startup_created"),
      v.literal("startup_updated"),
      v.literal("startup_archived"),
      v.literal("member_added"),
      v.literal("member_removed"),
      v.literal("invite_created"),
      v.literal("invite_claimed"),
      v.literal("invite_revoked"),
      v.literal("page_created"),
      v.literal("page_updated"),
      v.literal("page_moved"),
      v.literal("page_archived"),
      v.literal("task_updated"),
      v.literal("contribution_created"),
      v.literal("contribution_updated"),
      v.literal("deletion_requested"),
      v.literal("deletion_voted"),
      v.literal("deletion_resolved"),
      v.literal("nesting_requested"),
      v.literal("nesting_resolved"),
      v.literal("content_recovered"),
      v.literal("content_soft_deleted"),
      v.literal("member_password_changed"),
      // PROSTOR (K02): nove radnje čuvaju `title` = naslov objekta, a rečenicu
      // gradi shared `formatActivity`.
      v.literal("page_locked"),
      v.literal("page_unlocked"),
      v.literal("revision_restored"),
      // PROSTOR (K03): Korpa.
      v.literal("page_restored"),
      v.literal("idea_archived"),
      v.literal("idea_restored"),
      // PROSTOR (K04): komentar (`title` = naslov stavke, `detail` = isečak).
      v.literal("comment_created"),
      // PROSTOR (K05): faza ideje (`title` = naslov ideje, `detail` = naziv faze).
      v.literal("idea_stage_changed"),
      // PROSTOR (K06): „Sredi rokove” (`detail` = „N zadataka → oznaka”).
      v.literal("tasks_rescheduled"),
    ),
    targetType: v.union(
      v.literal("startup"),
      v.literal("profile"),
      v.literal("invite"),
      v.literal("page"),
      v.literal("idea"),
      v.literal("contribution"),
      v.literal("request"),
      v.literal("recovered"),
      v.literal("area"),
    ),
    targetId: v.string(),
    title: v.string(),
    detail: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_workspaceId_and_createdAt", ["workspaceId", "createdAt"])
    .index("by_actorProfileId_and_createdAt", [
      "actorProfileId",
      "createdAt",
    ]),

  // --- Istorija izmena i prisustvo (PROSTOR P2, P23) ------------------------
  //
  // Snimak naslova i sadržaja POSLE izmene, za stranice, opis oblasti i ideje.
  // Pre prve izmene upisuje se bazna revizija (zatečeno stanje). Izmene istog
  // autora u roku od 10 minuta se spajaju u jednu reviziju; „Vrati ovu verziju"
  // pravi NOVU reviziju. Ništa se ne briše.
  contentRevisions: defineTable({
    workspaceId: v.id("workspaces"),
    targetKind: v.union(v.literal("page"), v.literal("area"), v.literal("idea")),
    targetId: v.string(),
    /** `contributionTargetKey(targetKind, targetId)`. */
    targetKey: v.string(),
    kind: v.union(
      v.literal("baseline"),
      v.literal("edit"),
      v.literal("restore"),
    ),
    /** `null` = zatečeno stanje bez poznatog autora. */
    authorProfileId: v.union(v.id("profiles"), v.null()),
    /** Oblast: njen naziv u trenutku izmene. */
    title: v.union(v.string(), v.null()),
    content: v.string(),
    /** Samo zadaci. */
    instructions: v.optional(v.union(v.string(), v.null())),
    /** `pages.revision` / `areaBodies.revision` posle izmene; ideja `null`. */
    targetRevision: v.union(v.number(), v.null()),
    restoredFromId: v.optional(v.id("contentRevisions")),
    createdAt: v.number(),
    /** Pomera se pri spajanju (10 min). */
    updatedAt: v.number(),
  }).index("by_targetKey_and_updatedAt", ["targetKey", "updatedAt"])
    // Svaka tabela sa projektom ima indeks koji počinje projektom (S01 §2.3).
    .index("by_workspaceId", ["workspaceId"]),

  // „<Ime> uređuje" — isti obrazac kao `chatPresence`: klijent šalje otkucaje,
  // upit vraća `expiresAt`, a klijent sam odbacuje istekle (upit ne čita sat).
  pagePresence: defineTable({
    workspaceId: v.id("workspaces"),
    pageId: v.id("pages"),
    profileId: v.id("profiles"),
    editing: v.boolean(),
    /** `Date.now() + PAGE_PRESENCE_TTL_MS`; `0` = napustio stranicu. */
    expiresAt: v.number(),
    updatedAt: v.number(),
  }).index("by_pageId_and_profileId", ["pageId", "profileId"])
    // Svaka tabela sa projektom ima indeks koji počinje projektom (S01 §2.3).
    .index("by_workspaceId", ["workspaceId"]),

  // --- Chat (docs/mobile/04-CHAT.md) --------------------------------------

  chatChannels: defineTable({
    // `null` = lični razgovor (DM ili grupa van startupa); pristup samo kroz
    // eksplicitno članstvo u `chatMembers` (docs/LICNO-PLAN.md P6).
    workspaceId: v.union(v.id("workspaces"), v.null()),
    kind: chatChannelKindValidator,
    // kind === "area": kanal oblasti.
    areaId: v.union(v.id("areas"), v.null()),
    // kind === "thread": polimorfna veza ka entitetu.
    anchorType: v.union(chatAnchorTypeValidator, v.null()),
    anchorId: v.union(v.string(), v.null()),
    // kind === "dm": sortirani par "profileA:profileB". Za `agent` kanal:
    // "agent:<profileId>" — deterministično pronalaženje bez posebnog indeksa.
    dmKey: v.union(v.string(), v.null()),
    name: v.string(),
    isPrivate: v.boolean(),
    // Denormalizovano zbog liste razgovora — bez ovoga je pregled N+1.
    lastMessageAt: v.number(),
    lastMessagePreview: v.string(),
    lastMessageAuthorId: v.union(v.id("profiles"), v.null()),
    messageCount: v.number(),
    createdByProfileId: v.id("profiles"),
    archivedAt: v.union(v.number(), v.null()),
    createdAt: v.number(),
  })
    // Globalni/admin pogled po skorašnjosti. Lista po korisniku se sklapa iz
    // by_startup_and_kind (javni) + chatMembers (DM/privatni/thread) — ovaj
    // indeks NE daje access-filtriranu listu (04-CHAT.md, analiza B2).
    .index("by_workspace_and_lastMessageAt", [
      "workspaceId",
      "archivedAt",
      "lastMessageAt",
    ])
    .index("by_workspace_and_kind", ["workspaceId", "kind", "archivedAt"])
    .index("by_anchor", ["anchorType", "anchorId"])
    .index("by_workspace_and_dmKey", ["workspaceId", "dmKey"])
    .index("by_area", ["areaId", "archivedAt"]),

  chatMessages: defineTable({
    channelId: v.id("chatChannels"),
    // Duplirano zbog provere pristupa bez join-a i kao search filterField.
    workspaceId: v.union(v.id("workspaces"), v.null()), // `null` = lični razgovor
    authorProfileId: v.union(v.id("profiles"), v.null()), // null = sistemska
    body: v.string(),
    mentions: v.array(v.id("profiles")),
    kind: chatMessageKindValidator,
    attachmentStorageId: v.optional(v.id("_storage")),
    attachmentName: v.union(v.string(), v.null()),
    attachmentType: v.union(v.string(), v.null()),
    attachmentSize: v.union(v.number(), v.null()),
    voiceDurationMs: v.union(v.number(), v.null()),
    replyToMessageId: v.union(v.id("chatMessages"), v.null()),
    editedAt: v.union(v.number(), v.null()),
    deletedAt: v.union(v.number(), v.null()), // soft delete
    createdAt: v.number(),
  })
    // Lista poruka: uključuje i soft-obrisane (prikazuju se kao tombstone).
    .index("by_channel_and_createdAt", ["channelId", "createdAt"])
    .index("by_channel_active", ["channelId", "deletedAt", "createdAt"])
    .index("by_author", ["authorProfileId", "createdAt"])
    // Da odbijen prilog nikad ne obriše TUĐ blob: pre `storage.delete` mora da se
    // dokaže da taj blob nije već zakačen (isti razlog kao `pageFiles.by_storageId`).
    .index("by_attachmentStorageId", ["attachmentStorageId"])
    .searchIndex("search_body", {
      searchField: "body",
      filterFields: ["workspaceId", "channelId", "deletedAt"],
    })
    // Svaka tabela sa projektom ima indeks koji počinje projektom (S01 §2.3).
    .index("by_workspaceId", ["workspaceId"]),

  // Eksplicitno članstvo — DM, privatni/custom kanali, threadovi, agent. Za
  // kind === "startup"/"area" članstvo je implicitno (startupMembers), pa ovde
  // nema redova. Nivo obaveštenja NIJE ovde — živi na chatReads (04-CHAT.md D).
  chatMembers: defineTable({
    channelId: v.id("chatChannels"),
    profileId: v.id("profiles"),
    workspaceId: v.union(v.id("workspaces"), v.null()), // `null` = lični razgovor
    role: chatMemberRoleValidator,
    joinedAt: v.number(),
    leftAt: v.union(v.number(), v.null()),
  })
    .index("by_channel", ["channelId", "leftAt"])
    .index("by_profile", ["profileId", "leftAt"])
    .index("by_channel_and_profile", ["channelId", "profileId"])
    // „Moji DM/threadovi u startupu" bez skeniranja članstava kroz sve startupe.
    .index("by_profile_and_workspace", ["profileId", "workspaceId", "leftAt"])
    // Svaka tabela sa projektom ima indeks koji počinje projektom (S01 §2.3).
    .index("by_workspaceId", ["workspaceId"]),

  // Po kanalu, po profilu. Nosi unread brojače i nivo obaveštenja. Nedostajući
  // red = 0 unread i nivo „all". Opšti i kanali oblasti se seeduju (migracija
  // `backfillChatReads`, unread 0); DM/thread redovi nastaju lenjo.
  chatReads: defineTable({
    channelId: v.id("chatChannels"),
    profileId: v.id("profiles"),
    workspaceId: v.union(v.id("workspaces"), v.null()), // `null` = lični razgovor
    lastReadAt: v.number(),
    lastReadMessageId: v.union(v.id("chatMessages"), v.null()),
    unreadCount: v.number(), // održavano inkrementalno, ne računa se pri čitanju
    mentionCount: v.number(),
    notificationLevel: v.optional(chatNotificationLevelValidator),
    updatedAt: v.number(),
  })
    .index("by_channel_and_profile", ["channelId", "profileId"])
    .index("by_profile", ["profileId"])
    .index("by_profile_and_workspace", ["profileId", "workspaceId"])
    // Svaka tabela sa projektom ima indeks koji počinje projektom (S01 §2.3).
    .index("by_workspaceId", ["workspaceId"]),

  // Prisustvo u kanalu — jedini razlog zašto poruka NE zvoni (04-CHAT.md 5,
  // `docs/mobile/lanac5/PLAN.md` §1.3). Red postoji po paru (kanal, profil) i
  // nosi samo žig isteka koji klijent obnavlja dok gleda dno tog razgovora.
  //
  // Zašto zasebna tabela, a ne polje na `chatReads`: `chatReads` čitaju
  // `unreadSummary` i `listChannels`, pa bi otkucaj na svakih 15 s prezidavao
  // listu razgovora i badge dok korisnik samo gleda otvoren chat. Ovu tabelu ne
  // pretplaćuje nijedan upit — upis nikoga ne budi.
  //
  // TTL je OBAVEZAN: bez njega ugašen ekran ili prekinuta mreža ostave korisnika
  // zauvek „prisutnim" i on više nikad ne dobije obaveštenje.
  chatPresence: defineTable({
    channelId: v.id("chatChannels"),
    profileId: v.id("profiles"),
    workspaceId: v.union(v.id("workspaces"), v.null()), // `null` = lični razgovor
    /** `Date.now() + CHAT_PRESENCE_TTL_MS`; `0` = eksplicitno odjavljen. */
    expiresAt: v.number(),
    updatedAt: v.number(),
  }).index("by_channel_and_profile", ["channelId", "profileId"])
    // Svaka tabela sa projektom ima indeks koji počinje projektom (S01 §2.3).
    .index("by_workspaceId", ["workspaceId"]),

  chatReactions: defineTable({
    messageId: v.id("chatMessages"),
    profileId: v.id("profiles"),
    emoji: v.string(),
    createdAt: v.number(),
  })
    .index("by_message", ["messageId"])
    .index("by_message_and_profile_and_emoji", [
      "messageId",
      "profileId",
      "emoji",
    ]),

  // --- AI provajderi (docs/mobile/06-AGENT.md sekcija 3) -------------------
  //
  // OpenAI-kompatibilan provajder = baseUrl + model + apiKey. Konfiguriše ga
  // admin startupa iz UI. `apiKey` je TAJNA: čita se ISKLJUČIVO iz internal
  // funkcija (`getDefaultProviderWithKey`, `getWithKey`) — nijedan javni upit ne
  // sme da ga vrati. UI vidi samo `keySuffix` (poslednja 4 znaka). Brisanje je
  // hard delete, bez `archivedAt`, da obrisan ključ stvarno nestane.
  aiProviders: defineTable({
    workspaceId: v.id("workspaces"),
    label: v.string(), // "Groq — Llama 3.3" (korisnikov naziv)
    baseUrl: v.string(), // https://api.groq.com/openai/v1
    model: v.string(), // llama-3.3-70b-versatile
    apiKey: v.string(), // ⚠️ nikad ne izlazi iz internal funkcija
    keySuffix: v.string(), // "a3f9" — server-side izvedeno, jedino se pokazuje
    isDefault: v.boolean(),
    enabled: v.boolean(),
    createdByProfileId: v.id("profiles"),
    lastUsedAt: v.union(v.number(), v.null()),
    lastErrorAt: v.union(v.number(), v.null()),
    lastError: v.union(v.string(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspaceId_and_enabled", ["workspaceId", "enabled"])
    .index("by_workspaceId_and_isDefault", ["workspaceId", "isDefault"]),
};
