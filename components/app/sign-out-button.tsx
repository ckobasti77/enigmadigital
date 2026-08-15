"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const { signOut } = useAuthActions();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    // proxy.ts keeps unauthenticated users on /login from here on.
    router.push("/login");
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => void handleSignOut()}
      className="text-text-muted"
    >
      <LogOut />
      <span className="hidden sm:inline">Odjava</span>
    </Button>
  );
}
