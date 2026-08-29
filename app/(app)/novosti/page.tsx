import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import {
  NovostiDashboard,
  NovostiDashboardSkeleton,
} from "@/components/app/novosti/novosti-dashboard";

export const metadata = {
  title: "Novosti i članci · Enigma Command Center",
};

export default function NovostiPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <PageHeader description="Pisanje, uređivanje i objavljivanje blog članaka i beleški za Enigma IT sajt uz striktne kapije pre objave (§2, §4, §11)." />

      <div className="flex flex-1 flex-col">
        <Suspense fallback={<NovostiDashboardSkeleton />}>
          <NovostiDashboard />
        </Suspense>
      </div>
    </div>
  );
}
