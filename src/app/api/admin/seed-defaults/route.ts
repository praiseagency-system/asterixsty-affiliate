/**
 * POST /api/admin/seed-defaults
 * One-shot endpoint to initialise all master data on a fresh DB.
 * Safe to call multiple times — skips individual tables if data already exists.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    const [
      productCount, specialistCount, kategoriCount,
      hookCount, tierCount, scoreCount,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.affiliateSpecialist.count(),
      prisma.kategoriAffiliate.count(),
      prisma.hookFormula.count(),
      prisma.tierConfig.count(),
      prisma.scoreConfig.count(),
    ]);

    const created: string[] = [];

    // ── Products ──────────────────────────────────────────────────────────────
    if (productCount === 0) {
      await prisma.product.createMany({
        data: [
          { no: 1,  nama: "Avalon 35ML",           hpp: 16572 },
          { no: 2,  nama: "Alonica 35ml",           hpp: 18276 },
          { no: 3,  nama: "Baby Love 35ml",         hpp: 14146 },
          { no: 4,  nama: "Draven 35ml",            hpp: 21261 },
          { no: 5,  nama: "Exotic Blue 35ml",       hpp: 18346 },
          { no: 6,  nama: "Fresh Tea 35ml",         hpp: 21261 },
          { no: 7,  nama: "Manor Elixir 35ml",      hpp: 25628 },
          { no: 8,  nama: "Montana 35ml",           hpp: 19300 },
          { no: 9,  nama: "Peach Tea 35ml",         hpp: 19125 },
          { no: 10, nama: "Tea Garden 35ml",        hpp: 15793 },
          { no: 11, nama: "Valerie Rose 35ml",      hpp: 20868 },
          { no: 12, nama: "Vanilla Delight 35ml",   hpp: 19142 },
          { no: 13, nama: "Vansen 35ml",            hpp: 21554 },
          { no: 14, nama: "Vulcana 35ml",           hpp: 19888 },
        ],
      });
      created.push("Product (14 rows)");
    }

    // ── AffiliateSpecialist ───────────────────────────────────────────────────
    if (specialistCount === 0) {
      await prisma.affiliateSpecialist.createMany({
        data: [
          { no: 1, nama: "Rosa" },
          { no: 2, nama: "Praise" },
        ],
      });
      created.push("AffiliateSpecialist (2 rows)");
    }

    // ── KategoriAffiliate ─────────────────────────────────────────────────────
    if (kategoriCount === 0) {
      await prisma.kategoriAffiliate.createMany({
        data: [
          { no: 1,  nama: "Skinfluencer",          deskripsi: "KOL pria/wanita yang aktif membahas tentang skincare secara general di videonya" },
          { no: 2,  nama: "Makeup",                deskripsi: "KOL pria/wanita yang aktif membahas tentang makeup category di video-videonya" },
          { no: 3,  nama: "Couple",                deskripsi: "KOL couple [bisa pasangan suami istri atau pacaran] dengan jenis video-video yang beragam [general]" },
          { no: 4,  nama: "Viral",                 deskripsi: "KOL yang aktif mengikuti trend viral pada videonya" },
          { no: 5,  nama: "Skinfluencer Cowo",     deskripsi: "KOL pria yang aktif membahas tentang skincare [secara general] di videonya" },
          { no: 6,  nama: "Suplemen Kesehatan",    deskripsi: "" },
          { no: 7,  nama: "Fashion",               deskripsi: "" },
          { no: 8,  nama: "Perawatan & Kecantikan",deskripsi: "" },
          { no: 9,  nama: "Makanan & Minuman",     deskripsi: "" },
          { no: 10, nama: "Barang Elektronik",     deskripsi: "" },
          { no: 11, nama: "Bayi & Persalinan",     deskripsi: "" },
        ],
      });
      created.push("KategoriAffiliate (11 rows)");
    }

    // ── HookFormula ───────────────────────────────────────────────────────────
    if (hookCount === 0) {
      await prisma.hookFormula.createMany({
        data: [
          { formula: "Solution - Solution - Solution", deskripsi: "Teknik ini bertujuan untuk menarik perhatian audience tanpa menyebarkan rasa takut kepada mereka.", detail: "{Solution} - Sebutkan keunggulan produk/jasa kamu\n{Solution} - Jelaskan produk/jasa tersebut bisa menyelesaikan sebuah permasalahan\n{Solution} - Jelaskan produk/jasa juga bisa menyelesaikan masalah lainnya" },
          { formula: "Why - Try - Buy", deskripsi: "Formula ini dirancang untuk membangkitkan kesadaran mengapa audience perlu memperhatikan produk yang Anda tawarkan.", detail: "{Why} - Jelaskan mengapa audience harus peduli dengan produk/jasa kamu\n{Try} - Persuasif dalam mengarahkan audience pada value yang tidak langsung menuju produk kamu\n{Buy} - Berikan informasi di mana mereka bisa mendapatkan produk/jasa kamu" },
          { formula: "Problem - Agitate - Solve", deskripsi: "Teknik penulisan ini bertujuan untuk membuat audience lebih peduli dengan masalah mereka sendiri.", detail: "{Problem} - Gambarkan masalah yang dihadapi audience\n{Agitate} - Jelaskan bagaimana masalah tersebut bisa memburuk jika tidak segera diatasi\n{Solve} - Tunjukkan solusi yang kamu tawarkan untuk mengatasi masalah tersebut" },
          { formula: "Problem - Grouping - Solution", deskripsi: "Formula ini menampilkan sudut pandang yang berlawanan dari kelompok tertentu terhadap produk/jasa Anda.", detail: "{Problem} - Sampaikan sebuah masalah audience kamu\n{Grouping} - Ceritakan sebuah kumpulan orang yang tidak akan cocok dengan kamu\n{Solution} - Jelaskan solusi yang kamu tawarkan" },
          { formula: "Tips - For", deskripsi: "Formula ini berfokus pada penggunaan kata-kata yang tepat dan tajam untuk menarik perhatian audience.", detail: "{Tips Jitu...} {Untuk...}\n\nContoh:\n{Tips Jitu} untuk {Menjaga Kulit Tetap Sehat}" },
          { formula: "Problem - Promise - Prove", deskripsi: "Formula ini sangat efektif untuk meningkatkan penjualan karena Anda perlu menampilkan bukti nyata dari produk/jasa yang Anda tawarkan.", detail: "{Problem} - Highlight masalah yang ingin kamu selesaikan\n{Promise} - Berikan janji atau ekspektasi kepada audience kamu\n{Prove} - Buktikan apa yang kamu sampaikan itu benar dan sudah pernah terjadi" },
          { formula: "Attention - Story - Solution", deskripsi: "Teknik ini memanfaatkan cerita untuk memikat audience dan membuat mereka terhubung dengan produk/jasa Anda.", detail: "{Attention} - Buat visual atau teks yang dapat menarik perhatian audience\n{Story} - Ceritakan kisah menarik tentang penggunaan produk/jasa kamu\n{Solution} - Jelaskan solusi yang kamu tawarkan" },
          { formula: "Stop - Fear - Listen", deskripsi: "Formula ini serupa dengan sebelumnya, tetapi lebih berfokus pada menciptakan rasa takut dalam persepsi audience.", detail: "{Stop} - Gunakan kata 'Hentikan'\n{Fear} - Jelaskan dampak buruk yang mungkin terjadi\n{Listen} - Jelaskan langkah yang harus audience lakukan untuk mengatasi masalah" },
          { formula: "Happy Customer - Story - Action", deskripsi: "Formula ini sangat cocok untuk Anda yang ingin meningkatkan penjualan menggunakan testimoni positif dari pelanggan.", detail: "{Happy customer} - Perkenalkan testimoni pelanggan dengan cara unik\n{Story} - Ceritakan kisah menarik tentang bagaimana mereka menggunakan produk/jasa kamu\n{Action} - Berikan perintah kepada audience untuk mencoba produk/jasa kamu" },
          { formula: "Success - Failed - Insight", deskripsi: "Teknik ini mengubah jalan cerita, dari pencapaian menjadi kegagalan, lalu berakhir dengan pencapaian yang lebih besar.", detail: "{Success} - Ceritakan keberhasilan atau pencapaian kamu\n{Failed} - Ceritakan kegagalan atau tantangan yang pernah kamu alami sebelumnya\n{Insight} - Bagikan pelajaran yang bisa diambil dari pengalaman tersebut" },
          { formula: "Secret - How", deskripsi: "Formula ini membuat audience merasa spesial karena mereka mendapatkan informasi yang dikemas secara eksklusif.", detail: "{Secret} - Sebutkan solusi dan kemas seolah-olah ini adalah rahasia spesial\n{How} - Jelaskan cara mendapatkan solusi tersebut" },
          { formula: "Before - After - Bridge", deskripsi: "Formula ini membantu audience menyadari posisi mereka saat ini dan menunjukkan bagaimana mereka bisa mencapai posisi yang diinginkan.", detail: "{Before} - Gambarkan situasi saat ini yang dialami oleh audience\n{After} - Jelaskan keadaan ideal yang mereka inginkan\n{Bridge} - Sampaikan produk atau solusi yang kamu tawarkan" },
          { formula: "Attention - Problem - Solution (APS)", deskripsi: "Teknik ini efektif untuk menarik perhatian dengan langsung menyoroti masalah utama audience.", detail: "{Attention} - Buat visual atau teks yang dapat menarik perhatian audience\n{Problem} - Segera sampaikan masalah yang dihadapi audience\n{Solution} - Jelaskan solusi yang kamu tawarkan" },
          { formula: "AIDA (Attention - Interest - Desire - Action)", deskripsi: "Formula ini sering digunakan karena cukup mudah diterapkan, hanya dengan memanfaatkan pengetahuan dasar Anda tentang produk/industri.", detail: "{Attention} - Tarik perhatian audience\n{Interest} - Bangkitkan minat mereka\n{Desire} - Ciptakan keinginan untuk memiliki produk/jasa kamu\n{Action} - Arahkan ke tindakan pembelian" },
          { formula: "Promotion - Benefit - Urgency", deskripsi: "Formula ini fokus pada memberikan penawaran yang jelas dengan menonjolkan nilai unik dan urgensi untuk segera bertindak.", detail: "{Promotion} - Sebutkan penawaran dari produk/jasa kamu\n{Benefit} - Jelaskan keuntungan ketika membeli produk saat promo\n{Urgency} - Ciptakan urgensi agar audience segera mengambil keputusan" },
          { formula: "Problem - Statistik - Solution", deskripsi: "Teknik ini menciptakan rasa takut yang mendalam, membuat audience merasa perlu segera menyelesaikan masalah mereka.", detail: "{Problem} - Jelaskan masalah yang dihadapi audience\n{Statistik} - Berikan data untuk meningkatkan kepercayaan audience\n{Solution} - Sampaikan solusi yang kamu tawarkan" },
        ],
      });
      created.push("HookFormula (16 rows)");
    }

    // ── TierConfig ────────────────────────────────────────────────────────────
    if (tierCount === 0) {
      await prisma.tierConfig.createMany({
        data: [
          { tier: "A", label: "Elite",  minGmv: 10_000_000, color: "gold"   },
          { tier: "B", label: "Growth", minGmv:  5_000_000, color: "silver" },
          { tier: "C", label: "Entry",  minGmv:     50_000, color: "bronze" },
        ],
      });
      created.push("TierConfig (3 rows)");
    }

    // ── ScoreConfig ───────────────────────────────────────────────────────────
    if (scoreCount === 0) {
      await prisma.scoreConfig.createMany({
        data: [
          { komponen: "gmv",   level: 1, minValue:  5_000_000, label: "≥ Rp 5 Jt"  },
          { komponen: "gmv",   level: 2, minValue: 10_000_000, label: "≥ Rp 10 Jt" },
          { komponen: "gmv",   level: 3, minValue: 11_000_000, label: "≥ Rp 11 Jt" },
          { komponen: "gmv",   level: 0, minValue:          0, label: "< Rp 5 Jt"  },
          { komponen: "qty",   level: 3, minValue:        100, label: "≥ 100 pcs"   },
          { komponen: "qty",   level: 2, minValue:         50, label: "≥ 50 pcs"    },
          { komponen: "qty",   level: 1, minValue:          1, label: "≥ 1 pcs"     },
          { komponen: "qty",   level: 0, minValue:          0, label: "0 pcs"       },
          { komponen: "views", level: 2, minValue:      5_000, label: "≥ 5 rb views"},
          { komponen: "views", level: 1, minValue:      1_000, label: "≥ 1 rb views"},
          { komponen: "views", level: 0, minValue:          0, label: "< 1 rb views"},
        ],
      });
      created.push("ScoreConfig (11 rows)");
    }

    if (created.length === 0) {
      return NextResponse.json({ ok: true, message: "Data already exists, nothing created." });
    }

    return NextResponse.json({ ok: true, created });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
