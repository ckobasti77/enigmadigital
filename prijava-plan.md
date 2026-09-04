# Prijava lozinkom i pozivnice — plan

## §1. Stanje pre ovog posla

`convex/auth.ts` već ima:
- `ResendOTP` — prijava 6-cifrenim kodom (ostaje kao rezervni ulaz)
- `EnigmaPassword` = `Password({ id: "password", verify: PasswordVerify, reset: PasswordReset })`
- `isEmailAllowed(email)` — **sinhrona** provera nad `ALLOWED_EMAILS`, fail-closed
- `beforeSessionCreation` (linija ~87) i `afterUserCreatedOrUpdated` (~209, ~221)
  oba zovu `isEmailAllowed`

`app/login/page.tsx` ima četiri ekrana: `lozinka`, `postavljanje`,
`zaboravljena`, `kod`.

Problem: ekran „Postavi lozinku" je otvoren svakome ko dođe na `/login`.
Jedina brana je `ALLOWED_EMAILS`, koji se menja ručno u Convex env-u za svakog
novog čoveka.

## §2. Odluka o lozinci vlasnika

**Lozinka NE ide u Convex env.** Env promenljiva je čist tekst, vidi se svakome
ko ima pristup Convex kontrolnoj tabli, ne može da se rotira po korisniku, i
zaobišla bi Scrypt heš koji Convex Auth već radi u `authAccounts`.

Umesto toga: vlasnik sebi napravi pozivnicu iz aplikacije (ulogovan je preko
OTP-a), otvori je, i postavi lozinku istim putem kao i svi ostali. Jedan put,
jedan mehanizam, nigde čist tekst.

## §3. Nova tabela `invites`

```ts
invites: defineTable({
  workspaceId: v.id("workspaces"),
  email: v.string(),              // normalizovan: trim + lowercase
  tokenHash: v.string(),          // SHA-256 sirovog tokena, hex
  createdBy: v.id("users"),
  createdAt: v.number(),
  expiresAt: v.number(),          // createdAt + 7 dana
  // Kratki prozor u kome je token proveren i registracija sme da prođe.
  readyUntil: v.optional(v.number()),
  usedAt: v.optional(v.number()),
  usedByUserId: v.optional(v.id("users")),
  revokedAt: v.optional(v.number()),
})
  .index("by_workspace", ["workspaceId"])
  .index("by_token_hash", ["tokenHash"])
  .index("by_workspace_email", ["workspaceId", "email"])
```

**SIROV TOKEN SE NIKAD NE UPISUJE.** U bazi stoji samo SHA-256. Sirovi token
postoji tačno jednom — u povratnoj vrednosti mutacije koja pravi pozivnicu, i
odatle u linku. Ako se link izgubi, pozivnica se ne može pročitati; pravi se
nova.

**Purge gate:** `invites` mora dobiti odluku u `convex/lib/purgeMap.ts`
(`EXTRA_TABLE_OWNERSHIP`, linija 1413), inače `npm run build` pada. Odluka je
`excluded` sa obrazloženjem: pozivnice nisu podaci preuzeti od provajdera nego
sopstvena kontrola pristupa; prekid veze sa Meta/Google ih ne dodiruje.

## §4. Tok pozivnice

1. **Ulogovan korisnik pravi pozivnicu.** Mutacija `createInvite({ workspaceId, email })`:
   - `requireMembership` + poređenje `membership.workspaceId !== args.workspaceId`
   - odbija ako za tu adresu već postoji **važeća neiskorišćena** pozivnica —
     poruka to kaže izričito, ne pravi tiho drugu
   - odbija ako korisnik sa tom adresom već ima nalog
   - pravi token: 32 nasumična bajta iz `crypto.getRandomValues`, base64url
   - upisuje `tokenHash`, vraća **`{ token, email, expiresAt }` — jedini put
     kad sirovi token izlazi**
2. **Ekran prikaže pun link** `${SITE_URL}/pozivnica/<token>` sa dugmetom
   „Kopiraj". Link se prikazuje jednom, uz jasnu napomenu da se posle
   zatvaranja ne može ponovo videti.
