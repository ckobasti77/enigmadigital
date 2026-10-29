"use client";


// Preneto iz Devotion apps/web/components/workspace/ideas/ideas-view.tsx (main @ c05c40f), SPAJANJE S13.
import { useMemo, useState, useSyncExternalStore } from "react";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs } from "convex/server";
import { toast } from "@/lib/toast";

import type { MentionMember } from "@/components/app/prostor/saradnja/comment-composer";
import { useLiveNow } from "@/components/app/prostor/saradnja/use-live-now";
import type { ProfileWithAvatar, StartupWithAreas } from "@/lib/prostor/rute";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import type { Today } from "@/lib/prostor/web/danas";

import { IdeaConvertDialog, IdeaCreateDialog } from "@/components/app/prostor/ideje/idea-dialogs";
import { IdeaDetailDrawer } from "@/components/app/prostor/ideje/idea-detail-drawer";
import type { IdeaActions } from "@/components/app/prostor/ideje/idea-parts";
import { IdeasScreen } from "@/components/app/prostor/ideje/ideas-screen";
import {
  applyIdeaStage,
  applyIdeaVote,
  convertedMessage,
  DEFAULT_IDEA_SORT,
  ideaTitle,
  IDEAS_VIEW_STORAGE_KEY,
  nextIdeaSort,
  readIdeasViewMode,
  stageChangedMessage,
  trashedMessage,
  voteMessage,
  writeIdeasViewMode,
  type IdeaModel,
  type IdeaSort,
  type IdeasViewMode,
} from "@/lib/prostor/modeli/ideas-model";
import {
  useProjekatMutationOptimisticno,
  useProjekatQueryResult,
  useProjekatQueryTolerant,
} from "@/components/app/prostor/podaci/projekat";
import { useProjekatMutation } from "@/components/app/projekat-provider";

/** Glas se odmah vidi (broj i `aria-pressed`); server potvrđuje ili vraća. */
function optimisticVote(store: OptimisticLocalStore, args: FunctionArgs<typeof api.prostor.ideas.vote>) {
  const current = store.getQuery(api.prostor.ideas.list, { workspaceId: args.workspaceId });
  if (!current) return;
  store.setQuery(api.prostor.ideas.list, { workspaceId: args.workspaceId }, {
    ...current,
    nodes: current.nodes.map((node) => (node._id === args.ideaId ? applyIdeaVote(node, args.voteType) : node)),
  });
}

/** Kartica odmah prelazi u novu kolonu (Flip); `Pretvori` prati fazu „Odobreno". */
function optimisticStage(store: OptimisticLocalStore, args: FunctionArgs<typeof api.prostor.ideas.setStage>) {
  const current = store.getQuery(api.prostor.ideas.list, { workspaceId: args.workspaceId });
  if (!current) return;
  const at = Date.now();
  store.setQuery(api.prostor.ideas.list, { workspaceId: args.workspaceId }, {
    ...current,
    nodes: current.nodes.map((node) => (node._id === args.ideaId ? applyIdeaStage(node, args.stage, at) : node)),
  });
}

type CreateTarget = { parentIdeaId?: Id<"ideaNodes">; position?: { x: number; y: number } };

