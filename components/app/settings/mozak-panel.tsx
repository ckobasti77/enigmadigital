"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { FeedbackLine } from "@/components/app/feedback";
import { CharCount, Field, FormStack } from "@/components/app/form-kit";
import {
  useProjekat,
  useProjekatMutation,
  useProjekatQuery,
} from "@/components/app/projekat-provider";
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import {
  MOZAK_MAX,
  MOZAK_POLJA,
  proveriMozakPolje,
  type MozakPolje,
} from "@/convex/lib/podesavanjaPravila";

/**
 * ============================================================================
 * PODEŠAVANJA → MOZAK PROJEKTA (P15)
 * ============================================================================
 *
 * Pet običnih polja: šta projekat prodaje, kome, kojim tonom, šta se ne
 * govori i skripte za razgovor. Čitaju ih skillovi za leadove i sadržaj
 * (preko ingest tokena projekta, C14). Menja vlasnik; urednik i posmatrač
 * vide tekst.
 * ============================================================================
 */

type Mozak = FunctionReturnType<typeof api.podesavanjaStore.mozak>;

const POLJA: Record<MozakPolje, { naziv: string; primer: string; visina: string }> = {
  ponuda: {
    naziv: "Ponuda",
    primer: "Šta prodajemo, za koga je i koliko košta.",
    visina: "min-h-24",
  },
  icpOpis: {
    naziv: "Kome prodajemo",
    primer: "Delatnost, veličina firme, grad, ko odlučuje.",
    visina: "min-h-24",
  },
  ton: {
    naziv: "Ton",
    primer: "Kako zvučimo u porukama i objavama.",
    visina: "min-h-20",
  },
  zabrane: {
    naziv: "Šta ne govorimo",
    primer: "Obećanja, reči i teme koje se izbegavaju.",
    visina: "min-h-20",
  },
  skripte: {
    naziv: "Skripte",
    primer: "Uvod u poziv, odgovori na česte prigovore.",
    visina: "min-h-32",
  },
};

export function MozakPanel() {
  const { uloga } = useProjekat();
  const mozak = useProjekatQuery(api.podesavanjaStore.mozak);

  if (mozak === undefined) {
    return (
      <div className="space-y-4 pt-6" aria-hidden>
        <Skeleton className="h-24 w-full max-w-2xl rounded-xl" />
        <Skeleton className="h-24 w-full max-w-2xl rounded-xl" />
      </div>
    );
  }
  if (uloga !== "owner") return <MozakCitanje mozak={mozak} />;
  return <MozakForma key={JSON.stringify(mozak)} mozak={mozak} />;
}

function MozakForma({ mozak }: { mozak: Mozak }) {
  const sacuvaj = useProjekatMutation(api.podesavanjaStore.sacuvajMozak);
  const [vrednosti, setVrednosti] = useState<Record<MozakPolje, string>>(() =>
    Object.fromEntries(MOZAK_POLJA.map((p) => [p, mozak[p] ?? ""])) as Record<
      MozakPolje,
      string
    >,
  );
  const [cuvam, setCuvam] = useState(false);
  const [status, setStatus] = useState<{ tip: "greska" | "uspeh"; tekst: string } | null>(
    null,
  );

  const provere = Object.fromEntries(
    MOZAK_POLJA.map((p) => [p, proveriMozakPolje(vrednosti[p])]),
  ) as Record<MozakPolje, ReturnType<typeof proveriMozakPolje>>;
  const ispravno = MOZAK_POLJA.every((p) => provere[p].ok);
  const izmenjeno = MOZAK_POLJA.filter((p) => {
    const pr = provere[p];
    return (pr.ok ? pr.vrednost : vrednosti[p]) !== mozak[p];
  });

  const posalji = async (e: FormEvent) => {
    e.preventDefault();
    if (!ispravno || izmenjeno.length === 0 || cuvam) return;
    setCuvam(true);
    setStatus(null);
    try {
      const izmena: Partial<Record<MozakPolje, string | null>> = {};
      for (const p of izmenjeno) {
        const pr = provere[p];
        if (pr.ok) izmena[p] = pr.vrednost;
      }
      await sacuvaj(izmena);
      setStatus({ tip: "uspeh", tekst: "Sačuvano." });
    } catch (err) {
      const data = (err as { data?: { message?: unknown } } | null)?.data;
      setStatus({
        tip: "greska",
        tekst: typeof data?.message === "string" ? data.message : "Izmene nisu sačuvane.",
      });
    } finally {
      setCuvam(false);
    }
  };

  return (
    <form onSubmit={(e) => void posalji(e)} className="max-w-2xl pt-6">
      <FormStack>
        {MOZAK_POLJA.map((p) => {
          const pr = provere[p];
          return (
            <Field
              key={p}
              label={POLJA[p].naziv}
              error={pr.ok ? null : pr.poruka}
              action={<CharCount value={vrednosti[p].trim().length} max={MOZAK_MAX} />}
            >
              {(field) => (
                <Textarea
                  {...field}
                  value={vrednosti[p]}
                  onChange={(e) => setVrednosti((v) => ({ ...v, [p]: e.target.value }))}
                  placeholder={POLJA[p].primer}
                  // Visinu nosi klasa: `field-sizing-content` ne gleda `rows`.
                  className={`${POLJA[p].visina} text-ui leading-relaxed`}
                />
              )}
            </Field>
          );
        })}
      </FormStack>
      {/* Pet polja ne staje iznad pregiba, pa dugme putuje sa ekranom: traka
          je lepljiva uz dno (na telefonu iznad donje navigacije). */}
      <div className="material edge-fade-t sticky bottom-16 z-10 mt-6 -mx-3 flex flex-wrap items-center gap-3 rounded-lg px-3 py-3 md:bottom-0">
        <Button
          type="submit"
          variant="primary"
          disabled={!ispravno || izmenjeno.length === 0 || cuvam}
          aria-busy={cuvam}
        >
          {cuvam && <LoaderCircle className="motion-safe:animate-spin" aria-hidden />}
          Sačuvaj
        </Button>
        {status && (
          <FeedbackLine tone={status.tip === "greska" ? "danger" : "success"}>
            {status.tekst}
          </FeedbackLine>
        )}
      </div>
    </form>
  );
}

function MozakCitanje({ mozak }: { mozak: Mozak }) {
  return (
    <div className="max-w-2xl space-y-6 pt-6">
      {MOZAK_POLJA.map((p) => (
        <section key={p} className="space-y-1.5">
          <h3 className="heading-caps text-micro font-medium text-text-muted">
            {POLJA[p].naziv}
          </h3>
          {mozak[p] ? (
            <p className="whitespace-pre-line text-ui leading-relaxed text-foreground">
              {mozak[p]}
            </p>
          ) : (
            <p className="text-ui text-text-muted">— nije upisano</p>
          )}
        </section>
      ))}
      <p className="text-meta text-text-muted">Mozak projekta menja vlasnik projekta.</p>
    </div>
  );
}
