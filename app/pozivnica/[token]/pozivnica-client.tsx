"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LogIn,
  RotateCw,
  UserPlus,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/app/form-kit";
import { FeedbackNote } from "@/components/app/feedback";
import { Reveal } from "@/components/motion/reveal";
import { BrandMoment } from "@/components/app/system/brand-moment";
import { cn } from "@/lib/utils";
import {
  PASSWORD_RULES,
  prvaGreskaLozinke,
  lozinkaValjana,
} from "@/lib/password-rules";

type Status = "idle" | "radim" | "uspeh" | "error";

/** Svaki neispravan status ima SVOJU poruku — nijedna se ne svodi na drugu (§7). */
const STATUS_PORUKA: Record<
  "ne_postoji" | "istekla" | "iskoriscena" | "povucena",
  { naslov: string; telo: string }
> = {
  ne_postoji: {
    naslov: "Pozivnica ne postoji",
    telo: "Link nije ispravan ili je nepotpun. Zatraži novu pozivnicu od administratora.",
  },
  istekla: {
    naslov: "Pozivnica je istekla",
    telo: "Ova pozivnica je prošla rok važenja. Zatraži novu od administratora.",
  },
  iskoriscena: {
    naslov: "Pozivnica je već iskorišćena",
    telo: "Nalog je već napravljen ovim linkom. Prijavi se lozinkom.",
  },
  povucena: {
    naslov: "Pozivnica je povučena",
    telo: "Administrator je povukao ovu pozivnicu. Zatraži novu.",
  },
};

/**
 * Poruka se izvodi iz onoga što je server stvarno rekao. Nepoznat uzrok se
 * prikazuje KAO nepoznat, nikad kao „pogrešni podaci"; a „server nije odgovorio"
 * ima svoju poruku i nikad se ne meša sa pogrešnim unosom (§7).
 */
