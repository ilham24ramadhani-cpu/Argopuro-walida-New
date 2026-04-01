// Load data dari API atau localStorage (read-only untuk laporan)
let bahan = [];
let produksi = [];
let hasilProduksi = [];
let sanitasi = [];
let pemasok = [];
let keuangan = [];
let selectedWeeklyYear = new Date().getFullYear();

/** Produksi sudah tahap pengemasan dan punya berat akhir > 0 */
function isProduksiPengemasanBeratAkhir(p) {
  const st = (p.statusTahapan || "").toLowerCase();
  if (!st.includes("pengemasan")) return false;
  const ba = parseFloat(p.beratAkhir);
  return Number.isFinite(ba) && ba > 0;
}

/** Randemen = total bahan (kg) ÷ total berat akhir pengemasan (kg); — jika penyebut 0 */
function formatRandemenCell(totalBahanKg, totalPengemasanKg) {
  const d = Number(totalPengemasanKg) || 0;
  const n = Number(totalBahanKg) || 0;
  if (d <= 0) return "—";
  const r = n / d;
  return r.toLocaleString("id-ID", { maximumFractionDigits: 4 });
}

// Load all data untuk laporan
async function loadAllReportData() {
  try {
    if (window.API) {
      bahan = window.API.Bahan ? await window.API.Bahan.getAll() : [];
      produksi = window.API.Produksi ? await window.API.Produksi.getAll() : [];
      hasilProduksi = window.API.HasilProduksi ? await window.API.HasilProduksi.getAll() : [];
      sanitasi = window.API.Sanitasi ? await window.API.Sanitasi.getAll() : [];
      pemasok = window.API.Pemasok ? await window.API.Pemasok.getAll() : [];
      keuangan = window.API.Keuangan ? await window.API.Keuangan.getAll() : [];
    }
  } catch (error) {
    console.error("Error loading report data from API:", error);
  }
  
  // Fallback to localStorage
  if (bahan.length === 0) bahan = JSON.parse(localStorage.getItem("bahan") || "[]");
  if (produksi.length === 0) produksi = JSON.parse(localStorage.getItem("produksi") || "[]");
  if (hasilProduksi.length === 0) hasilProduksi = JSON.parse(localStorage.getItem("hasilProduksi") || "[]");
  if (sanitasi.length === 0) sanitasi = JSON.parse(localStorage.getItem("sanitasi") || "[]");
  if (pemasok.length === 0) pemasok = JSON.parse(localStorage.getItem("pemasok") || "[]");
  if (keuangan.length === 0) keuangan = JSON.parse(localStorage.getItem("keuangan") || "[]");
}

// Hash untuk mendeteksi perubahan data
let dataHashes = {
  bahan: null,
  produksi: null,
  hasilProduksi: null,
  sanitasi: null,
  pemasok: null,
  keuangan: null,
};

// Fungsi untuk generate hash dari data
function generateHash(data) {
  return JSON.stringify(data);
}

// Fungsi untuk check perubahan data
async function checkDataChanges() {
  const keys = [
    "bahan",
    "produksi",
    "hasilProduksi",
    "sanitasi",
    "pemasok",
    "keuangan",
  ];
  let hasChanges = false;

  // Reload data dari API atau localStorage
  await loadAllReportData();

  keys.forEach((key) => {
    let currentData = [];
    switch (key) {
      case "bahan":
        currentData = bahan;
        break;
      case "produksi":
        currentData = produksi;
        break;
      case "hasilProduksi":
        currentData = hasilProduksi;
        break;
      case "sanitasi":
        currentData = sanitasi;
        break;
      case "pemasok":
        currentData = pemasok;
        break;
      case "keuangan":
        currentData = keuangan;
        break;
    }
    
    const currentHash = generateHash(currentData);
    if (dataHashes[key] !== currentHash) {
      dataHashes[key] = currentHash;
      hasChanges = true;
    }
  });

  return hasChanges;
}

// Fungsi untuk refresh semua tabel
async function refreshAllTables() {
  // Reload data dari API atau localStorage sebelum display
  await loadAllReportData();

  displayBahan();
  displayProduksi();
  displayHasilProduksi();
  displaySanitasi();
  displayPemasok();
  displayKeuangan();
  displayStok();
  renderWeeklyRecap();
  renderBahanPriceStats();
  renderProduksiTimeline();
}

// Fungsi untuk initialize hash
async function initializeHashes() {
  await loadAllReportData();
  dataHashes.bahan = generateHash(bahan);
  dataHashes.produksi = generateHash(produksi);
  dataHashes.hasilProduksi = generateHash(hasilProduksi);
  dataHashes.sanitasi = generateHash(sanitasi);
  dataHashes.pemasok = generateHash(pemasok);
  dataHashes.keuangan = generateHash(keuangan);
}

// Tipe sanitasi names
const tipeSanitasiNames = {
  gudang: "Sanitasi Gudang & Produksi",
  peralatan: "Sanitasi Peralatan Produksi",
  toilet: "Sanitasi Toilet & Cuci Tangan",
  lingkungan: "Sanitasi Lingkungan Sekitar",
};

// Format currency
function formatCurrency(amount) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

// Format date
function formatDate(dateString) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleDateString("id-ID", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatShortDate(dateValue, includeYear = false) {
  if (!dateValue) return "-";
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (isNaN(date)) return "-";
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    ...(includeYear ? { year: "numeric" } : {}),
  });
}

function formatKgValue(value) {
  if (value === null || value === undefined || isNaN(value)) return "-";
  return `${value.toLocaleString("id-ID", { maximumFractionDigits: 2 })} kg`;
}

function parseValidDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date) ? null : date;
}

function getWeekNumber(date) {
  const tempDate = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = tempDate.getUTCDay() || 7;
  tempDate.setUTCDate(tempDate.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));
  return Math.ceil(((tempDate - yearStart) / 86400000 + 1) / 7);
}

function getWeekBoundaries(date) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getAvailableYears() {
  const yearSet = new Set();
  const collectYear = (value) => {
    const date = parseValidDate(value);
    if (date) {
      yearSet.add(date.getFullYear());
    }
  };

  bahan.forEach((item) => collectYear(item.tanggalMasuk));
  produksi.forEach((item) => collectYear(item.tanggalMasuk));
  hasilProduksi.forEach((item) => collectYear(item.tanggal));

  return Array.from(yearSet).sort((a, b) => b - a);
}

function safeNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function averageNumber(items, getter) {
  if (!Array.isArray(items) || items.length === 0) return null;
  let total = 0;
  let count = 0;
  items.forEach((item) => {
    const value = getter(item);
    if (Number.isFinite(value)) {
      total += value;
      count += 1;
    }
  });
  if (count === 0) return null;
  return total / count;
}

function formatMonthYear(date) {
  if (!date) return "-";
  return date.toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });
}

function getPeriodMeta(date, range) {
  if (!date) return null;
  const year = date.getFullYear();
  if (range === "daily") {
    const key = date.toISOString().split("T")[0];
    return {
      key,
      label: formatDate(key),
      sortValue: date.getTime(),
    };
  }
  if (range === "monthly") {
    const month = date.getMonth();
    return {
      key: `${year}-${(month + 1).toString().padStart(2, "0")}`,
      label: formatMonthYear(date),
      sortValue: year * 100 + month,
    };
  }
  if (range === "yearly") {
    return {
      key: `${year}`,
      label: `${year}`,
      sortValue: year,
    };
  }
  return null;
}

const tableFilters = {
  bahan: { mode: "all", value: "" },
  produksi: { mode: "all", value: "" },
  hasil: { mode: "all", value: "" },
  sanitasi: { mode: "all", value: "" },
  keuangan: { mode: "all", value: "" },
  stok: { mode: "all", value: "" },
};

const TABLE_FILTER_CONFIG = {
  bahan: {
    modeId: "bahanFilterMode",
    valueId: "bahanFilterValue",
    resetId: "bahanFilterReset",
    getDate: (item) => item.tanggalMasuk,
  },
  produksi: {
    modeId: "produksiFilterMode",
    valueId: "produksiFilterValue",
    resetId: "produksiFilterReset",
    getDate: (item) => item.tanggalMasuk,
  },
  hasil: {
    modeId: "hasilFilterMode",
    valueId: "hasilFilterValue",
    resetId: "hasilFilterReset",
    getDate: (item) => item.tanggal,
  },
  sanitasi: {
    modeId: "sanitasiFilterMode",
    valueId: "sanitasiFilterValue",
    resetId: "sanitasiFilterReset",
    getDate: (item) => item.tanggal,
  },
  keuangan: {
    modeId: "keuanganFilterMode",
    valueId: "keuanganFilterValue",
    resetId: "keuanganFilterReset",
    getDate: (item) => item.tanggal,
  },
};

const TABLE_RENDERERS = {
  bahan: () => displayBahan(),
  produksi: () => displayProduksi(),
  hasil: () => displayHasilProduksi(),
  sanitasi: () => displaySanitasi(),
  keuangan: () => displayKeuangan(),
  stok: () => displayStok(),
};

