"use client";

// Preneto iz Devotion apps/web/components/me/chat/chat-hub-container.tsx (main @ c05c40f), SPAJANJE S15.
import { Component, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation } from "convex/react";
import { toast } from "@/lib/toast";
import { MessagesSquare, RefreshCw, TriangleAlert } from "lucide-react";
import { findHubChannel, hubGroups, type HubInput } from "@/lib/prostor";

import { useShortcuts } from "@/components/app/prostor/precice/precice-provider";
import { ConversationPane } from "@/components/app/prostor/poruke/conversation-pane";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import { ProjekatStavkeProvider, useProjekatQuery } from "@/components/app/projekat-provider";
import type { ProfileWithAvatar, ProjektnaRuta } from "@/lib/prostor/rute";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ChatChannel, ChatMember } from "@/lib/prostor/web/chat";
import { Skeleton } from "@/components/ui/skeleton";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { CHAT_LIST_HELP, CHAT_SHORTCUTS } from "@/lib/prostor/precice/registar";
import type { Today } from "@/lib/prostor/web/danas";

import { useQueryState } from "@/components/app/prostor/podaci/ja";
import { ChatHubView, HUB_SPLIT_QUERY, hubFocusFallback } from "@/components/app/prostor/poruke/chat-hub-view";
import type { HubListState } from "@/components/app/prostor/poruke/hub-list";
import {
  GroupSettingsDialog,
  NewDmDialog,
  NewGroupDialog,
  type GroupSettingsState,
  type HubPersonModel,
  type PeopleState,
} from "@/components/app/prostor/poruke/people-dialogs";
import { useProjekatQueryState } from "@/components/app/prostor/podaci/projekat";

export type ChatHubContainerProps = {
  today: Today;
  profile: ProfileWithAvatar;
  /** Otvoren razgovor iz adrese (`/poruke?kanal=…`). */
  channelId: Id<"chatChannels"> | null;
  onSelectChannel: (channelId: Id<"chatChannels">) => void;
  /** Uzak ekran: razgovor → lista (briše `kanal` iz adrese). */
  onBackToList: () => void;
  /** Prelaz u projekat kanala: stranica iz poruke ili isti razgovor u projektu. */
  onOpenInStartup: (
    workspaceId: Id<"workspaces">,
    target: { pageId: Id<"pages"> } | { route: ProjektnaRuta },
  ) => void;
};

type HubData = HubInput<ChatChannel> & { capped: boolean };

const COLLAPSED_KEY = "devotion:me-chat:collapsed";
const STARTUP_MEMBERS_LIMIT = 50;

function readCollapsed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

function isWide(): boolean {
  return window.matchMedia(HUB_SPLIT_QUERY).matches;
}

/**
 * „Pokušaj ponovo" za upit u otvorenom dijalogu: jedan render bez pretplate
 * (`"skip"`), pa nova pretplata — bez ponovnog montiranja (dijalog ostaje
 * otvoren, za razliku od „Pokušaj ponovo" cele liste).
 */
function useResubscribe(): [paused: boolean, retry: () => void] {
  const [paused, setPaused] = useState(false);
  return [
    paused,
    () => {
      setPaused(true);
      window.setTimeout(() => setPaused(false), 0);
    },
  ];
}

/**
 * Poruke (K15): hub `chat.listConversations` (lično + svi kanali svih mojih
 * projekata), razgovor bilo kog opsega kroz postojeći `ConversationPane`,
 * „Nova poruka" (`chat.listPeople` → `chat.openPersonalDm`), „Nova grupa"
 * (`chat.createPersonalGroup`) i podešavanja grupe (`updatePersonalGroup`,
 * `leavePersonalGroup`). Kanal projekta se otvara u mestu, opseg ostaje „Ja"
 * (E19). „Pokušaj ponovo" liste obnavlja samo pretplatu huba — otvoren
 * razgovor, nacrt u kompozitoru i dijalozi ostaju. Spisak ljudi za novu
 * poruku i grupu je po P9 (`chat.listPeople`: samo owner/urednik sa kojima
 * delim bar jedan projekat; server proverava i pri otvaranju razgovora).
 */
