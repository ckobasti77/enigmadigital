"use client";

import { useState } from "react";
import { FileSpreadsheet, History, Plus, Upload } from "lucide-react";
import { useWorkspace } from "@/components/app/workspace-provider";
import type { Id } from "@/convex/_generated/dataModel";
import { TabNav, TabPanel } from "@/components/app/tab-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ImportFilePicker } from "./import-file-picker";
import { ImportReviewTable } from "./import-review-table";
import { ImportsHistory } from "./imports-history";

type Tab = "staging" | "history";

export function ImportDashboard() {
  const { workspace, isLoading } = useWorkspace();
  const [tab, setTab] = useState<Tab>("staging");
  const [activeImportId, setActiveImportId] = useState<Id<"leadImports"> | null>(null);

  if (isLoading || !workspace) {
    return <ImportDashboardSkeleton />;
  }

  const workspaceId = workspace.id as Id<"workspaces">;

  const handleImportCreated = (importId: Id<"leadImports">) => {
    setActiveImportId(importId);
    setTab("staging");
  };

  const handleSelectHistoryImport = (importId: Id<"leadImports">) => {
    setActiveImportId(importId);
    setTab("staging");
  };

  const handleStartNewImport = () => {
    setActiveImportId(null);
    setTab("staging");
  };

  return (
    <div className="flex flex-1 flex-col gap-6">
      <TabNav
        tabs={[
          {
            id: "staging",
            label: activeImportId ? "Pregled staging-a" : "Novi uvoz",
            icon: Upload,
          },
          {
            id: "history",
            label: "Istorija uvoza",
            icon: History,
          },
        ]}
        active={tab}
        onChange={(nextTab) => setTab(nextTab)}
        panelId="import-dashboard-panel"
        trailing={
          tab === "staging" && activeImportId ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleStartNewImport}
              className="text-xs"
            >
              <Plus className="size-3.5 mr-1" />
              Započni novi uvoz
            </Button>
          ) : undefined
        }
      />

      <TabPanel id="import-dashboard-panel" className="flex-1">
        {tab === "staging" ? (
          activeImportId ? (
            <ImportReviewTable
              workspaceId={workspaceId}
              importId={activeImportId}
              onBack={handleStartNewImport}
            />
          ) : (
            <ImportFilePicker
              workspaceId={workspaceId}
              onImportCreated={handleImportCreated}
            />
          )
        ) : (
          <ImportsHistory
            workspaceId={workspaceId}
            onSelectImport={handleSelectHistoryImport}
          />
        )}
      </TabPanel>
    </div>
  );
}

function ImportDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-line pb-px">
        <div className="flex gap-4">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
