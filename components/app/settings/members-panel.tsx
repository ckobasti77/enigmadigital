"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, ChevronsUpDown, LoaderCircle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FeedbackNote } from "@/components/app/feedback";
import { StatusPill } from "./status-pill";
import { useWorkspace } from "@/components/app/workspace-provider";
import { formatDateTime } from "@/lib/format";

type Clan = {
  userId: Id<"users">;
  email: string | null;
  role: "owner" | "client_viewer";
  joinedAt: number;
  hasPassword: boolean;
  emailVerified: boolean;
  inAllowlist: boolean;
  leadCount: number;
  isSelf: boolean;
};

/** Poruka iz ConvexError-a ako je server dao svoju; inače pošten fallback. */
function porukaGreske(error: unknown): string {
  const data = (error as { data?: unknown } | null)?.data;
  if (data && typeof data === "object" && "message" in data) {
    const m = (data as { message?: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
  }
  const tekst = error instanceof Error ? error.message : String(error);
  if (/Failed to fetch|NetworkError|Load failed|network|timeout/i.test(tekst)) {
    return "Server nije odgovorio. Proveri vezu i pokušaj ponovo.";
  }
  return "Uklanjanje nije uspelo iz nepoznatog razloga. Pokušaj ponovo.";
}

const ULOGA_META: Record<
  Clan["role"],
  { label: string; tone: "accent" | "muted" }
> = {
  owner: { label: "Vlasnik", tone: "accent" },
  client_viewer: { label: "Pregled", tone: "muted" },
};

function prikazAdrese(clan: Clan): string {
  return clan.email ?? "(bez adrese)";
}

export function MembersPanel() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id as Id<"workspaces"> | undefined;

  const clanovi = useQuery(
    api.membersStore.listMembers,
    workspaceId ? { workspaceId } : "skip",
  );
  const removeMember = useMutation(api.membersStore.removeMember);

  // Član koga uklanjamo (otvoren dijalog), izabrani primalac leadova, i stanja.
  const [meta, setMeta] = useState<Clan | null>(null);
  const [primalac, setPrimalac] = useState<Id<"users"> | null>(null);
  const [uklanjam, setUklanjam] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  const brojOwnera =
    clanovi?.filter((c) => c.role === "owner").length ?? 0;

  // Ostali članovi = mogući primaoci leadova (uključujući mene). Uvek bar jedan.
  const primaociZaMetu = meta
    ? (clanovi ?? []).filter((c) => c.userId !== meta.userId)
    : [];
  const izabraniPrimalac = primaociZaMetu.find((c) => c.userId === primalac);

  function otvoriUklanjanje(clan: Clan) {
    setMeta(clan);
    setPrimalac(null);
    setGreska(null);
  }

  function zatvori(next: boolean) {
    if (uklanjam || next) return;
    setMeta(null);
    setPrimalac(null);
    setGreska(null);
  }

  async function potvrdi() {
    if (!workspaceId || !meta || uklanjam) return;
    // Primalac se traži samo kad ima leadova za prenos; bez njih je izbor bez
    // dejstva, pa ga ne namećemo (ali arg mutacije ostaje popunjen — vidi dole).
    if (meta.leadCount > 0 && !primalac) {
      setGreska("Izaberi kome prelaze leadovi pre uklanjanja.");
      return;
    }
    // Kad nema leadova, tehnički primalac je svejedno (nema šta da se prenese);
    // uzimamo prvog dostupnog člana da bismo zadovoljili potpis mutacije.
    const preuzima = primalac ?? primaociZaMetu[0]?.userId;
    if (!preuzima) {
      setGreska("Nema drugog člana na koga bi leadovi mogli da pređu.");
      return;
    }

    setUklanjam(true);
    setGreska(null);
    try {
      await removeMember({
        workspaceId,
        userId: meta.userId,
        preuzimaLeadoveUserId: preuzima,
      });
      setMeta(null);
      setPrimalac(null);
    } catch (error) {
      console.error("Uklanjanje člana nije uspelo");
      setGreska(porukaGreske(error));
    } finally {
      setUklanjam(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">Članovi</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Ko ima pristup radnom prostoru. Uklanjanje briše prijavu tog naloga i
          prenosi njegove leadove na drugog člana — istorija radnji ostaje.
        </p>
      </div>

      {clanovi === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : (
        <Card className="gap-0 overflow-hidden p-0 shadow-card ring-line">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Adresa</TableHead>
                  <TableHead>Uloga</TableHead>
                  <TableHead>Pristupio</TableHead>
                  <TableHead>Lozinka</TableHead>
                  <TableHead className="text-right">Leadovi</TableHead>
                  <TableHead className="text-right">Radnja</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clanovi.map((clan) => {
                  const uloga = ULOGA_META[clan.role];
                  const poslednjiOwner =
                    clan.role === "owner" && brojOwnera <= 1;
                  return (
                    <TableRow key={clan.userId}>
                      <TableCell className="font-mono text-xs">
                        {prikazAdrese(clan)}
                      </TableCell>
                      <TableCell>
                        <StatusPill tone={uloga.tone}>{uloga.label}</StatusPill>
                      </TableCell>
                      <TableCell className="text-xs text-text-muted">
                        {formatDateTime(clan.joinedAt)}
                      </TableCell>
                      <TableCell>
                        {clan.emailVerified ? (
                          clan.hasPassword ? (
                            <StatusPill tone="success">Da</StatusPill>
                          ) : (
                            <StatusPill tone="muted">Ne</StatusPill>
                          )
                        ) : (
                          <StatusPill tone="warning">Čeka potvrdu</StatusPill>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-text-muted">
                        {clan.leadCount}
                      </TableCell>
                      <TableCell className="text-right">
                        {clan.isSelf ? (
                          <span className="text-xs text-text-muted">Vi</span>
                        ) : poslednjiOwner ? (
                          <span
                            className="text-xs text-text-muted"
                            title="Poslednji vlasnik ne može da se ukloni."
                          >
                            —
                          </span>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => otvoriUklanjanje(clan)}
                            className="text-danger hover:text-danger"
                          >
                            Ukloni
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* ─────────── Potvrda uklanjanja ─────────── */}
      <Dialog open={meta !== null} onOpenChange={zatvori}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Ukloni člana</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
              {meta && (
                <>
                  Uklanjaš{" "}
                  <span className="font-mono text-foreground">
                    {prikazAdrese(meta)}
                  </span>{" "}
                  iz radnog prostora. Nalog više neće moći da se prijavi.{" "}
                  {meta.leadCount > 0
                    ? `Njegovih ${meta.leadCount} ${
                        meta.leadCount === 1 ? "lead prelazi" : "leadova prelazi"
                      } na izabranog člana.`
                    : "Nema leadova za prenos."}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {meta && meta.leadCount > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">
                Leadovi prelaze na
              </p>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uklanjam}
                      className="w-full justify-between font-normal"
                    >
                      <span
                        className={
                          izabraniPrimalac
                            ? "font-mono text-xs"
                            : "text-text-muted"
                        }
                      >
                        {izabraniPrimalac
                          ? prikazAdrese(izabraniPrimalac)
                          : "Izaberi člana"}
                      </span>
                      <ChevronsUpDown className="size-3.5 text-text-muted" />
                    </Button>
                  }
                />
                <DropdownMenuContent className="w-(--anchor-width)">
                  <DropdownMenuRadioGroup
                    value={primalac ?? ""}
                    onValueChange={(v) => {
                      setPrimalac(v as Id<"users">);
                      setGreska(null);
                    }}
                  >
                    {primaociZaMetu.map((c) => (
                      <DropdownMenuRadioItem
                        key={c.userId}
                        value={c.userId}
                        className="font-mono text-xs"
                      >
                        {prikazAdrese(c)}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {meta?.inAllowlist && (
            <FeedbackNote tone="warning" title="Adresa je na ALLOWED_EMAILS listi">
              Uklanjanje je neće trajno zaustaviti: dok je adresa u toj listi, sme
              ponovo da napravi nalog. Ukloni je iz ALLOWED_EMAILS da bi pristup
              stvarno prestao.
            </FeedbackNote>
          )}

          {greska && (
            <FeedbackNote tone="danger" title="Uklanjanje nije uspelo">
              {greska}
            </FeedbackNote>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => zatvori(false)}
              disabled={uklanjam}
            >
              Otkaži
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={potvrdi}
              disabled={uklanjam || (meta !== null && meta.leadCount > 0 && !primalac)}
              className="bg-danger font-semibold text-text-inverse hover:bg-danger/90"
            >
              {uklanjam ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Uklanjam…
                </>
              ) : (
                <>
                  <Check className="size-3" />
                  Ukloni člana
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
