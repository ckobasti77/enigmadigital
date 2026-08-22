import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import {
  AdsDashboard,
  AdsDashboardSkeleton,
} from "@/components/app/ads/ads-dashboard";

export default function AdsPage() {
  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <PageHeader
        description="Pregled kampanja, hijerarhija ad setova i oglasa, analiza video kreativa (Hook/Hold rate) i demografska raspodela."
        actions={
          <Link href="/ads/nova-kampanja">
            <Button size="sm">
              <Plus className="mr-1.5 size-3.5" />
              Nova kampanja
            </Button>
          </Link>
        }
      />

      <div className="flex flex-1 flex-col">
        {/* useSearchParams (date range) needs a Suspense boundary on static routes. */}
        <Suspense fallback={<AdsDashboardSkeleton />}>
          <AdsDashboard />
        </Suspense>
      </div>
    </div>
  );
}
