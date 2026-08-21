"use client";

import {
  useState,
  useEffect,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import {
  LineChart,
  MessageCircleReply,
  Camera,
  Users,
  Megaphone,
  SquarePlay,
  RefreshCw,
  LoaderCircle,
  Lock,
  Check,
  ExternalLink,
  Trash2,
  Copy,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Provider } from "@/convex/lib/providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RevealGroup } from "@/components/motion/reveal";
import { formatRelativeTime } from "@/lib/format";
import { GOOGLE_PERMISSIONS_URL } from "@/lib/policy-links";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackLine, FeedbackNote } from "@/components/app/feedback";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import {
  DangerZone,
  Field,
  FormGroup,
  FormStack,
} from "@/components/app/form-kit";
import { DataAndAccess } from "./data-and-access";
import { Ga4Configuration } from "./ga4-configuration";
import {
  PurgeNotice,
  useIsWorkspaceOwner,
  usePurgeRun,
} from "./purge-state";
import { WebhookSignatureNote } from "./webhook-health";
import { StatusPill } from "./status-pill";
import { SyncHealth } from "./sync-health";
import { SyncSchedule } from "./sync-schedule";

type ConnectionView = FunctionReturnType<typeof api.connections.list>[number];

/** Pull the friendly message out of a thrown ConvexError, else a fallback. */
function convexMessage(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as { message?: string } | undefined;
    if (data && typeof data.message === "string") return data.message;
  }
  return fallback;
}

/**
 * Šta ne valja sa zalepljenim ključem — dok se lepi, ne posle čuvanja.
 * `null` znači „nemam prigovor", uključujući i prazno polje: prazno polje nije
 * greška dok se kuca, nego tek razlog što dugme još ne radi.
 */
function serviceAccountProblem(raw: string): string | null {
  const value = raw.trim();
  if (value.length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return "Ovo nije ispravan JSON — nalepi ceo sadržaj ključa, sa vitičastim zagradama.";
  }

  if (typeof parsed !== "object" || parsed === null) {
    return "Ključ mora biti JSON objekat.";
  }

  const key = parsed as { type?: unknown; client_email?: unknown; private_key?: unknown };
  if (key.type !== "service_account") {
    return "Ovo nije ključ servisnog naloga — polje „type” mora biti „service_account”.";
  }
  if (typeof key.client_email !== "string" || typeof key.private_key !== "string") {
    return "Ključu nedostaje „client_email” ili „private_key”.";
  }
  return null;
}

/** Google Ads ID je deset cifara; crtice su dozvoljene i skidaju se pri čuvanju. */
function customerIdProblem(raw: string): string | null {
  const value = raw.trim().replace(/-/g, "");
  if (value.length === 0) return null;
  if (!/^\d+$/.test(value)) return "Dozvoljene su samo cifre i crtice.";
  if (value.length !== 10) return `Treba deset cifara, uneto ${value.length}.`;
  return null;
}

function connectionPill(status: ConnectionView["status"] | undefined) {
  switch (status) {
    case "active":
      return <StatusPill tone="success">Aktivno</StatusPill>;
    case "error":
      return <StatusPill tone="danger">Greška</StatusPill>;
    case "expired":
      return <StatusPill tone="warning">Isteklo</StatusPill>;
    // Veza je prekinuta, ali red još stoji dok se preuzeti podaci brišu (P3).
    case "disconnecting":
      return (
        <StatusPill tone="warning" pulse>
          Brisanje u toku
        </StatusPill>
      );
    default:
      return <StatusPill tone="muted">Nije povezano</StatusPill>;
  }
}

// ── shared card shell ────────────────────────────────────────────────────────

function CardShell({
  icon: Icon,
  title,
  subtitle,
  status,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  status: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-6 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg border border-line-soft text-text-muted">
            <Icon className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <p className="text-xs text-text-muted">{subtitle}</p>
          </div>
        </div>
        {status}
      </div>
      {children}
    </section>
  );
}

/**
 * „Sinhronizuj" podnožje — na integracijama koje se zaista mogu povući.
 *
 * Sve četiri vrste povratne informacije stoje ovde, jedna po jedna: dok traje
 * (stanje), kad prođe (završetak), i kad pukne (greška, sa sledećim potezom).
 * Poruka o uspehu se sama sklanja posle nekoliko sekundi — potvrda koja ostane
 * zauvek prestane da bude potvrda i postane deo pozadine.
 */
