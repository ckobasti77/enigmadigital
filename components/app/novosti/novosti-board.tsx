"use client";

import { useMemo, useState, type ComponentType } from "react";
import {
  Archive,
  CalendarClock,
  FileText,
  Filter,
  Newspaper,
  Search,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/app/system/empty-state";
import { useMoze } from "@/components/app/projekat-provider";
import {
  POST_CATEGORIES,
  getCategoryLabel,
  getKindLabel,
  type PostItem,
  type PostStatus,
} from "./novosti-types";
import { formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Tabla po statusu (UI Boost §8): nacrt → zakazano → objavljeno → arhiva.
 * Boja kolone je STANJE posta — nacrt čeka (upozorenje), objavljeno je gotovo
 * (uspeh), arhiva je van prikaza (neutralno) — i uvek ide uz ikonicu i naziv.
 *
 * Kolona „Zakazano" se crta samo kad ima šta da pokaže: prazna stalna kolona
 * bi obećavala radnju koju ovaj ekran ne nudi.
 */
type Column = {
  status: PostStatus;
  label: string;
  empty: string;
  icon: ComponentType<{ className?: string }>;
  /** Traka zaglavlja kolone i tačka na kartici. */
  head: string;
  dot: string;
};

const COLUMNS: Column[] = [
  {
    status: "draft",
    label: "Nacrti",
    empty: "Nema nacrta.",
    icon: FileText,
    head: "border-warning-line bg-warning-soft text-warning",
    dot: "bg-warning",
  },
  {
    status: "scheduled",
    label: "Zakazano",
    empty: "Ništa nije zakazano.",
    icon: CalendarClock,
    head: "border-info-line bg-info-soft text-info",
    dot: "bg-info",
  },
  {
    status: "published",
    label: "Objavljeno",
    empty: "Još ništa nije objavljeno.",
    icon: Send,
    head: "border-success-line bg-success-soft text-success",
    dot: "bg-success",
  },
  {
    status: "archived",
    label: "Arhiva",
    empty: "Arhiva je prazna.",
    icon: Archive,
    head: "border-line bg-surface-raised text-text-muted",
    dot: "bg-text-muted",
  },
];

/** Koliko kartica kolona pokazuje pre „Prikaži sve". */
const COLUMN_PREVIEW = 6;

export function NovostiBoard({
  posts,
  isLoading,
  onEditPost,
}: {
  posts: PostItem[];
  isLoading: boolean;
  /** Bez njega (posmatrač) kartice se samo čitaju: nisu dugme i ne otvaraju formu. */
  onEditPost?: (post: PostItem) => void;
}) {
  const moze = useMoze("urednik");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const filteredPosts = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return posts.filter((post) => {
      if (selectedCategory !== "all" && post.category !== selectedCategory) {
        return false;
      }
      if (!query) return true;
      return (
        post.title.toLowerCase().includes(query) ||
        post.slug.toLowerCase().includes(query) ||
        post.dek.toLowerCase().includes(query) ||
        (post.tags?.some((t) => t.toLowerCase().includes(query)) ?? false)
      );
    });
  }, [posts, selectedCategory, searchQuery]);

  const hasScheduled = posts.some((p) => p.status === "scheduled");
  const columns = COLUMNS.filter(
    (c) => c.status !== "scheduled" || hasScheduled,
  );
  const filtering = selectedCategory !== "all" || searchQuery.trim() !== "";

  if (!isLoading && posts.length === 0) {
    // Posmatraču se ne nudi pisanje: samo činjenica da još nema postova.
    if (!moze) {
      return (
        <EmptyState icon={Newspaper} title="Još nema postova">
          Ovde će stajati članci i beleške za sajt, čim ih urednici napišu.
        </EmptyState>
      );
    }
    return (
      <EmptyState
        icon={Newspaper}
        variant="mission"
        title="Napiši prvi post"
        steps={[
          { label: "Napiši nacrt: beleška ili tekst" },
          { label: "Prođi četiri kapije pre objave" },
          { label: "Objavi post na sajtu" },
        ]}
      >
        Ovde se pišu članci i beleške za sajt. „Novi post“ otvara prazan nacrt.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-48 max-w-xs flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-text-muted"
            aria-hidden
          />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pretraži po naslovu ili tagu"
            aria-label="Pretraga postova"
            className="h-8 pl-8 text-ui"
          />
        </div>

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="h-8 cursor-pointer rounded-lg border border-input bg-surface px-2.5 text-ui text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label="Filter po kategoriji"
        >
          <option value="all">Sve kategorije</option>
          {POST_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {!isLoading && filtering && filteredPosts.length === 0 ? (
        <EmptyState icon={Filter} size="sm" title="Nema postova za ovaj izbor">
          Promeni pretragu ili kategoriju.
        </EmptyState>
      ) : (
        <div
          className={cn(
            "grid grid-cols-1 items-start gap-4",
            columns.length === 4 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3",
          )}
        >
          {columns.map((column) => (
            <BoardColumn
              key={column.status}
              column={column}
              posts={filteredPosts.filter((p) => p.status === column.status)}
              isLoading={isLoading}
              onEditPost={onEditPost}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BoardColumn({
  column,
  posts,
  isLoading,
  onEditPost,
}: {
  column: Column;
  posts: PostItem[];
  isLoading: boolean;
  onEditPost?: (post: PostItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = column.icon;
  const shown = expanded ? posts : posts.slice(0, COLUMN_PREVIEW);

  return (
    <section
      aria-label={column.label}
      className="flex min-w-0 flex-col gap-2"
    >
      <header
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-2",
          column.head,
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <h2 className="heading-caps min-w-0 flex-1 truncate text-meta font-medium">
          {column.label}
        </h2>
        <span className="font-mono text-ui font-bold tabular-nums">
          {isLoading ? "—" : formatNumber(posts.length)}
        </span>
      </header>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-line bg-card p-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="mt-2 h-3 w-1/2" />
              <Skeleton className="mt-3 h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-ui text-text-muted">
          {column.empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((post) => (
            <li key={post._id}>
              <PostCard post={post} dot={column.dot} onEdit={onEditPost} />
            </li>
          ))}
        </ul>
      )}

      {!isLoading && posts.length > COLUMN_PREVIEW && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
          className="self-start text-text-muted"
        >
          {expanded ? "Prikaži manje" : `Prikaži sve (${formatNumber(posts.length)})`}
        </Button>
      )}
    </section>
  );
}

function PostCard({
  post,
  dot,
  onEdit,
}: {
  post: PostItem;
  dot: string;
  onEdit?: (post: PostItem) => void;
}) {
  const sadrzaj = (
    <>
      <span className="flex items-start gap-2">
        <span
          aria-hidden
          className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", dot)}
        />
        <span className="line-clamp-2 min-w-0 flex-1 text-copy font-medium text-foreground">
          {post.title || "Bez naslova"}
        </span>
      </span>
      <span className="truncate pl-3.5 font-mono text-meta text-text-muted">
        /novosti/{post.slug}
      </span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-3.5 text-meta text-text-muted">
        <span className="rounded-md border border-line bg-surface-raised px-1.5 py-0.5 text-foreground">
          {getKindLabel(post.kind)}
        </span>
        <span className="truncate">{getCategoryLabel(post.category)}</span>
      </span>
      <span className="pl-3.5 font-mono text-meta tabular-nums text-text-muted">
        {post.publishedAt
          ? `objavljeno ${formatDateTime(post.publishedAt)}`
          : `izmenjeno ${formatDateTime(post.updatedAt)}`}
      </span>
    </>
  );

  if (!onEdit) {
    return (
      <div className="flex w-full flex-col gap-1.5 rounded-lg border border-line bg-card p-3 text-left shadow-card">
        {sadrzaj}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onEdit(post)}
      className="group/post hover-lift flex w-full cursor-pointer flex-col gap-1.5 rounded-lg border border-line bg-card p-3 text-left shadow-card transition-colors hover:border-mod-line focus-visible:border-mod-line focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {sadrzaj}
    </button>
  );
}
