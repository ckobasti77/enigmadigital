/**
 * Credentials encryption (PLAN.md §3).
 *
 * AES-256-GCM using the Web Crypto API (`globalThis.crypto.subtle`), which is
 * available in BOTH the Convex V8 runtime (so mutations can encrypt before
 * write) and the Node runtime (so `"use node"` sync actions can decrypt at sync
 * time). This module deliberately has NO `"use node"` directive and never
 * touches Node's `crypto` module, so the same code runs in both places.
 *
 * Stored format:  "v1:" + hex( iv[12] || ciphertext-with-gcm-tag )
 * The "v1" prefix leaves room for key rotation later. Hex (not base64) keeps
 * the encoding dependency-free and identical across runtimes.
 *
 * The 32-byte key comes from the `CREDENTIALS_ENCRYPTION_KEY` deployment env
 * var (64 hex chars). It is NEVER logged or echoed in an error message.
 */

const KEY_ENV = "CREDENTIALS_ENCRYPTION_KEY";
const VERSION = "v1";
const IV_LENGTH = 12; // 96-bit nonce, the standard for AES-GCM

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let cachedKey: { hex: string; promise: Promise<CryptoKey> } | null = null;

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

function getKey(): Promise<CryptoKey> {
  const hex = process.env[KEY_ENV];
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    // Never include the value — just say the shape is wrong.
    throw new Error(
      `${KEY_ENV} is missing or malformed (expected 64 hex chars / 32 bytes).`,
    );
  }
  if (cachedKey && cachedKey.hex === hex) return cachedKey.promise;

  const promise = crypto.subtle.importKey(
    "raw",
    hexToBytes(hex),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  cachedKey = { hex, promise };
  return promise;
}

/** Encrypt a credential string. Returns the versioned, hex-encoded ciphertext. */
export async function encryptCredentials(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(plaintext),
    ),
  );
  const packed = new Uint8Array(iv.length + ciphertext.length);
  packed.set(iv, 0);
  packed.set(ciphertext, iv.length);
  return `${VERSION}:${bytesToHex(packed)}`;
}

/** Decrypt a value produced by {@link encryptCredentials}. */
export async function decryptCredentials(stored: string): Promise<string> {
  const sep = stored.indexOf(":");
  const version = sep === -1 ? "" : stored.slice(0, sep);
  if (version !== VERSION) {
    throw new Error("Unsupported credentials format.");
  }
  const packed = hexToBytes(stored.slice(sep + 1));
  const iv = packed.slice(0, IV_LENGTH);
  const ciphertext = packed.slice(IV_LENGTH);
  const key = await getKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return decoder.decode(plaintext);
}
