"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, CheckCheck, Inbox, SlidersHorizontal } from "lucide-react";
import { formatInboxTime, inboxCountLabel, inboxMarkedMessage, inboxUnreadWord } from "@/lib/prostor";

import { JaLink } from "@/components/app/ja-link";
import { useProjektiTrake } from "@/components/app/podaci-ljuske";
import { useQueryResult, useQueryTolerant } from "@/components/app/prostor/podaci/ja";
import { useToday } from "@/components/app/prostor/zajednicko/use-danas";
import { CountBadge } from "@/components/app/system/count-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { formatNumber, pluralSr } from "@/lib/format";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { unreadPhrase } from "@/lib/prostor/web/opseg";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { ProjekatCip } from "@/components/app/prostor/zajednicko/projekat-cip";

import { ZnakObavestenja } from "./inbox-view";
import { GLAVA_INBOXA, useOtvoriObavestenje } from "./notifications-panel";

/**
 * ============================================================================
 * ZVONO: KARTICE „ČEKA TE“ I „INBOX“ (SPAJANJE P16, paritet red 5)
 * ============================================================================
 *
 * Jedno zvono, dva izvora: „Čeka te“ je Enigmin izračunat posao (ostaje kakav
 * jeste), a „Inbox“ su sačuvana obaveštenja radnog dela iz svih mojih
 * projekata i ličnih poruka. Broj na zvonu je zbir oba.
 *
 * Inbox je lični (P16), pa je kartica ista u „Ja“ i u projektu. Panel domen
 * (klijentski pogled, D4) i nalog bez profila radnog dela nemaju Inbox: tamo
 * zvono ostaje samo „Čeka te“, kao pre spajanja.
 */

export type InboxZvona = { broj: number; odseceno: boolean };

/**
 * Nepročitan Inbox za zvono. `null` kad Inbox ovde ne postoji (isključen,
 * nema profila) ili broj nije stigao. Tolerantno: pad upita radnog dela ne
 * obara Enigmino zvono.
 */
export function useInboxZvona(aktivan: boolean): InboxZvona | null {
  const profil = useQuery(api.prostor.profiles.getCurrent, aktivan ? {} : "skip");
  const ima = aktivan && profil !== undefined && profil !== null;
  const counts = useQueryTolerant(api.prostor.inbox.unreadCounts, ima ? {} : "skip");
  if (!ima || counts === undefined) return null;
  return { broj: counts.total.count, odseceno: counts.total.capped };
}

/** Natpis zvona za čitač ekrana: oba izvora, bez nule koja nije izmerena. */
export function nazivZvona(ceka: number, inbox: InboxZvona | null, cekaNepotpuno = false): string {
  const deoCeka =
    ceka > 0
      ? `Čeka te: ${formatNumber(ceka)} ${pluralSr(ceka, "stavka", "stavke", "stavki")}${cekaNepotpuno ? " ili više" : ""}`
      : "Čeka te: nema ničega";
  if (inbox === null) return deoCeka;
  return `${deoCeka} · Inbox: ${inbox.broj > 0 ? unreadPhrase(inbox.broj, inbox.odseceno) : "nema nepročitanih"}`;
}

/**
 * Sadržaj otvorenog zvona sa karticama. Montira se pri svakom otvaranju, pa
 * početna kartica prati stanje: „Čeka te“ kad ima posla (ili kad ni Inbox
 * nema ništa), inače Inbox.
 */
export function ZvonoKartice({
  ceka,
  cekaBroj,
  inbox,
  onZatvori,
  onPodesavanja,
}: {
  /** Enigmin panel „Čeka te“ (bez sopstvenog naslova). */
  ceka: ReactNode;
  cekaBroj: number;
  inbox: InboxZvona;
  onZatvori: () => void;
  onPodesavanja: () => void;
}) {
  const [kartica, setKartica] = useState<"ceka" | "inbox">(() =>
    cekaBroj > 0 || inbox.broj === 0 ? "ceka" : "inbox",
  );
  return (
    <Tabs value={kartica} onValueChange={(v) => setKartica(v as "ceka" | "inbox")} className="gap-0">
      <TabsList aria-label="Zvono" className="shrink-0 px-1.5">
        <TabsTrigger value="ceka">
          Čeka te
          <CountBadge count={cekaBroj} label={`${formatNumber(cekaBroj)} ${pluralSr(cekaBroj, "stavka", "stavke", "stavki")}`} />
        </TabsTrigger>
        <TabsTrigger value="inbox">
          Inbox
          <CountBadge
            count={inbox.odseceno ? 100 : inbox.broj}
            label={unreadPhrase(inbox.broj, inbox.odseceno)}
          />
        </TabsTrigger>
      </TabsList>
      <TabsContent value="ceka">{kartica === "ceka" ? ceka : null}</TabsContent>
      <TabsContent value="inbox">
        {kartica === "inbox" ? (
          <KarticaInbox broj={inbox} onZatvori={onZatvori} onPodesavanja={onPodesavanja} />
        ) : null}
      </TabsContent>
    </Tabs>
  );
}

