# Novosti — plan i arhitektura

Datum: 29.08.2026
Repo: `enigmadigital` (pisanje) + `enigmait.rs` (prikaz)
Osnova: plan iz drugog chata, revidiran posle provere u kodu i na izvorima.

Ovaj dokument je referenca za promptove. Sekcije se ne prenumerišu; nove se
dodaju na kraj da raniji opsezi linija ostanu stabilni.

---

## §0. Zaključane odluke

| Pitanje | Odluka |
|---|---|
| Cilj bloga | Klijenti za Enigma IT prvo. Komandni centar kasnije. |
| Publika | Firme u Srbiji koje traže izvođača: sajt, mobilna aplikacija, sistem. |
| Pismo | Samo latinica. `locale: "sr-Latn"`. Bez preslovljavanja, bez hreflang-a. |
| Ritam | Vođen materijalom, ne kvotom. Kapija umesto brojke. |
| Cene | Piše se šta diže cenu, bez cifara. |
| LLM | Gemini API, free tier. Ključ kroz Convex dashboard. |
| Izvršavanje | Convex cron + `"use node"` akcija. Bez VPS-a. |
| Skrejpovanje | Ne. Isto pravilo kao kod lead mašine. |

---

## §1. Obim: šta se gradi sada

Gradi se:

- `posts` i `postRevisions` u Convexu
- javni upiti sa filterom unutar upita
- ekran za pisanje u komandnom centru
- `/novosti` i `/novosti/[slug]` na enigmait.rs, server rendering
- sitemap, RSS, JSON-LD, OG slike
- slike i dijagrami u Convex storage
- dugme „napravi objave za mreže"

Odloženo, ne obrisano — vidi §14:

- radar (changelog cron, `topicCandidates`)
- `news` tip posta
- stranica `enigmait.rs/komandni-centar`
- Search Console kao provajder

---

## §2. Teme: raznovrsnost je zahtev, ne ukras

Blog koji melje jednu temu izgleda kao landing stranica. Treba šest kategorija
u rotaciji, i nijedna ne sme da nosi više od trećine objava u mesecu.

**A. Novac i rokovi** — šta diže cenu, zašto rok proklizi, kako se piše obim
posla, šta znači „gotovo". Bez cifara.

**B. Odluke sa projekata** — zašto smo na projektu X izabrali Y. Portfolio
napisan kao odluka, a ne kao slika. Najlakši za pisanje jer je već proživljen.

**C. Kako stvar radi** — objašnjenja mehanizama za nekoga ko nije programer:
šta je API, zašto je sajt spor, šta znači da aplikacija „radi offline", kako
podaci putuju. Ovde dijagram nosi tekst.

**D. Greške i kvarovi** — šta je puklo, zašto, i kako se prepoznaje.
Najvredniji format, jer se piše dok se dešava i niko drugi ga nema.

**E. AI u razvoju** — ne „šta je AI", nego šta se stvarno desilo kad je AI
pisao deo koda: gde je pomoglo, gde je pukло, i kako se to hvata.

**F. Srpski kontekst** — PDV na digitalne usluge, PIB i APR, plaćanje, .rs
hosting, ugovor sa domaćim klijentom, verifikacije kod Mete i Gugla. Niko ovo
ne piše na srpskom za klijente.

### §2.1. Odakle materijal, po prioritetu

1. **Tvoj rad.** Ono što ti se desilo dok radiš. Najizdašniji izvor i jedini
   koji je stvarno tvoj. Hvata se dok se dešava, ne naknadno.
2. **Tvoja baza.** Grupisana pitanja iz inboxa — vidi §12 za obavezno pravilo.
3. **Internet.** Tek treći, i samo kao provera činjenica i konteksta. Nikad kao
   sirovina.

### §2.2. Pravilo jedinstvenosti

Svaki post mora da odgovori na jedno pitanje pre objave: **šta je ovde moje?**

Prihvatljiv odgovor je tačno jedan od: sopstveni podatak, sopstveni snimak
ekrana, sopstveni slučaj, sopstveni dijagram, ili stav koji drugi ne zauzimaju.

Ako nema odgovora, to nije post nego prepričavanje. Google to zove „scaled
content abuse" — i bitno: ne kažnjava se to što je pisano uz AI, nego masovna
proizvodnja bez dodate vrednosti. Uz to, prepričavanje promašuje i sopstveni
cilj: AI ne citira desetu kopiju, citira izvor.