function SyncFooter({ connection }: { connection?: ConnectionView }) {
  const syncNow = useAction(api.connections.syncNow);
  const [syncing, setSyncing] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => setDone(false), 4000);
    return () => window.clearTimeout(timer);
  }, [done]);

  async function handleSync() {
    if (!connection) return;
    setSyncing(true);
    setDone(false);
    setError(null);
    try {
      await syncNow({ connectionId: connection._id });
      setDone(true);
    } catch (err) {
      setError(
        convexMessage(
          err,
          "Sinhronizacija nije uspela. Proveri kredencijale pa pokušaj ponovo.",
        ),
      );
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="mt-6 space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-text-muted">
          {connection?.lastSyncAt
            ? `Poslednja sinhronizacija ${formatRelativeTime(connection.lastSyncAt)}`
            : "Još nije sinhronizovano"}
        </span>
        <div className="flex items-center gap-3">
          {syncing && <FeedbackLine tone="progress">Povlačim podatke…</FeedbackLine>}
          {done && !syncing && (
            <FeedbackLine tone="success">Podaci su osveženi</FeedbackLine>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={!connection || syncing}
          >
            {syncing ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            {syncing ? "Sinhronizujem…" : "Sinhronizuj"}
          </Button>
        </div>
      </div>
      {error && <FeedbackNote tone="danger" title={error} />}
    </div>
  );
}

/**
 * Kredencijali su sačuvani — jedan red koji to kaže i put nazad u izmenu.
 * Prekid veze NIJE ovde: on stoji dole, u svojoj zoni, odvojen od svega što
 * se klikće svaki dan.
 */
function SavedCredentials({
  detail,
  onEdit,
}: {
  detail: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line-soft bg-surface-raised/40 px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <Lock className="size-3.5 shrink-0 text-success" aria-hidden />
        <span>{detail}</span>
      </div>
      <Button variant="ghost" size="sm" onClick={onEdit}>
        Izmeni
      </Button>
    </div>
  );
}

/**
 * Prekid veze: odvojen okvir, sopstveni naslov i potvrda koja kaže šta se
 * gubi a šta ostaje. Potvrda stoji ovde i skoro nigde drugde — kada bi je
 * tražila svaka radnja, prestala bi da se čita.
 */
function DisconnectZone({
  provider,
  label,
  busy,
  onConfirm,
  zoneDescription,
  dialogDescription,
}: {
  /** Koji servis — za proveru da li brisanje već teče. */
  provider: Provider;
  /** Šta se prekida, u prvom padežu jednine: „Meta Ads nalog". */
  label: string;
  busy: boolean;
  onConfirm: () => void;
  /**
   * Kada prekid veze ne radi ono što podrazumevana rečenica obećava.
   * YouTube (YA2) uz kredencijale briše i sve preuzete podatke, pa mora da
   * kaže svoje — potvrda koja opisuje tuđu radnju gora je od nikakve.
   */
  zoneDescription?: string;
  dialogDescription?: ReactNode;
}) {
  const [asking, setAsking] = useState(false);
  const isOwner = useIsWorkspaceOwner();
  const run = usePurgeRun(provider);

  // Prekid veze traži rolu `owner` na serveru (P3). Ko to nije, ne vidi ni
  // dugme: dugme koje puca na klik je gore od dugmeta kojeg nema. Dok se rola
  // učitava zona se takođe ne prikazuje — bolje da se pojavi trenutak kasnije
  // nego da trepne pa nestane.
  if (isOwner !== true) return null;

  const purging = run !== undefined && run !== null && run.status === "running";

  return (
    <>
      <DangerZone
        className="mt-6"
        title="Prekini vezu"
        description={
          purging
            ? "Brisanje preuzetih podataka je u toku. Detalji su iznad."
            : (zoneDescription ??
              // Do P3 je ovde pisalo da preuzeti podaci ostaju. Pisalo je
              // tačno — brisao se samo YouTube — ali sada se briše sve, pa bi
              // ista rečenica bila obećanje suprotno od onoga što kod radi.
              "Pristup se opoziva, a kredencijali i svi podaci preuzeti sa ovog servisa se brišu. Nepovratno.")
        }
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAsking(true)}
          disabled={busy || purging}
          className="border-danger/30 text-danger hover:bg-danger/10 hover:text-danger"
        >
          {busy || purging ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
          Prekini vezu
        </Button>
      </DangerZone>

      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        busy={busy}
        title={`Prekinuti vezu sa ${label}?`}
        description={
          dialogDescription ??
          "Pristup ovoj aplikaciji se opoziva kod servisa, sačuvani kredencijali se brišu i briše se sve što je sa njega preuzeto. Brisanje traje koliko traje i vidi se na kartici. Vezu možeš ponovo uspostaviti, ali obrisani podaci se ne vraćaju."
        }
        confirmLabel="Prekini vezu"
        busyLabel="Prekidam…"
        onConfirm={() => {
          setAsking(false);
          onConfirm();
        }}
      />
    </>
  );
}

// ── GA4 ──────────────────────────────────────────────────────────────────────

function Ga4Card({ connection }: { connection?: ConnectionView }) {
  const save = useMutation(api.connections.save);
  const [editing, setEditing] = useState(false);
  const [propertyId, setPropertyId] = useState("");
  const [json, setJson] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConnected = connection !== undefined;

  // Provera stiže dok se kuca. Zalepljen ključ koji nije JSON vidi se odmah,
  // umesto da se sazna tek posle „Sačuvaj" — i to porukom sa servera.
  const propertyProblem =
    propertyId.trim().length > 0 && !/^\d+$/.test(propertyId.trim())
      ? "Property ID su samo cifre, bez razmaka i prefiksa."
      : null;
  const jsonProblem = serviceAccountProblem(json);
  const canSaveGa4 =
    propertyId.trim().length > 0 &&
    json.trim().length > 0 &&
    propertyProblem === null &&
    jsonProblem === null;

  function startEdit() {
    setPropertyId(connection?.externalId ?? "");
    setJson("");
    setError(null);
    setEditing(true);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await save({ provider: "ga4", externalId: propertyId, secret: json });
      setJson("");
      setEditing(false);
    } catch (err) {
      setError(convexMessage(err, "Čuvanje nije uspelo."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <CardShell
      icon={LineChart}
      title="Google Analytics 4"
      subtitle="Service account · read-only"
      status={connectionPill(connection?.status)}
    >
      {isConnected && !editing ? (
        <div className="mt-5">
          <SavedCredentials
            detail={`Kredencijali sačuvani${
              connection?.externalId ? ` · property ${connection.externalId}` : ""
            }`}
            onEdit={startEdit}
          />
        </div>
      ) : (
        <form onSubmit={handleSave} className="mt-6">
          <FormStack>
            <FormGroup title="Property">
              <Field label="Property ID" error={propertyProblem} required>
                {(field) => (
                  <Input
                    {...field}
                    inputMode="numeric"
                    placeholder="npr. 493820114"
                    value={propertyId}
                    onChange={(event) => setPropertyId(event.target.value)}
                    disabled={saving}
                  />
                )}
              </Field>
            </FormGroup>

            <FormGroup title="Servisni nalog">
              <Field
                label="Service account JSON"
                error={jsonProblem}
                hint="Ceo sadržaj ključa preuzetog iz Google Cloud konzole."
                required
              >
                {(field) => (
                  <Textarea
                    {...field}
                    rows={6}
                    spellCheck={false}
                    placeholder='{ "type": "service_account", "project_id": "…", … }'
                    value={json}
                    onChange={(event) => setJson(event.target.value)}
                    disabled={saving}
                    className="font-mono text-xs"
                  />
                )}
              </Field>
            </FormGroup>

            {error && <FeedbackNote tone="danger" title={error} />}

            <div className="flex items-center gap-3">
              <Button
                type="submit"
                size="sm"
                disabled={saving || !canSaveGa4}
              >
                {saving ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Čuvam…
                  </>
                ) : (
                  <>
                    <Check />
                    Sačuvaj
                  </>
                )}
              </Button>
              {isConnected && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(false);
                    setJson("");
                    setError(null);
                  }}
                >
                  Otkaži
                </Button>
              )}
            </div>
          </FormStack>
        </form>
      )}
      <SyncFooter connection={connection} />
    </CardShell>
  );
}

// ── OpenReply ────────────────────────────────────────────────────────────────

function OpenReplyCard() {
  const status = useQuery(api.orEngine.status);
  const enable = useMutation(api.orEngine.enable);
  const disable = useMutation(api.orEngine.disable);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleEnable() {
    setBusy(true);
    setError(null);
    try {
      await enable();
    } catch (err) {
      setError(convexMessage(err, "Radnja nije uspela."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    setError(null);
    try {
      await disable();
    } catch (err) {
      setError(convexMessage(err, "Radnja nije uspela."));
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!status?.webhookUrl) return;
    try {
      await navigator.clipboard.writeText(status.webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard error
    }
  }

  const missingVars: string[] = [];
  if (status && !status.verifyTokenSet) missingVars.push("IG_WEBHOOK_VERIFY_TOKEN");
  if (status && !status.appSecretSet) missingVars.push("META_APP_SECRET");

  const statusNode =
    status === undefined ? (
      <StatusPill tone="muted">Učitavanje…</StatusPill>
    ) : status.enabled ? (
      <StatusPill tone="success">Aktivno</StatusPill>
    ) : (
      <StatusPill tone="muted">Nije uključeno</StatusPill>
    );

  return (
    <CardShell
      icon={MessageCircleReply}
      title="OpenReply"
      subtitle="Komentar → DM automatizacija"
      status={statusNode}
    >
      {status === undefined ? (
        <div className="mt-5">
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : (
        <div className="space-y-4">
          {!status.igConnected && (
            <FeedbackNote
              tone="warning"
              className="mt-5"
              title="Instagram nalog još nije povezan"
            >
              OpenReply šalje poruke istim tokenom, pa dok Instagram ne bude
              povezan engine ne može da se uključi.
            </FeedbackNote>
          )}

          {status.enabled ? (
            <div className="mt-5 space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-line-soft bg-surface-raised/40 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs text-foreground select-all">
                    {status.webhookUrl ?? "CONVEX_SITE_URL nije podešen"}
                  </span>
                </div>
                {status.webhookUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="shrink-0"
                  >
                    {copied ? (
                      <>
                        <Check className="size-3.5 text-success" />
                        Kopirano
                      </>
                    ) : (
                      <>
                        <Copy className="size-3.5" />
                        Kopiraj
                      </>
                    )}
                  </Button>
                )}
              </div>

              <p className="text-xs text-text-muted">
                Nalepi ovaj URL u Meta app → Instagram → Webhooks, polje{" "}
                <code className="font-mono text-foreground">comments</code>.
              </p>

              {/* Odvojeno, ali bez potvrde: gašenje engine-a se vraća jednim
                  klikom, a potvrda koja stoji pred svime prestane da se čita. */}
              <DangerZone
                title="Isključi OpenReply"
                description="Komentari prestaju da pokreću poruke. Automatizacije i log ostaju."
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDisable}
                  disabled={busy}
                  className="border-danger/30 text-danger hover:bg-danger/10 hover:text-danger"
                >
                  {busy ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  Isključi
                </Button>
              </DangerZone>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="rounded-lg border border-line-soft bg-surface-raised/20 p-4 text-xs text-text-muted">
                <p>
                  Uključi engine da bi komentari na Instagram objavama automatski
                  slali DM.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={handleEnable}
                disabled={busy || !status.igConnected}
              >
                {busy ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    Uključujem…
                  </>
                ) : (
                  <>
                    <Check />
                    Uključi OpenReply
                  </>
                )}
              </Button>
            </div>
          )}

          {status.igConnected && !status.igProfessionalIdSet && (
            <FeedbackNote
              tone="warning"
              className="mt-4"
              title="Instagram token je star"
            >
              Poveži Instagram nalog ponovo da bi webhook mogao da prepozna o
              kom se nalogu radi.
            </FeedbackNote>
          )}

          {missingVars.length > 0 && (
            <FeedbackNote
              tone="warning"
              className="mt-4"
              title="Nedostaje Convex environment promenljiva"
            >
              {missingVars.map((varName, i) => (
                <span key={varName}>
                  {i > 0 && " i "}
                  <code className="font-mono font-medium text-accent-400">
                    {varName}
                  </code>
                </span>
              ))}
              . Bez nje webhook odbija dolazne pozive.
            </FeedbackNote>
          )}

          {error && (
            <FeedbackNote tone="danger" className="mt-4" title={error} />
          )}
        </div>
      )}
    </CardShell>
  );
}

// ── Instagram (Meta OAuth Flow & Insights) ───────────────────────────────────

function InstagramCard({ connection }: { connection?: ConnectionView }) {
  const getOAuthConfig = useAction(api.instagram.getOAuthConfig);
  const getOAuthUrl = useAction(api.instagram.getOAuthUrl);
  const completeOAuth = useAction(api.instagram.completeOAuth);
  const removeConnection = useMutation(api.connections.remove);

  const [configState, setConfigState] = useState<{
    loaded: boolean;
    isConfigured: boolean;
  }>({
    loaded: false,
    isConfigured: false,
  });

  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Sat je spoljni sistem, pa se čita pretplatom umesto pozivom u renderu:
  // `Date.now()` u telu komponente je nečista funkcija i vraća drugu vrednost
  // na svakom prolazu. Minut je dovoljno često za odbrojavanje do isteka
  // tokena, a `null` do prve otkucaja znači „još ne znam" — a ne „ističe".
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, []);

  // Check env configuration on mount
  useEffect(() => {
    let active = true;
    getOAuthConfig()
      .then((cfg) => {
        if (active) {
          setConfigState({ loaded: true, isConfigured: cfg.isConfigured });
        }
      })
      .catch(() => {
        if (active) {
          setConfigState({ loaded: true, isConfigured: false });
        }
      });
    return () => {
      active = false;
    };
  }, [getOAuthConfig]);

  // Handle incoming OAuth callback code in URL parameters
  useEffect(() => {
    if (typeof window === "undefined") return;

    const urlParams = new URLSearchParams(window.location.search);

    // Primary path: the callback route already completed the exchange
    // server-side and redirected here with the result.
    if (urlParams.get("ig_connected")) {
      const username = urlParams.get("ig_username");
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => {
        setSuccessMessage(
          username
            ? `Uspešno povezan nalog @${username}!`
            : "Instagram nalog je uspešno povezan!",
        );
      }, 0);
      return;
    }

    let code = urlParams.get("ig_code") || urlParams.get("code");
    const err =
      urlParams.get("ig_error") ||
      urlParams.get("error_description") ||
      urlParams.get("error");

    // Fallback: the OAuth code may have been parked in localStorage by
    // OAuthCodeCatcher (app-shell) if the user hit the callback while the
    // auth session was not yet mounted (e.g. forced to log in again).
    if (!code && !err) {
      try {
        const stored = window.localStorage.getItem("ig_oauth_code");
        if (stored) {
          window.localStorage.removeItem("ig_oauth_code");
          const parsed = JSON.parse(stored) as { code?: string; ts?: number };
          if (
            parsed.code &&
            typeof parsed.ts === "number" &&
            Date.now() - parsed.ts < 10 * 60 * 1000
          ) {
            code = parsed.code;
          }
        }
      } catch {
        // ignore malformed storage
      }
    }

    if (!code && !err) return;

    // Clean URL query parameters
    window.history.replaceState({}, "", window.location.pathname);

    if (err) {
      setTimeout(() => {
        setError(`Autorizacija nije uspela: ${err}`);
      }, 0);
      return;
    }

    if (code) {
      setTimeout(() => {
        setConnecting(true);
        setError(null);
      }, 0);

      const redirectUri = `${window.location.origin}/api/auth/callback/instagram`;
      completeOAuth({ code, redirectUri })
        .then((res) => {
          setSuccessMessage(
            res.username
              ? `Uspešno povezan nalog @${res.username}!`
              : "Instagram nalog je uspešno povezan!",
          );
        })
        .catch((e) => {
          setError(convexMessage(e, "Povezivanje Instagram naloga nije uspelo."));
        })
        .finally(() => {
          setConnecting(false);
        });
    }
  }, [completeOAuth]);

  async function handleStartConnect() {
    setError(null);
    setSuccessMessage(null);
    setConnecting(true);
    try {
      const redirectUri = `${window.location.origin}/api/auth/callback/instagram`;
      const { url } = await getOAuthUrl({ redirectUri });
      window.location.href = url;
    } catch (e) {
      setError(convexMessage(e, "Pokretanje autorizacije nije uspelo."));
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!connection) return;
    setDisconnecting(true);
    setError(null);
    try {
      await removeConnection({ connectionId: connection._id });
      setSuccessMessage("Veza sa Instagram nalogom je prekinuta.");
    } catch (e) {
      setError(convexMessage(e, "Prekidanje veze nije uspelo."));
    } finally {
      setDisconnecting(false);
    }
  }

  const isConnected = connection !== undefined;

  // Determine status pill
  let statusNode: ReactNode;
  if (!configState.loaded) {
    statusNode = <StatusPill tone="muted">Učitavanje…</StatusPill>;
  } else if (!configState.isConfigured) {
    statusNode = (
      <StatusPill tone="warning">
        Čeka Meta app — dodaj INSTAGRAM_APP_ID/SECRET u env
      </StatusPill>
    );
  } else {
    statusNode = connectionPill(connection?.status);
  }

  return (
    <CardShell
      icon={Camera}
      title="Instagram"
      subtitle="Meta · organski insights"
      status={statusNode}
    >
      {/* Šta se zaista dešava sa preuzetim podacima posle „Prekini vezu” (P3).
          Ne prikazuje ništa dok brisanja nema. */}
      <PurgeNotice provider="meta_ig" />
      <WebhookSignatureNote route="instagram" />
      {/* Missing Environment Variables State */}
      {configState.loaded && !configState.isConfigured && (
        <FeedbackNote
          tone="warning"
          className="mt-5"
          title="Čeka se konfiguracija Meta aplikacije"
        >
          Za povezivanje Instagram Business naloga unesi{" "}
          <code className="font-mono text-accent-400">INSTAGRAM_APP_ID</code> i{" "}
          <code className="font-mono text-accent-400">INSTAGRAM_APP_SECRET</code>{" "}
          u Convex environment varijable.
        </FeedbackNote>
      )}

      {/* Connecting in progress overlay */}
      {connecting && (
        <FeedbackNote
          tone="progress"
          className="mt-5"
          title="Povezujem Instagram nalog…"
        >
          Meta vraća token — ostani na ovoj strani još koji trenutak.
        </FeedbackNote>
      )}

      {/* Connected State */}
      {configState.isConfigured && isConnected && !connecting && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line-soft bg-surface-raised/40 px-4 py-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-foreground">
                <Lock className="size-3.5 shrink-0 text-success" aria-hidden />
                <span className="font-medium">
                  Instagram nalog povezan
                  {connection.externalId ? ` · ID ${connection.externalId}` : ""}
                </span>
              </div>
              {connection.expiresAt && (
                <p className="text-micro text-text-muted">
                  Token važi do{" "}
                  {new Date(connection.expiresAt).toLocaleDateString("sr-RS")}{" "}
                  ({formatRelativeTime(connection.expiresAt)})
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleStartConnect}
              disabled={connecting || disconnecting}
            >
              Ponovo poveži
            </Button>
          </div>

          {/* Upozorenje pre nego što nastane problem: token koji ističe za
              manje od dve nedelje se ne primeti sam od sebe — primeti se tek
              kada sinhronizacija stane. */}
          {connection.expiresAt != null &&
            now !== null &&
            connection.expiresAt - now < 14 * 24 * 60 * 60 * 1000 && (
              <FeedbackNote
                tone="warning"
                className="mt-3"
                title={`Token ističe ${formatRelativeTime(connection.expiresAt)}`}
              >
                Klikni „Ponovo poveži” pre isteka da sinhronizacija ne stane.
              </FeedbackNote>
            )}
        </div>
      )}

      {/* Not Connected State */}
      {configState.isConfigured && !isConnected && !connecting && (
        <div className="mt-5 space-y-4">
          <p className="rounded-lg border border-line-soft bg-surface-raised/20 p-4 text-xs leading-relaxed text-text-muted">
            Poveži Instagram Business ili Creator nalog preko zvaničnog
            Instagram Login-a za sinhronizaciju uvida (pratioci, doseg, posete
            profilu, angažovanost, statistika objava i Reels-a).
          </p>
          <Button size="sm" onClick={handleStartConnect} disabled={connecting}>
            {connecting ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <ExternalLink />
            )}
            Poveži Instagram
          </Button>
        </div>
      )}

      {/* Success / Error Messages */}
      {successMessage && (
        <FeedbackNote tone="success" className="mt-4" title={successMessage} />
      )}
      {error && <FeedbackNote tone="danger" className="mt-4" title={error} />}

      {isConnected && <SyncFooter connection={connection} />}
      {isConnected && (
        <DisconnectZone
          provider="meta_ig"
          label="Instagram nalogom"
          busy={disconnecting}
          onConfirm={handleDisconnect}
        />
      )}
    </CardShell>
  );
}

// ── Facebook stranica (Facebook Login for Business) ──────────────────────────

/**
 * The manual half of the setup, spelled out.
 *
 * Everything below has to be done by hand in the Meta app dashboard, and none
 * of it can be done from here — so it is printed ABOVE the connect button
 * rather than behind a "learn more" link. A person who presses the button first
 * gets a permissions error whose text is about scopes; a person who reads this
 * first does not.
 */
function FacebookSetupSteps({ webhookUrl }: { webhookUrl: string | null }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard error
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-line-soft bg-surface-raised/20 p-4">
      <p className="text-xs font-semibold text-foreground">
        Pre povezivanja — uradi ovo u Meta App Dashboard-u
      </p>

      <ol className="space-y-2.5 text-xs leading-relaxed text-text-muted">
        <li className="flex gap-2">
          <span className="font-mono text-text-secondary">1.</span>
          <span>
            Dodaj proizvod <span className="text-foreground">Facebook Login for Business</span> i
            u <span className="text-foreground">Permissions</span> odobri:{" "}
            {[
              "pages_show_list",
              "pages_read_engagement",
              "pages_manage_engagement",
              "pages_messaging",
              "pages_manage_metadata",
            ].map((scope, index) => (
              <span key={scope}>
                {index > 0 && ", "}
                <code className="font-mono text-accent-400">{scope}</code>
              </span>
            ))}
            .
          </span>
        </li>

        <li className="flex gap-2">
          <span className="font-mono text-text-secondary">2.</span>
          <span>
            U <span className="text-foreground">Webhooks</span> dodaj objekat{" "}
            <span className="text-foreground">Page</span> i pretplati polja{" "}
            <code className="font-mono text-accent-400">feed</code> i{" "}
            <code className="font-mono text-accent-400">messages</code>.
            Callback URL je isti kao za Instagram, ali sa putanjom{" "}
            <code className="font-mono text-accent-400">/facebook/webhook</code>
            .
          </span>
        </li>

        <li className="flex gap-2">
          <span className="font-mono text-text-secondary">3.</span>
          <span>
            Verify token je isti{" "}
            <code className="font-mono text-accent-400">
              IG_WEBHOOK_VERIFY_TOKEN
            </code>{" "}
            koji već koristi Instagram webhook. Ne pravi novi.
          </span>
        </li>

        <li className="flex gap-2">
          <span className="font-mono text-text-secondary">4.</span>
          <span>
            U <span className="text-foreground">Settings → Basic</span> uzmi App
            ID i App Secret i upiši ih u Convex kao{" "}
            <code className="font-mono text-accent-400">FACEBOOK_APP_ID</code> i{" "}
            <code className="font-mono text-accent-400">FACEBOOK_APP_SECRET</code>
            . App Secret je isti kao za Instagram; App ID nije — Instagram Login
            ima svoj.
          </span>
        </li>
      </ol>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-line-soft bg-surface px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground select-all">
          {webhookUrl ?? "CONVEX_SITE_URL nije podešen"}
        </span>
        {webhookUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="shrink-0"
          >
            {copied ? (
              <>
                <Check className="size-3.5 text-success" />
                Kopirano
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                Kopiraj
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * The Page picker.
 *
 * Only worth opening when the account administers more than one Page, which is
 * why it is a button rather than a list that is always on screen: for the
 * common case — one Page — the list would be a control with a single option.
 */
function FacebookPagePicker({
  currentPageId,
  autoOpen,
  onSwitched,
}: {
  currentPageId: string;
  autoOpen: boolean;
  onSwitched: (name: string | null) => void;
}) {
  const listPages = useAction(api.facebook.listPages);
  const selectPage = useAction(api.facebook.selectPage);

  const [open, setOpen] = useState(autoOpen);
  // `null` means "not fetched yet" — which is also what makes the spinner a
  // derived value instead of a second piece of state set from inside an effect.
  const [pages, setPages] = useState<Array<{
    id: string;
    name: string;
    category: string | null;
    connected: boolean;
  }> | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loading = open && pages === null && error === null;

  useEffect(() => {
    if (!open) return;
    let active = true;
    listPages()
      .then((result) => {
        if (active) setPages(result);
      })
      .catch((err) => {
        if (active) {
          setError(convexMessage(err, "Čitanje liste stranica nije uspelo."));
        }
      });
    return () => {
      active = false;
    };
  }, [open, listPages]);

  async function handleSelect(pageId: string) {
    setSwitching(pageId);
    setError(null);
    try {
      const result = await selectPage({ pageId });
      onSwitched(result.pageName);
      setOpen(false);
    } catch (err) {
      setError(convexMessage(err, "Promena stranice nije uspela."));
    } finally {
      setSwitching(null);
    }
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setPages(null);
          setError(null);
          setOpen(true);
        }}
        className="text-text-muted"
      >
        Izaberi drugu stranicu
      </Button>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-line-soft bg-surface-raised/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">
          Stranice koje nalog administrira
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
          className="text-text-muted"
        >
          Zatvori
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ) : (pages ?? []).length === 0 ? (
        <p className="text-xs text-text-muted">
          Nijedna stranica nije pronađena.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {(pages ?? []).map((page) => {
            const isCurrent = page.id === currentPageId;
            return (
              <li
                key={page.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-line-soft bg-surface px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">
                    {page.name}
                  </p>
                  <p className="truncate font-mono text-micro text-text-muted">
                    {page.id}
                    {page.category ? ` · ${page.category}` : ""}
                  </p>
                </div>
                {isCurrent ? (
                  <StatusPill tone="success">Povezana</StatusPill>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={switching !== null}
                    onClick={() => void handleSelect(page.id)}
                  >
                    {switching === page.id ? (
                      <LoaderCircle className="animate-spin" />
                    ) : null}
                    Poveži
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && <FeedbackNote tone="danger" title={error} />}
    </div>
  );
}

function FacebookCard({ connection }: { connection?: ConnectionView }) {
  const setup = useQuery(api.facebookStore.setupInfo);
  const getOAuthUrl = useAction(api.facebook.getOAuthUrl);
  const refreshToken = useAction(api.facebook.refreshTokenNow);
  const removeConnection = useMutation(api.connections.remove);
  const pageInfo = useQuery(api.facebookStore.pageInfo);

  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [autoOpenPicker, setAutoOpenPicker] = useState(false);

  // Isti sat kao na Instagram kartici: spoljni sistem se čita pretplatom, ne
  // pozivom u renderu. `null` do prvog otkucaja znači „još ne znam".
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, []);

  // The callback route redirects back here with its verdict in the query
  // string; the exchange itself already happened server-side.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("fb_connected");
    const err = params.get("fb_error");
    if (!connected && !err) return;

    const page = params.get("fb_page");
    const pick = params.get("fb_pick");
    window.history.replaceState({}, "", window.location.pathname);

    setTimeout(() => {
      if (err) {
        setError(err);
        return;
      }
      setSuccessMessage(
        page
          ? `Facebook stranica „${page}” je povezana!`
          : "Facebook stranica je povezana!",
      );
      if (pick === "1") setAutoOpenPicker(true);
    }, 0);
  }, []);

  async function handleStartConnect() {
    setError(null);
    setSuccessMessage(null);
    setConnecting(true);
    try {
      const redirectUri = `${window.location.origin}/api/auth/callback/facebook`;
      const { url } = await getOAuthUrl({ redirectUri });
      window.location.href = url;
    } catch (err) {
      setError(convexMessage(err, "Pokretanje autorizacije nije uspelo."));
      setConnecting(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await refreshToken();
      if (result.success) setSuccessMessage(result.message);
      else setError(result.message);
    } catch (err) {
      setError(convexMessage(err, "Osvežavanje tokena nije uspelo."));
    } finally {
      setRefreshing(false);
    }
  }

  async function handleDisconnect() {
    if (!connection) return;
    setDisconnecting(true);
    setError(null);
    try {
      await removeConnection({ connectionId: connection._id });
      setSuccessMessage("Veza sa Facebook stranicom je prekinuta.");
    } catch (err) {
      setError(convexMessage(err, "Prekidanje veze nije uspelo."));
    } finally {
      setDisconnecting(false);
    }
  }

  const isConnected = connection !== undefined;

  let statusNode: ReactNode;
  if (setup === undefined) {
    statusNode = <StatusPill tone="muted">Učitavanje…</StatusPill>;
  } else if (!setup.appConfigured) {
    statusNode = (
      <StatusPill tone="warning">
        Čeka Meta app — dodaj FACEBOOK_APP_ID/SECRET u env
      </StatusPill>
    );
  } else {
    statusNode = connectionPill(connection?.status);
  }

  const missingVars: string[] = [];
  if (setup && !setup.verifyTokenSet) missingVars.push("IG_WEBHOOK_VERIFY_TOKEN");
  if (setup && !setup.appSecretSet) missingVars.push("FACEBOOK_APP_SECRET");

  return (
    <CardShell
      icon={Users}
      title="Facebook stranica"
      subtitle="Meta · objave, komentari i DM automatizacija"
      status={statusNode}
    >
      {/* Šta se zaista dešava sa preuzetim podacima posle „Prekini vezu” (P3).
          Ne prikazuje ništa dok brisanja nema. */}
      <PurgeNotice provider="meta_fb" />
      <WebhookSignatureNote route="facebook" />
      {setup === undefined ? (
        <div className="mt-5">
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {isConnected && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line-soft bg-surface-raised/40 px-4 py-3">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 text-xs text-foreground">
                  <Lock className="size-3.5 shrink-0 text-success" aria-hidden />
                  <span className="truncate font-medium">
                    {pageInfo?.pageName ?? "Facebook stranica povezana"}
                  </span>
                </div>
                <p className="font-mono text-micro text-text-muted">
                  ID {connection.externalId ?? "—"}
                </p>
                <p className="text-micro text-text-muted">
                  {connection.expiresAt
                    ? `Token važi do ${new Date(
                        connection.expiresAt,
                      ).toLocaleDateString("sr-RS")} (${formatRelativeTime(
                        connection.expiresAt,
                      )})`
                    : "Token nema rok trajanja — Meta ga poništava samo pri promeni lozinke ili povlačenju dozvole."}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={refreshing || disconnecting}
                >
                  {refreshing ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <RefreshCw />
                  )}
                  Osveži token
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleStartConnect}
                  disabled={connecting || disconnecting}
                >
                  Ponovo poveži
                </Button>
              </div>
            </div>
          )}

          {isConnected && connection.externalId && (
            <FacebookPagePicker
              currentPageId={connection.externalId}
              autoOpen={autoOpenPicker}
              onSwitched={(name) =>
                setSuccessMessage(
                  name
                    ? `Sada je povezana stranica „${name}”.`
                    : "Stranica je promenjena.",
                )
              }
            />
          )}

          {/* Upozorenje pre nego što nastane problem — isto pravilo kao na
              Instagram kartici. */}
          {isConnected &&
            connection.expiresAt != null &&
            now !== null &&
            connection.expiresAt - now < 14 * 24 * 60 * 60 * 1000 && (
              <FeedbackNote
                tone="warning"
                title={`Pristup ističe ${formatRelativeTime(connection.expiresAt)}`}
              >
                Klikni „Osveži token” pre isteka da sinhronizacija ne stane.
              </FeedbackNote>
            )}

          <FacebookSetupSteps webhookUrl={setup.webhookUrl} />

          {!setup.appConfigured && (
            <FeedbackNote
              tone="warning"
              title="Čeka se konfiguracija Meta aplikacije"
            >
              Bez{" "}
              <code className="font-mono text-accent-400">FACEBOOK_APP_ID</code>{" "}
              i{" "}
              <code className="font-mono text-accent-400">
                FACEBOOK_APP_SECRET
              </code>{" "}
              dugme ispod nema čime da pokrene prijavu.
            </FeedbackNote>
          )}

          {missingVars.length > 0 && (
            <FeedbackNote
              tone="warning"
              title="Nedostaje Convex environment promenljiva"
            >
              {missingVars.map((varName, i) => (
                <span key={varName}>
                  {i > 0 && " i "}
                  <code className="font-mono font-medium text-accent-400">
                    {varName}
                  </code>
                </span>
              ))}
              . Bez nje webhook odbija dolazne pozive.
            </FeedbackNote>
          )}

          {!isConnected && (
            <Button
              size="sm"
              onClick={handleStartConnect}
              disabled={connecting || !setup.appConfigured}
            >
              {connecting ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <ExternalLink />
              )}
              Poveži Facebook stranicu
            </Button>
          )}

          {successMessage && (
            <FeedbackNote tone="success" title={successMessage} />
          )}
          {error && <FeedbackNote tone="danger" title={error} />}
        </div>
      )}

      {isConnected && <SyncFooter connection={connection} />}
      {isConnected && (
        <DisconnectZone
          provider="meta_fb"
          label="Facebook stranicom"
          busy={disconnecting}
          onConfirm={handleDisconnect}
        />
      )}
    </CardShell>
  );
}

// ── Meta Ads (System User Token) ─────────────────────────────────────────────

function MetaAdsCard({ connection }: { connection?: ConnectionView }) {
  const save = useMutation(api.connections.save);
  const remove = useMutation(api.connections.remove);
  const [editing, setEditing] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConnected = connection !== undefined;

  const accountProblem =
    accountId.trim().length > 0 && !/^act_\d+$/.test(accountId.trim())
      ? "Ad Account ID počinje sa „act_” i nastavlja se ciframa."
      : null;

  function startEdit() {
    setAccountId(connection?.externalId ?? "");
    setToken("");
    setError(null);
    setEditing(true);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await save({
        provider: "meta_ads",
        externalId: accountId.trim() || undefined,
        secret: token.trim(),
      });
      setToken("");
      setEditing(false);
    } catch (err) {
      setError(convexMessage(err, "Čuvanje nije uspelo."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!connection) return;
    setDisconnecting(true);
    setError(null);
    try {
      await remove({ connectionId: connection._id });
    } catch (err) {
      setError(convexMessage(err, "Prekidanje veze nije uspelo."));
    } finally {
      setDisconnecting(false);
    }
  }

  // Determine status pill
  let statusNode: ReactNode;
  if (!isConnected) {
    statusNode = (
      <StatusPill tone="warning">Čeka System User token</StatusPill>
    );
  } else {
    statusNode = connectionPill(connection?.status);
  }

  return (
    <CardShell
      icon={Megaphone}
      title="Meta Ads"
      subtitle="Marketing API · System User token"
      status={statusNode}
    >
      {/* Šta se zaista dešava sa preuzetim podacima posle „Prekini vezu” (P3).
          Ne prikazuje ništa dok brisanja nema. */}
      <PurgeNotice provider="meta_ads" />
      {isConnected && !editing ? (
        <div className="mt-5">
          <SavedCredentials
            detail={`Kredencijali sačuvani${
              connection?.externalId ? ` · nalog ${connection.externalId}` : ""
            }`}
            onEdit={startEdit}
          />
        </div>
      ) : (
        <form onSubmit={handleSave} className="mt-6">
          <FormStack>
            <FormGroup title="Nalog">
              <Field
                label="Ad Account ID"
                error={accountProblem}
                hint="Prazno polje znači da se nalog traži automatski."
              >
                {(field) => (
                  <Input
                    {...field}
                    placeholder="npr. act_1234567890"
                    value={accountId}
                    onChange={(event) => setAccountId(event.target.value)}
                    disabled={saving}
                    className="font-mono text-xs"
                  />
                )}
              </Field>
            </FormGroup>

            <FormGroup title="Pristup">
              <Field label="System User Access Token" required>
                {(field) => (
                  <Textarea
                    {...field}
                    rows={4}
                    spellCheck={false}
                    placeholder="EAA…"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    disabled={saving}
                    className="font-mono text-xs"
                  />
                )}
              </Field>
            </FormGroup>

            {error && <FeedbackNote tone="danger" title={error} />}

            <div className="flex items-center gap-3">
              <Button
                type="submit"
                size="sm"
                disabled={
                  saving || token.trim().length === 0 || accountProblem !== null
                }
              >
                {saving ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Čuvam…
                  </>
                ) : (
                  <>
                    <Check />
                    Sačuvaj
                  </>
                )}
              </Button>
              {isConnected && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(false);
                    setToken("");
                    setError(null);
                  }}
                >
                  Otkaži
                </Button>
              )}
            </div>
          </FormStack>
        </form>
      )}
      <SyncFooter connection={connection} />
      {isConnected && (
        <DisconnectZone
          provider="meta_ads"
          label="Meta Ads nalogom"
          busy={disconnecting}
          onConfirm={handleDisconnect}
        />
      )}
    </CardShell>
  );
}

