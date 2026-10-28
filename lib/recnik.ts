/**
 * ============================================================================
 * REČNIK UI POJMOVA — jedan za celu aplikaciju (ULTRA O15, plan T08 §9.1)
 * ============================================================================
 *
 * Nazivi mera su u `lib/mere.ts`; ovde je sve ostalo što ekran prikazuje, a
 * stiže iz API-ja kao sirova vrednost: vrste objava, statusi i ciljevi
 * kampanja, GA4 podešavanja, događaji konverzije, plasmani.
 *
 * Rečnik služi SAMO za prikaz. Vrednosti koje idu u API i ključevi u bazi
 * ostaju sirovi; ekran ih propušta kroz `naziv()` tek kad ih ispisuje.
 *
 * Imena platformi i proizvoda (Instagram, Performance Max, GA4, Meta Ads) se
 * ne prevode.
 */
import { INTEGRACIJA_NAZIV } from "../convex/lib/notifications";

export type Recnik = Readonly<Record<string, string>>;

/** IG, Threads i FB vrste objava (REVIZIJA „Rečnik"). */
export const VRSTA_OBJAVE = {
  TEXT_POST: "Tekst",
  TEXT: "Tekst",
  IMAGE: "Slika",
  VIDEO: "Video",
  CAROUSEL_ALBUM: "Album",
  CAROUSEL: "Album",
  ALBUM: "Album",
  POST: "Objava",
  FEED: "Objava",
  REEL: "Reel",
  REELS: "Reel",
  STORY: "Priča",
  STORIES: "Priča",
  AUDIO: "Zvuk",
  REPOST_FACADE: "Deljena objava",
} as const satisfies Recnik;

/** Facebook `statusType` (stiže malim slovima; `naziv()` poredi bez obzira na veličinu). */
export const VRSTA_FB_OBJAVE = {
  ADDED_PHOTOS: "Slika",
  ADDED_VIDEO: "Video",
  MOBILE_STATUS_UPDATE: "Status",
  SHARED_STORY: "Deljeno",
  CREATED_NOTE: "Beleška",
  PUBLISHED_STORY: "Objava",
  CREATED_EVENT: "Događaj",
  WALL_POST: "Objava",
  APP_CREATED_STORY: "Objava",
} as const satisfies Recnik;

/** Status kampanje, grupe oglasa ili oglasa (Meta i Google). */
export const STATUS_KAMPANJE = {
  ACTIVE: "Aktivna",
  PAUSED: "Pauzirana",
  ARCHIVED: "Arhivirana",
  DELETED: "Obrisana",
  IN_PROCESS: "U obradi",
  WITH_ISSUES: "Ima problem",
  CAMPAIGN_PAUSED: "Kampanja pauzirana",
  ADSET_PAUSED: "Grupa pauzirana",
  PENDING_REVIEW: "Na pregledu",
  DISAPPROVED: "Odbijena",
  PREAPPROVED: "Odobrena",
  PENDING_BILLING_INFO: "Čeka podatke o plaćanju",
  ENABLED: "Aktivna",
  REMOVED: "Uklonjena",
} as const satisfies Recnik;

