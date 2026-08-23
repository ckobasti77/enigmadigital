import { convexAuth } from "@convex-dev/auth/server";
import { Email } from "@convex-dev/auth/providers/Email";
import { Resend as ResendClient } from "resend";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * Normalize email: trim and lowercase so allowlist checks cannot be bypassed
 * via casing or leading/trailing whitespace.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Check if an email is present in the ALLOWED_EMAILS environment variable.
 * FAILS CLOSED: If ALLOWED_EMAILS is missing, empty, or whitespace-only,
 * all access is denied.
 */
export function isEmailAllowed(email?: string | null): boolean {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  const raw = process.env.ALLOWED_EMAILS;
  if (!raw || raw.trim().length === 0) {
    // Fail closed if ALLOWED_EMAILS is not configured in environment
    return false;
  }

  const allowedList = raw
    .split(/[,;\s]+/)
    .map((e) => normalizeEmail(e))
    .filter(Boolean);

  return allowedList.includes(normalized);
}

/**
 * Generate a cryptographically random 6-digit numeric string (100000-999999).
 */
function generate6DigitCode(): string {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return (100000 + (buffer[0] % 900000)).toString();
}

/**
 * Email 6-digit OTP sign-in via Resend.
 *
 * RESEND_API_KEY / EMAIL_FROM / ALLOWED_EMAILS live in the Convex deployment env.
 */
const ResendOTP = Email({
  id: "resend",
  maxAge: 60 * 15, // code valid for 15 minutes
  async generateVerificationToken() {
    return generate6DigitCode();
  },
  async sendVerificationRequest({ identifier: rawEmail, token }) {
    const email = normalizeEmail(rawEmail);

    if (!isEmailAllowed(email)) {
      console.warn(`[auth] Sign-in attempt denied for email: ${email}`);
      throw new Error("Pristup nije dozvoljen za ovu email adresu.");
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM ?? "Enigma <onboarding@resend.dev>";

    if (!apiKey) {
      console.warn(
        `[auth] RESEND_API_KEY not set — OTP code for ${email}: ${token}`,
      );
      return;
    }

    const { error } = await new ResendClient(apiKey).emails.send({
      from,
      to: [email],
      subject: `Kod za prijavu: ${token} · Enigma Command Center`,
      html: otpEmail(token),
      text: `Tvoj jednokratni kod za prijavu u Enigma Command Center je: ${token}\n\nKod važi 15 minuta. Ako nisi ti tražio/la prijavu, ignoriši ovu poruku.`,
    });

    if (error) {
      throw new Error(`Resend failed: ${JSON.stringify(error)}`);
    }
  },
});

function otpEmail(code: string): string {
  return `<!doctype html>
<html lang="sr">
  <body style="margin:0;background:#070d19;padding:40px 16px;font-family:'Helvetica Neue',Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;margin:0 auto;background:#131d31;border:1px solid rgba(96,128,180,0.28);border-radius:14px;">
      <tr>
        <td style="padding:32px 32px 8px;">
          <p style="margin:0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#58c4ff;">Enigma · Command Center</p>
          <h1 style="margin:16px 0 0;font-size:22px;line-height:1.25;color:#f3f7ff;font-weight:700;">Tvoj kod za prijavu</h1>
          <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:rgba(193,211,245,0.75);">Unesi sledeći 6-cifreni kod u aplikaciju da se prijaviš. Kod važi 15 minuta.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 32px 16px;">
          <div style="background:#0b1221;border:1px solid rgba(96,128,180,0.3);border-radius:10px;padding:18px 24px;text-align:center;">
            <span style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,Courier,monospace;font-size:32px;font-weight:700;letter-spacing:0.35em;color:#58c4ff;display:inline-block;padding-left:0.35em;">${code}</span>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 32px 32px;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:rgba(148,170,210,0.6);">Ako nisi ti tražio/la prijavu, slobodno ignoriši ovu poruku.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Jedini workspace u sistemu. Slug se koristi kao ključ pri bootstrap-u naloga,
 * pa mora ostati nepromenjen — menjanje bi odvojilo nove korisnike od postojećih podataka.
 */
const WORKSPACE_SLUG = "enigma-it";
const WORKSPACE_NAME = "Enigma IT";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [ResendOTP],
  callbacks: {
    // Pre-session creation check: guarantees non-allowed users cannot get a session
    async beforeSessionCreation(ctx, { userId }) {
      const db = (ctx as unknown as MutationCtx).db;
      const user = await db.get(userId as Id<"users">);
      const email = user?.email ? normalizeEmail(user.email) : null;
      if (!email || !isEmailAllowed(email)) {
        throw new Error("Pristup nije dozvoljen za ovu email adresu.");
      }
    },

    // Fires once right after user document creation or update.
    // Bootstraps or attaches workspace membership (PLAN.md §3).
    async afterUserCreatedOrUpdated(ctx, { userId, existingUserId, profile }) {
      const db = (ctx as unknown as MutationCtx).db;
      const rawEmail =
        profile?.email ?? (await db.get(userId as Id<"users">))?.email;
      const email = rawEmail ? normalizeEmail(rawEmail as string) : null;
      if (!email || !isEmailAllowed(email)) {
        throw new Error("Pristup nije dozvoljen za ovu email adresu.");
      }

      if (existingUserId) return; // returning user — nothing to do

      const typedUserId = userId as Id<"users">;
      const existingMembership = await db
        .query("members")
        .withIndex("by_user", (q) => q.eq("userId", typedUserId))
        .first();

      if (!existingMembership) {
        // Projekat po dizajnu ima TAČNO JEDAN workspace (slug "enigma-it").
        // Ranije se ovde čitao samo prvi pogodak; ako bi ih iz bilo kog razloga
        // bilo više, novi korisnik bi tiho završio u pogrešnom (praznom)
        // workspace-u i video prazan Command Center bez ijedne poruke o grešci.
        // Zato sada čitamo SVE sa tim slug-om i biramo determinističko najstariji,
        // a višak glasno prijavljujemo.
        const existingWorkspaces = await db
          .query("workspaces")
          .withIndex("by_slug", (q) => q.eq("slug", WORKSPACE_SLUG))
          .collect();

        let workspaceId: Id<"workspaces">;

        if (existingWorkspaces.length === 0) {
          workspaceId = await db.insert("workspaces", {
            name: WORKSPACE_NAME,
            slug: WORKSPACE_SLUG,
          });
        } else {
          const canonical = existingWorkspaces.reduce((oldest, candidate) =>
            candidate._creationTime < oldest._creationTime ? candidate : oldest,
          );
          workspaceId = canonical._id;

          if (existingWorkspaces.length > 1) {
            const duplicates = existingWorkspaces
              .filter((w) => w._id !== canonical._id)
              .map((w) => w._id)
              .join(", ");
            console.warn(
              `[auth] U bazi postoji ${existingWorkspaces.length} workspace-a sa slug-om "${WORKSPACE_SLUG}". ` +
                `Novi član je pridružen najstarijem (${canonical._id}). ` +
                `Višak koji treba očistiti: ${duplicates}.`,
            );
          }
        }

        await db.insert("members", {
          workspaceId,
          userId: typedUserId,
          role: "owner",
        });
      }
    },
  },
});