---

## §3. Dve vrste posta

**`note` — beleška, 200–500 reči.**
Jedna stvar, jedan snimak ekrana, jedna tvrdnja. Ne pokušava da rangira.
Postoji da sajt bude živ i da hrani mreže.

**`article` — tekst, 1.200–2.500 reči.**
Rangira i biva citiran. Obavezno nosi bar jedno iz §2.2.

Ista tema može da rodi oboje: beleška dok se dešava, tekst kad se slegne.

---

## §4. Kapije pre objave

`publish` mutacija **odbija** post ako nije ispunjeno:

1. `ownProofChecked === true` — ručno, čovek potvrđuje da postoji odgovor na
   pitanje iz §2.2. Mašina ovo ne može da proveri.
2. `humanizerPassedAt` postavljen.
3. `coverAlt` popunjen ako postoji slika.
4. `dek` neprazan.

Ovo su blokade, ne upozorenja. Čekboks koji ne blokira nije kapija.

Automatske provere koje humanizer nosi i koje su merljive:

- nula em crtica (—)
- najviše jedan fragment kraći od pet reči na 500 reči
- bez „ne samo X nego Y"
- bez konstrukcija „X je Y od Z" koje zvuče kao izreka

---

## §5. Šema u `convex/schema.ts`

Multi-tenant od prvog dana. `workspaceId` stoji i kad postoji jedan workspace,
da „vodimo vam i blog" kasnije bude još jedan red, a ne prepravka.

```ts
posts: defineTable({
  workspaceId: v.id("workspaces"),
  slug: v.string(),
  locale: v.string(),                 // "sr-Latn"
  kind: v.union(v.literal("note"), v.literal("article")),
  category: v.union(                  // §2, za rotaciju i za listu
    v.literal("novac_rokovi"),
    v.literal("odluke"),
    v.literal("kako_radi"),
    v.literal("greske"),
    v.literal("ai_razvoj"),
    v.literal("srpski_kontekst"),
  ),
  title: v.string(),
  dek: v.string(),
  body: v.string(),                   // markdown
  coverStorageId: v.optional(v.id("_storage")),
  coverAlt: v.optional(v.string()),
  authorName: v.string(),
  authorRole: v.optional(v.string()),
  tags: v.array(v.string()),
  status: v.union(
    v.literal("draft"), v.literal("scheduled"),
    v.literal("published"), v.literal("archived"),
  ),
  publishedAt: v.optional(v.number()),
  updatedAt: v.number(),
  reviewedAt: v.optional(v.number()),
  seoTitle: v.optional(v.string()),
  seoDescription: v.optional(v.string()),
  canonicalUrl: v.optional(v.string()),
  ogImageStorageId: v.optional(v.id("_storage")),
  readingMinutes: v.optional(v.number()),
  ownProofChecked: v.boolean(),
  ownProofNote: v.optional(v.string()),   // ČIME je ispunjeno, jednom rečenicom
  humanizerPassedAt: v.optional(v.number()),
  relatedSlugs: v.optional(v.array(v.string())),
})
  .index("by_workspace_status_published", ["workspaceId", "status", "publishedAt"])
  .index("by_workspace_slug", ["workspaceId", "slug"])
  .index("by_workspace_category", ["workspaceId", "category"]),

postRevisions: defineTable({
  postId: v.id("posts"),
  body: v.string(),
  savedAt: v.number(),
  note: v.optional(v.string()),
}).index("by_post", ["postId"]),
```

### §5.1. Ispravka: Convex ne indeksira nizove

Originalni plan je predlagao:

```ts
.index("by_workspace_tag", ["workspaceId", "tags"])   // tags: v.array(...)
```

**Convex ne podržava indeks nad poljem tipa niz.** Ovaj indeks ne daje „nađi sve
postove sa tagom X".

Rešenje za sadašnji obim: **nema indeksa nad tagovima.** Dovuci objavljene
postove kroz `by_workspace_status_published` i filtriraj tagove u memoriji.
Kad broj postova pređe nekoliko stotina, uvodi se `postTags` tabela
(`postId`, `workspaceId`, `tag`) sa indeksom `["workspaceId", "tag"]`.

