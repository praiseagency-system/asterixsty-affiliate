/**
 * email.ts — Resend-powered email sender
 *
 * Required env vars:
 *   RESEND_API_KEY  — from resend.com dashboard
 *   RESEND_FROM     — verified sender, e.g. "invite@praiseagency.id"
 *                     OR full format "Praise Agency <invite@praiseagency.id>"
 *                     Fallback alias: RESEND_FROM_EMAIL (legacy name)
 *   NEXT_PUBLIC_APP_URL — e.g. "https://app.praiseagency.id"
 */

import { Resend } from "resend";

// ─── Blocked sender domains ───────────────────────────────────────────────────
const BLOCKED_SENDER_DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com"];

// ─── Default sender ───────────────────────────────────────────────────────────
const DEFAULT_FROM = "Praise Agency <invite@praiseagency.id>";

// ─── Lazy Resend instantiation ────────────────────────────────────────────────
function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  return new Resend(key);
}

// ─── Resolve FROM address ─────────────────────────────────────────────────────
function resolveFrom(): string {
  const raw = process.env.RESEND_FROM ?? process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM;
  if (raw.includes("<")) return raw;
  return `Praise Agency <${raw.trim()}>`;
}

// ─── Sender validation ────────────────────────────────────────────────────────
function validateSender(from: string): string | null {
  const match  = from.match(/<([^>]+)>/) ?? [null, from];
  const email  = (match[1] ?? from).toLowerCase().trim();
  const domain = email.split("@")[1] ?? "";
  if (!domain) return "Invalid sender address configured in RESEND_FROM.";
  if (BLOCKED_SENDER_DOMAINS.includes(domain)) {
    return `Sender domain "${domain}" is not allowed. Use a verified custom domain (e.g. invite@praiseagency.id).`;
  }
  return null;
}

// ─── Classify Resend errors → user-friendly messages ─────────────────────────
function classifyResendError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const msg = raw.toLowerCase();
  if (msg.includes("domain") && (msg.includes("verif") || msg.includes("not found")))
    return "Email domain is still verifying. Please wait a few minutes and try again.";
  if (msg.includes("from address") || msg.includes("invalid_from") || msg.includes("sender"))
    return "Email domain is still verifying. Please wait a few minutes and try again.";
  if (msg.includes("api_key") || msg.includes("api key") || msg.includes("unauthorized"))
    return "Email service API key is invalid or missing. Contact your administrator.";
  if (msg.includes("rate_limit") || msg.includes("rate limit") || msg.includes("too many"))
    return "Too many emails sent. Please wait a moment and try again.";
  if (msg.includes("quota") || msg.includes("exceeded"))
    return "Email sending quota exceeded. Contact your administrator.";
  const clean = raw.replace(/\{[\s\S]{0,500}\}/, "").trim();
  return clean.length > 150 ? clean.slice(0, 150) + "…" : (clean || "Email delivery failed.");
}

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InviteEmailParams {
  to:            string;
  invitedByName: string;
  workspaceName: string;
  workspaceLogo?: string;
  role:          string;
  inviteToken:   string;
  lang?:         "en" | "id";
}

// ─── Email copy ───────────────────────────────────────────────────────────────

