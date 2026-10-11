"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { ArrowRight, Target, Trophy } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackLine, FeedbackNote } from "@/components/app/feedback";
import { Chip } from "@/components/app/system/chip";
import { EmptyState } from "@/components/app/system/empty-state";
import { FocusCard } from "@/components/app/system/focus-card";
import { MissionCard } from "@/components/app/system/mission-card";
import { PageHeader } from "@/components/app/system/page-header";
import { ProgressBar, ProgressRing } from "@/components/app/system/progress";
import {
  AchievementBadge,
  LevelBadge,
  StreakFlame,
} from "@/components/app/system/reward-badges";
import { useWorkspace } from "@/components/app/workspace-provider";
import type { ModuleKey } from "@/components/app/nav-items";
import { formatNumber, formatShortDate, pluralSr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ActivityMap } from "./activity-map";
import { GranicaNapretka } from "./napredak-izvor";
import {
  ikonaDostignuca,
  ikonaMisije,
  radnjaMisije,
  vezaMisije,
} from "./napredak-ikone";
import {
  stanjeNiza,
  useNapredak,
  useNapredakPao,
  useNapredakProfil,
  useNapredakZastoj,
  useSada,
  type NapredakProfil,
  type NapredakUkljucen,
} from "./use-napredak";
import { XpBroj } from "./xp-broj";

/**
 * ============================================================================
 * EKRAN „NAPREDAK" (UI Boost §8)
 * ============================================================================
 *
 * Fokus je jedan: nivo i XP. Desno od njega su tri nedeljna prstena, ispod
 * misije dana — prva nezavršena je šira i jedina nosi primarno dugme, jer je
 * to sledeći korak. Dostignuća, rekordi i mapa aktivnosti su tiši: razdelnici
 * i razmak, bez kartica.
 *
 * Zlatna je ovde nagrada (XP, bedž, završena misija), a boja mesta ostaje boja
 * modula. Ništa se ne animira pri otvaranju; merači i XP broj se pomere tek
 * kad se vrednost promeni dok je ekran otvoren.
 */

const datumOtkljucavanja = new Intl.DateTimeFormat("sr-Latn-RS", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Belgrade",
});

/** Boja prstena je boja modula iz kog posao dolazi (§6.6). */
const MODUL_PRSTENA: Record<string, ModuleKey> = {
  pozivi: "leadovi",
  sastanci: "tabla",
  objave: "instagram",
};

export function NapredakScreen() {
  const stanje = useNapredak();
  const pao = useNapredakPao();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        variant="module"
        icon={Trophy}
        description="Nivo, misije dana, niz i dostignuća — iz onoga što je stvarno urađeno."
        info={
          <>
            XP donose dodiri, ishodi, sastanci, ponude i dobijeni poslovi,
            primenjeni uvozi, objave, moderacija i radnje na oglasima.
            Ponavljanje iste radnje nad istom firmom istog dana ne donosi XP.
            Dan se računa u niz kad je završena bar jedna misija ili su
            zabeležene bar tri radnje.
          </>
        }
      />

      {pao ? (
        // Kvar nije učitavanje: skeleton koji nikad ne prođe bio bi laž.
        <FeedbackNote tone="warning" title="Napredak trenutno nije dostupan">
          Podaci nisu stigli. Osveži stranu; radnje se i dalje beleže i biće
          ovde čim se veza vrati.
        </FeedbackNote>
      ) : stanje === undefined ? (
        <UcitavanjeFokusa />
      ) : !stanje.ukljucen ? (
        <Iskljuceno />
      ) : (
        <>
          <Fokus stanje={stanje} />
          <MisijeDana stanje={stanje} />
          <GranicaNapretka
            fallback={
              <FeedbackNote
                tone="warning"
                title="Dostignuća, rekordi i mapa trenutno nisu dostupni"
              >
                Osveži stranu. Nivo, XP i misije iznad su tačni.
              </FeedbackNote>
            }
          >
            <ProfilDeo danas={stanje.dan} />
          </GranicaNapretka>
        </>
      )}
    </div>
  );
}

