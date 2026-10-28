"use client";

import { useState } from "react";
import { ProjekatLink } from "@/components/app/projekat-link";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import {
  ExternalLink,
  Loader2,
  Menu,
  MessageCircleQuestion,
  Plus,
  RefreshCw,
  Send,
  Smartphone,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  ObjavljujesKao,
  usePotvrdaProjekta,
} from "@/components/app/objavljujes-kao";
import {
  useMoze,
  useProjekatAction,
  useProjekatMutation,
  useProjekatQuery,
} from "@/components/app/projekat-provider";
import { SamoZa } from "@/components/app/samo-za";
import {
  ICE_BREAKERS_MAX,
  ICE_BREAKER_QUESTION_MAX,
  MENU_ITEMS_MAX,
  MENU_TITLE_MAX,
} from "@/convex/lib/orProfile";
import { formatRelativeTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "./automation-editor-dialog";
import { cn } from "@/lib/utils";
import { FeedbackNote } from "@/components/app/feedback";

type ProfileMenuView = FunctionReturnType<
  typeof api.orProfileMenu.getProfileMenu
>;
type AutomationView = FunctionReturnType<
  typeof api.orAutomationsApi.listAutomations
>[number];

/** A row being edited. `payload` is the identity of an entry already live on
 * the profile — it rides back to the mutation untouched so a tap arriving from
 * a thread somebody has open right now still resolves. `uid` is local only. */
type IceBreakerRow = {
  uid: number;
  question: string;
  automationId: string;
  payload: string | null;
};

type MenuRow = {
  uid: number;
  title: string;
  type: "url" | "postback";
  url: string;
  automationId: string;
  payload: string | null;
};

let rowUid = 0;
const nextUid = () => ++rowUid;

/** Pull the friendly message out of a thrown ConvexError, else a fallback. */
function convexMessage(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as { message?: string } | undefined;
    if (data && typeof data.message === "string") return data.message;
  }
  return fallback;
}

export function ProfileMenuPanel() {
  const config = useProjekatQuery(api.orProfileMenu.getProfileMenu);
  const automations = useProjekatQuery(api.orAutomationsApi.listAutomations);
  const engine = useProjekatQuery(api.orEngine.status);

  if (config === undefined || automations === undefined) {
    return <ProfileMenuPanelSkeleton />;
  }

  return (
    // Mounted once, on the first result: the rows are edited locally from
    // there on. Keying this on `updatedAt` would remount it the moment a save
    // commits — mid-publish, since publishing saves first — and drop the
    // in-flight state with it. The status strip stays live either way, because
    // it reads `config` on every render.
    <ProfileMenuForm
      config={config}
      automations={automations}
      igConnected={engine?.igConnected ?? false}
    />
  );
}

