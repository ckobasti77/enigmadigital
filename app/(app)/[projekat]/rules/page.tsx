import { Suspense } from "react";
import {
  RulesDashboard,
  RulesDashboardSkeleton,
} from "@/components/app/rules/rules-dashboard";

export const metadata = {
  // Ime projekta dodaje šablon iz layout-a `[projekat]`.
  title: "Pravila i zaštita budžeta",
};

export default function RulesPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      {/* Zaglavlje strane crta sam ekran: „Novo pravilo" otvara dijalog. */}
      <Suspense fallback={<RulesDashboardSkeleton />}>
        <RulesDashboard />
      </Suspense>
    </div>
  );
}
