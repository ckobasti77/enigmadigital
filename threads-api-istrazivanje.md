# Threads integracija — istraživanje i plan

Stanje dokumentacije na dan **24. avgust 2026.**
Za projekat: `enigmadigital` (Enigma Marketing Command Center).

> **Kako čitati ovaj dokument.** Sve što piše bez oznake potvrđeno je u zvaničnoj Meta
> dokumentaciji i ima izvor. Sve što nije potvrđeno nosi oznaku **[NEPOTVRĐENO]** ili stoji
> u odeljku 11 (Kontradikcije). Ništa nije popunjeno iz opšteg znanja — gde dokumentacija
> ćuti, ovde piše da ćuti.

---

## 0. Kratak odgovor: šta je moguće, a šta nije

**Moguće je, i to u punom obimu:**

- Objavljivanje svega što Threads podržava: tekst, slika, video, carousel (do 20), anketa,
  GIF, quote, repost, odgovor, geo-gating, lokacija, topic tag, spoiler, ghost post,
  dugački tekstualni prilog do 10.000 karaktera, cross-share na Instagram Story.
- Čitanje sopstvenog sadržaja, odgovora i celih niti.
- Metrike po objavi i po nalogu, uključujući demografiju pratilaca.
- Moderacija: sakrivanje odgovora, kontrola ko sme da odgovara, odobravanje odgovora
  (reply approvals), brisanje.
- Webhooks za odgovore u realnom vremenu.
- Threads kao **placement za Meta oglase**, sa merenjem kroz Pixel i CAPI.

**Nije moguće, i to treba znati odmah:**

| Šta | Zašto |
|---|---|
| **Direktne poruke (DM) na Threads-u** | Threads nema DM. Nema endpoint, nema feature. OpenReply za Threads može samo javne odgovore. Detaljno u odeljku 9. |
| **Boost postojeće Threads objave kao oglasa** | Doslovno iz dokumentacije: *"Ads cannot be created from an existing Threads post."* Ne postoji `source_threads_media_id`. |
| **Threads placement bez Instagram placement-a** | *"You cannot select `threads_stream` for `threads_positions` by itself."* Threads se ne kupuje samostalno. |
| **`impressions`, `reach`, `saves`, video metrike** | Ne postoje. Postoji samo `views`, i to je druga definicija. Detaljno u 5.3. |
| **Istorija pratilaca** | `followers_count` je samo trenutno stanje; ignoriše `since`/`until`. Nema dnevnog prirasta. |
| **Zakazivanje objava kroz API** | Nema nativnog parametra. Mora se rešiti u našem sistemu (cron + rate-limit guard). |
| **Veza organskog Threads-a sa Ads nalogom** | Threads Insights API nema nijedno polje vezano za oglase. Atribucija postoji samo za plaćeni placement. |

---

## 1. Postavljanje aplikacije

### 1.1 Use case, ne nova aplikacija — ali oprezno

Threads se dodaje kao **use case „Access the Threads API"** na Meta aplikaciju.
Dokumentacija: *"You can add multiple use cases to a single app, provided they are compatible
with each other. For example, you can add the Access Threads API use case to an app with the
Manage everything on your Page use case, but you can't add the Authenticate and request data
from users with Facebook Login use case since it is incompatible."*

**Ovo je rizik za nas.** Naša postojeća Meta aplikacija ima Facebook Login use case. Rečenica
je gramatički dvosmislena — ne vidi se pouzdano da li je nekompatibilnost između *Threads i
Facebook Login-a* ili između *Facebook Login-a i Page use case-a*. **[NEPOTVRĐENO]**

Uz to: **„Use cases cannot be removed after you create your app."** Pogrešan izbor se ne
poništava.

**Jedini pouzdan test:** App Dashboard → Use cases → Add use case. Prikazuju se samo
kompatibilni. Ako „Access Threads API" nije ponuđen — mora zasebna aplikacija.

### 1.2 Dva App ID-a

Threads use case generiše **sopstveni Threads App ID i Threads App Secret**, odvojene od
Meta App ID-a. *"For Threads API implementation purposes, use the Threads app ID and its
corresponding app secret."* Nalaze se u *App settings > Basic > Threads App ID*.

Threads App ID se koristi kao `client_id` u OAuth-u i za webhooks. Meta App ID ostaje za
Instagram, Facebook Login i Marketing API. Zašto ih ima dva — dokumentacija ne objašnjava.

### 1.3 Threads profesionalni nalog nije potreban

Za razliku od Instagram Graph API-ja, Threads API **ne traži „professional account"**.
Od 23. 9. 2025: *"The Threads API is now available to Threads profiles without a linked
Instagram account."* Od 30. 1. 2026 i `followers_count` i `follower_demographics` rade i
za takve profile.

---

## 2. App Review — dobra vest

**Za rad isključivo sa sopstvenim nalogom App Review NIJE potreban.**

Doslovno: *"In order for app users without a role on your app to be able to grant your app
these permissions, each permission must first be approved through the App Review process."*
Uslov je dakle samo za korisnike **bez uloge** na aplikaciji.