/** Izbor prikaza živi u `localStorage` (K07 E15); promena u drugoj kartici se vidi i ovde. */
const viewListeners = new Set<() => void>();
function subscribeView(listener: () => void) {
  viewListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === IDEAS_VIEW_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    viewListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
function useIdeasViewMode(): [IdeasViewMode, (mode: IdeasViewMode) => void] {
  const mode = useSyncExternalStore(
    subscribeView,
    () => readIdeasViewMode(safeStorage()),
    () => "tabla" as const,
  );
  const [fallback, setFallback] = useState<IdeasViewMode | null>(null);
  return [
    fallback ?? mode,
    (next) => {
      writeIdeasViewMode(safeStorage(), next);
      // Skladište koje ne radi (privatni režim): izbor važi do osvežavanja.
      setFallback(readIdeasViewMode(safeStorage()) === next ? null : next);
      viewListeners.forEach((listener) => listener());
    },
  ];
}

type IdeasViewProps = {
  workspace: StartupWithAreas;
  profile: ProfileWithAvatar;
  today: Today;
  /** Otvoren detalj (iz URL-a). */
  ideaId: Id<"ideaNodes"> | null;
  onOpenIdea: (ideaId: Id<"ideaNodes"> | null) => void;
  onOpenPage: (pageId: Id<"pages">) => void;
  onOpenTrash: () => void;
};

/**
 * Ideje projekta (PROSTOR P6, P16; K07 §5.9) — kontejner: `ideas.list` (R7),
 * glas (`ideas.vote`, svaki član) i faza (`ideas.setStage`, samo kome je
 * dozvoljeno) sa optimističkim upisom, pa Flip; detalj u fioci
 * (`?ideja=`), pretvaranje, brisanje u Korpu uz „Poništi". Mapu ideja
 * (i „Ugnezdi u…“ i novu granu sa nje) donosi modul mapa.
 */
export function IdeasView(props: IdeasViewProps) {
  // „Pokušaj ponovo" ponovo montira sadržaj (nova pretplata na `ideas.list`).
  const [attempt, setAttempt] = useState(0);
  return <IdeasContent key={attempt} {...props} retry={() => setAttempt((value) => value + 1)} />;
}

function IdeasContent({
  workspace,
  profile,
  today,
  ideaId,
  onOpenIdea,
  onOpenPage,
  onOpenTrash,
  retry,
}: IdeasViewProps & { retry: () => void }) {
  const { data, failed } = useProjekatQueryResult(api.prostor.ideas.list);
  const membersData = useProjekatQueryTolerant(api.prostor.projekat.listMembers);
  const now = useLiveNow(today.now);

  const [mode, setMode] = useIdeasViewMode();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<IdeaSort>(DEFAULT_IDEA_SORT);
  const [announcement, setAnnouncement] = useState("");
  // Dijalozi ostaju montirani i posle zatvaranja (izlazna animacija, povratak fokusa):
  // cilj se pamti, a „otvoreno" je zasebno.
  const [createTarget, setCreateTarget] = useState<CreateTarget>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [convertId, setConvertId] = useState<Id<"ideaNodes"> | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);

  // Projektne mutacije: kuka ubacuje `workspaceId`, a izmena keša ga dobija u `args`.
  const vote = useProjekatMutationOptimisticno(api.prostor.ideas.vote, optimisticVote);
  const setStage = useProjekatMutationOptimisticno(api.prostor.ideas.setStage, optimisticStage);
  const create = useProjekatMutation(api.prostor.ideas.create);
  const archive = useProjekatMutation(api.prostor.ideas.archive);
  const restore = useProjekatMutation(api.prostor.ideas.restoreOwn);
  const convert = useProjekatMutation(api.prostor.ideas.convertToPage);

  const nodes = data?.nodes;
  const ideas: ReadonlyArray<IdeaModel> | undefined = nodes;
  const byId = useMemo(() => new Map((nodes ?? []).map((node) => [node._id as string, node])), [nodes]);
  const members = useMemo<MentionMember[]>(
    () =>
      (membersData ?? []).map(({ profile: member }) => ({
        profileId: member._id,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
      })),
    [membersData],
  );

  /** Najava se prvo isprazni, da čitač ekrana ponovi isti tekst. */
  function announce(message: string) {
    setAnnouncement("");
    window.setTimeout(() => setAnnouncement(message), 50);
  }

  const actions: IdeaActions = {
    onOpen: (id) => onOpenIdea(id),
    onVote: (idea, voteType) => {
      const previous = idea.myVote;
      void vote({ ideaId: idea._id, voteType })
        .then(() => announce(voteMessage(previous, voteType)))
        .catch((error: unknown) => toast.error(accessErrorMessage(error, "Glas nije sačuvan.")));
    },
    onSetStage: (idea, stage) => {
      const previous = idea.storedStage;
      if (previous === stage) return;
      void setStage({ ideaId: idea._id, stage })
        .then(() => {
          const message = stageChangedMessage(stage);
          announce(message);
          toast.success(message, {
            duration: 8_000,
            action: {
              label: "Poništi",
              onClick: () =>
                void setStage({ ideaId: idea._id, stage: previous }).catch((error: unknown) =>
                  toast.error(accessErrorMessage(error, "Faza nije vraćena.")),
                ),
            },
          });
        })
        .catch((error: unknown) => toast.error(accessErrorMessage(error, "Faza nije promenjena.")));
    },
    onConvert: (idea) => {
      setConvertId(idea._id);
      setConvertOpen(true);
    },
    onArchive: (idea) => {
      const title = ideaTitle(idea);
      // Fioka se zatvara odmah, da ne trepne „Ideja više nije ovde." dok stiže lista.
      if (ideaId === idea._id) onOpenIdea(null);
      void archive({ ideaId: idea._id })
        .then(() => {
          let trashed = true;
          toast.success(trashedMessage(title), {
            duration: 8_000,
            action: {
              label: "Poništi",
              onClick: () => {
                if (!trashed) return;
                trashed = false;
                void restore({ ideaId: idea._id }).catch((error: unknown) =>
                  toast.error(accessErrorMessage(error, "Ideja nije vraćena.")),
                );
              },
            },
          });
        })
        .catch((error: unknown) => toast.error(accessErrorMessage(error, "Ideja nije obrisana.")));
    },
  };

  async function createIdea(draft: { title: string; text: string }) {
    try {
      const target = createTarget;
      await create({
        title: draft.title,
        text: draft.text,
        parentIdeaId: target.parentIdeaId,
        x: target.position ? Math.round(target.position.x) : undefined,
        y: target.position ? Math.round(target.position.y) : undefined,
      });
      toast.success(target.parentIdeaId ? "Nova grana ideje je dodata." : "Ideja je dodata u Predlog.");
      return true;
    } catch (error) {
      toast.error(accessErrorMessage(error, "Ideja nije dodata."));
      return false;
    }
  }

  const convertIdea = convertId ? (byId.get(convertId) ?? null) : null;
  async function convertSelected(input: { kind: "task" | "note"; areaId: string }) {
    if (!convertIdea) return false;
    const title = ideaTitle(convertIdea);
    try {
      const pageId = await convert({
        ideaId: convertIdea._id,
        areaId: input.areaId as Id<"areas">,
        kind: input.kind,
      });
      toast.success(convertedMessage(input.kind, title), {
        duration: 8_000,
        action: { label: "Otvori", onClick: () => onOpenPage(pageId) },
      });
      return true;
    } catch (error) {
      toast.error(accessErrorMessage(error, "Ideja nije pretvorena."));
      return false;
    }
  }

  const detail = ideaId === null ? undefined : nodes === undefined ? undefined : (byId.get(ideaId) ?? null);
  const createParent = createTarget.parentIdeaId ? byId.get(createTarget.parentIdeaId) : undefined;
  const openCreate = (target: CreateTarget) => {
    setCreateTarget(target);
    setCreateOpen(true);
  };

  return (
    <>
      <IdeasScreen
        state={
          failed
            ? { status: "error", retry }
            : ideas === undefined
              ? { status: "loading" }
              : { status: "ready", ideas }
        }
        mode={mode}
        onModeChange={setMode}
        query={query}
        onQueryChange={setQuery}
        now={now}
        actions={actions}
        activeIdeaId={ideaId}
        sort={sort}
        onSortChange={(key) => setSort((current) => nextIdeaSort(current, key))}
        onCreate={() => openCreate({})}
        announcement={announcement}
      />
      <IdeaDetailDrawer
        open={ideaId !== null}
        idea={detail}
        now={now}
        members={members}
        selfProfileId={profile._id}
        actions={actions}
        onClose={() => onOpenIdea(null)}
        onOpenPage={onOpenPage}
        onOpenTrash={onOpenTrash}
        loadError={failed ? { retry } : null}
      />
      <IdeaCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        parentTitle={createParent ? ideaTitle(createParent) : null}
        onCreate={createIdea}
      />
      <IdeaConvertDialog
        open={convertOpen && convertIdea !== null}
        onOpenChange={setConvertOpen}
        ideaTitle={convertIdea ? ideaTitle(convertIdea) : ""}
        areas={workspace.areas}
        onConvert={convertSelected}
      />
    </>
  );
}
