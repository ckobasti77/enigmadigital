import { Suspense } from "react";
import {
  RulesDashboard,
  RulesDashboardSkeleton,
} from "@/components/app/rules/rules-dashboard";

export const metadata = {
  title: "Pravila i Zaštita Budžeta · Enigma Command Center",
};

export default function RulesPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <Suspense
        fallback={
          <div className="flex flex-1 flex-col gap-6">
            <RulesDashboardSkeleton />
          </div>
        }
      >
        <RulesDashboard />
      </Suspense>
    </div>
  );
}
