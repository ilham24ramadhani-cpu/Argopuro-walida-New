// Data untuk laporan (MONGODB ONLY - NO localStorage)
// Data di-load dari MongoDB via API di loadAllReportData()
let bahan = [];
let produksi = [];
let hasilProduksi = [];
let sanitasi = [];
let pemasok = [];
let keuangan = [];
let pemesanan = []; // TAMBAHAN: Data pemesanan untuk laporan
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

function ringkasanProsesBahanLaporan(item) {
  const lines = item && Array.isArray(item.prosesBahan) ? item.prosesBahan : [];
  const s = lines.map((x) => x.prosesPengolahan).filter(Boolean).join(", ");
  return s || "—";
}

/** Map idBahan → dokumen bahan (selaras dengan Kelola Produksi). */
function getBahanMapForLaporan() {
  const m = new Map();
  for (const b of bahan || []) {
    if (b?.idBahan) m.set(b.idBahan, b);
  }
  return m;
}

/**
 * Nama proses untuk tampilan: jika master bahan hanya punya satu baris proses,
 * gunakan nama itu (sama seperti getProsesPengolahanTampilan di kelola_produksi.js).
 * Menghindari selisih antara dokumen produksi (string lama) vs kelola bahan/produksi.
 */
function getProsesPengolahanTampilanLaporan(prod, bahanById) {
  const map =
    bahanById instanceof Map ? bahanById : getBahanMapForLaporan();
  const b =
    prod?.idBahan && map instanceof Map ? map.get(prod.idBahan) : null;
  const lines = b?.prosesBahan;
  if (
    Array.isArray(lines) &&
    lines.length === 1 &&
    lines[0]?.prosesPengolahan
  ) {
    return String(lines[0].prosesPengolahan);
  }
  return prod?.prosesPengolahan || "-";
}

function escapeHtmlLaporan(s) {
  if (s == null || s === "") return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Catatan multi-baris di PDF; mengembalikan posisi y baru. */
function pdfAppendCatatanProduksi(doc, y, text, leftMargin = 25) {
  const raw = (text && String(text).trim()) || "";
  if (!raw) return y;
  if (y > 245) {
    doc.addPage();
    y = 20;
  }
  doc.setFont(undefined, "bold");
  doc.text("   Catatan:", leftMargin, y);
  y += 6;
  doc.setFont(undefined, "normal");
  const lines = doc.splitTextToSize(raw, 165);
  for (let i = 0; i < lines.length; i++) {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    doc.text(lines[i], leftMargin + 2, y);
    y += 5;
  }
  y += 3;
  return y;
}

/** PDF: catatanPerTahapan sebagai tabel (konsisten dengan laporan lain). */
function pdfAppendCatatanPerTahapanList(doc, y, item) {
  const rows = Array.isArray(item.catatanPerTahapan)
    ? item.catatanPerTahapan
    : [];
  const dataRows = [];
  rows.forEach((row) => {
    const cat = (row.catatan && String(row.catatan).trim()) || "";
    if (!cat) return;
    const nama = row.namaTahapan || row.tahapan || "Tahapan";
    const tgl = formatDate(row.tanggalSekarang);
    dataRows.push(["", nama, tgl, cat]);
  });
  if (dataRows.length === 0) return y;
  dataRows.forEach((r, i) => {
    r[0] = String(i + 1);
  });
  if (y > 220) {
    doc.addPage();
    y = 20;
  }
  doc.setFontSize(11);
  doc.setFont(undefined, "bold");
  doc.text("Catatan per tahapan produksi", 20, y);
  y += 7;
  const matrix = [
    ["No", "Tahapan", "Tanggal", "Catatan"],
    ...dataRows,
  ];
  return pdfRenderTableFromMatrix(doc, y, matrix, [8, 44, 28, 90]);
}

/** Baris tabel alur produksi untuk PDF & halaman laporan (dari history + baris status saat ini). */
function buildAlurProduksiTableRows(item) {
  const rows = [];
  const hist = Array.isArray(item.historyTahapan) ? item.historyTahapan : [];
  const PR = window.ProduksiRandomen;
  const fmtKg = (v) => {
    if (v == null || v === "") return "—";
    const n = typeof v === "number" ? v : parseFloat(v);
    return Number.isFinite(n) ? `${n.toLocaleString("id-ID")} kg` : "—";
  };
  const fmtKadar = (v) => {
    if (v == null || v === "") return "—";
    return `${v}%`;
  };
  const fmtRandomen = (hasilKg) => {
    if (!PR) return "—";
    const b = PR.safeNum(item.beratAwal);
    const r = PR.ratioBahanPerHasil(b, hasilKg);
    return r != null ? PR.formatRandomenRatio(r) : "—";
  };

  if (hist.length === 0) {
    const hk = PR
      ? PR.getHasilKgUntukBarisAlur(item, null, "current")
      : 0;
    rows.push({
      no: "1",
      tahapan: `${item.statusTahapan || "—"} (status saat ini)`,
      tanggal: formatDate(item.tanggalSekarang),
      beratAwal: fmtKg(item.beratAwal),
      beratAkhir: fmtKg(item.beratAkhir),
      randomen: fmtRandomen(hk),
      kadar: fmtKadar(item.kadarAir),
      catatan: (item.catatan && String(item.catatan).trim()) || "—",
    });
    return rows;
  }

  hist.forEach((h, i) => {
    const tahapan =
      h.statusTahapan ||
      h.namaTahapan ||
      h.statusTahapanSebelumnya ||
      "—";
    const hk = PR ? PR.getHasilKgUntukBarisAlur(item, h, "history") : 0;
    rows.push({
      no: String(i + 1),
      tahapan,
      tanggal: formatDate(h.tanggal),
      beratAwal: fmtKg(h.beratAwal),
      beratAkhir: fmtKg(h.beratAkhir),
      randomen: fmtRandomen(hk),
      kadar: fmtKadar(h.kadarAir),
      catatan: (h.catatan && String(h.catatan).trim()) || "—",
    });
  });
  const n = hist.length + 1;
  const hkCur = PR ? PR.getHasilKgUntukBarisAlur(item, null, "current") : 0;
  rows.push({
    no: String(n),
    tahapan: `${item.statusTahapan || "—"} (status saat ini)`,
    tanggal: formatDate(item.tanggalSekarang),
    beratAwal: fmtKg(item.beratAwal),
    beratAkhir: fmtKg(item.beratAkhir),
    randomen: fmtRandomen(hkCur),
    kadar: fmtKadar(item.kadarAir),
    catatan: (item.catatan && String(item.catatan).trim()) || "—",
  });
  return rows;
}

/**
 * Tabel PDF generik: matrix[0] = header, matrix[1..] = data.
 * hw = lebar tiap kolom (mm), jumlahnya harus sama dengan jumlah sel per baris; total 170 (margin 20–190).
 */
function pdfRenderTableFromMatrix(doc, y, matrix, hw) {
  if (!matrix || matrix.length === 0 || !hw || hw.length === 0) return y;
  const n = hw.length;
  const x = [20];
  for (let i = 0; i < n; i++) x.push(x[i] + hw[i]);
  const lineH = 2.75;
  const padT = 2.5;
  let rowTop = y;

  matrix.forEach((cells, ri) => {
    if (!cells || cells.length !== n) return;
    const isHeader = ri === 0;
    doc.setFontSize(n > 5 ? 7 : 8);
    doc.setFont(undefined, isHeader ? "bold" : "normal");
    doc.setTextColor(0, 0, 0);
    const cellLines = cells.map((text, i) =>
      doc.splitTextToSize(String(text ?? "—"), hw[i] - 1.5)
    );
    const maxLines = Math.max(1, ...cellLines.map((l) => l.length));
    const rowH = maxLines * lineH + padT * 2;

    if (rowTop + rowH > 287) {
      doc.addPage();
      rowTop = 20;
    }

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.12);
    for (let i = 0; i < n; i++) {
      if (isHeader) {
        doc.setFillColor(243, 244, 246);
        doc.rect(x[i], rowTop, hw[i], rowH, "FD");
      } else {
        doc.rect(x[i], rowTop, hw[i], rowH, "S");
      }
      cellLines[i].forEach((line, li) => {
        doc.text(line, x[i] + 0.7, rowTop + padT + 2.8 + li * lineH);
      });
    }
    rowTop += rowH;
  });

  doc.setFont(undefined, "normal");
  doc.setTextColor(0, 0, 0);
  return rowTop + 4;
}

/** Tabel 2 kolom Uraian | Nilai untuk ringkasan laporan PDF. */
function pdfRenderKeyValueTable(doc, y, pairs, options = {}) {
  if (!pairs || pairs.length === 0) return y;
  const title = options.title || null;
  let rowTop = y;
  if (title) {
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.text(title, 20, rowTop);
    rowTop += 7;
    doc.setDrawColor(210, 210, 210);
    doc.line(20, rowTop, 190, rowTop);
    rowTop += 5;
  }
  const matrix = [
    ["Uraian", "Nilai"],
    ...pairs.map((p) => {
      const a = Array.isArray(p) ? p : [p.label, p.value];
      return [String(a[0] ?? "—"), String(a[1] ?? "—")];
    }),
  ];
  return pdfRenderTableFromMatrix(doc, rowTop, matrix, [52, 118]);
}

/** Menggambar tabel alur produksi di PDF. */
function pdfRenderAlurProduksiTable(doc, y, rows) {
  if (!rows || rows.length === 0) return y;
  const matrix = [
    [
      "No",
      "Tahapan",
      "Tanggal",
      "B. awal",
      "B. akhir",
      "Randomen",
      "Kadar",
      "Catatan",
    ],
    ...rows.map((r) => [
      r.no,
      r.tahapan,
      r.tanggal,
      r.beratAwal,
      r.beratAkhir,
      r.randomen != null ? r.randomen : "—",
      r.kadar,
      r.catatan,
    ]),
  ];
  return pdfRenderTableFromMatrix(doc, y, matrix, [
    6, 38, 26, 15, 15, 14, 12, 44,
  ]);
}

/** Tabel HTML untuk accordion Detail Alur Produksi di halaman laporan. */
function buildAlurProduksiTableHtml(item) {
  const rows = buildAlurProduksiTableRows(item);
  if (!rows.length) return "";
  const thead = `<tr>
    <th scope="col" class="text-nowrap">No</th>
    <th scope="col">Tahapan</th>
    <th scope="col" class="text-nowrap">Tanggal</th>
    <th scope="col" class="text-nowrap">B. awal</th>
    <th scope="col" class="text-nowrap">B. akhir</th>
    <th scope="col" class="text-nowrap" title="kg bahan per kg hasil tahap">Randomen</th>
    <th scope="col" class="text-nowrap">Kadar</th>
    <th scope="col">Catatan</th>
  </tr>`;
  const tbody = rows
    .map(
      (r) => `
    <tr>
      <td class="text-muted text-nowrap">${escapeHtmlLaporan(r.no)}</td>
      <td>${escapeHtmlLaporan(r.tahapan)}</td>
      <td class="text-nowrap">${escapeHtmlLaporan(r.tanggal)}</td>
      <td class="text-nowrap">${escapeHtmlLaporan(r.beratAwal)}</td>
      <td class="text-nowrap">${escapeHtmlLaporan(r.beratAkhir)}</td>
      <td class="text-nowrap small">${escapeHtmlLaporan(r.randomen != null ? r.randomen : "—")}</td>
      <td class="text-nowrap">${escapeHtmlLaporan(r.kadar)}</td>
      <td class="small text-break">${escapeHtmlLaporan(r.catatan)}</td>
    </tr>`
    )
    .join("");
  return `
    <div class="mt-3 pt-3 border-top border-light">
      <p class="small fw-semibold text-muted mb-2">
        <i class="bi bi-table me-1"></i>Detail alur produksi
      </p>
      <div class="table-responsive rounded border">
        <table class="table table-sm table-bordered table-hover align-middle mb-0 table-alur-produksi">
          <thead class="table-light">${thead}</thead>
          <tbody>${tbody}</tbody>
        </table>
      </div>
    </div>
  `;
}

// Wait for API to be ready (event-based + polling fallback)
async function waitForAPI() {
  // Check if already available
  if (
    window.API &&
    window.API.Bahan &&
    window.API.Produksi &&
    window.API.Keuangan
  ) {
    console.log("✅ API already available");
    return true;
  }

  console.log("⏳ Waiting for API to be ready...");

  // Wait for APIReady event OR polling (max 5 seconds)
  return new Promise((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.warn("⚠️ Timeout waiting for APIReady event");
        const available = window.API && window.API.Bahan && window.API.Produksi;
        if (!available) {
          console.error("❌ window.API:", window.API);
          console.error(
            "Available APIs:",
            window.API ? Object.keys(window.API) : "undefined"
          );
        }
        resolve(available);
      }
    }, 5000);

    // Event listener for APIReady
    const eventHandler = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        window.removeEventListener("APIReady", eventHandler);
        console.log("✅ APIReady event received");
        resolve(
          window.API &&
            window.API.Bahan &&
            window.API.Produksi &&
            window.API.Keuangan
        );
      }
    };

    window.addEventListener("APIReady", eventHandler);

    // Polling fallback (check every 100ms)
    let pollCount = 0;
    const pollInterval = setInterval(() => {
      pollCount++;
      if (
        window.API &&
        window.API.Bahan &&
        window.API.Produksi &&
        window.API.Keuangan
      ) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          clearInterval(pollInterval);
          window.removeEventListener("APIReady", eventHandler);
          console.log(`✅ API detected via polling (attempt ${pollCount})`);
          resolve(true);
        }
      }
      if (pollCount >= 50) {
        // 5 seconds max
        clearInterval(pollInterval);
      }
    }, 100);
  });
}

