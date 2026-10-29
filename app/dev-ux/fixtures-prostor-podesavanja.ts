import { getFunctionName } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DAY, HOUR, now, type Fixture, type R } from "./fixtures-util";
import { PROJEKTI, fakeId } from "./fixtures-prostor-osnova";

/**
 * Nove kartice podešavanja projekta u razvojnom prikazu (SPAJANJE S21,
 * paritet redovi 28 i 29): Oblasti (`projekat.get`, `createArea`,
 * `updateArea`, `reorderAreas`), opis (`postaviOpis`), Lozinke
 * (`adminAuth.adminSetPassword`) i AI provajderi (`aiProviders.*`).
 *
 * Stanje živi u modulu, pa preimenovanje, pomeranje, nova oblast, prekidač,
 * „Podrazumevani“ i brisanje provajdera menjaju ono što ekran sledeće čita
 * (kao posle odgovora servera). Ključ provajdera se ne čuva nigde: `list`
 * vraća samo poslednja 4 znaka, kao pravi upit.
 *
 * Adrese (projekat „Enigma IT“, vlasnik projekta i platforme):
 *   /enigma-it/settings?ux=1&tab=oblasti
 *   /enigma-it/settings?ux=1&tab=lozinke
 *   /enigma-it/settings?ux=1&tab=ai
 *   /enigma-it/settings?ux=1&tab=projekat   (opis pod karticom)
 * `&uloga=client_viewer` ili `&uloga=urednik` sužava kartice (harness).
 */

type Projekat = R<typeof api.prostor.projekat.get>;
type Provajder = R<typeof api.prostor.aiProviders.list>[number];

// ── Oblasti i opis ───────────────────────────────────────────────────────────

const OBLASTI_STANJE = new Map<string, Projekat["areas"]>();
const OPISI = new Map<string, string>();
let brojacOblasti = 0;

function osnovni(workspaceId: unknown) {
  return PROJEKTI.find((p) => p._id === workspaceId) ?? PROJEKTI[0];
}

function projekat(args: Record<string, unknown>): Projekat {
  const osnova = osnovni(args.workspaceId);
  return {
    ...osnova,
    description: OPISI.get(osnova._id) ?? osnova.description,
    areas: OBLASTI_STANJE.get(osnova._id) ?? osnova.areas,
  };
}

function oblasti(workspaceId: unknown): Projekat["areas"] {
  return projekat({ workspaceId }).areas;
}

function postavi(workspaceId: unknown, lista: Projekat["areas"]) {
  OBLASTI_STANJE.set(osnovni(workspaceId)._id, lista.map((o, position) => ({ ...o, position })));
}

// ── AI provajderi ────────────────────────────────────────────────────────────

let provajderi: Provajder[] = [
  {
    _id: fakeId("aiProviders", 1),
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    keySuffix: "x7Qa",
    isDefault: true,
    enabled: true,
    lastError: null,
    lastErrorAt: null,
    lastUsedAt: now - 3 * HOUR,
    createdAt: now - 40 * DAY,
    updatedAt: now - 3 * HOUR,
  },
  {
    _id: fakeId("aiProviders", 2),
    label: "Lokalni model",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.1:8b",
    keySuffix: "m2Kd",
    isDefault: false,
    enabled: false,
    lastError: "Veza je istekla pre odgovora.",
    lastErrorAt: now - 6 * DAY,
    lastUsedAt: null,
    createdAt: now - 12 * DAY,
    updatedAt: now - 6 * DAY,
  },
];
let brojacProvajdera = 2;

function izmeni(id: unknown, patch: Partial<Provajder>) {
  provajderi = provajderi.map((p) => (p._id === id ? { ...p, ...patch, updatedAt: Date.now() } : p));
  // Gašenje podrazumevanog promoviše sledeći uključeni (kao backend).
  if (!provajderi.some((p) => p.isDefault)) {
    const sledeci = provajderi.find((p) => p.enabled);
    if (sledeci) provajderi = provajderi.map((p) => (p._id === sledeci._id ? { ...p, isDefault: true } : p));
  }
}