Zato je gore uveden `category` kao union — kategorija je jedna vrednost i može
da se indeksira, a tagovi ostaju slobodni i nefiltrirani indeksom.

### §5.2. `postRevisions` mora imati zadržavanje

Tabela raste bez kraja. Pravilo: zadrži poslednjih 20 revizija po postu, ili
sve mlađe od 180 dana, šta je veće. Čisti se cronom.

---

## §6. Purge gate — obavezno u prvom promptu

`scripts/verify-purge-coverage.ts` čita `schema.tables` i traži odluku za SVAKU
tabelu. Dve nove tabele bez unosa u `convex/lib/purgeMap.ts` **obaraju**
`npm run build`.

Odluka je: **izuzeće sa napisanim razlogom** u `EXTRA_TABLE_OWNERSHIP`, ista
klasa kao `rules` i `adActions` — ovo je sopstveni sadržaj operatera, ne podaci
preuzeti od provajdera, pa prekid veze sa bilo kojim provajderom ne briše
blog.

Predložen tekst razloga:

- `posts` — Sopstveni sadržaj koji je operater napisao i objavio pod svojim
  imenom. Ne dolazi ni od jednog provajdera i prekid veze ga ne dodiruje.
  Briše se ručno, iz ekrana za pisanje.
- `postRevisions` — Istorija izmena sopstvenog sadržaja. Prati sudbinu `posts`;
  ograničava se zadržavanjem iz §5.2.

---

## §7. Javni upiti i bezbednost

Javni Convex upit može da pozove svako ko zna adresu deploya. Zato:

- filter `status === "published"` i `publishedAt <= Date.now()` je **unutar
  upita**, nikad u Next.js-u
- upit ne prima `status` kao argument, ni u kom obliku
- nacrti se ne vraćaju ni pod kojim argumentima
- upit vraća samo polja koja idu na javnu stranicu; interna polja
  (`ownProofChecked`, `ownProofNote`, `humanizerPassedAt`) se ne serviraju

```ts
// convex/postsPublic.ts
export const listPublished = query({
  args: {
    workspaceSlug: v.string(),
    category: v.optional(/* union kao u šemi */),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => { /* ... */ },
});

export const getPublishedBySlug = query({
  args: { workspaceSlug: v.string(), slug: v.string() },
  handler: async (ctx, args) => { /* ... */ },
});
```

**Ispravka od 29.08.2026 — plafon poziva ovde ne može.** Ranija verzija ove
sekcije je tražila `publicRouteUsage` obrazac. To je greška u specifikaciji:
`claimRouteCall` je `internalMutation`, a Convex `query` ne sme da piše — brojač
se iz upita ne može uvećati. Plafon bi zahtevao da javna čitanja idu kroz
`httpAction` umesto kroz `query`, što je veća promena bez stvarne koristi.

Zaštita je umesto toga slojevita i dovoljna:
- ISR na enigmait.rs (`revalidate = 3600`) — Convex se dodiruje samo na promašaj keša
- veličina stranice tvrdo ograničena na 50, `SCAN_CAP` 200 dokumenata po pozivu
- adresa deploya se ne objavljuje nigde

Ako obim ikad bude zahtevao pravi plafon, javna čitanja se prebacuju na
`httpAction` i tek tada `publicRouteUsage` postaje primenljiv.

---

## §8. enigmait.rs — prikaz

**Server rendering je obavezan.** AI crawleri ne izvršavaju JavaScript. Ako se
tekst povlači u pregledaču kroz `useQuery`, ChatGPT, Perplexity i Claude vide
praznu stranicu.

```ts
// app/(pages)/novosti/[slug]/page.tsx
import { fetchQuery } from "convex/nextjs";

export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() { /* slugovi objavljenih */ }
export async function generateMetadata({ params }) { /* title, description, canonical, OG */ }
```

Potrebno u enigmait repou:

- paket `convex`
- `NEXT_PUBLIC_CONVEX_URL` ka enigmadigital deployu
- `remotePatterns` za Convex storage domen u `next.config.ts`

Obaveze:

- `sitemap.ts` proširen postovima, `lastModified` iz `updatedAt`
- RSS na `/novosti/rss.xml`
- JSON-LD `BlogPosting` (`datePublished`, `dateModified`, `author`) i
  `BreadcrumbList`
