"use client";

// Preneto iz Devotion apps/web/components/workspace/page-tree.tsx i dela
// workspace-sidebar.tsx (oblasti u meniju) (main @ c05c40f), SPAJANJE S10.
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Blocks, ChevronRight, GripVertical, LoaderCircle, Plus } from "lucide-react";

import { ProjekatLink } from "@/components/app/projekat-link";
import { useEkranPutanja, useProjekatMutation } from "@/components/app/projekat-provider";
import { Unfold } from "@/components/motion/unfold";
import { Button } from "@/components/ui/button";
import { useProjekatPaginatedQuery, useProjekatQueryTolerant } from "@/components/app/prostor/podaci/projekat";
import { useProstorNavigacija } from "@/components/app/prostor/use-prostor-navigacija";
import { AREA_ICONS } from "@/components/app/prostor/zajednicko/radni-ui";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { canDragPage, PAGE_TREE_VISIBLE, showMoreLabel } from "@/lib/prostor/modeli/page-tree-model";
import { ekranRute, rutaIzEkrana, type CreatePageTarget } from "@/lib/prostor/rute";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import type { AreaKey } from "@/lib/prostor/web/projekat";
import { pageKindMeta } from "@/lib/prostor/web/vrste-stranica";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useDokumenti } from "./dokumenti-kontekst";

/** Dok se prevlači, zatvorena stranica se sama otvori posle ovoliko lebdenja. */
const OTVORI_POSLE_MS = 600;
const TIP_STRANICE = "application/x-page-id";
const TIP_OBLASTI = "application/x-area-id";

/** Red stabla: 28 px na mišu, 44 px na dodir; isti tekst kao meni. */
const RED =
  "group/red relative flex min-h-7 items-center gap-1 rounded-md text-ui transition-colors pointer-coarse:min-h-11";
const NEIZABRAN = "text-text-secondary hover:bg-sidebar-accent/60 hover:text-foreground";
const IZABRAN = "bg-sidebar-accent text-foreground";
/**
 * „+“ u redu: na mišu lebdi preko kraja naslova tek na hover ili fokus (ne
 * troši širinu uskog menija), a na dodir stoji u redu stalno.
 */
const DODAJ =
  "absolute right-0.5 top-1/2 size-6 -translate-y-1/2 bg-sidebar-accent text-text-secondary opacity-0 group-hover/red:opacity-100 focus-visible:opacity-100 pointer-coarse:static pointer-coarse:translate-y-0 pointer-coarse:bg-transparent pointer-coarse:opacity-100";
const META_CILJ = "bg-surface-control-hover text-foreground outline-dashed outline-1 outline-line-strong";

type Prevlacenje = {
  stranica: Id<"pages"> | null;
  oblast: Id<"areas"> | null;
  /** Gde bi pustanje sletelo: stranica (ugnežđavanje) ili vrh oblasti. */
  cilj: { oblast: Id<"areas">; stranica: Id<"pages"> | null } | null;
};

const BEZ_PREVLACENJA: Prevlacenje = { stranica: null, oblast: null, cilj: null };

/**
 * ============================================================================
 * STABLO OBLASTI (SPAJANJE S10, paritet redovi 16–17)
 * ============================================================================
 *
 * Pod stavkom „Dokumenti“ u meniju projekta: oblasti, pa stranice svake
 * otvorene oblasti (ugnežđene, lenjo po nivou, najviše 7 po nivou uz
 * „Prikaži još“). Prevlačenje stranice na stranicu je ugnežđavanje, na oblast
 * premeštanje na vrh oblasti (`areasV2.movePage`); prevlačenje oblasti menja
 * redosled (`projekat.reorderAreas`). „+“ na oblasti i stranici otvara „Nova
 * stranica“, a dno stabla „Nova oblast“.
 *
 * Otvorena stranica otvara svoju oblast i pretke. Ručno zatvaranje važi dok
 * je meni montiran (ljuska ostaje kroz navigaciju).
 */
