// Preneto iz Devotion packages/shared/src/motion.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import {
  DURATION,
  formatCount,
  LONG_PRESS_MS,
  reanimatedSpring,
  REDUCED_FADE_MS,
  rollDigits,
  sampleSpring,
  settleTime,
  SPRING,
  SPRING_NAMES,
  springDurationMs,
  springEasePath,
  springPhysics,
  springPosition,
  STAGGER,
  staggerDelayMs,
  staggerTotalMs,
  SWIPE,
} from "./motion";

describe("tokeni", () => {
  test("trajanja i springovi iz PLAN §6", () => {
    expect(DURATION).toEqual({ press: 90, quick: 160, base: 240, slow: 380 });
    expect(REDUCED_FADE_MS).toBe(120);
    expect(SPRING).toEqual({
      snappy: { response: 0.32, dampingRatio: 0.86 },
      smooth: { response: 0.42, dampingRatio: 1 },
      gentle: { response: 0.5, dampingRatio: 1 },
      bouncy: { response: 0.45, dampingRatio: 0.7 },
    });
    expect(STAGGER).toEqual({ stepMs: 24, maxItems: 6, maxTotalMs: 320 });
  });
});

describe("konverzija springa", () => {
  test.each([
    ["snappy", 385.5, 33.77],
    ["smooth", 223.8, 29.92],
    ["gentle", 157.9, 25.13],
    ["bouncy", 195.0, 19.55],
  ] as const)("%s → stiffness %d, damping %d, mass 1", (name, stiffness, damping) => {
    const physics = springPhysics(SPRING[name]);
    expect(physics.stiffness).toBeCloseTo(stiffness, 0);
    expect(physics.damping).toBeCloseTo(damping, 1);
    expect(physics.mass).toBe(1);
    expect(reanimatedSpring(SPRING[name])).toEqual(physics);
  });

  test("masa skalira krutost i prigušenje", () => {
    const heavy = springPhysics(SPRING.smooth, 2);
    const light = springPhysics(SPRING.smooth, 1);
    expect(heavy.stiffness).toBeCloseTo(light.stiffness * 2, 6);
    expect(heavy.damping).toBeCloseTo(light.damping * 2, 6);
  });

  test("položaj kreće iz 0 i stiže u 1", () => {
    for (const name of SPRING_NAMES) {
      expect(springPosition(SPRING[name], 0)).toBe(0);
      expect(springPosition(SPRING[name], 5)).toBeCloseTo(1, 6);
    }
    // Nadkritičan spring (ζ>1) takođe radi i ne prebacuje.
    const overdamped = { response: 0.4, dampingRatio: 1.4 };
    expect(springPosition(overdamped, 0.2)).toBeLessThan(1);
    expect(springPosition(overdamped, 10)).toBeCloseTo(1, 6);
  });
});

describe("vreme smirivanja", () => {
  test.each([
    ["snappy", 0.449],
    ["smooth", 0.617],
    ["gentle", 0.735],
    ["bouncy", 0.741],
  ] as const)("%s ≈ %d s", (name, seconds) => {
    expect(Math.abs(settleTime(SPRING[name]) - seconds)).toBeLessThan(0.01);
    expect(springDurationMs(SPRING[name])).toBe(Math.round(settleTime(SPRING[name]) * 1000));
  });

  test("posle vremena smirivanja odstupanje ostaje ispod 0,1 %", () => {
    for (const name of SPRING_NAMES) {
      const end = settleTime(SPRING[name]);
      for (let t = end; t < end + 1; t += 0.005) {
        expect(Math.abs(1 - springPosition(SPRING[name], t))).toBeLessThanOrEqual(0.001 + 1e-12);
      }
    }
  });
});

