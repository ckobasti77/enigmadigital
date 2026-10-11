"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { LogOut, Settings, Trophy } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { NAPREDAK_HREF, screenExists, settingsNavItem } from "./nav-items";
import { SyncStatusLine } from "./sync-status";
import { PlayerAvatar, initialsOf } from "./system/player-card";
import { useWorkspace } from "./workspace-provider";

/**
 * Meni korisnika u gornjoj traci (UI Boost §7.2).
 *
 * Odjava je do sada stajala kao golo dugme u traci — retka radnja na
 * najskupljem mestu ekrana. Sada je jedan klik dalje, iza inicijala, zajedno
 * sa onim što se tiče naloga: čiji su podaci, koliko su sveži, Podešavanja i
 * Napredak.
 *
 * „Napredak" se crta tek kada njegov ekran postoji u registru navigacije
 * (`screenExists`): meni ne nudi vezu koja vodi na praznu stranu.
 */

/** Istaknuta stavka: popover i `accent` su ista površina, pa je nosi tinta. */
const ITEM =
  "h-8 cursor-pointer gap-2.5 px-2 text-ui text-text-secondary data-highlighted:bg-foreground/8 data-highlighted:text-foreground [&_svg]:text-text-muted data-highlighted:[&_svg]:text-foreground";

export function UserMenu({ className }: { className?: string }) {
  const { user, workspace, isLoading } = useWorkspace();
  const { signOut } = useAuthActions();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    // proxy.ts keeps unauthenticated users on /login from here on.
    router.push("/login");
  }

  if (isLoading) {
    return (
      <Skeleton className={cn("size-11 rounded-full md:size-8", className)} />
    );
  }

  const name = user?.name ?? user?.email ?? "Nalog";
  const initials = initialsOf(user?.name ?? user?.email ?? workspace?.name);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Meni korisnika: ${name}`}
        title="Meni korisnika"
        className={cn(
          // 44 px pod prstom, 32 px pod mišem — monogram je isti.
          "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-surface-raised aria-expanded:bg-surface-raised md:size-8",
          className,
        )}
      >
        <PlayerAvatar initials={initials} size="sm" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        // 150 ms umesto zatečenih 100: meni je panel, ne oblačić.
        className="w-60 p-1.5 shadow-elev-2 duration-(--duration-fast)"
      >
        <div className="px-2 pb-2 pt-1.5">
          <p className="truncate text-ui font-medium text-foreground">{name}</p>
          {user?.name && user.email && (
            <p className="truncate text-meta text-text-muted">{user.email}</p>
          )}
          {workspace?.name && (
            <p className="truncate text-meta text-text-muted">
              {workspace.name}
            </p>
          )}
          <SyncStatusLine className="mt-2" />
        </div>

        <DropdownMenuSeparator />

        {screenExists(NAPREDAK_HREF) && (
          <DropdownMenuLinkItem
            render={<Link href={NAPREDAK_HREF} />}
            className={ITEM}
          >
            <Trophy />
            Napredak
          </DropdownMenuLinkItem>
        )}
        <DropdownMenuLinkItem
          render={<Link href={settingsNavItem.href} />}
          className={ITEM}
        >
          <Settings />
          {settingsNavItem.label}
        </DropdownMenuLinkItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => void handleSignOut()}
          className={ITEM}
        >
          <LogOut />
          Odjava
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
