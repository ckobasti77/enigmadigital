"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import {
  AlertCircle,
  AtSign,
  CheckCircle2,
  ExternalLink,
  Eye,
  FileText,
  Heart,
  HelpCircle,
  Image,
  Info,
  Layers,
  Lock,
  MessageSquare,
  Quote,
  RefreshCw,
  Repeat2,
  Search,
  ShieldAlert,
  Sparkles,
  Tag,
  Users,
  Video,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Reveal } from "@/components/motion/reveal";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatNumber, formatRelativeTime } from "@/lib/format";
import type {
  LookupProfileResult,
  SearchKeywordResult,
} from "@/convex/threadsSearch";

type SearchTab = "keyword" | "profile";

export function ThreadsSearch() {
  const [activeTab, setActiveTab] = useState<SearchTab>("keyword");

  // ── 24h Kvote ─────────────────────────────────────────────────────────────
  const quotaInfo = useQuery(api.threadsSearch.getSearchQuotaInfo, {});

  // ── Stanje za pretragu ključnih reči ───────────────────────────────────────
  const [keywordQuery, setKeywordQuery] = useState("");
  const [searchType, setSearchType] = useState<"RECENT" | "TOP">("RECENT");
  const [searchMode, setSearchMode] = useState<"KEYWORD" | "TAG">("KEYWORD");
  const [mediaTypeFilter, setMediaTypeFilter] = useState<string>("");
  const [authorFilter, setAuthorFilter] = useState("");
  const [isSearchingKeyword, setIsSearchingKeyword] = useState(false);
  const [keywordResult, setKeywordResult] =
    useState<SearchKeywordResult | null>(null);

  // ── Stanje za lookup profila ───────────────────────────────────────────────
  const [profileUsername, setProfileUsername] = useState("");
  const [isLookingUpProfile, setIsLookingUpProfile] = useState(false);
  const [profileResult, setProfileResult] =
    useState<LookupProfileResult | null>(null);

  const searchKeywordAction = useAction(api.threadsSearch.searchKeyword);
  const lookupProfileAction = useAction(api.threadsSearch.lookupProfile);

  const handleKeywordSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = keywordQuery.trim();
    if (!trimmed || isSearchingKeyword) return;

    setIsSearchingKeyword(true);
    setKeywordResult(null);

    try {
      const res = await searchKeywordAction({
        q: trimmed,
        searchType,
        searchMode,
        mediaType: mediaTypeFilter || undefined,
        authorUsername: authorFilter.trim() || undefined,
        limit: 30,
      });
      setKeywordResult(res);
    } catch (err) {
      setKeywordResult({
        status: "error",
        // Poziv nije ni stigao do servera, pa doseg ovde nije ni pročitan ni
        // pretpostavljen na osnovu konfiguracije — označava se kao pretpostavka.
        scope: "own_posts_only",
        scopeIsAssumed: true,
        items: [],
        errorMessage:
          err instanceof Error
            ? err.message
            : "Došlo je do neočekivane greške pri pretrazi.",
      });
    } finally {
      setIsSearchingKeyword(false);
    }
  };

  const handleProfileLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = profileUsername.replace(/^@/, "").trim();
    if (!trimmed || isLookingUpProfile) return;

    setIsLookingUpProfile(true);
    setProfileResult(null);

    try {
      const res = await lookupProfileAction({
        username: trimmed,
      });
      setProfileResult(res);
    } catch (err) {
      setProfileResult({
        status: "error",
        scope: "meta_accounts_only",
        scopeIsAssumed: true,
        errorMessage:
          err instanceof Error
            ? err.message
            : "Došlo je do neočekivane greške pri lookup-u profila.",
      });
    } finally {
      setIsLookingUpProfile(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Zaglavlje i 24h Kvote ─────────────────────────────────────────── */}
      <Reveal>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Pretraga i otkrivanje sadržaja
            </h2>
            <p className="text-sm text-text-muted">
              Pretraga po ključnim rečima i otkrivanje javnih profila na Threads
              mreži (§6)
            </p>
          </div>

          {/* Kartice 24h kvote */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl bg-card px-3 py-2 text-xs shadow-card ring-1 ring-line">
              <Search className="size-4 text-accent-400" aria-hidden="true" />
              <div>
                <span className="text-text-muted">Keyword 24h (naši pozivi): </span>
                <span className="font-mono font-medium text-foreground">
                  {quotaInfo
                    ? `${formatNumber(quotaInfo.keywordSearch.used)} / ${formatNumber(quotaInfo.keywordSearch.total)}`
                    : "Učitavanje..."}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-card px-3 py-2 text-xs shadow-card ring-1 ring-line">
              <Users className="size-4 text-accent-400" aria-hidden="true" />
              <div>
                <span className="text-text-muted">Profile 24h kvota: </span>
                <span className="font-mono font-medium text-foreground">
                  {quotaInfo
                    ? `${formatNumber(quotaInfo.profileLookup.used)} / ${formatNumber(quotaInfo.profileLookup.total)}`
                    : "Učitavanje..."}
                </span>
              </div>
            </div>
          </div>

          {/* Threads meri kvotu po KORISNIKU, zbirno preko svih aplikacija
              (§6). Mi brojimo samo svoje pozive, pa je ovo donja granica. */}
          <p className="text-micro text-text-muted">
            Threads računa ovu kvotu po nalogu, zbirno za sve aplikacije koje ga
            koriste. Ovde su prikazani samo naši pozivi — stvarna potrošnja može
            biti veća.
          </p>
        </div>
      </Reveal>

      {/* ── Pod-navigacija (Tabovi) ────────────────────────────────────────── */}
      <div className="flex border-b border-line">
        <button
          type="button"
          onClick={() => setActiveTab("keyword")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "keyword"
              ? "border-accent-400 text-accent-400"
              : "border-transparent text-text-muted hover:text-foreground"
          }`}
        >
          <Search className="size-4" aria-hidden="true" />
          Pretraga ključnih reči (Keyword Search)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("profile")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "profile"
              ? "border-accent-400 text-accent-400"
              : "border-transparent text-text-muted hover:text-foreground"
          }`}
        >
          <Users className="size-4" aria-hidden="true" />
          Otkrivanje profila (Profile Lookup)
        </button>
      </div>

      {/* ── TAB 1: Pretraga ključnih reči ─────────────────────────────────── */}
      {activeTab === "keyword" && (
        <div className="flex flex-col gap-6">
          {/* Obavezan i uvek vidljiv Scope Banner (§2.1, Zahtev 5) */}
          <Reveal>
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-300">
              <Info className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
              <div>
                <p className="font-semibold text-amber-200">
                  Ograničenje dosega pretrage (§2.1)
                </p>
                <p className="mt-0.5">
                  Pretraga trenutno obuhvata samo tvoje objave — pun doseg traži
                  odobrenje Mete (App Review za{" "}
                  <code className="font-mono">threads_keyword_search</code> sa
                  Advanced Access-om).
                </p>
              </div>
            </div>
          </Reveal>

          {/* Forma za pretragu */}
          <Reveal delay={0.05}>
            <Card className="flex flex-col gap-4 p-5 shadow-card ring-line">
              <form onSubmit={handleKeywordSearch} className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="relative flex-1">
                    <Search
                      className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
                      aria-hidden="true"
                    />
                    <Input
                      type="text"
                      placeholder="Unesi ključnu reč ili frazu..."
                      value={keywordQuery}
                      onChange={(e) => setKeywordQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={!keywordQuery.trim() || isSearchingKeyword}
                    className="min-w-[120px]"
                  >
                    {isSearchingKeyword ? (
                      <>
                        <RefreshCw className="mr-2 size-4 animate-spin" aria-hidden="true" />
                        Pretraga...
                      </>
                    ) : (
                      <>
                        <Search className="mr-2 size-4" aria-hidden="true" />
                        Pretraži
                      </>
                    )}
                  </Button>
                </div>

                {/* Filteri */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-micro uppercase tracking-wider text-text-muted">
                      Tip rangiranja
                    </label>
                    <select
                      value={searchType}
                      onChange={(e) =>
                        setSearchType(e.target.value as "RECENT" | "TOP")
                      }
                      className="w-full rounded-md border border-line bg-card px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent-400"
                    >
                      <option value="RECENT">Najnovije (RECENT)</option>
                      <option value="TOP">Najpopularnije (TOP)</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-micro uppercase tracking-wider text-text-muted">
                      Režim pretrage
                    </label>
                    <select
                      value={searchMode}
                      onChange={(e) =>
                        setSearchMode(e.target.value as "KEYWORD" | "TAG")
                      }
                      className="w-full rounded-md border border-line bg-card px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent-400"
                    >
                      <option value="KEYWORD">Ključna reč (KEYWORD)</option>
                      <option value="TAG">Topic Tag (TAG)</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-micro uppercase tracking-wider text-text-muted">
                      Tip medija
                    </label>
                    <select
                      value={mediaTypeFilter}
                      onChange={(e) => setMediaTypeFilter(e.target.value)}
                      className="w-full rounded-md border border-line bg-card px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent-400"
                    >
                      <option value="">Svi tipovi medija</option>
                      <option value="TEXT">Tekstualne objave (TEXT)</option>
                      <option value="IMAGE">Slike (IMAGE)</option>
                      <option value="VIDEO">Video zapisi (VIDEO)</option>
                      <option value="CAROUSEL_ALBUM">Karoseli (CAROUSEL)</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-micro uppercase tracking-wider text-text-muted">
                      Autor (@username)
                    </label>
                    <Input
                      type="text"
                      placeholder="npr. meta"
                      value={authorFilter}
                      onChange={(e) => setAuthorFilter(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </form>
            </Card>
          </Reveal>

          {/* Rezultati pretrage (Tri stanja: rezultati, prazno, greška) */}
          {keywordResult && (
            <Reveal delay={0.1}>
              {/* STANJE 1: Uspeh sa rezultatima */}
              {keywordResult.status === "success_with_results" && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between text-xs text-text-muted">
                    <span>
                      Pronađeno <strong>{keywordResult.items.length}</strong> objava
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent-400/10 px-2 py-0.5 font-mono text-micro text-accent-400">
                      {keywordResult.scope === "full"
                        ? "Doseg: ceo Threads"
                        : "Doseg: samo tvoje objave"}
                      {keywordResult.scopeIsAssumed
                        ? " — pretpostavka, App Review nije potvrđen"
                        : ""}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {keywordResult.items.map((item) => (
                      <Card
                        key={item.id}
                        className="flex flex-col justify-between gap-3 p-4 shadow-card ring-line transition-all hover:ring-accent-400/50"
                      >
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 font-medium text-foreground">
                              <AtSign className="size-3.5 text-accent-400" />
                              <span>{item.username ?? "threads_user"}</span>
                            </div>
                            {item.timestamp && (
                              <span className="text-micro text-text-muted">
                                {typeof item.timestamp === "number"
                                  ? formatRelativeTime(item.timestamp * 1000)
                                  : formatRelativeTime(
                                      new Date(item.timestamp).getTime(),
                                    )}
                              </span>
                            )}
                          </div>

                          <p className="whitespace-pre-line text-sm text-foreground">
                            {item.text || (
                              <span className="italic text-text-muted">
                                (Objava bez teksta)
                              </span>
                            )}
                          </p>
                        </div>

                        <div className="flex items-center justify-between border-t border-line/50 pt-2.5 text-micro">
                          <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-0.5 text-text-secondary">
                            {item.mediaType === "IMAGE" ? (
                              <Image className="size-3" />
                            ) : item.mediaType === "VIDEO" ? (
                              <Video className="size-3" />
                            ) : item.mediaType === "CAROUSEL_ALBUM" ? (
                              <Layers className="size-3" />
                            ) : (
                              <FileText className="size-3" />
                            )}
                            {item.mediaType ?? "TEXT"}
                          </span>

                          {item.permalink && (
                            <a
                              href={item.permalink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-accent-400 underline-offset-4 hover:underline"
                            >
                              Otvori na Threads
                              <ExternalLink className="size-3" />
                            </a>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* STANJE 2: Uspeh bez rezultata (prazno) */}
              {keywordResult.status === "success_empty" && (
                <Card className="flex flex-col items-center justify-center gap-3 p-8 text-center shadow-card ring-line">
                  <div className="flex size-10 items-center justify-center rounded-full bg-white/5 text-text-muted">
                    <Search className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Nema pronađenih objava
                    </h3>
                    <p className="mt-1 max-w-md text-xs text-text-muted">
                      Nijedna objava ne odgovara unetom upitu{" "}
                      <span className="font-mono text-foreground">
                        „{keywordQuery}“
                      </span>
                      .
                    </p>
                  </div>
                  <div className="mt-2 max-w-md rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-micro text-amber-300">
                    ℹ Pretraga trenutno obuhvata samo tvoje objave — pun doseg traži
                    odobrenje Mete (App Review).
                  </div>
                </Card>
              )}

              {/* STANJE 3: Greška */}
              {keywordResult.status === "error" && (
                <Card className="flex items-start gap-3 border-danger/30 bg-danger/10 p-4 text-xs text-danger shadow-card ring-line">
                  <AlertCircle className="size-5 shrink-0" aria-hidden="true" />
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-danger">
                      Pretraga nije uspela
                    </span>
                    <span className="text-text-secondary">
                      {keywordResult.errorMessage ||
                        "Došlo je do greške prilikom komunikacije sa Threads API-jem."}
                    </span>
                  </div>
                </Card>
              )}
            </Reveal>
          )}
        </div>
      )}

      {/* ── TAB 2: Otkrivanje profila ─────────────────────────────────────── */}
      {activeTab === "profile" && (
        <div className="flex flex-col gap-6">
          {/* Obaveštenje o pravilima Profile Discovery-ja (§6, Zahtev 6) */}
          <Reveal>
            <div className="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 text-xs text-blue-300">
              <Info className="mt-0.5 size-4 shrink-0 text-blue-400" aria-hidden="true" />
              <div>
                <p className="font-semibold text-blue-200">
                  Uslovi za uvid u profile (§6)
                </p>
                <p className="mt-0.5">
                  Threads Profile Discovery podržava uvid isključivo u{" "}
                  <strong>javne profile</strong>, korisnike sa{" "}
                  <strong>18+ godina</strong> i minimum{" "}
                  <strong>100 pratilaca</strong> (limit: 1.000 zahteva / 24h). Dok
                  traje faza bez odobrenog App Review-a, pretraga je moguća samo za
                  odobrene testne i zvanične Meta naloge.
                </p>
              </div>
            </div>
          </Reveal>

          {/* Forma za Profile Lookup */}
          <Reveal delay={0.05}>
            <Card className="flex flex-col gap-4 p-5 shadow-card ring-line">
              <form onSubmit={handleProfileLookup} className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <AtSign
                    className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
                    aria-hidden="true"
                  />
                  <Input
                    type="text"
                    placeholder="Unesi korisničko ime (npr. zuck, meta, instagram)..."
                    value={profileUsername}
                    onChange={(e) => setProfileUsername(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={!profileUsername.trim() || isLookingUpProfile}
                  className="min-w-[140px]"
                >
                  {isLookingUpProfile ? (
                    <>
                      <RefreshCw className="mr-2 size-4 animate-spin" aria-hidden="true" />
                      Provera...
                    </>
                  ) : (
                    <>
                      <Users className="mr-2 size-4" aria-hidden="true" />
                      Proveri profil
                    </>
                  )}
                </Button>
              </form>
            </Card>
          </Reveal>

          {/* Rezultati Profile Lookup-a */}
          {profileResult && (
            <Reveal delay={0.1}>
              {/* STANJE 1: Uspeh sa podacima o profilu */}
              {profileResult.status === "success_with_results" &&
                profileResult.profile && (
                  <Card className="flex flex-col gap-5 p-6 shadow-card ring-line">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-12 items-center justify-center rounded-full bg-accent-400/10 text-accent-400">
                          <AtSign className="size-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-bold text-foreground">
                              @{profileResult.profile.username}
                            </span>
                            {profileResult.profile.isVerified && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-2 py-0.5 text-micro font-medium text-blue-400">
                                <CheckCircle2 className="size-3" />
                                Verifikovan
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-text-muted">
                            Javni profil na Threads mreži
                          </p>
                        </div>
                      </div>

                      <a
                        href={`https://threads.net/@${profileResult.profile.username}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-white/5"
                      >
                        Otvori na threads.net
                        <ExternalLink className="size-3.5 text-text-muted" />
                      </a>
                    </div>

                    {/* Metrike profila */}
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                      <div className="flex flex-col gap-1 rounded-xl bg-white/5 p-3">
                        <span className="flex items-center gap-1 text-micro text-text-muted">
                          <Users className="size-3.5 text-accent-400" />
                          Pratioci
                        </span>
                        <span className="font-mono text-lg font-bold text-foreground">
                          {formatNumber(profileResult.profile.followerCount ?? 0)}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1 rounded-xl bg-white/5 p-3">
                        <span className="flex items-center gap-1 text-micro text-text-muted">
                          <Eye className="size-3.5 text-accent-400" />
                          Prikazi (views)
                        </span>
                        <span className="font-mono text-lg font-bold text-foreground">
                          {formatNumber(profileResult.profile.viewsCount ?? 0)}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1 rounded-xl bg-white/5 p-3">
                        <span className="flex items-center gap-1 text-micro text-text-muted">
                          <Heart className="size-3.5 text-accent-400" />
                          Lajkovi
                        </span>
                        <span className="font-mono text-lg font-bold text-foreground">
                          {formatNumber(profileResult.profile.likesCount ?? 0)}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1 rounded-xl bg-white/5 p-3">
                        <span className="flex items-center gap-1 text-micro text-text-muted">
                          <Quote className="size-3.5 text-accent-400" />
                          Citati
                        </span>
                        <span className="font-mono text-lg font-bold text-foreground">
                          {formatNumber(profileResult.profile.quotesCount ?? 0)}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1 rounded-xl bg-white/5 p-3">
                        <span className="flex items-center gap-1 text-micro text-text-muted">
                          <Repeat2 className="size-3.5 text-accent-400" />
                          Repostovi
                        </span>
                        <span className="font-mono text-lg font-bold text-foreground">
                          {formatNumber(profileResult.profile.repostsCount ?? 0)}
                        </span>
                      </div>
                    </div>
                  </Card>
                )}

              {/* STANJE 2: Profil nije dostupan (§6 uslovi nisu ispunjeni, Zahtev 6) */}
              {profileResult.status === "unavailable" && (
                <Card className="flex flex-col items-center justify-center gap-3 border-amber-500/30 bg-amber-500/5 p-6 text-center shadow-card ring-line">
                  <div className="flex size-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
                    <Lock className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-amber-200">
                      Profil nije dostupan za uvid
                    </h3>
                    <p className="mt-1 max-w-md text-xs text-text-secondary">
                      {profileResult.unavailableReason ||
                        "Profil ne zadovoljava zahteve Meta API-ja (javni nalog, 18+ godina, minimum 100 pratilaca) ili aplikacija još nema odobren pun doseg kroz App Review."}
                    </p>
                  </div>
                </Card>
              )}

              {/* STANJE 3: Greška */}
              {profileResult.status === "error" && (
                <Card className="flex items-start gap-3 border-danger/30 bg-danger/10 p-4 text-xs text-danger shadow-card ring-line">
                  <AlertCircle className="size-5 shrink-0" aria-hidden="true" />
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-danger">
                      Lookup profila nije uspeo
                    </span>
                    <span className="text-text-secondary">
                      {profileResult.errorMessage ||
                        "Došlo je do greške prilikom dohvatanja profila sa Threads API-ja."}
                    </span>
                  </div>
                </Card>
              )}
            </Reveal>
          )}
        </div>
      )}
    </div>
  );
}
