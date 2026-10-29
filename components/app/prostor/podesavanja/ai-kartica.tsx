"use client";

import { useState, type FormEvent } from "react";
import {
  Bot,
  LoaderCircle,
  Lock,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import type { FunctionReturnType } from "convex/server";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRelativeTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { SamoZa } from "@/components/app/samo-za";
import {
  useProjekat,
  useProjekatMutation,
} from "@/components/app/projekat-provider";
import { useProjekatQueryResult } from "@/components/app/prostor/podaci/projekat";
import {
  SettingsListError,
  SettingsListSkeleton,
} from "@/components/app/prostor/podesavanja/liste";
import { useRadnja } from "@/components/app/prostor/podesavanja/use-radnja";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { toast } from "@/lib/toast";

type Provajder = FunctionReturnType<
  typeof api.prostor.aiProviders.list
>[number];

const NEPRISTUPNO = (
  <EmptyState
    size="section"
    icon={Lock}
    title="AI provajdere podešava vlasnik projekta koji je ujedno vlasnik platforme."
  />
);

/**
 * Kartica „AI“ (paritet red 29): provajderi koje projekat koristi za AI
 * asistenta. Provajder je adresa, model i ključ; ključ se čuva na serveru i
 * ovde se nikad ne prikazuje (samo poslednja 4 znaka). Backend traži vlasnika
 * projekta i vlasnika platforme, pa se kartica samo njima i nudi.
 */
export function AiKartica() {
  const { platformaVlasnik } = useProjekat();
  return (
    <SamoZa uloga="owner" inace={NEPRISTUPNO}>
      {platformaVlasnik ? <Spisak /> : NEPRISTUPNO}
    </SamoZa>
  );
}

function Spisak() {
  // „Pokušaj ponovo“ ponovo montira spisak, pa se upit ponovo pretplati.
  const [pokusaj, setPokusaj] = useState(0);
  return <Provajderi key={pokusaj} onRetry={() => setPokusaj((n) => n + 1)} />;
}

function Provajderi({ onRetry }: { onRetry: () => void }) {
  const lista = useProjekatQueryResult(api.prostor.aiProviders.list);
  const update = useProjekatMutation(api.prostor.aiProviders.update);
  const setDefault = useProjekatMutation(api.prostor.aiProviders.setDefault);
  const remove = useProjekatMutation(api.prostor.aiProviders.remove);
  const { busy, run } = useRadnja();
  const [forma, setForma] = useState<{ provajder: Provajder | null } | null>(
    null,
  );
  const [brisanje, setBrisanje] = useState<Provajder | null>(null);
  const [now] = useState(() => Date.now());

  return (
    <div className="max-w-3xl space-y-4 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-ui text-text-muted">
          Provajder je adresa, model i ključ. Ključ se čuva na serveru i ne
          prikazuje se.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => setForma({ provajder: null })}
        >
          <Plus aria-hidden="true" /> Novi provajder
        </Button>
      </div>

      {lista.failed ? (
        <SettingsListError text="Provajderi nisu učitani." onRetry={onRetry} />
      ) : lista.data === undefined ? (
        <SettingsListSkeleton label="Učitavanje provajdera" />
      ) : lista.data.length === 0 ? (
        <EmptyState
          size="section"
          icon={Bot}
          title="Nema AI provajdera."
          description="Dodaj prvog da bi ga projekat koristio."
        />
      ) : (
        <ul className="space-y-0.5" aria-label="AI provajderi">
          {lista.data.map((p) => (
            <li
              key={p._id}
              className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 hover:bg-surface-raised"
            >
              <span className="min-w-48 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-ui font-medium">
                    {p.label}
                  </span>
                  {p.isDefault ? <Badge ton="info">Podrazumevani</Badge> : null}
                  {!p.enabled ? <Badge ton="muted">Isključen</Badge> : null}
                </span>
                <span className="block truncate text-meta text-text-muted">
                  {p.model} · {p.baseUrl} · ključ …{p.keySuffix}
                </span>
                {p.lastError ? (
                  <span className="block truncate text-meta text-danger">
                    Poslednja greška
                    {p.lastErrorAt
                      ? ` (${formatRelativeTime(p.lastErrorAt, now)})`
                      : ""}
                    : {p.lastError}
                  </span>
                ) : p.lastUsedAt ? (
                  <span className="block text-meta text-text-muted">
                    Poslednji put korišćen{" "}
                    {formatRelativeTime(p.lastUsedAt, now)}
                  </span>
                ) : null}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <Switch
                  checked={p.enabled}
                  disabled={busy}
                  aria-label={`${p.label}: uključen`}
                  onCheckedChange={(uklj) =>
                    void run(
                      () => update({ providerId: p._id, enabled: uklj }),
                      uklj
                        ? "Provajder je uključen."
                        : "Provajder je isključen.",
                      "Promena nije sačuvana.",
                    )
                  }
                />
                <span className="flex w-36 justify-end">
                  {!p.isDefault ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      aria-label={`Postavi ${p.label} za podrazumevani`}
                      onClick={() =>
                        void run(
                          () => setDefault({ providerId: p._id }),
                          "Podrazumevani provajder je promenjen.",
                          "Promena nije sačuvana.",
                        )
                      }
                    >
                      <Star aria-hidden="true" /> Podrazumevani
                    </Button>
                  ) : null}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Izmeni ${p.label}`}
                  onClick={() => setForma({ provajder: p })}
                >
                  <Pencil aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Obriši ${p.label}`}
                  onClick={() => setBrisanje(p)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ProvajderDialog
        stanje={forma}
        onOpenChange={(open) => (open ? undefined : setForma(null))}
      />
      <ConfirmDialog
        open={brisanje !== null}
        onOpenChange={(open) => (open ? undefined : setBrisanje(null))}
        title={
          brisanje ? `Obrisati „${brisanje.label}“?` : "Obrisati provajdera?"
        }
        description="Ključ se briše sa servera. Ako je ovo bio podrazumevani provajder, sledeći uključeni preuzima ulogu."
        confirmLabel="Obriši"
        busyLabel="Brišem…"
        busy={busy}
        onConfirm={() => {
          const meta = brisanje;
          if (!meta) return;
          void run(
            () => remove({ providerId: meta._id }),
            "Provajder je obrisan.",
            "Provajder nije obrisan.",
          ).then((ok) => {
            if (ok) setBrisanje(null);
          });
        }}
      />
    </div>
  );
}

function ProvajderDialog({
  stanje,
  onOpenChange,
}: {
  stanje: { provajder: Provajder | null } | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={stanje !== null} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-md">
        {/* Telo se montira tek kad je dijalog otvoren: polja kreću od sačuvanih vrednosti. */}
        {stanje ? (
          <Forma
            provajder={stanje.provajder}
            zatvori={() => onOpenChange(false)}
          />
        ) : null}
      </DialogPopup>
    </Dialog>
  );
}

function Forma({
  provajder,
  zatvori,
}: {
  provajder: Provajder | null;
  zatvori: () => void;
}) {
  const create = useProjekatMutation(api.prostor.aiProviders.create);
  const update = useProjekatMutation(api.prostor.aiProviders.update);
  const [label, setLabel] = useState(provajder?.label ?? "");
  const [baseUrl, setBaseUrl] = useState(provajder?.baseUrl ?? "");
  const [model, setModel] = useState(provajder?.model ?? "");
  const [apiKey, setApiKey] = useState("");
  const [radi, setRadi] = useState(false);

  const novo = provajder === null;
  const popunjeno =
    label.trim() !== "" &&
    baseUrl.trim() !== "" &&
    model.trim() !== "" &&
    (!novo || apiKey.trim() !== "");

  async function sacuvaj(e: FormEvent) {
    e.preventDefault();
    if (!popunjeno || radi) return;
    setRadi(true);
    try {
      if (provajder === null) {
        await create({ label, baseUrl, model, apiKey });
      } else {
        // Samo dirnuta polja; ključ se šalje tek kad je unet nov.
        await update({
          providerId: provajder._id as Id<"aiProviders">,
          ...(label !== provajder.label ? { label } : {}),
          ...(baseUrl !== provajder.baseUrl ? { baseUrl } : {}),
          ...(model !== provajder.model ? { model } : {}),
          ...(apiKey.trim() !== "" ? { apiKey } : {}),
        });
      }
      toast.success("Provajder je sačuvan.");
      zatvori();
    } catch (error) {
      toast.error(accessErrorMessage(error, "Provajder nije sačuvan."));
    } finally {
      setRadi(false);
    }
  }

  return (
    <form onSubmit={sacuvaj} className="space-y-4">
      <DialogHeader>
        <DialogTitle>
          {novo ? "Novi AI provajder" : "Izmena provajdera"}
        </DialogTitle>
        <DialogDescription>
          Svaki provajder koji prati OpenAI-kompatibilan API: adresa, model i
          ključ.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor="ai-naziv">Naziv</Label>
        <Input
          id="ai-naziv"
          value={label}
          maxLength={120}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ai-adresa">Adresa (https)</Label>
        <Input
          id="ai-adresa"
          type="url"
          inputMode="url"
          placeholder="https://api.provajder.com/v1"
          value={baseUrl}
          maxLength={500}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ai-model">Model</Label>
        <Input
          id="ai-model"
          value={model}
          maxLength={200}
          onChange={(e) => setModel(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ai-kljuc">Ključ</Label>
        <Input
          id="ai-kljuc"
          type="password"
          autoComplete="off"
          value={apiKey}
          maxLength={512}
          placeholder={
            novo ? "" : `Ostavi prazno da ostane ključ …${provajder.keySuffix}`
          }
          onChange={(e) => setApiKey(e.target.value)}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" disabled={radi} onClick={zatvori}>
          Otkaži
        </Button>
        <Button type="submit" variant="primary" disabled={radi || !popunjeno}>
          {radi ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : null}
          Sačuvaj
        </Button>
      </DialogFooter>
    </form>
  );
}
