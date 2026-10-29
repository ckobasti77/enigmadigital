import { InboxEkran } from "@/components/app/prostor/inbox/ekran";

export const metadata = { title: "Inbox · Enigma Digital" };

/**
 * Lični nivo „Ja“ (SPAJANJE P13, P16): obaveštenja iz svih mojih projekata i
 * ličnih poruka. Kartice i opseg žive u memoriji ekrana, pa strana ne čita
 * parametre upita.
 */
export default function Page() {
  return <InboxEkran />;
}
