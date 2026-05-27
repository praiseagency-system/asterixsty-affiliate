/**
 * email.ts — Resend-powered email sender
 *
 * Required env vars:
 *   RESEND_API_KEY           — from resend.com dashboard
 *   RESEND_FROM_EMAIL        — verified sender (e.g. "Praise Agency <noreply@yourdomain.com>")
 *   NEXT_PUBLIC_APP_URL      — e.g. "https://your-app.up.railway.app"
 */

import { Resend } from "resend";

// Lazy — do NOT instantiate at module level: RESEND_API_KEY is absent at build
// time and new Resend("") throws, breaking the Next.js "collect page data" step.
function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  return new Resend(key);
}

const FROM    = process.env.RESEND_FROM_EMAIL ?? "Praise Agency <noreply@praiseagency.id>";
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

// ─── Workspace invitation email ───────────────────────────────────────────────

export interface InviteEmailParams {
  to:            string;   // recipient email
  invitedByName: string;   // person who clicked "Invite"
  workspaceName: string;
  workspaceLogo?: string;  // absolute URL or null
  role:          string;
  inviteToken:   string;
  lang?:         "en" | "id";
}

const COPY = {
  en: {
    subject:    (ws: string) => `You've been invited to join ${ws}`,
    headline:   (name: string) => `${name} invited you`,
    body:       (ws: string, role: string) =>
      `You've been invited to join <strong>${ws}</strong> as <strong>${role}</strong>.`,
    cta:        "Accept Invitation",
    expiry:     "This invitation expires in 7 days.",
    ignore:     "If you didn't expect this invitation, you can safely ignore this email.",
    footer:     "Powered by Praise Agency Affiliate Platform",
  },
  id: {
    subject:    (ws: string) => `Kamu diundang bergabung ke ${ws}`,
    headline:   (name: string) => `${name} mengundangmu`,
    body:       (ws: string, role: string) =>
      `Kamu diundang bergabung ke <strong>${ws}</strong> sebagai <strong>${role}</strong>.`,
    cta:        "Terima Undangan",
    expiry:     "Undangan ini kadaluarsa dalam 7 hari.",
    ignore:     "Jika kamu tidak mengharapkan undangan ini, abaikan email ini.",
    footer:     "Didukung oleh Praise Agency Affiliate Platform",
  },
};

export async function sendInviteEmail(params: InviteEmailParams): Promise<{ ok: boolean; error?: string }> {
  const lang    = params.lang ?? "en";
  const c       = COPY[lang];
  const acceptUrl = `${APP_URL}/invite?token=${params.inviteToken}`;

  const logoBlock = params.workspaceLogo
    ? `<img src="${params.workspaceLogo}" alt="${params.workspaceName}" style="width:48px;height:48px;border-radius:12px;object-fit:cover;display:block;" />`
    : `<div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;">
         <span style="color:#fff;font-size:18px;font-weight:700;font-family:sans-serif;">${params.workspaceName.slice(0, 2).toUpperCase()}</span>
       </div>`;

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${c.subject(params.workspaceName)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f5f7;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">

          <!-- Header gradient -->
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:32px 40px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td>
                    ${logoBlock}
                  </td>
                  <td style="padding-left:16px;vertical-align:middle;">
                    <p style="margin:0;color:rgba(255,255,255,0.7);font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;">
                      ${params.workspaceName}
                    </p>
                    <p style="margin:4px 0 0;color:#fff;font-size:22px;font-weight:700;line-height:1.2;">
                      ${c.headline(params.invitedByName)}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px 24px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#374151;">
                ${c.body(params.workspaceName, params.role)}
              </p>

              <!-- Role pill -->
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 28px;">
                <tr>
                  <td style="background:#ede9fe;border-radius:100px;padding:6px 16px;">
                    <span style="color:#6d28d9;font-size:13px;font-weight:700;">${params.role}</span>
                  </td>
                </tr>
              </table>

              <!-- CTA button -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center">
                    <a href="${acceptUrl}"
                      style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 40px;border-radius:14px;letter-spacing:0.02em;">
                      ${c.cta}
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Link fallback -->
              <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;text-align:center;">
                Or copy this link: <a href="${acceptUrl}" style="color:#6366f1;word-break:break-all;">${acceptUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <div style="height:1px;background:#f3f4f6;"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 28px;">
              <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;">${c.expiry}</p>
              <p style="margin:0;font-size:12px;color:#d1d5db;">${c.ignore}</p>
            </td>
          </tr>

          <!-- Branding footer -->
          <tr>
            <td style="background:#fafafa;border-top:1px solid #f3f4f6;padding:16px 40px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#d1d5db;">${c.footer}</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    if (!process.env.RESEND_API_KEY) {
      // Dev mode without API key — just log the email
      console.log("[email] RESEND_API_KEY not set — invitation email would be sent to:", params.to);
      console.log("[email] Accept URL:", acceptUrl);
      return { ok: true };
    }

    const resend = getResend();
    const result = await resend.emails.send({
      from:    FROM,
      to:      params.to,
      subject: c.subject(params.workspaceName),
      html,
    });

    if (result.error) {
      console.error("[email] Resend error:", result.error);
      return { ok: false, error: result.error.message };
    }

    console.log("[email] Invitation sent to %s (Resend id: %s)", params.to, result.data?.id);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[email] sendInviteEmail threw:", msg);
    return { ok: false, error: msg };
  }
}
