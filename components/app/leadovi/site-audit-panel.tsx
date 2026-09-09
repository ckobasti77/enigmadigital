"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { POJAS_NATPISI, type PojasKvaliteta } from "@/convex/lib/siteScore";
import { Bot, ExternalLink, Globe, History, ImageOff, Monitor, Smartphone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LinkChip } from "@/components/app/link-chip";
import { SiteStatusBadge } from "./site-status-badge";
import { CLAUDE_OCENE, LIGHTHOUSE_KATEGORIJE, ponudaNatpis } from "./site-audit-labels";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * SEKCIJA „SAJT" U PROFILU FIRME (GL10, sajt-ocena-plan.md §5.1)
 * ============================================================================
 *
 * Tri izvora, tri bloka, jedan pojas kvaliteta na vrhu. Brojevi kojih nema
 * pišu „—", nikad 0 (§0 pravilo 1). Ukupna ocena stiže izračunata pri čitanju
 * (`listSiteAudits`), nikad iz baze.
 *
 * Boje: pojas kvaliteta ide temperaturnom paletom (loš = hot, srednji = warm)
 * i `success` za dobar — isto pravilo kao bedž stanja sajta: loš sajt je
 * prodajni signal, ne greška. Cyan ostaje za interaktivno (linkovi, izbor
 * ocene u istoriji, preklopnik).
 */

type Audits = FunctionReturnType<typeof api.leadSiteAuditsStore.listSiteAudits>;
type Audit = Audits["audits"][number];

const POJAS_INK: Record<PojasKvaliteta, string> = {
  los: "text-temp-hot",
  srednji: "text-temp-warm",
  dobar: "text-success",
};

const POJAS_OKVIR: Record<PojasKvaliteta, string> = {
  los: "border-temp-hot/40 bg-temp-hot-bg",
  srednji: "border-temp-warm/40 bg-temp-warm-bg",
  dobar: "border-success/30 bg-success/10",
};

/** Lighthouse 0–100 u tri Googleova pojasa (0–49 / 50–89 / 90–100). */
function lighthouseInk(v: number): string {
  if (v >= 90) return "text-success";
  if (v >= 50) return "text-temp-warm";
  return "text-temp-hot";
}

type Prag = { dobro: number; treba: number };
/** Googleovi pragovi Core Web Vitals: dobro / treba popraviti / loše. */
const PRAGOVI: Record<"lcpMs" | "cls" | "inpMs" | "tbtMs", Prag> = {
  lcpMs: { dobro: 2500, treba: 4000 },
  cls: { dobro: 0.1, treba: 0.25 },
  inpMs: { dobro: 200, treba: 500 },
  tbtMs: { dobro: 200, treba: 600 },
};

function cwvInk(kljuc: keyof typeof PRAGOVI, v: number): string {
  const p = PRAGOVI[kljuc];
  if (v <= p.dobro) return "text-success";
  if (v <= p.treba) return "text-temp-warm";
  return "text-temp-hot";
}

function cwvNatpis(kljuc: keyof typeof PRAGOVI, v: number): string {
  const p = PRAGOVI[kljuc];
  if (v <= p.dobro) return "dobro";
  if (v <= p.treba) return "treba popraviti";
  return "loše";
}