function ProfileMenuForm({
  config,
  automations,
  igConnected,
}: {
  config: ProfileMenuView;
  automations: AutomationView[];
  igConnected: boolean;
}) {
  const potvrda = usePotvrdaProjekta();
  const [iceBreakers, setIceBreakers] = useState<IceBreakerRow[]>(() =>
    config.iceBreakers.map((iceBreaker) => ({
      uid: nextUid(),
      question: iceBreaker.question,
      automationId: iceBreaker.automationId,
      payload: iceBreaker.payload,
    })),
  );
  const [menuItems, setMenuItems] = useState<MenuRow[]>(() =>
    config.menuItems.map((item) => ({
      uid: nextUid(),
      title: item.title,
      type: item.type,
      url: item.url ?? "",
      automationId: item.automationId ?? "",
      payload: item.payload,
    })),
  );

  const [pending, setPending] = useState<
    "save" | "publish" | "remove" | "check" | null
  >(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [live, setLive] = useState<{
    iceBreakerQuestions: string[];
    menuTitles: string[];
  } | null>(null);

  const saveProfileMenu = useProjekatMutation(api.orProfileMenu.saveProfileMenu);
  const publish = useProjekatAction(api.orProfileMenu.publish);
  const unpublish = useProjekatAction(api.orProfileMenu.unpublish);
  const fetchLiveProfile = useProjekatAction(api.orProfileMenu.fetchLiveProfile);

  // Posmatrač vidi postavljene ledolomce i meni, ali polja su mu zaključana.
  const mozeUrediti = useMoze("urednik");
  const busy = pending !== null || !mozeUrediti;
  const hasAutomations = automations.length > 0;

  /** Everything the mutation takes, or a Serbian reason it cannot be built. */
  const collect = ():
    | {
        iceBreakers: {
          question: string;
          automationId: Id<"orAutomations">;
          payload?: string;
        }[];
        menuItems: {
          title: string;
          type: "url" | "postback";
          url?: string;
          automationId?: Id<"orAutomations">;
          payload?: string;
        }[];
      }
    | { error: string } => {
    const namedIceBreakers = iceBreakers.filter(
      (iceBreaker) => iceBreaker.question.trim().length > 0,
    );
    if (namedIceBreakers.some((iceBreaker) => iceBreaker.automationId === "")) {
      return { error: "Izaberi automatizaciju koju pokreće svako pitanje." };
    }

    const namedMenuItems = menuItems.filter(
      (item) => item.title.trim().length > 0,
    );
    if (
      namedMenuItems.some(
        (item) => item.type === "postback" && item.automationId === "",
      )
    ) {
      return {
        error: "Izaberi automatizaciju za svaku stavku menija koja je ne otvara link.",
      };
    }

    return {
      iceBreakers: namedIceBreakers.map((iceBreaker) => ({
        question: iceBreaker.question,
        automationId: iceBreaker.automationId as Id<"orAutomations">,
        payload: iceBreaker.payload ?? undefined,
      })),
      menuItems: namedMenuItems.map((item) => ({
        title: item.title,
        type: item.type,
        url: item.type === "url" ? item.url.trim() || undefined : undefined,
        automationId:
          item.type === "postback"
            ? (item.automationId as Id<"orAutomations">)
            : undefined,
        payload: item.payload ?? undefined,
      })),
    };
  };

  const run = async (
    kind: "save" | "publish" | "remove" | "check",
    task: () => Promise<void>,
    fallback: string,
  ) => {
    setPending(kind);
    setErrorMsg(null);
    try {
      await task();
    } catch (err) {
      setErrorMsg(convexMessage(err, fallback));
    } finally {
      setPending(null);
    }
  };

  const handleSave = async () => {
    const collected = collect();
    if ("error" in collected) {
      setErrorMsg(collected.error);
      return;
    }
    await run(
      "save",
      async () => {
        await saveProfileMenu(collected);
      },
      "Čuvanje nije uspelo. Pokušaj ponovo.",
    );
  };

  /** Publishing always saves first, so what lands on Instagram is what is on
   * the screen — never a version from an earlier save. */
  const handlePublish = async () => {
    const collected = collect();
    if ("error" in collected) {
      setErrorMsg(collected.error);
      return;
    }
    await run(
      "publish",
      async () => {
        await saveProfileMenu(collected);
        await publish();
        setLive(null);
      },
      "Objavljivanje nije uspelo. Pokušaj ponovo.",
    );
  };

  const handleRemove = async () => {
    await run(
      "remove",
      async () => {
        await unpublish();
        setLive(null);
      },
      "Uklanjanje nije uspelo. Pokušaj ponovo.",
    );
  };

  const handleCheck = async () => {
    await run(
      "check",
      async () => {
        setLive(await fetchLiveProfile());
      },
      "Provera nije uspela. Pokušaj ponovo.",
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="space-y-4">
        <PublishState
          config={config}
          igConnected={igConnected}
          hasAutomations={hasAutomations}
        />

        {errorMsg && (
          <FeedbackNote tone="danger" title={errorMsg} />
        )}

        {/* Ledolomci */}
        <section className="space-y-3 rounded-xl border border-line bg-surface/50 p-3.5">
          <SectionHead
            icon={MessageCircleQuestion}
            title="Ledolomci"
            count={`${iceBreakers.length}/${ICE_BREAKERS_MAX}`}
          />
          <p className="text-xs text-text-muted">
            Pitanja koja stoje u praznom razgovoru, pre nego što neko išta
            napiše. Klik na pitanje otvara prozor od 24 sata i pokreće poruku
            automatizacije koju izabereš.
          </p>

          <div className="space-y-2.5">
            {iceBreakers.map((iceBreaker, index) => (
              <EntryRow
                key={iceBreaker.uid}
                disabled={busy}
                onRemove={() =>
                  setIceBreakers((prev) => prev.filter((_, i) => i !== index))
                }
                removeLabel={`Ukloni pitanje ${iceBreaker.question || index + 1}`}
              >
                <Input
                  placeholder="Koliko košta izrada sajta?"
                  value={iceBreaker.question}
                  onChange={(e) =>
                    setIceBreakers((prev) =>
                      prev.map((row, i) =>
                        i === index ? { ...row, question: e.target.value } : row,
                      ),
                    )
                  }
                  disabled={busy}
                  maxLength={ICE_BREAKER_QUESTION_MAX}
                  className="h-8 border-line bg-surface-raised text-xs"
                />
                <AutomationSelect
                  label={`Automatizacija za „${iceBreaker.question || `pitanje ${index + 1}`}“`}
                  value={iceBreaker.automationId}
                  onChange={(automationId) =>
                    setIceBreakers((prev) =>
                      prev.map((row, i) =>
                        i === index ? { ...row, automationId } : row,
                      ),
                    )
                  }
                  automations={automations}
                  disabled={busy}
                />
              </EntryRow>
            ))}

            <AddRowButton
              disabled={
                busy || !hasAutomations || iceBreakers.length >= ICE_BREAKERS_MAX
              }
              onClick={() =>
                setIceBreakers((prev) => [
                  ...prev,
                  {
                    uid: nextUid(),
                    question: "",
                    automationId: automations[0]?._id ?? "",
                    payload: null,
                  },
                ])
              }
            >
              Dodaj pitanje
            </AddRowButton>
          </div>
        </section>

        {/* Meni */}
        <section className="space-y-3 rounded-xl border border-line bg-surface/50 p-3.5">
          <SectionHead
            icon={Menu}
            title="Meni u razgovoru"
            count={`${menuItems.length}/${MENU_ITEMS_MAX}`}
          />
          <p className="text-xs text-text-muted">
            Stavke koje stoje ispod ikonice menija tokom celog razgovora. Stavka
            može da otvori stranicu ili da pokrene automatizaciju.
          </p>

          <div className="space-y-2.5">
            {menuItems.map((item, index) => (
              <EntryRow
                key={item.uid}
                disabled={busy}
                onRemove={() =>
                  setMenuItems((prev) => prev.filter((_, i) => i !== index))
                }
                removeLabel={`Ukloni stavku ${item.title || index + 1}`}
              >
                <Input
                  placeholder="Zakaži razgovor"
                  value={item.title}
                  onChange={(e) =>
                    setMenuItems((prev) =>
                      prev.map((row, i) =>
                        i === index ? { ...row, title: e.target.value } : row,
                      ),
                    )
                  }
                  disabled={busy}
                  maxLength={MENU_TITLE_MAX}
                  className="h-8 border-line bg-surface-raised text-xs"
                />
                <SegmentedControl
                  value={item.type}
                  onChange={(value) =>
                    setMenuItems((prev) =>
                      prev.map((row, i) =>
                        i === index
                          ? { ...row, type: value as "url" | "postback" }
                          : row,
                      ),
                    )
                  }
                  disabled={busy}
                  options={[
                    { value: "url", label: "Otvara link" },
                    { value: "postback", label: "Pokreće poruku" },
                  ]}
                />
                {item.type === "url" ? (
                  <Input
                    placeholder="https://enigmait.rs/kontakt"
                    value={item.url}
                    onChange={(e) =>
                      setMenuItems((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, url: e.target.value } : row,
                        ),
                      )
                    }
                    disabled={busy}
                    inputMode="url"
                    className="h-8 border-line bg-surface-raised text-xs"
                  />
                ) : (
                  <AutomationSelect
                    label={`Automatizacija za „${item.title || `stavka ${index + 1}`}“`}
                    value={item.automationId}
                    onChange={(automationId) =>
                      setMenuItems((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, automationId } : row,
                        ),
                      )
                    }
                    automations={automations}
                    disabled={busy}
                  />
                )}
              </EntryRow>
            ))}

            <AddRowButton
              disabled={busy || menuItems.length >= MENU_ITEMS_MAX}
              onClick={() =>
                setMenuItems((prev) => [
                  ...prev,
                  {
                    uid: nextUid(),
                    title: "",
                    type: "url",
                    url: "",
                    automationId: automations[0]?._id ?? "",
                    payload: null,
                  },
                ])
              }
            >
              Dodaj stavku
            </AddRowButton>
          </div>
        </section>

        {/* Akcije */}
        <SamoZa uloga="urednik">
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
            <ObjavljujesKao
              kanal="instagram"
              radnja="Objavljuješ"
              className="w-full"
            />
            <Button
              variant="secondary"
              type="button"
              size="sm"
              onClick={handlePublish}
              disabled={busy || !igConnected}
              className="font-semibold"
            >
              {pending === "publish" ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Objavljujem…</span>
                </>
              ) : (
                <span>{potvrda("Objavi na Instagramu")}</span>
              )}
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleSave}
              disabled={busy}
            >
              {pending === "save" ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Čuvam…</span>
                </>
              ) : (
                <span>Sačuvaj bez objave</span>
              )}
            </Button>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleCheck}
              disabled={busy || !igConnected}
              className="text-text-muted hover:text-foreground"
            >
              {pending === "check" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              <span>Proveri šta je objavljeno</span>
            </Button>

            {config.publishedAt !== null && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleRemove}
                disabled={busy}
                className="text-text-muted hover:text-danger"
              >
                {pending === "remove" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : null}
                <span>Ukloni sa Instagrama</span>
              </Button>
            )}
          </div>
        </SamoZa>

        {live !== null && <LiveProfile live={live} />}
      </div>

      <ThreadPreview
        iceBreakers={iceBreakers}
        menuItems={menuItems}
        className="h-fit lg:sticky lg:top-6"
      />
    </div>
  );
}