// ── Google Ads (OAuth + Developer Token) ────────────────────────────────────

function GoogleAdsCard({ connection }: { connection?: ConnectionView }) {
  const save = useMutation(api.connections.save);
  const remove = useMutation(api.connections.remove);
  const [editing, setEditing] = useState(false);
  const [developerToken, setDeveloperToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [loginCustomerId, setLoginCustomerId] = useState("");
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConnected = connection !== undefined;

  const customerProblem = customerIdProblem(customerId);
  const managerProblem = customerIdProblem(loginCustomerId);

  function startEdit() {
    setCustomerId(connection?.externalId ?? "");
    setDeveloperToken("");
    setClientId("");
    setClientSecret("");
    setRefreshToken("");
    setLoginCustomerId("");
    setError(null);
    setEditing(true);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        developerToken: developerToken.trim(),
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        refreshToken: refreshToken.trim(),
        customerId: customerId.trim().replace(/-/g, ""),
        loginCustomerId: loginCustomerId.trim().replace(/-/g, "") || undefined,
      };

      await save({
        provider: "google_ads",
        externalId: customerId.trim().replace(/-/g, "") || undefined,
        secret: JSON.stringify(payload),
      });

      setDeveloperToken("");
      setClientId("");
      setClientSecret("");
      setRefreshToken("");
      setLoginCustomerId("");
      setEditing(false);
    } catch (err) {
      setError(convexMessage(err, "Čuvanje Google Ads kredencijala nije uspelo."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!connection) return;
    setDisconnecting(true);
    setError(null);
    try {
      await remove({ connectionId: connection._id });
    } catch (err) {
      setError(convexMessage(err, "Prekidanje veze nije uspelo."));
    } finally {
      setDisconnecting(false);
    }
  }

  // Determine status pill
  let statusNode: ReactNode;
  if (!isConnected) {
    statusNode = (
      <StatusPill tone="warning">Čeka Google Ads odobrenje</StatusPill>
    );
  } else {
    statusNode = connectionPill(connection?.status);
  }

  return (
    <CardShell
      icon={Megaphone}
      title="Google Ads"
      subtitle="Google Ads API (GAQL) · OAuth + Developer Token"
      status={statusNode}
    >
      {/* Šta se zaista dešava sa preuzetim podacima posle „Prekini vezu” (P3).
          Ne prikazuje ništa dok brisanja nema. */}
      <PurgeNotice provider="google_ads" />
      {isConnected && !editing ? (
        <div className="mt-5">
          <SavedCredentials
            detail={`Kredencijali sačuvani${
              connection?.externalId ? ` · nalog ${connection.externalId}` : ""
            }`}
            onEdit={startEdit}
          />
        </div>
      ) : (
        // Šest polja, dve celine: ČIJI nalog i ČIME mu se pristupa. Razmak
        // između te dve celine je veći od razmaka unutar njih, pa se forma
        // čita kao dva pitanja umesto kao spisak od šest.
        <form onSubmit={handleSave} className="mt-6">
          <FormStack>
            <FormGroup title="Nalog">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  label="Customer ID"
                  error={customerProblem}
                  hint="Deset cifara, sa crticama ili bez njih."
                  required
                >
                  {(field) => (
                    <Input
                      {...field}
                      placeholder="npr. 123-456-7890"
                      value={customerId}
                      onChange={(event) => setCustomerId(event.target.value)}
                      disabled={saving}
                      className="font-mono text-xs"
                      required
                    />
                  )}
                </Field>
                <Field
                  label="Manager (MCC) ID"
                  error={managerProblem}
                  hint="Samo ako nalogom upravlja MCC."
                >
                  {(field) => (
                    <Input
                      {...field}
                      placeholder="npr. 987-654-3210"
                      value={loginCustomerId}
                      onChange={(event) =>
                        setLoginCustomerId(event.target.value)
                      }
                      disabled={saving}
                      className="font-mono text-xs"
                    />
                  )}
                </Field>
              </div>
            </FormGroup>

            <FormGroup title="Pristup">
              <Field label="Developer Token" required>
                {(field) => (
                  <Input
                    {...field}
                    type="password"
                    placeholder="Developer token iz Google Ads API centra"
                    value={developerToken}
                    onChange={(event) => setDeveloperToken(event.target.value)}
                    disabled={saving}
                    className="font-mono text-xs"
                    required
                  />
                )}
              </Field>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="OAuth Client ID" required>
                  {(field) => (
                    <Input
                      {...field}
                      placeholder="xxxx.apps.googleusercontent.com"
                      value={clientId}
                      onChange={(event) => setClientId(event.target.value)}
                      disabled={saving}
                      className="font-mono text-xs"
                      required
                    />
                  )}
                </Field>
                <Field label="OAuth Client Secret" required>
                  {(field) => (
                    <Input
                      {...field}
                      type="password"
                      placeholder="GOCSPX-…"
                      value={clientSecret}
                      onChange={(event) => setClientSecret(event.target.value)}
                      disabled={saving}
                      className="font-mono text-xs"
                      required
                    />
                  )}
                </Field>
              </div>

              <Field label="OAuth Refresh Token" required>
                {(field) => (
                  <Input
                    {...field}
                    type="password"
                    placeholder="1//04…"
                    value={refreshToken}
                    onChange={(event) => setRefreshToken(event.target.value)}
                    disabled={saving}
                    className="font-mono text-xs"
                    required
                  />
                )}
              </Field>
            </FormGroup>

            {error && <FeedbackNote tone="danger" title={error} />}

            <div className="flex items-center gap-3">
              <Button
                type="submit"
                size="sm"
                disabled={
                  saving || customerProblem !== null || managerProblem !== null
                }
              >
                {saving ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Čuvam…
                  </>
                ) : (
                  <>
                    <Check />
                    Sačuvaj
                  </>
                )}
              </Button>
              {isConnected && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(false);
                    setError(null);
                  }}
                >
                  Otkaži
                </Button>
              )}
            </div>
          </FormStack>
        </form>
      )}
      <SyncFooter connection={connection} />
      {isConnected && (
        <DisconnectZone
          provider="google_ads"
          label="Google Ads nalogom"
          busy={disconnecting}
          onConfirm={handleDisconnect}
        />
      )}
    </CardShell>
  );
}

