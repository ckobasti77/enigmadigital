// Preneto iz Devotion apps/web/lib/today.ts (main @ c05c40f), SPAJANJE S08.
/**
 * Današnji dan za lični nivo — logika je u `lib/prostor/today.ts` (ranije
 * `@devotion/shared`); ovde je samo uvozni put za web ekrane.
 */
// Direktno iz `today.ts`, ne kroz barel `lib/prostor`: ljuska uvozi ovaj fajl,
// a barel bi u svaku stranu povukao sve module radnog dela (S28).
export { msUntilNextDay, nextToday, todayOf, type Today } from "../today";
