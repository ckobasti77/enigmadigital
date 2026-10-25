"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ChevronRight, FolderOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { NAZIV_ULOGE } from "@/convex/lib/uloge";
import { cn } from "@/lib/utils";
import { EmptyState } from "../system/empty-state";
import { initials } from "../system/monogram";
import { NOVI_PROJEKAT_HREF, NOVI_PROJEKAT_POSTOJI } from "../nav-items";
import { UserMenu } from "../user-menu";

/**
 * Hub „Svi projekti“ (`/` van panela). Za sada jednostavan spisak projekata
 * u kojima je korisnik član, redom članstva; pun ekran (brojke po projektu,
 * zbirno „šta me čeka“) dolazi kasnije.
 *
 * Hub je van projekta, pa veze vode eksplicitno na `/<slug>` (`next/link`),
 * a ne kroz `ProjekatLink`.
 */

/** Ista širina i iste ivice kao gornja traka ljuske projekta. */
const ROW = "mx-auto w-full max-w-[var(--content-max)] px-[var(--gutter)]";

export function SviProjekti() {
  const projekti = useQuery(api.projekti.mojiProjekti);
  const ja = useQuery(api.projekti.ja);
  const praviProjekte = NOVI_PROJEKAT_POSTOJI && ja?.platformaVlasnik === true;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="material edge-fade-b sticky top-0 z-30 shrink-0">
        <div className={cn(ROW, "flex h-[var(--chrome-height)] items-center gap-3")}>
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            Svi projekti
          </h1>
          {praviProjekte && (
            <Button
              variant="secondary"
              size="sm"
              nativeButton={false}
              render={<Link href={NOVI_PROJEKAT_HREF} />}
              className="touch-target"
            >
              <Plus aria-hidden />
              Novi projekat
            </Button>
          )}
          <UserMenu />
        </div>
      </header>

      <main
        id="sadrzaj"
        tabIndex={-1}
        className={cn(ROW, "flex flex-1 flex-col py-8 outline-none")}
      >
        {projekti === undefined ? (
          <SpisakSkeleton />
        ) : projekti.length === 0 ? (
          <EmptyState icon={FolderOpen} size="lg" title="Nisi član nijednog projekta." />
        ) : (
          <ul
            aria-label="Projekti"
            // `focus-inset`: okvir fokusa ide unutra, inače ga odseca ivica liste.
            className="focus-inset w-full max-w-2xl divide-y divide-line overflow-hidden rounded-xl border border-line bg-card"
          >
            {projekti.map((p) => (
              <li key={p.workspaceId}>
                <Link
                  href={`/${p.slug}`}
                  className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-raised"
                >
                  <span
                    aria-hidden
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-raised text-copy font-bold leading-none text-foreground ring-1 ring-line group-hover:bg-card"
                  >
                    {initials(p.kratkoIme ?? p.ime)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-copy font-medium text-foreground">
                      {p.ime}
                    </span>
                    <span className="truncate text-meta text-text-muted">
                      {NAZIV_ULOGE[p.uloga]}
                      {p.arhiviran && " · arhiviran"}
                    </span>
                  </span>
                  <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function SpisakSkeleton() {
  return (
    <div className="w-full max-w-2xl divide-y divide-line rounded-xl border border-line bg-card" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i} className="flex min-h-14 items-center gap-3 px-4 py-3">
          <Skeleton className="size-10 rounded-lg" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
