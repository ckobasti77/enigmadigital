import { Suspense } from "react";
import {
  NovostiDashboard,
  NovostiDashboardSkeleton,
} from "@/components/app/novosti/novosti-dashboard";

export const metadata = {
  title: "Novosti i članci · Enigma Command Center",
};

export default function NovostiPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      {/* Zaglavlje strane crta sam ekran: „Novi post" otvara uređivač. */}
      <Suspense fallback={<NovostiDashboardSkeleton />}>
        <NovostiDashboard />
      </Suspense>
    </div>
  );
}
