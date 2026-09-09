## ZAJEDNIČKI REP (važi za svaki GL prompt; kopira se na kraj svakog)

Radiš bez čoveka (headless `-p` run, noć). Pravila:

- Ne postavljaj pitanja. Ako moraš da biraš između dve razumne opcije, izaberi
  konzervativniju (manje promena, manje pretpostavki) i ZAPIŠI izbor u izveštaj.
- Radi direktno na grani `main` u ovom folderu. Ne pravi worktree ni granu.
- Ne pokreći `npx convex deploy`, `npx convex dev`, `npx convex env` ni bilo
  koju komandu koja štampa env vrednosti. Vercel deployuje i Next i Convex na
  push.
- Nikad ne štampaj ni ne loguj sadržaj tajni, telefona, emailova, imena osoba
  iz baze. Test podaci su izmišljeni i očigledno lažni („Test Salon 1",
  „+381 60 000 0000").
- Ne instaliraj pakete koje plan ne pominje.
- Svaka nova tabela ide u `convex/lib/purgeMap.ts` `EXTRA_TABLE_OWNERSHIP`.
- Svako novo polje u šemi je `v.optional` sa `OPCIONO NAMERNO` komentarom.
- Svaka funkcija sa `workspaceId` argumentom poredi
  `membership.workspaceId !== args.workspaceId`.
- Poruke ka korisniku: srpski, latinica. Bez „Uskoro", bez mrtvih dugmadi.
- Kod skilla (`tools/generate-leads/`) se ne menja dok run traje: ako komanda
  ne radi, run se prekida i greška prijavljuje, pa se kod menja u zasebnoj
  sesiji — nikad da bi telo „prošlo" proveru (uzrok GL10 rupe).

ZAVRŠNI KORACI (obavezni, ovim redom, ne preskaču se):

1. `npm run typecheck` — mora da prođe bez grešaka. Ako ne prolazi, popravi
   i ponovi. Ne komituj sa greškom.
2. `npm run verify:purge` — mora da prođe.
3. `npm run lint` — popravi ono što si ti uneo; postojeće greške koje nisu
   tvoje ne diraj, ali ih navedi u izveštaju.
4. Napiši izveštaj u `nocni-run/izvestaji/<ID>.md` (ID = ovaj prompt, npr.
   GL1): šta je urađeno (po sekcijama plana), šta NIJE urađeno i zašto, koje
   odluke si doneo sam, koje fajlove si dodao/menjao, kako se ručno proverava
   na produkciji (koraci klik-po-klik za `digital.enigmait.rs`), poznati
   rizici. Bez tajni i bez ličnih podataka.
5. `git add -A` i `git commit` sa porukom oblika
   `feat(<oblast>): <šta> [<ID>]` na srpskom bez dijakritika (kao dosadašnji
   komitovi). Na kraju poruke:
   ```
   Co-Authored-By: Claude <noreply@anthropic.com>
   ```
6. `git push origin main`. Ako push padne (npr. remote je ispred), uradi
   `git pull --rebase origin main`, ponovo typecheck, pa push. Ako i tada
   padne, NE forsiraj — zapiši u izveštaj i završi.
7. Poslednja linija tvog izlaza: `GOTOVO <ID>: <hash komita>` ili
   `NEUSPEH <ID>: <razlog u jednoj rečenici>`.
