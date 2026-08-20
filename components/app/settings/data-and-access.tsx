"use client";

import Link from "next/link";
import { ExternalLink, ShieldCheck } from "lucide-react";
import type { Provider } from "@/convex/lib/providers";
import { GOOGLE_PERMISSIONS_URL } from "@/lib/policy-links";

/**
 * „Podaci i pristup” (YA2).
 *
 * Jedan panel koji odgovara na tri pitanja koja revizija postavlja odvojeno:
 * šta je povezano, šta se od svakog čuva, i kako se pristup opoziva. Podaci o
 * tome i danas postoje — razasuti po karticama iznad — ali revizija ne gleda
 * sedam kartica; gleda jedan ekran. Zato ovaj panel ne uvodi ništa novo, nego
 * na jednom mestu ponavlja ono što kartice već tvrde.
 */

/** Šta ova aplikacija čuva od svakog servisa — ljudskim rečima, bez imena tabela. */
const STORED_BY_PROVIDER: Record<Provider, { name: string; stored: string }> = {
  ga4: {
    name: "Google Analytics 4",
    stored:
      "Dnevni zbirni saobraćaj sajta: sesije, korisnici, izvori poseta i konverzije.",
  },
  meta_ig: {
    name: "Instagram",
    stored:
      "Statistika naloga i objava, komentari i poruke koje obrađuju automatizacije.",
  },
  meta_fb: {
    name: "Facebook stranica",
    stored:
      "Statistika stranice i objava, i komentari koje obrađuju automatizacije.",
  },
  meta_ads: {
    name: "Meta Ads",
    stored:
      "Struktura kampanja i dnevni rezultati oglasa: potrošnja, prikazi, klikovi.",
  },
  google_ads: {
    name: "Google Ads",
    stored:
      "Struktura kampanja, ključne reči i dnevni rezultati oglasa.",
  },
  youtube: {
    name: "YouTube",
    stored:
      "Statistika kanala i video zapisa, izvori saobraćaja, log obrađenih komentara i automatizacije.",
  },
  openreply: {
    name: "OpenReply",
    stored: "Log poslatih poruka, praćeni linkovi i klikovi na njih.",
  },
};

/** Redosled je isti kao redosled kartica iznad, da se panel čita kao rezime. */
const ORDER: Provider[] = [
  "ga4",
  "meta_ig",
  "meta_fb",
  "meta_ads",
  "google_ads",
  "youtube",
  "openreply",
];

export function DataAndAccess({ connected }: { connected: Provider[] }) {
  const active = ORDER.filter((provider) => connected.includes(provider));

  return (
    <section className="rounded-xl border bg-card p-6 shadow-card">
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-lg border border-line-soft text-text-muted">
          <ShieldCheck className="size-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Podaci i pristup
          </h2>
          <p className="text-xs text-text-muted">
            Šta je povezano, šta se od toga čuva i kako se pristup opoziva.
          </p>
        </div>
      </div>

      {active.length === 0 ? (
        <p className="mt-5 rounded-lg border border-line-soft bg-surface-raised/40 px-4 py-3 text-xs leading-relaxed text-text-muted">
          Nijedan servis još nije povezan, pa se ne čuva nijedan preuzet podatak.
        </p>
      ) : (
        <ul className="mt-5 space-y-2">
          {active.map((provider) => {
            const entry = STORED_BY_PROVIDER[provider];
            return (
              <li
                key={provider}
                className="rounded-lg border border-line-soft bg-surface-raised/40 px-4 py-3"
              >
                <p className="text-xs font-semibold text-foreground">
                  {entry.name}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-text-muted">
                  {entry.stored}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-5 space-y-3 border-t pt-4">
        {/* Do P3 je ovde pisalo da se preuzeti podaci brišu „kod YouTube-a”.
            Sada se brišu kod svakog servisa, i opoziv radi sama aplikacija. */}
        <p className="text-xs leading-relaxed text-text-muted">
          Prekid veze na kartici iznad opoziva pristup kod samog servisa, briše
          sačuvane kredencijale i briše sve podatke preuzete sa tog servisa.
          Nepovratno. Brisanje se odvija u pozadini i kartica pokazuje dokle je
          stiglo. Prekid veze može da izvede samo vlasnik radnog prostora.
          Detaljno u{" "}
          <Link
            href="/privacy"
            className="text-accent-400 underline underline-offset-2 transition-colors hover:text-accent-300"
          >
            politici privatnosti
          </Link>
          .
        </p>
        <p className="text-xs leading-relaxed text-text-muted">
          Pristup Google nalozima (GA4, Google Ads, YouTube) možeš proveriti i
          opozvati i sa Google strane. Ako opoziv iz aplikacije ne prođe,
          kartica to kaže i uputi ovde.
        </p>
        <a
          href={GOOGLE_PERMISSIONS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-400 transition-colors hover:text-accent-300"
        >
          <span>myaccount.google.com/permissions</span>
          <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>
    </section>
  );
}
