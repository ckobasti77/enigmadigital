"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { formatNumber, formatPercent } from "@/lib/format";
import type { AgeGenderDataPoint } from "./population-pyramid-chart";
import type { RankingDataPoint } from "./demographics-ranking-list";

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
      // Fall back
    }
  }
  return raw;
}

export function DemographicsTableView({
  ageGender,
  countries,
  cities,
}: {
  ageGender: AgeGenderDataPoint[];
  countries: RankingDataPoint[];
  cities: RankingDataPoint[];
}) {
  // Age x Gender table calculation
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

  // Countries table calculation
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

  // Cities table calculation
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

  const hasU = totalU > 0;

  return (
    <div className="flex flex-col gap-8">
      {/* 1. Uzrast i pol */}
      <Card className="p-6 shadow-card ring-line">
        <p className="heading-caps text-micro font-medium text-text-muted">
          Tabelarni prikaz
        </p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">
          Uzrast i pol
        </h2>

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
              {ageRows.map((r) => (
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
              ))}
            </tbody>
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
          <h2 className="mt-1 text-lg font-semibold text-foreground">
            Top Države ({countryRows.length})
          </h2>

          <div className="mt-4 max-h-96 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line text-text-muted sticky top-0 bg-surface">
                <tr>
                  <th className="py-2.5 font-medium w-12">#</th>
                  <th className="py-2.5 font-medium">Država</th>
                  <th className="py-2.5 text-right font-medium">Broj</th>
                  <th className="py-2.5 text-right font-medium">Udeo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/40">
                {countryRows.map((c) => (
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
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Gradovi */}
        <Card className="p-6 shadow-card ring-line">
          <p className="heading-caps text-micro font-medium text-text-muted">
            Tabelarni prikaz
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">
            Top Gradovi ({cityRows.length})
          </h2>

          <div className="mt-4 max-h-96 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line text-text-muted sticky top-0 bg-surface">
                <tr>
                  <th className="py-2.5 font-medium w-12">#</th>
                  <th className="py-2.5 font-medium">Grad</th>
                  <th className="py-2.5 text-right font-medium">Broj</th>
                  <th className="py-2.5 text-right font-medium">Udeo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/40">
                {cityRows.map((c) => (
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
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <p className="text-xs text-text-muted">
        Instagram vraća najviše 45 stavki i računa samo posetioce za koje ima
        demografske podatke, pa je zbir manji od ukupnog broja pratilaca.
      </p>
    </div>
  );
}
