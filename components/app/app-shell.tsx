"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { Skeleton } from "@/components/ui/skeleton";
import { AppSidebar } from "./app-sidebar";
import { MobileNav } from "./mobile-nav";
import { SignOutButton } from "./sign-out-button";
import { WorkspaceProvider, useWorkspace } from "./workspace-provider";

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
            <main className="flex flex-1 flex-col px-[var(--gutter)] py-8 pb-24 md:pb-8">
              {children}
            </main>
          </div>
          <MobileNav />
        </WorkspaceProvider>
      </Authenticated>
    </>
  );
}

function Header() {
  const { workspace, isLoading } = useWorkspace();

  return (
    <header className="material edge-fade-b sticky top-0 z-30 flex h-[var(--chrome-height)] shrink-0 items-center justify-between gap-3 px-[var(--gutter)]">
      <div className="flex items-center gap-2">
        <span className="heading-caps text-micro font-medium text-accent-400 md:hidden">
          Enigma
        </span>
        {isLoading ? (
          <Skeleton className="h-4 w-28" />
        ) : (
          <span className="text-sm font-medium text-foreground">
            {workspace?.name ?? "—"}
          </span>
        )}
      </div>
      <SignOutButton />
    </header>
  );
}

function ShellFallback() {
  return (
    <>
      <div className="material material-edge-r fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-width)] md:block" />
      <div className="flex min-w-0 min-h-full flex-1 flex-col md:pl-[var(--sidebar-width)]">
        <div className="material h-[var(--chrome-height)] shrink-0" />
        <div className="flex flex-1 flex-col gap-4 px-[var(--gutter)] py-8">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-32 w-full max-w-2xl" />
        </div>
      </div>
    </>
  );
}
