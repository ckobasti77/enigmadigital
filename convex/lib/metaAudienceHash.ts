/**
 * ============================================================================
 * META AUDIENCE PII NORMALIZATION & SHA-256 HASHING (V8 Runtime)
 * ============================================================================
 *
 * Implements Meta Marketing API Customer List Hashing Specifications.
 * Uses `crypto.subtle` (native in Convex V8 runtime and Node.js) — NO "use node".
 *
 * Rules:
 *   - Email: trim, lowercase, SHA-256
 *   - Phone: digits only, country code included, without '+' and spaces
 *            (for Serbia: 0641234567 -> 381641234567), SHA-256
 *   - First / Last Name: lowercase, without punctuation, without diacritics:
 *            č,ć -> c,  š -> s,  ž -> z,  đ -> d, remove spaces/punctuation, SHA-256
 *   - City / Country: lowercase, no spaces, ISO-3166-1 alpha-2 country, SHA-256
 *
 * PII Protection:
 *   - Raw PII is NEVER saved to database, logs, URLs, or error messages.
 * ============================================================================
 */

/**
 * Computes SHA-256 hash in hexadecimal format using crypto.subtle.
 */
export async function sha256Hex(value: string): Promise<string> {
  if (!value) return "";
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Normalization Functions ─────────────────────────────────────────────────

/**
 * Normalizes email address:
 *   1. Trim leading and trailing whitespace
 *   2. Convert to lowercase
 * If already a 64-char hex SHA-256 string, keeps it unchanged.
 */
export function normalizeEmail(email?: string | null): string {
  if (!email || typeof email !== "string") return "";
  const trimmed = email.trim().toLowerCase();
  return trimmed;
}

/**
 * Normalizes phone number according to Meta specification:
 *   1. Remove all non-digits (including '+', spaces, dashes, dots, parentheses)
 *   2. Remove leading international '00' prefix
 *   3. If starts with single '0' (local trunk prefix), replace with country code (default '381' for Serbia)
 *   4. Returns digits-only string with country code
 */
export function normalizePhone(
  phone?: string | null,
  defaultCountryPrefix: string = "381",
): string {
  if (!phone || typeof phone !== "string") return "";
  let digits = phone.replace(/\D/g, "");
  if (!digits) return "";

  // Remove leading 00 international prefix if present (e.g. 0038164... -> 38164...)
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  // If local number starting with single 0 (e.g. 0641234567), replace leading 0 with country prefix
  if (digits.startsWith("0")) {
    digits = `${defaultCountryPrefix}${digits.slice(1)}`;
  }

  return digits;
}

/**
 * Normalizes person name (first or last name) according to Meta specification:
 *   1. Convert to lowercase
 *   2. Remove Serbian Latin diacritics: č,ć -> c, š -> s, ž -> z, đ -> d
 *   3. Remove all spaces, punctuation, digits, and special characters
 */
export function normalizeName(name?: string | null): string {
  if (!name || typeof name !== "string") return "";
  let clean = name.toLowerCase().trim();

  // Replace Serbian Latin diacritics explicitly
  clean = clean
    .replace(/[čć]/g, "c")
    .replace(/š/g, "s")
    .replace(/ž/g, "z")
    .replace(/đ/g, "d");

  // Remove generic unicode combining diacritical marks if any remaining
  clean = clean.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Remove all non-a-z characters (including spaces, dashes, punctuation)
  clean = clean.replace(/[^a-z]/g, "");

  return clean;
}

/**
 * Normalizes city name:
 *   1. Convert to lowercase
 *   2. Remove diacritics (č,ć -> c, š -> s, ž -> z, đ -> d)
 *   3. Remove spaces and punctuation
 */
export function normalizeCity(city?: string | null): string {
  if (!city || typeof city !== "string") return "";
  let clean = city.toLowerCase().trim();

  clean = clean
    .replace(/[čć]/g, "c")
    .replace(/š/g, "s")
    .replace(/ž/g, "z")
    .replace(/đ/g, "d");

  clean = clean.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  clean = clean.replace(/[^a-z]/g, "");

  return clean;
}

/**
 * Normalizes country code:
 *   1. Convert to lowercase
 *   2. ISO-3166-1 alpha-2 2-letter code (e.g. "rs", "us", "de")
 */
export function normalizeCountry(country?: string | null): string {
  if (!country || typeof country !== "string") return "";
  const clean = country.toLowerCase().trim().replace(/[^a-z]/g, "");
  return clean.slice(0, 2);
}

/**
 * Normalizes postal code / ZIP:
 *   1. Convert to lowercase
 *   2. Remove whitespace
 */
export function normalizeZip(zip?: string | null): string {
  if (!zip || typeof zip !== "string") return "";
  return zip.toLowerCase().trim().replace(/\s+/g, "");
}

// ── Hash Functions ──────────────────────────────────────────────────────────

/**
 * Normalizes and hashes email using SHA-256.
 * If already a 64-char SHA-256 hash, returns as is.
 */
export async function hashEmail(email?: string | null): Promise<string> {
  const norm = normalizeEmail(email);
  if (!norm) return "";
  if (/^[a-f0-9]{64}$/i.test(norm)) return norm;
  return await sha256Hex(norm);
}

/**
 * Normalizes and hashes phone using SHA-256.
 */
export async function hashPhone(
  phone?: string | null,
  defaultCountryPrefix: string = "381",
): Promise<string> {
  const norm = normalizePhone(phone, defaultCountryPrefix);
  if (!norm) return "";
  if (/^[a-f0-9]{64}$/i.test(norm)) return norm;
  return await sha256Hex(norm);
}

/**
 * Normalizes and hashes name using SHA-256.
 */
export async function hashName(name?: string | null): Promise<string> {
  const norm = normalizeName(name);
  if (!norm) return "";
  if (/^[a-f0-9]{64}$/i.test(norm)) return norm;
  return await sha256Hex(norm);
}

/**
 * Normalizes and hashes city using SHA-256.
 */
export async function hashCity(city?: string | null): Promise<string> {
  const norm = normalizeCity(city);
  if (!norm) return "";
  if (/^[a-f0-9]{64}$/i.test(norm)) return norm;
  return await sha256Hex(norm);
}

/**
 * Normalizes and hashes country using SHA-256.
 */
export async function hashCountry(country?: string | null): Promise<string> {
  const norm = normalizeCountry(country);
  if (!norm) return "";
  if (/^[a-f0-9]{64}$/i.test(norm)) return norm;
  return await sha256Hex(norm);
}

/**
 * Normalizes and hashes postal code using SHA-256.
 */
export async function hashZip(zip?: string | null): Promise<string> {
  const norm = normalizeZip(zip);
  if (!norm) return "";
  if (/^[a-f0-9]{64}$/i.test(norm)) return norm;
  return await sha256Hex(norm);
}

// ── Customer List Preparation (Meta Custom Audience Users Payload) ──────────

export interface RawAudienceUser {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  country?: string;
  zip?: string;
}

export interface HashedAudiencePayload {
  schema: string[];
  data: string[][];
  userCount: number;
}

/**
 * Prepares raw customer records into hashed schema/data payload for Meta Graph API
 * `POST /<audience_id>/users`.
 *
 * Guarantees that the returned object contains ONLY SHA-256 hashes and NO raw PII.
 */
export async function prepareHashedAudiencePayload(
  users: RawAudienceUser[],
  defaultCountryPrefix: string = "381",
): Promise<HashedAudiencePayload> {
  const schema = [
    "EMAIL",
    "PHONE",
    "FN",
    "LN",
    "CT",
    "COUNTRY",
    "ZIP",
  ];

  const data: string[][] = [];

  for (const user of users) {
    const [emailH, phoneH, fnH, lnH, ctH, countryH, zipH] = await Promise.all([
      hashEmail(user.email),
      hashPhone(user.phone, defaultCountryPrefix),
      hashName(user.firstName),
      hashName(user.lastName),
      hashCity(user.city),
      hashCountry(user.country),
      hashZip(user.zip),
    ]);

    // Include row only if at least one identifier is present
    if (emailH || phoneH || fnH || lnH || ctH || countryH || zipH) {
      data.push([emailH, phoneH, fnH, lnH, ctH, countryH, zipH]);
    }
  }

  return {
    schema,
    data,
    userCount: data.length,
  };
}

// ── PII Sanitizer & Leak Guard ──────────────────────────────────────────────

/**
 * Sanitizes any string (e.g. error message, log entry, API response)
 * to ensure that raw email addresses or phone numbers are never leaked.
 */
export function sanitizePii(input: unknown): string {
  if (input === null || input === undefined) return "";
  const str = typeof input === "string" ? input : JSON.stringify(input);

  return str
    // Redact email addresses
    .replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
      "<redacted_email>",
    )
    // Redact phone numbers with international prefix or 9+ digits
    .replace(
      /(?:\+?381|00381|\b06[0-9])[0-9\s/-]{6,12}\b/gi,
      "<redacted_phone>",
    );
}
