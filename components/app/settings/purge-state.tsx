"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { ExternalLink, RotateCcw, LoaderCircle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Provider } from "@/convex/lib/providers";
import { Button } from "@/components/ui/button";
import { FeedbackNote } from "@/components/app/feedback";
import {
  GOOGLE_PERMISSIONS_URL,
  META_BUSINESS_APPS_URL,
} from "@/lib/policy-links";

/**
 * Šta se zaista dešava sa podacima posle „Prekini vezu” (P3).
 *
 * Dijalog je obećavao da se „brišu svi podaci… Ova radnja je nepovratna”, a
 * mutacija je vraćala uspeh pre nego što je ijedan red obrisan — brisanje je
 * tek bilo zakazano. Prekinuto brisanje se pri tome nije razlikovalo od
 * završenog: kartica je u oba slučaja pisala isto.
 *
 * Zato ova traka govori jedno od tri, i nikad ništa četvrto: koliko je redova
 * do sada obrisano dok traje, da je gotovo i kad, ili da je puklo — sa dugmetom
 * koje nastavlja odatle gde je stalo. Tiho pretvaranje neuspeha u uspeh je
 * jedina greška koju ovaj ekran ne sme da ima.
 */

export type PurgeRunView = FunctionReturnType<typeof api.purge.status>[number];

/** Poslednje brisanje za jedan servis; `undefined` dok se upit učitava. */
export function usePurgeRun(provider: Provider): PurgeRunView | null | undefined {
  const runs = useQuery(api.purge.status);
  if (runs === undefined) return undefined;
  return runs.find((run) => run.provider === provider) ?? null;
}

/**
 * Da li korisnik sme da prekine vezu.
 *
 * Ista provera koju server radi (`requireOwner`), samo ranije: dugme koje puca
 * na klik je gore od dugmeta kojeg nema.
 */
export function useIsWorkspaceOwner(): boolean | undefined {
  const context = useQuery(api.workspaces.currentContext);
  if (context === undefined) return undefined;
  return context?.role === "owner";
}

function formatDateTime(value: number): string {
  return new Date(value).toLocaleString("sr-RS", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function rowsLabel(count: number): string {
  const rest = count % 100;
  if (rest >= 11 && rest <= 14) return `${count} redova`;
  switch (count % 10) {
    case 1:
      return `${count} red`;
    case 2:
    case 3:
    case 4:
      return `${count} reda`;
    default:
      return `${count} redova`;
  }
}

/** Gde se opoziv završava rukom, kad poziv nije prošao. */
function manualRevokeLink(provider: Provider): {
  href: string;
  label: string;
} | null {
  switch (provider) {
    case "ga4":
    case "google_ads":
    case "youtube":
      return {
        href: GOOGLE_PERMISSIONS_URL,
        label: "myaccount.google.com/permissions",
      };
    case "meta_ig":
    case "meta_fb":
    case "meta_ads":
      return {
        href: META_BUSINESS_APPS_URL,
        label: "facebook.com/settings → Business integrations",
      };
    default:
      return null;
  }
}

/**
 * Rečenica o opozivu — samo kad opoziv nije prošao.
 *
 * Kad prođe, nema šta da se kaže: token je vraćen i to je kraj priče. Kad ne
 * prođe, mora da stoji šta preostaje da se uradi rukom, jer podaci jesu
 * obrisani ali dozvola na tuđem nalogu i dalje živi.
 */
function RevokeNote({ run }: { run: PurgeRunView }) {
  if (run.revokeStatus === "ok" || run.revokeStatus === "pending") return null;
  if (run.revokeError === null) return null;

  const link = manualRevokeLink(run.provider);
  return (
    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
      {run.revokeError}
      {link && (
        <>
          {" "}
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-accent-400 underline underline-offset-2 transition-colors hover:text-accent-300"
          >
            {link.label}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        </>
      )}
    </p>
  );
}

/**
 * Stanje brisanja za jedan servis. Ne prikazuje ništa dok brisanja nema, pa
 * kartice izgledaju tačno kao pre sve dok se nešto zaista ne dešava.
 */
export function PurgeNotice({ provider }: { provider: Provider }) {
  const run = usePurgeRun(provider);
  const retry = useMutation(api.purge.retry);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  if (run === undefined || run === null) return null;

  async function handleRetry() {
    setRetrying(true);
    setRetryError(null);
    try {
      await retry({ provider });
    } catch (error) {
      setRetryError(
        error instanceof ConvexError &&
          typeof (error.data as { message?: string })?.message === "string"
          ? ((error.data as { message?: string }).message as string)
          : "Ponovno pokretanje nije uspelo.",
      );
    } finally {
      setRetrying(false);
    }
  }

  if (run.status === "running") {
    return (
      <FeedbackNote
        tone="progress"
        className="mt-4"
        title="Brisanje podataka u toku…"
      >
        <span>
          Obrisano {rowsLabel(run.deletedTotal)}. Nastavlja se samo, i kad je
          ova stranica zatvorena.
        </span>
        <RevokeNote run={run} />
      </FeedbackNote>
    );
  }

  if (run.status === "failed") {
    return (
      <FeedbackNote
        tone="danger"
        className="mt-4"
        title="Brisanje podataka nije završeno"
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRetry}
            disabled={retrying}
          >
            {retrying ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <RotateCcw className="size-3.5" />
            )}
            Pokušaj ponovo
          </Button>
        }
      >
        <span>
          {run.lastError ??
            `Brisanje je stalo. Do sada je obrisano ${rowsLabel(run.deletedTotal)}.`}
        </span>
        {retryError && (
          <span className="mt-2 block text-danger">{retryError}</span>
        )}
        <RevokeNote run={run} />
      </FeedbackNote>
    );
  }

  return (
    <FeedbackNote
      tone="success"
      className="mt-4"
      title={`Podaci obrisani · ${
        run.finishedAt === null ? "—" : formatDateTime(run.finishedAt)
      }`}
    >
      <span>
        Obrisano {rowsLabel(run.deletedTotal)} preuzetih sa ovog servisa.
      </span>
      <RevokeNote run={run} />
    </FeedbackNote>
  );
}
