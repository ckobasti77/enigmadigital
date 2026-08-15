import { Unplug } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";

export default function OpenReplyPage() {
  return (
    <div className="flex flex-1 flex-col">
      <p className="heading-caps text-xs font-medium text-text-muted">
        OpenReply
      </p>
      <EmptyState icon={Unplug}>OpenReply još nije povezan.</EmptyState>
    </div>
  );
}
