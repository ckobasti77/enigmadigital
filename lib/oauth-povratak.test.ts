/**
 * Jedna registrovana povratna adresa za sve projekte (`convex/lib/oauthPovratak.ts`,
 * plan C10 §5): `OAUTH_CALLBACK_ORIGIN` se čita i proverava na jednom mestu, a
 * `redirect_uri` svakog od pet provajdera gradi server, nikad klijent.
 */
import { ConvexError } from "convex/values";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  OAUTH_NIJE_PODESEN,
  SEGMENT,
  oauthCallbackOrigin,
  redirectUriZa,
  type OAuthProvider,
} from "../convex/lib/oauthPovratak";

afterEach(() => {
  vi.unstubAllEnvs();
});

function postavi(vrednost: string | undefined) {
  vi.stubEnv("OAUTH_CALLBACK_ORIGIN", vrednost);
}

describe("oauthCallbackOrigin", () => {
  test("bez env-a ili sa praznim env-om nije podešen", () => {
    postavi(undefined);
    const nema = oauthCallbackOrigin();
    expect(nema.ok).toBe(false);
    if (!nema.ok) expect(nema.poruka).toBe(OAUTH_NIJE_PODESEN.message);

    postavi("");
    expect(oauthCallbackOrigin().ok).toBe(false);
    postavi("   ");
    expect(oauthCallbackOrigin().ok).toBe(false);
  });

  test("https origin prolazi, sa host-om i origin-om", () => {
    postavi("https://panel.example");
    expect(oauthCallbackOrigin()).toEqual({
      ok: true,
      origin: "https://panel.example",
      host: "panel.example",
    });
  });

  test("završna kosa crta, razmaci i velika slova se normalizuju", () => {
    postavi("https://panel.example/");
    expect(oauthCallbackOrigin()).toMatchObject({ ok: true, origin: "https://panel.example" });

    postavi("  https://Panel.Example  ");
    expect(oauthCallbackOrigin()).toMatchObject({
      ok: true,
      origin: "https://panel.example",
      host: "panel.example",
    });
  });

  test("port ostaje u origin-u, a host je bez porta", () => {
    postavi("https://panel.example:8443");
    expect(oauthCallbackOrigin()).toEqual({
      ok: true,
      origin: "https://panel.example:8443",
      host: "panel.example",
    });
  });

  test("odbija putanju, upit, heš, korisnika i lozinku", () => {
    for (const neispravno of [
      "https://panel.example/x",
      "https://panel.example/x/",
      "https://panel.example?a=1",
      "https://panel.example/?a=1",
      "https://panel.example#heš",
      "https://panel.example/#heš",
      "https://korisnik@panel.example",
      "https://korisnik:lozinka@panel.example",
    ]) {
      postavi(neispravno);
      expect(oauthCallbackOrigin().ok, neispravno).toBe(false);
    }
  });

  test("odbija http za javni host i sve što nije http(s) adresa", () => {
    for (const neispravno of [
      "http://panel.example",
      "http://panel.example:3000",
      "ftp://panel.example",
      "javascript:alert(1)",
      "panel.example",
      "nije adresa",
    ]) {
      postavi(neispravno);
      expect(oauthCallbackOrigin().ok, neispravno).toBe(false);
    }
  });

  test("http je dozvoljen samo za localhost i 127.0.0.1", () => {
    postavi("http://localhost:3000");
    expect(oauthCallbackOrigin()).toEqual({
      ok: true,
      origin: "http://localhost:3000",
      host: "localhost",
    });

    postavi("http://127.0.0.1:3105");
    expect(oauthCallbackOrigin()).toEqual({
      ok: true,
      origin: "http://127.0.0.1:3105",
      host: "127.0.0.1",
    });
  });

  test("nikad ne baca, ni za neispravnu vrednost", () => {
    postavi("http://[::1");
    expect(() => oauthCallbackOrigin()).not.toThrow();
    expect(oauthCallbackOrigin().ok).toBe(false);
  });
});

describe("redirectUriZa", () => {
  const OCEKIVANO: Record<OAuthProvider, string> = {
    meta_ig: "instagram",
    meta_fb: "facebook",
    threads: "threads",
    youtube: "youtube",
    google_business: "google-business",
  };

  test("gradi <origin>/api/auth/callback/<segment> za svih pet provajdera", () => {
    postavi("https://panel.example");
    for (const [provider, segment] of Object.entries(OCEKIVANO) as [OAuthProvider, string][]) {
      expect(SEGMENT[provider]).toBe(segment);
      expect(redirectUriZa(provider)).toBe(`https://panel.example/api/auth/callback/${segment}`);
    }
  });

  test("završna kosa crta u env-u ne udvostručuje kose crte", () => {
    postavi("https://panel.example/");
    expect(redirectUriZa("youtube")).toBe("https://panel.example/api/auth/callback/youtube");
  });

  test("lokalni razvoj dobija http adresu sa portom", () => {
    postavi("http://localhost:3105");
    expect(redirectUriZa("meta_ig")).toBe("http://localhost:3105/api/auth/callback/instagram");
  });

  test("bez env-a baca ConvexError sa kodom oauth_nije_podesen", () => {
    postavi(undefined);
    for (const provider of Object.keys(OCEKIVANO) as OAuthProvider[]) {
      let greska: unknown = null;
      try {
        redirectUriZa(provider);
      } catch (e) {
        greska = e;
      }
      expect(greska, provider).toBeInstanceOf(ConvexError);
      expect((greska as { data?: { code?: string } }).data?.code).toBe("oauth_nije_podesen");
    }
  });

  test("neispravan env (putanja, http za javni host) baca isti kod", () => {
    for (const neispravno of ["https://panel.example/x", "http://panel.example"]) {
      postavi(neispravno);
      let greska: unknown = null;
      try {
        redirectUriZa("threads");
      } catch (e) {
        greska = e;
      }
      expect((greska as { data?: { code?: string } } | null)?.data?.code, neispravno).toBe(
        "oauth_nije_podesen",
      );
    }
  });
});
