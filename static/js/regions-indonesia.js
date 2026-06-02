/**
 * regions-indonesia.js
 * ---------------------------------------------------------------
 * Daftar lengkap region (kabupaten/kota) seluruh Indonesia,
 * dipakai oleh master Pembeli (Kelola Pemesanan) dan filter
 * Laporan Data Pembeli (Kelola Laporan).
 *
 * Bentuk kanonik string region (jadi pengenal unik tiap pembeli):
 *   "Kab. <Nama>, <Provinsi>"   atau   "Kota <Nama>, <Provinsi>"
 *
 * Format ini sengaja diberi prefix "Kab." / "Kota" + provinsi karena
 * beberapa nama bisa tabrakan (mis. Banten punya Kab. Tangerang & Kota
 * Tangerang; Lombok juga punya Kota Bima & Kab. Bima). Dengan format ini
 * setiap region jadi unik (seperti ID) dan bisa langsung dipakai sebagai
 * kunci agregasi pada laporan.
 *
 * API helper (window.RegionsIndonesia):
 *   - data: array provinsi → {nama, pulau, kabupaten[], kota[]}
 *   - getAllRegions(): string[]  (kanonik, sudah unik & tersortir)
 *   - getRegionsByProvinsi(): {[provinsi]: string[]}
 *   - getRegionsGroupedByPulau(): {[pulau]: string[]}
 *   - isValidRegion(s): boolean   (cek apakah string termasuk daftar)
 *   - normalizeRegion(s): string  (membakukan input pengguna; kembalikan
 *     "" jika tidak valid)
 *   - getProvinsiOfRegion(s): string|""
 *   - getPulauOfRegion(s): string|""
 *
 * Dataset diambil dari permintaan pengguna (BPS, 38 provinsi).
 */
