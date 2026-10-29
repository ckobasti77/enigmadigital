import type { ComponentType } from "react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import OverviewPage from "@/app/(app)/[projekat]/page";
import LeadsPage from "@/app/(app)/[projekat]/leadovi/page";
import LeadImportPage from "@/app/(app)/[projekat]/leadovi/uvoz/page";
import InstagramPage from "@/app/(app)/[projekat]/instagram/page";
import OpenReplyPage from "@/app/(app)/[projekat]/openreply/page";
import SettingsPage from "@/app/(app)/[projekat]/settings/page";
import RulesPage from "@/app/(app)/[projekat]/rules/page";
import NovostiPage from "@/app/(app)/[projekat]/novosti/page";
import AnalyticsPage from "@/app/(app)/[projekat]/analytics/page";
import AttributionPage from "@/app/(app)/[projekat]/atribucija/page";
import FacebookPage from "@/app/(app)/[projekat]/facebook/page";
import ThreadsPage from "@/app/(app)/[projekat]/threads/page";
import YouTubePage from "@/app/(app)/[projekat]/youtube/page";
import AdsPage from "@/app/(app)/[projekat]/ads/page";
import NapredakPage from "@/app/(app)/[projekat]/napredak/page";
import InstagramCommentsPage from "@/app/(app)/[projekat]/instagram/komentari/page";
import FacebookCommentsPage from "@/app/(app)/[projekat]/facebook/komentari/page";
import YouTubeAutomationsPage from "@/app/(app)/[projekat]/youtube/automatizacije/page";
import NewCampaignPage from "@/app/(app)/[projekat]/ads/nova-kampanja/page";
import AdsAudiencesPage from "@/app/(app)/[projekat]/ads/publike/page";
import AcquisitionPage from "@/app/(app)/[projekat]/analytics/sticanje/page";
import AnalyticsAdsPage from "@/app/(app)/[projekat]/analytics/oglasi/page";
import ContentPage from "@/app/(app)/[projekat]/analytics/sadrzaj/page";
import AudiencePage from "@/app/(app)/[projekat]/analytics/posetioci/page";
import RealtimePage from "@/app/(app)/[projekat]/analytics/uzivo/page";
import RetentionPage from "@/app/(app)/[projekat]/analytics/retencija/page";
import OpenReplyAutomationsPage from "@/app/(app)/[projekat]/openreply/automatizacije/page";
import InstagramInboxPage from "@/app/(app)/[projekat]/instagram/inbox/page";
import InstagramAudiencePage from "@/app/(app)/[projekat]/instagram/publika/page";
import InstagramStoriesPage from "@/app/(app)/[projekat]/instagram/stories/page";
import InstagramPublishPage from "@/app/(app)/[projekat]/instagram/objavi/page";
import InstagramPostDetailPage from "@/app/(app)/[projekat]/instagram/objave/[mediaId]/page";
import ZadaciPage from "@/app/(app)/[projekat]/zadaci/page";
import IdejePage from "@/app/(app)/[projekat]/ideje/page";
import PorukeProjektaPage from "@/app/(app)/[projekat]/poruke/page";
import BeleskeProjektaPage from "@/app/(app)/[projekat]/beleske/page";
import PulsPage from "@/app/(app)/[projekat]/puls/page";
import AktivnostPage from "@/app/(app)/[projekat]/aktivnost/page";
import KorpaPage from "@/app/(app)/[projekat]/korpa/page";
import DokumentiPage from "@/app/(app)/[projekat]/dokumenti/page";
import OblastPage from "@/app/(app)/[projekat]/dokumenti/[oblastId]/page";
import StranicaPage from "@/app/(app)/[projekat]/stranica/[stranicaId]/page";
import DanasPage from "@/app/(app)/(ja)/page";
import MojiZadaciPage from "@/app/(app)/(ja)/moji-zadaci/page";
import InboxPage from "@/app/(app)/(ja)/inbox/page";
import OtvoriPage from "@/app/(app)/(ja)/otvori/page";
import PorukePage from "@/app/(app)/(ja)/poruke/page";
import BeleskePage from "@/app/(app)/(ja)/beleske/page";
import SviProjektiPage from "@/app/(app)/(ja)/projekti/page";
import NoviProjekatPage from "@/app/(app)/(ja)/novi/page";
import { LoginClient } from "@/app/login/login-client";
import { PozivnicaClient } from "@/app/pozivnica/[token]/pozivnica-client";
import { LeadDetailPageClient } from "@/app/(app)/[projekat]/leadovi/[companyId]/lead-detail-page-client";
import { AuthGate } from "@/components/app/auth-gate";
import { ProjekatProvider } from "@/components/app/projekat-provider";
import { EKRANI, JA_PUTANJE } from "@/lib/rutiranje";
import { UxHarness } from "../harness";
import { PROJEKTI_UX } from "../fixtures-projekti";
import { SistemVodic } from "../sistem/vodic";

