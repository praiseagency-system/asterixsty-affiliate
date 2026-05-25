/**
 * Google OAuth 2.0 + Forms API helpers (server-only, no external SDK).
 * Credentials come from DB (not env). Tokens are encrypted at rest.
 */
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";

// ── OAuth endpoints ──────────────────────────────────────────────────────────
const AUTH_URL  = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const INFO_URL  = "https://www.googleapis.com/oauth2/v2/userinfo";
const FORMS_URL = "https://forms.googleapis.com/v1/forms";

const SCOPES = [
  "email",
  "profile",
  "https://www.googleapis.com/auth/forms.body",
  "https://www.googleapis.com/auth/forms.responses.readonly",
  "https://www.googleapis.com/auth/drive.file",
].join(" ");

// ── DB helpers ───────────────────────────────────────────────────────────────
export async function getOrCreateIntegration(brandId = "default") {
  let g = await prisma.googleIntegration.findUnique({ where: { brandId } });
  if (!g) {
    g = await prisma.googleIntegration.create({ data: { brandId } });
  }
  return g;
}

async function getClientConfig(brandId = "default"): Promise<{
  clientId: string;
  clientSecret: string;
} | null> {
  const g = await getOrCreateIntegration(brandId);
  if (!g.clientId || !g.encryptedClientSecret) return null;
  const clientSecret = await decrypt(g.encryptedClientSecret);
  if (!clientSecret) return null;
  return { clientId: g.clientId, clientSecret };
}

// ── isConfigured ─────────────────────────────────────────────────────────────
export async function isConfigured(brandId = "default"): Promise<boolean> {
  const cfg = await getClientConfig(brandId);
  return !!(cfg?.clientId && cfg?.clientSecret);
}

// ── OAuth URL ────────────────────────────────────────────────────────────────
export async function getOAuthUrl(redirectUri: string, brandId = "default"): Promise<string> {
  const cfg = await getClientConfig(brandId);
  if (!cfg) throw new Error("Google credentials not configured");
  const p = new URLSearchParams({
    client_id:     cfg.clientId,
    redirect_uri:  redirectUri,
    response_type: "code",
    scope:         SCOPES,
    access_type:   "offline",
    prompt:        "consent",
    state:         brandId,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

// ── Code → tokens ─────────────────────────────────────────────────────────────
export async function exchangeCode(
  code: string,
  redirectUri: string,
  brandId = "default",
): Promise<{ email: string }> {
  const cfg = await getClientConfig(brandId);
  if (!cfg) throw new Error("Google credentials not configured");

  const tokenRes = await fetch(TOKEN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      code,
      client_id:     cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri:  redirectUri,
      grant_type:    "authorization_code",
    }),
  });
  const tok = await tokenRes.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!tokenRes.ok) throw new Error(tok.error_description || tok.error || "Token exchange failed");

  const userRes = await fetch(INFO_URL, {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  });
  const user = await userRes.json() as { email?: string };

  const accessToken  = tok.access_token  || "";
  const refreshToken = tok.refresh_token || "";
  const expiresIn    = tok.expires_in    || 3600;
  const email        = user.email        || "";
  const tokenExpiry  = new Date(Date.now() + expiresIn * 1000);

  const encAccessToken  = await encrypt(accessToken);
  const encRefreshToken = refreshToken ? await encrypt(refreshToken) : undefined;

  await prisma.googleIntegration.update({
    where: { brandId },
    data: {
      encryptedAccessToken:  encAccessToken,
      tokenExpiry,
      connectedEmail: email,
      status:         "connected",
      connectedAt:    new Date(),
      ...(encRefreshToken ? { encryptedRefreshToken: encRefreshToken } : {}),
    },
  });

  return { email };
}

// ── Refresh token ────────────────────────────────────────────────────────────
async function doRefreshToken(
  refreshTokenPlain: string,
  brandId = "default",
): Promise<string | null> {
  const cfg = await getClientConfig(brandId);
  if (!cfg) return null;

  const res = await fetch(TOKEN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      refresh_token:  refreshTokenPlain,
      client_id:      cfg.clientId,
      client_secret:  cfg.clientSecret,
      grant_type:     "refresh_token",
    }),
  });
  const d = await res.json() as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !d.access_token) return null;

  const newAccessToken = d.access_token;
  const expiresIn      = d.expires_in || 3600;
  const encAccessToken = await encrypt(newAccessToken);

  await prisma.googleIntegration.update({
    where: { brandId },
    data:  {
      encryptedAccessToken: encAccessToken,
      tokenExpiry:          new Date(Date.now() + expiresIn * 1000),
      status:               "connected",
    },
  });

  return newAccessToken;
}

