/**
 * Getting a file from the operator's machine into Convex storage (F3).
 *
 * Runs in the browser and nowhere else, on purpose: a Reel is up to a
 * gigabyte, and a Convex action has neither the memory nor the time to carry
 * it. The bytes go straight from the machine that has them to the one-shot
 * upload URL, and what comes back — a storage id — is the whole of what the
 * publish job needs.
 *
 * Deliberately NOT reusing `lib/yt-resumable-upload.ts`. That module speaks
 * Google's resumable protocol and imports the YouTube API builders; the two
 * uploads look similar from a distance and have nothing in common underneath,
 * and a shared helper between them would be a shared reason to break.
 */

export type PickedKind = "image" | "video";

/** What the browser can tell us about a picture without sending it anywhere. */
export type ImageProbe = { width: number; height: number };

/** Same for a video, plus the one thing Instagram cares about most. */
export type VideoProbe = {
  width: number;
  height: number;
  durationSeconds: number;
};

/**
 * Measure a picture by decoding it.
 *
 * `null` when the browser cannot decode it — a renamed file, a corrupt one, a
 * format it does not know. The caller treats that as "no evidence", because
 * refusing a picture on our own decoder's silence would be the worse mistake.
 */
export function probeImageFile(file: File): Promise<ImageProbe | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    const done = (result: ImageProbe | null) => {
      URL.revokeObjectURL(url);
      resolve(result);
    };

    image.onload = () => {
      const { naturalWidth: width, naturalHeight: height } = image;
      done(width > 0 && height > 0 ? { width, height } : null);
    };
    image.onerror = () => done(null);
    image.src = url;
  });
}

/** Same idea for video: only the header is read, the file is already local. */
export function probeVideoFile(file: File): Promise<VideoProbe | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;

    const done = (result: VideoProbe | null) => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve(result);
    };

    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      const durationSeconds = Number.isFinite(video.duration)
        ? video.duration
        : 0;
      done(
        width > 0 && height > 0 && durationSeconds > 0
          ? { width, height, durationSeconds }
          : null,
      );
    };
    video.onerror = () => done(null);
    video.src = url;
  });
}

/**
 * POST the file to a one-shot Convex upload URL, reporting progress.
 *
 * `XMLHttpRequest` rather than `fetch` for exactly one reason: `fetch` says
 * nothing at all while a request body is in flight, and a gigabyte of silence
 * is not a progress bar. This is the only place in the app that reaches for
 * the older API, and that is why.
 */
export function uploadFileToStorage(
  uploadUrl: string,
  file: File,
  onProgress: (sentBytes: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl);
    // The stored content type comes from this header, and the publish route
    // hands that same type to Instagram — a wrong one here is a refusal there.
    xhr.setRequestHeader("Content-Type", file.type);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Fajl „${file.name}“ nije stigao do servera.`));
        return;
      }
      try {
        const parsed = JSON.parse(xhr.responseText) as { storageId?: string };
        if (!parsed.storageId) throw new Error("no id");
        resolve(parsed.storageId);
      } catch {
        reject(new Error("Server nije vratio identifikator fajla."));
      }
    };

    xhr.onerror = () =>
      reject(new Error(`Veza je prekinuta dok je „${file.name}“ slat.`));
    xhr.onabort = () => reject(new Error("Slanje je prekinuto."));

    xhr.send(file);
  });
}

/** Which of the two kinds a picked file is, by its own content type. */
export function pickedKindOf(type: string): PickedKind {
  return type.toLowerCase().startsWith("video/") ? "video" : "image";
}
