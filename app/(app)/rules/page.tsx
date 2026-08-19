import { Suspense } from "react";
import {
  RulesDashboard,
  RulesDashboardSkeleton,
} from "@/components/app/rules/rules-dashboard";

export const metadata = {
  title: "Pravila i zaštita budžeta · Enigma Command Center",
};

export default function RulesPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <p className="heading-caps text-micro font-medium text-text-muted">
        Automatizacija · Zaštita budžeta
      </p>
      <h1 className="mt-2 text-h1 text-foreground">
        Pravila i zaštita budžeta
      </h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
        Evaluator proverava performanse oglasa svakih 30 minuta i reaguje kada
        CPA ili potrošnja skoče preko praga.
      </p>

      <div className="mt-8 flex flex-1 flex-col">
        <Suspense fallback={<RulesDashboardSkeleton />}>
          <RulesDashboard />
        </Suspense>
      </div>
    </div>
  );
}