/** Jedna mapa umesto tri (campaigns-table, campaign-detail, new-campaign-wizard). */
export const CILJ_KAMPANJE = {
  OUTCOME_SALES: "Prodaja",
  SALES: "Prodaja",
  OUTCOME_TRAFFIC: "Saobraćaj",
  TRAFFIC: "Saobraćaj",
  OUTCOME_ENGAGEMENT: "Angažovanje",
  ENGAGEMENT: "Angažovanje",
  OUTCOME_LEADS: "Upiti",
  LEADS: "Upiti",
  OUTCOME_AWARENESS: "Prepoznatljivost",
  AWARENESS: "Prepoznatljivost",
  OUTCOME_APP_PROMOTION: "Aplikacija",
  APP_PROMOTION: "Aplikacija",
  SEARCH: "Pretraga",
  PERFORMANCE_MAX: "Performance Max",
  DISPLAY: "Prikazna mreža",
  VIDEO: "Video",
  SHOPPING: "Kupovina",
  DEMAND_GEN: "Potražnja",
  LOCAL: "Lokalno",
  SMART: "Pametna kampanja",
  // Google tipovi kanala koje sinhronizacija pušta (`GOOGLE_ADS_ALLOWED_CHANNEL_TYPES`).
  DISCOVERY: "Potražnja",
  HOTEL: "Hoteli",
  MULTI_CHANNEL: "Više kanala",
  LOCAL_SERVICES: "Lokalne usluge",
  TRAVEL: "Putovanja",
  // Stari Meta ciljevi (kampanje napravljene pre ciljeva „OUTCOME_“).
  LINK_CLICKS: "Saobraćaj",
  CONVERSIONS: "Prodaja",
  PRODUCT_CATALOG_SALES: "Prodaja",
  POST_ENGAGEMENT: "Angažovanje",
  PAGE_LIKES: "Angažovanje",
  EVENT_RESPONSES: "Angažovanje",
  MESSAGES: "Poruke",
  LEAD_GENERATION: "Upiti",
  REACH: "Prepoznatljivost",
  BRAND_AWARENESS: "Prepoznatljivost",
  VIDEO_VIEWS: "Pregledi videa",
  APP_INSTALLS: "Aplikacija",
  STORE_VISITS: "Posete prodavnici",
} as const satisfies Recnik;

/** Nivo u hijerarhiji oglasa (dnevnik radnji, pravila). */
export const NIVO_OGLASA = {
  campaign: "Kampanja",
  adset: "Grupa oglasa",
  ad_set: "Grupa oglasa",
  ad_group: "Grupa oglasa",
  ad: "Oglas",
  account: "Nalog",
} as const satisfies Recnik;

/** GA4 Admin API vrednosti u Podešavanjima → GA4. */
export const GA4 = {
  cuvanjePodataka: {
    TWO_MONTHS: "2 meseca",
    FOURTEEN_MONTHS: "14 meseci",
    TWENTY_SIX_MONTHS: "26 meseci",
    THIRTY_EIGHT_MONTHS: "38 meseci",
    FIFTY_MONTHS: "50 meseci",
  },
  nacinBrojanja: {
    ONCE_PER_EVENT: "Jednom po događaju",
    ONCE_PER_SESSION: "Jednom po sesiji",
  },
  opseg: { EVENT: "Događaj", USER: "Korisnik", ITEM: "Stavka" },
  nivoUsluge: {
    STANDARD: "Standardni",
    GOOGLE_ANALYTICS_STANDARD: "Standardni",
    GOOGLE_ANALYTICS_360: "Google Analytics 360",
    "360": "Google Analytics 360",
  },
  vrstaToka: {
    WEB_DATA_STREAM: "Veb sajt",
    ANDROID_APP_DATA_STREAM: "Android aplikacija",
    IOS_APP_DATA_STREAM: "iOS aplikacija",
  },
  delatnost: {
    AUTOMOTIVE: "Automobili",
    BUSINESS_AND_INDUSTRIAL_MARKETS: "Poslovna i industrijska tržišta",
    FINANCE: "Finansije",
    HEALTHCARE: "Zdravstvo",
    TECHNOLOGY: "Tehnologija",
    TRAVEL: "Putovanja",
    OTHER: "Ostalo",
    ARTS_AND_ENTERTAINMENT: "Umetnost i zabava",
    BEAUTY_AND_FITNESS: "Lepota i fitnes",
    BOOKS_AND_LITERATURE: "Knjige i književnost",
    FOOD_AND_DRINK: "Hrana i piće",
    GAMES: "Igre",
    HOBBIES_AND_LEISURE: "Hobiji i slobodno vreme",
    HOME_AND_GARDEN: "Kuća i bašta",
    INTERNET_AND_TELECOM: "Internet i telekomunikacije",
    LAW_AND_GOVERNMENT: "Pravo i uprava",
    NEWS: "Vesti",
    ONLINE_COMMUNITIES: "Onlajn zajednice",
    PEOPLE_AND_SOCIETY: "Ljudi i društvo",
    PETS_AND_ANIMALS: "Kućni ljubimci i životinje",
    REAL_ESTATE: "Nekretnine",
    REFERENCE: "Priručnici",
    SCIENCE: "Nauka",
    SPORTS: "Sport",
    JOBS_AND_EDUCATION: "Poslovi i obrazovanje",
    SHOPPING: "Kupovina",
  },
} as const satisfies Record<string, Recnik>;

