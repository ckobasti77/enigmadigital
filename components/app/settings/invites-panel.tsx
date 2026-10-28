"use client";

import { useState, type FormEvent } from "react";
import { Check, Copy, LoaderCircle, Plus, Trash2 } from "lucide-react";
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
import {
  useMoze,
  useProjekat,
  useProjekatMutation,
  useProjekatQuery,
} from "@/components/app/projekat-provider";
import { SegmentedToggle } from "@/components/app/analytics/segmented-toggle";
import { formatDateTime } from "@/lib/format";
import { NAZIV_ULOGE, type Uloga } from "@/convex/lib/uloge";

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

type NovaPozivnica = {
  token: string;
  email: string;
  expiresAt: number;
  panelOrigin: string | null;
};

/** Urednik je podrazumevan: radi posao, a veze i članove ostavlja vlasniku. */
const ULOGE_POZIVNICE: readonly { value: Uloga; label: string }[] = [
  { value: "urednik", label: NAZIV_ULOGE.urednik },
  { value: "client_viewer", label: NAZIV_ULOGE.client_viewer },
  { value: "owner", label: NAZIV_ULOGE.owner },
];

const OPIS_ULOGE: Record<Uloga, string> = {
  urednik: "Radi sa leadovima, objavama i porukama; ne dira veze, članove ni podešavanja.",
  client_viewer: "Samo gleda brojeve i sadržaj; ne menja ništa.",
  owner: "Sve, uključujući veze, brisanje, članove i podešavanja projekta.",
};

export function InvitesPanel() {
  const { spreman } = useProjekat();
  const jeVlasnik = useMoze("owner");

  const invites = useProjekatQuery(
    api.invitesStore.listInvites,
    jeVlasnik ? {} : "skip",
  );
  const createInvite = useProjekatMutation(api.invitesStore.createInvite);
  const revokeInvite = useProjekatMutation(api.invitesStore.revokeInvite);
  const deleteInvite = useProjekatMutation(api.invitesStore.deleteInvite);

  const [email, setEmail] = useState("");
  const [uloga, setUloga] = useState<Uloga>("urednik");
  const [radim, setRadim] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const [nova, setNova] = useState<NovaPozivnica | null>(null);
  const [kopirano, setKopirano] = useState(false);
  const [povlacim, setPovlacim] = useState<string | null>(null);
  const [brisem, setBrisem] = useState<string | null>(null);

  // Link vodi na panel domen projekta kad ga ima, inače na adresu sa koje je
  // pozivnica napravljena (hub ili lokalni razvoj).
  const link = nova
    ? `${
        nova.panelOrigin ??
        (typeof window !== "undefined" ? window.location.origin : "")
      }/pozivnica/${nova.token}`
    : "";

  // Pozivnice pravi i vidi samo vlasnik projekta (isto kao tokeni ispod):
  // pozivnica je novi nalog sa pristupom projektu.
  if (!jeVlasnik) return null;

  async function napravi(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!spreman || radim) return;
    setGreska(null);
    setNova(null);
    setKopirano(false);
    setRadim(true);
    try {
      const rezultat = await createInvite({ email: email.trim(), uloga });
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
    if (!spreman || povlacim) return;
    setPovlacim(inviteId);
    try {
      await revokeInvite({ inviteId });
    } catch (error) {
      console.error("Povlačenje pozivnice nije uspelo");
      setGreska(porukaGreske(error));
    } finally {
      setPovlacim(null);
    }
  }

  async function obrisi(inviteId: Id<"invites">) {
    if (!spreman || brisem) return;
    setBrisem(inviteId);
    try {
      await deleteInvite({ inviteId });
    } catch (error) {
      console.error("Brisanje pozivnice nije uspelo");
      setGreska(porukaGreske(error));
    } finally {
      setBrisem(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* ─────────── Pravljenje pozivnice ─────────── */}
      <Card className="gap-0 p-5 shadow-card ring-line">
        <h3 className="text-sm font-medium text-foreground">Nova pozivnica</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Unesi email osobe. Dobićeš link koji joj prosleđuješ ručno — registruje
          se sa tačno tom adresom, a ko već ima nalog prihvata poziv posle
          prijave. Link se prikazuje jednom; posle zatvaranja se ne može ponovo
          videti.
        </p>

        <div className="mt-4 flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground">Uloga</span>
          <SegmentedToggle
            options={ULOGE_POZIVNICE}
            value={uloga}
            onChange={setUloga}
            ariaLabel="Uloga u projektu"
            className="self-start"
          />
          <p className="text-xs text-text-muted">{OPIS_ULOGE[uloga]}</p>
        </div>

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
                disabled={radim || !spreman}
                className="h-10"
              />
            )}
          </Field>
          <Button
            variant="primary"
            type="submit"
            disabled={radim || !spreman || email.trim().length === 0}
            className="touch-target h-10 shrink-0"
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
          <div className="mt-4 rounded-lg border border-mod-line bg-mod-soft p-4">
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
                  <TableHead>Uloga</TableHead>
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
                      <TableCell className="text-xs text-text-muted">
                        {NAZIV_ULOGE[inv.uloga]}
                      </TableCell>
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
                            className="touch-target text-danger hover:text-danger"
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
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={brisem === inv._id}
                            onClick={() => obrisi(inv._id)}
                            className="touch-target text-text-muted hover:text-danger"
                            aria-label="Obriši pozivnicu iz istorije"
                          >
                            {brisem === inv._id ? (
                              <LoaderCircle className="size-3 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
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
    </div>
  );
}
