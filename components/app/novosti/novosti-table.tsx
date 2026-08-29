"use client";

import { useMemo, useState } from "react";
import {
  FileText,
  Filter,
  Plus,
  Search,
  Calendar,
  Layers,
  Edit,
  Tag,
  Eye,
  CheckCircle2,
  Clock,
  Archive,
  AlertCircle,
  Newspaper,
  BookOpen,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/app/empty-state";
import {
  POST_CATEGORIES,
  POST_STATUSES,
  getCategoryLabel,
  getKindLabel,
  getStatusLabel,
  type PostCategory,
  type PostItem,
  type PostKind,
  type PostStatus,
} from "./novosti-types";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface NovostiTableProps {
  posts: PostItem[];
  isLoading: boolean;
  onEditPost: (post: PostItem) => void;
  onCreatePost: () => void;
}

export function NovostiTable({
  posts,
  isLoading,
  onEditPost,
  onCreatePost,
}: NovostiTableProps) {
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Filtriranje u memoriji
  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      // 1. Filter po statusu
      if (selectedStatus !== "all" && post.status !== selectedStatus) {
        return false;
      }

      // 2. Filter po kategoriji
      if (selectedCategory !== "all" && post.category !== selectedCategory) {
        return false;
      }

      // 3. Pretraga po tekstu
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesTitle = post.title.toLowerCase().includes(query);
        const matchesSlug = post.slug.toLowerCase().includes(query);
        const matchesDek = post.dek.toLowerCase().includes(query);
        const matchesTag = post.tags?.some((t) =>
          t.toLowerCase().includes(query),
        );
        if (!matchesTitle && !matchesSlug && !matchesDek && !matchesTag) {
          return false;
        }
      }

      return true;
    });
  }, [posts, selectedStatus, selectedCategory, searchQuery]);

  return (
    <div className="flex flex-col gap-4">
      {/* Kontrole za filtere i pretragu */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Pretraga */}
          <div className="relative min-w-48 max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-muted" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pretraži po naslovu, tagu..."
              className="h-8 pl-8 text-xs"
            />
          </div>

          {/* Filter po statusu */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="h-8 rounded-lg border border-input bg-surface px-2.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label="Filter po statusu"
          >
            <option value="all">Svi statusi ({posts.length})</option>
            {POST_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({posts.filter((p) => p.status === s.id).length})
              </option>
            ))}
          </select>

          {/* Filter po kategoriji */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-8 rounded-lg border border-input bg-surface px-2.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label="Filter po kategoriji"
          >
            <option value="all">Sve teme / kategorije</option>
            {POST_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <Button type="button" size="sm" onClick={onCreatePost} className="gap-1.5">
          <Plus className="size-4" />
          <span>Novi post</span>
        </Button>
      </div>

      {/* Tabela postova */}
      <Card className="overflow-hidden rounded-xl border border-line bg-surface/50">
        <Table>
          <TableHeader>
            <TableRow className="border-line hover:bg-transparent">
              <TableHead className="w-[40%] text-xs font-semibold text-text-muted">
                Naslov
              </TableHead>
              <TableHead className="w-[15%] text-xs font-semibold text-text-muted">
                Vrsta (§3)
              </TableHead>
              <TableHead className="w-[20%] text-xs font-semibold text-text-muted">
                Kategorija (§2)
              </TableHead>
              <TableHead className="w-[12%] text-xs font-semibold text-text-muted">
                Status
              </TableHead>
              <TableHead className="w-[13%] text-right text-xs font-semibold text-text-muted">
                Datum objave
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              // Skelet učitavanja — razlikuje se od praznog stanja
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i} className="border-line/50">
                  <TableCell>
                    <div className="flex flex-col gap-1.5">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Skeleton className="ml-auto h-4 w-24" />
                  </TableCell>
                </TableRow>
              ))
            ) : filteredPosts.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-12 text-center">
                  {posts.length === 0 ? (
                    <EmptyState icon={Newspaper}>
                      Još nema kreiranih postova u ovom radnom prostoru.
                    </EmptyState>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center text-text-muted">
                      <Filter className="mb-2 size-6 opacity-40" />
                      <p className="text-xs font-medium text-foreground">
                        Nema postova za izabrane filtere
                      </p>
                      <p className="mt-1 text-micro text-text-muted">
                        Pokušajte da promenite filter statusa ili kategorije.
                      </p>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              filteredPosts.map((post) => (
                <TableRow
                  key={post._id}
                  onClick={() => onEditPost(post)}
                  className="cursor-pointer border-line/60 transition-colors hover:bg-surface-raised"
                >
                  {/* Kolona 1: Naslov */}
                  <TableCell className="py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-foreground">
                        {post.title}
                      </span>
                      <span className="font-mono text-micro text-text-muted">
                        /novosti/{post.slug}
                      </span>
                    </div>
                  </TableCell>

                  {/* Kolona 2: Vrsta */}
                  <TableCell className="py-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md px-2 py-0.5 text-micro font-medium",
                        post.kind === "note"
                          ? "bg-accent-400/10 text-accent-400"
                          : "bg-surface-raised border border-line text-foreground",
                      )}
                    >
                      {post.kind === "note" ? "note (beleška)" : "article (tekst)"}
                    </span>
                  </TableCell>

                  {/* Kolona 3: Kategorija */}
                  <TableCell className="py-3 text-xs text-text-secondary">
                    {getCategoryLabel(post.category)}
                  </TableCell>

                  {/* Kolona 4: Status */}
                  <TableCell className="py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-micro font-medium",
                        post.status === "published"
                          ? "bg-success/15 text-success"
                          : post.status === "scheduled"
                            ? "bg-accent-400/15 text-accent-400"
                            : post.status === "archived"
                              ? "bg-muted text-text-muted"
                              : "bg-warning/15 text-warning",
                      )}
                    >
                      <StatusDot status={post.status} />
                      <span>{getStatusLabel(post.status)}</span>
                    </span>
                  </TableCell>

                  {/* Kolona 5: Datum objave */}
                  <TableCell className="py-3 text-right text-xs text-text-muted">
                    {post.publishedAt ? (
                      formatDateTime(post.publishedAt)
                    ) : (
                      <span className="text-text-muted/60">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function StatusDot({ status }: { status: PostStatus }) {
  switch (status) {
    case "published":
      return <span className="size-1.5 rounded-full bg-success" />;
    case "scheduled":
      return <span className="size-1.5 rounded-full bg-accent-400" />;
    case "archived":
      return <span className="size-1.5 rounded-full bg-text-muted" />;
    case "draft":
    default:
      return <span className="size-1.5 rounded-full bg-warning" />;
  }
}
