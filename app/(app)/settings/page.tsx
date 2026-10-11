"use client";

import { useState, Suspense } from "react";
import { History, KeyRound, Link2, ShieldCheck, Trophy } from "lucide-react";
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
import { PageHeader } from "@/components/app/page-header";
import { TabNav, TabPanel, type TabItem } from "@/components/app/tab-nav";

type Tab = "connections" | "audit" | "moderation" | "access" | "napredak";

const TABS: readonly TabItem<Tab>[] = [
  { id: "connections", label: "Integracije", icon: Link2 },
  { id: "audit", label: "Istorija akcija", icon: History },
  { id: "moderation", label: "Moderacija", icon: ShieldCheck },
  { id: "access", label: "Pristup", icon: KeyRound },
  { id: "napredak", label: "Napredak", icon: Trophy },
];

const COPY: Record<Tab, { title: string; blurb: string; info?: string }> = {
  connections: {
    title: "Integracije",
    blurb: "Poveži izvore podataka; kredencijali se čuvaju enkriptovano.",
    info: "Kredencijali se koriste isključivo pri sinhronizaciji i sigurnim akcijama.",
  },
  audit: {
    title: "Istorija akcija",
    blurb:
      "Revizorski trag komandi na Meta Ads nalozima: pauziranje, budžet, dupliranje.",
  },
  moderation: {
    title: "Moderacija",
    blurb:
      "Ko je i kada odgovorio, sakrio ili obrisao komentar na Instagramu i Facebooku.",
    info: "Spisak uključuje i radnje koje je Meta odbila.",
  },
  access: {
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
  const [tab, setTab] = useState<Tab>("connections");
  const copy = COPY[tab];

  return (
    <div className="w-full">
      {/* Cela širina kolone: integracije su mreža pločica, a dnevnici tabele.
          Identitet aktivne kartice nosi traka sa jezičcima; opis je prati. */}
      <PageHeader variant="module" description={copy.blurb} info={copy.info} />

      <TabNav
        className="mt-6"
        tabs={TABS}
        active={tab}
        onChange={setTab}
        panelId="settings-panel"
      />

      <TabPanel id="settings-panel">
        {tab === "connections" ? (
          <Suspense fallback={<ConnectionsSettingsSkeleton />}>
            <ConnectionsSettings />
          </Suspense>
        ) : tab === "audit" ? (
          <ActionAuditLog />
        ) : tab === "moderation" ? (
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