const LAPORAN_REKAP_CONFIG = {
  bahan: {
    title: "Laporan Rekap Bahan Masuk",
    columns: [
      { label: "ID Bahan", value: (item) => item.idBahan || "-" },
      { label: "Pemasok", value: (item) => item.pemasok || "-" },
      {
        label: "Jumlah (kg)",
        value: (item) => formatKgValue(safeNumber(item.jumlah)) || "-",
      },
      {
        label: "Harga/Kg",
        value: (item) =>
          item.hargaPerKg ? formatCurrency(item.hargaPerKg) : "-",
      },
      {
        label: "Total Pengeluaran",
        value: (item) =>
          item.totalPengeluaran ? formatCurrency(item.totalPengeluaran) : "-",
      },
      {
        label: "Tanggal Masuk",
        value: (item) => formatDate(item.tanggalMasuk),
      },
      { label: "Kualitas", value: (item) => item.kualitas || "-" },
    ],
    filterKey: "bahan",
    dataset: () => bahan,
    dateGetter: (item) => item.tanggalMasuk,
    averages: [
      {
        label: "Rata-rata Jumlah",
        compute: (items) => {
          const avg = averageNumber(items, (entry) => safeNumber(entry.jumlah));
          return avg === null ? "-" : formatKgValue(avg);
        },
      },
      {
        label: "Rata-rata Harga/Kg (Total Pengeluaran / Total Berat)",
        compute: (items) => {
          if (!items || items.length === 0) return "-";
          let totalPengeluaran = 0;
          let totalBerat = 0;
          items.forEach((entry) => {
            const jumlah = safeNumber(entry.jumlah);
            const hargaPerKg = safeNumber(entry.hargaPerKg);
            // Hitung pengeluaran dari jumlah × harga per kg
            const pengeluaran = jumlah * hargaPerKg;
            if (jumlah > 0 && hargaPerKg > 0) {
              totalPengeluaran += pengeluaran;
              totalBerat += jumlah;
            }
          });
          if (totalBerat === 0) return "-";
          // Rata-rata = Total Pengeluaran / Total Berat (kg)
          const avg = totalPengeluaran / totalBerat;
          return formatCurrency(Math.round(avg));
        },
      },
    ],
    extraSummary: (items) => {
      if (!items.length) return [];
      const maxItem = items.reduce((prev, curr) =>
        safeNumber(curr.hargaPerKg) > safeNumber(prev.hargaPerKg) ? curr : prev
      );
      const minItem = items.reduce((prev, curr) =>
        safeNumber(curr.hargaPerKg) < safeNumber(prev.hargaPerKg) ? curr : prev
      );
      const totalBerat = items.reduce(
        (sum, entry) => sum + safeNumber(entry.jumlah),
        0
      );
      return [
        {
          label: "Harga Tertinggi",
          value: `${formatCurrency(safeNumber(maxItem.hargaPerKg))} (${
            maxItem.idBahan || "-"
          })`,
        },
        {
          label: "Harga Terendah",
          value: `${formatCurrency(safeNumber(minItem.hargaPerKg))} (${
            minItem.idBahan || "-"
          })`,
        },
        {
          label: "Total Bahan",
          value: formatKgValue(totalBerat),
        },
      ];
    },
  },
  produksi: {
    title: "Laporan Rekap Produksi",
    columns: [
      { label: "ID Produksi", value: (item) => item.idProduksi || "-" },
      { label: "ID Bahan", value: (item) => item.idBahan || "-" },
      {
        label: "Berat Awal (kg)",
        value: (item) =>
          safeNumber(item.beratAwal)
            ? `${safeNumber(item.beratAwal).toLocaleString("id-ID")} kg`
            : "-",
      },
      {
        label: "Berat Akhir (kg)",
        value: (item) =>
          safeNumber(item.beratAkhir)
            ? `${safeNumber(item.beratAkhir).toLocaleString("id-ID")} kg`
            : "-",
      },
      { label: "Proses", value: (item) => item.prosesPengolahan || "-" },
      {
        label: "Kadar Air",
        value: (item) => (item.kadarAir ? `${item.kadarAir}%` : "-"),
      },
      {
        label: "Tanggal Masuk",
        value: (item) => formatDate(item.tanggalMasuk),
      },
      {
        label: "Tanggal Sekarang",
        value: (item) => formatDate(item.tanggalSekarang),
      },
      { label: "Status Tahapan", value: (item) => item.statusTahapan || "-" },
    ],
    filterKey: "produksi",
    dataset: () => produksi,
    dateGetter: (item) => item.tanggalMasuk,
    extraSummary: (items) => {
      if (!items.length) return [];
      
      // Total Berat Awal
      const totalBeratAwal = items.reduce(
        (sum, entry) => sum + safeNumber(entry.beratAwal),
        0
      );
      
      // Total Berat Akhir
      const totalBeratAkhir = items.reduce(
        (sum, entry) => sum + safeNumber(entry.beratAkhir),
        0
      );
      
      // Hitung proses pengolahan yang paling sering dan paling sedikit
      const prosesCount = {};
      items.forEach((entry) => {
        const proses = entry.prosesPengolahan || "-";
        prosesCount[proses] = (prosesCount[proses] || 0) + 1;
      });
      
      let prosesPalingSering = null;
      let prosesPalingSedikit = null;
      let maxCount = 0;
      let minCount = Infinity;
      
      Object.keys(prosesCount).forEach((proses) => {
        const count = prosesCount[proses];
        if (count > maxCount) {
          maxCount = count;
          prosesPalingSering = proses;
        }
        if (count < minCount) {
          minCount = count;
          prosesPalingSedikit = proses;
        }
      });
      
      return [
        {
          label: "Total Berat Awal",
          value: formatKgValue(totalBeratAwal),
        },
        {
          label: "Total Berat Akhir",
          value: formatKgValue(totalBeratAkhir),
        },
        {
          label: "Proses Pengolahan Paling Sering Diproduksi",
          value: prosesPalingSering ? `${prosesPalingSering} (${maxCount} kali)` : "-",
        },
        {
          label: "Proses Pengolahan Paling Sedikit Diproduksi",
          value: prosesPalingSedikit ? `${prosesPalingSedikit} (${minCount} kali)` : "-",
      },
      ];
    },
  },
  hasil: {
    title: "Laporan Rekap Hasil Produksi",
    columns: [
      { label: "ID Produksi", value: (item) => item.idProduksi || "-" },
      { label: "ID Bahan", value: (item) => item.idBahan || "-" },
      { label: "Tipe Produk", value: (item) => item.tipeProduk || "-" },
      { label: "Kemasan", value: (item) => item.kemasan || "-" },
      { label: "Jenis Kopi", value: (item) => item.jenisKopi || "-" },
      { label: "Proses", value: (item) => item.prosesPengolahan || "-" },
      { label: "Tanggal", value: (item) => formatDate(item.tanggal) },
      {
        label: "Berat yang Diproses (kg)",
        value: (item) =>
          safeNumber(item.beratSaatIni)
            ? `${safeNumber(item.beratSaatIni).toLocaleString("id-ID")} kg`
            : "-",
      },
      {
        label: "Jumlah",
        value: (item) =>
          safeNumber(item.jumlah)
            ? safeNumber(item.jumlah).toLocaleString("id-ID")
            : "-",
      },
    ],
    filterKey: "hasil",
    dataset: () => hasilProduksi,
    dateGetter: (item) => item.tanggal,
    averages: [
      {
        label: "Rata-rata Output",
        compute: (items) => {
          const avg = averageNumber(items, (entry) =>
            safeNumber(entry.beratSaatIni)
          );
          return avg === null ? "-" : formatKgValue(avg);
        },
      },
      {
        label: "Rata-rata Jumlah Produk",
        compute: (items) => {
          const avg = averageNumber(items, (entry) => safeNumber(entry.jumlah));
          return avg === null
            ? "-"
            : `${avg.toLocaleString("id-ID", { maximumFractionDigits: 2 })}`;
        },
      },
    ],
    extraSummary: (items) => {
      if (!items.length) return [];
      
      // Total Berat yang Diproses
      const totalBeratDiproses = items.reduce(
        (sum, entry) => sum + safeNumber(entry.beratSaatIni),
        0
      );
      
      return [
        {
          label: "Total Berat yang Diproses",
          value: formatKgValue(totalBeratDiproses),
        },
      ];
    },
  },
  sanitasi: {
    title: "Laporan Rekap Sanitasi",
    columns: [
      { label: "Tanggal", value: (item) => formatDate(item.tanggal) },
      {
        label: "Tipe",
        value: (item) => tipeSanitasiNames[item.tipe] || item.tipe || "-",
      },
      { label: "Petugas", value: (item) => item.namaPetugas || "-" },
      { label: "Status", value: (item) => item.status || "-" },
      {
        label: "Checklist",
        value: (item) => getChecklistSummary(item.checklist) || "-",
      },
    ],
    filterKey: "sanitasi",
    dataset: () => sanitasi,
    dateGetter: (item) => item.tanggal,
    averages: [
      {
        label: "Rata-rata Tingkat Selesai",
        compute: (items) => {
          if (!items.length) return "-";
          const selesai = items.filter(
            (entry) => entry.status === "Complete"
          ).length;
          const percentage = (selesai / items.length) * 100;
          return `${percentage.toFixed(1)}%`;
        },
      },
    ],
  },
  keuangan: {
    title: "Laporan Rekap Pengeluaran",
    columns: [
      { label: "Tanggal", value: (item) => formatDate(item.tanggal) },
      {
        label: "Jenis Pengeluaran",
        value: (item) => item.jenisPengeluaran || "-",
      },
      { label: "ID Bahan Baku", value: (item) => item.idBahanBaku || "-" },
      {
        label: "Nilai",
        value: (item) => (item.nilai ? formatCurrency(item.nilai) : "-"),
      },
      { label: "Catatan", value: (item) => item.notes || "-" },
    ],
    filterKey: "keuangan",
    dataset: () => keuangan,
    dateGetter: (item) => item.tanggal,
    extraSummary: (items) => {
      if (!items.length) return [];
      const maxItem = items.reduce((prev, curr) =>
        safeNumber(curr.nilai) > safeNumber(prev.nilai) ? curr : prev
      );
      const totalPengeluaran = items.reduce(
        (sum, entry) => sum + safeNumber(entry.nilai),
        0
      );
      return [
        {
          label: "Maksimal Total Pengeluaran",
          value: `${formatCurrency(safeNumber(maxItem.nilai))} (${
            maxItem.jenisPengeluaran || "-"
          }${maxItem.idBahanBaku ? ` - ${maxItem.idBahanBaku}` : ""})`,
        },
        {
          label: "Total Pengeluaran",
          value: formatCurrency(totalPengeluaran),
        },
      ];
    },
  },
  stok: {
    title: "Laporan Rekap Stok",
    columns: [
      { label: "Tipe Produk", value: (item) => item.tipeProduk || "-" },
      { label: "Kemasan", value: (item) => item.kemasan || "-" },
      { label: "Jenis Kopi", value: (item) => item.jenisKopi || "-" },
      { label: "Proses Pengolahan", value: (item) => item.prosesPengolahan || "-" },
      { label: "Level Roasting", value: (item) => item.levelRoasting || "-" },
      {
        label: "Total Berat (kg)",
        value: (item) =>
          safeNumber(item.totalBerat)
            ? `${safeNumber(item.totalBerat).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`
            : "-",
      },
      {
        label: "Total Jumlah",
        value: (item) =>
          safeNumber(item.totalJumlah)
            ? `${safeNumber(item.totalJumlah).toLocaleString("id-ID")} kemasan`
            : "-",
      },
    ],
    filterKey: "stok",
    dataset: () => aggregateStok(),
    dateGetter: () => null, // Stok tidak punya tanggal
    averages: [
      {
        label: "Rata-rata Berat per Item",
        compute: (items) => {
          if (!items.length) return "-";
          const totalBerat = items.reduce((sum, item) => sum + safeNumber(item.totalBerat), 0);
          const avg = totalBerat / items.length;
          return formatKgValue(avg);
        },
      },
      {
        label: "Rata-rata Jumlah per Item",
        compute: (items) => {
          if (!items.length) return "-";
          const totalJumlah = items.reduce((sum, item) => sum + safeNumber(item.totalJumlah), 0);
          const avg = totalJumlah / items.length;
          return `${avg.toLocaleString("id-ID", { maximumFractionDigits: 2 })} kemasan`;
        },
      },
    ],
    extraSummary: (items) => {
      if (!items.length) return [];
      
      const totalBerat = items.reduce((sum, item) => sum + safeNumber(item.totalBerat), 0);
      const totalJumlah = items.reduce((sum, item) => sum + safeNumber(item.totalJumlah), 0);
      
      // Kategorikan berdasarkan kemasan
      const kemasanMap = {};
      items.forEach((item) => {
        const kemasan = item.kemasan || "-";
        if (!kemasanMap[kemasan]) {
          kemasanMap[kemasan] = {
            count: 0,
            totalBerat: 0,
            totalJumlah: 0,
          };
        }
        kemasanMap[kemasan].count += 1;
        kemasanMap[kemasan].totalBerat += safeNumber(item.totalBerat);
        kemasanMap[kemasan].totalJumlah += safeNumber(item.totalJumlah);
      });
      
      const kemasanSummary = Object.keys(kemasanMap)
        .sort()
        .map((kemasan) => {
          const data = kemasanMap[kemasan];
          return `${kemasan}: ${data.count} item, ${formatKgValue(data.totalBerat)}, ${data.totalJumlah.toLocaleString("id-ID")} kemasan`;
        })
        .join("; ");
      
      return [
        {
          label: "Total Berat Stok",
          value: formatKgValue(totalBerat),
        },
        {
          label: "Total Jumlah Kemasan",
          value: `${totalJumlah.toLocaleString("id-ID")} kemasan`,
        },
        {
          label: "Kategori per Kemasan",
          value: kemasanSummary || "-",
        },
      ];
    },
  },
};

// Fungsi untuk mengagregasi stok dari hasil produksi
function aggregateStok() {
  const hasilProduksi = JSON.parse(localStorage.getItem("hasilProduksi")) || [];

  // Objek untuk menyimpan agregasi stok
  // Key: kombinasi tipeProduk + kemasan + jenisKopi + prosesPengolahan + levelRoasting
  const stokMap = {};

  hasilProduksi.forEach((h) => {
    // Buat key unik berdasarkan kombinasi produk
    const key = `${h.tipeProduk}|${h.kemasan}|${h.jenisKopi}|${
      h.prosesPengolahan
    }|${h.levelRoasting || ""}`;

    if (!stokMap[key]) {
      // Inisialisasi jika belum ada
      stokMap[key] = {
        tipeProduk: h.tipeProduk,
        kemasan: h.kemasan,
        jenisKopi: h.jenisKopi,
        prosesPengolahan: h.prosesPengolahan,
        levelRoasting: h.levelRoasting || "",
        totalBerat: 0,
        totalJumlah: 0,
      };
    }

    // Agregasi total berat dan jumlah
    stokMap[key].totalBerat += parseFloat(h.beratSaatIni || 0);
    stokMap[key].totalJumlah += parseInt(h.jumlah || 0);
  });

  // Konversi map ke array
  const stokArray = Object.values(stokMap);

  // Sort berdasarkan tipe produk dan kemasan
  stokArray.sort((a, b) => {
    if (a.tipeProduk !== b.tipeProduk) {
      return a.tipeProduk.localeCompare(b.tipeProduk);
    }
    if (a.jenisKopi !== b.jenisKopi) {
      return a.jenisKopi.localeCompare(b.jenisKopi);
    }
    return a.kemasan.localeCompare(b.kemasan);
  });

  return stokArray;
}

function updateFilterInputAppearance(input, mode) {
  if (!input) return;
  if (mode === "daily") {
    input.type = "date";
    input.placeholder = "";
    input.disabled = false;
    input.value = tableFilters[input.dataset.category]?.value || "";
  } else if (mode === "monthly") {
    input.type = "month";
    input.placeholder = "";
    input.disabled = false;
    input.value = tableFilters[input.dataset.category]?.value || "";
  } else if (mode === "yearly") {
    input.type = "number";
    input.min = "2000";
    input.max = "2100";
    input.placeholder = "Masukkan tahun";
    input.disabled = false;
    input.value = tableFilters[input.dataset.category]?.value || "";
  } else {
    input.value = "";
    input.disabled = true;
  }
}

function initializeTableFilters() {
  Object.entries(TABLE_FILTER_CONFIG).forEach(([category, config]) => {
    const modeSelect = document.getElementById(config.modeId);
    const valueInput = document.getElementById(config.valueId);
    const resetButton = document.getElementById(config.resetId);

    if (valueInput) {
      valueInput.dataset.category = category;
    }

    if (modeSelect && valueInput) {
      modeSelect.value = tableFilters[category].mode;
      updateFilterInputAppearance(valueInput, tableFilters[category].mode);
      modeSelect.addEventListener("change", (event) => {
        const mode = event.target.value;
        tableFilters[category].mode = mode;
        tableFilters[category].value = "";
        if (mode === "all" && valueInput) {
          valueInput.value = "";
        }
        updateFilterInputAppearance(valueInput, mode);
        renderTableByCategory(category);
      });
    }

    if (valueInput) {
      valueInput.addEventListener("change", (event) => {
        tableFilters[category].value = event.target.value;
        renderTableByCategory(category);
      });
    }

    if (resetButton) {
      resetButton.addEventListener("click", () => {
        tableFilters[category] = { mode: "all", value: "" };
        if (modeSelect) modeSelect.value = "all";
        if (valueInput) {
          valueInput.value = "";
          updateFilterInputAppearance(valueInput, "all");
        }
        renderTableByCategory(category);
      });
    }
  });
}

function renderTableByCategory(category) {
  const renderer = TABLE_RENDERERS[category];
  if (typeof renderer === "function") {
    renderer();
  }
}

function matchesDateFilter(dateValue, filter) {
  if (!filter || filter.mode === "all" || !filter.value) return true;
  const date = parseValidDate(dateValue);
  if (!date) return false;

  if (filter.mode === "daily") {
    const iso = date.toISOString().split("T")[0];
    return iso === filter.value;
  }
  if (filter.mode === "monthly") {
    const monthValue = `${date.getFullYear()}-${(date.getMonth() + 1)
      .toString()
      .padStart(2, "0")}`;
    return monthValue === filter.value;
  }
  if (filter.mode === "yearly") {
    return date.getFullYear().toString() === filter.value;
  }
  return true;
}

function applyTableFilter(category, data, dateGetter) {
  if (!Array.isArray(data)) return [];
  const filter = tableFilters[category];
  if (!filter || filter.mode === "all" || !filter.value) {
    return data;
  }
  return data.filter((item) => matchesDateFilter(dateGetter(item), filter));
}

function getFilteredDataForCategory(category) {
  switch (category) {
    case "bahan":
      return applyTableFilter("bahan", bahan, (item) => item.tanggalMasuk);
    case "produksi":
      return applyTableFilter(
        "produksi",
        produksi,
        (item) => item.tanggalMasuk
      );
    case "hasil":
      return applyTableFilter("hasil", hasilProduksi, (item) => item.tanggal);
    case "sanitasi":
      return applyTableFilter("sanitasi", sanitasi, (item) => item.tanggal);
    case "keuangan":
      return applyTableFilter("keuangan", keuangan, (item) => item.tanggal);
    case "stok":
      return aggregateStok(); // Stok tidak perlu filter karena tidak punya tanggal
    default:
      return [];
  }
}

function getFilterDescription(category) {
  const filter = tableFilters[category];
  if (!filter || filter.mode === "all" || !filter.value) {
    return "Periode: Semua";
  }
  if (filter.mode === "daily") {
    return `Periode: Harian (${formatDate(filter.value)})`;
  }
  if (filter.mode === "monthly") {
    const date = new Date(`${filter.value}-01`);
    return `Periode: Bulanan (${formatMonthYear(date)})`;
  }
  if (filter.mode === "yearly") {
    return `Periode: Tahunan (${filter.value})`;
  }
  return "Periode: Semua";
}