// Load all data untuk laporan (MONGODB ONLY - NO localStorage fallback)
// OPTIMIZED: Menggunakan parallel loading untuk performa lebih cepat
async function loadAllReportData() {
  const startTime = performance.now();
  try {
    console.log(
      "🔄 Loading all report data from MongoDB (parallel loading)..."
    );

    // Wait for API to be ready
    const apiReady = await waitForAPI();

    if (!apiReady || !window.API) {
      const errorMsg =
        "❌ API tidak tersedia. Backend MongoDB wajib aktif. Pastikan Flask server running dan api-service.js sudah di-load.";
      console.error(errorMsg);
      console.error("window.API:", window.API);
      alert(errorMsg);
      throw new Error(errorMsg);
    }

    // OPTIMASI: Load semua data secara parallel menggunakan Promise.all()
    // Ini jauh lebih cepat daripada sequential loading
    console.log("✅ API ready, loading data in parallel...");

    const loadPromises = [];

    // Prepare all API calls
    if (window.API.Bahan) {
      loadPromises.push(
        window.API.Bahan.getAll()
          .then((data) => {
            bahan = Array.isArray(data) ? data : [];
            console.log(`✅ Loaded ${bahan.length} bahan records from MongoDB`);
          })
          .catch((err) => {
            console.warn("⚠️ Error loading bahan:", err);
            bahan = [];
          })
      );
    } else {
      bahan = [];
    }

    if (window.API.Produksi) {
      loadPromises.push(
        window.API.Produksi.getAll()
          .then((data) => {
            produksi = Array.isArray(data) ? data : [];
            console.log(
              `✅ Loaded ${produksi.length} produksi records from MongoDB`
            );
          })
          .catch((err) => {
            console.warn("⚠️ Error loading produksi:", err);
            produksi = [];
          })
      );
    } else {
      produksi = [];
    }

    if (window.API.HasilProduksi) {
      loadPromises.push(
        window.API.HasilProduksi.getAll()
          .then((data) => {
            hasilProduksi = Array.isArray(data) ? data : [];
            console.log(
              `✅ Loaded ${hasilProduksi.length} hasil produksi records from MongoDB`
            );
          })
          .catch((err) => {
            console.warn("⚠️ Error loading hasil produksi:", err);
            hasilProduksi = [];
          })
      );
    } else {
      hasilProduksi = [];
    }

    if (window.API.Sanitasi) {
      // Exclude fotos untuk performa lebih cepat
      loadPromises.push(
        window.API.Sanitasi.getAll(true)
          .then((data) => {
            sanitasi = Array.isArray(data) ? data : [];
            console.log(
              `✅ Loaded ${sanitasi.length} sanitasi records from MongoDB (fotos excluded)`
            );
          })
          .catch((err) => {
            console.warn("⚠️ Error loading sanitasi:", err);
            sanitasi = [];
          })
      );
    } else {
      sanitasi = [];
    }

    if (window.API.Pemasok) {
      loadPromises.push(
        window.API.Pemasok.getAll()
          .then((data) => {
            pemasok = Array.isArray(data) ? data : [];
            console.log(
              `✅ Loaded ${pemasok.length} pemasok records from MongoDB`
            );
          })
          .catch((err) => {
            console.warn("⚠️ Error loading pemasok:", err);
            pemasok = [];
          })
      );
    } else {
      pemasok = [];
    }

    if (window.API.Keuangan) {
      loadPromises.push(
        window.API.Keuangan.getAll()
          .then((data) => {
            keuangan = Array.isArray(data) ? data : [];
            console.log(
              `✅ Loaded ${keuangan.length} keuangan records from MongoDB`
            );
          })
          .catch((err) => {
            console.warn("⚠️ Error loading keuangan:", err);
            keuangan = [];
          })
      );
    } else {
      keuangan = [];
    }

    // TAMBAHAN: Load data pemesanan
    if (window.API.Pemesanan) {
      loadPromises.push(
        window.API.Pemesanan.getAll()
          .then((data) => {
            pemesanan = Array.isArray(data) ? data : [];
            console.log(
              `✅ Loaded ${pemesanan.length} pemesanan records from MongoDB`
            );
          })
          .catch((err) => {
            console.warn("⚠️ Error loading pemesanan:", err);
            pemesanan = [];
          })
      );
    } else {
      console.warn("⚠️ API.Pemesanan not available");
      pemesanan = [];
    }

    // Execute all API calls in parallel
    await Promise.all(loadPromises);

    // Ensure arrays
    if (!Array.isArray(bahan)) bahan = [];
    if (!Array.isArray(produksi)) produksi = [];
    if (!Array.isArray(hasilProduksi)) hasilProduksi = [];
    if (!Array.isArray(sanitasi)) sanitasi = [];
    if (!Array.isArray(pemasok)) pemasok = [];
    if (!Array.isArray(keuangan)) keuangan = [];
    if (!Array.isArray(pemesanan)) pemesanan = [];

    refreshBahanPemasokFilterOptions();

    const endTime = performance.now();
    const loadTime = ((endTime - startTime) / 1000).toFixed(2);
    console.log(
      `✅ All report data loaded from MongoDB in ${loadTime}s (parallel loading)`
    );
  } catch (error) {
    console.error("❌ Error loading report data from API:", error);
    // Set empty arrays instead of fallback to localStorage
    bahan = [];
    produksi = [];
    hasilProduksi = [];
    sanitasi = [];
    pemasok = [];
    keuangan = [];
    pemesanan = [];
    throw error;
  }
}

// Hash untuk mendeteksi perubahan data
let dataHashes = {
  bahan: null,
  produksi: null,
  hasilProduksi: null,
  sanitasi: null,
  pemasok: null,
  keuangan: null,
  pemesanan: null,
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
    "pemesanan",
  ];
  let hasChanges = false;

  // Reload data dari MongoDB via API
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
      case "pemesanan":
        currentData = pemesanan;
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
  try {
    console.log("🔄 Refreshing all tables...");

    // Reload data dari MongoDB sebelum display
    await loadAllReportData();

    console.log("📊 Displaying all tables...");
    displayBahan();
    displayProduksi();
    displaySanitasi();
    displayPemasok();
    displayKeuangan();
    displayStok();
    displayPemesananLaporan(); // TAMBAHAN: Display pemesanan
    renderWeeklyRecap();
    renderBahanPriceStats();
    renderProduksiTimeline();

    console.log("✅ All tables refreshed successfully");
  } catch (error) {
    console.error("❌ Error refreshing all tables:", error);
  }
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
  dataHashes.pemesanan = generateHash(pemesanan);
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

/**
 * Rendemen agregat untuk daftar bahan terfilter: Σ jumlah (kg) ÷ Σ berat akhir pengemasan
 * dari produksi yang idBahan-nya ada di daftar (sama dengan konsep kolom Randemen rekap mingguan).
 */
function computeRendemenAggregatForBahanItems(bahanItems) {
  const totalBahanKg = (bahanItems || []).reduce(
    (s, e) => s + safeNumber(e.jumlah),
    0
  );
  const idSet = new Set(
    (bahanItems || []).map((b) => b.idBahan).filter(Boolean)
  );
  if (idSet.size === 0) {
    return { totalBahanKg, totalPengemasanKg: 0 };
  }
  let totalPengemasanKg = 0;
  (produksi || []).forEach((p) => {
    if (!p || !idSet.has(p.idBahan)) return;
    if (!isProduksiPengemasanBeratAkhir(p)) return;
    totalPengemasanKg += parseFloat(p.beratAkhir) || 0;
  });
  return { totalBahanKg, totalPengemasanKg };
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
  bahan: { mode: "all", value: "", pemasok: "" },
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
  // hasil: () => displayHasilProduksi(), // Dihapus karena laporan hasil produksi sudah tidak digunakan
  sanitasi: () => displaySanitasi(),
  keuangan: () => displayKeuangan(),
  stok: () => displayStok(),
  pemesanan: () => displayPemesananLaporan(),
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
      {
        label: "Proses pengolahan",
        value: (item) => ringkasanProsesBahanLaporan(item),
      },
      { label: "Lunas", value: (item) => (item.lunas ? "Lunas" : "Belum") },
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
        (() => {
          const { totalBahanKg, totalPengemasanKg } =
            computeRendemenAggregatForBahanItems(items);
          const rasio = formatRandemenCell(totalBahanKg, totalPengemasanKg);
          const detail =
            totalPengemasanKg > 0
              ? `${rasio} | bahan ${formatKgValue(
                  totalBahanKg
                )}, pengemasan ${formatKgValue(totalPengemasanKg)}`
              : `${rasio} | belum ada berat akhir pengemasan untuk ID bahan pada filter ini`;
          return {
            label: "Rendemen (Σ bahan kg ÷ Σ berat akhir pengemasan)",
            value: detail,
          };
        })(),
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
      {
        label: "Randomen ID (kg bahan / kg green beans)",
        value: (item) =>
          window.ProduksiRandomen
            ? window.ProduksiRandomen.formatRandomenPerIdCell(item)
            : "—",
      },
      {
        label: "Proses",
        value: (item) => getProsesPengolahanTampilanLaporan(item),
      },
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
      {
        label: "Catatan (tahap berjalan)",
        value: (item) =>
          (item.catatan && String(item.catatan).trim()) || "-",
      },
      {
        label: "Riwayat catatan per tahapan",
        value: (item) => {
          const arr = item.catatanPerTahapan;
          if (!Array.isArray(arr) || arr.length === 0) return "-";
          const parts = arr
            .filter((r) => r && String(r.catatan || "").trim())
            .map(
              (r) =>
                `${r.namaTahapan || r.tahapan || "?"}: ${String(r.catatan).trim()}`
            );
          return parts.length ? parts.join(" | ") : "-";
        },
      },
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
      const bahanMapSummary = getBahanMapForLaporan();
      items.forEach((entry) => {
        const proses =
          getProsesPengolahanTampilanLaporan(entry, bahanMapSummary) || "-";
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
          value: prosesPalingSering
            ? `${prosesPalingSering} (${maxCount} kali)`
            : "-",
        },
        {
          label: "Proses Pengolahan Paling Sedikit Diproduksi",
          value: prosesPalingSedikit
            ? `${prosesPalingSedikit} (${minCount} kali)`
            : "-",
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
      { label: "Jenis Kopi", value: (item) => item.jenisKopi || "-" },
      {
        label: "Proses Pengolahan",
        value: (item) => item.prosesPengolahan || "-",
      },
      {
        label: "Total Berat (kg)",
        value: (item) =>
          safeNumber(item.totalBerat)
            ? `${safeNumber(item.totalBerat).toLocaleString("id-ID", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} kg`
            : "-",
      },
    ],
    filterKey: "stok",
    dataset: async () => {
      // Gunakan API Stok.getAll() seperti di displayStok()
      try {
        if (window.API && window.API.Stok && window.API.Stok.getAll) {
          return await window.API.Stok.getAll({});
        }
      } catch (error) {
        console.error("Error loading stok for export:", error);
      }
      return window.cachedStokArray || [];
    },
    dateGetter: () => null, // Stok tidak punya tanggal
    averages: [
      {
        label: "Rata-rata Berat per Item",
        compute: (items) => {
          if (!items.length) return "-";
          const totalBerat = items.reduce(
            (sum, item) => sum + safeNumber(item.totalBerat || 0),
            0
          );
          const avg = totalBerat / items.length;
          return formatKgValue(avg);
        },
      },
    ],
    extraSummary: (items) => {
      if (!items.length) return [];

      const totalBerat = items.reduce(
        (sum, item) => sum + safeNumber(item.totalBerat || 0),
        0
      );

      return [
        {
          label: "Total Berat Stok",
          value: formatKgValue(totalBerat),
        },
      ];
    },
  },
};

// Fungsi aggregateStok dihapus karena sekarang menggunakan API Stok.getAll()
// Fallback function untuk kompatibilitas jika API tidak tersedia
function aggregateStok() {
  console.warn("aggregateStok() deprecated, menggunakan API Stok.getAll()");
  return [];
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
        if (category === "bahan") {
          tableFilters[category] = { mode: "all", value: "", pemasok: "" };
          const pemSel = document.getElementById("bahanFilterPemasok");
          if (pemSel) pemSel.value = "";
        } else {
          tableFilters[category] = { mode: "all", value: "" };
        }
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

/** Bahan masuk: filter waktu + opsional pemasok (untuk tabel & rekap). */
function getBahanFilteredForDisplay() {
  let data = applyTableFilter("bahan", bahan, (item) => item.tanggalMasuk);
  const pem = tableFilters.bahan && tableFilters.bahan.pemasok;
  if (pem) {
    data = data.filter((item) => (item.pemasok || "") === pem);
  }
  return data;
}

function refreshBahanPemasokFilterOptions() {
  const sel = document.getElementById("bahanFilterPemasok");
  if (!sel) return;
  const prev =
    tableFilters.bahan && Object.prototype.hasOwnProperty.call(tableFilters.bahan, "pemasok")
      ? tableFilters.bahan.pemasok
      : "";
  const names = new Set();
  (pemasok || []).forEach((p) => {
    if (p && p.nama) names.add(String(p.nama).trim());
  });
  (bahan || []).forEach((b) => {
    if (b && b.pemasok) names.add(String(b.pemasok).trim());
  });
  sel.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = "Semua pemasok";
  sel.appendChild(optAll);
  [...names]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "id"))
    .forEach((n) => {
      const o = document.createElement("option");
      o.value = n;
      o.textContent = n;
      sel.appendChild(o);
    });
  if (!tableFilters.bahan) tableFilters.bahan = { mode: "all", value: "", pemasok: "" };
  const keep = prev && names.has(prev) ? prev : "";
  tableFilters.bahan.pemasok = keep;
  sel.value = keep;
}

