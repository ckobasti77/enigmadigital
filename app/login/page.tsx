"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  RotateCw,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/app/form-kit";
import { FeedbackNote } from "@/components/app/feedback";
import { Reveal } from "@/components/motion/reveal";
import { prvaGreskaLozinke } from "@/lib/password-rules";

/**
 * Ekrani prijave.
 *
 * `lozinka`      — podrazumevani ulaz: email + lozinka, bez ijednog maila.
 * `zaboravljena` — traženje koda za promenu lozinke.
 * `kod`          — 6-cifreni kod. Koristi se za DVE stvari (prijava kodom i
 *                  reset lozinke), pa `kodNamena` mora da kaže za koju.
 *
 * Postavljanje lozinke više NIJE ovde — nov nalog se pravi isključivo preko
 * pozivnice (`/pozivnica/<token>`).
 */
type Ekran = "lozinka" | "zaboravljena" | "kod";
type KodNamena = "prijava" | "reset";
type Status = "idle" | "radim" | "error";

/** Dovoljno da uhvati omašku u kucanju; ostalo proverava server. */
function emailProblem(raw: string): string | null {
  const value = raw.trim();
  if (value.length === 0) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
    return "Adresa mora biti oblika ime@domen.rs.";
  }
  return null;
}

/** Ista pravila kao na serveru (convex/auth.ts §5) — da server ne odbije ono što je ekran pustio. */
function lozinkaProblem(value: string): string | null {
  return prvaGreskaLozinke(value);
}

/**
 * Poruka se izvodi iz onoga što je server stvarno rekao. Uzrok koji nije
 * potvrđen se ne pogađa: „pogrešna lozinka" i „nalog još nema lozinku" nisu
 * ista stvar i ne smeju da izgledaju isto.
 */
function porukaGreske(error: unknown, podrazumevana: string): string {
  const tekst = error instanceof Error ? error.message : String(error);
  if (tekst.includes("Pristup nije dozvoljen")) {
    return "Pristup nije dozvoljen za ovu email adresu.";
  }
  if (tekst.includes("Lozinka mora") || tekst.includes("Lozinka može")) {
    return tekst;
  }
  if (tekst.includes("InvalidAccountId")) {
    return "Za ovaj nalog lozinka još nije postavljena. Zatraži pozivnicu od administratora.";
  }
  if (tekst.includes("InvalidSecret") || tekst.includes("Invalid credentials")) {
    return "Email ili lozinka nisu tačni.";
  }
  if (tekst.includes("AccountAlreadyExists") || tekst.includes("already exists")) {
    return "Lozinka za ovaj nalog je već postavljena. Prijavi se, ili je promeni preko „Zaboravio sam lozinku”.";
  }
  return podrazumevana;
}

