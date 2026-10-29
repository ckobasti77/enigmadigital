"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { KeyRound, Lock } from "lucide-react";

import { SETTINGS_TEXT } from "@/lib/prostor/settings";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { SamoZa } from "@/components/app/samo-za";
import { useProjekat } from "@/components/app/projekat-provider";
import { useProjekatQueryResult } from "@/components/app/prostor/podaci/projekat";
import { MemberPasswordDialog } from "@/components/app/prostor/podesavanja/member-password-dialog";
import { SettingsListError, SettingsListSkeleton } from "@/components/app/prostor/podesavanja/liste";
import { EmptyState, ProfileAvatar } from "@/components/app/prostor/zajednicko/radni-ui";

const ZAKLJUCANO = (
  <EmptyState
    size="section"
    icon={Lock}
    title="Lozinke članova menja samo vlasnik platforme."
  />
);

/**
 * Kartica „Lozinke“ (paritet red 28): vlasnik platforme postavlja novu lozinku
 * članu projekta. Vide je samo vlasnik projekta koji je ujedno vlasnik
 * platforme; backend isto odbija ostale, a ovde se ne nudi dugme koje bi puklo.
 */
export function LozinkeKartica() {
  const { platformaVlasnik } = useProjekat();
  return <SamoZa uloga="owner" inace={ZAKLJUCANO}>{platformaVlasnik ? <Spisak /> : ZAKLJUCANO}</SamoZa>;
}

function Spisak() {
  // „Pokušaj ponovo“ ponovo montira spisak, pa se upit ponovo pretplati.
  const [pokusaj, setPokusaj] = useState(0);
  return <Clanovi key={pokusaj} onRetry={() => setPokusaj((n) => n + 1)} />;
}

function Clanovi({ onRetry }: { onRetry: () => void }) {
  const clanovi = useProjekatQueryResult(api.prostor.projekat.listMembers, { limit: 50 });
  const ja = useQuery(api.prostor.profiles.getCurrent);
  const [meta, setMeta] = useState<{ profileId: Id<"profiles">; displayName: string } | null>(null);

  return (
    <div className="max-w-xl space-y-4 pt-5">
      <p className="text-ui text-text-muted">{SETTINGS_TEXT.passwordsNote}</p>
      {clanovi.failed ? (
        <SettingsListError text="Članovi nisu učitani." onRetry={onRetry} />
      ) : clanovi.data === undefined ? (
        <SettingsListSkeleton label="Učitavanje članova" />
      ) : clanovi.data.length === 0 ? (
        <EmptyState size="section" title="Nema članova." />
      ) : (
        <ul className="space-y-0.5" aria-label="Članovi">
          {clanovi.data.map(({ profile }) => (
            <li
              key={profile._id}
              className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1 hover:bg-surface-raised"
            >
              <ProfileAvatar profile={profile} />
              <span className="min-w-40 flex-1">
                <span className="block truncate text-ui font-medium">{profile.displayName}</span>
                <span className="block truncate text-meta text-text-muted">{profile.email}</span>
              </span>
              {profile._id === ja?._id ? (
                <span className="text-meta text-text-muted">Ti</span>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Nova lozinka za ${profile.displayName}`}
                  onClick={() => setMeta({ profileId: profile._id, displayName: profile.displayName })}
                >
                  <KeyRound aria-hidden="true" /> Nova lozinka
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <MemberPasswordDialog target={meta} onOpenChange={(open) => (open ? undefined : setMeta(null))} />
    </div>
  );
}
