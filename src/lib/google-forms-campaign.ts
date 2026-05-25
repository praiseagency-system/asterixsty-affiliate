/**
 * Google Forms helpers specifically for Campaign Registration & Submission forms.
 * Separate from google-auth.ts (which handles the SampleDelivery submission form).
 * Uses the same OAuth tokens from GoogleIntegration but writes to CampaignForm model.
 */
import { getPrisma } from "@/lib/prisma";
import { getValidToken, deriveEntryIds } from "@/lib/google-auth";
import { VISUAL_TAKE } from "@/lib/constants";
import { getBrandConfig } from "@/lib/brand";

const FORMS_URL = "https://forms.googleapis.com/v1/forms";

// ── Types ─────────────────────────────────────────────────────────────────────
type QuestionDef = {
  title:        string;
  type:         "TEXT" | "PARAGRAPH" | "DROPDOWN" | "CHECKBOX";
  required:     boolean;
  description?: string;
  options?:     string[];
};

// ── Helper: build a public URL from a stored banner path ─────────────────────
/**
 * Returns a fully-qualified, publicly-reachable banner URL for Google Forms API.
 * Returns null when:
 *  - bannerPath is empty / undefined
 *  - NEXT_PUBLIC_APP_URL / APP_URL env is not set (no public domain configured)
 *  - the resolved URL points to localhost / 127.0.0.1 / .local (Google can't reach it)
 */
function getBannerPublicUrl(bannerPath?: string | null): string | null {
  if (!bannerPath) return null;

  let fullUrl: string;
  if (bannerPath.startsWith("http://") || bannerPath.startsWith("https://")) {
    fullUrl = bannerPath;
  } else {
    // Need a real public origin — localhost won't work with Google's servers
    const origin = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "").replace(/\/$/, "");
    if (!origin) return null;
    fullUrl = `${origin}${bannerPath}`;
  }

  // Reject localhost / loopback — Google's servers can't reach these
  try {
    const { hostname } = new URL(fullUrl);
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.endsWith(".local")
    ) {
      return null; // silently skip — form will be created without header image
    }
  } catch {
    return null;
  }

  return fullUrl;
}

