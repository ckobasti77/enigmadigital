"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { Bell, LogOut, Settings, Trophy, UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { useOpseg } from "./opseg-ljuske";
import { useJaNalog } from "./podaci-ljuske";
import { NotificationSettingsDialog } from "./prostor/inbox/notification-settings-dialog";
import { ProfilDijalog } from "./prostor/profil/profil-dijalog";
import { SyncStatusLine } from "./sync-status";
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
 *
 * SPAJANJE (P14, plan S07 D11): na širem ekranu meni stoji na dnu trake
 * projekata (`variant="traka"`), a u zaglavlju samo ispod `md`, gde trake
 * nema. „Profil“ otvara ime i sliku koje tim vidi (P6); posmatrač profil
 * radnog dela nema (O5), pa ni stavku. „Obaveštenja“ (S17) otvara vrste,
 * tihe sate i web push na ovom uređaju; isto važi i za nju.
 */

/** Istaknuta stavka: popover i `accent` su ista površina, pa je nosi tinta. */
const ITEM =
  "h-8 cursor-pointer gap-2.5 px-2 text-ui text-text-secondary data-highlighted:bg-foreground/8 data-highlighted:text-foreground [&_svg]:text-text-muted data-highlighted:[&_svg]:text-foreground";

export function UserMenu({
  className,
  variant = "zaglavlje",
}: {
  className?: string;
  /** `traka`: dno trake projekata (od `md`); `zaglavlje`: gornja traka. */
  variant?: "zaglavlje" | "traka";
}) {
  // Nalog ne zavisi od projekta (`projekti.ja` radi i u „Ja“); ime projekta,
  // svežinu i veze ekrana daje provider kad ga ima. U „Ja“ projekta nema, pa
  // meni nosi nalog, profil i odjavu.
  const ja = useJaNalog();
  const opseg = useOpseg();
  const uProjektu = useProjekatOpciono();
  const projekat = opseg === "projekat" ? uProjektu : null;
  const imeProjekta = projekat?.ime ?? null;
  const { signOut } = useAuthActions();
  const router = useRouter();
  const [profil, setProfil] = useState(false);
  const [obavestenja, setObavestenja] = useState(false);
  const traka = variant === "traka";

  async function handleSignOut() {
    await signOut();
    // proxy.ts keeps unauthenticated users on /login from here on.
    router.push("/login");
  }

  if (ja === undefined) {
    return (
      <Skeleton
        className={cn(
          "rounded-full",
          traka ? "size-9" : "size-11 md:size-8",
          className,
        )}
      />
    );
  }

  const name = ja.ime;

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Meni korisnika: ${name}`}
        title="Meni korisnika"
        className={cn(
          // 44 px pod prstom, 32 px pod mišem — monogram je isti. U traci je
          // meta 44 px u oba slučaja, kao i pločice iznad nje.
          "flex shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-surface-raised aria-expanded:bg-surface-raised",
          traka ? "size-11" : "size-11 md:size-8",
          className,
        )}
      >
        <Avatar size={traka ? "lg" : "sm"} className={traka ? "size-9" : "size-7"}>
          {ja.avatarUrl && <AvatarImage src={ja.avatarUrl} alt="" />}
          <AvatarFallback>{ja.inicijali}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side={traka ? "right" : "bottom"}
        align="end"
        sideOffset={8}
        // 150 ms umesto zatečenih 100: meni je panel, ne oblačić.
        className="w-60 p-1.5 shadow-elev-2 duration-(--duration-fast)"
      >
        <div className="px-2 pb-2 pt-1.5">
          <p className="truncate text-ui font-medium text-foreground">{name}</p>
          {ja.email && ja.email !== name && (
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

        {ja.imaProfil && (
          <DropdownMenuItem onClick={() => setProfil(true)} className={ITEM}>
            <UserRound />
            Profil
          </DropdownMenuItem>
        )}
        {ja.imaProfil && (
          <DropdownMenuItem onClick={() => setObavestenja(true)} className={ITEM}>
            <Bell />
            Obaveštenja
          </DropdownMenuItem>
        )}

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
    <ProfilDijalog open={profil} onOpenChange={setProfil} />
    {ja.imaProfil && <NotificationSettingsDialog open={obavestenja} onOpenChange={setObavestenja} />}
    </>
  );
}
