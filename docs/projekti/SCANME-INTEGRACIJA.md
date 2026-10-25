# ScanMe ↔ Enigma Digital: forma na sajtu i Puls

Ovo je ugovor između sajta **scanme.rs** (ScanMe repo, Next.js + Convex) i panela **Enigma Digital**. ScanMe repo se po ovom dokumentu menja tek kad Jovan odluči; u Enigmi je sve već spremno.

Dokument ne sadrži nijednu tajnu. Gde stoji `<...>`, vrednost upisuje Jovan.

---

## 1. Pregled

Postoje dva toka:

| Tok | Smer | Kako |
|---|---|---|
| **Forma** | scanme.rs → Enigma | ScanMe šalje svaki upit sa kontakt forme na `POST /projekti/lead`. Upit se pojavljuje u Enigmi, projekat ScanMe → Leadovi → Danas → „Upiti sa sajta“, i u zvonu. Uz saglasnost posetioca ide i Meta CAPI događaj „Lead“ na piksel projekta ScanMe. |
| **Puls** | Enigma → scanme.rs | Enigma na 15 minuta zove `GET https://scanme.rs/api/puls` i prikazuje brojke na kontrolnoj tabli projekta ScanMe, u sekciji „Poslovanje“. |

**Šta Jovan prvo podešava u Enigmi** (projekat ScanMe → Podešavanja):

1. **Projekat → Sajtovi:** `scanme.rs`. Samo sa ovih sajtova forma sme da šalje (CORS), i samo na njima sme da bude adresa Pulsa.
2. **Sajt i oglasi:**
   - Meta piksel ID i CAPI token (bez njih se lead upisuje, ali CAPI događaj ne);
   - Puls (brojke poslovanja): `https://scanme.rs/api/puls`;
   - Token za Puls: nasumičan niz od 16 do 256 znakova. Ista vrednost ide u `PULS_TOKEN` na ScanMe-u.
3. **Pristup → Tokeni za uvoz i formu na sajtu:** novi token, namena **„Forma na sajtu“**. Token se vidi samo jednom; ide u `ENIGMA_LEAD_TOKEN` na ScanMe-u.

Token namene „Forma na sajtu“ ume **samo** da prijavi lead sa sajtova projekta. Uvoz leadova, snimci i mozak ga odbijaju (403). Zato sme da procuri bez veće štete, ali se i dalje drži na serveru (vidi §3).

---

## 2. Ugovor forme: `POST /projekti/lead`

**Adresa:** `POST https://<deployment>.convex.site/projekti/lead`

`<deployment>.convex.site` je „HTTP Actions URL“ iz Convex kontrolne table Enigme (Settings → URL & Deploy Key). To nije adresa panela (`digital.enigmait.rs`).

**Zaglavlja:**

```
Authorization: Bearer <token za formu>
Content-Type: application/json
```

**Telo** (JSON objekat, najviše 16.384 bajta; nepoznata polja se odbijaju):

| Polje | Tip i granice | Napomena |
|---|---|---|
| `ime` | tekst, 1–120 znakova | ime osobe |
| `email` | email, najviše 254 znaka | čuva se malim slovima |
| `telefon` | tekst, najviše 40 znakova | srpski broj se normalizuje na `+381…`; ostalo se čuva kako je stiglo |
| `firma` | tekst, 1–160 znakova | naziv firme ili lokala |
| `poruka` | tekst, najviše 2.000 znakova | |
| `stranica` | `https://` adresa, najviše 500 znakova | stranica sa formom; čuva se samo kad je na sajtu projekta |
| `utm` | objekat: `source`, `medium`, `campaign`, `term`, `content` (svaki najviše 100) | UTM parametri posete |
| `eventId` | `^[A-Za-z0-9_-]{8,64}$` | ključ deduplikacije; isti `eventId` koristi i piksel u pregledaču |
| `klijent` | objekat: `ip` (IPv4 ili IPv6), `userAgent` (najviše 400), `fbp` (najviše 120), `fbc` (najviše 200) | podaci posetioca kad ScanMe zove sa servera |
| `saglasnost` | objekat: `marketing` (true/false) | CAPI događaj ide samo uz `marketing: true` |

**Obavezno:** bar jedno od `email` i `telefon`. Inače 422 sa porukom „Treba email ili telefon.“

**Odgovori** (uvek JSON, `Cache-Control: no-store`):