3. **Kolega otvara `/pozivnica/<token>`.** Javni upit `getInvite({ token })`
   vraća **isključivo** `{ status, email? }`, gde je status jedno od:
   `vazi | istekla | iskoriscena | povucena | ne_postoji`.
   - `email` se vraća samo kad je status `vazi`
   - svaki drugi status vraća svoju poruku; **ne smeju da izgledaju isto**
   - upit ne sme da otkrije ništa o radnom prostoru
4. **Kolega popunjava lozinku.** Klik na „Napravi nalog" radi dva koraka:
   a) mutacija `pripremiRegistraciju({ token })` — ponovo proverava heš, rok,
      iskorišćenost i povučenost, pa upisuje `readyUntil = now + 10 min`
   b) odmah zatim `signIn("password", { email, password, flow: "signUp" })`
5. **`afterUserCreatedOrUpdated`** propušta adresu ako je u `ALLOWED_EMAILS`
   **ili** ako postoji pozivnica za tu adresu sa `readyUntil > now`, bez
   `usedAt` i bez `revokedAt`. Kad prođe, upisuje `usedAt` i `usedByUserId`.

`isEmailAllowed` postaje **async** i prima `ctx`. Sva tri poziva u `auth.ts`
moraju se prepraviti; `sendVerificationRequest` nema `ctx.db` pa tamo ostaje
samo provera nad `ALLOWED_EMAILS` — to je i dalje ispravno, jer je to samo
slanje koda, a sesija se i dalje ne može napraviti bez pune provere.

## §5. Pravila lozinke

Min 8 znakova, bar jedno **veliko** slovo, bar jedno **malo**, bar jedna
**cifra**, bar jedan **znak** (nije slovo ni cifra). Max 128.

Ista pravila na **oba** mesta:
- server: `validatePasswordRequirements` u `Password({...})` — jedini pravi gate
- ekran: lista uslova koja se **uživo** čekira dok korisnik kuca

Klijentska provera je samo udobnost. Server nikad ne veruje ekranu.

## §6. Tri polja pri registraciji

`email` (popunjen iz pozivnice, **samo za čitanje** — ne sme da se menja, jer
pozivnica važi za tačno tu adresu), `lozinka`, `potvrda lozinke`.

Neslaganje potvrde se prijavljuje **pri kucanju**, ne tek pri slanju.

## §7. Greške i uspeh — šta se traži

**Greške.** Svaka od ovih ima svoju poruku i nijedna se ne svodi na drugu:
- token ne postoji · istekao · već iskorišćen · povučen
- lozinka ne ispunjava pravila (koje tačno pravilo — ne „lozinka je loša")
- potvrda se ne poklapa
- nalog sa tom adresom već postoji
- mreža/server nije odgovorio → **to se kaže kao takvo**, ne kao „pogrešni podaci"

**Uspeh.** Posle uspešne registracije korisnik je odmah ulogovan i preusmeren.
Ako preusmeravanje ne krene u roku od 3 sekunde, ekran to kaže i daje link —
tiho čekanje je najgori mogući ishod.

Na ekranu za pravljenje pozivnice: pun link, dugme „Kopiraj", potvrda da je
kopirano, i rok važenja ispisan datumom.

## §8. Spisak pozivnica

Sekcija u `app/(app)/settings/page.tsx` (novi jezičak „Pristup", pored
„Integracije" / „Istorija akcija" / „Moderacija"). Tabela: adresa, status,
napravljena, ističe, ko je napravio. Radnja: „Povuci" za neiskorišćene.

Sirovi token se **ne** prikazuje u spisku — u bazi ga nema.

## §9. Šta se uklanja

Ekran „Prvi put ovde? Postavi lozinku" u `app/login/page.tsx` i njegovo dugme.
Postavljanje lozinke od sada ide isključivo preko pozivnice.

Ostaje: prijava lozinkom, „Zaboravio sam lozinku", i „Pošalji mi kod na email"
kao rezervni ulaz.

## §10. Šta se NE radi

- ne dira se `ResendOTP` niti tok koda za prijavu
- ne dira se `PasswordReset` tok
- ne prave se uloge ni dozvole (svi članovi su i dalje `owner`)
- ne šalje se mail sa pozivnicom — link se prosleđuje ručno
- lozinka ne ide u env, ni u log, ni u URL, ni u poruku greške