/**
 * One line that answers "does Instagram show this right now?". Saving writes
 * our row and clears `publishedAt`, so anything other than a timestamp means
 * the profile is behind what is on the screen.
 */
function PublishState({
  config,
  igConnected,
  hasAutomations,
}: {
  config: ProfileMenuView;
  igConnected: boolean;
  hasAutomations: boolean;
}) {
  const mozeUrediti = useMoze("urednik");

  if (!igConnected) {
    return (
      <StatusStrip tone="danger">
        Instagram nalog nije povezan, pa ledolomci i meni ne mogu da se objave.{" "}
        <ProjekatLink
          href="/settings"
          className="text-mod underline-offset-4 hover:underline"
        >
          Poveži nalog u podešavanjima
        </ProjekatLink>
        .
      </StatusStrip>
    );
  }

  if (!hasAutomations) {
    return (
      <StatusStrip tone="warning">
        {mozeUrediti
          ? "Napravi bar jednu automatizaciju — pitanje i stavka menija pokreću njenu poruku."
          : "Nema nijedne automatizacije — pitanje i stavka menija pokreću njenu poruku."}
      </StatusStrip>
    );
  }

  if (config.publishError !== null) {
    return (
      <StatusStrip tone="danger">
        Instagram je odbio poslednju objavu: {config.publishError}
      </StatusStrip>
    );
  }

  if (config.publishedAt === null) {
    return (
      <StatusStrip tone="warning">
        Izmene su sačuvane kod nas, ali nisu na Instagramu.
        {mozeUrediti ? " Klikni „Objavi na Instagramu”." : ""}
      </StatusStrip>
    );
  }

  return (
    <StatusStrip tone="success">
      Objavljeno na Instagramu{" "}
      <span className="text-foreground">
        {formatRelativeTime(config.publishedAt)}
      </span>
      . Ledolomci i meni se vide samo u aplikaciji na telefonu, ne i na
      Instagramu za računar.
    </StatusStrip>
  );
}