/**
 * Razvojni prikaz pravih ekrana nad sintetičkim podacima (A1 §6).
 *
 * Playwright (`scripts/ux-snapshots.mjs`) otvara `/<ruta>?ux=1`; `proxy.ts`
 * to u dev-u prepiše na `/dev-ux/<ruta>`, pa `usePathname()` i dalje vidi
 * pravu putanju (naslov u gornjoj traci, aktivna stavka navigacije). Isti
 * `AppShell`, iste komponente ekrana — samo je Convex klijent lažan.
 *
 * Dva režima, kao prava aplikacija (plan C02 §7.9, D10):
 *   - adresa SA prefiksom projekta (`/scanme/leadovi?ux=1`) je hub: prvi
 *     segment koji nije ime ekrana je slug projekta; nepoznat slug crta
 *     „Projekat nije dostupan“, kao pravi upit;
 *   - adresa BEZ prefiksa (`/leadovi?ux=1`) simulira panel domen projekta
 *     „Enigma IT“ (drugi projekat: `&panel=<slug>`), pa postojeće adrese i
 *     snimci rade bez izmene;
 *   - lični nivo „Ja“ (SPAJANJE, plan S07 §8.3) ide pre grananja hub/panel:
 *     `/?ux=1` je Danas, `/moji-zadaci`, `/inbox`, `/poruke`, `/beleske`,
 *     `/projekti` i `/novi` su „Ja“ (`/poruke` i `/beleske` bez prefiksa su
 *     lični, D3); `/?ux=1&rezim=hub` ostaje alias za `/projekti`, a
 *     `/?ux=1&rezim=panel` je stara kontrolna tabla u panelu.
 *
 * U produkciji ruta ne postoji (404), i to na dva mesta: ovde i u
 * `proxy.ts`, koji prepisivanje radi samo van produkcije.
 *
 * `/sistem?ux=1` je živi vodič dizajn sistema (UI Boost §5.12). Nije ekran
 * aplikacije, pa se crta bez ljuske. Pločice i kartica sa vezom prave adresu
 * kroz projekat (`ProjekatLink`), pa vodič stoji u panelu „Enigma IT“.
 */
