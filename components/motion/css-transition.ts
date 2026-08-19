/**
 * Pod `prefers-reduced-motion: reduce` globalno pravilo iz `app/globals.css`
 * postavlja 150 ms opacity tranziciju na SVAKI element. Ta tranzicija zatim
 * interpolira svaki okvir koji GSAP upiše, pa se cross-fade razvuče preko
 * svog trajanja i zatalasa umesto da ravno pređe.
 *
 * Dok tvin drži kontrolu nad `opacity`, tranzicija je višak — gasi se, pa
 * vraća čim tvin završi. Mora `!important` da bi nadjačala pravilo iz medija
 * upita, koje je i samo `!important`.
 */
export function holdCssTransition(el: HTMLElement) {
  el.style.setProperty("transition", "none", "important");
}

export function releaseCssTransition(el: HTMLElement) {
  el.style.removeProperty("transition");
}
