"use client";

import { useQuery } from "convex/react";
import { Gauge, Timer } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { formatClockTime, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Provider } from "@/convex/lib/providers";
import { PROVIDER_LABELS } from "./status-pill";

type JobRow = FunctionReturnType<typeof api.metaSyncStore.jobStatus>[number];

type MetaProvider = "meta_ig" | "meta_fb";

type PlanRow = {
  job: string;
  label: string;
  /** Koliko često — rečima, i tačno onoliko koliko platforma stvarno daje. */
  cadence: string;
  note?: string;
};

/**
 * Raspored kakav zaista stoji u `convex/crons.ts` i u webhook-u.
 *
 * Tekstovi su namerno oprezni. „Odmah" sme da piše samo tamo gde Instagram
 * sam javi da se nešto desilo — kod komentara. Nova objava se ne javlja
 * nikako: nje nema u webhook-u ni na jednom nivou dozvola, pa se otkriva
 * isključivo pitanjem svaka dva minuta. Zato „do 2 minuta", a ne „odmah" i
 * nikako „u realnom vremenu".
 */
const PLAN: Record<MetaProvider, PlanRow[]> = {
  meta_ig: [
    {
      job: "event",
      label: "Nov komentar i odgovor automatizacije",
      cadence: "odmah",
      note: "Instagram javi komentar u sekundi; ta objava se tada osveži sama.",
    },
    {
      job: "head",
      label: "Nova objava",
      cadence: "do 2 minuta",
      note: "Instagram ne javlja objavljivanje, pa se lista proverava sama.",
    },
    { job: "account", label: "Pratioci, doseg i pregledi profila", cadence: "na sat vremena" },
    {
      job: "hot",
      label: "Uvidi objava mlađih od 14 dana",
      cadence: "na sat vremena",
      note: "Doseg za svežu objavu Instagram obračunava sa zakašnjenjem — prvih sati ume da bude nula.",
    },
    { job: "full", label: "Pun prolaz kroz objave i komentare", cadence: "na 6 sati" },
    { job: "deletion", label: "Provera obrisanih objava", cadence: "jednom dnevno" },
  ],
  meta_fb: [
    {
      job: "event",
      label: "Nov komentar i odgovor automatizacije",
      cadence: "odmah",
    },
    { job: "head", label: "Nova objava", cadence: "do 2 minuta" },
    { job: "account", label: "Pratioci, prikazi i angažovanja stranice", cadence: "na sat vremena" },
    { job: "hot", label: "Uvidi objava mlađih od 14 dana", cadence: "na sat vremena" },
    {
      job: "full",
      label: "Pun prolaz kroz objave i komentare",
      cadence: "na 6 sati",
      note: "Isti prolaz primeti i obrisane objave, bez ijednog dodatnog poziva.",
    },
  ],
};

const ORDER: MetaProvider[] = ["meta_ig", "meta_fb"];

/**
 * Šta se osvežava, koliko često, i kada je poslednji put stvarno uspelo.
 *
 * Postoji zato što je „zašto se ovo još nije promenilo" pitanje koje panel
 * inače ne ume da odgovori. Raspored je jedna stvar, a da li je taj raspored
 * jutros prošao je sasvim druga — i druga je ono što čovek zapravo traži.
 *
 * Ritmovi su prepisani iz `crons.ts` i nisu čitani iz baze: raspored je
 * kompajliran u kod, a druga kopija u bazi bila bi druga stvar koju treba
 * održavati istinitom.
 */
export function SyncSchedule({ connected }: { connected: Provider[] }) {
  const jobs = useQuery(api.metaSyncStore.jobStatus);

  const networks = ORDER.filter((provider) => connected.includes(provider));
  if (networks.length === 0) return null;

  return (
    <section className="rounded-xl border bg-card p-6 shadow-card">
      <div className="flex items-center gap-2">
        <Timer className="size-4 text-text-muted" />
        <h2 className="heading-caps text-micro font-medium text-text-muted">
          Sinhronizacija
        </h2>
      </div>
      <p className="mt-2 max-w-xl text-xs leading-relaxed text-muted-foreground">
        Panel se osvežava sam. Ručno „Sinhronizuj” na kartici iznad postoji za
        slučaj kada ne želiš da čekaš sledeći prolaz.
      </p>

      <MetaUsageLine />

      <div className="mt-5 space-y-6">
        {networks.map((provider) => (
          <div key={provider}>
            <h3 className="text-sm font-semibold text-foreground">
              {PROVIDER_LABELS[provider]}
            </h3>
            {jobs === undefined ? (
              <div className="mt-3 space-y-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-line-soft">
                {PLAN[provider].map((row) => (
                  <PlanLine
                    key={row.job}
                    row={row}
                    status={jobs.find(
                      (j) => j.provider === provider && j.job === row.job,
                    )}
                  />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Koliko je Metine kvote potrošeno — jedan red, bez trake.
 *
 * Ovde stoji ono što je sklonjeno sa ekrana u V2/4: nivo „warn" (preko 80 %)
 * ne zaustavlja ništa što čovek radi rukom, pa nema šta da traži u žutoj traci
 * preko celog panela. Ali jeste razlog zašto pozadinski prolazi ćute, i to je
 * tačno pitanje zbog kog se otvara ova kartica.
 *
 * Kvota je jedna za celu Meta aplikaciju — Instagram, Facebook stranicu i
 * oglase zajedno — pa red namerno ne imenuje mrežu.
 */
function MetaUsageLine() {
  const status = useQuery(api.metaSyncStore.rateLimit);
  if (status === undefined || status.state === "ok") return null;

  const held = status.state !== "warn";

  return (
    <p
      className={cn(
        "mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs",
        held ? "text-warning" : "text-text-muted",
      )}
    >
      <Gauge className="size-3.5 shrink-0" aria-hidden />
      <span>
        Metina kvota:{" "}
        <span className="font-mono tabular-nums">
          {Math.round(status.peak)} %
        </span>{" "}
        potrošeno.
      </span>
      <span>
        {status.state === "warn"
          ? "Pozadinski prolazi čekaju; ručna sinhronizacija i dalje radi."
          : status.state === "stop"
            ? "Prolazi su zaustavljeni dok se obim ne oslobodi."
            : "Meta je odbila pozive i čekamo."}
      </span>
      {status.retryAt !== null && (
        <span className="font-mono tabular-nums">
          {status.state === "backoff" ? "Nastavak u " : "Najkasnije do "}
          {formatClockTime(status.retryAt)}
        </span>
      )}
    </p>
  );
}

function PlanLine({ row, status }: { row: PlanRow; status?: JobRow }) {
  return (
    <li className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm text-foreground">{row.label}</span>
        <span className="flex shrink-0 items-baseline gap-3 text-xs">
          <span className="text-text-muted">{row.cadence}</span>
          <span className="w-24 text-right font-mono tabular-nums text-muted-foreground">
            {status?.lastOkAt == null
              ? "—"
              : formatRelativeTime(status.lastOkAt)}
          </span>
        </span>
      </div>
      {row.note && (
        <p className="max-w-xl text-xs leading-relaxed text-text-muted">
          {row.note}
        </p>
      )}
      {status?.lastSkipReason && (
        <p className="text-xs leading-relaxed text-warning">
          {status.lastSkipReason}
        </p>
      )}
    </li>
  );
}
