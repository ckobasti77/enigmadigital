/**
 * ============================================================================
 * PROVERA FILTERA ZA BOTOVE I SLUGA ZA LANDING STRANICE (LM7)
 * ============================================================================
 *
 * Pokretanje:
 *   npx tsx scripts/lead-landing-check.ts
 *
 * Zašto postoji: landing signal je najjači signal u sistemu. Ako generator
 * pregleda linka prođe kao čovek, „klijent je otvorio stranicu" je laž od
 * prvog dana. Ako čovek bude odbačen kao bot, propušta se poziv.
 *
 * Filter se poklapa po PODNIZU cele vrednosti `user-agent`, pa se ovde
 * proverava upravo to: da gola imena aplikacija ne pogađaju ugrađene
 * pregledače pravih ljudi.
 * ============================================================================
 */

import process from "node:process";
import { isBotUserAgent, generateLandingSlug } from "../convex/lib/orLink";

let pao = 0;
function proveri(naziv: string, uslov: boolean, detalj: string): void {
  if (uslov) console.log(`  OK   ${naziv}`);
  else {
    pao++;
    console.log(`  PAO  ${naziv} -> ${detalj}`);
  }
}

const BOTOVI: Array<[string, string]> = [
  ["Facebook unfurler", "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"],
  ["Facebot", "Facebot"],
  ["Meta crawler", "meta-externalagent/1.1"],
  ["WhatsApp fetcher", "WhatsApp/2.23.20.0 A"],
  ["Viber fetcher", "Mozilla/5.0 (compatible; Viber/1.0)"],
  ["TelegramBot", "TelegramBot (like TwitterBot)"],
  ["Slackbot", "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)"],
  ["Discordbot", "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)"],
  ["LinkedInBot", "LinkedInBot/1.0 (compatible; Mozilla/5.0)"],
  ["Twitterbot", "Twitterbot/1.0"],
  ["Skype pregled", "SkypeUriPreview Preview/0.5"],
  ["curl", "curl/8.4.0"],
  ["Googlebot", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"],
];

const LJUDI: Array<[string, string]> = [
  ["Chrome na Androidu", "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"],
  ["Safari na iPhone-u", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1"],
  ["Instagram ugrađeni pregledač", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 302.1.0.36.111"],
  ["Facebook ugrađeni pregledač (iOS)", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/443.0.0.29.117]"],
  ["Facebook ugrađeni pregledač (Android)", "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/119.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/443.0.0.29.117;]"],
  ["LinkedIn aplikacija", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 LinkedInApp/9.29.1"],
  ["Firefox na Windowsu", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0"],
];

async function main(): Promise<void> {
  console.log("=".repeat(78));
  console.log("FILTER ZA BOTOVE — generatori pregleda linka MORAJU biti odbačeni");
  console.log("=".repeat(78));
  for (const [naziv, ua] of BOTOVI) {
    proveri(naziv, isBotUserAgent(ua), `nije prepoznat kao bot: ${ua.slice(0, 60)}`);
  }

  console.log("\n" + "=".repeat(78));
  console.log("PRAVI LJUDI — ne smeju biti odbačeni");
  console.log("=".repeat(78));
  for (const [naziv, ua] of LJUDI) {
    proveri(naziv, !isBotUserAgent(ua), `pogrešno prepoznat kao bot: ${ua.slice(0, 60)}`);
  }

  console.log("\n" + "=".repeat(78));
  console.log("SLUG ZA LANDING STRANICU");
  console.log("=".repeat(78));
  const slugovi = new Set<string>();
  for (let i = 0; i < 5000; i++) slugovi.add(generateLandingSlug());
  const jedan = generateLandingSlug();
  proveri("dužina je najmanje 10", jedan.length >= 10, String(jedan.length));
  proveri("5000 slugova bez ijednog ponavljanja", slugovi.size === 5000, String(slugovi.size));
  proveri("ne sadrži naziv firme niti čitljive reči", /^[A-Za-z0-9]+$/.test(jedan), jedan);

  console.log("\n" + "=".repeat(78));
  if (pao > 0) {
    console.log(`NEUSPELO PROVERA: ${pao}`);
    process.exitCode = 1;
  } else {
    console.log("SVE PROVERE PROŠLE.");
  }
  console.log("=".repeat(78));
}

void main();
