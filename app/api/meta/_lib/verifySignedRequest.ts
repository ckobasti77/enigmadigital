import crypto from "crypto";
import { NextRequest } from "next/server";

export interface MetaSignedRequestPayload {
  user_id?: string;
  algorithm?: string;
  issued_at?: number;
  [key: string]: unknown;
}

/**
 * Ekstrahuje `signed_request` string iz dolaznog HTTP zahteva.
 * Podržava form-encoded (POST body), multipart, JSON i URL query parametre.
 */
export async function extractSignedRequest(
  request: NextRequest | Request,
): Promise<string | null> {
  const contentType = request.headers.get("content-type") || "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    try {
      const formData = await request.formData();
      const val = formData.get("signed_request");
      if (typeof val === "string" && val.trim().length > 0) {
        return val.trim();
      }
    } catch {
      // Ignorišemo grešku i probamo alternativne načine
    }
  }

  if (contentType.includes("application/json")) {
    try {
      const json = (await request.json()) as { signed_request?: unknown };
      if (typeof json?.signed_request === "string" && json.signed_request.trim().length > 0) {
        return json.signed_request.trim();
      }
    } catch {
      // Ignorišemo grešku i probamo fallback
    }
  }

  try {
    const text = await request.text();
    if (text && text.length > 0) {
      const params = new URLSearchParams(text);
      const val = params.get("signed_request");
      if (val && val.trim().length > 0) {
        return val.trim();
      }
    }
  } catch {
    // Ignorišemo
  }

  return null;
}

/**
 * Parsira i verifikuje Meta `signed_request` (oblik `<base64url_sig>.<base64url_payload>`).
 *
 * Proverava HMAC-SHA256 potpis koristeći `THREADS_APP_SECRET`.
 * Ako potpis nije validan, secret nije podešen ili je format neispravan — vraća `null`.
 *
 * Bezbednost:
 * - THREADS_APP_SECRET se nikada ne loguje.
 * - signed_request i korisnički podaci se nikada ne loguju.
 */
export function verifySignedRequest(
  signedRequest: string,
  secret: string | undefined = process.env.THREADS_APP_SECRET,
): MetaSignedRequestPayload | null {
  if (!secret || secret.trim().length === 0) {
    console.error("[verifySignedRequest] THREADS_APP_SECRET nije podešen u environment varijablama.");
    return null;
  }

  const parts = signedRequest.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [encodedSig, encodedPayload] = parts;
  if (!encodedSig || !encodedPayload) {
    return null;
  }

  try {
    const sigBuffer = Buffer.from(encodedSig, "base64url");
    const expectedSigBuffer = crypto
      .createHmac("sha256", secret.trim())
      .update(encodedPayload)
      .digest();

    if (sigBuffer.length !== expectedSigBuffer.length) {
      return null;
    }

    if (!crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)) {
      return null;
    }

    const payloadJson = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson);

    if (typeof payload !== "object" || payload === null) {
      return null;
    }

    if (
      typeof payload.algorithm === "string" &&
      payload.algorithm.toUpperCase() !== "HMAC-SHA256"
    ) {
      console.error("[verifySignedRequest] Nepodržan algoritam potpisa.");
      return null;
    }

    return payload as MetaSignedRequestPayload;
  } catch {
    return null;
  }
}