describe("kriva za GSAP CustomEase", () => {
  test("počinje u (0,0), završava tačno u (1,1), t strogo raste", () => {
    for (const name of SPRING_NAMES) {
      const points = sampleSpring(SPRING[name]);
      expect(points[0]).toEqual([0, 0]);
      expect(points[points.length - 1]).toEqual([1, 1]);
      expect(points).toHaveLength(65);
      for (let index = 1; index < points.length; index += 1) {
        expect(points[index][0]).toBeGreaterThan(points[index - 1][0]);
      }
    }
  });

  test("smooth i gentle bez prebačaja, bouncy sa prebačajem, snappy jedva", () => {
    const peak = (name: keyof typeof SPRING) =>
      Math.max(...sampleSpring(SPRING[name], 400).map(([, x]) => x));
    expect(peak("smooth")).toBeLessThanOrEqual(1);
    expect(peak("gentle")).toBeLessThanOrEqual(1);
    expect(peak("bouncy")).toBeGreaterThan(1.04);
    expect(peak("bouncy")).toBeLessThan(1.05);
    expect(peak("snappy")).toBeGreaterThan(1);
    expect(peak("snappy")).toBeLessThan(1.01);
  });

  test("SVG putanja: M0,0 pa L tačke, kraj L1,1", () => {
    const path = springEasePath(SPRING.smooth, 8);
    expect(path).toMatch(/^M0,0( L\d+(\.\d+)?,-?\d+(\.\d+)?){8}$/);
    expect(path.endsWith("L1,1")).toBe(true);
    expect(springEasePath(SPRING.bouncy).split(" ")).toHaveLength(65);
  });
});

describe("stagger", () => {
  test("24 ms korak, posle 6. stavke se ne kasni, ukupno ≤ 320 ms", () => {
    expect(staggerDelayMs(0)).toBe(0);
    expect(staggerDelayMs(1)).toBe(24);
    expect(staggerDelayMs(5)).toBe(120);
    expect(staggerDelayMs(100)).toBe(120);
    expect(staggerDelayMs(-3)).toBe(0);
    expect(staggerTotalMs(0)).toBe(0);
    expect(staggerTotalMs(1)).toBe(DURATION.quick);
    for (const count of [1, 3, 6, 50, 1_000]) {
      expect(staggerTotalMs(count)).toBeLessThanOrEqual(STAGGER.maxTotalMs);
    }
  });
});

describe("swipe (telefon, plan K07 E5)", () => {
  test("brojevi iz plana i redosled pragova", () => {
    expect(SWIPE.activationPx).toBe(14);
    expect(SWIPE.failOffsetYPx).toBe(10);
    expect(SWIPE.commitPx).toBe(96);
    expect(SWIPE.flickVelocity).toBe(800);
    expect(SWIPE.flickMinPx).toBe(48);
    expect(SWIPE.resistAfterPx).toBe(120);
    expect(LONG_PRESS_MS).toBe(300);
    // Aktivacija < trzaj < prag < otpor: svaki prag ima smisla tek posle prethodnog.
    expect(SWIPE.activationPx).toBeLessThan(SWIPE.flickMinPx);
    expect(SWIPE.flickMinPx).toBeLessThan(SWIPE.commitPx);
    expect(SWIPE.commitPx).toBeLessThan(SWIPE.resistAfterPx);
    expect(SWIPE.iconScaleFrom).toBeGreaterThan(0);
    expect(SWIPE.iconScaleFrom).toBeLessThan(1);
    expect(SWIPE.rubberband).toBeGreaterThan(0);
    expect(SWIPE.rubberband).toBeLessThan(1);
  });
});

describe("kotrljanje broja", () => {
  test("formatCount sa granicom", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(42)).toBe("42");
    expect(formatCount(99)).toBe("99");
    expect(formatCount(100)).toBe("99+");
    expect(formatCount(-5)).toBe("0");
    expect(formatCount(7.9)).toBe("7");
    expect(formatCount(1_200, 999)).toBe("999+");
  });

  test("cifre poravnate zdesna sa smerom", () => {
    expect(rollDigits(9, 10)).toEqual([
      { key: "d2", from: null, to: "1", direction: 1 },
      { key: "d1", from: "9", to: "0", direction: 1 },
    ]);
    expect(rollDigits(12, 11)).toEqual([
      { key: "d2", from: "1", to: "1", direction: 0 },
      { key: "d1", from: "2", to: "1", direction: -1 },
    ]);
    expect(rollDigits(99, 100).map((roll) => roll.to)).toEqual(["9", "9", "+"]);
    expect(rollDigits(5, 5).every((roll) => roll.direction === 0)).toBe(true);
  });
});