| Status | Telo | Značenje |
|---|---|---|
| 200 | `{ "ok": true, "id": "<id upita>", "duplikat": false }` | upisano |
| 200 | `{ "ok": true, "id": "<id upita>", "duplikat": true }` | isti `eventId` je već stigao; ništa novo nije upisano |
| 401 | `{ "greska": "neispravan token" }` | nema tokena, nepoznat ili opozvan |
| 403 | `{ "greska": "token nije za formu na sajtu" }` | token namene „Uvoz“ |
| 403 | `{ "greska": "nedozvoljen izvor" }` | zahtev iz pregledača sa sajta koji nije među sajtovima projekta |
| 413 | `{ "greska": "telo je preveliko" }` | više od 16.384 bajta |
| 415 | `{ "greska": "telo mora biti application/json" }` | pogrešan `Content-Type` |
| 422 | `{ "greska": "neispravno telo", "polja": ["email: invalid_format"] }` | telo ne odgovara tabeli; `polja` nosi samo putanje, nikad vrednosti |
| 429 | `{ "greska": "previše zahteva" }` + zaglavlje `Retry-After` (sekunde) | više od 60 upita na sat po tokenu ili 300 na sat po projektu |

**Pravila:**

- **Deduplikacija.** Upit sa istim `eventId` se upisuje jednom i pravi najviše jedan CAPI događaj. Bez `eventId` dupli klik istog sadržaja u istom minutu je takođe jedan upit.
- **CAPI.** Događaj „Lead“ nastaje samo kad: upit nije duplikat, kontakt nije na listi zabrane projekta, `saglasnost.marketing` je `true`, a projekat ima piksel i CAPI token. Lead se upisuje u svakom slučaju.
- **CORS.** `OPTIONS /projekti/lead` odobrava svaki `https://` origin (preflight nema token). Pravo pravilo je u `POST`-u: zahtev sa zaglavljem `Origin` prolazi samo kad je host (bez `www.`) na spisku sajtova projekta, inače 403 pre ikakvog upisa. Zahtev bez `Origin` (server → server) prolazi.
- **Zaštita od botova** je posao forme: honeypot polje i, po želji, Cloudflare Turnstile pre slanja ka Enigmi. Enigma ima samo kapu po satu.
- **Privatnost.** Enigma čuva ime, email, telefon i poruku iz forme. Kad upit postane firma, kontakt prelazi u leadove projekta (pravni osnov: zahtev ispitanika); odbacivanje upita briše kontakt. Politika privatnosti scanme.rs mora da kaže da se upiti prosleđuju Enigma IT radi obrade.

---

## 3. Primer: Next.js u ScanMe-u (preporučeno, sa servera)

Forma šalje na sopstveni API ScanMe-a, a on, sa servera, zove Enigmu. Token tako nikad nije u pregledaču, a IP i user-agent posetioca idu u `klijent`.

`app/api/kontakt/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const forma = await request.json().catch(() => null);
  if (forma === null || typeof forma !== "object") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  // Honeypot: pravi posetilac ovo polje ne vidi i ne popunjava.
  if (typeof forma.sajt === "string" && forma.sajt.length > 0) {
    return NextResponse.json({ ok: true });
  }

  const telo = {
    ime: forma.ime || undefined,
    email: forma.email || undefined,
    telefon: forma.telefon || undefined,
    firma: forma.firma || undefined,
    poruka: forma.poruka || undefined,
    stranica: forma.stranica || undefined,
    utm: forma.utm || undefined,
    // Isti eventId je klijent dao i pikselu (fbq), da Meta spoji oba događaja.
    eventId: forma.eventId,
    klijent: {
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
      userAgent: request.headers.get("user-agent")?.slice(0, 400) || undefined,
      fbp: request.cookies.get("_fbp")?.value,
      fbc: request.cookies.get("_fbc")?.value,
    },
    // Iz banera za kolačiće: true samo kad je posetilac prihvatio marketing.
    saglasnost: { marketing: forma.saglasnostMarketing === true },
  };

  const odgovor = await fetch(process.env.ENIGMA_LEAD_URL!, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.ENIGMA_LEAD_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(telo),
    cache: "no-store",
  });

  // Posetiocu samo „primljeno“ ili „nije uspelo“; detalji ostaju u logu servera.
  if (!odgovor.ok) {
    console.error("Enigma lead:", odgovor.status);
    return NextResponse.json({ ok: false }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
```

