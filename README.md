# Enigma Command Center

Interna marketing analitička kontrolna tabla za **Enigma IT** — objedinjeni pregled i sistem evidencije za Google Analytics 4, Instagram organski rast, OpenReply DM automatizaciju i UTM atribuciju konverzija.

- **Produkcija uživo**: [https://digital.enigmait.rs](https://digital.enigmait.rs)
- **Arhitektura i plan razvoja**: [PLAN.md](./PLAN.md)
- **Pravila i konvencije koda**: [CLAUDE.md](./CLAUDE.md)

---

## Tehnološki stek

- **Next.js 16** (App Router, React 19, TypeScript)
- **Convex 1.44** (Reaktivna baza podataka, serverless funkcije, cron poslovi, auth)
- **Tailwind CSS 4** (Dizajn sistem definisan u `app/globals.css` preko `@theme inline`)
- **shadcn/ui** (Primitivne UI komponente na bazi `@base-ui/react`)
- **GSAP** (Glatke mikro-animacije i tranzicije prilagođene `prefers-reduced-motion`)
- **Recharts** (Prikaz vremenskih serija i distribucije saobraćaja)

---

## Brzi start (Quickstart)

### Preduslovi
- Node.js 20+ i npm

### Lokalno pokretanje

1. **Instalacija zavisnosti**:
   ```bash
   npm install
   ```

2. **Pokretanje Convex razvojnog backend-a**:
   ```bash
   npm run convex:dev
   ```
   *(Pri prvom pokretanju kreira se Convex dev projekat i automatski upisuje `.env.local`)*

3. **Pokretanje Next.js razvojnog servera**:
   ```bash
   npm run dev
   ```
   Aplikacija je dostupna na [http://localhost:3000](http://localhost:3000).

### Dostupne komande

```bash
npm run dev          # Pokreće Next.js na http://localhost:3000
npm run convex:dev   # Pokreće Convex dev proces (sinhronizacija šeme i funkcija)
npm run lint         # Provera koda putem ESLint-a
npm run typecheck    # TypeScript provera tipova (tsc --noEmit)
npm run build        # Produkciona optimizacija i build
```

---

## Promenljive okruženja (Environment Variables)

Promenljive su jasno razgraničene između **Vercel / Frontend** strane i **Convex Backend** okruženja.

### 1. Frontend / Vercel strana (`.env.local` / Vercel Project Settings)

| Promenljiva | Opis | Primer vrednosti |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_CONVEX_URL` | Javni URL ka Convex deployment-u | `https://bright-otter-123.convex.cloud` |
| `CONVEX_DEPLOY_KEY` | Deploy ključ koji Vercel koristi tokom automatskog build-a | `prod:enigma-cc\|...` |

### 2. Convex Backend strana (`npx convex env set <KEY> <VALUE>`)

| Promenljiva | Opis | Primer vrednosti |
| :--- | :--- | :--- |
| `ENCRYPTION_KEY` | 32-bajtni heksadecimalni AES-256-GCM ključ za enkripciju kredencijala | `a1b2c3d4...` (64 hex karaktera) |
| `INSTAGRAM_APP_ID` | Meta App ID za Instagram Login / Graph API | `123456789012345` |
| `INSTAGRAM_APP_SECRET` | Meta App Secret za Instagram razmenu tokena | `abcdef0123456789...` |
| `SITE_URL` | Kanonski URL aplikacije za OAuth callback-ove | `https://digital.enigmait.rs` |
| `JWT_PRIVATE_KEY` | Privatni ključ za Convex Auth JWT potpisivanje | PEM format |

---

## Deploy Pipeline (Produkcioni tok)

Aplikacija se automatski distribuira na Vercel platformu:

1. Sve izmene se lokalno proveravaju pre slanja:
   ```bash
   npx tsc --noEmit && npm run lint && npm run build
   ```
2. Slanje koda na glavnu granu (`git push origin main`) automatski pokreće Vercel build.
3. Vercel tokom build procesa izvršava `npx convex deploy` koristeći `CONVEX_DEPLOY_KEY`.
4. **Napomena**: Nikada se ne pokreću ručne deploy komande koje bi mogle dovesti do desinhronizacije verzija koda.

---

## UTM konvencija

Standardna struktura parametara za atribuciju Instagram saobraćaja u GA4 i OpenReply integraciji:

- `utm_source=instagram`
- `utm_medium=openreply-dm | bio | story`
  - `openreply-dm` — automatizovani linkovi u OpenReply direktnim porukama
  - `bio` — link u biografiji Instagram profila
  - `story` — linkovi u Instagram objavama i pričama
- `utm_campaign=<kebab-case slug identičan imenu OpenReply kampanje>`

Deljena funkcija `slugify` (iz `convex/lib/slug.ts` / `lib/slug.ts`) vrši transliteraciju srpskih slova (`š->s`, `đ->dj`, `č->c`, `ć->c`, `ž->z`), pretvara u mala slova, zamenjuje razmake crticama i uklanja specijalne karaktere.

---

## "Sledeće ruke" Checklist (Puštanje u rad)

Kada infrastruktura eksternih servisa bude spremna, kompletirati sledeće korake:

- [ ] **OpenReply deploy + connection string**:
  - Podići produkcioni OpenReply servis i Postgres bazu.
  - Kreirati read-only korisnika na bazi:
    ```sql
    CREATE USER cc_reader WITH PASSWORD 'sigurna_lozinka_ovde';
    GRANT CONNECT ON DATABASE openreply TO cc_reader;
    GRANT USAGE ON SCHEMA public TO cc_reader;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO cc_reader;
    ```
  - Uneti connection string (`postgresql://cc_reader:...@host:5432/db`) u **Podešavanja** (`/settings`).
- [ ] **Meta Developer App + Instagram povezivanje**:
  - U Meta Developer portalu kreirati aplikaciju sa omogućenim Instagram Login i Graph API dozvolama (`instagram_basic`, `instagram_manage_insights`).
  - Postaviti `INSTAGRAM_APP_ID` i `INSTAGRAM_APP_SECRET` u Convex produkcionom okruženju (`npx convex env set`).
  - Na produkcionoj stranici [Podešavanja](https://digital.enigmait.rs/settings) kliknuti na **Poveži Instagram** i autorizovati Business nalog.
- [ ] **GA4 Property ID u produkcionim podešavanjima**:
  - Uneti Service Account JSON ključ (sa "Viewer" ulogom u GA4) i numerički GA4 Property ID u **Podešavanja** (`/settings`).
- [ ] **Google Ads API povezivanje (nakon Basic Access odobrenja)**:
  - Pratiti korake ispod za jednokratno generisanje OAuth Refresh Tokena i uneti kredencijale u **Podešavanja** (`/settings`).

---

## Google Ads OAuth Refresh Token Bootstrap (Uputstvo korak po korak)

Kada Google odobri **Basic Access Developer Token**, generisanje trajnog OAuth Refresh Tokena se vrši kroz sledeći standardni jednokratni postupak:

### 1. Podešavanje Google Cloud projekta
1. Otvorite [Google Cloud Console](https://console.cloud.google.com) i kreirajte novi projekat (npr. `Enigma-Ads-Sync`).
2. U meniju **APIs & Services > Library**, pretražite i omogućite **Google Ads API**.
3. U meniju **APIs & Services > OAuth consent screen**:
   - Izaberite **External** tip korisnika.
   - Unesite osnovne podatke aplikacije i dodajte vaš Google nalog kao **Test user**.
4. U meniju **APIs & Services > Credentials**:
   - Kliknite **Create Credentials > OAuth client ID**.
   - Izaberite tip aplikacije **Web application**.
   - U sekciju **Authorized redirect URIs** dodajte tačan URL:
     `https://developers.google.com/oauthplayground`
   - Kliknite **Create** i sačuvajte dobijeni **Client ID** i **Client Secret**.

### 2. Generisanje Refresh Tokena preko Google OAuth Playground-a
1. Otvorite [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground).
2. Kliknite na ikonicu zupčanika u gornjem desnom uglu:
   - Označite opciju **"Use your own OAuth credentials"**.
   - Unesite vaš **OAuth Client ID** i **OAuth Client Secret** iz prethodnog koraka.
3. U levom panelu (**Step 1: Select & authorize APIs**):
   - U polje *"Input your own scopes"* na dnu liste unesite:
     `https://www.googleapis.com/auth/adwords`
   - Kliknite na dugme **Authorize APIs**.
4. Prijavite se sa Google nalogom koji je vlasnik/administrator Google Ads naloga i odobrite pristup.
5. U delu (**Step 2: Exchange authorization code for tokens**):
   - Kliknite na plavo dugme **Exchange authorization code for tokens**.
   - Kopirajte vrednost iz polja **Refresh token** (počinje sa `1//...`).

### 3. Unos u Enigma Command Center
1. Otvorite stranicu [Podešavanja (`/settings`)](https://digital.enigmait.rs/settings).
2. Na kartici **Google Ads** unesite:
   - **Customer ID**: 10-cifreni ID naloga (npr. `123-456-7890`).
   - **Manager / Login Customer ID**: Opciono MCC ID ukoliko se pristupa preko krovnog naloga.
   - **Developer Token**: Vaš odobreni token iz Google Ads API centra.
   - **OAuth Client ID**: `xxxx.apps.googleusercontent.com`
   - **OAuth Client Secret**: `GOCSPX-...`
   - **OAuth Refresh Token**: Token dobijen u koraku 2 (`1//...`).
3. Kliknite **Sačuvaj**. Kredencijali se enkriptuju sa AES-256-GCM i čuvaju u bazi. Automatska sinhronizacija (cron na svaka 3h) i ručna sinhronizacija na klik biće odmah aktivne.
