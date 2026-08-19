"use client";

import { useState, Suspense } from "react";
import { History, Link2 } from "lucide-react";
import {
  ConnectionsSettings,
  ConnectionsSettingsSkeleton,
} from "@/components/app/settings/connections-settings";
import { ActionAuditLog } from "@/components/app/settings/action-audit-log";
import { TabNav, TabPanel, type TabItem } from "@/components/app/tab-nav";

type Tab = "connections" | "audit";

const TABS: readonly TabItem<Tab>[] = [
  { id: "connections", label: "Integracije", icon: Link2 },
  { id: "audit", label: "Istorija akcija", icon: History },
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
};

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("connections");
  const copy = COPY[tab];

  return (
    <div className="w-full max-w-4xl">
      <p className="heading-caps text-micro font-medium text-text-muted">
        Podešavanja
      </p>
      <h1 className="mt-2 text-h1 text-foreground">{copy.title}</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
        {copy.blurb}
      </p>

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
        ) : (
          <ActionAuditLog />
        )}
      </TabPanel>
    </div>
  );
}
