"use client";

import {
  useState,
  useEffect,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from "react";
import { ConvexError } from "convex/values";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowDown,
  LineChart,
  MessageCircleReply,
  Camera,
  Users,
  Megaphone,
  SquarePlay,
  AtSign,
  RefreshCw,
  LoaderCircle,
  Lock,
  Check,
  ExternalLink,
  Trash2,
  Copy,
  Ellipsis,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Provider } from "@/convex/lib/providers";
import {
  useMoze,
  useProjekat,
  useProjekatAction,
  useProjekatMutation,
  useProjekatQuery,
} from "@/components/app/projekat-provider";
import { SamoZa } from "@/components/app/samo-za";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatRelativeTime } from "@/lib/format";
import { describeTokenExpiry } from "@/lib/token-expiry";
import {
  GOOGLE_PERMISSIONS_URL,
  META_BUSINESS_APPS_URL,
} from "@/lib/policy-links";
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
import { FocusCard } from "@/components/app/system/focus-card";
import { SegmentedMeter } from "@/components/app/system/progress";
import type { ModuleKey } from "@/components/app/nav-items";
import { SyncHealth } from "./sync-health";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  OZNAKA_STATUSA,
  nazivVeze,
  porukaStatusa,
  type RazlogStatusa,
} from "@/convex/lib/statusVeze";
import {
  podaciOdTekst,
  useStatusVeza,
} from "@/components/app/system/stanje-veze";
import { useNow } from "@/components/app/use-now";
import { trajanje } from "@/convex/lib/notifications";
import { SyncSchedule } from "./sync-schedule";

type ConnectionView = FunctionReturnType<typeof api.connections.list>[number];

/** Osam integracija koje ekran nudi, redom kojim su pločice poređane. */
const INTEGRATIONS: ReadonlyArray<{
  provider: ConnectionView["provider"];
  label: string;
}> = [
  { provider: "ga4", label: "GA4" },
  { provider: "openreply", label: "OpenReply" },
  { provider: "meta_ig", label: "Instagram" },
  { provider: "meta_fb", label: "Facebook" },
  { provider: "threads", label: "Threads" },
  { provider: "meta_ads", label: "Meta Ads" },
  { provider: "google_ads", label: "Google Ads" },
  { provider: "youtube", label: "YouTube" },
];

/** Meta sidra iz fokus kartice: staje ispod lepljive gornje trake. */
const SIDRO = "scroll-mt-20";

/** Pull the friendly message out of a thrown ConvexError, else a fallback. */
/**
 * Da li server ume da gradi OAuth povratnu adresu (`OAUTH_CALLBACK_ORIGIN`).
 * `true` samo kad je server sigurno rekao „ne“; dok se učitava, dugme radi
 * (greška sa servera ionako kaže šta fali).
 */
function useOAuthNijePodesen(): boolean {
  return useQuery(api.oauthPovratak.stanje)?.podeseno === false;
}

/** Isti nalog je povezan i u drugom projektu (veza je ipak upisana). */
function UpozorenjeNaloga({ tekst }: { tekst: string | null }) {
  if (tekst === null) return null;
  return <FeedbackNote tone="warning" className="mt-4" title={tekst} />;
}

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

/**
 * „Token važi do 1. 11. 2026. (za 4 dana)" / „Token je istekao 24. 10. 2026.
 * (pre 3 dana)". `formatRelativeTime` je za prošlost i budući rok čita kao
 * „upravo sada", pa rok tokena ima svoju rečenicu.
 */
function rokTokena(expiresAt: number, sada: number | null): string {
  const datum = new Date(expiresAt).toLocaleDateString("sr-RS");
  if (sada === null) return `Token važi do ${datum}`;
  return expiresAt > sada
    ? `Token važi do ${datum} (za ${trajanje(expiresAt - sada)})`
    : `Token je istekao ${datum} (pre ${trajanje(sada - expiresAt)})`;
}

/**
 * Pilula kartice: jedan status veze (P3) — „Radi", „Traži pažnju", „Nije
 * povezano" — isti koji kažu tačka u gornjoj traci, kanal i zvono. Veza u
 * prekidu je „nije povezano" uz razlog, pa pilula kaže šta se dešava.
 */
function PilulaVeze({
  provider,
  kadNijePovezano,
}: {
  provider: Provider;
  /** Šta pilula kaže kad veze nema (OpenReply: stanje motora). */
  kadNijePovezano?: ReactNode;
}) {
  const veze = useStatusVeza();
  const status = veze?.poProvajderu.get(provider);
  if (veze === undefined) return <StatusPill tone="muted">Učitavanje…</StatusPill>;
  if (status === undefined || status.vrednost === "nije_povezano") {
    if (status?.razlog === "brisanje_u_toku") {
      return (
        <StatusPill tone="warning" pulse>
          Brisanje u toku
        </StatusPill>
      );
    }
    return kadNijePovezano ?? <StatusPill tone="muted">{OZNAKA_STATUSA.nije_povezano}</StatusPill>;
  }
  return status.vrednost === "radi" ? (
    <StatusPill tone="success">{OZNAKA_STATUSA.radi}</StatusPill>
  ) : (
    <StatusPill tone="warning">{OZNAKA_STATUSA.trazi_paznju}</StatusPill>
  );
}

/** Šta da se uradi na ovoj kartici, po razlogu statusa. */
const SAVET_KARTICE: Partial<Record<RazlogStatusa, string>> = {
  token_istekao:
    "Poveži nalog ponovo na ovoj kartici; preuzeti podaci i istorija ostaju.",
  token_istice:
    "Obnovi pristup na ovoj kartici pre isteka, da sinhronizacija ne stane.",
  greska_veze:
    "Pokreni sinhronizaciju ispod. Tehnički opis greške je u stanju sinhronizacije na dnu strane.",
  pao_prolaz:
    "Pokreni sinhronizaciju ispod. Tehnički opis greške je u stanju sinhronizacije na dnu strane.",
  zastao:
    "Prolaz je zastao. Pokreni sinhronizaciju ponovo; detalji su u stanju sinhronizacije na dnu strane.",
  stari_podaci:
    "Posle poslednjeg podatka ništa novo nije stiglo. Pokreni sinhronizaciju ispod.",
  server_nije_podesen:
    "Server nema podešavanje bez kog ova veza ne radi. Uputstvo za programera je na ovoj kartici.",
};

