"use client";

import { useId, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Raspored polja u formi.
 *
 * Blizina znači srodnost, i to je jedini raspored koji se čita bez
 * razmišljanja. Zato su ovde samo dva razmaka, i razlika među njima je
 * dovoljno velika da se vidi bez merenja:
 *
 *   unutar grupe   12 px  (`FormGroup` → `space-y-3`)
 *   između grupa   28 px  (`FormStack` → `space-y-7`)
 *
 * Kada bi razmak bio 16 naspram 20, oko bi videlo jedan dugačak spisak polja.
 * Ovako vidi tri-četiri celine, i svaka se čita zasebno.
 */
export function FormStack({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-7", className)}>{children}</div>;
}

/**
 * Jedna celina forme: naslov, i polja koja zaista idu zajedno.
 *
 * `control` je mesto za prekidač koji uključuje celu grupu — stoji u zaglavlju
 * grupe, dakle PORED onoga na šta utiče, a ne na dnu forme među dugmadima.
 */
export function FormGroup({
  title,
  description,
  control,
  children,
  className,
  boxed = false,
  collapsible = false,
}: {
  title: string;
  /** Samo kada grupa nosi posledicu koju naslov ne može da kaže. */
  description?: ReactNode;
  control?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Uokviri grupu — za celine koje se uključuju i isključuju. */
  boxed?: boolean;
  /**
   * Grupa koja se otvara klikom, zatvorena po ulasku.
   *
   * Za celine koje NE trebaju dok se piše — SEO polja, istorija revizija.
   * Forma koja sve pokaže odjednom natera čoveka da pročita i ono što mu
   * u tom trenutku ne treba, pa ceo ekran deluje teže nego što jeste.
   * Podrazumevano je `false`, pa se nijedan postojeći ekran ne menja.
   */
  collapsible?: boolean;
}) {
  if (collapsible) {
    return (
      <details
        className={cn(
          "group rounded-xl border border-line bg-surface/40",
          className,
        )}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
          <h3 className="heading-caps text-micro font-medium text-text-muted">
            {title}
          </h3>
          <svg
            className="size-4 shrink-0 text-text-muted transition-transform group-open:rotate-180"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        <div className="space-y-3 border-t border-line px-4 py-4">
          {description && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
          {children}
        </div>
      </details>
    );
  }

  return (
    <section
      className={cn(
        "space-y-3",
        boxed && "rounded-xl border border-line bg-surface/50 p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="heading-caps text-micro font-medium text-text-muted">
            {title}
          </h3>
          {description && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {control && <div className="shrink-0">{control}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * Jedno polje: natpis, kontrola, i greška ODMAH ispod nje.
 *
 * Greška stiže dok korisnik kuca, ne tek na „Sačuvaj”. Poruka koja čeka
 * dugme stiže pošto je čovek već otišao mišlju dalje, pa mora da se vraća i
 * ponovo čita celu formu da nađe polje koje je pogrešio.
 *
 * `hint` je namerno redak. Ako je potrebna oznaka da objasni ŠTA kontrola
 * radi, veza je slaba i polje treba preimenovati; ovde ostaje samo za format
 * koji se ne da naslutiti (npr. čime se razdvajaju ključne reči).
 */
export function Field({
  label,
  children,
  error,
  hint,
  action,
  required = false,
  className,
}: {
  label: string;
  /** Prima `id` i `aria-*` iz `render` propsa. */
  children: (props: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
  }) => ReactNode;
  /** Poruka uz polje; `null` dok je polje ispravno. */
  error?: string | null;
  hint?: ReactNode;
  /** Brojač znakova ili sličan podatak koji ide uz sam natpis. */
  action?: ReactNode;
  required?: boolean;
  className?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const invalid = Boolean(error);

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id} className="text-xs font-medium text-text-muted">
          {label}
          {required && (
            <span className="text-text-muted" aria-hidden>
              *
            </span>
          )}
        </Label>
        {action}
      </div>

      {children({
        id,
        "aria-invalid": invalid,
        "aria-describedby": invalid ? errorId : hint ? hintId : undefined,
      })}

      {invalid ? (
        <p
          id={errorId}
          className="flex items-start gap-1.5 text-xs leading-relaxed text-danger"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-xs leading-relaxed text-text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

/**
 * Brojač znakova uz natpis polja. Ćuti dok ima mesta, upozori pre nego što
 * nastane problem, i pocrveni tek kada je granica prekoračena — to je
 * upozorenje na pravom mestu, uz polje koje ga izaziva.
 */
export function CharCount({ value, max }: { value: number; max: number }) {
  const left = max - value;
  const near = left <= Math.max(20, Math.round(max * 0.1));
  const over = left < 0;

  return (
    <span
      className={cn(
        "font-mono text-micro tabular-nums",
        over ? "text-danger" : near ? "text-warning" : "text-text-muted",
      )}
    >
      {over ? `${-left} preko` : `${left}`}
    </span>
  );
}

/**
 * Opasne radnje stoje odvojeno — svoja linija, svoj naslov, na dnu forme.
 *
 * Odvajanje je pola zaštite: dugme za brisanje koje stoji rame uz rame sa
 * „Sačuvaj” dobija pogrešan klik pre ili kasnije, koliko god potvrda bilo
 * posle njega.
 */
export function DangerZone({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/25 bg-danger/5 px-4 py-3.5",
        className,
      )}
    >
      <div className="min-w-0">
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </section>
  );
}
