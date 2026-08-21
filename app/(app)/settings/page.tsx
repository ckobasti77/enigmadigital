"use client";

import { useState, Suspense } from "react";
import { History, Link2, ShieldCheck } from "lucide-react";
import {
  ConnectionsSettings,
  ConnectionsSettingsSkeleton,
} from "@/components/app/settings/connections-settings";
import { ActionAuditLog } from "@/components/app/settings/action-audit-log";
import { ModerationAuditLog } from "@/components/app/settings/moderation-audit-log";
import { PageHeader } from "@/components/app/page-header";
import { TabNav, TabPanel, type TabItem } from "@/components/app/tab-nav";

type Tab = "connections" | "audit" | "moderation";

const TABS: readonly TabItem<Tab>[] = [
  { id: "connections", label: "Integracije", icon: Link2 },
  { id: "audit", label: "Istorija akcija", icon: History },
  { id: "moderation", label: "Moderacija", icon: ShieldCheck },
];

const COPY: Record<Tab, { title: string; blurb: string }> = {
  connections: {
    title: "Integracije",
    blurb:
      "Poveži izvore podataka. Kredencijali se čuvaju enkriptovano i koriste se isključivo pri sinhronizaciji i sigurnim akcijama.",
  },
  audit: {
    title: "Istorija akcija",
    blurb:
      "Revizorski trag svih izvršenih komandi na povezanim Meta Ads nalozima (pauziranje, budžet, dupliranje).",
  },
  moderation: {
    title: "Moderacija",
    blurb:
      "Ko je i kada odgovorio, sakrio ili obrisao komentar na Instagramu i Facebook stranici — uključujući i radnje koje je Meta odbila.",
  },
};

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("connections");
  const copy = COPY[tab];

  return (
    <div className="w-full max-w-4xl">
      {/* Identitet aktivne kartice (Integracije / Istorija / Moderacija) nosi
          sama traka sa jezičcima ispod — naslov se ne ponavlja. Opis prati
          izabranu karticu. */}
      <PageHeader description={copy.blurb} />

      <TabNav
        className="mt-8"
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
        ) : (
          <ModerationAuditLog />
        )}
      </TabPanel>
    </div>
  );
}
