// Data pemesanan (MONGODB ONLY - NO localStorage fallback)
let pemesanan = [];
let pemesananData = []; // Array untuk filtering
let stokData = [];
let stokProduksiData = []; // Data stok produksi
let ordering = [];
let currentEditId = null;
let currentDeleteId = null;

// Wait for API to be ready (event-based + polling fallback)
async function waitForAPI() {
  if (window.API && window.API.Pemesanan) return true;
  return new Promise((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(!!(window.API && window.API.Pemesanan));
      }
    }, 5000);
    const eventHandler = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        window.removeEventListener("APIReady", eventHandler);
        resolve(!!(window.API && window.API.Pemesanan));
      }
    };
    window.addEventListener("APIReady", eventHandler);
    let pollCount = 0;
    const pollInterval = setInterval(() => {
      pollCount++;
      if (window.API && window.API.Pemesanan) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          clearInterval(pollInterval);
          window.removeEventListener("APIReady", eventHandler);
          resolve(true);
        }
      }
      if (pollCount >= 50) clearInterval(pollInterval);
    }, 100);
  });
}

// Load data pemesanan dari MongoDB (API ONLY - NO fallback)
// Backward compatibility function - now uses loadPemesanan()
async function loadPemesananData() {
  await loadPemesanan();
}

// Load stok data untuk pemesanan (hanya fetch & return data, tanpa sentuh DOM)
async function loadStokData() {
  console.log(
    "🔄 [LOAD STOK DATA] Loading stok data for pemesanan ordering...",
  );

  if (!window.API) {
    console.error("❌ [LOAD STOK DATA] window.API tidak tersedia");
    throw new Error("window.API tidak tersedia");
  }

  if (!window.API.Pemesanan) {
    console.error("❌ [LOAD STOK DATA] window.API.Pemesanan tidak tersedia");
    throw new Error("API.Pemesanan tidak tersedia");
  }

  if (!window.API.Pemesanan.getStok) {
    console.error(
      "❌ [LOAD STOK DATA] window.API.Pemesanan.getStok tidak tersedia",
    );
    throw new Error("API.Pemesanan.getStok tidak tersedia");
  }

  console.log("🔵 [LOAD STOK DATA] Calling API.Pemesanan.getStok()...");
  const response = await window.API.Pemesanan.getStok();
  let data = Array.isArray(response) ? response : [];

  console.log(
    `✅ [LOAD STOK DATA] Loaded ${data.length} stok records for ordering`,
  );
  return data;
}

// Load ordering data
async function loadOrderingData() {
  try {
    if (!window.API || !window.API.Ordering) {
      return;
    }

    ordering = await window.API.Ordering.getAll();
    console.log(`✅ Loaded ${ordering.length} ordering records`);

    if (!Array.isArray(ordering)) {
      ordering = [];
    }
  } catch (error) {
    console.error("❌ Error loading ordering data:", error);
    ordering = [];
  }
}

// Generate ID Pembelian (PMB-YYYYMMDD-XXX)
function generateIdPembelian() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const random = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  return `PMB-${year}${month}${day}-${random}`;
}

// Toggle field negara berdasarkan tipe pemesanan
function toggleNegaraField() {
  const tipePemesanan = document.getElementById("tipePemesanan").value;
  const fieldNegara = document.getElementById("fieldNegara");
  const negaraInput = document.getElementById("negara");

  if (tipePemesanan === "International") {
    fieldNegara.style.display = "block";
    negaraInput.required = true;
  } else {
    fieldNegara.style.display = "none";
    negaraInput.required = false;
    negaraInput.value = "";
  }
}

// Calculate total harga
function calculateTotalHarga() {
  const jumlah = parseFloat(
    document.getElementById("jumlahPesananKg").value || 0,
  );
  const harga = parseFloat(document.getElementById("hargaPerKg").value || 0);
  const total = jumlah * harga;

  document.getElementById("totalHarga").value = total
    .toLocaleString("id-ID")
    .replace(/\./g, ",");
}

// Load Master Data options
async function loadMasterDataOptions() {
  try {
    if (!window.API || !window.API.MasterData) {
      console.warn("⚠️ API.MasterData not available");
      return;
    }

    // Load Tipe Produk (standar: Green Beans dan Pixel)
    const tipeProdukList = ['Green Beans', 'Pixel'];
    const tipeProdukSelect = document.getElementById("tipeProduk");
    if (tipeProdukSelect) {
      tipeProdukSelect.innerHTML =
        '<option value="">Pilih Tipe Produk</option>';
      tipeProdukList.forEach((nama) => {
        const option = document.createElement("option");
        option.value = nama;
        option.textContent = nama;
        tipeProdukSelect.appendChild(option);
      });
    }

    // Load Proses Pengolahan
    const proses = await window.API.MasterData.proses.getAll();
    const prosesSelect = document.getElementById("prosesPengolahan");
    if (prosesSelect) {
      prosesSelect.innerHTML =
        '<option value="">Pilih Proses Pengolahan</option>';
      proses.forEach((p) => {
        const option = document.createElement("option");
        option.value = p.namaProses || p.nama;
        option.textContent = p.namaProses || p.nama;
        prosesSelect.appendChild(option);
      });
    }

    // Load Jenis Kopi
    const jenisKopi = await window.API.MasterData.jenisKopi.getAll();
    const jenisKopiSelect = document.getElementById("jenisKopi");
    if (jenisKopiSelect) {
      jenisKopiSelect.innerHTML = '<option value="">Pilih Jenis Kopi</option>';
      jenisKopi.forEach((j) => {
        const option = document.createElement("option");
        option.value = j.namaJenisKopi || j.nama;
        option.textContent = j.namaJenisKopi || j.nama;
        jenisKopiSelect.appendChild(option);
      });
    }

    // Kemasan tidak lagi digunakan di pemesanan
  } catch (error) {
    console.error("❌ Error loading master data options:", error);
  }
}

// Fungsi loadKemasanOptions dihapus - kemasan tidak lagi digunakan di pemesanan

// Filter stok table (removed - no longer needed)

// ==================== STOK PRODUKSI (READ-ONLY) ====================