const PAGES: Record<string, ComponentType> = {
  "": OverviewPage,
  leadovi: LeadsPage,
  "leadovi/uvoz": LeadImportPage,
  instagram: InstagramPage,
  openreply: OpenReplyPage,
  settings: SettingsPage,
  rules: RulesPage,
  novosti: NovostiPage,
  analytics: AnalyticsPage,
  atribucija: AttributionPage,
  facebook: FacebookPage,
  threads: ThreadsPage,
  youtube: YouTubePage,
  ads: AdsPage,
  napredak: NapredakPage,
  // B8: podekrani kanala (zaglavlje i primarno dugme). Komentari Instagrama
  // nemaju sintetičke podatke, pa se ispod zaglavlja vidi učitavanje.
  "instagram/komentari": InstagramCommentsPage,
  "facebook/komentari": FacebookCommentsPage,
  "youtube/automatizacije": YouTubeAutomationsPage,
  "ads/nova-kampanja": NewCampaignPage,
  "ads/publike": AdsAudiencesPage,
  // B9: podekrani Analitike i automatizacije OpenReply-ja.
  "analytics/sticanje": AcquisitionPage,
  "analytics/oglasi": AnalyticsAdsPage,
  "analytics/sadrzaj": ContentPage,
  "analytics/posetioci": AudiencePage,
  "analytics/uzivo": RealtimePage,
  "analytics/retencija": RetentionPage,
  "openreply/automatizacije": OpenReplyAutomationsPage,
  // C04: ostali podekrani Instagrama (bez sintetičkih podataka crtaju
  // učitavanje).
  "instagram/inbox": InstagramInboxPage,
  "instagram/publika": InstagramAudiencePage,
  "instagram/stories": InstagramStoriesPage,
  // C08: kompozer objave (dnevnu dozvolu daje fikstura akcije) — svaki ekran
  // iz navigacije se otvara u razvojnom prikazu.
  "instagram/objavi": InstagramPublishPage,
  // SPAJANJE S09: radni deo projekta (sadržaj donose kasniji koraci).
  zadaci: ZadaciPage,
  ideje: IdejePage,
  poruke: PorukeProjektaPage,
  beleske: BeleskeProjektaPage,
  puls: PulsPage,
  aktivnost: AktivnostPage,
  korpa: KorpaPage,
  dokumenti: DokumentiPage,
};

/** Lični nivo „Ja“ (SPAJANJE P13): ista ljuska, bez projekta. */
const JA_PAGES: Record<string, ComponentType> = {
  "": DanasPage,
  "moji-zadaci": MojiZadaciPage,
  inbox: InboxPage,
  // Link iz obaveštenja (S17): razreši projekat i vodi na cilj.
  otvori: OtvoriPage,
  poruke: PorukePage,
  beleske: BeleskePage,
  projekti: SviProjektiPage,
  novi: NoviProjekatPage,
};

export const dynamic = "force-dynamic";