const COPY = {
  en: {
    subject:     (ws: string) => `You've been invited to ${ws}`,
    preheader:   (name: string, ws: string) => `${name} has invited you to join ${ws} on Praise Agency.`,
    eyebrow:     "workspace invitation",
    headline:    (name: string) => `${name} invited you to join`,
    subheadline: (ws: string) => ws,
    body:        (role: string) =>
      `You&rsquo;ve been granted <strong>${role}</strong> access. Click below to accept your invitation and get started.`,
    roleLabel:   "Your role",
    cta:         "Access Workspace",
    expiry:      "This invitation expires in 7 days.",
    ignore:      "If you didn&rsquo;t expect this invitation, no action is needed &mdash; you can safely ignore this email.",
    footer:      "Powered by Praise Agency",
    footerSub:   "Affiliate Management Platform",
  },
  id: {
    subject:     (ws: string) => `Kamu diundang bergabung ke ${ws}`,
    preheader:   (name: string, ws: string) => `${name} mengundangmu untuk bergabung ke ${ws} di Praise Agency.`,
    eyebrow:     "undangan workspace",
    headline:    (name: string) => `${name} mengundangmu bergabung ke`,
    subheadline: (ws: string) => ws,
    body:        (role: string) =>
      `Kamu mendapatkan akses sebagai <strong>${role}</strong>. Klik tombol di bawah untuk menerima undangan.`,
    roleLabel:   "Peranmu",
    cta:         "Akses Workspace",
    expiry:      "Undangan ini kadaluarsa dalam 7 hari.",
    ignore:      "Jika kamu tidak mengharapkan undangan ini, tidak perlu melakukan apa pun &mdash; abaikan saja email ini.",
    footer:      "Powered by Praise Agency",
    footerSub:   "Platform Manajemen Affiliate",
  },
};

// ─── Build HTML template ─────────────────────────────────────────────────────

