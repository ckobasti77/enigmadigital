import type { ComponentType } from "react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import OverviewPage from "@/app/(app)/page";
import LeadsPage from "@/app/(app)/leadovi/page";
import LeadImportPage from "@/app/(app)/leadovi/uvoz/page";
import InstagramPage from "@/app/(app)/instagram/page";
import OpenReplyPage from "@/app/(app)/openreply/page";
import SettingsPage from "@/app/(app)/settings/page";
import RulesPage from "@/app/(app)/rules/page";
import NovostiPage from "@/app/(app)/novosti/page";
import AnalyticsPage from "@/app/(app)/analytics/page";
import AttributionPage from "@/app/(app)/atribucija/page";
import FacebookPage from "@/app/(app)/facebook/page";
import ThreadsPage from "@/app/(app)/threads/page";
import YouTubePage from "@/app/(app)/youtube/page";
import AdsPage from "@/app/(app)/ads/page";
import { LeadDetailPageClient } from "@/app/(app)/leadovi/[companyId]/lead-detail-page-client";
import { UxHarness } from "../harness";
import { SistemVodic } from "../sistem/vodic";

/**
 * Razvojni prikaz pravih ekrana nad sintetičkim podacima (A1 §6).
 *
 * Playwright (`scripts/ux-snapshots.mjs`) otvara `/<ruta>?ux=1`; `proxy.ts`
 * to u dev-u prepiše na `/dev-ux/<ruta>`, pa `usePathname()` i dalje vidi
 * pravu putanju (naslov u gornjoj traci, aktivna stavka navigacije). Isti
 * `AppShell`, iste komponente ekrana — samo je Convex klijent lažan.
 *
 * U produkciji ruta ne postoji (404), i to na dva mesta: ovde i u
 * `proxy.ts`, koji prepisivanje radi samo van produkcije.
 *
 * `/sistem?ux=1` je živi vodič dizajn sistema (UI Boost §5.12). Nije ekran
 * aplikacije, pa se crta bez ljuske i bez lažnog Convex-a.
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
};

export const dynamic = "force-dynamic";

export default async function DevUxPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<{ prazno?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { slug = [] } = await params;
  const { prazno } = await searchParams;

  if (slug.join("/") === "sistem") return <SistemVodic />;

  // Profil firme je dinamična ruta (`leadovi/<id>`); ostalo je fiksna mapa.
  const profilId =
    slug.length === 2 && slug[0] === "leadovi" && slug[1] !== "uvoz"
      ? slug[1]
      : null;
  const Page = profilId ? null : PAGES[slug.join("/")];
  if (!profilId && !Page) notFound();

  return (
    <UxHarness prazno={prazno === "1"}>
      <AppShell>
        {profilId ? <LeadDetailPageClient companyId={profilId} /> : Page && <Page />}
      </AppShell>
    </UxHarness>
  );
}