// ── YouTube (OAuth, read-only) ─────────────────────────────────

function YouTubeCard({ connection }: { connection?: ConnectionView }) {
  const save = useMutation(api.connections.save);
  const remove = useMutation(api.connections.remove);
  const [editing, setEditing] = useState(false);
  const [channelId, setChannelId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConnected = connection !== undefined;

  const trimmedChannel = channelId.trim();
  const channelProblem =
    trimmedChannel.length === 0
      ? null
      : !trimmedChannel.startsWith("UC")
        ? "Channel ID počinje sa „UC” — to nije korisničko ime kanala."
        : trimmedChannel.length !== 24
          ? `Channel ID ima 24 znaka, uneto ${trimmedChannel.length}.`
          : null;

  function startEdit() {
    setChannelId(connection?.externalId ?? "");
    setClientId("");
    setClientSecret("");
    setRefreshToken("");
    setError(null);
    setEditing(true);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const trimmedChannelId = channelId.trim();
      const payload = {
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        refreshToken: refreshToken.trim(),
        channelId: trimmedChannelId,
      };

      await save({
        provider: "youtube",
        externalId: trimmedChannelId || undefined,
        secret: JSON.stringify(payload),
      });

      setClientId("");
      setClientSecret("");
      setRefreshToken("");
      setEditing(false);
    } catch (err) {
      setError(convexMessage(err, "Čuvanje YouTube kredencijala nije uspelo."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!connection) return;
    setDisconnecting(true);
    setError(null);
    try {
      await remove({ connectionId: connection._id });
    } catch (err) {
      setError(convexMessage(err, "Prekidanje veze nije uspelo."));
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <CardShell
      icon={SquarePlay}
      title="YouTube"
      subtitle="YouTube Data API i Analytics · OAuth (čitanje i upravljanje)"
      status={connectionPill(connection?.status)}
    >
      {/* Šta se zaista dešava sa preuzetim podacima posle „Prekini vezu” (P3).
          Ne prikazuje ništa dok brisanja nema. */}
      <PurgeNotice provider="youtube" />
      {/* Token nosi i `youtube.force-ssl`, čime aplikacija na kanalu PIŠE.
          Kartica je do YA2 pisala „samo čitanje" — netačan opis dozvola nije
          kozmetika, nego prva stvar koju revizija uporedi sa stvarnim opsegom. */}
      <p className="mt-4 text-xs leading-relaxed text-text-muted">
        Čita statistiku kanala i video zapisa. Odgovara na komentare i moderiše
        ih. Menja naslove, opise i sličice. Šalje video zapise.
      </p>

      {isConnected && !editing ? (
        <div className="mt-5">
          <SavedCredentials
            detail={`Kredencijali sačuvani${
              connection?.externalId ? ` · kanal ${connection.externalId}` : ""
            }`}
            onEdit={startEdit}
          />
        </div>
      ) : (
        <form onSubmit={handleSave} className="mt-6">
          <FormStack>
            <FormGroup title="Kanal">
              <Field label="Channel ID" error={channelProblem} required>
                {(field) => (
                  <Input
                    {...field}
                    placeholder="npr. UCabcdefghijklmnopqrstuv"
                    value={channelId}
                    onChange={(event) => setChannelId(event.target.value)}
                    disabled={saving}
                    className="font-mono text-xs"
                    required
                  />
                )}
              </Field>
            </FormGroup>

            <FormGroup title="Pristup">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="OAuth Client ID" required>
                  {(field) => (
                    <Input
                      {...field}
                      placeholder="xxxx.apps.googleusercontent.com"
                      value={clientId}
                      onChange={(event) => setClientId(event.target.value)}
                      disabled={saving}
                      className="font-mono text-xs"
                      required
                    />
                  )}
                </Field>
                <Field label="OAuth Client Secret" required>
                  {(field) => (
                    <Input
                      {...field}
                      type="password"
                      placeholder="GOCSPX-…"
                      value={clientSecret}
                      onChange={(event) => setClientSecret(event.target.value)}
                      disabled={saving}
                      className="font-mono text-xs"
                      required
                    />
                  )}
                </Field>
              </div>

              <Field label="OAuth Refresh Token" required>
                {(field) => (
                  <Input
                    {...field}
                    type="password"
                    placeholder="1//04…"
                    value={refreshToken}
                    onChange={(event) => setRefreshToken(event.target.value)}
                    disabled={saving}
                    className="font-mono text-xs"
                    required
                  />
                )}
              </Field>
            </FormGroup>

            {error && <FeedbackNote tone="danger" title={error} />}

            <div className="flex items-center gap-3">
              <Button
                type="submit"
                size="sm"
                disabled={saving || channelProblem !== null}
              >
                {saving ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Čuvam…
                  </>
                ) : (
                  <>
                    <Check />
                    Sačuvaj
                  </>
                )}
              </Button>
              {isConnected && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(false);
                    setError(null);
                  }}
                >
                  Otkaži
                </Button>
              )}
            </div>
          </FormStack>
        </form>
      )}
      {/* Podnožje za sinhronizaciju je isto kao na ostalim karticama:
          `connections.syncNow` odavno rutira i YouTube (Y2), samo je kartica
          ostala na tekstu iz Y1 koji je obećavao da sinhronizacija tek stiže. */}
      <SyncFooter connection={connection} />
      {isConnected && (
        <DisconnectZone
          provider="youtube"
          label="YouTube kanalom"
          busy={disconnecting}
          onConfirm={handleDisconnect}
          zoneDescription="Pristup se opoziva kod Google-a, pa se brišu kredencijali i svi podaci preuzeti sa YouTube-a. Nepovratno."
          dialogDescription={
            <>
              <span className="block">
                Prekidanjem veze brišu se svi podaci preuzeti sa YouTube-a:
                statistika kanala, podaci o video zapisima, izvori saobraćaja,
                log komentara i automatizacije. Ova radnja je nepovratna.
              </span>
              <span className="mt-3 block">
                Aplikacija pri tome sama opoziva pristup kod Google-a. Brisanje
                ne teče trenutno — kartica pokazuje dokle je stiglo i javlja
                kada je gotovo.
              </span>
              <span className="mt-3 block">
                Ako opoziv ne prođe, možeš ga dovršiti i ručno, na{" "}
                <a
                  href={GOOGLE_PERMISSIONS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-accent-400 underline underline-offset-2 transition-colors hover:text-accent-300"
                >
                  myaccount.google.com/permissions
                </a>
                .
              </span>
            </>
          }
        />
      )}
    </CardShell>
  );
}

