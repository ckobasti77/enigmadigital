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
import { UxHarness } from "../harness";

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
};

export const dynamic = "force-dynamic";

export default async function DevUxPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { slug } = await params;
  const Page = PAGES[(slug ?? []).join("/")];
  if (!Page) notFound();

  return (
    <UxHarness>
      <AppShell>
        <Page />
      </AppShell>
    </UxHarness>
  );
}
