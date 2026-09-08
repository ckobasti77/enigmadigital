import type { Doc } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

/**
 * Bedž stanja sajta (GL2, plan §7.4) — JEDNA komponenta za tabelu, prošireni
 * red i profil. Tri kopije istog bedža bi za mesec dana rekle tri različite
 * stvari o istom polju.
 *
 * BOJA NOSI PRODAJNI SIGNAL, NE GREŠKU. Sajt koji ne radi ili je parkiran je
 * razlog da se firma pozove — zato temperaturna paleta (`temp-hot`), a ne
 * `danger`. Crveno „greška" bi operatera učilo da to preskoči.
 *
 * FIRMA KOJA NIKAD NIJE PROVERAVANA NEMA BEDŽ. Nije „nepoznato": „nepoznato"
 * znači da smo gledali i nismo uspeli, i to je podatak (§0 pravilo 4).
 */

type SajtStatus = NonNullable<Doc<"leadCompanies">["sajtStatus"]>;

const NATPISI: Record<SajtStatus, string> = {
  radi: "radi",
  ne_radi: "ne radi",
  parkiran: "parkiran",
  preusmerava_na_drustvene: "vodi na mrežu",
  nepoznato: "provera nije uspela",
};

const TONOVI: Record<SajtStatus, string> = {
  radi: "border-line bg-surface-raised text-text-muted",
  ne_radi: "border-temp-hot/50 bg-temp-hot-bg text-foreground",
  parkiran: "border-temp-hot/50 bg-temp-hot-bg text-foreground",
  preusmerava_na_drustvene: "border-temp-warm/50 bg-temp-warm-bg text-foreground",
  nepoznato: "border-line-soft bg-surface-raised/60 text-text-muted",
};

const OBJASNJENJA: Record<SajtStatus, string> = {
  radi: "Sajt je odgovorio pri poslednjoj proveri.",
  ne_radi: "Sajt nije odgovorio pri poslednjoj proveri — prilika za ponudu.",
  parkiran: "Domen postoji, ali na njemu stoji parking stranica.",
  preusmerava_na_drustvene:
    "Domen preusmerava na društvenu mrežu — firma nema pravi sajt.",
  nepoznato: "Provera sajta nije uspela; stanje nije utvrđeno.",
};

function kratakDatum(ts: number): string {
  return new Date(ts).toLocaleDateString("sr-RS", {
    day: "numeric",
    month: "numeric",
  });
}

export function SiteStatusBadge({
  status,
  https,
  proverenAt,
  napomena,
  size = "md",
  className,
}: {
  status: Doc<"leadCompanies">["sajtStatus"];
  /** `false` = sajt radi bez HTTPS-a; `undefined` = nije gledano. */
  https?: boolean;
  proverenAt?: number;
  napomena?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  if (!status) return null;

  const delovi = [OBJASNJENJA[status]];
  if (https === false) delovi.push("Sajt je bez HTTPS-a.");
  if (proverenAt !== undefined) {
    delovi.push(`Provereno ${new Date(proverenAt).toLocaleString("sr-RS")}.`);
  }
  if (napomena?.trim()) delovi.push(napomena.trim());

  return (
    <span
      title={delovi.join(" ")}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded border font-semibold",
        size === "sm"
          ? "px-1 py-px text-micro"
          : "px-1.5 py-0.5 text-micro",
        TONOVI[status],
        className,
      )}
    >
      <span>{NATPISI[status]}</span>
      {https === false && (
        <span className="font-normal text-warning">· bez HTTPS-a</span>
      )}
      {proverenAt !== undefined && size === "md" && (
        <span className="font-normal text-text-muted">
          · {kratakDatum(proverenAt)}
        </span>
      )}
    </span>
  );
}