function StatusStrip({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm",
        tone === "success"
          ? "border-line-soft bg-card text-muted-foreground"
          : tone === "warning"
            ? "border-warning/30 bg-warning/5 text-foreground"
            : "border-danger/30 bg-danger/5 text-foreground",
      )}
    >
      <span
        className={cn(
          "mt-1.5 size-1.5 shrink-0 rounded-full",
          tone === "success"
            ? "bg-success"
            : tone === "warning"
              ? "bg-warning"
              : "bg-danger",
        )}
        aria-hidden
      />
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}

function SectionHead({
  icon: Icon,
  title,
  count,
}: {
  icon: typeof Menu;
  title: string;
  count: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Icon className="size-3.5 text-mod" aria-hidden />
        <span>{title}</span>
      </span>
      <span className="text-xs tabular-nums text-text-muted">
        {count}
      </span>
    </div>
  );
}

/** One editable question or menu item, plus a way to take it back out. */
function EntryRow({
  onRemove,
  removeLabel,
  children,
  disabled,
}: {
  onRemove: () => void;
  removeLabel: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-line-soft bg-surface p-2.5">
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
      <SamoZa uloga="urednik">
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={removeLabel}
          className="shrink-0 rounded-md p-1.5 text-text-muted transition-colors hover:text-danger disabled:opacity-50"
        >
          <X className="size-3.5" />
        </button>
      </SamoZa>
    </div>
  );
}