function initializeBahanPemasokFilterListener() {
  const sel = document.getElementById("bahanFilterPemasok");
  if (!sel || sel.dataset.laporanBound === "1") return;
  sel.dataset.laporanBound = "1";
  sel.addEventListener("change", () => {
    if (!tableFilters.bahan) tableFilters.bahan = { mode: "all", value: "", pemasok: "" };
    tableFilters.bahan.pemasok = sel.value;
    renderTableByCategory("bahan");
  });
}

function updateBahanPemasokInsight() {
  const el = document.getElementById("bahanPemasokInsight");
  if (!el) return;
  const dateFiltered = applyTableFilter("bahan", bahan, (item) => item.tanggalMasuk);
  const pemFilter = tableFilters.bahan && tableFilters.bahan.pemasok;
  if (pemFilter) {
    const sub = dateFiltered.filter((item) => (item.pemasok || "") === pemFilter);
    const kg = sub.reduce((s, i) => s + safeNumber(i.jumlah), 0);
    el.innerHTML = `<span class="text-dark fw-semibold">${pemFilter}</span> — total masuk <strong>${formatKgValue(
      kg
    )}</strong> dari <strong>${sub.length}</strong> transaksi (sesuai filter waktu).`;
    return;
  }
  const bySupplier = {};
  dateFiltered.forEach((item) => {
    const p = (item.pemasok || "").trim() || "(Tanpa nama)";
    bySupplier[p] = (bySupplier[p] || 0) + safeNumber(item.jumlah);
  });
  const ranked = Object.entries(bySupplier).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) {
    el.textContent = "Tidak ada data pada filter waktu saat ini.";
    return;
  }
  const [topName, topKg] = ranked[0];
  el.innerHTML = `Pemasok dengan total berat terbanyak (sesuai filter waktu): <span class="text-success fw-semibold">${topName}</span> — <strong>${formatKgValue(
    topKg
  )}</strong>.`;
}

function getFilteredDataForCategory(category) {
  switch (category) {
    case "bahan":
      return getBahanFilteredForDisplay();
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
      // Gunakan cached stok array dari displayStok() atau fallback ke empty array
      return window.cachedStokArray || [];
    default:
      return [];
  }
}

/**
 * Tabel terpisah di bawah rekap produksi: randomen agregat per proses (Natural, Anaerob, …).
 * Hanya batch pengemasan dengan berat valid (sama logika ProduksiRandomen.summarizeRandomenAgregat).
 */
function htmlRekapRandomenPerProsesPengolahan(items) {
  const PR = window.ProduksiRandomen;
  if (!PR || !items || items.length === 0) {
    return "";
  }
  const bahanMap = getBahanMapForLaporan();
  const agg = PR.summarizeRandomenAgregat(items, (p) =>
    getProsesPengolahanTampilanLaporan(p, bahanMap)
  );
  const keys = Object.keys(agg.byProses || {}).sort();
  const fmtKg = (n) =>
    Number.isFinite(n)
      ? n.toLocaleString("id-ID", { maximumFractionDigits: 4 })
      : "—";

  if (keys.length === 0) {
    return `
      <div class="summary rekap-randomen-proses" style="margin-top: 24px">
        <h2>Rekap randomen per proses pengolahan</h2>
        <p class="meta" style="margin: 0 0 12px 0; color: #6b7280; font-size: 12px">
          Belum ada batch pengemasan lengkap (bahan &amp; hasil green beans / berat akhir valid) pada filter ini.
        </p>
      </div>`;
  }

  let totalBatch = 0;
  const bodyRows = keys
    .map((k) => {
      const row = agg.byProses[k];
      totalBatch += row.batch || 0;
      const r = row.hasil > 0 ? row.bahan / row.hasil : null;
      return `<tr>
      <td>${escapeHtmlLaporan(k)}</td>
      <td style="text-align: right">${row.batch ?? "—"}</td>
      <td style="text-align: right">${fmtKg(row.bahan)}</td>
      <td style="text-align: right">${fmtKg(row.hasil)}</td>
      <td style="text-align: right">${
        r != null ? PR.formatRandomenRatio(r) : "—"
      }</td>
    </tr>`;
    })
    .join("");

  const trTotal =
    agg.sumHasil > 0
      ? `<tr class="rekap-randomen-total">
      <td><strong>Total (keseluruhan)</strong></td>
      <td style="text-align: right"><strong>${totalBatch}</strong></td>
      <td style="text-align: right"><strong>${fmtKg(agg.sumBahan)}</strong></td>
      <td style="text-align: right"><strong>${fmtKg(agg.sumHasil)}</strong></td>
      <td style="text-align: right"><strong>${PR.formatRandomenRatio(
        agg.totalRatio
      )}</strong></td>
    </tr>`
      : "";

  return `
      <div class="summary rekap-randomen-proses" style="margin-top: 24px">
        <h2>Rekap randomen per proses pengolahan</h2>
        <p class="meta" style="margin: 0 0 12px 0; color: #6b7280; font-size: 12px">
          Randomen = kg bahan masuk per 1 kg hasil (green beans; jika tidak diisi dipakai berat akhir). Hanya batch yang sudah pengemasan dengan berat valid.
        </p>
        <table>
          <thead>
            <tr>
              <th>Proses pengolahan</th>
              <th style="text-align: right">Jumlah batch</th>
              <th style="text-align: right">Σ Bahan masuk (kg)</th>
              <th style="text-align: right">Σ Hasil GB / akhir (kg)</th>
              <th style="text-align: right">Randomen (kg/kg)</th>
            </tr>
          </thead>
          <tbody>
            ${bodyRows}
            ${trTotal}
          </tbody>
        </table>
      </div>`;
}

function getFilterDescription(category) {
  const filter = tableFilters[category];
  let timePart = "Periode: Semua";
  if (filter && filter.mode !== "all" && filter.value) {
    if (filter.mode === "daily") {
      timePart = `Periode: Harian (${formatDate(filter.value)})`;
    } else if (filter.mode === "monthly") {
      const date = new Date(`${filter.value}-01`);
      timePart = `Periode: Bulanan (${formatMonthYear(date)})`;
    } else if (filter.mode === "yearly") {
      timePart = `Periode: Tahunan (${filter.value})`;
    }
  }
  if (category === "bahan" && filter && filter.pemasok) {
    return `${timePart} | Pemasok: ${filter.pemasok}`;
  }
  return timePart;
}

async function exportRekap(category) {
  const config = LAPORAN_REKAP_CONFIG[category];
  if (!config) {
    alert("Konfigurasi rekap tidak ditemukan.");
    return;
  }

  // Handle async dataset untuk stok
  let data;
  if (typeof config.dataset === "function" && category === "stok") {
    data = await config.dataset();
  } else {
    data = getFilteredDataForCategory(category);
  }

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
        ${category === "produksi" ? htmlRekapRandomenPerProsesPengolahan(data) : ""}
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
    rangeElement.textContent = "Belum ada data";
    infoElement.textContent = "Belum ada data pembelian bahan baku.";
    return;
  }

  const filtered = getBahanFilteredForDisplay();
  const validEntries = filtered
    .map((item) => {
      const date = parseValidDate(item.tanggalMasuk);
      if (!date) return null;
      const jumlah = safeNumber(item.jumlah);
      if (jumlah <= 0) return null;
      const hargaPerKg = safeNumber(item.hargaPerKg);
      let totalPengeluaran = safeNumber(item.totalPengeluaran);
      if (!totalPengeluaran || totalPengeluaran <= 0) {
        totalPengeluaran = jumlah * hargaPerKg;
      }
      return {
        ...item,
        date,
        jumlah,
        hargaPerKg,
        totalPengeluaran,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.date - a.date);

  if (validEntries.length === 0) {
    avgElement.textContent = "-";
    maxElement.textContent = "-";
    supplierElement.textContent = "-";
    rangeElement.textContent = "Tidak ada data sesuai filter";
    infoElement.textContent =
      "Sesuaikan filter waktu atau pemasok, atau periksa tanggal masuk / jumlah bahan.";
    return;
  }

  let totalPengeluaranAgg = 0;
  let totalBeratAgg = 0;
  validEntries.forEach((entry) => {
    totalBeratAgg += entry.jumlah;
    totalPengeluaranAgg += entry.totalPengeluaran;
  });
  const avgHargaTertimbang =
    totalBeratAgg > 0 ? totalPengeluaranAgg / totalBeratAgg : 0;

  const maxEntry = validEntries.reduce((prev, curr) =>
    safeNumber(curr.hargaPerKg) > safeNumber(prev.hargaPerKg) ? curr : prev
  );

  const minT = Math.min(...validEntries.map((e) => e.date.getTime()));
  const maxT = Math.max(...validEntries.map((e) => e.date.getTime()));

  avgElement.textContent = formatCurrency(Math.round(avgHargaTertimbang));
  maxElement.textContent = formatCurrency(safeNumber(maxEntry.hargaPerKg));
  supplierElement.textContent = `${maxEntry.pemasok || "Tanpa pemasok"}${
    maxEntry.idBahan ? ` (${maxEntry.idBahan})` : ""
  }`;
  rangeElement.textContent = `${formatShortDate(
    new Date(minT),
    true
  )} - ${formatShortDate(new Date(maxT), true)} • ${
    validEntries.length
  } transaksi`;
  infoElement.textContent =
    "Rata-rata dihitung tertimbang (total pengeluaran ÷ total berat), sama seperti ringkasan di Rekap — mengikuti filter waktu dan pemasok di atas tabel.";
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
  const bahanById = getBahanMapForLaporan();
  const sortedProduksi = [...produksi].sort((a, b) => {
    const dateA =
      parseValidDate(a.tanggalSekarang) || parseValidDate(a.tanggalMasuk);
    const dateB =
      parseValidDate(b.tanggalSekarang) || parseValidDate(b.tanggalMasuk);
    return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
  });

  wrapper.innerHTML = sortedProduksi
    .map((item, index) =>
      buildTimelineItem(item, index === 0, index, bahanById)
    )
    .join("");
}

function buildTimelineItem(item, isFirst, index = 0, bahanById) {
  const PR = window.ProduksiRandomen;
  const randomenPerIdHtml = PR
    ? `<div class="alert alert-light border small mt-3 mb-0 py-2">
          <strong>Randomen (per ID)</strong>:
          ${escapeHtmlLaporan(PR.formatRandomenPerIdCell(item))}
          <span class="text-muted"> — kg bahan per kg green beans (berat awal ÷ berat GB atau berat akhir; per ID setelah pengemasan)</span>
        </div>
        <p class="small text-muted mt-2 mb-1 fw-semibold">Randomen per tahapan (kg bahan / kg hasil di tahap itu)</p>
        <pre class="small text-muted mb-0 bg-body-secondary rounded p-2" style="white-space:pre-wrap;font-family:inherit">${escapeHtmlLaporan(
          PR.buildRingkasanPerTahapanText(item)
        )}</pre>`
    : `<div class="alert alert-light border small mt-3 mb-0 py-2 text-muted">
          <strong>Randomen</strong>: modul perhitungan tidak dimuat
        </div>`;
  const fallbackId = `${item.idProduksi || "produksi"}-${index}`;
  const timelineId = item.id ? `produksi-${item.id}` : fallbackId;
  const steps = buildTimelineSteps(item, bahanById)
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
          ${randomenPerIdHtml}
          ${buildAlurProduksiTableHtml(item)}
        </div>
      </div>
    </div>
  `;
}

function buildTimelineSteps(item, bahanById) {
  const steps = [];
  const prosesLabel = getProsesPengolahanTampilanLaporan(item, bahanById);
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
    subtitle: prosesLabel,
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
  // Data sudah di-load dari MongoDB di loadAllReportData()
  // Tidak perlu reload dari localStorage

  const tbody = document.getElementById("tableBahan");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (bahan.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" class="text-center text-muted py-4">
          <i class="bi bi-inbox fs-1 d-block mb-2"></i>
          Tidak ada data bahan
        </td>
      </tr>
    `;
    updateBahanPemasokInsight();
    renderBahanPriceStats();
    return;
  }

  const filteredBahan = getBahanFilteredForDisplay();

  if (filteredBahan.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" class="text-center text-muted py-4">
          <i class="bi bi-funnel d-block mb-2"></i>
          Tidak ada data sesuai filter.
        </td>
      </tr>
    `;
    updateBahanPemasokInsight();
    renderBahanPriceStats();
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
      <td><small class="text-muted">${ringkasanProsesBahanLaporan(item)}</small></td>
      <td>${
        item.lunas
          ? '<span class="badge bg-success">Lunas</span>'
          : '<span class="badge bg-secondary">Belum</span>'
      }</td>
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
  updateBahanPemasokInsight();
  renderBahanPriceStats();
}

// Display tabel produksi
function displayProduksi() {
  // Data sudah di-load dari MongoDB di loadAllReportData()
  // Tidak perlu reload dari localStorage

  const tbody = document.getElementById("tableProduksi");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (produksi.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="14" class="text-center text-muted py-4">
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
        <td colspan="14" class="text-center text-muted py-4">
          <i class="bi bi-funnel d-block mb-2"></i>
          Tidak ada data sesuai filter.
        </td>
      </tr>
    `;
    return;
  }

  const bahanByIdTable = getBahanMapForLaporan();

  // Gunakan innerHTML dengan map.join() seperti di kelola_produksi.js
  tbody.innerHTML = filteredProduksi
    .map((item, index) => {
      const prosesTampilan = getProsesPengolahanTampilanLaporan(
        item,
        bahanByIdTable
      );
      const PR = window.ProduksiRandomen;
      const cellRandomenId = PR ? PR.formatRandomenPerIdCell(item) : "—";
      const titleR = PR
        ? escapeHtmlLaporan(
            String(PR.buildRingkasanPerTahapanText(item) || "").replace(
              /\n/g,
              " "
            )
          )
        : "";
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
      <td class="text-nowrap small" title="${titleR}">${escapeHtmlLaporan(cellRandomenId)}</td>
      <td><span class="badge ${(window.getProsesPengolahanBadgeClass || (() => 'bg-secondary'))(prosesTampilan)}">${prosesTampilan}</span></td>
      <td>${item.kadarAir ? item.kadarAir + "%" : "-"}</td>
      <td>${item.varietas || "-"}</td>
      <td>${formatDate(item.tanggalMasuk)}</td>
      <td>${formatDate(item.tanggalSekarang)}</td>
        <td><span class="badge ${(window.getStatusTahapanBadgeClass || (() => 'bg-secondary'))(item.statusTahapan)}">${
          item.statusTahapan || "-"
        }</span></td>
      <td class="small" style="max-width: 14rem;" title="${escapeHtmlLaporan(
        String(item.catatan || "").replace(/\n/g, " ")
      )}">${
        item.catatan && String(item.catatan).trim()
          ? escapeHtmlLaporan(
              String(item.catatan).trim().length > 80
                ? `${String(item.catatan).trim().slice(0, 80)}…`
                : String(item.catatan).trim()
            )
          : "—"
      }</td>
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