/**
 * Razlog uz pilulu: kad veza traži pažnju, kartica kaže zašto istom
 * rečenicom kao zvono i kanal, i šta da se uradi baš ovde.
 */
function StanjeKartice({ provider }: { provider: Provider }) {
  const veze = useStatusVeza();
  const status = veze?.poProvajderu.get(provider);
  if (veze === undefined || status === undefined || status.vrednost !== "trazi_paznju") {
    return null;
  }
  const podaciOd = podaciOdTekst(status, veze.sada);
  const savet = status.razlog ? SAVET_KARTICE[status.razlog] : undefined;
  return (
    <FeedbackNote
      tone="warning"
      className="mt-5"
      title={`${porukaStatusa(status, veze.sada).recenica}${podaciOd ? ` · ${podaciOd}` : ""}`}
    >
      {savet}
    </FeedbackNote>
  );
}

// ── shared card shell ────────────────────────────────────────────────────────

/**
 * Pločica integracije. `module` pali `data-module` na samoj pločici, pa sve
 * unutar nje — ikonica, okvir fokusa, puno dugme — čita boju tog brenda kroz
 * `--mod`, istim mehanizmom kojim ekran čita boju svog modula (UI Boost §3.4).
 * Zdravlje veze nosi pilula desno; boja brenda kaže samo ČIJA je pločica.
 */
function CardShell({
  icon: Icon,
  title,
  subtitle,
  status,
  module,
  provider,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  status: ReactNode;
  module: ModuleKey;
  /** Veza čiji razlog statusa stoji ispod zaglavlja kad traži pažnju. */
  provider?: Provider;
  children: ReactNode;
}) {
  return (
    <section
      data-module={module}
      className="min-w-0 rounded-xl border bg-card p-6 shadow-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-mod-line bg-mod-soft text-mod">
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-copy font-bold text-foreground">{title}</h2>
            <p className="text-meta text-text-muted">{subtitle}</p>
          </div>
        </div>
        {status}
      </div>
      {provider && <StanjeKartice provider={provider} />}
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
  const syncNow = useProjekatAction(api.connections.syncNow);
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
        <SamoZa uloga="urednik">
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
        </SamoZa>
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
  // Kredencijale menja samo vlasnik; ostali vide samo da su sačuvani.
  const mozeVlasnik = useMoze("owner");
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line-soft bg-surface-raised/40 px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <Lock className="size-3.5 shrink-0 text-success" aria-hidden />
        <span>{detail}</span>
      </div>
      {mozeVlasnik && (
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Izmeni
        </Button>
      )}
    </div>
  );
}

