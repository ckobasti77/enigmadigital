"use client";

/**
 * Stilovi mapa (SPAJANJE S14, plan S07 §7.2): xyflow `style.css`, pa tema na
 * tokenima (`mape.css`, posle njega). Uvoze ga samo četiri pogleda mapa
 * (oblast, stranica, ideje, beleške), a njih samo dinamički ulaz `index.tsx`,
 * pa običan ekran ne vuče ni stil ni kod mape. Iz `app/layout.tsx` se NE uvozi.
 */
import "@xyflow/react/dist/style.css";
import "./mape.css";