// Fungsi displayHasilProduksi dihapus karena laporan hasil produksi sudah tidak digunakan

// Display tabel sanitasi
function displaySanitasi() {
  // Data sudah di-load dari MongoDB di loadAllReportData()
  // Tidak perlu reload dari localStorage

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
  // Data sudah di-load dari MongoDB di loadAllReportData()
  // Tidak perlu reload dari localStorage

  const item = bahan.find((b) => b.id === id || b._id === id);
  if (!item) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Header
  doc.setFontSize(18);
  doc.text("LAPORAN DETAIL BAHAN MASUK", 105, 20, { align: "center" });
  doc.setFontSize(12);
  doc.text("Argopuro Walida", 105, 30, { align: "center" });
  doc.line(20, 35, 190, 35);

  let y = 48;
  const pairsBahan = [
    ["ID Bahan", item.idBahan || "—"],
    ["Pemasok", item.pemasok || "—"],
    [
      "Jumlah",
      `${item.jumlah ? item.jumlah.toLocaleString("id-ID") : "—"} kg`,
    ],
    ["Varietas", item.varietas || "—"],
    ["Harga per Kg", item.hargaPerKg ? formatCurrency(item.hargaPerKg) : "—"],
    [
      "Total Pengeluaran",
      item.totalPengeluaran ? formatCurrency(item.totalPengeluaran) : "—",
    ],
    ["Jenis Kopi", item.jenisKopi || "—"],
    ["Tanggal Masuk", formatDate(item.tanggalMasuk)],
    ["Proses pengolahan", ringkasanProsesBahanLaporan(item)],
    ["Pembayaran", item.lunas ? "LUNAS" : "Belum lunas"],
  ];
  y = pdfRenderKeyValueTable(doc, y, pairsBahan, { title: "Ringkasan" });

  // Footer
  if (y > 240) {
    doc.addPage();
    y = 20;
  } else {
    y += 10;
  }
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
  // Data sudah di-load dari MongoDB di loadAllReportData()
  // Tidak perlu reload dari localStorage

  const item = produksi.find((p) => p.id === id || p._id === id);
  if (!item) return;

  const prosesTampilanPdf = getProsesPengolahanTampilanLaporan(item);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Header
  doc.setFontSize(18);
  doc.text("LAPORAN DETAIL PRODUKSI", 105, 20, { align: "center" });
  doc.setFontSize(12);
  doc.text("Argopuro Walida", 105, 30, { align: "center" });
  doc.line(20, 35, 190, 35);

  let y = 48;
  const PRpdf = window.ProduksiRandomen;
  const rndValPdf = PRpdf ? PRpdf.computeRandomenPerId(item) : null;
  const rndPerId =
    rndValPdf != null && PRpdf
      ? `${PRpdf.formatRandomenRatio(rndValPdf)} kg bahan / kg green beans`
      : "—";
  const pairsProd = [
    ["ID Produksi", item.idProduksi || "—"],
    [
      "Berat Awal",
      `${item.beratAwal ? item.beratAwal.toLocaleString("id-ID") : "—"} kg`,
    ],
    [
      "Berat Akhir",
      `${item.beratAkhir ? item.beratAkhir.toLocaleString("id-ID") : "—"} kg`,
    ],
    ["Randomen (per ID produksi)", rndPerId],
    ["Proses Pengolahan", prosesTampilanPdf],
    ["Kadar Air", item.kadarAir ? `${item.kadarAir}%` : "—"],
    ["Varietas", item.varietas || "—"],
    ["Tanggal Masuk", formatDate(item.tanggalMasuk)],
    ["Tanggal Sekarang", formatDate(item.tanggalSekarang)],
    ["Status Tahapan", item.statusTahapan || "—"],
  ];
  if (item.jenisProduk) pairsProd.push(["Jenis Produk", item.jenisProduk]);
  if (item.ukuranKemasan)
    pairsProd.push(["Ukuran Kemasan", item.ukuranKemasan]);
  if (item.jumlahKemasan != null)
    pairsProd.push(["Jumlah Kemasan", String(item.jumlahKemasan)]);
  y = pdfRenderKeyValueTable(doc, y, pairsProd, { title: "Ringkasan" });
  y = pdfAppendCatatanPerTahapanList(doc, y, item);

  // === DETAIL ALUR PRODUKSI (tabel) ===
  y += 12;
  if (y > 200) {
    doc.addPage();
    y = 20;
  }
  doc.setFontSize(12);
  doc.setFont(undefined, "bold");
  doc.text("DETAIL ALUR PRODUKSI", 20, y);
  y += 6;
  doc.setFontSize(8);
  doc.setFont(undefined, "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(
    "Tiap baris: tahapan, tanggal, berat, randomen (kg bahan per kg hasil tahap), kadar air, catatan.",
    20,
    y
  );
  y += 6;
  doc.setTextColor(0, 0, 0);
  doc.line(20, y, 190, y);
  y += 5;
  const alurRowsPdf = buildAlurProduksiTableRows(item);
  y = pdfRenderAlurProduksiTable(doc, y, alurRowsPdf);

  if (y > 240) {
    doc.addPage();
    y = 20;
  } else {
    y += 10;
  }
  doc.line(20, y, 190, y);
  doc.setFontSize(10);
  doc.text(`Dicetak pada: ${new Date().toLocaleString("id-ID")}`, 20, y + 10);

  // Open in new tab
  const pdfBlob = doc.output("blob");
  const pdfUrl = URL.createObjectURL(pdfBlob);
  window.open(pdfUrl, "_blank");
}