/** Standardni Meta događaji (CAPI, prilagođene konverzije). */
export const DOGADJAJ_KONVERZIJE = {
  Lead: "Upit",
  Purchase: "Kupovina",
  CompleteRegistration: "Registracija",
  Contact: "Kontakt",
  Schedule: "Zakazivanje",
  SubmitApplication: "Prijava",
  ViewContent: "Pregled sadržaja",
  AddToCart: "Dodavanje u korpu",
  InitiateCheckout: "Početak plaćanja",
  AddPaymentInfo: "Podaci o plaćanju",
  Search: "Pretraga",
  Subscribe: "Pretplata",
  StartTrial: "Početak probe",
  FindLocation: "Traženje lokacije",
  Donate: "Donacija",
  CustomizeProduct: "Prilagođen proizvod",
  AddToWishlist: "Lista želja",
  PageView: "Pregled stranice",
  OTHER: "Ostalo",
  LEAD: "Upit",
  PURCHASE: "Kupovina",
  COMPLETE_REGISTRATION: "Registracija",
  CONTACT: "Kontakt",
  SCHEDULE: "Zakazivanje",
} as const satisfies Recnik;

/** Poziv na radnju u oglasu (Meta `call_to_action_type`). */
export const POZIV_NA_RADNJU = {
  LEARN_MORE: "Saznaj više",
  SHOP_NOW: "Kupi sada",
  SIGN_UP: "Prijavi se",
  CONTACT_US: "Kontaktiraj nas",
  BOOK_TRAVEL: "Rezerviši",
  BOOK_NOW: "Rezerviši",
  DOWNLOAD: "Preuzmi",
  GET_OFFER: "Preuzmi ponudu",
  GET_QUOTE: "Zatraži ponudu",
  SUBSCRIBE: "Pretplati se",
  APPLY_NOW: "Prijavi se",
  SEND_MESSAGE: "Pošalji poruku",
  MESSAGE_PAGE: "Pošalji poruku",
  WHATSAPP_MESSAGE: "Piši na WhatsApp",
  CALL_NOW: "Pozovi",
  ORDER_NOW: "Naruči",
  WATCH_MORE: "Pogledaj još",
  NO_BUTTON: "Bez dugmeta",
  BUY_NOW: "Kupi sada",
  BUY_TICKETS: "Kupi karte",
  GET_DIRECTIONS: "Uputstvo za dolazak",
  INSTALL_MOBILE_APP: "Instaliraj aplikaciju",
  USE_APP: "Otvori aplikaciju",
  OPEN_LINK: "Otvori link",
  LISTEN_NOW: "Slušaj",
  SEE_MENU: "Pogledaj meni",
  DONATE_NOW: "Doniraj",
  REQUEST_TIME: "Zakaži termin",
  GET_SHOWTIMES: "Pogledaj termine",
  INQUIRE_NOW: "Pošalji upit",
  SAVE: "Sačuvaj",
  PLAY_GAME: "Igraj",
} as const satisfies Recnik;

/** Plasman oglasa (Meta `publisher_platform` × `platform_position`). */
export const PLASMAN = {
  feed: "Glavni tok",
  instagram_reels: "Reels",
  facebook_reels: "Reels",
  reels: "Reels",
  story: "Priče",
  instagram_stories: "Priče",
  facebook_stories: "Priče",
  explore: "Istraži",
  instagram_explore: "Istraži",
  video_feeds: "Video tok",
  marketplace: "Marketplace",
  right_hand_column: "Desna kolona",
  search: "Pretraga",
  instream_video: "Video u toku",
  an_classic: "Audience Network",
} as const satisfies Recnik;

