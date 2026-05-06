// Dashboard Statistics Script
// Mengambil data dari localStorage dan menampilkan statistik dengan auto-update

// Variabel untuk menyimpan statistik sebelumnya (untuk animasi)
let previousStats = null;
let updateInterval = null;

// Variabel untuk menyimpan chart instances
let bahanChart = null;
let produksiChart = null;
let stokChart = null;

/** Warna batang bergantian per kategori. */
const DASHBOARD_CHART_SERIES_COLORS = [
  "rgb(255, 193, 7)",
  "rgb(13, 110, 253)",
  "rgb(25, 135, 84)",
  "rgb(220, 53, 69)",
  "rgb(111, 66, 193)",
  "rgb(214, 51, 132)",
  "rgb(32, 201, 151)",
  "rgb(253, 126, 20)",
];

const DASHBOARD_BAR_MAX_CATEGORIES = 14;

/** entriesDesc: pasangan [label, nilai], urut descending; gabung sisanya ke "Lainnya" jika melebihi max. */
function dashboardTrimCategories(entriesDesc, max) {
  if (entriesDesc.length <= max) return entriesDesc;
  const head = entriesDesc.slice(0, max - 1);
  const tail = entriesDesc.slice(max - 1);
  const sumTail = tail.reduce((s, [, v]) => s + v, 0);
  return [...head, ["Lainnya", sumTail]];
}

function dashboardChartPreset(selectId) {
  const el = document.getElementById(selectId);
  return el?.value || "all";
}

