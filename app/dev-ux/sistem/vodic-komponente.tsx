"use client";

import { useState } from "react";
import {
  CalendarCheck,
  CalendarPlus,
  Eye,
  Link2,
  MousePointerClick,
  Phone,
  PhoneCall,
  Plus,
  Send,
  ShieldCheck,
  Trophy,
  Upload,
  Users,
  Wallet,
} from "lucide-react";
import { CelebrationBurst } from "@/components/app/system/celebration-burst";
import { Chip } from "@/components/app/system/chip";
import { ChipOverflow } from "@/components/app/system/chip-overflow";
import { EmptyState } from "@/components/app/system/empty-state";
import { FocusCard } from "@/components/app/system/focus-card";
import {
  KpiTile,
  KpiTileSkeleton,
  StatTile,
} from "@/components/app/system/kpi-tile";
import { MissionCard } from "@/components/app/system/mission-card";
import { Monogram } from "@/components/app/system/monogram";
import { PageHeader } from "@/components/app/system/page-header";
import { PlayerCard } from "@/components/app/system/player-card";
import {
  ProgressBar,
  ProgressRing,
  SegmentedMeter,
} from "@/components/app/system/progress";
import {
  AchievementBadge,
  LevelBadge,
  StreakFlame,
  XpBar,
} from "@/components/app/system/reward-badges";
import {
  RewardToast,
  RewardToastViewport,
} from "@/components/app/system/reward-toast";
import { LEAD_SIGNAL_LABELS } from "@/components/app/leadovi/lead-labels";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatSignedPercent,
} from "@/lib/format";
import {
  CATEGORY_LABEL,
  CATEGORY_SLOT,
  signalCategory,
  signalSlot,
  type SignalCategory,
} from "@/lib/signal-colors";
import { Grupa, Sekcija } from "./delovi";
import { VodicNapredak } from "./vodic-napredak";

/** Izmišljeni podaci — dovoljno neuredni da liče na prave. */
const LINIJA = [18, 22, 19, 27, 31, 26, 34, 38, 33, 41, 47, 44, 52, 58];
const LINIJA_SA_RUPAMA = [
  12, 15, undefined, undefined, 19, 23, 21, undefined, 9, undefined, undefined, 28,
  31, 36,
];

const FIRME = [
  { naziv: "Salon Dunav", nisa: "frizerski salon" },
  { naziv: "Pekara Zrno", nisa: "pekara" },
  { naziv: "Servis Točak", nisa: "auto servis" },
  { naziv: "Studio Kadar", nisa: "foto studio" },
  { naziv: "Cvećara Lala", nisa: "cvećara" },
  { naziv: "Ordinacija Osmeh", nisa: "stomatolog" },
  { naziv: "Teretana Čelik", nisa: "teretana" },
];

const SIGNALI = [
  "nema_sajt",
  "sajt_spor",
  "sajt_bez_https",
  "koristi_third_party_booking",
  "visok_broj_recenzija",
  "samo_instagram",
  "novootvorena_firma",
  "pitao_cenu",
] as const;

const KATEGORIJE: SignalCategory[] = [
  "sajt",
  "zakazivanje",
  "reputacija",
  "mreze",
  "nova",
  "ostalo",
];

export function VodicKomponente() {
  return (
    <>
      <Plocice />
      <CipoviIMonogrami />
      <ZaglavljeIFokus />
      <PraznaStanja />
      <NapredakUAkciji />
      <KarticaIgraca />
      <VodicNapredak />
      <ProbaPortala />
    </>
  );
}