- `robots.txt`: propusti GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot
- kanonik uvek na enigmait.rs, i kad isti tekst ide na LinkedIn
- **ne pravi `llms.txt`.** Google ga ne koristi; Mueller ga je opisao kao
  „purely speculative for now". Nema ni koristi ni štete, ali nije prioritet.

### §8.1. Struktura teksta

- Odgovor na pitanje iz naslova u **prvih 40–60 reči**.
- Pasusi koji stoje sami, oko 130–170 reči, jer se takvi najčešće citiraju.
- Podnaslovi kao pitanja.
- Tabele za poređenja, liste za korake.
- Slika, dijagram ili snimak u svakom tekstu.

---

## §9. Revalidate — tajna ide u zaglavlje, ne u URL

Originalni plan je predlagao `GET .../api/revalidate?secret=...`. **Ne.** Query
string završi u Vercel access logovima, u logovima proksija i u `Referer`
zaglavlju.

Ispravno:

```
POST https://enigmait.rs/api/revalidate
x-revalidate-secret: <NOVOSTI_REVALIDATE_SECRET>
body: { "path": "/novosti/<slug>" }
```

Ruta poredi zaglavlje sa env varijablom u konstantnom vremenu i tek onda zove
`revalidatePath`. Convex `httpAction` je zove posle objavljivanja i posle svake
izmene objavljenog posta.

Tajna se postavlja kroz Vercel i Convex dashboard, nikad kroz komandnu liniju.

---

## §10. 404 nije isto što i kvar

```ts
const post = await fetchQuery(...);
if (!post) notFound();     // POGREŠNO
```

`fetchQuery` vraća `null` i kad post ne postoji, i kad Convex ne odgovara. U
drugom slučaju serviraš 404 Googlebotu za stranicu koja postoji — i ona ispada
iz indeksa.

Ispravno:

- `fetchQuery` u `try/catch`
- izuzetak → propusti grešku, Next vraća 500, crawler se vraća kasnije
- stvarni `null` → `notFound()`

Isto pravilo koje važi svuda u ovom projektu: neuspela operacija ne sme da
izgleda kao prazan rezultat.

---

## §11. Slike i dijagrami

Dijagram zaslužuje mesto samo kad pokazuje mehanizam ili poređenje: tok
podataka, ko koga zove, gde proces puca. Ako ponavlja ono što piše u pasusu,
izbacuje se.

Tok: nacrtaj (Excalidraw ili slično) → izvezi PNG ili SVG → **otpremi u Convex
storage** → post gađa `coverStorageId` ili sliku u telu.

**Share link trećeg servisa ne ide u post.** Tuđi domen može da nestane ili da
se promeni, a crawler ga ne vidi kao tvoj sadržaj.

`coverAlt` je obavezan — alt tekst je jedino što crawler iz slike pročita.

OG slika: jedan izvor istine. Ako je `ogImageStorageId` postavljen, koristi se
on; inače se generiše kroz `next/og`. Ne oba.

---

## §12. Inbox kao izvor tema — obavezno pravilo

Grupisanje pitanja iz `orInboundMessages`, `orConversations`, `igComments`,
`fbComments`, `threadsReplies`, `leadInbound` je dozvoljeno kao izvor **tema**.

Ali to su poruke stvarnih ljudi, a javni sadržaj je nova svrha obrade. Uz to,
projekat ima garanciju brisanja (purge gate, `purgeRuns`): blog post izveden iz
nečije poruke ne briše se kad ta poruka nestane.

Zato, tvrdo:

> Iz inboxa izlazi **samo tema, nikad tekst**. Nijedan citat, nijedan detalj po
> kom se osoba prepoznaje, nijedan ID ni sadržaj izvorne poruke u `posts`.

Zato u šemi iz §5 **nema** `sourceRefs`. Agent vraća „pet ljudi je pitalo isto o
X", ne „evo šta je klijent napisao".

---

## §13. Mreže

Iz istog ekrana, posle objave:

- Threads: 3–5 objava, svaka jedna tvrdnja iz teksta, do 500 bajtova, poslednja
  sa linkom
- Instagram: karusel 5–7 slajdova, jedan korak po slajdu, link u biju
- link uvek kroz `/r/<slug>`, da klik postane signal i da se veže za sesiju

Ide kroz postojeće `igPublishJobs` i `threadsPublishJobs`. Novo je samo dugme
„napravi objave od ovog teksta".