Dodaješ svoj Threads nalog kao **Threads Tester** (App Dashboard → App roles → Roles →
Add People → Threads Tester), prihvatiš poziv na `threads.net/settings/account` →
Standard Access je dovoljan. Business Verification takođe nije potrebna.

### 2.1 Tri permisije koje su osakaćene i sa sopstvenim nalogom

| Permisija | Šta radi bez App Review-a |
|---|---|
| `threads_keyword_search` | Pretražuje **samo tvoje sopstvene objave** |
| `threads_manage_mentions` | Vraća **samo mention-e od Threads testera tvoje aplikacije** |
| `threads_profile_discovery` | Može da pretraži **samo @meta, @threads, @instagram, @facebook** |

Ako ti keyword search nad celim Threads-om treba kao proizvod (a to je jedina stvar iz ove
liste koja stvarno vredi za marketing), to znači App Review + Business Verification.
**Predlog: prva faza bez toga, App Review kao zasebna odluka kasnije.**

Webhooks: bez App Review-a rade, ali *"Your app must have successfully completed App Review
(Advanced Access) to receive webhooks notifications for all of the fields."*

---

## 3. OAuth i tokeni

### 3.1 Domeni — pažnja, promenili su se

Aktuelna dokumentacija koristi **`threads.com`**, stariji tutorijali `threads.net`. Oba rade,
ali `.com` je ono što Meta sada dokumentuje.

- Authorization: `https://threads.com/oauth/authorize`
- API: `https://graph.threads.com/v1.0/...` (radi i `graph.threads.net`)
- **Verzija je uvek `v1.0`.** Threads API nema verzionisanje kao Graph API.

### 3.2 Tok

```
1) GET  https://threads.com/oauth/authorize
        ?client_id=<THREADS_APP_ID>
        &redirect_uri=<REDIRECT_URI>
        &scope=<lista>
        &response_type=code
        &state=<CSRF>

   → redirect sa ?code=...   ⚠ na kraj se dodaje "#_" — mora se odseći
   → kod važi 1 sat, jednokratan

2) POST https://graph.threads.com/oauth/access_token
        client_id, client_secret, code, grant_type=authorization_code, redirect_uri
   → short-lived token (1 sat) + user_id + token_type

3) GET  https://graph.threads.com/access_token
        ?grant_type=th_exchange_token&client_secret=...&access_token=<short>
   → long-lived token, expires_in ≈ 5183944 (60 dana)

4) GET  https://graph.threads.com/refresh_access_token
        ?grant_type=th_refresh_token&access_token=<long>
   → novih 60 dana
```

### 3.3 Pravila trajanja koja moraju u kod

- Long-lived token se može osvežiti **tek kad je stariji od 24 sata**, i **samo dok nije
  istekao**. Token koji nije osvežen 60 dana je mrtav i ne može se oživeti.
- Istekao short-lived token **ne može** da se zameni za long-lived.
- **Grant permisija traje 90 dana** za javne profile i produžava se refresh-om.
  Za **privatne profile grant se ne produžava** — korisnik mora ponovo kroz Authorization
  Window. (Vidi kontradikciju u odeljku 11.)

Praktično za nas: cron koji osvežava token, po uzoru na postojeći `refreshAllTokens` za
Instagram, ali sa dva odvojena praga — token (60 dana) i grant (90 dana) — i sa jasnim
statusom veze u UI kad grant istekne, jer se to **ne rešava automatski**.

### 3.4 Svih 11 scope-ova

| Scope | Čemu služi |
|---|---|
| `threads_basic` | **Obavezan za sve.** Ne može se ukloniti. |
| `threads_content_publish` | Objavljivanje |
| `threads_read_replies` | GET nad odgovorima |
| `threads_manage_replies` | POST nad odgovorima (sakrivanje, odobravanje) |
| `threads_manage_insights` | Metrike |
| `threads_delete` | Brisanje |
| `threads_location_tagging` | Location search + tagovanje lokacije |
| `threads_keyword_search` | Pretraga po ključnoj reči |
| `threads_manage_mentions` | Mentions |
| `threads_profile_discovery` | Javni profili drugih naloga |
| `threads_share_to_instagram` | Cross-share na IG Story |

⚠ OAuth stranica u dokumentaciji navodi samo prvih pet. Ta lista je nepotpuna — merodavna
je use-case tabela.

---

## 4. Objavljivanje

### 4.1 Tok

Dvokoračno: `POST /{user-id}/threads` (container) → čekaj → `POST /{user-id}/threads_publish`
sa `creation_id`.

- **Preporučeno čekanje: 30 sekundi.**
- Status: `GET /{container-id}?fields=status,error_message` — statusi `EXPIRED`, `ERROR`,
  `FINISHED`, `IN_PROGRESS`, `PUBLISHED`. Container **ističe posle 24 sata**.
- *"We recommend querying a container's status once per minute, for no more than 5 minutes."*
- Carousel je trokoračno: svaki child sa `is_carousel_item=true` → container sa
  `media_type=CAROUSEL` i `children=<ID1>,<ID2>` → publish.