function AutomationSelect({
  label,
  value,
  onChange,
  automations,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  automations: AutomationView[];
  disabled?: boolean;
}) {
  // An automation deleted after it was picked leaves an id with no name; keep
  // it selectable so the row does not silently repoint itself somewhere else.
  const missing =
    value.length > 0 && !automations.some((a) => a._id === value);

  return (
    <Select
      label={label}
      value={value || null}
      onValueChange={onChange}
      disabled={disabled}
      placeholder="Izaberi automatizaciju…"
      options={[
        ...(missing
          ? [{ value, label: "Obrisana automatizacija" }]
          : []),
        ...automations.map((automation) => ({
          value: automation._id as string,
          label: `${automation.name}${automation.isActive ? "" : " (pauzirana)"}`,
        })),
      ]}
    />
  );
}

function AddRowButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <SamoZa uloga="urednik">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={disabled}
        className="w-full border-dashed border-line text-text-muted hover:text-foreground"
      >
        <Plus className="size-3.5" />
        <span>{children}</span>
      </Button>
    </SamoZa>
  );
}

/** What the GET readback found on the account, labels only. */
function LiveProfile({
  live,
}: {
  live: { iceBreakerQuestions: string[]; menuTitles: string[] };
}) {
  const empty =
    live.iceBreakerQuestions.length === 0 && live.menuTitles.length === 0;

  return (
    <div className="space-y-2 rounded-xl border border-line-soft bg-card p-3.5 text-xs">
      <p className="font-semibold text-foreground">
        Instagram trenutno prikazuje
      </p>
      {empty ? (
        <p className="text-text-muted">
          Ni jedno pitanje ni jednu stavku menija.
        </p>
      ) : (
        <div className="space-y-1.5 text-muted-foreground">
          {live.iceBreakerQuestions.length > 0 && (
            <p>
              <span className="text-text-muted">Pitanja: </span>
              {live.iceBreakerQuestions.join(" · ")}
            </p>
          )}
          {live.menuTitles.length > 0 && (
            <p>
              <span className="text-text-muted">Meni: </span>
              {live.menuTitles.join(" · ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The empty thread as it looks on a phone: the questions sitting above the
 * composer, the menu under its icon.
 *
 * This is the only place the operator can see them at all — neither renders on
 * Instagram for desktop, which is where they are configuring this from.
 */
function ThreadPreview({
  iceBreakers,
  menuItems,
  className,
}: {
  iceBreakers: IceBreakerRow[];
  menuItems: MenuRow[];
  className?: string;
}) {
  const questions = iceBreakers.filter(
    (iceBreaker) => iceBreaker.question.trim().length > 0,
  );
  const items = menuItems.filter((item) => item.title.trim().length > 0);

  return (
    <Card className={cn("border border-line bg-card p-3.5 ring-0", className)}>
      <div className="flex items-center gap-1.5 text-xs text-text-muted">
        <Smartphone className="size-3" aria-hidden />
        <span>Prazan razgovor na telefonu</span>
      </div>

      <div className="mt-3 flex min-h-64 flex-col rounded-xl border border-line-soft bg-surface p-2.5">
        <div className="flex-1" />

        {questions.length > 0 ? (
          <div className="flex flex-col items-end gap-1.5">
            {questions.map((iceBreaker) => (
              <span
                key={iceBreaker.uid}
                className="max-w-full truncate rounded-full border border-mod-line px-2.5 py-1 text-xs font-medium text-mod"
              >
                {iceBreaker.question}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-center text-xs text-muted-foreground">
            Bez pitanja, prazan razgovor ostaje prazan.
          </p>
        )}

        <div className="mt-2.5 flex items-center gap-2 rounded-full border border-line-soft bg-surface-raised px-3 py-1.5">
          {items.length > 0 && (
            <Menu className="size-3.5 shrink-0 text-text-muted" aria-hidden />
          )}
          <span className="flex-1 text-xs text-muted-foreground">Poruka…</span>
          <Send className="size-3.5 shrink-0 text-text-muted" aria-hidden />
        </div>
      </div>

      {items.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-text-muted">Iza ikonice menija</p>
          <div className="mt-1.5 overflow-hidden rounded-lg border border-line-soft">
            {items.map((item) => (
              <div
                key={item.uid}
                className="flex items-center gap-1.5 border-b border-line-soft bg-surface-raised px-3 py-2 text-xs font-medium text-foreground last:border-b-0"
              >
                {item.type === "url" && (
                  <ExternalLink
                    className="size-3 shrink-0 text-text-muted"
                    aria-hidden
                  />
                )}
                <span className="truncate">{item.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export function ProfileMenuPanelSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="space-y-4">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  );
}
