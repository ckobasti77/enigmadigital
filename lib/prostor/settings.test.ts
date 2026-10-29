// Preneto iz Devotion packages/shared/src/settings.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, it } from "vitest";

import {
  AREA_LABEL_MAX,
  INVITE_STATUS_LABEL,
  canRevokeInvite,
  cleanAreaLabel,
  inviteStatus,
  memberRoleLabel,
  moveInOrder,
  removeMemberQuestion,
  resolveSettingsTab,
  visibleSettingsTabs,
} from "./settings";

describe("kartice Podešavanja startupa", () => {
  it("član vidi Opšte, Oblasti i Tim; admin još Pozivnice i Lozinke", () => {
    expect(visibleSettingsTabs(false).map((tab) => tab.key)).toEqual(["opste", "oblasti", "tim"]);
    expect(visibleSettingsTabs(true).map((tab) => tab.key)).toEqual(["opste", "oblasti", "tim", "pozivnice", "lozinke"]);
  });

  it("tražena kartica koja nije dostupna pada na Opšte", () => {
    expect(resolveSettingsTab("lozinke", false)).toBe("opste");
    expect(resolveSettingsTab("lozinke", true)).toBe("lozinke");
    expect(resolveSettingsTab("oblasti", false)).toBe("oblasti");
    expect(resolveSettingsTab("nesto", true)).toBe("opste");
    expect(resolveSettingsTab(null, true)).toBe("opste");
  });
});

describe("oblasti", () => {
  it("naziv se skraćuje na razmake, prazan i predug se odbijaju", () => {
    expect(cleanAreaLabel("  Podrška ")).toEqual({ ok: true, label: "Podrška" });
    expect(cleanAreaLabel("   ")).toEqual({ ok: false, error: "Naziv ne može biti prazan." });
    expect(cleanAreaLabel("a".repeat(AREA_LABEL_MAX)).ok).toBe(true);
    expect(cleanAreaLabel("a".repeat(AREA_LABEL_MAX + 1)).ok).toBe(false);
  });

  it("pomeranje menja susede, a ivice vraćaju null", () => {
    expect(moveInOrder(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveInOrder(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveInOrder(["a", "b", "c"], 0, -1)).toBeNull();
    expect(moveInOrder(["a", "b", "c"], 2, 1)).toBeNull();
    expect(moveInOrder(["a"], 5, -1)).toBeNull();
  });

  it("pomeranje ne menja ulazni niz", () => {
    const ids = ["a", "b"];
    moveInOrder(ids, 0, 1);
    expect(ids).toEqual(["a", "b"]);
  });
});

describe("tim i pozivnice", () => {
  it("tekst potvrde i uloga", () => {
    expect(removeMemberQuestion("Ana Petrović")).toBe("Ukloniti Ana Petrović iz projekta? Gubi pristup odmah.");
    expect(memberRoleLabel("admin")).toBe("Admin");
    expect(memberRoleLabel("member")).toBe("Član");
  });

  it("stanje pozivnice i opoziv", () => {
    const base = { claimedAt: null, revokedAt: null, expiresAt: 1000 };
    expect(inviteStatus(base, 500)).toBe("active");
    expect(inviteStatus(base, 1000)).toBe("expired");
    expect(inviteStatus({ ...base, claimedAt: 10 }, 500)).toBe("claimed");
    expect(inviteStatus({ ...base, revokedAt: 10 }, 500)).toBe("revoked");
    expect(INVITE_STATUS_LABEL.active).toBe("Aktivna");
    expect(canRevokeInvite("active")).toBe(true);
    for (const status of ["claimed", "revoked", "expired"] as const) {
      expect(canRevokeInvite(status)).toBe(false);
    }
  });
});