function ms(v: number | undefined): string {
  if (v === undefined) return "—";
  return v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`;
}

function Crtica() {
  return <span className="text-text-muted">—</span>;
}

/** Traka 1–5: pet segmenata, popunjeni u boji pojasa te ocene. */
function Traka({ ocena }: { ocena: number }) {
  const ink = ocena <= 2 ? "bg-temp-hot" : ocena === 3 ? "bg-temp-warm" : "bg-success";
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5"
      role="img"
      aria-label={`${ocena} od 5`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={cn(
            "h-2 w-3 rounded-sm",
            i <= ocena ? ink : "bg-line",
          )}
        />
      ))}
    </span>
  );
}

function Naslov({ children, uz }: { children: React.ReactNode; uz?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-xs font-semibold text-foreground">{children}</h4>
      {uz}
    </div>
  );
}

export function SiteAuditPanel({
  workspaceId,
  companyId,
  company,
}: {
  workspaceId: Id<"workspaces">;
  companyId: Id<"leadCompanies">;
  company: Doc<"leadCompanies">;
}) {
  const data = useQuery(api.leadSiteAuditsStore.listSiteAudits, { workspaceId, companyId });
  const [izabranaId, setIzabranaId] = useState<Id<"leadSiteAudits"> | null>(null);
  const [strategija, setStrategija] = useState<"mobile" | "desktop">("mobile");

  const audit = useMemo<Audit | null>(() => {
    if (!data) return null;
    return data.audits.find((a) => a._id === izabranaId) ?? data.audits[0] ?? null;
  }, [data, izabranaId]);

  if (data === undefined) {
    return (
      <Card className="border-line bg-surface">
        <CardContent className="flex flex-col gap-4 p-4">
          <Skeleton className="h-6 w-72" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const sajtHref = company.website
    ? company.website.startsWith("http")
      ? company.website
      : `https://${company.website}`
    : null;

  if (audit === null) {
    return (
      <Card className="border-line bg-surface">
        <CardHeader className="border-b border-line pb-3">
          <CardTitle className="text-sm font-semibold text-foreground">Sajt</CardTitle>
          <CardDescription className="text-xs text-text-muted">
            Lighthouse, tehnologije i Claudeov sud nad snimcima — kome sajt treba popraviti, ne samo kome fali.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-4 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Globe className="size-3.5 shrink-0 text-text-muted" aria-hidden />
            {sajtHref ? (
              <LinkChip
                vrsta="website"
                href={sajtHref}
                suffix={
                  <SiteStatusBadge
                    status={company.sajtStatus}
                    https={company.sajtHttps}
                    proverenAt={company.sajtProverenAt}
                    napomena={company.sajtNapomena}
                  />
                }
              />
            ) : (
              <span className="text-text-muted">Sajt nije zabeležen.</span>
            )}
          </div>
          <p className="text-foreground">Sajt nije ocenjivan.</p>
          <p className="text-text-muted">
            {sajtHref
              ? "Ocena se pokreće iz skilla na Jovanovoj mašini, za jednu firmu ili za sve sa sajtom:"
              : "Bez upisanog sajta nema šta da se oceni. Kad se sajt upiše, ocena se pokreće iz skilla:"}
          </p>
          <pre className="overflow-x-auto rounded-lg border border-line bg-surface-raised/40 p-3 font-mono text-micro leading-relaxed text-foreground">
            {sajtHref
              ? `/generate-leads oceni-sajt ${sajtHref} --firma ${companyId}\n/generate-leads oceni-sajtove --izvoz <csv sa ?sajt=ima>`
              : `/generate-leads oceni-sajt <url> --firma ${companyId}`}
          </pre>
        </CardContent>
      </Card>
    );
  }

  const lh = audit.lighthouse?.[strategija];
  const imaMobile = Boolean(audit.lighthouse?.mobile);
  const imaDesktop = Boolean(audit.lighthouse?.desktop);
  const claude = audit.claude;
  const tehnologije = audit.tehnologije ?? [];

  // Tehnologije grupisane po kategoriji; CMS prva i istaknuta (plan §5.1).
  const grupe = new Map<string, typeof tehnologije>();
  for (const t of tehnologije) {
    const lista = grupe.get(t.kategorija) ?? [];
    lista.push(t);
    grupe.set(t.kategorija, lista);
  }
  const kategorije = [...grupe.keys()].sort((a, b) => {
    if (a === "CMS") return -1;
    if (b === "CMS") return 1;
    return (grupe.get(b)?.length ?? 0) - (grupe.get(a)?.length ?? 0) || a.localeCompare(b);
  });

  const jeNajnovija = audit._id === data.audits[0]?._id;

  return (
    <Card className="border-line bg-surface">
      {/* ── Zaglavlje: sajt · stanje · pojas kvaliteta · kad i ko ── */}
      <div className="flex flex-col gap-3 border-b border-line bg-surface-raised/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Globe className="size-3.5 shrink-0 text-text-muted" aria-hidden />
            <LinkChip
              vrsta="website"
              href={audit.url}
              suffix={
                <SiteStatusBadge
                  status={company.sajtStatus}
                  https={company.sajtHttps}
                  proverenAt={company.sajtProverenAt}
                  napomena={company.sajtNapomena}
                />
              }
            />
          </div>
          <p className="text-micro text-text-muted">
            ocenjeno {formatDateTime(audit.auditedAt)}
            {claude ? `, ${claude.model}` : ", bez Claudeovog suda"}
            {!jeNajnovija && " · starija ocena iz istorije"}
          </p>
        </div>

        <div
          className={cn(
            "flex shrink-0 items-baseline gap-2 rounded-lg border px-3 py-2",
            audit.pojas ? POJAS_OKVIR[audit.pojas] : "border-line-soft bg-surface",
          )}
          title="Ukupna ocena 0–100: 25 % mobilni performance, 15 % SEO, 10 % pristupačnost, 10 % dobre prakse, 40 % Claudeov sud. Računa se pri čitanju."
        >
          {audit.kvalitet !== null && audit.pojas ? (
            <>
              <span className={cn("text-sm font-semibold", POJAS_INK[audit.pojas])}>
                {POJAS_NATPISI[audit.pojas]}
              </span>
              <span className={cn("font-mono text-2xl font-bold tabular-nums", POJAS_INK[audit.pojas])}>
                {audit.kvalitet}
              </span>
              <span className="text-micro text-text-muted">/ 100</span>
            </>
          ) : (
            <span className="text-xs text-text-muted">nije ocenjeno — nijedan izvor nije dao broj</span>
          )}
        </div>
      </div>

      <CardContent className="flex flex-col gap-5 p-4 text-xs">
        {/* ── Lighthouse ── */}
        <section className="flex flex-col gap-2.5">
          <Naslov
            uz={
              (imaMobile || imaDesktop) && (
                <div
                  role="group"
                  aria-label="Uređaj"
                  className="inline-flex rounded-lg border border-line bg-surface-raised p-0.5"
                >
                  {(
                    [
                      { id: "mobile", natpis: "Mobilni", Ikona: Smartphone, ima: imaMobile },
                      { id: "desktop", natpis: "Desktop", Ikona: Monitor, ima: imaDesktop },
                    ] as const
                  ).map(({ id, natpis, Ikona, ima }) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={strategija === id}
                      disabled={!ima}
                      title={ima ? undefined : "PSI nije vratio ovaj izveštaj."}
                      onClick={() => setStrategija(id)}
                      className={cn(
                        "inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-micro font-medium transition-colors",
                        strategija === id
                          ? "bg-surface text-accent-400 shadow-(--elev-1)"
                          : "text-text-muted hover:text-foreground",
                        !ima && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <Ikona className="size-3" aria-hidden />
                      {natpis}
                    </button>
                  ))}
                </div>
              )
            }
          >
            Lighthouse
          </Naslov>

          {!lh ? (
            <p className="text-text-muted">
              {imaMobile || imaDesktop
                ? "PSI nije vratio izveštaj za ovaj uređaj."
                : "Lighthouse nije uspeo — vidi greške ispod."}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                {LIGHTHOUSE_KATEGORIJE.map(({ kljuc, natpis }) => {
                  const v = lh[kljuc];
                  return (
                    <div key={kljuc} className="flex flex-col gap-0.5">
                      <span className="text-micro text-text-muted">{natpis}</span>
                      {typeof v === "number" ? (
                        <span className={cn("font-mono text-xl font-semibold tabular-nums", lighthouseInk(v))}>
                          {v}
                        </span>
                      ) : (
                        <span className="font-mono text-xl text-text-muted">—</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line-soft pt-2 text-micro">
                {(
                  [
                    { kljuc: "lcpMs", natpis: "LCP", v: lh.lcpMs, tekst: ms(lh.lcpMs) },
                    { kljuc: "cls", natpis: "CLS", v: lh.cls, tekst: lh.cls === undefined ? "—" : lh.cls.toFixed(2) },
                    {
                      kljuc: lh.inpMs !== undefined ? "inpMs" : "tbtMs",
                      natpis: lh.inpMs !== undefined ? "INP" : "TBT",
                      v: lh.inpMs ?? lh.tbtMs,
                      tekst: ms(lh.inpMs ?? lh.tbtMs),
                    },
                  ] as const
                ).map(({ kljuc, natpis, v, tekst }) => (
                  <span key={natpis} className="inline-flex items-baseline gap-1">
                    <span className="text-text-muted">{natpis}</span>
                    {v === undefined ? (
                      <Crtica />
                    ) : (
                      <>
                        <span className={cn("font-mono font-semibold tabular-nums", cwvInk(kljuc, v))}>
                          {tekst}
                        </span>
                        <span className="text-text-muted">· {cwvNatpis(kljuc, v)}</span>
                      </>
                    )}
                  </span>
                ))}
                {audit.lighthouse?.terenski && (
                  <span className="inline-flex items-baseline gap-1">
                    <span className="text-text-muted">terenski</span>
                    <span className="font-semibold text-foreground">
                      {audit.lighthouse.terenski.ocena ?? "—"}
                    </span>
                    {audit.lighthouse.terenski.lcpMs !== undefined && (
                      <span className="text-text-muted">· LCP {ms(audit.lighthouse.terenski.lcpMs)}</span>
                    )}
                  </span>
                )}
              </div>
            </>
          )}
        </section>

        {/* ── Claudeov sud ── */}
        <section className="flex flex-col gap-2.5 border-t border-line-soft pt-4">
          <Naslov
            uz={
              claude && (
                <span className="inline-flex items-center gap-1 rounded border border-line bg-surface-raised px-1.5 py-px text-micro text-text-muted">
                  <Bot className="size-3" aria-hidden />
                  {claude.model}
                  {audit.claudeProsek !== null && (
                    <>
                      {" · prosek "}
                      <span className="font-mono tabular-nums text-foreground">
                        {audit.claudeProsek.toFixed(1)}
                      </span>
                      /5
                    </>
                  )}
                </span>
              )
            }
          >
            Claudeov sud
          </Naslov>

          {!claude ? (
            <p className="text-text-muted">
              Nema suda: sajt nije ocenjivan nad snimcima (bez snimka nema suda). Vidi greške ispod.
            </p>
          ) : (
            <>
              <ul className="flex flex-col divide-y divide-line-soft">
                {CLAUDE_OCENE.map(({ kljuc, natpis }) => {
                  const o = claude.ocene[kljuc];
                  return (
                    <li key={kljuc} className="flex flex-col gap-1 py-2 first:pt-0 sm:flex-row sm:items-start sm:gap-3">
                      <div className="flex w-56 shrink-0 items-center justify-between gap-2">
                        <span className="text-foreground">{natpis}</span>
                        <span className="inline-flex items-center gap-1.5">
                          <Traka ocena={o.ocena} />
                          <span className="w-4 font-mono text-micro tabular-nums text-text-muted">{o.ocena}</span>
                        </span>
                      </div>
                      <p className="min-w-0 flex-1 text-text-muted">
                        {o.obrazlozenje}
                        {kljuc === "putDoKontakta" && claude.klikovaDoKontakta !== undefined && (
                          <span className="text-foreground">
                            {" "}
                            · {claude.klikovaDoKontakta}{" "}
                            {claude.klikovaDoKontakta === 1 ? "klik" : "klika"} do kontakta
                          </span>
                        )}
                      </p>
                    </li>
                  );
                })}
              </ul>

              <div className="grid gap-3 border-t border-line-soft pt-3 sm:grid-cols-[1fr_1fr_auto]">
                <div className="flex flex-col gap-1">
                  <span className="text-micro text-text-muted">Glavne mane</span>
                  {claude.glavneMane.length === 0 ? (
                    <span className="text-text-muted">nijedna zabeležena</span>
                  ) : (
                    <ul className="flex list-disc flex-col gap-0.5 pl-4 text-foreground">
                      {claude.glavneMane.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-micro text-text-muted">Prilika za Enigmu</span>
                  <p className="text-foreground">{claude.prilikaZaEnigmu}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-micro text-text-muted">Preporučena ponuda</span>
                  <span className="inline-flex w-fit rounded-md border border-accent-400/40 bg-accent-400/10 px-2 py-0.5 text-xs font-semibold text-accent-400">
                    {ponudaNatpis(claude.preporucenaPonuda)}
                  </span>
                </div>
              </div>
            </>
          )}
        </section>

        {/* ── Tehnologije ── */}
        <section className="flex flex-col gap-2.5 border-t border-line-soft pt-4">
          <Naslov
            uz={
              <span className="text-micro text-text-muted">
                {audit.cms ? `CMS: ${audit.cms}` : "bez prepoznatog CMS-a"}
                {audit.eCommerce && ` · webshop: ${audit.eCommerce}`}
                {audit.booking && ` · zakazivanje: ${audit.booking}`}
                {audit.formaZaTermin === true && " · ima formu za termin"}
              </span>
            }
          >
            Tehnologije ({tehnologije.length})
          </Naslov>
          {tehnologije.length === 0 ? (
            <p className="text-text-muted">
              Nijedna tehnologija nije prepoznata iz otisaka — ili HTML nije preuzet (vidi greške).
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {kategorije.map((kat) => (
                <div key={kat} className="flex flex-wrap items-baseline gap-1.5">
                  <span className="w-36 shrink-0 text-micro text-text-muted">{kat}</span>
                  {(grupe.get(kat) ?? []).map((t) => (
                    <span
                      key={`${kat}-${t.ime}`}
                      title={`pouzdanost ${t.pouzdanost} %`}
                      className={cn(
                        "inline-flex items-center gap-1 rounded border px-1.5 py-px text-micro",
                        kat === "CMS" && t.ime === audit.cms
                          ? "border-line-strong bg-surface-raised font-semibold text-foreground"
                          : kat === "Zastarelo"
                            ? "border-temp-hot/40 bg-temp-hot-bg text-foreground"
                            : "border-line bg-surface-raised text-text-muted",
                        t.pouzdanost < 60 && "border-dashed",
                      )}
                    >
                      {t.ime}
                      {t.verzija && (
                        <span className="font-mono tabular-nums text-text-muted">{t.verzija}</span>
                      )}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Snimci ── */}
        <section className="flex flex-col gap-2.5 border-t border-line-soft pt-4">
          <Naslov>Snimci</Naslov>
          {!audit.snimciUrl.desktop && !audit.snimciUrl.mobilni ? (
            <p className="inline-flex items-center gap-1.5 text-text-muted">
              <ImageOff className="size-3.5" aria-hidden />
              Nema snimaka za ovu ocenu.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[3fr_1fr]">
              {(
                [
                  { natpis: "Desktop 1440 px", url: audit.snimciUrl.desktop, Ikona: Monitor },
                  { natpis: "Mobilni 390 px", url: audit.snimciUrl.mobilni, Ikona: Smartphone },
                ] as const
              ).map(({ natpis, url, Ikona }) => (
                <div key={natpis} className="flex flex-col gap-1">
                  <span className="inline-flex items-center gap-1 text-micro text-text-muted">
                    <Ikona className="size-3" aria-hidden />
                    {natpis}
                  </span>
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      title="Otvori snimak u punoj veličini"
                      className="group relative block max-h-72 overflow-hidden rounded-lg border border-line bg-surface-raised transition-colors hover:border-accent-400/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      {/* Vrh stranice: snimak je full-page, pa se seče na 18rem; ceo je iza klika. */}
                      {/* eslint-disable-next-line @next/next/no-img-element -- potpisan Convex storage URL, bez poznatih dimenzija */}
                      <img src={url} alt={`Snimak sajta, ${natpis}`} className="block w-full object-cover object-top" />
                      <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-surface/90 px-1.5 py-0.5 text-micro text-text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                        <ExternalLink className="size-3" aria-hidden />
                        puna veličina
                      </span>
                    </a>
                  ) : (
                    <span className="rounded-lg border border-dashed border-line-soft px-2 py-6 text-center text-micro text-text-muted">
                      nije snimljen
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Greške ── */}
        {audit.greske && audit.greske.length > 0 && (
          <section className="flex flex-col gap-1.5 border-t border-line-soft pt-4">
            <Naslov>Šta nije uspelo ({audit.greske.length})</Naslov>
            <ul className="flex flex-col gap-0.5 text-text-muted">
              {audit.greske.map((g) => (
                <li key={g} className="font-mono text-micro">
                  {g}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Istorija ── */}
        {data.audits.length > 1 && (
          <section className="flex flex-col gap-2 border-t border-line-soft pt-4">
            <Naslov>
              <span className="inline-flex items-center gap-1.5">
                <History className="size-3.5 text-text-muted" aria-hidden />
                Istorija ocena ({data.audits.length})
              </span>
            </Naslov>
            <ul className="flex flex-wrap gap-1.5">
              {data.audits.map((a) => {
                const aktivna = a._id === audit._id;
                return (
                  <li key={a._id}>
                    <button
                      type="button"
                      aria-pressed={aktivna}
                      onClick={() => setIzabranaId(a._id)}
                      className={cn(
                        "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-micro transition-colors",
                        aktivna
                          ? "border-accent-400 bg-accent-400/10 text-accent-400"
                          : "border-line bg-surface-raised text-text-muted hover:border-line-strong hover:text-foreground",
                      )}
                    >
                      <span>{formatDateTime(a.auditedAt)}</span>
                      {a.kvalitet !== null && a.pojas ? (
                        <span className={cn("font-mono font-semibold tabular-nums", POJAS_INK[a.pojas])}>
                          {POJAS_NATPISI[a.pojas]} {a.kvalitet}
                        </span>
                      ) : (
                        <span>bez broja</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