(function (root) {
  "use strict";

  const REGIONS_DATA = [
    // ---------- PULAU SUMATERA ----------
    {
      nama: "Aceh",
      pulau: "Sumatera",
      kabupaten: [
        "Aceh Barat", "Aceh Barat Daya", "Aceh Besar", "Aceh Jaya",
        "Aceh Selatan", "Aceh Singkil", "Aceh Tamiang", "Aceh Tengah",
        "Aceh Tenggara", "Aceh Timur", "Aceh Utara", "Bener Meriah",
        "Bireuen", "Gayo Lues", "Nagan Raya", "Pidie", "Pidie Jaya",
        "Simeulue",
      ],
      kota: ["Banda Aceh", "Langsa", "Lhokseumawe", "Sabang", "Subulussalam"],
    },
    {
      nama: "Sumatera Utara",
      pulau: "Sumatera",
      kabupaten: [
        "Asahan", "Batubara", "Dairi", "Deli Serdang", "Humbang Hasundutan",
        "Karo", "Labuhanbatu", "Labuhanbatu Selatan", "Labuhanbatu Utara",
        "Langkat", "Mandailing Natal", "Nias", "Nias Barat", "Nias Selatan",
        "Nias Utara", "Padang Lawas", "Padang Lawas Utara", "Pakpak Bharat",
        "Samosir", "Serdang Bedagai", "Simalungun", "Toba",
        "Tapanuli Selatan", "Tapanuli Tengah", "Tapanuli Utara",
      ],
      kota: [
        "Binjai", "Gunungsitoli", "Medan", "Padangsidimpuan",
        "Pematangsiantar", "Sibolga", "Tanjungbalai", "Tebing Tinggi",
      ],
    },
    {
      nama: "Sumatera Barat",
      pulau: "Sumatera",
      kabupaten: [
        "Agam", "Dharmasraya", "Kepulauan Mentawai", "Lima Puluh Kota",
        "Padang Pariaman", "Pasaman", "Pasaman Barat", "Pesisir Selatan",
        "Sijunjung", "Solok", "Solok Selatan", "Tanah Datar",
      ],
      kota: [
        "Bukittinggi", "Padang", "Padang Panjang", "Pariaman",
        "Payakumbuh", "Sawahlunto", "Solok",
      ],
    },
    {
      nama: "Riau",
      pulau: "Sumatera",
      kabupaten: [
        "Bengkalis", "Indragiri Hilir", "Indragiri Hulu", "Kampar",
        "Kepulauan Meranti", "Kuantan Singingi", "Pelalawan", "Rokan Hilir",
        "Rokan Hulu", "Siak",
      ],
      kota: ["Dumai", "Pekanbaru"],
    },
    {
      nama: "Kepulauan Riau",
      pulau: "Sumatera",
      kabupaten: ["Bintan", "Karimun", "Kepulauan Anambas", "Lingga", "Natuna"],
      kota: ["Batam", "Tanjungpinang"],
    },
    {
      nama: "Jambi",
      pulau: "Sumatera",
      kabupaten: [
        "Batanghari", "Bungo", "Kerinci", "Merangin", "Muaro Jambi",
        "Sarolangun", "Tanjung Jabung Barat", "Tanjung Jabung Timur", "Tebo",
      ],
      kota: ["Jambi", "Sungai Penuh"],
    },
    {
      nama: "Bengkulu",
      pulau: "Sumatera",
      kabupaten: [
        "Bengkulu Selatan", "Bengkulu Tengah", "Bengkulu Utara", "Kaur",
        "Kepahiang", "Lebong", "Mukomuko", "Rejang Lebong", "Seluma",
      ],
      kota: ["Bengkulu"],
    },
    {
      nama: "Sumatera Selatan",
      pulau: "Sumatera",
      kabupaten: [
        "Banyuasin", "Empat Lawang", "Lahat", "Muara Enim", "Musi Banyuasin",
        "Musi Rawas", "Musi Rawas Utara", "Ogan Ilir", "Ogan Komering Ilir",
        "Ogan Komering Ulu", "Ogan Komering Ulu Selatan",
        "Ogan Komering Ulu Timur", "Penukal Abab Lematang Ilir",
      ],
      kota: ["Lubuklinggau", "Pagar Alam", "Palembang", "Prabumulih"],
    },
    {
      nama: "Kepulauan Bangka Belitung",
      pulau: "Sumatera",
      kabupaten: [
        "Bangka", "Bangka Barat", "Bangka Selatan", "Bangka Tengah",
        "Belitung", "Belitung Timur",
      ],
      kota: ["Pangkalpinang"],
    },
    {
      nama: "Lampung",
      pulau: "Sumatera",
      kabupaten: [
        "Lampung Barat", "Lampung Selatan", "Lampung Tengah",
        "Lampung Timur", "Lampung Utara", "Mesuji", "Pesawaran",
        "Pesisir Barat", "Pringsewu", "Tanggamus", "Tulang Bawang",
        "Tulang Bawang Barat", "Way Kanan",
      ],
      kota: ["Bandar Lampung", "Metro"],
    },

    // ---------- PULAU JAWA ----------
    {
      nama: "DKI Jakarta",
      pulau: "Jawa",
      kabupaten: ["Kepulauan Seribu"],
      kota: [
        "Jakarta Barat", "Jakarta Pusat", "Jakarta Selatan",
        "Jakarta Timur", "Jakarta Utara",
      ],
    },
    {
      nama: "Banten",
      pulau: "Jawa",
      kabupaten: ["Lebak", "Pandeglang", "Serang", "Tangerang"],
      kota: ["Cilegon", "Serang", "Tangerang", "Tangerang Selatan"],
    },
    {
      nama: "Jawa Barat",
      pulau: "Jawa",
      kabupaten: [
        "Bandung", "Bandung Barat", "Bekasi", "Bogor", "Ciamis", "Cianjur",
        "Cirebon", "Garut", "Indramayu", "Karawang", "Kuningan", "Majalengka",
        "Pangandaran", "Purwakarta", "Subang", "Sukabumi", "Sumedang",
        "Tasikmalaya",
      ],
      kota: [
        "Bandung", "Banjar", "Bekasi", "Bogor", "Cimahi", "Cirebon",
        "Depok", "Sukabumi", "Tasikmalaya",
      ],
    },
    {
      nama: "Jawa Tengah",
      pulau: "Jawa",
      kabupaten: [
        "Banjarnegara", "Banyumas", "Batang", "Blora", "Boyolali", "Brebes",
        "Cilacap", "Demak", "Grobogan", "Jepara", "Karanganyar", "Kebumen",
        "Kendal", "Klaten", "Kudus", "Magelang", "Pati", "Pekalongan",
        "Pemalang", "Purbalingga", "Purworejo", "Rembang", "Semarang",
        "Sragen", "Sukoharjo", "Tegal", "Temanggung", "Wonogiri", "Wonosobo",
      ],
      kota: [
        "Magelang", "Pekalongan", "Salatiga", "Semarang",
        "Surakarta (Solo)", "Tegal",
      ],
    },
    {
      nama: "DI Yogyakarta",
      pulau: "Jawa",
      kabupaten: ["Bantul", "Gunungkidul", "Kulon Progo", "Sleman"],
      kota: ["Yogyakarta"],
    },
    {
      nama: "Jawa Timur",
      pulau: "Jawa",
      kabupaten: [
        "Bangkalan", "Banyuwangi", "Blitar", "Bojonegoro", "Bondowoso",
        "Gresik", "Jember", "Jombang", "Kediri", "Lamongan", "Lumajang",
        "Madiun", "Magetan", "Malang", "Mojokerto", "Nganjuk", "Ngawi",
        "Pacitan", "Pamekasan", "Pasuruan", "Ponorogo", "Probolinggo",
        "Sampang", "Sidoarjo", "Situbondo", "Sumenep", "Trenggalek",
        "Tuban", "Tulungagung",
      ],
      kota: [
        "Batu", "Blitar", "Kediri", "Madiun", "Malang", "Mojokerto",
        "Pasuruan", "Probolinggo", "Surabaya",
      ],
    },

    // ---------- BALI & NUSA TENGGARA ----------
    {
      nama: "Bali",
      pulau: "Bali & Nusa Tenggara",
      kabupaten: [
        "Badung", "Bangli", "Buleleng", "Gianyar", "Jembrana",
        "Karangasem", "Klungkung", "Tabanan",
      ],
      kota: ["Denpasar"],
    },
    {
      nama: "Nusa Tenggara Barat",
      pulau: "Bali & Nusa Tenggara",
      kabupaten: [
        "Bima", "Dompu", "Lombok Barat", "Lombok Tengah", "Lombok Timur",
        "Lombok Utara", "Sumbawa", "Sumbawa Barat",
      ],
      kota: ["Bima", "Mataram"],
    },
    {
      nama: "Nusa Tenggara Timur",
      pulau: "Bali & Nusa Tenggara",
      kabupaten: [
        "Alor", "Belu", "Ende", "Flores Timur", "Kupang", "Lembata",
        "Malaka", "Manggarai", "Manggarai Barat", "Manggarai Timur",
        "Nagekeo", "Ngada", "Rote Ndao", "Sabu Raijua", "Sikka",
        "Sumba Barat", "Sumba Barat Daya", "Sumba Tengah", "Sumba Timur",
        "Timor Tengah Selatan", "Timor Tengah Utara",
      ],
      kota: ["Kupang"],
    },

    // ---------- PULAU KALIMANTAN ----------
    {
      nama: "Kalimantan Barat",
      pulau: "Kalimantan",
      kabupaten: [
        "Bengkayang", "Kapuas Hulu", "Kayong Utara", "Ketapang", "Kubu Raya",
        "Landak", "Melawi", "Mempawah", "Sambas", "Sanggau", "Sekadau",
        "Sintang",
      ],
      kota: ["Pontianak", "Singkawang"],
    },
    {
      nama: "Kalimantan Tengah",
      pulau: "Kalimantan",
      kabupaten: [
        "Barito Selatan", "Barito Timur", "Barito Utara", "Gunung Mas",
        "Kapuas", "Katingan", "Kotawaringin Barat", "Kotawaringin Timur",
        "Lamandau", "Murung Raya", "Pulang Pisau", "Sukamara", "Seruyan",
      ],
      kota: ["Palangkaraya"],
    },
    {
      nama: "Kalimantan Selatan",
      pulau: "Kalimantan",
      kabupaten: [
        "Balangan", "Banjar", "Barito Kuala", "Hulu Sungai Selatan",
        "Hulu Sungai Tengah", "Hulu Sungai Utara", "Kotabaru", "Tabalong",
        "Tanah Bumbu", "Tanah Laut", "Tapin",
      ],
      kota: ["Banjarbaru", "Banjarmasin"],
    },
    {
      nama: "Kalimantan Timur",
      pulau: "Kalimantan",
      kabupaten: [
        "Berau", "Kutai Barat", "Kutai Kartanegara", "Kutai Timur",
        "Mahakam Ulu", "Paser", "Penajam Paser Utara",
      ],
      kota: ["Balikpapan", "Bontang", "Samarinda"],
    },
    {
      nama: "Kalimantan Utara",
      pulau: "Kalimantan",
      kabupaten: ["Bulungan", "Malinau", "Nunukan", "Tana Tidung"],
      kota: ["Tarakan"],
    },

    // ---------- PULAU SULAWESI ----------
    {
      nama: "Sulawesi Utara",
      pulau: "Sulawesi",
      kabupaten: [
        "Bolaang Mongondow", "Bolaang Mongondow Selatan",
        "Bolaang Mongondow Timur", "Bolaang Mongondow Utara",
        "Kepulauan Sangihe",
        "Kepulauan Siau Tagulandang Biaro (Sitaro)",
        "Kepulauan Talaud", "Minahasa", "Minahasa Selatan",
        "Minahasa Tenggara", "Minahasa Utara",
      ],
      kota: ["Bitung", "Kotamobagu", "Manado", "Tomohon"],
    },
    {
      nama: "Gorontalo",
      pulau: "Sulawesi",
      kabupaten: [
        "Boalemo", "Bone Bolango", "Gorontalo", "Gorontalo Utara", "Pohuwato",
      ],
      kota: ["Gorontalo"],
    },
    {
      nama: "Sulawesi Tengah",
      pulau: "Sulawesi",
      kabupaten: [
        "Banggai", "Banggai Kepulauan", "Banggai Laut", "Buol", "Donggala",
        "Morowali", "Morowali Utara", "Parigi Moutong", "Poso", "Sigi",
        "Tojo Una-Una", "Toli-Toli",
      ],
      kota: ["Palu"],
    },
    {
      nama: "Sulawesi Barat",
      pulau: "Sulawesi",
      kabupaten: [
        "Majene", "Mamasa", "Mamuju", "Mamuju Tengah", "Pasangkayu",
        "Polewali Mandar",
      ],
      kota: [],
    },
    {
      nama: "Sulawesi Selatan",
      pulau: "Sulawesi",
      kabupaten: [
        "Bantaeng", "Barru", "Bone", "Bulukumba", "Enrekang", "Gowa",
        "Jeneponto", "Kepulauan Selayar", "Luwu", "Luwu Timur",
        "Luwu Utara", "Maros", "Pangkajene dan Kepulauan", "Pinrang",
        "Sidenreng Rappang", "Sinjai", "Soppeng", "Takalar", "Tana Toraja",
        "Toraja Utara", "Wajo",
      ],
      kota: ["Makassar", "Palopo", "Parepare"],
    },
    {
      nama: "Sulawesi Tenggara",
      pulau: "Sulawesi",
      kabupaten: [
        "Bombana", "Buton", "Buton Selatan", "Buton Tengah", "Buton Utara",
        "Kolaka", "Kolaka Timur", "Kolaka Utara", "Konawe",
        "Konawe Kepulauan", "Konawe Selatan", "Konawe Utara", "Muna",
        "Muna Barat", "Wakatobi",
      ],
      kota: ["Baubau", "Kendari"],
    },

    // ---------- MALUKU & PAPUA ----------
    {
      nama: "Maluku",
      pulau: "Maluku & Papua",
      kabupaten: [
        "Buru", "Buru Selatan", "Kepulauan Aru", "Kepulauan Tanimbar",
        "Maluku Barat Daya", "Maluku Tengah", "Maluku Tenggara",
        "Seram Bagian Barat", "Seram Bagian Timur",
      ],
      kota: ["Ambon", "Tual"],
    },
    {
      nama: "Maluku Utara",
      pulau: "Maluku & Papua",
      kabupaten: [
        "Halmahera Barat", "Halmahera Tengah", "Halmahera Timur",
        "Halmahera Selatan", "Halmahera Utara", "Kepulauan Sula",
        "Pulau Morotai", "Pulau Taliabu",
      ],
      kota: ["Ternate", "Tidore Kepulauan"],
    },
    {
      nama: "Papua",
      pulau: "Maluku & Papua",
      kabupaten: [
        "Biak Numfor", "Jayapura", "Keerom", "Kepulauan Yapen",
        "Mamberamo Raya", "Sarmi", "Supiori", "Waropen",
      ],
      kota: ["Jayapura"],
    },
    {
      nama: "Papua Barat",
      pulau: "Maluku & Papua",
      kabupaten: [
        "Fakfak", "Kaimana", "Manokwari", "Manokwari Selatan",
        "Pegunungan Arfak", "Teluk Bintuni", "Teluk Wondama",
      ],
      kota: [],
    },
    {
      nama: "Papua Selatan",
      pulau: "Maluku & Papua",
      kabupaten: ["Asmat", "Mappi", "Merauke", "Boven Digoel"],
      kota: [],
    },
    {
      nama: "Papua Tengah",
      pulau: "Maluku & Papua",
      kabupaten: [
        "Deiyai", "Dogiyai", "Intan Jaya", "Mimika", "Nabire", "Paniai",
        "Puncak", "Puncak Jaya",
      ],
      kota: [],
    },
    {
      nama: "Papua Pegunungan",
      pulau: "Maluku & Papua",
      kabupaten: [
        "Jayawijaya", "Lanny Jaya", "Mamberamo Tengah", "Nduga",
        "Pegunungan Bintang", "Tolikara", "Yalimo", "Yahukimo",
      ],
      kota: [],
    },
    {
      nama: "Papua Barat Daya",
      pulau: "Maluku & Papua",
      kabupaten: [
        "Maybrat", "Raja Ampat", "Sorong", "Sorong Selatan", "Tambrauw",
      ],
      kota: ["Sorong"],
    },
  ];

  const FLAT_REGIONS = (function () {
    const out = [];
    REGIONS_DATA.forEach((p) => {
      (p.kabupaten || []).forEach((k) => {
        out.push({
          canon: `Kab. ${k}, ${p.nama}`,
          jenis: "Kab.",
          nama: k,
          provinsi: p.nama,
          pulau: p.pulau,
        });
      });
      (p.kota || []).forEach((k) => {
        out.push({
          canon: `Kota ${k}, ${p.nama}`,
          jenis: "Kota",
          nama: k,
          provinsi: p.nama,
          pulau: p.pulau,
        });
      });
    });
    out.sort((a, b) => a.canon.localeCompare(b.canon, "id"));
    return out;
  })();

  const REGION_INDEX = (function () {
    const idx = Object.create(null);
    FLAT_REGIONS.forEach((r) => {
      idx[r.canon.toLowerCase()] = r;
    });
    return idx;
  })();

  function getAllRegions() {
    return FLAT_REGIONS.map((r) => r.canon);
  }

  function getRegionsByProvinsi() {
    const out = {};
    REGIONS_DATA.forEach((p) => {
      out[p.nama] = [];
    });
    FLAT_REGIONS.forEach((r) => {
      if (!out[r.provinsi]) out[r.provinsi] = [];
      out[r.provinsi].push(r.canon);
    });
    return out;
  }

  function getRegionsGroupedByPulau() {
    const out = {};
    FLAT_REGIONS.forEach((r) => {
      if (!out[r.pulau]) out[r.pulau] = [];
      out[r.pulau].push(r.canon);
    });
    return out;
  }

  function isValidRegion(s) {
    if (!s) return false;
    const k = String(s).trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(REGION_INDEX, k);
  }

  /**
   * Bakukan input pengguna ke string kanonik (jika cocok). Mendukung input
   * persis (case-insensitive) dan beberapa pola bebas seperti "kota
   * makassar" atau "makassar (sulawesi selatan)".
   */
  function normalizeRegion(s) {
    if (!s) return "";
    const raw = String(s).trim();
    if (!raw) return "";
    const lower = raw.toLowerCase();
    if (REGION_INDEX[lower]) return REGION_INDEX[lower].canon;
    // coba match prefix kab/kota + nama saja
    const stripPrefix = lower
      .replace(/^kabupaten\s+/, "kab. ")
      .replace(/^kab\.?\s+/, "kab. ")
      .replace(/^kota\s+/, "kota ");
    if (REGION_INDEX[stripPrefix]) return REGION_INDEX[stripPrefix].canon;
    // cocokkan tanpa prefix → ambil kandidat pertama yang nama+provinsi-nya
    // sesuai (pencarian sederhana)
    const candidates = FLAT_REGIONS.filter(
      (r) => r.nama.toLowerCase() === lower
    );
    if (candidates.length === 1) return candidates[0].canon;
    return "";
  }

  function getProvinsiOfRegion(s) {
    if (!s) return "";
    const k = String(s).trim().toLowerCase();
    return REGION_INDEX[k] ? REGION_INDEX[k].provinsi : "";
  }

  function getPulauOfRegion(s) {
    if (!s) return "";
    const k = String(s).trim().toLowerCase();
    return REGION_INDEX[k] ? REGION_INDEX[k].pulau : "";
  }

  const api = {
    data: REGIONS_DATA,
    getAllRegions,
    getRegionsByProvinsi,
    getRegionsGroupedByPulau,
    isValidRegion,
    normalizeRegion,
    getProvinsiOfRegion,
    getPulauOfRegion,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.RegionsIndonesia = api;
  }
})(typeof window !== "undefined" ? window : this);
