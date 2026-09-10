"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import type { GapType } from "@/convex/leadGapsStore";
import {
  Globe,
  Hash,
  Phone,
  ShieldAlert,
  UserCheck,
  UserX,
} from "lucide-react";
import { Chip } from "@/components/app/system/chip";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackNote } from "@/components/app/feedback";
import { leadGapLabel } from "./lead-labels";
import { LeadGapFillDialog } from "./lead-gap-fill-dialog";
import { PRIMARY_ACTION_CLASS } from "./lead-row-actions";
import { WorkCard, WorkSection } from "./work-card";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type GapsPanelProps = {
  workspaceId: Id<"workspaces">;
};

/**
 * ============================================================================
 * RUPE U PODACIMA (A4 §2)
 * ============================================================================
 *
 * Izmereno (plan §1.7): tabela je na 1568 px bežala van kartice — kolone
 * „Evidentirano" i „Akcija" su ostajale iza `overflow-x-auto`, dakle na ekranu
 * a nedohvatljive bez vodoravnog klizanja koje se ne vidi. Sedam kolona fiksne
 * strukture za spisak firmi kojima fali JEDAN podatak je bio pogrešan oblik.
 *
 * Sada je isti jezik kartica kao „Danas" (`work-card.tsx`): kartica se prelama
 * umesto da se seče, a svaka nosi TAČNO jednu primarnu radnju („Popuni rupu")
 * koja otvara postojeći `lead-gap-fill-dialog`. Nijedan podatak iz tabele nije
 * nestao — grad, poreklo, sajt, PIB i datum evidentiranja su čipovi na kartici.
 */

const GAP_CARDS: ReadonlyArray<{
  type: GapType;
  label: string;
  field: "bezTelefona" | "bezKontaktOsobe" | "bezVlasnika" | "bezSajta" | "bezPib";
  icon: typeof Phone;
  description: string;
}> = [
  {
    type: "bez_telefona",
    label: "Bez telefona",
    field: "bezTelefona",
    icon: Phone,
    description: "Leadovi koji čekaju broj telefona za prvi poziv",
  },
  {
    type: "bez_kontakt_osobe",
    label: "Bez kontakt osobe",
    field: "bezKontaktOsobe",
    icon: UserX,
    description: "Firme bez unetog imena direktora, vlasnika ili menadžera",
  },
  {
    type: "bez_vlasnika",
    label: "Bez vlasnika",
    field: "bezVlasnika",
    icon: UserCheck,
    description: "Leadovi koji nisu dodeljeni nijednom operateru",
  },
  {
    type: "bez_sajta",
    label: "Bez sajta",
    field: "bezSajta",
    icon: Globe,
    description: "Firme bez zabeleženog veb-sajta ili domena",
  },
  {
    type: "bez_pib",
    label: "Bez PIB-a",
    field: "bezPib",
    icon: Hash,
    description: "Firme kojima nedostaje poreski identifikacioni broj",
  },
];

