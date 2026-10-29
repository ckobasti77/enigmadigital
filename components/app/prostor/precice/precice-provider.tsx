"use client";

// Preneto iz Devotion apps/web/components/shortcuts/shortcut-provider.tsx (main @ c05c40f), SPAJANJE S08.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import { jeApple } from "@/lib/recnik";
import { grupisiZaPomoc } from "@/lib/prostor/precice/katalog";
import {
  isTypingTarget,
  matchShortcut,
  SHELL_SHORTCUTS,
  type ShortcutDef,
  type ShortcutGroup,
} from "@/lib/prostor/precice/registar";

import { ShortcutHelpDialog } from "./pomoc-dijalog";

/** `false` = prečica ovde ne važi (npr. Enter na dugmetu): taster ide dalje, svom podrazumevanom ponašanju. */
type ShortcutHandler = (id: string, event: KeyboardEvent) => boolean | void;

type Registration = {
  defs: ReadonlyArray<ShortcutDef>;
  handler: ShortcutHandler;
};

type ShortcutContextValue = {
  register: (registration: RefObject<Registration>) => () => void;
  openHelp: () => void;
};

const ShortcutContext = createContext<ShortcutContextValue | null>(null);

/**
 * Otvoren modalni sloj (dijalog, sheet, meni) — tada obične prečice ćute.
 * Base UI iskačuće slojeve označava atributom `data-open` (Devotion je gledao
 * Radixov `data-state="open"`).
 */
const OPEN_LAYER_SELECTOR = [
  '[role="dialog"][data-open]',
  '[role="alertdialog"][data-open]',
  '[role="menu"][data-open]',
  '[role="listbox"][data-open]',
].join(",");

/** Platforma za oznaku tastera u pomoći (ista provera kao `usePrecica`); zove se tek na klijentu. */
function isMacPlatform() {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return jeApple(nav.userAgentData?.platform || nav.platform || nav.userAgent);
}

/**
 * Jedan `keydown` slušalac za celu ljusku (plan K01 §5). Komponente prijavljuju
 * prečice kroz `useShortcuts`; najnovija prijava ima prednost.
 *
 * Globalno `?` (pomoć) uključuje `pomocNaUpitnik` (ljuska, od S24). Tabela
 * Leadova više nema svoje `?`: prijavljuje svoju grupu, pa je pomoć navodi.
 * Pomoć navodi sve prečice iz kataloga — prvo one prijavljene na ovom ekranu.
 */
export function ShortcutProvider({
  children,
  pomocNaUpitnik = false,
}: {
  children: ReactNode;
  /** `true` = `?` svuda otvara dijalog pomoći. Podrazumevano `false` (vidi gore). */
  pomocNaUpitnik?: boolean;
}) {
  const registrations = useRef(new Set<RefObject<Registration>>());
  const [help, setHelp] = useState<{
    open: boolean;
    groups: Array<{ group: ShortcutGroup; defs: ShortcutDef[] }>;
    otherGroups: Array<{ group: ShortcutGroup; defs: ShortcutDef[] }>;
    isMac: boolean;
  }>({ open: false, groups: [], otherGroups: [], isMac: false });

  const openHelp = useCallback(() => {
    const defs = [...registrations.current].flatMap((entry) => entry.current?.defs ?? []);
    const { ovde, drugde } = grupisiZaPomoc(defs);
    setHelp({ open: true, groups: ovde, otherGroups: drugde, isMac: isMacPlatform() });
  }, []);

  const register = useCallback((registration: RefObject<Registration>) => {
    registrations.current.add(registration);
    return () => {
      registrations.current.delete(registration);
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return;
      const typing =
        isTypingTarget(event.target) ||
        (typeof document !== "undefined" && isTypingTarget(document.activeElement));
      const dialogOpen = document.querySelector(OPEN_LAYER_SELECTOR) !== null;
      const shortcutEvent = {
        key: event.key,
        code: event.code,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        repeat: event.repeat,
        typing,
        dialogOpen,
      };
      // Najnovija prijava ima prednost (prikaz preko ljuske).
      for (const registration of [...registrations.current].reverse()) {
        const current = registration.current;
        if (!current) continue;
        const id = matchShortcut(shortcutEvent, current.defs);
        if (id === null) continue;
        if (current.handler(id, event) === false) continue;
        event.preventDefault();
        return;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo(() => ({ register, openHelp }), [register, openHelp]);

  return (
    <ShortcutContext.Provider value={value}>
      {pomocNaUpitnik ? <HelpShortcut /> : null}
      {children}
      <ShortcutHelpDialog
        open={help.open}
        onOpenChange={(open) => setHelp((current) => ({ ...current, open }))}
        groups={help.groups}
        otherGroups={help.otherGroups}
        isMac={help.isMac}
      />
    </ShortcutContext.Provider>
  );
}

function HelpShortcut() {
  const context = useContext(ShortcutContext);
  useShortcuts([SHELL_SHORTCUTS.help], () => context?.openHelp());
  return null;
}

/**
 * Programsko otvaranje dijaloga pomoći (npr. iz menija ili palete), bez
 * globalnog `?`. Vraća `null` van `ShortcutProvider`-a.
 */
export function useOtvoriPomoc(): (() => void) | null {
  return useContext(ShortcutContext)?.openHelp ?? null;
}

/**
 * Prijavi prečice dok je komponenta montirana (i `enabled`). `onTrigger` dobija
 * `id` definicije. Definicije se čitaju iz poslednjeg rendera.
 */
export function useShortcuts(
  defs: ReadonlyArray<ShortcutDef>,
  onTrigger: ShortcutHandler,
  enabled = true,
): void {
  const context = useContext(ShortcutContext);
  const registration = useRef<Registration>({ defs, handler: onTrigger });
  useLayoutEffect(() => {
    registration.current = { defs, handler: onTrigger };
  });
  useEffect(() => {
    if (!enabled || !context) return;
    return context.register(registration);
  }, [context, enabled]);
}

/**
 * Prijavi grupu prečica koje ekran obrađuje sam (Leadovi, režim poziva,
 * stranica, mapa): definicije su `displayOnly`, pa ih provider nikad ne okida,
 * ali ih pomoć navodi kao prečice ovog ekrana (SPAJANJE S24).
 */
export function usePrijaviPomoc(defs: ReadonlyArray<ShortcutDef>, enabled = true): void {
  useShortcuts(defs, () => false, enabled);
}
