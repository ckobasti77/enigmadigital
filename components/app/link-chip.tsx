"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  Building2,
  Check,
  Copy,
  Globe,
  Mail,
  MapPin,
  Phone,
  X,
  BookUser,
} from "lucide-react";
import {
  FacebookIcon,
  InstagramIcon,
  ThreadsIcon,
  TikTokIcon,
} from "@/components/app/brand-glyphs";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * LinkChip (GL2) — plan §7.2
 * ============================================================================
 *
 * Jedan spoljni kanal kao čip: ikona vrste, skraćen čitljiv tekst, otvaranje u
 * novom tabu i kopiranje. Zamenjuje `ContactLink` i sve ručno pisane
 * `<a target="_blank">` varijante po ekranima leadova.
 *
 * PRAVILA:
 *
 * 1. Dugme za kopiranje se NE CRTA ako `navigator.clipboard` ne postoji.
 *    Dugme koje ne može da uradi ono što piše je gore od nepostojećeg (§0
 *    pravilo 11). Provera ide kroz `useEffect` jer na serveru `navigator` ne
 *    postoji — inače bi se prvi render razlikovao od hidracije.
 *
 * 2. Uspeh se potvrđuje 1,5 s i vraća se sam. Ako `writeText` odbije (npr.
 *    stranica nije u sigurnom kontekstu), NE prikazuje se kvačica — pokazuje
 *    se da nije uspelo. Lažna potvrda je gora od tihog neuspeha.
 *
 * 3. Kopira se VREDNOST, ne `href`. Za telefon to znači broj, ne „tel:+381…".
 */

export type LinkChipVrsta =
  | "website"
  | "instagram"
  | "facebook"
  | "tiktok"
  | "threads"
  | "google_maps"
  | "companywall"
  | "011info"
  | "phone"
  | "email";

const IKONE: Record<LinkChipVrsta, ComponentType<{ className?: string }>> = {
  website: Globe,
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  tiktok: TikTokIcon,
  threads: ThreadsIcon,
  google_maps: MapPin,
  companywall: Building2,
  "011info": BookUser,
  phone: Phone,
  email: Mail,
};

const NAZIVI: Record<LinkChipVrsta, string> = {
  website: "Sajt",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  threads: "Threads",
  google_maps: "Google Maps",
  companywall: "CompanyWall",
  "011info": "011info",
  phone: "Telefon",
  email: "E-mail",
};

/** Vrednost se nikad ne menja u toku života stranice — nema šta da se sluša. */
const bezPretplate = () => () => {};

const MREZE: readonly LinkChipVrsta[] = [
  "instagram",
  "facebook",
  "tiktok",
  "threads",
];

/**
 * Skraćen tekst za čipa kad pozivalac ne pošalje svoj: domen bez protokola i
 * `www.`, odnosno `@handle` za društvene mreže. Pun URL u tabeli zauzima pola
 * reda a ne kaže ništa više.
 */
