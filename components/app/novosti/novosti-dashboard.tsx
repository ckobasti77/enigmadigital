"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useWorkspace } from "@/components/app/workspace-provider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackNote } from "@/components/app/feedback";
import { NovostiTable } from "./novosti-table";
import { NovostiEditor } from "./novosti-editor";
import {
  type PostItem,
  type PostStatus,
  type PostCategory,
  type PostKind,
} from "./novosti-types";
import {
  FileText,
  Plus,
  RefreshCw,
  AlertCircle,
  Newspaper,
  BookOpen,
  Send,
  SlidersHorizontal,
} from "lucide-react";
import { Reveal } from "@/components/motion/reveal";

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
  const { workspace, isLoading: isWorkspaceLoading } = useWorkspace();
  const workspaceSlug = workspace?.slug;
  const workspaceId = workspace?.id as Id<"workspaces"> | undefined;

  const [activeView, setActiveView] = useState<"table" | "editor">("table");
  const [editingPost, setEditingPost] = useState<Partial<PostItem> | null>(null);

  // Lokalno evidentirani postovi (nacrti i novokreirani)
  const [localPosts, setLocalPosts] = useState<PostItem[]>([]);

  // Učitaj lokalne nacrte kad se sazna workspaceId
  useEffect(() => {
    if (workspaceId) {
      setLocalPosts(loadLocalDrafts(workspaceId));
    }
  }, [workspaceId]);

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
    workspaceSlug ? { workspaceSlug, limit: 50 } : "skip",
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
          workspaceId: workspaceId,
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
  if (isWorkspaceLoading) {
    return <NovostiDashboardSkeleton />;
  }

  // Ako radni prostor nije pronađen
  if (!workspace || !workspaceId) {
    return (
      <FeedbackNote
        tone="warning"
        title="Radni prostor nije izabran"
      >
        Molimo prijavite se ili izaberite aktivan radni prostor da biste upravljali objavama.
      </FeedbackNote>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      {activeView === "editor" ? (
        <Reveal>
          <NovostiEditor
            key={editingPost?._id ?? "new-post"}
            initialPost={editingPost}
            workspaceId={workspaceId}
            onBack={handleBackToTable}
            onSaved={handleSavedPost}
          />
        </Reveal>
      ) : (
        <Reveal>
          <div className="flex flex-col gap-6">
            {/* Pregled statistike postova */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile
                label="Ukupno objava"
                value={allPosts.length}
                icon={Newspaper}
              />
              <StatTile
                label="Objavljeno"
                value={allPosts.filter((p) => p.status === "published").length}
                icon={Send}
                tone="success"
              />
              <StatTile
                label="Nacrti u pripremi"
                value={allPosts.filter((p) => p.status === "draft").length}
                icon={FileText}
                tone="warning"
              />
              <StatTile
                label="Arhivirano"
                value={allPosts.filter((p) => p.status === "archived").length}
                icon={BookOpen}
              />
            </div>

            {/* Tabela sa postovima */}
            <NovostiTable
              posts={allPosts}
              isLoading={publishedData === undefined}
              onEditPost={handleEditPost}
              onCreatePost={handleCreateNew}
            />
          </div>
        </Reveal>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "success" | "warning";
}) {
  return (
    <Card className="rounded-xl border border-line bg-surface/50 p-3.5">
      <div className="flex items-center justify-between">
        <span className="heading-caps text-micro font-medium text-text-muted">
          {label}
        </span>
        <Icon className="size-3.5 text-text-muted" />
      </div>
      <p
        className={`mt-2 font-mono text-xl font-bold ${
          tone === "success"
            ? "text-success"
            : tone === "warning"
              ? "text-warning"
              : "text-foreground"
        }`}
      >
        {value}
      </p>
    </Card>
  );
}

export function NovostiDashboardSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="rounded-xl border border-line bg-surface/50 p-3.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-6 w-12" />
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-28" />
      </div>

      <Card className="overflow-hidden rounded-xl border border-line p-4">
        <div className="flex flex-col gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-1/6" />
              <Skeleton className="h-4 w-1/6" />
              <Skeleton className="h-4 w-1/8" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