function dashboardChartPeriodStartMs(preset) {
  if (!preset || preset === "all") return null;
  const days = { "7d": 7, "30d": 30, "90d": 90, "180d": 180, "365d": 365 }[preset];
  if (!days) return null;
  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

function dashboardGetIdBahanListFromProduksi(p) {
  if (!p) return [];
  if (Array.isArray(p.idBahanList) && p.idBahanList.length > 0) {
    return p.idBahanList.map((x) => String(x).trim()).filter(Boolean);
  }
  if (p.idBahan) return [String(p.idBahan).trim()];
  return [];
}

function dashboardGetProsesPengolahanTampilan(prod, bahanById) {
  const firstId = dashboardGetIdBahanListFromProduksi(prod)[0] || prod?.idBahan;
  const id = firstId ? String(firstId).trim() : "";
  const b = id && bahanById instanceof Map ? bahanById.get(id) : null;
  const lines = b?.prosesBahan;
  if (Array.isArray(lines) && lines.length === 1 && lines[0]?.prosesPengolahan) {
    return String(lines[0].prosesPengolahan);
  }
  const direct = prod?.prosesPengolahan && String(prod.prosesPengolahan).trim();
  return direct || "-";
}

function dashboardProduksiMillis(p) {
  const raw = p.tanggalMasuk || p.tanggalSekarang;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : NaN;
}

function dashboardProduksiBeratKg(p) {
  const aw = parseFloat(p.beratAwal);
  const cur = parseFloat(p.beratTerkini || p.beratSaatIni);
  if (Number.isFinite(aw) && aw > 0) return aw;
  if (Number.isFinite(cur)) return cur;
  return 0;
}

function bindDashboardChartPeriodFilters() {
  const bahanSel = document.getElementById("dashboardBahanPeriodeFilter");
  const prodSel = document.getElementById("dashboardProduksiPeriodeFilter");
  const savedB = sessionStorage.getItem("dashboardBahanPeriod");
  const savedP = sessionStorage.getItem("dashboardProduksiPeriod");
  if (bahanSel && savedB && [...bahanSel.options].some((o) => o.value === savedB)) {
    bahanSel.value = savedB;
  }
  if (prodSel && savedP && [...prodSel.options].some((o) => o.value === savedP)) {
    prodSel.value = savedP;
  }
  if (bahanSel && !bahanSel.dataset.dashboardPeriodBound) {
    bahanSel.dataset.dashboardPeriodBound = "1";
    bahanSel.addEventListener("change", () => {
      sessionStorage.setItem("dashboardBahanPeriod", bahanSel.value);
      createBahanChart();
    });
  }
  if (prodSel && !prodSel.dataset.dashboardPeriodBound) {
    prodSel.dataset.dashboardPeriodBound = "1";
    prodSel.addEventListener("change", () => {
      sessionStorage.setItem("dashboardProduksiPeriod", prodSel.value);
      createProduksiChart();
    });
  }
}

// Fungsi untuk menghitung statistik
async function calculateStatistics() {
  // Ambil semua data dari API atau localStorage
  let users = [],
    bahan = [],
    produksi = [],
    hasilProduksi = [],
    pemasok = [],
    sanitasi = [],
    keuangan = [];

  try {
    if (window.API) {
      users = window.API.Users ? await window.API.Users.getAll() : [];
      bahan = window.API.Bahan ? await window.API.Bahan.getAll() : [];
      produksi = window.API.Produksi ? await window.API.Produksi.getAll() : [];
      hasilProduksi = window.API.HasilProduksi
        ? await window.API.HasilProduksi.getAll()
        : [];
      pemasok = window.API.Pemasok ? await window.API.Pemasok.getAll() : [];
      sanitasi = window.API.Sanitasi ? await window.API.Sanitasi.getAll() : [];
      keuangan = window.API.Keuangan ? await window.API.Keuangan.getAll() : [];
    }
  } catch (error) {
    console.error("Error loading data from API:", error);
  }

  // Fallback to localStorage
  if (users.length === 0)
    users = JSON.parse(localStorage.getItem("users") || "[]");
  if (bahan.length === 0)
    bahan = JSON.parse(localStorage.getItem("bahan") || "[]");
  if (produksi.length === 0)
    produksi = JSON.parse(localStorage.getItem("produksi") || "[]");
  if (hasilProduksi.length === 0)
    hasilProduksi = JSON.parse(localStorage.getItem("hasilProduksi") || "[]");
  if (pemasok.length === 0)
    pemasok = JSON.parse(localStorage.getItem("pemasok") || "[]");
  if (sanitasi.length === 0)
    sanitasi = JSON.parse(localStorage.getItem("sanitasi") || "[]");
  if (keuangan.length === 0)
    keuangan = JSON.parse(localStorage.getItem("keuangan") || "[]");

  // Debug: Log data keuangan untuk troubleshooting
  if (keuangan.length > 0) {
    console.log("📊 Dashboard - Keuangan data loaded:", {
      totalRecords: keuangan.length,
      sampleRecord: keuangan[0] ? {
        id: keuangan[0].id || keuangan[0]._id,
        tanggal: keuangan[0].tanggal,
        jenisPengeluaran: keuangan[0].jenisPengeluaran,
        nilai: keuangan[0].nilai,
        notes: keuangan[0].notes
      } : null,
      totalNilai: keuangan.reduce((sum, k) => sum + (parseFloat(k.nilai) || 0), 0)
    });
  } else {
    console.warn("⚠️ Dashboard - Tidak ada data keuangan ditemukan");
  }

  // Hitung statistik
  const stats = {
    totalUsers: users.length,
    totalBahan: bahan.length,
    totalProduksi: produksi.length,
    totalHasilProduksi: hasilProduksi.length,
    totalPemasok: pemasok.length,
    totalSanitasi: sanitasi.length,
    totalTransaksiKeuangan: keuangan.length,

    // Statistik Bahan
    totalJumlahBahan: bahan.reduce(
      (sum, b) => sum + (parseFloat(b.jumlah) || 0),
      0
    ),
    totalPengeluaranBahan: bahan.reduce(
      (sum, b) => sum + (parseFloat(b.totalPengeluaran) || 0),
      0
    ),

    // Statistik Produksi
    // Field yang digunakan: beratAwal, beratTerkini (bukan beratSaatIni)
    totalBeratAwal: produksi.reduce(
      (sum, p) => sum + (parseFloat(p.beratAwal) || 0),
      0
    ),
    totalBeratSaatIni: produksi.reduce(
      (sum, p) => sum + (parseFloat(p.beratTerkini || p.beratSaatIni) || 0),
      0
    ),

    // Statistik Hasil Produksi
    totalBeratHasilProduksi: hasilProduksi.reduce(
      (sum, h) => sum + (parseFloat(h.beratSaatIni) || 0),
      0
    ),
    totalJumlahKemasan: hasilProduksi.reduce(
      (sum, h) => sum + (parseInt(h.jumlah) || 0),
      0
    ),

    // Statistik Keuangan
    // Semua data keuangan adalah pengeluaran (Pembelian Bahan Baku atau Operasional)
    // Field yang digunakan: jenisPengeluaran (bukan jenisTransaksi)
    totalPengeluaran: keuangan.reduce((sum, k) => {
      const nilai = parseFloat(k.nilai) || 0;
      return sum + nilai;
    }, 0),

    // Statistik Sanitasi
    sanitasiComplete: sanitasi.filter((s) => s.status === "Complete").length,
    sanitasiUncomplete: sanitasi.filter((s) => s.status === "Uncomplete")
      .length,

    // Statistik Users
    usersAktif: users.filter((u) => u.status === "Aktif").length,
    usersNonAktif: users.filter((u) => u.status !== "Aktif").length,
  };

  return stats;
}

// Fungsi untuk animasi counter
function animateValue(element, start, end, duration, isCurrency = false) {
  if (start === end) return;

  const startTime = performance.now();
  const isNumber = typeof end === "number";

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Easing function (ease-out)
    const easeOut = 1 - Math.pow(1 - progress, 3);

    let current;
    if (isNumber) {
      current = Math.floor(start + (end - start) * easeOut);
    } else {
      // Untuk string, langsung set
      current = end;
    }

    if (isCurrency && isNumber) {
      element.textContent = `Rp ${current.toLocaleString("id-ID")}`;
    } else if (isNumber) {
      element.textContent = current.toLocaleString("id-ID");
    } else {
      element.textContent = current;
    }

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent =
        isCurrency && isNumber
          ? `Rp ${end.toLocaleString("id-ID")}`
          : isNumber
          ? end.toLocaleString("id-ID")
          : end;
    }
  }

  requestAnimationFrame(update);
}

