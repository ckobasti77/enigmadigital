"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { ArrowRight, History, LoaderCircle, Plus, Upload, XCircle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useWorkspace } from "@/components/app/workspace-provider";
import type { Id } from "@/convex/_generated/dataModel";
import { TabNav, TabPanel } from "@/components/app/tab-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FeedbackNote } from "@/components/app/feedback";
import { useNow } from "@/components/app/use-now";
import { jeZastaoUPregledu } from "@/convex/lib/importFlow";
import { trajanje } from "@/convex/lib/notifications";
import { pluralSr } from "@/lib/format";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { ImportFilePicker } from "./import-file-picker";
import { ImportReviewTable } from "./import-review-table";
import { ImportsHistory } from "./imports-history";

type Tab = "staging" | "history";

export function ImportDashboard() {
  const { workspace, isLoading } = useWorkspace();
  const [tab, setTab] = useState<Tab>("staging");
  // A5 §2 tačka 5: „Odustani od uvoza" i iz trake na stranici, ne samo iz
  // istorije — traka je mesto na kom se problem i vidi.
  const [abandoningImportId, setAbandoningImportId] = useState<Id<"leadImports"> | null>(null);
  const [isAbandoning, setIsAbandoning] = useState(false);
  const [abandonError, setAbandonError] = useState<string | null>(null);

  // `/leadovi/uvoz?import=<id>` — link koji `/generate-leads/ingest` vrati
  // skillu na kraju runa (GL1, plan §5), i link iz zvona (A2). Bez ovoga bi taj
  // link otvarao prazan ekran „Novi uvoz", a poruka u terminalu bi tvrdila da
  // vodi na uvoz.
  //
  // Čita se SAMO kao početna vrednost: čim čovek klikne „Započni novi uvoz",
  // odlučuje njegov klik, ne stari parametar u adresi.
  const searchParams = useSearchParams();
  const [activeImportId, setActiveImportId] = useState<Id<"leadImports"> | null>(
    () => {
      const iz = searchParams.get("import");
      return iz ? (iz as Id<"leadImports">) : null;
    },
  );
  // `&prikaz=nerazreseno` (A5): stavka „Reši preostale" iz zvona otvara uvoz sa
  // već uključenim skupom nerazrešenih redova — inače dugme vodi u tabelu od
  // sto redova u kojoj tih 41 tek treba naći.
  const [prikaz, setPrikaz] = useState<"sve" | "nerazreseno">(() =>
    searchParams.get("prikaz") === "nerazreseno" ? "nerazreseno" : "sve",
  );

  const now = useNow();
  const workspaceId = workspace?.id as Id<"workspaces"> | undefined;
  const imports = useQuery(
    api.leadImportStore.listImports,
    workspaceId ? { workspaceId } : "skip",
  );
  const abandonImportMutation = useMutation(api.leadImportStore.abandonImport);

  if (isLoading || !workspace || !workspaceId) {
    return <ImportDashboardSkeleton />;
  }

  const handleImportCreated = (importId: Id<"leadImports">) => {
    setActiveImportId(importId);
    setPrikaz("sve");
    setTab("staging");
  };

  const handleSelectHistoryImport = (
    importId: Id<"leadImports">,
    zeljeniPrikaz?: "nerazreseno",
  ) => {
    setActiveImportId(importId);
    setPrikaz(zeljeniPrikaz ?? "sve");
    setTab("staging");
  };

  const handleStartNewImport = () => {
    setActiveImportId(null);
    setPrikaz("sve");
    setTab("staging");
  };

  const handleAbandonConfirm = async () => {
    if (!abandoningImportId) return;
    setIsAbandoning(true);
    setAbandonError(null);
    try {
      await abandonImportMutation({ workspaceId, importId: abandoningImportId });
      if (activeImportId === abandoningImportId) setActiveImportId(null);
      setAbandoningImportId(null);
    } catch (err: unknown) {
      if (err instanceof ConvexError) {
        const data = err.data as { code?: string; message?: string };
        setAbandonError(`[${data.code || "greška"}]: ${data.message || err.message}`);
      } else if (err instanceof Error) {
        setAbandonError(err.message);
      } else {
        setAbandonError(String(err));
      }
    } finally {
      setIsAbandoning(false);
    }
  };

  // A5 §2 tačka 5: uvozi „U pregledu" stariji od 24 h. Prag je isti onaj po kom
  // zvono podiže hitnost (`PRAG_HITNO_MS`), pa traka i zvono ne mogu da tvrde
  // različito. Najstariji je prvi — njega i treba prvog rešiti.
  const zastali = (imports ?? [])
    .filter((imp) => jeZastaoUPregledu(imp, now))
    .sort((a, b) => a.uploadedAt - b.uploadedAt);

  return (
    <div className="flex flex-1 flex-col gap-6">
      {zastali.length > 0 && (
        <FeedbackNote
          tone="warning"
          title={`${zastali.length} ${pluralSr(zastali.length, "uvoz čeka", "uvoza čekaju", "uvoza čeka")} pregled duže od 24 h`}
        >
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {zastali.map((imp) => (
              <li
                key={imp._id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs"
              >
                {/* Naziv i koliko stoji levo, dve radnje desno — na svakom redu
                    na istom mestu, da se pogledom prelazi spisak, ne traži. */}
                <span className="flex min-w-0 flex-wrap items-center gap-x-2">
                  <span className="font-medium text-foreground">{imp.fileName}</span>
                  <span className="text-text-muted">
                    · stoji {trajanje(Math.max(0, now - imp.uploadedAt))} ·{" "}
                    {imp.rowsParsed} {pluralSr(imp.rowsParsed, "red", "reda", "redova")}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleSelectHistoryImport(imp._id)}
                    className="h-7 bg-accent-500 hover:bg-accent-600 text-text-inverse text-xs font-semibold"
                  >
                    Nastavi pregled
                    <ArrowRight className="size-3.5 ml-1" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAbandonError(null);
                      setAbandoningImportId(imp._id);
                    }}
                    className="h-7 text-xs border-line-soft text-text-muted hover:border-line-strong hover:text-foreground"
                  >
                    <XCircle className="size-3.5 mr-1" />
                    Odustani od uvoza
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </FeedbackNote>
      )}

      {abandonError && (
        <FeedbackNote tone="danger" title="Greška pri odustajanju od uvoza">
          {abandonError}
        </FeedbackNote>
      )}

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
              // Ključ vraća unutrašnje stanje pregleda (izabrani skup redova)
              // kad se otvori drugi uvoz — bez njega bi „Reši preostale" na
              // jednom uvozu ostavilo filter uključen na sledećem.
              key={`${activeImportId}:${prikaz}`}
              workspaceId={workspaceId}
              importId={activeImportId}
              onBack={handleStartNewImport}
              pocetniPrikaz={prikaz}
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

      {/* Potvrda odustajanja (ista radnja postoji i u istoriji uvoza) */}
      <Dialog
        open={abandoningImportId !== null}
        onOpenChange={(open) => {
          if (!open && !isAbandoning) setAbandoningImportId(null);
        }}
      >
        <DialogPopup className="max-w-md">
          <DialogClose />
          <DialogHeader>
            <DialogTitle>Odustajanje od uvoza</DialogTitle>
            <DialogDescription>
              Uvoz prestaje da čeka pregled i nestaje iz obaveštenja.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs text-text-secondary">
            <FeedbackNote tone="warning" title="Šta se dešava">
              <ul className="mt-1 list-disc space-y-1 pl-4 text-micro text-text-muted">
                <li>Ništa se ne briše — redovi ostaju i uvoz se i dalje otvara iz istorije.</li>
                <li>Ovaj uvoz nije primenjen, pa u bazi firmi nije ni napravio ništa.</li>
                <li>Ako ti ipak zatreba, ponovo otpremi isti fajl.</li>
              </ul>
            </FeedbackNote>

            {abandonError && (
              <FeedbackNote tone="danger" title="Greška">
                {abandonError}
              </FeedbackNote>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAbandoningImportId(null)}
              disabled={isAbandoning}
            >
              Ne, vrati me
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleAbandonConfirm}
              disabled={isAbandoning}
              className="bg-danger text-text-inverse font-semibold hover:bg-danger/90"
            >
              {isAbandoning ? (
                <>
                  <LoaderCircle className="animate-spin size-4 mr-1.5" />
                  Odustajem...
                </>
              ) : (
                "Potvrdi odustajanje"
              )}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}

export function ImportDashboardSkeleton() {
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
