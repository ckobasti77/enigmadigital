# Novosti: plan i arhitektura

29.08.2026 · osnova: claude-seo v2.2.5 (seo-geo, seo-content, seo-technical) + humanizer v2.11.2

---

# DEO A: da li blog vredi, i gde je rizik

## A1. Vredi, i to više nego što izgleda

Sajt trenutno ima šest servisnih stranica i portfolio. To je ukupno oko deset stranica koje mogu
da se rangiraju, i one pokrivaju možda dvadesetak pojmova. Sve ostalo što ljudi kucaju, a ti bi
mogao da odgovoriš, nema gde da sleti.

Tri razloga koja stvarno drže, sa brojkama iz claude-seo skila:

**Sveži tekst se citira, star ne.** Sadržaj mlađi od tri meseca ima oko tri puta veću šansu da
bude citiran u AI odgovoru. Stranice starije od šest meseci gube pravo na citat (SE Ranking,
studija na 1,3 miliona citata). Sajt bez ijedne nove stranice godinu dana je za AI pretrage
mrtav sajt. Ovo je najjači argument i nema veze sa klasičnim SEO-om.

**Pominjanja brenda nose više od linkova.** Korelacija pominjanja sa AI citatima je oko tri puta
jača nego kod backlinkova (Ahrefs, decembar 2025, 75.000 brendova). Najjači izvor je YouTube
(oko 0,737), pa Reddit, pa Wikipedia. Klasična SEO logika o linkovima je ovde sekundarna.

**Jedan tekst hrani ceo mesec objava.** Ti si to već rekao i tačno je. Razlika je što ti već
imaš publishing za Instagram i Threads u komandnom centru, pa to nije ideja nego dovršavanje
onoga što postoji.

Dodatno: sajt bez About stranice, bez cena i bez imena ljudi trenutno nema čime da dokaže da zna
posao. Tekstovi su najjeftiniji način da se to popuni dok se ne snime video i fotografije.

## A2. Gde je stvarni rizik, bez uvijanja

Rekao si da hoćeš da pišeš skoro svakodnevno i da ćeš to generisati sa mnom ili u drugom chatu.
To može da radi, ali ima tačku pucanja koju treba imenovati odmah, jer je ista ona zbog koje si
tražio novi copy.

**Prošlog puta si mi rekao da ti tekstovi zvuče generički i da ti je izašla ista reklama neke
agencije.** Ako se blog puni tekstovima koji su sklopljeni od tuđih tekstova o istoj temi, isti
problem se vraća, samo trideset puta mesečno umesto jednom.

Google to gleda kao "scaled content abuse" kad je sadržaj masovno proizveden prvenstveno radi
rangiranja i ne donosi ništa novo. Bitno: **problem nije to što je pisano uz AI.** Google
eksplicitno kaže da ne kažnjava način proizvodnje nego nedostatak vrednosti. Granica je da li u
tekstu postoji nešto što se ne može naći na drugih deset sajtova.

Praktičan prag koji claude-seo koristi: tvrd stop ispod 30% jedinstvenog sadržaja.

Druga zamka je tiša. Ako se objavljuje svaki dan i sve je iste težine, prosečan kvalitet padne,
a upravo prosek određuje kako Google gleda ceo domen. Bolje je da postoje dve vrste teksta i da
se odmah zna koja je koja.

## A3. Model koji rešava oba problema: dve vrste objave

**Beleška**, 200 do 500 reči, može svakog dana.
Jedna stvar koju si video, uradio ili pročitao. Jedan snimak ekrana ili jedna slika. Jedna tvrdnja.
Ne pokušava da rangira. Postoji da bi sajt bio živ, da bi hranio mreže i da bi ti imao gde da
odložiš misao. Ovo je vrsta koja se lako pravi sa AI pomoći, jer je sirovina tvoja.

Primeri koji bi radili odmah, iz onoga što već imaš:
- snimak ekrana atribucije: komentar, poruka, poseta sajtu, upit, u jednom redu
- Threads API nema DM, evo šta to znači ako vodiš mreže preko njega
- Google profil firme ne može da se traži dok profil ne napuni 60 dana, i zašto to nikom ne kažu
- kontakt forma na tuđem sajtu koja pet meseci nije nikom stizala

**Tekst**, 1200 do 2500 reči, jedan do dva mesečno.
Ovo su stranice koje rangiraju i koje AI citira. Svaki mora da nosi bar jedno od: sopstveni
podatak, sopstveni snimak ekrana, sopstveni slučaj, ili jasan stav koji drugi ne zauzimaju.

