"use client";

// Preneto iz Devotion apps/web/components/workspace/notifications-panel.tsx (main @ c05c40f), SPAJANJE S17.
import { useCallback, useEffect, useId, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  AtSign,
  BellRing,
  CalendarClock,
  CheckSquare2,
  Flame,
  Gavel,
  Lightbulb,
  MessageCircle,
  MessageSquare,
  MessageSquareText,
  Sparkles,
} from "lucide-react";

import { useQueryTolerant } from "@/components/app/prostor/podaci/ja";
import { ProfileAvatar } from "@/components/app/prostor/zajednicko/radni-ui";
import { useProstorNavigacija } from "@/components/app/prostor/use-prostor-navigacija";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatNumber } from "@/lib/format";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { odredisteObavestenja, type CiljObavestenja } from "@/lib/prostor/web/obavestenja";
import { PUSH_TEKST, mozeUkljuciti } from "@/lib/prostor/web/push";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import type { InboxItemModel } from "./inbox-view";
import { PUSH_PODESEN, usePushNotifications } from "./use-push-notifications";

/** Ikonica po vrsti obaveštenja; obaveštenje sa autorom crta njegov avatar. */
export const TYPE_ICON: Record<string, typeof CheckSquare2> = {
  task_assigned: CheckSquare2,
  task_status_changed: CheckSquare2,
  task_due_soon: CalendarClock,
  task_due_today: CalendarClock,
  task_overdue: Flame,
  idea_voted: Lightbulb,
  idea_converted: Sparkles,
  vote_requested: Gavel,
  request_resolved: Gavel,
  puls_ready: Sparkles,
  // Poruke: pominjanje nosi @, DM je razgovor jedan-na-jedan, poruka u kanalu
  // je opšti oblačić. Ikonica je rezerva — obično stoji avatar autora.
  chat_message: MessageCircle,
  chat_mention: AtSign,
  chat_dm: MessageSquare,
  // Komentari: pominjanje nosi @ kao u porukama, nov komentar oblačić sa tekstom.
  comment_mention: AtSign,
  comment_added: MessageSquareText,
};

/** Prekoračen rok je jedina vrsta koja sme da nosi crvenu (kašnjenje). */
export const LOUD_TYPES = new Set(["task_overdue"]);

/**
 * Znak reda: avatar autora, a bez autora ikonica vrste (kašnjenje je crveno).
 * Živi ovde, a ne u `inbox-view`, jer ga crta i zvono u ljusci: tako ceo
 * ekran Inbox-a ne ulazi u prvo učitavanje svake strane (S28).
 */
export function ZnakObavestenja({
  item,
  className,
}: {
  item: Pick<InboxItemModel, "type" | "actor">;
  className?: string;
}) {
  if (item.actor !== null) return <ProfileAvatar profile={item.actor} className={cn("size-8", className)} />;
  const Icon = TYPE_ICON[item.type] ?? BellRing;
  const loud = LOUD_TYPES.has(item.type);
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full",
        loud ? "bg-danger-soft text-danger" : "bg-surface-raised text-text-secondary",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}

/**
 * Prva strana Inboxa kroz sve projekte i lične poruke: zvono (kartica Inbox) i
 * toast za novo obaveštenje čitaju ISTE argumente, pa ih Convex klijent svodi
 * na jednu pretplatu.
 */
export const GLAVA_INBOXA = { paginationOpts: { numItems: 8, cursor: null } };

/**
 * Stavka onoliko koliko klik čita. Bez `_id` (stavka „Čeka tebe“ nije
 * obaveštenje) nema šta da se označi kao pročitano.
 */
export type StavkaObavestenja = CiljObavestenja & {
  _id?: Id<"notifications">;
  readAt?: number | null;
};

/**
 * Klik na obaveštenje (Inbox, zvono, toast): označi pročitano („ispali i
 * zaboravi“ — navigacija ne čeka mrežu), pa idi na povod. Lično obaveštenje
 * bez odredišta ostaje na mestu, uz objašnjenje. `posle` se zove pre odlaska
 * (npr. zatvori zvono).
 */