// ── Shared: create form + add questions ──────────────────────────────────────
async function buildForm(
  token:      string,
  title:      string,
  description: string,
  questions:  QuestionDef[],
  bannerUrl?: string | null,
): Promise<{
  formId:      string;
  publicId:    string;
  questionIds: Record<string, string>;
  entryIds:    Record<string, string>;
}> {
  // 1. Create form shell
  const createRes = await fetch(FORMS_URL, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ info: { title, documentTitle: title } }),
  });
  if (!createRes.ok) {
    const err = await createRes.json() as { error?: { message?: string } };
    throw new Error(err.error?.message || "Failed to create form");
  }
  const { formId } = await createRes.json() as { formId: string };

  // 2. Build batchUpdate requests: description + optional banner image + questions
  const requests: unknown[] = [
    {
      updateFormInfo: {
        info:       { description },
        updateMask: "description",
      },
    },
  ];

  // Banner image at index 0 (before all questions)
  let questionOffset = 0;
  if (bannerUrl) {
    requests.push({
      createItem: {
        item: {
          imageItem: {
            image: {
              sourceUri:  bannerUrl,
              properties: { alignment: "CENTER", width: 740 },
            },
          },
        },
        location: { index: 0 },
      },
    });
    questionOffset = 1;
  }

  // Questions at indices questionOffset, questionOffset+1, …
  for (const [index, q] of questions.entries()) {
    requests.push({
      createItem: {
        item: {
          title:       q.title,
          description: q.description ?? "",
          questionItem: {
            question: {
              required: q.required,
              ...(q.type === "DROPDOWN"
                ? { choiceQuestion: { type: "DROP_DOWN", options: (q.options || []).map((o) => ({ value: o })) } }
                : q.type === "CHECKBOX"
                ? { choiceQuestion: { type: "CHECKBOX",  options: (q.options || []).map((o) => ({ value: o })) } }
                : q.type === "PARAGRAPH"
                ? { textQuestion: { paragraph: true } }
                : { textQuestion: { paragraph: false } }),
            },
          },
        },
        location: { index: index + questionOffset },
      },
    });
  }

  const batchRes = await fetch(`${FORMS_URL}/${formId}:batchUpdate`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ requests }),
  });
  if (!batchRes.ok) {
    const err = await batchRes.json() as { error?: { message?: string } };
    const errMsg = err.error?.message || "Failed to add form questions";

    // If failure is related to banner image fetch, retry without the banner
    if (bannerUrl && (errMsg.includes("source_uri") || errMsg.includes("fetch image") || errMsg.includes("imageItem"))) {
      console.warn("[buildForm] Banner image not accessible by Google, retrying without banner:", bannerUrl);
      // Rebuild requests without the image item
      const requestsNoBanner: unknown[] = [
        { updateFormInfo: { info: { description }, updateMask: "description" } },
        ...questions.map((q, index) => ({
          createItem: {
            item: {
              title:       q.title,
              description: q.description ?? "",
              questionItem: {
                question: {
                  required: q.required,
                  ...(q.type === "DROPDOWN"
                    ? { choiceQuestion: { type: "DROP_DOWN", options: (q.options || []).map((o) => ({ value: o })) } }
                    : q.type === "CHECKBOX"
                    ? { choiceQuestion: { type: "CHECKBOX",  options: (q.options || []).map((o) => ({ value: o })) } }
                    : q.type === "PARAGRAPH"
                    ? { textQuestion: { paragraph: true } }
                    : { textQuestion: { paragraph: false } }),
                },
              },
            },
            location: { index },
          },
        })),
      ];
      const retryRes = await fetch(`${FORMS_URL}/${formId}:batchUpdate`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ requests: requestsNoBanner }),
      });
      if (!retryRes.ok) {
        const retryErr = await retryRes.json() as { error?: { message?: string } };
        throw new Error(retryErr.error?.message || "Failed to add form questions");
      }
    } else {
      throw new Error(errMsg);
    }
  }

  // 3. Fetch form to get questionIds + publicId
  const formRes  = await fetch(`${FORMS_URL}/${formId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const formData = await formRes.json() as {
    responderUri: string;
    items?: Array<{ title: string; questionItem?: { question: { questionId: string } } }>;
  };

  const publicIdMatch = (formData.responderUri || "").match(/\/forms\/d\/e\/([^/]+)\/viewform/);
  const publicId      = publicIdMatch ? publicIdMatch[1] : "";

  // 4. Map question title → questionId (image items have no questionItem, skipped automatically)
  const questionIds: Record<string, string> = {};
  for (const item of (formData.items || [])) {
    if (item.questionItem?.question?.questionId) {
      const match = questions.find((q) => q.title === item.title);
      if (match) {
        questionIds[titleToKey(match.title)] = item.questionItem.question.questionId;
      }
    }
  }

  const entryIds = deriveEntryIds(questionIds);

  return { formId, publicId, questionIds, entryIds };
}

/** Convert a question title to a camelCase key (e.g. "No WhatsApp" → "noWhatsapp") */
function titleToKey(title: string): string {
  return title
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(/\s+/)
    .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

// ── Registration Form ─────────────────────────────────────────────────────────
/**
 * Creates a Google Form for campaign registration.
 * 6 questions: Nama, Username TikTok, No WA, Alamat, Kategori, Visual Take
 * Banner (if available) is placed as the first item in the form body — the Google
 * Forms API v1 does not expose the cover/header image field, so imageItem at
 * index 0 is the highest position achievable via the public API.
 */
export async function createCampaignRegistrationForm(opts: {
  campaignId:   number;
  campaignName: string;
  categories:   string[];
  bannerPath?:  string | null;
}): Promise<void> {
  const prisma = getPrisma();
  const token  = await getValidToken();
  if (!token) throw new Error("Google belum terhubung. Hubungkan Google di halaman Pengaturan.");

  // Dynamic brand name from Brand Settings
  const brand     = await getBrandConfig();
  const brandName = brand.brandName || "Praise";

  const questions: QuestionDef[] = [
    {
      title:    "Nama Lengkap",
      type:     "TEXT",
      required: true,
    },
    {
      title:       "Username TikTok",
      type:        "TEXT",
      required:    true,
      description: "Tanpa simbol @, contoh: asterixsty.id",
    },
    {
      title:       "No WhatsApp",
      type:        "TEXT",
      required:    true,
      description: "Format: 628xxxxxxxxxx (diawali 628, tanpa spasi)",
    },
    {
      title:       "Alamat Pengiriman Sample",
      type:        "PARAGRAPH",
      required:    true,
      description: "Tulis lengkap: Jalan, No Rumah, RT/RW, Kelurahan, Kecamatan, Kota, Provinsi, Kode Pos",
    },
    {
      title:    "Kategori Affiliate",
      type:     "DROPDOWN",
      required: true,
      options:  opts.categories.length > 0 ? opts.categories : ["Beauty", "Fashion", "Lifestyle"],
    },
    {
      title:    "Jenis Visual Take",
      type:     "DROPDOWN",
      required: true,
      options:  [...VISUAL_TAKE],
    },
  ];

  const bannerUrl = getBannerPublicUrl(opts.bannerPath);

  const { formId, publicId, questionIds, entryIds } = await buildForm(
    token,
    `${opts.campaignName} — Form Pendaftaran Affiliate`,
    `Daftarkan diri kamu sebagai affiliate untuk campaign "${opts.campaignName}" dari ${brandName}. Isi semua data dengan lengkap dan benar.`,
    questions,
    bannerUrl,
  );

  // Upsert CampaignForm (reg fields only)
  await prisma.campaignForm.upsert({
    where:  { campaignId: opts.campaignId },
    create: {
      campaignId:      opts.campaignId,
      regFormId:       formId,
      regFormPublicId: publicId,
      regQuestionIds:  JSON.stringify(questionIds),
      regEntryIds:     JSON.stringify(entryIds),
    },
    update: {
      regFormId:       formId,
      regFormPublicId: publicId,
      regQuestionIds:  JSON.stringify(questionIds),
      regEntryIds:     JSON.stringify(entryIds),
      // Reset pagination when regenerating
      regNextPageToken: "",
      lastRegSyncAt:    null,
    },
  });
}

// ── Submission Form ───────────────────────────────────────────────────────────
/**
 * Creates a Google Form for campaign video submissions.
 * 6 questions:
 *   Participant ID, Username TikTok,
 *   Produk yang Dipromosikan (CHECKBOX — multi-select, creator may promote multiple),
 *   Pengumpulan Video Ke- (DROPDOWN single-select, "Video 1"–"Video 50"),
 *   Link Video TikTok, Spark Code
 * Banner (if available) is placed as the first item — see registration form comment.
 */
export async function createCampaignSubmissionForm(opts: {
  campaignId:   number;
  campaignName: string;
  productNames: string[];
  bannerPath?:  string | null;
}): Promise<void> {
  const prisma = getPrisma();
  const token  = await getValidToken();
  if (!token) throw new Error("Google belum terhubung. Hubungkan Google di halaman Pengaturan.");

  // Dynamic brand name from Brand Settings
  const brand     = await getBrandConfig();
  const brandName = brand.brandName || "Praise";

  const productOptions = opts.productNames.length > 0
    ? opts.productNames
    : ["(Tidak ada produk terdaftar)"];

  // Dropdown options "Video 1" – "Video 50" (single-select)
  const videoCountOptions = Array.from({ length: 50 }, (_, i) => `Video ${i + 1}`);

  const questions: QuestionDef[] = [
    {
      title:       "Participant ID",
      type:        "TEXT",
      required:    false,
      description: "Diisi otomatis oleh sistem — jangan ubah",
    },
    {
      title:       "Username TikTok",
      type:        "TEXT",
      required:    true,
      description: "Tanpa simbol @",
    },
    {
      // Multi-select CHECKBOX — creator may promote multiple products in one video
      title:       "Produk yang Dipromosikan",
      type:        "CHECKBOX",
      required:    true,
      description: "Pilih semua produk yang kamu promosikan dalam video ini",
      options:     productOptions,
    },
    {
      // Single-select DROPDOWN — which video number is this submission?
      title:       "Pengumpulan Video Ke-",
      type:        "DROPDOWN",
      required:    true,
      description: "Pilih nomor urut video yang sedang kamu kumpulkan (contoh: jika ini video ketigamu, pilih Video 3)",
      options:     videoCountOptions,
    },
    {
      title:       "Link Video TikTok",
      type:        "PARAGRAPH",
      required:    true,
      description: "Tuliskan link video TikTok kamu",
    },
    {
      title:       "Spark Code",
      type:        "PARAGRAPH",
      required:    false,
      description: "Spark code untuk video ini (opsional)",
    },
  ];

  const bannerUrl = getBannerPublicUrl(opts.bannerPath);

  const { formId, publicId, questionIds, entryIds } = await buildForm(
    token,
    `${opts.campaignName} — Form Pengumpulan Video`,
    `Kumpulkan video TikTok kamu untuk campaign "${opts.campaignName}" dari ${brandName}. Isi data dengan lengkap untuk setiap video yang kamu upload.`,
    questions,
    bannerUrl,
  );

  // Upsert CampaignForm (sub fields only)
  await prisma.campaignForm.upsert({
    where:  { campaignId: opts.campaignId },
    create: {
      campaignId:      opts.campaignId,
      subFormId:       formId,
      subFormPublicId: publicId,
      subQuestionIds:  JSON.stringify(questionIds),
      subEntryIds:     JSON.stringify(entryIds),
    },
    update: {
      subFormId:       formId,
      subFormPublicId: publicId,
      subQuestionIds:  JSON.stringify(questionIds),
      subEntryIds:     JSON.stringify(entryIds),
      subNextPageToken: "",
      lastSubSyncAt:    null,
    },
  });
}

// ── Sync Registration Responses ───────────────────────────────────────────────
/**
 * Fetches new registration form responses.
 * - Existing affiliates → auto_approved: creates CampaignParticipant (Active) + queues WA.
 * - New affiliates → pending: creates CampaignRegistration (pending) +
 *   CampaignParticipant (Pending status) for the approval queue.
 */
export async function syncCampaignRegistrations(campaignId: number): Promise<{
  synced:   number;
  skipped:  number;
  approved: number;
  pending:  number;
  errors:   string[];
}> {
  const prisma = getPrisma();

  const cf = await prisma.campaignForm.findUnique({ where: { campaignId } });
  if (!cf?.regFormId) {
    return { synced: 0, skipped: 0, approved: 0, pending: 0, errors: ["Registration form belum dibuat"] };
  }

  const token = await getValidToken();
  if (!token) {
    return { synced: 0, skipped: 0, approved: 0, pending: 0, errors: ["Google belum terhubung"] };
  }

  const campaign = await prisma.campaign.findUnique({
    where:  { id: campaignId },
    select: { id: true, nama: true },
  });
  if (!campaign) {
    return { synced: 0, skipped: 0, approved: 0, pending: 0, errors: ["Campaign tidak ditemukan"] };
  }

  let questionIds: Record<string, string> = {};
  try { questionIds = JSON.parse(cf.regQuestionIds || "{}"); } catch { /* ignore */ }

  let synced = 0, skipped = 0, approved = 0, pending = 0;
  const errors: string[] = [];

  try {
    const params = new URLSearchParams({ pageSize: "100" });
    if (cf.regNextPageToken) params.set("pageToken", cf.regNextPageToken);

    const url = `${FORMS_URL}/${cf.regFormId}/responses?${params}`;
    const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (!res.ok) {
      const errData = await res.json() as { error?: { message?: string } };
      return { synced: 0, skipped: 0, approved: 0, pending: 0, errors: [errData.error?.message || "Failed to fetch responses"] };
    }

    const data = await res.json() as {
      responses?:    Array<{
        responseId: string;
        createTime: string;
        answers?:   Record<string, { questionId: string; textAnswers?: { answers: Array<{ value: string }> } }>;
      }>;
      nextPageToken?: string;
    };

    const responses    = data.responses || [];
    const newPageToken = data.nextPageToken || "";

    function getAnswer(answers: Record<string, { questionId: string; textAnswers?: { answers: Array<{ value: string }> } }>, key: string): string {
      const qId = questionIds[key];
      if (!qId) return "";
      return answers[qId]?.textAnswers?.answers?.[0]?.value?.trim() || "";
    }

    for (const response of responses) {
      const rid = response.responseId;
      try {
        // Idempotency: skip already-processed responses
        const existing = await prisma.campaignRegistration.findUnique({ where: { responseId: rid } });
        if (existing) { skipped++; continue; }

        const answers        = response.answers || {};
        const nama           = getAnswer(answers, "namaLengkap");
        const usernameTiktok = getAnswer(answers, "usernameTiktok");
        const noWhatsapp     = getAnswer(answers, "noWhatsapp");
        const alamat         = getAnswer(answers, "alamatPengirimanSample");
        const kategori       = getAnswer(answers, "kategoriAffiliate");
        const visualTake     = getAnswer(answers, "jenisVisualTake");
        // These will be empty for new 6-field forms, retained for backward compat
        const linkPortfolio  = getAnswer(answers, "linkPortfolioTiktok");
        const catatan        = getAnswer(answers, "catatanTambahan");

        if (!usernameTiktok) {
          errors.push(`Response ${rid}: username TikTok kosong`);
          skipped++;
          continue;
        }

        // Check if affiliate already in Database
        const existingAffiliate = await prisma.databaseAffiliate.findFirst({
          where: {
            tiktokUsername: usernameTiktok,
            deletedAt:      null,
          },
        });

        if (existingAffiliate) {
          // AUTO-APPROVE: upsert campaign participant as Active
          await prisma.campaignParticipant.upsert({
            where: { campaignId_tiktokUsername: { campaignId, tiktokUsername: usernameTiktok } },
            create: {
              campaignId,
              tiktokUsername: usernameTiktok,
              namaAffiliate:  nama || existingAffiliate.namaAffiliator,
              whatsapp:       noWhatsapp || existingAffiliate.noWhatsapp,
              category:       kategori   || existingAffiliate.kategoriAffiliate,
              specialist:     existingAffiliate.affiliateSpecialist,
              visualTake:     visualTake || existingAffiliate.visualTake,
              status:         "Active",
            },
            update: {
              status:        "Active",
              namaAffiliate: nama || existingAffiliate.namaAffiliator,
              whatsapp:      noWhatsapp || existingAffiliate.noWhatsapp,
            },
          });

          // Save registration record as auto_approved
          await prisma.campaignRegistration.create({
            data: {
              responseId:        rid,
              campaignFormId:    cf.id,
              campaignId,
              nama,
              usernameTiktok,
              noWhatsapp,
              alamat,
              kategoriAffiliate: kategori,
              visualTake,
              linkPortfolio,
              catatan,
              status:     "auto_approved",
              approvedAt: new Date(),
            },
          });

          // Queue WA confirmation
          const phone = (noWhatsapp || existingAffiliate.noWhatsapp || "").replace(/\D/g, "");
          if (phone) {
            const waMsg = `Halo ${nama || usernameTiktok}! 👋\n\nPendaftaran kamu untuk campaign *${campaign.nama}* telah disetujui otomatis karena kamu sudah terdaftar sebagai affiliate Asterixsty.\n\nKamu sudah aktif sebagai peserta campaign. Selamat berkarya! 🎉\n\n_— Tim Asterixsty Perfumery_`;
            await prisma.waMessageQueue.create({
              data: {
                phone,
                message:        waMsg,
                recipientName:  nama || usernameTiktok,
                tiktokUsername: usernameTiktok,
                campaignId,
                campaignName:   campaign.nama,
                delayMode:      "Normal",
              },
            });
          }

          approved++;
          synced++;
        } else {
          // NEW affiliate — create pending registration + Pending participant for review queue
          await prisma.campaignRegistration.create({
            data: {
              responseId:        rid,
              campaignFormId:    cf.id,
              campaignId,
              nama,
              usernameTiktok,
              noWhatsapp,
              alamat,
              kategoriAffiliate: kategori,
              visualTake,
              linkPortfolio,
              catatan,
              status: "pending",
            },
          });

          // Also create CampaignParticipant with Pending status so they appear in the list
          const existingPart = await prisma.campaignParticipant.findUnique({
            where: { campaignId_tiktokUsername: { campaignId, tiktokUsername: usernameTiktok } },
          });
          if (!existingPart) {
            await prisma.campaignParticipant.create({
              data: {
                campaignId,
                tiktokUsername: usernameTiktok,
                namaAffiliate:  nama,
                whatsapp:       noWhatsapp,
                category:       kategori,
                visualTake,
                status:         "Pending",
              },
            });
          }

          pending++;
          synced++;
        }
      } catch (e) {
        errors.push(`Response ${rid}: ${String(e)}`);
      }
    }

    // Save pagination token and lastSyncAt
    await prisma.campaignForm.update({
      where: { campaignId },
      data:  { lastRegSyncAt: new Date(), regNextPageToken: newPageToken },
    });
  } catch (e) {
    errors.push(String(e));
  }

  return { synced, skipped, approved, pending, errors };
}

// ── Sync Submission Responses ─────────────────────────────────────────────────
/**
 * Fetches new submission form responses and updates participant video counts.
 * Uses subNextPageToken for pagination — only processes responses newer than last sync.
 */
export async function syncCampaignSubmissions(campaignId: number): Promise<{
  synced:  number;
  skipped: number;
  errors:  string[];
}> {
  const prisma = getPrisma();

  const cf = await prisma.campaignForm.findUnique({ where: { campaignId } });
  if (!cf?.subFormId) {
    return { synced: 0, skipped: 0, errors: ["Submission form belum dibuat"] };
  }

  const token = await getValidToken();
  if (!token) {
    return { synced: 0, skipped: 0, errors: ["Google belum terhubung"] };
  }

  let questionIds: Record<string, string> = {};
  try { questionIds = JSON.parse(cf.subQuestionIds || "{}"); } catch { /* ignore */ }

  let synced = 0, skipped = 0;
  const errors: string[] = [];

  try {
    const params = new URLSearchParams({ pageSize: "100" });
    if (cf.subNextPageToken) params.set("pageToken", cf.subNextPageToken);

    const url = `${FORMS_URL}/${cf.subFormId}/responses?${params}`;
    const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (!res.ok) {
      const errData = await res.json() as { error?: { message?: string } };
      return { synced: 0, skipped: 0, errors: [errData.error?.message || "Failed to fetch submission responses"] };
    }

    const data = await res.json() as {
      responses?:    Array<{
        responseId: string;
        createTime: string;
        answers?:   Record<string, { questionId: string; textAnswers?: { answers: Array<{ value: string }> } }>;
      }>;
      nextPageToken?: string;
    };

    const responses    = data.responses || [];
    const newPageToken = data.nextPageToken || "";

    function getAnswer(answers: Record<string, { questionId: string; textAnswers?: { answers: Array<{ value: string }> } }>, key: string): string {
      const qId = questionIds[key];
      if (!qId) return "";
      return answers[qId]?.textAnswers?.answers?.[0]?.value?.trim() || "";
    }

    for (const response of responses) {
      const rid = response.responseId;
      try {
        const answers        = response.answers || {};
        const usernameTiktok = getAnswer(answers, "usernameTiktok");
        // Support both new key ("pengumpulanVideoKe") and old key ("jumlahPengumpulanVideo")
        // New format answers like "Video 3" → parse number from string
        const jumlahStr = getAnswer(answers, "pengumpulanVideoKe") || getAnswer(answers, "jumlahPengumpulanVideo");
        const jumlah    = parseInt(jumlahStr.replace(/[^0-9]/g, ""), 10) || 0;

        if (!usernameTiktok || jumlah <= 0) {
          skipped++;
          continue;
        }

        // Find participant in this campaign
        const participant = await prisma.campaignParticipant.findUnique({
          where: { campaignId_tiktokUsername: { campaignId, tiktokUsername: usernameTiktok } },
        });

        if (!participant) {
          errors.push(`Response ${rid}: peserta @${usernameTiktok} tidak ditemukan dalam campaign`);
          skipped++;
          continue;
        }

        // Increment video count and update lastVideoAt
        await prisma.campaignParticipant.update({
          where: { id: participant.id },
          data:  {
            videoCount:  participant.videoCount + jumlah,
            lastVideoAt: new Date(),
          },
        });

        synced++;
      } catch (e) {
        errors.push(`Response ${rid}: ${String(e)}`);
      }
    }

    // Save pagination token and lastSubSyncAt
    await prisma.campaignForm.update({
      where: { campaignId },
      data:  { lastSubSyncAt: new Date(), subNextPageToken: newPageToken },
    });
  } catch (e) {
    errors.push(String(e));
  }

  return { synced, skipped, errors };
}

// ── Approve registration manually ────────────────────────────────────────────
export async function approveCampaignRegistration(registrationId: number): Promise<{ ok: boolean; error?: string }> {
  const prisma = getPrisma();

  const reg = await prisma.campaignRegistration.findUnique({ where: { id: registrationId } });
  if (!reg) return { ok: false, error: "Registrasi tidak ditemukan" };
  if (reg.status === "approved" || reg.status === "auto_approved") {
    return { ok: false, error: "Sudah diapprove sebelumnya" };
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: reg.campaignId }, select: { id: true, nama: true } });
  if (!campaign) return { ok: false, error: "Campaign tidak ditemukan" };

  // Upsert to DatabaseAffiliate if not exists
  const existingDb = await prisma.databaseAffiliate.findFirst({
    where: { tiktokUsername: reg.usernameTiktok, deletedAt: null },
  });
  if (!existingDb) {
    await prisma.databaseAffiliate.create({
      data: {
        tiktokUsername:    reg.usernameTiktok,
        namaAffiliator:    reg.nama,
        noWhatsapp:        reg.noWhatsapp,
        kategoriAffiliate: reg.kategoriAffiliate,
        visualTake:        reg.visualTake,
        alamat:            reg.alamat,
        status:            "Aktif",
      },
    });
  }

  // Upsert CampaignParticipant — may already exist as Pending (created during sync)
  await prisma.campaignParticipant.upsert({
    where: { campaignId_tiktokUsername: { campaignId: reg.campaignId, tiktokUsername: reg.usernameTiktok } },
    create: {
      campaignId:     reg.campaignId,
      tiktokUsername: reg.usernameTiktok,
      namaAffiliate:  reg.nama,
      whatsapp:       reg.noWhatsapp,
      category:       reg.kategoriAffiliate,
      visualTake:     reg.visualTake,
      status:         "Active",
    },
    update: {
      status:        "Active",
      namaAffiliate: reg.nama,
      whatsapp:      reg.noWhatsapp,
      category:      reg.kategoriAffiliate,
      visualTake:    reg.visualTake,
    },
  });

  // Mark registration as approved
  await prisma.campaignRegistration.update({
    where: { id: registrationId },
    data:  { status: "approved", approvedAt: new Date() },
  });

  // Queue WA confirmation
  const phone = (reg.noWhatsapp || "").replace(/\D/g, "");
  if (phone) {
    const waMsg = `Halo ${reg.nama || reg.usernameTiktok}! 👋\n\nSelamat! Pendaftaran kamu untuk campaign *${campaign.nama}* telah disetujui. 🎉\n\nKamu sudah aktif sebagai peserta campaign. Terima kasih telah bergabung!\n\n_— Tim Asterixsty Perfumery_`;
    await prisma.waMessageQueue.create({
      data: {
        phone,
        message:        waMsg,
        recipientName:  reg.nama || reg.usernameTiktok,
        tiktokUsername: reg.usernameTiktok,
        campaignId:     reg.campaignId,
        campaignName:   campaign.nama,
        delayMode:      "Normal",
      },
    });
  }

  return { ok: true };
}

// ── Reject registration ───────────────────────────────────────────────────────
export async function rejectCampaignRegistration(registrationId: number, reason?: string): Promise<{ ok: boolean; error?: string }> {
  const prisma = getPrisma();

  const reg = await prisma.campaignRegistration.findUnique({ where: { id: registrationId } });
  if (!reg) return { ok: false, error: "Registrasi tidak ditemukan" };

  await prisma.campaignRegistration.update({
    where: { id: registrationId },
    data:  { status: "rejected", rejectedAt: new Date() },
  });

  // Optionally notify via WA
  const phone = (reg.noWhatsapp || "").replace(/\D/g, "");
  if (phone && reason) {
    const campaign = await prisma.campaign.findUnique({ where: { id: reg.campaignId }, select: { nama: true } });
    const waMsg = `Halo ${reg.nama || reg.usernameTiktok},\n\nMohon maaf, pendaftaran kamu untuk campaign *${campaign?.nama || ""}* belum dapat disetujui saat ini.\n\nAlasan: ${reason}\n\nTerima kasih sudah mendaftar!\n\n_— Tim Asterixsty Perfumery_`;
    await prisma.waMessageQueue.create({
      data: {
        phone,
        message:        waMsg,
        recipientName:  reg.nama || reg.usernameTiktok,
        tiktokUsername: reg.usernameTiktok,
        campaignId:     reg.campaignId,
        campaignName:   campaign?.nama || "",
        delayMode:      "Normal",
      },
    });
  }

  return { ok: true };
}