// Fungsi untuk menampilkan statistik cards dengan animasi
async function displayStatisticsCards(animate = false) {
  const stats = await calculateStatistics();
  const cardsContainer = document.getElementById("statisticsCards");

  const cards = [
    {
      title: "Total Pengguna",
      value: stats.totalUsers,
      icon: "bi-people",
      color: "primary",
      subtitle: `${stats.usersAktif} Aktif, ${stats.usersNonAktif} Non-Aktif`,
    },
    {
      title: "Total Bahan",
      value: stats.totalBahan,
      icon: "bi-flower1",
      color: "warning",
      subtitle: `${stats.totalJumlahBahan.toLocaleString("id-ID")} kg`,
    },
    {
      title: "Total Produksi",
      value: stats.totalProduksi,
      icon: "bi-building-gear",
      color: "info",
      subtitle: `${stats.totalBeratAwal.toLocaleString("id-ID")} kg`,
    },
    {
      title: "Hasil Produksi",
      value: stats.totalHasilProduksi,
      icon: "bi-box-seam",
      color: "success",
      subtitle: `${stats.totalJumlahKemasan.toLocaleString("id-ID")} kemasan`,
    },
    {
      title: "Total Pemasok",
      value: stats.totalPemasok,
      icon: "bi-person-heart",
      color: "danger",
      subtitle: "Pemasok terdaftar",
    },
    {
      title: "Total Sanitasi",
      value: stats.totalSanitasi,
      icon: "bi-shield-check",
      color: "secondary",
      subtitle: `${stats.sanitasiComplete} Complete, ${stats.sanitasiUncomplete} Uncomplete`,
    },
    {
      title: "Total Pengeluaran",
      value: `Rp ${stats.totalPengeluaran.toLocaleString("id-ID")}`,
      icon: "bi-arrow-down-circle",
      color: "danger",
      subtitle: "Pengeluaran bahan & operasional",
    },
  ];

  const cardsHTML = cards
    .map(
      (card, index) => `
    <div class="col-md-6 col-lg-4 col-xl-3">
      <div class="card shadow-sm border-0 h-100 statistic-card" data-card-index="${index}" style="transition: transform 0.3s ease, box-shadow 0.3s ease;">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start mb-3">
            <div>
              <h6 class="text-muted mb-1 small">${card.title}</h6>
              <h3 class="fw-bold mb-0 statistic-value" data-value="${
                card.value
              }" data-is-currency="${card.value.toString().includes("Rp")}">${
        card.value
      }</h3>
            </div>
            <div class="bg-${
              card.color
            } bg-opacity-10 rounded p-3 statistic-icon" style="transition: transform 0.3s ease;">
              <i class="bi ${card.icon} text-${card.color} fs-4"></i>
            </div>
          </div>
          <p class="text-muted small mb-0">${card.subtitle}</p>
        </div>
      </div>
    </div>
  `
    )
    .join("");

  // Jika animate dan ada previousStats, lakukan animasi
  if (animate && previousStats) {
    cardsContainer.innerHTML = cardsHTML;

    // Trigger animasi setelah DOM update
    setTimeout(() => {
      cards.forEach((card, index) => {
        const cardElement = document.querySelector(
          `[data-card-index="${index}"]`
        );
        const valueElement = cardElement.querySelector(".statistic-value");
        const iconElement = cardElement.querySelector(".statistic-icon");

        // Animasi card muncul
        cardElement.style.opacity = "0";
        cardElement.style.transform = "translateY(20px)";

        setTimeout(() => {
          cardElement.style.transition =
            "opacity 0.5s ease, transform 0.5s ease";
          cardElement.style.opacity = "1";
          cardElement.style.transform = "translateY(0)";
        }, index * 50);

        // Animasi icon pulse
        iconElement.style.animation = "pulse 0.6s ease";

        // Animasi counter jika value berubah
        const oldValue = getPreviousValue(card.title);
        const newValue = card.value;

        if (oldValue !== null && oldValue !== newValue) {
          const isCurrency = card.value.toString().includes("Rp");
          const isNumber = typeof newValue === "number";

          if (isNumber) {
            const numericValue = newValue;
            const oldNumeric =
              typeof oldValue === "number"
                ? oldValue
                : oldValue
                ? parseFloat(oldValue.toString().replace(/[^\d]/g, ""))
                : 0;

            if (oldNumeric !== numericValue) {
              valueElement.textContent = isCurrency
                ? `Rp ${oldNumeric.toLocaleString("id-ID")}`
                : oldNumeric.toLocaleString("id-ID");
              animateValue(
                valueElement,
                oldNumeric,
                numericValue,
                1000,
                isCurrency
              );
            }
          } else {
            // Untuk non-number, langsung update dengan fade effect
            valueElement.style.opacity = "0";
            setTimeout(() => {
              valueElement.textContent = newValue;
              valueElement.style.transition = "opacity 0.3s ease";
              valueElement.style.opacity = "1";
            }, 150);
          }
        }
      });
    }, 10);
  } else {
    cardsContainer.innerHTML = cardsHTML;
  }

  // Simpan stats untuk animasi berikutnya
  previousStats = stats;
}

