import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { PAGE_PRESENCE_REFRESH_MS } from "../../../convex/prostor/lib/pagePresence";
import { pokreniOtkucaje, type OkruzenjeOtkucaja } from "./otkucaj-prisustva";

function lazniPregledac(pocetnoVidljivo = true) {
  let vidljivo = pocetnoVidljivo;
  const slusaoci = new Set<() => void>();
  const okruzenje: OkruzenjeOtkucaja = {
    vidljivo: () => vidljivo,
    naPromenuVidljivosti: (slusalac) => {
      slusaoci.add(slusalac);
      return () => slusaoci.delete(slusalac);
    },
    setInterval: (fn, ms) => setInterval(fn, ms) as unknown as number,
    clearInterval: (id) => clearInterval(id),
  };
  return {
    okruzenje,
    slusaoci,
    postavi(novo: boolean) {
      vidljivo = novo;
      for (const slusalac of slusaoci) slusalac();
    },
  };
}

describe("otkucaj prisustva", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("ritam je 15 s, kao na serveru", () => {
    expect(PAGE_PRESENCE_REFRESH_MS).toBe(15_000);
  });

  test("vidljiva kartica šalje odmah, pa na svakih 15 s", () => {
    const pregledac = lazniPregledac();
    const posalji = vi.fn();
    const naTik = vi.fn();
    const stani = pokreniOtkucaje({
      intervalMs: PAGE_PRESENCE_REFRESH_MS,
      posalji,
      naTik,
      okruzenje: pregledac.okruzenje,
    });
    expect(posalji).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(14_999);
    expect(posalji).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(posalji).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(30_000);
    expect(posalji).toHaveBeenCalledTimes(4);
    expect(naTik).toHaveBeenCalledTimes(4);
    stani();
  });

  test("sakrivena kartica ne šalje ništa; povratak šalje odmah i nastavlja", () => {
    const pregledac = lazniPregledac();
    const posalji = vi.fn();
    const stani = pokreniOtkucaje({ intervalMs: 15_000, posalji, okruzenje: pregledac.okruzenje });
    expect(posalji).toHaveBeenCalledTimes(1);

    pregledac.postavi(false);
    vi.advanceTimersByTime(5 * 60_000);
    expect(posalji).toHaveBeenCalledTimes(1);

    pregledac.postavi(true);
    expect(posalji).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(15_000);
    expect(posalji).toHaveBeenCalledTimes(3);
    stani();
  });

  test("kartica otvorena u pozadini ne šalje dok se ne pokaže", () => {
    const pregledac = lazniPregledac(false);
    const posalji = vi.fn();
    const stani = pokreniOtkucaje({ intervalMs: 15_000, posalji, okruzenje: pregledac.okruzenje });
    vi.advanceTimersByTime(60_000);
    expect(posalji).not.toHaveBeenCalled();
    pregledac.postavi(true);
    expect(posalji).toHaveBeenCalledTimes(1);
    stani();
  });

  test("ponovljen „vidljivo“ ne pravi drugi sat", () => {
    const pregledac = lazniPregledac();
    const posalji = vi.fn();
    const stani = pokreniOtkucaje({ intervalMs: 15_000, posalji, okruzenje: pregledac.okruzenje });
    pregledac.postavi(true);
    pregledac.postavi(true);
    vi.advanceTimersByTime(15_000);
    expect(posalji).toHaveBeenCalledTimes(2);
    stani();
  });

  test("zaustavljanje gasi sat i odjavljuje slušaoca", () => {
    const pregledac = lazniPregledac();
    const posalji = vi.fn();
    const stani = pokreniOtkucaje({ intervalMs: 15_000, posalji, okruzenje: pregledac.okruzenje });
    stani();
    expect(pregledac.slusaoci.size).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(posalji).toHaveBeenCalledTimes(1);
  });
});