export function GapsPanel({ workspaceId }: GapsPanelProps) {
  const [selectedGap, setSelectedGap] = useState<GapType>("bez_telefona");
  const [gapFillCompany, setGapFillCompany] = useState<Doc<"leadCompanies"> | null>(null);

  const gaps = useQuery(api.leadGapsStore.listGaps, { workspaceId });

  const gapDetails = useQuery(api.leadGapsStore.listCompaniesWithGap, {
    workspaceId,
    gapType: selectedGap,
    limit: 100,
  });

  if (gaps === undefined) {
    return <GapsPanelSkeleton />;
  }

  const izabrana = GAP_CARDS.find((c) => c.type === selectedGap);
  const ukupnoIzabrane = izabrana ? gaps[izabrana.field] : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Obavezna upozorenja o nepotpunosti ili potencijalno lažnim rupama (§9.2) */}
      {gaps.moguceLazneRupe && (
        <FeedbackNote
          tone="warning"
          title="Upozorenje: Moguće lažne rupe zbog limita u relacijama"
        >
          Neki redovi mogu biti prikazani kao rupe jer povezana tabela
          (kontakt osobe, identifikatori ili dodela) nije pročitana do kraja
          zbog zaštitnog limita transakcije.
        </FeedbackNote>
      )}

      {gaps.nepotpuno && (
        <FeedbackNote tone="warning" title="Uzorak prebrojavanja je delimičan">
          Pregledano je ukupno {gaps.ukupnoFirmi} firmi. Baza sadrži više zapisa, pa
          svaki prikazani broj predstavlja stanje u okviru analiziranog uzorka.
        </FeedbackNote>
      )}

      {/* Vrste rupa — svaka sa obaveznim imeniocem („N od M firmi u bazi") */}
      <div
        role="tablist"
        aria-label="Vrste rupa u podacima"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      >
        {GAP_CARDS.map((card) => {
          const count = gaps[card.field];
          const isSelected = selectedGap === card.type;
          const Icon = card.icon;

          return (
            <button
              key={card.type}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setSelectedGap(card.type)}
              title={card.description}
              className={cn(
                "flex cursor-pointer flex-col items-start gap-1 rounded-xl border px-4 py-3 text-left transition-colors",
                isSelected
                  ? "border-accent-400 bg-surface-raised ring-1 ring-accent-400/40"
                  : "border-line bg-card hover:border-line-strong hover:bg-surface-raised/50",
              )}
            >
              <span className="flex w-full items-center gap-2 text-meta text-text-muted">
                <Icon
                  className={cn("size-3.5", isSelected && "text-accent-400")}
                  aria-hidden
                />
                {card.label}
              </span>
              <span className="font-mono text-metric font-bold leading-none tabular-nums text-foreground">
                {count}
                <span className="ml-1.5 font-sans text-meta font-normal text-text-muted">
                  od {gaps.ukupnoFirmi} {gaps.nepotpuno ? "pregledanih" : "u bazi"}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <WorkSection
        naslov={`Dopuni: ${leadGapLabel(selectedGap)}`}
        icon={ShieldAlert}
        kriterijum={`firme kojima nedostaje ovaj podatak · prikazano ${gapDetails?.companies.length ?? 0}${gapDetails && gapDetails.companies.length >= 100 ? "+" : ""}`}
        ukupno={ukupnoIzabrane}
        najmanje={gaps.nepotpuno}
        loading={gapDetails === undefined}
        prazno={
          gapDetails !== undefined && gapDetails.companies.length === 0 ? (
            // Prazna vrsta rupe nije gotov posao (A1 §3): ostale vrste su na
            // karticama iznad, sa brojem — tamo je sledeći potez.
            <>
              Nijedna od {gaps.ukupnoFirmi} pregledanih firmi nema rupu „
              {leadGapLabel(selectedGap)}”. Ostale vrste rupa, sa brojem firmi,
              stoje na karticama iznad.
            </>
          ) : undefined
        }
      >
        {gapDetails?.companies.map((company: Doc<"leadCompanies">) => {
          const domen = company.domainNormalized || company.website;
          return (
            <WorkCard
              key={company._id}
              edge={null}
              href={`/leadovi/${company._id}`}
              name={company.name}
              meta={[company.city, company.municipality, company.street]
                .filter(Boolean)
                .join(", ")}
              zasto={
                <>
                  <Chip size="sm" tone={company.origin === "inbound" ? "accent" : "muted"}>
                    {company.origin === "inbound" ? "Inbound" : "Uvoz"}
                    {company.firstSeenSource ? ` · ${company.firstSeenSource}` : ""}
                  </Chip>
                  {domen ? (
                    <Chip size="sm" tone="muted" title={company.website ?? undefined}>
                      {domen}
                    </Chip>
                  ) : (
                    <Chip size="sm" tone="danger">
                      nema sajt
                    </Chip>
                  )}
                  {company.pib ? (
                    <Chip size="sm" tone="muted">
                      PIB {company.pib}
                    </Chip>
                  ) : (
                    <Chip size="sm" tone="warning">
                      nema PIB
                    </Chip>
                  )}
                  {company.addressNeedsVerification && (
                    <Chip size="sm" tone="warning">
                      proveriti adresu
                    </Chip>
                  )}
                  <span className="w-full text-meta text-text-muted">
                    evidentirano {formatDateTime(company.createdAt)}
                  </span>
                </>
              }
              primary={
                <button
                  type="button"
                  onClick={() => setGapFillCompany(company)}
                  className={PRIMARY_ACTION_CLASS}
                >
                  <ShieldAlert className="size-3.5" aria-hidden />
                  Popuni rupu
                </button>
              }
            />
          );
        })}
      </WorkSection>

      {gapDetails?.nepotpuno && (
        <FeedbackNote tone="warning" title="Spisak je iz uzorka">
          Pregledano je {gapDetails.pregledanoFirmi} firmi, koliko upit najviše
          čita. Iza te granice može biti još firmi sa istom rupom.
        </FeedbackNote>
      )}

      {/* Dijalog za popunjavanje konkretne rupe (§9.2) */}
      {gapFillCompany && (
        <LeadGapFillDialog
          workspaceId={workspaceId}
          company={gapFillCompany}
          gapType={selectedGap}
          isOpen
          onOpenChange={(open) => {
            if (!open) setGapFillCompany(null);
          }}
        />
      )}
    </div>
  );
}

function GapsPanelSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
