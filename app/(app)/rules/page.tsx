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
      {/* Zaglavlje strane crta sam ekran: „Novo pravilo" otvara dijalog. */}
      <Suspense fallback={<RulesDashboardSkeleton />}>
        <RulesDashboard />
      </Suspense>
    </div>
  );
}