export function skratiZaChip(vrsta: LinkChipVrsta, href: string): string {
  if (vrsta === "phone") return href.replace(/^tel:/, "");
  if (vrsta === "email") return href.replace(/^mailto:/, "");

  const bezProtokola = href.replace(/^https?:\/\//, "").replace(/^www\./, "");

  if (MREZE.includes(vrsta)) {
    const putanja = bezProtokola.split("?")[0].replace(/\/+$/, "").split("/");
    const handle = putanja[putanja.length - 1];
    if (handle && putanja.length > 1) {
      return handle.startsWith("@") ? handle : `@${handle}`;
    }
  }

  return bezProtokola.replace(/\/+$/, "") || href;
}

export function LinkChip({
  vrsta,
  href,
  label,
  copyValue,
  size = "md",
  suffix,
  onOpen,
  title,
  className,
}: {
  vrsta: LinkChipVrsta;
  href: string;
  /** Tekst na čipu; podrazumevano skraćen domen ili handle. */
  label?: string;
  /** Šta ide u clipboard; podrazumevano `label`, pa `href` bez sheme. */
  copyValue?: string;
  size?: "sm" | "md";
  /** Npr. bedž statusa sajta — stoji unutar čipa, desno od teksta. */
  suffix?: ReactNode;
  /** Klik na sam link (npr. otvaranje trake posle poziva). */
  onOpen?: () => void;
  title?: string;
  className?: string;
}) {
  const Ikona = IKONE[vrsta];
  const tekst = label ?? skratiZaChip(vrsta, href);
  const zaKopiranje = copyValue ?? label ?? skratiZaChip(vrsta, href);

  // Postojanje clipboard API-ja je činjenica o pregledaču, ne stanje React-a.
  // Kroz `useSyncExternalStore` server vidi `false` (dugmeta nema), klijent
  // pravu vrednost — bez neslaganja pri hidraciji i bez `setState` u efektu.
  const umeKopira = useSyncExternalStore(
    bezPretplate,
    () =>
      typeof navigator !== "undefined" &&
      typeof navigator.clipboard?.writeText === "function",
    () => false,
  );
  const [stanje, setStanje] = useState<"mirno" | "kopirano" | "nije">("mirno");

  useEffect(() => {
    if (stanje === "mirno") return;
    const t = setTimeout(() => setStanje("mirno"), 1500);
    return () => clearTimeout(t);
  }, [stanje]);

  const kopiraj = async () => {
    try {
      await navigator.clipboard.writeText(zaKopiranje);
      setStanje("kopirano");
    } catch {
      setStanje("nije");
    }
  };

  const jeInterni = vrsta === "phone" || vrsta === "email";
  const mali = size === "sm";

  return (
    <span
      className={cn(
        "group/chip inline-flex max-w-full min-w-0 items-center rounded-md border border-line-soft bg-surface-raised/60 transition-colors hover:border-line-strong",
        mali ? "gap-1 pl-1.5 text-micro" : "gap-1.5 pl-2 text-xs",
        umeKopira ? (mali ? "pr-0.5" : "pr-1") : mali ? "pr-1.5" : "pr-2",
        className,
      )}
    >
      <a
        href={href}
        onClick={onOpen}
        target={jeInterni ? undefined : "_blank"}
        rel={jeInterni ? undefined : "noopener noreferrer"}
        title={title ?? `${NAZIVI[vrsta]}: ${tekst}`}
        className={cn(
          "inline-flex min-w-0 items-center rounded-md py-1 text-foreground transition-colors hover:text-accent-400 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          mali ? "gap-1" : "gap-1.5",
        )}
      >
        <Ikona
          className={cn("shrink-0 text-text-muted", mali ? "size-3" : "size-3.5")}
        />
        <span
          className={cn(
            "truncate font-medium group-hover/chip:underline",
            vrsta === "phone" && "font-mono tabular-nums",
          )}
        >
          {tekst}
        </span>
      </a>

      {suffix}

      {umeKopira && (
        <button
          type="button"
          onClick={kopiraj}
          aria-label={
            stanje === "kopirano"
              ? `${NAZIVI[vrsta]} je kopiran`
              : `Kopiraj ${NAZIVI[vrsta].toLowerCase()}`
          }
          title={
            stanje === "nije"
              ? "Kopiranje nije uspelo — označi tekst i kopiraj ručno."
              : stanje === "kopirano"
                ? "Kopirano"
                : "Kopiraj"
          }
          className={cn(
            "shrink-0 cursor-pointer rounded p-1 text-text-muted transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            stanje === "kopirano" && "text-success",
            stanje === "nije" && "text-danger",
          )}
        >
          {stanje === "kopirano" ? (
            <Check className={mali ? "size-2.5" : "size-3"} />
          ) : stanje === "nije" ? (
            <X className={mali ? "size-2.5" : "size-3"} />
          ) : (
            <Copy className={mali ? "size-2.5" : "size-3"} />
          )}
        </button>
      )}
    </span>
  );
}