function Plocice() {
  return (
    <Sekcija
      naslov="Pločice — hero, default, compact"
      opis="Hero je fokus broj ekrana. Delta je pilula: strelica kaže smer, boja da li je to dobro; smer daje rečnik mera (kod cene je pad dobra vest). Linija premošćuje dane bez merenja isprekidano."
    >
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr]">
        <KpiTile
          size="hero"
          icon={Eye}
          label="Sesije"
          mera="sesije"
          value={1240}
          format={formatNumber}
          delta={{ kind: "pct", value: 0.184 }}
          formatDelta={formatSignedPercent}
          compareLabel="vs prethodnih 28 d"
          spark={LINIJA}
        />
        <KpiTile
          icon={Users}
          label="Korisnici"
          mera="korisnici"
          value={873}
          format={formatNumber}
          delta={{ kind: "pct", value: -0.062 }}
          formatDelta={formatSignedPercent}
          compareLabel="vs prethodnih 28 d"
          spark={LINIJA_SA_RUPAMA}
          href="/analytics"
        />
        <KpiTile
          icon={Wallet}
          label="Cena po leadu"
          mera="cena_po_rezultatu"
          value={3.3}
          format={(v) => formatCurrency(v, "EUR")}
          delta={{ kind: "pct", value: -0.127 }}
          formatDelta={formatSignedPercent}
          compareLabel="pad je dobar"
          spark={[52, 49, 51, 46, 44, 45, 41, 39, 40, 37]}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Stopa angažovanja"
          mera="stopa_angazovanja"
          value={0.432}
          format={formatPercent}
          note="zbir za period"
        />
        <KpiTile
          label="Doseg priča"
          mera="doseg"
          value={undefined}
          format={formatNumber}
          state="unavailable"
          reason="Instagram ne vraća doseg priča starijih od 24 h."
        />
        <StatTile
          icon={MousePointerClick}
          label="Klikovi na link"
          value={148}
          format={formatNumber}
          note="iz 3 automatizacije"
        />
        <KpiTileSkeleton />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          size="compact"
          icon={Phone}
          label="Pozivi danas"
          mera="pozivi"
          value={7}
          format={formatNumber}
          note="od 10"
        />
        <KpiTile
          size="compact"
          label="Sastanci"
          mera="sastanci"
          value={3}
          format={formatNumber}
          delta={{ kind: "pct", value: 0.5 }}
          formatDelta={formatSignedPercent}
        />
        <KpiTile
          size="compact"
          label="Upiti (bez promene)"
          mera="upiti"
          value={41}
          format={formatNumber}
          delta={{ kind: "pct", value: 0 }}
          formatDelta={formatSignedPercent}
        />
        <KpiTileSkeleton size="compact" />
      </div>
    </Sekcija>
  );
}

