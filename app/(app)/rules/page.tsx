import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import {
  RulesDashboard,
  RulesDashboardSkeleton,
} from "@/components/app/rules/rules-dashboard";

export const metadata = {
  title: "Pravila i zaštita budžeta · Enigma Command Center",
};

export default function RulesPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <PageHeader description="Evaluator proverava performanse oglasa svakih 30 minuta i reaguje kada CPA ili potrošnja skoče preko praga." />

      <div className="flex flex-1 flex-col">
        <Suspense fallback={<RulesDashboardSkeleton />}>
          <RulesDashboard />
        </Suspense>
      </div>
    </div>
  );
}