Kanonik ostaje na enigmait.rs. Ista informacija na više mesta nije duplikat dok
kanonik pokazuje na izvor.

---

## §14. Odloženo — razlozi, da se ne izgubi

**Radar (`topicCandidates` + cron nad changelog-ovima).** Prati Meta Graph,
Threads, Google Ads i Search Central changelog-ove i predlaže teme. Publika za
to je ona koja te gleda kao alat, a prvo se hvata klijentska. Vraća se kad
krene marketing komandnog centra.

**`news` tip posta.** Kratka objava vezana za vest, sa sopstvenim uglom. Ide
zajedno sa radarom.

**Reddit.** Isključen trajno za sada. Besplatni Reddit Data API ne dozvoljava
komercijalnu upotrebu bez pismenog odobrenja, a komercijalna licenca je van
razmatranja. Uz to je srpski sadržaj tanak. Ako se ikad vrati, prvo se čitaju
Redditovi uslovi direktno kod njih, ne sekundarni izvori.

**`enigmait.rs/komandni-centar`.** Prodajna stranica za alat. Čeka da TikTok i
ostale veze budu gotove.

**Search Console kao provajder.** U repou ne postoji nijedna referenca — nije
„već tu" kako je originalni plan pretpostavio. Nov OAuth, nov provajder, nova
kvota. Vredan jer je jedino mesto gde se vidi šta ljudi kucaju pre nego što
stignu do tebe, ali je zaseban posao.

---

## §15. Redosled izgradnje

**Sprint 1.** `posts` i `postRevisions`, purge mapa (§6), javni upiti (§7),
ekran za pisanje u komandnom centru: lista, uređivanje, status, otpremanje
slika, kapije iz §4.

**Sprint 2.** `/novosti` i `/novosti/[slug]` na enigmait: SSR, `generateMetadata`,
JSON-LD, sitemap, RSS, revalidate ruta (§9), razdvajanje 404 i 500 (§10).

**Sprint 3.** OG slike, kategorije i tagovi, srodni tekstovi, ekran za
osvežavanje starih tekstova (`reviewedAt` stariji od 150 dana).

**Sprint 4.** Dugme „napravi objave" prema postojećem publishing pipeline-u.

Prvi tekst može da izađe na kraju sprinta 2.

---

## §16. Ispravke originalnog plana — trag

| Šta je pisalo | Šta je utvrđeno |
|---|---|
| `.index("by_workspace_tag", ["workspaceId", "tags"])` | Convex ne indeksira nizove. §5.1 |
| `GET /api/revalidate?secret=...` | Tajna u query stringu curi u logove. §9 |
| `if (!post) notFound()` | Kvar backenda bi izbacio stranicu iz indeksa. §10 |
| Nema pomena purge gate-a | Dve nove tabele obaraju build. §6 |
| „Search Console je već tu" | U repou ne postoji. §14 |
| „Reddit API je dovoljan" | Free tier zabranjuje komercijalnu upotrebu. §14 |
| 20 beleški : 2 teksta mesečno | Plan sam kaže da prosek obara domen. Ritam se vodi materijalom. §0 |
| `sourceRefs` u `posts` | Trajna veza ka ličnim podacima koja preživljava purge. §12 |
| `llms.txt` datumi 15.05. i 15.06.2026 | Ti datumi ne postoje. Zaključak stoji, izvor ne. §8 |
| Ahrefs 75.000 brendova, YouTube najjači signal | Tačno. Potvrđeno. |
| Svežina ispod ~13 nedelja nosi citate | Tačno. Potvrđeno. |
| Subdomen umesto podfoldera | Tačno, ostaje kako jeste. |

---

## §17. „Napravi objave za mreže" — kako se izvodi

Zamenjuje §13. Tamo je opisan cilj; ovde je izvedba.

### §17.1. Šta NE ide

**Bez MCP-a.** MCP povezuje interaktivnog klijenta sa alatima. U Convex akciji
nema MCP klijenta. Poziv ka modelu je običan `fetch` iz `"use node"` akcije,
isto kao Meta Graph i Google Ads pozivi koji već postoje.

**Bez generisanja slika za slajdove.** AI modeli za slike ne renderuju tekst
pouzdano — slova izađu izobličena i to se ne popravlja promptom. Slajd čiji je
sadržaj tekst se **renderuje iz šablona**, ne generiše.