// Helper function untuk mendapatkan previous value
function getPreviousValue(title) {
  if (!previousStats) return null;

  const titleMap = {
    "Total Pengguna": previousStats.totalUsers,
    "Total Bahan": previousStats.totalBahan,
    "Total Produksi": previousStats.totalProduksi,
    "Hasil Produksi": previousStats.totalHasilProduksi,
    "Total Pemasok": previousStats.totalPemasok,
    "Total Sanitasi": previousStats.totalSanitasi,
    "Total Pengeluaran": previousStats.totalPengeluaran,
  };

  return titleMap[title] || null;
}

// Fungsi untuk menampilkan aktivitas terkini
async function displayRecentActivity() {
  const activityContainer = document.getElementById("recentActivity");

  // Ambil data terbaru dari API atau localStorage
  let bahan = [],
    produksi = [],
    hasilProduksi = [],
    sanitasi = [],
    keuangan = [];

  try {
    if (window.API) {
      bahan = window.API.Bahan ? await window.API.Bahan.getAll() : [];
      produksi = window.API.Produksi ? await window.API.Produksi.getAll() : [];
      hasilProduksi = window.API.HasilProduksi
        ? await window.API.HasilProduksi.getAll()
        : [];
      sanitasi = window.API.Sanitasi ? await window.API.Sanitasi.getAll() : [];
      keuangan = window.API.Keuangan ? await window.API.Keuangan.getAll() : [];
    }
  } catch (error) {
    console.error("Error loading activity data from API:", error);
  }

  // Fallback to localStorage
  if (bahan.length === 0)
    bahan = JSON.parse(localStorage.getItem("bahan") || "[]");
  if (produksi.length === 0)
    produksi = JSON.parse(localStorage.getItem("produksi") || "[]");
  if (hasilProduksi.length === 0)
    hasilProduksi = JSON.parse(localStorage.getItem("hasilProduksi") || "[]");
  if (sanitasi.length === 0)
    sanitasi = JSON.parse(localStorage.getItem("sanitasi") || "[]");
  if (keuangan.length === 0)
    keuangan = JSON.parse(localStorage.getItem("keuangan") || "[]");

  // Gabungkan semua aktivitas dengan timestamp
  const activities = [];

  // Aktivitas dari bahan
  bahan.forEach((b) => {
    activities.push({
      type: "Bahan",
      title: `Bahan baru: ${b.idBahan}`,
      description: `${b.jumlah} kg ${b.varietas} dari ${b.pemasok}`,
      date: b.tanggalMasuk,
      icon: "bi-flower1",
      color: "warning",
    });
  });

  // Aktivitas dari produksi
  produksi.forEach((p) => {
    activities.push({
      type: "Produksi",
      title: `Produksi: ${p.idProduksi}`,
      description: `${p.beratSaatIni} kg - ${p.statusTahapan}`,
      date: p.tanggalSekarang || p.tanggalMasuk,
      icon: "bi-building-gear",
      color: "info",
    });
  });

  // Aktivitas dari hasil produksi
  hasilProduksi.forEach((h) => {
    activities.push({
      type: "Hasil Produksi",
      title: `${h.tipeProduk} - ${h.kemasan}`,
      description: `${h.jumlah} kemasan - ${h.jenisKopi}`,
      date: h.tanggal,
      icon: "bi-box-seam",
      color: "success",
    });
  });

  // Aktivitas dari sanitasi
  sanitasi.forEach((s) => {
    const tipeNames = {
      gudang: "Gudang & Produksi",
      peralatan: "Peralatan Produksi",
      toilet: "Toilet & Cuci Tangan",
      lingkungan: "Lingkungan Sekitar",
    };
    activities.push({
      type: "Sanitasi",
      title: `Sanitasi ${tipeNames[s.tipe] || s.tipe}`,
      description: `Petugas: ${s.namaPetugas} - ${s.status}`,
      date: s.tanggal,
      icon: "bi-shield-check",
      color: "secondary",
    });
  });

  // Aktivitas dari keuangan
  // Semua data keuangan adalah pengeluaran, menggunakan jenisPengeluaran
  keuangan.forEach((k) => {
    activities.push({
      type: "Keuangan",
      title: `Pengeluaran: ${k.jenisPengeluaran || "Tidak diketahui"}`,
      description: `Rp ${parseFloat(k.nilai || 0).toLocaleString("id-ID")}${k.notes ? ` - ${k.notes}` : ""}`,
      date: k.tanggal,
      icon: "bi-arrow-down-circle",
      color: "danger",
    });
  });

  // Sort berdasarkan tanggal (terbaru dulu)
  activities.sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    return dateB - dateA;
  });

  // Ambil 10 aktivitas terbaru
  const recentActivities = activities.slice(0, 10);

  if (recentActivities.length === 0) {
    activityContainer.innerHTML = `
      <div class="text-center text-muted py-4">
        <i class="bi bi-inbox fs-1 d-block mb-2"></i>
        <p>Tidak ada aktivitas terkini</p>
      </div>
    `;
    return;
  }

  activityContainer.innerHTML = recentActivities
    .map(
      (activity) => `
    <div class="d-flex align-items-start mb-3 pb-3 border-bottom">
      <div class="bg-${activity.color} bg-opacity-10 rounded p-2 me-3">
        <i class="bi ${activity.icon} text-${activity.color}"></i>
      </div>
      <div class="flex-grow-1">
        <h6 class="mb-1 fw-semibold">${activity.title}</h6>
        <p class="text-muted small mb-1">${activity.description}</p>
        <small class="text-muted">
          <i class="bi bi-calendar3 me-1"></i>${new Date(
            activity.date
          ).toLocaleDateString("id-ID", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </small>
      </div>
    </div>
  `
    )
    .join("");
}