export function ChatHubContainer({
  today,
  profile,
  channelId,
  onSelectChannel,
  onBackToList,
  onOpenInStartup,
}: ChatHubContainerProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsedState] = useState<Set<string>>(readCollapsed);
  const setCollapsed = (next: Set<string>) => {
    setCollapsedState(next);
    try {
      window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
    } catch {
      // Pamćenje je usluga, ne uslov.
    }
  };
  const [hubPaused, retry] = useResubscribe();
  const hub = useQueryState(api.prostor.chat.listConversations, hubPaused ? "skip" : {});
  const [dmOpen, setDmOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [settings, setSettings] = useState<{ channelId: Id<"chatChannels">; open: boolean } | null>(null);
  const [pendingPersonId, setPendingPersonId] = useState<string | null>(null);

  // Ljudi se učitavaju pri prvom otvaranju dijaloga i ostaju pretplaćeni: dijalog
  // u izlaznoj animaciji ne sme da pređe u skeleton, a sledeće otvaranje je odmah spremno.
  const [peopleWanted, setPeopleWanted] = useState(false);
  if (!peopleWanted && (dmOpen || groupOpen || settings?.open)) setPeopleWanted(true);
  const [peoplePaused, retryPeople] = useResubscribe();
  const peopleQuery = useQueryState(api.prostor.chat.listPeople, peopleWanted && !peoplePaused ? {} : "skip");
  const openDm = useMutation(api.prostor.chat.openPersonalDm);
  const createGroup = useMutation(api.prostor.chat.createPersonalGroup);
  const updateGroup = useMutation(api.prostor.chat.updatePersonalGroup);
  const leaveGroup = useMutation(api.prostor.chat.leavePersonalGroup);

  const data: HubData | null = hub.status === "ready" ? hub.data : null;
  const groups = useMemo(
    () => (data ? hubGroups(data, { query, collapsed }) : []),
    [data, query, collapsed],
  );
  const listState: HubListState =
    hub.status === "loading"
      ? { status: "loading" }
      : hub.status === "error"
        ? { status: "error", retry }
        : { status: "ready", input: hub.data, capped: hub.data.capped };

  const people: PeopleState =
    peopleQuery.status === "ready"
      ? { status: "ready", people: peopleQuery.data }
      : peopleQuery.status === "error"
        ? { status: "error", retry: retryPeople }
        : { status: "loading" };

  // `/` pretraga, `n` nova poruka, `Esc` (uzak ekran) razgovor → lista.
  useShortcuts([...Object.values(CHAT_SHORTCUTS), ...CHAT_LIST_HELP], (id) => {
    if (id === CHAT_SHORTCUTS.newMessage.id) {
      setDmOpen(true);
      return;
    }
    if (id === CHAT_SHORTCUTS.search.id) {
      // Na uskom ekranu sa otvorenim razgovorom pretraga se ne vidi.
      if (channelId !== null && !isWide()) return false;
      searchRef.current?.focus();
      searchRef.current?.select();
      return;
    }
    if (id === CHAT_SHORTCUTS.back.id) {
      if (channelId === null || isWide()) return false;
      onBackToList();
    }
  });

  const hubChannel = data && channelId ? findHubChannel(data, channelId) : null;
  const startupName = (workspaceId: string) =>
    data?.workspaces.find((group) => group.workspace._id === workspaceId)?.workspace.name;

  async function pickPerson(personId: string) {
    if (pendingPersonId !== null) return;
    setPendingPersonId(personId);
    try {
      const opened = await openDm({ otherProfileId: personId as Id<"profiles"> });
      setDmOpen(false);
      if (opened !== channelId) onSelectChannel(opened);
    } catch (error) {
      toast.error(accessErrorMessage(error, "Razgovor nije otvoren."));
    } finally {
      setPendingPersonId(null);
    }
  }

  async function createPersonalGroup(name: string, memberIds: string[]): Promise<string | null> {
    try {
      const created = await createGroup({ name, memberProfileIds: memberIds as Id<"profiles">[] });
      setGroupOpen(false);
      onSelectChannel(created);
      toast.success(`Grupa „${name}“ je napravljena.`);
      return null;
    } catch (error) {
      return accessErrorMessage(error, "Grupa nije napravljena.");
    }
  }

  return (
    <>
      <ChatHubView
        now={today.now}
        meId={profile._id}
        state={listState}
        groups={groups}
        query={query}
        onQueryChange={setQuery}
        onToggleGroup={(key) => {
          const next = new Set(collapsed);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          setCollapsed(next);
        }}
        activeChannelId={channelId}
        onSelect={(id) => {
          if (id !== channelId) onSelectChannel(id as Id<"chatChannels">);
        }}
        onNewMessage={() => setDmOpen(true)}
        onNewGroup={() => setGroupOpen(true)}
        searchRef={searchRef}
        conversation={
          channelId === null ? null : (
            <ConversationBoundary key={channelId} onBack={onBackToList}>
              <HubConversation
                channelId={channelId}
                hubChannel={hubChannel}
                profile={profile}
                startupName={startupName}
                onBack={onBackToList}
                onOpenInStartup={onOpenInStartup}
                onOpenGroupSettings={() => setSettings({ channelId, open: true })}
              />
            </ConversationBoundary>
          )
        }
      />

      <NewDmDialog
        open={dmOpen}
        onOpenChange={setDmOpen}
        people={people}
        onPick={(personId) => void pickPerson(personId)}
        pendingId={pendingPersonId}
        returnFocusFallback={hubFocusFallback}
      />
      <NewGroupDialog
        open={groupOpen}
        onOpenChange={setGroupOpen}
        people={people}
        onCreate={createPersonalGroup}
        returnFocusFallback={hubFocusFallback}
      />
      {settings ? (
        <GroupSettingsContainer
          key={settings.channelId}
          channelId={settings.channelId}
          open={settings.open}
          onOpenChange={(open) => setSettings({ channelId: settings.channelId, open })}
          meId={profile._id}
          people={people}
          onSave={async (name, memberIds) => {
            try {
              const result = await updateGroup({
                channelId: settings.channelId,
                name,
                memberProfileIds: memberIds as Id<"profiles">[],
              });
              toast.success("Grupa je sačuvana.", {
                duration: 8000,
                action: {
                  label: "Poništi",
                  onClick: () => {
                    void updateGroup({
                      channelId: settings.channelId,
                      name: result.previousName,
                      memberProfileIds: result.previousProfileIds,
                    }).catch((error: unknown) =>
                      toast.error(accessErrorMessage(error, "Izmena grupe nije sačuvana.")),
                    );
                  },
                },
              });
              return null;
            } catch (error) {
              return accessErrorMessage(error, "Izmena grupe nije sačuvana.");
            }
          }}
          onLeave={async () => {
            try {
              const left = settings.channelId;
              await leaveGroup({ channelId: left });
              toast.success("Grupa je napuštena.");
              if (channelId === left) onBackToList();
              // Posle izlazne animacije: bez pretplata na grupu kojoj više nemam pristup.
              window.setTimeout(() => setSettings((current) => (current?.channelId === left ? null : current)), 400);
              return null;
            } catch (error) {
              return accessErrorMessage(error, "Grupa nije napuštena.");
            }
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Otvoren razgovor: kanal iz huba (bez nove pretplate) ili, kad ga hub nema
 * (granica, tek napravljen, link iz obaveštenja), `chat.getChannel`. Članovi
 * po opsegu: `chat.channelMembers` za lični razgovor, a za kanal projekta
 * `prostor.projekat.listMembers` ispod `ProjekatStavkeProvider`-a tog projekta
 * (plan S07 D14), jer je to projektni upit, a „Ja“ nema projekat.
 */
function HubConversation({
  channelId,
  hubChannel,
  profile,
  startupName,
  onBack,
  onOpenInStartup,
  onOpenGroupSettings,
}: {
  channelId: Id<"chatChannels">;
  hubChannel: ChatChannel | null;
  profile: ProfileWithAvatar;
  startupName: (workspaceId: string) => string | undefined;
  onBack: () => void;
  onOpenInStartup: ChatHubContainerProps["onOpenInStartup"];
  onOpenGroupSettings: () => void;
}) {
  // Bez čekanja huba: razgovor iz linka se prikazuje čim `getChannel` stigne.
  const [fetchPaused, retryFetch] = useResubscribe();
  const fetched = useQueryState(api.prostor.chat.getChannel, hubChannel === null && !fetchPaused ? { channelId } : "skip");
  const channel: ChatChannel | null = hubChannel ?? (fetched.status === "ready" ? fetched.data : null);

  if (channel === null) {
    if (fetched.status === "loading") {
      return (
        <div role="status" aria-busy="true" className="flex h-full flex-col gap-4 p-6">
          <span className="sr-only">Učitavanje razgovora</span>
          <Skeleton className="h-6 w-48" />
          <div className="mt-auto space-y-3">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="ml-auto h-10 w-1/2" />
            <Skeleton className="h-10 w-3/5" />
          </div>
        </div>
      );
    }
    if (fetched.status === "error") {
      return (
        <div className="flex h-full items-center justify-center p-6">
          <EmptyState
            icon={TriangleAlert}
            title="Razgovor se ne može učitati"
            description="Proveri vezu i pokušaj ponovo."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onBack}>
                  Nazad na razgovore
                </Button>
                <Button variant="outline" type="button" size="sm" onClick={retryFetch}>
                  <RefreshCw aria-hidden="true" />
                  Pokušaj ponovo
                </Button>
              </div>
            }
            className="max-w-md"
          />
        </div>
      );
    }
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={MessagesSquare}
          title="Razgovor nije pronađen"
          description="Možda je arhiviran ili više nisi član."
          action={
            <Button type="button" variant="outline" size="sm" onClick={onBack}>
              Nazad na razgovore
            </Button>
          }
          className="max-w-md"
        />
      </div>
    );
  }

  const workspaceId = channel.workspaceId;
  if (workspaceId === null) {
    return (
      <LicniRazgovor
        channel={channel}
        profile={profile}
        onBack={onBack}
        onOpenGroupSettings={channel.kind === "custom" ? onOpenGroupSettings : undefined}
      />
    );
  }
  return (
    <ProjekatStavkeProvider workspaceId={workspaceId}>
      <RazgovorProjekta
        channel={channel}
        profile={profile}
        contextLabel={startupName(workspaceId)}
        onBack={onBack}
        onOpenPage={(pageId) => onOpenInStartup(workspaceId, { pageId })}
        onOpenInStartup={() => onOpenInStartup(workspaceId, { route: { kind: "chat", channelId: channel._id } })}
      />
    </ProjekatStavkeProvider>
  );
}

/** Lični DM ili lična grupa: članovi razgovora (`chat.channelMembers`). */
function LicniRazgovor({
  channel,
  profile,
  onBack,
  onOpenGroupSettings,
}: {
  channel: ChatChannel;
  profile: ProfileWithAvatar;
  onBack: () => void;
  onOpenGroupSettings?: () => void;
}) {
  const channelMembers = useQueryState(api.prostor.chat.channelMembers, { channelId: channel._id });
  const members: ChatMember[] | undefined = channelMembers.status === "ready" ? channelMembers.data : undefined;
  return (
    <ConversationPane
      key={channel._id}
      workspace={null}
      profile={profile}
      channel={channel}
      members={members}
      onOpenList={onBack}
      onOpenPage={() => {}}
      splitAt="xl"
      onOpenGroupSettings={onOpenGroupSettings}
      animateArrivals
    />
  );
}

/**
 * Kanal projekta otvoren u „Ja“ (opseg ostaje „Ja“, E19): tim projekta za
 * pominjanja i oblasti za ikonicu kanala. Oba su projektni upiti, pa ih
 * `ProjekatStavkeProvider` iznad snabdeva `workspaceId`-jem kanala.
 */
function RazgovorProjekta({
  channel,
  profile,
  contextLabel,
  onBack,
  onOpenPage,
  onOpenInStartup,
}: {
  channel: ChatChannel;
  profile: ProfileWithAvatar;
  contextLabel: string | undefined;
  onBack: () => void;
  onOpenPage: (pageId: Id<"pages">) => void;
  onOpenInStartup: () => void;
}) {
  const workspace = useProjekatQuery(api.prostor.projekat.get) ?? null;
  const startupMembers = useProjekatQueryState(api.prostor.projekat.listMembers, {
    limit: STARTUP_MEMBERS_LIMIT,
  });
  const members: ChatMember[] | undefined = startupMembers.status === "ready" ? startupMembers.data : undefined;
  return (
    <ConversationPane
      key={channel._id}
      workspace={workspace}
      profile={profile}
      channel={channel}
      members={members}
      onOpenList={onBack}
      onOpenPage={onOpenPage}
      splitAt="xl"
      contextLabel={contextLabel}
      onOpenInStartup={onOpenInStartup}
      animateArrivals
    />
  );
}

/** Podešavanja lične grupe: ime i uloga (`getChannel`), članovi, ljudi. */
function GroupSettingsContainer({
  channelId,
  open,
  onOpenChange,
  meId,
  people,
  onSave,
  onLeave,
}: {
  channelId: Id<"chatChannels">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meId: string;
  people: PeopleState;
  onSave: (name: string, memberIds: string[]) => Promise<string | null>;
  onLeave: () => Promise<string | null>;
}) {
  const [paused, resubscribe] = useResubscribe();
  const channel = useQueryState(api.prostor.chat.getChannel, paused ? "skip" : { channelId });
  const members = useQueryState(api.prostor.chat.channelMembers, paused ? "skip" : { channelId });

  let state: GroupSettingsState;
  if (people.status === "error") {
    state = people;
  } else if (channel.status === "error" || members.status === "error") {
    state = { status: "error", retry: resubscribe };
  } else if (channel.status === "loading" || members.status === "loading" || people.status === "loading") {
    state = { status: "loading" };
  } else {
    const shared = new Map(people.people.map((person) => [person._id, person.sharedStartupNames]));
    const current: HubPersonModel[] = members.data
      .filter((member) => member.profile._id !== meId)
      .map((member) => ({
        _id: member.profile._id,
        displayName: member.profile.displayName,
        avatarUrl: member.profile.avatarUrl,
        sharedStartupNames: shared.get(member.profile._id) ?? [],
      }));
    state = {
      status: "ready",
      name: channel.data.name,
      isOwner: channel.data.myRole === "owner",
      members: current,
      people: people.people,
    };
  }

  return (
    <GroupSettingsDialog
      open={open}
      onOpenChange={onOpenChange}
      state={state}
      onSave={onSave}
      onLeave={onLeave}
      returnFocusFallback={hubFocusFallback}
    />
  );
}

/**
 * Greška u otvorenom razgovoru (npr. `chat.messages` baca iz
 * `usePaginatedQuery`) ostaje u desnom oknu: lista razgovora živi dalje, a
 * „Nazad na razgovore" briše `channelId` iz URL-a. Ključ je id razgovora.
 */
class ConversationBoundary extends Component<
  { children: ReactNode; onBack: () => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    return (
      <div role="alert" className="flex h-full items-center justify-center p-6">
        <div className="max-w-md text-center">
          <span className="mx-auto grid size-10 place-items-center rounded-lg bg-danger-soft text-danger">
            <TriangleAlert className="size-5" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-copy font-semibold text-foreground">Razgovor se ne može učitati</h2>
          <p className="mt-1 text-ui text-text-secondary">
            {accessErrorMessage(error, "Proveri vezu i pokušaj ponovo.")}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={this.props.onBack}>
              Nazad na razgovore
            </Button>
            <Button variant="outline" type="button" size="sm" onClick={() => this.setState({ error: null })}>
              <RefreshCw aria-hidden="true" />
              Pokušaj ponovo
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