- **`auto_publish_text=true`** preskače drugi korak — **ali samo za tekstualne objave**.

Medij mora biti na **javno dostupnom serveru** u trenutku objave — Meta ga skida sa URL-a.
Za nas to znači Convex file storage sa javnim URL-om, isto kao za Instagram publishing.

### 4.2 Kompletna lista parametara `POST /{user-id}/threads`

| Parametar | Tip | Vrednosti / ograničenja |
|---|---|---|
| `media_type` | string | **`TEXT`, `IMAGE`, `VIDEO`, `CAROUSEL`** — obavezan |
| `text` | string | max **500 karaktera**; emoji se broje kao UTF-8 bajtovi |
| `image_url` | string | obavezan uz `IMAGE` |
| `video_url` | string | obavezan uz `VIDEO` |
| `is_carousel_item` | bool | za children |
| `children` | array | obavezan uz `CAROUSEL`, **min 2, max 20** |
| `reply_to_id` | string | za odgovor |
| `reply_control` | string | `everyone`, `accounts_you_follow`, `mentioned_only`, `parent_post_author_only`, `followers_only` |
| `allowlisted_country_codes` | list | ISO 3166-1 alpha-2, geo-gating |
| `alt_text` | string | max **1.000** karaktera; samo za medij, ne za tekst |
| `link_attachment` | string | **samo text-only objave**; max **5 linkova** ukupno |
| `quote_post_id` | string | citiranje |
| `poll_attachment` | object | **samo text-only**; 2–4 opcije, svaka 1–25 karaktera |
| `auto_publish_text` | bool | samo tekst |
| `topic_tag` | string | 1–50 karaktera; zabranjeni `.` i `&`; **jedan po objavi** |
| `is_spoiler_media` | bool | samo IMAGE/VIDEO/CAROUSEL |
| `text_entities` | object | tekstualni spoiler-i, **max 10 po objavi** |
| `text_attachment` | object | dugački tekst do **10.000** karaktera + stilovi |
| `gif_attachment` | object | `{gif_id, provider}` — **samo GIPHY**, samo text-only |
| `is_ghost_post` | bool | tekst koji se sam arhivira posle 24h |
| `enable_reply_approvals` | bool | odobravanje odgovora |
| `crossreshare_to_ig` | bool | cross-share na IG Story |
| `crossreshare_to_ig_dark_mode` | bool | tamna varijanta |
| `location_id` | string | iz `GET /location_search` |

### 4.3 Ograničenja medija

**Slika:** JPEG/PNG, max 8 MB, aspect ratio do 10:1, širina 320–1440, sRGB.

**Video:** MOV/MP4, H264 ili HEVC, AAC do 48 kHz, 23–60 FPS, max širina 1920,
aspect ratio 0.01:1 do 10:1 (preporuka 9:16), VBR do 100 Mbps, **max 5 minuta**, **max 1 GB**.

### 4.4 Odgovori, quote, repost, brisanje

- Odgovor: isti `POST /threads` sa `reply_to_id`, pa publish.
- Repost: **poseban endpoint** `POST /{media-id}/repost`, samo `access_token`.
  Rezultat ima `media_type = REPOST_FACADE`.
- Brisanje: `DELETE /{media-id}` → `{"success": true, "deleted_id": "..."}`.

---

## 5. Čitanje i metrike

### 5.1 Objave

`GET /me/threads` (lista) i `GET /{media-id}` (jedna). Parametri: `fields`, `since`, `until`,
`limit`, kursorska paginacija (`before`/`after`).

Polja: `id`, `media_product_type`, `media_type`, `media_url`, `permalink`, `owner`,
`username`, `text`, `timestamp`, `shortcode`, `thumbnail_url`, `children`, `is_quote_post`,
`alt_text`, i dalje — **uz nekoliko spornih imena, vidi odeljak 11**.

### 5.2 Odgovori i niti

- `GET /{media-id}/replies` — **samo prvi nivo** odgovora.
- `GET /{media-id}/conversation` — **spljoštena cela nit**, svi nivoi.
- `GET /me/replies` — svi odgovori koje smo mi napisali.

Polja specifična za odgovore: `has_replies`, `root_post`, `replied_to`, `is_reply`,
`is_reply_owned_by_me`, `hide_status` (`NOT_HUSHED`, `UNHUSHED`, `HIDDEN`, `COVERED`,
`BLOCKED`, `RESTRICTED`), `reply_audience`.

Sortiranje: `reverse` (default `true` = obrnuto hronološki).

### 5.3 Metrike po objavi

`GET /{media-id}/insights` — `views`, `likes`, `replies`, `reposts`, `quotes`, `shares`.

- Sve su **lifetime/kumulativne**. Nema vremenske serije, nema `since`/`until`.
- Ugnežđeni odgovori se **ne broje** — samo prvi nivo.
- `REPOST_FACADE` objave vraćaju **prazan niz**.
- **Nema nijednog breakdown-a.**

### 5.4 Metrike po nalogu

`GET /me/threads_insights`:

