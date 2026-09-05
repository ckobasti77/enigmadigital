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

---

# DRUGI KRUG — konačan model pristupa (§11–§16)

## §11. Pravilo koje sve određuje

**Kod na email postoji za tačno dve stvari: potvrdu pri registraciji i promenu
zaboravljene lozinke. Prijava se NIKAD ne radi kodom.**

Zato `ResendOTP` (provajder `"resend"`) i dugme „Pošalji mi kod na email
umesto toga" **nestaju**. Prijava je isključivo email + lozinka.

## §12. Dve greške u postojećem kodu koje se ovde ispravljaju

### §12.1 Kolega se može registrovati, ali se ne može ponovo prijaviti

`isEmailAllowed` (convex/auth.ts) pušta adresu samo ako je u `ALLOWED_EMAILS`
ILI ima pozivnicu sa `readyUntil > now` **i `usedAt === undefined`**.

`afterUserCreatedOrUpdated` upisuje `usedAt` čim registracija prođe. Sledeći
put kad se kolega prijavi, pozivnica je iskorišćena, adresa nije u allowlisti —
`beforeSessionCreation` ga odbija. **Registruje se jednom i više nikad ne ulazi.**

Ispravno pravilo: **ko je već član radnog prostora, sme da se prijavi.**

```
isEmailAllowed(ctx, userId, email):
  1. postoji `members` red za tog userId            → DA   (obična prijava)
  2. postoji pozivnica sa otvorenim readyUntil      → DA   (registracija u toku)
  3. email je u ALLOWED_EMAILS                      → DA   (nasleđeno, bezopasno)
  inače                                             → NE
```

`beforeSessionCreation` dobija `userId`, pa se članstvo čita direktno.
`afterUserCreatedOrUpdated` ga takođe ima.

### §12.2 Vlasnik ne može sebi da postavi lozinku

`createInvite` odbija svaku adresu koja već ima nalog. Vlasnik nalog ima, pa je
zaključan van sistema lozinkom. Rešava §13.

## §13. Bootstrap: pravljenje prvog admin naloga

**Uslov pojavljivanja:** u bazi ne postoji **nijedan `authAccounts` red sa
`provider === "password"`**. To je iskren uslov — znači „još niko ne može da
uđe lozinkom". Postojeći `users` red od OTP prijave ga NE blokira.

Indeks: `authAccounts.providerAndAccountId` na `["provider", "providerAccountId"]`.

**Šifra za setup:** `ADMIN_SETUP_CODE` u Convex env-u. Nije lozinka naloga —
to je jednokratni ključ koji otvara ekran za pravljenje admina.
- ako promenljiva nije postavljena ili je prazna → ekran to **izričito kaže**
  („Setup nije konfigurisan na serveru"), ne pravi se tiho ništa
- poređenje ide nad celim stringom, bez ranog izlaza na prvoj različitoj
  cifri
- vrednost se **nikad** ne loguje, ne vraća klijentu i ne stavlja u poruku greške

**Tok:**
1. `/login` zove javni upit `trebaSetup()` → `boolean`. Kad je `true`, prikazuje
   dugme **„Napravi admin nalog"**.
2. Ekran: setup šifra, email, lozinka, potvrda lozinke.
3. Mutacija `pripremiAdminSetup({ setupCode, email })`:
   - ponovo proverava da nijedan `password` nalog ne postoji (uslov se mogao
     promeniti između učitavanja ekrana i klika)
   - proverava šifru
   - upisuje **bootstrap red u istu `invites` tabelu** (`readyUntil = now + 10 min`,
     `createdBy` = sam userId kad postoji, inače polje ostaje prazno)

   Namerno se koristi ista tabela i isti prozor kao za pozivnice — jedan
   mehanizam, jedan put kroz kod, jedno mesto za grešku.
4. `signIn("password", { email, password, flow: "signUp" })`
5. Stiže kod za potvrdu → unos → nalog napravljen, korisnik ulogovan.

**Vlasnikov postojeći nalog se ČUVA.** `verify` je postavljen na Password
provajderu, pa Convex Auth radi `shouldLinkViaEmail: true`
(`Password.js:69`) i lozinku kači na **postojeći** `users` red. Bez toga bi
nastao drugi korisnik, a `leadAssignments.ownerUserId` i sve ostalo ostalo bi
na starom.

Kad admin nalog postoji, `trebaSetup()` vraća `false` i dugme se više ne crta.

## §14. Kod za potvrdu mora da stigne i onome ko nije u allowlisti

`Password` provajder dobija `verify: PasswordVerify`
(`makeResendOTP("password-verify", "potvrda")`).

`sendVerificationRequest` trenutno proverava samo `isEmailInAllowlist`. Kolega
nije u allowlisti, pa mu kod za potvrdu **ne bi bio poslat** — registracija bi
stala bez objašnjenja.

`sendVerificationRequest` **dobija `ctx`** kao drugi argument
(`@convex-dev/auth/dist/server/implementation/signIn.js:98`). Preko
`ctx.runQuery` sme da pročita da li za tu adresu postoji pozivnica sa otvorenim
prozorom. Pravilo: **allowlist ILI otvoren invite prozor ILI postojeći član.**

Ako čitanje iz bilo kog razloga ne uspe → **odbija se** (fail closed), i to se
kaže kao greška servera, ne kao „adresa nije dozvoljena".

## §15. Ekran registracije — tri polja

`email` (popunjen iz pozivnice), `lozinka`, `potvrda lozinke`.

**Email se mora poklopiti sa adresom iz pozivnice.** Polje je popunjeno i
zaključano; ako se ipak pošalje druga vrednost, server odbija — poređenje se
radi i na serveru, nad normalizovanom adresom (trim + lowercase).

**Pravila lozinke** (min 8, veliko slovo, malo slovo, cifra, specijalan znak)
se prikazuju kao **živi checklist** koji se čekira dok korisnik kuca, a poruka
greške kaže **koje** pravilo fali — nikad „lozinka je loša".

Neslaganje potvrde javlja se **pri kucanju**, ne tek pri slanju.

**Uspeh:** posle unetog koda korisnik je ulogovan i preusmeren. Ako
preusmeravanje ne krene za 3 sekunde, ekran to kaže i ponudi link.

## §16. Šta se briše

- `ResendOTP` provajder i sve njegove upotrebe
- ekran `kod` u `app/login/page.tsx` u nameni `"prijava"`
- dugme „Pošalji mi kod na email umesto toga"

Ostaje: prijava lozinkom, „Zaboravio sam lozinku" (kod → nova lozinka),
registracija preko pozivnice (kod za potvrdu), i bootstrap admina.