/** Izvor iz kog je signal o firmi opažen (Leadovi). */
export const IZVOR_SIGNALA = {
  landing_tracker: "Praćenje sajta",
  site_audit: "Ocena sajta",
  google_maps: "Google mape",
  google_places: "Google mape",
  companywall: "CompanyWall",
  apr: "APR",
  instagram: "Instagram",
  facebook: "Facebook",
  manual: "Ručno",
  rucno: "Ručno",
  import: "Uvoz",
  uvoz: "Uvoz",
  // Izvori koje server stvarno upisuje (`leadImportStore`, `leadInboundStore`,
  // ocena firme iz uvoza); bez njih bi istorija pisala „Drugi izvor".
  "generate-leads": "Skill /generate-leads",
  inbound_instagram: "Poruka sa Instagrama",
  inbound_facebook: "Poruka sa Facebook-a",
  inbound_threads: "Poruka sa Threads-a",
  inbound_website: "Upit sa sajta",
  google: "Google ocene",
  sredime: "SrediMe",
  yandex: "Yandex",
  "011info": "Imenik 011info",
} as const satisfies Recnik;

/** UI pojmovi; komentar je zatečen izraz koji je zamenjen. */
export const POJAM = {
  grupaOglasa: "Grupa oglasa", // Ad set
  slicnaPublika: "Slična publika", // Lookalike
  pauzaZaIstuOsobu: "Pauza za istu osobu", // Cooldown
  najviseUNiti: "Najviše u jednoj niti", // Max po niti
  proba: "Proba", // draft (automatizacije)
  dnevnik: "Dnevnik", // Log, Log izvršenja
  pocetnaPitanja: "Početna pitanja", // Ledolomci, Ice breakers
  rokZaOdgovor: "Rok za odgovor", // Prozor (ističe)
  slicica: "Sličica", // Thumbnail
  poruke: "Poruke", // Inbox
  samoPregled: "Samo pregled", // read-only
  zakaci: "Zakači", // Pinuj
  zakaceno: "Zakačeno", // Pinovano
  verzija: "Verzija", // hook
  slanjeKonverzija: "Slanje konverzija Meti", // CAPI
} as const satisfies Recnik;

/**
 * Nazivi kanala: jedan izvor, deli ga i server (zvono, mejl). Imena
 * proizvoda („Meta Ads", „Google Ads") se ne prevode.
 */
export const NAZIV_KANALA: Recnik = INTEGRACIJA_NAZIV;

/**
 * Sirova vrednost kroz mapu. Poredi tačno, pa bez obzira na veličinu slova.
 * Nepoznata vrednost NIKAD ne izlazi sirova: dobija rezervu („Ostalo").
 */
export function naziv(
  mapa: Recnik,
  vrednost: string | null | undefined,
  rezerva = "Ostalo",
): string {
  if (!vrednost) return rezerva;
  // Samo sopstveni ključevi: „constructor" ili „toString" iz podatka (npr.
  // ime događaja koje korisnik upiše) ne sme da vrati funkciju iz prototipa.
  if (Object.hasOwn(mapa, vrednost)) return mapa[vrednost];
  const v = vrednost.toUpperCase();
  for (const k of Object.keys(mapa)) {
    if (k.toUpperCase() === v) return mapa[k];
  }
  return rezerva;
}

/** Da li je platforma Apple (Mac, iPhone, iPad): tu je modifikator ⌘. */
export function jeApple(platforma: string | undefined): boolean {
  return !!platforma && /mac|iphone|ipad|ipod/i.test(platforma);
}

/** „Ctrl K" na Windowsu i Linuxu, „⌘K" na Macu („⌘ Enter" za taster sa imenom). */
export function oznakaPrecice(platforma: string | undefined, taster: string): string {
  if (!jeApple(platforma)) return `Ctrl ${taster}`;
  return taster.length === 1 ? `⌘${taster}` : `⌘ ${taster}`;
}