**Bez automatskog objavljivanja.** Dugme pravi NACRTE. Objavljivanje je uvek
čovekov klik. Automatsko puštanje AI teksta na brend nalog je način da se
napravi bruka koja se ne povlači.

### §17.2. Tok

```
objavljen post (posts)
  │
  ├─ za svaku mrežu, ZASEBAN poziv modelu
  │    Gemini API, sistemski prompt specifičan za mrežu + telo posta
  │    → tekst upisan u postDerivatives kao status "draft"
  │
  ├─ renderovanje slika iz šablona (next/og / Satori)
  │    → PNG u Convex storage → storageId u postDerivatives
  │
  └─ čovek pregleda ekran „Objave", ispravi, pusti kroz
     igPublishJobs / threadsPublishJobs
```

**Jedan poziv po mreži, ne jedan poziv za sve.** Razlozi:

- svaki sistemski prompt se podešava zasebno, bez diranja ostalih
- pad jednog poziva ne obara ostale — neuspeh jedne mreže se vidi kao neuspeh
  te mreže, ne kao prazan rezultat za sve
- ponavljanje se radi po mreži, a ne za ceo skup

### §17.3. Šta koja mreža traži

Stanje na dan 29.08.2026. Izvori su analize trećih strana, ne Metina
dokumentacija — proveriti pre svakog većeg podešavanja prompta.

**Instagram**

- karusel je format sa najboljim učinkom (Buffer, analiza ~4 miliona objava),
  pa video, pa jedna slika
- deljenje u DM je najjači signal distribucije
- **ključne reči u opisu nose više od heštegova**; praćenje heštega je ukinuto i
  težina im je smanjena — gomilanje heštega šteti
- 5–7 slajdova, jedan korak ili jedna tvrdnja po slajdu
- link u biju, jer ga u opisu nema

**Threads**

- **objava sa slikom osetno nadmašuje goli tekst** (procena ~3×). Originalni
  plan je predviđao samo tekst — ispravljeno: svaka Threads objava iz ovog toka
  nosi bar jednu sliku.
- prve dve linije su presudne, objava se seče na ~4 linije
- repost je najjači signal, lajk najslabiji
- odgovori duži od osam reči se broje, kratki skoro ne
- **spoljni linkovi se više ne kažnjavaju** — kazna iz 2024. je pala; ali link
  bez konteksta i dalje šteti
- 1–2 topic taga, ne heštег gomila
- sopstveni odgovor na svoju objavu u prvih 90 sekundi diže dubinu niti
- 3–5 objava u nizu, svaka jedna tvrdnja, poslednja sa linkom

Zajedničko: link uvek kroz `/r/<slug>`, kanonik ostaje na enigmait.rs.

### §17.4. Slike se renderuju, jednim motorom

Isti `next/og` (Satori) koji po §11 pravi OG slike pravi i slajdove karusela.
Jedan renderer, tri upotrebe: OG slika, slajdovi karusela, slika za Threads.

Prednosti nad generisanjem: uvek tačan tekst, uvek tvoja boja i font,
deterministično, besplatno, bez ijednog AI poziva.

Šablon prima: naslov, telo slajda, redni broj, logo, kategoriju. Ništa više.

AI generisanje slika ostaje neiskorišćeno. Za IT firmu generička AI ilustracija
čita se kao jeftino, a snimci ekrana i dijagrami iz §11 su ionako ono što po
§2.2 dokazuje da znaš posao.

### §17.5. Šema

```ts
postDerivatives: defineTable({
  workspaceId: v.id("workspaces"),
  postId: v.id("posts"),
  platform: v.union(v.literal("instagram"), v.literal("threads")),
  seq: v.number(),                    // redosled u nizu / karuselu
  text: v.string(),
  imageStorageIds: v.array(v.id("_storage")),
  imageAlt: v.optional(v.string()),
  status: v.union(
    v.literal("draft"), v.literal("approved"),
    v.literal("queued"), v.literal("published"), v.literal("failed"),
  ),
  model: v.optional(v.string()),      // koji model je napisao, za trag
  generatedAt: v.number(),
  editedByHuman: v.boolean(),         // da li je čovek dirao tekst
  failureReason: v.optional(v.string()),
})
  .index("by_post", ["postId"])
  .index("by_workspace_status", ["workspaceId", "status"]),
```

