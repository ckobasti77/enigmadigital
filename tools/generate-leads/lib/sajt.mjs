/**
 * ============================================================================
 * STATUS SAJTA (plan §3.8) — čista klasifikacija + jedan zahtev
 * ============================================================================
 *
 * Dve odvojene stvari, namerno:
 *
 *   `klasifikuj(odgovor)`  — čista funkcija, bez mreže, testira se nad lažnim
 *                            odgovorima (`self-test`, 6 slučajeva).
 *   `proveriSajt(url, …)`  — jedan zahtev, timeout 8 s, ≤ 3 redirekta, SSRF
 *                            zaštita; svodi stvarnost na oblik koji
 *                            `klasifikuj` razume.
 *
 * Zašto odvojeno: „sajt ne radi" je tvrdnja koja u aplikaciji postaje signal za
 * prodaju (`sajt_ne_radi`) i pravilo ocenjivanja. Takva tvrdnja mora da se
 * proverava bez mreže, inače je test ili spor ili lažan.
 *
 * NIKAD RETRY. Jedan pokušaj po sajtu (§3.8). Dva pokušaja bi od zauzetog
 * servera napravila „radi", a od našeg lošeg linka „ne radi".
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Timeout iz §3.8. Jedan broj, da se u poruci i u kodu ne raziđu. */
export const TIMEOUT_MS = 8000;

/** Najviše redirekcija koje pratimo (§3.8). */
export const MAX_REDIREKCIJA = 3;

/**
 * Potpisi parking / registrar stranica — RUČNO ODRŽAVANA lista (§3.8).
 *
 * Traži se u prvih ~64 KB tela, malim slovima. Lista je namerno konzervativna:
 * lažno „parkiran" nad živim sajtom bi firmi zalepio signal za prodaju koji ne
 * važi, a to čovek u pregledu uvoza ne može da razlikuje od istine.
 */
export const PARKING_POTPISI = [
  "domain is for sale",
  "this domain is for sale",
  "buy this domain",
  "domain for sale",
  "parked domain",
  "this domain is parked",
  "domain parking",
  "parkingcrew",
  "sedoparking",
  "afternic",
  "hugedomains",
  "godaddy.com/domainsearch",
  "domena je slobodna",
  "ovaj domen je registrovan",
  "domen je parkiran",
  "domen je u prodaji",
  "ovaj domen je na prodaju",
  "stranica je u pripremi",
  "website coming soon",
  "site under construction",
  // Namerno NEMA golog „coming soon" ni „loopia": prvo stoji na živim sajtovima
  // („nova kolekcija — coming soon"), drugo u podnožju sajtova hostovanih kod
  // tog provajdera. Lažno „parkiran" nad živim sajtom čovek u pregledu uvoza ne
  // može da razlikuje od istine.
  "default web site page",
  "apache2 debian default page",
  "welcome to nginx",
  "iis windows server",
];

/** Domeni koji znače „sajt zapravo vodi na društvenu mrežu" (§3.8). */
export const DRUSTVENI_DOMENI = [
  "instagram.com",
  "facebook.com",
  "fb.com",
  "fb.me",
  "linktr.ee",
  "linktree.com",
  "tiktok.com",
  "threads.net",
  "threads.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "wa.me",
  "beacons.ai",
  "taplink.cc",
  "bio.link",
];

