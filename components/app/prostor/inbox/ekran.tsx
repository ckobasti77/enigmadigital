"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Inbox } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { useMojiProjektiRadnogDela } from "@/components/app/prostor/ja/moji-projekti";
import { WorkspaceErrorBoundary } from "@/components/app/prostor/zajednicko/granica-greske";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import { useToday } from "@/components/app/prostor/zajednicko/use-danas";
import { api } from "@/convex/_generated/api";

import { InboxContainer } from "./inbox-container";
import { InboxSkeleton } from "./inbox-skeleton";
import { NotificationSettingsDialog } from "./notification-settings-dialog";

/**
 * ============================================================================
 * EKRAN „JA“: INBOX (SPAJANJE S17, P16, paritet red 5)
 * ============================================================================
 *
 * `/inbox`: obaveštenja radnog dela iz svih mojih projekata i ličnih poruka
 * (pominjanja, dodele, komentari, podsetnici), nepročitano i „Čeka tebe“
 * (ideje koje čekaju moj glas). Isti Inbox je i kartica u zvonu. Podešavanja
 * obaveštenja (vrste, tihi sati, web push) su dijalog sa ovog ekrana i iz
 * menija korisnika.
 */
export function InboxEkran() {
  return (
    <WorkspaceErrorBoundary title="Inbox nije učitan." className="min-h-[20rem]">
      <InboxSadrzaj />
    </WorkspaceErrorBoundary>
  );
}

const OPIS = "Obaveštenja iz svih projekata i ličnih poruka";

function InboxSadrzaj() {
  const today = useToday();
  const profil = useQuery(api.prostor.profiles.getCurrent);
  const projekti = useMojiProjektiRadnogDela();
  const [podesavanja, setPodesavanja] = useState(false);

  const workspaces = useMemo(
    () =>
      (projekti ?? []).map((p) => ({ _id: p._id as string, name: p.name, logoUrl: p.logoUrl, boja: p.boja })),
    [projekti],
  );

  if (profil === undefined || projekti === undefined) {
    return (
      <div className="flex w-full flex-col gap-5">
        <PageHeader variant="module" title="Inbox" description={OPIS} />
        <InboxSkeleton />
      </div>
    );
  }
  if (profil === null) {
    return (
      <div className="flex w-full flex-col gap-5">
        <PageHeader variant="module" title="Inbox" description={OPIS} />
        <EmptyState
          icon={Inbox}
          headingAs="h2"
          title="Inbox još nije spreman."
          description="Profil tima se pravi pri prvom ulasku. Osveži stranicu."
        />
      </div>
    );
  }
  return (
    <>
      <InboxContainer today={today} workspaces={workspaces} onOpenSettings={() => setPodesavanja(true)} />
      <NotificationSettingsDialog open={podesavanja} onOpenChange={setPodesavanja} />
    </>
  );
}
