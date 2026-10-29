# SPAJANJE S09: razvojni prikaz ljuske u oba opsega (plan S07 §8.3).
import sys
p = 'app/dev-ux/[[...slug]]/page.tsx'
s = open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    if a not in s:
        sys.exit('NEMA: ' + a[:80])
    s = s.replace(a, b, 1)


rep('''import InstagramPostDetailPage from "@/app/(app)/[projekat]/instagram/objave/[mediaId]/page";''',
    '''import InstagramPostDetailPage from "@/app/(app)/[projekat]/instagram/objave/[mediaId]/page";
import ZadaciPage from "@/app/(app)/[projekat]/zadaci/page";
import IdejePage from "@/app/(app)/[projekat]/ideje/page";
import PorukeProjektaPage from "@/app/(app)/[projekat]/poruke/page";
import BeleskeProjektaPage from "@/app/(app)/[projekat]/beleske/page";
import PulsPage from "@/app/(app)/[projekat]/puls/page";
import AktivnostPage from "@/app/(app)/[projekat]/aktivnost/page";
import KorpaPage from "@/app/(app)/[projekat]/korpa/page";
import DokumentiPage from "@/app/(app)/[projekat]/dokumenti/page";
import OblastPage from "@/app/(app)/[projekat]/dokumenti/[oblastId]/page";
import StranicaPage from "@/app/(app)/[projekat]/stranica/[stranicaId]/page";
import DanasPage from "@/app/(app)/(ja)/page";
import MojiZadaciPage from "@/app/(app)/(ja)/moji-zadaci/page";
import InboxPage from "@/app/(app)/(ja)/inbox/page";
import PorukePage from "@/app/(app)/(ja)/poruke/page";
import BeleskePage from "@/app/(app)/(ja)/beleske/page";
import SviProjektiPage from "@/app/(app)/(ja)/projekti/page";
import NoviProjekatPage from "@/app/(app)/(ja)/novi/page";''')

rep('''import { SviProjekti } from "@/components/app/hub/svi-projekti";
import { NoviProjekat } from "@/components/app/hub/novi-projekat";
import { ProjekatProvider } from "@/components/app/projekat-provider";
import { EKRANI } from "@/lib/rutiranje";''', '''import { ProjekatProvider } from "@/components/app/projekat-provider";
import { EKRANI, JA_PUTANJE } from "@/lib/rutiranje";''')

rep(''' *   - `/?ux=1&rezim=hub` je hub „Svi projekti“.''', ''' *   - lični nivo „Ja“ (SPAJANJE, plan S07 §8.3) ide pre grananja hub/panel:
 *     `/?ux=1` je Danas, `/moji-zadaci`, `/inbox`, `/poruke`, `/beleske`,
 *     `/projekti` i `/novi` su „Ja“ (`/poruke` i `/beleske` bez prefiksa su
 *     lični, D3); `/?ux=1&rezim=hub` ostaje alias za `/projekti`, a
 *     `/?ux=1&rezim=panel` je stara kontrolna tabla u panelu.''')

rep('''  "instagram/objavi": InstagramPublishPage,
};''', '''  "instagram/objavi": InstagramPublishPage,
  // SPAJANJE S09: radni deo projekta (sadržaj donose kasniji koraci).
  zadaci: ZadaciPage,
  ideje: IdejePage,
  poruke: PorukeProjektaPage,
  beleske: BeleskeProjektaPage,
  puls: PulsPage,
  aktivnost: AktivnostPage,
  korpa: KorpaPage,
  dokumenti: DokumentiPage,
};

/** Lični nivo „Ja“ (SPAJANJE P13): ista ljuska, bez projekta. */
const JA_PAGES: Record<string, ComponentType> = {
  "": DanasPage,
  "moji-zadaci": MojiZadaciPage,
  inbox: InboxPage,
  poruke: PorukePage,
  beleske: BeleskePage,
  projekti: SviProjektiPage,
  novi: NoviProjekatPage,
};''')

