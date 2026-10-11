/**
 * Prisilna stanja za živi vodič (samo dev).
 *
 * Vodič mora da pokaže hover i fokus dugmeta bez miša — na snimku, za svih
 * trinaest modula odjednom. Umesto da se klase stanja dupliraju u samim
 * komponentama, ovde se u učitanim stilovima svako pravilo sa `:hover` ili
 * `:focus-visible` KLONIRA u parnjaka koji gađa `[data-force~="hover"]`,
 * odnosno `[data-force~="focus"]`. Stanje na snimku je zato tačno ono koje
 * pregledač crta — isto pravilo, drugi okidač — i ne može da se raziđe od
 * komponente.
 *
 * Prolazi i kroz ugnježdena pravila (`&:hover` unutar klase, kako ih piše
 * Tailwind 4) i kroz `@media` / `@layer` blokove. Pravila iz tuđeg porekla,
 * koja pregledač ne dâ na čitanje, preskače.
 *
 * Vraća funkciju koja sve klonove uklanja.
 */
const ZAMENE: Array<[RegExp, string]> = [
  [/:hover/g, '[data-force~="hover"]'],
  [/:focus-visible/g, '[data-force~="focus"]'],
];

type Roditelj = CSSStyleSheet | CSSGroupingRule | CSSStyleRule;

export function installForcedStates(): () => void {
  const dodato: Array<{ roditelj: Roditelj; pravilo: CSSRule }> = [];

  const obidji = (roditelj: Roditelj) => {
    let pravila: CSSRuleList;
    try {
      pravila = roditelj.cssRules;
    } catch {
      return;
    }
    // Unazad: ubacivanje iza tekućeg pravila ne pomera ona koja tek slede.
    for (let i = pravila.length - 1; i >= 0; i--) {
      const pravilo = pravila[i];
      if (pravilo instanceof CSSStyleRule) {
        const selektor = pravilo.selectorText;
        if (ZAMENE.some(([re]) => selektor.search(re) !== -1)) {
          const prisilan = ZAMENE.reduce((s, [re, novo]) => s.replace(re, novo), selektor);
          try {
            const indeks = roditelj.insertRule(
              pravilo.cssText.replace(selektor, prisilan),
              i + 1,
            );
            dodato.push({ roditelj, pravilo: roditelj.cssRules[indeks] });
          } catch {
            // Selektor koji se ne može ponoviti (npr. `::-moz-…:hover`) ostaje bez klona.
          }
        }
        if (pravilo.cssRules.length > 0) obidji(pravilo);
      } else if ("cssRules" in pravilo) {
        obidji(pravilo as CSSGroupingRule);
      }
    }
  };

  for (const list of Array.from(document.styleSheets)) obidji(list);

  return () => {
    for (const { roditelj, pravilo } of dodato) {
      const indeks = Array.from(roditelj.cssRules).indexOf(pravilo);
      if (indeks !== -1) roditelj.deleteRule(indeks);
    }
  };
}
