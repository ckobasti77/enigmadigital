import type { Metadata } from "next";
import Link from "next/link";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

export const metadata: Metadata = {
  title: "Status brisanja podataka · Enigma Command Center",
  description: "Provera statusa zahteva za brisanje podataka sa Meta / Threads naloga.",
};

interface DeletionStatusPageProps {
  searchParams: Promise<{ code?: string }>;
}

export default async function DeletionStatusPage({
  searchParams,
}: DeletionStatusPageProps) {
  const { code } = await searchParams;
  let statusResult: {
    status: string;
    startedAt: number;
    finishedAt: number | null;
  } | null = null;

  if (code && process.env.NEXT_PUBLIC_CONVEX_URL) {
    try {
      const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
      statusResult = await client.query(api.threadsStore.getDeletionStatus, {
        confirmationCode: code.trim(),
      });
    } catch {
      // Ignorišemo grešku i prikazujemo neutralan status
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-[var(--gutter)] py-16">
      <p className="heading-caps text-micro font-medium text-accent-400">
        Enigma · Command Center
      </p>
      <h1 className="mt-3 text-h1 text-foreground">Status brisanja podataka</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Ova stranica omogućava praćenje statusa zahteva za brisanje korisničkih
        podataka koji je pokrenut putem Meta platforme (Threads Data Deletion Callback).
      </p>

      {code ? (
        <div className="mt-8 rounded-lg border border-line-soft bg-surface-raised/40 p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Zahtev za brisanje
          </h2>
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-xs text-text-muted">Kod potvrde (Confirmation Code):</p>
              <p className="mt-0.5 font-mono text-sm font-medium text-foreground break-all">
                {code}
              </p>
            </div>

            <div>
              <p className="text-xs text-text-muted">Status obrade:</p>
              <div className="mt-1 flex items-center gap-2">
                {statusResult ? (
                  statusResult.status === "done" ? (
                    <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 border border-emerald-500/20">
                      Podaci uspešno obrisani
                    </span>
                  ) : statusResult.status === "running" ? (
                    <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400 border border-amber-500/20">
                      Brisanje u toku
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-md bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-400 border border-rose-500/20">
                      Neuspelo / Potrebna intervencija
                    </span>
                  )
                ) : (
                  <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 border border-emerald-500/20">
                    Podaci ne postoje ili su već kompletno uklonjeni
                  </span>
                )}
              </div>
            </div>

            {statusResult?.startedAt && (
              <div>
                <p className="text-xs text-text-muted">Vreme pokretanja:</p>
                <p className="mt-0.5 text-xs text-foreground">
                  {new Date(statusResult.startedAt).toLocaleString("sr-RS")}
                </p>
              </div>
            )}

            {statusResult?.finishedAt && (
              <div>
                <p className="text-xs text-text-muted">Vreme završetka:</p>
                <p className="mt-0.5 text-xs text-foreground">
                  {new Date(statusResult.finishedAt).toLocaleString("sr-RS")}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <form method="GET" className="mt-8 rounded-lg border border-line-soft bg-surface-raised/40 p-6">
          <label htmlFor="code" className="block text-xs font-semibold uppercase tracking-wider text-text-muted">
            Unesi kod potvrde (Confirmation Code)
          </label>
          <div className="mt-3 flex gap-2">
            <input
              id="code"
              name="code"
              type="text"
              required
              placeholder="Unesi kod koji si dobio od Meta platforme..."
              className="flex-1 rounded-md border border-line-soft bg-surface px-3 py-2 text-sm text-foreground placeholder:text-text-muted focus:border-accent-400 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-md bg-accent-500 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-600"
            >
              Proveri status
            </button>
          </div>
        </form>
      )}

      <p className="mt-12 border-t border-line-soft pt-4 text-xs text-text-muted">
        <Link
          href="/privacy"
          className="text-accent-400 underline underline-offset-2 transition-colors hover:text-accent-300"
        >
          Politika privatnosti
        </Link>
      </p>
    </main>
  );
}
