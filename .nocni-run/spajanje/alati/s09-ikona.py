import sys
p = 'components/app/nav-items.ts'
s = open(p, encoding='utf-8').read()
a = s[s.index('/**\n * Ikonica ekrana za zaglavlje strane.'):]
b = '''/**
 * Stavka čija ikonica stoji u zaglavlju strane. Enigmini moduli zadržavaju
 * stavku (ikonicu) modula; ekrani radnog dela i „Ja“ (SPAJANJE) nose svoju
 * stavku, jer svi dele modul Kontrolne table.
 */
export function stavkaEkrana(pathname: string, opseg: Opseg = "projekat"): NavItem | undefined {
  if (opseg === "ja") {
    const href = resolveScreen(pathname, "ja")?.href;
    return [...jaNavItems, sviProjektiNavItem, noviProjekatNavItem].find((i) => i.href === href);
  }
  const modul = resolveModule(pathname);
  if (modul !== "tabla") return moduleNavItem(modul);
  const href = resolveScreen(pathname)?.href;
  return (
    [...navItems, korpaNavItem, ...podekraniRadnogDela].find((i) => i.href === href) ??
    radSekcija.items.find((i) => i.href === activeHref(pathname) && i.href !== "/") ??
    moduleNavItem(modul)
  );
}
'''
s = s.replace(a, b)
open(p, 'w', encoding='utf-8').write(s)
q = 'components/app/system/page-header.tsx'
t = open(q, encoding='utf-8').read()
t = t.replace('const Icon = icon ?? ikonaEkrana(pathname, opseg);', 'const Icon = icon ?? stavkaEkrana(pathname, opseg)?.icon;')
t = t.replace('  ikonaEkrana,\n', '  stavkaEkrana,\n')
open(q, 'w', encoding='utf-8').write(t)
print('ok')
