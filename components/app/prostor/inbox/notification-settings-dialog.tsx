"use client";

// Preneto iz Devotion apps/web/components/workspace/notification-settings-dialog.tsx (main @ c05c40f), SPAJANJE S17.
import { useId, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Moon } from "lucide-react";

import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { NotificationType } from "@/convex/prostor/lib/notifications";
import {
  isRowEnabled,
  NOTIFICATION_SETTINGS_GROUPS,
  toggleRow,
  type SettingsGroupKey,
  type SettingsRow,
} from "@/convex/prostor/lib/notificationSettingsCatalog";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { toast } from "@/lib/toast";

import { PushToggle } from "./notifications-panel";

/** Podrazumevani prozor tihih sati pri prvom uključivanju (22:00–08:00). */
const DEFAULT_QUIET_START = 22 * 60;
const DEFAULT_QUIET_END = 8 * 60;

/** Nazivi grupa na ekranu (katalog je deljen sa telefonom i backendom). */
const NAZIV_GRUPE: Record<SettingsGroupKey, string> = {
  chat: "Poruke",
  tasks: "Zadaci",
  team: "Tim",
};

type Settings = {
  mutedTypes: Array<NotificationType>;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
};

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

/** Minuti od ponoći → „HH:MM“ za `<input type="time">`. */
export function minutesToTime(minutes: number) {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** „HH:MM“ → minuti od ponoći; `null` za neispravan unos. */
export function timeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (match === null) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

/**
 * Podešavanja obaveštenja (paritet red 9 i 32): web push na ovom uređaju,
 * vrste obaveštenja i tihi sati. Podešavanja su PO PROFILU
 * (`notificationSettings`), pa isključena vrsta važi na svim uređajima. Utišana
 * vrsta i tihi sati važe za obaveštenja na uređaju; Inbox čuva sve.
 *
 * Nema dugmeta za probu zvuka (Devotion izuzetak): sistemski zvuk pušta
 * telefon, a web push nema ekvivalent.
 *
 * Omotač (učitavanje) + forma (unos): forma kreće od učitanih podešavanja i
 * montira se tek kad stignu, pa prekidači nikad ne „trepnu“ iz podrazumevanog
 * stanja.
 */
export function NotificationSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="gap-0 p-0 sm:max-w-md">
        <DialogHeader className="border-b border-line-soft px-6 pb-4 pr-14 pt-5">
          <DialogTitle>Obaveštenja</DialogTitle>
          <DialogDescription className="text-meta">
            Šta ti stiže kao obaveštenje na uređaju. Inbox čuva sve, a izbor važi na svim tvojim uređajima.
          </DialogDescription>
        </DialogHeader>
        {/* Izmene se čuvaju odmah, pa dijalog nema dugme „Sačuvaj“, samo zatvaranje. */}
        <DialogClose />
        {open && <TeloPodesavanja />}
      </DialogPopup>
    </Dialog>
  );
}

function TeloPodesavanja() {
  const settings = useQuery(api.prostor.notificationSettings.get, {});
  return (
    <div className="max-h-[min(70vh,32rem)] space-y-5 overflow-y-auto px-6 py-4">
      {/* Prijem na OVOM uređaju (web push); bez javnog ključa ga nema. */}
      <PushToggle />
      {settings === undefined ? (
        <div className="space-y-2">
          <span className="sr-only" role="status" aria-live="polite">
            Učitavam podešavanja…
          </span>
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} aria-hidden="true" className="h-10 rounded-md" />
          ))}
        </div>
      ) : (
        <SettingsForm initial={settings} />
      )}
    </div>
  );
}

/**
 * `initial` prati server, ali stanje se postavlja samo pri montiranju —
 * izmene u realnom vremenu ne gaze korisnikov unos. `initial` je i cilj
 * vraćanja ako upis padne (uvek istina servera).
 */