export function StabloOblasti({ aktivan }: { aktivan: boolean }) {
  const { projekat, profil, otvoriNovuStranicu, otvoriNovuOblast } = useDokumenti();
  const putanja = useEkranPutanja();
  const ruta = useMemo(() => rutaIzEkrana(putanja), [putanja]);
  const izabranaOblast = ruta?.kind === "area" ? ruta.areaId : null;
  const izabranaStranica = ruta?.kind === "page" ? ruta.pageId : null;

  // Oblast i preci otvorene stranice (isti upiti kao na ekranu stranice, pa
  // nema nove pretplate).
  const stranica = useProjekatQueryTolerant(
    api.prostor.pages.get,
    izabranaStranica ? { pageId: izabranaStranica } : "skip",
  );
  const preci = useProjekatQueryTolerant(
    api.prostor.pages.getBreadcrumbs,
    izabranaStranica ? { pageId: izabranaStranica } : "skip",
  );

  const [rucnoOblasti, setRucnoOblasti] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const [rucnoStranice, setRucnoStranice] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const [prevlacenje, setPrevlacenje] = useState<Prevlacenje>(BEZ_PREVLACENJA);

  const movePage = useProjekatMutation(api.prostor.areasV2.movePage);
  const reorderAreas = useProjekatMutation(api.prostor.projekat.reorderAreas);

  const samaOtvorena = useMemo(() => {
    const oblasti = new Set<string>();
    const stranice = new Set<string>();
    if (izabranaOblast) oblasti.add(izabranaOblast);
    if (stranica && stranica._id === izabranaStranica) oblasti.add(stranica.areaId);
    // Preci otvorene stranice (bez nje same: njena deca se ne otvaraju sama).
    for (const predak of (preci ?? []).slice(0, -1)) stranice.add(predak._id);
    return { oblasti, stranice };
  }, [izabranaOblast, izabranaStranica, stranica, preci]);

  if (!projekat || !profil) return null;

  const oblastOtvorena = (id: string) =>
    rucnoOblasti.get(id) ?? (samaOtvorena.oblasti.has(id) || prevlacenje.cilj?.oblast === id);
  const straniceOtvorena = (id: string) => rucnoStranice.get(id) ?? samaOtvorena.stranice.has(id);
  const postaviOblast = (id: string, otvori: boolean) =>
    setRucnoOblasti((pre) => new Map(pre).set(id, otvori));
  const postaviStranicu = (id: string, otvori: boolean) =>
    setRucnoStranice((pre) => new Map(pre).set(id, otvori));

  async function premesti(
    pageId: Id<"pages">,
    targetAreaId: Id<"areas">,
    targetParentPageId: Id<"pages"> | null,
  ) {
    if (pageId === targetParentPageId) return;
    try {
      const rezultat = await movePage({ pageId, targetAreaId, targetParentPageId });
      if (rezultat.nestingStatus === "pending") {
        toast.info(
          "Zahtev je poslat autoru nadređene stranice. Stavka ostaje na trenutnom mestu do odobrenja.",
        );
      } else {
        toast.success("Stranica je premeštena.");
        if (targetParentPageId) postaviStranicu(targetParentPageId, true);
        postaviOblast(targetAreaId, true);
      }
    } catch (error) {
      toast.error(accessErrorMessage(error, "Premeštanje stranice nije uspelo."));
    }
  }

  async function promeniRedosled(oblastId: Id<"areas">, ciljId: Id<"areas">) {
    if (!projekat || oblastId === ciljId) return;
    const redosled = projekat.areas.map((oblast) => oblast._id);
    const od = redosled.indexOf(oblastId);
    const ka = redosled.indexOf(ciljId);
    if (od < 0 || ka < 0) return;
    redosled.splice(ka, 0, ...redosled.splice(od, 1));
    try {
      await reorderAreas({ orderedAreaIds: redosled });
    } catch (error) {
      toast.error(accessErrorMessage(error, "Redosled oblasti nije sačuvan."));
    }
  }

  const zavrsi = () => setPrevlacenje(BEZ_PREVLACENJA);

  return (
    <div
      role="group"
      aria-label="Oblasti i stranice"
      className={cn("ml-[18px] border-l border-line-soft pb-1 pl-1.5 pt-0.5", !aktivan && "pb-1.5")}
    >
      <ul className="space-y-px">
        {projekat.areas.map((oblast) => {
          const otvorena = oblastOtvorena(oblast._id);
          const Icon = AREA_ICONS[oblast.key as AreaKey] ?? Blocks;
          const izabrana = izabranaOblast === oblast._id;
          const cilj =
            (prevlacenje.stranica !== null &&
              prevlacenje.cilj?.oblast === oblast._id &&
              prevlacenje.cilj.stranica === null) ||
            (prevlacenje.oblast !== null && prevlacenje.cilj?.oblast === oblast._id && prevlacenje.oblast !== oblast._id);
          return (
            <li key={oblast._id}>
              <div
                draggable
                onDragStart={(event) => {
                  if (prevlacenje.stranica) return;
                  event.dataTransfer.setData(TIP_OBLASTI, oblast._id);
                  event.dataTransfer.effectAllowed = "move";
                  setPrevlacenje({ stranica: null, oblast: oblast._id, cilj: null });
                }}
                onDragEnd={zavrsi}
                onDragOver={(event) => {
                  if (!prevlacenje.stranica && !prevlacenje.oblast) return;
                  event.preventDefault();
                  setPrevlacenje((pre) =>
                    pre.cilj?.oblast === oblast._id && pre.cilj.stranica === null
                      ? pre
                      : { ...pre, cilj: { oblast: oblast._id, stranica: null } },
                  );
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const { stranica: vucena, oblast: vucenaOblast } = prevlacenje;
                  zavrsi();
                  if (vucena) void premesti(vucena, oblast._id, null);
                  else if (vucenaOblast) void promeniRedosled(vucenaOblast, oblast._id);
                }}
                className={cn(RED, izabrana ? IZABRAN : NEIZABRAN, cilj && META_CILJ)}
              >
                <button
                  type="button"
                  aria-expanded={otvorena}
                  aria-label={otvorena ? `Sakrij stranice: ${oblast.label}` : `Prikaži stranice: ${oblast.label}`}
                  onClick={() => postaviOblast(oblast._id, !otvorena)}
                  className="grid size-6 shrink-0 place-items-center rounded text-text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-11"
                >
                  <ChevronRight
                    className={cn("size-3.5 transition-transform duration-(--duration-fast)", otvorena && "rotate-90")}
                    aria-hidden="true"
                  />
                </button>
                <ProjekatLink
                  href={ekranRute({ kind: "area", areaId: oblast._id })}
                  aria-current={izabrana ? "page" : undefined}
                  className="flex min-w-0 flex-1 items-center gap-2 self-stretch pr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate font-medium">{oblast.label}</span>
                </ProjekatLink>
                <GripVertical
                  className="size-3.5 shrink-0 cursor-grab text-text-muted opacity-0 group-hover/red:opacity-100 pointer-coarse:hidden"
                  aria-hidden="true"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={DODAJ}
                  aria-label={`Nova stranica u oblasti ${oblast.label}`}
                  onClick={() => otvoriNovuStranicu({ areaId: oblast._id, parentPageId: null })}
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
              <Unfold open={otvorena}>
                <NivoStabla
                  areaId={oblast._id}
                  parentPageId={null}
                  putanja={[]}
                  profileId={profil._id}
                  canManage={projekat.isManager}
                  izabrana={izabranaStranica}
                  otvorena={straniceOtvorena}
                  postavi={postaviStranicu}
                  prevlacenje={prevlacenje}
                  setPrevlacenje={setPrevlacenje}
                  zavrsi={zavrsi}
                  premesti={premesti}
                  onCreate={otvoriNovuStranicu}
                />
              </Unfold>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={otvoriNovuOblast}
        className={cn(RED, NEIZABRAN, "mt-px w-full px-1.5 text-left")}
      >
        <Plus className="size-3.5 shrink-0" aria-hidden="true" />
        Nova oblast
      </button>
    </div>
  );
}

type NivoProps = {
  areaId: Id<"areas">;
  parentPageId: Id<"pages"> | null;
  /** Preci ovog nivoa (stranica se ne pušta u sopstvenog potomka). */
  putanja: ReadonlyArray<Id<"pages">>;
  profileId: Id<"profiles">;
  canManage: boolean;
  izabrana: Id<"pages"> | null;
  otvorena: (id: string) => boolean;
  postavi: (id: string, otvori: boolean) => void;
  prevlacenje: Prevlacenje;
  setPrevlacenje: (update: (pre: Prevlacenje) => Prevlacenje) => void;
  zavrsi: () => void;
  premesti: (pageId: Id<"pages">, areaId: Id<"areas">, parent: Id<"pages"> | null) => Promise<void>;
  onCreate: (target: CreatePageTarget) => void;
};

/** Jedan nivo stabla (`pages.listChildren`), montiran tek kad je roditelj otvoren. */
function NivoStabla(props: NivoProps) {
  const { areaId, parentPageId, onCreate } = props;
  const { idi } = useProstorNavigacija();
  const { results: stranice, status } = useProjekatPaginatedQuery(
    api.prostor.pages.listChildren,
    { areaId, parentPageId },
    { initialNumItems: 50 },
  );
  const vidljive = stranice.slice(0, PAGE_TREE_VISIBLE);
  const skrivene = stranice.length - vidljive.length;
  const josNaServeru = status === "CanLoadMore" || status === "LoadingMore";

  if (status === "LoadingFirstPage") {
    return (
      <p role="status" className="flex h-7 items-center gap-2 pl-7 text-meta text-text-muted">
        <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
        Učitavam stranice
      </p>
    );
  }

  if (stranice.length === 0) {
    return (
      <button
        type="button"
        onClick={() => onCreate({ areaId, parentPageId })}
        className={cn(RED, NEIZABRAN, "w-full pl-7 pr-1.5 text-left text-meta")}
      >
        <Plus className="size-3.5 shrink-0" aria-hidden="true" />
        {parentPageId === null ? "Prva stranica" : "Dodaj unutra"}
      </button>
    );
  }

  return (
    <ul className={cn("space-y-px", parentPageId !== null && "ml-3 border-l border-line-soft pl-1")}>
      {vidljive.map((stranica) => (
        <CvorStabla key={stranica._id} {...props} stranica={stranica} />
      ))}
      {skrivene > 0 || josNaServeru ? (
        <li>
          <button
            type="button"
            onClick={() =>
              idi(
                parentPageId === null
                  ? { kind: "area", areaId, tab: "dokumenti" }
                  : { kind: "page", pageId: parentPageId },
              )
            }
            className={cn(RED, NEIZABRAN, "w-full pl-7 pr-1.5 text-left text-meta")}
          >
            {showMoreLabel(skrivene, josNaServeru)}
          </button>
        </li>
      ) : null}
    </ul>
  );
}

function CvorStabla({
  stranica,
  ...props
}: NivoProps & { stranica: Doc<"pages"> }) {
  const {
    areaId,
    putanja,
    profileId,
    canManage,
    izabrana,
    otvorena: jeOtvorena,
    postavi,
    prevlacenje,
    setPrevlacenje,
    zavrsi,
    premesti,
    onCreate,
  } = props;
  const otvorena = jeOtvorena(stranica._id);
  const tajmer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (tajmer.current) clearTimeout(tajmer.current);
    },
    [],
  );

  const Icon = pageKindMeta(stranica.kind).icon;
  const jeIzabrana = izabrana === stranica._id;
  const pomera = canDragPage(stranica, { profileId, canManage });
  const vucena = prevlacenje.stranica;
  const moze = vucena !== null && vucena !== stranica._id && !putanja.includes(vucena);
  const cilj = moze && prevlacenje.cilj?.stranica === stranica._id;
  const naslov = stranica.title.trim() || "Bez naslova";

  const ocisti = () => {
    if (tajmer.current) {
      clearTimeout(tajmer.current);
      tajmer.current = null;
    }
  };

  return (
    <li>
      <div
        draggable={pomera}
        onDragStart={(event: DragEvent) => {
          if (!pomera) {
            event.preventDefault();
            return;
          }
          event.stopPropagation();
          event.dataTransfer.setData(TIP_STRANICE, stranica._id);
          event.dataTransfer.effectAllowed = "move";
          setPrevlacenje(() => ({ stranica: stranica._id, oblast: null, cilj: null }));
        }}
        onDragEnd={(event) => {
          event.stopPropagation();
          ocisti();
          zavrsi();
        }}
        onDragOver={(event) => {
          if (!moze) return;
          event.preventDefault();
          event.stopPropagation();
          setPrevlacenje((pre) =>
            pre.cilj?.stranica === stranica._id ? pre : { ...pre, cilj: { oblast: areaId, stranica: stranica._id } },
          );
          if (!otvorena && !tajmer.current) {
            tajmer.current = setTimeout(() => postavi(stranica._id, true), OTVORI_POSLE_MS);
          }
        }}
        onDragLeave={(event) => {
          event.stopPropagation();
          ocisti();
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          ocisti();
          zavrsi();
          if (moze && vucena) void premesti(vucena, areaId, stranica._id);
        }}
        className={cn(
          RED,
          jeIzabrana ? IZABRAN : NEIZABRAN,
          cilj && META_CILJ,
          vucena === stranica._id && "text-text-muted",
        )}
      >
        <button
          type="button"
          aria-expanded={otvorena}
          aria-label={otvorena ? `Sakrij podstranice: ${naslov}` : `Prikaži podstranice: ${naslov}`}
          onClick={() => postavi(stranica._id, !otvorena)}
          className="grid size-6 shrink-0 place-items-center rounded text-text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-11"
        >
          <ChevronRight
            className={cn("size-3.5 transition-transform duration-(--duration-fast)", otvorena && "rotate-90")}
            aria-hidden="true"
          />
        </button>
        <ProjekatLink
          href={ekranRute({ kind: "page", pageId: stranica._id })}
          aria-current={jeIzabrana ? "page" : undefined}
          title={naslov}
          className="flex min-w-0 flex-1 items-center gap-2 self-stretch pr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{naslov}</span>
        </ProjekatLink>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={DODAJ}
          aria-label={`Nova podstranica u „${naslov}“`}
          onClick={() => onCreate({ areaId, parentPageId: stranica._id })}
        >
          <Plus className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
      <Unfold open={otvorena}>
        <NivoStabla {...props} parentPageId={stranica._id} putanja={[...putanja, stranica._id]} />
      </Unfold>
    </li>
  );
}