| Metrika | Oblik |
|---|---|
| `views` | **vremenska serija po danima** — jedina koja to jeste |
| `likes`, `replies`, `reposts`, `quotes` | ukupna vrednost |
| `clicks` | **razbijeno po URL-u** — ovo je zlato za funnele, vidi odeljak 10 |
| `followers_count` | trenutno stanje, ignoriše `since`/`until` |
| `follower_demographics` | uz `breakdown` = `country` \| `city` \| `age` \| `gender`, **jedan po zahtevu** |

Ograničenja: `follower_demographics` traži **min 100 pratilaca**. Najraniji timestamp je
**1712991600** (13. 4. 2024); vrednosti pre **1. 6. 2024** nisu garantovano tačne. Bez
`since`/`until` podrazumevano je juče→danas.

### 5.5 Metrike koje ne postoje

`impressions`, `reach`, unique korisnici, `saves`, `engagement_rate`, `video_views`,
`avg_watch_time`, dnevni prirast pratilaca, bilo kakav breakdown po objavi.

**Za naš sistem to znači:** `engagement` se izvodi iz `likes + replies + reposts + quotes + shares`,
i po pravilu ovog projekta **ne skladišti se izvedena vrednost** — čuvamo sabirke, računamo
pri čitanju. Za „reach" se ne sme podmetnuti `views` — to je druga stvar i mora se tako i zvati u UI.

---

## 6. Mentions, keyword search, profili

- **Mentions:** `GET /{user-id}/mentions`. `since` ≥ `1688540400`. Privatni nalozi se nikad
  ne vraćaju. Bez App Review-a — samo od testera.
- **Keyword search:** `GET /keyword_search` — `q` (obavezno), `search_type` (`TOP`/`RECENT`),
  `search_mode` (`KEYWORD`/`TAG`), `media_type`, `author_username`, `since`, `until`,
  `limit` (default 25, max 100). **2.200 upita / 24h po korisniku, zbirno preko svih aplikacija.**
  Prazni rezultati se ne broje. Polje `owner` se **ne vraća**.
- **Profile discovery:** `GET /profile_lookup?username=...` → `follower_count`, `likes_count`,
  `quotes_count`, `reposts_count`, `views_count`, `is_verified`. Samo javni profili, 18+,
  **min 100 pratilaca**, **1.000 zahteva / 24h**.

---

## 7. Webhooks

Podržani. Dokumentovano polje: **`replies`** (topic: *Moderate*). Payload nosi `field`, `id`,
`username`, `text`, `media_type`, `permalink`, `replied_to`, `root_post`, `shortcode`,
`timestamp`.

Pretplata: Use Cases → Customize → Settings → „Get real-time notifications with Threads
Webhooks" → Moderate Topic → callback URL + verify token.

Blog od 14. 4. 2026 pominje i webhooks za **publish i delete** događaje — **[NEPOTVRĐENO]**
na doc stranici.

**Za nas:** isti obrazac kao `/facebook/webhook` i `/instagram/webhook` u `convex/http.ts`,
sa istom proverom potpisa i `webhookSignatureFailures` evidencijom.

---

## 8. Rate limits — brojke koje idu u guard

Opšti limit: `4800 × broj impresija` poziva u 24h (minimum se računa kao 10 impresija).

Kvote po profilu, pokretni prozor 24h — **čitaju se jednim pozivom**:

```
GET /{user-id}/threads_publishing_limit
    ?fields=quota_usage,config,reply_quota_usage,reply_config,
            delete_quota_usage,delete_config,
            location_search_quota_usage,location_search_config
```

| Radnja | Limit |
|---|---|
| Objave | **250** (carousel se broji kao jedna) |
| Odgovori | **1.000** |
| Brisanja | **100** |
| Location search | **500** |
| Keyword search | **2.200** (odvojeno, ne kroz ovaj endpoint) |
| Profile lookup | **1.000** (odvojeno) |

Dokumentacija izričito traži: *"Enforce the publishing rate limit in your app, especially if
it allows app users to schedule posts for future publishing."* — dakle guard je obavezan,
po uzoru na postojeći `metaSyncStore.gate` i `googleAdsQuota`.

---

## 9. OpenReply za Threads

**Ključno ograničenje: Threads nema direktne poruke.** Nema DM endpoint, nema DM feature u
proizvodu. Postojeći OpenReply obrazac — *komentar okida DM* — na Threads-u **ne postoji** i
ne može se napraviti.

Šta se **može** napraviti, i to dobro:

| Okidač | Izvor | Akcija |
|---|---|---|
| Odgovor na našu objavu | webhook `replies` (realno vreme) | javni odgovor sa linkom, sakrivanje, ignorisanje |
| Mention našeg naloga | `GET /mentions` (polling) | javni odgovor |
| Ključna reč u javnom sadržaju | `GET /keyword_search` | javni odgovor — **traži App Review** |
| Odgovor koji čeka odobrenje | `GET /{media-id}/pending_replies` | odobri / ignoriši |

