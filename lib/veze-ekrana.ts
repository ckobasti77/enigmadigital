import type { ModuleKey } from "@/components/app/nav-items";
import type { Provider } from "@/convex/lib/providers";

/**
 * Veze od kojih zavise brojevi jednog modula. Zaglavlje tog ekrana nosi red
 * stanja veze, a fokus broj „podaci od …", kad veza traži pažnju (jedan status
 * veze, P3). Modul kog ovde nema ne zavisi od spoljne veze.
 */
const VEZE_MODULA: Partial<Record<ModuleKey, readonly Provider[]>> = {
  instagram: ["meta_ig"],
  facebook: ["meta_fb"],
  youtube: ["youtube"],
  threads: ["threads"],
  oglasi: ["meta_ads", "google_ads"],
  analitika: ["ga4"],
  openreply: ["openreply"],
};

export function vezeModula(modul: ModuleKey): readonly Provider[] {
  return VEZE_MODULA[modul] ?? [];
}
