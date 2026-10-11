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
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FeedbackNote } from "@/components/app/feedback";
import { FocusCard } from "@/components/app/system/focus-card";
import { ProgressBar } from "@/components/app/system/progress";
import { useNow } from "@/components/app/use-now";
import { jeZastaoUPregledu } from "@/convex/lib/importFlow";
import { trajanje } from "@/convex/lib/notifications";
import { formatNumber, pluralSr } from "@/lib/format";
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

/** Uvoz koji čeka pregled duže od ovoga je „star" — nudi se odustajanje od svih odjednom. */
const STARO_DANA = 30;
const STARO_MS = STARO_DANA * 24 * 60 * 60 * 1000;

function porukaGreske(err: unknown): string {
  if (err instanceof ConvexError) {
    const data = err.data as { code?: string; message?: string };
    return `[${data.code || "greška"}]: ${data.message || err.message}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

export function ImportDashboard() {
  const { workspace, isLoading } = useWorkspace();
  const [tab, setTab] = useState<Tab>("staging");
  // A5 §2 tačka 5: „Odustani od uvoza" i iz trake na stranici, ne samo iz
  // istorije — traka je mesto na kom se problem i vidi.
  const [abandoningImportId, setAbandoningImportId] = useState<Id<"leadImports"> | null>(null);
  const [isAbandoning, setIsAbandoning] = useState(false);
  const [abandonError, setAbandonError] = useState<string | null>(null);
  // B7: odustajanje od svih uvoza starijih od 30 dana, uz jednu potvrdu.
  const [grupnoOtvoreno, setGrupnoOtvoreno] = useState(false);
  const [grupnoRadi, setGrupnoRadi] = useState(false);

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
  // `?prikaz=nerazreseno` BEZ uvoza (misija „Reši N nerazrešenih redova"):
  // otvara se uvoz koji ih ima najviše. Jednom — posle toga odlučuje klik.
  const [ciljaNeresene, setCiljaNeresene] = useState(
    () =>
      searchParams.get("prikaz") === "nerazreseno" && !searchParams.get("import"),
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

  // ── Čistoća uvoza (UI Boost §6.8): redovi bez otvorene odluke / svi redovi ──
  // Uvoz od kog se odustalo više nije posao, pa ne ulazi ni u brojilac ni u
  // imenilac. Brojevi su isti oni iz istorije uvoza (`listImports`).
  const zivi = (imports ?? []).filter(
    (imp) => imp.status !== "ponisten" && imp.status !== "neuspeo",
  );
  const ukupnoRedova = zivi.reduce((n, imp) => n + imp.rowsParsed, 0);
  const saNeresenim = zivi
    .filter((imp) => imp.nerazresenoCount > 0)
    .sort((a, b) => b.nerazresenoCount - a.nerazresenoCount);
  const nereseno = saNeresenim.reduce((n, imp) => n + imp.nerazresenoCount, 0);

  if (ciljaNeresene && imports !== undefined) {
    setCiljaNeresene(false);
    if (activeImportId === null && saNeresenim[0]) {
      setActiveImportId(saNeresenim[0]._id);
    }
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
      setAbandonError(porukaGreske(err));
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
  const stari = zastali.filter((imp) => now - imp.uploadedAt > STARO_MS);

  // Ista postojeća mutacija, redom za svaki stari uvoz. Staje na prvoj grešci
  // i kaže dokle je stigla — pola posla prećutano bilo bi gore od greške.
  const handleGrupnoOdustajanje = async () => {
    setGrupnoRadi(true);
    setAbandonError(null);
    let gotovo = 0;
    try {
      for (const imp of stari) {
        await abandonImportMutation({ workspaceId, importId: imp._id });
        if (activeImportId === imp._id) setActiveImportId(null);
        gotovo++;
      }
      setGrupnoOtvoreno(false);
    } catch (err: unknown) {
      setAbandonError(
        `Odustalo se od ${gotovo} od ${stari.length} ${pluralSr(stari.length, "uvoza", "uvoza", "uvoza")}, pa je stalo: ${porukaGreske(err)}`,
      );
      setGrupnoOtvoreno(false);
    } finally {
      setGrupnoRadi(false);
    }
  };

  // Dok je otvoren pregled jednog uvoza, fokus je njegov tok (koraci, „Primeni
  // uvoz"); traka o zaostalima i Čistoća se vraćaju čim se pregled zatvori.
  const uPregledu = tab === "staging" && activeImportId !== null;
  const cistoca =
    ukupnoRedova > 0
      ? Math.floor(((ukupnoRedova - nereseno) / ukupnoRedova) * 100)
      : null;

  return (
    <div className="flex flex-1 flex-col gap-6">
      {!uPregledu && (zastali.length > 0 || cistoca !== null) && (
        <div
          className={
            zastali.length > 0
              ? "grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start"
              : "flex flex-col"
          }
        >
          {zastali.length > 0 && (
            <FocusCard
              title={`${zastali.length} ${pluralSr(zastali.length, "uvoz čeka", "uvoza čekaju", "uvoza čeka")} pregled duže od 24 h`}
            >
              <ul className="flex flex-col divide-y divide-line-soft">
                {zastali.map((imp, i) => (
                  <li
                    key={imp._id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2 first:pt-0 last:pb-0"
                  >
                    {/* Naziv i koliko stoji levo, dve radnje desno — na svakom
                        redu na istom mestu. Najstariji je prvi i JEDINI nosi
                        primarno dugme: njega treba prvog rešiti. */}
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-ui font-medium text-foreground">
                        {imp.fileName}
                      </span>
                      <span className="text-meta text-text-muted">
                        stoji {trajanje(Math.max(0, now - imp.uploadedAt))} ·{" "}
                        <span className="font-mono tabular-nums">{imp.rowsParsed}</span>{" "}
                        {pluralSr(imp.rowsParsed, "red", "reda", "redova")}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant={i === 0 ? "primary" : "secondary"}
                        onClick={() => handleSelectHistoryImport(imp._id)}
                        className="touch-target"
                      >
                        Nastavi pregled
                        <ArrowRight data-icon="inline-end" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAbandonError(null);
                          setAbandoningImportId(imp._id);
                        }}
                        className="touch-target text-text-muted"
                      >
                        <XCircle data-icon="inline-start" aria-hidden />
                        Odustani
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
              {stari.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line-soft pt-3">
                  <p className="min-w-0 text-meta text-text-muted">
                    {stari.length === zastali.length
                      ? `Svi stoje duže od ${STARO_DANA} dana.`
                      : `${stari.length} od njih ${pluralSr(stari.length, "stoji", "stoje", "stoji")} duže od ${STARO_DANA} dana.`}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAbandonError(null);
                      setGrupnoOtvoreno(true);
                    }}
                    className="touch-target"
                  >
                    Odustani od svih starijih od {STARO_DANA} dana ({stari.length})
                  </Button>
                </div>
              )}
            </FocusCard>
          )}

          {cistoca !== null && (
            <section
              aria-label="Čistoća uvoza"
              className={
                zastali.length > 0
                  ? "flex min-w-0 flex-col gap-2 lg:border-l lg:border-line-soft lg:pl-6"
                  : "flex min-w-0 flex-col gap-2"
              }
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="heading-caps text-meta font-medium text-text-muted">
                  Čistoća uvoza
                </h2>
                <span className="font-mono text-title font-bold tabular-nums text-foreground">
                  {cistoca} %
                </span>
              </div>
              <ProgressBar
                value={ukupnoRedova - nereseno}
                max={ukupnoRedova}
                tone={nereseno === 0 ? "success" : "module"}
                size="sm"
                label="Čistoća uvoza"
              />
              <p className="text-meta text-text-muted">
                <span className="font-mono tabular-nums text-foreground">
                  {formatNumber(ukupnoRedova - nereseno)}
                </span>{" "}
                od{" "}
                <span className="font-mono tabular-nums text-foreground">
                  {formatNumber(ukupnoRedova)}
                </span>{" "}
                učitanih redova nema otvorenu odluku
              </p>
              {nereseno > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-0.5">
                  <p className="min-w-0 text-ui text-foreground">
                    <span className="font-mono font-bold tabular-nums">{nereseno}</span>{" "}
                    {pluralSr(nereseno, "red čeka", "reda čekaju", "redova čeka")} odluku u{" "}
                    {saNeresenim.length}{" "}
                    {pluralSr(saNeresenim.length, "uvozu", "uvoza", "uvoza")}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    // Primarno je samo kad nema zaostalog pregleda — inače je
                    // primarno „Nastavi pregled" najstarijeg uvoza.
                    variant={zastali.length > 0 ? "secondary" : "primary"}
                    onClick={() =>
                      handleSelectHistoryImport(saNeresenim[0]._id, "nerazreseno")
                    }
                    className="touch-target shrink-0"
                  >
                    Reši preostale ({saNeresenim[0].nerazresenoCount})
                    <ArrowRight data-icon="inline-end" aria-hidden />
                  </Button>
                </div>
              ) : (
                <p className="text-ui text-text-muted">
                  Nijedan red ne čeka odluku.
                </p>
              )}
            </section>
          )}
        </div>
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
            label: activeImportId ? "Pregled uvoza" : "Novi uvoz",
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
            >
              <Plus data-icon="inline-start" aria-hidden />
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

      {/* Potvrda grupnog odustajanja: ista postojeća mutacija, za svaki uvoz. */}
      <ConfirmDialog
        open={grupnoOtvoreno}
        onOpenChange={setGrupnoOtvoreno}
        title={`Odustajanje od ${stari.length} ${pluralSr(stari.length, "starog uvoza", "stara uvoza", "starih uvoza")}`}
        description={
          <>
            {stari.map((imp) => imp.fileName).join(", ")} —{" "}
            {pluralSr(stari.length, "čeka", "čekaju", "čeka")} pregled duže od{" "}
            {STARO_DANA} dana. {pluralSr(stari.length, "Prestaje", "Prestaju", "Prestaje")} da{" "}
            {pluralSr(stari.length, "čeka", "čekaju", "čeka")} i{" "}
            {pluralSr(stari.length, "nestaje", "nestaju", "nestaje")} iz obaveštenja.
            Ništa se ne briše: redovi ostaju i uvoz se i dalje otvara iz istorije.
            Nijedan od njih nije primenjen, pa u bazi firmi nije napravio ništa.
          </>
        }
        confirmLabel={`Odustani od ${stari.length}`}
        busyLabel="Odustajem…"
        busy={grupnoRadi}
        onConfirm={() => void handleGrupnoOdustajanje()}
      />

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
              variant="destructive"
              onClick={handleAbandonConfirm}
              disabled={isAbandoning}
            >
              {isAbandoning ? (
                <>
                  <LoaderCircle className="animate-spin" data-icon="inline-start" aria-hidden />
                  Odustajem…
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
