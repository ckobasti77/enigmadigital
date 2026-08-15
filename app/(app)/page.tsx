import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";

const slots = [
  { label: "GA4 sesije", key: true },
  { label: "IG reach", key: false },
  { label: "OpenReply DM", key: false },
];

export default function OverviewPage() {
  return (
    <div className="w-full max-w-3xl">
      <p className="heading-caps text-xs font-medium text-text-muted">Pregled</p>
      <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight text-foreground">
        Sve na jednom mestu
      </h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
        GA4, Instagram i OpenReply se slivaju ovde. Skela je spremna — moduli
        stižu po PLAN.md.
      </p>

      <Reveal delay={0.1} className="mt-8">
        <section className="hover-lift rounded-xl border bg-card p-6 shadow-card">
          <dl className="grid grid-cols-3 gap-6">
            {slots.map((slot) => (
              <div key={slot.label}>
                <dt className="text-xs text-text-muted">{slot.label}</dt>
                <dd
                  className={`mt-2 font-mono text-2xl tabular-nums ${
                    slot.key ? "text-accent-400" : "text-foreground"
                  }`}
                >
                  —
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 flex items-center gap-3 border-t pt-5">
            <Button disabled>Sinhronizuj</Button>
            <span className="text-xs text-text-muted">Povezuje se u M3</span>
          </div>
        </section>
      </Reveal>
    </div>
  );
}