Odnos koji preporučujem: **20 beleški i 2 teksta mesečno.** Tvojih "1 dnevno" je zadovoljeno,
a rangiranje ne zavisi od beleški.

## A4. Odakle teme: tvoj inbox je bolji izvor od Reddita

Ovo je najkorisnija stvar u celom dokumentu.

Rekao si da bi agenti skrejpovali Reddit i mreže za teme. Reddit u Srbiji je tanak i publika ti
nije tamo. Ali ti već imaš bazu punu pravih pitanja tvojih ljudi, na srpskom, sa datumom:

| Tabela u Convexu | Šta je unutra |
|---|---|
| `orInboundMessages`, `orConversations` | poruke koje ti ljudi šalju |
| `igComments`, `fbComments`, `threadsReplies` | komentari ispod objava |
| `igMentions`, `threadsMentions` | gde te pominju |
| `leadInbound`, `leadSignals` | upiti i šta su tražili |
| `ga4` tabele, `orTrackedLinks`, `orLinkClicks` | šta ljudi traže na sajtu i šta kliknu |

Svako pitanje koje ti je neko poslao dvaput je tema za tekst. To je legalno tvoje, na srpskom je,
i niko drugi to nema. Prvi posao agenta nije da skrejpuje Reddit nego da **grupiše pitanja iz tvog
inboxa po temama i izbaci listu.**

Drugi izvor koji je već tu: `gadsSearchTerms` i Search Console. To su doslovne reči koje ljudi
kucaju pre nego što stignu do tebe.

Reddit i mreže dolaze tek treći, i to za dve stvari: da vidiš kojim rečima ljudi opisuju problem,
i kao mesto gde te pominju (a pominjanja nose za AI citate). Za to ne treba skrejpovanje, dovoljni
su zvanični Reddit API i RSS izvodi podforuma. Isti razlog kao kod lead mašine: ne vredi rizikovati
nalog zbog podataka koje možeš da dobiješ legalno.

## A5. Humanizer kao obavezna kapija

Instalirao sam ga u oba repoa. Predlažem da bude tvrdo pravilo, ne preporuka:

> Nijedan tekst ne izlazi dok ne prođe kroz humanizer i dok neko ne doda jednu rečenicu koju je
> mogao da napiše samo neko iz Enigme.

Automatska provera koja se može vezati na objavljivanje, jer je merljiva:
- nula em crtica (—) u tekstu
- najviše jedan fragment kraći od pet reči na 500 reči
- bez "ne samo X nego Y"
- bez konstrukcija tipa "X je Y od Z" koje zvuče kao izreka
- bar jedan sopstveni podatak, snimak ekrana ili slučaj po tekstu

Poslednja stavka je jedina koju mašina ne može da proveri, i baš zbog nje treba da bude polje u
bazi koje se ručno čekira pre objave.

---

# DEO B: kako se to gradi

## B1. Podela posla

```
enigmadigital (Convex)                    enigmait.rs (Next.js)
-----------------------                   ---------------------
/novosti ekran za pisanje                 /novosti lista
posts tabela                    ---->     /novosti/[slug] tekst
storage za slike                (SSR)     /novosti/rss.xml
publish u IG i Threads                    sitemap.xml
                                          JSON-LD
```

Enigmait nema bazu i ne treba mu. Čita javne Convex upite sa servera i kešira.

## B2. Šta ide u Convex, `convex/schema.ts`

Multi-tenant od prvog dana, jer si rekao da ceo paket hoćeš da prodaješ. Ako `workspaceId` stoji
od početka, "vodimo vam i blog" je posle samo još jedan workspace, a ne prepravka.

