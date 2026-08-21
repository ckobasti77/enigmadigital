"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AppSidebar } from "./app-sidebar";
import { MobileNav } from "./mobile-nav";
import { CommandPalette } from "./command-palette";
import { PageTransition } from "./page-transition";
import { SectionNav } from "./section-nav";
import { SignOutButton } from "./sign-out-button";
import { SyncStatus } from "./sync-status";
import { DateRangePicker } from "./date-range-picker";
import { channelTabsFor, resolveScreen } from "./nav-items";
import { WorkspaceProvider } from "./workspace-provider";

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

export function AppShell({ children }: { children: React.ReactNode }) {
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
        <WorkspaceProvider>
          {/* The sidebar and header are fixed/sticky chrome, so the column is
              inset by the sidebar width rather than sharing a flex row. */}
          <AppSidebar />
          <div className="flex min-w-0 min-h-full flex-1 flex-col md:pl-[var(--sidebar-width)]">
            <Header />
            <main className="mx-auto flex w-full max-w-[var(--content-max)] flex-1 flex-col px-[var(--gutter)] py-8 pb-24 md:pb-8">
              <PageTransition>{children}</PageTransition>
            </main>
          </div>
          <MobileNav />
          <CommandPalette />
        </WorkspaceProvider>
      </Authenticated>
    </>
  );
}

/**
 * Gornja traka: gde sam (sekcija · ekran), nad kojim periodom gledam, i da li
 * su brojevi sveži. Sadržaj klizi ispod nje, a granicu nosi gradijentna maska
 * iz D1 — ne linija od jednog piksela.
 */
function Header() {
  const pathname = usePathname();
  const screen = resolveScreen(pathname);
  const tabs = channelTabsFor(pathname);

  return (
    <header className="material edge-fade-b sticky top-0 z-30 flex shrink-0 flex-col">
      <div className="flex h-[var(--chrome-height)] items-center gap-4 px-[var(--gutter)]">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="heading-caps shrink-0 text-micro font-medium text-accent-400 md:hidden">
            Enigma
          </span>
          {screen && (
            <>
              <span className="heading-caps hidden shrink-0 text-micro font-medium text-text-muted lg:inline">
                {screen.section}
                <span className="mx-1.5 text-line-strong">/</span>
              </span>
              <h2 className="truncate text-sm font-medium text-foreground">
                {screen.title}
              </h2>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {screen?.range && (
            // useSearchParams traži Suspense granicu na statičkim rutama;
            // ljuska je iznad stranice, pa granica mora da stoji ovde.
            <Suspense fallback={<Skeleton className="h-8 w-56" />}>
              <DateRangePicker compact className="hidden md:flex" />
            </Suspense>
          )}
          <CommandTrigger />
          <SyncStatus className="hidden sm:inline-flex" />
          <SignOutButton />
        </div>
      </div>

      {/* Na telefonu naslov i birač perioda ne staju u isti red, pa birač
          dobija svoj — i dalje u ljusci, i dalje isti izbor. */}
      {screen?.range && (
        <div className="material-edge-t px-[var(--gutter)] py-2 md:hidden">
          <Suspense fallback={<Skeleton className="h-8 w-56" />}>
            <DateRangePicker compact />
          </Suspense>
        </div>
      )}

      {/* Druga ravan navigacije živi u ljusci, ne u telu strane: ostaje
          zakačena i ne bledi ponovo pri prelasku između podekrana kanala. */}
      {tabs && (
        <div className="px-[var(--gutter)]">
          <SectionNav tabs={tabs} />
        </div>
      )}
    </header>
  );
}

/** Otvara komandnu paletu klikom — parnjak globalnom ⌘K prečicom. */
function CommandTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("enigma:command"))}
      aria-label="Komandna paleta"
      title="Komandna paleta (⌘K)"
      className="hover-lift inline-flex h-8 items-center gap-2 rounded-lg border border-line px-2.5 text-text-muted transition-colors hover:text-foreground"
    >
      <Search className="size-4" />
      <kbd className="hidden font-sans text-micro font-medium lg:inline">
        ⌘K
      </kbd>
    </button>
  );
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