Klijentska forma (`"use client"`), samo deo koji šalje:

```tsx
"use client";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

async function posalji(polja: Record<string, string>, saglasnostMarketing: boolean) {
  // 32 heksa znaka; prolazi ^[A-Za-z0-9_-]{8,64}$.
  const eventId = crypto.randomUUID().replaceAll("-", "");
  const odgovor = await fetch("/api/kontakt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...polja,
      stranica: window.location.href,
      eventId,
      saglasnostMarketing,
    }),
  });
  if (odgovor.ok && saglasnostMarketing) {
    // Piksel u pregledaču, isti eventID: Meta ga spaja sa događajem sa servera.
    window.fbq?.("track", "Lead", {}, { eventID: eventId });
  }
  return odgovor.ok;
}
```

`utm` forma čita iz adrese pri prvoj poseti (`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`) i šalje kao objekat sa ključevima `source`, `medium`, `campaign`, `term`, `content`.

---

## 4. Primer: Convex u ScanMe-u (alternativa)

Kad forma već piše u Convex ScanMe-a, isti poziv može da radi akcija. `ENIGMA_LEAD_URL` i `ENIGMA_LEAD_TOKEN` su tada u Convex env-u ScanMe-a, ne na Vercelu.

`convex/kontakt.ts`:

```ts
import { v } from "convex/values";
import { internalAction } from "./_generated/server";

export const prosledi = internalAction({
  args: {
    ime: v.optional(v.string()),
    email: v.optional(v.string()),
    telefon: v.optional(v.string()),
    poruka: v.optional(v.string()),
    stranica: v.optional(v.string()),
    eventId: v.string(),
    saglasnostMarketing: v.boolean(),
  },
  handler: async (_ctx, args) => {
    const { saglasnostMarketing, ...polja } = args;
    const odgovor = await fetch(process.env.ENIGMA_LEAD_URL!, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.ENIGMA_LEAD_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...polja, saglasnost: { marketing: saglasnostMarketing } }),
    });
    if (!odgovor.ok) throw new Error(`Enigma lead: ${odgovor.status}`);
    return null;
  },
});
```

Mutacija koja čuva formu zakazuje je sa `ctx.scheduler.runAfter(0, internal.kontakt.prosledi, {...})`. Convex akcija nema IP posetioca; ako je potreban za CAPI, prosleđuje ga Next.js ruta kao `klijent.ip`.

---

## 5. Puls endpoint koji ScanMe izlaže

Enigma na 15 minuta šalje:

```
GET https://scanme.rs/api/puls
Authorization: Bearer <PULS_TOKEN>
Accept: application/json
User-Agent: EnigmaDigital-Puls/1
```

**Odgovor** (status 200, JSON, najviše 64 KB, u roku od 10 sekundi):

```json
{
  "vreme": "2026-10-25T14:05:00Z",
  "metrike": {
    "aktivni_lokali": 318,
    "novi_lokali_7d": 26,
    "skeniranja_24h": 9412
  },
  "oznake": {
    "aktivni_lokali": "Aktivni lokali",
    "novi_lokali_7d": "Novi lokali (7 d)",
    "skeniranja_24h": "Skeniranja (24 h)"
  }
}
```

Metrike iznad su **primer**; ScanMe bira svoje.

| Pravilo | |
|---|---|
| `vreme` | ISO 8601, najviše 5 minuta u budućnosti; starije od 24 h kartica označava kao zastarelo |
| `metrike` | 1–20 ključeva; ključ `^[a-z0-9][a-z0-9_]{0,39}$`; vrednost je konačan broj, najviše ±10¹² |
| `oznake` | opciono; svaki ključ mora postojati u `metrike`; naziv 1–60 znakova |
| preusmerenje | Enigma ga **ne prati** (3xx je greška); adresa mora odgovoriti direktno |
| keš | `Cache-Control: no-store` |

`app/api/puls/route.ts`:

