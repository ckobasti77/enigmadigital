"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  ArrowLeft,
  ArrowRight,
  KeyRound,
  LoaderCircle,
  RotateCw,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/app/form-kit";
import { FeedbackNote } from "@/components/app/feedback";
import { Reveal } from "@/components/motion/reveal";

type Step = "email" | "code";
type Status = "idle" | "sending_code" | "verifying" | "error";

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
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

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

  // Countdown timer for resending OTP
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const [attemptedEmail, setAttemptedEmail] = useState(false);
  const format = emailProblem(email);
  const emailValidationProblem =
    format ??
    (attemptedEmail && email.trim().length === 0 ? "Unesi email." : null);

  const [attemptedCode, setAttemptedCode] = useState(false);
  const codeValidationProblem =
    attemptedCode && code.trim().length < 6
      ? "Unesi svih 6 cifara koda."
      : null;

  async function handleSendEmail(event?: FormEvent<HTMLFormElement>) {
    if (event) event.preventDefault();
    setAttemptedEmail(true);
    setErrorMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail.length === 0 || format !== null || status === "sending_code") {
      return;
    }

    setStatus("sending_code");
    try {
      await signIn("resend", { email: cleanEmail });
      setStep("code");
      setStatus("idle");
      setCode("");
      setAttemptedCode(false);
      setResendCooldown(30);
    } catch (error) {
      console.error("Sending OTP failed", error);
      setStatus("error");
      setErrorMessage(
        error instanceof Error && error.message.includes("Pristup nije dozvoljen")
          ? "Pristup nije dozvoljen za ovu email adresu."
          : "Slanje koda nije uspelo. Proveri adresu i pokušaj ponovo.",
      );
    }
  }

  async function handleVerifyCode(event?: FormEvent<HTMLFormElement>) {
    if (event) event.preventDefault();
    setAttemptedCode(true);
    setErrorMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim().replace(/\D/g, "");

    if (cleanCode.length !== 6 || status === "verifying") {
      return;
    }

    setStatus("verifying");
    try {
      await signIn("resend", { email: cleanEmail, code: cleanCode });
      // On success, Convex Auth sets credentials and redirect is handled automatically
    } catch (error) {
      console.error("Code verification failed", error);
      setStatus("error");
      setErrorMessage(
        "Kod nije ispravan ili je istekao. Proveri cifre ili zatraži novi kod.",
      );
    }
  }

  function handleCodeChange(raw: string) {
    const digitsOnly = raw.replace(/\D/g, "").slice(0, 6);
    setCode(digitsOnly);
    setErrorMessage(null);
  }

  return (
    <main className="flex min-h-svh flex-1 items-center justify-center px-[var(--gutter)] py-16">
      <Reveal className="w-full max-w-sm">
        <div className="rounded-xl border bg-card p-8 shadow-elev-1">
          <p className="heading-caps text-micro font-medium text-accent-400">
            Enigma · Command Center
          </p>

          {step === "code" ? (
            <div className="mt-6">
              <div className="flex size-10 items-center justify-center rounded-full border border-line-strong text-accent-400">
                <KeyRound className="size-5" aria-hidden />
              </div>
              <h1 className="mt-4 text-h2 text-foreground">Unesi 6-cifreni kod</h1>
              <p
                role="status"
                className="mt-2 text-sm leading-relaxed text-muted-foreground"
              >
                Kod za prijavu je poslat na{" "}
                <span className="font-medium text-foreground">{email.trim()}</span>.
                Važi 15 minuta.
              </p>

              <form onSubmit={handleVerifyCode} className="mt-6 space-y-4">
                <Field label="Verifikacioni kod" error={codeValidationProblem}>
                  {(field) => (
                    <Input
                      {...field}
                      name="code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]*"
                      maxLength={6}
                      autoFocus
                      placeholder="••••••"
                      value={code}
                      onChange={(e) => handleCodeChange(e.target.value)}
                      disabled={status === "verifying"}
                      className="h-12 text-center font-mono text-xl font-bold tracking-[0.4em] placeholder:tracking-[0.4em]"
                    />
                  )}
                </Field>

                <Button
                  type="submit"
                  disabled={status === "verifying" || code.length !== 6}
                  className="h-11 w-full"
                >
                  {status === "verifying" ? (
                    <>
                      <LoaderCircle className="animate-spin" />
                      Proveravam kod…
                    </>
                  ) : (
                    <>
                      Prijavi se
                      <ArrowRight />
                    </>
                  )}
                </Button>

                {errorMessage && (
                  <FeedbackNote tone="danger" title="Greška pri prijavi">
                    {errorMessage}
                  </FeedbackNote>
                )}

                <div className="flex flex-col gap-2 pt-2 border-t border-line-muted">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={resendCooldown > 0 || status === "sending_code" || status === "verifying"}
                    onClick={() => handleSendEmail()}
                    className="w-full justify-center text-xs text-muted-foreground hover:text-foreground"
                  >
                    {status === "sending_code" ? (
                      <>
                        <LoaderCircle className="size-3.5 animate-spin mr-1.5" />
                        Šaljem novi kod…
                      </>
                    ) : resendCooldown > 0 ? (
                      <>
                        <RotateCw className="size-3.5 mr-1.5 opacity-50" />
                        Pošalji ponovo za {resendCooldown}s
                      </>
                    ) : (
                      <>
                        <RotateCw className="size-3.5 mr-1.5" />
                        Nisi dobio kod? Pošalji ponovo
                      </>
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setStep("email");
                      setStatus("idle");
                      setErrorMessage(null);
                    }}
                    className="w-full justify-center text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="size-3.5 mr-1.5" />
                    Promeni email adresu
                  </Button>
                </div>
              </form>
            </div>
          ) : (
            <>
              <h1 className="mt-5 text-h2 text-foreground">Prijava</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Unesi email — stiže ti 6-cifreni kod za prijavu.
              </p>

              <form onSubmit={handleSendEmail} className="mt-6 space-y-4">
                <Field label="Email" error={emailValidationProblem}>
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
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setErrorMessage(null);
                      }}
                      disabled={status === "sending_code"}
                      className="h-11"
                    />
                  )}
                </Field>

                <Button
                  type="submit"
                  disabled={status === "sending_code"}
                  className="h-11 w-full"
                >
                  {status === "sending_code" ? (
                    <>
                      <LoaderCircle className="animate-spin" />
                      Šaljem kod…
                    </>
                  ) : (
                    <>
                      Pošalji kod
                      <ArrowRight />
                    </>
                  )}
                </Button>

                {errorMessage && (
                  <FeedbackNote tone="danger" title="Kod nije poslat">
                    {errorMessage}
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
