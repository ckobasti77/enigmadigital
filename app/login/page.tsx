"use client";

import { useState, type FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion/reveal";

type Status = "idle" | "sending" | "sent" | "error";

export default function LoginPage() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || status === "sending") return;
    setStatus("sending");
    try {
      await signIn("resend", { email: cleanEmail });
      setStatus("sent");
    } catch (error) {
      console.error("Sign-in failed", error);
      setStatus("error");
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-[var(--gutter)] py-16">
      <Reveal className="w-full max-w-sm">
        <div className="rounded-xl border bg-card p-8 shadow-card">
          <p className="heading-caps text-xs font-medium text-accent-400">
            Enigma · Command Center
          </p>

          {status === "sent" ? (
            <div className="mt-5">
              <div className="flex size-10 items-center justify-center rounded-full border border-line-strong text-accent-400">
                <Check className="size-5" />
              </div>
              <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
                Proveri inbox
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Link za prijavu je poslat na{" "}
                <span className="text-foreground">{email}</span>. Važi 15 minuta.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStatus("idle")}
                className="mt-5 -ml-2.5"
              >
                Pošalji na drugi email
              </Button>
            </div>
          ) : (
            <>
              <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
                Prijava
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Unesi email — poslaćemo ti link za prijavu.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-text-muted">
                    Email
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    autoFocus
                    placeholder="ti@enigmait.rs"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={status === "sending"}
                    className="h-11"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={status === "sending"}
                  className="h-11 w-full"
                >
                  {status === "sending" ? (
                    <>
                      <LoaderCircle className="animate-spin" />
                      Šaljem…
                    </>
                  ) : (
                    <>
                      Pošalji link
                      <ArrowRight />
                    </>
                  )}
                </Button>

                {status === "error" && (
                  <p className="text-sm text-danger">
                    Slanje nije uspelo. Pokušaj ponovo.
                  </p>
                )}
              </form>
            </>
          )}
        </div>
      </Reveal>
    </main>
  );
}