```ts
posts: defineTable({
  workspaceId: v.id("workspaces"),
  slug: v.string(),                 // "kontakt-forma-ne-radi"
  locale: v.string(),               // "sr"
  kind: v.union(v.literal("note"), v.literal("article")),
  title: v.string(),
  dek: v.string(),                  // 1-2 recenice, ide u listu i u meta description
  body: v.string(),                 // markdown
  coverStorageId: v.optional(v.id("_storage")),
  coverAlt: v.optional(v.string()),
  authorName: v.string(),
  authorRole: v.optional(v.string()),
  tags: v.array(v.string()),
  status: v.union(
    v.literal("draft"), v.literal("scheduled"),
    v.literal("published"), v.literal("archived")
  ),
  publishedAt: v.optional(v.number()),
  updatedAt: v.number(),
  reviewedAt: v.optional(v.number()),   // za osvezavanje starijih tekstova
  seoTitle: v.optional(v.string()),
  seoDescription: v.optional(v.string()),
  canonicalUrl: v.optional(v.string()), // kad je tekst prvo izasao negde drugde
  ogImageStorageId: v.optional(v.id("_storage")),
  readingMinutes: v.optional(v.number()),
  ownProofChecked: v.boolean(),     // ima li tekst nesto sopstveno, cekira se rucno
  humanizerPassedAt: v.optional(v.number()),
  sourceRefs: v.optional(v.array(v.string())),
  relatedSlugs: v.optional(v.array(v.string())),
})
  .index("by_workspace_status_published", ["workspaceId", "status", "publishedAt"])
  .index("by_workspace_slug", ["workspaceId", "slug"])
  .index("by_workspace_tag", ["workspaceId", "tags"]),

postRevisions: defineTable({
  postId: v.id("posts"),
  body: v.string(),
  savedAt: v.number(),
  note: v.optional(v.string()),
}).index("by_post", ["postId"]),
```

**Bezbednosna napomena koja se lako propusti:** javni Convex upit može da pozove svako ko zna
adresu deploya. Zato filter na `status === "published"` mora da bude **unutar upita**, ne u
Next.js-u. Drafts se ne smeju vratiti ni pod kojim argumentima.

```ts
// convex/postsPublic.ts
export const listPublished = query({
  args: { workspaceSlug: v.string(), limit: v.optional(v.number()), cursor: v.optional(v.string()) },
  handler: async (ctx, args) => { /* status published && publishedAt <= Date.now() */ },
});
export const getPublishedBySlug = query({ /* isto, plus slug */ });
```

## B3. Kako enigmait čita, i zašto ovo mora na serveru

**AI crawleri ne izvršavaju JavaScript.** Ako se tekst povlači u pregledaču sa `useQuery`,
ChatGPT, Perplexity i Claude vide praznu stranicu. Isto važi i za deo Google indeksiranja.

Zato:

```ts
// app/(pages)/novosti/[slug]/page.tsx
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() { /* slugovi objavljenih */ }
export async function generateMetadata({ params }) { /* title, description, canonical, OG */ }

export default async function Page({ params }) {
  const post = await fetchQuery(api.postsPublic.getPublishedBySlug, {
    workspaceSlug: "enigma", slug: params.slug,
  });
  if (!post) notFound();
  // render + JSON-LD
}
```

Potrebno u enigmait: `convex` paket, `NEXT_PUBLIC_CONVEX_URL` koji pokazuje na enigmadigital
deploy, i `remotePatterns` za Convex storage domen u `next.config.ts`.

**Objava mora odmah da se vidi.** Convex `httpAction` posle objavljivanja zove
`https://enigmait.rs/api/revalidate?secret=...&path=/novosti/<slug>`, koji radi `revalidatePath`.
Bez toga čekaš do sat vremena, a to je nepodnošljivo kad ispravljaš grešku u naslovu.

## B4. SEO obaveze, iz claude-seo

Ovo su konkretni zahtevi, ne opšti saveti:

**Struktura teksta**
- Odgovor na pitanje iz naslova u **prvih 40 do 60 reči**. Oko 44% AI citata dolazi iz prve
  trećine stranice.
- Pasusi koji stoje sami: **134 do 167 reči** je opseg koji se najčešće citira.
- Podnaslovi kao pitanja, jer se poklapaju sa onim što ljudi kucaju.
- Pasusi od dve do četiri rečenice. Tabele za poređenja, liste za korake.
- Slika, snimak ili video u svakom tekstu. Sadržaj sa više formata ima oko 156% veću stopu izbora.

**Tehnički**
- Server rendering, obavezno.
- `sitemap.ts` proširen postovima, sa `lastModified` iz `updatedAt`.
- RSS na `/novosti/rss.xml`.
- JSON-LD `BlogPosting` sa `datePublished`, `dateModified`, `author`, plus `BreadcrumbList`.
- `robots.txt`: propusti GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot. CCBot po želji blokiraj.
- OG slika po tekstu, generisana kroz `next/og`.
- Kanonik uvek na enigmait.rs, i kad isti tekst ide na LinkedIn ili Medium.

**Ne troši vreme na `llms.txt`.** Google je 15.05.2026 objavio, i 15.06. potvrdio, da taj fajl ne
pomaže ni ne odmaže u njihovoj pretrazi. claude-seo ga beleži ali mu ne daje težinu.

