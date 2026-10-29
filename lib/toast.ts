/**
 * Toast (P11, plan S07 §5.3): kratko obaveštenje posle radnje, sa istim API-jem
 * kao Devotionov paket za toast (P10 ga ne prenosi), da preneti ekrani radnog
 * dela promene samo uvoz (na `@/lib/toast`).
 *
 * Ispod je Base UI Toast: jedan globalni menadžer (`menadzerToasta`), koji
 * crta jedan `Toaster` u ljusci (`components/app/toaster.tsx`). Poziv radi i
 * van React-a (kuka prečica, povratni poziv mutacije).
 *
 *   toast("Uklonjeno iz Moj dan.", { action: { label: "Poništi", onClick } })
 *   toast.success("Sačuvano.")    toast.error("Nije sačuvano. Pokušaj ponovo.")
 *   toast.info(…)  toast.warning(…)  toast.dismiss(id?)
 *
 * Devotion nije koristio `promise`, `loading` ni `message` (0 poziva), pa
 * ih nema.
 */
import { Toast } from "@base-ui/react/toast";

/** Ton određuje ikonicu i boju stanja (`components/app/toaster.tsx`). */
export type TonToasta = "obicno" | "uspeh" | "greska" | "info" | "upozorenje";

export const TONOVI_TOASTA: readonly TonToasta[] = [
  "obicno",
  "uspeh",
  "greska",
  "info",
  "upozorenje",
];

export type OpcijeToasta = {
  /** Drugi red, prigušen. */
  description?: string;
  /** Milisekunde do zatvaranja; `0` = ne zatvara se samo. */
  duration?: number;
  /** Isti `id` menja postojeći toast (i vraća mu vreme), ne pravi drugi. */
  id?: string;
  /** Jedno dugme radnje („Poništi“, „Otvori“). Klik zatvara toast. */
  action?: { label: string; onClick: () => void };
  /**
   * Devotion ih je koristio samo da počisti svoju evidenciju posle zatvaranja,
   * pa ovde oba znače isto: toast je zatvoren (rukom, radnjom ili istekom).
   */
  onDismiss?: () => void;
  onAutoClose?: () => void;
};

/** Trajanje kao u Devotionovom paketu za toast (Devotion se na njega oslanjao). */
export const TRAJANJE_TOASTA_MS = 4000;

/** Deo Base UI menadžera koji toast koristi (test podmeće svoj). */
export type MenadzerToasta = {
  add: (opcije: {
    id?: string;
    title?: string;
    description?: string;
    type?: string;
    timeout?: number;
    priority?: "low" | "high";
    onClose?: () => void;
    actionProps?: { children: string; onClick: () => void };
  }) => string;
  close: (id?: string) => void;
};

type Poziv = (poruka: string, opcije?: OpcijeToasta) => string;

export type ToastApi = Poziv & {
  success: Poziv;
  error: Poziv;
  info: Poziv;
  warning: Poziv;
  dismiss: (id?: string) => void;
};

export function napraviToast(menadzer: MenadzerToasta): ToastApi {
  const dodaj =
    (ton: TonToasta): Poziv =>
    (poruka, o = {}) => {
      const zatvoreno =
        o.onDismiss || o.onAutoClose
          ? () => {
              o.onDismiss?.();
              o.onAutoClose?.();
            }
          : undefined;
      return menadzer.add({
        ...(o.id !== undefined ? { id: o.id } : {}),
        title: poruka,
        ...(o.description !== undefined ? { description: o.description } : {}),
        type: ton,
        timeout: o.duration ?? TRAJANJE_TOASTA_MS,
        // Greška i upozorenje se čitaju odmah (aria-live „assertive“).
        priority: ton === "greska" || ton === "upozorenje" ? "high" : "low",
        ...(zatvoreno ? { onClose: zatvoreno } : {}),
        ...(o.action
          ? { actionProps: { children: o.action.label, onClick: o.action.onClick } }
          : {}),
      });
    };
  return Object.assign(dodaj("obicno"), {
    success: dodaj("uspeh"),
    error: dodaj("greska"),
    info: dodaj("info"),
    warning: dodaj("upozorenje"),
    dismiss: (id?: string) => menadzer.close(id),
  });
}

/** Jedini menadžer u aplikaciji; `Toaster` ga crta. */
export const menadzerToasta = Toast.createToastManager();

export const toast: ToastApi = napraviToast(menadzerToasta as MenadzerToasta);
