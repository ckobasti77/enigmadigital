"use client";

import { useMemo, useState } from "react";
import { MessageSquareReply, PhoneCall, Trophy } from "lucide-react";
import {
  izvedi,
  izvediProfil,
  type Dogadjaj,
} from "@/convex/lib/napredak";
import { ActivityMap } from "@/components/app/napredak/activity-map";
import {
  ikonaDostignuca,
  ikonaMisije,
} from "@/components/app/napredak/napredak-ikone";
import { napredakZaKarticu } from "@/components/app/napredak/use-napredak";
import { XpBroj } from "@/components/app/napredak/xp-broj";
import { LevelUpBanner } from "@/components/app/system/level-up-banner";
import { MissionCard } from "@/components/app/system/mission-card";
import { PlayerCard } from "@/components/app/system/player-card";
import { AchievementBadge } from "@/components/app/system/reward-badges";
import { Button } from "@/components/ui/button";
import { formatDate, formatNumber } from "@/lib/format";
import { NAPREDAK_ULAZ, stanjeZaOdgovor } from "../fixtures-napredak";
import { Grupa, Sekcija } from "./delovi";

/**
 * Napredak u vodiču — STVARNI primeri (B5).
 *
 * Ništa ovde nije upisano kao rezultat. Ulaz je isti sintetički skup događaja
 * koji koristi razvojni prikaz (`fixtures-napredak.ts`), a nivo, XP, misije,
 * dostignuća i mapa se izvode pravilima iz `convex/lib/napredak.ts` — istim
 * koja rade na produkciji. Dugme dodaje stvaran događaj, pa se vidi šta
 * pravilo stvarno radi: četvrti poziv ne pomera završenu misiju, a treći
 * odgovor na komentar zatvara dan i donosi bonus.
 */
export function VodicNapredak() {
  const [dodati, setDodati] = useState<Dogadjaj[]>([]);
  const [nivo, setNivo] = useState(0);

  const ulaz = useMemo(
    () => ({
      ...NAPREDAK_ULAZ,
      dogadjaji: [...NAPREDAK_ULAZ.dogadjaji, ...dodati],
    }),
    [dodati],
  );
  const stanje = useMemo(() => izvedi(ulaz), [ulaz]);
  const profil = useMemo(
    () => izvediProfil({ ...ulaz, zakljuceniDani: [] }),
    [ulaz],
  );

  const dodaj = (vrsta: "dodir" | "moderacija") => {
    const at = Date.now();
    const redni = dodati.length + 1;
    setDodati((lista) => [
      ...lista,
      {
        id: `vodic_${redni}`,
        vrsta,
        at,
        upisanAt: at,
        autor: NAPREDAK_ULAZ.korisnik,
        ...(vrsta === "dodir"
          ? { firma: `vodic_firma_${redni}`, podvrsta: "poziv" }
          : { podvrsta: "reply", meta: `ig:vodic_${redni}` }),
      },
    ]);
  };

  if (!stanje.ukljucen || !profil.ukljucen) return null;
  const kartica = napredakZaKarticu(stanjeZaOdgovor(stanje), 0);

  return (
    <Sekcija
      naslov="Napredak iz pravila"
      opis="Isti događaji koje koristi razvojni prikaz, provučeni kroz prava pravila. Dugme dodaje događaj; sve ispod je izvedeno, ništa nije upisano rukom."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => dodaj("dodir")}>
          <PhoneCall /> Zabeleži poziv (+10 XP)
        </Button>
        <Button variant="secondary" onClick={() => dodaj("moderacija")}>
          <MessageSquareReply /> Odgovori na komentar (+5 XP)
        </Button>
        <Button variant="outline" onClick={() => setNivo((n) => n + 1)}>
          <Trophy /> Prikaži nov nivo
        </Button>
        <Button variant="ghost" onClick={() => setDodati([])}>
          Vrati na početak
        </Button>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Grupa naslov="Kartica igrača i XP">
          <div className="flex items-center gap-3">
            <div className="w-48 rounded-lg border border-line-soft">
              <PlayerCard initials="TO" title="Enigma IT (probni)" progress={kartica} />
            </div>
            <div className="w-11 rounded-lg border border-line-soft">
              <PlayerCard initials="TO" title="Enigma IT (probni)" progress={kartica} rail />
            </div>
          </div>
          <p>
            <XpBroj value={stanje.xp.ukupno} className="text-hero text-xp" />
            <span className="text-copy text-text-muted">
              {" "}
              / {formatNumber(stanje.nivo.xpDo)} XP
            </span>
          </p>
          <p className="text-ui text-text-muted">
            Nivo {stanje.nivo.broj} · {stanje.nivo.zvanje} · niz{" "}
            {stanje.niz.dani} · danas +{formatNumber(stanje.xp.danas)} XP ·
            bonus {stanje.bonus.osvojen ? "osvojen" : "nije osvojen"}
          </p>
        </Grupa>

        <Grupa naslov="Misije dana">
          <div className="grid gap-4 md:grid-cols-3">
            {stanje.misije.map((m) => (
              <MissionCard
                key={m.kljuc}
                title={m.naslov}
                icon={ikonaMisije(m.kljuc)}
                value={m.napredak}
                max={m.cilj}
                xp={m.xp}
                done={m.zavrsena}
              />
            ))}
          </div>
        </Grupa>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Grupa naslov={`Dostignuća · ${profil.otkljucano} / ${profil.ukupno}`}>
          <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
            {profil.dostignuca.slice(0, 9).map((d) => (
              <li key={d.kljuc} className="min-w-0">
                <AchievementBadge
                  icon={ikonaDostignuca(d.kljuc)}
                  title={d.naziv}
                  description={d.uslov}
                  progress={
                    d.otkljucanoAt === null && d.napredak
                      ? `${d.napredak.vrednost} / ${d.napredak.cilj}`
                      : undefined
                  }
                  rarity={d.retkost}
                  locked={d.otkljucanoAt === null}
                  unlockedAt={
                    d.otkljucanoAt === null
                      ? undefined
                      : formatDate(d.otkljucanoAt)
                  }
                />
              </li>
            ))}
          </ul>
        </Grupa>
        <Grupa naslov="Mapa aktivnosti">
          <ActivityMap
            dani={profil.mapa.dani}
            maks={profil.mapa.maks}
            danas={stanje.dan}
          />
        </Grupa>
      </div>

      {nivo > 0 && (
        <LevelUpBanner
          key={nivo}
          level={stanje.nivo.broj}
          rank={stanje.nivo.zvanje}
          tier={stanje.nivo.rang}
          onDismiss={() => setNivo(0)}
        />
      )}
    </Sekcija>
  );
}