function SettingsForm({ initial }: { initial: Settings }) {
  const update = useMutation(api.prostor.notificationSettings.update);
  const [mutedTypes, setMutedTypes] = useState<string[]>(initial.mutedTypes);
  const [quietStart, setQuietStart] = useState<number | null>(initial.quietHoursStart);
  const [quietEnd, setQuietEnd] = useState<number | null>(initial.quietHoursEnd);
  const id = useId();

  async function persist(next: {
    mutedTypes: string[];
    quietHoursStart: number | null;
    quietHoursEnd: number | null;
  }) {
    try {
      await update({
        // Katalog garantuje poznate vrste; tip je za validator.
        mutedTypes: next.mutedTypes as Array<NotificationType>,
        quietHoursStart: next.quietHoursStart,
        quietHoursEnd: next.quietHoursEnd,
      });
    } catch (error) {
      setMutedTypes(initial.mutedTypes);
      setQuietStart(initial.quietHoursStart);
      setQuietEnd(initial.quietHoursEnd);
      toast.error(accessErrorMessage(error, "Podešavanje nije sačuvano."));
    }
  }

  function onToggleRow(row: SettingsRow, enabled: boolean) {
    const next = toggleRow(row, mutedTypes, enabled);
    setMutedTypes(next);
    void persist({ mutedTypes: next, quietHoursStart: quietStart, quietHoursEnd: quietEnd });
  }

  function onToggleQuiet(enabled: boolean) {
    const nextStart = enabled ? (quietStart ?? DEFAULT_QUIET_START) : null;
    const nextEnd = enabled ? (quietEnd ?? DEFAULT_QUIET_END) : null;
    setQuietStart(nextStart);
    setQuietEnd(nextEnd);
    void persist({ mutedTypes, quietHoursStart: nextStart, quietHoursEnd: nextEnd });
  }

  function onChangeTime(which: "start" | "end", value: string) {
    const minutes = timeToMinutes(value);
    if (minutes === null) return; // nepotpun ili neispravan unos — čeka se ispravan
    const nextStart = which === "start" ? minutes : quietStart;
    const nextEnd = which === "end" ? minutes : quietEnd;
    setQuietStart(nextStart);
    setQuietEnd(nextEnd);
    void persist({ mutedTypes, quietHoursStart: nextStart, quietHoursEnd: nextEnd });
  }

  const quietOn = quietStart !== null && quietEnd !== null;

  return (
    <>
      {NOTIFICATION_SETTINGS_GROUPS.map((group) => (
        <section key={group.key} aria-labelledby={`${id}-${group.key}`}>
          <h3 id={`${id}-${group.key}`} className="heading-caps pb-1 text-meta text-text-muted">
            {NAZIV_GRUPE[group.key]}
          </h3>
          <ul className="divide-y divide-line-soft">
            {group.rows.map((row) => (
              <li key={row.key} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <label htmlFor={`${id}-${row.key}`} className="block text-ui text-foreground">
                    {row.label}
                  </label>
                  {row.description ? (
                    <p className="mt-0.5 text-meta leading-5 text-text-muted">{row.description}</p>
                  ) : null}
                </div>
                <Switch
                  id={`${id}-${row.key}`}
                  checked={isRowEnabled(row, mutedTypes)}
                  onCheckedChange={(enabled) => onToggleRow(row, enabled)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section aria-labelledby={`${id}-tiho`}>
        <h3 id={`${id}-tiho`} className="heading-caps pb-1 text-meta text-text-muted">
          Tihi sati
        </h3>
        <div className="flex items-center gap-3 py-2.5">
          <Moon className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <label htmlFor={`${id}-tiho-ukljuceno`} className="block text-ui text-foreground">
              Utišaj uređaj noću
            </label>
            <p className="mt-0.5 text-meta leading-5 text-text-muted">
              Rokovi i pominjanja i dalje prolaze.
            </p>
          </div>
          <Switch id={`${id}-tiho-ukljuceno`} checked={quietOn} onCheckedChange={onToggleQuiet} />
        </div>
        {quietOn ? (
          <div className="flex items-end gap-3 border-t border-line-soft pb-1 pt-3">
            <div className="flex-1 space-y-1">
              <label htmlFor={`${id}-od`} className="block text-meta text-text-muted">
                Od
              </label>
              <Input
                id={`${id}-od`}
                type="time"
                className="tabular-nums"
                value={minutesToTime(quietStart ?? DEFAULT_QUIET_START)}
                onChange={(event) => onChangeTime("start", event.target.value)}
              />
            </div>
            <div className="flex-1 space-y-1">
              <label htmlFor={`${id}-do`} className="block text-meta text-text-muted">
                Do
              </label>
              <Input
                id={`${id}-do`}
                type="time"
                className="tabular-nums"
                value={minutesToTime(quietEnd ?? DEFAULT_QUIET_END)}
                onChange={(event) => onChangeTime("end", event.target.value)}
              />
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}