// Fungsi generateHasilProduksiPDF dihapus karena laporan hasil produksi sudah tidak digunakan
function generateHasilProduksiPDF(id) {
  console.warn("generateHasilProduksiPDF tidak lagi digunakan");
  return;
  // Data sudah di-load dari MongoDB di loadAllReportData()
  // Tidak perlu reload dari localStorage

  const item = hasilProduksi.find((h) => h.id === id || h._id === id);
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
    doc.text("Proses pengolahan:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(ringkasanProsesBahanLaporan(bahanData), 60, y);
    y += 10;
    doc.setFont(undefined, "bold");
    doc.text("Pembayaran:", 20, y);
    doc.setFont(undefined, "normal");
    if (bahanData.lunas) {
      doc.setTextColor(25, 135, 84);
      doc.setFont(undefined, "bold");
      doc.text("LUNAS", 60, y);
      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, "normal");
    } else {
      doc.text("Belum lunas", 60, y);
    }
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
    doc.text(
      getProsesPengolahanTampilanLaporan(produksiData),
      60,
      y
    );
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

    y += 12;
    if (y > 200) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text("DETAIL ALUR PRODUKSI", 20, y);
    y += 8;
    doc.line(20, y, 190, y);
    y += 5;
    doc.setFont(undefined, "normal");
    const alurRowsHasilPdf = buildAlurProduksiTableRows(produksiData);
    y = pdfRenderAlurProduksiTable(doc, y, alurRowsHasilPdf);
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

  const tanggalWaktu = item.waktu
    ? `${formatDate(item.tanggal)} ${item.waktu}`
    : formatDate(item.tanggal);
  let y = 48;
  const pairsSan = [
    ["Tanggal / waktu", tanggalWaktu],
    ["Tipe Sanitasi", tipeSanitasiNames[item.tipe] || item.tipe || "—"],
    ["Nama Petugas", item.namaPetugas || "—"],
    ["Status", item.status || "—"],
  ];
  y = pdfRenderKeyValueTable(doc, y, pairsSan, { title: "Ringkasan" });

  if (item.checklist) {
    const chkRows = [["Item", "Status"]];
    if (typeof item.checklist === "object" && !Array.isArray(item.checklist)) {
      Object.keys(item.checklist).forEach((key) => {
        const ok = item.checklist[key];
        chkRows.push([key, ok ? "Selesai" : "Belum"]);
      });
    } else if (Array.isArray(item.checklist)) {
      item.checklist.forEach((check) => {
        const label = check.item || check || "—";
        chkRows.push([
          String(label),
          check.checked ? "Selesai" : "Belum",
        ]);
      });
    }
    if (chkRows.length > 1) {
      if (y > 210) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(11);
      doc.setFont(undefined, "bold");
      doc.text("Checklist", 20, y);
      y += 7;
      y = pdfRenderTableFromMatrix(doc, y, chkRows, [110, 60]);
    }
  }

  if (y > 240) {
    doc.addPage();
    y = 20;
  } else {
    y += 10;
  }
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
  // Data sudah di-load dari MongoDB di loadAllReportData()
  // Tidak perlu reload dari localStorage

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
  // Data sudah di-load dari MongoDB di loadAllReportData()
  // Tidak perlu reload dari localStorage

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

// Display tabel stok - menggunakan API Stok.getAll() seperti di kelola_stok.js
async function displayStok() {
  const tbody = document.getElementById("tableStok");
  const totalBeratElement = document.getElementById("totalBeratStok");

  // Reset
  if (tbody) tbody.innerHTML = "";
  if (totalBeratElement) totalBeratElement.textContent = "-";

  try {
    let stokArray = [];
    
    // Gunakan API Stok.getAll() seperti di kelola_stok.js
    if (window.API && window.API.Stok && window.API.Stok.getAll) {
      stokArray = await window.API.Stok.getAll({});
      console.log(`✅ Loaded ${stokArray.length} stok records for laporan`);
    } else {
      console.warn("⚠️ API.Stok.getAll not available, using fallback");
      // Fallback ke aggregateStok jika API tidak tersedia
      stokArray = aggregateStok();
    }

    if (!Array.isArray(stokArray)) stokArray = [];

    if (stokArray.length === 0) {
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" class="text-center text-muted py-4">
              <i class="bi bi-inbox fs-1 d-block mb-2"></i>
              Tidak ada data stok
              <br>
              <small>Stok dari produksi tahap Pengemasan. Pastikan ada produksi dengan berat akhir.</small>
            </td>
          </tr>
        `;
      }
      return;
    }

    // Hitung total berat
    const totalBerat = stokArray.reduce(
      (sum, item) => sum + safeNumber(item.totalBerat || 0),
      0
    );

    // Update total summary
    if (totalBeratElement) {
      totalBeratElement.textContent = formatKgValue(totalBerat);
    }

    // Tampilkan tabel detail - sesuai dengan struktur di kelola_stok (tanpa kemasan, level roasting, total jumlah)
    if (tbody) {
      tbody.innerHTML = stokArray
        .map((s, index) => `
          <tr>
            <td class="text-muted">${index + 1}</td>
            <td><span class="badge bg-info">${s.tipeProduk || "-"}</span></td>
            <td><span class="badge ${(window.getJenisKopiBadgeClass || (() => "bg-secondary"))(s.jenisKopi)}">${s.jenisKopi || "-"}</span></td>
            <td>${s.prosesPengolahan || "-"}</td>
            <td class="text-end"><strong class="text-primary">${safeNumber(s.totalBerat || 0).toLocaleString("id-ID", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} kg</strong></td>
          </tr>
        `)
        .join("");
    }

    // Cache untuk export
    window.cachedStokArray = stokArray;
  } catch (error) {
    console.error("Error loading stok:", error);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center text-danger py-4">
            <i class="bi bi-exclamation-triangle fs-1 d-block mb-2"></i>
            Error memuat data stok: ${error.message}
          </td>
        </tr>
      `;
    }
  }
}

// Generate PDF untuk Stok - Optimized version
function generateStokPDF(itemKey) {
  // Tampilkan loading indicator
  const loadingToast = document.createElement("div");
  loadingToast.className =
    "position-fixed top-0 start-50 translate-middle-x mt-3";
  loadingToast.style.zIndex = "9999";
  loadingToast.innerHTML = `
    <div class="alert alert-info alert-dismissible fade show" role="alert">
      <i class="bi bi-hourglass-split me-2"></i>Sedang generate PDF...
      <div class="spinner-border spinner-border-sm ms-2" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>
  `;
  document.body.appendChild(loadingToast);

  try {
    // Parse itemKey untuk mendapatkan detail produk
    const parts = itemKey.split("|");
    if (parts.length < 5) {
      alert("Data stok tidak valid");
      loadingToast.remove();
      return;
    }

    const [tipeProduk, kemasan, jenisKopi, prosesPengolahan, levelRoasting] =
      parts;

    // Cari item stok yang sesuai - gunakan cache jika tersedia
    // Optimasi: Jangan panggil aggregateStok() jika data sudah di-cache
    let item = null;

    // Coba cari dari stokArray yang sudah di-cache (jika ada)
    if (
      typeof window.cachedStokArray !== "undefined" &&
      window.cachedStokArray
    ) {
      item = window.cachedStokArray.find(
        (s) =>
          s.tipeProduk === tipeProduk &&
          s.kemasan === kemasan &&
          s.jenisKopi === jenisKopi &&
          s.prosesPengolahan === prosesPengolahan &&
          (s.levelRoasting || "") === (levelRoasting || "")
      );
    }

    // Fallback: Cari item stok yang sesuai (jika cache tidak tersedia)
    if (!item) {
      const stokArray = aggregateStok();
      // Cache untuk penggunaan selanjutnya
      window.cachedStokArray = stokArray;
      item = stokArray.find(
        (s) =>
          s.tipeProduk === tipeProduk &&
          s.kemasan === kemasan &&
          s.jenisKopi === jenisKopi &&
          s.prosesPengolahan === prosesPengolahan &&
          (s.levelRoasting || "") === (levelRoasting || "")
      );
    }

    if (!item) {
      alert("Data stok tidak ditemukan");
      loadingToast.remove();
      return;
    }

    // Optimasi: Filter hasil produksi dengan early exit conditions
    // Pre-check untuk menghindari iterasi yang tidak perlu
    const hasilProduksiTerait = [];
    const hasilProduksiLength = hasilProduksi.length;

    // Optimasi: Check field yang paling selektif terlebih dahulu
    // Gunakan for loop dengan early exit untuk performa lebih baik
    for (let i = 0; i < hasilProduksiLength; i++) {
      const h = hasilProduksi[i];

      // Early exit 1: Skip jika isFromOrdering (check paling cepat)
      const isFromOrdering = h.isFromOrdering;
      if (
        isFromOrdering === true ||
        isFromOrdering === "true" ||
        isFromOrdering === 1
      ) {
        continue;
      }

      // Early exit 2: Check tipeProduk first (usually most selective)
      if (h.tipeProduk !== tipeProduk) continue;

      // Early exit 3: Check kemasan
      if (h.kemasan !== kemasan) continue;

      // Early exit 4: Check jenisKopi
      if (h.jenisKopi !== jenisKopi) continue;

      // Early exit 5: Check prosesPengolahan
      if (h.prosesPengolahan !== prosesPengolahan) continue;

      // Check levelRoasting (last, karena bisa kosong)
      if ((h.levelRoasting || "") !== (levelRoasting || "")) continue;

      // Semua kondisi terpenuhi, tambahkan ke array
      hasilProduksiTerait.push(h);
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Header
    doc.setFontSize(18);
    doc.text("LAPORAN DETAIL STOK PRODUK", 105, 20, { align: "center" });
    doc.setFontSize(12);
    doc.text("Argopuro Walida", 105, 30, { align: "center" });
    doc.line(20, 35, 190, 35);

    let y = 48;
    const pairsStok = [
      ["Tipe Produk", item.tipeProduk || "—"],
      ["Kemasan", item.kemasan || "—"],
      ["Jenis Kopi", item.jenisKopi || "—"],
      ["Proses Pengolahan", item.prosesPengolahan || "—"],
      ["Level Roasting", item.levelRoasting || "—"],
      [
        "Total Berat Stok",
        `${safeNumber(item.totalBerat).toLocaleString("id-ID", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} kg`,
      ],
      [
        "Total Jumlah Kemasan",
        `${safeNumber(item.totalJumlah).toLocaleString("id-ID")} kemasan`,
      ],
    ];
    y = pdfRenderKeyValueTable(doc, y, pairsStok, { title: "Ringkasan stok" });

    if (hasilProduksiTerait.length > 0) {
      if (y > 200) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(12);
      doc.setFont(undefined, "bold");
      doc.text("Detail hasil produksi", 20, y);
      y += 7;
      const hpMatrix = [
        ["ID Produksi", "Tanggal", "Berat (kg)", "Jumlah"],
        ...hasilProduksiTerait.map((hasil) => [
          hasil.idProduksi || "—",
          formatDate(hasil.tanggal || "-"),
          safeNumber(hasil.beratSaatIni).toLocaleString("id-ID", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
          safeNumber(hasil.jumlah).toLocaleString("id-ID"),
        ]),
      ];
      y = pdfRenderTableFromMatrix(doc, y, hpMatrix, [42, 38, 38, 52]);
    } else {
      if (y > 220) {
        doc.addPage();
        y = 20;
      }
      y += 6;
      doc.setFontSize(11);
      doc.setFont(undefined, "italic");
      doc.text(
        "Tidak ada detail hasil produksi untuk kombinasi produk ini",
        20,
        y
      );
      y += 8;
    }

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(10);
      doc.text(
        `Halaman ${i} dari ${pageCount}`,
        105,
        doc.internal.pageSize.height - 10,
        { align: "center" }
      );
      doc.text(
        `Dicetak pada: ${new Date().toLocaleString("id-ID")}`,
        105,
        doc.internal.pageSize.height - 5,
        { align: "center" }
      );
    }

    // Save PDF
    const fileName = `Laporan_Stok_${item.tipeProduk}_${
      item.kemasan
    }_${new Date().getTime()}.pdf`;
    doc.save(fileName);

    // Hapus loading indicator
    loadingToast.remove();

    // Tampilkan success message
    const successToast = document.createElement("div");
    successToast.className =
      "position-fixed top-0 start-50 translate-middle-x mt-3";
    successToast.style.zIndex = "9999";
    successToast.innerHTML = `
      <div class="alert alert-success alert-dismissible fade show" role="alert">
        <i class="bi bi-check-circle me-2"></i>PDF berhasil di-generate!
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
      </div>
    `;
    document.body.appendChild(successToast);
    setTimeout(() => {
      successToast.remove();
    }, 3000);
  } catch (error) {
    console.error("Error generating PDF:", error);
    loadingToast.remove();
    alert("Error saat generate PDF: " + (error.message || "Unknown error"));
  }
}

// Helper function untuk generate PDF Data Kemasan dengan QR Code URL yang benar
async function generateDataKemasanPDFWithQRCode(
  doc,
  item,
  produksiData,
  bahanData,
  pdfUrl
) {
  // Fungsi ini akan menambahkan QR Code dan Link ke PDF yang sudah dibuat
  // pdfUrl adalah URL backend yang sudah di-upload

  let y = doc.internal.pageSize.height - 60; // Mulai dari bawah halaman

  // Cek apakah perlu halaman baru
  if (y < 100) {
    doc.addPage();
    y = 50;
  }

  // ===== QRCODE & LINK SECTION =====
  doc.setFontSize(13);
  doc.setFont(undefined, "bold");
  doc.text("LINK DETAIL HASIL PRODUKSI", 20, y);
  y += 10;
  doc.line(20, y, 190, y);
  y += 12;
  doc.setFontSize(11);

  // Generate QRCode dengan URL backend
  doc.setFont(undefined, "bold");
  doc.text("QRCode:", 25, y);
  y += 10;

  try {
    console.log("🔲 Generating QRCode with backend URL:", pdfUrl);

    const canvas = document.createElement("canvas");
    const qrSize = 120;
    canvas.width = qrSize;
    canvas.height = qrSize;

    const QRCodeLib =
      window.QRCode || (typeof QRCode !== "undefined" ? QRCode : null);

    if (QRCodeLib && typeof QRCodeLib.toCanvas === "function") {
      await new Promise((resolve) => {
        try {
          QRCodeLib.toCanvas(
            canvas,
            pdfUrl,
            {
              width: qrSize,
              margin: 3,
              color: {
                dark: "#000000",
                light: "#FFFFFF",
              },
              errorCorrectionLevel: "H",
            },
            (error) => {
              if (error) {
                console.error("❌ QRCode generation error:", error);
                drawQRCodePlaceholder(canvas.getContext("2d"), qrSize);
                resolve();
              } else {
                console.log("✓ QRCode generated successfully with backend URL");
                resolve();
              }
            }
          );
        } catch (syncError) {
          console.error(
            "❌ Synchronous error in QRCode generation:",
            syncError
          );
          drawQRCodePlaceholder(canvas.getContext("2d"), qrSize);
          resolve();
        }
      });
    } else {
      drawQRCodePlaceholder(canvas.getContext("2d"), qrSize);
    }

    const qrCodeDataUrl = canvas.toDataURL("image/png");
    doc.addImage(qrCodeDataUrl, "PNG", 25, y, 60, 60);

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
    console.error("❌ Error generating QRCode:", error);
    doc.setFont(undefined, "normal");
    doc.setFontSize(10);
    doc.text("QRCode tidak dapat dibuat", 25, y);
    doc.text("Gunakan link URL di bawah", 25, y + 6);
    y += 12;
  }

  // Link URL
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
  doc.text("klik link berikut untuk membuka", 25, y);
  y += 7;
  doc.text("laporan PDF:", 25, y);
  y += 10;

  // Tampilkan URL backend
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 255);
  const urlLines = doc.splitTextToSize(pdfUrl, 160);
  let linkStartY = y;
  urlLines.forEach((line) => {
    if (y > 280) {
      doc.addPage();
      y = 20;
      linkStartY = y;
    }
    doc.text(line, 25, y);
    y += 6;
  });

  // Tambahkan clickable link
  try {
    const linkHeight = urlLines.length * 6;
    doc.link(25, linkStartY, 160, linkHeight, {
      url: pdfUrl,
    });
    console.log("✓ Clickable link added to PDF");
  } catch (error) {
    console.warn("⚠️ Could not add clickable link:", error);
  }

  doc.setTextColor(0, 0, 0);
  y += 5;
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("(Klik atau copy link di atas untuk membuka PDF)", 25, y, {
    maxWidth: 160,
  });
  doc.setTextColor(0, 0, 0);
}

// Fungsi untuk generate PDF Data Kemasan dengan QRCode
// PERBAIKAN: Upload PDF ke backend dan gunakan URL backend untuk QR Code (bukan blob URL)
async function generateDataKemasanPDF(id) {
  // Data sudah di-load dari MongoDB di loadAllReportData()
  // WAJIB menggunakan MongoDB - TIDAK ada fallback localStorage

  const item = hasilProduksi.find((h) => h.id === id);
  if (!item) {
    alert("Data tidak ditemukan!");
    return;
  }

  // Deklarasi detailPdfUrl di luar try-catch agar bisa digunakan di Step 2
  let detailPdfUrl = null;

  // Cari data produksi dan bahan terkait
  const produksiData = item.idProduksi
    ? produksi.find((p) => p.idProduksi === item.idProduksi)
    : null;
  const bahanData = item.idBahan
    ? bahan.find((b) => b.idBahan === item.idBahan)
    : null;

  // ===== STEP 1: Generate PDF Detail Hasil Produksi dan Upload ke Backend =====
  console.log("📄 Step 1: Generating detail PDF and uploading to backend...");

  try {
    // Generate PDF detail hasil produksi
    const { jsPDF: jsPDFLib } = window.jspdf;
    const detailDoc = new jsPDFLib();

    // Header
    detailDoc.setFontSize(18);
    detailDoc.text("LAPORAN DETAIL HASIL PRODUKSI", 105, 20, {
      align: "center",
    });
    detailDoc.setFontSize(12);
    detailDoc.text("Argopuro Walida", 105, 30, { align: "center" });
    detailDoc.line(20, 35, 190, 35);

    let detailY = 48;
    const pairsHasilKemasan = [
      ["ID Produksi", item.idProduksi || "—"],
      ["Tipe Produk", item.tipeProduk || "—"],
      ["Kemasan", item.kemasan || "—"],
      ["Jenis Kopi", item.jenisKopi || "—"],
      ["Proses Pengolahan", item.prosesPengolahan || "—"],
      ["Level Roasting", item.levelRoasting || "—"],
      [
        "Berat yang diproses",
        `${
          item.beratSaatIni ? item.beratSaatIni.toLocaleString("id-ID") : "—"
        } kg`,
      ],
      [
        "Jumlah kemasan",
        item.jumlah ? item.jumlah.toLocaleString("id-ID") : "—",
      ],
      ["Tanggal", formatDate(item.tanggal)],
    ];
    detailY = pdfRenderKeyValueTable(detailDoc, detailY, pairsHasilKemasan, {
      title: "Data hasil produksi",
    });

    // === DATA BAHAN MASUK ===
    if (bahanData) {
      if (detailY > 220) {
        detailDoc.addPage();
        detailY = 20;
      }
      detailY += 6;
      const pairsBahanKm = [
        ["ID Bahan", bahanData.idBahan || "—"],
        ["Pemasok", bahanData.pemasok || "—"],
        [
          "Jumlah",
          `${
            bahanData.jumlah ? bahanData.jumlah.toLocaleString("id-ID") : "—"
          } kg`,
        ],
        ["Varietas", bahanData.varietas || "—"],
        [
          "Harga per Kg",
          bahanData.hargaPerKg ? formatCurrency(bahanData.hargaPerKg) : "—",
        ],
        [
          "Total Pengeluaran",
          bahanData.totalPengeluaran
            ? formatCurrency(bahanData.totalPengeluaran)
            : "—",
        ],
        ["Jenis Kopi", bahanData.jenisKopi || "—"],
        ["Tanggal Masuk", formatDate(bahanData.tanggalMasuk)],
        ["Proses pengolahan", ringkasanProsesBahanLaporan(bahanData)],
        ["Pembayaran", bahanData.lunas ? "LUNAS" : "Belum lunas"],
      ];
      detailY = pdfRenderKeyValueTable(detailDoc, detailY, pairsBahanKm, {
        title: "Data bahan masuk",
      });
    }

    // === DATA PRODUKSI ===
    if (produksiData) {
      if (detailY > 220) {
        detailDoc.addPage();
        detailY = 20;
      }
      detailY += 6;
      const catUmum =
        produksiData.catatan && String(produksiData.catatan).trim()
          ? String(produksiData.catatan).trim()
          : "—";
      const pairsPrdKm = [
        ["ID Produksi", produksiData.idProduksi || "—"],
        ["ID Bahan", produksiData.idBahan || "—"],
        [
          "Berat Awal",
          `${
            produksiData.beratAwal
              ? produksiData.beratAwal.toLocaleString("id-ID")
              : "—"
          } kg`,
        ],
        [
          "Berat Akhir",
          `${
            produksiData.beratAkhir
              ? produksiData.beratAkhir.toLocaleString("id-ID")
              : "—"
          } kg`,
        ],
        [
          "Proses Pengolahan",
          getProsesPengolahanTampilanLaporan(produksiData),
        ],
        [
          "Kadar Air",
          produksiData.kadarAir ? `${produksiData.kadarAir}%` : "—",
        ],
        ["Varietas", produksiData.varietas || "—"],
        ["Tanggal Masuk", formatDate(produksiData.tanggalMasuk)],
        ["Tanggal Sekarang", formatDate(produksiData.tanggalSekarang)],
        ["Status tahapan", produksiData.statusTahapan || "—"],
        ["Catatan", catUmum],
      ];
      detailY = pdfRenderKeyValueTable(detailDoc, detailY, pairsPrdKm, {
        title: "Data produksi",
      });
      detailY = pdfAppendCatatanPerTahapanList(detailDoc, detailY, produksiData);
      if (detailY > 200) {
        detailDoc.addPage();
        detailY = 20;
      }
      detailDoc.setFontSize(12);
      detailDoc.setFont(undefined, "bold");
      detailDoc.text("Detail alur produksi", 20, detailY);
      detailY += 7;
      detailDoc.setFontSize(8);
      detailDoc.setFont(undefined, "normal");
      detailDoc.setTextColor(80, 80, 80);
      detailDoc.text(
        "Tiap baris: tahapan, tanggal, berat, kadar, catatan.",
        20,
        detailY
      );
      detailY += 6;
      detailDoc.setTextColor(0, 0, 0);
      detailDoc.line(20, detailY, 190, detailY);
      detailY += 5;
      detailY = pdfRenderAlurProduksiTable(
        detailDoc,
        detailY,
        buildAlurProduksiTableRows(produksiData)
      );
    }

    if (detailY > 240) {
      detailDoc.addPage();
      detailY = 20;
    } else {
      detailY += 10;
    }
    detailDoc.line(20, detailY, 190, detailY);
    detailDoc.setFontSize(10);
    detailDoc.text(
      `Dicetak pada: ${new Date().toLocaleString("id-ID")}`,
      20,
      detailY + 10
    );

    // Upload PDF detail ke backend
    const detailPdfBase64 = detailDoc.output("datauristring");

    if (!window.API || !window.API.Laporan) {
      throw new Error(
        "API.Laporan tidak tersedia. Pastikan api-service.js sudah di-load."
      );
    }

    console.log("📤 Uploading detail PDF to backend...");
    const detailUploadResult = await window.API.Laporan.uploadPdf(
      detailPdfBase64,
      "hasil-produksi-detail",
      id
    );

    if (
      !detailUploadResult ||
      !detailUploadResult.success ||
      !detailUploadResult.url
    ) {
      throw new Error(
        "Upload PDF detail gagal: " +
          (detailUploadResult?.error || "Unknown error")
      );
    }

    // PERBAIKAN: Gunakan fullUrl dari backend (absolute URL untuk QR Code)
    // JANGAN melakukan auto-repair atau modifikasi URL
    detailPdfUrl =
      detailUploadResult.fullUrl ||
      window.location.origin + detailUploadResult.url;

    console.log("✅ Detail PDF uploaded successfully!");
    console.log("✅ Detail PDF URL (for QR Code):", detailPdfUrl);
    console.log("✅ Backend response:", detailUploadResult);

    // Validasi URL - HARUS absolute URL yang valid
    if (!detailPdfUrl || typeof detailPdfUrl !== "string") {
      throw new Error("Detail PDF URL is invalid");
    }

    if (!detailPdfUrl.startsWith("http")) {
      throw new Error(
        `Invalid PDF URL from backend: ${detailPdfUrl}. URL must start with http:// or https://`
      );
    }

    console.log("✅ Detail PDF URL validated (absolute URL):", detailPdfUrl);
  } catch (error) {
    console.error("❌ Error generating/uploading detail PDF:", error);
    alert(
      "Error mengupload PDF detail: " +
        (error.message || "Unknown error") +
        "\n\nSistem akan menggunakan URL fallback."
    );
    // Jika upload gagal, throw error (TIDAK ada fallback)
    throw error;
  }

  // Validasi detailPdfUrl sebelum digunakan di Step 2
  if (!detailPdfUrl || typeof detailPdfUrl !== "string") {
    throw new Error("Detail PDF URL tidak tersedia. Pastikan Step 1 berhasil.");
  }

  if (!detailPdfUrl.startsWith("http")) {
    throw new Error(
      `Detail PDF URL tidak valid: ${detailPdfUrl}. URL harus dimulai dengan http:// atau https://`
    );
  }

  // ===== STEP 2: Generate PDF Data Kemasan dengan QR Code yang menunjuk ke URL backend =====
  console.log("📄 Step 2: Generating Data Kemasan PDF with QR Code...");

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

  let y = 48;
  const pairsKmCover = [
    ["Jenis Kopi", item.jenisKopi || "—"],
    ["Proses Pengolahan", item.prosesPengolahan || "—"],
    [
      "Varietas",
      bahanData && bahanData.varietas ? bahanData.varietas : "—",
    ],
    ["Tipe Produk", item.tipeProduk || "—"],
    [
      "Tanggal bahan masuk",
      bahanData && bahanData.tanggalMasuk
        ? formatDate(bahanData.tanggalMasuk)
        : "—",
    ],
    ["Tanggal hasil produksi", formatDate(item.tanggal)],
  ];
  y = pdfRenderKeyValueTable(doc, y, pairsKmCover, {
    title: "Informasi produk & tanggal",
  });

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

  // PERBAIKAN: Gunakan URL langsung dari backend tanpa modifikasi apapun
  // detailPdfUrl sudah diisi dari Step 1 dengan fullUrl dari backend
  const qrCodeUrl = detailPdfUrl; // URL absolute dari backend yang sudah valid

  // Validasi sederhana - hanya cek apakah URL valid
  if (!qrCodeUrl || typeof qrCodeUrl !== "string") {
    throw new Error("QR Code URL is invalid");
  }

  if (!qrCodeUrl.startsWith("http")) {
    throw new Error(
      `Invalid QR Code URL: ${qrCodeUrl}. URL must start with http:// or https://`
    );
  }

  console.log("🔲 QR Code URL (from backend, no modification):", qrCodeUrl);

  // 7. QRCode
  doc.setFont(undefined, "bold");
  doc.text("QRCode:", 25, y);
  y += 10;

  // Generate QRCode dengan URL dari backend (TANPA modifikasi apapun)
  try {
    console.log("🔲 Starting QR Code generation...");
    console.log("🔲 QR URL:", qrCodeUrl);

    // PERBAIKAN: Tunggu library QRCode ter-load jika belum tersedia
    let QRCodeLib = null;
    let attempts = 0;
    const maxAttempts = 10;

    while (!QRCodeLib && attempts < maxAttempts) {
      // Cek window.QRCode (umum untuk browser)
      if (window.QRCode && typeof window.QRCode.toCanvas === "function") {
        QRCodeLib = window.QRCode;
        console.log("✅ Found QRCode library: window.QRCode");
        break;
      }
      // Cek global QRCode (jika library menggunakan global)
      if (
        typeof QRCode !== "undefined" &&
        typeof QRCode.toCanvas === "function"
      ) {
        QRCodeLib = QRCode;
        console.log("✅ Found QRCode library: global QRCode");
        break;
      }
      // Cek window.qrcode (lowercase)
      if (window.qrcode && typeof window.qrcode.toCanvas === "function") {
        QRCodeLib = window.qrcode;
        console.log("✅ Found QRCode library: window.qrcode");
        break;
      }

      attempts++;
      if (attempts < maxAttempts) {
        console.log(
          `⏳ Waiting for QRCode library... (attempt ${attempts}/${maxAttempts})`
        );
        await new Promise((resolve) => setTimeout(resolve, 100)); // Tunggu 100ms
      }
    }

    // Validasi URL - HARUS absolute URL
    if (!qrCodeUrl.startsWith("http")) {
      throw new Error(
        "QR Code URL invalid - must start with http:// or https://"
      );
    }

    // Jika library masih belum ditemukan setelah menunggu
    if (!QRCodeLib) {
      console.error("❌ QRCode library not found after waiting");
      console.error("❌ Debug info:", {
        windowQRCode: typeof window.QRCode,
        globalQRCode:
          typeof QRCode !== "undefined" ? typeof QRCode : "undefined",
        windowQrcode: typeof window.qrcode,
        attempts: attempts,
      });
      throw new Error(
        "QRCode library not found. Please ensure qrcode.min.js is loaded from CDN."
      );
    }

    const canvas = document.createElement("canvas");
    const qrSize = 200;
    canvas.width = qrSize;
    canvas.height = qrSize;

    console.log("✅ QRCode library found, generating QR Code...");
    console.log("✅ QRCode URL to encode:", qrCodeUrl);
    console.log("✅ QRCode size:", qrSize, "x", qrSize);

    // Generate QR Code
    await new Promise((resolve, reject) => {
      try {
        QRCodeLib.toCanvas(
          canvas,
          qrCodeUrl,
          {
            width: 200,
            margin: 3,
            errorCorrectionLevel: "H",
            color: { dark: "#000000", light: "#FFFFFF" },
          },
          (error) => {
            if (error) {
              console.error("❌ QR generation error:", error);
              console.error("❌ Error details:", error.message);
              console.error("❌ Error stack:", error.stack);
              reject(error);
              return;
            }
            console.log("✅ QR Code generated successfully");
            console.log("✅ QR Code URL encoded:", qrCodeUrl);
            resolve();
          }
        );
      } catch (syncError) {
        console.error("❌ Synchronous error in QRCode.toCanvas:", syncError);
        console.error("❌ Sync error details:", syncError.message);
        reject(syncError);
      }
    });

    // Convert canvas ke image data dengan kualitas maksimal
    console.log("🖼️ Converting QR Code canvas to image...");
    const qrImg = canvas.toDataURL("image/png", 1.0);

    // Validasi image data
    if (!qrImg || qrImg.length < 100) {
      throw new Error("QR Code image data invalid - canvas conversion failed");
    }

    console.log("✅ QR Code image data created, length:", qrImg.length);

    // Tambahkan QR Code ke PDF
    console.log("📄 Adding QR Code to PDF...");
    doc.addImage(qrImg, "PNG", 25, y, 60, 60);
    console.log("✅ QR Code added to PDF successfully");
    console.log("✅ QR Code will scan to:", qrCodeUrl);

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
    console.error("❌ Error generating QRCode:", error);
    console.error("❌ Error message:", error.message);
    console.error("❌ Error stack:", error.stack);
    console.error("❌ Error name:", error.name);
    console.error("❌ QRCode URL that failed:", qrCodeUrl);

    // Jika error, tambahkan placeholder text
    doc.setFont(undefined, "normal");
    doc.setFontSize(10);
    doc.text("QRCode tidak dapat dibuat", 25, y);
    doc.text("Gunakan link URL di bawah", 25, y + 6);
    y += 12;

    // Log error untuk debugging
    console.warn("⚠️ QR Code generation failed, using text fallback");
  }

  // 8. Link (URL sebagai backup) - PERBAIKAN: Gunakan URL backend (BUKAN blob URL)
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
  doc.text("klik link berikut untuk membuka", 25, y);
  y += 7;
  doc.text("laporan PDF di browser:", 25, y);
  y += 10;

  // PERBAIKAN: Gunakan URL backend yang sudah di-upload (BUKAN blob URL)
  // detailPdfUrl sudah diisi dari Step 1
  const linkUrl = detailPdfUrl; // URL backend yang bisa diakses publik

  // Tampilkan URL backend di PDF (BUKAN blob URL)
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 255); // Warna biru untuk link

  // Tampilkan URL backend (bisa diakses publik)
  const urlLines = doc.splitTextToSize(linkUrl, 160);
  let linkStartY = y;
  urlLines.forEach((line) => {
    if (y > 280) {
      doc.addPage();
      y = 20;
      linkStartY = y;
    }
    doc.text(line, 25, y);
    y += 6;
  });

  // Tambahkan clickable link ke URL backend
  try {
    const linkHeight = urlLines.length * 6;
    doc.setTextColor(0, 0, 255);
    doc.link(25, linkStartY, 160, linkHeight, {
      url: linkUrl, // URL backend yang bisa diakses publik
    });
    console.log("✓ Clickable link added to PDF (backend URL):", linkUrl);
  } catch (error) {
    console.warn("⚠️ Could not add clickable link to PDF:", error);
  }

  doc.setTextColor(0, 0, 0); // Kembalikan ke hitam

  // Tambahkan instruksi
  y += 5;
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("(Klik atau copy link di atas untuk membuka PDF)", 25, y, {
    maxWidth: 160,
  });
  doc.setTextColor(0, 0, 0);

  console.log("✓ PDF Data Kemasan generated");
  console.log("✓ QRCode URL (backend):", qrCodeUrl);
  console.log("✓ Link URL (backend):", linkUrl);

  // Footer
  y = 280;
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text(
    "Dokumen ini dibuat secara otomatis oleh sistem Argopuro Walida",
    105,
    y,
    { align: "center" }
  );
  y += 6;
  const printDate = new Date().toLocaleDateString("id-ID", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  doc.text(`Tanggal Cetak: ${printDate}`, 105, y, { align: "center" });
  doc.setTextColor(0, 0, 0);

  // ===== STEP 3: Upload PDF Data Kemasan ke Backend =====
  console.log("📄 Step 3: Uploading Data Kemasan PDF to backend...");

  try {
    // Generate PDF sebagai base64
    const pdfBase64 = doc.output("datauristring");

    // Upload PDF ke backend
    if (!window.API || !window.API.Laporan) {
      throw new Error(
        "API.Laporan tidak tersedia. Pastikan api-service.js sudah di-load."
      );
    }

    console.log("📤 Uploading Data Kemasan PDF to backend...");
    const uploadResult = await window.API.Laporan.uploadPdf(
      pdfBase64,
      "data-kemasan",
      id
    );

    if (!uploadResult || !uploadResult.success || !uploadResult.url) {
      throw new Error(
        "Upload PDF gagal: " + (uploadResult?.error || "Unknown error")
      );
    }

    // PERBAIKAN: Gunakan fullUrl dari backend (absolute URL)
    // JANGAN melakukan auto-repair atau modifikasi URL
    const finalPdfUrl =
      uploadResult.fullUrl || window.location.origin + uploadResult.url;

    console.log("✅ Data Kemasan PDF uploaded successfully!");
    console.log("✅ Final PDF URL from backend:", finalPdfUrl);
    console.log("✅ Upload result:", uploadResult);

    // Validasi URL - HARUS absolute URL yang valid
    if (!finalPdfUrl || typeof finalPdfUrl !== "string") {
      console.error("❌ Invalid PDF URL:", finalPdfUrl);
      alert("Error: URL PDF tidak valid. Silakan coba lagi.");
      return;
    }

    if (!finalPdfUrl.startsWith("http")) {
      console.error("❌ Invalid PDF URL format:", finalPdfUrl);
      alert(
        `Error: URL PDF tidak valid. URL harus dimulai dengan http:// atau https://\n\nURL yang diterima: ${finalPdfUrl}`
      );
      return;
    }

    console.log("🔗 Opening PDF from server:", finalPdfUrl);

    // Buka PDF langsung dari server Flask static (BUKAN blob URL)
    const newWindow = window.open(finalPdfUrl, "_blank");
    if (!newWindow) {
      console.warn("⚠️ Popup blocked, trying alternative method");
      // Jika popup blocked, buka dengan cara lain (masih menggunakan URL server)
      const link = document.createElement("a");
      link.href = finalPdfUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    console.log("✅ PDF opened from server successfully");
  } catch (error) {
    console.error("❌ Error in generateDataKemasanPDF:", error);

    // TIDAK ADA FALLBACK KE BLOB URL
    // Jika upload gagal, coba cari PDF yang sudah ada di server
    console.log("🔄 Trying to find existing PDF on server...");

    try {
      // Coba list PDF yang sudah ada
      if (window.API && window.API.Laporan) {
        const existingPdfs = await window.API.Laporan.list("data-kemasan", id);
        if (existingPdfs && existingPdfs.length > 0) {
          // Gunakan PDF terbaru
          const latestPdf = existingPdfs[0];
          const existingUrl =
            latestPdf.fullUrl || window.location.origin + latestPdf.url;

          if (existingUrl && existingUrl.includes("/static/")) {
            console.log("✅ Found existing PDF:", existingUrl);
            window.open(existingUrl, "_blank");
            return;
          }
        }
      }
    } catch (listError) {
      console.error("❌ Error listing existing PDFs:", listError);
    }

    // Jika tidak ada PDF yang ditemukan, tampilkan error
    alert(
      "Error mengupload PDF: " +
        (error.message || "Unknown error") +
        "\n\nSilakan coba lagi atau hubungi administrator."
    );

    // TIDAK ADA FALLBACK KE BLOB URL - SEMUA HARUS DARI SERVER
    console.error(
      "❌ Tidak dapat membuka PDF. Upload gagal dan tidak ada PDF yang tersedia di server."
    );
  }
}

// Helper function untuk membuat placeholder QRCode
function drawQRCodePlaceholder(ctx, size) {
  // Background putih
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, size, size);

  // Border hitam
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);

  // Pattern sederhana (simulasi QRCode)
  ctx.fillStyle = "#000000";
  const cellSize = size / 8;
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      if ((i + j) % 2 === 0) {
        ctx.fillRect(i * cellSize, j * cellSize, cellSize, cellSize);
      }
    }
  }
}

