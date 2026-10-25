import { v } from "convex/values";
import { query } from "./_generated/server";
import { prijavljenQuery } from "./lib/projekat";
import { oauthCallbackOrigin, ponovoProveren } from "./lib/oauthPovratak";

/**
 * OAuth povratak (plan C10 §5.2): adresa na koju callback ruta vraća korisnika
 * i da li je povezivanje uopšte podešeno na serveru.
 */

/**
 * Adresa povratka za callback rutu, pre razmene koda. Ne troši stanje.
 * Nepostojeće, iskorišćeno ili neispravno stanje daje `null` (ruta tada ide na
 * `/settings` svoje adrese). Isteklo, a još neobrisano stanje i dalje daje
 * svoju adresu: razmena će ga odbiti, a poruka o isteku stiže na panel sa kog
 * je tok krenuo.
 */
// javno: callback ruta pre razmene; state je jednokratna tajna, vraća samo adresu povratka proverenu pri izdavanju
export const procitaj = query({
  args: { state: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { state }) => {
    if (state.length === 0 || state.length > 200) return null;
    const red = await ctx.db
      .query("oauthStates")
      .withIndex("by_nonce", (q) => q.eq("nonce", state))
      .first();
    if (red === null) return null;
    return await ponovoProveren(ctx.db, red.workspaceId, red.povratak);
  },
});

/**
 * Da li je `OAUTH_CALLBACK_ORIGIN` ispravno podešen. Kartica Integracije bez
 * njega pokazuje traku i ne nudi „Poveži“, umesto da padne na klik.
 */
export const stanje = prijavljenQuery({
  args: {},
  returns: v.object({ podeseno: v.boolean() }),
  handler: async () => ({ podeseno: oauthCallbackOrigin().ok }),
});
