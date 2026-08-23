import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Politika kolačića · Enigma Digital",
  description:
    "Informacije o kolačićima i tehnologijama skladištenja podataka koje koristi sajt enigmait.rs.",
};

/**
 * Javna stranica Politike kolačića.
 * Smeštena van `(app)` grupe kako bi bila javno dostupna svim posetiocima bez prijave.
 */

interface CookieItem {
  name: string;
  type: string;
  provider?: string;
  purpose: string;
  duration: string;
}

const NECESSARY_COOKIES: CookieItem[] = [
  {
    name: "enigma_consent_v1",
    type: "localStorage",
    provider: "Enigma Digital",
    purpose: "Pamti tvoj izbor o kolačićima, da te ne pitamo pri svakoj poseti",
    duration: "Do brisanja podataka pregledača",
  },
];

const ANALYTICS_COOKIES: CookieItem[] = [
  {
    name: "_ga",
    type: "kolačić",
    purpose: "Razlikovanje posetilaca",
    duration: "2 godine",
  },
  {
    name: "_ga_[ID]",
    type: "kolačić",
    purpose: "Održavanje stanja sesije",
    duration: "2 godine",
  },
];

const MARKETING_COOKIES: CookieItem[] = [
  {
    name: "_fbp",
    type: "kolačić",
    purpose: "Prepoznavanje pregledača radi merenja oglasa",
    duration: "3 meseca",
  },
  {
    name: "_fbc",
    type: "kolačić",
    purpose: "Čuva podatak o kliku na Meta oglas (fbclid)",
    duration: "3 meseca",
  },
];