function porukaGreske(error: unknown): string {
  const data = (error as { data?: unknown } | null)?.data;
  if (data && typeof data === "object" && "message" in data) {
    const m = (data as { message?: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
  }

  const tekst = error instanceof Error ? error.message : String(error);

  if (/Failed to fetch|NetworkError|Load failed|ERR_|network|timeout/i.test(tekst)) {
    return "Server nije odgovorio. Proveri vezu i pokušaj ponovo za koji trenutak.";
  }
  if (tekst.includes("Lozinka mora") || tekst.includes("Lozinka može")) {
    return tekst;
  }
  if (/AccountAlreadyExists|already exists/i.test(tekst)) {
    return "Nalog sa tom adresom već postoji. Prijavi se lozinkom.";
  }
  if (tekst.includes("Pristup nije dozvoljen")) {
    return "Pristup nije dozvoljen za ovu adresu. Zatraži novu pozivnicu.";
  }
  return "Registracija nije prošla iz nepoznatog razloga. Pokušaj ponovo za koji trenutak.";
}

export function PozivnicaClient({ token }: { token: string }) {
  const inviteState = useQuery(api.invitesStore.getInvite, { token });
  const pripremiRegistraciju = useMutation(api.invitesStore.pripremiRegistraciju);
  const prihvatiPozivnicu = useMutation(api.invitesStore.prihvatiPozivnicu);
  const { signIn, signOut } = useAuthActions();
  const { isAuthenticated, isLoading: authSeUcitava } = useConvexAuth();
  const ja = useQuery(api.projekti.ja, isAuthenticated ? {} : "skip");
  const router = useRouter();

  const [korak, setKorak] = useState<"lozinka" | "kod">("lozinka");
  const [lozinka, setLozinka] = useState("");
  const [potvrda, setPotvrda] = useState("");
  const [kod, setKod] = useState("");
  const [prikaziLozinku, setPrikaziLozinku] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pokusano, setPokusano] = useState(false);
  const [sporoPreusmeravanje, setSporoPreusmeravanje] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const zauzet = status === "radim";

  // Postojeći korisnik prihvata poziv posle prijave (dodatno članstvo).
  const [prihvatam, setPrihvatam] = useState(false);
  const [greskaPrihvatanja, setGreskaPrihvatanja] = useState<string | null>(null);
  // Ime projekta se „zaključa“ kao i adresa ispod: posle prihvatanja ili
  // registracije pozivnica više ne važi, pa ga upit više ne vraća baš dok
  // preusmeravamo.
  const [imeProjekta, setImeProjekta] = useState<string | null>(null);
  if (
    inviteState?.status === "vazi" &&
    inviteState.projekat !== undefined &&
    inviteState.projekat.ime !== imeProjekta
  ) {
    setImeProjekta(inviteState.projekat.ime);
  }
  const postojiNalog =
    inviteState?.status === "vazi" && inviteState.postojiNalog === true;

  async function prihvati() {
    if (prihvatam) return;
    setPrihvatam(true);
    setGreskaPrihvatanja(null);
    try {
      const { slug } = await prihvatiPozivnicu({ token });
      // U hubu je projekat na `/<slug>`; na panel domenu tog projekta proxy
      // kanonski preusmerava `/<slug>` na `/`.
      router.push(`/${slug}`);
    } catch (error) {
      console.error("Prihvatanje pozivnice nije uspelo");
      setGreskaPrihvatanja(porukaGreske(error));
      setPrihvatam(false);
    }
  }

  async function odjavi() {
    await signOut();
  }

  // „Uđi ručno" se pojavi baš kad `router.push` kasni, pa ne sme da zavisi od
  // istog rutera: namerno puno učitavanje strane, ne `<Link>`.
  const udjiRucno = () => window.location.assign("/");

  // Adresa iz pozivnice se „zaključa" čim jednom stigne. Bez ovoga: u trenutku
  // uspešne potvrde koda sesija se napravi → pozivnica dobije `usedAt` →
  // reaktivni `getInvite` prestane da bude „vazi" → `inviteState.email` nestane
  // baš dok preusmeravamo. Zaključana vrednost preživljava tu tranziciju.
  const [email, setEmail] = useState("");
  if (
    inviteState?.status === "vazi" &&
    inviteState.email &&
    inviteState.email !== email
  ) {
    setEmail(inviteState.email);
  }

  // Neslaganje potvrde se javlja PRI KUCANJU, ne tek pri slanju (§6).
  const potvrdaGreska =
    potvrda.length > 0 && potvrda !== lozinka ? "Lozinke se ne poklapaju." : null;

  // Ako preusmeravanje ne krene za 3 s, ekran to kaže i ponudi link — tiho
  // čekanje je najgori ishod (§7).
  useEffect(() => {
    if (status !== "uspeh") return;
    const t = window.setTimeout(() => setSporoPreusmeravanje(true), 3000);
    return () => window.clearTimeout(t);
  }, [status]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  // Neslaganje potvrde se javlja pri kucanju — vidi `potvrdaGreska` gore.
  const kodGreska =
    pokusano && kod.length > 0 && kod.length < 6
      ? "Unesi svih 6 cifara koda."
      : null;

  async function napraviNalog(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setPokusano(true);
    setErrorMessage(null);

    if (!email || zauzet) return;

    if (!lozinkaValjana(lozinka)) {
      setStatus("error");
      setErrorMessage(prvaGreskaLozinke(lozinka) ?? "Lozinka ne ispunjava pravila.");
      return;
    }
    if (lozinka !== potvrda) {
      setStatus("error");
      setErrorMessage("Lozinke se ne poklapaju.");
      return;
    }

    setStatus("radim");
    try {
      // 1) Otvori prozor registracije (ponovna provera heša, roka, iskorišćenosti;
      //    server proverava i da adresa odgovara pozivnici — §15).
      await pripremiRegistraciju({ token, email });
      // 2) Napravi nalog. Sa uključenim `verify`, ovo šalje kod za potvrdu umesto
      //    da odmah napravi sesiju → prelazimo na korak unosa koda.
      const res = await signIn("password", { email, password: lozinka, flow: "signUp" });
      if (res.signingIn) {
        // Ako je (retko) odmah ulogovan, preusmeravamo bez koraka koda.
        setStatus("uspeh");
        router.push("/");
        return;
      }
      setKod("");
      setPokusano(false);
      setStatus("idle");
      setKorak("kod");
      setResendCooldown(30);
    } catch (error) {
      console.error("Registracija preko pozivnice nije uspela");
      setStatus("error");
      setErrorMessage(porukaGreske(error));
    }
  }

  async function potvrdiKod(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setPokusano(true);
    setErrorMessage(null);
    if (kod.length !== 6 || zauzet) return;

    setStatus("radim");
    try {
      await signIn("password", { email, code: kod, flow: "email-verification" });
      setStatus("uspeh");
      router.push("/");
    } catch (error) {
      console.error("Potvrda koda nije uspela");
      setStatus("error");
      setErrorMessage(porukaGreske(error));
    }
  }

  // Ponovno slanje koda = ponovni `signUp` (nalog već postoji posle prvog koraka,
  // pa se samo pošalje nov kod, bez greške).
  async function posaljiKodPonovo() {
    if (zauzet || resendCooldown > 0) return;
    setErrorMessage(null);
    setStatus("radim");
    try {
      await signIn("password", { email, password: lozinka, flow: "signUp" });
      setStatus("idle");
      setResendCooldown(30);
    } catch (error) {
      console.error("Ponovno slanje koda nije uspelo");
      setStatus("error");
      setErrorMessage(porukaGreske(error));
    }
  }

  return (
    <BrandMoment>
      <Reveal className="w-full max-w-sm">
        {/* Ime proizvoda je iznad kartice (BrandMoment); prvi blok u kartici
            zato nema gornji razmak. */}
        <div className="rounded-xl border bg-card p-8 shadow-elev-1 [&>*:first-child]:mt-0">

          {inviteState === undefined || authSeUcitava ? (
            /* ─────────── Učitavanje pozivnice ─────────── */
            <div className="mt-6 space-y-4" role="status" aria-live="polite">
              <div className="h-7 w-40 animate-pulse rounded bg-surface-raised" />
              <div className="h-24 w-full animate-pulse rounded bg-surface-raised" />
              <span className="sr-only">Učitavam pozivnicu…</span>
            </div>
          ) : inviteState.status !== "vazi" && status !== "uspeh" ? (
            /* ─────────── Nevažeća pozivnica ─────────── */
            /* `status !== "uspeh"`: pri uspešnoj potvrdi koda pozivnica se
               potroši (dobije `usedAt`) i reaktivni upit je proglasi
               „iskorišćenom" u istom trenu kad preusmeravamo. Bez ove zaštite
               bi na 0.2 s bljesnuo ekran „pozivnica iskorišćena" pre nego što
               `router.push("/")` odradi. Kad smo uspeli, ostajemo na koraku sa
               porukom o preusmeravanju. */
            <div className="mt-6">
              <FeedbackNote
                tone="danger"
                title={STATUS_PORUKA[inviteState.status].naslov}
              >
                {STATUS_PORUKA[inviteState.status].telo}
              </FeedbackNote>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => router.push("/login")}
                className="mt-4 w-full justify-center text-xs text-muted-foreground hover:text-foreground"
              >
                Idi na prijavu
              </Button>
            </div>
          ) : isAuthenticated && korak === "lozinka" && status !== "uspeh" ? (
            /* ─────────── Prijavljen korisnik: prihvatanje poziva ─────────── */
            <div className="mt-6">
              <div className="flex size-10 items-center justify-center rounded-full border border-line-strong text-mod">
                <UserPlus className="size-5" aria-hidden />
              </div>
              <h1 className="mt-4 text-h2 text-foreground">
                {imeProjekta ? `Poziv u ${imeProjekta}` : "Poziv u projekat"}
              </h1>
              {ja === undefined ? (
                <div className="mt-4 space-y-3" role="status" aria-live="polite">
                  <div className="h-12 w-full animate-pulse rounded bg-surface-raised" />
                  <span className="sr-only">Učitavam nalog…</span>
                </div>
              ) : ja.email !== null && ja.email.trim().toLowerCase() === email ? (
                <>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Poziv je za tvoju adresu{" "}
                    <span className="font-medium text-foreground">{email}</span>.
                    Projekat se dodaje u tvoj spisak, a ostali projekti ostaju
                    isti.
                  </p>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={prihvati}
                    disabled={prihvatam}
                    className="mt-6 h-11 w-full"
                  >
                    {prihvatam ? (
                      <>
                        <LoaderCircle className="animate-spin" />
                        Prihvatam…
                      </>
                    ) : (
                      <>
                        {imeProjekta ? `Prihvati poziv u ${imeProjekta}` : "Prihvati poziv"}
                        <ArrowRight />
                      </>
                    )}
                  </Button>
                  {greskaPrihvatanja && (
                    <FeedbackNote tone="danger" title="Poziv nije prihvaćen" className="mt-4">
                      {greskaPrihvatanja}
                    </FeedbackNote>
                  )}
                </>
              ) : (
                <>
                  <FeedbackNote tone="warning" title="Poziv je za drugu adresu" className="mt-4">
                    {`Prijavljen si kao ${ja.email ?? "nalog bez adrese"}; poziv je za ${email}. Odjavi se pa se prijavi kao ${email}.`}
                  </FeedbackNote>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={odjavi}
                    className="mt-4 h-11 w-full"
                  >
                    Odjavi se
                  </Button>
                </>
              )}
            </div>
          ) : postojiNalog && korak === "lozinka" && status !== "uspeh" ? (
            /* ─────────── Postojeći nalog, odjavljen: prijava pa prihvatanje ─────────── */
            <div className="mt-6">
              <div className="flex size-10 items-center justify-center rounded-full border border-line-strong text-mod">
                <LogIn className="size-5" aria-hidden />
              </div>
              <h1 className="mt-4 text-h2 text-foreground">
                {imeProjekta ? `Poziv u ${imeProjekta}` : "Poziv u projekat"}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Za <span className="font-medium text-foreground">{email}</span>{" "}
                nalog već postoji. Prijavi se svojom lozinkom, pa prihvati poziv
                jednim klikom.
              </p>
              <Button
                type="button"
                variant="primary"
                onClick={() =>
                  router.push(`/login?pozivnica=${encodeURIComponent(token)}`)
                }
                className="mt-6 h-11 w-full"
              >
                Prijavi se da prihvatiš poziv
                <ArrowRight />
              </Button>
            </div>
          ) : korak === "kod" ? (
            /* ─────────── Potvrda adrese kodom ─────────── */
            <div className="mt-6">
              <div className="flex size-10 items-center justify-center rounded-full border border-line-strong text-mod">
                <KeyRound className="size-5" aria-hidden />
              </div>
              <h1 className="mt-4 text-h2 text-foreground">Potvrdi adresu</h1>
              <p role="status" className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Poslali smo 6-cifreni kod na{" "}
                <span className="font-medium text-foreground">{email}</span>. Unesi ga da
                završiš registraciju. Kod se traži samo ovaj jednom. Važi 15 minuta.
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
                      disabled={zauzet || status === "uspeh"}
                      className="h-12 text-center font-mono text-xl font-bold tracking-[0.4em] placeholder:tracking-[0.4em]"
                    />
                  )}
                </Field>

                <Button
                  type="submit"
                  variant="primary"
                  disabled={zauzet || status === "uspeh" || kod.length !== 6}
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

                {status === "uspeh" && (
                  <FeedbackNote
                    tone={sporoPreusmeravanje ? "warning" : "progress"}
                    title={
                      sporoPreusmeravanje
                        ? "Nalog je napravljen, ali preusmeravanje kasni"
                        : "Nalog je napravljen. Prebacujem te u aplikaciju…"
                    }
                    action={
                      sporoPreusmeravanje ? (
                        <button
                          type="button"
                          onClick={udjiRucno}
                          className="text-xs font-medium text-mod underline underline-offset-2"
                        >
                          Uđi ručno
                        </button>
                      ) : undefined
                    }
                  >
                    {sporoPreusmeravanje
                      ? "Ako te ne prebaci automatski, klikni na link."
                      : undefined}
                  </FeedbackNote>
                )}

                {status === "error" && errorMessage && pokusano && (
                  <FeedbackNote tone="danger" title="Potvrda nije prošla">
                    {errorMessage}
                  </FeedbackNote>
                )}

                {status !== "uspeh" && (
                  <div className="flex flex-col gap-2 border-t border-line-soft pt-2">
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
                      onClick={() => {
                        setKorak("lozinka");
                        setStatus("idle");
                        setErrorMessage(null);
                        setPokusano(false);
                      }}
                      className="w-full justify-center text-xs text-muted-foreground hover:text-foreground"
                    >
                      <ArrowLeft className="mr-1.5 size-3.5" />
                      Nazad
                    </Button>
                  </div>
                )}
              </form>
            </div>
          ) : (
            /* ─────────── Registracija ─────────── */
            <>
              <div className="mt-6 flex size-10 items-center justify-center rounded-full border border-line-strong text-mod">
                <KeyRound className="size-5" aria-hidden />
              </div>
              <h1 className="mt-4 text-h2 text-foreground">
                {imeProjekta ? `Poziv u ${imeProjekta}` : "Napravi nalog"}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Pozivnica važi za adresu ispod. Postavi lozinku, pa potvrdi adresu
                jednim kodom sa mejla — traži se samo pri registraciji.
              </p>

              <form onSubmit={napraviNalog} className="mt-6 space-y-4">
                <Field label="Email">
                  {(field) => (
                    <Input
                      {...field}
                      name="email"
                      type="email"
                      autoComplete="username"
                      value={email}
                      readOnly
                      disabled
                      className="h-11"
                    />
                  )}
                </Field>

                <Field label="Lozinka">
                  {(field) => (
                    <div className="relative">
                      <Input
                        {...field}
                        name="new-password"
                        type={prikaziLozinku ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        placeholder="••••••••"
                        value={lozinka}
                        onChange={(e) => {
                          setLozinka(e.target.value);
                          setErrorMessage(null);
                        }}
                        disabled={zauzet || status === "uspeh"}
                        className="h-11 pr-11"
                      />
                      <button
                        type="button"
                        onClick={() => setPrikaziLozinku((v) => !v)}
                        aria-label={prikaziLozinku ? "Sakrij lozinku" : "Prikaži lozinku"}
                        className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-text-muted transition-colors hover:text-foreground cursor-pointer"
                      >
                        {prikaziLozinku ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    </div>
                  )}
                </Field>

                {/* Uslovi se čekiraju uživo dok korisnik kuca (§5). */}
                <ul className="space-y-1">
                  {PASSWORD_RULES.map((rule) => {
                    const ok = rule.test(lozinka);
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

                <Field label="Potvrdi lozinku" error={potvrdaGreska}>
                  {(field) => (
                    <Input
                      {...field}
                      name="confirm-password"
                      type={prikaziLozinku ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      placeholder="••••••••"
                      value={potvrda}
                      onChange={(e) => {
                        setPotvrda(e.target.value);
                        setErrorMessage(null);
                      }}
                      disabled={zauzet || status === "uspeh"}
                      className="h-11"
                    />
                  )}
                </Field>

                <Button
                  type="submit"
                  variant="primary"
                  disabled={
                    zauzet ||
                    status === "uspeh" ||
                    !lozinkaValjana(lozinka) ||
                    lozinka !== potvrda
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
                      Napravi nalog
                      <ArrowRight />
                    </>
                  )}
                </Button>

                {status === "uspeh" && (
                  <FeedbackNote
                    tone={sporoPreusmeravanje ? "warning" : "progress"}
                    title={
                      sporoPreusmeravanje
                        ? "Nalog je napravljen, ali preusmeravanje kasni"
                        : "Nalog je napravljen. Prebacujem te u aplikaciju…"
                    }
                    action={
                      sporoPreusmeravanje ? (
                        <button
                          type="button"
                          onClick={udjiRucno}
                          className="text-xs font-medium text-mod underline underline-offset-2"
                        >
                          Uđi ručno
                        </button>
                      ) : undefined
                    }
                  >
                    {sporoPreusmeravanje
                      ? "Ako te ne prebaci automatski, klikni na link."
                      : undefined}
                  </FeedbackNote>
                )}

                {status === "error" && errorMessage && pokusano && (
                  <FeedbackNote tone="danger" title="Registracija nije prošla">
                    {errorMessage}
                  </FeedbackNote>
                )}
              </form>
            </>
          )}
        </div>
      </Reveal>
    </BrandMoment>
  );
}
