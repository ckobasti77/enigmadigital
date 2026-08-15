"use client";

import { useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import {
  LineChart,
  MessageCircleReply,
  Camera,
  RefreshCw,
  LoaderCircle,
  Lock,
  Check,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Reveal } from "@/components/motion/reveal";
import { formatRelativeTime } from "@/lib/format";
import { StatusPill } from "./status-pill";
import { SyncHealth } from "./sync-health";

type ConnectionView = FunctionReturnType<typeof api.connections.list>[number];

/** Pull the friendly message out of a thrown ConvexError, else a fallback. */
function convexMessage(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as { message?: string } | undefined;
    if (data && typeof data.message === "string") return data.message;
  }
  return fallback;
}

function connectionPill(status: ConnectionView["status"] | undefined) {
  switch (status) {
    case "active":
      return <StatusPill tone="success">Aktivno</StatusPill>;
    case "error":
      return <StatusPill tone="danger">Greška</StatusPill>;
    case "expired":
      return <StatusPill tone="warning">Isteklo</StatusPill>;
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

/** "Sync now" footer — present on integrations that can actually be synced. */
function SyncFooter({ connection }: { connection?: ConnectionView }) {
  const syncNow = useAction(api.connections.syncNow);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    if (!connection) return;
    setSyncing(true);
    setError(null);
    try {
      await syncNow({ connectionId: connection._id });
    } catch {
      setError("Sinhronizacija nije uspela.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4">
      <span className="text-xs text-text-muted">
        {connection?.lastSyncAt
          ? `Poslednja sinhronizacija ${formatRelativeTime(connection.lastSyncAt)}`
          : "Još nije sinhronizovano"}
      </span>
      <div className="flex items-center gap-3">
        {error && <span className="text-xs text-danger">{error}</span>}
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
          Sinhronizuj
        </Button>
      </div>
    </div>
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
        <div className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-line-soft bg-surface-raised/40 px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Lock className="size-3.5" />
            <span>
              Kredencijali sačuvani
              {connection?.externalId ? ` · property ${connection.externalId}` : ""}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={startEdit}>
            Izmeni
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSave} className="mt-5 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ga4-property" className="text-text-muted">
              Property ID
            </Label>
            <Input
              id="ga4-property"
              inputMode="numeric"
              placeholder="npr. 493820114"
              value={propertyId}
              onChange={(event) => setPropertyId(event.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ga4-json" className="text-text-muted">
              Service account JSON
            </Label>
            <Textarea
              id="ga4-json"
              rows={6}
              spellCheck={false}
              placeholder='{ "type": "service_account", "project_id": "…", … }'
              value={json}
              onChange={(event) => setJson(event.target.value)}
              disabled={saving}
              className="font-mono text-xs"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={saving}>
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
        </form>
      )}
      <SyncFooter connection={connection} />
    </CardShell>
  );
}

// ── OpenReply ────────────────────────────────────────────────────────────────

function OpenReplyCard({ connection }: { connection?: ConnectionView }) {
  const save = useMutation(api.connections.save);
  const [editing, setEditing] = useState(false);
  const [dsn, setDsn] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConnected = connection !== undefined;

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await save({ provider: "openreply", secret: dsn });
      setDsn("");
      setEditing(false);
    } catch (err) {
      setError(convexMessage(err, "Čuvanje nije uspelo."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <CardShell
      icon={MessageCircleReply}
      title="OpenReply"
      subtitle="Postgres · read-only korisnik"
      status={connectionPill(connection?.status)}
    >
      {isConnected && !editing ? (
        <div className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-line-soft bg-surface-raised/40 px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Lock className="size-3.5" />
            <span>Konekcija sačuvana</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDsn("");
              setError(null);
              setEditing(true);
            }}
          >
            Izmeni
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSave} className="mt-5 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="or-dsn" className="text-text-muted">
              Connection string
            </Label>
            <Input
              id="or-dsn"
              type="password"
              autoComplete="off"
              placeholder="postgresql://cc_reader:…@host:5432/db"
              value={dsn}
              onChange={(event) => setDsn(event.target.value)}
              disabled={saving}
              className="font-mono text-xs"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={saving}>
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
                  setDsn("");
                  setError(null);
                }}
              >
                Otkaži
              </Button>
            )}
          </div>
        </form>
      )}
      <SyncFooter connection={connection} />
    </CardShell>
  );
}

// ── Instagram (placeholder, OAuth in P7) ─────────────────────────────────────

function InstagramCard() {
  return (
    <CardShell
      icon={Camera}
      title="Instagram"
      subtitle="Meta · organski insights"
      status={<StatusPill tone="muted">Uskoro</StatusPill>}
    >
      <div className="mt-5 rounded-lg border border-dashed border-line-soft bg-surface-raised/30 px-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">
          Povezaćeš kasnije preko OAuth-a.
        </p>
        <p className="mt-1 text-xs text-text-muted">
          Stiže u P7 — isti Meta app kao OpenReply.
        </p>
      </div>
    </CardShell>
  );
}

// ── page body ────────────────────────────────────────────────────────────────

export function ConnectionsSettings() {
  const connections = useQuery(api.connections.list);
  const health = useQuery(api.sync.health);

  const byProvider = new Map<ConnectionView["provider"], ConnectionView>();
  connections?.forEach((connection) =>
    byProvider.set(connection.provider, connection),
  );

  return (
    <div className="mt-8 space-y-5">
      <Reveal>
        <Ga4Card connection={byProvider.get("ga4")} />
      </Reveal>
      <Reveal delay={0.05}>
        <OpenReplyCard connection={byProvider.get("openreply")} />
      </Reveal>
      <Reveal delay={0.1}>
        <InstagramCard />
      </Reveal>
      <Reveal delay={0.15}>
        <SyncHealth entries={health} />
      </Reveal>
    </div>
  );
}
