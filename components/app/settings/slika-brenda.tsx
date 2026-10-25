"use client";

/* eslint-disable @next/next/no-img-element -- slika dolazi iz Convex skladišta (potpisan URL), ne kroz next/image */
import { useId, useRef, useState } from "react";
import { ImageUp, LoaderCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackLine } from "@/components/app/feedback";
import { useProjekatMutation } from "@/components/app/projekat-provider";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { proveriSliku, SLIKE, type VrstaSlike } from "@/convex/lib/podesavanjaPravila";
import { cn } from "@/lib/utils";

/**
 * Logo ili ikonica projekta (plan C10 §1.3, E12). Otpremanje ide pravo u
 * Convex skladište, pa `postaviSlikuBrenda` proverava tip, veličinu i da je
 * fajl nov i ničiji. Ovde se isto proverava unapred (i dimenzije, koje server
 * ne vidi), da greška stigne pre slanja. Čuva se odmah, odvojeno od
 * „Sačuvaj izmene“: fajl je radnja, ne polje forme.
 */
const NAZIV: Record<VrstaSlike, string> = { logo: "Logo", favicon: "Ikonica" };
const ICO = new Set(["image/x-icon", "image/vnd.microsoft.icon"]);

async function proveriFajl(vrsta: VrstaSlike, fajl: File): Promise<string | null> {
  const osnovno = proveriSliku(vrsta, { contentType: fajl.type, size: fajl.size });
  if (!osnovno.ok) return osnovno.poruka;
  // Pregledač ne ume pouzdano da izmeri ICO; tu ostaje samo tip i veličina.
  if (ICO.has(fajl.type)) return null;
  try {
    const slika = await createImageBitmap(fajl);
    const { width, height } = slika;
    slika.close();
    if (vrsta === "logo" && (width < 64 || height < 64)) {
      return "Logo mora imati bar 64 × 64 piksela.";
    }
    if (vrsta === "favicon" && (width !== height || width < 32 || width > 512)) {
      return "Ikonica mora biti kvadratna, od 32 do 512 piksela.";
    }
  } catch {
    return "Slika ne može da se pročita. Probaj drugi fajl.";
  }
  return null;
}

function porukaGreske(e: unknown, podrazumevana: string): string {
  const data = (e as { data?: { message?: unknown } } | null)?.data;
  return typeof data?.message === "string" ? data.message : podrazumevana;
}

export function SlikaBrenda({
  vrsta,
  url,
  uredjuje,
}: {
  vrsta: VrstaSlike;
  url: string | null;
  /** Samo vlasnik projekta menja sliku; ostali je vide. */
  uredjuje: boolean;
}) {
  const uploadUrl = useProjekatMutation(api.podesavanjaStore.uploadUrlBrenda);
  const postavi = useProjekatMutation(api.podesavanjaStore.postaviSlikuBrenda);
  const inputRef = useRef<HTMLInputElement>(null);
  const opisId = useId();
  const [radim, setRadim] = useState<"slanje" | "uklanjanje" | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const pravilo = SLIKE[vrsta];

  const posalji = async (fajl: File) => {
    setGreska(null);
    const problem = await proveriFajl(vrsta, fajl);
    if (problem !== null) {
      setGreska(problem);
      return;
    }
    setRadim("slanje");
    try {
      const adresa = await uploadUrl();
      const odgovor = await fetch(adresa, {
        method: "POST",
        headers: { "Content-Type": fajl.type },
        body: fajl,
      });
      if (!odgovor.ok) throw new Error("upload");
      const { storageId } = (await odgovor.json()) as { storageId: Id<"_storage"> };
      await postavi({ vrsta, storageId });
    } catch (e) {
      setGreska(porukaGreske(e, "Slika nije sačuvana. Pokušaj ponovo."));
    } finally {
      setRadim(null);
    }
  };

  const ukloni = async () => {
    setGreska(null);
    setRadim("uklanjanje");
    try {
      await postavi({ vrsta, storageId: null });
    } catch (e) {
      setGreska(porukaGreske(e, "Slika nije uklonjena. Pokušaj ponovo."));
    } finally {
      setRadim(null);
    }
  };

  const okvir = vrsta === "logo" ? "size-12 rounded-lg" : "size-8 rounded-md";

  return (
    <div className="flex flex-wrap items-center gap-3">
      {url ? (
        <img
          src={url}
          alt={`${NAZIV[vrsta]} projekta`}
          className={cn("shrink-0 bg-surface-raised object-cover ring-1 ring-line", okvir)}
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            "flex shrink-0 items-center justify-center border border-dashed border-line-control text-text-muted",
            okvir,
          )}
        >
          <ImageUp className={vrsta === "logo" ? "size-5" : "size-4"} />
        </span>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {uredjuje ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="touch-target"
              disabled={radim !== null}
              aria-busy={radim === "slanje"}
              aria-describedby={opisId}
              onClick={() => inputRef.current?.click()}
            >
              {radim === "slanje" ? (
                <LoaderCircle className="motion-safe:animate-spin" aria-hidden />
              ) : (
                <ImageUp aria-hidden />
              )}
              {url ? "Promeni" : "Otpremi"}
            </Button>
            {url && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={radim !== null}
                aria-busy={radim === "uklanjanje"}
                onClick={() => void ukloni()}
                className="touch-target text-text-muted hover:text-foreground"
              >
                <Trash2 aria-hidden />
                Ukloni
              </Button>
            )}
            <input
              ref={inputRef}
              type="file"
              accept={pravilo.tipovi.join(",")}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const fajl = e.target.files?.[0];
                e.target.value = "";
                if (fajl) void posalji(fajl);
              }}
            />
          </div>
        ) : (
          <span className="text-ui text-text-secondary">{url ? "Postavljen" : "—"}</span>
        )}
        <span id={opisId} className="text-meta text-text-muted">
          {pravilo.opisTipova}, do {Math.round(pravilo.maksBajtova / 1024)} KB
          {vrsta === "favicon" ? " · kvadratna" : ""}
        </span>
        {greska && <FeedbackLine tone="danger">{greska}</FeedbackLine>}
      </div>
    </div>
  );
}
