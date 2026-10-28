"use client";

import { useState } from "react";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { formatDate, formatDateSpan, formatDuration, formatPercent } from "@/lib/format";
import { Grupa, Sekcija } from "./delovi";

const PERIODI = [
  { value: "7d", label: "Poslednjih 7 dana" },
  { value: "28d", label: "Poslednjih 28 dana" },
  { value: "90d", label: "Poslednjih 90 dana" },
];

const TEMPERATURE = [
  { value: "nova_firma", label: "Nova firma" },
  { value: "cold", label: "Cold" },
  { value: "warm", label: "Warm" },
  { value: "hot", label: "Hot", disabled: false },
];

const KANALI = [
  {
    label: "Društvene mreže",
    options: [
      { value: "ig", label: "Instagram" },
      { value: "fb", label: "Facebook" },
      { value: "th", label: "Threads" },
    ],
  },
  { label: "Video", options: [{ value: "yt", label: "YouTube" }] },
];

/** Meni za izbor i formati (T11): jedan primitiv, jedan zapis datuma, vremena i procenta. */
export function VodicIzbor() {
  const [period, setPeriod] = useState<string | null>("28d");
  const [temp, setTemp] = useState<string | null>(null);
  const [kanal, setKanal] = useState<string | null>("ig");

  return (
    <Sekcija
      naslov="Izbor i formati"
      opis="Jedan meni za izbor sa imenom, tastaturom i 44 px na dodir; datum, vreme, trajanje i procenat pišu se samo kroz jedan zapis."
    >
      <Grupa naslov="Meni za izbor">
        <div className="grid max-w-3xl gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="primer-period">Period</Label>
            <Select
              id="primer-period"
              label="Period"
              value={period}
              onValueChange={setPeriod}
              options={PERIODI}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="primer-temperatura">Temperatura</Label>
            <Select
              id="primer-temperatura"
              label="Temperatura"
              value={temp}
              onValueChange={setTemp}
              placeholder="Izaberi temperaturu"
              options={TEMPERATURE}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="primer-kanal">Kanal</Label>
            <Select
              id="primer-kanal"
              label="Kanal"
              value={kanal}
              onValueChange={setKanal}
              options={KANALI}
            />
          </div>
        </div>
        <div className="flex max-w-3xl flex-wrap items-center gap-4">
          <Select
            label="Mala veličina"
            size="sm"
            className="w-48"
            value={period}
            onValueChange={setPeriod}
            options={PERIODI}
          />
          <Select
            label="Onemogućeno"
            disabled
            className="w-48"
            value="7d"
            onValueChange={() => {}}
            options={PERIODI}
          />
          <Select
            label="Sa greškom"
            invalid
            className="w-48"
            value={null}
            placeholder="Izaberi vrednost"
            onValueChange={() => {}}
            options={PERIODI}
          />
        </div>
        <p className="max-w-3xl text-meta text-text-muted">
          Strelice, Home/End i kucanje biraju stavku, Enter ili razmak potvrđuju, Esc zatvara.
        </p>
      </Grupa>

      <Grupa naslov="Formati">
        <dl className="grid max-w-3xl grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-ui">
          <dt className="text-text-muted">Datum</dt>
          <dd className="text-foreground">{formatDate("2026-10-27")}</dd>
          <dt className="text-text-muted">Raspon</dt>
          <dd className="text-foreground">{formatDateSpan("2026-10-01", "2026-10-15")}</dd>
          <dt className="text-text-muted">Trajanje</dt>
          <dd className="text-foreground">{formatDuration(61)}</dd>
          <dt className="text-text-muted">Procenat</dt>
          <dd className="text-foreground">{formatPercent(0.538)}</dd>
        </dl>
      </Grupa>
    </Sekcija>
  );
}
