"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  RotateCw,
  ShieldPlus,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/app/form-kit";
import { FeedbackNote } from "@/components/app/feedback";
import { Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";
import {
  PASSWORD_RULES,
  prvaGreskaLozinke,
  lozinkaValjana,
} from "@/lib/password-rules";

/**
 * Ekrani prijave.
 *
 * `lozinka`      — podrazumevani i JEDINI ulaz: email + lozinka. Prijava se nikad
 *                  ne radi kodom (§11).
 * `zaboravljena` — traženje koda za promenu lozinke.
 * `kod`          — 6-cifreni kod za reset lozinke (kod → nova lozinka).
 * `adminSetup`   — pravljenje PRVOG admin naloga (setup šifra + email + lozinka).
 * `adminKod`     — potvrda adrese kodom, tik posle pravljenja admin naloga.
 *
 * Postavljanje lozinke za obične korisnike ide isključivo preko pozivnice
 * (`/pozivnica/<token>`), ne odavde.
 */
type Ekran = "lozinka" | "zaboravljena" | "kod" | "adminSetup" | "adminKod";
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

/**
 * Poruka se izvodi iz onoga što je server stvarno rekao. `ConvexError` nosi
 * poruku u `data.message`; nepoznat uzrok se prikazuje KAO nepoznat, a
 * „server nije odgovorio" ima svoju poruku i nikad se ne meša sa pogrešnim
 * unosom (§7). Nijedna od poruka se ne svodi na drugu.
 */
function porukaGreske(error: unknown, podrazumevana: string): string {
  const data = (error as { data?: unknown } | null)?.data;
  if (data && typeof data === "object" && "message" in data) {
    const m = (data as { message?: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
  }

  const tekst = error instanceof Error ? error.message : String(error);

  if (/Failed to fetch|NetworkError|Load failed|ERR_|network|timeout/i.test(tekst)) {
    return "Server nije odgovorio. Proveri vezu i pokušaj ponovo za koji trenutak.";
  }
  if (tekst.includes("Greška servera")) {
    return "Greška servera. Pokušaj ponovo za koji trenutak.";
  }
  if (tekst.includes("Setup nije konfigurisan")) {
    return "Setup nije konfigurisan na serveru.";
  }
  if (tekst.includes("Setup šifra")) {
    return "Setup šifra nije tačna.";
  }
  if (tekst.includes("Admin nalog već postoji")) {
    return "Admin nalog već postoji. Prijavi se lozinkom.";
  }
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
  const trebaSetup = useQuery(api.invitesStore.trebaSetup);
  const pripremiAdminSetup = useMutation(api.invitesStore.pripremiAdminSetup);

  const [ekran, setEkran] = useState<Ekran>("lozinka");

  const [email, setEmail] = useState("");
  const [lozinka, setLozinka] = useState("");
  const [novaLozinka, setNovaLozinka] = useState("");
  const [kod, setKod] = useState("");

  // Bootstrap admina.
  const [setupKod, setSetupKod] = useState("");
  const [adminLozinka, setAdminLozinka] = useState("");
  const [adminPotvrda, setAdminPotvrda] = useState("");

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
  const novaLozinkaGreska = prvaGreskaLozinke(novaLozinka);
  const adminLozinkaGreska = prvaGreskaLozinke(adminLozinka);
  const adminPotvrdaGreska =
    adminPotvrda.length > 0 && adminPotvrda !== adminLozinka
      ? "Lozinke se ne poklapaju."
      : null;
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

  // ── Potvrda koda za reset lozinke ────────────────────────────────────────
  async function potvrdiResetKod(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setPokusano(true);
    setErrorMessage(null);
    if (kod.length !== 6 || zauzet) return;
    if (novaLozinka.length === 0 || novaLozinkaGreska) return;

    setStatus("radim");
    try {
      await signIn("password", {
        email: cleanEmail,
        code: kod,
        newPassword: novaLozinka,
        flow: "reset-verification",
      });
      // Uspeh: sesija je postavljena, preusmeravanje ide samo.
    } catch (error) {
      console.error("Potvrda koda nije uspela");
      setStatus("error");
      setErrorMessage(
        porukaGreske(error, "Kod nije ispravan ili je istekao. Zatraži novi."),
      );
    }
  }

  // ── Bootstrap: napravi prvi admin nalog ──────────────────────────────────
  async function napraviAdminNalog(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setPokusano(true);
    setErrorMessage(null);
    if (!cleanEmail || formatEmail || zauzet) return;
    if (setupKod.trim().length === 0) {
      setStatus("error");
      setErrorMessage("Unesi setup šifru.");
      return;
    }
    if (!lozinkaValjana(adminLozinka)) {
      setStatus("error");
      setErrorMessage(prvaGreskaLozinke(adminLozinka) ?? "Lozinka ne ispunjava pravila.");
      return;
    }
    if (adminLozinka !== adminPotvrda) {
      setStatus("error");
      setErrorMessage("Lozinke se ne poklapaju.");
      return;
    }

    setStatus("radim");
    try {
      // 1) Otvori prozor za bootstrap (proverava šifru, upisuje red u `invites`).
      await pripremiAdminSetup({ setupCode: setupKod, email: cleanEmail });
      // 2) Napravi nalog. Sa uključenim `verify`, ovo šalje kod umesto da odmah
      //    napravi sesiju → prelazimo na korak unosa koda.
      const res = await signIn("password", {
        email: cleanEmail,
        password: adminLozinka,
        flow: "signUp",
      });
      if (res.signingIn) return; // ako je (retko) odmah ulogovan, redirect ide sam
      setKod("");
      idiNa("adminKod");
      setResendCooldown(30);
    } catch (error) {
      console.error("Pravljenje admin naloga nije uspelo");
      setStatus("error");
      setErrorMessage(porukaGreske(error, "Pravljenje naloga nije prošlo. Pokušaj ponovo."));
    }
  }

  // ── Bootstrap: potvrda adrese kodom ──────────────────────────────────────
  async function potvrdiAdminKod(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setPokusano(true);
    setErrorMessage(null);
    if (kod.length !== 6 || zauzet) return;

    setStatus("radim");
    try {
      await signIn("password", {
        email: cleanEmail,
        code: kod,
        flow: "email-verification",
      });
      // Uspeh: sesija je postavljena, preusmeravanje ide samo.
    } catch (error) {
      console.error("Potvrda admin koda nije uspela");
      setStatus("error");
      setErrorMessage(
        porukaGreske(error, "Kod nije ispravan ili je istekao. Zatraži novi."),
      );
    }
  }

  // Ponovno slanje admin koda = ponovni `signUp` (nalog već postoji, pa se samo
  // pošalje nov kod, bez greške).
  async function posaljiAdminKodPonovo() {
    if (zauzet || resendCooldown > 0) return;
    setErrorMessage(null);
    setStatus("radim");
    try {
      await signIn("password", {
        email: cleanEmail,
        password: adminLozinka,
        flow: "signUp",
      });
      setStatus("idle");
      setResendCooldown(30);
    } catch (error) {
      console.error("Ponovno slanje admin koda nije uspelo");
      setStatus("error");
      setErrorMessage(porukaGreske(error, "Slanje koda nije uspelo. Pokušaj ponovo."));
    }
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

  const kodPolje = (onChange: (v: string) => void, value: string) => (
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
          value={value}
          onChange={(e) => {
            onChange(e.target.value.replace(/\D/g, "").slice(0, 6));
            setErrorMessage(null);
          }}
          disabled={zauzet}
          className="h-12 text-center font-mono text-xl font-bold tracking-[0.4em] placeholder:tracking-[0.4em]"
        />
      )}
    </Field>
  );

  const lozinkaChecklist = (value: string) => (
    <ul className="space-y-1">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(value);
        return (
          <li
            key={rule.id}
            className={cn(
              "flex items-center gap-2 text-xs",
              ok ? "text-success" : "text-text-muted",
            )}
          >
            {ok ? (
              <Check className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <X className="size-3.5 shrink-0 opacity-50" aria-hidden />
            )}
            <span>{rule.label}</span>
          </li>
        );
      })}
    </ul>
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

          {/* ─────────── Reset lozinke: kod + nova lozinka ─────────── */}
          {ekran === "kod" ? (
            <div className="mt-6">
              <div className="flex size-10 items-center justify-center rounded-full border border-line-strong text-accent-400">
                <KeyRound className="size-5" aria-hidden />
              </div>
              <h1 className="mt-4 text-h2 text-foreground">Nova lozinka</h1>
              <p role="status" className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Unesi kod sa mejla i novu lozinku. Poslat je na{" "}
                <span className="font-medium text-foreground">{cleanEmail}</span>. Važi 15 minuta.
              </p>

              <form onSubmit={potvrdiResetKod} className="mt-6 space-y-4">
                {kodPolje(setKod, kod)}
                {lozinkaPolje(
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
                      Sačuvaj i prijavi se
                      <ArrowRight />
                    </>
                  )}
                </Button>

                {greskaBlok("Greška pri promeni lozinke")}

                <div className="flex flex-col gap-2 border-t border-line-muted pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={resendCooldown > 0 || zauzet}
                    onClick={() => traziKodZaReset()}
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
          ) : ekran === "adminKod" ? (
            /* ─────────── Bootstrap: potvrda adrese kodom ─────────── */
            <div className="mt-6">
              <div className="flex size-10 items-center justify-center rounded-full border border-line-strong text-accent-400">
                <ShieldPlus className="size-5" aria-hidden />
              </div>
              <h1 className="mt-4 text-h2 text-foreground">Potvrdi adresu</h1>
              <p role="status" className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Poslali smo 6-cifreni kod na{" "}
                <span className="font-medium text-foreground">{cleanEmail}</span>. Unesi ga da
                završiš pravljenje admin naloga. Važi 15 minuta.
              </p>

              <form onSubmit={potvrdiAdminKod} className="mt-6 space-y-4">
                {kodPolje(setKod, kod)}

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
                      Napravi nalog
                      <ArrowRight />
                    </>
                  )}
                </Button>

                {greskaBlok("Greška pri potvrdi")}

                <div className="flex flex-col gap-2 border-t border-line-muted pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={resendCooldown > 0 || zauzet}
                    onClick={() => posaljiAdminKodPonovo()}
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
          ) : ekran === "adminSetup" ? (
            /* ─────────── Bootstrap: pravljenje admin naloga ─────────── */
            <div className="mt-6">
              <div className="flex size-10 items-center justify-center rounded-full border border-line-strong text-accent-400">
                <ShieldPlus className="size-5" aria-hidden />
              </div>
              <h1 className="mt-4 text-h2 text-foreground">Napravi admin nalog</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Prvi nalog se pravi jednokratnom setup šifrom sa servera. Posle
                njega ostale pozivaš iz aplikacije.
              </p>

              <form onSubmit={napraviAdminNalog} className="mt-6 space-y-4">
                <Field label="Setup šifra">
                  {(field) => (
                    <Input
                      {...field}
                      name="setup-code"
                      type="password"
                      autoComplete="off"
                      required
                      placeholder="Šifra sa servera"
                      value={setupKod}
                      onChange={(e) => {
                        setSetupKod(e.target.value);
                        setErrorMessage(null);
                      }}
                      disabled={zauzet}
                      className="h-11"
                    />
                  )}
                </Field>

                {emailPolje(zauzet)}

                {lozinkaPolje(
                  "Lozinka",
                  adminLozinka,
                  setAdminLozinka,
                  null,
                  "new-password",
                )}
                {lozinkaChecklist(adminLozinka)}

                {lozinkaPolje(
                  "Potvrdi lozinku",
                  adminPotvrda,
                  setAdminPotvrda,
                  adminPotvrdaGreska,
                  "new-password",
                )}

                <Button
                  type="submit"
                  disabled={
                    zauzet ||
                    !cleanEmail ||
                    !!formatEmail ||
                    setupKod.trim().length === 0 ||
                    !lozinkaValjana(adminLozinka) ||
                    adminLozinka !== adminPotvrda
                  }
                  className="h-11 w-full"
                >
                  {zauzet ? (
                    <>
                      <LoaderCircle className="animate-spin" />
                      Pravim nalog…
                    </>
                  ) : (
                    <>
                      Napravi admin nalog
                      <ArrowRight />
                    </>
                  )}
                </Button>

                {greskaBlok("Pravljenje naloga nije prošlo")}

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

                  {trebaSetup === true && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => idiNa("adminSetup")}
                      className="w-full justify-center text-xs text-muted-foreground hover:text-foreground"
                    >
                      <ShieldPlus className="mr-1.5 size-3.5" />
                      Napravi admin nalog
                    </Button>
                  )}
                </div>
              </form>
            </>
          )}
        </div>
      </Reveal>
    </main>
  );
}