function hostOd(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function jeDrustveni(url) {
  const host = hostOd(url);
  if (!host) return false;
  return DRUSTVENI_DOMENI.some((d) => host === d || host.endsWith(`.${d}`));
}

/**
 * Klasifikacija jednog ishoda provere. ČISTA funkcija — bez mreže, bez vremena.
 *
 * @param {object} odgovor
 * @param {"dns"|"timeout"|"mreza"|"tls"|"veza"|"previse_redirekcija"|"ssrf"|"neispravan_url"} [odgovor.greska]
 * @param {number} [odgovor.status]      HTTP status konačnog odgovora
 * @param {string} [odgovor.finalUrl]    URL na kome je lanac stao
 * @param {string} [odgovor.contentType] zaglavlje `content-type`
 * @param {string} [odgovor.telo]        početak tela (do 64 KB), za potpise
 * @returns {{sajtStatus: string, sajtHttps?: boolean, sajtNapomena: string}}
 */
export function klasifikuj(odgovor) {
  const finalUrl = odgovor?.finalUrl ?? "";
  const https = finalUrl ? finalUrl.toLowerCase().startsWith("https://") : undefined;

  // 1. Greške pre odgovora. „ne_radi" i „nepoznato" se ovde razdvajaju: prvo je
  //    tvrdnja o sajtu, drugo je priznanje da provera nije uspela iz razloga
  //    koji sa sajtom nema veze (§3.8).
  if (odgovor?.greska) {
    switch (odgovor.greska) {
      case "dns":
        return { sajtStatus: "ne_radi", sajtHttps: https, sajtNapomena: "domen se ne razrešava (DNS)" };
      case "timeout":
        return {
          sajtStatus: "ne_radi",
          sajtHttps: https,
          sajtNapomena: `nema odgovora posle ${Math.round(TIMEOUT_MS / 1000)} s`,
        };
      case "veza":
        return { sajtStatus: "ne_radi", sajtHttps: https, sajtNapomena: "server odbija vezu" };
      case "tls":
        return { sajtStatus: "ne_radi", sajtHttps: https, sajtNapomena: "greška TLS sertifikata" };
      case "previse_redirekcija":
        return {
          sajtStatus: "ne_radi",
          sajtHttps: https,
          sajtNapomena: `više od ${MAX_REDIREKCIJA} preusmerenja`,
        };
      case "ssrf":
        return {
          sajtStatus: "nepoznato",
          sajtHttps: https,
          sajtNapomena: "provera odbijena: adresa nije javna",
        };
      case "neispravan_url":
        return { sajtStatus: "nepoznato", sajtHttps: https, sajtNapomena: "adresa nije ispravan URL" };
      case "mreza":
      default:
        return {
          sajtStatus: "nepoznato",
          sajtHttps: https,
          sajtNapomena: "provera nije uspela (mreža sa ove mašine)",
        };
    }
  }

  const status = Number(odgovor?.status ?? 0);

  // 2. Konačno odredište je društvena mreža — proverava se PRE statusa, jer je
  //    to podatak o firmi („nema sajt, ima Instagram"), a ne o serveru.
  if (finalUrl && jeDrustveni(finalUrl)) {
    return {
      sajtStatus: "preusmerava_na_drustvene",
      sajtHttps: https,
      sajtNapomena: `${status || "preusmerenje"} → ${hostOd(finalUrl)}`,
    };
  }

  if (status >= 500) {
    return { sajtStatus: "ne_radi", sajtHttps: https, sajtNapomena: `server vraća ${status}` };
  }
  if (status === 404 || status === 410) {
    return { sajtStatus: "ne_radi", sajtHttps: https, sajtNapomena: `koren sajta vraća ${status}` };
  }
  // 401/403/429 nisu „sajt ne radi" nego „nas ne puštaju" — blokada izvora se po
  // §3.5 nikad ne prijavljuje kao odsustvo.
  if (status === 401 || status === 403 || status === 429) {
    return {
      sajtStatus: "nepoznato",
      sajtHttps: https,
      sajtNapomena: `${status} — sajt blokira automatsku proveru`,
    };
  }
  if (status < 200 || status >= 400) {
    return { sajtStatus: "nepoznato", sajtHttps: https, sajtNapomena: `neočekivan status ${status}` };
  }

  const telo = String(odgovor?.telo ?? "").toLowerCase();
  const potpis = PARKING_POTPISI.find((p) => telo.includes(p));
  if (potpis) {
    return {
      sajtStatus: "parkiran",
      sajtHttps: https,
      sajtNapomena: `stranica nosi potpis parkiranog domena („${potpis}")`,
    };
  }

  const tip = String(odgovor?.contentType ?? "").toLowerCase();
  if (tip && !tip.includes("html")) {
    return {
      sajtStatus: "nepoznato",
      sajtHttps: https,
      sajtNapomena: `${status}, ali sadržaj nije HTML (${tip.split(";")[0]})`,
    };
  }

  return { sajtStatus: "radi", sajtHttps: https, sajtNapomena: `${status}, stranica se učitava` };
}

/**
 * Da li adresa pripada privatnom opsegu (SSRF zaštita, §3.8).
 *
 * Sajt firme koji se preusmerava na `127.0.0.1` ili `10.x` nije sajt firme —
 * to je ili greška u konfiguraciji ili pokušaj da nas natera da zovemo nešto
 * u našoj mreži. Isti test važi za svaki skok u lancu, ne samo za prvi.
 */
export function privatnaAdresa(ip) {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a >= 224) return true; // multicast + rezervisano
    return false;
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === "::" || x === "::1") return true;
    if (x.startsWith("fe80") || x.startsWith("fc") || x.startsWith("fd")) return true;
    // IPv4 preslikan u IPv6 (::ffff:10.0.0.1)
    const m = x.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return privatnaAdresa(m[1]);
    return false;
  }
  return false;
}

async function javnaAdresa(host) {
  if (!host) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  if (isIP(host)) return !privatnaAdresa(host);

  const adrese = await lookup(host, { all: true });
  if (adrese.length === 0) return false;
  return adrese.every((a) => !privatnaAdresa(a.address));
}