**Osvežavanje je posao, ne izuzetak.** Pošto tekst stariji od šest meseci gubi pravo na AI citat,
u komandni centar ide ekran "za osvežavanje": sve što ima `reviewedAt` stariji od 150 dana. Jedan
sat mesečno na tome vredi više od tri nova teksta.

## B5. Veza sa mrežama

Kad se tekst objavi, iz istog ekrana se pravi:
- Threads: 3 do 5 postova, svaki jedna tvrdnja iz teksta, do 500 bajtova, poslednji sa linkom
- Instagram: karusel od 5 do 7 slajdova, jedan korak po slajdu, link u biju
- link uvek kroz `/r/<slug>` da bi se klik vezao za sesiju i upit, kako već radi

To ide kroz `igPublishJobs` i `threadsPublishJobs` koji već postoje. Novo je samo dugme
"napravi objave od ovog teksta".

## B6. Redosled izgradnje

**Sprint 1, oko dva dana.** `posts` i `postRevisions` u Convexu, javni upiti, `/novosti` ekran za
pisanje u komandnom centru (lista, uređivanje, status, slika).

**Sprint 2, oko dva dana.** `/novosti` i `/novosti/[slug]` na enigmait, server rendering,
`generateMetadata`, JSON-LD, sitemap, RSS, revalidate ruta.

**Sprint 3, jedan dan.** OG slike, oznake, srodni tekstovi, ekran za osvežavanje starih tekstova.

**Sprint 4, jedan dan.** Dugme "napravi objave" prema postojećem publishing pipeline-u.

Prvi tekst može da izađe na kraju drugog sprinta.

---

# DEO C: subdomen ili podfolder

Pitao si da li je bolje `digital.enigmait.rs` ili unutar `enigmait.rs`.

## Kratak odgovor: ostavi subdomen, ali dodaj prodajnu stranicu na glavni domen.

Uobičajeni SEO argument (podfolder skuplja autoritet, subdomen se gleda odvojeno) ovde skoro da ne
važi, jer je komandni centar aplikacija iza prijave i treba da bude `noindex`. Nema šta da rangira.

Ono što stvarno odlučuje:

| Kriterijum | Subdomen `digital.enigmait.rs` | Podfolder `enigmait.rs/digital` |
|---|---|---|
| Kolačići i sesija | odvojeni, sesija aplikacije ne putuje uz svaki marketinški zahtev | isti domen, veći rizik curenja i konflikta |
| Deploy | dva projekta, dva ciklusa, pad jednog ne ruši drugi | spojeno preko rewrite-a, jedan build lomi oba |
| Bezbednost | odvojen origin, odvojen CSP, XSS na sajtu ne dohvata tokene aplikacije | isti origin, manja izolacija |
| Analitika | čisto razdvojeno, marketinški pikseli ne prate rad u aplikaciji | mešaju se, izveštaji postaju netačni |
| Brzina rada | svaki se optimizuje za svoje | marketinški sajt vuče 3D, aplikacija ne treba da ga nosi |

Sve četiri gornje stavke idu u korist subdomena, a peta je odlučujuća.

## Ono što je važnije od subdomena

Rekao si da ceo paket hoćeš da prodaješ drugim firmama za ozbiljne pare. Ako je tako, postoji
problem koji subdomen ne rešava:

**Klijent bi se logovao u sajt svoje agencije da bi video svoje podatke.**

To radi dok je komandni centar deo tvoje usluge. Prestaje da radi u trenutku kad postane proizvod,
iz tri razloga: klijent ne želi da mu podaci stoje pod tuđim brendom, proizvod ne može da se
proda drugoj agenciji koja ti je konkurencija, i ime "Enigma" u adresi obara cenu jer izgleda kao
interni alat, a ne kao softver.

Zato bih razdvojio već sada, dok je jeftino:

1. **`digital.enigmait.rs`** ostaje kako jeste, za tebe i za tvoje klijente. Ne diraj.
2. **`enigmait.rs/komandni-centar`** je nova, javna, indeksirana stranica koja **prodaje** taj
   alat. Ona dobija autoritet glavnog domena, rangira, i vodi na demo. Ovo je jedina stvar koju
   treba da uradiš odmah.
3. **Poseban domen i ime**, onog dana kad prvi klijent koji nije tvoj plati za pristup. Do tada ne
   troši ni sat vremena na to.

Tačka 2 je i najbrža i najkorisnija: alat koji si već napravio trenutno se ne pominje nigde na
sajtu, a to je jedina stvar u ponudi koju konkurencija u regionu nema.