// ── Get valid access token (auto-refresh if expired) ─────────────────────────
export async function getValidToken(brandId = "default"): Promise<string | null> {
  let g;
  try {
    g = await prisma.googleIntegration.findUnique({ where: { brandId } });
  } catch {
    return null;
  }
  if (!g?.encryptedAccessToken) return null;

  const accessToken = await decrypt(g.encryptedAccessToken);
  if (!accessToken) return null;

  const now    = Date.now();
  const expiry = g.tokenExpiry ? g.tokenExpiry.getTime() : 0;
  const valid  = expiry - now > 5 * 60 * 1000; // 5-min buffer
  if (valid) return accessToken;

  if (!g.encryptedRefreshToken) {
    await prisma.googleIntegration.update({
      where: { brandId },
      data:  { status: "expired" },
    });
    return null;
  }

  const refreshTokenPlain = await decrypt(g.encryptedRefreshToken);
  if (!refreshTokenPlain) return null;

  try {
    const newToken = await doRefreshToken(refreshTokenPlain, brandId);
    if (!newToken) {
      await prisma.googleIntegration.update({
        where: { brandId },
        data:  { status: "expired" },
      });
    }
    return newToken;
  } catch {
    await prisma.googleIntegration.update({
      where: { brandId },
      data:  { status: "expired" },
    }).catch(() => {});
    return null;
  }
}

// ── Entry ID derivation ───────────────────────────────────────────────────────
// The Forms API returns questionId as an 8-char hex string (e.g. "34e3b90e").
// Google Forms prefilled URLs use the DECIMAL form of that hex value as the
// entry param: parseInt("34e3b90e", 16) = 885956494 → "entry.885956494".
// This is reliable and doesn't require any HTML parsing.
export function deriveEntryIds(questionIds: Record<string, string>): Record<string, string> {
  const entryIds: Record<string, string> = {};
  for (const [key, qId] of Object.entries(questionIds)) {
    const numId = parseInt(qId, 16);
    if (!isNaN(numId) && numId > 0) {
      entryIds[key] = `entry.${numId}`;
    }
  }
  return entryIds;
}

// ── Prefilled link (pure, synchronous) ───────────────────────────────────────
export function generatePrefilledLink(opts: {
  formPublicId: string;
  entryIds:     Record<string, string>;
  deliveryId:   number;
  username:     string;
  produk:       string;
}): string {
  if (!opts.formPublicId) return "";
  const base = `https://docs.google.com/forms/d/e/${opts.formPublicId}/viewform`;
  const params: Record<string, string> = { usp: "pp_url" };
  if (opts.entryIds.deliveryId) params[opts.entryIds.deliveryId] = String(opts.deliveryId);
  if (opts.entryIds.username)   params[opts.entryIds.username]   = opts.username;
  if (opts.entryIds.produk)     params[opts.entryIds.produk]     = opts.produk;
  return `${base}?${new URLSearchParams(params).toString()}`;
}

// ── Personal prefilled link (async, handles entryId auto-derivation) ──────────
// Use this in all places that need a personal form URL. Handles:
//   1. Deriving entryIds from stored questionIds if formEntryIds is empty
//   2. Persisting derived entryIds back to DB for future use
//   3. Returning "" if form is not configured (safe to call always)
export async function generatePersonalFormLink(opts: {
  deliveryId: number;
  username:   string;
  produk:     string;
  brandId?:   string;
}): Promise<string> {
  const brandId = opts.brandId || "default";
  let gCfg;
  try {
    gCfg = await prisma.googleIntegration.findUnique({ where: { brandId } });
  } catch { return ""; }

  if (!gCfg?.googleFormPublicId) return "";

  // Load stored entryIds
  let entryIds: Record<string, string> = {};
  try { entryIds = JSON.parse(gCfg.formEntryIds || "{}"); } catch { /* ignore */ }

  // If empty, derive from stored questionIds (hex → decimal)
  if (Object.keys(entryIds).length === 0 && gCfg.formQuestionIds) {
    let questionIds: Record<string, string> = {};
    try { questionIds = JSON.parse(gCfg.formQuestionIds); } catch { /* ignore */ }
    entryIds = deriveEntryIds(questionIds);

    if (Object.keys(entryIds).length > 0) {
      // Persist so future calls are instant
      await prisma.googleIntegration.update({
        where: { brandId },
        data:  { formEntryIds: JSON.stringify(entryIds) },
      }).catch(() => { /* non-critical */ });
    }
  }

  // Can't generate a useful prefilled link without entry IDs
  if (Object.keys(entryIds).length === 0) return "";

  return generatePrefilledLink({
    formPublicId: gCfg.googleFormPublicId,
    entryIds,
    deliveryId:   opts.deliveryId,
    username:     opts.username,
    produk:       opts.produk,
  });
}

