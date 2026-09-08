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
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Field } from "@/components/app/form-kit";
import { FeedbackNote } from "@/components/app/feedback";
import { StatusPill } from "./status-pill";
import { useWorkspace } from "@/components/app/workspace-provider";
import { formatDateTime } from "@/lib/format";

/**
 * „Tokeni za uvoz (skill)" — Podešavanja → Pristup (GL1, plan §5).
 *
 * Token je Bearer ključ za `POST /generate-leads/ingest`: sa njim skill sa
 * Jovanove mašine pravi uvoz u staging, bez sesije i bez lozinke.
 *
 * SIROV TOKEN SE VIDI TAČNO JEDNOM — u modalu odmah posle pravljenja. Posle
 * zatvaranja ne postoji nigde osim tamo gde ga je čovek zalepio; izgubljen se
 * opoziva i pravi novi. Baza nosi samo SHA-256 heš.
 *
 * Sekciju vidi samo vlasnik. Provera nije samo ovde: `createIngestToken`,
 * `listIngestTokens` i `revokeIngestToken` idu kroz `requireOwner`, pa poziv
 * mimo ekrana ne prolazi.
 */

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
  return "Radnja nije uspela. Pokušaj ponovo.";
}

export function IngestTokensPanel() {
  const { workspace, role } = useWorkspace();
  const workspaceId = workspace?.id as Id<"workspaces"> | undefined;
  const jeVlasnik = role === "owner";

  const tokens = useQuery(
    api.ingestTokensStore.listIngestTokens,
    workspaceId && jeVlasnik ? { workspaceId } : "skip",
  );
  const createToken = useMutation(api.ingestTokensStore.createIngestToken);
  const revokeToken = useMutation(api.ingestTokensStore.revokeIngestToken);

  const [naziv, setNaziv] = useState("");
  const [radim, setRadim] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const [novi, setNovi] = useState<{ token: string; naziv: string } | null>(null);
  const [kopirano, setKopirano] = useState(false);
  const [zaOpoziv, setZaOpoziv] = useState<{
    _id: Id<"ingestTokens">;
    naziv: string;
  } | null>(null);
  const [opozivam, setOpozivam] = useState(false);

  // `client_viewer` ovu sekciju ne vidi: token je pravo pisanja, a ta uloga
  // postoji da bi gledala. Ništa se ne crta ni kao „nemaš pristup" — sekcija
  // koje nema je jasnija od zaključanog dugmeta.
  if (!jeVlasnik) return null;

  async function napravi(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!workspaceId || radim) return;
    setGreska(null);
    setNovi(null);
    setKopirano(false);
    setRadim(true);
    try {
      const rezultat = await createToken({ workspaceId, naziv: naziv.trim() });
      setNovi(rezultat);
      setNaziv("");
    } catch (error) {
      // Namerno bez `error` u logu: poruka providera ume da nosi argumente.
      console.error("Pravljenje tokena za uvoz nije uspelo");
      setGreska(porukaGreske(error));
    } finally {
      setRadim(false);
    }
  }

  async function kopiraj() {
    if (!novi) return;
    try {
      await navigator.clipboard.writeText(novi.token);
      setKopirano(true);
      window.setTimeout(() => setKopirano(false), 2000);
    } catch {
      setKopirano(false);
    }
  }

  async function potvrdiOpoziv() {
    if (!workspaceId || !zaOpoziv || opozivam) return;
    setOpozivam(true);
    try {
      await revokeToken({ workspaceId, tokenId: zaOpoziv._id });
      setZaOpoziv(null);
    } catch (error) {
      console.error("Opoziv tokena nije uspeo");
      setGreska(porukaGreske(error));
    } finally {
      setOpozivam(false);
    }
  }

  return (
    <div className="space-y-8">
      <Card className="gap-0 p-5 shadow-card ring-line">
        <h3 className="text-sm font-medium text-foreground">
          Tokeni za uvoz (skill)
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Token kojim se <span className="font-mono">/generate-leads</span> skill
          predstavlja aplikaciji. Ono što pošalje ide u „Uvoz” na pregled — ne
          upisuje se pravo u leadove. Token se prikazuje jednom; posle
          zatvaranja se ne može ponovo videti.
        </p>

        <form
          onSubmit={napravi}
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <Field label="Naziv (sa koje mašine)" className="flex-1">
            {(field) => (
              <Input
                {...field}
                name="ingest-token-naziv"
                autoComplete="off"
                placeholder="Jovanov laptop"
                value={naziv}
                onChange={(e) => {
                  setNaziv(e.target.value);
                  setGreska(null);
                }}
                disabled={radim || !workspaceId}
                className="h-10"
              />
            )}
          </Field>
          <Button
            type="submit"
            disabled={radim || !workspaceId || naziv.trim().length === 0}
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
                Novi token
              </>
            )}
          </Button>
        </form>

        {greska && (
          <FeedbackNote tone="danger" title="Radnja nije uspela" className="mt-4">
            {greska}
          </FeedbackNote>
        )}
      </Card>

      {tokens === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : tokens.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface/40 px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">
            Još nema tokena za uvoz
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Dok token ne postoji, skill nema čime da se predstavi i njegov uvoz
            se odbija sa 401.
          </p>
        </div>
      ) : (
        <Card className="gap-0 overflow-hidden p-0 shadow-card ring-line">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Naziv</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Napravljen</TableHead>
                  <TableHead>Poslednji put korišćen</TableHead>
                  <TableHead>Napravio</TableHead>
                  <TableHead className="text-right">Radnja</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((t) => (
                  <TableRow key={t._id}>
                    <TableCell className="font-mono text-xs">{t.naziv}</TableCell>
                    <TableCell>
                      {t.revokedAt === null ? (
                        <StatusPill tone="success">Važi</StatusPill>
                      ) : (
                        <StatusPill tone="danger">Opozvan</StatusPill>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-text-muted">
                      {formatDateTime(t.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs text-text-muted">
                      {/* „Nijednom" nije datum. Prazno polje bi se čitalo kao
                          greška u prikazu, a nula kao 1970. */}
                      {t.lastUsedAt === null
                        ? "nijednom"
                        : formatDateTime(t.lastUsedAt)}
                    </TableCell>
                    <TableCell className="text-xs text-text-muted">
                      {t.createdByEmail ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {t.revokedAt === null ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setZaOpoziv({ _id: t._id, naziv: t.naziv })
                          }
                          className="text-danger hover:text-danger"
                        >
                          Opozovi
                        </Button>
                      ) : (
                        <span className="text-xs text-text-muted">
                          {formatDateTime(t.revokedAt)}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Modal sa sirovim tokenom — jedini trenutak u kome postoji na ekranu. */}
      <Dialog
        open={novi !== null}
        onOpenChange={(open) => {
          if (!open) {
            setNovi(null);
            setKopirano(false);
          }
        }}
      >
        <DialogPopup className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Token je napravljen</DialogTitle>
            <DialogDescription>
              Kopiraj ga sada. Posle zatvaranja ovog prozora se ne može ponovo
              videti — u bazi stoji samo njegov heš.
            </DialogDescription>
          </DialogHeader>

          {novi && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-surface-raised px-2.5 py-2 font-mono text-xs text-foreground">
                  {novi.token}
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

              <div className="rounded-lg border border-line bg-surface p-3 text-xs leading-relaxed text-text-muted">
                <p className="font-medium text-foreground">Gde ide</p>
                <p className="mt-1">
                  U korisničku env promenljivu{" "}
                  <span className="font-mono text-foreground">
                    ENIGMA_INGEST_TOKEN
                  </span>{" "}
                  na mašini sa koje pokrećeš skill. PowerShell:
                </p>
                <code className="mt-2 block rounded bg-surface-raised px-2.5 py-2 font-mono text-[11px] text-text-secondary">
                  [Environment]::SetEnvironmentVariable(&quot;ENIGMA_INGEST_TOKEN&quot;,
                  &quot;&lt;token&gt;&quot;, &quot;User&quot;)
                </code>
                <p className="mt-2">
                  Ne stavljaj ga u repo, u chat ni u URL.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setNovi(null);
                setKopirano(false);
              }}
            >
              Sačuvao sam ga, zatvori
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      {/* Potvrda opoziva — posle nje skill sa tim tokenom dobija 401. */}
      <Dialog
        open={zaOpoziv !== null}
        onOpenChange={(open) => {
          if (!open && !opozivam) setZaOpoziv(null);
        }}
      >
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle>Opozvati token?</DialogTitle>
            <DialogDescription>
              {zaOpoziv
                ? `Skill koji koristi token „${zaOpoziv.naziv}" od tog trenutka dobija 401 i ne može da pošalje uvoz. Već napravljeni uvozi ostaju netaknuti.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={opozivam}
              onClick={() => setZaOpoziv(null)}
            >
              Otkaži
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={opozivam}
              onClick={potvrdiOpoziv}
              className="bg-danger text-text-inverse hover:bg-danger/90"
            >
              {opozivam ? (
                <>
                  <LoaderCircle className="size-3 animate-spin" />
                  Opozivam…
                </>
              ) : (
                "Opozovi token"
              )}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