Bitna prednost koju Threads daje, a Instagram ne: **dozvola za odgovaranje na tuđe objave.**
*"You are the owner of the root thread post"* **ili** *"You have either the
`threads_keyword_search` or the `threads_manage_mentions` permission."* Znači da uz odobren
keyword search OpenReply na Threads-u može da odgovara i na tuđe objave po ključnoj reči —
što je funkcionalnost koju na IG-u nemamo.

**Umesto DM-a, konverzija ide preko javnog odgovora sa praćenim linkom** — i tu se ovo
prirodno spaja sa odeljkom 10.

⚠ Ovde ide i moje upozorenje: automatsko javno odgovaranje na tuđe objave po ključnoj reči
je jedan pogrešno podešen filter daleko od spama, a kazna je nalog. Preporuka: isti mehanizam
kao za postojeće automatizacije — dnevni limit, cooldown po nalogu, `orProcessedComments`
ekvivalent da se isti autor ne gađa dvaput, i **obavezan režim „draft" pre nego što se pusti
automatski**.

---

## 10. Funnels i atribucija

### 10.1 Plaćeni Threads oglasi

Threads **jeste** placement u Meta oglasima, globalno od 21. 1. 2026, uključen po defaultu u
Advantage+ i Manual Placements.

```json
{
  "publisher_platforms": ["instagram", "threads"],
  "instagram_positions": ["stream"],
  "threads_positions": ["threads_stream"]
}
```

- Jedina vrednost za `threads_positions` je **`threads_stream`**.
- **Instagram stream je obavezan** — Threads se ne kupuje sam.
- Postoji i read-only `effective_threads_positions`.
- Formati: image, video, carousel, Advantage+ catalog, app ads. **Ne** iz postojećeg posta.
- Ciljevi: Reach, Traffic, Website Conversions, App Installs.
- Identitet oglasa: `threads_user_id` u `object_story_spec` — to je **ko se prikazuje kao autor**,
  ne referenca na objavu.

**Pixel i CAPI rade normalno** za plaćeni Threads placement. Nema ničega Threads-specifičnog.
Naš postojeći CAPI sa dedup-om preko `event_id` pokriva i ovo bez ijedne izmene.

**Dugmići na oglasima:** da — `call_to_action` u `link_data`, standardni Meta CTA tipovi.
To je obično kreiranje oglasa, isto kao za IG.

### 10.2 Odakle je posetilac došao — ovde je prava vrednost

Dve odvojene rupe koje treba zatvoriti:

**(a) Plaćeni Threads klik.** Meta **ne postavlja `utm_source`** za Threads placement.
Navodno se dodaje parametar `th=threads_stream` — **[NEPOTVRĐENO, neslužben izvor star 7 meseci]**.
Bez UTM-a GA4 ovaj saobraćaj svrstava u **Direct**.

→ Rešenje: ručni UTM na svakom oglasu. Ali bolje od toga — pošto već imamo `orLinks` i
`/r/` rutu sa `appendUtm` i `appendEventId`, **svaki Threads oglas vodi na naš `/r/` link**.
Time dobijamo klik zabeležen na serveru pre redirekta, UTM koji mi kontrolišemo, i CAPI
događaj sa `event_id` koji se dedupira sa Pixel-om u pregledaču. Nezavisno od toga šta Meta
šalje u URL-u.

**(b) Organski Threads klik.** Threads user insights ima metriku **`clicks` razbijenu po URL-u**.
To je jedina prava atribucija koju Threads organski daje. Ako sve organske linkove objavljujemo
kao `/r/` linkove, dobijamo **dva nezavisna brojača za isti link** — Threads-ov `clicks` i naš
`orLinkClicks`. Razlika između njih je merljiva i korisna: Threads broji klik u aplikaciji,
mi brojimo stvaran dolazak na sajt.

Po pravilu ovog projekta: **ne skladištimo odnos ta dva broja**, čuvamo oba i računamo pri čitanju.

### 10.3 Šta ne postoji

Organski Threads i Ads nalog **nisu povezani**. Threads Insights API nema nijedno polje o
oglasima. Ne postoji Threads panel u Ads Manager-u — samo Threads kao vrednost u Placement
breakdown-u za plaćene kampanje. Povezivanje Threads naloga sa Business Portfolio-om služi
isključivo da bi nalog mogao biti **identitet oglasa**, ne za atribuciju.

Moderacija odgovora **na Threads oglase** je zaseban sistem (`ads_read` / `ads_management`),
nema veze sa Threads API reply management-om. Tačan endpoint **[NEPOTVRĐENO]**.

---

## 11. Kontradikcije u dokumentaciji — mora se proveriti empirijski pre koda

Dva nezavisna istraživanja su se razišla na sledećim tačkama. Ovo nisu sitnice — to su imena
polja od kojih zavisi da li upit prolazi ili pada, isto kao što nam je danas palo 4 od 22
Google Ads upita zbog pogrešnih imena.

