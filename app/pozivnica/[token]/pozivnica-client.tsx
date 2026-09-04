"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
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
  const { signIn } = useAuthActions();
  const router = useRouter();

  const [lozinka, setLozinka] = useState("");
  const [potvrda, setPotvrda] = useState("");
  const [prikaziLozinku, setPrikaziLozinku] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pokusano, setPokusano] = useState(false);
  const [sporoPreusmeravanje, setSporoPreusmeravanje] = useState(false);

  const zauzet = status === "radim";
  const email = inviteState?.status === "vazi" ? inviteState.email ?? "" : "";

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
      // 1) Otvori prozor registracije (ponovna provera heša, roka, iskorišćenosti).
      await pripremiRegistraciju({ token });
      // 2) Odmah zatim napravi nalog — bez `verify` u provajderu, ovo pravi sesiju.
      await signIn("password", { email, password: lozinka, flow: "signUp" });
      setStatus("uspeh");
      router.push("/");
    } catch (error) {
      console.error("Registracija preko pozivnice nije uspela");
      setStatus("error");
      setErrorMessage(porukaGreske(error));
    }
  }

  return (
    <main className="flex min-h-svh flex-1 items-center justify-center px-[var(--gutter)] py-16">
      <Reveal className="w-full max-w-sm">
        <div className="rounded-xl border bg-card p-8 shadow-elev-1">
          <p className="heading-caps text-micro font-medium text-accent-400">
            Enigma · Command Center
          </p>

          {inviteState === undefined ? (
            /* ─────────── Učitavanje pozivnice ─────────── */
            <div className="mt-6 space-y-4" role="status" aria-live="polite">
              <div className="h-7 w-40 animate-pulse rounded bg-surface-raised" />
              <div className="h-24 w-full animate-pulse rounded bg-surface-raised" />
              <span className="sr-only">Učitavam pozivnicu…</span>
            </div>
          ) : inviteState.status !== "vazi" ? (
            /* ─────────── Nevažeća pozivnica ─────────── */
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
          ) : (
            /* ─────────── Registracija ─────────── */
            <>
              <div className="mt-6 flex size-10 items-center justify-center rounded-full border border-line-strong text-accent-400">
                <KeyRound className="size-5" aria-hidden />
              </div>
              <h1 className="mt-4 text-h2 text-foreground">Napravi nalog</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Pozivnica važi za adresu ispod. Postavi lozinku i ušao/la si —
                bez ijednog koda na mejl.
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
                        <a
                          href="/"
                          className="text-xs font-medium text-accent-400 underline underline-offset-2"
                        >
                          Uđi ručno
                        </a>
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
    </main>
  );
}