export default async function DevUxPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<{
    prazno?: string;
    pad?: string;
    panel?: string;
    rezim?: string;
    stanje?: string;
    uloga?: string;
    projekata?: string;
  }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { slug: putanja = [] } = await params;
  const { prazno, pad, panel, rezim: trazeniRezim, stanje, uloga, projekata } =
    await searchParams;

  if (putanja.join("/") === "sistem") {
    return (
      <UxHarness>
        <ProjekatProvider slug="enigma-it" rezim="panel">
          <SistemVodic />
        </ProjekatProvider>
      </UxHarness>
    );
  }

  // Prijava je van ljuske. Prava ruta čita pravi Convex (`trebaSetup`), pa se
  // za snimak crta ovde, nad lažnim klijentom i bez `AppShell`-a. Sa
  // `&panel=<slug>` simulira panel domen: brend je isti oblik koji daje
  // `projekti.javniBrend` (ime, boja, logo).
  if (putanja.join("/") === "login") {
    const p = panel ? PROJEKTI_UX.find((x) => x.slug === panel) : undefined;
    return (
      <UxHarness>
        <LoginClient brend={p ? { ime: p.ime, boja: p.boja, logoUrl: p.logoUrl } : null} />
      </UxHarness>
    );
  }

  // Ekran pozivnice je javna ruta van ljuske (`/pozivnica` matcher proxy-ja
  // izuzima, pa se razvojni prikaz otvara kao `/pozivnica-ux?ux=1`).
  // `&stanje=nov|postojeci|prijavljen|druga` bira slučaj: nov nalog
  // (registracija), postojeći nalog pre prijave, prijavljen sa istom adresom
  // (prihvatanje) i prijavljen sa drugom adresom.
  if (putanja.join("/") === "pozivnica-ux") {
    const izbor = ["nov", "postojeci", "prijavljen", "druga"].includes(stanje ?? "")
      ? (stanje as string)
      : "nov";
    return (
      <UxHarness odjavljen={izbor === "nov" || izbor === "postojeci"}>
        <PozivnicaClient token={`ux-${izbor}`} />
      </UxHarness>
    );
  }

  // Lični nivo „Ja“ (SPAJANJE, plan S07 §8.3) ide pre grananja hub/panel:
  // prazna putanja bez `rezim` je Danas, `rezim=hub` je stari alias huba, a
  // prvi segment iz „Ja“ ili hub (`projekti`, `novi`) je lična strana.
  const jaPutanje: readonly string[] = JA_PUTANJE;
  const jaKljuc =
    putanja.length === 0
      ? trazeniRezim === "hub"
        ? "projekti"
        : trazeniRezim === "panel"
          ? null
          : ""
      : putanja.length === 1 &&
          (jaPutanje.includes(putanja[0]) || putanja[0] === "projekti" || putanja[0] === "novi")
        ? putanja[0]
        : null;
  if (jaKljuc !== null) {
    const JaPage = JA_PAGES[jaKljuc];
    if (!JaPage) notFound();
    // `&projekata=1|22`: hub sa jednim ili sa više od 20 projekata (C16).
    const broj = Number(projekata);
    return (
      <UxHarness
        prazno={prazno === "1"}
        pad={pad}
        projekata={Number.isInteger(broj) && broj >= 1 && broj <= 40 ? broj : undefined}
      >
        {/* Isto kao `app/(app)/layout.tsx` i `app/(app)/(ja)/layout.tsx`. */}
        <AuthGate>
          <AppShell opseg="ja">
            <JaPage />
          </AppShell>
        </AuthGate>
      </UxHarness>
    );
  }

  const ekrani: readonly string[] = EKRANI;
  const sPrefiksom = putanja.length > 0 && !ekrani.includes(putanja[0]);
  const projekat = sPrefiksom ? putanja[0] : (panel ?? "enigma-it");
  const rezim = sPrefiksom ? "hub" : "panel";
  const slug = sPrefiksom ? putanja.slice(1) : putanja;

  // Profil firme (`leadovi/<id>`) i detalj objave (`instagram/objave/<id>`)
  // su dinamične rute; ostalo je fiksna mapa.
  const profilId =
    slug.length === 2 && slug[0] === "leadovi" && slug[1] !== "uvoz"
      ? slug[1]
      : null;
  const objavaId =
    slug.length === 3 && slug[0] === "instagram" && slug[1] === "objave"
      ? slug[2]
      : null;
  // Radni deo (SPAJANJE): oblast i stranica su dinamične rute sa ID-jem.
  const oblastId = slug.length === 2 && slug[0] === "dokumenti" ? slug[1] : null;
  const stranicaId = slug.length === 2 && slug[0] === "stranica" ? slug[1] : null;
  const dinamicna = profilId || objavaId || oblastId || stranicaId;
  const Page = dinamicna ? null : PAGES[slug.join("/")];
  if (!dinamicna && !Page) notFound();

  return (
    <UxHarness prazno={prazno === "1"} pad={pad} uloga={uloga}>
      {/* Isto kao `app/(app)/layout.tsx` (traka samo u hubu) i
          `app/(app)/[projekat]/layout.tsx`. */}
      <div data-traka={rezim === "panel" ? "ne" : undefined} className="contents">
      <AuthGate>
        <ProjekatProvider slug={projekat} rezim={rezim}>
          <AppShell>
            {profilId ? (
              <LeadDetailPageClient companyId={profilId} />
            ) : objavaId ? (
              <InstagramPostDetailPage params={Promise.resolve({ mediaId: objavaId })} />
            ) : oblastId ? (
              <OblastPage params={Promise.resolve({ oblastId })} />
            ) : stranicaId ? (
              <StranicaPage params={Promise.resolve({ stranicaId })} />
            ) : (
              Page && <Page />
            )}
          </AppShell>
        </ProjekatProvider>
      </AuthGate>
      </div>
    </UxHarness>
  );
}