// ── Auto-create Google Form ───────────────────────────────────────────────────
export async function createGoogleForm(
  brandId = "default",
  formTitle = "Asterixsty Video Submission",
): Promise<{
  formId: string;
  publicId: string;
  entryIds: Record<string, string>;
  questionIds: Record<string, string>;
}> {
  const token = await getValidToken(brandId);
  if (!token) throw new Error("Not authenticated with Google");

  // 1. Create form
  const createRes = await fetch(FORMS_URL, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ info: { title: formTitle, documentTitle: formTitle } }),
  });
  if (!createRes.ok) {
    const err = await createRes.json() as { error?: { message?: string } };
    throw new Error(err.error?.message || "Failed to create form");
  }
  const form = await createRes.json() as {
    formId: string;
    responderUri: string;
  };
  const formId = form.formId;

  // 2. Fetch products from DB for dropdown options
  const dbProducts = await prisma.product.findMany({ orderBy: { no: "asc" } });
  const productOptions = dbProducts.length > 0
    ? dbProducts.map((p) => p.nama)
    : ["Produk A", "Produk B"]; // fallback if no products yet

  const videoOptions = Array.from({ length: 10 }, (_, i) => `Video ${i + 1}`);

  // 3. Build questions — no "Catatan", Produk = dropdown, Video 1-10 dropdown
  type QuestionDef = {
    title:       string;
    type:        "TEXT" | "DROPDOWN";
    required:    boolean;
    description?: string;
    options?:    string[];
  };
  const questions: QuestionDef[] = [
    {
      title:       "Delivery ID",
      type:        "TEXT",
      required:    false,
      description: "Terisi otomatis oleh sistem — jangan diubah",
    },
    {
      title:    "Username TikTok",
      type:     "TEXT",
      required: true,
    },
    {
      title:    "Produk",
      type:     "DROPDOWN",
      required: true,
      options:  productOptions,
    },
    {
      title:    "Pilih Pengumpulan Video",
      type:     "DROPDOWN",
      required: true,
      options:  videoOptions,
    },
    {
      title:    "Link Video TikTok",
      type:     "TEXT",
      required: true,
    },
    {
      title:    "Spark Code",
      type:     "TEXT",
      required: true,
    },
  ];

  const requests = questions.map((q, index) => ({
    createItem: {
      item: {
        title:       q.title,
        description: q.description ?? "",
        questionItem: {
          question: {
            required: q.required,
            ...(q.type === "DROPDOWN"
              ? { choiceQuestion: { type: "DROP_DOWN", options: (q.options || []).map((o) => ({ value: o })) } }
              : { textQuestion: { paragraph: false } }),
          },
        },
      },
      location: { index },
    },
  }));

  const batchRes = await fetch(`${FORMS_URL}/${formId}:batchUpdate`, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requests }),
  });
  if (!batchRes.ok) {
    const err = await batchRes.json() as { error?: { message?: string } };
    throw new Error(err.error?.message || "Failed to add form questions");
  }

  // 3. Get updated form to extract question IDs
  const formRes = await fetch(`${FORMS_URL}/${formId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const formData = await formRes.json() as {
    responderUri: string;
    items?: Array<{
      title: string;
      questionItem?: {
        question: { questionId: string };
      };
    }>;
  };

  // Extract public ID from responderUri
  // responderUri = "https://docs.google.com/forms/d/e/1FAIpQLSe.../viewform"
  const responderUri = formData.responderUri || form.responderUri || "";
  const publicIdMatch = responderUri.match(/\/forms\/d\/e\/([^/]+)\/viewform/);
  const publicId = publicIdMatch ? publicIdMatch[1] : "";

  // Map question titles → internal keys
  const questionIds: Record<string, string> = {};
  const keyMap: Record<string, string> = {
    "Delivery ID":             "deliveryId",
    "Username TikTok":         "username",
    "Produk":                  "produk",
    "Pilih Pengumpulan Video": "videoKe",
    "Link Video TikTok":       "tiktokLink",
    "Spark Code":              "sparkCode",
  };
  for (const item of (formData.items || [])) {
    if (item.questionItem?.question?.questionId) {
      const key = keyMap[item.title];
      if (key) questionIds[key] = item.questionItem.question.questionId;
    }
  }

  // 4. Derive entry IDs from questionIds (hex → decimal) — primary, reliable method.
  //    The Forms API questionId is a hex string; the prefilled URL uses its decimal value.
  //    e.g. questionId "34e3b90e" → parseInt("34e3b90e", 16) = 885956494 → "entry.885956494"
  const entryIds: Record<string, string> = deriveEntryIds(questionIds);

  // Secondary: try FB_PUBLIC_LOAD_DATA_ HTML parsing as verification / additional fields
  if (Object.keys(entryIds).length === 0) {
    const FIELD_KEYS = ["deliveryId", "username", "produk", "videoKe", "tiktokLink", "sparkCode"];
    try {
      const htmlRes = await fetch(responderUri || `https://docs.google.com/forms/d/e/${publicId}/viewform`);
      const html = await htmlRes.text();
      const fbMatch = html.match(/var FB_PUBLIC_LOAD_DATA_ = ([\s\S]*?);<\/script>/);
      if (fbMatch) {
        try {
          const data = JSON.parse(fbMatch[1]) as unknown[][];
          const fields = (data[1] as unknown[][])?.[8] as unknown[][];
          if (Array.isArray(fields)) {
            fields.forEach((field, i) => {
              const fieldArr = field as unknown[][];
              const entryId = (fieldArr?.[4] as unknown[][])?.[0]?.[0];
              if (entryId && FIELD_KEYS[i]) entryIds[FIELD_KEYS[i]] = `entry.${entryId}`;
            });
          }
        } catch { /* ignore */ }
      }
      if (Object.keys(entryIds).length === 0) {
        const matches = [...html.matchAll(/name="(entry\.\d+)"/g)];
        matches.forEach((m, i) => { if (FIELD_KEYS[i]) entryIds[FIELD_KEYS[i]] = m[1]; });
      }
    } catch { /* non-critical — entryIds from questionIds already derived above */ }
  }

  // 5. Save to DB
  await prisma.googleIntegration.update({
    where: { brandId },
    data: {
      googleFormId:     formId,
      googleFormPublicId: publicId,
      googleFormTitle:  formTitle,
      formEntryIds:     JSON.stringify(entryIds),
      formQuestionIds:  JSON.stringify(questionIds),
    },
  });

  return { formId, publicId, entryIds, questionIds };
}