export default function CookiesPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-[var(--gutter)] py-16">
      <p className="heading-caps text-micro font-medium text-accent-400">
        Enigma Digital
      </p>
      <h1 className="mt-3 text-h1 text-foreground">Politika kolačića</h1>
      <p className="mt-2 text-xs text-text-muted">
        Poslednja izmena: 23. avgust 2026.
      </p>

      {/* 1. Ko obrađuje podatke */}
      <Section title="1. Ko obrađuje podatke">
        <p>Sajt enigmait.rs održava Enigma Digital.</p>
        <p className="mt-2">
          Za pitanja o kolačićima i ličnim podacima:{" "}
          <a
            href="mailto:office@enigmait.rs"
            className="text-accent-400 underline underline-offset-2 hover:text-accent-300"
          >
            office@enigmait.rs
          </a>
          .
        </p>
        <p className="mt-2 text-xs text-text-muted">
          [DOPUNITI PO REGISTRACIJI] — kada firma bude registrovana, ovde se dodaju
          pun poslovni naziv, sedište, matični broj i PIB. Do tada ovaj odeljak
          ostaje ovakav, isti kao na stranici Politika privatnosti.
        </p>
      </Section>

      {/* 2. Šta su kolačići i slične tehnologije */}
      <Section title="2. Šta su kolačići i slične tehnologije">
        <p>
          Kolačići su male datoteke koje sajt smešta u tvoj pregledač. Pored njih
          koristimo i localStorage — prostor u pregledaču koji radi slično, ali
          podatak ostaje dok ga sam ne obrišeš.
        </p>
        <p className="mt-2">
          Bez tvog pristanka postavljamo samo ono što je neophodno da sajt radi
          i da zapamtimo tvoj izbor. Sve ostalo čeka da klikneš.
        </p>
      </Section>

      {/* 3. Kategorije */}
      <Section title="3. Kategorije">
        <div className="space-y-6">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              3.1 Neophodni — uvek aktivni
            </h3>
            <p className="mt-1 text-sm">
              Bez njih sajt ne može da radi ispravno. Za njih se pristanak ne traži.
            </p>
            <div className="mt-3 overflow-x-auto rounded-lg border border-line-soft bg-surface-raised/40">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line-soft text-text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Naziv</th>
                    <th className="px-4 py-2.5 font-medium">Vrsta</th>
                    <th className="px-4 py-2.5 font-medium">Ko postavlja</th>
                    <th className="px-4 py-2.5 font-medium">Svrha</th>
                    <th className="px-4 py-2.5 font-medium">Trajanje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft/50 text-foreground">
                  {NECESSARY_COOKIES.map((cookie) => (
                    <tr key={cookie.name}>
                      <td className="px-4 py-2.5 font-mono text-accent-400">
                        {cookie.name}
                      </td>
                      <td className="px-4 py-2.5 text-text-muted">
                        {cookie.type}
                      </td>
                      <td className="px-4 py-2.5 text-text-muted">
                        {cookie.provider}
                      </td>
                      <td className="px-4 py-2.5">{cookie.purpose}</td>
                      <td className="px-4 py-2.5 text-text-muted">
                        {cookie.duration}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              3.2 Analitika — samo uz pristanak
            </h3>
            <p className="mt-1 text-sm">
              Pomažu nam da vidimo koliko ljudi dolazi na sajt i koje stranice čitaju.
              Postavlja ih Google Analytics 4 (Google Ireland Limited / Google LLC).
            </p>
            <div className="mt-3 overflow-x-auto rounded-lg border border-line-soft bg-surface-raised/40">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line-soft text-text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Naziv</th>
                    <th className="px-4 py-2.5 font-medium">Vrsta</th>
                    <th className="px-4 py-2.5 font-medium">Svrha</th>
                    <th className="px-4 py-2.5 font-medium">Trajanje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft/50 text-foreground">
                  {ANALYTICS_COOKIES.map((cookie) => (
                    <tr key={cookie.name}>
                      <td className="px-4 py-2.5 font-mono text-accent-400">
                        {cookie.name}
                      </td>
                      <td className="px-4 py-2.5 text-text-muted">
                        {cookie.type}
                      </td>
                      <td className="px-4 py-2.5">{cookie.purpose}</td>
                      <td className="px-4 py-2.5 text-text-muted">
                        {cookie.duration}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-text-muted">
              Dok ne pristaneš, Google Analytics se ne učitava uopšte, a Google
              Consent Mode je podešen na odbijeno za skladištenje podataka o
              analitici i oglasima.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              3.3 Marketing — samo uz pristanak
            </h3>
            <p className="mt-1 text-sm">
              Služe za merenje uspešnosti naših oglasa. Postavlja ih Meta Pixel (Meta
              Platforms Ireland Limited).
            </p>
            <div className="mt-3 overflow-x-auto rounded-lg border border-line-soft bg-surface-raised/40">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line-soft text-text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Naziv</th>
                    <th className="px-4 py-2.5 font-medium">Vrsta</th>
                    <th className="px-4 py-2.5 font-medium">Svrha</th>
                    <th className="px-4 py-2.5 font-medium">Trajanje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft/50 text-foreground">
                  {MARKETING_COOKIES.map((cookie) => (
                    <tr key={cookie.name}>
                      <td className="px-4 py-2.5 font-mono text-accent-400">
                        {cookie.name}
                      </td>
                      <td className="px-4 py-2.5 text-text-muted">
                        {cookie.type}
                      </td>
                      <td className="px-4 py-2.5">{cookie.purpose}</td>
                      <td className="px-4 py-2.5 text-text-muted">
                        {cookie.duration}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-text-muted">
              Dok ne pristaneš, Meta Pixel se ne učitava uopšte.
            </p>
          </div>
        </div>
      </Section>

      {/* 4. Merenje na strani servera (Conversions API) */}
      <Section title="4. Merenje na strani servera (Conversions API)">
        <p>
          Kada na naš sajt dođeš preko skraćenog linka oblika{" "}
          <code className="rounded bg-surface-raised px-1.5 py-0.5 text-xs text-accent-400">
            digital.enigmait.rs/r/...
          </code>{" "}
          — takve linkove delimo u porukama i objavama — naš server prosleđuje Meti
          podatak o toj poseti preko Conversions API-ja.
        </p>
        <p className="mt-2">
          Tom prilikom se šalju: tvoja IP adresa, podaci o tvom pregledaču
          (user-agent), oznaka klika na oglas (fbc) ako postoji, i jedinstvena
          oznaka događaja.
        </p>
        <p className="mt-2">
          IP adresu zadržavamo samo do trenutka slanja Meti, nakon čega je brišemo iz
          svojih zapisa. Za našu internu statistiku klikova čuvamo isključivo
          nepovratan heš adrese, iz kojeg se original ne može rekonstruisati.
        </p>
        <p className="mt-2">
          Ta oznaka događaja služi da se poseta izmerena na serveru i poseta
          izmerena u pregledaču spoje u jedan događaj umesto da se broje dvaput.
        </p>
        <div className="mt-3 rounded-lg border border-line-soft bg-surface-raised/40 p-3 text-xs text-text-muted">
          <p className="font-semibold text-accent-400">
            [NAPOMENA ZA JOVANA — obriši pre objave]
          </p>
          <p className="mt-1">
            Ovo merenje se trenutno pokreće u trenutku preusmerenja, dakle pre nego
            što vidiš banner za saglasnost. Ako ovu politiku objaviš ovakvu, opisao
            si stanje istinito — ali si i sam sebi napisao dokaz o rupi. Ozbiljnija
            varijanta je da serverski događaj sačeka signal pristanka sa sajta. To
            je zaseban zahvat u enigmadigital-u koji smo svesno odložili.
          </p>
        </div>
      </Section>

      {/* 5. Kome se podaci prosleđuju */}
      <Section title="5. Kome se podaci prosleđuju">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Google</strong> (Google Ireland Limited, Irska) — usluga
            Google Analytics 4
          </li>
          <li>
            <strong>Meta</strong> (Meta Platforms Ireland Limited, Irska) — Meta
            Pixel i Conversions API
          </li>
        </ul>
        <p className="mt-2">
          Obe kompanije podatke mogu obrađivati i van Srbije i Evropskog ekonomskog
          prostora, uključujući Sjedinjene Američke Države, uz mehanizme prenosa
          koje same primenjuju.
        </p>
        <p className="mt-2">
          Podatke ne prodajemo i ne ustupamo trećim licima izvan navedenih usluga.
        </p>
      </Section>

      {/* 6. Kako da promeniš ili povučeš pristanak */}
      <Section title="6. Kako da promeniš ili povučeš pristanak">
        <p>
          Na sajtu, u podnožju svake stranice, klikni „Podešavanja kolačića” i
          promeni izbor. Kada povučeš pristanak, brišemo{" "}
          <code className="rounded bg-surface-raised px-1 py-0.5 text-xs text-accent-400">
            _fbp
          </code>
          ,{" "}
          <code className="rounded bg-surface-raised px-1 py-0.5 text-xs text-accent-400">
            _fbc
          </code>{" "}
          i{" "}
          <code className="rounded bg-surface-raised px-1 py-0.5 text-xs text-accent-400">
            _ga
          </code>{" "}
          kolačiće.
        </p>
        <p className="mt-2">
          U svom pregledaču možeš obrisati sve kolačiće i podatke sajta, čime se
          briše i zapis o tvom izboru — pri sledećoj poseti banner se pojavljuje
          ponovo.
        </p>
        <p className="mt-2">
          Blokiranje neophodnih kolačića može narušiti rad sajta.
        </p>
      </Section>

      {/* 7. Tvoja prava */}
      <Section title="7. Tvoja prava">
        <p>
          U skladu sa Zakonom o zaštiti podataka o ličnosti imaš pravo da:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>tražiš pristup podacima koje o tebi obrađujemo,</li>
          <li>tražiš ispravku netačnih podataka,</li>
          <li>tražiš brisanje podataka,</li>
          <li>tražiš ograničenje obrade,</li>
          <li>uložiš prigovor na obradu,</li>
          <li>
            opozoveš pristanak u svakom trenutku, bez posledica po obradu koja je
            do tada vršena na osnovu tog pristanka.
          </li>
        </ul>
        <p className="mt-3">
          Zahtev šalji na{" "}
          <a
            href="mailto:office@enigmait.rs"
            className="text-accent-400 underline underline-offset-2 hover:text-accent-300"
          >
            office@enigmait.rs
          </a>
          .
        </p>
        <p className="mt-2">
          Ako smatraš da obrađujemo tvoje podatke suprotno propisima, možeš podneti
          pritužbu Povereniku za informacije od javnog značaja i zaštitu podataka o
          ličnosti, Bulevar kralja Aleksandra 15, 11120 Beograd.
        </p>
      </Section>

      {/* 8. Veza sa Politikom privatnosti */}
      <Section title="8. Veza sa Politikom privatnosti">
        <p>
          Ova politika pokriva samo kolačiće i slične tehnologije u tvom pregledaču.
          Širu obradu ličnih podataka — pravni osnov, rokove čuvanja, međunarodne
          prenose i tvoja prava u punom obimu — opisuje{" "}
          <Link
            href="/privacy"
            className="text-accent-400 underline underline-offset-2 hover:text-accent-300"
          >
            Politika privatnosti
          </Link>
          .
        </p>
        <p className="mt-2">
          Ako se dve politike razilaze u nečemu, greška je naša i ispravljamo je;
          javi nam na{" "}
          <a
            href="mailto:office@enigmait.rs"
            className="text-accent-400 underline underline-offset-2 hover:text-accent-300"
          >
            office@enigmait.rs
          </a>
          .
        </p>
      </Section>

      {/* 9. Izmene ove politike */}
      <Section title="9. Izmene ove politike">
        <p>
          Politiku menjamo kada se promeni ono što sajt stvarno radi. Datum
          poslednje izmene stoji na vrhu.
        </p>
      </Section>

      <p className="mt-12 border-t border-line-soft pt-4 text-xs text-text-muted">
        <Link
          href="/"
          className="text-accent-400 underline underline-offset-2 transition-colors hover:text-accent-300"
        >
          Početna
        </Link>
        {" · "}
        <Link
          href="/privacy"
          className="text-accent-400 underline underline-offset-2 transition-colors hover:text-accent-300"
        >
          Politika privatnosti
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
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