rep('''  // Čarobnjak „Novi projekat“ je hub putanja, van ljuske projekta.
  if (putanja.join("/") === "novi") {
    return (
      <UxHarness prazno={prazno === "1"} pad={pad}>
        <AuthGate>
          <div data-module="tabla" className="flex min-h-full flex-1 flex-col">
            <NoviProjekat />
          </div>
        </AuthGate>
      </UxHarness>
    );
  }

  if (putanja.length === 0 && trazeniRezim === "hub") {
    // `&projekata=1|22`: hub sa jednim ili sa više od 20 projekata (C16).
    const broj = Number(projekata);
    return (
      <UxHarness
        prazno={prazno === "1"}
        pad={pad}
        projekata={Number.isInteger(broj) && broj >= 1 && broj <= 40 ? broj : undefined}
      >
        <AuthGate>
          {/* Isto kao `app/(app)/page.tsx`: hub nosi boju Kontrolne table. */}
          <div data-module="tabla" className="flex min-h-full flex-1 flex-col">
            <SviProjekti />
          </div>
        </AuthGate>
      </UxHarness>
    );
  }

  const ekrani: readonly string[] = EKRANI;''', '''  // Lični nivo „Ja“ (SPAJANJE, plan S07 §8.3) ide pre grananja hub/panel:
  // prazna putanja bez `rezim` je Danas, `rezim=hub` je stari alias huba, a
  // prvi segment iz „Ja“ ili hub (`projekti`, `novi`) je lična strana.
  const jaPutanje: readonly string[] = JA_PUTANJE;
  const jaKljuc =
    putanja.length === 0
      ? trazeniRezim === "hub"
        ? "projekti"
        : trazeniRezim === "panel"
          ? null
          : ""
      : putanja.length === 1 &&
          (jaPutanje.includes(putanja[0]) || putanja[0] === "projekti" || putanja[0] === "novi")
        ? putanja[0]
        : null;
  if (jaKljuc !== null) {
    const JaPage = JA_PAGES[jaKljuc];
    if (!JaPage) notFound();
    // `&projekata=1|22`: hub sa jednim ili sa više od 20 projekata (C16).
    const broj = Number(projekata);
    return (
      <UxHarness
        prazno={prazno === "1"}
        pad={pad}
        projekata={Number.isInteger(broj) && broj >= 1 && broj <= 40 ? broj : undefined}
      >
        {/* Isto kao `app/(app)/layout.tsx` i `app/(app)/(ja)/layout.tsx`. */}
        <AuthGate>
          <AppShell opseg="ja">
            <JaPage />
          </AppShell>
        </AuthGate>
      </UxHarness>
    );
  }

  const ekrani: readonly string[] = EKRANI;''')

rep('''  const objavaId =
    slug.length === 3 && slug[0] === "instagram" && slug[1] === "objave"
      ? slug[2]
      : null;
  const Page = profilId || objavaId ? null : PAGES[slug.join("/")];
  if (!profilId && !objavaId && !Page) notFound();''', '''  const objavaId =
    slug.length === 3 && slug[0] === "instagram" && slug[1] === "objave"
      ? slug[2]
      : null;
  // Radni deo (SPAJANJE): oblast i stranica su dinamične rute sa ID-jem.
  const oblastId = slug.length === 2 && slug[0] === "dokumenti" ? slug[1] : null;
  const stranicaId = slug.length === 2 && slug[0] === "stranica" ? slug[1] : null;
  const dinamicna = profilId || objavaId || oblastId || stranicaId;
  const Page = dinamicna ? null : PAGES[slug.join("/")];
  if (!dinamicna && !Page) notFound();''')

rep('''      {/* Isto kao `app/(app)/layout.tsx` i `app/(app)/[projekat]/layout.tsx`. */}
      <AuthGate>
        <ProjekatProvider slug={projekat} rezim={rezim}>
          <AppShell>
            {profilId ? (
              <LeadDetailPageClient companyId={profilId} />
            ) : objavaId ? (
              <InstagramPostDetailPage params={Promise.resolve({ mediaId: objavaId })} />
            ) : (
              Page && <Page />
            )}
          </AppShell>
        </ProjekatProvider>
      </AuthGate>''', '''      {/* Isto kao `app/(app)/layout.tsx` (traka samo u hubu) i
          `app/(app)/[projekat]/layout.tsx`. */}
      <div data-traka={rezim === "panel" ? "ne" : undefined} className="contents">
      <AuthGate>
        <ProjekatProvider slug={projekat} rezim={rezim}>
          <AppShell>
            {profilId ? (
              <LeadDetailPageClient companyId={profilId} />
            ) : objavaId ? (
              <InstagramPostDetailPage params={Promise.resolve({ mediaId: objavaId })} />
            ) : oblastId ? (
              <OblastPage params={Promise.resolve({ oblastId })} />
            ) : stranicaId ? (
              <StranicaPage params={Promise.resolve({ stranicaId })} />
            ) : (
              Page && <Page />
            )}
          </AppShell>
        </ProjekatProvider>
      </AuthGate>
      </div>''')
open(p, 'w', encoding='utf-8').write(s)
print('ok')
