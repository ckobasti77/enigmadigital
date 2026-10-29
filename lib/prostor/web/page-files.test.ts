// Preneto iz Devotion apps/web/lib/page-files.test.ts (main @ c05c40f), SPAJANJE S11.
import { afterEach, describe, expect, test, vi } from "vitest";

import { normalizeImageForUpload } from "./media-convert";
import {
  inferredContentType,
  isSupportedFile,
  MAX_FILE_BYTES,
  MAX_MEDIA_BYTES,
  maxBytesForFile,
  uploadPageFile,
} from "./page-files";
import type { Id } from "../../../convex/_generated/dataModel";

function makeFile(name: string, type: string, sizeBytes = 4) {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

const uploadArgs = {
  pageId: "page-1" as Id<"pages">,
  generateUploadUrl: async () => ({
    uploadUrl: "https://upload.example.test",
    token: "token",
    expiresAt: Date.now() + 60_000,
  }),
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("podrška za fajlove pre slanja", () => {
  test("HEIC/HEIF prolaze i bez content-type-a, po ekstenziji", () => {
    expect(isSupportedFile(makeFile("IMG_1.heic", ""))).toBe(true);
    expect(isSupportedFile(makeFile("IMG_2.HEIF", "application/octet-stream"))).toBe(
      true,
    );
  });

  test("fajl bez ekstenzije prolazi kad tip kaže da je slika", () => {
    expect(isSupportedFile(makeFile("bezimena", "image/jpeg"))).toBe(true);
  });

  test("izvršni fajl se odbija", () => {
    expect(isSupportedFile(makeFile("virus.exe", "application/x-msdownload"))).toBe(
      false,
    );
  });

  test("prazan tip se dopunjuje iz ekstenzije za skladište", () => {
    expect(inferredContentType(makeFile("IMG_1.heic", ""))).toBe("image/heic");
    expect(inferredContentType(makeFile("snimak.mov", ""))).toBe(
      "video/quicktime",
    );
    expect(inferredContentType(makeFile("logo.png", "image/png"))).toBe(
      "image/png",
    );
    expect(inferredContentType(makeFile("bezimena", ""))).toBe(
      "application/octet-stream",
    );
  });

  test("video dobija širu granicu veličine", () => {
    expect(maxBytesForFile(makeFile("snimak.mp4", "video/mp4"))).toBe(
      MAX_MEDIA_BYTES,
    );
    expect(maxBytesForFile(makeFile("snimak.mov", ""))).toBe(MAX_MEDIA_BYTES);
    expect(maxBytesForFile(makeFile("logo.png", "image/png"))).toBe(
      MAX_FILE_BYTES,
    );
  });
});

describe("uploadPageFile", () => {
  test("prevelika slika pada pre slanja, sa stvarnom veličinom u poruci", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const attach = vi.fn();
    const bigImage = new File(
      // Lažna veličina umesto alokacije 51 MB: bitna je samo `size` vrednost.
      [new Uint8Array(1)],
      "velika.png",
      { type: "image/png" },
    );
    Object.defineProperty(bigImage, "size", { value: MAX_FILE_BYTES + 1 });

    await expect(
      uploadPageFile({ ...uploadArgs, file: bigImage, attach }),
    ).rejects.toThrow(/veći je od 50 MB \(ima .+\)/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(attach).not.toHaveBeenCalled();
  });

  test("video od 60 MB prolazi granicu veličine", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ storageId: "storage-1" })),
    );
    const attach = vi.fn(async () => ({
      ok: true as const,
      fileId: "file-1" as Id<"pageFiles">,
      name: "snimak.mp4",
      size: 60 * 1024 * 1024,
      category: "video" as const,
    }));
    const video = makeFile("snimak.mp4", "video/mp4");
    Object.defineProperty(video, "size", { value: 60 * 1024 * 1024 });

    await expect(
      uploadPageFile({ ...uploadArgs, file: video, attach }),
    ).resolves.toMatchObject({ fileId: "file-1", category: "video" });
  });

  test("pad mreže tokom POST-a daje srpsku poruku i ne zove attach", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const attach = vi.fn();

    await expect(
      uploadPageFile({
        ...uploadArgs,
        file: makeFile("logo.png", "image/png"),
        attach,
      }),
    ).rejects.toThrow("slanje je prekinuto");
    expect(attach).not.toHaveBeenCalled();
  });

  test("neuspešan POST status ne zove attach", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 })),
    );
    const attach = vi.fn();

    await expect(
      uploadPageFile({
        ...uploadArgs,
        file: makeFile("logo.png", "image/png"),
        attach,
      }),
    ).rejects.toThrow("slanje nije uspelo");
    expect(attach).not.toHaveBeenCalled();
  });

  test("attach odbijanje se prosleđuje kao greška sa serverskom porukom", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ storageId: "storage-1" })),
    );
    const attach = vi.fn(async () => ({
      ok: false as const,
      reason: "unsupported" as const,
      message: "Ovaj tip fajla nije podržan.",
    }));

    await expect(
      uploadPageFile({
        ...uploadArgs,
        file: makeFile("logo.png", "image/png"),
        attach,
      }),
    ).rejects.toThrow("Ovaj tip fajla nije podržan.");
  });
});

describe("normalizeImageForUpload", () => {
  test("bez createImageBitmap (edge okruženje) vraća original netaknut", async () => {
    const heic = makeFile("IMG_1.heic", "image/heic");
    await expect(normalizeImageForUpload(heic)).resolves.toBe(heic);
  });

  test("ne-HEIC fajl prolazi netaknut", async () => {
    const png = makeFile("logo.png", "image/png");
    await expect(normalizeImageForUpload(png)).resolves.toBe(png);
  });
});
