"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, Copy, LoaderCircle, Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Field } from "@/components/app/form-kit";
import { FeedbackNote } from "@/components/app/feedback";
import { StatusPill } from "./status-pill";
import { useWorkspace } from "@/components/app/workspace-provider";
import { formatDateTime } from "@/lib/format";

type ZapisStatus = "vazi" | "istekla" | "iskoriscena" | "povucena";

const STATUS_META: Record<
  ZapisStatus,
  { label: string; tone: "success" | "warning" | "muted" | "danger" }
> = {
  vazi: { label: "Važi", tone: "success" },
  istekla: { label: "Istekla", tone: "warning" },
  iskoriscena: { label: "Iskorišćena", tone: "muted" },
  povucena: { label: "Povučena", tone: "danger" },
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
  return "Pozivnica nije napravljena iz nepoznatog razloga. Pokušaj ponovo.";
}

type NovaPozivnica = { token: string; email: string; expiresAt: number };

export function InvitesPanel() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id as Id<"workspaces"> | undefined;

  const invites = useQuery(
    api.invitesStore.listInvites,
    workspaceId ? { workspaceId } : "skip",
  );
  const createInvite = useMutation(api.invitesStore.createInvite);
  const revokeInvite = useMutation(api.invitesStore.revokeInvite);

  const [email, setEmail] = useState("");
  const [radim, setRadim] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const [nova, setNova] = useState<NovaPozivnica | null>(null);
  const [kopirano, setKopirano] = useState(false);
  const [povlacim, setPovlacim] = useState<string | null>(null);

  const link = nova
    ? `${
        process.env.NEXT_PUBLIC_SITE_URL ??
        (typeof window !== "undefined" ? window.location.origin : "")
      }/pozivnica/${nova.token}`
    : "";

  async function napravi(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!workspaceId || radim) return;
    setGreska(null);
    setNova(null);
    setKopirano(false);
    setRadim(true);
    try {
      const rezultat = await createInvite({ workspaceId, email: email.trim() });
      setNova(rezultat);
      setEmail("");
    } catch (error) {
      console.error("Pravljenje pozivnice nije uspelo");
      setGreska(porukaGreske(error));
    } finally {
      setRadim(false);
    }
  }

  async function kopiraj() {
    try {
      await navigator.clipboard.writeText(link);
      setKopirano(true);
      window.setTimeout(() => setKopirano(false), 2000);
    } catch {
      setKopirano(false);
    }
  }

  async function povuci(inviteId: Id<"invites">) {
    if (!workspaceId || povlacim) return;
    setPovlacim(inviteId);
    try {
      await revokeInvite({ workspaceId, inviteId });
    } catch (error) {
      console.error("Povlačenje pozivnice nije uspelo");
      setGreska(porukaGreske(error));
    } finally {
      setPovlacim(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* ─────────── Pravljenje pozivnice ─────────── */}
      <Card className="gap-0 p-5 shadow-card ring-line">
        <h3 className="text-sm font-medium text-foreground">Nova pozivnica</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Unesi email osobe. Dobićeš link koji joj prosleđuješ ručno — registruje
          se sa tačno tom adresom. Link se prikazuje jednom; posle zatvaranja se
          ne može ponovo videti.
        </p>

        <form onSubmit={napravi} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Email" className="flex-1">
            {(field) => (
              <Input
                {...field}
                name="invite-email"
                type="email"
                autoComplete="off"
                placeholder="kolega@enigmait.rs"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setGreska(null);
                }}
                disabled={radim || !workspaceId}
                className="h-10"
              />
            )}
          </Field>
          <Button
            type="submit"
            disabled={radim || !workspaceId || email.trim().length === 0}
            className="h-10 shrink-0"
          >
            {radim ? (
              <>
                <LoaderCircle className="animate-spin" />
                Pravim…
              </>
            ) : (
              <>
                <Plus />
                Napravi pozivnicu
              </>
            )}
          </Button>
        </form>

        {greska && (
          <FeedbackNote tone="danger" title="Pozivnica nije napravljena" className="mt-4">
            {greska}
          </FeedbackNote>
        )}

        {nova && (
          <div className="mt-4 rounded-lg border border-accent-400/30 bg-accent-400/5 p-4">
            <p className="text-xs font-medium text-foreground">
              Pozivnica za <span className="font-mono">{nova.email}</span> je
              napravljena.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-surface-raised px-2.5 py-2 font-mono text-xs text-text-muted">
                {link}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={kopiraj}
                className="shrink-0 text-text-muted hover:text-foreground"
              >
                {kopirano ? (
                  <>
                    <Check className="size-3 text-success" />
                    Kopirano
                  </>
                ) : (
                  <>
                    <Copy className="size-3" />
                    Kopiraj
                  </>
                )}
              </Button>
            </div>
            <p className="mt-2 text-micro text-text-muted">
              Važi do {formatDateTime(nova.expiresAt)}. Sačuvaj link sada — nećeš
              ga ponovo videti.
            </p>
          </div>
        )}
      </Card>

      {/* ─────────── Spisak pozivnica ─────────── */}
      {invites === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : invites.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface/40 px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">Još nema pozivnica</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Napravi prvu pozivnicu gore da bi neko dobio pristup.
          </p>
        </div>
      ) : (
        <Card className="gap-0 overflow-hidden p-0 shadow-card ring-line">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Adresa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Napravljena</TableHead>
                  <TableHead>Ističe</TableHead>
                  <TableHead>Napravio</TableHead>
                  <TableHead className="text-right">Radnja</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((inv) => {
                  const meta = STATUS_META[inv.status];
                  return (
                    <TableRow key={inv._id}>
                      <TableCell className="font-mono text-xs">{inv.email}</TableCell>
                      <TableCell>
                        <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                      </TableCell>
                      <TableCell className="text-xs text-text-muted">
                        {formatDateTime(inv.createdAt)}
                      </TableCell>
                      <TableCell className="text-xs text-text-muted">
                        {formatDateTime(inv.expiresAt)}
                      </TableCell>
                      <TableCell className="text-xs text-text-muted">
                        {inv.createdByEmail ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {inv.status === "vazi" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={povlacim === inv._id}
                            onClick={() => povuci(inv._id)}
                            className="text-danger hover:text-danger"
                          >
                            {povlacim === inv._id ? (
                              <>
                                <LoaderCircle className="size-3 animate-spin" />
                                Povlačim…
                              </>
                            ) : (
                              "Povuci"
                            )}
                          </Button>
                        ) : (
                          <span className="text-xs text-text-muted">—</span>
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
    </div>
  );
}
