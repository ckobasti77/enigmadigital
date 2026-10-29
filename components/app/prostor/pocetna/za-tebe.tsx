"use client";

// Preneto iz Devotion apps/web/components/workspace/command-center/for-you-block.tsx (main @ c05c40f), SPAJANJE S20.
import { useMemo, useRef } from "react";
import { ChevronRight } from "lucide-react";
import { applyStartupHolds, type StartupTaskSection } from "@/lib/prostor/startup-tasks";
import { COMMAND_BLOCK_TEXT, forYouTasks } from "@/lib/prostor/command-center";
import { rowFromTaskItem, type TaskRowModel } from "@/lib/prostor/task-row";

import type { TaskRowActions } from "@/components/app/prostor/zadaci/task-row";
import { STARTUP_FLIP_MAX_ROWS } from "@/components/app/prostor/zadaci/constants";
import { useProjekat } from "@/components/app/projekat-provider";
import { ProjekatLink } from "@/components/app/projekat-link";
import { FlipGroup } from "@/components/motion/flip-group";
import { Button } from "@/components/ui/button";
import { COMMAND_CENTER_LIST } from "@/lib/prostor/modeli/command-center-model";
import { hrefRute } from "@/lib/prostor/rute";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import { useQueryResult } from "@/components/app/prostor/podaci/ja";
import { api } from "@/convex/_generated/api";
import type { RowRequest } from "@/lib/prostor/precice/lista-zadataka";
import { formatNumber } from "@/lib/format";

import { Block, type BlockStatus, useBlockRetry } from "./blok";
import { useJaviBroj } from "./brojevi-zaglavlja";
import { CommandTaskRow, useCommandRows, useRegisterSections } from "./rows-context";

/** Red „Za tebe" je i u Trijaži: zaseban ključ drži DOM, Flip i zadržavanje jednoznačnim. */
export const FOR_YOU_SECTION = "za-tebe";
const KEY_PREFIX = `${FOR_YOU_SECTION}:`;

/** „Svi moji zadaci" i „Svi zadaci" (relativno; prefiks projekta dodaje `ProjekatLink`). */
const MOJI_ZADACI = hrefRute({ kind: "tasks", filter: "moji" }, "");
const SVI_ZADACI = hrefRute({ kind: "tasks" }, "");

export type ForYouViewProps = {
  status: BlockStatus;
  onRetry: () => void;
  rows: TaskRowModel[];
  /** Svi moji otvoreni zadaci koji ispunjavaju uslov (red „Svi moji zadaci"). */
  total: number;
  now: number;
  actions: TaskRowActions;
  selectedKey: string | null;
  activeKey: string | null;
  request: RowRequest | null;
};

/**
 * „Za tebe" — fokus početne (plan S18 E8): moji otvoreni zadaci u ovom
 * projektu, prekoračeno → danas → u toku. Prazno stanje nema primarno dugme
 * („Novi zadatak" je već u zaglavlju), nego vezu na sve zadatke.
 */
export function ForYouView({
  status,
  onRetry,
  rows,
  total,
  now,
  actions,
  selectedKey,
  activeKey,
  request,
}: ForYouViewProps) {
  const scopeRef = useRef<HTMLUListElement>(null);
  const layoutKey = rows.map((row) => row.key).join(",");
  return (
    <Block
      id="cc-za-tebe"
      title="Za tebe"
      count={formatNumber(total)}
      status={status}
      errorText={COMMAND_BLOCK_TEXT.forYouError}
      onRetry={onRetry}
    >
      {rows.length === 0 ? (
        <EmptyState
          size="section"
          title="Nemaš otvorenih zadataka ovde."
          action={
            <Button variant="link" size="sm" render={<ProjekatLink href={SVI_ZADACI} />} nativeButton={false}>
              Svi zadaci
            </Button>
          }
        />
      ) : (
        <>
          <FlipGroup scope={scopeRef} layoutKey={layoutKey} disabled={rows.length > STARTUP_FLIP_MAX_ROWS}>
            <ul ref={scopeRef} data-section={FOR_YOU_SECTION} className="space-y-0.5">
              {rows.map((row) => (
                <li key={row.key} data-flip-id={row.key}>
                  <CommandTaskRow
                    row={row}
                    now={now}
                    actions={actions}
                    selected={selectedKey === row.key}
                    active={activeKey === row.key || `${KEY_PREFIX}${activeKey}` === row.key}
                    request={request?.key === row.key ? request : null}
                  />
                </li>
              ))}
            </ul>
          </FlipGroup>
          <Button
            variant="link"
            size="sm"
            className="mt-1 px-2"
            render={<ProjekatLink href={MOJI_ZADACI} />}
            nativeButton={false}
          >
            Svi moji zadaci{total > rows.length ? ` (${formatNumber(total)})` : ""}
            <ChevronRight data-icon="inline-end" aria-hidden="true" />
          </Button>
        </>
      )}
    </Block>
  );
}

/** Kontejner „Za tebe": `tasks.listEverywhere` (jedan upit) → `forYouTasks` → redovi sa radnjama. */
export function ForYouBlock() {
  const retry = useBlockRetry();
  const { workspaceId } = useProjekat();
  const { now, commands, limiti } = useCommandRows();
  // Lična funkcija sa izričitim projektom (server proverava članstvo; posmatrač
  // je odbijen), a blok se montira tek kad uloga sme radni deo.
  const result = useQueryResult(
    api.prostor.tasks.listEverywhere,
    workspaceId === null ? "skip" : { scope: "open", workspaceId },
  );

  const picked = useMemo(
    () => (result.data === undefined ? null : forYouTasks(result.data.items, now, limiti.zaTebe)),
    [result.data, now, limiti.zaTebe],
  );
  const sections = useMemo<StartupTaskSection[]>(() => {
    if (picked === null) return [];
    const built = picked.items.map((item) => {
      const row = rowFromTaskItem(item, commands.plannedKeys);
      return { ...row, key: `${KEY_PREFIX}${row.key}` };
    });
    return applyStartupHolds(
      COMMAND_CENTER_LIST,
      [{ id: FOR_YOU_SECTION, rows: built }],
      commands.holds,
      commands.pending,
    );
  }, [picked, commands.plannedKeys, commands.holds, commands.pending]);
  useRegisterSections(FOR_YOU_SECTION, sections);
  useJaviBroj("zaTebe", result.failed ? undefined : picked?.total);

  return (
    <ForYouView
      status={result.failed ? "error" : picked === null ? "loading" : "ready"}
      onRetry={retry}
      rows={sections[0]?.rows ?? []}
      total={picked?.total ?? 0}
      now={now}
      actions={commands.actions}
      selectedKey={commands.selectedKey}
      activeKey={commands.activeKey}
      request={commands.request}
    />
  );
}
