"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { ArrowRight, LoaderCircle, MailCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/app/form-kit";
import { FeedbackNote } from "@/components/app/feedback";
import { Reveal } from "@/components/motion/reveal";

type Status = "idle" | "sending" | "sent" | "error";

/** Dovoljno da uhvati omašku u kucanju; ostalo proverava server. */
function emailProblem(raw: string): string | null {
  const value = raw.trim();
  if (value.length === 0) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
    return "Adresa mora biti oblika ime@domen.rs.";
  }
  return null;
}

export default function LoginPage() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  // If the proxy forwarded an in-flight Instagram OAuth code to the login
  // page, park it so Settings can complete the exchange after sign-in.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const igCode = params.get("ig_code");
    if (!igCode) return;
    try {
      window.localStorage.setItem(
        "ig_oauth_code",
        JSON.stringify({ code: igCode, ts: Date.now() }),
      );
    } catch {
      // storage unavailable
    }
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  // Greška u formatu stiže dok se kuca. Prazno polje nije greška dok se u
  // njega ne pokuša ući praznim „Pošalji" — pa se ta poruka pojavi tek tada.
  //
  // Dugme namerno NIJE onemogućeno dok je polje prazno: prvo što čovek vidi na
  // ovom ekranu ne sme da bude ugašen taster bez objašnjenja.
  const [attempted, setAttempted] = useState(false);
  const format = emailProblem(email);
  const problem =
    format ?? (attempted && email.trim().length === 0 ? "Unesi email." : null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail.length === 0 || format !== null || status === "sending") {
      return;
    }
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
    <main className="flex min-h-svh flex-1 items-center justify-center px-[var(--gutter)] py-16">
      <Reveal className="w-full max-w-sm">
        <div className="rounded-xl border bg-card p-8 shadow-elev-1">
          <p className="heading-caps text-micro font-medium text-accent-400">
            Enigma · Command Center
          </p>

          {status === "sent" ? (
            <div className="mt-6">
              <div className="flex size-10 items-center justify-center rounded-full border border-line-strong text-accent-400">
                <MailCheck className="size-5" aria-hidden />
              </div>
              <h1 className="mt-4 text-h2 text-foreground">Proveri inbox</h1>
              <p
                role="status"
                className="mt-2 text-sm leading-relaxed text-muted-foreground"
              >
                Link za prijavu je poslat na{" "}
                <span className="text-foreground">{email.trim()}</span>. Važi 15
                minuta.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStatus("idle")}
                className="mt-5 -ml-2.5"
              >
                Pošalji na drugu adresu
              </Button>
            </div>
          ) : (
            <>
              <h1 className="mt-5 text-h2 text-foreground">Prijava</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Unesi email — stiže ti link za prijavu.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <Field label="Email" error={problem}>
                  {(field) => (
                    <Input
                      {...field}
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
                  )}
                </Field>

                <Button
                  type="submit"
                  disabled={status === "sending"}
                  className="h-11 w-full"
                >
                  {status === "sending" ? (
                    <>
                      <LoaderCircle className="animate-spin" />
                      Šaljem link…
                    </>
                  ) : (
                    <>
                      Pošalji link
                      <ArrowRight />
                    </>
                  )}
                </Button>

                {status === "error" && (
                  <FeedbackNote tone="danger" title="Link nije poslat">
                    Proveri adresu i pokušaj ponovo. Ako se ponovi, prijava
                    preko emaila trenutno ne radi — javi se timu.
                  </FeedbackNote>
                )}
              </form>
            </>
          )}
        </div>
      </Reveal>
    </main>
  );
}
