import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding master data...");

  // Skip seed if master data already exists (idempotent — safe to run on every deploy)
  const existingProductCount = await prisma.product.count();
  if (existingProductCount > 0) {
    console.log("✅ Data sudah ada, skip seed.");
    return;
  }

  await prisma.product.createMany({
    data: [
      { no: 1, nama: "Avalon 35ML", hpp: 16572 },
      { no: 2, nama: "Alonica 35ml", hpp: 18276 },
      { no: 3, nama: "Baby Love 35ml", hpp: 14146 },
      { no: 4, nama: "Draven 35ml", hpp: 21261 },
      { no: 5, nama: "Exotic Blue 35ml", hpp: 18346 },
      { no: 6, nama: "Fresh Tea 35ml", hpp: 21261 },
      { no: 7, nama: "Manor Elixir 35ml", hpp: 25628 },
      { no: 8, nama: "Montana 35ml", hpp: 19300 },
      { no: 9, nama: "Peach Tea 35ml", hpp: 19125 },
      { no: 10, nama: "Tea Garden 35ml", hpp: 15793 },
      { no: 11, nama: "Valerie Rose 35ml", hpp: 20868 },
      { no: 12, nama: "Vanilla Delight 35ml", hpp: 19142 },
      { no: 13, nama: "Vansen 35ml", hpp: 21554 },
      { no: 14, nama: "Vulcana 35ml", hpp: 19888 },
    ],
  });

  await prisma.affiliateSpecialist.createMany({
    data: [
      { no: 1, nama: "Rosa" },
      { no: 2, nama: "Praise" },
    ],
  });

  await prisma.kategoriAffiliate.createMany({
    data: [
      { no: 1, nama: "Skinfluencer", deskripsi: "KOL pria/wanita yang aktif membahas tentang skincare secara general di videonya" },
      { no: 2, nama: "Makeup", deskripsi: "KOL pria/wanita yang aktif membahas tentang makeup category di video-videonya" },
      { no: 3, nama: "Couple", deskripsi: "KOL couple [bisa pasangan suami istri atau pacaran] dengan jenis video-video yang beragam [general]" },
      { no: 4, nama: "Viral", deskripsi: "KOL yang aktif mengikuti trend viral pada videonya" },
      { no: 5, nama: "Skinfluencer Cowo", deskripsi: "KOL pria yang aktif membahas tentang skincare [secara general] di videonya" },
      { no: 6, nama: "Suplemen Kesehatan", deskripsi: "" },
      { no: 7, nama: "Fashion", deskripsi: "" },
      { no: 8, nama: "Perawatan & Kecantikan", deskripsi: "" },
      { no: 9, nama: "Makanan & Minuman", deskripsi: "" },
      { no: 10, nama: "Barang Elektronik", deskripsi: "" },
      { no: 11, nama: "Bayi & Persalinan", deskripsi: "" },
    ],
  });

  await prisma.hookFormula.createMany({
    data: [
      { formula: "Solution - Solution - Solution", deskripsi: "Teknik ini bertujuan untuk menarik perhatian audience tanpa menyebarkan rasa takut kepada mereka.", detail: "{Solution} - Sebutkan keunggulan produk/jasa kamu\n{Solution} - Jelaskan produk/jasa tersebut bisa menyelesaikan sebuah permasalahan\n{Solution} - Jelaskan produk/jasa juga bisa menyelesaikan masalah lainnya\n\nContoh:\n{Solution} - Krim wajah ini mengandung bahan alami yang aman untuk semua jenis kulit\n{Solution} - Krim ini membantu mengatasi kulit kering dan menjaga kelembapan wajah sepanjang hari\n{Solution} - Selain itu, krim ini juga dapat mengurangi tanda-tanda penuaan dan memperbaiki tekstur kulit" },
      { formula: "Why - Try - Buy", deskripsi: "Formula ini dirancang untuk membangkitkan kesadaran mengapa audience perlu memperhatikan produk yang Anda tawarkan.", detail: "{Why} - Jelaskan mengapa audience harus peduli dengan produk/jasa kamu\n{Try} - Persuasif dalam mengarahkan audience pada value yang tidak langsung menuju produk kamu, tetapi mendorong mereka untuk membelinya\n{Buy} - Berikan informasi di mana mereka bisa mendapatkan produk/jasa kamu\n\nContoh:\n{Why} - Jaket denim ini dibuat dari bahan yang tahan lama dan ramah lingkungan\n{Try} - Dengan desain yang timeless, jaket ini dapat dipakai dalam berbagai kesempatan formal maupun kasual\n{Buy} - Dapatkan jaket denim ini di toko online kami dengan diskon 20% hanya untuk minggu ini" },
      { formula: "Problem - Agitate - Solve", deskripsi: "Teknik penulisan ini bertujuan untuk membuat audience lebih peduli dengan masalah mereka sendiri, dengan menggambarkan apa yang bisa terjadi jika masalah tersebut tidak segera diselesaikan.", detail: "{Problem} - Gambarkan masalah yang dihadapi audience\n{Agitate} - Jelaskan bagaimana masalah tersebut bisa memburuk jika tidak segera diatasi\n{Solve} - Tunjukkan solusi yang kamu tawarkan untuk mengatasi masalah tersebut\n\nContoh:\n{Problem} - Parfum sering kali tidak tahan lama, sehingga Anda harus menyemprotkan berkali-kali\n{Agitate} - Parfum yang tidak awet bisa mengganggu dan membuat Anda harus membawa botol parfum ke mana-mana\n{Solve} - Dengan parfum kami yang menggunakan teknologi aroma tahan lama, Anda bisa wangi sepanjang hari hanya dengan sekali semprot" },
      { formula: "Problem - Grouping - Solution", deskripsi: "Formula ini menampilkan sudut pandang yang berlawanan dari kelompok tertentu terhadap produk/jasa Anda, tetapi tanpa disadari, hal ini membuat orang di luar kelompok tersebut justru merasa tertarik.", detail: "{Problem} - Sampaikan sebuah masalah audience kamu\n{Grouping} - Ceritakan sebuah kumpulan orang yang tidak akan cocok dengan kamu\n{Solution} - Jelaskan solusi yang kamu tawarkan\n\nContoh:\n{Problem} - Banyak wanita merasa sulit menemukan parfum yang cocok untuk digunakan sepanjang hari\n{Grouping} - Mereka yang tidak suka aroma yang kuat mungkin tidak akan cocok dengan produk kami\n{Solution} - Namun, bagi Anda yang mencari parfum yang tahan lama dengan aroma lembut dan menyegarkan, parfum ini adalah pilihan terbaik" },
      { formula: "Tips - For", deskripsi: "Formula ini berfokus pada penggunaan kata-kata yang tepat dan tajam untuk menarik perhatian audience.", detail: "{Tips Jitu...} {Untuk...}\n\nContoh:\n{Tips Jitu} untuk {Menjaga Kulit Tetap Sehat}\n{Untuk Semua Jenis Kulit di Cuaca Panas}" },
      { formula: "Problem - Promise - Prove", deskripsi: "Formula ini sangat efektif untuk meningkatkan penjualan karena Anda perlu menampilkan bukti nyata dari produk/jasa yang Anda tawarkan.", detail: "{Problem} - Highlight masalah yang ingin kamu selesaikan\n{Promise} - Berikan janji atau ekspektasi kepada audience kamu\n{Prove} - Buktikan apa yang kamu sampaikan itu benar dan sudah pernah terjadi\n\nContoh:\n{Problem} - Banyak orang kesulitan menemukan pelembap yang bisa bertahan lama di kulit kering\n{Promise} - Kami menjamin bahwa pelembap ini bisa menjaga kelembapan kulit selama 24 jam\n{Prove} - Pelembap ini telah digunakan oleh lebih dari 10.000 orang dan terbukti berhasil melembapkan kulit kering secara efektif" },
      { formula: "Attention - Story - Solution", deskripsi: "Teknik ini memanfaatkan cerita untuk memikat audience dan membuat mereka terhubung dengan produk/jasa Anda.", detail: "{Attention} {Story} {Solution}\n\nContoh:\n{Attention} - Pernahkah Anda merasa tidak percaya diri karena kulit wajah yang tidak merata?\n{Story} - Banyak pelanggan kami mengalami hal yang sama, namun kini mereka lebih percaya diri setelah menggunakan krim pencerah kami\n{Solution} - Gunakan krim ini secara rutin untuk mendapatkan kulit yang lebih cerah dan sehat dalam waktu singkat" },
      { formula: "Stop - Fear - Listen", deskripsi: "Formula ini serupa dengan sebelumnya, tetapi lebih berfokus pada menciptakan rasa takut dalam persepsi audience.", detail: "{Stop} - Gunakan kata 'Hentikan'\n{Fear} - Jelaskan dampak buruk yang mungkin terjadi\n{Listen} - Jelaskan langkah yang harus audience lakukan untuk mengatasi masalah\n\nContoh:\n{Stop} - Hentikan membiarkan kulit Anda terpapar sinar UV tanpa perlindungan\n{Fear} - Sinar UV dapat menyebabkan kerusakan kulit, mempercepat penuaan, dan meningkatkan risiko kanker kulit\n{Listen} - Gunakan sunscreen SPF 50 kami setiap hari untuk melindungi kulit Anda dari bahaya sinar UV" },
      { formula: "Happy Customer - Story - Action", deskripsi: "Formula ini sangat cocok untuk Anda yang ingin meningkatkan penjualan menggunakan testimoni positif dari pelanggan.", detail: "{Happy customer} - Perkenalkan testimoni pelanggan dengan cara unik\n{Story} - Ceritakan kisah menarik tentang bagaimana mereka menggunakan produk/jasa kamu\n{Action} - Berikan perintah kepada audience untuk mencoba produk/jasa kamu\n\nContoh:\n{Happy customer} - Bapak Budi sangat puas setelah menggunakan hair tonic kami\n{Story} - Beliau mengaku rambutnya menjadi lebih kuat dan tidak mudah rontok setelah pemakaian tiga minggu\n{Action} - Coba hair tonic ini sekarang dan rasakan hasil yang sama seperti Bapak Budi!" },
      { formula: "Success - Failed - Insight", deskripsi: "Teknik ini mengubah jalan cerita, dari pencapaian menjadi kegagalan, lalu berakhir dengan pencapaian yang lebih besar.", detail: "{Success} - Ceritakan keberhasilan atau pencapaian kamu\n{Failed} - Ceritakan kegagalan atau tantangan yang pernah kamu alami sebelumnya\n{Insight} - Bagikan pelajaran yang bisa diambil dari pengalaman tersebut dan hubungkan dengan produk/jasa kamu" },
      { formula: "Secret - How", deskripsi: "Formula ini membuat audience merasa spesial karena mereka mendapatkan informasi yang dikemas secara eksklusif.", detail: "{Secret} - Sebutkan solusi dan kemas seolah-olah ini adalah rahasia spesial\n{How} - Jelaskan cara mendapatkan solusi tersebut\n\nContoh:\n{Secret} - Inilah rahasia perawatan kulit yang digunakan oleh selebriti untuk menjaga kulit mereka tetap glowing\n{How} - Dengan menggunakan dua produk perawatan kami, Anda bisa memiliki kulit yang cerah dan sehat seperti mereka" },
      { formula: "Before - After - Bridge", deskripsi: "Formula ini membantu audience menyadari posisi mereka saat ini dan menunjukkan bagaimana mereka bisa mencapai posisi yang diinginkan.", detail: "{Before} - Gambarkan situasi saat ini yang dialami oleh audience\n{After} - Jelaskan keadaan ideal yang mereka inginkan\n{Bridge} - Sampaikan produk atau solusi yang kamu tawarkan\n\nContoh:\n{Before} - Kulit wajah Anda mengalami breakout akibat salah pilih skincare?\n{After} - Bayangkan memiliki kulit bersih tanpa jerawat dengan perawatan yang tepat\n{Bridge} - Jangan ragu lagi, gunakan rangkaian produk anti-acne kami yang terbukti efektif mengatasi jerawat" },
      { formula: "Attention - Problem - Solution (APS)", deskripsi: "Teknik ini efektif untuk menarik perhatian dengan langsung menyoroti masalah utama audience.", detail: "{Attention} - Buat visual atau teks yang dapat menarik perhatian audience\n{Problem} - Segera sampaikan masalah yang dihadapi audience\n{Solution} - Jelaskan solusi yang kamu tawarkan\n\nContoh:\n{Attention} - Panik melihat jerawat muncul menjelang acara penting?\n{Problem} - Skincare yang digunakan tidak memberikan hasil yang cepat?\n{Solution} - Coba produk spot treatment kami yang mampu mengempiskan jerawat dalam 24 jam!" },
      { formula: "AIDA (Attention - Interest - Desire - Action)", deskripsi: "Formula ini sering digunakan karena cukup mudah diterapkan, hanya dengan memanfaatkan pengetahuan dasar Anda tentang produk/industri.", detail: "{Attention} {Interest} {Desire} {Action}\n\nContoh:\n{Attention} - Ingin tahu cara merawat kulit wajah secara alami?\n{Interest} - Saya dulu bermasalah dengan kulit kusam dan kering\n{Desire} - Anda juga bisa memiliki kulit glowing alami hanya dengan menggunakan produk perawatan yang tepat\n{Action} - Klik link ini untuk mendapatkan produk skincare yang sudah saya gunakan" },
      { formula: "Promotion - Benefit - Urgency", deskripsi: "Formula ini fokus pada memberikan penawaran yang jelas dengan menonjolkan nilai unik dan urgensi untuk segera bertindak.", detail: "{Promotion} - Sebutkan penawaran dari produk/jasa kamu\n{Benefit} - Jelaskan keuntungan ketika membeli produk saat promo\n{Urgency} - Ciptakan urgensi agar audience segera mengambil keputusan\n\nContoh:\n{Promotion} - Diskon 30% untuk rangkaian skincare anti-aging\n{Benefit} - Dapatkan kulit yang lebih muda dan kencang dengan harga lebih terjangkau" },
      { formula: "Problem - Statistik - Solution", deskripsi: "Teknik ini menciptakan rasa takut yang mendalam, membuat audience merasa perlu segera menyelesaikan masalah mereka.", detail: "{Problem} - Jelaskan masalah yang dihadapi audience\n{Statistik} - Berikan data untuk meningkatkan kepercayaan audience\n{Solution} - Sampaikan solusi yang kamu tawarkan\n\nContoh:\n{Problem} - Kulit Anda seringkali kusam dan kering meskipun sudah menggunakan banyak produk skincare?\n{Statistik} - Berdasarkan penelitian, 80% orang dengan masalah serupa berhasil memperbaiki kondisi kulitnya dengan serum kami\n{Solution} - Gunakan serum ini untuk mendapatkan kulit yang lembap dan bercahaya sepanjang hari" },
    ],
  });

  await prisma.tierConfig.createMany({
    data: [
      { tier: "A", label: "Elite", minGmv: 10_000_000, color: "gold" },
      { tier: "B", label: "Growth", minGmv: 5_000_000, color: "silver" },
      { tier: "C", label: "Entry", minGmv: 0, color: "bronze" },
    ],
  });

  await prisma.scoreConfig.createMany({
    data: [
      { komponen: "gmv", level: 3, minValue: 1_000_000, label: "≥ Rp1 Jt" },
      { komponen: "gmv", level: 2, minValue: 300_000, label: "≥ Rp300 rb" },
      { komponen: "gmv", level: 1, minValue: 50_000, label: "≥ Rp50 rb" },
      { komponen: "gmv", level: 0, minValue: 0, label: "< Rp50 rb" },
      { komponen: "qty", level: 3, minValue: 100, label: "≥ 100 pcs" },
      { komponen: "qty", level: 2, minValue: 50, label: "≥ 50 pcs" },
      { komponen: "qty", level: 1, minValue: 1, label: "≥ 1 pcs" },
      { komponen: "qty", level: 0, minValue: 0, label: "0 pcs" },
      { komponen: "views", level: 3, minValue: 5_000, label: "≥ 5 rb views" },
      { komponen: "views", level: 2, minValue: 1_000, label: "≥ 1 rb views" },
      { komponen: "views", level: 1, minValue: 0, label: "< 1 rb views" },
    ],
  });

  console.log("Seeding data aktual dari Excel (bulanan)...");

  const bulananData = [
    { username: "irfankaisa", bulan: "2026-01-01", gmv: 8064383, liveGmv: 0, videoGmv: 8064383, orders: 80, items: 81, commission: 598183, avgOrder: 100805, ctr: 0.12, lives: 0, videos: 34, followers: 1813, impressions: 121204 },
    { username: "endypriam", bulan: "2026-01-01", gmv: 7822183, liveGmv: 0, videoGmv: 7822183, orders: 96, items: 98, commission: 569038, avgOrder: 81481, ctr: 0.10, lives: 0, videos: 0, followers: 12639, impressions: 147469 },
    { username: "douextraitdeparfum", bulan: "2026-01-01", gmv: 6160341, liveGmv: 0, videoGmv: 6160341, orders: 73, items: 74, commission: 473373, avgOrder: 84388, ctr: 0.10, lives: 0, videos: 1, followers: 22042, impressions: 89527 },
    { username: "asalja0", bulan: "2026-01-01", gmv: 3361821, liveGmv: 0, videoGmv: 3361821, orders: 35, items: 36, commission: 248516, avgOrder: 96052, ctr: 0.13, lives: 0, videos: 9, followers: 1512, impressions: 61757 },
    { username: "zani.pmgks", bulan: "2026-01-01", gmv: 2564941, liveGmv: 0, videoGmv: 2564941, orders: 32, items: 32, commission: 161230, avgOrder: 80154, ctr: 0.05, lives: 2, videos: 20, followers: 3923, impressions: 52077 },
    { username: "_lyy033", bulan: "2026-01-01", gmv: 2429447, liveGmv: 0, videoGmv: 2429447, orders: 28, items: 29, commission: 177531, avgOrder: 86766, ctr: 0.10, lives: 0, videos: 0, followers: 6402, impressions: 29911 },
    { username: "asterixsty", bulan: "2026-01-01", gmv: 1953403, liveGmv: 0, videoGmv: 0, orders: 14, items: 16, commission: 152642, avgOrder: 139529, ctr: 0.08, lives: 0, videos: 0, followers: 247643, impressions: 3248 },
    { username: "douextraitdeparfum", bulan: "2026-01-01", gmv: 4958617, liveGmv: 0, videoGmv: 4958617, orders: 48, items: 49, commission: 382000, avgOrder: 103300, ctr: 0.09, lives: 0, videos: 7, followers: 22042, impressions: 50000 },
    { username: "irfankaisa", bulan: "2026-02-01", gmv: 12577607, liveGmv: 0, videoGmv: 12577607, orders: 145, items: 149, commission: 950000, avgOrder: 86742, ctr: 0.11, lives: 0, videos: 32, followers: 1813, impressions: 210000 },
    { username: "endypriam", bulan: "2026-02-01", gmv: 10415000, liveGmv: 0, videoGmv: 10415000, orders: 125, items: 127, commission: 780000, avgOrder: 83320, ctr: 0.09, lives: 0, videos: 0, followers: 12639, impressions: 190000 },
    { username: "irfankaisa", bulan: "2026-03-01", gmv: 14058749, liveGmv: 0, videoGmv: 14058749, orders: 162, items: 165, commission: 1050000, avgOrder: 86782, ctr: 0.12, lives: 0, videos: 40, followers: 1813, impressions: 240000 },
    { username: "irfankaisa", bulan: "2026-04-01", gmv: 8064383, liveGmv: 0, videoGmv: 8064383, orders: 80, items: 81, commission: 598183, avgOrder: 100805, ctr: 0.12, lives: 0, videos: 34, followers: 1813, impressions: 121204 },
  ];

  for (const d of bulananData) {
    await prisma.dataBulanan.create({
      data: {
        periode: new Date(d.bulan),
        creatorUsername: d.username,
        affiliateGmv: d.gmv,
        affiliateLiveGmv: d.liveGmv,
        affiliateVideoGmv: d.videoGmv,
        affiliateOrders: d.orders,
        itemsSold: d.items,
        estCommission: d.commission,
        avgOrderValue: d.avgOrder,
        ctr: d.ctr,
        affiliateLiveStreams: d.lives,
        affiliateShoppableVideos: d.videos,
        affiliateFollowers: d.followers,
        productImpressions: d.impressions,
        affiliateProductsSold: d.items,
        affiliateProductCardGmv: 0,
        openCollabGmv: d.gmv,
        affiliateRefundedGmv: 0,
        affiliateItemsRefunded: 0,
      },
    });
  }

  console.log("✅ Seed selesai!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
