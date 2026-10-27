"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  FolderCog,
  Globe,
  History,
  KeyRound,
  Link2,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import {
  ConnectionsSettings,
  ConnectionsSettingsSkeleton,
} from "@/components/app/settings/connections-settings";
import { ActionAuditLog } from "@/components/app/settings/action-audit-log";
import { ModerationAuditLog } from "@/components/app/settings/moderation-audit-log";
import { InvitesPanel } from "@/components/app/settings/invites-panel";
import { MembersPanel } from "@/components/app/settings/members-panel";
import { IngestTokensPanel } from "@/components/app/settings/ingest-tokens-panel";
import { NapredakSettings } from "@/components/app/settings/napredak-settings";
import { ProjekatPanel } from "@/components/app/settings/projekat-panel";
import { MozakPanel } from "@/components/app/settings/mozak-panel";
import { SajtPanel } from "@/components/app/settings/sajt-panel";
import { useProjekat, useProjekatHref } from "@/components/app/projekat-provider";
import { PageHeader } from "@/components/app/page-header";
import { TabNav, TabPanel, type TabItem } from "@/components/app/tab-nav";
import type { Uloga } from "@/convex/lib/uloge";

/**
 * Jezičak je u adresi (`?tab=`), pa birač projekta vodi pravo na „Projekat“, a
 * povratak sa povezivanja kanala na „Integracije“. Bez parametra (ili sa
 * nepoznatim) otvara se „Integracije“: kartice veza čitaju `ig_connected`,
 * `ig_code` i ostale parametre samo kad su montirane.
 */
type Tab =
  | "integracije"
  | "projekat"
  | "sajt"
  | "mozak"
  | "pristup"
  | "istorija"
  | "moderacija"
  | "napredak";

const TABS: readonly TabItem<Tab>[] = [
  { id: "integracije", label: "Integracije", icon: Link2 },
  { id: "projekat", label: "Projekat", icon: FolderCog },
  { id: "sajt", label: "Sajt i oglasi", icon: Globe },
  { id: "mozak", label: "Mozak", icon: BookOpen },
  { id: "pristup", label: "Pristup", icon: KeyRound },
  { id: "istorija", label: "Istorija akcija", icon: History },
  { id: "moderacija", label: "Moderacija", icon: ShieldCheck },
  { id: "napredak", label: "Napredak", icon: Trophy },
];

const PODRAZUMEVAN: Tab = "integracije";

function izAdrese(vrednost: string | null): Tab {
  return TABS.some((t) => t.id === vrednost) ? (vrednost as Tab) : PODRAZUMEVAN;
}

const COPY: Record<Tab, { title: string; blurb: string; info?: string }> = {
  integracije: {
    title: "Integracije",
    blurb: "Poveži izvore podataka; kredencijali se čuvaju enkriptovano.",
    info: "Kredencijali se koriste isključivo pri sinhronizaciji i sigurnim akcijama.",
  },
  projekat: {
    title: "Projekat",
    blurb: "Ime, izgled, domeni, sajtovi i moduli ovog projekta.",
    info: "Menja ih vlasnik projekta; vrstu projekta i domene samo vlasnik platforme.",
  },
  sajt: {
    title: "Sajt i oglasi",
    blurb: "Piksel, kratki linkovi, osvežavanje novosti, Puls i granice budžeta oglasa.",
    info: "Menja ih vlasnik projekta; tajne se samo upisuju i brišu, nikad se ne prikazuju.",
  },
  mozak: {
    title: "Mozak projekta",
    blurb: "Ponuda, kupac, ton, zabrane i skripte za skillove leadova i sadržaja.",
  },
  istorija: {
    title: "Istorija akcija",
    blurb:
      "Revizorski trag komandi na Meta Ads nalozima: pauziranje, budžet, dupliranje.",
  },
  moderacija: {
    title: "Moderacija",
    blurb:
      "Ko je i kada odgovorio, sakrio ili obrisao komentar na Instagramu i Facebooku.",
    info: "Spisak uključuje i radnje koje je Meta odbila.",
  },
  pristup: {
    title: "Pristup",
    blurb:
      "Članovi, pozivnice za registraciju i tokeni kojima se skill predstavlja aplikaciji.",
    info: "Pozivnicu prosleđuješ ručno — osoba se registruje sa tačno tom adresom; bez pozivnice nema novog naloga.",
  },
  napredak: {
    title: "Napredak",
    blurb: "XP, misije, niz i nedeljni ciljevi; podešavanja važe samo za tvoj nalog.",
  },
};

export default function SettingsPage() {
  // `useSearchParams` traži Suspense granicu.
  return (
    <Suspense fallback={<ConnectionsSettingsSkeleton />}>
      <Podesavanja />
    </Suspense>
  );
}

/**
 * Jezičci po ulozi (P9; backend iste izmene već odbija): „Sajt i oglasi“ i
 * „Pristup“ vidi samo vlasnik, a „Integracije“ posmatrač ne vidi (urednik vidi
 * samo stanje veza, bez dugmadi). Dok uloga nije stigla, crtaju se svi.
 */
function jezicciZa(uloga: Uloga | null): readonly TabItem<Tab>[] {
  if (uloga === null || uloga === "owner") return TABS;
  return TABS.filter(
    (t) =>
      t.id !== "sajt" &&
      t.id !== "pristup" &&
      !(uloga === "client_viewer" && t.id === "integracije"),
  );
}

function Podesavanja() {
  const params = useSearchParams();
  const router = useRouter();
  const ka = useProjekatHref();
  const { uloga } = useProjekat();
  const tabs = jezicciZa(uloga);
  const izabran = izAdrese(params.get("tab"));
  // Jezičak koji uloga ne vidi vodi na prvi koji vidi (posmatrač: Projekat).
  const tab = tabs.some((t) => t.id === izabran) ? izabran : tabs[0].id;
  const copy = COPY[tab];
  // Jezičak menja samo svoj parametar: `?ux=1`, `prazno=1` i ostali ostaju.
  const setTab = (sledeci: Tab) => {
    const p = new URLSearchParams(params.toString());
    p.set("tab", sledeci);
    router.replace(`${ka("/settings")}?${p.toString()}`, { scroll: false });
  };

  return (
    <div className="w-full">
      {/* Cela širina kolone: integracije su mreža pločica, a dnevnici tabele.
          Identitet aktivne kartice nosi traka sa jezičcima; opis je prati. */}
      <PageHeader variant="module" description={copy.blurb} info={copy.info} />

      <TabNav
        className="mt-6"
        tabs={tabs}
        active={tab}
        onChange={setTab}
        panelId="settings-panel"
      />

      <TabPanel id="settings-panel">
        {tab === "integracije" ? (
          <Suspense fallback={<ConnectionsSettingsSkeleton />}>
            <ConnectionsSettings />
          </Suspense>
        ) : tab === "projekat" ? (
          <ProjekatPanel />
        ) : tab === "sajt" ? (
          <SajtPanel />
        ) : tab === "mozak" ? (
          <MozakPanel />
        ) : tab === "istorija" ? (
          <ActionAuditLog />
        ) : tab === "moderacija" ? (
          <ModerationAuditLog />
        ) : tab === "napredak" ? (
          <NapredakSettings />
        ) : (
          <div className="space-y-10">
            <MembersPanel />
            <InvitesPanel />
            {/* Sekcija se sama ne crta osim vlasniku (GL1, plan §5). */}
            <IngestTokensPanel />
          </div>
        )}
      </TabPanel>
    </div>
  );
}
