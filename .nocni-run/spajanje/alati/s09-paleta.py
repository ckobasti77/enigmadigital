# SPAJANJE S09: izmene komandne palete za oba opsega ljuske (jednokratno).
import sys

p = 'components/app/command-palette.tsx'
s = open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    if a not in s:
        sys.exit('NEMA: ' + a[:80])
    s = s.replace(a, b, 1)


rep('''import {
  COMMAND_EVENT,
  NAPREDAK_HREF,
  RAIL_EVENT,
  REZIM_POZIVA_HREF,
  channelTabs,
  moduleNavItem,
  navItems,
  resolveModule,
  resolveScreen,
  type ModuleKey,
  type NavIcon,
} from "./nav-items";
import { ModuleTile } from "./module-tile";
import { useStaMeCeka } from "./use-sta-me-ceka";
import { ikonaMisije, naslovMisije, odredisteMisije } from "./napredak/napredak-ikone";
import { useNapredak } from "./napredak/use-napredak";
import {
  useEkranPutanja,
  useModulUkljucen,
  useMoze,
  useProjekat,
  useProjekatHref,
} from "./projekat-provider";
import { ProjektiZaPaletu, type ProjekatZaPrelazak } from "./projekat-birac";''', '''import {
  COMMAND_EVENT,
  NAPREDAK_HREF,
  NOVI_PROJEKAT_HREF,
  RAIL_EVENT,
  REZIM_POZIVA_HREF,
  channelTabs,
  jaNavItems,
  korpaNavItem,
  moduleNavItem,
  navItems,
  noviProjekatNavItem,
  podekraniRadnogDela,
  radSekcija,
  resolveModule,
  resolveScreen,
  sviProjektiNavItem,
  type ModuleKey,
  type NavIcon,
} from "./nav-items";
import { ModuleTile } from "./module-tile";
import { useStaMeCeka, type StaMeCeka } from "./use-sta-me-ceka";
import { ikonaMisije, naslovMisije, odredisteMisije } from "./napredak/napredak-ikone";
import { useNapredak } from "./napredak/use-napredak";
import { useOpseg } from "./opseg-ljuske";
import { useJaNalog } from "./podaci-ljuske";
import {
  useEkranPutanja,
  useModulUkljucen,
  useProjekatOpciono,
} from "./projekat-provider";
import { ProjektiZaPaletu, type ProjekatZaPrelazak } from "./projekat-birac";
import { imaUlogu } from "@/convex/lib/uloge";
import { putanjaEkrana } from "@/lib/rutiranje";''')

rep('''  ...Object.entries(channelTabs).flatMap(([base, tabs]) =>''', '''  // Radni deo bez stavke u meniju (SPAJANJE): Puls tima, Aktivnost i Korpa.
  ...[...podekraniRadnogDela, korpaNavItem].map((item) => ({
    id: `screen:${item.href}`,
    href: item.href,
    title: item.label,
    hint: radSekcija.title,
    icon: item.icon,
    module: item.module,
  })),
  ...Object.entries(channelTabs).flatMap(([base, tabs]) =>''')

rep('''/** Po adresi — za „Nedavno", koje pamti samo adrese. */''', '''/**
 * Lični ekrani „Ja“ (SPAJANJE P13, P20): u paleti su u oba opsega. Adresa je
 * puna (bez prefiksa projekta), pa idu mimo `putanjaEkrana`.
 */
const JA_EKRANI: Entry[] = [...jaNavItems, sviProjektiNavItem].map((item) => ({
  id: `ja:${item.href}`,
  href: item.href,
  title: item.label,
  hint: "Ja",
  icon: item.icon,
  module: item.module,
  vanProjekta: true,
}));

const NOVI_PROJEKAT: Entry = {
  id: `ja:${NOVI_PROJEKAT_HREF}`,
  href: NOVI_PROJEKAT_HREF,
  title: noviProjekatNavItem.label,
  hint: "Ja",
  icon: noviProjekatNavItem.icon,
  module: noviProjekatNavItem.module,
  vanProjekta: true,
};

/** Po adresi — za „Nedavno", koje pamti samo adrese. */''')

rep('''export function CommandPalette() {
  const router = useRouter();
  const pathname = useEkranPutanja();
  const ka = useProjekatHref();''', '''export function CommandPalette() {
  const router = useRouter();
  const pathname = useEkranPutanja();
  // Paleta radi u oba opsega (SPAJANJE P20): u projektu nosi ekrane i radnje
  // projekta, a u „Ja“ lične ekrane i projekte. Zadaci iz zvona su projektni,
  // pa ih daje dete koje postoji samo u projektu (`ZadaciZaPaletu`).
  const opseg = useOpseg();
  const projekatKtx = useProjekatOpciono();
  const projekat = opseg === "projekat" ? projekatKtx : null;
  const prefiks = projekat?.prefiks ?? "";
  const ka = useCallback((href: string) => putanjaEkrana(href, prefiks), [prefiks]);''')

