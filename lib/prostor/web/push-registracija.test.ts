// SPAJANJE S17: servis radnik se registruje samo iz klika na prekidač, a bez
// javnog VAPID ključa prekidača nema (prihvatanje S17, plan S07 §10 S17).
import { describe, expect, test } from "vitest";

import { fajloviKoda, procitaj, rel } from "../../izvorni-kod.pomoc";

const KUKA = "components/app/prostor/inbox/use-push-notifications.ts";
const PANEL = "components/app/prostor/inbox/notifications-panel.tsx";

describe("web push: registracija i prekidač", () => {
  const fajlovi = fajloviKoda(["app", "components", "lib"]);
  const tekstOf = (ime: string) => {
    const put = fajlovi.find((f) => rel(f) === ime);
    expect(put, ime).toBeDefined();
    return procitaj(put!);
  };

  test("serviceWorker.register postoji samo u kuki za push, jednom", () => {
    const sa = fajlovi
      .map((f) => ({ ime: rel(f), broj: (procitaj(f).match(/serviceWorker\.register\(/g) ?? []).length }))
      .filter((f) => f.broj > 0);
    expect(sa).toEqual([{ ime: KUKA, broj: 1 }]);
  });

  test("registracija je unutar `enable` (klik), a `enable` bez ključa ne radi ništa", () => {
    const kod = tekstOf(KUKA);
    const enable = kod.indexOf("const enable = useCallback(");
    const disable = kod.indexOf("const disable = useCallback(");
    const register = kod.indexOf("serviceWorker.register(");
    expect(enable).toBeGreaterThan(-1);
    expect(register).toBeGreaterThan(enable);
    expect(register).toBeLessThan(disable);
    // Prva naredba u `enable` odbija rad bez podrške ili bez ključa.
    const telo = kod.slice(enable, register);
    expect(telo).toMatch(/if \(!supported \|\| !PUSH_PODESEN\) return false;/);
    // Ključ dolazi samo iz javne env promenljive.
    expect(kod).toMatch(/process\.env\.NEXT_PUBLIC_VAPID_PUBLIC_KEY/);
  });

  test("bez ključa se prekidač ne crta i kuka se ne montira", () => {
    const kod = tekstOf(PANEL);
    expect(kod).toMatch(/export function PushToggle\(\) \{\s*if \(!PUSH_PODESEN\) return null;\s*return <PushPrekidac \/>;/);
    // Kuku zove samo `PushPrekidac`, koji postoji tek uz ključ.
    const pozivi = fajlovi.flatMap((f) =>
      // Poziv, ne deklaracija `export function usePushNotifications()`.
      (procitaj(f).match(/(?<!function )usePushNotifications\(\)/g) ?? []).map(() => rel(f)),
    );
    expect(pozivi).toEqual([PANEL]);
    const prekidac = kod.indexOf("function PushPrekidac()");
    expect(kod.indexOf("= usePushNotifications()")).toBeGreaterThan(prekidac);
  });
});
