import { convexAuth } from "@convex-dev/auth/server";
import { Email } from "@convex-dev/auth/providers/Email";
import { Resend as ResendClient } from "resend";

/**
 * Email magic-link sign-in via Resend.
 *
 * `authorize: undefined` gives magic-link semantics: clicking the link is enough,
 * the user never re-enters their email. RESEND_API_KEY / EMAIL_FROM live in the
 * Convex deployment env (this runs inside a Convex action). If RESEND_API_KEY is
 * missing we log the link so the loop stays testable locally without email set up.
 */
const ResendMagicLink = Email({
  id: "resend",
  maxAge: 60 * 15, // link valid for 15 minutes
  authorize: undefined,
  async sendVerificationRequest({ identifier: email, url }) {
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
    // Fires once, right after the user row is created on first sign-in.
    // Bootstraps the owner's workspace + membership (PLAN.md §3).
    async afterUserCreatedOrUpdated(ctx, { userId, existingUserId }) {
      if (existingUserId) return; // returning user — nothing to do

      const workspaceId = await ctx.db.insert("workspaces", {
        name: "Enigma IT",
        slug: "enigma-it",
      });
      await ctx.db.insert("members", {
        workspaceId,
        userId,
        role: "owner",
      });
    },
  },
});
