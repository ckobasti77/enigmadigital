import type { ReactNode } from "react";

/** Okvir sekcije i grupe u živom vodiču — razdelnik i razmak, ne kutija. */
export function Sekcija({
  naslov,
  opis,
  children,
}: {
  naslov: string;
  opis?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="border-b border-line pb-2">
        <h2 className="text-title font-bold text-foreground">{naslov}</h2>
        {opis && <p className="mt-1 max-w-3xl text-ui text-text-muted">{opis}</p>}
      </div>
      {children}
    </section>
  );
}

export function Grupa({ naslov, children }: { naslov: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="heading-caps text-meta font-medium text-text-muted">{naslov}</h3>
      {children}
    </div>
  );
}
