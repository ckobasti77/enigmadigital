import type { ComponentType } from "react";
import { REZIM_POZIVA_HREF } from "@/components/app/nav-items";
import {
  AlarmClockCheck,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  ClipboardCheck,
  FileCheck2,
  Flame,
  Gift,
  Handshake,
  Headset,
  ListChecks,
  Medal,
  Megaphone,
  MessageSquareReply,
  Newspaper,
  PhoneCall,
  Route,
  SearchCheck,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  SquarePen,
  Target,
  Trophy,
  Upload,
} from "lucide-react";

/**
 * Ikonice i natpisi Napretka. Pravila (šta vredi koliko, kada se otključava)
 * žive u `convex/lib/napredak.ts`; ovde je samo kako to izgleda. Ključ koji
 * ovde nema ikonicu dobija neutralnu — nov ključ na serveru ne obara ekran.
 */
type Ikona = ComponentType<{ className?: string }>;

const MISIJA: Record<string, { ikona: Ikona; radnja: string }> = {
  pozovi: { ikona: PhoneCall, radnja: "Zovi" },
  ishodi: { ikona: ClipboardCheck, radnja: "Zabeleži ishod" },
  uvoz_redovi: { ikona: ListChecks, radnja: "Reši redove" },
  uvoz_pregled: { ikona: FileCheck2, radnja: "Otvori pregled" },
  zaostali: { ikona: AlarmClockCheck, radnja: "Otvori zaostale" },
  dopuni: { ikona: SearchCheck, radnja: "Dopuni" },
  komentari: { ikona: MessageSquareReply, radnja: "Odgovori" },
  objavi: { ikona: SquarePen, radnja: "Nova objava" },
  sastanak: { ikona: CalendarPlus, radnja: "Zakaži" },
};

export function ikonaMisije(kljuc: string): Ikona {
  return MISIJA[kljuc]?.ikona ?? Target;
}

/** Natpis dugmeta koje vodi u posao misije. */
export function radnjaMisije(kljuc: string): string {
  return MISIJA[kljuc]?.radnja ?? "Otvori";
}

/**
 * Kuda vodi dugme misije. Adresa je zamrznuta u bazi zajedno sa misijom, pa
 * je ovde samo jedna ispravka prikaza: misija poziva otvara režim poziva
 * (jedna firma na ekranu), a ne spisak iz kog tek treba izabrati.
 */
export function vezaMisije(kljuc: string, veza: string): string {
  if (kljuc === "pozovi") return REZIM_POZIVA_HREF;
  // Misija nerazrešenih redova bez određenog uvoza u adresi: Uvoz tada sam
  // otvara uvoz koji ih ima najviše, sa već izdvojenim nerazrešenim redovima.
  if (kljuc === "uvoz_redovi" && !veza.includes("import=")) {
    return "/leadovi/uvoz?prikaz=nerazreseno";
  }
  return veza;
}

const DOSTIGNUCE: Record<string, Ikona> = {
  prvi_kontakt: PhoneCall,
  na_liniji: Headset,
  maratonac_100: Route,
  maratonac_500: Route,
  maratonac_1000: Route,
  zakazano: CalendarCheck,
  pun_kalendar: CalendarDays,
  ponuda_poslata: Send,
  zatvarac: Handshake,
  uvek_ishod: ClipboardCheck,
  bez_zaostataka: AlarmClockCheck,
  cist_uvoz: ListChecks,
  detektiv: SearchCheck,
  glas_brenda: Megaphone,
  moderator: ShieldCheck,
  niz_7: Flame,
  niz_30: Flame,
  niz_100: Flame,
  nivo_10: Medal,
  nivo_20: Medal,
  nivo_30: Medal,
  savrsena_nedelja: Target,
  cuvar_budzeta: ShieldAlert,
};

export function ikonaDostignuca(kljuc: string): Ikona {
  return DOSTIGNUCE[kljuc] ?? Trophy;
}

const DOGADJAJ: Record<string, Ikona> = {
  dodir: PhoneCall,
  ishod: ClipboardCheck,
  sledeci_korak: CalendarClock,
  sastanak: CalendarCheck,
  ponuda: Send,
  dobijen: Handshake,
  uvoz: Upload,
  red: ListChecks,
  objava: SquarePen,
  clanak: Newspaper,
  moderacija: MessageSquareReply,
  oglas: Megaphone,
  pravilo: ShieldAlert,
  misija: Target,
  bonus: Gift,
};

/** Ikonica uz „+N XP" — po vrsti događaja koji je doneo XP. */
export function ikonaDogadjaja(vrsta: string): Ikona {
  return DOGADJAJ[vrsta] ?? Sparkles;
}