function CipoviIMonogrami() {
  const stavke = SIGNALI.map((vrsta) => ({
    key: vrsta,
    label: LEAD_SIGNAL_LABELS[vrsta],
    category: signalSlot(vrsta),
    title: CATEGORY_LABEL[signalCategory(vrsta)],
  }));
  return (
    <Sekcija
      naslov="Čipovi signala i monogrami"
      opis="Boja čipa je kategorija signala, iz jedne mape. Čip se nikad ne seče na pola reči: višak ide u „+N“, sa spiskom u oblačiću."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Grupa naslov="Kategorije signala">
          <div className="flex flex-wrap gap-1.5">
            {KATEGORIJE.map((kategorija) => (
              <Chip
                key={kategorija}
                category={CATEGORY_SLOT[kategorija]}
              >
                {CATEGORY_LABEL[kategorija]}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SIGNALI.map((vrsta) => (
              <Chip key={vrsta} size="sm" category={signalSlot(vrsta)}>
                {LEAD_SIGNAL_LABELS[vrsta]}
              </Chip>
            ))}
          </div>
        </Grupa>
        <Grupa naslov="Stanje, mesto i nagrada">
          <div className="flex flex-wrap gap-1.5">
            <Chip tone="neutral">Neutralno</Chip>
            <Chip tone="muted">Prigušeno</Chip>
            <Chip tone="module">Modul</Chip>
            <Chip tone="module" active onClick={() => {}} count={12}>
              Uključen filter
            </Chip>
            <Chip tone="success" icon={ShieldCheck}>
              Povezano
            </Chip>
            <Chip tone="warning">Ističe za 3 dana</Chip>
            <Chip tone="danger">Istekao prozor</Chip>
            <Chip tone="info">Sinhronizuje</Chip>
            <Chip tone="xp" className="font-mono tabular-nums">
              +25 XP
            </Chip>
          </div>
        </Grupa>
      </div>
      <Grupa naslov="Isti signali u tri širine kolone">
        <div className="flex flex-col gap-2">
          {(["w-40", "w-72", "w-[32rem]"] as const).map((sirina) => (
            <div
              key={sirina}
              className={`${sirina} max-w-full rounded-md border border-dashed border-line p-1.5`}
            >
              <ChipOverflow items={stavke} />
            </div>
          ))}
        </div>
      </Grupa>
      <Grupa naslov="Monogrami — boja po niši">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          {FIRME.map((firma) => (
            <div key={firma.naziv} className="flex items-center gap-2">
              <Monogram name={firma.naziv} seed={firma.nisa} />
              <div className="min-w-0">
                <p className="text-ui font-medium text-foreground">{firma.naziv}</p>
                <p className="text-meta text-text-muted">{firma.nisa}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Monogram name="Salon Dunav" seed="frizerski salon" size="sm" />
          <Monogram name="Salon Dunav" seed="frizerski salon" size="md" />
          <Monogram name="Salon Dunav" seed="frizerski salon" size="lg" />
        </div>
      </Grupa>
    </Sekcija>
  );
}

function ZaglavljeIFokus() {
  return (
    <Sekcija
      naslov="Zaglavlje strane i fokus kartica"
      opis="Zaglavlje nosi ikonicu modula, naslov, jedan red podnaslova i jedno primarno dugme. Fokus kartica je jedina koja sme ivicu u gradijentu i obojenu senku."
    >
      <div className="rounded-xl border border-line-soft p-5">
        <PageHeader
          variant="module"
          title="Leadovi"
          icon={Users}
          description="178 firmi čeka prvi poziv · 6 sastanaka ove nedelje"
          info="U „Zovi sada“ ulaze firme koje imaju telefon, procenu broja od najmanje 40 % i nikad nisu dodirnute."
          actions={
            <>
              <Button variant="secondary">
                <Upload /> Uvoz leadova
              </Button>
              <Button variant="primary">
                <PhoneCall /> Započni režim poziva
              </Button>
            </>
          }
        />
      </div>
      <FocusCard
        eyebrow="Danas"
        title="Pozovi 5 firmi iz Zovi sada"
        action={
          <>
            <Button variant="primary">
              <PhoneCall /> Započni režim poziva
            </Button>
            <Button variant="ghost">Preskoči za danas</Button>
          </>
        }
        aside={
          <ProgressRing value={2} max={5} size={88} stroke={8} label="Pozivi danas">
            <span className="text-title font-bold text-foreground">2/5</span>
            <span className="mt-1 font-sans text-meta text-text-muted">poziva</span>
          </ProgressRing>
        }
      >
        <p className="text-ui text-text-muted">
          Dva su obavljena. Još tri do dnevnog cilja i misije od 60 XP.
        </p>
      </FocusCard>
    </Sekcija>
  );
}

function PraznaStanja() {
  return (
    <Sekcija
      naslov="Prazna stanja"
      opis="Obično stanje ne slavi prazninu. „Misija za start“ je za ekran koji još nema podataka jer nešto nije urađeno. Linija zamenjuje red pločica kad su sve nule."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-line-soft">
          <EmptyState
            icon={CalendarCheck}
            title="Nema zaostalih koraka"
            action={<Button variant="outline">Otvori tabelu</Button>}
          >
            Leadovi bez planiranog koraka su u tabeli.
          </EmptyState>
        </div>
        <div className="rounded-xl border border-line-soft" data-module="facebook">
          <EmptyState
            variant="mission"
            icon={Link2}
            title="Poveži Facebook stranicu"
            steps={[
              { label: "Prijavi se na Meta nalog", done: true },
              { label: "Izaberi stranicu agencije", xp: 50 },
              { label: "Pusti prvu sinhronizaciju", xp: 20 },
            ]}
            action={
              <Button variant="primary">
                <Link2 /> Poveži stranicu
              </Button>
            }
          >
            Dok stranica nije povezana, ovde nema šta da se prikaže.
          </EmptyState>
        </div>
      </div>
      <EmptyState
        variant="line"
        icon={Eye}
        title="Još nema podataka za ovaj period."
        action={<Button variant="outline" size="sm">Promeni period</Button>}
      >
        Prva sinhronizacija puni poslednjih 28 dana.
      </EmptyState>
    </Sekcija>
  );
}

function NapredakUAkciji() {
  const [pozivi, setPozivi] = useState(2);
  const [xp, setXp] = useState(1240);
  const [toastovi, setToastovi] = useState<Array<{ id: number; xp: number; naslov: string }>>(
    [],
  );
  const [prasak, setPrasak] = useState(0);
  const cilj = 5;
  const gotovo = pozivi >= cilj;

  const dodajPoziv = () => {
    if (gotovo) return;
    const zavrsava = pozivi + 1 >= cilj;
    const zarada = zavrsava ? 70 : 10;
    setPozivi((n) => n + 1);
    setXp((n) => n + zarada);
    setToastovi((lista) => [
      ...lista,
      {
        id: Date.now(),
        xp: zarada,
        naslov: zavrsava ? "Misija završena" : "Poziv zabeležen",
      },
    ]);
  };

  const vrati = () => {
    setPozivi(2);
    setXp(1240);
    setToastovi([]);
  };

  return (
    <Sekcija
      naslov="Napredak u akciji"
      opis="Pri otvaranju se ništa ne pomera. Merači se pomere kad se vrednost promeni, a završena misija je jedino mesto gde pokret prebaci."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={dodajPoziv} disabled={gotovo}>
          <Plus /> Zabeleži poziv
        </Button>
        <Button variant="outline" onClick={vrati}>
          Vrati na početak
        </Button>
        <span className="relative">
          <Button variant="ghost" onClick={() => setPrasak((n) => n + 1)}>
            <Trophy /> Prasak
          </Button>
          <CelebrationBurst trigger={prasak} />
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr]">
        <MissionCard
          featured
          icon={PhoneCall}
          title="Pozovi 5 firmi iz Zovi sada"
          value={pozivi}
          max={cilj}
          xp={60}
          done={gotovo}
          action={
            <Button variant="primary" onClick={dodajPoziv}>
              <PhoneCall /> Započni režim poziva
            </Button>
          }
        />
        <MissionCard
          icon={Upload}
          title="Reši 10 nerazrešenih redova"
          value={4}
          max={10}
          xp={50}
          action={<Button variant="secondary">Otvori uvoz</Button>}
        />
        <MissionCard
          icon={Send}
          title="Objavi nešto ove nedelje"
          value={1}
          max={1}
          xp={60}
          done
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Grupa naslov="Nedeljni ciljevi">
          <div className="flex flex-wrap items-center gap-6">
            <Prsten modul="leadovi" vrednost={14 + pozivi} cilj={25} natpis="Pozivi" />
            <Prsten modul="tabla" vrednost={2} cilj={3} natpis="Sastanci" />
            <Prsten modul="instagram" vrednost={2} cilj={2} natpis="Objave" />
          </div>
          <div className="flex flex-col gap-3" data-module="leadovi">
            <ProgressBar
              value={14 + pozivi}
              max={30}
              goal={25}
              label="Pozivi ove nedelje"
              showValue
            />
            <ProgressBar value={62} max={100} tone="info" label="Kvalitet baze" showValue format={(v) => `${v} %`} />
            <ProgressBar value={8} max={20} tone="warning" size="sm" label="Čistoća uvoza" showValue />
          </div>
          <div data-module="instagram">
            <SegmentedMeter
              label="Spremnost kanala"
              segments={[
                { label: "Povezan", done: true },
                { label: "Sinhronizuje", done: true },
                { label: "Objava u 7 dana", done: true },
                { label: "Nema neodgovorenih", done: false, hint: "3 komentara čekaju odgovor" },
              ]}
            />
          </div>
        </Grupa>

        <Grupa naslov="Nivo, XP i niz">
          <div className="flex items-center gap-4">
            <LevelBadge level={7} tier="silver" rank="Operativac" size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-copy font-medium text-foreground">Operativac · nivo 7</p>
              <XpBar xp={xp} from={1120} to={1500} level={7} className="mt-2" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <LevelBadge level={3} tier="bronze" />
            <LevelBadge level={7} tier="silver" />
            <LevelBadge level={14} tier="gold" />
            <LevelBadge level={22} tier="platinum" />
            <LevelBadge level={31} tier="diamond" />
            <LevelBadge level={7} tier="silver" size="sm" />
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <StreakFlame days={4} />
            <StreakFlame days={12} state="at-risk" />
            <StreakFlame days={0} state="idle" />
            <StreakFlame days={21} size="sm" />
          </div>
        </Grupa>
      </div>

      <Grupa naslov="Dostignuća">
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <AchievementBadge
            icon={Phone}
            title="Prvi kontakt"
            description="Prvi zabeležen poziv"
            rarity="common"
            unlockedAt="2. okt 2026."
          />
          <AchievementBadge
            icon={CalendarPlus}
            title="Zakazano!"
            description="Prvi dogovoren sastanak"
            rarity="rare"
            unlockedAt="6. okt 2026."
          />
          <AchievementBadge
            icon={PhoneCall}
            title="Na liniji"
            description="10 dodira u jednom danu"
            rarity="epic"
            unlockedAt="9. okt 2026."
          />
          <AchievementBadge
            icon={Trophy}
            title="Zatvarač"
            description="Prvi dobijen posao"
            rarity="legendary"
            unlockedAt="10. okt 2026."
          />
          <AchievementBadge
            icon={CalendarCheck}
            title="Pun kalendar"
            description="5 sastanaka u jednoj nedelji"
            rarity="epic"
            locked
          />
          <AchievementBadge
            icon={ShieldCheck}
            title="Čuvar budžeta"
            description="Prvo aktivno pravilo"
            rarity="rare"
            locked
          />
        </div>
      </Grupa>

      <RewardToastViewport>
        {toastovi.map((t) => (
          <RewardToast
            key={t.id}
            xp={t.xp}
            title={t.naslov}
            onDismiss={() => setToastovi((lista) => lista.filter((x) => x.id !== t.id))}
          />
        ))}
      </RewardToastViewport>
    </Sekcija>
  );
}

function Prsten({
  modul,
  vrednost,
  cilj,
  natpis,
}: {
  modul: string;
  vrednost: number;
  cilj: number;
  natpis: string;
}) {
  const procenat = Math.round((Math.min(vrednost, cilj) / cilj) * 100);
  return (
    <div data-module={modul} className="flex items-center gap-3">
      <ProgressRing value={vrednost} max={cilj} size={64} stroke={7} label={`${natpis} ove nedelje`}>
        <span className="text-ui font-bold text-foreground">{procenat} %</span>
      </ProgressRing>
      <div>
        <p className="text-ui font-medium text-foreground">{natpis}</p>
        <p className="font-mono text-meta text-text-muted tabular-nums">
          {vrednost} / {cilj}
        </p>
      </div>
    </div>
  );
}

/** Širina bočne trake bez zupčanika — kartica se ovde vidi kao u ljusci. */
function KarticaIgraca() {
  const zajednicko = {
    initials: "TO",
    title: "Enigma IT (probni)",
    subtitle: "operater@example.com",
  };
  return (
    <Sekcija
      naslov="Kartica igrača"
      opis="Dno bočne trake. Tri oblika iste visine: identitet, isključen napredak i napredak; desno su oblici za šinu ikonica."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Grupa naslov="Identitet">
          <div className="w-48 rounded-lg border border-line-soft">
            <PlayerCard {...zajednicko} />
          </div>
        </Grupa>
        <Grupa naslov="Napredak isključen">
          <div className="w-48 rounded-lg border border-line-soft">
            <PlayerCard {...zajednicko} progress="off" />
          </div>
        </Grupa>
        <Grupa naslov="Napredak">
          <div className="w-48 rounded-lg border border-line-soft">
            <PlayerCard
              {...zajednicko}
              progress={{
                rank: "Operativac",
                level: 4,
                tier: "silver",
                xp: 1240,
                xpFrom: 900,
                xpTo: 1500,
                streakDays: 6,
              }}
            />
          </div>
        </Grupa>
        <Grupa naslov="Šina i učitavanje">
          <div className="flex items-center gap-3">
            <div className="w-11 rounded-lg border border-line-soft">
              <PlayerCard {...zajednicko} rail />
            </div>
            <div className="w-11 rounded-lg border border-line-soft">
              <PlayerCard
                {...zajednicko}
                rail
                progress={{
                  rank: "Operativac",
                  level: 4,
                  tier: "silver",
                  xp: 1240,
                  xpFrom: 900,
                  xpTo: 1500,
                  streakDays: 6,
                }}
              />
            </div>
            <div className="w-40 rounded-lg border border-line-soft">
              <PlayerCard {...zajednicko} loading />
            </div>
          </div>
        </Grupa>
      </div>
    </Sekcija>
  );
}

function ProbaPortala() {
  return (
    <Sekcija
      naslov="Proba portala"
      opis="Dijalog, iskačući panel i oblačić se crtaju van sadržaja strane. Boju modula dobijaju sa korenskog elementa — promeni modul gore i otvori ponovo."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Dialog>
          <DialogTrigger render={<Button variant="primary" />}>Otvori dijalog</DialogTrigger>
          <DialogPopup>
            <DialogHeader>
              <DialogTitle>Zakaži sastanak</DialogTitle>
              <DialogDescription>
                Primarno dugme, okvir fokusa i tinta ispod su u boji aktivnog modula.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap gap-1.5">
              <Chip tone="module">Modul</Chip>
              <Chip tone="info">Podsetnik dan ranije</Chip>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Odustani</DialogClose>
              <DialogClose render={<Button variant="primary" />}>
                <CalendarPlus /> Zakaži
              </DialogClose>
            </DialogFooter>
          </DialogPopup>
        </Dialog>

        <Popover>
          <PopoverTrigger render={<Button variant="secondary" />}>Iskačući panel</PopoverTrigger>
          <PopoverContent align="start">
            <p className="text-ui text-muted-foreground">
              Isti tokeni i ovde: <span className="font-medium text-mod">boja modula</span>.
            </p>
            <Button variant="primary" size="sm">
              Potvrdi
            </Button>
          </PopoverContent>
        </Popover>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger render={<Button variant="outline" />}>Oblačić</TooltipTrigger>
            <TooltipContent>Kratko objašnjenje uz kontrolu.</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </Sekcija>
  );
}
