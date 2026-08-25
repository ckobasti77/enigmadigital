"use client";

import { useMemo } from "react";
import { Globe, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatNumber, formatPercent } from "@/lib/format";
import { ChartEmpty } from "@/components/app/chart-states";

export type AgeGenderDataPoint = {
  age: string;
  gender: string;
  value: number;
};

export type RankingDataPoint = {
  name: string;
  value: number;
};

const displayNames =
  typeof Intl !== "undefined" && typeof Intl.DisplayNames !== "undefined"
    ? new Intl.DisplayNames(["sr-Latn-RS", "sr-RS", "sr"], { type: "region" })
    : null;

function resolveLocationName(raw: string, isCountry: boolean): string {
  if (!isCountry) return raw;
  if (raw === "Ostalo") return "Ostalo";
  if (raw.length === 2 && displayNames) {
    try {
      const localized = displayNames.of(raw.toUpperCase());
      if (localized) return localized;
    } catch {
      // Fallback
    }
  }
  return raw;
}

export function ThreadsDemographicsTable({
  state,
  reason,
  ageGender,
  countries,
  cities,
}: {
  state: "value" | "suppressed" | "empty";
  reason?: string;
  ageGender: AgeGenderDataPoint[];
  countries: RankingDataPoint[];
  cities: RankingDataPoint[];
}) {
  const { ageRows, totalF, totalM, totalU, grandTotalAge } = useMemo(() => {
    let tF = 0;
    let tM = 0;
    let tU = 0;
    const byGroup = new Map<string, { F: number; M: number; U: number }>();

    for (const item of ageGender) {
      const g = item.gender.toUpperCase();
      const group = byGroup.get(item.age) ?? { F: 0, M: 0, U: 0 };
      if (g === "F") {
        group.F += item.value;
        tF += item.value;
      } else if (g === "M") {
        group.M += item.value;
        tM += item.value;
      } else {
        group.U += item.value;
        tU += item.value;
      }
      byGroup.set(item.age, group);
    }

    const rowList = Array.from(byGroup.entries()).map(([age, g]) => {
      const rowTotal = g.F + g.M + g.U;
      return {
        age,
        F: g.F,
        M: g.M,
        U: g.U,
        total: rowTotal,
      };
    });

    rowList.sort((a, b) => a.age.localeCompare(b.age));
    const gTotal = tF + tM + tU;

    return {
      ageRows: rowList,
      totalF: tF,
      totalM: tM,
      totalU: tU,
      grandTotalAge: Math.max(1, gTotal),
    };
  }, [ageGender]);

  const countryRows = useMemo(() => {
    const sorted = [...countries].sort((a, b) => b.value - a.value);
    const sum = sorted.reduce((acc, c) => acc + c.value, 0);
    return sorted.map((c, i) => ({
      rank: i + 1,
      name: resolveLocationName(c.name, true),
      value: c.value,
      pct: sum > 0 ? c.value / sum : 0,
    }));
  }, [countries]);

  const cityRows = useMemo(() => {
    const sorted = [...cities].sort((a, b) => b.value - a.value);
    const sum = sorted.reduce((acc, c) => acc + c.value, 0);
    return sorted.map((c, i) => ({
      rank: i + 1,
      name: resolveLocationName(c.name, false),
      value: c.value,
      pct: sum > 0 ? c.value / sum : 0,
    }));
  }, [cities]);

  if (state === "suppressed" || state === "empty") {
    return (
      <Card className="p-6 shadow-card ring-line">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="size-4 text-accent-400" aria-hidden="true" />
          <h2 className="text-base font-semibold text-foreground">
            Demografija pratilaca
          </h2>
        </div>
        <ChartEmpty
          reason={
            reason ??
            (state === "suppressed"
              ? "Threads demografija zahteva najmanje 100 pratilaca da bi bila dostupna kroz API (§5.4)."
              : "Nema zabeleženih demografskih podataka za Threads nalog.")
          }
        />
      </Card>
    );
  }

  const hasU = totalU > 0;

  return (
    <div className="flex flex-col gap-8">
      {/* 1. Uzrast i pol */}
      <Card className="p-6 shadow-card ring-line">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="heading-caps text-micro font-medium text-text-muted">
              Tabelarni prikaz
            </p>
            <h2 className="mt-1 text-base font-semibold text-foreground">
              Uzrast i pol
            </h2>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <Users className="size-3.5" aria-hidden="true" />
            <span>Demografski raspored</span>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-line text-text-muted">
              <tr>
                <th className="py-2.5 font-medium">Uzrasna grupa</th>
                <th className="py-2.5 text-right font-medium">Žene</th>
                <th className="py-2.5 text-right font-medium">Muškarci</th>
                {hasU && (
                  <th className="py-2.5 text-right font-medium">Nepoznato</th>
                )}
                <th className="py-2.5 text-right font-medium">Ukupno</th>
                <th className="py-2.5 text-right font-medium">Udeo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/40">
              {ageRows.length > 0 ? (
                ageRows.map((r) => (
                  <tr key={r.age} className="hover:bg-surface-raised/50">
                    <td className="py-2 font-medium text-foreground">{r.age}</td>
                    <td className="py-2 text-right font-mono text-text-secondary">
                      {formatNumber(r.F)}
                    </td>
                    <td className="py-2 text-right font-mono text-text-secondary">
                      {formatNumber(r.M)}
                    </td>
                    {hasU && (
                      <td className="py-2 text-right font-mono text-text-secondary">
                        {formatNumber(r.U)}
                      </td>
                    )}
                    <td className="py-2 text-right font-mono font-semibold text-foreground">
                      {formatNumber(r.total)}
                    </td>
                    <td className="py-2 text-right font-mono text-text-muted">
                      {formatPercent(r.total / grandTotalAge)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={hasU ? 6 : 5}
                    className="py-4 text-center text-text-muted"
                  >
                    Nema podataka o uzrastu i polu za ovaj snimak.
                  </td>
                </tr>
              )}
            </tbody>
            {ageRows.length > 0 && (
              <tfoot className="border-t border-line font-semibold text-foreground">
                <tr>
                  <td className="py-2.5">Ukupno</td>
                  <td className="py-2.5 text-right font-mono">
                    {formatNumber(totalF)}
                  </td>
                  <td className="py-2.5 text-right font-mono">
                    {formatNumber(totalM)}
                  </td>
                  {hasU && (
                    <td className="py-2.5 text-right font-mono">
                      {formatNumber(totalU)}
                    </td>
                  )}
                  <td className="py-2.5 text-right font-mono">
                    {formatNumber(totalF + totalM + totalU)}
                  </td>
                  <td className="py-2.5 text-right font-mono">100.0%</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* 2 & 3. Države i Gradovi */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Države */}
        <Card className="p-6 shadow-card ring-line">
          <p className="heading-caps text-micro font-medium text-text-muted">
            Tabelarni prikaz
          </p>
          <h2 className="mt-1 text-base font-semibold text-foreground">
            Top Države ({countryRows.length})
          </h2>

          <div className="mt-4 max-h-80 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-surface border-b border-line text-text-muted">
                <tr>
                  <th className="py-2.5 font-medium w-12">#</th>
                  <th className="py-2.5 font-medium">Država</th>
                  <th className="py-2.5 text-right font-medium">Broj</th>
                  <th className="py-2.5 text-right font-medium">Udeo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/40">
                {countryRows.length > 0 ? (
                  countryRows.map((c) => (
                    <tr key={c.rank} className="hover:bg-surface-raised/50">
                      <td className="py-2 font-mono text-text-muted">{c.rank}</td>
                      <td className="py-2 font-medium text-foreground">{c.name}</td>
                      <td className="py-2 text-right font-mono font-semibold text-foreground">
                        {formatNumber(c.value)}
                      </td>
                      <td className="py-2 text-right font-mono text-text-muted">
                        {formatPercent(c.pct)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-text-muted">
                      Nema podataka o državama.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Gradovi */}
        <Card className="p-6 shadow-card ring-line">
          <p className="heading-caps text-micro font-medium text-text-muted">
            Tabelarni prikaz
          </p>
          <h2 className="mt-1 text-base font-semibold text-foreground">
            Top Gradovi ({cityRows.length})
          </h2>

          <div className="mt-4 max-h-80 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-surface border-b border-line text-text-muted">
                <tr>
                  <th className="py-2.5 font-medium w-12">#</th>
                  <th className="py-2.5 font-medium">Grad</th>
                  <th className="py-2.5 text-right font-medium">Broj</th>
                  <th className="py-2.5 text-right font-medium">Udeo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/40">
                {cityRows.length > 0 ? (
                  cityRows.map((c) => (
                    <tr key={c.rank} className="hover:bg-surface-raised/50">
                      <td className="py-2 font-mono text-text-muted">{c.rank}</td>
                      <td className="py-2 font-medium text-foreground">{c.name}</td>
                      <td className="py-2 text-right font-mono font-semibold text-foreground">
                        {formatNumber(c.value)}
                      </td>
                      <td className="py-2 text-right font-mono text-text-muted">
                        {formatPercent(c.pct)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-text-muted">
                      Nema podataka o gradovima.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <p className="text-xs text-text-muted">
        Napomena: Threads demografski uvid zahteva najmanje 100 pratilaca i računa samo korisnike sa dostupnim demografskim profilom (§5.4).
      </p>
    </div>
  );
}