// Load stok produksi data
async function loadStokProduksi() {
  try {
    console.log("🔄 [STOK PRODUKSI] Loading stok produksi data...");

    if (!window.API) {
      console.error("❌ [STOK PRODUKSI] window.API tidak tersedia");
      throw new Error("window.API tidak tersedia");
    }

    // Coba API.Pemesanan.getStok dulu
    if (window.API.Pemesanan && window.API.Pemesanan.getStok) {
      try {
        const stokFromApi = await window.API.Pemesanan.getStok();
        const list = Array.isArray(stokFromApi) ? stokFromApi : [];
        stokProduksiData = list.map(function(s) {
          return {
            idProduksi: s.idProduksi || "-",
            tipeProduk: s.tipeProduk || "-",
            jenisKopi: s.jenisKopi || "-",
            varietas: s.varietas || "-",
            prosesPengolahan: s.prosesPengolahan || "-",
            stokTersedia: parseFloat(s.stokTersedia) || 0,
            statusStok: (parseFloat(s.stokTersedia) || 0) > 0 ? "Cukup" : "Habis"
          };
        });
        console.log("✅ [STOK PRODUKSI] Loaded " + stokProduksiData.length + " stok from /api/pemesanan/stok");
        displayStokProduksi();
        return;
      } catch (apiErr) {
        console.warn("⚠️ [STOK PRODUKSI] Fallback ke perhitungan lokal:", apiErr.message);
      }
    }

    if (!window.API.Produksi || !window.API.HasilProduksi || !window.API.Bahan) {
      throw new Error("API Produksi/HasilProduksi/Bahan tidak tersedia");
    }

    const produksi = await window.API.Produksi.getAll();
    const hasilProduksi = await window.API.HasilProduksi.getAll();
    const bahan = await window.API.Bahan.getAll();

    // Debug: Log hasil produksi dengan isFromOrdering untuk verifikasi
    const hasilOrderingCount = hasilProduksi.filter((h) => {
      const isFromOrdering = h.isFromOrdering;
      return (
        isFromOrdering === true ||
        isFromOrdering === "true" ||
        isFromOrdering === 1
      );
    }).length;
    console.log(
      `📦 [STOK PRODUKSI] Total hasilProduksi: ${hasilProduksi.length}, dengan isFromOrdering: ${hasilOrderingCount}`,
    );

    if (hasilOrderingCount > 0) {
      const sampleOrdering = hasilProduksi.find((h) => {
        const isFromOrdering = h.isFromOrdering;
        return (
          isFromOrdering === true ||
          isFromOrdering === "true" ||
          isFromOrdering === 1
        );
      });
      if (sampleOrdering) {
        console.log("🔍 [STOK PRODUKSI] Sample hasilProduksi dari ordering:", {
          id: sampleOrdering.id || sampleOrdering._id,
          idProduksi: sampleOrdering.idProduksi,
          isFromOrdering: sampleOrdering.isFromOrdering,
          isFromOrderingType: typeof sampleOrdering.isFromOrdering,
          beratSaatIni: sampleOrdering.beratSaatIni,
        });
      }
    }

    // Filter produksi yang sudah Pengemasan dan punya berat akhir
    const produksiPengemasan = produksi.filter((p) => {
      const statusTahapan = (p.statusTahapan || "").toString().trim();
      const hasStatusPengemasan =
        statusTahapan === "Pengemasan" || statusTahapan.includes("Pengemasan");
      const beratAkhir = parseFloat(p.beratAkhir) || 0;
      return hasStatusPengemasan && beratAkhir > 0;
    });

    console.log(
      `✅ Found ${produksiPengemasan.length} produksi with Pengemasan status`,
    );
    console.log(`📦 Total hasilProduksi: ${hasilProduksi.length}`);
    console.log(`🌱 Total bahan: ${bahan.length}`);

    // Debug: Log sample data untuk troubleshooting
    if (produksiPengemasan.length > 0) {
      console.log("🔍 Sample produksi data:", {
        idProduksi: produksiPengemasan[0].idProduksi,
        idProduksiType: typeof produksiPengemasan[0].idProduksi,
        beratAkhir: produksiPengemasan[0].beratAkhir,
        statusTahapan: produksiPengemasan[0].statusTahapan,
      });
    }
    if (hasilProduksi.length > 0) {
      console.log("🔍 Sample hasilProduksi data:", {
        idProduksi: hasilProduksi[0].idProduksi,
        idProduksiType: typeof hasilProduksi[0].idProduksi,
        beratSaatIni: hasilProduksi[0].beratSaatIni,
      });
    }

    // Calculate stok tersedia untuk setiap produksi
    stokProduksiData = produksiPengemasan.map((p) => {
      // Normalize idProduksi untuk matching (handle string/number mismatch)
      const idProduksiNormalized = String(p.idProduksi || "").trim();

      // Get bahan data untuk jenis kopi dan varietas
      const bahanData = bahan.find((b) => b.idBahan === p.idBahan);

      // Get hasil produksi - use flexible matching
      const matchedHasilProduksi = hasilProduksi.filter((h) => {
        const hIdProduksi = String(h.idProduksi || "").trim();
        return (
          hIdProduksi === idProduksiNormalized ||
          h.idProduksi === p.idProduksi ||
          String(h.idProduksi) === String(p.idProduksi)
        );
      });

      // KONSEP: Stok tersedia = berat akhir - total hasil produksi dari ordering
      // (hasil produksi dari ordering mengurangi stok)
      const beratAkhir = parseFloat(p.beratAkhir) || 0;

      // Hitung total hasil produksi dari ordering (yang mengurangi stok)
      // Pastikan filter bekerja dengan benar (handle boolean true, string "true", dll)
      const hasilOrdering = matchedHasilProduksi.filter((h) => {
        const isFromOrdering = h.isFromOrdering;
        // Handle berbagai format: boolean true, string "true", dll
        return (
          isFromOrdering === true ||
          isFromOrdering === "true" ||
          isFromOrdering === 1
        );
      });

      const totalDariOrdering = hasilOrdering.reduce(
        (sum, h) => sum + (parseFloat(h.beratSaatIni) || 0),
        0,
      );

      // Stok tersedia = berat akhir - total dari ordering
      const stokTersedia = Math.max(0, beratAkhir - totalDariOrdering);

      // Debug logging untuk troubleshooting
      if (p.idProduksi === "PRD002" || stokProduksiData.length <= 2) {
        console.log(`🔍 [STOK PRODUKSI DETAIL] ${p.idProduksi}:`, {
          beratAkhir,
          matchedHasilProduksiCount: matchedHasilProduksi.length,
          hasilOrderingCount: hasilOrdering.length,
          hasilOrderingDetail: hasilOrdering.map((h) => ({
            id: h.id || h._id,
            idProduksi: h.idProduksi,
            isFromOrdering: h.isFromOrdering,
            isFromOrderingType: typeof h.isFromOrdering,
            beratSaatIni: h.beratSaatIni,
          })),
          totalDariOrdering,
          stokTersedia,
        });
      }

      // Debug logging untuk troubleshooting (hanya untuk beberapa record pertama)
      if (stokProduksiData.length <= 5 || stokTersedia <= 0) {
        const totalDariOrdering = matchedHasilProduksi
          .filter((h) => h.isFromOrdering === true)
          .reduce((sum, h) => sum + (parseFloat(h.beratSaatIni) || 0), 0);

        console.log(`📊 [STOK PRODUKSI] ${p.idProduksi}:`, {
          beratAkhir: beratAkhir,
          totalDariOrdering: totalDariOrdering,
          stokTersedia: stokTersedia, // Stok tersedia = berat akhir - total dari ordering
          jumlahHasilProduksi: matchedHasilProduksi.length,
          perhitungan: {
            formula: "stokTersedia = beratAkhir - totalDariOrdering",
            calculation: `${beratAkhir} - ${totalDariOrdering} = ${stokTersedia} kg`,
          },
        });
      }

      return {
        idProduksi: p.idProduksi,
        jenisKopi: bahanData?.jenisKopi || "-",
        varietas: bahanData?.varietas || p.varietas || "-",
        prosesPengolahan: p.prosesPengolahan || "-",
        stokTersedia: stokTersedia, // Stok tersedia = berat akhir - total dari ordering
        statusStok: stokTersedia > 0 ? "Cukup" : "Habis",
      };
    });

    console.log(
      `✅ Processed ${stokProduksiData.length} stok produksi records`,
    );

    // Debug: Log summary untuk troubleshooting
    const totalStokTersedia = stokProduksiData.reduce(
      (sum, s) => sum + s.stokTersedia,
      0,
    );
    const stokCukup = stokProduksiData.filter(
      (s) => s.statusStok === "Cukup",
    ).length;
    const stokHabis = stokProduksiData.filter(
      (s) => s.statusStok === "Habis",
    ).length;
    console.log(`📊 Summary Stok Produksi:`, {
      totalRecords: stokProduksiData.length,
      totalStokTersedia: totalStokTersedia.toFixed(2) + " kg",
      stokCukup: stokCukup,
      stokHabis: stokHabis,
    });

    displayStokProduksi();
  } catch (error) {
    console.error("❌ [STOK PRODUKSI] Error loading stok produksi:", error);
    console.error("❌ [STOK PRODUKSI] Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    stokProduksiData = [];
    displayStokProduksi();

    // Show error in table
    const tableBody = document.getElementById("tableStokProduksi");
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-4 text-danger">
            <i class="bi bi-exclamation-triangle fs-1 d-block mb-2"></i>
            Error memuat data stok produksi: ${error.message || "Unknown error"}
            <br><small>Periksa console untuk detail lebih lanjut</small>
          </td>
        </tr>
      `;
    }
  }
}

// Display stok produksi table
function displayStokProduksi() {
  const tableBody = document.getElementById("tableStokProduksi");
  if (!tableBody) return;

  try {
    if (stokProduksiData.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-4 text-muted">
            <i class="bi bi-inbox fs-1 d-block mb-2"></i>
            Tidak ada data stok produksi
            <br><small>Data akan muncul setelah ada produksi yang masuk tahap Pengemasan dengan berat akhir</small>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = stokProduksiData
      .map(
        (s, index) => `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${s.idProduksi || "-"}</strong></td>
        <td><span class="badge ${s.tipeProduk === 'Green Beans' ? 'bg-success' : 'bg-info'}">${s.tipeProduk || "-"}</span></td>
        <td><span class="badge ${(window.getJenisKopiBadgeClass || (() => 'bg-secondary'))(s.jenisKopi)}">${s.jenisKopi || "-"}</span></td>
        <td>${s.varietas || "-"}</td>
        <td>${s.prosesPengolahan || "-"}</td>
        <td class="text-end"><strong>${parseFloat(
          s.stokTersedia || 0,
        ).toLocaleString("id-ID", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} kg</strong></td>
        <td>
          <span class="badge ${
            s.statusStok === "Cukup" ? "bg-success" : "bg-danger"
          }">
            ${s.statusStok || "-"}
          </span>
        </td>
      </tr>
    `,
      )
      .join("");
  } catch (error) {
    console.error("❌ Error displaying stok produksi:", error);
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-4 text-danger">
          <i class="bi bi-exclamation-triangle fs-1 d-block mb-2"></i>
          Error menampilkan data: ${error.message}
        </td>
      </tr>
    `;
  }
}

// ==================== DATA PEMESANAN (CRUD + FILTER) ====================

// Load pemesanan data
async function loadPemesanan() {
  try {
    console.log("🔄 Loading pemesanan data...");

    if (!window.API || !window.API.Pemesanan) {
      throw new Error("API.Pemesanan tidak tersedia");
    }

    const response = await window.API.Pemesanan.getAll();
    // Handle both raw array and wrapped {data: [...]} response format
    pemesananData = Array.isArray(response)
      ? response
      : response && Array.isArray(response.data)
        ? response.data
        : [];
    console.log(`✅ Loaded ${pemesananData.length} pemesanan records`);

    // Also update global pemesanan array for backward compatibility
    pemesanan = pemesananData;

    applyFilterPemesanan();
  } catch (error) {
    console.error("❌ Error loading pemesanan:", error);
    pemesananData = [];
    pemesanan = [];
    applyFilterPemesanan();
  }
}

// Apply filter to pemesanan table
function applyFilterPemesanan() {
  const tableBody = document.getElementById("tablePemesanan");
  if (!tableBody) return;

  try {
    const searchTerm = document.getElementById("searchPemesanan")
      ? document.getElementById("searchPemesanan").value.toLowerCase()
      : "";
    const filterTipe = document.getElementById("filterTipePemesanan")
      ? document.getElementById("filterTipePemesanan").value
      : "";
    const filterStatus = document.getElementById("filterStatusPemesanan")
      ? document.getElementById("filterStatusPemesanan").value
      : "";

    // Filter data
    let filteredPemesanan = pemesananData.filter((p) => {
      const matchSearch =
        !searchTerm ||
        (p.idPembelian && p.idPembelian.toLowerCase().includes(searchTerm)) ||
        (p.namaPembeli && p.namaPembeli.toLowerCase().includes(searchTerm));
      const matchTipe = !filterTipe || p.tipePemesanan === filterTipe;
      const matchStatus = !filterStatus || p.statusPemesanan === filterStatus;

      return matchSearch && matchTipe && matchStatus;
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
        <td class="text-center">
          <button 
            class="btn btn-sm btn-info btn-action me-1" 
            onclick="openInvoice('${p.idPembelian || p.id || p._id}')"
            title="Invoice PDF">
            <i class="bi bi-file-pdf"></i>
          </button>
          ${p.statusPemesanan === "Ordering"
              ? '<button class="btn btn-sm btn-warning btn-action me-1" onclick="editPemesanan(\'' + (p.idPembelian || p.id || p._id) + '\')" title="Edit Pemesanan"><i class="bi bi-pencil"></i></button>'
              : ""}
          <button 
            class="btn btn-sm btn-success btn-action me-1" 
            onclick="openModalOrderingForPemesanan('${
              p.idPembelian || p.id || p._id
            }')"
            title="Proses Ordering"
            ${p.statusPemesanan === "Complete" ? "disabled" : ""}>
            <i class="bi bi-gear"></i>
          </button>
          <button 
            class="btn btn-sm btn-danger btn-action" 
            onclick="deletePemesanan('${p.idPembelian || p.id || p._id}')"
            title="Hapus Pemesanan"
            ${p.statusPemesanan === "Complete" ? "disabled" : ""}>
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>
    `)
      .join("");
  } catch (error) {
    console.error("❌ Error displaying pemesanan:", error);
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

// Open invoice PDF
async function openInvoice(idPembelian) {
  try {
    // Use existing generateInvoicePDF function
    if (typeof generateInvoicePDF === "function") {
      await generateInvoicePDF(idPembelian);
    } else {
      // Fallback: construct URL directly
      const baseUrl = window.location.origin;
      const invoiceUrl = `${baseUrl}/static/laporan/invoice_pemesanan_${idPembelian}.pdf`;
      window.open(invoiceUrl, "_blank");
    }
  } catch (error) {
    console.error("❌ Error opening invoice:", error);
    alert(`Error membuka invoice: ${error.message || "Unknown error"}`);
  }
}

// Open modal ordering for specific pemesanan
function openModalOrderingForPemesanan(idPembelian) {
  // Open modal ordering
  openModalOrdering();

  // Set idPembelian if available
  const idPembelianSelect = document.getElementById("idPembelianOrdering");
  if (idPembelianSelect) {
    idPembelianSelect.value = idPembelian;
    // Trigger change event to load pemesanan data
    if (typeof loadPemesananDataForOrdering === "function") {
      loadPemesananDataForOrdering();
    }
  }
}

// Display pemesanan table (backward compatibility - redirects to applyFilterPemesanan)
function displayPemesanan() {
  applyFilterPemesanan();
}

// Filter pemesanan table (backward compatibility - now uses applyFilterPemesanan)
function filterPemesananTable() {
  applyFilterPemesanan();
}

// Open modal for add/edit pemesanan
function openModal(mode = "add") {
  currentEditId = null;
  const modal = document.getElementById("modalPemesanan");
  const modalLabel = document.getElementById("modalPemesananLabel");
  const form = document.getElementById("formPemesanan");

  if (mode === "add") {
    modalLabel.textContent = "Tambah Pemesanan";
    form.reset();
    document.getElementById("pemesananId").value = "";

    // Enable semua field saat add
    const statusField = document.getElementById("statusPemesanan");
    if (statusField) {
      statusField.disabled = false;
      // Pastikan option "Complete" ada
      if (!statusField.querySelector('option[value="Complete"]')) {
        const completeOption = document.createElement("option");
        completeOption.value = "Complete";
        completeOption.textContent = "Complete";
        statusField.appendChild(completeOption);
      }
    }

    const idPembelianField = document.getElementById("idPembelian");
    if (idPembelianField) {
      idPembelianField.disabled = false;
    }

    // Generate ID Pembelian - set segera dan ulangi saat modal shown (pastikan tertampil)
    const generatedId = generateIdPembelian();
    document.getElementById("idPembelian").value = generatedId;

    // Set tanggal hari ini
    const today = new Date().toISOString().split("T")[0];
    const tanggalEl = document.getElementById("tanggalPemesanan");
    if (tanggalEl) tanggalEl.value = today;

    // Reset negara field
    toggleNegaraField();

    // Load master data options
    loadMasterDataOptions();
  } else {
    modalLabel.textContent = "Edit Pemesanan";
    loadMasterDataOptions();
  }
}

// Edit pemesanan
async function editPemesanan(id) {
  try {
    await loadPemesanan();
    const p =
      pemesananData.find(
        (item) =>
          item.id === parseInt(id) ||
          item._id === id ||
          item.idPembelian === id,
      ) ||
      pemesanan.find(
        (item) =>
          item.id === parseInt(id) ||
          item._id === id ||
          item.idPembelian === id,
      );
    if (!p) {
      alert("Data pemesanan tidak ditemukan!");
      return;
    }

    // Validasi: Hanya bisa edit jika status = "Ordering"
    if (p.statusPemesanan === "Complete") {
      alert(
        "❌ Pemesanan yang sudah Complete tidak dapat diubah. Stok sudah dikurangi melalui proses ordering.",
      );
      return;
    }

    currentEditId = id;
    document.getElementById("pemesananId").value = p.id || p._id;
    document.getElementById("idPembelian").value = p.idPembelian;
    document.getElementById("namaPembeli").value = p.namaPembeli || "";
    document.getElementById("tipePemesanan").value = p.tipePemesanan || "";
    document.getElementById("negara").value = p.negara || "";
    document.getElementById("tipeProduk").value = p.tipeProduk || "";
    document.getElementById("prosesPengolahan").value =
      p.prosesPengolahan || "";
    document.getElementById("jenisKopi").value = p.jenisKopi || "";
    // Kemasan tidak lagi digunakan
    document.getElementById("jumlahPesananKg").value = p.jumlahPesananKg || "";
    document.getElementById("hargaPerKg").value = p.hargaPerKg || "";
    document.getElementById("totalHarga").value = (p.totalHarga || 0)
      .toLocaleString("id-ID")
      .replace(/\./g, ",");
    document.getElementById("statusPemesanan").value =
      p.statusPemesanan || "Ordering";
    document.getElementById("tanggalPemesanan").value =
      p.tanggalPemesanan || "";

    // Disable status field saat edit (hanya bisa "Ordering")
    const statusField = document.getElementById("statusPemesanan");
    if (statusField) {
      statusField.disabled = true;
      // Hapus option "Complete" saat edit
      const completeOption = statusField.querySelector(
        'option[value="Complete"]',
      );
      if (completeOption) {
        completeOption.remove();
      }
    }

    // Disable ID Pembelian saat edit (tidak bisa diubah)
    const idPembelianField = document.getElementById("idPembelian");
    if (idPembelianField) {
      idPembelianField.disabled = true;
    }

    toggleNegaraField();
    await loadMasterDataOptions();

    // Set values after options loaded
    setTimeout(() => {
      document.getElementById("tipeProduk").value = p.tipeProduk || "";
      document.getElementById("prosesPengolahan").value =
        p.prosesPengolahan || "";
      document.getElementById("jenisKopi").value = p.jenisKopi || "";
      // Kemasan tidak lagi digunakan
    }, 500);

    const modal = new bootstrap.Modal(
      document.getElementById("modalPemesanan"),
    );
    modal.show();
  } catch (error) {
    console.error("Error loading pemesanan for edit:", error);
    alert("Error memuat data pemesanan");
  }
}

// Save pemesanan (add/edit)
async function savePemesanan() {
  const form = document.getElementById("formPemesanan");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const pemesananId = document.getElementById("pemesananId").value;
  const idPembelian = document.getElementById("idPembelian").value;
  const namaPembeli = document.getElementById("namaPembeli").value;
  const tipePemesanan = document.getElementById("tipePemesanan").value;
  const negara = document.getElementById("negara").value;
  const tipeProduk = document.getElementById("tipeProduk").value;
  const prosesPengolahan = document.getElementById("prosesPengolahan").value;
  const jenisKopi = document.getElementById("jenisKopi").value;

  // Parse jumlah dan harga
  const jumlahPesananKg = parseFloat(
    document.getElementById("jumlahPesananKg").value || 0,
  );
  const hargaPerKg = parseFloat(
    document.getElementById("hargaPerKg").value || 0,
  );

  // Calculate total harga directly from jumlah and harga (don't parse from formatted input)
  // This avoids parsing issues with locale-formatted strings
  const totalHarga = jumlahPesananKg * hargaPerKg;

  const statusPemesanan = document.getElementById("statusPemesanan").value;
  const tanggalPemesanan = document.getElementById("tanggalPemesanan").value;

  // Log for debugging
  console.log("💰 Total Harga Calculation:", {
    jumlahPesananKg,
    hargaPerKg,
    calculatedTotal: totalHarga,
    formattedDisplay: document.getElementById("totalHarga").value,
  });

  // Validasi
  if (tipePemesanan === "International" && !negara.trim()) {
    alert("Negara wajib diisi untuk pemesanan International!");
    document.getElementById("negara").focus();
    return;
  }

  if (jumlahPesananKg <= 0) {
    alert("Jumlah pesanan harus lebih dari 0!");
    document.getElementById("jumlahPesananKg").focus();
    return;
  }

  if (hargaPerKg <= 0) {
    alert("Harga per kg harus lebih dari 0!");
    document.getElementById("hargaPerKg").focus();
    return;
  }

  try {
    const pemesananData = {
      idPembelian,
      namaPembeli,
      tipePemesanan,
      negara: tipePemesanan === "International" ? negara : "",
      tipeProduk,
      prosesPengolahan,
      jenisKopi,
      jumlahPesananKg,
      hargaPerKg,
      totalHarga,
      statusPemesanan,
      tanggalPemesanan,
    };

    if (pemesananId) {
      // Edit mode - Update via API
      // Validasi: Status tidak boleh diubah menjadi Complete saat edit
      if (statusPemesanan === "Complete") {
        alert(
          "❌ Status Complete tidak dapat diatur melalui edit. Gunakan fitur 'Proses Ordering' untuk menyelesaikan pemesanan.",
        );
        return;
      }

      // Pastikan status tetap "Ordering" saat edit
      pemesananData.statusPemesanan = "Ordering";

      console.log(`🔄 Updating pemesanan ID: ${pemesananId}`);
      await window.API.Pemesanan.update(pemesananId, pemesananData);
      
      // Tampilkan notifikasi update
      if (window.showNotification) {
        window.showNotification('update', 'Pemesanan', 'success');
      } else {
        alert("Data pemesanan berhasil diupdate!");
      }
    } else {
      // Add mode - Create via API
      console.log("🔄 Creating new pemesanan");
      await window.API.Pemesanan.create(pemesananData);
      
      // Tampilkan notifikasi create
      if (window.showNotification) {
        window.showNotification('create', 'Pemesanan', 'success');
      } else {
        alert("Data pemesanan berhasil ditambahkan!");
      }
    }

    // Reload data
    await loadPemesanan();

    // Close modal
    const modal = bootstrap.Modal.getInstance(
      document.getElementById("modalPemesanan"),
    );
    modal.hide();
    
    // Auto refresh halaman setelah save berhasil
    setTimeout(() => {
      window.location.reload();
    }, 500);
  } catch (error) {
    console.error("Error saving pemesanan:", error);
    // Tampilkan notifikasi error
    if (window.showNotification) {
      window.showNotification(pemesananId ? 'update' : 'create', 'Pemesanan', 'error', 'Gagal menyimpan data: ' + (error.message || "Unknown error"));
    } else {
      alert(
        `Error menyimpan data pemesanan: ${error.message || "Unknown error"}`,
      );
    }
  }
}

// Delete pemesanan
async function deletePemesanan(id) {
  // Cek status pemesanan terlebih dahulu
  try {
    await loadPemesanan();
    const p =
      pemesananData.find(
        (item) =>
          item.id === parseInt(id) ||
          item._id === id ||
          item.idPembelian === id,
      ) ||
      pemesanan.find(
        (item) =>
          item.id === parseInt(id) ||
          item._id === id ||
          item.idPembelian === id,
      );

    if (p && p.statusPemesanan === "Complete") {
      alert(
        "❌ Tidak dapat menghapus pemesanan yang sudah Complete. Pemesanan sudah diproses dan stok sudah dikurangi.",
      );
      return;
    }
  } catch (error) {
    console.error("Error checking pemesanan status:", error);
  }

  if (!confirm("Apakah Anda yakin ingin menghapus data pemesanan ini?")) {
    return;
  }

  try {
    console.log(`🗑️ [DELETE PEMESANAN] Deleting pemesanan: ${id}`);

    // Try multiple ID formats
    let deleteResult = null;
    let deleteError = null;

    // Try with idPembelian (most common)
    try {
      deleteResult = await window.API.Pemesanan.delete(id);
    } catch (err1) {
      deleteError = err1;
      console.log(
        `⚠️ [DELETE PEMESANAN] First attempt failed, trying alternative...`,
      );

      // Try with ObjectId if id is a valid ObjectId string
      try {
        if (id.match(/^[0-9a-fA-F]{24}$/)) {
          deleteResult = await window.API.Pemesanan.delete(id);
        }
      } catch (err2) {
        console.error("❌ [DELETE PEMESANAN] All delete attempts failed");
        throw err1; // Throw original error
      }
    }

    if (deleteResult) {
      // Tampilkan notifikasi delete
      if (window.showNotification) {
        window.showNotification('delete', 'Pemesanan', 'success');
      } else {
        alert("Data pemesanan berhasil dihapus!");
      }

      // Reload data setelah delete
      await loadPemesanan();
      await loadStokProduksi(); // Refresh tabel stok produksi juga

      console.log(
        `✅ [DELETE PEMESANAN] Successfully deleted pemesanan: ${id}`,
      );
    }
  } catch (error) {
    console.error("❌ [DELETE PEMESANAN] Error deleting pemesanan:", error);
    const errorMsg = error.message || "Unknown error";

    // Tampilkan notifikasi error
    if (window.showNotification) {
      if (errorMsg.includes("sudah memiliki proses ordering")) {
        window.showNotification('delete', 'Pemesanan', 'error', 'Tidak dapat menghapus pemesanan yang sudah memiliki proses ordering!');
      } else {
        window.showNotification('delete', 'Pemesanan', 'error', 'Gagal menghapus data: ' + errorMsg);
      }
    } else {
      if (errorMsg.includes("sudah memiliki proses ordering")) {
        alert(
          "❌ Tidak dapat menghapus pemesanan yang sudah memiliki proses ordering!",
        );
      } else if (errorMsg.includes("not found")) {
        alert("❌ Data pemesanan tidak ditemukan!");
      } else {
        alert(`❌ Error menghapus data pemesanan: ${errorMsg}`);
      }
    }
  }
}

// Open modal ordering
async function openModalOrdering() {
  // Reset form dan tampilan
  const form = document.getElementById("formOrdering");
  if (form) form.reset();
  const pembelianSelect = document.getElementById("idPembelianOrdering");
  const produksiSelect = document.getElementById("idProduksiOrdering");
  if (pembelianSelect) pembelianSelect.value = "";
  if (produksiSelect) produksiSelect.value = "";
  const pemesananDisplay = document.getElementById("pemesananDataDisplay");
  const stokDisplay = document.getElementById("stokInfoDisplay");
  if (pemesananDisplay) pemesananDisplay.style.display = "none";
  if (stokDisplay) stokDisplay.style.display = "none";

  // Set tanggal hari ini
  const today = new Date().toISOString().split("T")[0];
  const tanggalInput = document.getElementById("tanggalOrdering");
  if (tanggalInput) tanggalInput.value = today;

  // Muat data secara berurutan tanpa saling memanggil
  try {
    await loadPemesananOptionsForOrdering();
    const stokList = await loadStokData(); // hanya fetch & return data
    await loadStokOptionsForOrdering(stokList); // render dropdown sekali
  } catch (error) {
    console.error("❌ [OPEN MODAL ORDERING] Error loading data:", error);
  }
}

// Load pemesanan options for ordering (only Ordering status)
async function loadPemesananOptionsForOrdering() {
  try {
    await loadPemesanan();

    const select = document.getElementById("idPembelianOrdering");
    if (!select) return;

    const pemesananOrdering = pemesanan.filter(
      (p) => p.statusPemesanan === "Ordering",
    );

    select.innerHTML = '<option value="">Pilih ID Pembelian</option>';
    pemesananOrdering.forEach((p) => {
      const option = document.createElement("option");
      option.value = p.idPembelian;
      option.textContent = `${p.idPembelian} - ${p.namaPembeli} (${p.jumlahPesananKg} kg)`;
      select.appendChild(option);
    });
  } catch (error) {
    console.error("❌ Error loading pemesanan options for ordering:", error);
  }
}

// Load pemesanan data when ID Pembelian selected
async function loadPemesananDataForOrdering() {
  const idPembelian = document.getElementById("idPembelianOrdering").value;
  if (!idPembelian) {
    document.getElementById("pemesananDataDisplay").style.display = "none";
    return;
  }

  try {
    await loadPemesanan();
    const p =
      pemesananData.find((item) => item.idPembelian === idPembelian) ||
      pemesanan.find((item) => item.idPembelian === idPembelian);
    if (!p) {
      alert("Data pemesanan tidak ditemukan!");
      return;
    }

    // Display pemesanan data
    document.getElementById("displayNamaPembeli").textContent =
      p.namaPembeli || "-";
    document.getElementById("displayTipePemesanan").textContent =
      p.tipePemesanan || "-";
    document.getElementById("displayTipeProduk").textContent =
      p.tipeProduk || "-";
    document.getElementById("displayProsesPengolahan").textContent =
      p.prosesPengolahan || "-";
    document.getElementById("displayJenisKopi").textContent =
      p.jenisKopi || "-";
    document.getElementById("displayJumlahPesanan").textContent = (
      p.jumlahPesananKg || 0
    ).toLocaleString("id-ID");
    document.getElementById("displayTotalHarga").textContent = `Rp ${(
      p.totalHarga || 0
    ).toLocaleString("id-ID")}`;

    document.getElementById("pemesananDataDisplay").style.display = "block";

    // Store pemesanan data globally for validation
    window.currentPemesananData = p;
  } catch (error) {
    console.error("❌ Error loading pemesanan data:", error);
    alert("Error memuat data pemesanan");
  }
}

// Load stok options for ordering
async function loadStokOptionsForOrdering(dataFromApi) {
  try {
    console.log("🔄 [LOAD STOK OPTIONS] Loading stok options for ordering...");
    const select = document.getElementById("idProduksiOrdering");
    // Simpan pilihan sebelumnya agar tidak hilang saat re-render
    const previousValue = select ? select.value : "";
    if (!select) {
      console.warn("⚠️ [LOAD STOK OPTIONS] Select element not found");
      return;
    }

    // Gunakan data dari parameter jika ada, jika tidak gunakan cache global
    if (Array.isArray(dataFromApi)) {
      stokData = dataFromApi;
    }

    select.innerHTML = '<option value="">Pilih ID Produksi</option>';

    if (!Array.isArray(stokData) || stokData.length === 0) {
      console.warn("⚠️ [LOAD STOK OPTIONS] stokData is empty or not an array");
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Tidak ada stok tersedia";
      option.disabled = true;
      select.appendChild(option);
      return;
    }

    console.log(
      `✅ [LOAD STOK OPTIONS] Loading ${stokData.length} stok options`,
    );

    stokData.forEach((s, index) => {
      const option = document.createElement("option");
      const idProduksi = s.idProduksi || s.id || "-";
      const tipeProduk = s.tipeProduk || "-";
      const jenisKopi = s.jenisKopi || "-";
      const stokTersedia = parseFloat(s.stokTersedia || 0);

      // Use unique value combining idProduksi and tipeProduk
      option.value = `${idProduksi}|${tipeProduk}`;
      option.textContent = `${idProduksi} - ${tipeProduk} - ${jenisKopi} (Stok: ${stokTersedia.toLocaleString(
        "id-ID",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        },
      )} kg)`;

      // Store data in dataset for easy access
      option.dataset.stokTersedia = stokTersedia;
      option.dataset.prosesPengolahan = s.prosesPengolahan || "-";
      option.dataset.jenisKopi = jenisKopi;
      option.dataset.tipeProduk = tipeProduk;
      option.dataset.idProduksi = idProduksi;

      select.appendChild(option);
    });

    // Kembalikan pilihan sebelumnya jika masih ada di opsi
    if (previousValue) {
      const hasPrevious = Array.from(select.options).some(
        (opt) => opt.value === previousValue,
      );
      if (hasPrevious) {
        select.value = previousValue;
        // Trigger update info stok agar validasi HTML tidak menganggap kosong
        loadProduksiStok();
      }
    }

    console.log(
      `✅ [LOAD STOK OPTIONS] Successfully loaded ${stokData.length} options`,
    );
  } catch (error) {
    console.error(
      "❌ [LOAD STOK OPTIONS] Error loading stok options for ordering:",
      error,
    );
    console.error("❌ [LOAD STOK OPTIONS] Error details:", {
      message: error.message,
      stack: error.stack,
    });
  }
}

// Load produksi stok info when ID Produksi selected
function loadProduksiStok() {
  console.log("🔄 [LOAD PRODUKSI STOK] Loading produksi stok info...");

  const combinedValue = document.getElementById("idProduksiOrdering").value;
  if (!combinedValue) {
    console.log("⚠️ [LOAD PRODUKSI STOK] No ID Produksi selected");
    document.getElementById("stokInfoDisplay").style.display = "none";
    return;
  }

  // Parse idProduksi and tipeProduk from combined value
  const [idProduksi, tipeProduk] = combinedValue.split("|");

  console.log(`🔍 [LOAD PRODUKSI STOK] Selected: ${idProduksi} - ${tipeProduk}`);

  // Try to get from option dataset first
  const select = document.getElementById("idProduksiOrdering");
  const selectedOption = select.options[select.selectedIndex];

  let stokTersedia = 0;
  let prosesPengolahan = "-";
  let jenisKopi = "-";
  let displayTipeProduk = tipeProduk || "-";

  if (
    selectedOption &&
    selectedOption.dataset &&
    selectedOption.dataset.stokTersedia
  ) {
    // Get from dataset (preferred method)
    stokTersedia = parseFloat(selectedOption.dataset.stokTersedia || 0);
    prosesPengolahan = selectedOption.dataset.prosesPengolahan || "-";
    jenisKopi = selectedOption.dataset.jenisKopi || "-";
    displayTipeProduk = selectedOption.dataset.tipeProduk || tipeProduk || "-";
    console.log(`✅ [LOAD PRODUKSI STOK] Found data from dataset:`, {
      stokTersedia,
      prosesPengolahan,
      jenisKopi,
      tipeProduk: displayTipeProduk,
    });
  } else {
    // Fallback: search in stokData array
    console.log(
      "⚠️ [LOAD PRODUKSI STOK] Dataset not found, searching in stokData array...",
    );
    const stokItem = stokData.find((s) => {
      const sId = String(s.idProduksi || s.id || "").trim();
      const sTipe = (s.tipeProduk || "").trim();
      return sId === idProduksi && sTipe === tipeProduk;
    });

    if (stokItem) {
      stokTersedia = parseFloat(stokItem.stokTersedia || 0);
      prosesPengolahan = stokItem.prosesPengolahan || "-";
      jenisKopi = stokItem.jenisKopi || "-";
      displayTipeProduk = stokItem.tipeProduk || "-";
      console.log(`✅ [LOAD PRODUKSI STOK] Found data from stokData array:`, {
        stokTersedia,
        prosesPengolahan,
        jenisKopi,
        tipeProduk: displayTipeProduk,
      });
    } else {
      console.warn(
        `⚠️ [LOAD PRODUKSI STOK] Stok data not found for: ${idProduksi} - ${tipeProduk}`,
      );
      console.log("📊 [LOAD PRODUKSI STOK] Available stokData:", stokData);
    }
  }

  // Display the data
  const displayStokTersedia = document.getElementById("displayStokTersedia");
  const displayProduksiProses = document.getElementById(
    "displayProduksiProses",
  );
  const displayProduksiJenisKopi = document.getElementById(
    "displayProduksiJenisKopi",
  );
  const stokInfoDisplay = document.getElementById("stokInfoDisplay");

  if (displayStokTersedia) {
    displayStokTersedia.textContent = stokTersedia.toLocaleString("id-ID", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  if (displayProduksiProses) {
    displayProduksiProses.textContent = prosesPengolahan;
  }

  if (displayProduksiJenisKopi) {
    displayProduksiJenisKopi.textContent = jenisKopi;
  }

  if (stokInfoDisplay) {
    stokInfoDisplay.style.display = "block";
  }

  console.log(`✅ [LOAD PRODUKSI STOK] Stok info displayed:`, {
    stokTersedia: `${stokTersedia.toLocaleString("id-ID")} kg`,
    prosesPengolahan,
    jenisKopi,
  });
}

// Save ordering
async function saveOrdering() {
  const form = document.getElementById("formOrdering");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const idPembelian = document.getElementById("idPembelianOrdering").value;
  const idProduksiValue = document.getElementById("idProduksiOrdering").value;
  const statusPemesanan = document.getElementById(
    "statusPemesananOrdering",
  ).value;
  const tanggalOrdering = document.getElementById("tanggalOrdering").value;

  if (!idPembelian || !idProduksiValue) {
    alert("ID Pembelian dan ID Produksi wajib dipilih!");
    return;
  }

  // Parse idProduksi and tipeProduk from combined value
  const [idProduksi, tipeProdukFromSelect] = idProduksiValue.split("|");
  const tipeProduk = tipeProdukFromSelect || "";

  // Get pemesanan data
  const pemesananData = window.currentPemesananData;
  if (!pemesananData) {
    alert("Data pemesanan tidak ditemukan!");
    return;
  }

  // Get stok data
  const select = document.getElementById("idProduksiOrdering");
  const selectedOption = select.options[select.selectedIndex];

  // Get stok tersedia from dataset or fallback to stokData array
  let stokTersedia = 0;
  if (
    selectedOption &&
    selectedOption.dataset &&
    selectedOption.dataset.stokTersedia
  ) {
    stokTersedia = parseFloat(selectedOption.dataset.stokTersedia || 0);
  } else {
    // Fallback: search in stokData array
    const stokItem = stokData.find((s) => {
      const sId = String(s.idProduksi || s.id || "").trim();
      const sTipe = (s.tipeProduk || "").trim();
      return sId === idProduksi && sTipe === tipeProduk;
    });
    if (stokItem) {
      stokTersedia = parseFloat(stokItem.stokTersedia || 0);
    }
  }

  const jumlahPesanan = parseFloat(pemesananData.jumlahPesananKg || 0);

  // Validasi stok
  if (stokTersedia < jumlahPesanan) {
    alert(
      `Stok tidak mencukupi!\n\nStok tersedia: ${stokTersedia.toLocaleString(
        "id-ID",
      )} kg\nJumlah pesanan: ${jumlahPesanan.toLocaleString(
        "id-ID",
      )} kg\nKekurangan: ${(jumlahPesanan - stokTersedia).toLocaleString(
        "id-ID",
      )} kg`,
    );
    return;
  }

  // Validasi proses pengolahan
  const prosesProduksi = selectedOption.dataset.prosesPengolahan || "";
  if (prosesProduksi !== pemesananData.prosesPengolahan) {
    alert(
      `Proses pengolahan tidak sesuai!\n\nProses Produksi: ${prosesProduksi}\nProses Pemesanan: ${pemesananData.prosesPengolahan}`,
    );
    return;
  }

  // Validasi jenis kopi
  const jenisKopiProduksi = selectedOption.dataset.jenisKopi || "";
  if (jenisKopiProduksi !== pemesananData.jenisKopi) {
    alert(
      `Jenis kopi tidak sesuai!\n\nJenis Kopi Produksi: ${jenisKopiProduksi}\nJenis Kopi Pemesanan: ${pemesananData.jenisKopi}`,
    );
    return;
  }

  // Validasi tipe produk
  const tipeProdukPemesanan = pemesananData.tipeProduk || "";
  if (tipeProduk && tipeProdukPemesanan && tipeProduk !== tipeProdukPemesanan) {
    alert(
      `Tipe produk tidak sesuai!\n\nTipe Produk Stok: ${tipeProduk}\nTipe Produk Pemesanan: ${tipeProdukPemesanan}`,
    );
    return;
  }

  try {
    const orderingData = {
      idPembelian,
      idProduksi,
      tipeProduk,
      statusPemesanan,
      tanggalOrdering,
    };

    console.log("🔄 Memproses ordering (mengurangi stok):", orderingData);
    const result = await window.API.Ordering.proses(orderingData);
    console.log("✅ [ORDERING PROSES] Response:", result);

    if (result && result.success) {
      alert(
        `Ordering berhasil diproses!\n\nStok sebelum: ${result.stokSebelum.toLocaleString(
          "id-ID",
          { minimumFractionDigits: 2 },
        )} kg\nStok sesudah: ${result.stokSesudah.toLocaleString("id-ID", {
          minimumFractionDigits: 2,
        })} kg\nJumlah dikurangi: ${result.jumlahDikurangi.toLocaleString(
          "id-ID",
          { minimumFractionDigits: 2 },
        )} kg`,
      );
    } else {
      alert("Ordering berhasil diproses! Stok telah dikurangi.");
    }

    // Reload data - termasuk refresh tabel stok produksi
    console.log("🔄 [ORDERING PROSES] Reloading data setelah ordering...");

    // Tunggu sebentar untuk memastikan backend sudah commit data ke MongoDB
    console.log("⏳ [ORDERING PROSES] Waiting 1 second for MongoDB commit...");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Reload semua data dari API (force refresh, tidak menggunakan cache)
    console.log("🔄 [ORDERING PROSES] Fetching fresh data from API...");
    await loadPemesanan();
    console.log("✅ [ORDERING PROSES] Pemesanan data reloaded");

    await loadStokProduksi(); // Refresh tabel stok produksi agar stok terlihat berkurang
    console.log("✅ [ORDERING PROSES] Stok produksi data reloaded");

    await loadStokData(); // Refresh dropdown stok untuk ordering
    console.log("✅ [ORDERING PROSES] Stok data reloaded");

    await loadOrderingData();
    console.log("✅ [ORDERING PROSES] Ordering data reloaded");

    console.log("✅ [ORDERING PROSES] All data reloaded successfully");

    // Dispatch event untuk memicu refresh stok di halaman Kelola Stok
    console.log(
      "📢 [ORDERING PROSES] Dispatching events untuk refresh stok...",
    );
    window.dispatchEvent(new CustomEvent("hasilProduksiUpdated"));
    window.dispatchEvent(
      new CustomEvent("dataUpdated", {
        detail: { type: "hasilProduksi" },
      }),
    );
    console.log("✅ [ORDERING PROSES] Events dispatched");

    // Close modal
    const modal = bootstrap.Modal.getInstance(
      document.getElementById("modalOrdering"),
    );
    modal.hide();
    
    // Auto refresh halaman setelah save berhasil
    setTimeout(() => {
      window.location.reload();
    }, 500);
  } catch (error) {
    console.error("Error saving ordering:", error);
    console.error("Error object:", JSON.stringify(error, null, 2));
    
    // Extract error details from response if available
    let errorMsg = error.message || "Unknown error";
    let errorDetails = null;
    
    // Check if error has data property (from apiCall in api-service.js)
    // apiCall sets error.data = errorData from JSON response
    const errorData = error.data || error.response || {};
    
    if (errorData.error) {
      errorMsg = errorData.error;
    }
    
    // Handle different error types with detailed messages
    if (errorMsg.includes("Stok tidak mencukupi")) {
      alert(`❌ ${errorMsg}`);
    } else if (errorMsg.includes("Proses pengolahan tidak sesuai")) {
      alert(`❌ ${errorMsg}`);
    } else if (errorMsg.includes("Jenis kopi tidak sesuai")) {
      alert(`❌ ${errorMsg}`);
    } else {
      alert(`Error memproses ordering: ${errorMsg}`);
    }
  }
}

// Generate Invoice PDF
async function generateInvoicePDF(idPembelian) {
  try {
    await loadPemesanan();
    const p =
      pemesananData.find(
        (item) =>
          item.idPembelian === idPembelian ||
          item.id === parseInt(idPembelian) ||
          item._id === idPembelian,
      ) ||
      pemesanan.find(
        (item) =>
          item.idPembelian === idPembelian ||
          item.id === parseInt(idPembelian) ||
          item._id === idPembelian,
      );

    if (!p) {
      alert("Data pemesanan tidak ditemukan!");
      return;
    }

    console.log("📄 Generating Invoice PDF for:", p.idPembelian);

    // Wait for jsPDF library
    if (!window.jspdf) {
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

    // Invoice Info
    let y = 55;
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.text("ID Pembelian:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(p.idPembelian || "-", 60, y);
    y += 8;

    doc.setFont(undefined, "bold");
    doc.text("Tanggal:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(formatDate(p.tanggalPemesanan || new Date().toISOString()), 60, y);
    y += 8;

    doc.setFont(undefined, "bold");
    doc.text("Status:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(p.statusPemesanan || "-", 60, y);
    y += 15;

    // Pembeli Info
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text("DATA PEMBELI", 20, y);
    y += 8;
    doc.line(20, y, 190, y);
    y += 10;
    doc.setFontSize(11);

    doc.setFont(undefined, "bold");
    doc.text("Nama Pembeli:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(p.namaPembeli || "-", 60, y);
    y += 8;

    doc.setFont(undefined, "bold");
    doc.text("Tipe Pemesanan:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(p.tipePemesanan || "-", 60, y);
    y += 8;

    if (p.tipePemesanan === "International" && p.negara) {
      doc.setFont(undefined, "bold");
      doc.text("Negara:", 20, y);
      doc.setFont(undefined, "normal");
      doc.text(p.negara || "-", 60, y);
      y += 8;
    }

    y += 10;

    // Produk Info
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text("DATA PRODUK", 20, y);
    y += 8;
    doc.line(20, y, 190, y);
    y += 10;
    doc.setFontSize(11);

    doc.setFont(undefined, "bold");
    doc.text("Tipe Produk:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(p.tipeProduk || "-", 60, y);
    y += 8;

    doc.setFont(undefined, "bold");
    doc.text("Jenis Kopi:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(p.jenisKopi || "-", 60, y);
    y += 8;

    doc.setFont(undefined, "bold");
    doc.text("Proses Pengolahan:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(p.prosesPengolahan || "-", 60, y);
    y += 8;

    // Kemasan tidak lagi digunakan

    // Harga Info
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text("RINCIAN HARGA", 20, y);
    y += 8;
    doc.line(20, y, 190, y);
    y += 10;
    doc.setFontSize(11);

    doc.setFont(undefined, "bold");
    doc.text("Jumlah Pesanan:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(`${(p.jumlahPesananKg || 0).toLocaleString("id-ID")} kg`, 60, y);
    y += 8;

    doc.setFont(undefined, "bold");
    doc.text("Harga per Kg:", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(`Rp ${(p.hargaPerKg || 0).toLocaleString("id-ID")}`, 60, y);
    y += 8;

    doc.line(20, y, 190, y);
    y += 10;

    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    doc.text("TOTAL HARGA:", 20, y);
    doc.text(`Rp ${(p.totalHarga || 0).toLocaleString("id-ID")}`, 60, y);

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

    const uploadResult = await window.API.Laporan.uploadPdf(
      `data:application/pdf;base64,${pdfBase64Data}`,
      "invoice-pemesanan",
      p.idPembelian,
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

    // Re-add all content (same as before)
    let yQR = 55;
    docWithQR.setFontSize(11);
    docWithQR.setFont(undefined, "bold");
    docWithQR.text("ID Pembelian:", 20, yQR);
    docWithQR.setFont(undefined, "normal");
    docWithQR.text(p.idPembelian || "-", 60, yQR);
    yQR += 8;

    docWithQR.setFont(undefined, "bold");
    docWithQR.text("Tanggal:", 20, yQR);
    docWithQR.setFont(undefined, "normal");
    docWithQR.text(
      formatDate(p.tanggalPemesanan || new Date().toISOString()),
      60,
      yQR,
    );
    yQR += 8;

    docWithQR.setFont(undefined, "bold");
    docWithQR.text("Status:", 20, yQR);
    docWithQR.setFont(undefined, "normal");
    docWithQR.text(p.statusPemesanan || "-", 60, yQR);
    yQR += 15;

    // Pembeli Info
    docWithQR.setFontSize(12);
    docWithQR.setFont(undefined, "bold");
    docWithQR.text("DATA PEMBELI", 20, yQR);
    yQR += 8;
    docWithQR.line(20, yQR, 190, yQR);
    yQR += 10;
    docWithQR.setFontSize(11);

    docWithQR.setFont(undefined, "bold");
    docWithQR.text("Nama Pembeli:", 20, yQR);
    docWithQR.setFont(undefined, "normal");
    docWithQR.text(p.namaPembeli || "-", 60, yQR);
    yQR += 8;

    docWithQR.setFont(undefined, "bold");
    docWithQR.text("Tipe Pemesanan:", 20, yQR);
    docWithQR.setFont(undefined, "normal");
    docWithQR.text(p.tipePemesanan || "-", 60, yQR);
    yQR += 8;

    if (p.tipePemesanan === "International" && p.negara) {
      docWithQR.setFont(undefined, "bold");
      docWithQR.text("Negara:", 20, yQR);
      docWithQR.setFont(undefined, "normal");
      docWithQR.text(p.negara || "-", 60, yQR);
      yQR += 8;
    }

    yQR += 10;

    // Produk Info
    docWithQR.setFontSize(12);
    docWithQR.setFont(undefined, "bold");
    docWithQR.text("DATA PRODUK", 20, yQR);
    yQR += 8;
    docWithQR.line(20, yQR, 190, yQR);
    yQR += 10;
    docWithQR.setFontSize(11);

    docWithQR.setFont(undefined, "bold");
    docWithQR.text("Tipe Produk:", 20, yQR);
    docWithQR.setFont(undefined, "normal");
    docWithQR.text(p.tipeProduk || "-", 60, yQR);
    yQR += 8;

    docWithQR.setFont(undefined, "bold");
    docWithQR.text("Jenis Kopi:", 20, yQR);
    docWithQR.setFont(undefined, "normal");
    docWithQR.text(p.jenisKopi || "-", 60, yQR);
    yQR += 8;

    docWithQR.setFont(undefined, "bold");
    docWithQR.text("Proses Pengolahan:", 20, yQR);
    docWithQR.setFont(undefined, "normal");
    docWithQR.text(p.prosesPengolahan || "-", 60, yQR);
    yQR += 8;

    // Kemasan tidak lagi digunakan

    // Harga Info
    docWithQR.setFontSize(12);
    docWithQR.setFont(undefined, "bold");
    docWithQR.text("RINCIAN HARGA", 20, yQR);
    yQR += 8;
    docWithQR.line(20, yQR, 190, yQR);
    yQR += 10;
    docWithQR.setFontSize(11);

    docWithQR.setFont(undefined, "bold");
    docWithQR.text("Jumlah Pesanan:", 20, yQR);
    docWithQR.setFont(undefined, "normal");
    docWithQR.text(
      `${(p.jumlahPesananKg || 0).toLocaleString("id-ID")} kg`,
      60,
      yQR,
    );
    yQR += 8;

    docWithQR.setFont(undefined, "bold");
    docWithQR.text("Harga per Kg:", 20, yQR);
    docWithQR.setFont(undefined, "normal");
    docWithQR.text(
      `Rp ${(p.hargaPerKg || 0).toLocaleString("id-ID")}`,
      60,
      yQR,
    );
    yQR += 8;

    docWithQR.line(20, yQR, 190, yQR);
    yQR += 10;

    docWithQR.setFontSize(14);
    docWithQR.setFont(undefined, "bold");
    docWithQR.text("TOTAL HARGA:", 20, yQR);
    docWithQR.text(
      `Rp ${(p.totalHarga || 0).toLocaleString("id-ID")}`,
      60,
      yQR,
    );

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
            },
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

    // Generate final PDF with QR Code
    const finalPdfBase64 = docWithQR.output("datauristring");

    // Upload final PDF with QR Code
    let finalPdfBase64Data = finalPdfBase64;
    if (finalPdfBase64Data.includes(",")) {
      finalPdfBase64Data = finalPdfBase64Data.split(",")[1];
    }

    const finalUploadResult = await window.API.Laporan.uploadPdf(
      `data:application/pdf;base64,${finalPdfBase64Data}`,
      "invoice-pemesanan",
      p.idPembelian,
    );

    if (finalUploadResult && finalUploadResult.success) {
      console.log("✅ Final Invoice PDF with QR Code uploaded!");
      console.log("✅ Final PDF URL:", finalUploadResult.fullUrl);

      // Open PDF in new window
      window.open(finalUploadResult.fullUrl, "_blank");

      alert(
        `Invoice PDF berhasil di-generate!\n\nURL: ${finalUploadResult.fullUrl}\n\nQR Code dapat di-scan untuk membuka invoice.`,
      );
    } else {
      throw new Error("Failed to upload final PDF");
    }
  } catch (error) {
    console.error("❌ Error generating invoice PDF:", error);
    alert(`Error generating invoice PDF: ${error.message || "Unknown error"}`);
  }
}

// Format date helper
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

// Initialize on page load
document.addEventListener("DOMContentLoaded", async function () {
  console.log("🔄 Initializing Kelola Pemesanan page...");

  // Auth check - Admin & Owner only (redirects if not authorized)
  const checkAuthFn = window.checkAuth || (typeof checkAuth !== "undefined" ? checkAuth : null);
  if (checkAuthFn) {
    const authOk = await checkAuthFn(["Admin", "Owner"]);
    if (!authOk) return;
  }

  // Wait for API to be ready (event-based + polling)
  const apiReady = await waitForAPI();
  if (!apiReady || !window.API || !window.API.Pemesanan) {
    console.error("❌ API.Pemesanan not available");
    alert("API tidak tersedia. Pastikan backend aktif.");
    return;
  }

  // Load all data
  console.log("🚀 [INIT] Starting data load...");
  await loadPemesanan(); // Load pemesanan data
  console.log("🚀 [INIT] Pemesanan data loaded, loading stok produksi...");
  await loadStokProduksi(); // Load stok produksi (tab aktif pertama)
  console.log("🚀 [INIT] Stok produksi loaded, loading other data...");
  await loadStokData(); // Load stok hanya untuk ordering dropdown
  await loadOrderingData();
  console.log("✅ [INIT] All data loaded successfully");

  // Listen for tab change to load stok produksi
  const stokProduksiTab = document.getElementById("stok-produksi-tab");
  if (stokProduksiTab) {
    stokProduksiTab.addEventListener("shown.bs.tab", function () {
      console.log("🔄 Tab Stok Produksi activated, loading data...");
      loadStokProduksi();
    });
  }

  const dataPemesananTab = document.getElementById("data-pemesanan-tab");
  if (dataPemesananTab) {
    dataPemesananTab.addEventListener("shown.bs.tab", function () {
      console.log("🔄 Tab Data Pemesanan activated, loading data...");
      loadPemesanan();
    });
  }

  // Set default date
  const today = new Date().toISOString().split("T")[0];
  const tanggalInput = document.getElementById("tanggalPemesanan");
  if (tanggalInput && !tanggalInput.value) {
    tanggalInput.value = today;
  }

  // Modal shown: set ID Pembelian jika kosong saat Tambah
  const modalEl = document.getElementById("modalPemesanan");
  if (modalEl) {
    modalEl.addEventListener("shown.bs.modal", function () {
      const idEl = document.getElementById("idPembelian");
      const addMode = document.getElementById("modalPemesananLabel").textContent === "Tambah Pemesanan";
      if (addMode && idEl && !idEl.value) {
        idEl.value = generateIdPembelian();
      }
    });
  }

  // Expose functions globally for onclick/onchange handlers (prevent ReferenceError)
  window.openModal = openModal;
  window.openModalOrdering = openModalOrdering;
  window.openModalOrderingForPemesanan = openModalOrderingForPemesanan;
  window.savePemesanan = savePemesanan;
  window.saveOrdering = saveOrdering;
  window.editPemesanan = editPemesanan;
  window.deletePemesanan = deletePemesanan;
  window.openInvoice = openInvoice;
  window.applyFilterPemesanan = applyFilterPemesanan;
  window.toggleNegaraField = toggleNegaraField;
  window.calculateTotalHarga = calculateTotalHarga;
  // loadKemasanOptions dihapus - kemasan tidak lagi digunakan
  window.loadPemesananDataForOrdering = loadPemesananDataForOrdering;
  window.loadProduksiStok = loadProduksiStok;

  console.log("✅ Kelola Pemesanan page initialized");
});