// Fungsi untuk menampilkan ringkasan cepat
async function displayQuickSummary() {
  const summaryContainer = document.getElementById("quickSummary");
  const stats = await calculateStatistics();

  const summary = [
    {
      label: "Total Data",
      value:
        stats.totalBahan +
        stats.totalProduksi +
        stats.totalHasilProduksi +
        stats.totalSanitasi,
      icon: "bi-database",
    },
    {
      label: "Berat Total Produksi",
      value: `${stats.totalBeratSaatIni.toLocaleString("id-ID")} kg`,
      icon: "bi-scale",
    },
    {
      label: "Total Kemasan",
      value: `${stats.totalJumlahKemasan.toLocaleString("id-ID")}`,
      icon: "bi-box",
    },
    {
      label: "Transaksi Keuangan",
      value: stats.totalTransaksiKeuangan,
      icon: "bi-cash-stack",
    },
  ];

  summaryContainer.innerHTML = summary
    .map(
      (item) => `
    <div class="d-flex justify-content-between align-items-center mb-3 pb-3 border-bottom">
      <div class="d-flex align-items-center">
        <i class="bi ${item.icon} text-primary me-2"></i>
        <span class="fw-semibold">${item.label}</span>
      </div>
      <span class="fw-bold">${item.value}</span>
    </div>
  `
    )
    .join("");
}

// Grafik bahan masuk: sumbu kategori = pemasok (total kg dalam periode filter)
async function createBahanChart() {
  let bahan = [];
  try {
    if (window.API && window.API.Bahan) {
      bahan = await window.API.Bahan.getAll();
    } else {
      bahan = JSON.parse(localStorage.getItem("bahan") || "[]");
    }
  } catch (error) {
    console.error("Error loading bahan for chart:", error);
    bahan = JSON.parse(localStorage.getItem("bahan") || "[]");
  }
  const chartContainer = document.querySelector("#bahanChart")?.parentElement;
  if (!chartContainer) return;

  if (bahan.length === 0) {
    if (bahanChart) {
      bahanChart.destroy();
      bahanChart = null;
    }
    chartContainer.innerHTML = `
      <div class="text-center text-muted py-5">
        <i class="bi bi-inbox fs-1 d-block mb-2"></i>
        <p class="mb-0">Belum ada data bahan</p>
        <small>Data akan muncul setelah ada input bahan</small>
      </div>
    `;
    return;
  }

  const preset = dashboardChartPreset("dashboardBahanPeriodeFilter");
  const startMs = dashboardChartPeriodStartMs(preset);

  const filtered = bahan.filter((b) => {
    const t = new Date(b.tanggalMasuk).getTime();
    if (!Number.isFinite(t)) return false;
    if (startMs != null && t < startMs) return false;
    return true;
  });

  if (filtered.length === 0) {
    if (bahanChart) {
      bahanChart.destroy();
      bahanChart = null;
    }
    chartContainer.innerHTML = `
      <div class="text-center text-muted py-5">
        <i class="bi bi-calendar-x fs-1 d-block mb-2"></i>
        <p class="mb-0">Tidak ada bahan masuk pada periode ini</p>
        <small>Ubah filter waktu atau tunggu data baru</small>
      </div>
    `;
    return;
  }

  const rawTotals = {};
  filtered.forEach((b) => {
    const name = (b.pemasok && String(b.pemasok).trim()) || "Tanpa pemasok";
    rawTotals[name] = (rawTotals[name] || 0) + parseFloat(b.jumlah || 0);
  });
  const desc = Object.entries(rawTotals).sort((a, b) => b[1] - a[1]);
  const rowsTrim = dashboardTrimCategories(desc, DASHBOARD_BAR_MAX_CATEGORIES);

  const labels = rowsTrim.map(([name]) => name);
  const values = rowsTrim.map(([, v]) => v);
  const barColors = labels.map(
    (_, i) =>
      DASHBOARD_CHART_SERIES_COLORS[i % DASHBOARD_CHART_SERIES_COLORS.length]
        .replace("rgb(", "rgba(")
        .replace(")", ", 0.88)")
  );
  const borderColors = labels.map(
    (_, i) => DASHBOARD_CHART_SERIES_COLORS[i % DASHBOARD_CHART_SERIES_COLORS.length]
  );

  if (bahanChart) {
    bahanChart.destroy();
    bahanChart = null;
  }
  if (!chartContainer.querySelector("canvas")) {
    chartContainer.innerHTML = '<canvas id="bahanChart"></canvas>';
  }
  const chartCtx = document.getElementById("bahanChart");
  if (!chartCtx) return;

  bahanChart = new Chart(chartCtx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Bahan masuk",
          data: values,
          backgroundColor: barColors,
          borderColor: borderColors,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      elements: {
        bar: { borderRadius: 4, borderSkipped: false },
      },
      datasets: { bar: { maxBarThickness: 40 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function (items) {
              return items.length ? items[0].label : "";
            },
            label: function (context) {
              const num = Number(context.parsed.y) || 0;
              return `${num.toLocaleString("id-ID")} kg`;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: false,
          title: {
            display: true,
            text: "Pemasok",
            font: { size: 11, weight: "bold" },
          },
          ticks: {
            autoSkip: false,
            font: { size: 10 },
            maxRotation: 50,
            minRotation: 35,
          },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          stacked: false,
          title: {
            display: true,
            text: "Jumlah bahan masuk (kg)",
            font: { size: 11, weight: "bold" },
          },
          ticks: {
            callback: (value) =>
              typeof value === "number"
                ? value.toLocaleString("id-ID") + " kg"
                : value,
            font: { size: 10 },
          },
          grid: { color: "rgba(0, 0, 0, 0.06)" },
        },
      },
    },
  });
}

