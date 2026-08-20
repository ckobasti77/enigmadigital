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
 * Email magic-link sign-in via Resend.
 *
 * `authorize: undefined` gives magic-link semantics: clicking the link is enough,
 * the user never re-enters their email. RESEND_API_KEY / EMAIL_FROM / ALLOWED_EMAILS
 * live in the Convex deployment env.
 */
const ResendMagicLink = Email({
  id: "resend",
  maxAge: 60 * 15, // link valid for 15 minutes
  authorize: undefined,
  async sendVerificationRequest({ identifier: rawEmail, url }) {
    const email = normalizeEmail(rawEmail);

    if (!isEmailAllowed(email)) {
      console.warn(`[auth] Sign-in attempt denied for email: ${email}`);
      throw new Error("Pristup nije dozvoljen za ovu email adresu.");
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM ?? "Enigma <onboarding@resend.dev>";

    if (!apiKey) {
      console.warn(
        `[auth] RESEND_API_KEY not set — magic link for ${email}: ${url}`,
      );
      return;
    }

    const { error } = await new ResendClient(apiKey).emails.send({
      from,
      to: [email],
      subject: "Prijava · Enigma Command Center",
      html: magicLinkEmail(url),
      text: `Prijavi se u Enigma Command Center:\n\n${url}\n\nLink važi 15 minuta. Ako nisi ti tražio/la prijavu, ignoriši ovu poruku.`,
    });

    if (error) {
      throw new Error(`Resend failed: ${JSON.stringify(error)}`);
    }
  },
});

function magicLinkEmail(url: string): string {
  return `<!doctype html>
<html lang="sr">
  <body style="margin:0;background:#070d19;padding:40px 16px;font-family:'Helvetica Neue',Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;margin:0 auto;background:#131d31;border:1px solid rgba(96,128,180,0.28);border-radius:14px;">
      <tr>
        <td style="padding:32px 32px 8px;">
          <p style="margin:0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#58c4ff;">Enigma · Command Center</p>
          <h1 style="margin:16px 0 0;font-size:22px;line-height:1.25;color:#f3f7ff;font-weight:700;">Tvoj link za prijavu</h1>
          <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:rgba(193,211,245,0.75);">Klikni na dugme ispod da se prijaviš. Link važi 15 minuta.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 32px 8px;">
          <a href="${url}" style="display:inline-block;background:#58c4ff;color:#0b1221;font-size:14px;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:10px;">Prijavi se</a>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 32px 32px;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:rgba(148,170,210,0.6);">Ako dugme ne radi, kopiraj ovaj link:</p>
          <p style="margin:6px 0 0;font-size:12px;line-height:1.6;word-break:break-all;"><a href="${url}" style="color:#58c4ff;">${url}</a></p>
          <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:rgba(148,170,210,0.6);">Ako nisi ti tražio/la prijavu, slobodno ignoriši ovu poruku.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [ResendMagicLink],
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
        const workspace = await db
          .query("workspaces")
          .withIndex("by_slug", (q) => q.eq("slug", "enigma-it"))
          .first();

        let workspaceId: Id<"workspaces">;
        if (workspace !== null) {
          workspaceId = workspace._id;
        } else {
          workspaceId = await db.insert("workspaces", {
            name: "Enigma IT",
            slug: "enigma-it",
          });
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
