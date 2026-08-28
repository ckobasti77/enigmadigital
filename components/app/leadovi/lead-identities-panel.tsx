"use client";

import { useState } from "react";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  Phone,
  Mail,
  Globe,
  MessageCircle,
  Copy,
  Check,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  User,
  ExternalLink,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProvenanceBadge, type ProvenanceInfo } from "./provenance-badge";
import {
  identityKindLabel,
  lawfulBasisLabel,
  personRoleLabel,
} from "./lead-labels";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type LeadIdentitiesPanelProps = {
  identities: Doc<"leadIdentities">[];
  people: Doc<"leadPeople">[];
  provenanceByField: Record<string, ProvenanceInfo>;
};

function InstagramIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function FacebookIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

export function LeadIdentitiesPanel({
  identities,
  people,
  provenanceByField,
}: LeadIdentitiesPanelProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  const getPerson = (personId?: Doc<"leadIdentities">["personId"]) => {
    if (!personId) return null;
    return people.find((p) => p._id === personId) ?? null;
  };

  const getKindIcon = (kind: string) => {
    switch (kind) {
      case "phone":
        return <Phone className="size-4 text-accent-400" />;
      case "email":
        return <Mail className="size-4 text-info" />;
      case "instagram":
        return <InstagramIcon className="size-4 text-pink-400" />;
      case "facebook":
        return <FacebookIcon className="size-4 text-blue-400" />;
      case "website":
        return <Globe className="size-4 text-success" />;
      default:
        return <MessageCircle className="size-4 text-text-muted" />;
    }
  };

  return (
    <Card className="border-line bg-surface">
      <CardHeader className="border-b border-line pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-semibold text-foreground">
              Kontakti i komunikacioni kanali ({identities.length})
            </CardTitle>
            <CardDescription className="text-xs text-text-muted mt-0.5">
              Svaki kanal komunikacije zasebno, sa evidencijom pravnog osnova (ZZPL) i porekla.
            </CardDescription>
          </div>
          <span className="rounded bg-surface-raised border border-line px-2 py-0.5 text-micro font-medium text-text-muted">
            §2.3 & §8 Pravila obrade
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {identities.length === 0 ? (
          <div className="py-8 text-center text-xs text-text-muted">
            Nema zabeleženih kanala komunikacije za ovu firmu.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {identities.map((identity) => {
              const person = getPerson(identity.personId);
              const prov =
                provenanceByField[`identity_${identity._id}`] ??
                provenanceByField[String(identity._id)] ??
                provenanceByField[`${identity._id}:value`];

              const hasLawfulBasis = Boolean(identity.lawfulBasis && identity.lawfulBasis.trim());
              const hasSourceUrl = Boolean(identity.sourceUrl && identity.sourceUrl.trim());
              const isCompliant = hasLawfulBasis && hasSourceUrl;

              return (
                <div
                  key={identity._id}
                  className={cn(
                    "flex flex-col gap-3 p-3.5 transition-colors sm:flex-row sm:items-center sm:justify-between",
                    !isCompliant && "bg-warning/5 border-l-2 border-l-warning",
                  )}
                >
                  {/* Leva strana: Vrsta kontakta, vrednost, nosilac */}
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="mt-0.5 rounded-lg border border-line bg-surface-raised p-2 shrink-0">
                      {getKindIcon(identity.kind)}
                    </div>

                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-micro font-bold uppercase tracking-wider text-text-muted">
                          {identityKindLabel(identity.kind)}
                        </span>

                        {identity.isVerified && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-success/10 px-1.5 py-0.2 text-micro font-semibold text-success border border-success/30">
                            <ShieldCheck className="size-3" />
                            Verifikovan
                          </span>
                        )}

                        {/* Poreklo vrednosti kontakta */}
                        <ProvenanceBadge
                          provenance={prov}
                          fieldName={`${identityKindLabel(identity.kind)}`}
                        />
                      </div>

                      {/* Vrednost kontakta */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground select-all break-all">
                          {identity.value}
                        </span>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(identity._id, identity.value)}
                          className="h-6 w-6 p-0 text-text-muted hover:text-foreground cursor-pointer"
                          title="Kopiraj kontakt"
                        >
                          {copiedId === identity._id ? (
                            <Check className="size-3 text-success" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </Button>
                      </div>

                      {/* Nosilac kontakta: ako je vezano za osobu */}
                      {person ? (
                        <div className="flex items-center gap-1.5 text-xs text-text-muted">
                          <User className="size-3 text-text-soft" />
                          <span>Kontakt osoba:</span>
                          <strong className="text-foreground font-medium">{person.name}</strong>
                          <span className="rounded bg-surface-raised px-1.5 py-0.2 text-micro font-medium text-text-muted border border-line">
                            {personRoleLabel(person.role)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-micro text-text-soft">
                          Centrala firme (direktan kontakt pravnog lica)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Desna strana: Pravni osnov (ZZPL §8) i status obaveštavanja */}
                  <div className="flex flex-col gap-1.5 rounded-lg border border-line-soft bg-surface-raised/40 p-2.5 sm:max-w-xs sm:w-full shrink-0 text-micro">
                    {isCompliant ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-text-muted">Pravni osnov:</span>
                          <span className="font-semibold text-foreground text-right" title={identity.lawfulBasis}>
                            {lawfulBasisLabel(identity.lawfulBasis)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-1">
                          <span className="text-text-muted">Izvor:</span>
                          {identity.sourceUrl.startsWith("http") ? (
                            <a
                              href={identity.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-accent-400 hover:underline truncate max-w-[140px]"
                              title={identity.sourceUrl}
                            >
                              <span>{identity.sourceUrl.replace(/^https?:\/\/(www\.)?/, "")}</span>
                              <ExternalLink className="size-2.5 shrink-0" />
                            </a>
                          ) : (
                            <span className="text-text-muted truncate max-w-[140px]" title={identity.sourceUrl}>
                              {identity.sourceUrl}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-1.5 text-warning">
                        <ShieldAlert className="size-4 shrink-0 mt-0.5" />
                        <div className="flex flex-col">
                          <span className="font-bold">ZZPL Upozorenje</span>
                          <span className="text-micro leading-tight">
                            Podatak bez zabeleženog pravnog osnova ili izvora. Po ZZPL-u nema osnova za obradu.
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Status obaveštavanja lica (ZZPL rok od 30 dana) */}
                    <div className="flex items-center justify-between border-t border-line-soft pt-1">
                      <span className="text-text-muted">Obaveštenje lica:</span>
                      {identity.dataSubjectNotifiedAt ? (
                        <span className="font-medium text-success">
                          Obavešten {formatDateTime(identity.dataSubjectNotifiedAt)}
                        </span>
                      ) : (
                        <span className="font-medium text-warning" title="Po ZZPL rok za obaveštavanje je 30 dana od preuzimanja podataka">
                          Lice nije obavešteno
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
