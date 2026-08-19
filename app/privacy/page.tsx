import type { Metadata } from "next";
import Link from "next/link";
import {
  GOOGLE_PERMISSIONS_URL,
  GOOGLE_PRIVACY_URL,
  YOUTUBE_TERMS_URL,
} from "@/lib/policy-links";

export const metadata: Metadata = {
  title: "Politika privatnosti · Enigma Command Center",
  description:
    "Koje podatke Enigma Command Center preuzima sa povezanih naloga, zašto ih čuva i kako se brišu.",
};

/**
 * Public privacy policy (YA2).
 *
 * Deliberately OUTSIDE the `(app)` route group: the whole point of this page is
 * that a reviewer, an auditor or a client can open it without an account. The
 * `(app)` layout redirects anonymous visitors to /login, which would make the
 * link in Settings useless to exactly the people it exists for.
 */

const SOURCES: { name: string; stored: string }[] = [
  {
    name: "Google Analytics 4",
    stored:
      "Dnevni zbirni saobraćaj sajta: sesije, korisnici, izvori poseta i konverzije. Ne preuzimaju se podaci o pojedinačnim posetiocima.",
  },
  {
    name: "YouTube",
    stored:
      "Statistika kanala i video zapisa, izvori saobraćaja, metapodaci objavljenih video zapisa i log komentara koje su automatizacije obradile (tekst komentara i javno ime autora).",
  },
  {
    name: "Instagram i Facebook stranica",
    stored:
      "Statistika naloga i objava, komentari i poruke koje obrađuju automatizacije, uz javno ime pošiljaoca.",
  },
  {
    name: "Meta Ads i Google Ads",
    stored:
      "Struktura kampanja i dnevni rezultati oglasa: potrošnja, prikazi, klikovi i konverzije.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-[var(--gutter)] py-16">
      <p className="heading-caps text-micro font-medium text-accent-400">
        Enigma · Command Center
      </p>
      <h1 className="mt-3 text-h1 text-foreground">Politika privatnosti</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Enigma Command Center je interna analitička tabla koja na jedno mesto
        skuplja podatke sa marketinških naloga koje vlasnik radnog prostora sam
        poveže. Ova stranica opisuje šta se pri tome preuzima, gde se čuva i
        kako se briše.
      </p>

      <Section title="Šta se preuzima">
        <p>
          Ništa se ne preuzima dok se nalog ne poveže iz Podešavanja. Za svaki
          povezani servis čuva se sledeće:
        </p>
        <ul className="mt-3 space-y-3">
          {SOURCES.map((source) => (
            <li
              key={source.name}
              className="rounded-lg border border-line-soft bg-surface-raised/40 px-4 py-3"
            >
              <p className="text-xs font-semibold text-foreground">
                {source.name}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">
                {source.stored}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Zašto">
        <p>
          Podaci se koriste isključivo za prikaz analitike vlasniku radnog
          prostora i za automatizacije koje je sam podesio. Ne prodaju se, ne
          ustupaju trećim stranama i ne koriste se za oglašavanje niti za
          treniranje modela.
        </p>
      </Section>

      <Section title="Gde se čuvaju">
        <p>
          Podaci se čuvaju u Convex bazi ove aplikacije. Pristupni tokeni i
          ključevi povezanih naloga čuvaju se šifrovani (AES-GCM) i nikada se ne
          prikazuju u aplikaciji nakon unosa.
        </p>
      </Section>

      <Section title="Kako se brišu">
        <p>
          Prekid veze sa servisom u Podešavanjima briše sačuvane kredencijale.
          Za YouTube prekid veze briše i sve podatke preuzete sa YouTube-a —
          statistiku kanala, podatke o video zapisima, izvore saobraćaja, log
          komentara i automatizacije. Ta radnja je nepovratna.
        </p>
        <p className="mt-3">
          Pristup Google nalozima možeš opozvati i sa Google strane, na{" "}
          <PolicyLink href={GOOGLE_PERMISSIONS_URL}>
            myaccount.google.com/permissions
          </PolicyLink>
          . Opoziv zaustavlja svaku dalju sinhronizaciju; za brisanje već
          preuzetih podataka prekini vezu u Podešavanjima.
        </p>
      </Section>

      <Section title="YouTube">
        <p>
          Podaci sa YouTube-a preuzeti su preko YouTube API Services. Korišćenjem
          tih podataka u ovoj aplikaciji prihvataju se{" "}
          <PolicyLink href={YOUTUBE_TERMS_URL}>
            YouTube Terms of Service
          </PolicyLink>
          , a na obradu podataka na Google strani primenjuje se{" "}
          <PolicyLink href={GOOGLE_PRIVACY_URL}>
            Google Privacy Policy
          </PolicyLink>
          .
        </p>
      </Section>

      <p className="mt-12 border-t border-line-soft pt-4 text-xs text-text-muted">
        <Link
          href="/settings"
          className="text-accent-400 underline underline-offset-2 transition-colors hover:text-accent-300"
        >
          Nazad na Podešavanja
        </Link>
      </p>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function PolicyLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent-400 underline underline-offset-2 transition-colors hover:text-accent-300"
    >
      {children}
    </a>
  );
}