function buildEmailHtml(params: InviteEmailParams & { acceptUrl: string }): string {
  const lang      = params.lang ?? "en";
  const c         = COPY[lang];
  const initials  = params.workspaceName.slice(0, 2).toUpperCase();

  const avatarBlock = params.workspaceLogo
    ? `<img src="${params.workspaceLogo}" alt="${params.workspaceName}"
           width="48" height="48"
           style="width:48px;height:48px;border-radius:12px;object-fit:cover;
                  display:block;border:1px solid rgba(255,255,255,0.10);" />`
    : `<div style="width:48px;height:48px;border-radius:12px;
                   background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);
                   display:inline-flex;align-items:center;justify-content:center;
                   font-size:18px;font-weight:700;color:#ffffff;
                   font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                   text-align:center;line-height:48px;">${initials}</div>`;

  return `<!DOCTYPE html>
<html lang="${lang}" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${c.subject(params.workspaceName)}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings>
    <o:PixelsPerInch>96</o:PixelsPerInch>
  </o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; background-color: #08080F; }
    @media only screen and (max-width: 600px) {
      .email-wrapper { padding: 16px 0 !important; }
      .email-card    { border-radius: 0 !important; }
      .email-pad     { padding: 28px 24px !important; }
      .header-pad    { padding: 32px 24px 28px !important; }
      .cta-btn       { padding: 14px 24px !important; font-size: 14px !important; }
      .footer-pad    { padding: 20px 24px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#08080F;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

  <!-- Preheader (hidden) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;
              color:#08080F;font-size:1px;line-height:1px;">
    ${c.preheader(params.invitedByName, params.workspaceName)}&nbsp;
    &#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;
    &#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;
  </div>

  <!-- Outer wrapper -->
  <table class="email-wrapper" width="100%" cellpadding="0" cellspacing="0"
    style="background-color:#08080F;padding:48px 24px;" role="presentation">
    <tr>
      <td align="center" valign="top">

        <!-- Card -->
        <table class="email-card" width="100%" cellpadding="0" cellspacing="0"
          style="max-width:540px;background-color:#0F0F1A;border-radius:20px;
                 border:1px solid rgba(255,255,255,0.07);
                 box-shadow:0 0 0 1px rgba(255,255,255,0.04),
                             0 32px 64px rgba(0,0,0,0.6);"
          role="presentation">

          <!-- ── HEADER ───────────────────────────────────────────────────── -->
          <tr>
            <td class="header-pad"
              style="padding:40px 40px 32px;
                     background:linear-gradient(160deg,#1a0a3d 0%,#120d2e 40%,#0d0d1f 100%);
                     border-radius:20px 20px 0 0;
                     border-bottom:1px solid rgba(255,255,255,0.06);
                     position:relative;">

              <!-- Glow orb (supported in most clients) -->
              <div style="position:absolute;top:-40px;right:-20px;width:220px;height:220px;
                          background:radial-gradient(circle,rgba(99,102,241,0.18) 0%,transparent 70%);
                          pointer-events:none;"></div>

              <!-- Praise Agency wordmark -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                style="margin-bottom:28px;">
                <tr>
                  <td>
                    <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',
                                  'Inter',Helvetica,Arial,sans-serif;
                                  font-size:13px;font-weight:700;letter-spacing:0.08em;
                                  text-transform:uppercase;color:rgba(255,255,255,0.35);">
                      Praise&nbsp;Agency
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Workspace info row -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td width="56" valign="top" style="padding-right:16px;">
                    ${avatarBlock}
                  </td>
                  <td valign="middle">
                    <!-- Eyebrow -->
                    <p style="margin:0 0 4px;
                               font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',
                                 'Inter',Helvetica,Arial,sans-serif;
                               font-size:11px;font-weight:600;letter-spacing:0.12em;
                               text-transform:uppercase;color:rgba(255,255,255,0.35);">
                      ${c.eyebrow}
                    </p>
                    <!-- Headline -->
                    <p style="margin:0 0 2px;
                               font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',
                                 'Inter',Helvetica,Arial,sans-serif;
                               font-size:14px;font-weight:500;color:rgba(255,255,255,0.60);
                               line-height:1.4;">
                      ${c.headline(params.invitedByName)}
                    </p>
                    <!-- Workspace name -->
                    <p style="margin:0;
                               font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',
                                 'Inter',Helvetica,Arial,sans-serif;
                               font-size:22px;font-weight:700;color:#FFFFFF;
                               line-height:1.25;letter-spacing:-0.02em;">
                      ${c.subheadline(params.workspaceName)}
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- ── BODY ────────────────────────────────────────────────────── -->
          <tr>
            <td class="email-pad" style="padding:36px 40px 32px;">

              <!-- Body copy -->
              <p style="margin:0 0 28px;
                         font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',
                           'Inter',Helvetica,Arial,sans-serif;
                         font-size:15px;font-weight:400;line-height:1.75;
                         color:rgba(255,255,255,0.58);">
                ${c.body(params.role)}
              </p>

              <!-- Role pill -->
              <table cellpadding="0" cellspacing="0" role="presentation"
                style="margin-bottom:32px;">
                <tr>
                  <td style="background:rgba(99,102,241,0.14);
                              border:1px solid rgba(99,102,241,0.30);
                              border-radius:100px;padding:6px 14px;">
                    <table cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',
                                     'Inter',Helvetica,Arial,sans-serif;
                                   font-size:10px;font-weight:600;letter-spacing:0.10em;
                                   text-transform:uppercase;
                                   color:rgba(255,255,255,0.45);padding-right:8px;">
                          ${c.roleLabel}
                        </td>
                        <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',
                                     'Inter',Helvetica,Arial,sans-serif;
                                   font-size:12px;font-weight:700;
                                   color:#a5b4fc;">
                          ${params.role}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                style="margin-bottom:28px;">
                <tr>
                  <td style="height:1px;background:rgba(255,255,255,0.06);
                              font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>

              <!-- CTA button -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center">
                    <a href="${params.acceptUrl}" class="cta-btn"
                      style="display:inline-block;
                             background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);
                             color:#ffffff;text-decoration:none;
                             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',
                               'Inter',Helvetica,Arial,sans-serif;
                             font-size:15px;font-weight:700;letter-spacing:0.01em;
                             padding:15px 40px;border-radius:12px;
                             box-shadow:0 4px 24px rgba(99,102,241,0.45);
                             mso-padding-alt:15px 40px;">
                      ${c.cta} &nbsp;→
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Link fallback -->
              <p style="margin:20px 0 0;
                         font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',
                           'Inter',Helvetica,Arial,sans-serif;
                         font-size:12px;color:rgba(255,255,255,0.25);
                         text-align:center;line-height:1.5;">
                Or paste this link in your browser:<br/>
                <a href="${params.acceptUrl}"
                  style="color:#6366f1;word-break:break-all;text-decoration:none;">
                  ${params.acceptUrl}
                </a>
              </p>

            </td>
          </tr>

          <!-- ── FOOTER ──────────────────────────────────────────────────── -->
          <tr>
            <td class="footer-pad"
              style="padding:24px 40px;
                     border-top:1px solid rgba(255,255,255,0.05);
                     border-radius:0 0 20px 20px;">

              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td>
                    <!-- Expiry notice -->
                    <p style="margin:0 0 6px;
                               font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',
                                 'Inter',Helvetica,Arial,sans-serif;
                               font-size:12px;color:rgba(255,255,255,0.28);
                               line-height:1.6;">
                      ${c.expiry}
                    </p>
                    <!-- Ignore notice -->
                    <p style="margin:0 0 20px;
                               font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',
                                 'Inter',Helvetica,Arial,sans-serif;
                               font-size:11px;color:rgba(255,255,255,0.18);
                               line-height:1.6;">
                      ${c.ignore}
                    </p>
                    <!-- Divider -->
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                      style="margin-bottom:16px;">
                      <tr>
                        <td style="height:1px;background:rgba(255,255,255,0.05);
                                    font-size:0;line-height:0;">&nbsp;</td>
                      </tr>
                    </table>
                    <!-- Brand lockup -->
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td>
                          <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',
                                         'Inter',Helvetica,Arial,sans-serif;
                                       font-size:12px;font-weight:700;letter-spacing:0.06em;
                                       text-transform:uppercase;
                                       color:rgba(255,255,255,0.20);">
                            ${c.footer}
                          </span>
                          <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',
                                         'Inter',Helvetica,Arial,sans-serif;
                                       font-size:11px;color:rgba(255,255,255,0.12);
                                       padding-left:8px;">
                            &mdash; ${c.footerSub}
                          </span>
                        </td>
                        <td align="right">
                          <a href="${APP_URL}"
                            style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',
                                     'Inter',Helvetica,Arial,sans-serif;
                                   font-size:11px;color:rgba(99,102,241,0.50);
                                   text-decoration:none;">
                            app.praiseagency.id
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>
  <!-- /Outer wrapper -->

</body>
</html>`;
}

