"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { Skeleton } from "@/components/ui/skeleton";
import { readRail } from "./app-shell";
import { KLJUC_POZIVNICE, putanjaPozivnice } from "@/lib/pozivnica-token";

/**
 * Kapija prijave za sve strane iza naloga: hub „Svi projekti“ i ekrane
 * projekta (plan C02 §7.1). Izdvojena iz `AppShell`-a da bi radila i na hubu,
 * koji nema ljusku projekta — `ig_code` se tako parkira i tamo.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  // Širina bočne trake se zna pre sesije, pa i zamena ljuske (dok se sesija
  // proverava) već stoji u izabranom obliku — bez skoka kad stigne prava.
  useEffect(() => {
    const root = document.documentElement;
    if (readRail()) root.dataset.sidebar = "rail";
    return () => {
      delete root.dataset.sidebar;
    };
  }, []);

  return (
    <>
      <OAuthCodeCatcher />

      {/* No flash: the shell only mounts once the auth token is confirmed. */}
      <AuthLoading>
        <ShellFallback />
      </AuthLoading>

      <Unauthenticated>
        <RedirectToLogin />
      </Unauthenticated>

      <Authenticated>
        <PozivnicaCatcher />
        {children}
      </Authenticated>
    </>
  );
}

/**
 * Posle prijave vrati korisnika na pozivnicu koju je prijava parkirala
 * (`/login?pozivnica=<token>`, postojeći nalog prihvata poziv u drugi
 * projekat). Token se čita i briše odmah, i koristi se samo ako ima tačan
 * oblik tokena (`lib/pozivnica-token.ts`), pa ne može da odvede na tuđu adresu.
 */
function PozivnicaCatcher() {
  const router = useRouter();
  useEffect(() => {
    let parkiran: string | null = null;
    try {
      parkiran = window.sessionStorage.getItem(KLJUC_POZIVNICE);
      window.sessionStorage.removeItem(KLJUC_POZIVNICE);
    } catch {
      // storage unavailable — nothing to resume
    }
    const putanja = putanjaPozivnice(parkiran);
    if (putanja !== null) router.replace(putanja);
  }, [router]);
  return null;
}

/**
 * Parks an incoming Instagram OAuth code from the URL into localStorage so it
 * survives a login round-trip (the Settings page consumes and removes it).
 * Mounted OUTSIDE <Authenticated> on purpose: it must run even when the
 * session is missing, which is exactly when the code would otherwise be lost.
 */
function OAuthCodeCatcher() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("ig_code") || params.get("code");
    if (!code) return;
    try {
      window.localStorage.setItem(
        "ig_oauth_code",
        JSON.stringify({ code, ts: Date.now() }),
      );
    } catch {
      // storage unavailable — nothing we can do
    }
  }, []);
  return null;
}

/** When the session is confirmed missing, send the user to login. */
function RedirectToLogin() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/login");
  }, [router]);
  return <ShellFallback />;
}

function ShellFallback() {
  return (
    <>
      <div className="material material-edge-r fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-width)] md:block" />
      <div className="flex min-w-0 min-h-full flex-1 flex-col md:pl-[var(--sidebar-width)]">
        <div className="material h-[var(--chrome-height)] shrink-0" />
        <div className="mx-auto flex w-full max-w-[var(--content-max)] flex-1 flex-col gap-4 px-[var(--gutter)] py-8">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-32 w-full max-w-2xl" />
        </div>
      </div>
    </>
  );
}
