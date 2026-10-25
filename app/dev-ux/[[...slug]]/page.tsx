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
import { LoginClient } from "@/app/login/login-client";
import { LeadDetailPageClient } from "@/app/(app)/[projekat]/leadovi/[companyId]/lead-detail-page-client";
import { AuthGate } from "@/components/app/auth-gate";
import { SviProjekti } from "@/components/app/hub/svi-projekti";
import { NoviProjekat } from "@/components/app/hub/novi-projekat";
import { ProjekatProvider } from "@/components/app/projekat-provider";
import { EKRANI } from "@/lib/rutiranje";
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
 *   - `/?ux=1&rezim=hub` je hub „Svi projekti“.
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
  }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { slug: putanja = [] } = await params;
  const { prazno, pad, panel, rezim: trazeniRezim } = await searchParams;

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

  // Čarobnjak „Novi projekat“ je hub putanja, van ljuske projekta.
  if (putanja.join("/") === "novi") {
    return (
      <UxHarness prazno={prazno === "1"} pad={pad}>
        <AuthGate>
          <div data-module="tabla" className="flex min-h-full flex-1 flex-col">
            <NoviProjekat />
          </div>
        </AuthGate>
      </UxHarness>
    );
  }

  if (putanja.length === 0 && trazeniRezim === "hub") {
    return (
      <UxHarness prazno={prazno === "1"} pad={pad}>
        <AuthGate>
          <SviProjekti />
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
  const Page = profilId || objavaId ? null : PAGES[slug.join("/")];
  if (!profilId && !objavaId && !Page) notFound();

  return (
    <UxHarness prazno={prazno === "1"} pad={pad}>
      {/* Isto kao `app/(app)/layout.tsx` i `app/(app)/[projekat]/layout.tsx`. */}
      <AuthGate>
        <ProjekatProvider slug={projekat} rezim={rezim}>
          <AppShell>
            {profilId ? (
              <LeadDetailPageClient companyId={profilId} />
            ) : objavaId ? (
              <InstagramPostDetailPage params={Promise.resolve({ mediaId: objavaId })} />
            ) : (
              Page && <Page />
            )}
          </AppShell>
        </ProjekatProvider>
      </AuthGate>
    </UxHarness>
  );
}