// ─── sendInviteEmail ──────────────────────────────────────────────────────────

export async function sendInviteEmail(
  params: InviteEmailParams,
): Promise<{ ok: boolean; error?: string }> {
  const lang      = params.lang ?? "en";
  const c         = COPY[lang];
  const acceptUrl = `${APP_URL}/invite?token=${params.inviteToken}`;
  const FROM      = resolveFrom();

  // ── Dev mode: no API key ────────────────────────────────────────────────
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set — would send invitation to:", params.to);
    console.log("[email] Accept URL:", acceptUrl);
    return { ok: true };
  }

  // ── Validate sender ─────────────────────────────────────────────────────
  const senderErr = validateSender(FROM);
  if (senderErr) {
    console.error("[email] Sender validation failed:", senderErr);
    return { ok: false, error: senderErr };
  }

  // ── Send ────────────────────────────────────────────────────────────────
  try {
    const resend = getResend();
    const result = await resend.emails.send({
      from:    FROM,
      to:      params.to,
      subject: c.subject(params.workspaceName),
      html:    buildEmailHtml({ ...params, acceptUrl }),
    });

    if (result.error) {
      const friendly = classifyResendError(result.error.message ?? String(result.error));
      console.error("[email] Resend API error for %s: %s", params.to, result.error.message);
      return { ok: false, error: friendly };
    }

    console.log("[email] ✓ Invitation sent to %s (id: %s, from: %s)",
      params.to, result.data?.id, FROM);
    return { ok: true };
  } catch (err) {
    const friendly = classifyResendError(err);
    console.error("[email] sendInviteEmail threw for %s: %s",
      params.to, err instanceof Error ? err.message : String(err));
    return { ok: false, error: friendly };
  }
}