// ── page body ────────────────────────────────────────────────────────────────

export function ConnectionsSettings() {
  const connections = useQuery(api.connections.list);
  const health = useQuery(api.sync.health);

  if (connections === undefined) {
    return <ConnectionsSettingsSkeleton />;
  }

  const byProvider = new Map<ConnectionView["provider"], ConnectionView>();
  connections?.forEach((connection) =>
    byProvider.set(connection.provider, connection),
  );

  return (
    // Osam kartica u nizu: razmak računa RevealGroup tako da poslednja
    // završi unutar budžeta, umesto ručne lestvice koja ga je probijala.
    <RevealGroup className="mt-8 space-y-5">
      <Ga4Card connection={byProvider.get("ga4")} />
      {byProvider.has("ga4") && <Ga4Configuration />}
      <OpenReplyCard />
      <InstagramCard connection={byProvider.get("meta_ig")} />
      <FacebookCard connection={byProvider.get("meta_fb")} />
      <MetaAdsCard connection={byProvider.get("meta_ads")} />
      <GoogleAdsCard connection={byProvider.get("google_ads")} />
      <YouTubeCard connection={byProvider.get("youtube")} />
      <SyncSchedule connected={connections.map((c) => c.provider)} />
      <SyncHealth entries={health} />
      {/* Na dnu na namerno: rezime se čita posle kartica koje sažima. */}
      <DataAndAccess connected={connections.map((c) => c.provider)} />
    </RevealGroup>
  );
}

export function ConnectionsSettingsSkeleton() {
  return (
    <div className="mt-8 space-y-5">
      {Array.from({ length: 3 }).map((_, i) => (
        <section key={i} className="rounded-xl border bg-card p-6 shadow-card">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-lg" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <div className="mt-5">
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        </section>
      ))}
      <section className="rounded-xl border bg-card p-6 shadow-card">
        <div className="flex items-center gap-2">
          <Skeleton className="size-4" />
          <Skeleton className="h-4 w-36" />
        </div>
        <div className="mt-5 space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </section>
    </div>
  );
}
