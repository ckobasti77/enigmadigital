import { Unplug } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";

export default function InstagramPage() {
  return (
    <div className="flex flex-1 flex-col">
      <p className="heading-caps text-xs font-medium text-text-muted">
        Instagram
      </p>
      <EmptyState icon={Unplug}>Instagram još nije povezan.</EmptyState>
    </div>
  );
}