`failureReason` postoji da neuspeh generisanja ne izgleda kao prazan skup
objava. Nepoznat uzrok se piše kao nepoznat, nikad kao „nema objava".

Ova tabela ide u purge mapu po §6, kao izuzeće — sopstveni sadržaj, izveden iz
sopstvenog posta, ne dolazi ni od jednog provajdera.

### §17.6. Ključ i trošak

Gemini API ključ ide u Convex dashboard kao `GEMINI_API_KEY`. Nikad kroz
`npx convex env set`, nikad u log, nikad u poruku greške.

Trošak: dve mreže × jedan poziv po objavi. Na free tieru je to bez naplate za
očekivani obim. Renderovanje slika ne troši ništa jer nije AI poziv.

---

## §18. Vizuelni sistem slajdova

Dopunjuje §17.4. Testirano 29.08.2026: renderovano sedam slajdova sa srpskim
tekstom (Šta, diže, Četiri, očekuju, naplaćuje, nedorečena, produžava) — sve
kvačice tačne, jer slova dolaze iz fonta a ne iz modela.

**Tema je tamna, u Enigminoj paleti.** Svetla varijanta je odbačena.

### §18.1. Boje — iz `app/globals.css`, ne izmišljene

| Uloga | Promenljiva | Vrednost |
|---|---|---|
| Podloga slajda | `--bg-950` | `#070d19` |
| Površina (kutije, terminal) | `--surface` | `#131d31` |
| Izdignuta površina | `--surface-raised` | `#18253a` |
| Osnovni tekst | `--text-primary` | `#f3f7ff` |
| Prigušeni tekst | `--text-secondary` | `rgba(193,211,245,.75)` |
| Najtiši tekst | `--text-muted` | `rgba(148,170,210,.6)` |
| Linija | `--line` | `rgba(96,128,180,.28)` |
| Akcent | `--accent-400` | `#58c4ff` |
| Sjaj | `--accent-glow` | `rgba(56,189,248,.28)` |

Za dijagrame i trake koriste se `--chart-*`: `#1c9dd6`, `#d95926`, `#199e70`,
`#c98500`, `#d55181`, `#9085e9`. Za grešku `--danger` `#fb7185`.

**Pravilo koje se prenosi iz aplikacije:** cyan je rezervisan za interaktivne
elemente i ključne metrike. Na slajdu to znači — cyan ide samo na ono što je
poenta slajda. Nikad kao ukras, nikad na dva mesta odjednom.

### §18.2. Tipografija i prostor

| | Vrednost |
|---|---|
| Font | Inter 300 / 400 / 500, ugrađen base64 |
| Mono | DejaVu Sans Mono ili JetBrains Mono, za `kod` arhetip |
| Naslov | 100px, težina **300**, `letter-spacing: -.035em` |
| Podnaslov slajda | 54–66px, težina 300 |
| Telo | 35px, težina 400, `line-height 1.55` |
| Govorna nit (cue) | 28px, `--text-muted` |
| Veliki broj | 230px, težina 300, cyan |
| Margine | 92px sa strane, 78px dole |

Naslovi su **laki i veliki**, nikad teški. Ako je slajd pretrpan, briše se
element — ne smanjuje se font.

### §18.3. Ambijent

Dva sloja iza sadržaja, oba čist CSS:

- **mreža** 90×90px u `--line-soft`, maskirana radijalno na gornji desni ugao
  (`mask-image: radial-gradient(ellipse 90% 60% at 78% 8%, #000, transparent 72%)`)
- **aura** 760px krug u `--accent-glow`, gore desno, `blur(30px)`

Bez ovoga slajd izgleda kao ravna crna ploča. Sa ovim ima dubinu, a ne odvlači
pažnju sa teksta.

### §18.4. Arhetipovi slajda

Šablon prima samo podatke; raspored bira arhetip.