// Fungsi displayDataKemasan dihapus karena tabel Data Kemasan sudah tidak digunakan
function displayDataKemasan() {
  console.warn("displayDataKemasan tidak lagi digunakan");
  return;
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

  let y = 48;
  const pairsPem = [
    ["ID Pemasok", item.idPemasok || "—"],
    ["Nama", item.nama || "—"],
    ["Alamat", item.alamat || "—"],
    ["Kontak", item.kontak || "—"],
    ["Nama Perkebunan", item.namaPerkebunan || "—"],
    ["Status", item.status || "—"],
  ];
  y = pdfRenderKeyValueTable(doc, y, pairsPem, { title: "Ringkasan" });

  if (y > 240) {
    doc.addPage();
    y = 20;
  } else {
    y += 10;
  }
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

  let y = 48;
  const pairsKeu = [
    ["Tanggal", formatDate(item.tanggal)],
    ["Jenis Pengeluaran", item.jenisPengeluaran || "—"],
  ];
  if (item.idBahanBaku) {
    pairsKeu.push(["ID Bahan Baku", item.idBahanBaku]);
  }
  pairsKeu.push(
    ["Nilai", item.nilai ? formatCurrency(item.nilai) : "—"],
    [
      "Catatan / notes",
      item.notes && String(item.notes).trim() ? item.notes : "—",
    ]
  );
  y = pdfRenderKeyValueTable(doc, y, pairsKeu, { title: "Ringkasan" });

  if (y > 240) {
    doc.addPage();
    y = 20;
  } else {
    y += 10;
  }
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
  if (hash && hash.startsWith("#hasil-produksi-pdf-")) {
    const id = parseInt(hash.replace("#hasil-produksi-pdf-", ""));
    if (id && !isNaN(id)) {
      console.log("🔗 QRCode detected! Auto-generating PDF for ID:", id);
      // Auto-generate PDF detail hasil produksi
      setTimeout(() => {
        generateHasilProduksiPDF(id);
        // Hapus hash setelah generate untuk menghindari loop
        window.history.replaceState(null, "", window.location.pathname);
      }, 500);
    }
  }
}