function exportRekap(category) {
  const config = LAPORAN_REKAP_CONFIG[category];
  if (!config) {
    alert("Konfigurasi rekap tidak ditemukan.");
    return;
  }

  const data = getFilteredDataForCategory(category);
  if (!data || data.length === 0) {
    alert("Tidak ada data untuk direkap berdasarkan filter saat ini.");
    return;
  }

  const filterInfo = getFilterDescription(category);
  const generatedAt = new Date().toLocaleString("id-ID");
  const columnsHeader = config.columns
    .map((column) => `<th>${column.label}</th>`)
    .join("");
  const rowsHtml = data
    .map((item, index) => {
      const cells = config.columns
        .map((column) => `<td>${column.value(item)}</td>`)
        .join("");
      return `<tr><td>${index + 1}</td>${cells}</tr>`;
    })
    .join("");
  const summaryHtml =
    config.averages && config.averages.length
      ? `
        <div class="summary">
          <h2>Ringkasan Rata-rata</h2>
          <ul>
            ${config.averages
              .map(
                (avg) =>
                  `<li><strong>${avg.label}:</strong> ${avg.compute(data)}</li>`
              )
              .join("")}
          </ul>
        </div>
      `
      : "";
  const extraSummaryHtml =
    typeof config.extraSummary === "function"
      ? `
        <div class="summary">
          <h2>Ringkasan Tambahan</h2>
          <ul>
            ${config
              .extraSummary(data)
              .map(
                (item) =>
                  `<li><strong>${item.label}:</strong> ${item.value}</li>`
              )
              .join("")}
          </ul>
        </div>
      `
      : "";

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="utf-8" />
        <title>${config.title}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 32px;
            color: #1f2937;
          }
          h1 {
            font-size: 22px;
            margin-bottom: 4px;
          }
          .meta {
            color: #6b7280;
            font-size: 12px;
            margin-bottom: 16px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
          }
          th, td {
            border: 1px solid #d1d5db;
            padding: 8px;
            vertical-align: top;
          }
          th {
            background-color: #f3f4f6;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-size: 11px;
          }
          tr:nth-child(even) td {
            background-color: #fafafa;
          }
          .summary {
            margin-top: 20px;
            padding: 12px 16px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
          }
          .summary h2 {
            margin: 0 0 8px 0;
            font-size: 14px;
            color: #0f172a;
          }
          .summary ul {
            list-style: none;
            padding: 0;
            margin: 0;
          }
          .summary li {
            font-size: 12px;
            color: #374151;
            margin-bottom: 4px;
          }
          .summary li strong {
            color: #111827;
          }
          .footer {
            margin-top: 24px;
            font-size: 11px;
            color: #6b7280;
          }
        </style>
      </head>
      <body>
        <h1>${config.title}</h1>
        <div class="meta">${filterInfo} • Total data: ${data.length}</div>
        <table>
          <thead>
            <tr>
              <th>No</th>
              ${columnsHeader}
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        ${summaryHtml}
        ${extraSummaryHtml}
        <div class="footer">
          Dicetak pada ${generatedAt} &ndash; Argopuro Walida System
        </div>
      </body>
    </html>
  `;

  const reportWindow = window.open("", "_blank");
  if (reportWindow) {
    reportWindow.document.write(htmlContent);
    reportWindow.document.close();
  } else {
    alert(
      "Pop-up diblokir oleh browser. Mohon izinkan pop-up untuk mengunduh rekap."
    );
  }
}

// Display tabel bahan
function renderWeeklyRecap() {
  const tableBody = document.getElementById("weeklyRecapTable");
  const emptyState = document.getElementById("weeklyRecapEmpty");
  const yearSelect = document.getElementById("weeklyRecapYear");
  if (!tableBody || !yearSelect) return;

  const availableYears = getAvailableYears();
  if (availableYears.length === 0) {
    selectedWeeklyYear = new Date().getFullYear();
  } else if (!availableYears.includes(selectedWeeklyYear)) {
    selectedWeeklyYear = availableYears[0];
  }

  const selectOptions =
    availableYears.length > 0
      ? availableYears
          .map((year) => `<option value="${year}">${year}</option>`)
          .join("")
      : `<option value="${selectedWeeklyYear}">${selectedWeeklyYear}</option>`;
  yearSelect.innerHTML = selectOptions;
  yearSelect.value = selectedWeeklyYear;

  if (!yearSelect.dataset.listenerAttached) {
    yearSelect.addEventListener("change", (event) => {
      selectedWeeklyYear = parseInt(event.target.value, 10);
      renderWeeklyRecap();
    });
    yearSelect.dataset.listenerAttached = "true";
  }

  const recapMap = {};
  const upsertWeekData = (date) => {
    if (!date || date.getFullYear() !== selectedWeeklyYear) return null;
    const weekNumber = getWeekNumber(date);
    const key = `${selectedWeeklyYear}-W${weekNumber}`;
    if (!recapMap[key]) {
      const { start, end } = getWeekBoundaries(date);
      recapMap[key] = {
        week: weekNumber,
        rangeStart: start,
        rangeEnd: end,
        totalBahanKg: 0,
        totalPengeluaran: 0,
        batchProduksi: 0,
        totalOutputKg: 0,
        totalPengemasanKg: 0,
      };
    }
    return recapMap[key];
  };

  bahan.forEach((item) => {
    const date = parseValidDate(item.tanggalMasuk);
    const weekData = upsertWeekData(date);
    if (!weekData) return;
    const jumlah =
      typeof item.jumlah === "number"
        ? item.jumlah
        : parseFloat(item.jumlah) || 0;
    const total =
      typeof item.totalPengeluaran === "number"
        ? item.totalPengeluaran
        : parseFloat(item.totalPengeluaran) || jumlah * (item.hargaPerKg || 0);
    weekData.totalBahanKg += jumlah;
    weekData.totalPengeluaran += total;
  });

  produksi.forEach((item) => {
    const dateMasuk = parseValidDate(item.tanggalMasuk);
    const wdMasuk = upsertWeekData(dateMasuk);
    if (wdMasuk) wdMasuk.batchProduksi += 1;

    if (isProduksiPengemasanBeratAkhir(item)) {
      const datePem =
        parseValidDate(item.tanggalSekarang) || parseValidDate(item.tanggalMasuk);
      const wdP = upsertWeekData(datePem);
      if (wdP) {
        wdP.totalPengemasanKg += parseFloat(item.beratAkhir) || 0;
      }
    }
  });

  hasilProduksi.forEach((item) => {
    const date = parseValidDate(item.tanggal);
    const weekData = upsertWeekData(date);
    if (!weekData) return;
    const berat =
      typeof item.beratSaatIni === "number"
        ? item.beratSaatIni
        : parseFloat(item.beratSaatIni) || 0;
    weekData.totalOutputKg += berat;
  });

  const rows = Object.values(recapMap).sort((a, b) => a.week - b.week);

  if (rows.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-4">
          Belum ada data mingguan pada tahun ${selectedWeeklyYear}.
        </td>
      </tr>
    `;
    emptyState?.classList.remove("d-none");
    return;
  }

  emptyState?.classList.add("d-none");

  tableBody.innerHTML = rows
    .map(
      (row) => `
      <tr>
        <td>W${row.week.toString().padStart(2, "0")}</td>
        <td>${formatShortDate(row.rangeStart, true)} - ${formatShortDate(
        row.rangeEnd,
        true
      )}</td>
        <td>${formatKgValue(row.totalBahanKg)}</td>
        <td>${
          row.totalPengeluaran ? formatCurrency(row.totalPengeluaran) : "-"
        }</td>
        <td>${row.batchProduksi}</td>
        <td>${formatKgValue(row.totalOutputKg)}</td>
        <td class="text-nowrap" title="Total bahan (kg) ÷ total berat akhir pengemasan (kg) minggu ini">${formatRandemenCell(
          row.totalBahanKg,
          row.totalPengemasanKg
        )}</td>
      </tr>
    `
    )
    .join("");
}

