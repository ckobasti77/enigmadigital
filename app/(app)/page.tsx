import { SviProjekti } from "@/components/app/hub/svi-projekti";

/**
 * Hub: `/` van panela je „Svi projekti“. Na panel domenu proxy `/` prepisuje
 * na kontrolnu tablu projekta, pa se ova strana tamo ne vidi.
 *
 * Hub je van ljuske projekta, pa boju mesta nosi sam (kao prijava): boja
 * Kontrolne table.
 */
export default function SviProjektiPage() {
  return (
    <div data-module="tabla" className="flex min-h-full flex-1 flex-col">
      <SviProjekti />
    </div>
  );
}
