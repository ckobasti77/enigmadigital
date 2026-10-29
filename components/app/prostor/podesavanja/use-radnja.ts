"use client";

import { useState } from "react";

import { toast } from "@/lib/toast";
import { accessErrorMessage } from "@/lib/prostor/web/greske";

/** Pokreni radnju sa zauzetošću i toastom; `true` kad je uspela. */
export function useRadnja() {
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>, success: string | null, fallback: string) {
    setBusy(true);
    try {
      await action();
      if (success) toast.success(success);
      return true;
    } catch (error) {
      toast.error(accessErrorMessage(error, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}