function renderBahanPriceStats() {
  const avgElement = document.getElementById("avgPriceSeason");
  const maxElement = document.getElementById("maxPriceSeason");
  const supplierElement = document.getElementById("maxPriceSupplier");
  const rangeElement = document.getElementById("seasonRangeLabel");
  const infoElement = document.getElementById("seasonInfoText");

  if (
    !avgElement ||
    !maxElement ||
    !supplierElement ||
    !rangeElement ||
    !infoElement
  ) {
    return;
  }

  if (bahan.length === 0) {
    avgElement.textContent = "-";
    maxElement.textContent = "-";
    supplierElement.textContent = "-";
    rangeElement.textContent = "Musim panen belum tersedia";
    infoElement.textContent = "Belum ada data pembelian bahan baku.";
    return;
  }

  const validEntries = bahan
    .map((item) => {
      const date = parseValidDate(item.tanggalMasuk);
      if (!date) return null;
      return {
        ...item,
        date,
        hargaPerKg:
          typeof item.hargaPerKg === "number"
            ? item.hargaPerKg
            : parseFloat(item.hargaPerKg) || 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.date - a.date);

  if (validEntries.length === 0) {
    avgElement.textContent = "-";
    maxElement.textContent = "-";
    supplierElement.textContent = "-";
    rangeElement.textContent = "Musim panen belum tersedia";
    infoElement.textContent = "Tanggal pembelian tidak valid.";
    return;
  }

  const latestDate = validEntries[0].date;
  const seasonEnd = new Date(latestDate);
  const seasonStart = new Date(latestDate);
  seasonStart.setMonth(seasonStart.getMonth() - 5);
  seasonStart.setHours(0, 0, 0, 0);

  const seasonEntries = validEntries.filter(
    (entry) => entry.date >= seasonStart && entry.date <= seasonEnd
  );

  if (seasonEntries.length === 0) {
    avgElement.textContent = "-";
    maxElement.textContent = "-";
    supplierElement.textContent = "-";
    rangeElement.textContent =
      "Tidak ada pembelian pada periode 6 bulan terakhir.";
    infoElement.textContent =
      "Data ditemukan, namun tidak ada transaksi dalam jendela musim panen (6 bulan).";
    return;
  }

  const totalHarga = seasonEntries.reduce(
    (sum, entry) => sum + entry.hargaPerKg,
    0
  );
  const avgHarga = totalHarga / seasonEntries.length;
  const maxEntry = seasonEntries.reduce((prev, curr) =>
    curr.hargaPerKg > prev.hargaPerKg ? curr : prev
  );

  avgElement.textContent = formatCurrency(Math.round(avgHarga));
  maxElement.textContent = formatCurrency(maxEntry.hargaPerKg);
  supplierElement.textContent = `${maxEntry.pemasok || "Tanpa pemasok"}${
    maxEntry.idBahan ? ` (${maxEntry.idBahan})` : ""
  }`;
  rangeElement.textContent = `${formatShortDate(
    seasonStart,
    true
  )} - ${formatShortDate(seasonEnd, true)} • ${seasonEntries.length} transaksi`;
  infoElement.textContent =
    "Musim panen diasumsikan mencakup 6 bulan terakhir dari pembelian terbaru.";
}

function renderProduksiTimeline() {
  const wrapper = document.getElementById("produksiTimelineWrapper");
  const emptyState = document.getElementById("produksiTimelineEmpty");
  if (!wrapper) return;

  if (produksi.length === 0) {
    wrapper.innerHTML = "";
    emptyState?.classList.remove("d-none");
    return;
  }

  emptyState?.classList.add("d-none");
  const sortedProduksi = [...produksi].sort((a, b) => {
    const dateA =
      parseValidDate(a.tanggalSekarang) || parseValidDate(a.tanggalMasuk);
    const dateB =
      parseValidDate(b.tanggalSekarang) || parseValidDate(b.tanggalMasuk);
    return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
  });

  wrapper.innerHTML = sortedProduksi
    .map((item, index) => buildTimelineItem(item, index === 0, index))
    .join("");
}

function buildTimelineItem(item, isFirst, index = 0) {
  const fallbackId = `${item.idProduksi || "produksi"}-${index}`;
  const timelineId = item.id ? `produksi-${item.id}` : fallbackId;
  const steps = buildTimelineSteps(item)
    .map(
      (step) => `
      <li class="timeline-item">
        <span class="timeline-bullet ${step.statusClass || ""}"></span>
        <div>
          <p class="text-muted small mb-1">${step.title}</p>
          <p class="fw-semibold mb-1">${step.subtitle}</p>
          <p class="text-muted small mb-0">${step.details}</p>
        </div>
      </li>
    `
    )
    .join("");

  return `
    <div class="accordion-item mb-3">
      <h2 class="accordion-header" id="heading-${timelineId}">
        <button
          class="accordion-button ${isFirst ? "" : "collapsed"}"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#collapse-${timelineId}"
          aria-expanded="${isFirst ? "true" : "false"}"
          aria-controls="collapse-${timelineId}"
        >
          <div class="w-100 d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2">
            <div class="d-flex align-items-center gap-3">
              <span class="badge bg-primary-subtle text-primary fw-semibold"
                >${item.idProduksi || "ID Tidak tersedia"}</span
              >
              <span class="badge ${(window.getStatusTahapanBadgeClass || (() => 'bg-secondary'))(item.statusTahapan)}"
                >${item.statusTahapan || "-"}</span
              >
            </div>
            <small class="text-muted">
              ${formatDate(item.tanggalMasuk)} - ${formatDate(
    item.tanggalSekarang
  )}
            </small>
          </div>
        </button>
      </h2>
      <div
        id="collapse-${timelineId}"
        class="accordion-collapse collapse ${isFirst ? "show" : ""}"
        aria-labelledby="heading-${timelineId}"
        data-bs-parent="#produksiTimelineWrapper"
      >
        <div class="accordion-body">
          <ul class="timeline">
            ${steps}
          </ul>
        </div>
      </div>
    </div>
  `;
}

function buildTimelineSteps(item) {
  const steps = [];
  const beratAwalValue =
    typeof item.beratAwal === "number"
      ? item.beratAwal
      : parseFloat(item.beratAwal);
  const jumlahKemasanValue =
    typeof item.jumlahKemasan === "number"
      ? item.jumlahKemasan
      : parseFloat(item.jumlahKemasan);

  steps.push({
    title: "Penerimaan Bahan",
    subtitle: formatDate(item.tanggalMasuk),
    details:
      [
      Number.isFinite(beratAwalValue)
        ? `${beratAwalValue.toLocaleString("id-ID")} kg`
        : null,
      item.varietas || null,
    ]
      .filter(Boolean)
      .join(" • ") || "Data belum lengkap",
    statusClass: "success",
  });

  steps.push({
    title: "Proses Pengolahan",
    subtitle: item.prosesPengolahan || "-",
    details: item.kadarAir
      ? `Kadar air ${item.kadarAir}%`
      : "Kadar air belum diinput",
  });

  steps.push({
    title: "Tahap Terakhir",
    subtitle: item.statusTahapan || "-",
    details: `Pemutakhiran ${
      formatDate(item.tanggalSekarang) || "belum tersedia"
    }`,
    statusClass: "warning",
  });

  if (item.statusTahapan === "Pengemasan" && Number.isFinite(beratAwalValue)) {
    const beratAkhirValue =
      typeof item.beratAkhir === "number"
        ? item.beratAkhir
        : parseFloat(item.beratAkhir);
    steps.push({
      title: "Pengemasan",
      subtitle: formatDate(item.tanggalSekarang),
      details: Number.isFinite(beratAkhirValue)
        ? `Berat akhir: ${beratAkhirValue.toLocaleString("id-ID")} kg`
        : "Berat akhir belum diinput",
    });
  }

  if (item.haccp) {
    const checklist = [];
    if (item.haccp.bebasBendaAsing) checklist.push("Bebas benda asing");
    if (item.haccp.bebasHamaJamur) checklist.push("Bebas hama & jamur");
    if (item.haccp.kondisiBaik) checklist.push("Kondisi wadah baik");
    steps.push({
      title: "HACCP Check",
      subtitle: "Kontrol Mutu",
      details:
        checklist.join(", ") || "Checklist HACCP belum dipenuhi seluruhnya.",
    });
  }

  return steps;
}

function displayBahan() {
  // Reload data dari localStorage untuk memastikan data terbaru
  bahan = JSON.parse(localStorage.getItem("bahan")) || [];

  const tbody = document.getElementById("tableBahan");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (bahan.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="text-center text-muted py-4">
          <i class="bi bi-inbox fs-1 d-block mb-2"></i>
          Tidak ada data bahan
        </td>
      </tr>
    `;
    return;
  }

  const filteredBahan = applyTableFilter(
    "bahan",
    bahan,
    (item) => item.tanggalMasuk
  );

  if (filteredBahan.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="text-center text-muted py-4">
          <i class="bi bi-funnel d-block mb-2"></i>
          Tidak ada data sesuai filter.
        </td>
      </tr>
    `;
    return;
  }

  // Gunakan innerHTML dengan map.join() seperti di kelola_bahan.js
  tbody.innerHTML = filteredBahan
    .map((item, index) => {
      return `
      <tr>
      <td>${index + 1}</td>
      <td>${item.idBahan || "-"}</td>
      <td>${item.pemasok || "-"}</td>
      <td>${item.jumlah ? item.jumlah.toLocaleString("id-ID") : "-"} kg</td>
      <td>${item.varietas || "-"}</td>
      <td>${item.hargaPerKg ? formatCurrency(item.hargaPerKg) : "-"}</td>
        <td>${
          item.totalPengeluaran ? formatCurrency(item.totalPengeluaran) : "-"
        }</td>
      <td><span class="badge ${(window.getJenisKopiBadgeClass || (() => 'bg-secondary'))(item.jenisKopi)}">${item.jenisKopi || "-"}</span></td>
      <td>${formatDate(item.tanggalMasuk)}</td>
      <td><span class="badge ${(window.getKualitasBadgeClass || (() => 'bg-secondary'))(item.kualitas)}">${item.kualitas || "-"}</span></td>
      <td class="text-center">
          <button class="btn btn-sm btn-primary" onclick="generateBahanPDF(${
            item.id
          })">
          <i class="bi bi-file-pdf me-1"></i>Lihat Detail
        </button>
      </td>
      </tr>
    `;
    })
    .join("");
}

// Display tabel produksi
function displayProduksi() {
  // Reload data dari localStorage untuk memastikan data terbaru
  produksi = JSON.parse(localStorage.getItem("produksi")) || [];

  const tbody = document.getElementById("tableProduksi");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (produksi.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" class="text-center text-muted py-4">
          <i class="bi bi-inbox fs-1 d-block mb-2"></i>
          Tidak ada data produksi
        </td>
      </tr>
    `;
    return;
  }

  const filteredProduksi = applyTableFilter(
    "produksi",
    produksi,
    (item) => item.tanggalMasuk
  );

  if (filteredProduksi.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" class="text-center text-muted py-4">
          <i class="bi bi-funnel d-block mb-2"></i>
          Tidak ada data sesuai filter.
        </td>
      </tr>
    `;
    return;
  }

  // Gunakan innerHTML dengan map.join() seperti di kelola_produksi.js
  tbody.innerHTML = filteredProduksi
    .map((item, index) => {
      return `
      <tr>
      <td>${index + 1}</td>
      <td>${item.idProduksi || "-"}</td>
      <td><span class="badge bg-info">${item.idBahan || "-"}</span></td>
        <td>${
          item.beratAwal ? item.beratAwal.toLocaleString("id-ID") : "-"
        } kg</td>
        <td>${
          item.beratAkhir ? item.beratAkhir.toLocaleString("id-ID") : "-"
        } kg</td>
      <td><span class="badge ${(window.getProsesPengolahanBadgeClass || (() => 'bg-secondary'))(item.prosesPengolahan)}">${item.prosesPengolahan || "-"}</span></td>
      <td>${item.kadarAir ? item.kadarAir + "%" : "-"}</td>
      <td>${item.varietas || "-"}</td>
      <td>${formatDate(item.tanggalMasuk)}</td>
      <td>${formatDate(item.tanggalSekarang)}</td>
        <td><span class="badge ${(window.getStatusTahapanBadgeClass || (() => 'bg-secondary'))(item.statusTahapan)}">${
          item.statusTahapan || "-"
        }</span></td>
      <td class="text-center">
          <button class="btn btn-sm btn-primary" onclick="generateProduksiPDF(${
            item.id
          })">
          <i class="bi bi-file-pdf me-1"></i>Lihat Detail
        </button>
      </td>
      </tr>
    `;
    })
    .join("");
}

// Display tabel hasil produksi
function displayHasilProduksi() {
  // Reload data dari localStorage untuk memastikan data terbaru
  hasilProduksi = JSON.parse(localStorage.getItem("hasilProduksi")) || [];

  const tbody = document.getElementById("tableHasilProduksi");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (hasilProduksi.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" class="text-center text-muted py-4">
          <i class="bi bi-inbox fs-1 d-block mb-2"></i>
          Tidak ada data hasil produksi
        </td>
      </tr>
    `;
    return;
  }

  const filteredHasil = applyTableFilter(
    "hasil",
    hasilProduksi,
    (item) => item.tanggal
  );

  if (filteredHasil.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" class="text-center text-muted py-4">
          <i class="bi bi-funnel d-block mb-2"></i>
          Tidak ada data sesuai filter.
        </td>
      </tr>
    `;
    return;
  }

  // Gunakan innerHTML dengan map.join() seperti di kelola_bahan.js
  tbody.innerHTML = filteredHasil
    .map((item, index) => {
      return `
      <tr>
      <td>${index + 1}</td>
        <td><span class="badge bg-secondary">${
          item.idProduksi || "-"
        }</span></td>
      <td><span class="badge bg-info">${item.idBahan || "-"}</span></td>
      <td>${item.tipeProduk || "-"}</td>
      <td>${item.kemasan || "-"}</td>
      <td><span class="badge ${(window.getJenisKopiBadgeClass || (() => 'bg-secondary'))(item.jenisKopi)}">${item.jenisKopi || "-"}</span></td>
      <td><span class="badge ${(window.getProsesPengolahanBadgeClass || (() => 'bg-secondary'))(item.prosesPengolahan)}">${item.prosesPengolahan || "-"}</span></td>
      <td>${item.levelRoasting || "-"}</td>
      <td>${formatDate(item.tanggal)}</td>
        <td>${
          item.beratSaatIni ? item.beratSaatIni.toLocaleString("id-ID") : "-"
        } kg</td>
      <td>${item.jumlah ? item.jumlah.toLocaleString("id-ID") : "-"}</td>
      <td class="text-center">
          <button class="btn btn-sm btn-primary" onclick="generateHasilProduksiPDF(${
            item.id
          })">
          <i class="bi bi-file-pdf me-1"></i>Lihat Detail
        </button>
      </td>
      </tr>
    `;
    })
    .join("");
}

// Display tabel sanitasi
function displaySanitasi() {
  // Reload data dari localStorage untuk memastikan data terbaru
  sanitasi = JSON.parse(localStorage.getItem("sanitasi")) || [];

  const tbody = document.getElementById("tableSanitasi");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (sanitasi.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-4">
          <i class="bi bi-inbox fs-1 d-block mb-2"></i>
          Tidak ada data sanitasi
        </td>
      </tr>
    `;
    return;
  }

  const filteredSanitasi = applyTableFilter(
    "sanitasi",
    sanitasi,
    (item) => item.tanggal
  );

  if (filteredSanitasi.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-4">
          <i class="bi bi-funnel d-block mb-2"></i>
          Tidak ada data sesuai filter.
        </td>
      </tr>
    `;
    return;
  }

  // Sort berdasarkan tanggal dan waktu (terbaru dulu)
  const sortedSanitasi = [...filteredSanitasi].sort((a, b) => {
    const dateA = new Date(`${a.tanggal} ${a.waktu || "00:00"}`);
    const dateB = new Date(`${b.tanggal} ${b.waktu || "00:00"}`);
    return dateB - dateA;
  });

  // Gunakan innerHTML dengan map.join()
  tbody.innerHTML = sortedSanitasi
    .map((item, index) => {
      const statusBadge =
        item.status === "Complete"
      ? '<span class="badge bg-success">Complete</span>'
      : '<span class="badge bg-warning">Uncomplete</span>';
    
    // Format tanggal dan waktu
    const tanggalWaktu = item.waktu 
      ? `${formatDate(item.tanggal)} ${item.waktu}`
      : formatDate(item.tanggal);
    
      return `
      <tr>
      <td>${index + 1}</td>
      <td>${tanggalWaktu}</td>
      <td>${tipeSanitasiNames[item.tipe] || item.tipe || "-"}</td>
      <td>${item.namaPetugas || "-"}</td>
      <td>${statusBadge}</td>
      <td>${getChecklistSummary(item.checklist) || "-"}</td>
      <td class="text-center">
          <button class="btn btn-sm btn-primary" onclick="generateSanitasiPDF(${
            item.id
          })">
          <i class="bi bi-file-pdf me-1"></i>Lihat Detail
        </button>
      </td>
      </tr>
    `;
    })
    .join("");
}

// Fungsi untuk mendapatkan summary checklist
function getChecklistSummary(checklist) {
  if (!checklist) return "-";
  
  if (typeof checklist === "object" && !Array.isArray(checklist)) {
    // Checklist sebagai object
    const items = Object.keys(checklist);
    const checked = items.filter((key) => checklist[key] === true).length;
    return `${checked}/${items.length} checklist selesai`;
  } else if (Array.isArray(checklist)) {
    // Checklist sebagai array
    const checked = checklist.filter((c) => c.checked === true).length;
    return `${checked}/${checklist.length} checklist selesai`;
  }
  
  return "-";
}

// Generate PDF untuk Bahan
function generateBahanPDF(id) {
  // Reload data dari localStorage untuk memastikan data terbaru
  bahan = JSON.parse(localStorage.getItem("bahan")) || [];
  produksi = JSON.parse(localStorage.getItem("produksi")) || [];

  const item = bahan.find((b) => b.id === id);
  if (!item) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Header
  doc.setFontSize(18);
  doc.text("LAPORAN DETAIL BAHAN MASUK", 105, 20, { align: "center" });
  doc.setFontSize(12);
  doc.text("Argopuro Walida", 105, 30, { align: "center" });
  doc.line(20, 35, 190, 35);

  // Content
  let y = 50;
  doc.setFontSize(11);
  doc.setFont(undefined, "bold");
  doc.text("ID Bahan:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(item.idBahan || "-", 60, y);

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Pemasok:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(item.pemasok || "-", 60, y);

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Jumlah:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(
    `${item.jumlah ? item.jumlah.toLocaleString("id-ID") : "-"} kg`,
    60,
    y
  );

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Varietas:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(item.varietas || "-", 60, y);

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Harga per Kg:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(item.hargaPerKg ? formatCurrency(item.hargaPerKg) : "-", 60, y);

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Total Pengeluaran:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(
    item.totalPengeluaran ? formatCurrency(item.totalPengeluaran) : "-",
    60,
    y
  );

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Jenis Kopi:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(item.jenisKopi || "-", 60, y);

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Tanggal Masuk:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(formatDate(item.tanggalMasuk), 60, y);

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Kualitas:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(item.kualitas || "-", 60, y);

  // === DETAIL ALUR PRODUKSI ===
  // Cari semua produksi yang terkait dengan bahan ini
  const produksiTerait = produksi.filter((p) => p.idBahan === item.idBahan);

  if (produksiTerait.length > 0) {
    y += 15;
    if (y > 220) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text("DETAIL ALUR PRODUKSI", 20, y);
    y += 8;
    doc.line(20, y, 190, y);
    y += 10;
    doc.setFontSize(10);

    produksiTerait.forEach((prod, prodIndex) => {
      if (y > 230) {
        doc.addPage();
        y = 20;
      }

      // Header untuk setiap produksi
      doc.setFont(undefined, "bold");
      doc.setFontSize(11);
      doc.text(`Produksi: ${prod.idProduksi || "-"}`, 20, y);
      y += 8;
      doc.setFontSize(10);

      // Tampilkan history tahapan jika ada
      if (prod.historyTahapan && prod.historyTahapan.length > 0) {
        prod.historyTahapan.forEach((history, index) => {
          if (y > 250) {
            doc.addPage();
            y = 20;
          }
          doc.setFont(undefined, "bold");
          doc.text(`  ${index + 1}. ${history.statusTahapan || "-"}`, 25, y);
          y += 7;
          doc.setFont(undefined, "normal");
          doc.text(`     Tanggal: ${formatDate(history.tanggal)}`, 30, y);
          y += 7;
          if (history.beratAwal) {
            doc.text(
              `     Berat Awal: ${history.beratAwal.toLocaleString(
                "id-ID"
              )} kg`,
              30,
              y
            );
            y += 7;
          }
          if (history.beratAkhir) {
            doc.text(
              `     Berat Akhir: ${history.beratAkhir.toLocaleString(
                "id-ID"
              )} kg`,
              30,
              y
            );
            y += 7;
          }
          if (history.kadarAir) {
            doc.text(`     Kadar Air: ${history.kadarAir}%`, 30, y);
            y += 7;
          }
          y += 3;
        });
      }

      // Tambahkan status saat ini
      if (y > 250) {
        doc.addPage();
        y = 20;
      }
      doc.setFont(undefined, "bold");
      const historyCount = prod.historyTahapan ? prod.historyTahapan.length : 0;
      doc.text(
        `  ${historyCount + 1}. ${prod.statusTahapan || "-"} (Status Saat Ini)`,
        25,
        y
      );
      y += 7;
      doc.setFont(undefined, "normal");
      doc.text(`     Tanggal: ${formatDate(prod.tanggalSekarang)}`, 30, y);
      y += 7;
      if (prod.beratAwal) {
        doc.text(
          `     Berat Awal: ${prod.beratAwal.toLocaleString("id-ID")} kg`,
          30,
          y
        );
        y += 7;
      }
      if (prod.beratAkhir) {
        doc.text(
          `     Berat Akhir: ${prod.beratAkhir.toLocaleString("id-ID")} kg`,
          30,
          y
        );
        y += 7;
      }
      if (prod.kadarAir) {
        doc.text(`     Kadar Air: ${prod.kadarAir}%`, 30, y);
        y += 7;
      }

      // Spasi antar produksi
      if (prodIndex < produksiTerait.length - 1) {
        y += 10;
        doc.line(20, y, 190, y);
        y += 10;
      }
    });
  }

  // Footer
  y = 270;
  doc.line(20, y, 190, y);
  doc.setFontSize(10);
  doc.text(`Dicetak pada: ${new Date().toLocaleString("id-ID")}`, 20, y + 10);

  // Open in new tab
  const pdfBlob = doc.output("blob");
  const pdfUrl = URL.createObjectURL(pdfBlob);
  window.open(pdfUrl, "_blank");
}

// Generate PDF untuk Produksi
function generateProduksiPDF(id) {
  // Reload data dari localStorage untuk memastikan data terbaru
  produksi = JSON.parse(localStorage.getItem("produksi")) || [];

  const item = produksi.find((p) => p.id === id);
  if (!item) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Header
  doc.setFontSize(18);
  doc.text("LAPORAN DETAIL PRODUKSI", 105, 20, { align: "center" });
  doc.setFontSize(12);
  doc.text("Argopuro Walida", 105, 30, { align: "center" });
  doc.line(20, 35, 190, 35);

  // Content
  let y = 50;
  doc.setFontSize(11);
  doc.setFont(undefined, "bold");
  doc.text("ID Produksi:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(item.idProduksi || "-", 60, y);

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Berat Awal:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(
    `${item.beratAwal ? item.beratAwal.toLocaleString("id-ID") : "-"} kg`,
    60,
    y
  );

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Berat Akhir:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(
    `${item.beratAkhir ? item.beratAkhir.toLocaleString("id-ID") : "-"} kg`,
    60,
    y
  );

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Proses Pengolahan:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(item.prosesPengolahan || "-", 60, y);

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Kadar Air:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(`${item.kadarAir ? item.kadarAir + "%" : "-"}`, 60, y);

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Varietas:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(item.varietas || "-", 60, y);

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Tanggal Masuk:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(formatDate(item.tanggalMasuk), 60, y);

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Tanggal Sekarang:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(formatDate(item.tanggalSekarang), 60, y);

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Status Tahapan:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(item.statusTahapan || "-", 60, y);

  if (item.jenisProduk) {
    y += 10;
    doc.setFont(undefined, "bold");
    doc.text("Jenis Produk:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(item.jenisProduk, 60, y);
  }

  if (item.ukuranKemasan) {
    y += 10;
    doc.setFont(undefined, "bold");
    doc.text("Ukuran Kemasan:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(item.ukuranKemasan, 60, y);
  }

  if (item.jumlahKemasan) {
    y += 10;
    doc.setFont(undefined, "bold");
    doc.text("Jumlah Kemasan:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(item.jumlahKemasan.toString(), 60, y);
  }

  // === DETAIL ALUR PRODUKSI ===
  if (item.historyTahapan && item.historyTahapan.length > 0) {
    y += 15;
    if (y > 220) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text("DETAIL ALUR PRODUKSI", 20, y);
    y += 8;
    doc.line(20, y, 190, y);
    y += 10;
    doc.setFontSize(10);

    item.historyTahapan.forEach((history, index) => {
      if (y > 250) {
        doc.addPage();
        y = 20;
      }
      doc.setFont(undefined, "bold");
      doc.text(`${index + 1}. ${history.statusTahapan || "-"}`, 20, y);
      y += 7;
      doc.setFont(undefined, "normal");
      doc.text(`   Tanggal: ${formatDate(history.tanggal)}`, 25, y);
      y += 7;
      if (history.beratAwal) {
        doc.text(
          `   Berat Awal: ${history.beratAwal.toLocaleString("id-ID")} kg`,
          25,
          y
        );
        y += 7;
      }
      if (history.beratAkhir) {
        doc.text(
          `   Berat Akhir: ${history.beratAkhir.toLocaleString("id-ID")} kg`,
          25,
          y
        );
        y += 7;
      }
      if (history.kadarAir) {
        doc.text(`   Kadar Air: ${history.kadarAir}%`, 25, y);
        y += 7;
      }
      y += 5;
    });

    // Tambahkan status saat ini ke history
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    doc.setFont(undefined, "bold");
    doc.text(
      `${item.historyTahapan.length + 1}. ${
        item.statusTahapan || "-"
      } (Status Saat Ini)`,
      20,
      y
    );
    y += 7;
    doc.setFont(undefined, "normal");
    doc.text(`   Tanggal: ${formatDate(item.tanggalSekarang)}`, 25, y);
    y += 7;
    if (item.beratAwal) {
      doc.text(
        `   Berat Awal: ${item.beratAwal.toLocaleString("id-ID")} kg`,
        25,
        y
      );
      y += 7;
    }
    if (item.beratAkhir) {
      doc.text(
        `   Berat Akhir: ${item.beratAkhir.toLocaleString("id-ID")} kg`,
        25,
        y
      );
      y += 7;
    }
    if (item.kadarAir) {
      doc.text(`   Kadar Air: ${item.kadarAir}%`, 25, y);
      y += 7;
    }
  } else {
    // Jika tidak ada history, tampilkan status saat ini saja
    y += 15;
    if (y > 220) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text("DETAIL ALUR PRODUKSI", 20, y);
    y += 8;
    doc.line(20, y, 190, y);
    y += 10;
    doc.setFontSize(10);
    doc.setFont(undefined, "bold");
    doc.text(`1. ${item.statusTahapan || "-"} (Status Saat Ini)`, 20, y);
    y += 7;
    doc.setFont(undefined, "normal");
    doc.text(`   Tanggal: ${formatDate(item.tanggalSekarang)}`, 25, y);
    y += 7;
    if (item.beratAwal) {
      doc.text(
        `   Berat Awal: ${item.beratAwal.toLocaleString("id-ID")} kg`,
        25,
        y
      );
      y += 7;
    }
    if (item.beratAkhir) {
      doc.text(
        `   Berat Akhir: ${item.beratAkhir.toLocaleString("id-ID")} kg`,
        25,
        y
      );
      y += 7;
    }
    if (item.kadarAir) {
      doc.text(`   Kadar Air: ${item.kadarAir}%`, 25, y);
      y += 7;
    }
  }

  // Footer
  y = 270;
  doc.line(20, y, 190, y);
  doc.setFontSize(10);
  doc.text(`Dicetak pada: ${new Date().toLocaleString("id-ID")}`, 20, y + 10);

  // Open in new tab
  const pdfBlob = doc.output("blob");
  const pdfUrl = URL.createObjectURL(pdfBlob);
  window.open(pdfUrl, "_blank");
}

// Generate PDF untuk Hasil Produksi
function generateHasilProduksiPDF(id) {
  // Reload data dari localStorage untuk memastikan data terbaru
  hasilProduksi = JSON.parse(localStorage.getItem("hasilProduksi")) || [];
  produksi = JSON.parse(localStorage.getItem("produksi")) || [];
  bahan = JSON.parse(localStorage.getItem("bahan")) || [];

  const item = hasilProduksi.find((h) => h.id === id);
  if (!item) return;

  // Cari data produksi dan bahan terkait
  const produksiData = item.idProduksi
    ? produksi.find((p) => p.idProduksi === item.idProduksi)
    : null;
  const bahanData = item.idBahan
    ? bahan.find((b) => b.idBahan === item.idBahan)
    : null;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Header
  doc.setFontSize(18);
  doc.text("LAPORAN DETAIL HASIL PRODUKSI", 105, 20, { align: "center" });
  doc.setFontSize(12);
  doc.text("Argopuro Walida", 105, 30, { align: "center" });
  doc.line(20, 35, 190, 35);

  // Content
  let y = 50;
  doc.setFontSize(11);
  
  // === DATA HASIL PRODUKSI ===
  doc.setFontSize(12);
  doc.setFont(undefined, "bold");
  doc.text("DATA HASIL PRODUKSI", 20, y);
  y += 8;
  doc.line(20, y, 190, y);
  y += 10;
  doc.setFontSize(11);

    doc.setFont(undefined, "bold");
    doc.text("ID Produksi:", 20, y);
    doc.setFont(undefined, "normal");
  doc.text(item.idProduksi || "-", 60, y);
    y += 10;
  
  doc.setFont(undefined, "bold");
  doc.text("Tipe Produk:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(item.tipeProduk || "-", 60, y);

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Kemasan:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(item.kemasan || "-", 60, y);

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Jenis Kopi:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(item.jenisKopi || "-", 60, y);

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Proses Pengolahan:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(item.prosesPengolahan || "-", 60, y);

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Level Roasting:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(item.levelRoasting || "-", 60, y);

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Berat yang Diproses:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(
    `${item.beratSaatIni ? item.beratSaatIni.toLocaleString("id-ID") : "-"} kg`,
    60,
    y
  );

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Jumlah Kemasan:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(item.jumlah ? item.jumlah.toLocaleString("id-ID") : "-", 60, y);

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Tanggal:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(formatDate(item.tanggal), 60, y);

  // === DATA BAHAN MASUK ===
  if (bahanData) {
    y += 15;
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text("DATA BAHAN MASUK", 20, y);
    y += 8;
    doc.line(20, y, 190, y);
  y += 10;
    doc.setFontSize(11);

    doc.setFont(undefined, "bold");
    doc.text("ID Bahan:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(bahanData.idBahan || "-", 60, y);
    y += 10;

    doc.setFont(undefined, "bold");
    doc.text("Pemasok:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(bahanData.pemasok || "-", 60, y);
    y += 10;

    doc.setFont(undefined, "bold");
    doc.text("Jumlah:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(
      `${bahanData.jumlah ? bahanData.jumlah.toLocaleString("id-ID") : "-"} kg`,
      60,
      y
    );
    y += 10;

    doc.setFont(undefined, "bold");
    doc.text("Varietas:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(bahanData.varietas || "-", 60, y);
    y += 10;

    doc.setFont(undefined, "bold");
    doc.text("Harga per Kg:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(
      bahanData.hargaPerKg ? formatCurrency(bahanData.hargaPerKg) : "-",
      60,
      y
    );
    y += 10;

    doc.setFont(undefined, "bold");
    doc.text("Total Pengeluaran:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(
      bahanData.totalPengeluaran
        ? formatCurrency(bahanData.totalPengeluaran)
        : "-",
      60,
      y
    );
    y += 10;

    doc.setFont(undefined, "bold");
    doc.text("Jenis Kopi:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(bahanData.jenisKopi || "-", 60, y);
    y += 10;

    doc.setFont(undefined, "bold");
    doc.text("Tanggal Masuk:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(formatDate(bahanData.tanggalMasuk), 60, y);
    y += 10;

    doc.setFont(undefined, "bold");
    doc.text("Kualitas:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(bahanData.kualitas || "-", 60, y);
  }

  // === DATA PRODUKSI ===
  if (produksiData) {
    y += 15;
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text("DATA PRODUKSI", 20, y);
    y += 8;
    doc.line(20, y, 190, y);
    y += 10;
    doc.setFontSize(11);

    doc.setFont(undefined, "bold");
    doc.text("ID Produksi:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(produksiData.idProduksi || "-", 60, y);
    y += 10;

    doc.setFont(undefined, "bold");
    doc.text("ID Bahan:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(produksiData.idBahan || "-", 60, y);
    y += 10;

    doc.setFont(undefined, "bold");
    doc.text("Berat Awal:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(
      `${
        produksiData.beratAwal
          ? produksiData.beratAwal.toLocaleString("id-ID")
          : "-"
      } kg`,
      60,
      y
    );
    y += 10;

  doc.setFont(undefined, "bold");
  doc.text("Berat Akhir:", 20, y);
  doc.setFont(undefined, "normal");
    doc.text(
      `${
        produksiData.beratAkhir
          ? produksiData.beratAkhir.toLocaleString("id-ID")
          : "-"
      } kg`,
      60,
      y
    );
    y += 10;

    doc.setFont(undefined, "bold");
    doc.text("Proses Pengolahan:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(produksiData.prosesPengolahan || "-", 60, y);
    y += 10;

    doc.setFont(undefined, "bold");
    doc.text("Kadar Air:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(
      `${produksiData.kadarAir ? produksiData.kadarAir + "%" : "-"}`,
      60,
      y
    );
    y += 10;

    doc.setFont(undefined, "bold");
    doc.text("Varietas:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(produksiData.varietas || "-", 60, y);
    y += 10;

    doc.setFont(undefined, "bold");
    doc.text("Tanggal Masuk:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(formatDate(produksiData.tanggalMasuk), 60, y);
    y += 10;

    doc.setFont(undefined, "bold");
    doc.text("Tanggal Sekarang:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(formatDate(produksiData.tanggalSekarang), 60, y);
    y += 10;

    doc.setFont(undefined, "bold");
    doc.text("Status Tahapan Saat Ini:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(produksiData.statusTahapan || "-", 60, y);

    // === HISTORY TAHAPAN PRODUKSI ===
    if (produksiData.historyTahapan && produksiData.historyTahapan.length > 0) {
      y += 15;
      if (y > 220) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(12);
      doc.setFont(undefined, "bold");
      doc.text("ALUR PROSES TAHAPAN PRODUKSI", 20, y);
      y += 8;
      doc.line(20, y, 190, y);
      y += 10;
      doc.setFontSize(10);

      produksiData.historyTahapan.forEach((history, index) => {
        if (y > 250) {
          doc.addPage();
          y = 20;
        }
        doc.setFont(undefined, "bold");
        doc.text(`${index + 1}. ${history.statusTahapan || "-"}`, 20, y);
        y += 7;
        doc.setFont(undefined, "normal");
        doc.text(`   Tanggal: ${formatDate(history.tanggal)}`, 25, y);
        y += 7;
        if (history.beratAwal) {
          doc.text(
            `   Berat Awal: ${history.beratAwal.toLocaleString("id-ID")} kg`,
            25,
            y
          );
          y += 7;
        }
        if (history.beratAkhir) {
          doc.text(
            `   Berat Akhir: ${history.beratAkhir.toLocaleString("id-ID")} kg`,
            25,
            y
          );
          y += 7;
        }
        if (history.kadarAir) {
          doc.text(`   Kadar Air: ${history.kadarAir}%`, 25, y);
          y += 7;
        }
        y += 5;
      });

      // Tambahkan status saat ini ke history
      if (y > 250) {
        doc.addPage();
        y = 20;
      }
      doc.setFont(undefined, "bold");
      doc.text(
        `${produksiData.historyTahapan.length + 1}. ${
          produksiData.statusTahapan || "-"
        } (Status Saat Ini)`,
        20,
        y
      );
      y += 7;
      doc.setFont(undefined, "normal");
      doc.text(
        `   Tanggal: ${formatDate(produksiData.tanggalSekarang)}`,
        25,
        y
      );
      y += 7;
      if (produksiData.beratAwal) {
        doc.text(
          `   Berat Awal: ${produksiData.beratAwal.toLocaleString("id-ID")} kg`,
          25,
          y
        );
        y += 7;
      }
      if (produksiData.beratAkhir) {
        doc.text(
          `   Berat Akhir: ${produksiData.beratAkhir.toLocaleString(
            "id-ID"
          )} kg`,
          25,
          y
        );
        y += 7;
      }
      if (produksiData.kadarAir) {
        doc.text(`   Kadar Air: ${produksiData.kadarAir}%`, 25, y);
        y += 7;
      }
    }
  }

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Jumlah:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(item.jumlah ? item.jumlah.toLocaleString("id-ID") : "-", 60, y);

  // Footer
  y = 270;
  doc.line(20, y, 190, y);
  doc.setFontSize(10);
  doc.text(`Dicetak pada: ${new Date().toLocaleString("id-ID")}`, 20, y + 10);

  // Open in new tab
  const pdfBlob = doc.output("blob");
  const pdfUrl = URL.createObjectURL(pdfBlob);
  window.open(pdfUrl, "_blank");
}

// Generate PDF untuk Sanitasi
function generateSanitasiPDF(id) {
  const item = sanitasi.find((s) => s.id === id);
  if (!item) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Header
  doc.setFontSize(18);
  doc.text("LAPORAN DETAIL SANITASI", 105, 20, { align: "center" });
  doc.setFontSize(12);
  doc.text("Argopuro Walida", 105, 30, { align: "center" });
  doc.line(20, 35, 190, 35);

  // Content
  let y = 50;
  doc.setFontSize(11);
  doc.setFont(undefined, "bold");
  doc.text("Tanggal:", 20, y);
  doc.setFont(undefined, "normal");
  const tanggalWaktu = item.waktu 
    ? `${formatDate(item.tanggal)} ${item.waktu}`
    : formatDate(item.tanggal);
  doc.text(tanggalWaktu, 60, y);

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Tipe Sanitasi:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(tipeSanitasiNames[item.tipe] || item.tipe || "-", 60, y);

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Nama Petugas:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(item.namaPetugas || "-", 60, y);

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Status:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(item.status || "-", 60, y);

  // Checklist
  if (item.checklist) {
    y += 15;
    doc.setFont(undefined, "bold");
    doc.text("Checklist:", 20, y);
    y += 10;
    doc.setFont(undefined, "normal");
    
    if (typeof item.checklist === "object" && !Array.isArray(item.checklist)) {
      // Checklist sebagai object (format dari kelola_sanitasi.js)
      Object.keys(item.checklist).forEach((key) => {
        const checked = item.checklist[key];
        const checkText = `${checked ? "✓" : "✗"} ${key}`;
        doc.text(checkText, 25, y);
        y += 7;
      });
    } else if (Array.isArray(item.checklist)) {
      // Checklist sebagai array
      item.checklist.forEach((check) => {
        const checkText = `${check.checked ? "✓" : "✗"} ${check.item || check}`;
        doc.text(checkText, 25, y);
        y += 7;
      });
    }
  }

  // Footer
  y = 270;
  doc.line(20, y, 190, y);
  doc.setFontSize(10);
  doc.text(`Dicetak pada: ${new Date().toLocaleString("id-ID")}`, 20, y + 10);

  // Open in new tab
  const pdfBlob = doc.output("blob");
  const pdfUrl = URL.createObjectURL(pdfBlob);
  window.open(pdfUrl, "_blank");
}

// Display tabel pemasok
function displayPemasok() {
  // Reload data dari localStorage untuk memastikan data terbaru
  pemasok = JSON.parse(localStorage.getItem("pemasok")) || [];

  const tbody = document.getElementById("tablePemasok");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (pemasok.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center text-muted py-4">
          <i class="bi bi-inbox fs-1 d-block mb-2"></i>
          Tidak ada data pemasok
        </td>
      </tr>
    `;
    return;
  }

  // Gunakan innerHTML dengan map.join()
  tbody.innerHTML = pemasok
    .map((item, index) => {
      const statusBadge =
        item.status === "Utama"
      ? '<span class="badge bg-success">Utama</span>'
      : '<span class="badge bg-secondary">Cadangan</span>';
    
      return `
      <tr>
      <td>${index + 1}</td>
      <td>${item.idPemasok || "-"}</td>
      <td>${item.nama || "-"}</td>
      <td>${item.alamat || "-"}</td>
      <td>${item.kontak || "-"}</td>
      <td>${item.namaPerkebunan || "-"}</td>
      <td>${statusBadge}</td>
      <td class="text-center">
          <button class="btn btn-sm btn-primary" onclick="generatePemasokPDF(${
            item.id
          })">
          <i class="bi bi-file-pdf me-1"></i>Lihat Detail
        </button>
      </td>
      </tr>
    `;
    })
    .join("");
}

// Display tabel keuangan
function displayKeuangan() {
  // Reload data dari localStorage untuk memastikan data terbaru
  keuangan = JSON.parse(localStorage.getItem("keuangan")) || [];

  const tbody = document.getElementById("tableKeuangan");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (keuangan.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-4">
          <i class="bi bi-inbox fs-1 d-block mb-2"></i>
          Tidak ada data keuangan
        </td>
      </tr>
    `;
    return;
  }

  const filteredKeuangan = applyTableFilter(
    "keuangan",
    keuangan,
    (item) => item.tanggal
  );

  if (filteredKeuangan.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-4">
          <i class="bi bi-funnel d-block mb-2"></i>
          Tidak ada data sesuai filter.
        </td>
      </tr>
    `;
    return;
  }

  // Sort berdasarkan tanggal (terbaru dulu)
  const sortedKeuangan = [...filteredKeuangan].sort((a, b) => {
    return new Date(b.tanggal) - new Date(a.tanggal);
  });

  // Gunakan innerHTML dengan map.join()
  tbody.innerHTML = sortedKeuangan
    .map((item, index) => {
      const jenisBadge =
        item.jenisPengeluaran === "Pembelian Bahan Baku"
      ? '<span class="badge bg-info">Pembelian Bahan Baku</span>'
      : '<span class="badge bg-warning">Operasional</span>';
    
      return `
      <tr>
      <td>${index + 1}</td>
      <td>${formatDate(item.tanggal)}</td>
      <td>${jenisBadge}</td>
      <td>${item.idBahanBaku || "-"}</td>
      <td>${item.nilai ? formatCurrency(item.nilai) : "-"}</td>
      <td>${item.notes || "-"}</td>
      <td class="text-center">
          <button class="btn btn-sm btn-primary" onclick="generateKeuanganPDF(${
            item.id
          })">
          <i class="bi bi-file-pdf me-1"></i>Lihat Detail
        </button>
      </td>
      </tr>
    `;
    })
    .join("");
}

// Display tabel stok
function displayStok() {
  const stokArray = aggregateStok();
  const tbody = document.getElementById("tableStok");
  const tbodyRingkasan = document.getElementById("tableRingkasanStok");
  const totalBeratElement = document.getElementById("totalBeratStok");
  const totalJumlahElement = document.getElementById("totalJumlahKemasan");

  // Reset
  if (tbody) tbody.innerHTML = "";
  if (tbodyRingkasan) tbodyRingkasan.innerHTML = "";
  if (totalBeratElement) totalBeratElement.textContent = "-";
  if (totalJumlahElement) totalJumlahElement.textContent = "-";

  if (stokArray.length === 0) {
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-muted py-4">
            <i class="bi bi-inbox fs-1 d-block mb-2"></i>
            Tidak ada data stok
            <br>
            <small>Data stok akan muncul setelah ada data hasil produksi</small>
          </td>
        </tr>
      `;
    }
    if (tbodyRingkasan) {
      tbodyRingkasan.innerHTML = `
        <tr>
          <td colspan="4" class="text-center text-muted py-4">
            Tidak ada data stok
          </td>
        </tr>
      `;
    }
    return;
  }

  // Hitung total keseluruhan
  const totalBerat = stokArray.reduce((sum, item) => sum + safeNumber(item.totalBerat), 0);
  const totalJumlah = stokArray.reduce((sum, item) => sum + safeNumber(item.totalJumlah), 0);

  // Update total summary
  if (totalBeratElement) {
    totalBeratElement.textContent = formatKgValue(totalBerat);
  }
  if (totalJumlahElement) {
    totalJumlahElement.textContent = `${totalJumlah.toLocaleString("id-ID")} kemasan`;
  }

  // Kategorikan berdasarkan kemasan
  const kemasanGroups = {};
  stokArray.forEach((item) => {
    const kemasan = item.kemasan || "-";
    if (!kemasanGroups[kemasan]) {
      kemasanGroups[kemasan] = [];
    }
    kemasanGroups[kemasan].push(item);
  });

  // Sort kemasan
  const sortedKemasan = Object.keys(kemasanGroups).sort();

  // Tampilkan tabel ringkasan per kemasan
  if (tbodyRingkasan) {
    let ringkasanHtml = "";
    sortedKemasan.forEach((kemasan) => {
      const items = kemasanGroups[kemasan];
      const totalBeratKemasan = items.reduce((sum, item) => sum + safeNumber(item.totalBerat), 0);
      const totalJumlahKemasan = items.reduce((sum, item) => sum + safeNumber(item.totalJumlah), 0);
      
      ringkasanHtml += `
        <tr>
          <td class="fw-semibold">
            <i class="bi bi-box me-2"></i>${kemasan}
          </td>
          <td class="text-center">
            <span class="badge bg-info">${items.length} item</span>
          </td>
          <td class="text-end">
            <strong class="text-primary">${formatKgValue(totalBeratKemasan)}</strong>
          </td>
          <td class="text-end">
            <strong class="text-success">${totalJumlahKemasan.toLocaleString("id-ID")} kemasan</strong>
          </td>
        </tr>
      `;
  });
    tbodyRingkasan.innerHTML = ringkasanHtml;
  }

  // Tampilkan tabel detail
  if (tbody) {
    let rowIndex = 0;
    let html = "";

    sortedKemasan.forEach((kemasan) => {
      const items = kemasanGroups[kemasan];
      
      // Header untuk kategori kemasan
      const totalBeratKemasan = items.reduce((sum, item) => sum + safeNumber(item.totalBerat), 0);
      const totalJumlahKemasan = items.reduce((sum, item) => sum + safeNumber(item.totalJumlah), 0);
      
      html += `
        <tr class="table-info">
          <td colspan="2" class="fw-bold">
            <i class="bi bi-box me-2"></i>Kemasan: ${kemasan}
          </td>
          <td colspan="4" class="text-muted small">
            ${items.length} item
          </td>
          <td class="text-end fw-bold">
            ${formatKgValue(totalBeratKemasan)}
          </td>
          <td class="text-end fw-bold">
            ${totalJumlahKemasan.toLocaleString("id-ID")} kemasan
          </td>
        </tr>
      `;

      // Items dalam kategori kemasan
      items.forEach((item) => {
        rowIndex++;
        html += `
          <tr>
            <td>${rowIndex}</td>
            <td><span class="badge bg-info">${item.tipeProduk || "-"}</span></td>
            <td>${item.kemasan || "-"}</td>
            <td><span class="badge ${(window.getJenisKopiBadgeClass || (() => 'bg-secondary'))(item.jenisKopi)}">${item.jenisKopi || "-"}</span></td>
            <td><span class="badge ${(window.getProsesPengolahanBadgeClass || (() => 'bg-secondary'))(item.prosesPengolahan)}">${item.prosesPengolahan || "-"}</span></td>
            <td>${
              item.levelRoasting
                ? `<span class="badge bg-warning text-dark">${item.levelRoasting}</span>`
                : '<span class="text-muted">-</span>'
            }</td>
            <td class="text-end"><strong class="text-primary">${safeNumber(item.totalBerat).toLocaleString(
              "id-ID",
              { minimumFractionDigits: 2, maximumFractionDigits: 2 }
            )} kg</strong></td>
            <td class="text-end"><strong class="text-success">${safeNumber(item.totalJumlah).toLocaleString(
              "id-ID"
            )} <small class="text-muted">kemasan</small></strong></td>
          </tr>
        `;
      });
    });

    tbody.innerHTML = html;
  }
  
  // Tampilkan juga tabel Data Kemasan
  displayDataKemasan();
}

// Fungsi untuk generate PDF Data Kemasan dengan QRCode
async function generateDataKemasanPDF(id) {
  // Reload data dari localStorage
  hasilProduksi = JSON.parse(localStorage.getItem("hasilProduksi")) || [];
  produksi = JSON.parse(localStorage.getItem("produksi")) || [];
  bahan = JSON.parse(localStorage.getItem("bahan")) || [];
  
  const item = hasilProduksi.find((h) => h.id === id);
  if (!item) {
    alert("Data tidak ditemukan!");
    return;
  }
  
  // Cari data produksi dan bahan terkait
  const produksiData = item.idProduksi
    ? produksi.find((p) => p.idProduksi === item.idProduksi)
    : null;
  const bahanData = item.idBahan
    ? bahan.find((b) => b.idBahan === item.idBahan)
    : null;
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  // ===== HEADER =====
  doc.setFontSize(20);
  doc.setFont(undefined, "bold");
  doc.text("DATA KEMASAN", 105, 20, { align: "center" });
  doc.setFontSize(14);
  doc.setFont(undefined, "normal");
  doc.text("Argopuro Walida", 105, 28, { align: "center" });
  doc.setFontSize(10);
  doc.text("Sistem Manajemen Produksi Kopi", 105, 35, { align: "center" });
  doc.line(20, 40, 190, 40);
  
  // ===== CONTENT =====
  let y = 50;
  doc.setFontSize(11);
  
  // Section: Informasi Produk
  doc.setFontSize(13);
  doc.setFont(undefined, "bold");
  doc.text("INFORMASI PRODUK", 20, y);
  y += 10;
  doc.line(20, y, 190, y);
  y += 12;
  doc.setFontSize(11);
  
  // 1. Jenis Kopi
  doc.setFont(undefined, "bold");
  doc.text("Jenis Kopi", 25, y);
  doc.setFont(undefined, "normal");
  doc.text(":", 75, y);
  doc.text(item.jenisKopi || "-", 80, y);
  y += 10;
  
  // 2. Proses Pengolahan
  doc.setFont(undefined, "bold");
  doc.text("Proses Pengolahan", 25, y);
  doc.setFont(undefined, "normal");
  doc.text(":", 75, y);
  doc.text(item.prosesPengolahan || "-", 80, y);
  y += 10;
  
  // 3. Varietas
  doc.setFont(undefined, "bold");
  doc.text("Varietas", 25, y);
  doc.setFont(undefined, "normal");
  doc.text(":", 75, y);
  doc.text(
    bahanData && bahanData.varietas ? bahanData.varietas : "-",
    80,
    y
  );
  y += 10;
  
  // 4. Tipe Produk
  doc.setFont(undefined, "bold");
  doc.text("Tipe Produk", 25, y);
  doc.setFont(undefined, "normal");
  doc.text(":", 75, y);
  doc.text(item.tipeProduk || "-", 80, y);
  y += 18;
  
  // Section: Informasi Tanggal
  if (y > 240) {
    doc.addPage();
    y = 20;
  }
  doc.setFontSize(13);
  doc.setFont(undefined, "bold");
  doc.text("INFORMASI TANGGAL", 20, y);
  y += 10;
  doc.line(20, y, 190, y);
  y += 12;
  doc.setFontSize(11);
  
  // 5. Tanggal Bahan Masuk
  doc.setFont(undefined, "bold");
  doc.text("Tanggal Bahan Masuk", 25, y);
  doc.setFont(undefined, "normal");
  doc.text(":", 75, y);
  doc.text(
    bahanData && bahanData.tanggalMasuk
      ? formatDate(bahanData.tanggalMasuk)
      : "-",
    80,
    y
  );
  y += 10;
  
  // 6. Tanggal Hasil Produksi
  doc.setFont(undefined, "bold");
  doc.text("Tanggal Hasil Produksi", 25, y);
  doc.setFont(undefined, "normal");
  doc.text(":", 75, y);
  doc.text(formatDate(item.tanggal), 80, y);
  y += 18;
  
  // ===== QRCODE & LINK SECTION =====
  if (y > 220) {
    doc.addPage();
    y = 20;
  }
  doc.setFontSize(13);
  doc.setFont(undefined, "bold");
  doc.text("LINK DETAIL HASIL PRODUKSI", 20, y);
  y += 10;
  doc.line(20, y, 190, y);
  y += 12;
  doc.setFontSize(11);
  
  // Buat URL untuk membuka detail hasil produksi PDF (tanpa perlu login)
  // Gunakan halaman khusus PDF viewer yang tidak perlu login
  // URL harus absolute dan bisa diakses dari mana saja (termasuk dari PDF yang sudah di-download)
  let detailUrl;
  try {
    const currentPath = window.location.pathname;
    const currentHref = window.location.href;
    const isInTemplates = currentPath.includes('/templates/') || currentHref.includes('/templates/');
    
    console.log('🔗 Current path:', currentPath);
    console.log('🔗 Current href:', currentHref);
    console.log('🔗 Protocol:', window.location.protocol);
    console.log('🔗 Origin:', window.location.origin);
    console.log('🔗 Is in templates:', isInTemplates);
    
    // SELALU gunakan absolute URL agar bisa diakses dari PDF yang sudah di-download
    // URL harus bisa diakses dari mana saja, termasuk dari PDF yang sudah di-download
    if (window.location.protocol === 'file:') {
      // Untuk file://, kita tidak bisa membuat absolute URL yang valid
      // Gunakan format yang bisa di-copy dan diakses setelah user membuka HTML di browser
      const basePath = isInTemplates ? 'templates/' : '';
      detailUrl = `${basePath}pdf-viewer.html?id=${id}&type=hasil-produksi`;
      console.log('⚠️ Using file:// protocol - URL will be relative');
      console.log('⚠️ Note: User needs to open HTML file in browser, then access this URL');
    } else {
      // Untuk http/https, SELALU gunakan absolute URL lengkap dengan protocol
      // Ini memastikan URL bisa diakses dari PDF yang sudah di-download
      if (isInTemplates) {
        detailUrl = `${window.location.protocol}//${window.location.host}/templates/pdf-viewer.html?id=${id}&type=hasil-produksi`;
      } else {
        detailUrl = `${window.location.protocol}//${window.location.host}/pdf-viewer.html?id=${id}&type=hasil-produksi`;
      }
      console.log('✓ Using http/https protocol, absolute URL with protocol');
    }
    
    console.log('🔗 Final URL for QRCode and Link:', detailUrl);
    
    // Validasi URL
    if (!detailUrl || !detailUrl.includes('pdf-viewer.html') || !detailUrl.includes(`id=${id}`)) {
      throw new Error('Invalid URL generated: ' + detailUrl);
    }
    
  } catch (error) {
    console.error('❌ Error generating URL:', error);
    // Fallback: gunakan format yang paling sederhana
    detailUrl = `pdf-viewer.html?id=${id}&type=hasil-produksi`;
    console.log('🔗 Using fallback URL:', detailUrl);
  }
  
  // 7. QRCode
  doc.setFont(undefined, "bold");
  doc.text("QRCode:", 25, y);
  y += 10;
  
  // Generate QRCode
  try {
    console.log('🔲 Starting QRCode generation...');
    console.log('🔲 URL to encode:', detailUrl);
    
    const canvas = document.createElement('canvas');
    const qrSize = 120; // Ukuran lebih besar untuk kualitas lebih baik dan mudah di-scan
    canvas.width = qrSize;
    canvas.height = qrSize;
    
    // Generate QRCode menggunakan library QRCode.js
    // Cek apakah QRCode library tersedia (bisa dari window.QRCode atau global QRCode)
    const QRCodeLib = window.QRCode || (typeof QRCode !== 'undefined' ? QRCode : null);
    
    if (QRCodeLib && typeof QRCodeLib.toCanvas === 'function') {
      console.log('✓ QRCode library loaded');
      console.log('✓ QRCode.toCanvas available');
      console.log('✓ Encoding URL:', detailUrl);
      
      // QRCode.toCanvas adalah async, gunakan Promise
      await new Promise((resolve) => {
        try {
          QRCodeLib.toCanvas(canvas, detailUrl, {
            width: qrSize,
            margin: 3,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            },
            errorCorrectionLevel: 'H' // High error correction untuk kualitas lebih baik
          }, (error) => {
            if (error) {
              console.error('❌ QRCode generation error:', error);
              console.error('❌ Error details:', error.message);
              if (error.stack) console.error('❌ Error stack:', error.stack);
              // Fallback: buat placeholder
              drawQRCodePlaceholder(canvas.getContext('2d'), qrSize);
              resolve(); // Tetap resolve agar tidak hang
            } else {
              console.log('✓ QRCode generated successfully');
              console.log('✓ QRCode canvas size:', canvas.width, 'x', canvas.height);
              resolve();
            }
          });
        } catch (syncError) {
          console.error('❌ Synchronous error in QRCode generation:', syncError);
          console.error('❌ Sync error details:', syncError.message);
          drawQRCodePlaceholder(canvas.getContext('2d'), qrSize);
          resolve();
        }
      });
    } else {
      console.warn('⚠️ QRCode library not found!');
      console.warn('⚠️ typeof QRCode:', typeof QRCode);
      console.warn('⚠️ window.QRCode:', window.QRCode);
      console.warn('⚠️ QRCodeLib:', QRCodeLib);
      // Fallback: buat placeholder QRCode
      drawQRCodePlaceholder(canvas.getContext('2d'), qrSize);
    }
    
    // Convert canvas ke image data
    const qrCodeDataUrl = canvas.toDataURL('image/png');
    console.log('✓ QRCode image data created');
    console.log('✓ QRCode data URL length:', qrCodeDataUrl.length);
    console.log('✓ QRCode data URL preview:', qrCodeDataUrl.substring(0, 50) + '...');
    
    // Validasi bahwa image data valid
    if (!qrCodeDataUrl || qrCodeDataUrl.length < 100) {
      throw new Error('QRCode image data invalid');
    }
    
    // Tambahkan gambar QRCode ke PDF (ukuran lebih besar untuk mudah di-scan)
    doc.addImage(qrCodeDataUrl, 'PNG', 25, y, 60, 60);
    console.log('✓ QRCode added to PDF at position:', 25, y);
    
    // Tambahkan teks di bawah QRCode
    y += 65;
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text("Scan QRCode untuk melihat", 25, y, { maxWidth: 80 });
    y += 6;
    doc.text("detail laporan hasil produksi", 25, y, { maxWidth: 80 });
    y += 6;
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text("atau gunakan link URL di bawah", 25, y, { maxWidth: 80 });
    doc.setTextColor(0, 0, 0);
    
  } catch (error) {
    console.error('❌ Error generating QRCode:', error);
    console.error('❌ Error stack:', error.stack);
    // Jika error, tambahkan placeholder text
    doc.setFont(undefined, "normal");
    doc.setFontSize(10);
    doc.text("QRCode tidak dapat dibuat", 25, y);
    doc.text("Gunakan link URL di bawah", 25, y + 6);
    y += 12;
  }
  
  // 8. Link (URL sebagai backup) - Langsung generate PDF seperti di laporan hasil produksi
  y += 12;
  if (y > 250) {
    doc.addPage();
    y = 20;
  }
  doc.setFontSize(11);
  doc.setFont(undefined, "bold");
  doc.text("Link (URL):", 25, y);
  y += 10;
  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  doc.text("Jika QRCode tidak dapat dibaca,", 25, y);
  y += 7;
  doc.text("klik link berikut untuk langsung", 25, y);
  y += 7;
  doc.text("membuka laporan hasil produksi:", 25, y);
  y += 10;
  
  // Generate PDF detail hasil produksi dan dapatkan blob URL
  // Sama seperti di generateHasilProduksiPDF
  let pdfBlobUrl = '';
  try {
    // Generate PDF detail hasil produksi
    const { jsPDF: jsPDFLib } = window.jspdf;
    const detailDoc = new jsPDFLib();
    
    // Header
    detailDoc.setFontSize(18);
    detailDoc.text("LAPORAN DETAIL HASIL PRODUKSI", 105, 20, { align: "center" });
    detailDoc.setFontSize(12);
    detailDoc.text("Argopuro Walida", 105, 30, { align: "center" });
    detailDoc.line(20, 35, 190, 35);
    
    // Content (sama seperti generateHasilProduksiPDF)
    let detailY = 50;
    detailDoc.setFontSize(11);
    
    // === DATA HASIL PRODUKSI ===
    detailDoc.setFontSize(12);
    detailDoc.setFont(undefined, "bold");
    detailDoc.text("DATA HASIL PRODUKSI", 20, detailY);
    detailY += 8;
    detailDoc.line(20, detailY, 190, detailY);
    detailY += 10;
    detailDoc.setFontSize(11);
    
    detailDoc.setFont(undefined, "bold");
    detailDoc.text("ID Produksi:", 20, detailY);
    detailDoc.setFont(undefined, "normal");
    detailDoc.text(item.idProduksi || "-", 60, detailY);
    detailY += 10;
    
    detailDoc.setFont(undefined, "bold");
    detailDoc.text("Tipe Produk:", 20, detailY);
    detailDoc.setFont(undefined, "normal");
    detailDoc.text(item.tipeProduk || "-", 60, detailY);
    detailY += 10;
    
    detailDoc.setFont(undefined, "bold");
    detailDoc.text("Kemasan:", 20, detailY);
    detailDoc.setFont(undefined, "normal");
    detailDoc.text(item.kemasan || "-", 60, detailY);
    detailY += 10;
    
    detailDoc.setFont(undefined, "bold");
    detailDoc.text("Jenis Kopi:", 20, detailY);
    detailDoc.setFont(undefined, "normal");
    detailDoc.text(item.jenisKopi || "-", 60, detailY);
    detailY += 10;
    
    detailDoc.setFont(undefined, "bold");
    detailDoc.text("Proses Pengolahan:", 20, detailY);
    detailDoc.setFont(undefined, "normal");
    detailDoc.text(item.prosesPengolahan || "-", 60, detailY);
    detailY += 10;
    
    detailDoc.setFont(undefined, "bold");
    detailDoc.text("Level Roasting:", 20, detailY);
    detailDoc.setFont(undefined, "normal");
    detailDoc.text(item.levelRoasting || "-", 60, detailY);
    detailY += 10;
    
    detailDoc.setFont(undefined, "bold");
    detailDoc.text("Berat yang Diproses:", 20, detailY);
    detailDoc.setFont(undefined, "normal");
    detailDoc.text(
      `${item.beratSaatIni ? item.beratSaatIni.toLocaleString("id-ID") : "-"} kg`,
      60,
      detailY
    );
    detailY += 10;
    
    detailDoc.setFont(undefined, "bold");
    detailDoc.text("Jumlah Kemasan:", 20, detailY);
    detailDoc.setFont(undefined, "normal");
    detailDoc.text(item.jumlah ? item.jumlah.toLocaleString("id-ID") : "-", 60, detailY);
    detailY += 10;
    
    detailDoc.setFont(undefined, "bold");
    detailDoc.text("Tanggal:", 20, detailY);
    detailDoc.setFont(undefined, "normal");
    detailDoc.text(formatDate(item.tanggal), 60, detailY);
    
    // === DATA BAHAN MASUK ===
    if (bahanData) {
      detailY += 15;
      if (detailY > 250) {
        detailDoc.addPage();
        detailY = 20;
      }
      detailDoc.setFontSize(12);
      detailDoc.setFont(undefined, "bold");
      detailDoc.text("DATA BAHAN MASUK", 20, detailY);
      detailY += 8;
      detailDoc.line(20, detailY, 190, detailY);
      detailY += 10;
      detailDoc.setFontSize(11);
      
      detailDoc.setFont(undefined, "bold");
      detailDoc.text("ID Bahan:", 20, detailY);
      detailDoc.setFont(undefined, "normal");
      detailDoc.text(bahanData.idBahan || "-", 60, detailY);
      detailY += 10;
      
      detailDoc.setFont(undefined, "bold");
      detailDoc.text("Pemasok:", 20, detailY);
      detailDoc.setFont(undefined, "normal");
      detailDoc.text(bahanData.pemasok || "-", 60, detailY);
      detailY += 10;
      
      detailDoc.setFont(undefined, "bold");
      detailDoc.text("Jumlah:", 20, detailY);
      detailDoc.setFont(undefined, "normal");
      detailDoc.text(
        `${bahanData.jumlah ? bahanData.jumlah.toLocaleString("id-ID") : "-"} kg`,
        60,
        detailY
      );
      detailY += 10;
      
      detailDoc.setFont(undefined, "bold");
      detailDoc.text("Varietas:", 20, detailY);
      detailDoc.setFont(undefined, "normal");
      detailDoc.text(bahanData.varietas || "-", 60, detailY);
      detailY += 10;
      
      detailDoc.setFont(undefined, "bold");
      detailDoc.text("Harga per Kg:", 20, detailY);
      detailDoc.setFont(undefined, "normal");
      detailDoc.text(
        bahanData.hargaPerKg ? formatCurrency(bahanData.hargaPerKg) : "-",
        60,
        detailY
      );
      detailY += 10;
      
      detailDoc.setFont(undefined, "bold");
      detailDoc.text("Total Pengeluaran:", 20, detailY);
      detailDoc.setFont(undefined, "normal");
      detailDoc.text(
        bahanData.totalPengeluaran
          ? formatCurrency(bahanData.totalPengeluaran)
          : "-",
        60,
        detailY
      );
      detailY += 10;
      
      detailDoc.setFont(undefined, "bold");
      detailDoc.text("Jenis Kopi:", 20, detailY);
      detailDoc.setFont(undefined, "normal");
      detailDoc.text(bahanData.jenisKopi || "-", 60, detailY);
      detailY += 10;
      
      detailDoc.setFont(undefined, "bold");
      detailDoc.text("Tanggal Masuk:", 20, detailY);
      detailDoc.setFont(undefined, "normal");
      detailDoc.text(formatDate(bahanData.tanggalMasuk), 60, detailY);
      detailY += 10;
      
      detailDoc.setFont(undefined, "bold");
      detailDoc.text("Kualitas:", 20, detailY);
      detailDoc.setFont(undefined, "normal");
      detailDoc.text(bahanData.kualitas || "-", 60, detailY);
    }
    
    // === DATA PRODUKSI ===
    if (produksiData) {
      detailY += 15;
      if (detailY > 250) {
        detailDoc.addPage();
        detailY = 20;
      }
      detailDoc.setFontSize(12);
      detailDoc.setFont(undefined, "bold");
      detailDoc.text("DATA PRODUKSI", 20, detailY);
      detailY += 8;
      detailDoc.line(20, detailY, 190, detailY);
      detailY += 10;
      detailDoc.setFontSize(11);
      
      detailDoc.setFont(undefined, "bold");
      detailDoc.text("ID Produksi:", 20, detailY);
      detailDoc.setFont(undefined, "normal");
      detailDoc.text(produksiData.idProduksi || "-", 60, detailY);
      detailY += 10;
      
      detailDoc.setFont(undefined, "bold");
      detailDoc.text("ID Bahan:", 20, detailY);
      detailDoc.setFont(undefined, "normal");
      detailDoc.text(produksiData.idBahan || "-", 60, detailY);
      detailY += 10;
      
      detailDoc.setFont(undefined, "bold");
      detailDoc.text("Berat Awal:", 20, detailY);
      detailDoc.setFont(undefined, "normal");
      detailDoc.text(
        `${
          produksiData.beratAwal
            ? produksiData.beratAwal.toLocaleString("id-ID")
            : "-"
        } kg`,
        60,
        detailY
      );
      detailY += 10;
      
      detailDoc.setFont(undefined, "bold");
      detailDoc.text("Berat Akhir:", 20, detailY);
      detailDoc.setFont(undefined, "normal");
      detailDoc.text(
        `${
          produksiData.beratAkhir
            ? produksiData.beratAkhir.toLocaleString("id-ID")
            : "-"
        } kg`,
        60,
        detailY
      );
      detailY += 10;
      
      detailDoc.setFont(undefined, "bold");
      detailDoc.text("Proses Pengolahan:", 20, detailY);
      detailDoc.setFont(undefined, "normal");
      detailDoc.text(produksiData.prosesPengolahan || "-", 60, detailY);
      detailY += 10;
      
      detailDoc.setFont(undefined, "bold");
      detailDoc.text("Kadar Air:", 20, detailY);
      detailDoc.setFont(undefined, "normal");
      detailDoc.text(
        `${produksiData.kadarAir ? produksiData.kadarAir + "%" : "-"}`,
        60,
        detailY
      );
      detailY += 10;
      
      detailDoc.setFont(undefined, "bold");
      detailDoc.text("Varietas:", 20, detailY);
      detailDoc.setFont(undefined, "normal");
      detailDoc.text(produksiData.varietas || "-", 60, detailY);
      detailY += 10;
      
      detailDoc.setFont(undefined, "bold");
      detailDoc.text("Tanggal Masuk:", 20, detailY);
      detailDoc.setFont(undefined, "normal");
      detailDoc.text(formatDate(produksiData.tanggalMasuk), 60, detailY);
      detailY += 10;
      
      detailDoc.setFont(undefined, "bold");
      detailDoc.text("Tanggal Sekarang:", 20, detailY);
      detailDoc.setFont(undefined, "normal");
      detailDoc.text(formatDate(produksiData.tanggalSekarang), 60, detailY);
      detailY += 10;
      
      detailDoc.setFont(undefined, "bold");
      detailDoc.text("Status Tahapan Saat Ini:", 20, detailY);
      detailDoc.setFont(undefined, "normal");
      detailDoc.text(produksiData.statusTahapan || "-", 60, detailY);
    }
    
    // Footer
    detailY = 270;
    detailDoc.line(20, detailY, 190, detailY);
    detailDoc.setFontSize(10);
    detailDoc.text(`Dicetak pada: ${new Date().toLocaleString("id-ID")}`, 20, detailY + 10);
    
    // Generate blob URL
    const detailPdfBlob = detailDoc.output("blob");
    pdfBlobUrl = URL.createObjectURL(detailPdfBlob);
    
    console.log('✓ PDF detail hasil produksi generated for link URL');
    console.log('✓ Blob URL created:', pdfBlobUrl);
    
  } catch (error) {
    console.error('❌ Error generating PDF for link URL:', error);
    // Fallback: gunakan detailUrl (pdf-viewer.html)
    pdfBlobUrl = detailUrl;
  }
  
  // Tampilkan blob URL di PDF (sama seperti di laporan hasil produksi)
  // Catatan: Blob URL tidak bisa diklik langsung di PDF, tapi bisa di-copy
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 255); // Warna biru untuk link
  
  // Tampilkan blob URL (akan terlihat seperti: blob:null/...)
  // Format sama seperti di laporan hasil produksi
  const urlLines = doc.splitTextToSize(pdfBlobUrl, 160);
  let linkStartY = y;
  urlLines.forEach((line, index) => {
    if (y > 280) {
      doc.addPage();
      y = 20;
      linkStartY = y;
    }
    doc.text(line, 25, y);
    y += 6;
  });
  
  // Tambahkan link yang bisa diklik (jika PDF viewer support)
  // Link akan memanggil generateHasilProduksiPDF saat diklik
  try {
    const linkHeight = (urlLines.length * 6);
    doc.setTextColor(0, 0, 255);
    doc.link(25, linkStartY, 160, linkHeight, {
      url: pdfBlobUrl
    });
    console.log('✓ Link added to PDF at:', 25, linkStartY, 160, linkHeight);
  } catch (error) {
    console.warn('⚠️ Could not add clickable link to PDF:', error);
  }
  
  doc.setTextColor(0, 0, 0); // Kembalikan ke hitam
  
  // Tambahkan instruksi
  y += 5;
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("(Klik atau copy link di atas untuk membuka PDF)", 25, y, { maxWidth: 160 });
  y += 5;
  doc.text("Format sama seperti di laporan hasil produksi", 25, y, { maxWidth: 160 });
  doc.setTextColor(0, 0, 0);
  
  console.log('✓ PDF Data Kemasan generated');
  console.log('✓ QRCode URL:', detailUrl);
  console.log('✓ Link URL (blob):', pdfBlobUrl);
  console.log('✓ Link URL akan langsung membuka PDF seperti di laporan hasil produksi');
  
  // Footer
  y = 280;
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text("Dokumen ini dibuat secara otomatis oleh sistem Argopuro Walida", 105, y, { align: "center" });
  y += 6;
  const printDate = new Date().toLocaleDateString("id-ID", { 
    year: "numeric", 
    month: "long", 
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  doc.text(`Tanggal Cetak: ${printDate}`, 105, y, { align: "center" });
  doc.setTextColor(0, 0, 0);
  
  // Simpan dan buka PDF di new tab
  console.log('📄 Generating PDF blob...');
  const pdfBlob = doc.output('blob');
  const pdfUrl = URL.createObjectURL(pdfBlob);
  console.log('✓ PDF generated, opening in new tab...');
  console.log('✓ PDF URL:', pdfUrl);
  console.log('✓ QRCode URL in PDF:', detailUrl);
  
  // Buka PDF di new tab
  const newWindow = window.open(pdfUrl, '_blank');
  if (!newWindow) {
    console.warn('⚠️ Popup blocked, trying alternative method');
    // Jika popup blocked, coba download
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = `Data_Kemasan_${id}_${new Date().getTime()}.pdf`;
    link.click();
  }
  
  console.log('✓ PDF opened successfully');
}

// Helper function untuk membuat placeholder QRCode
function drawQRCodePlaceholder(ctx, size) {
  // Background putih
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, size, size);
  
  // Border hitam
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
  
  // Pattern sederhana (simulasi QRCode)
  ctx.fillStyle = '#000000';
  const cellSize = size / 8;
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      if ((i + j) % 2 === 0) {
        ctx.fillRect(i * cellSize, j * cellSize, cellSize, cellSize);
      }
    }
  }
}

// Fungsi untuk menampilkan tabel Data Kemasan
function displayDataKemasan() {
  // Reload data dari localStorage
  hasilProduksi = JSON.parse(localStorage.getItem("hasilProduksi")) || [];
  const tbody = document.getElementById("tableDataKemasan");
  
  if (!tbody) return;
  
  tbody.innerHTML = "";
  
  if (hasilProduksi.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" class="text-center text-muted py-4">
          <i class="bi bi-inbox fs-1 d-block mb-2"></i>
          Tidak ada data kemasan
        </td>
      </tr>
    `;
    return;
  }
  
  // Sort berdasarkan tanggal (terbaru dulu)
  const sortedHasil = [...hasilProduksi].sort((a, b) => {
    return new Date(b.tanggal) - new Date(a.tanggal);
  });
  
  tbody.innerHTML = sortedHasil
    .map((item, index) => {
      return `
      <tr>
        <td>${index + 1}</td>
        <td><span class="badge bg-secondary">${item.idProduksi || "-"}</span></td>
        <td><span class="badge bg-info">${item.idBahan || "-"}</span></td>
        <td>${item.tipeProduk || "-"}</td>
        <td>${item.kemasan || "-"}</td>
        <td><span class="badge ${(window.getJenisKopiBadgeClass || (() => 'bg-secondary'))(item.jenisKopi)}">${item.jenisKopi || "-"}</span></td>
        <td><span class="badge ${(window.getProsesPengolahanBadgeClass || (() => 'bg-secondary'))(item.prosesPengolahan)}">${item.prosesPengolahan || "-"}</span></td>
        <td>${
          item.levelRoasting
            ? `<span class="badge bg-warning text-dark">${item.levelRoasting}</span>`
            : '<span class="text-muted">-</span>'
        }</td>
        <td>${formatDate(item.tanggal)}</td>
        <td class="text-end">${
          item.beratSaatIni ? item.beratSaatIni.toLocaleString("id-ID", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          }) : "-"
        } kg</td>
        <td class="text-end">${item.jumlah ? item.jumlah.toLocaleString("id-ID") : "-"}</td>
        <td class="text-center">
          <button class="btn btn-sm btn-primary" onclick="generateDataKemasanPDF(${
            item.id
          })">
            <i class="bi bi-file-pdf me-1"></i>Lihat Detail
          </button>
        </td>
      </tr>
    `;
    })
    .join("");
}

// Generate PDF untuk Pemasok
function generatePemasokPDF(id) {
  const item = pemasok.find((p) => p.id === id);
  if (!item) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Header
  doc.setFontSize(18);
  doc.text("LAPORAN DETAIL PEMASOK", 105, 20, { align: "center" });
  doc.setFontSize(12);
  doc.text("Argopuro Walida", 105, 30, { align: "center" });
  doc.line(20, 35, 190, 35);

  // Content
  let y = 50;
  doc.setFontSize(11);
  doc.setFont(undefined, "bold");
  doc.text("ID Pemasok:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(item.idPemasok || "-", 60, y);

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Nama:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(item.nama || "-", 60, y);

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Alamat:", 20, y);
  doc.setFont(undefined, "normal");
  const alamatLines = doc.splitTextToSize(item.alamat || "-", 130);
  doc.text(alamatLines, 60, y);

  y += alamatLines.length * 7;
  doc.setFont(undefined, "bold");
  doc.text("Kontak:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(item.kontak || "-", 60, y);

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Nama Perkebunan:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(item.namaPerkebunan || "-", 60, y);

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Status:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(item.status || "-", 60, y);

  // Footer
  y = 270;
  doc.line(20, y, 190, y);
  doc.setFontSize(10);
  doc.text(`Dicetak pada: ${new Date().toLocaleString("id-ID")}`, 20, y + 10);

  // Open in new tab
  const pdfBlob = doc.output("blob");
  const pdfUrl = URL.createObjectURL(pdfBlob);
  window.open(pdfUrl, "_blank");
}

// Generate PDF untuk Keuangan
function generateKeuanganPDF(id) {
  const item = keuangan.find((k) => k.id === id);
  if (!item) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Header
  doc.setFontSize(18);
  doc.text("LAPORAN DETAIL KEUANGAN", 105, 20, { align: "center" });
  doc.setFontSize(12);
  doc.text("Argopuro Walida", 105, 30, { align: "center" });
  doc.line(20, 35, 190, 35);

  // Content
  let y = 50;
  doc.setFontSize(11);
  doc.setFont(undefined, "bold");
  doc.text("Tanggal:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(formatDate(item.tanggal), 60, y);

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Jenis Pengeluaran:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(item.jenisPengeluaran || "-", 60, y);

  if (item.idBahanBaku) {
    y += 10;
    doc.setFont(undefined, "bold");
    doc.text("ID Bahan Baku:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(item.idBahanBaku, 60, y);
  }

  y += 10;
  doc.setFont(undefined, "bold");
  doc.text("Nilai:", 20, y);
  doc.setFont(undefined, "normal");
  doc.text(item.nilai ? formatCurrency(item.nilai) : "-", 60, y);

  if (item.notes) {
    y += 10;
    doc.setFont(undefined, "bold");
    doc.text("Notes:", 20, y);
    doc.setFont(undefined, "normal");
    const notesLines = doc.splitTextToSize(item.notes, 130);
    doc.text(notesLines, 60, y);
  }

  // Footer
  y = 270;
  doc.line(20, y, 190, y);
  doc.setFontSize(10);
  doc.text(`Dicetak pada: ${new Date().toLocaleString("id-ID")}`, 20, y + 10);

  // Open in new tab
  const pdfBlob = doc.output("blob");
  const pdfUrl = URL.createObjectURL(pdfBlob);
  window.open(pdfUrl, "_blank");
}

// Override localStorage.setItem untuk mendeteksi perubahan dalam tab yang sama
(function () {
  const originalSetItem = localStorage.setItem;
  localStorage.setItem = function (key, value) {
    originalSetItem.apply(this, arguments);
    
    // Trigger custom event untuk update real-time
    if (
      [
        "bahan",
        "produksi",
        "hasilProduksi",
        "sanitasi",
        "pemasok",
        "keuangan",
      ].includes(key)
    ) {
      window.dispatchEvent(
        new CustomEvent("localStorageUpdated", {
          detail: { key: key, value: value },
        })
      );
    }
  };
})();

// Initialize on page load
// Handler untuk auto-generate PDF dari QRCode
function handleQRCodePDF() {
  const hash = window.location.hash;
  if (hash && hash.startsWith('#hasil-produksi-pdf-')) {
    const id = parseInt(hash.replace('#hasil-produksi-pdf-', ''));
    if (id && !isNaN(id)) {
      console.log('🔗 QRCode detected! Auto-generating PDF for ID:', id);
      // Auto-generate PDF detail hasil produksi
      setTimeout(() => {
        generateHasilProduksiPDF(id);
        // Hapus hash setelah generate untuk menghindari loop
        window.history.replaceState(null, '', window.location.pathname);
      }, 500);
    }
  }
}

// Listen untuk hash change (jika user scan QRCode saat halaman sudah terbuka)
window.addEventListener('hashchange', function() {
  handleQRCodePDF();
});

document.addEventListener("DOMContentLoaded", function () {
  setTimeout(async () => {
    try {
      // Handle QRCode PDF generation
      handleQRCodePDF();
      
      // Load data dari API atau localStorage saat page load
      await loadAllReportData();

      // Initialize hashes
      await initializeHashes();
      initializeTableFilters();
      
      // Display semua tabel
      await refreshAllTables();

  // Refresh data when storage changes (dari tab/window lain)
  window.addEventListener("storage", function (e) {
    if (
      [
        "bahan",
        "produksi",
        "hasilProduksi",
        "sanitasi",
        "pemasok",
        "keuangan",
      ].includes(e.key)
    ) {
      if (await checkDataChanges()) {
        await refreshAllTables();
      }
    }
    } catch (error) {
      console.error("Error handling storage event:", error);
    }
  });

  // Listen for custom dataUpdated event (dari script lain)
  window.addEventListener("dataUpdated", async function (event) {
    try {
      // Refresh langsung untuk update real-time
      const dataType = event.detail ? event.detail.type : null;
      
      // Reload data dari API atau localStorage
      await loadAllReportData();
      
      // Update hashes
      dataHashes.bahan = generateHash(bahan);
      dataHashes.produksi = generateHash(produksi);
      dataHashes.hasilProduksi = generateHash(hasilProduksi);
      dataHashes.sanitasi = generateHash(sanitasi);
      dataHashes.pemasok = generateHash(pemasok);
      dataHashes.keuangan = generateHash(keuangan);
      
      // Refresh semua tabel langsung
      await refreshAllTables();
    } catch (error) {
      console.error("Error handling dataUpdated event:", error);
    }
  });

  // Listen for localStorageUpdated event (dari override setItem)
  window.addEventListener("localStorageUpdated", async function (event) {
    try {
      if (await checkDataChanges()) {
        await refreshAllTables();
      }
    } catch (error) {
      console.error("Error handling localStorageUpdated event:", error);
    }
  });

  // Polling mechanism untuk check perubahan setiap 1 detik (lebih responsif)
  setInterval(async function () {
    try {
      if (await checkDataChanges()) {
        await refreshAllTables();
      }
    } catch (error) {
      console.error("Error in polling:", error);
    }
  }, 1000);
    } catch (error) {
      console.error("Error initializing laporan page:", error);
    }
  }, 100);
});