// ── Sync banner image to existing Google Form header ─────────────────────────
/**
 * Pushes the current brand banner to the global submission form as an imageItem
 * at position 0. If a banner imageItem already exists at index 0, it is replaced.
 * Safe to call at any time — no-ops if form or banner is not configured.
 */
export async function syncBannerToGoogleForm(brandId = "default"): Promise<{
  ok: boolean;
  error?: string;
}> {
  const token = await getValidToken(brandId);
  if (!token) return { ok: false, error: "Not authenticated with Google" };

  const g = await prisma.googleIntegration.findUnique({ where: { brandId } });
  if (!g?.googleFormId) return { ok: false, error: "Google Form not configured" };

  // Get banner path from AppConfig
  const bannerCfg = await prisma.appConfig.findUnique({ where: { key: "bannerPath" } });
  const bannerPath = bannerCfg?.value || "";
  if (!bannerPath) return { ok: false, error: "No banner configured" };

  // Build fully-qualified public URL — Google's servers must be able to reach it
  let bannerUrl: string;
  if (bannerPath.startsWith("http://") || bannerPath.startsWith("https://")) {
    bannerUrl = bannerPath;
  } else {
    const origin = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "").replace(/\/$/, "");
    if (!origin) return { ok: false, error: "NEXT_PUBLIC_APP_URL not configured" };
    bannerUrl = `${origin}${bannerPath}`;
  }

  // Reject localhost — Google's servers can't reach it
  try {
    const { hostname } = new URL(bannerUrl);
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.endsWith(".local")
    ) {
      return { ok: false, error: "Banner URL is not publicly accessible (localhost)" };
    }
  } catch {
    return { ok: false, error: "Invalid banner URL" };
  }

  // Fetch current form structure to check for existing imageItem at index 0
  const formRes = await fetch(`${FORMS_URL}/${g.googleFormId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!formRes.ok) return { ok: false, error: "Failed to fetch Google Form" };

  const formData = await formRes.json() as {
    items?: Array<{ itemId?: string; imageItem?: unknown }>;
  };

  const requests: unknown[] = [];

  // If first item is already an imageItem, delete it before inserting the new one
  if (formData.items?.[0]?.imageItem !== undefined) {
    requests.push({ deleteItem: { location: { index: 0 } } });
  }

  // Insert new banner imageItem at index 0
  requests.push({
    createItem: {
      item: {
        title: "",
        imageItem: {
          image: {
            sourceUri: bannerUrl,
            altText: "Banner",
          },
        },
      },
      location: { index: 0 },
    },
  });

  const batchRes = await fetch(`${FORMS_URL}/${g.googleFormId}:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requests }),
  });

  if (!batchRes.ok) {
    const err = await batchRes.json() as { error?: { message?: string } };
    return { ok: false, error: err.error?.message || "Failed to update Google Form" };
  }

  return { ok: true };
}