// Listen untuk hash change (jika user scan QRCode saat halaman sudah terbuka)
window.addEventListener("hashchange", function () {
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
      initializeBahanPemasokFilterListener();

      // Display semua tabel
      await refreshAllTables();

      // Refresh data when storage changes (dari tab/window lain)
      window.addEventListener("storage", async function (e) {
        try {
          if (
            [
              "bahan",
              "produksi",
              "hasilProduksi",
              "sanitasi",
              "pemasok",
              "keuangan",
              "pemesanan",
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

          // Reload data dari MongoDB
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

// ==================== LAPORAN PEMESANAN ====================

// Load dan display pemesanan data untuk laporan
async function loadPemesananLaporan() {
  try {
    if (!window.API || !window.API.Pemesanan) {
      console.warn("⚠️ API.Pemesanan not available");
      return;
    }

    await loadAllReportData();
    displayPemesananLaporan();
  } catch (error) {
    console.error("❌ Error loading pemesanan for laporan:", error);
  }
}

// Display pemesanan table di laporan
function displayPemesananLaporan() {
  const tableBody = document.getElementById("tablePemesananLaporan");
  if (!tableBody) return;

  try {
    const filterTanggal = document.getElementById("pemesananFilterTanggal")
      ? document.getElementById("pemesananFilterTanggal").value
      : "";
    const filterStatus = document.getElementById("pemesananFilterStatus")
      ? document.getElementById("pemesananFilterStatus").value
      : "";
    const filterTipe = document.getElementById("pemesananFilterTipe")
      ? document.getElementById("pemesananFilterTipe").value
      : "";

    let filteredPemesanan = pemesanan.filter((p) => {
      const matchTanggal =
        !filterTanggal || p.tanggalPemesanan === filterTanggal;
      const matchStatus = !filterStatus || p.statusPemesanan === filterStatus;
      const matchTipe = !filterTipe || p.tipePemesanan === filterTipe;

      return matchTanggal && matchStatus && matchTipe;
    });

    if (filteredPemesanan.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="11" class="text-center py-4 text-muted">
            <i class="bi bi-inbox fs-1 d-block mb-2"></i>
            Tidak ada data pemesanan
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filteredPemesanan
      .map(
        (p, index) => `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${p.idPembelian || "-"}</strong></td>
        <td>${p.namaPembeli || "-"}</td>
        <td>
          <span class="badge ${
            p.tipePemesanan === "International" ? "bg-warning" : "bg-primary"
          }">
            ${p.tipePemesanan || "-"}
          </span>
        </td>
        <td>${p.negara || "-"}</td>
        <td>${p.tipeProduk || "-"}</td>
        <td>${(p.jumlahPesananKg || 0).toLocaleString("id-ID")} kg</td>
        <td>Rp ${(p.totalHarga || 0).toLocaleString("id-ID")}</td>
        <td>
          <span class="badge ${
            p.statusPemesanan === "Complete" ? "bg-success" : "bg-warning"
          }">
            ${p.statusPemesanan || "-"}
          </span>
        </td>
        <td>${formatDate(p.tanggalPemesanan)}</td>
        <td class="text-center">
          <button 
            class="btn btn-sm btn-info btn-action" 
            onclick="generateInvoicePDFFromLaporan('${
              p.idPembelian || p.id || p._id
            }')"
            title="Invoice PDF">
            <i class="bi bi-file-pdf"></i>
          </button>
        </td>
      </tr>
    `
      )
      .join("");
  } catch (error) {
    console.error("❌ Error displaying pemesanan laporan:", error);
    tableBody.innerHTML = `
      <tr>
        <td colspan="11" class="text-center py-4 text-danger">
          <i class="bi bi-exclamation-triangle fs-1 d-block mb-2"></i>
          Error menampilkan data: ${error.message}
        </td>
      </tr>
    `;
  }
}

// Export rekap pemesanan
async function exportRekapPemesanan() {
  try {
    await loadAllReportData();

    if (!window.jspdf) {
      alert("Library jsPDF belum dimuat. Silakan refresh halaman.");
      return;
    }

    const { jsPDF: jsPDFLib } = window.jspdf;
    const doc = new jsPDFLib();

    // Header
    doc.setFontSize(20);
    doc.setFont(undefined, "bold");
    doc.text("LAPORAN PEMESANAN", 105, 20, { align: "center" });
    doc.setFontSize(14);
    doc.setFont(undefined, "normal");
    doc.text("Argopuro Walida", 105, 30, { align: "center" });
    doc.text("Sistem Manajemen Produksi Kopi", 105, 37, { align: "center" });
    doc.line(20, 42, 190, 42);

    const filterTanggal = document.getElementById("pemesananFilterTanggal")
      ? document.getElementById("pemesananFilterTanggal").value
      : "";
    const filterStatus = document.getElementById("pemesananFilterStatus")
      ? document.getElementById("pemesananFilterStatus").value
      : "";
    const filterTipe = document.getElementById("pemesananFilterTipe")
      ? document.getElementById("pemesananFilterTipe").value
      : "";

    let y = 48;
    const filterPairs = [];
    if (filterTanggal) filterPairs.push(["Tanggal", filterTanggal]);
    if (filterStatus) filterPairs.push(["Status", filterStatus]);
    if (filterTipe) filterPairs.push(["Tipe pemesanan", filterTipe]);
    if (filterPairs.length > 0) {
      y = pdfRenderKeyValueTable(doc, y, filterPairs, { title: "Filter" });
    }

    const filteredPemesanan = pemesanan.filter((p) => {
      const matchTanggal =
        !filterTanggal || p.tanggalPemesanan === filterTanggal;
      const matchStatus = !filterStatus || p.statusPemesanan === filterStatus;
      const matchTipe = !filterTipe || p.tipePemesanan === filterTipe;
      return matchTanggal && matchStatus && matchTipe;
    });

    const pemMatrix = [
      [
        "No",
        "ID Pembelian",
        "Nama Pembeli",
        "Tipe",
        "Jumlah (kg)",
        "Total Harga",
        "Status",
      ],
      ...filteredPemesanan.map((p, index) => [
        String(index + 1),
        p.idPembelian || "—",
        p.namaPembeli || "—",
        p.tipePemesanan || "—",
        `${(p.jumlahPesananKg || 0).toLocaleString("id-ID")} kg`,
        `Rp ${(p.totalHarga || 0).toLocaleString("id-ID")}`,
        p.statusPemesanan || "—",
      ]),
    ];
    y = pdfRenderTableFromMatrix(doc, y, pemMatrix, [8, 32, 36, 22, 22, 28, 22]);

    const totalJumlah = filteredPemesanan.reduce(
      (sum, p) => sum + (parseFloat(p.jumlahPesananKg) || 0),
      0
    );
    const totalHarga = filteredPemesanan.reduce(
      (sum, p) => sum + (parseFloat(p.totalHarga) || 0),
      0
    );
    if (y > 220) {
      doc.addPage();
      y = 20;
    }
    y += 4;
    y = pdfRenderKeyValueTable(
      doc,
      y,
      [
        ["Total jumlah pesanan", `${totalJumlah.toLocaleString("id-ID")} kg`],
        ["Total harga", `Rp ${totalHarga.toLocaleString("id-ID")}`],
      ],
      { title: "Ringkasan" }
    );

    // Save PDF
    const filename = `laporan_pemesanan_${
      new Date().toISOString().split("T")[0]
    }.pdf`;
    doc.save(filename);
  } catch (error) {
    console.error("❌ Error exporting pemesanan rekap:", error);
    alert(`Error exporting rekap: ${error.message || "Unknown error"}`);
  }
}

// Generate invoice PDF from laporan page
// Implementasi lengkap generateInvoicePDF untuk halaman laporan
async function generateInvoicePDFFromLaporan(idPembelian) {
  try {
    // Tampilkan loading indicator
    const loadingToast = document.createElement("div");
    loadingToast.className =
      "position-fixed top-0 start-50 translate-middle-x mt-3";
    loadingToast.style.zIndex = "9999";
    loadingToast.innerHTML = `
      <div class="alert alert-info alert-dismissible fade show" role="alert">
        <i class="bi bi-hourglass-split me-2"></i>Sedang generate Invoice PDF...
        <div class="spinner-border spinner-border-sm ms-2" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>
    `;
    document.body.appendChild(loadingToast);

    // Cari data pemesanan dari array yang sudah di-load
    const p = pemesanan.find(
      (item) =>
        item.idPembelian === idPembelian ||
        item.id === parseInt(idPembelian) ||
        item._id === idPembelian ||
        String(item.id) === String(idPembelian)
    );

    if (!p) {
      loadingToast.remove();
      alert("Data pemesanan tidak ditemukan!");
      return;
    }

    console.log("📄 Generating Invoice PDF for:", p.idPembelian);

    // Wait for jsPDF library
    if (!window.jspdf) {
      loadingToast.remove();
      alert("Library jsPDF belum dimuat. Silakan refresh halaman.");
      return;
    }

    const { jsPDF: jsPDFLib } = window.jspdf;
    const doc = new jsPDFLib();

    // Header
    doc.setFontSize(20);
    doc.setFont(undefined, "bold");
    doc.text("INVOICE PEMESANAN", 105, 20, { align: "center" });
    doc.setFontSize(14);
    doc.setFont(undefined, "normal");
    doc.text("Argopuro Walida", 105, 30, { align: "center" });
    doc.text("Sistem Manajemen Produksi Kopi", 105, 37, { align: "center" });
    doc.line(20, 42, 190, 42);

    let y = 50;
    const invPairs1 = [
      ["ID Pembelian", p.idPembelian || "—"],
      [
        "Tanggal",
        formatDate(p.tanggalPemesanan || new Date().toISOString()),
      ],
      ["Status", p.statusPemesanan || "—"],
    ];
    y = pdfRenderKeyValueTable(doc, y, invPairs1, { title: "Invoice" });

    const pembeliPairs = [
      ["Nama Pembeli", p.namaPembeli || "—"],
      ["Tipe Pemesanan", p.tipePemesanan || "—"],
    ];
    if (p.tipePemesanan === "International" && p.negara) {
      pembeliPairs.push(["Negara", p.negara || "—"]);
    }
    y = pdfRenderKeyValueTable(doc, y, pembeliPairs, { title: "Data pembeli" });

    const prodPairs = [
      ["Tipe Produk", p.tipeProduk || "—"],
      ["Jenis Kopi", p.jenisKopi || "—"],
      ["Proses Pengolahan", p.prosesPengolahan || "—"],
      ["Kemasan", p.kemasan || "—"],
    ];
    y = pdfRenderKeyValueTable(doc, y, prodPairs, { title: "Data produk" });

    const hargaPairs = [
      [
        "Jumlah Pesanan",
        `${(p.jumlahPesananKg || 0).toLocaleString("id-ID")} kg`,
      ],
      [
        "Harga per Kg",
        `Rp ${(p.hargaPerKg || 0).toLocaleString("id-ID")}`,
      ],
      [
        "Total Harga",
        `Rp ${(p.totalHarga || 0).toLocaleString("id-ID")}`,
      ],
    ];
    y = pdfRenderKeyValueTable(doc, y, hargaPairs, { title: "Rincian harga" });

    // Generate PDF as base64 first (without QR Code)
    let pdfBase64 = doc.output("datauristring");

    // Upload PDF to backend FIRST to get the correct URL
    console.log("📤 Uploading Invoice PDF to backend...");

    // Extract base64 data (remove data: prefix if exists)
    let pdfBase64Data = pdfBase64;
    if (pdfBase64Data.includes(",")) {
      pdfBase64Data = pdfBase64Data.split(",")[1];
    }
    if (pdfBase64Data.startsWith("data:")) {
      pdfBase64Data = pdfBase64Data.split(",")[1];
    }

    // Check if API.Laporan exists
    if (!window.API || !window.API.Laporan || !window.API.Laporan.uploadPdf) {
      // Fallback: Save PDF directly without upload
      console.warn(
        "⚠️ API.Laporan.uploadPdf not available, saving PDF directly"
      );
      const fileName = `Invoice_${p.idPembelian}_${new Date().getTime()}.pdf`;
      doc.save(fileName);
      loadingToast.remove();

      const successToast = document.createElement("div");
      successToast.className =
        "position-fixed top-0 start-50 translate-middle-x mt-3";
      successToast.style.zIndex = "9999";
      successToast.innerHTML = `
        <div class="alert alert-success alert-dismissible fade show" role="alert">
          <i class="bi bi-check-circle me-2"></i>Invoice PDF berhasil di-generate!
          <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
      `;
      document.body.appendChild(successToast);
      setTimeout(() => {
        successToast.remove();
      }, 3000);
      return;
    }

    const uploadResult = await window.API.Laporan.uploadPdf(
      `data:application/pdf;base64,${pdfBase64Data}`,
      "invoice-pemesanan",
      p.idPembelian
    );

    if (!uploadResult || !uploadResult.success) {
      throw new Error("Failed to upload PDF");
    }

    console.log("✅ Invoice PDF uploaded successfully!");
    console.log("✅ Final PDF URL:", uploadResult.fullUrl);

    // Now generate PDF with QR Code using the correct URL
    const finalPdfUrl = uploadResult.fullUrl || uploadResult.url;

    // Validate URL
    if (!finalPdfUrl || !finalPdfUrl.startsWith("http")) {
      throw new Error("Invalid PDF URL from backend");
    }

    // Create new PDF document with QR Code
    const docWithQR = new jsPDFLib();

    // Copy all content from first PDF (re-generate)
    docWithQR.setFontSize(20);
    docWithQR.setFont(undefined, "bold");
    docWithQR.text("INVOICE PEMESANAN", 105, 20, { align: "center" });
    docWithQR.setFontSize(14);
    docWithQR.setFont(undefined, "normal");
    docWithQR.text("Argopuro Walida", 105, 30, { align: "center" });
    docWithQR.text("Sistem Manajemen Produksi Kopi", 105, 37, {
      align: "center",
    });
    docWithQR.line(20, 42, 190, 42);

    let yQR = 50;
    const invPairsQr1 = [
      ["ID Pembelian", p.idPembelian || "—"],
      [
        "Tanggal",
        formatDate(p.tanggalPemesanan || new Date().toISOString()),
      ],
      ["Status", p.statusPemesanan || "—"],
    ];
    yQR = pdfRenderKeyValueTable(docWithQR, yQR, invPairsQr1, {
      title: "Invoice",
    });

    const pembeliPairsQr = [
      ["Nama Pembeli", p.namaPembeli || "—"],
      ["Tipe Pemesanan", p.tipePemesanan || "—"],
    ];
    if (p.tipePemesanan === "International" && p.negara) {
      pembeliPairsQr.push(["Negara", p.negara || "—"]);
    }
    yQR = pdfRenderKeyValueTable(docWithQR, yQR, pembeliPairsQr, {
      title: "Data pembeli",
    });

    const prodPairsQr = [
      ["Tipe Produk", p.tipeProduk || "—"],
      ["Jenis Kopi", p.jenisKopi || "—"],
      ["Proses Pengolahan", p.prosesPengolahan || "—"],
      ["Kemasan", p.kemasan || "—"],
    ];
    yQR = pdfRenderKeyValueTable(docWithQR, yQR, prodPairsQr, {
      title: "Data produk",
    });

    const hargaPairsQr = [
      [
        "Jumlah Pesanan",
        `${(p.jumlahPesananKg || 0).toLocaleString("id-ID")} kg`,
      ],
      [
        "Harga per Kg",
        `Rp ${(p.hargaPerKg || 0).toLocaleString("id-ID")}`,
      ],
      [
        "Total Harga",
        `Rp ${(p.totalHarga || 0).toLocaleString("id-ID")}`,
      ],
    ];
    yQR = pdfRenderKeyValueTable(docWithQR, yQR, hargaPairsQr, {
      title: "Rincian harga",
    });

    // QR Code dengan URL yang benar
    yQR += 25;
    try {
      // Wait for QRCode library
      let QRCodeLib = null;
      let retries = 0;
      while (!QRCodeLib && retries < 50) {
        if (window.QRCode) {
          QRCodeLib = window.QRCode;
        } else if (typeof QRCode !== "undefined") {
          QRCodeLib = QRCode;
        } else if (window.qrcode) {
          QRCodeLib = window.qrcode;
        }
        if (!QRCodeLib) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          retries++;
        }
      }

      if (QRCodeLib) {
        console.log("🔲 Generating QR Code with URL:", finalPdfUrl);
        const canvas = document.createElement("canvas");
        await new Promise((resolve, reject) => {
          QRCodeLib.toCanvas(
            canvas,
            finalPdfUrl,
            {
              width: 150,
              margin: 2,
              errorCorrectionLevel: "H",
              color: {
                dark: "#000000",
                light: "#FFFFFF",
              },
            },
            (error) => {
              if (error) {
                console.error("QR Code generation error:", error);
                reject(error);
              } else {
                console.log("✅ QR Code generated successfully");
                resolve();
              }
            }
          );
        });

        const qrImg = canvas.toDataURL("image/png", 1.0);
        docWithQR.addImage(qrImg, "PNG", 20, yQR, 40, 40);
        docWithQR.setFontSize(9);
        docWithQR.setFont(undefined, "normal");
        docWithQR.text("Scan untuk melihat invoice", 70, yQR + 20);
      } else {
        console.warn("⚠️ QRCode library not available");
        docWithQR.setFontSize(10);
        docWithQR.text("QR Code tidak dapat dibuat", 20, yQR);
      }
    } catch (error) {
      console.error("❌ Error generating QR Code:", error);
      docWithQR.setFontSize(10);
      docWithQR.text("QR Code tidak dapat dibuat", 20, yQR);
    }

    // Footer
    const pageCount = docWithQR.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      docWithQR.setPage(i);
      docWithQR.setFontSize(10);
      docWithQR.text(
        `Halaman ${i} dari ${pageCount}`,
        105,
        docWithQR.internal.pageSize.height - 10,
        { align: "center" }
      );
      docWithQR.text(
        `Dicetak pada: ${new Date().toLocaleString("id-ID")}`,
        105,
        docWithQR.internal.pageSize.height - 5,
        { align: "center" }
      );
    }

    // Generate final PDF with QR Code
    const finalPdfBase64 = docWithQR.output("datauristring");

    // Upload final PDF with QR Code
    let finalPdfBase64Data = finalPdfBase64;
    if (finalPdfBase64Data.includes(",")) {
      finalPdfBase64Data = finalPdfBase64Data.split(",")[1];
    }

    try {
      const finalUploadResult = await window.API.Laporan.uploadPdf(
        `data:application/pdf;base64,${finalPdfBase64Data}`,
        "invoice-pemesanan",
        p.idPembelian
      );

      if (finalUploadResult && finalUploadResult.success) {
        console.log("✅ Final Invoice PDF with QR Code uploaded!");
        console.log("✅ Final PDF URL:", finalUploadResult.fullUrl);

        // Hapus loading indicator
        loadingToast.remove();

        // Open PDF in new window
        window.open(finalUploadResult.fullUrl, "_blank");

        // Tampilkan alert seperti di kelola_pemesanan.js
        alert(
          `Invoice PDF berhasil di-generate!\n\nURL: ${finalUploadResult.fullUrl}\n\nQR Code dapat di-scan untuk membuka invoice.`
        );
      } else {
        throw new Error("Failed to upload final PDF");
      }
    } catch (uploadError) {
      console.warn(
        "⚠️ Failed to upload PDF, saving locally instead:",
        uploadError
      );
      // Fallback: Save PDF directly
      const fileName = `Invoice_${p.idPembelian}_${new Date().getTime()}.pdf`;
      docWithQR.save(fileName);

      // Hapus loading indicator
      loadingToast.remove();
    }
  } catch (error) {
    console.error("❌ Error generating Invoice PDF:", error);

    // Remove loading indicator if still exists
    const loadingToast = document.querySelector(".alert-info");
    if (loadingToast && loadingToast.parentElement) {
      loadingToast.parentElement.remove();
    }

    alert(`Error generating invoice PDF: ${error.message || "Unknown error"}`);
  }
}

// Format date helper (if not exists)
if (typeof formatDate === "undefined") {
  function formatDate(dateString) {
    if (!dateString) return "-";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("id-ID", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch (error) {
      return dateString;
    }
  }
}

// Add event listeners for pemesanan tab
document.addEventListener("DOMContentLoaded", function () {
  // Listen for tab change to load pemesanan data
  const pemesananTab = document.getElementById("pemesanan-tab");
  if (pemesananTab) {
    pemesananTab.addEventListener("shown.bs.tab", function () {
      displayPemesananLaporan(); // Display pemesanan saat tab ditampilkan
    });
  }

  // Filter change listeners
  const pemesananFilterTanggal = document.getElementById(
    "pemesananFilterTanggal"
  );
  if (pemesananFilterTanggal) {
    pemesananFilterTanggal.addEventListener("change", displayPemesananLaporan);
  }

  const pemesananFilterStatus = document.getElementById(
    "pemesananFilterStatus"
  );
  if (pemesananFilterStatus) {
    pemesananFilterStatus.addEventListener("change", displayPemesananLaporan);
  }

  const pemesananFilterTipe = document.getElementById("pemesananFilterTipe");
  if (pemesananFilterTipe) {
    pemesananFilterTipe.addEventListener("change", displayPemesananLaporan);
  }
});
