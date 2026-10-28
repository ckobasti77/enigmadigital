"use client";

import { InfoMere, NazivMere } from "@/components/app/system/naziv-mere";
import { usePrecica } from "@/components/app/use-precica";
import {
  CILJ_KAMPANJE,
  STATUS_KAMPANJE,
  VRSTA_FB_OBJAVE,
  VRSTA_OBJAVE,
  naziv,
  type Recnik,
} from "@/lib/recnik";
import { Grupa, Sekcija } from "./delovi";

/** Sirove vrednosti kakve stižu iz API-ja; ekran ih vidi samo kroz `naziv()`. */
const PRIMERI: { mapa: Recnik; vrednosti: string[]; natpis: string }[] = [
  { natpis: "Vrste objava", mapa: VRSTA_OBJAVE, vrednosti: ["TEXT_POST", "CAROUSEL_ALBUM", "REEL", "STORY"] },
  { natpis: "Facebook objave", mapa: VRSTA_FB_OBJAVE, vrednosti: ["added_photos", "mobile_status_update"] },
  { natpis: "Status kampanje", mapa: STATUS_KAMPANJE, vrednosti: ["ACTIVE", "PAUSED", "WITH_ISSUES"] },
  { natpis: "Cilj kampanje", mapa: CILJ_KAMPANJE, vrednosti: ["OUTCOME_LEADS", "OUTCOME_TRAFFIC", "PERFORMANCE_MAX"] },
];

/** Rečnik i mere (T12): srpski naziv na ekranu, akronim u oblačiću, nepoznato nikad sirovo. */
export function VodicRecnik() {
  const precica = usePrecica("K");
  return (
    <Sekcija
      naslov="Rečnik i mere"
      opis="Mera se zove srpski, a akronim i definicija su u oblačiću koji radi mišem, dodirom i tastaturom. Sirova vrednost iz API-ja ide na ekran samo kroz rečnik."
    >
      <Grupa naslov="Naziv mere">
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3 text-ui text-foreground">
          <NazivMere mera="cena_po_rezultatu" />
          <NazivMere mera="povracaj" />
          <NazivMere mera="stopa_klikova" />
          <NazivMere mera="cena_1000_prikaza" kratko />
        </div>
      </Grupa>

      <Grupa naslov="Zaglavlje tabele koje sortira">
        <div className="flex max-w-md items-center justify-between rounded-lg border border-line px-3 py-2 text-meta text-text-muted">
          <span>Kampanja</span>
          <span className="flex items-center gap-1">
            <button type="button" className="cursor-pointer hover:text-foreground">
              Cena po rezultatu
            </button>
            <InfoMere mera="cena_po_rezultatu" />
          </span>
        </div>
      </Grupa>

      <Grupa naslov="Mape rečnika">
        <dl className="grid max-w-3xl gap-x-6 gap-y-1 text-ui sm:grid-cols-[auto_1fr]">
          {PRIMERI.map((p) => (
            <div key={p.natpis} className="contents">
              <dt className="text-text-muted">{p.natpis}</dt>
              <dd className="text-foreground">
                {p.vrednosti.map((v) => naziv(p.mapa, v)).join(" · ")}
              </dd>
            </div>
          ))}
          <dt className="text-text-muted">Nepoznata vrednost</dt>
          <dd className="text-foreground">{naziv(STATUS_KAMPANJE, "NEW_STATUS_2027")}</dd>
        </dl>
      </Grupa>

      <Grupa naslov="Prečica">
        <p className="text-ui text-foreground">
          Komandna paleta: <kbd className="rounded border border-line px-1.5 font-sans text-meta">{precica}</kbd>
          <span className="text-text-muted"> (na Macu „Cmd K“)</span>
        </p>
      </Grupa>
    </Sekcija>
  );
}
