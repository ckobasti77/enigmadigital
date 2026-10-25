"use client";

import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
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
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { NAPREDAK_HREF, screenExists, settingsNavItem } from "./nav-items";
import { SyncStatusLine } from "./sync-status";
import { PlayerAvatar, initialsOf } from "./system/player-card";
import { ProjekatLink } from "./projekat-link";
import { useProjekatOpciono } from "./projekat-provider";

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
  // Nalog ne zavisi od projekta (`projekti.ja` radi i u hubu); ime projekta,
  // svežinu i veze ekrana daje provider kad ga ima. Na hubu „Svi projekti“
  // projekta nema, pa meni nosi samo nalog i odjavu.
  const ja = useQuery(api.projekti.ja);
  const projekat = useProjekatOpciono();
  const imeProjekta = projekat?.ime ?? null;
  const { signOut } = useAuthActions();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    // proxy.ts keeps unauthenticated users on /login from here on.
    router.push("/login");
  }

  if (ja === undefined) {
    return (
      <Skeleton className={cn("size-11 rounded-full md:size-8", className)} />
    );
  }

  const name = ja.ime ?? ja.email ?? "Nalog";
  const initials = initialsOf(ja.ime ?? ja.email ?? imeProjekta);

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
          {ja.ime && ja.email && (
            <p className="truncate text-meta text-text-muted">{ja.email}</p>
          )}
          {imeProjekta && (
            <p className="truncate text-meta text-text-muted">
              {imeProjekta}
            </p>
          )}
          {projekat && <SyncStatusLine className="mt-2" />}
        </div>

        <DropdownMenuSeparator />

        {projekat && (
          <>
            {screenExists(NAPREDAK_HREF) && (
              <DropdownMenuLinkItem
                render={<ProjekatLink href={NAPREDAK_HREF} />}
                className={ITEM}
              >
                <Trophy />
                Napredak
              </DropdownMenuLinkItem>
            )}
            <DropdownMenuLinkItem
              render={<ProjekatLink href={settingsNavItem.href} />}
              className={ITEM}
            >
              <Settings />
              {settingsNavItem.label}
            </DropdownMenuLinkItem>

            <DropdownMenuSeparator />
          </>
        )}


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