// Grafik produksi: sumbu kategori = proses pengolahan (total kg dalam periode filter)
async function createProduksiChart() {
  let produksi = [];
  let bahanRows = [];
  try {
    if (window.API && window.API.Produksi) {
      produksi = await window.API.Produksi.getAll();
    } else {
      produksi = JSON.parse(localStorage.getItem("produksi") || "[]");
    }
    if (window.API && window.API.Bahan) {
      bahanRows = await window.API.Bahan.getAll();
    } else {
      bahanRows = JSON.parse(localStorage.getItem("bahan") || "[]");
    }
  } catch (error) {
    console.error("Error loading produksi for chart:", error);
    produksi = JSON.parse(localStorage.getItem("produksi") || "[]");
    bahanRows = JSON.parse(localStorage.getItem("bahan") || "[]");
  }
  const chartContainer =
    document.querySelector("#produksiChart")?.parentElement;
  if (!chartContainer) return;

  const bahanById = new Map();
  bahanRows.forEach((b) => {
    if (b.idBahan) bahanById.set(String(b.idBahan).trim(), b);
  });

  if (produksi.length === 0) {
    if (produksiChart) {
      produksiChart.destroy();
      produksiChart = null;
    }
    chartContainer.innerHTML = `
      <div class="text-center text-muted py-5">
        <i class="bi bi-inbox fs-1 d-block mb-2"></i>
        <p class="mb-0">Belum ada data produksi</p>
        <small>Data akan muncul setelah ada input produksi</small>
      </div>
    `;
    return;
  }

  const preset = dashboardChartPreset("dashboardProduksiPeriodeFilter");
  const startMs = dashboardChartPeriodStartMs(preset);

  const filtered = produksi.filter((p) => {
    const t = dashboardProduksiMillis(p);
    if (!Number.isFinite(t)) return false;
    if (startMs != null && t < startMs) return false;
    return true;
  });

  if (filtered.length === 0) {
    if (produksiChart) {
      produksiChart.destroy();
      produksiChart = null;
    }
    chartContainer.innerHTML = `
      <div class="text-center text-muted py-5">
        <i class="bi bi-calendar-x fs-1 d-block mb-2"></i>
        <p class="mb-0">Tidak ada produksi pada periode ini</p>
        <small>Ubah filter waktu atau tunggu data baru</small>
      </div>
    `;
    return;
  }

  const procTotals = {};
  filtered.forEach((p) => {
    const label = dashboardGetProsesPengolahanTampilan(p, bahanById);
    const key = label && label !== "-" ? label : "Tanpa proses";
    procTotals[key] = (procTotals[key] || 0) + dashboardProduksiBeratKg(p);
  });
  const desc = Object.entries(procTotals).sort((a, b) => b[1] - a[1]);
  const rowsTrim = dashboardTrimCategories(desc, DASHBOARD_BAR_MAX_CATEGORIES);

  const labels = rowsTrim.map(([name]) => name);
  const values = rowsTrim.map(([, v]) => v);
  const barColors = labels.map(
    (_, i) =>
      DASHBOARD_CHART_SERIES_COLORS[i % DASHBOARD_CHART_SERIES_COLORS.length]
        .replace("rgb(", "rgba(")
        .replace(")", ", 0.88)")
  );
  const borderColors = labels.map(
    (_, i) => DASHBOARD_CHART_SERIES_COLORS[i % DASHBOARD_CHART_SERIES_COLORS.length]
  );

  if (produksiChart) {
    produksiChart.destroy();
    produksiChart = null;
  }
  if (!chartContainer.querySelector("canvas")) {
    chartContainer.innerHTML = '<canvas id="produksiChart"></canvas>';
  }
  const chartCtx = document.getElementById("produksiChart");
  if (!chartCtx) return;

  produksiChart = new Chart(chartCtx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Berat batch",
          data: values,
          backgroundColor: barColors,
          borderColor: borderColors,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      elements: {
        bar: { borderRadius: 4, borderSkipped: false },
      },
      datasets: { bar: { maxBarThickness: 40 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function (items) {
              return items.length ? items[0].label : "";
            },
            label: function (context) {
              const num = Number(context.parsed.y) || 0;
              return `${num.toLocaleString("id-ID")} kg`;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: false,
          title: {
            display: true,
            text: "Proses pengolahan",
            font: { size: 11, weight: "bold" },
          },
          ticks: {
            autoSkip: false,
            font: { size: 10 },
            maxRotation: 50,
            minRotation: 35,
          },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          stacked: false,
          title: {
            display: true,
            text: "Berat (kg) — utama berat awal batch",
            font: { size: 11, weight: "bold" },
          },
          ticks: {
            callback: (value) =>
              typeof value === "number"
                ? value.toLocaleString("id-ID") + " kg"
                : value,
            font: { size: 10 },
          },
          grid: { color: "rgba(0, 0, 0, 0.06)" },
        },
      },
    },
  });
}