| Stavka | Verzija A | Verzija B | Kako proveriti |
|---|---|---|---|
| Polje za link u pročitanoj objavi | `link_attachment_url` | `url_attached` | Jedan `GET /me/threads?fields=...` sa oba |
| `poll_attachment` kao **čitljivo** polje | postoji, sa procentima i `total_votes` | nije potvrđeno | Objaviti anketu pa je pročitati |
| Citirana objava | objekat `quoted_post{id}` | samo `quoted_post_id` | Isti test |
| Repostovana objava | `reposted_post{id}` | `reposted_media_id` | Isti test |
| `media_type` vrednosti pri čitanju | `TEXT`, `CAROUSEL`, `REPOST_FACADE` | `TEXT_POST`, `CAROUSEL_ALBUM`, `REPOST`, `QUOTE`, `AUDIO` | Pročitati po jednu objavu svakog tipa |
| Reply approvals endpointi | `pending_replies`, `manage_pending_reply` dokumentovani | nije potvrđeno | Direktan poziv |
| Grant za privatan profil | može se osvežiti | ne može | Zavisi od toga da li je profil javan |

**Postupak koji predlažem:** pre nego što se napiše ijedna linija sync koda, napravi se jedan
mali „probe" skript koji objavi po jednu objavu svakog tipa na test nalogu i pročita ih sa
**svim spornim imenima polja odjednom**. Google Ads nas je danas naučio da je jedan takav
prolaz jeftiniji od tri kruga deploy-a.

---

## 12. Predlog faza

Isti obrazac kao GA0–GA9.

| Faza | Sadržaj | Zavisi od |
|---|---|---|
| **TH0** | Meta app: Threads use case, Threads Tester, redirect URI, env varijable. **Tvoj deo.** | — |
| **TH1** | Probe skript iz odeljka 11 — utvrditi tačna imena polja | TH0 |
| **TH2** | Transport sloj: `lib/threadsShared.ts` (V8-safe) + `lib/threadsApi.ts`, OAuth, token refresh sa dva praga | TH1 |
| **TH3** | Schema: `threadsPosts`, `threadsPostInsights`, `threadsAccountDaily`, `threadsDemographics`, `threadsReplies`, `threadsMentions`, `threadsQuota` | TH1 |
| **TH4** | Sync: objave + metrike po objavi + nalog + demografija, sa `executeResource` obrascem i ishodima po resursu | TH2, TH3 |
| **TH5** | Publishing: svi tipovi, container status polling, rate-limit guard, zakazivanje | TH2 |
| **TH6** | Odgovori, niti, moderacija, reply approvals | TH2 |
| **TH7** | Webhook `/threads/webhook` + provera potpisa | TH2 |
| **TH8** | OpenReply za Threads — javni odgovori, filteri, cooldown, draft režim | TH6, TH7 |
| **TH9** | Funnels: `/r/` linkovi u Threads objavama, spajanje Threads `clicks` sa `orLinkClicks` | TH4 |
| **TH10** | Threads placement u Meta oglasima + placement breakdown u izveštajima | postojeći Meta Ads sloj |
| **TH11** | Keyword search + mentions + profile discovery — **tek posle App Review-a** | App Review |

---

## 13. Šta mi treba od tebe pre nego što napišem plan po koracima

1. **Da li je tvoj Threads profil javan ili privatan?** Od toga zavisi da li ćeš morati ručnu
   reautorizaciju svakih 90 dana.
2. **Threads use case na postojećoj Meta aplikaciji ili nova aplikacija?** Odluka je
   nepovratna. Proveri u App Dashboard-u da li je „Access Threads API" uopšte ponuđen.
3. **Da li idemo na App Review?** Bez njega nema keyword search-a nad tuđim sadržajem, a to je
   jedina stvar iz te grupe koja stvarno vredi za marketing.
4. **Threads oglasi — sada ili kasnije?** Traže i Instagram placement i Threads nalog u
   Business Portfolio-u.

---

## Izvori

