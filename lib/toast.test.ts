import { describe, expect, test, vi } from "vitest";

import { TRAJANJE_TOASTA_MS, napraviToast, type MenadzerToasta } from "./toast";

function lazniMenadzer() {
  const dodati: Parameters<MenadzerToasta["add"]>[0][] = [];
  const zatvoreni: Array<string | undefined> = [];
  let brojac = 0;
  const menadzer: MenadzerToasta = {
    add: (o) => {
      dodati.push(o);
      brojac += 1;
      return o.id ?? `t${brojac}`;
    },
    close: (id) => {
      zatvoreni.push(id);
    },
  };
  return { menadzer, dodati, zatvoreni };
}

describe("toast (API kao Devotionov paket za toast)", () => {
  test("svaki ton dodaje toast sa svojim tipom i porukom kao naslovom", () => {
    const { menadzer, dodati } = lazniMenadzer();
    const toast = napraviToast(menadzer);
    toast("Obično.");
    toast.success("Sačuvano.");
    toast.error("Nije sačuvano.");
    toast.info("Za znanje.");
    toast.warning("Pažnja.");
    expect(dodati.map((d) => [d.type, d.title])).toEqual([
      ["obicno", "Obično."],
      ["uspeh", "Sačuvano."],
      ["greska", "Nije sačuvano."],
      ["info", "Za znanje."],
      ["upozorenje", "Pažnja."],
    ]);
  });

  test("greška i upozorenje se čitaju odmah, ostalo učtivo", () => {
    const { menadzer, dodati } = lazniMenadzer();
    const toast = napraviToast(menadzer);
    toast.success("a");
    toast.error("b");
    toast.warning("c");
    toast.info("d");
    expect(dodati.map((d) => d.priority)).toEqual(["low", "high", "high", "low"]);
  });

  test("podrazumevano trajanje je kao u Devotionu, a `duration` ima prednost", () => {
    const { menadzer, dodati } = lazniMenadzer();
    const toast = napraviToast(menadzer);
    toast("a");
    toast("b", { duration: 8000 });
    toast("c", { duration: 0 });
    expect(dodati.map((d) => d.timeout)).toEqual([TRAJANJE_TOASTA_MS, 8000, 0]);
  });

  test("radnja postaje dugme sa natpisom, a opis drugi red", () => {
    const { menadzer, dodati } = lazniMenadzer();
    const toast = napraviToast(menadzer);
    const onClick = vi.fn();
    toast("Završeno: Ponuda", {
      description: "Zadatak je u završenim.",
      action: { label: "Poništi", onClick },
    });
    expect(dodati[0].description).toBe("Zadatak je u završenim.");
    expect(dodati[0].actionProps?.children).toBe("Poništi");
    dodati[0].actionProps?.onClick();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("bez radnje i opisa nema ni praznih polja", () => {
    const { menadzer, dodati } = lazniMenadzer();
    napraviToast(menadzer).success("a");
    expect(dodati[0]).not.toHaveProperty("actionProps");
    expect(dodati[0]).not.toHaveProperty("description");
    expect(dodati[0]).not.toHaveProperty("id");
    expect(dodati[0]).not.toHaveProperty("onClose");
  });

  test("`id` se prosleđuje (isti id menja postojeći toast) i vraća", () => {
    const { menadzer, dodati } = lazniMenadzer();
    const toast = napraviToast(menadzer);
    expect(toast("a", { id: "veza" })).toBe("veza");
    expect(toast("b", { id: "veza" })).toBe("veza");
    expect(dodati.map((d) => d.id)).toEqual(["veza", "veza"]);
  });

  test("onDismiss i onAutoClose se zovu kad se toast zatvori", () => {
    const { menadzer, dodati } = lazniMenadzer();
    const toast = napraviToast(menadzer);
    const onDismiss = vi.fn();
    const onAutoClose = vi.fn();
    toast.success("a", { onDismiss, onAutoClose });
    dodati[0].onClose?.();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onAutoClose).toHaveBeenCalledTimes(1);
  });

  test("dismiss zatvara jedan ili sve", () => {
    const { menadzer, zatvoreni } = lazniMenadzer();
    const toast = napraviToast(menadzer);
    toast.dismiss("x");
    toast.dismiss();
    expect(zatvoreni).toEqual(["x", undefined]);
  });
});
