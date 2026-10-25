import { afterEach, describe, expect, test, vi } from "vitest";

import { napraviRazresivac } from "./panel-domen";

/** Sat koji test pomera ručno. */
function sat(pocetak = 1_000_000) {
  let t = pocetak;
  return { sada: () => t, pomeri: (ms: number) => (t += ms) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("razrešavač domena panela (P5)", () => {
  test("lokalni i neispravni hostovi su hub bez upita", async () => {
    const dohvati = vi.fn(async () => "enigma-it");
    const razresi = napraviRazresivac({ dohvati });
    for (const host of ["localhost:3105", "127.0.0.1:3000", "enigma.localhost", "", null, undefined, "[::1]:3000"]) {
      expect(await razresi(host), String(host)).toBeNull();
    }
    expect(dohvati).not.toHaveBeenCalled();
  });

  test("normalizuje host pre upita i keša", async () => {
    const dohvati = vi.fn(async () => "enigma-it");
    const razresi = napraviRazresivac({ dohvati });
    expect(await razresi("Digital.EnigmaIT.rs:443")).toBe("enigma-it");
    expect(await razresi("digital.enigmait.rs")).toBe("enigma-it");
    expect(dohvati).toHaveBeenCalledTimes(1);
    expect(dohvati).toHaveBeenCalledWith("digital.enigmait.rs");
  });

  test("odgovor važi 60 s, posle toga se pita ponovo", async () => {
    const s = sat();
    const dohvati = vi.fn(async () => "enigma-it");
    const razresi = napraviRazresivac({ dohvati, sada: s.sada });
    await razresi("digital.enigmait.rs");
    s.pomeri(59_999);
    await razresi("digital.enigmait.rs");
    expect(dohvati).toHaveBeenCalledTimes(1);
    s.pomeri(1);
    await razresi("digital.enigmait.rs");
    expect(dohvati).toHaveBeenCalledTimes(2);
  });

  test("i „nije panel“ (null) se pamti 60 s", async () => {
    const s = sat();
    const dohvati = vi.fn(async () => null);
    const razresi = napraviRazresivac({ dohvati, sada: s.sada });
    expect(await razresi("hub.example.com")).toBeNull();
    s.pomeri(30_000);
    expect(await razresi("hub.example.com")).toBeNull();
    expect(dohvati).toHaveBeenCalledTimes(1);
  });

  test("greška upita = hub, zapamćeno 10 s", async () => {
    const s = sat();
    const dohvati = vi.fn(async (): Promise<string | null> => {
      throw new Error("Convex ne odgovara");
    });
    const razresi = napraviRazresivac({ dohvati, sada: s.sada });
    expect(await razresi("digital.enigmait.rs")).toBeNull();
    s.pomeri(9_999);
    expect(await razresi("digital.enigmait.rs")).toBeNull();
    expect(dohvati).toHaveBeenCalledTimes(1);
    s.pomeri(1);
    dohvati.mockResolvedValueOnce("enigma-it");
    expect(await razresi("digital.enigmait.rs")).toBe("enigma-it");
    expect(dohvati).toHaveBeenCalledTimes(2);
  });

  test("sinhrona greška upita ne zaglavi host", async () => {
    const s = sat();
    const dohvati = vi.fn((): Promise<string | null> => {
      throw new Error("loš URL");
    });
    const razresi = napraviRazresivac({ dohvati, sada: s.sada });
    expect(await razresi("digital.enigmait.rs")).toBeNull();
    s.pomeri(10_000);
    dohvati.mockImplementationOnce(async () => "enigma-it");
    expect(await razresi("digital.enigmait.rs")).toBe("enigma-it");
  });

  test("istek posle 1,5 s = hub, zapamćeno 10 s", async () => {
    vi.useFakeTimers();
    const s = sat();
    const dohvati = vi.fn(() => new Promise<string | null>(() => {}));
    const razresi = napraviRazresivac({ dohvati, sada: s.sada });
    const odgovor = razresi("digital.enigmait.rs");
    await vi.advanceTimersByTimeAsync(1_499);
    let gotov = false;
    void odgovor.then(() => (gotov = true));
    await Promise.resolve();
    expect(gotov).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await odgovor).toBeNull();
    s.pomeri(5_000);
    expect(await razresi("digital.enigmait.rs")).toBeNull();
    expect(dohvati).toHaveBeenCalledTimes(1);
  });

  test("paralelni zahtevi za isti host dele jedan upit", async () => {
    let pusti: (v: string | null) => void = () => {};
    const dohvati = vi.fn(() => new Promise<string | null>((r) => (pusti = r)));
    const razresi = napraviRazresivac({ dohvati });
    const a = razresi("digital.enigmait.rs");
    const b = razresi("digital.enigmait.rs");
    pusti("enigma-it");
    expect(await Promise.all([a, b])).toEqual(["enigma-it", "enigma-it"]);
    expect(dohvati).toHaveBeenCalledTimes(1);
  });

  test("preko 500 unosa briše se najstariji", async () => {
    const dohvati = vi.fn(async (host: string) => host.split(".")[0]);
    const razresi = napraviRazresivac({ dohvati });
    for (let i = 0; i <= 500; i++) await razresi(`p${i}.example.com`);
    expect(dohvati).toHaveBeenCalledTimes(501);
    // Najnoviji je i dalje u kešu, najstariji (p0) je izbačen.
    await razresi("p500.example.com");
    expect(dohvati).toHaveBeenCalledTimes(501);
    await razresi("p0.example.com");
    expect(dohvati).toHaveBeenCalledTimes(502);
  });

  test("ponovo upisan host postaje najnoviji", async () => {
    const s = sat();
    const dohvati = vi.fn(async (host: string) => host.split(".")[0]);
    const razresi = napraviRazresivac({ dohvati, sada: s.sada, maks: 2 });
    await razresi("a.example.com");
    await razresi("b.example.com");
    s.pomeri(60_000); // „a“ istekao, pita se ponovo i ide na kraj
    await razresi("a.example.com");
    await razresi("c.example.com"); // izbacuje najstariji: „b“
    const pre = dohvati.mock.calls.length;
    await razresi("a.example.com");
    expect(dohvati.mock.calls.length).toBe(pre);
  });
});
