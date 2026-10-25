"use client";

import { useMemo, useState, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMoze, useProjekat } from "@/components/app/projekat-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackNote } from "@/components/app/feedback";
import { PageHeader } from "@/components/app/system/page-header";
import { NovostiBoard } from "./novosti-board";
import { NovostiEditor } from "./novosti-editor";
import {
  type PostItem,
  type PostStatus,
  type PostCategory,
  type PostKind,
} from "./novosti-types";
import { Plus } from "lucide-react";

const DESCRIPTION =
  "Članci i beleške za sajt Enigma IT: nacrt, četiri kapije, pa objava.";

const INFO =
  "Post se objavljuje tek kad prođe četiri kapije: sopstveni dokaz, provera humanizera, ALT opis naslovne slike i podnaslov. Spisak nacrta se pamti na ovom uređaju; objavljeni postovi stižu iz baze.";

const DRAFTS_STORAGE_KEY_PREFIX = "enigma:novosti:drafts:";

function getStorageKey(workspaceId?: string): string {
  return `${DRAFTS_STORAGE_KEY_PREFIX}${workspaceId ?? "default"}`;
}

function loadLocalDrafts(workspaceId?: string): PostItem[] {
  if (typeof window === "undefined" || !workspaceId) return [];
  try {
    const raw = localStorage.getItem(getStorageKey(workspaceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalDrafts(workspaceId: string, drafts: PostItem[]): void {
  if (typeof window === "undefined" || !workspaceId) return;
  try {
    localStorage.setItem(getStorageKey(workspaceId), JSON.stringify(drafts));
  } catch {
    // Tiho ignoriši ako localStorage nije dostupan
  }
}

export function NovostiDashboard() {
  const { spreman, slug, workspaceId } = useProjekat();
  // Posmatrač vidi tablu sa postovima, ali ne piše, ne uređuje i ne objavljuje.
  const moze = useMoze("urednik");

  const [activeView, setActiveView] = useState<"table" | "editor">("table");
  const [editingPost, setEditingPost] = useState<Partial<PostItem> | null>(null);

  // Lokalno evidentirani postovi (nacrti i novokreirani)
  const [localPosts, setLocalPosts] = useState<PostItem[]>([]);

  // Učitaj lokalne nacrte kad se sazna workspaceId. Poredi se sa radnim
  // prostorom za koji su nacrti već učitani, pa se čitanje desi jednom po
  // prostoru i bez efekta.
  const [draftsFor, setDraftsFor] = useState<Id<"workspaces"> | undefined>(
    undefined,
  );
  if (workspaceId && draftsFor !== workspaceId) {
    setDraftsFor(workspaceId);
    setLocalPosts(loadLocalDrafts(workspaceId));
  }

  // Sinhronizacija i čuvanje lokalnih nacrta
  const persistLocalPosts = useCallback(
    (nextPosts: PostItem[]) => {
      setLocalPosts(nextPosts);
      if (workspaceId) {
        saveLocalDrafts(workspaceId, nextPosts);
      }
    },
    [workspaceId],
  );

  // Upit ka Convexu za objavljene postove
  const publishedData = useQuery(
    api.postsPublic.listPublished,
    slug ? { workspaceSlug: slug, limit: 50 } : "skip",
  );

  // Spajanje objavljenih postova sa Convex-a i lokalnih postova
  const allPosts = useMemo<PostItem[]>(() => {
    const map = new Map<string, PostItem>();

    // 1. Dodaj lokalno sačuvane postove
    for (const p of localPosts) {
      map.set(p._id, p);
    }

    // 2. Dodaj / preklopi sa zvanično objavljenim sa Convex-a
    if (publishedData?.posts) {
      for (const p of publishedData.posts) {
        const existing = map.get(p._id);
        map.set(p._id, {
          _id: p._id,
          _creationTime: p._creationTime,
          workspaceId: workspaceId ?? undefined,
          slug: p.slug,
          locale: p.locale,
          kind: p.kind as PostKind,
          category: p.category as PostCategory,
          title: p.title,
          dek: p.dek,
          body: existing?.body ?? "",
          coverStorageId: existing?.coverStorageId,
          coverAlt: p.coverAlt,
          authorName: p.authorName,
          authorRole: p.authorRole,
          tags: p.tags,
          status: "published" as PostStatus,
          publishedAt: p.publishedAt,
          updatedAt: p.updatedAt,
          readingMinutes: p.readingMinutes,
          // Javni upit NE vraća interna polja (§7), pa se ona ovde ne znaju.
          // Ranije je stajalo `ownProofChecked ?? true` i
          // `humanizerPassedAt ?? p.publishedAt` — to je IZMIŠLJANJE vrednosti:
          // post objavljen pre nego što je humanizer postojao prikazivao bi
          // „humanizer prošla" sa datumom koji je laž. Nepoznato ostaje
          // nepoznato; ekran to prikazuje kao „nije zabeleženo", ne kao prošlo.
          ownProofChecked: existing?.ownProofChecked ?? false,
          ownProofNote: existing?.ownProofNote,
          humanizerPassedAt: existing?.humanizerPassedAt,
        });
      }
    }

    const list = Array.from(map.values());
    // Sortiraj po datumu izmene/objave unazad
    list.sort((a, b) => (b.publishedAt ?? b.updatedAt) - (a.publishedAt ?? a.updatedAt));
    return list;
  }, [localPosts, publishedData, workspaceId]);

  const handleCreateNew = () => {
    setEditingPost(null);
    setActiveView("editor");
  };

  const handleEditPost = (post: PostItem) => {
    if (!moze) return;
    setEditingPost(post);
    setActiveView("editor");
  };

  const handleSavedPost = (savedPost: PostItem) => {
    // Ažuriraj lokalnu listu
    const updated = localPosts.filter((p) => p._id !== savedPost._id);
    updated.unshift(savedPost);
    persistLocalPosts(updated);
    setEditingPost(savedPost);
  };

  const handleBackToTable = () => {
    setActiveView("table");
    setEditingPost(null);
  };

  // Učitavanje Workspace-a
  if (!spreman) {
    return <NovostiDashboardSkeleton />;
  }

  // Ako radni prostor nije pronađen
  if (workspaceId === null) {
    return (
      <FeedbackNote
        tone="warning"
        title="Projekat nije izabran"
      >
        Molimo prijavite se ili izaberite projekat da biste upravljali objavama.
      </FeedbackNote>
    );
  }

  if (activeView === "editor" && moze) {
    return (
      <div className="flex flex-1 flex-col gap-6">
        {/* Uređivač ima svoje zaglavlje; ovde ostaje samo H1 za čitač ekrana. */}
        <PageHeader />
        <NovostiEditor
          key={editingPost?._id ?? "new-post"}
          initialPost={editingPost}
          workspaceId={workspaceId}
          onBack={handleBackToTable}
          onSaved={handleSavedPost}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        variant="module"
        description={DESCRIPTION}
        info={INFO}
        actions={
          moze ? (
            <Button type="button" variant="primary" onClick={handleCreateNew}>
              <Plus aria-hidden />
              Novi post
            </Button>
          ) : undefined
        }
      />

      <NovostiBoard
        posts={allPosts}
        isLoading={publishedData === undefined}
        onEditPost={moze ? handleEditPost : undefined}
      />
    </div>
  );
}

/** Zaglavlje je isto kao na učitanom ekranu, pa podaci ništa ne pomeraju. */
export function NovostiDashboardSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader variant="module" description={DESCRIPTION} />

      <Skeleton className="h-8 w-72" />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
