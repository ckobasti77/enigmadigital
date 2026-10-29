"use client";

import { useState } from "react";

import { api } from "@/convex/_generated/api";
import { SETTINGS_TEXT } from "@/lib/prostor";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SamoZa } from "@/components/app/samo-za";
import { useMoze, useProjekatMutation } from "@/components/app/projekat-provider";
import { useProjekatQueryResult } from "@/components/app/prostor/podaci/projekat";
import { useRadnja } from "@/components/app/prostor/podesavanja/use-radnja";

/** Najduži opis (provera na serveru je konačna). */
const NAJVECI_OPIS = 500;

/**
 * Opis projekta (paritet red 28, P5), pod karticom „Projekat“. Menja ga
 * vlasnik projekta; ostali vide tekst bez dugmeta. Prazno polje briše opis.
 * Čita ga `projekat.get`, koji posmatraču nije dostupan, pa se njemu ne crta.
 */
export function OpisProjekta() {
  const sme = useMoze("urednik");
  const projekat = useProjekatQueryResult(api.prostor.projekat.get, sme ? {} : "skip");
  if (projekat.data === undefined) return null;
  return <Opis key={projekat.data._id} sacuvan={projekat.data.description} />;
}

function Opis({ sacuvan }: { sacuvan: string }) {
  const postaviOpis = useProjekatMutation(api.prostor.projekat.postaviOpis);
  const { busy, run } = useRadnja();
  const [tekst, setTekst] = useState(sacuvan);
  const izmenjeno = tekst.trim() !== sacuvan;

  return (
    <section aria-labelledby="opis-projekta" className="mt-8 max-w-xl space-y-3 border-t border-line pt-6">
      <div className="space-y-1">
        <h2 id="opis-projekta" className="text-copy font-semibold text-foreground">
          Opis projekta
        </h2>
        <p className="text-ui text-text-muted">Kratko šta projekat radi; vidi ga ceo tim.</p>
      </div>
      <SamoZa uloga="owner" inace={<p className="text-ui text-text-secondary">{sacuvan || "Opis nije upisan."}</p>}>
        <div className="space-y-1.5">
          <Label htmlFor="opis-polje">Opis</Label>
          <Textarea
            id="opis-polje"
            value={tekst}
            maxLength={NAJVECI_OPIS}
            rows={3}
            onChange={(e) => setTekst(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !izmenjeno}
          onClick={() =>
            void run(
              () => postaviOpis({ opis: tekst.trim() === "" ? null : tekst.trim() }),
              SETTINGS_TEXT.saved,
              SETTINGS_TEXT.notSaved,
            )
          }
        >
          Sačuvaj opis
        </Button>
      </SamoZa>
    </section>
  );
}