/**
 * Prekid veze: stavka u meniju „⋯" na dnu kartice (P3 — više nije stalno
 * otvoren crveni blok u svakoj kartici) i potvrda koja kaže šta se gubi a šta
 * ostaje. Potvrda stoji ovde i skoro nigde drugde — kada bi je tražila svaka
 * radnja, prestala bi da se čita.
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
      <div className="mt-2 flex items-center justify-end gap-2">
        {busy || purging ? (
          <span className="inline-flex items-center gap-1.5 text-meta text-text-muted">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            {purging
              ? "Brisanje preuzetih podataka je u toku. Detalji su iznad."
              : "Prekidam vezu…"}
          </span>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Još radnji za vezu sa ${label}`}
                  className="touch-target text-text-muted hover:text-foreground"
                />
              }
            >
              <Ellipsis className="size-4" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setAsking(true)}
              >
                <Trash2 aria-hidden />
                Prekini vezu…
              </DropdownMenuItem>
              <p className="px-1.5 pb-1 pt-0.5 text-meta leading-relaxed text-text-muted">
                {zoneDescription ??
                  // Do P3 je ovde pisalo da preuzeti podaci ostaju. Pisalo je
                  // tačno — brisao se samo YouTube — ali sada se briše sve, pa
                  // bi ista rečenica bila obećanje suprotno od onoga što kod radi.
                  "Pristup se opoziva, a kredencijali i svi podaci preuzeti sa ovog servisa se brišu. Nepovratno."}
              </p>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

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
  // Veze menja samo vlasnik; ostali vide samo stanje kartice.
  const mozeVlasnik = useMoze("owner");
  const save = useProjekatMutation(api.connections.save);
  const [upozorenje, setUpozorenje] = useState<string | null>(null);
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
      const rezultat = await save({ provider: "ga4", externalId: propertyId, secret: json });
      setUpozorenje(rezultat.upozorenje);
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
      module="analitika"
      subtitle="Service account · read-only"
      status={<PilulaVeze provider="ga4" />}
      provider="ga4"
    >
      <UpozorenjeNaloga tekst={upozorenje} />
      {isConnected && !editing ? (
        <div className="mt-5">
          <SavedCredentials
            detail={`Kredencijali sačuvani${
              connection?.externalId ? ` · property ${connection.externalId}` : ""
            }`}
            onEdit={startEdit}
          />
        </div>
      ) : !mozeVlasnik ? null : (
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
                variant="secondary"
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
  // Uključivanje i gašenje engine-a sme samo vlasnik.
  const mozeVlasnik = useMoze("owner");
  const status = useProjekatQuery(api.orEngine.status);
  const enable = useProjekatMutation(api.orEngine.enable);
  const disable = useProjekatMutation(api.orEngine.disable);

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

  // Kad veza postoji, pilula je jedan status veze (P3); bez nje kaže stanje
  // motora, kao i do sada.
  const stanjeMotora =
    status === undefined ? (
      <StatusPill tone="muted">Učitavanje…</StatusPill>
    ) : status.enabled ? (
      <StatusPill tone="success">Aktivno</StatusPill>
    ) : (
      <StatusPill tone="muted">Nije uključeno</StatusPill>
    );
  const statusNode = (
    <PilulaVeze provider="openreply" kadNijePovezano={stanjeMotora} />
  );

  return (
    <CardShell
      icon={MessageCircleReply}
      title="OpenReply"
      module="openreply"
      subtitle="Komentar → DM automatizacija"
      status={statusNode}
      provider="openreply"
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
                {status.webhookUrl && mozeVlasnik && (
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
              {mozeVlasnik && (
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
              )}
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="rounded-lg border border-line-soft bg-surface-raised/20 p-4 text-xs text-text-muted">
                <p>
                  Uključi engine da bi komentari na Instagram objavama automatski
                  slali DM.
                </p>
              </div>
              {mozeVlasnik && (
                <Button
                  variant="secondary"
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
              )}
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
                  <code className="font-mono font-medium text-mod">
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
  // Povezivanje sme samo vlasnik; ostali vide samo stanje veze.
  const mozeVlasnik = useMoze("owner");
  const { spreman } = useProjekat();
  const getOAuthConfig = useProjekatAction(api.instagram.getOAuthConfig);
  const getOAuthUrl = useProjekatAction(api.instagram.getOAuthUrl);
  const oauthNijePodesen = useOAuthNijePodesen();
  const removeConnection = useProjekatMutation(api.connections.remove);

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
  const sada = useNow();

  // Check env configuration on mount (once the project is known)
  useEffect(() => {
    if (!spreman || !mozeVlasnik) return;
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
  }, [spreman, mozeVlasnik, getOAuthConfig]);

  // Handle the OAuth callback result in URL parameters. Waits for the project
  // so the message lands on the right card.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!spreman) return;

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

    // Kod parkiran pre prijave (OAuthCodeCatcher, ekran prijave) se samo
    // uklanja: kod bez jednokratnog stanja ovog toka se ne razmenjuje.
    try {
      if (window.localStorage.getItem("ig_oauth_code")) {
        window.localStorage.removeItem("ig_oauth_code");
        if (!code) code = "parkiran";
      }
    } catch {
      // storage unavailable — nothing parked
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

    // Kod bez stanja (C19): pravi tok uvek nosi `state` i povratna ruta ga
    // razmenjuje sama, pa se ovde ništa ne povezuje. Inače bi podmetnut link
    // sa tuđim kodom povezao tuđ nalog u ovaj projekat.
    setTimeout(() => {
      setError(
        "Povezivanje nije završeno: nedostaje potvrda toka. Pokreni ga ponovo dugmetom „Poveži“.",
      );
    }, 0);
  }, [spreman]);

  async function handleStartConnect() {
    setError(null);
    setSuccessMessage(null);
    setConnecting(true);
    try {
      const { url } = await getOAuthUrl({ povratakOrigin: window.location.origin });
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


  return (
    <CardShell
      icon={Camera}
      title="Instagram"
      module="instagram"
      subtitle="Meta · organski insights"
      status={<PilulaVeze provider="meta_ig" />}
      provider="meta_ig"
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
          <code className="font-mono text-mod">INSTAGRAM_APP_ID</code> i{" "}
          <code className="font-mono text-mod">INSTAGRAM_APP_SECRET</code>{" "}
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
      {(configState.isConfigured || !mozeVlasnik) && isConnected && !connecting && (
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
                  {rokTokena(connection.expiresAt, sada)}
                </p>
              )}
            </div>
            {mozeVlasnik && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleStartConnect}
                disabled={connecting || disconnecting || oauthNijePodesen}
              >
                Ponovo poveži
              </Button>
            )}
          </div>

          {/* Token koji ističe za 7 dana ili manje javlja jedan status veze, u
              razlogu ispod zaglavlja kartice (P3) — isti rok kao zvono. */}
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
          {mozeVlasnik && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleStartConnect}
              disabled={connecting || oauthNijePodesen}
            >
              {connecting ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <ExternalLink />
              )}
              Poveži Instagram
            </Button>
          )}
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
                <code className="font-mono text-mod">{scope}</code>
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
            <code className="font-mono text-mod">feed</code> i{" "}
            <code className="font-mono text-mod">messages</code>.
            Callback URL je isti kao za Instagram, ali sa putanjom{" "}
            <code className="font-mono text-mod">/facebook/webhook</code>
            .
          </span>
        </li>

        <li className="flex gap-2">
          <span className="font-mono text-text-secondary">3.</span>
          <span>
            Verify token je isti{" "}
            <code className="font-mono text-mod">
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
            <code className="font-mono text-mod">FACEBOOK_APP_ID</code> i{" "}
            <code className="font-mono text-mod">FACEBOOK_APP_SECRET</code>
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
  const { spreman } = useProjekat();
  const listPages = useProjekatAction(api.facebook.listPages);
  const selectPage = useProjekatAction(api.facebook.selectPage);

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
    if (!open || !spreman) return;
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
  }, [open, spreman, listPages]);

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
  // Povezivanje, osvežavanje tokena i izbor stranice sme samo vlasnik.
  const mozeVlasnik = useMoze("owner");
  const setup = useProjekatQuery(api.facebookStore.setupInfo);
  const getOAuthUrl = useProjekatAction(api.facebook.getOAuthUrl);
  const oauthNijePodesen = useOAuthNijePodesen();
  const refreshToken = useProjekatAction(api.facebook.refreshTokenNow);
  const connectSystemUser = useProjekatAction(
    api.facebook.connectWithSystemUserToken,
  );
  const removeConnection = useProjekatMutation(api.connections.remove);
  const pageInfo = useProjekatQuery(api.facebookStore.pageInfo);

  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [autoOpenPicker, setAutoOpenPicker] = useState(false);

  // Way in: "oauth" is Facebook Login (the incumbent), "system_user" is the
  // pasted non-expiring System User token. `editingAccess` reveals the connect
  // controls again for an already-connected Page — e.g. to move it onto the
  // System User token.
  const isSystemUser = connection?.authMode === "system_user";
  const [mode, setMode] = useState<"oauth" | "system_user">("oauth");
  const [editingAccess, setEditingAccess] = useState(false);
  const [suPageId, setSuPageId] = useState("");
  const [suToken, setSuToken] = useState("");
  const [savingSu, setSavingSu] = useState(false);

  const suPageIdProblem =
    suPageId.trim().length > 0 && !/^\d+$/.test(suPageId.trim())
      ? "Page ID mora biti broj (npr. 1234567890)."
      : null;

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
      const { url } = await getOAuthUrl({ povratakOrigin: window.location.origin });
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

  async function handleConnectSystemUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingSu(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await connectSystemUser({
        systemUserToken: suToken.trim(),
        pageId: suPageId.trim(),
      });
      setSuccessMessage(
        res.pageName
          ? `Facebook stranica „${res.pageName}” je povezana (System User token).`
          : "Facebook stranica je povezana (System User token).",
      );
      setSuToken("");
      setEditingAccess(false);
    } catch (err) {
      setError(
        convexMessage(err, "Povezivanje System User tokenom nije uspelo."),
      );
    } finally {
      setSavingSu(false);
    }
  }

  /** Open the connect controls for an already-connected Page, prefilled. */
  function startEditAccess() {
    setMode(isSystemUser ? "system_user" : "oauth");
    setSuPageId(connection?.externalId ?? "");
    setSuToken("");
    setError(null);
    setSuccessMessage(null);
    setEditingAccess(true);
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


  const missingVars: string[] = [];
  if (setup && !setup.verifyTokenSet) missingVars.push("IG_WEBHOOK_VERIFY_TOKEN");
  if (setup && !setup.appSecretSet) missingVars.push("FACEBOOK_APP_SECRET");

  return (
    <CardShell
      icon={Users}
      title="Facebook stranica"
      module="facebook"
      subtitle="Meta · objave, komentari i DM automatizacija"
      status={<PilulaVeze provider="meta_fb" />}
      provider="meta_fb"
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
                  {isSystemUser ? " · System User token" : ""}
                </p>
                <p className="text-micro text-text-muted">
                  {(() => {
                    const expiry = describeTokenExpiry(
                      connection.expiresAt,
                      now,
                    );
                    return expiry.kind === "never"
                      ? expiry.neverText
                      : rokTokena(connection.expiresAt as number, now);
                  })()}
                </p>
              </div>
              {mozeVlasnik && (
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {/* Osvežavanje re-kuje Page token iz korisničkog tokena — a
                      System User token nema šta da osveži i ne ističe. */}
                  {!isSystemUser && (
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
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={startEditAccess}
                    disabled={connecting || disconnecting || savingSu}
                  >
                    Izmeni pristup
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Izbor druge stranice ide preko /me/accounts, što traži korisnički
              token — nedostupno kad je veza na System User tokenu. */}
          {mozeVlasnik && isConnected && !isSystemUser && connection.externalId && (
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

          {/* Pristup koji ističe za 7 dana ili manje javlja jedan status veze,
              u razlogu ispod zaglavlja kartice (P3). System User token ne ističe. */}

          {/* Connect / edit panel: for a fresh Page, or when the operator opens
              „Izmeni pristup” to switch an existing one (e.g. onto System User). */}
          {mozeVlasnik && (!isConnected || editingAccess) && (
            <div className="space-y-4">
              <div className="inline-flex rounded-lg border border-line-soft bg-surface-raised/30 p-0.5">
                <button
                  type="button"
                  onClick={() => setMode("oauth")}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    mode === "oauth"
                      ? "bg-surface-raised text-foreground shadow-card"
                      : "text-text-muted hover:text-foreground"
                  }`}
                >
                  Facebook prijava
                </button>
                <button
                  type="button"
                  onClick={() => setMode("system_user")}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    mode === "system_user"
                      ? "bg-surface-raised text-foreground shadow-card"
                      : "text-text-muted hover:text-foreground"
                  }`}
                >
                  System User token
                </button>
              </div>

              {mode === "oauth" ? (
                <>
                  <FacebookSetupSteps webhookUrl={setup.webhookUrl} />

                  {!setup.appConfigured && (
                    <FeedbackNote
                      tone="warning"
                      title="Čeka se konfiguracija Meta aplikacije"
                    >
                      Bez{" "}
                      <code className="font-mono text-mod">
                        FACEBOOK_APP_ID
                      </code>{" "}
                      i{" "}
                      <code className="font-mono text-mod">
                        FACEBOOK_APP_SECRET
                      </code>{" "}
                      dugme ispod nema čime da pokrene prijavu.
                    </FeedbackNote>
                  )}

                  <div className="flex items-center gap-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleStartConnect}
                      disabled={connecting || !setup.appConfigured || oauthNijePodesen}
                    >
                      {connecting ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <ExternalLink />
                      )}
                      {isConnected
                        ? "Ponovo poveži"
                        : "Poveži Facebook stranicu"}
                    </Button>
                    {editingAccess && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingAccess(false)}
                      >
                        Otkaži
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <form onSubmit={handleConnectSystemUser}>
                  <FormStack>
                    <p className="rounded-lg border border-line-soft bg-surface-raised/20 p-4 text-xs leading-relaxed text-text-muted">
                      System User token ne ističe. U Meta Business Settings dodeli
                      ovu stranicu system useru (Assets → Pages), zatim nalepi
                      token i Page ID ispod. Aplikacija iz njih iskuje neistekući
                      Page token — bez ponovne prijave svakih 60 dana.
                    </p>
                    <FormGroup title="Stranica">
                      <Field
                        label="Page ID"
                        error={suPageIdProblem}
                        hint="Numerički ID stranice (Meta → About → Page ID)."
                        required
                      >
                        {(field) => (
                          <Input
                            {...field}
                            inputMode="numeric"
                            placeholder="npr. 1234567890"
                            value={suPageId}
                            onChange={(event) =>
                              setSuPageId(event.target.value)
                            }
                            disabled={savingSu}
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
                            value={suToken}
                            onChange={(event) => setSuToken(event.target.value)}
                            disabled={savingSu}
                            className="font-mono text-xs"
                          />
                        )}
                      </Field>
                    </FormGroup>

                    <div className="flex items-center gap-3">
                      <Button
                        variant="secondary"
                        type="submit"
                        size="sm"
                        disabled={
                          savingSu ||
                          suToken.trim().length === 0 ||
                          suPageId.trim().length === 0 ||
                          suPageIdProblem !== null
                        }
                      >
                        {savingSu ? (
                          <>
                            <LoaderCircle className="animate-spin" />
                            Povezujem…
                          </>
                        ) : (
                          <>
                            <Check />
                            {isConnected ? "Sačuvaj" : "Poveži stranicu"}
                          </>
                        )}
                      </Button>
                      {editingAccess && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingAccess(false);
                            setSuToken("");
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
            </div>
          )}

          {missingVars.length > 0 && (
            <FeedbackNote
              tone="warning"
              title="Nedostaje Convex environment promenljiva"
            >
              {missingVars.map((varName, i) => (
                <span key={varName}>
                  {i > 0 && " i "}
                  <code className="font-mono font-medium text-mod">
                    {varName}
                  </code>
                </span>
              ))}
              . Bez nje webhook odbija dolazne pozive.
            </FeedbackNote>
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
  // Veze menja samo vlasnik; ostali vide samo stanje kartice.
  const mozeVlasnik = useMoze("owner");
  const save = useProjekatMutation(api.connections.save);
  const [upozorenje, setUpozorenje] = useState<string | null>(null);
  const remove = useProjekatMutation(api.connections.remove);
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
      const rezultat = await save({
        provider: "meta_ads",
        externalId: accountId.trim() || undefined,
        secret: token.trim(),
      });
      setUpozorenje(rezultat.upozorenje);
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


  return (
    <CardShell
      icon={Megaphone}
      title="Meta Ads"
      module="oglasi"
      subtitle="Marketing API · System User token"
      status={
        <PilulaVeze
          provider="meta_ads"
          kadNijePovezano={<StatusPill tone="warning">Čeka System User token</StatusPill>}
        />
      }
      provider="meta_ads"
    >
      {/* Šta se zaista dešava sa preuzetim podacima posle „Prekini vezu” (P3).
          Ne prikazuje ništa dok brisanja nema. */}
      <PurgeNotice provider="meta_ads" />
      <UpozorenjeNaloga tekst={upozorenje} />
      {isConnected && !editing ? (
        <div className="mt-5">
          <SavedCredentials
            detail={`Kredencijali sačuvani${
              connection?.externalId ? ` · nalog ${connection.externalId}` : ""
            } · token ne ističe`}
            onEdit={startEdit}
          />
        </div>
      ) : !mozeVlasnik ? null : (
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
                variant="secondary"
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
  // Veze menja samo vlasnik; ostali vide samo stanje kartice.
  const mozeVlasnik = useMoze("owner");
  const save = useProjekatMutation(api.connections.save);
  const [upozorenje, setUpozorenje] = useState<string | null>(null);
  const remove = useProjekatMutation(api.connections.remove);
  const [editing, setEditing] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [loginCustomerId, setLoginCustomerId] = useState("");
  const [json, setJson] = useState("");
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConnected = connection !== undefined;

  const customerProblem =
    customerId.trim().length === 0
      ? null
      : customerIdProblem(customerId);
  const managerProblem = customerIdProblem(loginCustomerId);
  const jsonProblem = serviceAccountProblem(json);

  const canSave =
    customerId.trim().length > 0 &&
    json.trim().length > 0 &&
    customerProblem === null &&
    managerProblem === null &&
    jsonProblem === null;

  function startEdit() {
    setCustomerId(connection?.externalId ?? "");
    setLoginCustomerId(connection?.externalIdAlt ?? "");
    setJson("");
    setError(null);
    setEditing(true);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const rezultat = await save({
        provider: "google_ads",
        externalId: customerId.trim().replace(/-/g, ""),
        externalIdAlt: loginCustomerId.trim().replace(/-/g, "") || undefined,
        secret: json,
      });
      setUpozorenje(rezultat.upozorenje);

      setJson("");
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

  return (
    <CardShell
      icon={Megaphone}
      title="Google Ads"
      module="oglasi"
      subtitle="Service account · Google Ads API (GAQL)"
      status={<PilulaVeze provider="google_ads" />}
      provider="google_ads"
    >
      {/* Šta se zaista dešava sa preuzetim podacima posle „Prekini vezu” (P3).
          Ne prikazuje ništa dok brisanja nema. */}
      <PurgeNotice provider="google_ads" />
      <UpozorenjeNaloga tekst={upozorenje} />
      {isConnected && !editing ? (
        <div className="mt-5">
          <SavedCredentials
            detail={`Kredencijali sačuvani${
              connection?.externalId ? ` · nalog ${connection.externalId}` : ""
            }${
              connection?.externalIdAlt ? ` · MCC ${connection.externalIdAlt}` : ""
            }`}
            onEdit={startEdit}
          />
        </div>
      ) : !mozeVlasnik ? null : (
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
                  hint="Samo ako nalogom upravlja MCC (opciono)."
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

            <FormGroup title="Servisni nalog">
              <Field
                label="JSON ključ servisnog naloga"
                error={jsonProblem}
                hint="Nalepiti ceo JSON sadržaj preuzet iz Google Cloud Console (IAM)."
                required
              >
                {(field) => (
                  <Textarea
                    {...field}
                    rows={6}
                    placeholder='{"type": "service_account", "project_id": "...", ...}'
                    value={json}
                    onChange={(event) => setJson(event.target.value)}
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
                variant="secondary"
                type="submit"
                size="sm"
                disabled={saving || !canSave}
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
  // Povezivanje i ručni kredencijali sme samo vlasnik.
  const mozeVlasnik = useMoze("owner");
  const save = useProjekatMutation(api.connections.save);
  const remove = useProjekatMutation(api.connections.remove);
  const setup = useProjekatQuery(api.youtubeStore.setupInfo);
  const getOAuthUrl = useProjekatAction(api.youtube.youtubeAuthorizeUrl);
  const oauthNijePodesen = useOAuthNijePodesen();

  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [channelId, setChannelId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [upozorenje, setUpozorenje] = useState<string | null>(null);

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

  // Handle incoming OAuth callback status in URL parameters
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("yt_connected");
    const channel = params.get("yt_channel");
    const err = params.get("yt_error");
    const drugde = params.get("yt_upozorenje");

    if (!connected && !err) return;

    window.history.replaceState({}, "", window.location.pathname);

    setTimeout(() => {
      if (err) {
        setError(err);
        return;
      }
      setUpozorenje(drugde);
      setSuccessMessage(
        channel
          ? `YouTube kanal „${channel}” je uspešno povezan!`
          : "YouTube kanal je uspešno povezan!",
      );
    }, 0);
  }, []);

  async function handleStartConnect() {
    setError(null);
    setSuccessMessage(null);
    setConnecting(true);
    try {
      const { url } = await getOAuthUrl({ povratakOrigin: window.location.origin });
      window.location.href = url;
    } catch (err) {
      setError(convexMessage(err, "Pokretanje Google autorizacije nije uspelo."));
      setConnecting(false);
    }
  }

  function startEdit() {
    setChannelId(connection?.externalId ?? "");
    setClientId("");
    setClientSecret("");
    setRefreshToken("");
    setError(null);
    setEditing(true);
    setShowAdvanced(true);
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

      const rezultat = await save({
        provider: "youtube",
        externalId: trimmedChannelId || undefined,
        secret: JSON.stringify(payload),
      });
      setUpozorenje(rezultat.upozorenje);

      setClientId("");
      setClientSecret("");
      setRefreshToken("");
      setEditing(false);
      setSuccessMessage("YouTube kredencijali su uspešno sačuvani.");
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
      setSuccessMessage("Veza sa YouTube kanalom je prekinuta.");
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
      module="youtube"
      subtitle="YouTube Data API i Analytics · OAuth (čitanje i upravljanje)"
      status={<PilulaVeze provider="youtube" />}
      provider="youtube"
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

      {setup === undefined ? (
        <div className="mt-5">
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {successMessage && <FeedbackNote tone="success" title={successMessage} />}
          {upozorenje && <FeedbackNote tone="warning" title={upozorenje} />}
          {error && <FeedbackNote tone="danger" title={error} />}

          {isConnected ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line-soft bg-surface-raised/40 px-4 py-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-foreground">
                    <Lock className="size-3.5 shrink-0 text-success" aria-hidden />
                    <span className="truncate font-medium">
                      {connection.accountHandle ?? connection.externalId ?? "YouTube kanal povezan"}
                    </span>
                  </div>
                  {connection.accountHandle && connection.externalId && (
                    <p className="font-mono text-[11px] text-text-muted">
                      ID kanala: {connection.externalId}
                    </p>
                  )}
                </div>
              </div>

              {connection.status === "error" && (
                <div className="space-y-3 rounded-lg border border-danger/30 bg-danger/5 p-4">
                  <FeedbackNote
                    tone="danger"
                    title="Veza sa YouTube kanalom je prekinuta ili je token istekao."
                  >
                    Potrebno je ponovo autorizovati pristup kanalu kako bi se nastavila sinhronizacija i upravljanje.
                  </FeedbackNote>
                  {mozeVlasnik && (
                    <Button
                      variant="secondary"
                      type="button"
                      size="sm"
                      onClick={handleStartConnect}
                      disabled={connecting || !setup.isConfigured || oauthNijePodesen}
                    >
                      {connecting ? (
                        <>
                          <LoaderCircle className="animate-spin" />
                          Preusmeravam…
                        </>
                      ) : (
                        <>
                          <RefreshCw />
                          Poveži ponovo
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}

              {mozeVlasnik && (
                <div className="rounded-lg border border-line-soft bg-surface-raised/20 p-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdvanced((prev) => !prev);
                      if (editing) setEditing(false);
                    }}
                    className="flex w-full items-center justify-between text-left text-xs font-medium text-text-muted hover:text-foreground transition-colors"
                  >
                    <span>Napredno: Ručno podešavanje kredencijala</span>
                    <span className="text-[11px] font-normal text-text-subtle">
                      {showAdvanced || editing ? "Sakrij" : "Prikaži"}
                    </span>
                  </button>

                  {(showAdvanced || editing) && (
                    <div className="mt-3 space-y-3">
                      <p className="text-xs text-text-muted">
                        Preporučujemo automatsko povezivanje Google OAuth putem. Ručni unos koristite samo ukoliko koristite prilagođeni GCP projekat.
                      </p>
                      {!editing ? (
                        <SavedCredentials
                          detail={`Kredencijali sačuvani${
                            connection.externalId ? ` · kanal ${connection.externalId}` : ""
                          }`}
                          onEdit={startEdit}
                        />
                      ) : (
                        <form onSubmit={handleSave} className="mt-4">
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

                            <div className="flex items-center gap-3">
                              <Button
                                variant="secondary"
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
                            </div>
                          </FormStack>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : mozeVlasnik ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line-soft bg-surface-raised/40 p-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-foreground">
                    Google OAuth autorizacija
                  </p>
                  <p className="text-xs text-text-muted">
                    Povežite YouTube kanal putem zvaničnog Google OAuth dijaloga.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  type="button"
                  size="sm"
                  onClick={handleStartConnect}
                  disabled={connecting || !setup.isConfigured || oauthNijePodesen}
                >
                  {connecting ? (
                    <>
                      <LoaderCircle className="animate-spin" />
                      Preusmeravam…
                    </>
                  ) : (
                    <>
                      <SquarePlay />
                      Poveži YouTube
                    </>
                  )}
                </Button>
              </div>

              <div className="rounded-lg border border-line-soft bg-surface-raised/20 p-4">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((prev) => !prev)}
                  className="flex w-full items-center justify-between text-left text-xs font-medium text-text-muted hover:text-foreground transition-colors"
                >
                  <span>Napredno: Ručni unos OAuth kredencijala</span>
                  <span className="text-[11px] font-normal text-text-subtle">
                    {showAdvanced ? "Sakrij" : "Prikaži"}
                  </span>
                </button>

                {showAdvanced && (
                  <div className="mt-3 space-y-3">
                    <p className="text-xs text-text-muted">
                      Preporučujemo automatsko povezivanje dugmetom iznad. Ručni unos koristite samo ukoliko posedujete prilagođenu GCP aplikaciju sa sopstvenim klijentskim parametrima.
                    </p>
                    <form onSubmit={handleSave} className="mt-4">
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

                        <div className="flex items-center gap-3">
                          <Button
                            variant="secondary"
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
                        </div>
                      </FormStack>
                    </form>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
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
                  className="font-medium text-mod underline underline-offset-2 transition-colors hover:text-mod"
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

// ── Threads (OAuth) ──────────────────────────────────────────────────────────

function ThreadsCard({ connection }: { connection?: ConnectionView }) {
  // Povezivanje sme samo vlasnik; ostali vide samo stanje veze.
  const mozeVlasnik = useMoze("owner");
  const remove = useProjekatMutation(api.connections.remove);
  const setup = useProjekatQuery(api.threadsStore.setupInfo);
  const getOAuthUrl = useProjekatAction(api.threads.threadsAuthorizeUrl);
  const oauthNijePodesen = useOAuthNijePodesen();

  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isConnected = connection !== undefined;

  // Handle incoming OAuth callback status in URL parameters
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("threads_connected");
    const account = params.get("threads_account");
    const err = params.get("threads_error");

    if (!connected && !err) return;

    window.history.replaceState({}, "", window.location.pathname);

    setTimeout(() => {
      if (err) {
        setError(err);
        return;
      }
      setSuccessMessage(
        account
          ? `Threads nalog „${account.startsWith("@") ? account : `@${account}`}” je uspešno povezan!`
          : "Threads nalog je uspešno povezan!",
      );
    }, 0);
  }, []);

  async function handleStartConnect() {
    setError(null);
    setSuccessMessage(null);
    setConnecting(true);
    try {
      const { url } = await getOAuthUrl({ povratakOrigin: window.location.origin });
      window.location.href = url;
    } catch (err) {
      setError(convexMessage(err, "Pokretanje Threads autorizacije nije uspelo."));
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!connection) return;
    setDisconnecting(true);
    setError(null);
    try {
      await remove({ connectionId: connection._id });
      setSuccessMessage("Veza sa Threads nalogom je prekinuta.");
    } catch (err) {
      setError(convexMessage(err, "Prekidanje veze nije uspelo."));
    } finally {
      setDisconnecting(false);
    }
  }


  return (
    <CardShell
      icon={AtSign}
      title="Threads"
      module="threads"
      subtitle="Threads API · OAuth (statistika profila, uvidi i odgovori)"
      status={<PilulaVeze provider="threads" />}
      provider="threads"
    >
      {/* Šta se dešava sa preuzetim podacima posle „Prekini vezu”. Ne prikazuje ništa dok brisanja nema. */}
      <PurgeNotice provider="threads" />
      <p className="mt-4 text-xs leading-relaxed text-text-muted">
        Čita statistiku profila i objava (prikazi, lajkovi, odgovori, deljenja) i odgovore koje obrađuju automatizacije.
      </p>

      {setup === undefined ? (
        <div className="mt-5">
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {successMessage && <FeedbackNote tone="success" title={successMessage} />}
          {error && <FeedbackNote tone="danger" title={error} />}

          {isConnected ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line-soft bg-surface-raised/40 px-4 py-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-foreground">
                    <Lock className="size-3.5 shrink-0 text-success" aria-hidden />
                    <span className="truncate font-medium">
                      {connection.accountHandle
                        ? (connection.accountHandle.startsWith("@")
                            ? connection.accountHandle
                            : `@${connection.accountHandle}`)
                        : (connection.externalId
                            ? `ID naloga: ${connection.externalId}`
                            : "Threads nalog povezan")}
                    </span>
                  </div>
                  {connection.accountHandle && connection.externalId && (
                    <p className="font-mono text-[11px] text-text-muted">
                      ID naloga: {connection.externalId}
                    </p>
                  )}
                </div>
              </div>

              {(connection.status === "error" || connection.status === "expired") && (
                <div className="space-y-3 rounded-lg border border-danger/30 bg-danger/5 p-4">
                  <FeedbackNote
                    tone="danger"
                    title={
                      connection.status === "expired"
                        ? "Pristup Threads nalogu je istekao."
                        : "Veza sa Threads nalogom je prekinuta ili je token istekao."
                    }
                  >
                    Potrebno je ponovo autorizovati pristup nalogu kako bi se nastavila sinhronizacija i upravljanje.
                  </FeedbackNote>
                  {mozeVlasnik && (
                    <Button
                      variant="secondary"
                      type="button"
                      size="sm"
                      onClick={handleStartConnect}
                      disabled={connecting || !setup.isConfigured || oauthNijePodesen}
                    >
                      {connecting ? (
                        <>
                          <LoaderCircle className="animate-spin" />
                          Preusmeravam…
                        </>
                      ) : (
                        <>
                          <RefreshCw />
                          Poveži ponovo
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}
            </>
          ) : mozeVlasnik ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line-soft bg-surface-raised/40 p-4">
              <div className="space-y-1">
                <p className="text-xs font-medium text-foreground">
                  Threads OAuth autorizacija
                </p>
                <p className="text-xs text-text-muted">
                  Povežite Threads nalog putem zvaničnog Meta OAuth dijaloga.
                </p>
              </div>
              <Button
                variant="secondary"
                type="button"
                size="sm"
                onClick={handleStartConnect}
                disabled={connecting || !setup.isConfigured || oauthNijePodesen}
              >
                {connecting ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Preusmeravam…
                  </>
                ) : (
                  <>
                    <AtSign />
                    Poveži Threads
                  </>
                )}
              </Button>
            </div>
          ) : null}
        </div>
      )}

      <SyncFooter connection={connection} />
      {isConnected && (
        <DisconnectZone
          provider="threads"
          label="Threads nalogom"
          busy={disconnecting}
          onConfirm={handleDisconnect}
          zoneDescription="Pristup se opoziva kod Meta servisa, pa se brišu kredencijali i svi podaci preuzeti sa Threads-a. Nepovratno."
          dialogDescription={
            <>
              <span className="block">
                Prekidanjem veze brišu se svi podaci preuzeti sa Threads-a:
                statistika profila, objava, uvidi i odgovori koje obrađuju automatizacije.
                Ova radnja je nepovratna.
              </span>
              <span className="mt-3 block">
                Aplikacija pri tome sama opoziva pristup kod Meta servisa. Brisanje
                ne teče trenutno — kartica pokazuje dokle je stiglo i javlja
                kada je gotovo.
              </span>
              <span className="mt-3 block">
                Ako opoziv ne prođe, možeš ga dovršiti i ručno, na{" "}
                <a
                  href={META_BUSINESS_APPS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-mod underline underline-offset-2 transition-colors hover:text-mod"
                >
                  facebook.com/settings → Business integrations
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
  const connections = useProjekatQuery(api.connections.list);
  const health = useProjekatQuery(api.sync.health);
  const oauthNijePodesen = useOAuthNijePodesen();
  // Veze menja samo vlasnik; urednik vidi stanje i sme da sinhronizuje.
  const mozeVlasnik = useMoze("owner");
  const mozeUrednik = useMoze("urednik");

  const veze = useStatusVeza();

  if (connections === undefined || veze === undefined) {
    return <ConnectionsSettingsSkeleton />;
  }

  const byProvider = new Map<ConnectionView["provider"], ConnectionView>();
  connections?.forEach((connection) =>
    byProvider.set(connection.provider, connection),
  );

  // Jedan status veze (P3): isti broj kao tačka u gornjoj traci i zvono.
  const { zbir, sada } = veze;
  const segments = INTEGRATIONS.map(({ provider, label }) => {
    const status = veze.poProvajderu.get(provider);
    return {
      label,
      done: status?.vrednost === "radi",
      hint:
        status === undefined
          ? `${label}: ${OZNAKA_STATUSA.nije_povezano.toLowerCase()}.`
          : status.vrednost === "radi"
            ? `${label}: radi.`
            : `${porukaStatusa(status, sada).recenica}.`,
    };
  });
  const nazivZa = (provider: Provider) =>
    INTEGRATIONS.find((i) => i.provider === provider)?.label ?? nazivVeze(provider);

  // Jedno dugme fokusa: prva veza koja traži pažnju, pa prva koja još nije
  // povezana; kad sve rade, vodi na stanje sinhronizacije. Sve tri mete su na
  // ovoj strani, pa je dugme sidro, ne nova radnja.
  const sledece = zbir.prvaPaznja
    ? { href: `#integracija-${zbir.prvaPaznja}`, label: `Reši: ${nazivZa(zbir.prvaPaznja)}` }
    : zbir.prvaNepovezana
      ? { href: `#integracija-${zbir.prvaNepovezana}`, label: `Poveži ${nazivZa(zbir.prvaNepovezana)}` }
      : { href: "#stanje-sinhronizacije", label: "Stanje sinhronizacije" };

  const zbirRecenica = [
    zbir.traziPaznju > 0 ? `${zbir.traziPaznju} traži pažnju` : null,
    zbir.nijePovezano > 0 ? `${zbir.nijePovezano} nije povezano` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mt-6 flex flex-col gap-5">
      {oauthNijePodesen && (
        <FeedbackNote tone="warning" title="Povezivanje kanala nije podešeno na serveru.">
          Instagram, Facebook, Threads i YouTube se ne mogu povezati dok se u Convex
          okruženju ne postavi OAUTH_CALLBACK_ORIGIN. Postojeće veze i dalje rade.
        </FeedbackNote>
      )}
      {/* Fokus: koliko je izvora povezano, i koji traže pažnju. */}
      <div>
        <FocusCard
          eyebrow="Integracije"
          action={
            mozeVlasnik ? (
              <Button
                variant="primary"
                render={<a href={sledece.href} />}
                nativeButton={false}
              >
                {sledece.label}
                <ArrowDown data-icon="inline-end" aria-hidden />
              </Button>
            ) : undefined
          }
          aside={
            <SegmentedMeter
              label="Radi"
              segments={segments}
              className="w-full md:w-[28rem]"
            />
          }
        >
          <p className="text-hero font-bold leading-none tabular-nums text-foreground">
            {zbir.radi}
            <span className="font-sans text-title font-medium text-text-muted"> radi</span>
          </p>
          <p
            className={
              zbir.traziPaznju > 0 ? "text-ui text-warning" : "text-ui text-text-muted"
            }
          >
            {zbirRecenica.length > 0 ? zbirRecenica : "Sve veze rade."}
          </p>
        </FocusCard>
      </div>

      {/* Pločice teku u dve kolone koje pregledač sam ujednači po visini:
          kartice su vrlo različite dužine, pa bi mreža ostavljala rupe. */}
      <div className="gap-5 xl:columns-2 [&>*]:break-inside-avoid [&>*:not(:last-child)]:mb-5">
      {/* `id` je meta dugmeta u fokus kartici; `scroll-mt` je drži ispod
          gornje trake. */}
      <div id="integracija-ga4" className={SIDRO}>
        <Ga4Card connection={byProvider.get("ga4")} />
      </div>
      {byProvider.has("ga4") && mozeUrednik && <Ga4Configuration />}
      <div id="integracija-openreply" className={SIDRO}>
        <OpenReplyCard />
      </div>
      <div id="integracija-meta_ig" className={SIDRO}>
        <InstagramCard connection={byProvider.get("meta_ig")} />
      </div>
      <div id="integracija-meta_fb" className={SIDRO}>
        <FacebookCard connection={byProvider.get("meta_fb")} />
      </div>
      <div id="integracija-threads" className={SIDRO}>
        <ThreadsCard connection={byProvider.get("threads")} />
      </div>
      <div id="integracija-meta_ads" className={SIDRO}>
        <MetaAdsCard connection={byProvider.get("meta_ads")} />
      </div>
      <div id="integracija-google_ads" className={SIDRO}>
        <GoogleAdsCard connection={byProvider.get("google_ads")} />
      </div>
      <div id="integracija-youtube" className={SIDRO}>
        <YouTubeCard connection={byProvider.get("youtube")} />
      </div>
      </div>
      <SyncSchedule connected={connections.map((c) => c.provider)} />
      <div id="stanje-sinhronizacije" className={SIDRO}>
        <SyncHealth entries={health} />
      </div>
      {/* Na dnu na namerno: rezime se čita posle kartica koje sažima. */}
      <DataAndAccess connected={connections.map((c) => c.provider)} />
    </div>
  );
}

export function ConnectionsSettingsSkeleton() {
  return (
    <div className="mt-6 space-y-5">
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