/** Deo ekrana koji čita `napredak.profil` — iza svoje granice greške. */
function ProfilDeo({ danas }: { danas: string | null }) {
  const profil = useNapredakProfil();
  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Dostignuca profil={profil} />
      <div className="flex min-w-0 flex-col gap-8">
        <Aktivnost profil={profil} danas={danas} />
        <Rekordi profil={profil} />
      </div>
    </div>
  );
}

// ── fokus: nivo + XP ─────────────────────────────────────────────────────────

function Fokus({ stanje }: { stanje: NapredakUkljucen }) {
  const sada = useSada();
  const zastoj = useNapredakZastoj();
  const { nivo, niz, xp } = stanje;

  // Dan još nije zamrznut ili se istorija još sabira: XP je donja granica, pa
  // se ne prikazuje kao tačan broj.
  if (!stanje.spremno) {
    if (zastoj) {
      return (
        <FeedbackNote tone="warning" title="Današnji dan nije mogao da se otvori">
          Nivo, XP i misije se zato ne prikazuju. Osveži stranu; radnje se i
          dalje beleže i ulaze u zbir čim se dan otvori.
        </FeedbackNote>
      );
    }
    return (
      <div className="flex flex-col gap-3">
        <UcitavanjeFokusa />
        <FeedbackLine tone="progress">
          Sabiram dosadašnje radnje — nivo i XP stižu za koji trenutak.
        </FeedbackLine>
      </div>
    );
  }

  return (
    <FocusCard
      aside={
        <div className="flex flex-col gap-3">
          <h2 className="heading-caps text-meta font-medium text-text-muted">
            Ova nedelja
          </h2>
          <ul className="flex items-start gap-5">
            {stanje.prstenovi.map((prsten) => (
              <li
                key={prsten.kljuc}
                data-module={MODUL_PRSTENA[prsten.kljuc]}
                className="flex flex-col items-center gap-2"
              >
                <ProgressRing
                  value={prsten.vrednost}
                  max={prsten.cilj}
                  size={76}
                  stroke={7}
                  label={`${prsten.naziv} ove nedelje`}
                >
                  <span className="text-copy font-bold text-foreground">
                    {prsten.vrednost}
                  </span>
                  <span className="mt-0.5 text-micro text-text-muted">
                    od {prsten.cilj}
                  </span>
                </ProgressRing>
                <span className="text-center text-meta leading-tight">
                  <span className="block font-medium text-foreground">
                    {prsten.naziv}
                  </span>
                  <span className="font-mono tabular-nums text-text-muted">
                    {prsten.procenat} %
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <LevelBadge
          level={nivo.broj}
          tier={nivo.rang}
          rank={nivo.zvanje}
          size="lg"
        />
        {/* Najmanja širina: na telefonu se niz prelomi u svoj red, umesto da
            stisne zvanje u tri tačke. */}
        <div className="min-w-40 flex-1">
          <h2 className="text-title font-bold text-foreground">
            {nivo.zvanje}
          </h2>
          <p className="text-ui text-text-muted">
            Nivo {nivo.broj} · još{" "}
            <span className="font-mono tabular-nums text-foreground">
              {formatNumber(nivo.zaSledeci)} XP
            </span>{" "}
            do nivoa {nivo.broj + 1}
          </p>
        </div>
        <div className="flex flex-col gap-1 sm:items-end">
          <StreakFlame days={niz.dani} state={stanjeNiza(niz, sada)} />
          <span className="text-meta text-text-muted">
            {niz.danasUracunat
              ? "Današnji dan je uračunat"
              : niz.dani > 0
                ? "Danas još nije uračunat"
                : "Jedna misija ili tri radnje započinju niz"}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="flex flex-wrap items-baseline gap-x-2 font-mono">
          <XpBroj value={xp.ukupno} className="text-hero text-xp" />
          <span className="text-copy text-text-muted tabular-nums">
            / {formatNumber(nivo.xpDo)} XP
          </span>
          {xp.danas > 0 && (
            <Chip tone="xp" size="sm" className="ml-auto font-mono tabular-nums">
              +{formatNumber(xp.danas)} XP danas
            </Chip>
          )}
        </p>
        <ProgressBar
          value={nivo.uNivou}
          max={nivo.xpDo - nivo.xpOd}
          tone="xp"
          label={`XP do nivoa ${nivo.broj + 1}`}
        />
        {stanje.odseceno && (
          <p className="text-meta text-text-muted">
            Danas je bilo više radnji nego što se čita odjednom — XP je najmanje
            ovoliki.
          </p>
        )}
      </div>
    </FocusCard>
  );
}

function UcitavanjeFokusa() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-44 w-full rounded-xl" />
      <div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr]">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    </div>
  );
}

// ── misije dana ──────────────────────────────────────────────────────────────

function MisijeDana({ stanje }: { stanje: NapredakUkljucen }) {
  if (!stanje.spremno) return null;
  const { misije, bonus } = stanje;
  // Prva nezavršena je sledeći korak: šira je i jedina nosi primarno dugme.
  const sledeca = misije.find((m) => !m.zavrsena)?.kljuc;
  const zavrsenih = misije.filter((m) => m.zavrsena).length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-copy font-bold text-foreground">Misije dana</h2>
        {misije.length > 0 && (
          <p className="text-ui text-text-muted">
            <span className="font-mono tabular-nums text-foreground">
              {zavrsenih} / {misije.length}
            </span>{" "}
            {bonus.osvojen ? (
              <span className="font-medium text-xp">
                · dnevni bonus +{bonus.xp} XP osvojen
              </span>
            ) : bonus.moguc ? (
              <>
                · još {bonus.preostaloMisija} do bonusa od{" "}
                <span className="font-mono tabular-nums text-xp">
                  +{bonus.xp} XP
                </span>
              </>
            ) : null}
          </p>
        )}
      </div>

      {misije.length === 0 ? (
        <EmptyState variant="line" icon={Target} title="Danas nema misija.">
          Misija nastaje samo kad posao postoji: firme za poziv, zaostali
          koraci, nerešeni redovi uvoza ili komentari bez odgovora.
        </EmptyState>
      ) : (
        <div
          className={cn(
            "grid gap-4",
            misije.length === 3 && "md:grid-cols-[2fr_1fr_1fr]",
            misije.length === 2 && "md:grid-cols-[2fr_1fr]",
          )}
        >
          {[...misije]
            // Sledeći korak ide prvi, da široka kolona bude njegova.
            .sort(
              (a, b) =>
                Number(b.kljuc === sledeca) - Number(a.kljuc === sledeca),
            )
            .map((misija) => {
              const glavna = misija.kljuc === sledeca;
              return (
                <MissionCard
                  key={misija.kljuc}
                  title={misija.naslov}
                  icon={ikonaMisije(misija.kljuc)}
                  value={misija.napredak}
                  max={misija.cilj}
                  xp={misija.xp}
                  done={misija.zavrsena}
                  featured={glavna}
                  action={
                    <Button
                      render={<Link href={vezaMisije(misija.kljuc, misija.veza)} />}
                      nativeButton={false}
                      variant={glavna ? "primary" : "secondary"}
                      size="sm"
                    >
                      {radnjaMisije(misija.kljuc)}
                      <ArrowRight data-icon="inline-end" aria-hidden />
                    </Button>
                  }
                />
              );
            })}
        </div>
      )}
    </section>
  );
}