rep('''  const staMeCeka = useStaMeCeka();
  const napredak = useNapredak();
  const { rezim, slug } = useProjekat();
  const ukljucen = useModulUkljucen();
  const mozeUrednik = useMoze("urednik");
  const mozeVlasnik = useMoze("owner");
  // Drugi projekti stižu samo dok je paleta otvorena, u hubu (vidi dole).
  const [drugiProjekti, setDrugiProjekti] = useState<ProjekatZaPrelazak[]>([]);

  const currentHref = resolveScreen(pathname)?.href;

  // Svaki otvoren ekran ulazi u „Nedavno", ne samo onaj otvoren kroz paletu.''', '''  const [staMeCeka, setStaMeCeka] = useState<StaMeCeka | undefined>(undefined);
  const napredak = useNapredak();
  const rezim = projekat?.rezim ?? "hub";
  const slug = projekat?.slug ?? null;
  const ukljucen = useModulUkljucen();
  const uloga = projekat?.uloga ?? null;
  const mozeUrednik = uloga !== null && imaUlogu(uloga, "urednik");
  const mozeVlasnik = uloga !== null && imaUlogu(uloga, "owner");
  const platformaVlasnik = useJaNalog()?.platformaVlasnik === true;
  // Drugi projekti stižu samo dok je paleta otvorena, u hubu (vidi dole).
  const [drugiProjekti, setDrugiProjekti] = useState<ProjekatZaPrelazak[]>([]);

  const currentHref = projekat ? resolveScreen(pathname)?.href : undefined;

  // Svaki otvoren ekran projekta ulazi u „Nedavno", ne samo onaj otvoren kroz
  // paletu. Lični ekrani se ne pamte: „Nedavno“ vodi u tekući projekat.''')

rep('''            title: `Prebaci na ${p.ime}`,''', '''            title: projekat ? `Prebaci na ${p.ime}` : `Otvori ${p.ime}`,''')
rep('''    [rezim, drugiProjekti],''', '''    [rezim, drugiProjekti, projekat],''')
rep('''    const recentEntries = q
      ? []''', '''    const recentEntries = q || !projekat
      ? []''')
rep('''          ...ACTIONS.filter(vidljiv),''', '''          ...(projekat ? ACTIONS.filter(vidljiv) : []),''')
rep('''      { key: "ekrani", title: "Ekrani", entries: match(SCREENS.filter(vidljiv)) },''', '''      {
        key: "ekrani",
        title: "Ekrani",
        entries: match([
          ...(projekat ? SCREENS.filter(vidljiv) : []),
          ...JA_EKRANI,
          ...(platformaVlasnik ? [NOVI_PROJEKAT] : []),
        ]),
      },''')
rep('''    mozeUrednik,
    mozeVlasnik,
  ]);''', '''    mozeUrednik,
    mozeVlasnik,
    projekat,
    platformaVlasnik,
  ]);''')
rep('''      else if (entry.href && entry.href !== pathname) router.push(ka(entry.href));''',
    '''      else if (entry.href && (entry.href !== pathname || !projekat)) router.push(ka(entry.href));''')
rep('''    [pathname, router, ka],''', '''    [pathname, router, ka, projekat],''')
rep('''          <ProjektiZaPaletu onProjekti={setDrugiProjekti} />
        </QuietBoundary>
      )}''', '''          <ProjektiZaPaletu onProjekti={setDrugiProjekti} />
        </QuietBoundary>
      )}
      {projekat && (
        <QuietBoundary>
          <ZadaciZaPaletu onZadaci={setStaMeCeka} />
        </QuietBoundary>
      )}''')
rep('''function Key({ children }: { children: React.ReactNode }) {''', '''/**
 * Zadaci iz zvona za paletu, samo u projektu (upit je projektni). Isti obrazac
 * kao `ProjektiZaPaletu`: dete javlja podatke, pa pad upita ne obara paletu.
 */
function ZadaciZaPaletu({ onZadaci }: { onZadaci: (z: StaMeCeka | undefined) => void }) {
  const zadaci = useStaMeCeka();
  useEffect(() => {
    onZadaci(zadaci);
  }, [zadaci, onZadaci]);
  useEffect(() => () => onZadaci(undefined), [onZadaci]);
  return null;
}

function Key({ children }: { children: React.ReactNode }) {''')
open(p, 'w', encoding='utf-8').write(s)
print('ok')
