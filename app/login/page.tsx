import type { Metadata } from "next";
import { cache } from "react";
import { headers } from "next/headers";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { BrendPrijave } from "@/components/app/system/brand-moment";
import { resolveServerConvexUrl } from "@/lib/server-convex-url";
import { LoginClient } from "./login-client";

/**
 * Prijava (globalna putanja). Na panel domenu (`x-panel-rezim: panel`, postavlja
 * ga `proxy.ts` i klijent ga ne može podmetnuti) ekran nosi brend projekta tog
 * domena: ime, boju i logo iz javnog `projekti.javniBrend`. U hubu, na
 * nepoznatom domenu i kad upit ne uspe, ostaje podrazumevani izgled — prijava
 * nikad ne čeka na brend duže od 1,5 s i nikad ne pada zbog njega.
 */
const ISTEK_MS = 1500;

const brendPanela = cache(async (): Promise<BrendPrijave | null> => {
  const h = await headers();
  if (h.get("x-panel-rezim") !== "panel") return null;
  const host = h.get("host");
  const url = resolveServerConvexUrl();
  if (!host || !url.ok) return null;
  try {
    return await Promise.race([
      fetchQuery(api.projekti.javniBrend, { host }, { url: url.url }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ISTEK_MS)),
    ]);
  } catch {
    return null;
  }
});

export async function generateMetadata(): Promise<Metadata> {
  const brend = await brendPanela();
  if (brend === null) return { title: "Prijava · Enigma Digital" };
  return {
    title: `Prijava · ${brend.ime}`,
    ...(brend.logoUrl ? { icons: { icon: brend.logoUrl } } : {}),
  };
}

export default async function LoginPage() {
  return <LoginClient brend={await brendPanela()} />;
}