const sufiks = (kljuc: unknown) => String(kljuc ?? "").slice(-4);

export const FIXTURES_PROSTOR_PODESAVANJA: Record<string, Fixture> = {
  [getFunctionName(api.prostor.projekat.get)]: (a) => projekat(a),
  [getFunctionName(api.prostor.projekat.createArea)]: (a) => {
    const spisak = oblasti(a.workspaceId);
    const id = fakeId("areas", 700 + ++brojacOblasti);
    postavi(a.workspaceId, [
      ...spisak,
      {
        _id: id,
        _creationTime: now,
        workspaceId: osnovni(a.workspaceId)._id,
        key: `custom_${now}`,
        label: String(a.label),
        position: spisak.length,
        createdAt: now,
      },
    ]);
    return id;
  },
  [getFunctionName(api.prostor.projekat.updateArea)]: (a) => {
    for (const p of PROJEKTI) {
      const spisak = oblasti(p._id);
      if (spisak.some((o) => o._id === a.areaId)) {
        postavi(p._id, spisak.map((o) => (o._id === a.areaId ? { ...o, label: String(a.label) } : o)));
      }
    }
    return a.areaId as Id<"areas">;
  },
  [getFunctionName(api.prostor.projekat.reorderAreas)]: (a) => {
    const spisak = oblasti(a.workspaceId);
    const redosled = (a.orderedAreaIds as Id<"areas">[]) ?? [];
    postavi(
      a.workspaceId,
      redosled.map((id) => spisak.find((o) => o._id === id)).filter((o): o is NonNullable<typeof o> => o !== undefined),
    );
    return true;
  },
  [getFunctionName(api.prostor.projekat.postaviOpis)]: (a) => {
    OPISI.set(osnovni(a.workspaceId)._id, typeof a.opis === "string" ? a.opis : "");
    return null;
  },
  [getFunctionName(api.prostor.adminAuth.adminSetPassword)]: () => null,
  [getFunctionName(api.prostor.aiProviders.list)]: () => provajderi,
  [getFunctionName(api.prostor.aiProviders.create)]: (a) => {
    const id = fakeId("aiProviders", ++brojacProvajdera);
    provajderi = [
      ...provajderi,
      {
        _id: id,
        label: String(a.label),
        baseUrl: String(a.baseUrl),
        model: String(a.model),
        keySuffix: sufiks(a.apiKey),
        isDefault: provajderi.length === 0,
        enabled: true,
        lastError: null,
        lastErrorAt: null,
        lastUsedAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    return id;
  },
  [getFunctionName(api.prostor.aiProviders.update)]: (a) => {
    const patch: Partial<Provajder> = {};
    if (typeof a.label === "string") patch.label = a.label;
    if (typeof a.baseUrl === "string") patch.baseUrl = a.baseUrl;
    if (typeof a.model === "string") patch.model = a.model;
    if (typeof a.apiKey === "string") patch.keySuffix = sufiks(a.apiKey);
    if (typeof a.enabled === "boolean") {
      patch.enabled = a.enabled;
      if (!a.enabled) patch.isDefault = false;
    }
    izmeni(a.providerId, patch);
    return null;
  },
  [getFunctionName(api.prostor.aiProviders.setDefault)]: (a) => {
    provajderi = provajderi.map((p) => ({ ...p, isDefault: p._id === a.providerId, enabled: p._id === a.providerId ? true : p.enabled }));
    return null;
  },
  [getFunctionName(api.prostor.aiProviders.remove)]: (a) => {
    const bio = provajderi.find((p) => p._id === a.providerId);
    provajderi = provajderi.filter((p) => p._id !== a.providerId);
    if (bio?.isDefault) izmeni(null, {});
    return null;
  },
};

/** Bez provajdera (`&prazno=1`); oblasti ostaju četiri podrazumevane. */
export const PRAZNO_PROSTOR_PODESAVANJA: Record<string, Fixture> = {
  [getFunctionName(api.prostor.aiProviders.list)]: () => [],
};