function mapirajGresku(err) {
  const kod = String(err?.cause?.code ?? err?.code ?? "");
  const naziv = String(err?.name ?? "");
  if (naziv === "AbortError" || naziv === "TimeoutError" || kod === "UND_ERR_HEADERS_TIMEOUT") {
    return "timeout";
  }
  if (kod === "ENOTFOUND") return "dns";
  if (kod === "ECONNREFUSED" || kod === "ECONNRESET" || kod === "EHOSTUNREACH") return "veza";
  if (kod.startsWith("ERR_TLS") || kod.startsWith("CERT_") || kod === "DEPTH_ZERO_SELF_SIGNED_CERT") {
    return "tls";
  }
  if (kod === "EAI_AGAIN" || kod === "ENETUNREACH" || kod === "ENETDOWN") return "mreza";
  return "mreza";
}

/**
 * Jedan pokušaj provere sajta. Vraća ono što `klasifikuj` vraća + `sajtProverenAt`.
 *
 * Redirekcije se prate ručno (`redirect: "manual"`) zato što svaki skok mora da
 * prođe SSRF proveru — `fetch` sa automatskim praćenjem bi nas odveo na
 * privatnu adresu bez pitanja.
 */
export async function proveriSajt(url, { userAgent, sada = Date.now() } = {}) {
  let tekuci;
  try {
    tekuci = new URL(url);
    if (tekuci.protocol !== "http:" && tekuci.protocol !== "https:") {
      return { ...klasifikuj({ greska: "neispravan_url" }), sajtProverenAt: sada };
    }
  } catch {
    return { ...klasifikuj({ greska: "neispravan_url" }), sajtProverenAt: sada };
  }

  const kontrola = new AbortController();
  const tajmer = setTimeout(() => kontrola.abort(), TIMEOUT_MS);

  try {
    for (let skok = 0; skok <= MAX_REDIREKCIJA; skok += 1) {
      // Razrešavanje imena je prvi mrežni korak i prvi koji ume da padne.
      // Domen koji se ne razrešava je NAJČEŠĆI stvarni ishod (mrtav sajt) i
      // mora da postane `ne_radi`, a ne izuzetak koji obori celu komandu.
      let javna;
      try {
        javna = await javnaAdresa(tekuci.hostname.toLowerCase());
      } catch (err) {
        return {
          ...klasifikuj({ greska: mapirajGresku(err), finalUrl: tekuci.href }),
          sajtProverenAt: sada,
        };
      }

      if (!javna) {
        return { ...klasifikuj({ greska: "ssrf", finalUrl: tekuci.href }), sajtProverenAt: sada };
      }

      let odgovor;
      try {
        odgovor = await fetch(tekuci.href, {
          method: "GET",
          redirect: "manual",
          signal: kontrola.signal,
          headers: { "User-Agent": userAgent, Accept: "text/html,*/*;q=0.8" },
        });
      } catch (err) {
        return {
          ...klasifikuj({ greska: mapirajGresku(err), finalUrl: tekuci.href }),
          sajtProverenAt: sada,
        };
      }

      const lokacija = odgovor.headers.get("location");
      if (odgovor.status >= 300 && odgovor.status < 400 && lokacija) {
        const sledeci = new URL(lokacija, tekuci);
        if (skok === MAX_REDIREKCIJA) {
          return {
            ...klasifikuj({ greska: "previse_redirekcija", finalUrl: sledeci.href }),
            sajtProverenAt: sada,
          };
        }
        // Društvena mreža je odredište, ne greška — lanac tu staje sa odgovorom.
        if (jeDrustveni(sledeci.href)) {
          return {
            ...klasifikuj({ status: odgovor.status, finalUrl: sledeci.href }),
            sajtProverenAt: sada,
          };
        }
        tekuci = sledeci;
        continue;
      }

      // Čita se najviše 64 KB: potpis parkirane stranice je uvek na vrhu, a
      // ceo sajt u memoriji nije podatak nego trošak.
      let telo = "";
      try {
        const bafer = await odgovor.arrayBuffer();
        telo = new TextDecoder("utf-8", { fatal: false }).decode(bafer.slice(0, 65536));
      } catch {
        telo = "";
      }

      return {
        ...klasifikuj({
          status: odgovor.status,
          finalUrl: tekuci.href,
          contentType: odgovor.headers.get("content-type") ?? "",
          telo,
        }),
        sajtProverenAt: sada,
      };
    }

    return { ...klasifikuj({ greska: "previse_redirekcija", finalUrl: tekuci.href }), sajtProverenAt: sada };
  } finally {
    clearTimeout(tajmer);
  }
}