export function useOtvoriObavestenje(): (item: StavkaObavestenja, posle?: () => void) => void {
  const markRead = useMutation(api.prostor.notifications.markRead);
  const { idi } = useProstorNavigacija();
  return useCallback(
    (item: StavkaObavestenja, posle?: () => void) => {
      if (item._id !== undefined && item.readAt === null) {
        void markRead({ notificationId: item._id }).catch((error: unknown) =>
          toast.error(accessErrorMessage(error, "Označavanje nije uspelo.")),
        );
      }
      const odrediste = odredisteObavestenja(item);
      if (odrediste.kind === "nista") {
        toast.info("Ovo obaveštenje nema odredište. Označeno je kao pročitano.");
        return;
      }
      posle?.();
      if (odrediste.kind === "ja") idi(odrediste.ruta);
      else idi(odrediste.ruta, { projekat: odrediste.workspaceId });
    },
    [idi, markRead],
  );
}

/**
 * Prijem obaveštenja na ovom uređaju (web push), prekidač u podešavanjima
 * obaveštenja. Bez javnog VAPID ključa se ne crta uopšte: nema prekidača,
 * nema registracije radnika i nema greške u konzoli.
 */
export function PushToggle() {
  if (!PUSH_PODESEN) return null;
  return <PushPrekidac />;
}

function PushPrekidac() {
  const { state, busy, error, enable, disable } = usePushNotifications();
  const deviceCount = useQueryTolerant(api.prostor.pushSubscriptions.myDeviceCount, {});
  const id = useId();
  const tekst = PUSH_TEKST[state];

  if (state === "checking" || tekst === null) {
    return <Skeleton className="h-14 rounded-lg" />;
  }

  const ukljuceno = state === "enabled";
  const mozeSe = ukljuceno || mozeUkljuciti(state);

  return (
    <div className="flex items-start gap-3 py-1">
      <BellRing
        className={cn(
          "mt-0.5 size-4 shrink-0",
          ukljuceno ? "text-success" : state === "blocked" ? "text-warning" : "text-text-muted",
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <label htmlFor={`${id}-push`} className="block text-ui font-medium text-foreground">
          {tekst.naslov}
        </label>
        <p id={`${id}-opis`} className="mt-0.5 text-meta leading-5 text-text-muted">
          {busy ? (ukljuceno ? "Isključujem…" : "Uključujem…") : tekst.opis}
        </p>
        {ukljuceno && (deviceCount ?? 0) > 1 ? (
          <p className="mt-0.5 text-meta text-text-muted">
            Uređaja koji primaju: <span className="tabular-nums">{formatNumber(deviceCount ?? 0)}</span>
          </p>
        ) : null}
        {error === null ? null : (
          <p role="alert" className="mt-1 text-meta leading-5 text-danger">
            {error}
          </p>
        )}
      </div>
      {mozeSe ? (
        <Switch
          id={`${id}-push`}
          aria-describedby={`${id}-opis`}
          checked={ukljuceno}
          disabled={busy}
          onCheckedChange={(on) => void (on ? enable() : disable())}
        />
      ) : null}
    </div>
  );
}

/**
 * Toast za obaveštenje koje stigne dok je aplikacija otvorena (Devotion
 * `useNotificationToasts`). Montira se jednom u ljusci. Ne javlja se za ono što
 * je već bilo tu pri učitavanju — inače bi svako osvežavanje zasulo ekran
 * starim obaveštenjima. Čita glavu ličnog Inboxa (svi moji projekti i lične
 * poruke), istu pretplatu kao zvono.
 */
export function ObavestenjaToast() {
  const profil = useQuery(api.prostor.profiles.getCurrent);
  const ima = profil !== undefined && profil !== null;
  const glava = useQueryTolerant(api.prostor.inbox.feed, ima ? GLAVA_INBOXA : "skip");
  const otvori = useOtvoriObavestenje();
  // `Date.now()` se čita samo u efektu: React zabranjuje nečiste pozive u renderu.
  const mountedAtRef = useRef<number | null>(null);
  const seenRef = useRef(new Set<string>());
  // Kuka sama drži svežu verziju povratnog poziva.
  const otvoriRef = useRef(otvori);
  useEffect(() => {
    otvoriRef.current = otvori;
  });

  useEffect(() => {
    if (glava === undefined) return;
    if (mountedAtRef.current === null) mountedAtRef.current = Date.now();
    const mountedAt = mountedAtRef.current;
    for (const item of glava.page) {
      if (seenRef.current.has(item._id)) continue;
      seenRef.current.add(item._id);
      if (item.createdAt <= mountedAt) continue;
      if (item.readAt !== null) continue;
      toast(item.title, {
        description: item.body,
        action: { label: "Otvori", onClick: () => otvoriRef.current(item) },
      });
    }
  }, [glava]);

  return null;
}