// Fungsi untuk membuat grafik stok (Bar Chart)
async function createStokChart() {
  let hasilProduksi = [];
  try {
    if (window.API && window.API.HasilProduksi) {
      hasilProduksi = await window.API.HasilProduksi.getAll();
    } else {
      hasilProduksi = JSON.parse(localStorage.getItem("hasilProduksi") || "[]");
    }
  } catch (error) {
    console.error("Error loading hasil produksi for chart:", error);
    hasilProduksi = JSON.parse(localStorage.getItem("hasilProduksi") || "[]");
  }
  const chartContainer = document.querySelector("#stokChart")?.parentElement;
  const ctx = document.getElementById("stokChart");

  if (!chartContainer) return;

  // Group by tipe produk
  const stokByTipe = {};
  hasilProduksi.forEach((h) => {
    if (!stokByTipe[h.tipeProduk]) {
      stokByTipe[h.tipeProduk] = {
        totalBerat: 0,
        totalJumlah: 0,
      };
    }
    stokByTipe[h.tipeProduk].totalBerat += parseFloat(h.beratSaatIni || 0);
    stokByTipe[h.tipeProduk].totalJumlah += parseInt(h.jumlah || 0);
  });

  const labels = Object.keys(stokByTipe);

  // Jika tidak ada data, tampilkan pesan
  if (labels.length === 0) {
    if (stokChart) {
      stokChart.destroy();
      stokChart = null;
    }
    chartContainer.innerHTML = `
      <div class="text-center text-muted py-5">
        <i class="bi bi-inbox fs-1 d-block mb-2"></i>
        <p class="mb-0">Belum ada data stok</p>
        <small>Data akan muncul setelah ada hasil produksi</small>
      </div>
    `;
    return;
  }

  const beratData = labels.map((tipe) => stokByTipe[tipe].totalBerat);
  const jumlahData = labels.map((tipe) => stokByTipe[tipe].totalJumlah);

  // Color palette
  const colors = [
    "rgba(255, 99, 132, 0.8)",
    "rgba(54, 162, 235, 0.8)",
    "rgba(255, 206, 86, 0.8)",
    "rgba(75, 192, 192, 0.8)",
    "rgba(153, 102, 255, 0.8)",
    "rgba(255, 159, 64, 0.8)",
  ];

  // Destroy existing chart if any
  if (stokChart) {
    stokChart.destroy();
    stokChart = null;
  }

  // Restore canvas if it was replaced (jika container tidak berisi canvas)
  if (!chartContainer.querySelector("canvas")) {
    chartContainer.innerHTML = '<canvas id="stokChart"></canvas>';
  }

  const chartCtx = document.getElementById("stokChart");
  if (!chartCtx) return;

  stokChart = new Chart(chartCtx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Total Berat Stok (kg)",
          data: beratData,
          backgroundColor: colors.slice(0, labels.length),
          borderColor: colors
            .slice(0, labels.length)
            .map((c) => c.replace("0.8", "1")),
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: "top",
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const index = context.dataIndex;
              return [
                "Berat: " + context.parsed.y.toLocaleString("id-ID") + " kg",
                "Kemasan: " +
                  jumlahData[index].toLocaleString("id-ID") +
                  " kemasan",
              ];
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "Total Berat Stok (kg)",
            font: {
              size: 12,
              weight: "bold",
            },
          },
          ticks: {
            callback: function (value) {
              return value.toLocaleString("id-ID") + " kg";
            },
            font: {
              size: 11,
            },
          },
          grid: {
            color: "rgba(0, 0, 0, 0.05)",
          },
        },
        x: {
          ticks: {
            font: {
              size: 11,
            },
            maxRotation: 45,
            minRotation: 45,
          },
          grid: {
            display: false,
          },
        },
      },
    },
  });
}