```ts
import { timingSafeEqual } from "node:crypto";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

function istiToken(primljen: string, ocekivan: string): boolean {
  const a = Buffer.from(primljen);
  const b = Buffer.from(ocekivan);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const zaglavlje = request.headers.get("authorization") ?? "";
  const token = zaglavlje.startsWith("Bearer ") ? zaglavlje.slice(7) : "";
  const ocekivan = process.env.PULS_TOKEN ?? "";
  if (ocekivan.length === 0 || !istiToken(token, ocekivan)) {
    return Response.json({ greska: "neovlašćeno" }, { status: 401 });
  }

  // Upit u ScanMe-u proverava PULS_INTERNI_KLJUC i vraća samo zbirne brojke.
  const brojke = await fetchQuery(api.puls.metrike, {
    kljuc: process.env.PULS_INTERNI_KLJUC!,
  });

  return Response.json(
    {
      vreme: new Date().toISOString(),
      metrike: {
        aktivni_lokali: brojke.aktivniLokali,
        novi_lokali_7d: brojke.noviLokali7d,
        skeniranja_24h: brojke.skeniranja24h,
      },
      oznake: {
        aktivni_lokali: "Aktivni lokali",
        novi_lokali_7d: "Novi lokali (7 d)",
        skeniranja_24h: "Skeniranja (24 h)",
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
```

Ruta mora da radi na Node.js runtime-u (podrazumevano), zbog `node:crypto`.

---

## 6. Env promenljive

| Gde | Ime | Vrednost | Ko postavlja |
|---|---|---|---|
| Vercel (ScanMe) | `ENIGMA_LEAD_URL` | `https://<deployment>.convex.site/projekti/lead` | Jovan |
| Vercel (ScanMe) | `ENIGMA_LEAD_TOKEN` | token namene „Forma na sajtu“ iz Enigme | Jovan |
| Vercel (ScanMe) | `PULS_TOKEN` | ista vrednost kao „Token za Puls“ u Enigmi | Jovan |
| Vercel (ScanMe) | `PULS_INTERNI_KLJUC` | nasumičan niz, poznat samo ScanMe-u | Jovan |
| Convex (ScanMe) | `PULS_INTERNI_KLJUC` | ista vrednost kao na Vercelu | Jovan |
| Convex (ScanMe), samo uz §4 | `ENIGMA_LEAD_URL`, `ENIGMA_LEAD_TOKEN` | kao gore | Jovan |
| Enigma | — | nema env-a; sve je u Podešavanjima projekta ScanMe | — |

---

## 7. Provera sa `curl`

Zameni `<deployment>` i `<token za formu>`. Komande su za Git Bash; PowerShell je ispod.

**Preflight** (odgovor 204 sa `Access-Control-Allow-Origin: https://scanme.rs`):

```bash
curl -i -X OPTIONS "https://<deployment>.convex.site/projekti/lead" \
  -H "Origin: https://scanme.rs" \
  -H "Access-Control-Request-Method: POST"
```

**Lead** (200 i `"duplikat": false`; isti zahtev ponovo daje `"duplikat": true`):

```bash
curl -i -X POST "https://<deployment>.convex.site/projekti/lead" \
  -H "Authorization: Bearer <token za formu>" \
  -H "Content-Type: application/json" \
  -d '{"ime":"Test","email":"test@scanme.rs","poruka":"Proba","eventId":"proba_0001"}'
```

**Tuđ sajt** (403 `nedozvoljen izvor`, ništa se ne upisuje):

```bash
curl -i -X POST "https://<deployment>.convex.site/projekti/lead" \
  -H "Origin: https://primer.com" \
  -H "Authorization: Bearer <token za formu>" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@scanme.rs","eventId":"proba_0002"}'
```

**Puls** (200 i JSON po formatu iz §5; bez tokena 401):

```bash
curl -i "https://scanme.rs/api/puls" -H "Authorization: Bearer <PULS_TOKEN>"
```

**PowerShell** (isto, za Jovana):

```powershell
$url = "https://<deployment>.convex.site/projekti/lead"
$zaglavlja = @{ Authorization = "Bearer <token za formu>" }
$telo = @{ ime = "Test"; email = "test@scanme.rs"; poruka = "Proba"; eventId = "proba_0001" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri $url -Headers $zaglavlja -ContentType "application/json" -Body $telo

Invoke-RestMethod -Uri "https://scanme.rs/api/puls" -Headers @{ Authorization = "Bearer <PULS_TOKEN>" }
```

Test lead se posle provere odbacuje u Enigmi: Leadovi → Danas → Upiti sa sajta → Odbaci → „Spam ili test“.

---

## 8. Van ovog dokumenta

- Baner za kolačiće na scanme.rs i odluka da li tamo ide Meta piksel i GA4 (bez banera nema saglasnosti, pa ni CAPI događaja).
- Izmene u ScanMe repou: rade se tek kad Jovan odluči, po §3–§5.
