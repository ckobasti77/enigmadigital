// Preneto iz Devotion apps/web/public/sw.js (main @ c05c40f), SPAJANJE S17.
/*
 * Servis radnik za web push obaveštenja.
 *
 * Postoji samo zbog obaveštenja: ne kešira ništa i ne presreće mrežu, pa ne može
 * da poremeti učitavanje aplikacije. Push radi i kad je aplikacija zatvorena —
 * pregledač drži ovaj radnik, a ne stranu.
 *
 * Registruje ga samo klik na „Uključi obaveštenja“ u podešavanjima obaveštenja
 * (`components/app/prostor/inbox/use-push-notifications.ts`), nikad učitavanje
 * strane.
 */

self.addEventListener("install", () => {
  // Nova verzija preuzima kontrolu odmah, bez čekanja na zatvaranje kartica.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "Novo obaveštenje";
  const options = {
    body: payload.body || undefined,
    icon: "/favicon.ico",
    lang: "sr-Latn-RS",
    // Grupisanje po cilju: novo obaveštenje o istoj stvari zamenjuje staro
    // umesto da se gomila na ekranu.
    tag: payload.targetId ? `target:${payload.targetId}` : undefined,
    renotify: Boolean(payload.targetId),
    timestamp: Date.now(),
    data: {
      workspaceId: payload.workspaceId || null,
      targetType: payload.targetType || null,
      targetId: payload.targetId || null,
      notificationId: payload.notificationId || null,
    },
    actions: [{ action: "open", title: "Otvori" }],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * Adresa koja vodi na povod obaveštenja: `/otvori?projekat=…&vrsta=…&cilj=…`
 * (rute aplikacije, plan S07 D13). Radnik zna ID projekta, a ne njegovu
 * adresu, pa slug razrešava strana `/otvori` iz mojih projekata. Lično
 * obaveštenje (`workspaceId: null`, poruka iz ličnog razgovora) nema
 * `projekat`, pa `/otvori` vodi na lične Poruke.
 *
 * Mora da se poklapa sa `adresaOtvori` u `lib/prostor/web/obavestenja.ts`
 * (radnik je statički fajl i ne može da uveze taj modul, pa ga preslikava);
 * `lib/prostor/web/obavestenja.test.ts` proverava da se slažu.
 */
function targetUrl(data) {
  const params = new URLSearchParams();
  if (data.workspaceId) params.set("projekat", data.workspaceId);
  if (data.targetType) params.set("vrsta", data.targetType);
  if (data.targetId) params.set("cilj", data.targetId);
  const query = params.toString();
  return query ? `/otvori?${query}` : "/otvori";
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = targetUrl(event.notification.data || {});

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Ako je aplikacija već otvorena, fokusira se ta kartica i vodi na pravo
      // mesto — ne otvara se nov prozor svaki put.
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(url);
            } catch {
              // Neki pregledači odbiju navigaciju fokusirane kartice; fokus je dovoljan.
            }
          }
          return;
        }
      }

      await self.clients.openWindow(url);
    })(),
  );
});