export default function LoginPage() {
  const { signIn } = useAuthActions();

  const [ekran, setEkran] = useState<Ekran>("lozinka");
  const [kodNamena, setKodNamena] = useState<KodNamena>("prijava");

  const [email, setEmail] = useState("");
  const [lozinka, setLozinka] = useState("");
  const [novaLozinka, setNovaLozinka] = useState("");
  const [kod, setKod] = useState("");

  const [prikaziLozinku, setPrikaziLozinku] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [pokusano, setPokusano] = useState(false);

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

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const formatEmail = emailProblem(email);
  const emailGreska =
    formatEmail ?? (pokusano && email.trim().length === 0 ? "Unesi email." : null);
  const novaLozinkaGreska = lozinkaProblem(novaLozinka);
  const kodGreska = pokusano && kod.length > 0 && kod.length < 6
    ? "Unesi svih 6 cifara koda."
    : null;

  const cleanEmail = email.trim().toLowerCase();
  const zauzet = status === "radim";

  function idiNa(sledeci: Ekran) {
    setEkran(sledeci);
    setStatus("idle");
    setErrorMessage(null);
    setPokusano(false);
  }

  // ── Prijava lozinkom ─────────────────────────────────────────────────────
  async function prijaviLozinkom(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setPokusano(true);
    setErrorMessage(null);
    if (!cleanEmail || formatEmail || lozinka.length === 0 || zauzet) return;

    setStatus("radim");
    try {
      await signIn("password", { email: cleanEmail, password: lozinka, flow: "signIn" });
      // Uspeh: Convex Auth sam postavlja sesiju i preusmerava.
    } catch (error) {
      console.error("Prijava lozinkom nije uspela");
      setStatus("error");
      setErrorMessage(porukaGreske(error, "Email ili lozinka nisu tačni."));
    }
  }

  // ── Zaboravljena lozinka: traži kod ──────────────────────────────────────
  async function traziKodZaReset(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setPokusano(true);
    setErrorMessage(null);
    if (!cleanEmail || formatEmail || zauzet) return;

    setStatus("radim");
    try {
      await signIn("password", { email: cleanEmail, flow: "reset" });
      setKodNamena("reset");
      setKod("");
      setNovaLozinka("");
      idiNa("kod");
      setResendCooldown(30);
    } catch (error) {
      console.error("Traženje koda za promenu lozinke nije uspelo");
      setStatus("error");
      setErrorMessage(porukaGreske(error, "Slanje koda nije uspelo. Proveri adresu."));
    }
  }

  // ── Kod na email umesto lozinke ──────────────────────────────────────────
  async function posaljiKodZaPrijavu() {
    setPokusano(true);
    setErrorMessage(null);
    if (!cleanEmail || formatEmail || zauzet) return;

    setStatus("radim");
    try {
      await signIn("resend", { email: cleanEmail });
      setKodNamena("prijava");
      setKod("");
      idiNa("kod");
      setResendCooldown(30);
    } catch (error) {
      console.error("Slanje koda nije uspelo");
      setStatus("error");
      setErrorMessage(porukaGreske(error, "Slanje koda nije uspelo. Proveri adresu."));
    }
  }

  // ── Potvrda koda ─────────────────────────────────────────────────────────
  async function potvrdiKod(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setPokusano(true);
    setErrorMessage(null);
    if (kod.length !== 6 || zauzet) return;
    if (kodNamena === "reset" && (novaLozinka.length === 0 || novaLozinkaGreska)) return;

    setStatus("radim");
    try {
      if (kodNamena === "prijava") {
        await signIn("resend", { email: cleanEmail, code: kod });
      } else {
        await signIn("password", {
          email: cleanEmail,
          code: kod,
          newPassword: novaLozinka,
          flow: "reset-verification",
        });
      }
      // Uspeh: sesija je postavljena, preusmeravanje ide samo.
    } catch (error) {
      console.error("Potvrda koda nije uspela");
      setStatus("error");
      setErrorMessage(
        porukaGreske(error, "Kod nije ispravan ili je istekao. Zatraži novi."),
      );
    }
  }

  async function posaljiKodPonovo() {
    if (kodNamena === "prijava") return posaljiKodZaPrijavu();
    return traziKodZaReset();
  }

  const emailPolje = (disabled: boolean) => (
    <Field label="Email" error={emailGreska}>
      {(field) => (
        <Input
          {...field}
          name="email"
          type="email"
          autoComplete="username"
          required
          placeholder="ti@enigmait.rs"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setErrorMessage(null);
          }}
          disabled={disabled}
          className="h-11"
        />
      )}
    </Field>
  );

  const lozinkaPolje = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    greska: string | null,
    autoComplete: string,
  ) => (
    <Field label={label} error={greska}>
      {(field) => (
        <div className="relative">
          <Input
            {...field}
            name={autoComplete === "current-password" ? "password" : "new-password"}
            type={prikaziLozinku ? "text" : "password"}
            autoComplete={autoComplete}
            required
            placeholder="••••••••••"
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setErrorMessage(null);
            }}
            disabled={zauzet}
            className="h-11 pr-11"
          />
          <button
            type="button"
            onClick={() => setPrikaziLozinku((v) => !v)}
            aria-label={prikaziLozinku ? "Sakrij lozinku" : "Prikaži lozinku"}
            className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-text-muted transition-colors hover:text-foreground cursor-pointer"
          >
            {prikaziLozinku ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      )}
    </Field>
  );

  const greskaBlok = (naslov: string) =>
    errorMessage ? (
      <FeedbackNote tone="danger" title={naslov}>
        {errorMessage}
      </FeedbackNote>
    ) : null;

  return (
    <main className="flex min-h-svh flex-1 items-center justify-center px-[var(--gutter)] py-16">
      <Reveal className="w-full max-w-sm">
        <div className="rounded-xl border bg-card p-8 shadow-elev-1">
          <p className="heading-caps text-micro font-medium text-accent-400">
            Enigma · Command Center
          </p>

          {/* ─────────── Kod ─────────── */}
          {ekran === "kod" ? (
            <div className="mt-6">
              <div className="flex size-10 items-center justify-center rounded-full border border-line-strong text-accent-400">
                <KeyRound className="size-5" aria-hidden />
              </div>
              <h1 className="mt-4 text-h2 text-foreground">
                {kodNamena === "reset" ? "Nova lozinka" : "Unesi 6-cifreni kod"}
              </h1>
              <p role="status" className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {kodNamena === "reset"
                  ? "Unesi kod sa mejla i novu lozinku."
                  : "Kod za prijavu je poslat."}{" "}
                Poslat je na{" "}
                <span className="font-medium text-foreground">{cleanEmail}</span>. Važi 15 minuta.
              </p>

              <form onSubmit={potvrdiKod} className="mt-6 space-y-4">
                <Field label="Verifikacioni kod" error={kodGreska}>
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
                      value={kod}
                      onChange={(e) => {
                        setKod(e.target.value.replace(/\D/g, "").slice(0, 6));
                        setErrorMessage(null);
                      }}
                      disabled={zauzet}
                      className="h-12 text-center font-mono text-xl font-bold tracking-[0.4em] placeholder:tracking-[0.4em]"
                    />
                  )}
                </Field>

                {kodNamena === "reset" &&
                  lozinkaPolje(
                    "Nova lozinka",
                    novaLozinka,
                    setNovaLozinka,
                    novaLozinkaGreska,
                    "new-password",
                  )}

                <Button
                  type="submit"
                  disabled={zauzet || kod.length !== 6}
                  className="h-11 w-full"
                >
                  {zauzet ? (
                    <>
                      <LoaderCircle className="animate-spin" />
                      Proveravam…
                    </>
                  ) : (
                    <>
                      {kodNamena === "reset" ? "Sačuvaj i prijavi se" : "Prijavi se"}
                      <ArrowRight />
                    </>
                  )}
                </Button>

                {greskaBlok("Greška pri prijavi")}

                <div className="flex flex-col gap-2 border-t border-line-muted pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={resendCooldown > 0 || zauzet}
                    onClick={() => posaljiKodPonovo()}
                    className="w-full justify-center text-xs text-muted-foreground hover:text-foreground"
                  >
                    {resendCooldown > 0 ? (
                      <>
                        <RotateCw className="mr-1.5 size-3.5 opacity-50" />
                        Pošalji ponovo za {resendCooldown}s
                      </>
                    ) : (
                      <>
                        <RotateCw className="mr-1.5 size-3.5" />
                        Nisi dobio kod? Pošalji ponovo
                      </>
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => idiNa("lozinka")}
                    className="w-full justify-center text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="mr-1.5 size-3.5" />
                    Nazad na prijavu
                  </Button>
                </div>
              </form>
            </div>
          ) : ekran === "zaboravljena" ? (
            /* ─────────── Zaboravljena lozinka ─────────── */
            <>
              <h1 className="mt-5 text-h2 text-foreground">Promena lozinke</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Unesi email — stiže ti kod, pa postavljaš novu lozinku.
              </p>

              <form onSubmit={traziKodZaReset} className="mt-6 space-y-4">
                {emailPolje(zauzet)}

                <Button type="submit" disabled={zauzet} className="h-11 w-full">
                  {zauzet ? (
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

                {greskaBlok("Kod nije poslat")}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => idiNa("lozinka")}
                  className="w-full justify-center text-xs text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="mr-1.5 size-3.5" />
                  Nazad na prijavu
                </Button>
              </form>
            </>
          ) : (
            /* ─────────── Prijava lozinkom (podrazumevano) ─────────── */
            <>
              <h1 className="mt-5 text-h2 text-foreground">Prijava</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Email i lozinka.
              </p>

              <form onSubmit={prijaviLozinkom} className="mt-6 space-y-4">
                {emailPolje(zauzet)}
                {lozinkaPolje("Lozinka", lozinka, setLozinka, null, "current-password")}

                <Button
                  type="submit"
                  disabled={zauzet || lozinka.length === 0}
                  className="h-11 w-full"
                >
                  {zauzet ? (
                    <>
                      <LoaderCircle className="animate-spin" />
                      Prijavljujem…
                    </>
                  ) : (
                    <>
                      Prijavi se
                      <ArrowRight />
                    </>
                  )}
                </Button>

                {greskaBlok("Greška pri prijavi")}

                <div className="flex flex-col gap-1 border-t border-line-muted pt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => idiNa("zaboravljena")}
                    className="w-full justify-center text-xs text-muted-foreground hover:text-foreground"
                  >
                    Zaboravio sam lozinku
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={zauzet}
                    onClick={() => posaljiKodZaPrijavu()}
                    className="w-full justify-center text-xs text-muted-foreground hover:text-foreground"
                  >
                    Pošalji mi kod na email umesto toga
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </Reveal>
    </main>
  );
}