- [Threads API Overview](https://developers.facebook.com/documentation/threads/overview)
- [Get Started](https://developers.facebook.com/documentation/threads/get-started)
- [Access Tokens and Permissions](https://developers.facebook.com/documentation/threads/get-started/get-access-tokens-and-permissions)
- [Long-Lived Tokens](https://developers.facebook.com/documentation/threads/get-started/long-lived-tokens)
- [Posts](https://developers.facebook.com/documentation/threads/posts)
- [Publishing Reference](https://developers.facebook.com/documentation/threads/reference/publishing)
- [Insights](https://developers.facebook.com/docs/threads/insights)
- [Retrieve Media](https://developers.facebook.com/docs/threads/threads-media)
- [Reply Management](https://developers.facebook.com/documentation/threads/reply-management)
- [Delete Posts](https://developers.facebook.com/documentation/threads/posts/delete-posts)
- [Reposts](https://developers.facebook.com/documentation/threads/posts/reposts)
- [Quote Posts](https://developers.facebook.com/documentation/threads/posts/quote-posts)
- [Polls](https://developers.facebook.com/documentation/threads/create-posts/polls)
- [Location Tagging](https://developers.facebook.com/documentation/threads/create-posts/location-tagging)
- [Geo-gating](https://developers.facebook.com/documentation/threads/posts/geo-gating)
- [Text Attachments](https://developers.facebook.com/documentation/threads/create-posts/text-attachments)
- [Spoilers](https://developers.facebook.com/documentation/threads/create-posts/spoilers)
- [Ghost Posts](https://developers.facebook.com/documentation/threads/create-posts/ghost-posts)
- [Share to IG Stories](https://developers.facebook.com/documentation/threads/create-posts/share-to-ig-stories)
- [Mentions](https://developers.facebook.com/docs/threads/threads-mentions)
- [Keyword Search](https://developers.facebook.com/docs/threads/keyword-search)
- [Profile Discovery](https://developers.facebook.com/documentation/threads/threads-profiles)
- [Webhooks](https://developers.facebook.com/documentation/threads/webhooks)
- [Changelog](https://developers.facebook.com/documentation/threads/changelog)
- [Threads Ads — Marketing API](https://developers.facebook.com/docs/marketing-api/ad-creative/threads-ads/)
- [Placement Targeting](https://developers.facebook.com/docs/marketing-api/audiences/reference/placement-targeting/)
- [Marketing API: Threads updates, 25. 3. 2026](https://developers.facebook.com/blog/post/2026/03/25/marketing-api-latest-updates-for-ads-on-threads/)
- [What's new in the Threads API, 14. 4. 2026](https://developers.facebook.com/blog/post/2026/04/14/whats-new-in-the-threads-api/)
- [Access Levels](https://developers.facebook.com/docs/graph-api/overview/access-levels/)
- [App Review](https://developers.facebook.com/docs/app-review)
- [Business Verification](https://developers.facebook.com/docs/development/release/business-verification)
---

## Dodatak A — tačni oblici koje probe skript mora znati

Dopisano posle review-a TH1. Ovo su podaci koji su nedostajali u odeljcima iznad, a bez
kojih se ne može napisati ispravan test.

### A.1 `poll_attachment` — tačan oblik

Anketa NEMA polje za pitanje. Tekst objave je pitanje. Objekat ima isključivo opcije:

```json
{ "option_a": "prva", "option_b": "druga", "option_c": "treća", "option_d": "četvrta" }
```

- `option_a` i `option_b` su obavezni, `option_c` i `option_d` opcioni.
- Najmanje 2, najviše 4 opcije. Svaka 1–25 karaktera.
- Samo uz text-only objavu. Ne može uz `text_attachment`.
- Pri čitanju se očekuju i procenti: `option_a_votes_percentage` … `option_d_votes_percentage`,
  `total_votes`, `expiration_timestamp`. **Da li su ta polja čitljiva — to probe i utvrđuje.**

### A.2 Reply approvals — endpointi su PO OBJAVI, ne po nalogu

```
GET  /{threads-media-id}/pending_replies      ?approval_status=pending|ignored & reverse=true|false
POST /{threads-reply-id}/manage_pending_reply  approve=true|false
POST /{threads-reply-id}/manage_reply          hide=true|false
```

`/me/pending_replies` **ne postoji**. Provera mora ići nad ID-jem konkretne objave.

### A.3 Tri stanja ishoda pri proveri polja — obavezno razlikovati

Meta API ume da **tiho ignoriše** nepoznato polje: vrati HTTP 200 i prosto izostavi ključ.
Ako se to broji kao uspeh, svaki sporni par ispadne „OBA RADE" i test ne vredi ništa.
Zato ishod svake provere polja mora biti jedno od TRI stanja:

| Stanje | Uslov | Značenje |
|---|---|---|
| `POSTOJI` | HTTP 200 **i** ključ je prisutan u odgovoru (ma i sa `null`) | polje je stvarno |
| `NEODLUČENO` | HTTP 200 **a** ključa nema u odgovoru | API je tiho progutao polje — nije dokaz ni za ni protiv |
| `NE POSTOJI` | HTTP greška | polje ne postoji; zapisati tačnu poruku |

Presuda za sporni par sme da glasi „POBEDNIK: X" **samo** ako je X `POSTOJI` a drugi
`NE POSTOJI`. U svakoj drugoj kombinaciji presuda je „NEODLUČENO — potrebna ručna provera",
i to se mora eksplicitno ispisati. Nagađanje ovde košta isto kao pogrešno ime polja.

Kontrolna provera koja razrešava dvosmislenost: pošalji namerno izmišljeno polje
(npr. `fields=id,ovo_polje_sigurno_ne_postoji_123`). Ako API vrati grešku — znači da greši
na nepoznata polja, pa je `NEODLUČENO` malo verovatno. Ako vrati 200 bez tog ključa — znači
da tiho guta, i tada je svaki `NEODLUČENO` stvaran i mora se rešiti drugačije. Ovu kontrolu
uradi PRVU i njen rezultat ispiši na vrhu izveštaja.

### A.4 Tipovi objava koje test mora pokriti

Da bi se sporna tačka 5 (`media_type` vrednosti) uopšte mogla razrešiti, moraju postojati
objave svih tipova: TEXT, IMAGE, VIDEO, CAROUSEL (min 2 deteta), quote, repost, reply.
Za IMAGE/VIDEO/CAROUSEL potreban je javno dostupan URL medija.
Quote i reply praviti nad **običnom** objavom, nikad nad ghost objavom.

---

## Dodatak B — DOKAZANA imena polja (probe, 25.08.2026)

Rezultat pokretanja `scripts/probe-threads-fields.ts` nad nalogom `@itenigma`
(ID `28983614471241198`). Ovo više nisu pretpostavke — ovo je ono što je API stvarno vratio.

### B.1 Ponašanje API-ja na nepoznato polje — temelj svih zaključaka

Kontrolna provera sa izmišljenim poljem vratila je grešku:

```
Tried accessing nonexisting field (ovo_polje_sigurno_ne_postoji_123)
```

**Threads API GREŠI na nepoznato polje.** Zato važi pravilo tumačenja:

| Ishod probe | Značenje |
|---|---|
| HTTP 200, ključ prisutan | polje postoji i ima vrednost |
| HTTP 200, ključ izostavljen | **polje POSTOJI, ali je `null` na toj objavi** — Meta ne šalje null ključeve |
| `Tried accessing nonexisting field (X)` | polje X **ne postoji** |
| druga poruka greške | polje postoji, ali zahtev nije ispravan (npr. traži podpolja) |

### B.2 Polja koja SIGURNO postoje

`id`, `media_product_type`, `media_type`, `permalink`, `owner{id}`, `username`, `text`,
`timestamp`, `shortcode`, `is_quote_post`, `quoted_post{id}`, `reposted_post{id}`,
`poll_attachment`, `has_replies`, `root_post{id}`, `replied_to{id}`, `is_reply`,
`is_reply_owned_by_me`, `reply_audience`

Postoje, ali su bila prazna jer su sve test objave bile tekstualne:
`media_url`, `thumbnail_url`, `children`, `alt_text`, `link_attachment_url`,
`topic_tag`, `location_id`, `hide_status`

### B.3 Polja koja NE POSTOJE — nikada ih ne stavljati u `fields`

- `url_attached`
- `quoted_post_id`
- `reposted_media_id`
- `gif_attachment` — postoji kao parametar pri OBJAVLJIVANJU, ali se NE MOŽE ČITATI

### B.4 Posebni slučajevi

- `location` → *„An unknown error occurred"*. Poruka se razlikuje od „nonexisting field",
  dakle polje postoji ali zahteva podpolja. Koristiti `location{id,name,city,country}`
  ili se osloniti na `location_id`. **Nije dokazano — proveriti pre upotrebe.**
- `poll_attachment` je vratio samo `{option_a, option_b}`. Procenti glasova
  (`option_a_votes_percentage`, `total_votes`, `expiration_timestamp`) **nisu potvrđeni** —
  verovatno traže eksplicitno navođenje kao podpolja.

### B.5 `media_type` — DOKAZANE vrednosti

Prolaz uživo TH15, 26.08.2026: objavljeno po jedno od svakog tipa sa @itenigma
kroz aplikaciju, pa pročitano nazad kroz `GET /{user-id}/threads`.

| Tip objave | `media_type` u odgovoru |
|---|---|
| tekst | `TEXT_POST` |
| slika | `IMAGE` |
| video | `VIDEO` |
| carousel | **`CAROUSEL_ALBUM`** |
| repost | `REPOST_FACADE` |

⚠ **Carousel je jedini tip kod kog se ulaz i izlaz razlikuju.** Pri kreiranju
kontejnera šalje se `media_type=CAROUSEL` (§4.2), a nazad stiže
`CAROUSEL_ALBUM`. Kod koji poredi to dvoje mora znati za obe vrednosti.

### B.6 Šta ostaje da se dokaže

1. ~~`media_type` za IMAGE, VIDEO, CAROUSEL~~ — **ZATVORENO 26.08.2026**, vidi B.5
2. Reply approvals: `GET /{media-id}/pending_replies`, `POST /{reply-id}/manage_pending_reply`
3. `poll_attachment` podpolja sa procentima
4. `location` sa podpoljima
5. `text_attachment`, `gif_attachment`, `text_entities` — tačna struktura podpolja i tipova za stilizovan tekst, GIPHY priloge i spoilere ostaje da se dokaže probe testom pre modelovanja u šemi
6. `auto_publish_text=true` — da li `id` koji vrati `POST /{user-id}/threads` jeste ujedno i id objave, ili samo id kontejnera. Dokumentacija ne kaže. Do dokaza kod NE upisuje taj id kao `publishedMediaId`, nego traži objavu na profilu (`matchPublishedMedia`) i, ako je ne nađe nedvosmisleno, beleži `mediaIdUnconfirmed`.


### B.7 Pravilo za sav kod koji čita Threads objave

`media_type` se čuva kao **string onakav kakav je stigao**, bez mapiranja u naš enum i bez
podrazumevane vrednosti. Nepoznat tip se prikazuje kao nepoznat, ne kao „TEXT".
Isti princip kao kod Google Ads-a: vrednost koja nije stigla ne sme da dobije izmišljenu zamenu.