// Fungsi untuk refresh semua statistik dengan animasi
async function refreshAllStatistics(animate = true) {
  // Disable button dan show loading
  const refreshBtn = document.getElementById("refreshBtn");
  const refreshIcon = document.getElementById("refreshIcon");

  if (refreshBtn && refreshIcon) {
    refreshBtn.disabled = true;
    refreshIcon.classList.add("spinning");
  }

  await displayStatisticsCards(animate);
  await displayRecentActivity();
  await displayQuickSummary();

  // Update charts
  await createBahanChart();
  await createProduksiChart();
  await createStokChart();

  // Tampilkan notifikasi update
  if (animate) {
    showUpdateNotification();
  }

  // Re-enable button setelah selesai
  setTimeout(() => {
    if (refreshBtn && refreshIcon) {
      refreshBtn.disabled = false;
      refreshIcon.classList.remove("spinning");
    }
  }, 1000);
}

// Fungsi untuk menampilkan notifikasi update
function showUpdateNotification() {
  // Hapus notifikasi sebelumnya jika ada
  const existingNotification = document.getElementById("updateNotification");
  if (existingNotification) {
    existingNotification.remove();
  }

  const notification = document.createElement("div");
  notification.id = "updateNotification";
  notification.className =
    "alert alert-success alert-dismissible fade show position-fixed";
  notification.style.cssText =
    "top: 100px; right: 20px; z-index: 9999; min-width: 250px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);";
  notification.innerHTML = `
    <i class="bi bi-arrow-clockwise me-2"></i>Statistik diperbarui
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;

  document.body.appendChild(notification);

  // Auto-hide setelah 3 detik
  setTimeout(() => {
    if (notification.parentNode) {
      notification.classList.remove("show");
      setTimeout(() => notification.remove(), 300);
    }
  }, 3000);
}

// Fungsi untuk check perubahan data
function checkDataChanges() {
  // Simpan timestamp terakhir check
  const lastCheck = sessionStorage.getItem("lastDataCheck") || "0";
  const currentTime = Date.now();

  // Check semua localStorage keys
  const keys = [
    "users",
    "bahan",
    "produksi",
    "hasilProduksi",
    "pemasok",
    "sanitasi",
    "keuangan",
  ];
  let hasChanges = false;

  keys.forEach((key) => {
    const data = localStorage.getItem(key);
    const dataHash = data ? btoa(data).substring(0, 20) : "";
    const storedHash = sessionStorage.getItem(`dataHash_${key}`);

    if (dataHash !== storedHash) {
      sessionStorage.setItem(`dataHash_${key}`, dataHash);
      hasChanges = true;
    }
  });

  sessionStorage.setItem("lastDataCheck", currentTime.toString());

  return hasChanges;
}

// Inisialisasi saat halaman dimuat
document.addEventListener("DOMContentLoaded", function () {
  setTimeout(async () => {
    try {
      // Initial load tanpa animasi
      await displayStatisticsCards(false);
      await displayRecentActivity();
      await displayQuickSummary();

      bindDashboardChartPeriodFilters();

      // Initialize charts
      await createBahanChart();
      await createProduksiChart();
      await createStokChart();

      // Initialize data hashes
      const keys = [
        "users",
        "bahan",
        "produksi",
        "hasilProduksi",
        "pemasok",
        "sanitasi",
        "keuangan",
      ];
      keys.forEach((key) => {
        const data = localStorage.getItem(key);
        const dataHash = data ? btoa(data).substring(0, 20) : "";
        sessionStorage.setItem(`dataHash_${key}`, dataHash);
      });

      // Auto-refresh setiap 5 detik dengan check perubahan
      updateInterval = setInterval(async () => {
        if (checkDataChanges()) {
          await refreshAllStatistics(true);
        }
      }, 5000);

      // Refresh saat window focus (jika user kembali ke tab)
      window.addEventListener("focus", async () => {
        if (checkDataChanges()) {
          await refreshAllStatistics(true);
        }
      });
    } catch (error) {
      console.error("Error initializing dashboard:", error);
    }
  }, 100);
});

// Event listener untuk refresh saat data berubah di tab/window lain
window.addEventListener("storage", async function (e) {
  if (
    e.key &&
    [
      "users",
      "bahan",
      "produksi",
      "hasilProduksi",
      "pemasok",
      "sanitasi",
      "keuangan",
    ].includes(e.key)
  ) {
    await refreshAllStatistics(true);
  }
});

// Trigger refresh saat ada perubahan data di halaman yang sama
window.addEventListener("dataUpdated", async function (e) {
  await refreshAllStatistics(true);
});

// Cleanup saat halaman ditutup
window.addEventListener("beforeunload", () => {
  if (updateInterval) {
    clearInterval(updateInterval);
  }
});
