"use client";

import { useState } from "react";
import { Building2, ChevronDown, Globe } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FeedbackNote } from "@/components/app/feedback";
import { ProjekatLink } from "@/components/app/projekat-link";
import { useMoze, useProjekatMutation, useProjekatQuery } from "@/components/app/projekat-provider";
import { useNow } from "@/components/app/use-now";
import { formatRelativeTime } from "@/lib/format";
import { getErrorMessage } from "./lead-quick-dialogs";
import { WorkCard, WorkSection } from "./work-card";

/**
 * ============================================================================
 * UPITI SA SAJTA — forma na sajtu projekta (npr. scanme.rs)
 * ============================================================================
 *
 * Neko je sam popunio formu i čeka odgovor. Upit još nije firma: čovek ga
 * pretvara u firmu („Napravi firmu“) ili odbacuje uz razlog. Sekcija se crta
 * samo kad ima upita koji čekaju; zvono ih broji i kad niko nije ovde.
 * ============================================================================
 */

const PRIKAZ = 6;
const ODBACI_RAZLOZI = ["Spam ili test", "Nije kupac", "Duplikat"] as const;

type Upit = Doc<"leadInbound">;

function naziv(u: Upit): string {
  const k = u.kontakt;
  return k?.firma ?? k?.ime ?? k?.email ?? k?.telefon ?? "Upit bez imena";
}

function hostStranice(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function UpitiSaSajta() {
  const moze = useMoze("urednik");
  const now = useNow();
  const upiti = useProjekatQuery(api.leadInboundStore.listInbound, {
    status: "nov",
    platform: "website",
    limit: 50,
  });
  const napravi = useProjekatMutation(api.leadInboundStore.napraviFirmuIzUpita);
  const odbaci = useProjekatMutation(api.leadInboundStore.dismissInbound);

  const [radi, setRadi] = useState<Id<"leadInbound"> | null>(null);
  const [traziNaziv, setTraziNaziv] = useState<Upit | null>(null);
  const [nazivFirme, setNazivFirme] = useState("");
  const [ishod, setIshod] = useState<
    | { vrsta: "firma"; companyId: Id<"leadCompanies">; ime: string }
    | { vrsta: "greska"; poruka: string }
    | null
  >(null);

  if (upiti === undefined || (upiti.length === 0 && ishod === null)) return null;

  async function napraviFirmu(u: Upit, rucniNaziv?: string) {
    setRadi(u._id);
    setIshod(null);
    try {
      const r = await napravi({ inboundId: u._id, nazivFirme: rucniNaziv });
      setIshod({ vrsta: "firma", companyId: r.companyId, ime: rucniNaziv ?? naziv(u) });
      setTraziNaziv(null);
      setNazivFirme("");
    } catch (err) {
      setIshod({ vrsta: "greska", poruka: getErrorMessage(err) });
    } finally {
      setRadi(null);
    }
  }

  async function odbaciUpit(u: Upit, razlog: string) {
    setRadi(u._id);
    setIshod(null);
    try {
      await odbaci({ inboundId: u._id, reason: razlog });
    } catch (err) {
      setIshod({ vrsta: "greska", poruka: getErrorMessage(err) });
    } finally {
      setRadi(null);
    }
  }

  // Najstariji prvi: duže čeka, preče je.
  const redom = [...upiti].sort((a, b) => a.createdAt - b.createdAt);

  return (
    <div className="flex flex-col gap-3">
      <WorkSection
        naslov="Upiti sa sajta"
        icon={Globe}
        kriterijum="poslao formu na sajtu projekta · još nije firma ni odbačen"
        ukupno={upiti.length}
        najmanje={upiti.length >= 50}
        loading={false}
        prazno={upiti.length === 0 ? "Nema upita koji čekaju." : undefined}
      >
        {redom.slice(0, PRIKAZ).map((u) => {
          const k = u.kontakt;
          // Ono što je već naslov kartice se ne ponavlja ispod.
          const ime = naziv(u);
          const kontakt = [k?.firma ? k?.ime : undefined, k?.email, k?.telefon]
            .filter((x): x is string => Boolean(x) && x !== ime)
            .join(" · ");
          const host = hostStranice(u.sourceUrl);
          const imaNaziv = Boolean(k?.firma || k?.ime);
          const zauzet = radi === u._id;
          return (
            <WorkCard
              key={u._id}
              edge={now - u.createdAt >= 24 * 60 * 60 * 1000 ? "overdue" : null}
              href={null}
              name={ime}
              meta={kontakt}
              zasto={
                <div className="flex min-w-0 flex-col gap-1">
                  {u.text ? (
                    <p className="line-clamp-2 text-ui text-foreground">
                      {u.text.length > 120 ? `${u.text.slice(0, 120)}…` : u.text}
                    </p>
                  ) : (
                    <p className="text-ui text-text-muted">bez poruke</p>
                  )}
                  <p className="text-meta text-text-muted">
                    {[host, formatRelativeTime(u.createdAt, now)].filter(Boolean).join(" · ")}
                  </p>
                </div>
              }
              primary={
                moze ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="touch-target"
                    disabled={zauzet}
                    onClick={() => {
                      if (imaNaziv) void napraviFirmu(u);
                      else {
                        setNazivFirme("");
                        setTraziNaziv(u);
                      }
                    }}
                  >
                    <Building2 data-icon="inline-start" aria-hidden />
                    Napravi firmu
                  </Button>
                ) : undefined
              }
              secondary={
                moze ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={zauzet}
                          className="touch-target text-text-muted"
                        />
                      }
                    >
                      Odbaci
                      <ChevronDown data-icon="inline-end" aria-hidden />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Razlog</DropdownMenuLabel>
                        {ODBACI_RAZLOZI.map((r) => (
                          <DropdownMenuItem key={r} onClick={() => void odbaciUpit(u, r)}>
                            {r}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : undefined
              }
            />
          );
        })}
      </WorkSection>

      {upiti.length > PRIKAZ && (
        <p className="text-meta text-text-muted">
          Prikazano {PRIKAZ} najstarijih od {upiti.length}.
        </p>
      )}

      {ishod?.vrsta === "firma" && (
        <FeedbackNote
          tone="success"
          title={`Firma „${ishod.ime}“ je napravljena`}
          action={
            <ProjekatLink
              href={`/leadovi/${ishod.companyId}`}
              className="text-ui font-medium text-mod underline-offset-4 hover:underline"
            >
              Otvori profil
            </ProjekatLink>
          }
        />
      )}
      {ishod?.vrsta === "greska" && (
        <FeedbackNote tone="danger" title="Upit nije obrađen">
          {ishod.poruka}
        </FeedbackNote>
      )}

      <Dialog
        open={traziNaziv !== null}
        onOpenChange={(open) => {
          if (!open && radi === null) setTraziNaziv(null);
        }}
      >
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle>Naziv firme</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
              Upit nema ni ime ni firmu. Upiši naziv pod kojim firma ulazi u leadove.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (traziNaziv && nazivFirme.trim()) void napraviFirmu(traziNaziv, nazivFirme.trim());
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="upit-naziv-firme" className="text-xs font-semibold text-foreground">
                Naziv firme
              </Label>
              <Input
                id="upit-naziv-firme"
                value={nazivFirme}
                maxLength={160}
                onChange={(e) => setNazivFirme(e.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTraziNaziv(null)}
                disabled={radi !== null}
              >
                Otkaži
              </Button>
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                disabled={radi !== null || nazivFirme.trim().length === 0}
              >
                {radi !== null ? "Pravim…" : "Napravi firmu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