function KarticaInbox({
  broj,
  onZatvori,
  onPodesavanja,
}: {
  broj: InboxZvona;
  onZatvori: () => void;
  onPodesavanja: () => void;
}) {
  const { data: glava, failed } = useQueryResult(api.prostor.inbox.feed, GLAVA_INBOXA);
  const markAllRead = useMutation(api.prostor.inbox.markAllRead);
  const otvori = useOtvoriObavestenje();
  const projekti = useProjektiTrake(null);
  const { now } = useToday();
  const [oznacavam, setOznacavam] = useState(false);
  const boje = new Map((projekti ?? []).map((p) => [p.workspaceId as string, p.boja] as const));

  const oznaciSve = async () => {
    if (oznacavam) return;
    setOznacavam(true);
    try {
      toast.success(inboxMarkedMessage(await markAllRead({})));
    } catch (error) {
      toast.error(accessErrorMessage(error, "Označavanje nije uspelo."));
    } finally {
      setOznacavam(false);
    }
  };

  return (
    <div className="flex max-h-[min(60vh,26rem)] flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {failed ? (
          <div role="alert" className="px-3 py-5">
            <p className="text-ui text-foreground">Inbox se ne može učitati.</p>
            <p className="mt-1 text-meta text-text-muted">Proveri vezu i otvori ceo Inbox.</p>
          </div>
        ) : glava === undefined ? (
          <div role="status" aria-busy="true" className="space-y-1 px-3 py-2">
            <span className="sr-only">Učitavam obaveštenja</span>
            {[0, 1, 2].map((red) => (
              <div key={red} className="flex items-start gap-2.5 py-1.5">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-4/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
              </div>
            ))}
          </div>
        ) : glava.page.length === 0 ? (
          <div className="px-3 py-5">
            <p className="text-ui text-foreground">Nema obaveštenja.</p>
            <p className="mt-1 text-meta leading-relaxed text-text-muted">
              Pominjanja, dodele, komentari i podsetnici iz svih projekata stižu ovde.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {glava.page.map((item) => {
              const neprocitano = item.readAt === null;
              return (
                <li key={item._id}>
                  <button
                    type="button"
                    onClick={() => otvori(item, onZatvori)}
                    className="flex w-full items-start gap-2.5 px-3 py-2 text-left outline-none transition-colors hover:bg-surface-control focus-visible:bg-surface-control focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <ZnakObavestenja item={item} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "line-clamp-2 text-ui leading-5 [overflow-wrap:anywhere]",
                          neprocitano ? "font-medium text-foreground" : "text-text-secondary",
                        )}
                      >
                        {neprocitano ? <span className="sr-only">Nepročitano. </span> : null}
                        {item.title}
                      </span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-meta text-text-muted">
                        <ProjekatCip
                          workspace={
                            item.workspace === null
                              ? null
                              : { ...item.workspace, boja: boje.get(item.workspace._id) ?? null }
                          }
                          size="xs"
                        />
                        <span className="min-w-0 truncate">{item.workspace?.name ?? "Lično"}</span>
                        <span aria-hidden="true">·</span>
                        <time dateTime={new Date(item.createdAt).toISOString()} className="shrink-0 tabular-nums">
                          {formatInboxTime(item.createdAt, now)}
                        </time>
                      </span>
                    </span>
                    {neprocitano ? (
                      <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-foreground" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1 border-t border-line-soft px-1.5 py-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={oznacavam || broj.broj === 0}
          onClick={() => void oznaciSve()}
          title={
            broj.broj > 0
              ? `Označi ${inboxCountLabel(broj.broj, broj.odseceno)} ${inboxUnreadWord(broj.broj)} kao pročitano`
              : undefined
          }
          className="text-text-secondary"
        >
          <CheckCheck aria-hidden="true" />
          Označi sve
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onPodesavanja}
          aria-label="Podešavanja obaveštenja"
          title="Podešavanja obaveštenja"
          className="text-text-secondary"
        >
          <SlidersHorizontal aria-hidden="true" />
        </Button>
        <JaLink
          href="/inbox"
          onClick={onZatvori}
          className="ml-auto inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-ui font-medium text-radnja transition-colors hover:text-radnja-hover pointer-coarse:min-h-11"
        >
          <Inbox className="size-3.5" aria-hidden="true" />
          Ceo Inbox
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </JaLink>
      </div>
    </div>
  );
}

