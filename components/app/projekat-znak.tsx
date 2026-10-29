/* eslint-disable @next/next/no-img-element -- logo dolazi iz Convex skladišta (potpisan URL), ne kroz next/image */
import { inicijaliProjekta, stilProjekta } from "@/lib/boja-projekta";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * ZNAK PROJEKTA — logo ili inicijali u boji projekta (P10)
 * ============================================================================
 *
 * Jedini nosilac boje identiteta uz traku na vrhu ljuske: birač projekta,
 * logo u panelu, „Objavljuješ kao …“ u dijalozima i ⌘K. Element sam
 * postavlja `--projekat` iz podatka (`stilProjekta`), pa znak drugog
 * projekta u spisku ne nasledi boju tekućeg, a radi i u portalima.
 *
 * Oblik je zaobljen kvadrat, kao monogram firme, ali boja nije kategorija
 * nego identitet: puna podloga u boji projekta, tekst koji je izmeren ≥ 4,5:1.
 */
const VELICINA = {
  // U 20 px staje jedno slovo na skali (12 px); dva bi se sudarila.
  xs: { kutija: "size-5 rounded-[5px] text-micro", slova: 1 },
  sm: { kutija: "size-6 rounded-md text-micro", slova: 2 },
  md: { kutija: "size-7 rounded-md text-meta", slova: 2 },
  // Pločica u traci projekata (SPAJANJE P14): 36 px u meti od 44 px.
  traka: { kutija: "size-9 rounded-[10px] text-ui", slova: 2 },
  // Ekran prijave na panel domenu: znak je tamo brend, ne ukras u redu.
  lg: { kutija: "size-14 rounded-xl text-title", slova: 2 },
} as const;

export type ProjekatZaZnak = {
  ime: string;
  boja: string | null;
  logoUrl: string | null;
};

export function ProjekatZnak({
  projekat,
  velicina = "sm",
  oznaka,
  className,
}: {
  projekat: ProjekatZaZnak;
  velicina?: keyof typeof VELICINA;
  /**
   * Samostalan znak (bez imena pored sebe, npr. panel na telefonu) dobija
   * ime projekta kao tekst za čitač ekrana. Inače je ukras.
   */
  oznaka?: boolean;
  className?: string;
}) {
  const v = VELICINA[velicina];

  if (projekat.logoUrl) {
    return (
      <img
        src={projekat.logoUrl}
        alt={oznaka ? projekat.ime : ""}
        aria-hidden={oznaka ? undefined : true}
        className={cn("shrink-0 object-cover ring-1 ring-line", v.kutija, className)}
      />
    );
  }

  return (
    <span
      {...(oznaka
        ? { role: "img", "aria-label": projekat.ime }
        : { "aria-hidden": true })}
      data-projekat=""
      style={stilProjekta(projekat.boja)}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center bg-projekat font-bold leading-none text-projekat-tekst",
        v.kutija,
        className,
      )}
    >
      {inicijaliProjekta(projekat.ime).slice(0, v.slova)}
    </span>
  );
}
