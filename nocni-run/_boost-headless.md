## HEADLESS REP (dodaje ga `nocni-run/run-boost.ps1` na kraj prompta)

Radiš bez čoveka: headless `claude -p`, faze pušta runner. Ova pravila imaju
prednost nad tekstom prompta.

- **Ne postavljaj pitanja i ne čekaj odgovor.** Gde prompt kaže „pitaj me",
  „javi mi" ili „posle mog odobrenja":
  - izaberi konzervativniju opciju (ne briši, ne menjaj šemu bez potrebe, ne
    izmišljaj);
  - zapiši to u izveštaj, pod naslovom „Čeka Jovanovu odluku".
- **Brisanje foldera i grana se u runneru ne radi** (u B0: worktree-ovi i
  `_to_delete/`). Samo zapiši šta je spremno za brisanje.
- Gde prompt kaže „STANI", završi fazu linijom `NEUSPEH <ID>: <razlog>`.
- `/compact` iz prompta preskoči; kontekst se sažima sam.
- **Push ne radiš ti.** Commit radiš (§12, korak 6), a push radi runner posle
  uspešne faze.
- Runner odbija `git push`, `git reset --hard`, `git clean`, brisanje grana i
  worktree-ova, i `convex deploy/dev/env/run/import`. Ako ti neka druga komanda
  bude odbijena, izaberi bezbedniji put i ne pokušavaj da je zaobiđeš.
- **Convex i tajne:**
  - ne pokreći `npx convex deploy`, `npx convex dev` ni `npx convex env`, ni
    bilo koju komandu koja štampa tajne;
  - ne čitaj `.env*`, `client_secret*`, `env.personal.txt` ni JSON ključeve.
- **Snimci i `next dev`:** Next 16 dozvoljava jedan `next dev` po folderu, pa
  pre snimaka proveri port. Zaglavljen server ugasi komandom
  `taskkill /PID <n> /F` koju Next sam ispiše, ili prekini fazu sa jasnom
  porukom. Nikad ne prijavljuj snimke koji ne postoje.
- **Poslednja linija izlaza**, bez ičega posle nje:
  `GOTOVO <ID>: <hash komita>` ili `NEUSPEH <ID>: <razlog u jednoj rečenici>`.
