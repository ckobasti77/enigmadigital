"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Clock,
  FileSpreadsheet,
  Plus,
  ShieldAlert,
  Upload,
  Users,
} from "lucide-react";
import { useWorkspace } from "@/components/app/workspace-provider";
import type { Id } from "@/convex/_generated/dataModel";
import type { InvalidRule } from "@/convex/lib/leadScoring";
import { TabNav, TabPanel } from "@/components/app/tab-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { FeedbackNote } from "@/components/app/feedback";
import { LeadsTable } from "./leads-table";
import { GapsPanel } from "./gaps-panel";
import { OverduePanel } from "./overdue-panel";
import { LeadExportDialog } from "./lead-export-dialog";

type Tab = "leads" | "gaps" | "overdue";

export function LeadsDashboard() {
  const { workspace, isLoading } = useWorkspace();
  const [tab, setTab] = useState<Tab>("leads");
  const [invalidRules, setInvalidRules] = useState<InvalidRule[]>([]);

  if (isLoading || !workspace) {
    return <LeadsDashboardSkeleton />;
  }

  const workspaceId = workspace.id as Id<"workspaces">;

  return (
    <div className="flex flex-1 flex-col gap-6">
      {/* Obaveštenje o nevažećim ICP pravilima ocenjivanja (§4, KORAK 3.6) */}
      {invalidRules.length > 0 && (
        <FeedbackNote
          tone="warning"
          title={`${invalidRules.length} ${
            invalidRules.length === 1
              ? "pravilo ocenjivanja se ne primenjuje"
              : "pravila ocenjivanja se ne primenjuju"
          }`}
        >
          <div className="mt-1 flex flex-col gap-1.5 text-xs">
            <p>
              Pravilo koje ne radi ništa je greška u konfiguraciji, a ne ocena nula:
            </p>
            <div className="space-y-1">
              {invalidRules.map((rule, idx) => (
                <div
                  key={`${rule.ruleName}-${rule.signalKind}-${idx}`}
                  className="rounded border border-warning/30 bg-warning/5 p-2 font-mono text-micro text-foreground"
                >
                  <strong>{rule.ruleName}</strong> (signal: {rule.signalKind}) —{" "}
                  {rule.razlog === "nepoznat_signal"
                    ? "vrsta signala ne postoji u sistemu"
                    : "težina pravila je manja ili jednaka nuli"}
                </div>
              ))}
            </div>
          </div>
        </FeedbackNote>
      )}

      {/* Traka sa jezičcima */}
      <TabNav
        panelId="leadovi-panel"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "leads", label: "Tabela leadova", icon: Users },
          { id: "gaps", label: "Rupe u podacima", icon: ShieldAlert },
          { id: "overdue", label: "Zaostali koraci", icon: Clock },
        ]}
        trailing={
          <div className="flex items-center gap-2">
            <LeadExportDialog workspaceId={workspaceId} />
            <Link
              href="/leadovi/uvoz"
              className={buttonVariants({
                size: "sm",
                className: "gap-2 text-xs",
              })}
            >
              <Upload className="size-3.5" />
              <span>Uvoz leadova</span>
            </Link>
          </div>
        }
      />

      {/* Sadržaj aktivnog jezička */}
      <TabPanel id="leadovi-panel" className="flex flex-1 flex-col">
        {tab === "leads" && (
          <LeadsTable
            workspaceId={workspaceId}
            onInvalidRulesFound={setInvalidRules}
          />
        )}
        {tab === "gaps" && <GapsPanel workspaceId={workspaceId} />}
        {tab === "overdue" && <OverduePanel workspaceId={workspaceId} />}
      </TabPanel>
    </div>
  );
}

function LeadsDashboardSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>

      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}
