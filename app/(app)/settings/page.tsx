"use client";

import { useState, Suspense } from "react";
import {
  ConnectionsSettings,
  ConnectionsSettingsSkeleton,
} from "@/components/app/settings/connections-settings";
import { ActionAuditLog } from "@/components/app/settings/action-audit-log";
import { cn } from "@/lib/utils";
import { Link2, History } from "lucide-react";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"connections" | "audit">("connections");

  return (
    <div className="w-full max-w-4xl space-y-6">
      <div>
        <p className="heading-caps text-xs font-medium text-text-muted">
          Podešavanja
        </p>
        <h1 className="mt-1 text-3xl font-bold leading-tight tracking-tight text-foreground">
          {activeTab === "connections" ? "Integracije" : "Istorija akcija"}
        </h1>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {activeTab === "connections"
            ? "Poveži izvore podataka. Kredencijali se čuvaju enkriptovano i koriste se isključivo pri sinhronizaciji i sigurnim akcijama."
            : "Revizorski trag svih izvršenih komandi na povezanim Meta Ads nalozima (pauziranje, budžet, dupliranje)."}
        </p>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-line pb-px">
        <button
          type="button"
          onClick={() => setActiveTab("connections")}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
            activeTab === "connections"
              ? "border-accent-400 text-foreground"
              : "border-transparent text-text-muted hover:text-foreground hover:border-line-soft",
          )}
        >
          <Link2 className="size-4" />
          <span>Integracije</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("audit")}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
            activeTab === "audit"
              ? "border-accent-400 text-foreground"
              : "border-transparent text-text-muted hover:text-foreground hover:border-line-soft",
          )}
        >
          <History className="size-4" />
          <span>Istorija akcija</span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "connections" ? (
        <Suspense fallback={<ConnectionsSettingsSkeleton />}>
          <ConnectionsSettings />
        </Suspense>
      ) : (
        <ActionAuditLog />
      )}
    </div>
  );
}