// ── Sync form responses via Forms API ────────────────────────────────────────
export async function syncFormResponses(brandId = "default"): Promise<{
  synced: number;
  skipped: number;
  errors: string[];
}> {
  const g = await getOrCreateIntegration(brandId);
  if (!g.googleFormId) {
    return { synced: 0, skipped: 0, errors: ["Google Form not configured"] };
  }
  if (g.status !== "connected") {
    return { synced: 0, skipped: 0, errors: ["Google not connected"] };
  }

  const token = await getValidToken(brandId);
  if (!token) {
    return { synced: 0, skipped: 0, errors: ["Not authenticated with Google"] };
  }

  let questionIds: Record<string, string> = {};
  try { questionIds = JSON.parse(g.formQuestionIds || "{}"); } catch { /* ignore */ }

  let synced = 0, skipped = 0;
  const errors: string[] = [];
  let pageToken = g.nextPageToken || "";

  // Parse "Video 1" / "VIDEO 2" / "2" → integer
  function parseVideoNum(val: string): number {
    const m = val.match(/\d+/);
    return m ? parseInt(m[0]) : 0;
  }

  try {
    const params = new URLSearchParams({ pageSize: "100" });
    if (pageToken) params.set("pageToken", pageToken);

    const url = `${FORMS_URL}/${g.googleFormId}/responses?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const errData = await res.json() as { error?: { message?: string } };
      return { synced: 0, skipped: 0, errors: [errData.error?.message || "Failed to fetch responses"] };
    }

    const data = await res.json() as {
      responses?: Array<{
        responseId: string;
        createTime: string;
        answers?: Record<string, { questionId: string; textAnswers?: { answers: Array<{ value: string }> } }>;
      }>;
      nextPageToken?: string;
    };

    const responses = data.responses || [];
    const newPageToken = data.nextPageToken || "";

    console.log(`[sync] Fetched ${responses.length} responses from Forms API`);

    for (const response of responses) {
      const rid = response.responseId;
      try {
        const answers = response.answers || {};

        function getAnswer(key: string): string {
          const qId = questionIds[key];
          if (!qId) return "";
          const ans = answers[qId];
          return ans?.textAnswers?.answers?.[0]?.value?.trim() || "";
        }

        console.log(`[sync] Processing response: ${rid}`);

        const deliveryIdStr = getAnswer("deliveryId");
        const videoKeStr    = getAnswer("videoKe");
        const tiktokLink    = getAnswer("tiktokLink");
        const sparkCode     = getAnswer("sparkCode");
        const username      = getAnswer("username");

        console.log(`[sync] deliveryId="${deliveryIdStr}" videoKe="${videoKeStr}" username="${username}"`);

        // ── Validate deliveryId ────────────────────────────────────────────────
        if (!deliveryIdStr) {
          errors.push(`Response ${rid}: deliveryId kosong (field tidak terisi atau tidak ditemukan di questionIds)`);
          skipped++;
          continue;
        }
        const deliveryId = parseInt(deliveryIdStr);
        if (isNaN(deliveryId) || deliveryId <= 0) {
          errors.push(`Response ${rid}: deliveryId tidak valid — nilai: "${deliveryIdStr}"`);
          skipped++;
          continue;
        }

        // ── Validate video selection ───────────────────────────────────────────
        if (!videoKeStr) {
          errors.push(`Response ${rid}: pilihan video kosong (delivery #${deliveryId})`);
          skipped++;
          continue;
        }
        const videoNumber = parseVideoNum(videoKeStr);
        if (!videoNumber || videoNumber < 1 || videoNumber > 10) {
          errors.push(`Response ${rid}: pilihan video tidak valid — nilai: "${videoKeStr}" (delivery #${deliveryId})`);
          skipped++;
          continue;
        }

        console.log(`[sync] Mapped → deliveryId=${deliveryId}, videoNumber=${videoNumber}`);

        // ── Find sample delivery ───────────────────────────────────────────────
        const delivery = await prisma.sampleDelivery.findUnique({ where: { id: deliveryId } });
        if (!delivery) {
          errors.push(`Response ${rid}: Sample Delivery #${deliveryId} tidak ditemukan di database`);
          skipped++;
          continue;
        }
        if (delivery.deletedAt) {
          errors.push(`Response ${rid}: Sample Delivery #${deliveryId} sudah dihapus`);
          skipped++;
          continue;
        }

        // ── Idempotency: skip exact duplicate ─────────────────────────────────
        const exists = await prisma.videoSubmission.findFirst({
          where: { sampleDeliveryId: deliveryId, videoNumber },
        });
        if (exists) {
          // Duplicate is expected — don't add to errors, just skip silently
          console.log(`[sync] Skipping duplicate: delivery #${deliveryId} video #${videoNumber}`);
          skipped++;
          continue;
        }

        const submittedAt = response.createTime ? new Date(response.createTime) : new Date();

        const updatePayload = {
          sampleDeliveryId:  deliveryId,
          affiliateUsername: username || delivery.affiliateUsername,
          videoNumber,
          tiktokLink,
          sparkCode,
          notes:             "",
          submittedAt:       isNaN(submittedAt.getTime()) ? new Date() : submittedAt,
        };
        console.log(`[sync] Creating VideoSubmission:`, updatePayload);

        await prisma.videoSubmission.create({ data: updatePayload });

        // ── Auto-update checklist ──────────────────────────────────────────────
        const ceklis: { label: string; done: boolean }[] = [];
        try { ceklis.push(...JSON.parse(delivery.videoCeklis || "[]")); } catch { /* ignore */ }
        if (ceklis[videoNumber - 1]) ceklis[videoNumber - 1].done = true;
        const done = ceklis.filter((c) => c.done).length;
        const stt  = done === 0 ? "Belum Mulai" : done >= delivery.totalVideoTarget ? "Selesai" : "On Progress";

        console.log(`[sync] Checklist updated: ${done}/${delivery.totalVideoTarget} done → status="${stt}"`);

        await prisma.sampleDelivery.update({
          where: { id: deliveryId },
          data:  { videoCeklis: JSON.stringify(ceklis), totalVideoDone: done, statusProgress: stt },
        });

        synced++;
      } catch (e) {
        errors.push(`Response ${rid}: ${String(e)}`);
      }
    }

    // Save nextPageToken and lastSyncAt
    await prisma.googleIntegration.update({
      where: { brandId },
      data:  { lastSyncAt: new Date(), nextPageToken: newPageToken },
    });

    console.log(`[sync] Done — synced=${synced} skipped=${skipped} errors=${errors.length}`);
  } catch (e) {
    errors.push(String(e));
  }

  return { synced, skipped, errors };
}

// ── Column letter → 0-based index (kept for backward compat) ─────────────────
export function colIndex(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}
