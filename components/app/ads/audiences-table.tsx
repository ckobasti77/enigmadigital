"use client";

import { useState, useMemo } from "react";
import {
  formatAudienceSize,
  formatAudienceSubtype,
  formatAudienceDeliveryStatus,
} from "@/convex/lib/metaAdsApi";
import { formatDateTime } from "@/lib/format";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Search,
  Users,
  Sparkles,
  Globe,
  Layers,
  HelpCircle,
  AlertTriangle,
  Clock,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface AudienceRow {
  _id: string;
  audienceId: string;
  name: string;
  subtype: string;
  description?: string;
  approximateCountLower?: number;
  approximateCountUpper?: number;
  operationStatus?: string;
  deliveryStatus?: string;
  timeContentUpdated?: number;
  retentionDays?: number;
  ruleAggregation?: string;
  syncedAt: number;
}

interface AudiencesTableProps {
  audiences: AudienceRow[];
}

export function AudiencesTable({ audiences }: AudiencesTableProps) {
  const [search, setSearch] = useState("");
  const [subtypeFilter, setSubtypeFilter] = useState<string>("ALL");

  const filteredAudiences = useMemo(() => {
    return audiences.filter((aud) => {
      // Subtype filter
      if (subtypeFilter !== "ALL") {
        if (subtypeFilter === "CUSTOM" && aud.subtype !== "CUSTOM") return false;
        if (subtypeFilter === "LOOKALIKE" && aud.subtype !== "LOOKALIKE")
          return false;
        if (
          subtypeFilter === "WEBSITE" &&
          aud.subtype !== "WEBSITE" &&
          aud.subtype !== "ENGAGEMENT"
        )
          return false;
        if (
          subtypeFilter === "OTHER" &&
          (aud.subtype === "CUSTOM" ||
            aud.subtype === "LOOKALIKE" ||
            aud.subtype === "WEBSITE" ||
            aud.subtype === "ENGAGEMENT")
        )
          return false;
      }

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = aud.name.toLowerCase().includes(q);
        const matchDesc = aud.description?.toLowerCase().includes(q);
        const matchId = aud.audienceId.toLowerCase().includes(q);
        if (!matchName && !matchDesc && !matchId) return false;
      }

      return true;
    });
  }, [audiences, search, subtypeFilter]);

  return (
    <div className="flex flex-col gap-4">
      {/* Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative w-64 sm:w-80">
            <Search className="absolute left-2.5 top-2.5 size-4 text-text-muted" />
            <Input
              placeholder="Pretraži publike po nazivu ili ID-ju..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs"
            />
          </div>
        </div>

        {/* Subtype Filter Pills */}
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-surface-sunken p-1 text-xs">
          <button
            type="button"
            onClick={() => setSubtypeFilter("ALL")}
            className={cn(
              "rounded px-2.5 py-1 font-medium transition-colors",
              subtypeFilter === "ALL"
                ? "bg-surface-raised text-foreground shadow-sm"
                : "text-text-muted hover:text-foreground",
            )}
          >
            Sve ({audiences.length})
          </button>
          <button
            type="button"
            onClick={() => setSubtypeFilter("CUSTOM")}
            className={cn(
              "flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors",
              subtypeFilter === "CUSTOM"
                ? "bg-surface-raised text-foreground shadow-sm"
                : "text-text-muted hover:text-foreground",
            )}
          >
            <Users className="size-3.5" />
            Korisničke liste (
            {audiences.filter((a) => a.subtype === "CUSTOM").length})
          </button>
          <button
            type="button"
            onClick={() => setSubtypeFilter("LOOKALIKE")}
            className={cn(
              "flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors",
              subtypeFilter === "LOOKALIKE"
                ? "bg-surface-raised text-foreground shadow-sm"
                : "text-text-muted hover:text-foreground",
            )}
          >
            <Sparkles className="size-3.5" />
            Lookalike (
            {audiences.filter((a) => a.subtype === "LOOKALIKE").length})
          </button>
          <button
            type="button"
            onClick={() => setSubtypeFilter("WEBSITE")}
            className={cn(
              "flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors",
              subtypeFilter === "WEBSITE"
                ? "bg-surface-raised text-foreground shadow-sm"
                : "text-text-muted hover:text-foreground",
            )}
          >
            <Globe className="size-3.5" />
            Veb-sajt / Piksel (
            {
              audiences.filter(
                (a) => a.subtype === "WEBSITE" || a.subtype === "ENGAGEMENT",
              ).length
            }
            )
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-line bg-surface-raised shadow-card">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-line hover:bg-transparent">
              <TableHead className="w-[300px] text-xs font-semibold text-text-muted">
                Naziv publike
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-muted">
                Tip
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-muted">
                Procenjena veličina
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-muted">
                Status isporuke
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-muted">
                Poslednja izmena
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-muted">
                Zadržavanje
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAudiences.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-32 text-center text-sm text-text-muted"
                >
                  {audiences.length === 0
                    ? "Nema sinhronizovanih publika za ovaj Meta Ad nalog."
                    : "Nijedna publika ne odgovara unetom filteru pretrage."}
                </TableCell>
              </TableRow>
            ) : (
              filteredAudiences.map((aud) => {
                const sizeFmt = formatAudienceSize(
                  aud.approximateCountLower,
                  aud.approximateCountUpper,
                );
                const statusFmt = formatAudienceDeliveryStatus(
                  aud.deliveryStatus,
                  aud.operationStatus,
                );

                return (
                  <TableRow
                    key={aud._id}
                    className="border-b border-line/60 transition-colors hover:bg-surface-sunken/40"
                  >
                    {/* Naziv i ID */}
                    <TableCell className="py-3.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-foreground text-sm">
                          {aud.name}
                        </span>
                        {aud.description && (
                          <span className="line-clamp-1 text-xs text-text-muted">
                            {aud.description}
                          </span>
                        )}
                        <span className="font-mono text-[10px] text-text-muted/80">
                          ID: {aud.audienceId}
                        </span>
                      </div>
                    </TableCell>

                    {/* Tip */}
                    <TableCell className="py-3.5">
                      <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-sunken px-2.5 py-0.5 text-xs font-medium text-text-muted">
                        {aud.subtype === "LOOKALIKE" ? (
                          <Sparkles className="size-3 text-accent-400" />
                        ) : aud.subtype === "CUSTOM" ? (
                          <Users className="size-3 text-success" />
                        ) : aud.subtype === "WEBSITE" ? (
                          <Globe className="size-3 text-warning" />
                        ) : (
                          <Layers className="size-3" />
                        )}
                        <span>{formatAudienceSubtype(aud.subtype)}</span>
                      </div>
                    </TableCell>

                    {/* Veličina (raspon) */}
                    <TableCell className="py-3.5">
                      {sizeFmt.state === "value" ? (
                        <span className="font-mono text-sm font-semibold text-foreground">
                          {sizeFmt.label}
                        </span>
                      ) : sizeFmt.state === "thresholded" ? (
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning cursor-help">
                              <AlertTriangle className="size-3" />
                              Ispod praga
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs text-xs">
                              {sizeFmt.reason ||
                                "Publika je ispod praga prikaza (< 1.000 korisnika). Meta štiti privatnost korisnika."}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="inline-flex items-center gap-1 font-mono text-sm text-text-muted cursor-help">
                              —
                              <HelpCircle className="size-3 text-text-muted/60" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">
                              {sizeFmt.reason ||
                                "Meta nije poslala procenu veličine za ovu publiku."}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>

                    {/* Status isporuke */}
                    <TableCell className="py-3.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
                          statusFmt.tone === "success" &&
                            "border border-success/30 bg-success/10 text-success",
                          statusFmt.tone === "progress" &&
                            "border border-accent-400/30 bg-accent-400/10 text-accent-400",
                          statusFmt.tone === "warning" &&
                            "border border-warning/30 bg-warning/10 text-warning",
                          statusFmt.tone === "danger" &&
                            "border border-danger/30 bg-danger/10 text-danger",
                          statusFmt.tone === "muted" &&
                            "border border-line bg-surface-sunken text-text-muted",
                        )}
                      >
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            statusFmt.tone === "success" && "bg-success",
                            statusFmt.tone === "progress" && "bg-accent-400",
                            statusFmt.tone === "warning" && "bg-warning",
                            statusFmt.tone === "danger" && "bg-danger",
                            statusFmt.tone === "muted" && "bg-text-muted",
                          )}
                        />
                        {statusFmt.label}
                      </span>
                    </TableCell>

                    {/* Poslednja izmena */}
                    <TableCell className="py-3.5 text-xs text-text-muted">
                      {aud.timeContentUpdated ? (
                        <div className="flex items-center gap-1 font-mono text-xs">
                          <Calendar className="size-3 text-text-muted/70" />
                          {formatDateTime(aud.timeContentUpdated)}
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>

                    {/* Zadržavanje */}
                    <TableCell className="py-3.5 text-xs text-text-muted">
                      {aud.retentionDays ? (
                        <div className="flex items-center gap-1">
                          <Clock className="size-3 text-text-muted/70" />
                          <span>{aud.retentionDays} dana</span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