// ── dostignuća ───────────────────────────────────────────────────────────────

function Dostignuca({ profil }: { profil: NapredakProfil | undefined }) {
  if (profil === undefined || !profil.ukljucen) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-copy font-bold text-foreground">Dostignuća</h2>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  // Otključana prva (najnovije gore), pa zaključana redom iz kataloga.
  const poredjana = [...profil.dostignuca].sort((a, b) => {
    if (a.otkljucanoAt !== null && b.otkljucanoAt !== null) {
      return b.otkljucanoAt - a.otkljucanoAt;
    }
    if (a.otkljucanoAt !== null) return -1;
    if (b.otkljucanoAt !== null) return 1;
    return 0;
  });

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-copy font-bold text-foreground">Dostignuća</h2>
        <p className="font-mono text-ui tabular-nums text-text-muted">
          <span className="text-foreground">{profil.otkljucano}</span> /{" "}
          {profil.ukupno}
        </p>
      </div>
      <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
        {poredjana.map((d) => {
          const zakljucano = d.otkljucanoAt === null;
          const dokle =
            zakljucano && d.napredak
              ? `${formatNumber(Math.min(d.napredak.vrednost, d.napredak.cilj))} / ${formatNumber(d.napredak.cilj)}`
              : undefined;
          return (
            <li key={d.kljuc} className="min-w-0">
              <AchievementBadge
                icon={ikonaDostignuca(d.kljuc)}
                title={d.naziv}
                description={d.uslov}
                progress={dokle}
                rarity={d.retkost}
                locked={zakljucano}
                unlockedAt={
                  d.otkljucanoAt === null
                    ? undefined
                    : datumOtkljucavanja.format(d.otkljucanoAt)
                }
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── mapa aktivnosti i rekordi ────────────────────────────────────────────────

function Aktivnost({
  profil,
  danas,
}: {
  profil: NapredakProfil | undefined;
  danas: string | null;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h2 className="text-copy font-bold text-foreground">
        Aktivnost · 12 nedelja
      </h2>
      {profil === undefined || !profil.ukljucen ? (
        <Skeleton className="h-36 w-56 rounded-lg" />
      ) : profil.mapa.dani.length === 0 ? (
        <p className="text-ui text-text-muted">
          Mapa se puni od prvog dana u kom je Napredak otvoren.
        </p>
      ) : (
        <ActivityMap
          dani={profil.mapa.dani}
          maks={profil.mapa.maks}
          danas={danas}
        />
      )}
    </section>
  );
}

function Rekordi({ profil }: { profil: NapredakProfil | undefined }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h2 className="text-copy font-bold text-foreground">Lični rekordi</h2>
      {profil === undefined || !profil.ukljucen ? (
        <Skeleton className="h-32 rounded-lg" />
      ) : (
        <dl className="divide-y divide-line-soft">
          {profil.rekordi.map((rekord) => (
            <div
              key={rekord.kljuc}
              className="flex items-baseline justify-between gap-4 py-2"
            >
              <dt className="min-w-0 text-ui text-text-secondary">
                {rekord.naziv}
              </dt>
              <dd className="shrink-0 text-right">
                {/* Nula ovde znači „još nijednom", ne izmeren rekord. */}
                {rekord.vrednost > 0 ? (
                  <>
                    <span className="font-mono text-copy font-bold tabular-nums text-foreground">
                      {formatNumber(rekord.vrednost)}
                      {rekord.kljuc === "xp_dan" ? " XP" : ""}
                    </span>
                    {rekord.kljuc === "niz" && (
                      <span className="text-meta text-text-muted">
                        {" "}
                        {pluralSr(rekord.vrednost, "dan", "dana", "dana")}
                      </span>
                    )}
                    {rekord.dan && (
                      <span className="text-meta text-text-muted">
                        {" "}
                        · {formatShortDate(rekord.dan)}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-ui text-text-muted">—</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

// ── isključeno ───────────────────────────────────────────────────────────────

function Iskljuceno() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id as Id<"workspaces"> | undefined;
  const podesi = useMutation(api.napredak.podesi);
  const [ukljucuje, setUkljucuje] = useState(false);
  const [greska, setGreska] = useState(false);

  const ukljuci = async () => {
    if (!workspaceId) return;
    setUkljucuje(true);
    setGreska(false);
    try {
      await podesi({ workspaceId, ukljucen: true });
    } catch {
      setGreska(true);
    } finally {
      setUkljucuje(false);
    }
  };

  return (
    <EmptyState
      icon={Trophy}
      size="lg"
      title="Napredak je isključen"
      action={
        <Button
          variant="primary"
          onClick={() => void ukljuci()}
          loading={ukljucuje}
          disabled={!workspaceId}
        >
          Uključi Napredak
        </Button>
      }
    >
      XP, misije, niz i proslave se ne prikazuju. Radnje se i dalje beleže, pa
      je posle uključivanja sve što je urađeno tu.
      {greska && (
        <span role="alert" className="mt-2 block text-danger">
          Uključivanje nije uspelo. Pokušaj ponovo.
        </span>
      )}
    </EmptyState>
  );
}
