// Dashboard Statistics Script
// Mengambil data dari localStorage dan menampilkan statistik dengan auto-update

// Variabel untuk menyimpan statistik sebelumnya (untuk animasi)
let previousStats = null;
let updateInterval = null;

// Variabel untuk menyimpan chart instances
let bahanChart = null;
let produksiChart = null;
let stokChart = null;

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

  // Fallback to localStorage (hanya jika API tidak tersedia atau data kosong)
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

  // Log untuk debugging (hanya jika ada data)
  if (keuangan.length > 0) {
    const totalNilai = keuangan.reduce(
      (sum, k) => sum + (parseFloat(k.nilai) || 0),
      0
    );
    console.log("📊 Dashboard - Keuangan data loaded:", {
      totalRecords: keuangan.length,
      totalPengeluaran: totalNilai,
      sampleRecord: keuangan[0]
        ? {
            id: keuangan[0].id,
            tanggal: keuangan[0].tanggal,
            jenisPengeluaran: keuangan[0].jenisPengeluaran,
            nilai: keuangan[0].nilai,
          }
        : null,
    });
  } else {
    console.warn(
      "⚠️ Dashboard - Tidak ada data keuangan ditemukan dari API atau localStorage"
    );
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
    totalBeratAwal: produksi.reduce(
      (sum, p) => sum + (parseFloat(p.beratAwal) || 0),
      0
    ),
    totalBeratSaatIni: produksi.reduce(
      (sum, p) => sum + (parseFloat(p.beratSaatIni) || 0),
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
    // PERBAIKAN: Data keuangan menggunakan 'jenisPengeluaran' bukan 'jenisTransaksi'
    // Semua data keuangan adalah pengeluaran (Pembelian Bahan Baku atau Operasional)
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
  // PERBAIKAN: Data keuangan menggunakan 'jenisPengeluaran' bukan 'jenisTransaksi'
  // Semua data keuangan adalah pengeluaran
  keuangan.forEach((k) => {
    activities.push({
      type: "Keuangan",
      title: `Pengeluaran: ${k.jenisPengeluaran || "Tidak diketahui"}`,
      description: `Rp ${parseFloat(k.nilai || 0).toLocaleString("id-ID")}`,
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

// Fungsi untuk membuat grafik bahan (Line Chart)
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
  const ctx = document.getElementById("bahanChart");

  if (!chartContainer) return;

  // Group data by month
  const monthlyData = {};
  bahan.forEach((b) => {
    const date = new Date(b.tanggalMasuk);
    const monthKey = `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, "0")}`;

    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {
        jumlah: 0,
        totalPengeluaran: 0,
      };
    }

    monthlyData[monthKey].jumlah += parseFloat(b.jumlah || 0);
    monthlyData[monthKey].totalPengeluaran += parseFloat(
      b.totalPengeluaran || 0
    );
  });

  // Sort by date
  const sortedMonths = Object.keys(monthlyData).sort();

  // Jika tidak ada data, tampilkan pesan
  if (sortedMonths.length === 0) {
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

  const labels = sortedMonths.map((month) => {
    const [year, monthNum] = month.split("-");
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "Mei",
      "Jun",
      "Jul",
      "Agu",
      "Sep",
      "Okt",
      "Nov",
      "Des",
    ];
    return `${monthNames[parseInt(monthNum) - 1]} ${year}`;
  });

  const jumlahData = sortedMonths.map((month) => monthlyData[month].jumlah);
  const pengeluaranData = sortedMonths.map(
    (month) => monthlyData[month].totalPengeluaran
  );

  // Destroy existing chart if any
  if (bahanChart) {
    bahanChart.destroy();
    bahanChart = null;
  }

  // Restore canvas if it was replaced (jika container tidak berisi canvas)
  if (!chartContainer.querySelector("canvas")) {
    chartContainer.innerHTML = '<canvas id="bahanChart"></canvas>';
  }

  const chartCtx = document.getElementById("bahanChart");
  if (!chartCtx) return;

  bahanChart = new Chart(chartCtx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Jumlah Bahan (kg)",
          data: jumlahData,
          backgroundColor: "rgba(255, 193, 7, 0.8)",
          borderColor: "rgb(255, 193, 7)",
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
              return (
                "Jumlah: " + context.parsed.y.toLocaleString("id-ID") + " kg"
              );
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "Jumlah Bahan (kg)",
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
          },
          grid: {
            display: false,
          },
        },
      },
    },
  });
}

// Fungsi untuk membuat grafik produksi (Line Chart)
async function createProduksiChart() {
  let produksi = [];
  try {
    if (window.API && window.API.Produksi) {
      produksi = await window.API.Produksi.getAll();
    } else {
      produksi = JSON.parse(localStorage.getItem("produksi") || "[]");
    }
  } catch (error) {
    console.error("Error loading produksi for chart:", error);
    produksi = JSON.parse(localStorage.getItem("produksi") || "[]");
  }
  const chartContainer =
    document.querySelector("#produksiChart")?.parentElement;
  const ctx = document.getElementById("produksiChart");

  if (!chartContainer) return;

  // Group data by month
  const monthlyData = {};
  produksi.forEach((p) => {
    const date = new Date(p.tanggalMasuk);
    const monthKey = `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, "0")}`;

    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {
        beratAwal: 0,
        beratSaatIni: 0,
        count: 0,
      };
    }

    monthlyData[monthKey].beratAwal += parseFloat(p.beratAwal || 0);
    monthlyData[monthKey].beratSaatIni += parseFloat(p.beratSaatIni || 0);
    monthlyData[monthKey].count += 1;
  });

  // Sort by date
  const sortedMonths = Object.keys(monthlyData).sort();

  // Jika tidak ada data, tampilkan pesan
  if (sortedMonths.length === 0) {
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

  const labels = sortedMonths.map((month) => {
    const [year, monthNum] = month.split("-");
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "Mei",
      "Jun",
      "Jul",
      "Agu",
      "Sep",
      "Okt",
      "Nov",
      "Des",
    ];
    return `${monthNames[parseInt(monthNum) - 1]} ${year}`;
  });

  const beratAwalData = sortedMonths.map(
    (month) => monthlyData[month].beratAwal
  );
  const beratSaatIniData = sortedMonths.map(
    (month) => monthlyData[month].beratSaatIni
  );
  const countData = sortedMonths.map((month) => monthlyData[month].count);

  // Destroy existing chart if any
  if (produksiChart) {
    produksiChart.destroy();
    produksiChart = null;
  }

  // Restore canvas if it was replaced (jika container tidak berisi canvas)
  if (!chartContainer.querySelector("canvas")) {
    chartContainer.innerHTML = '<canvas id="produksiChart"></canvas>';
  }

  const chartCtx = document.getElementById("produksiChart");
  if (!chartCtx) return;

  produksiChart = new Chart(chartCtx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Berat Produksi (kg)",
          data: beratSaatIniData,
          borderColor: "rgb(13, 110, 253)",
          backgroundColor: "rgba(13, 110, 253, 0.1)",
          tension: 0.4,
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 6,
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
              return (
                "Berat: " + context.parsed.y.toLocaleString("id-ID") + " kg"
              );
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "Berat Produksi (kg)",
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
          },
          grid: {
            display: false,
          },
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