| Arhetip | Kada | Podaci koje prima |
|---|---|---|
| `naslovni` | prvi slajd | `nadnaslov`, `naslov`, `pod` |
| `broj` | jedan podatak nosi ceo slajd | `vrednost`, `naslov`, `fus` (odakle je) |
| `dijagram` | objašnjava se mehanizam | `naslov`, SVG, `cue` |
| `tvrdnja` | numerisana stavka | `broj`, `naslov`, `telo` |
| `kod` | greška, log, komanda, konfiguracija | `naslov`, `jezik`, `linije[]`, `cue` |
| `uporedno` | odnos ili raspodela | `naslov`, `stavke[{l,v,boja}]`, `cue` |
| `snimak` | postoji sopstveni snimak ekrana | `naslov`, slika, opis |
| `zavrsni` | poslednji slajd | `naslov`, `pod` |

`kod` i `snimak` su najvredniji, jer po §2.2 nose sopstveni dokaz. Kad postoji
stvarna greška ili stvaran snimak, oni imaju prednost nad dijagramom.

`broj` obavezno nosi `fus` — odakle podatak. Broj bez izvora se ne kači.

### §18.5. Dijagrami — dva puta, ne mešati

**U automatskom toku: inline SVG.** Crta se iz koda, u paleti iz §18.1, tekst
unutar SVG-a je pravi tekst. Renderuje se zajedno sa slajdom, bez spoljnog
poziva. Jedini put koji Convex akcija može da izvede.

**Van automatskog toka: Excalidraw, rukom.** Kad se za blog tekst crta složeniji
dijagram, radi ga čovek: izvoz u PNG/SVG → Convex storage → §11. Share link
Excalidrawa **ne ide ni u post ni u objavu**, iz razloga u §11.

Excalidraw se ne poziva iz aplikacije — interaktivan je i vraća link, a u Convex
akciji nema ko da ga vodi.

### §18.6. Renderer

Jedan modul, tri izlaza:

```
renderSlide(arhetip, podaci, format) → PNG
  "ig"       1080 × 1350   karusel
  "threads"  1080 × 1080   kvadrat uz objavu
  "og"       1200 ×  630   otvoreni graf za sajt
```

Font se ugrađuje kao base64 u sam dokument — Satori ne čita fontove sa sistema,
a font mora imati č ć š ž đ. Inter, Roboto i Source Sans ih imaju; font bez njih
daje prazne kvadratiće.

**Prvi test svakog šablona je uvek isti niz:**
Šta diže cenu · Četiri · očekuju · naplaćuje · nedorečena · produžava.

### §18.7. Pozadina generisana modelom — opcionalno

GPT Image 2 može da napravi apstraktnu pozadinu **bez ijednog slova**, koja ide
kao `background` iza mreže i aure. Tekst se i dalje renderuje preko.

Generiše se **jedna pozadina po objavi**, ne po slajdu — cena po karuselu pada
sa ~$1,30 na ~$0,20, a serija ostaje vizuelno jedinstvena.

Dopuna, ne uslov. Sistem radi u celini bez ijednog AI poziva za slike.

### §18.8. Satori — šta radi, a šta ne

Demo je crtan pravim Chromiumom. Satori (`next/og`) ima svoj layout motor i nije
pun CSS. Provereno na zvaničnoj dokumentaciji:

**Radi:** flexbox, `border-radius`, `box-shadow`, `filter` (uključujući `blur`),
`mask-image` sa `linear-gradient` / `radial-gradient` / `url`, `background-image`
sa svim gradijentima, `position: absolute` i `relative`, `overflow: hidden`.

Znači mreža iz §18.3 i cyan aura prolaze bez izmene.

**Ne radi — i mora se zaobići:**

| Nije podržano | Kako se rešava |
|---|---|
| `z-index` | slaganje ide po redosledu u dokumentu — pozadinski slojevi se pišu PRVI, sadržaj POSLE |
| CSS grid | samo flexbox; sve kolone su `display:flex` |
| `calc()` | unapred izračunate vrednosti u px |
| kerning, ligature | bez OpenType finesa; ne oslanjati se na njih u naslovu |
| 3D transformacije | ne koristiti |

**Posledica za šablon:** `z-index: 1` na `.top`, `.mid` i `.bot` iz demoa se
briše. Umesto toga mreža i aura se ispisuju kao prva dva elementa unutar `.s`,
a sadržaj posle njih. Rezultat je isti, mehanizam drugi.

**Rezervna varijanta:** ako neki arhetip ipak zahteva nešto što Satori ne ume,
taj se render radi headless Chromiumom u `"use node"` akciji. Ne mešati dva
motora u istoj seriji slajdova — cela serija ide kroz jedan, da razmaci ostanu
identični.
