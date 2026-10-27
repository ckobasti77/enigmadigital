"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  useMoze,
  useProjekat,
  useProjekatQuery,
} from "@/components/app/projekat-provider";
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
  "Članci i beleške za sajt: nacrt, provera pre objave, pa objava.";

const INFO =
  "Pre objave: dokaz, prirodan ton, opis slike, podnaslov. Nacrti se čuvaju u bazi i vide se na svakom uređaju.";

export function NovostiDashboard() {
  const { spreman, slug, workspaceId } = useProjekat();
  // Posmatrač vidi tablu sa postovima, ali ne piše, ne uređuje i ne objavljuje.
  const moze = useMoze("urednik");

  const [activeView, setActiveView] = useState<"table" | "editor">("table");
  const [editingPost, setEditingPost] = useState<Partial<PostItem> | null>(null);
  // Objavljen post otvoren sa table: javni spisak ne nosi telo ni stanje
  // provera, pa urednik čeka ceo post iz baze (inače bi čuvanje obrisalo tekst).
  const [ceoZa, setCeoZa] = useState<Id<"posts"> | null>(null);

  // Nacrti (i zakazani i arhivirani) iz baze, pa ih ima na svakom uređaju.
  // Posmatrač ih ne čita: upit traži urednika, a on vidi samo objavljeno.
  const nacrti = useProjekatQuery(
    api.postsStore.listaNacrta,
    moze ? {} : "skip",
  );
  const ceoPost = useProjekatQuery(
    api.postsStore.zaUredjivanje,
    ceoZa ? { postId: ceoZa } : "skip",
  );

  // Upit ka Convexu za objavljene postove
  const publishedData = useQuery(
    api.postsPublic.listPublished,
    slug ? { workspaceSlug: slug, limit: 50 } : "skip",
  );

  // Spajanje nacrta iz baze sa objavljenim postovima
  const allPosts = useMemo<PostItem[]>(() => {
    const map = new Map<string, PostItem>();

    // 1. Nacrti, zakazani i arhivirani (urednik)
    for (const p of nacrti ?? []) {
      map.set(p._id, p);
    }

    // 2. Objavljeni iz javnog spiska
    if (publishedData?.posts) {
      for (const p of publishedData.posts) {
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
          // Javni spisak ne nosi telo; urednik ga čita iz `zaUredjivanje`.
          body: "",
          coverAlt: p.coverAlt,
          authorName: p.authorName,
          authorRole: p.authorRole,
          tags: p.tags,
          status: "published" as PostStatus,
          publishedAt: p.publishedAt,
          updatedAt: p.updatedAt,
          readingMinutes: p.readingMinutes,
          // Javni upit NE vraća interna polja (§7), pa se ona ovde ne znaju.
          // Nepoznato ostaje nepoznato; ekran to prikazuje kao „nije
          // zabeleženo", ne kao prošlo.
          ownProofChecked: false,
        });
      }
    }

    const list = Array.from(map.values());
    // Sortiraj po datumu izmene/objave unazad
    list.sort((a, b) => (b.publishedAt ?? b.updatedAt) - (a.publishedAt ?? a.updatedAt));
    return list;
  }, [nacrti, publishedData, workspaceId]);

  const handleCreateNew = () => {
    setEditingPost(null);
    setCeoZa(null);
    setActiveView("editor");
  };

  const handleEditPost = (post: PostItem) => {
    if (!moze) return;
    setEditingPost(post);
    setCeoZa(post.status === "published" ? post._id : null);
    setActiveView("editor");
  };

  // Spisak osvežava Convex sam; ovde se samo pamti šta je urednik otvorio.
  const handleSavedPost = (savedPost: PostItem) => {
    setCeoZa(null);
    setEditingPost(savedPost);
  };

  const handleBackToTable = () => {
    setActiveView("table");
    setEditingPost(null);
    setCeoZa(null);
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
        Za upravljanje objavama prijavi se i izaberi projekat.
      </FeedbackNote>
    );
  }

  if (activeView === "editor" && moze) {
    if (ceoZa !== null && ceoPost === undefined) {
      return <NovostiDashboardSkeleton />;
    }
    if (ceoZa !== null && ceoPost === null) {
      return (
        <div className="flex flex-1 flex-col gap-6">
          <PageHeader variant="module" description={DESCRIPTION} />
          <FeedbackNote tone="warning" title="Post više ne postoji u ovom projektu.">
            <Button type="button" variant="link" onClick={handleBackToTable}>
              Nazad na tablu
            </Button>
          </FeedbackNote>
        </div>
      );
    }
    return (
      <div className="flex flex-1 flex-col gap-6">
        {/* Uređivač ima svoje zaglavlje; ovde ostaje samo H1 za čitač ekrana. */}
        <PageHeader />
        <NovostiEditor
          key={editingPost?._id ?? "new-post"}
          initialPost={ceoZa !== null && ceoPost ? ceoPost : editingPost}
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
        isLoading={publishedData === undefined || (moze && nacrti === undefined)}
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
