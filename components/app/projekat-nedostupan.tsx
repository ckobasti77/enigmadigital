"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { FolderX, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Rezim } from "@/lib/rutiranje";
import { EmptyState } from "./system/empty-state";

/**
 * Adresa projekta koji ne postoji ili za koji korisnik nije član (plan C02
 * §6.2, D8). Oba slučaja izgledaju isto, da adresa ne otkriva šta postoji.
 * U hubu vodi na „Svi projekti“; u panelu drugog projekta nema, pa je jedini
 * izlaz odjava (možda je prijavljen pogrešan nalog).
 */
export function ProjekatNedostupan({ rezim }: { rezim: Rezim }) {
  const { signOut } = useAuthActions();
  const router = useRouter();

  async function odjavi() {
    await signOut();
    router.push("/login");
  }

  return (
    <main
      id="sadrzaj"
      data-module="tabla"
      className="flex min-h-dvh flex-1 flex-col items-center justify-center px-[var(--gutter)]"
    >
      <EmptyState
        icon={FolderX}
        size="lg"
        heading="h1"
        title="Projekat nije dostupan"
        action={
          rezim === "hub" ? (
            <Button
              variant="primary"
              className="max-md:h-11 max-md:px-4"
              render={<Link href="/" />}
              nativeButton={false}
            >
              Svi projekti
            </Button>
          ) : (
            <Button
              variant="outline"
              className="max-md:h-11 max-md:px-4"
              onClick={() => void odjavi()}
            >
              <LogOut aria-hidden />
              Odjavi se
            </Button>
          )
        }
      >
        {rezim === "hub"
          ? "Ne postoji ili nemaš pristup."
          : "Ne postoji ili nemaš pristup. Ako si prijavljen pogrešnim nalogom, odjavi se i prijavi ponovo."}
      </EmptyState>
    </main>
  );
}
