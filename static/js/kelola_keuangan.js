// Data keuangan (MONGODB ONLY - NO localStorage fallback)
let keuangan = [];
// Data pemasukan (read-only) dari pemesanan yang statusPembayaran = Lunas
let pemasukan = [];
let currentEditId = null;
let currentDeleteId = null;

function unwrapArrayResponse(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.data)) return res.data;
  return [];
}

function getActiveKeuanganTab() {
  const active = document.querySelector("#keuanganTabs .nav-link.active");
  return active && active.id === "tab-pemasukan" ? "pemasukan" : "pengeluaran";
}

function syncKeuanganHeaderForTab(tab) {
  const btnTambah = document.getElementById("btnTambahPengeluaran");
  const wrapFilter = document.getElementById("wrapFilterPengeluaran");
  if (tab === "pemasukan") {
    if (btnTambah) btnTambah.style.display = "none";
    if (wrapFilter) wrapFilter.style.display = "none";
  } else {
    if (btnTambah) btnTambah.style.display = "";
    if (wrapFilter) wrapFilter.style.display = "";
  }
}

// Load data keuangan dari MongoDB (API ONLY - NO fallback)
async function loadKeuanganData() {
  try {
    console.log("🔄 Loading keuangan data from MongoDB...");

    // Wait for window.API to be available (max 2 seconds)
    let retries = 0;
    while (!window.API && retries < 20) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      retries++;
    }

    // VERIFY API AVAILABILITY - NO FALLBACK
    if (!window.API || !window.API.Keuangan) {
      const errorMsg =
        "❌ API.Keuangan tidak tersedia. Backend MongoDB wajib aktif. Pastikan Flask server running dan api-service.js sudah di-load.";
      console.error(errorMsg);
      console.error("window.API:", window.API);
      alert(errorMsg);
      throw new Error(errorMsg);
    }

    console.log("✅ Using API.Keuangan.getAll()");
    keuangan = await window.API.Keuangan.getAll();
    console.log(`✅ Loaded ${keuangan.length} keuangan records from MongoDB`);

    if (!Array.isArray(keuangan)) {
      console.warn("⚠️ API returned non-array data, defaulting to empty array");
      keuangan = [];
    }
  } catch (error) {
    console.error("❌ Error loading keuangan from MongoDB:", error);
    const errorMsg = `Error memuat data keuangan dari MongoDB: ${
      error.message || "Unknown error"
    }. Pastikan backend Flask aktif.`;
    alert(errorMsg);
    keuangan = [];
    throw error;
  }
}

async function loadPemasukanData() {
  try {
    console.log("🔄 Loading pemasukan data from pemesanan (Lunas)...");

    let retries = 0;
    while (!window.API && retries < 20) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      retries++;
    }

    if (!window.API || !window.API.Pemesanan) {
      const errorMsg =
        "❌ API.Pemesanan tidak tersedia. Tidak dapat memuat pemasukan. Pastikan backend Flask aktif.";
      console.error(errorMsg);
      alert(errorMsg);
      throw new Error(errorMsg);
    }

    const res = await window.API.Pemesanan.getAll();
    const rows = unwrapArrayResponse(res);
    const lunas = rows.filter(
      (p) => String(p?.statusPembayaran || "").trim() === "Lunas",
    );

    pemasukan = lunas.map((p) => ({
      idPembelian: p.idPembelian || p.id || p._id,
      namaPembeli: p.namaPembeli || "-",
      tipePemesanan: p.tipePemesanan || "-",
      tanggalPemesanan: p.tanggalPemesanan || p.tanggal || null,
      nilai: Number(p.totalHarga || 0) || 0,
      _raw: p,
    }));

    console.log(`✅ Loaded ${pemasukan.length} pemasukan rows (Lunas)`);
    if (!Array.isArray(pemasukan)) pemasukan = [];
  } catch (error) {
    console.error("❌ Error loading pemasukan:", error);
    pemasukan = [];
    throw error;
  }
}

/**
 * ID bahan yang sudah punya baris keuangan "Pembelian Bahan Baku" tidak ditampilkan
 * lagi di dropdown (tambah). Saat edit, ID milik baris yang sedang diedit tetap boleh dipilih.
 */
async function loadBahanBakuOptions() {
  try {
    let bahan = [];
    if (!window.API || !window.API.Bahan) {
      console.warn("⚠️ API.Bahan not available, skipping bahan baku options");
      return;
    }
    try {
      await loadKeuanganData();
    } catch (e) {
      console.warn("⚠️ Gagal refresh keuangan sebelum filter bahan:", e);
    }

    const usedIds = new Set(
      (keuangan || [])
        .filter(
          (x) =>
            x &&
            x.jenisPengeluaran === "Pembelian Bahan Baku" &&
            x.idBahanBaku,
        )
        .map((x) => String(x.idBahanBaku).trim()),
    );

    let allowId = null;
    if (currentEditId) {
      const cur = (keuangan || []).find(
        (item) => item.id === currentEditId || item._id === currentEditId,
      );
      if (
        cur &&
        cur.jenisPengeluaran === "Pembelian Bahan Baku" &&
        cur.idBahanBaku
      ) {
        allowId = String(cur.idBahanBaku).trim();
      }
    }

    bahan = await window.API.Bahan.getAll();
    const select = document.getElementById("idBahanBaku");
    if (select) {
      select.innerHTML = '<option value="">Pilih ID Bahan Baku</option>';
      let added = 0;
      (bahan || []).forEach((b) => {
        if (!b?.idBahan) return;
        const id = String(b.idBahan).trim();
        if (usedIds.has(id) && id !== allowId) {
          return;
        }
        const option = document.createElement("option");
        option.value = b.idBahan;
        option.textContent = `${b.idBahan} - ${
          b.pemasok
        } (Rp ${b.totalPengeluaran.toLocaleString("id-ID")})`;
        option.dataset.totalPengeluaran = b.totalPengeluaran;
        select.appendChild(option);
        added++;
      });
      if (added === 0 && !allowId) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.disabled = true;
        opt.textContent =
          "Semua ID bahan sudah tercatat di keuangan (Pembelian Bahan Baku)";
        select.appendChild(opt);
      }
    }
  } catch (error) {
    console.error("Error loading bahan baku options:", error);
  }
}

// Fungsi untuk toggle field ID Bahan Baku berdasarkan jenis pengeluaran (mendaftarkan ke window)
window.toggleBahanBakuField = async function toggleBahanBakuField() {
  const jenisPengeluaran = document.getElementById("jenisPengeluaran").value;
  const fieldIdBahanBaku = document.getElementById("fieldIdBahanBaku");
  const idBahanBaku = document.getElementById("idBahanBaku");
  const nilai = document.getElementById("nilai");
  const notes = document.getElementById("notes");
  const notesHelp = document.getElementById("notesHelp");

  if (jenisPengeluaran === "Pembelian Bahan Baku") {
    // Tampilkan field ID Bahan Baku
    fieldIdBahanBaku.style.display = "block";
    idBahanBaku.required = true;
    // Load options bahan baku
    await loadBahanBakuOptions();
    // Set nilai menjadi readonly dan kosongkan
    nilai.readOnly = true;
    nilai.value = "";
    // Notes tidak wajib
    notes.required = false;
    notesHelp.textContent = "Opsional";
  } else if (jenisPengeluaran === "Operasional") {
    // Sembunyikan field ID Bahan Baku
    fieldIdBahanBaku.style.display = "none";
    idBahanBaku.required = false;
    idBahanBaku.value = "";
    // Set nilai menjadi editable dan kosongkan
    nilai.readOnly = false;
    nilai.value = "";
    // Notes wajib
    notes.required = true;
    notesHelp.textContent = "Wajib diisi untuk pengeluaran operasional";
  } else {
    // Reset semua field
    fieldIdBahanBaku.style.display = "none";
    idBahanBaku.required = false;
    idBahanBaku.value = "";
    nilai.readOnly = false;
    nilai.value = "";
    notes.required = false;
    notesHelp.textContent = "Wajib diisi untuk pengeluaran operasional";
  }
};

// Fungsi untuk load nilai dari bahan baku yang dipilih
function loadNilaiFromBahan() {
  const jenisPengeluaran = document.getElementById("jenisPengeluaran").value;
  const idBahanBaku = document.getElementById("idBahanBaku");
  const nilai = document.getElementById("nilai");

  if (jenisPengeluaran === "Pembelian Bahan Baku" && idBahanBaku.value) {
    const selectedOption = idBahanBaku.options[idBahanBaku.selectedIndex];
    const totalPengeluaran = parseFloat(
      selectedOption.dataset.totalPengeluaran
    );
    if (!isNaN(totalPengeluaran)) {
      nilai.value = totalPengeluaran.toLocaleString("id-ID");
    }
  }
}

// Fungsi untuk format currency input (mendaftarkan ke window untuk akses dari HTML)
window.formatCurrency = function formatCurrency(input) {
  // Hapus karakter non-digit
  let value = input.value.replace(/\D/g, "");
  // Format dengan separator ribuan
  if (value) {
    input.value = parseInt(value).toLocaleString("id-ID");
  } else {
    input.value = "";
  }
};

// Fungsi untuk parse currency value ke number
function parseCurrencyValue(value) {
  return parseInt(value.replace(/\D/g, "")) || 0;
}

function syncKeuanganJenisFilterOptions() {
  const sel = document.getElementById("filterJenisPengeluaranKeuangan");
  if (!sel) return;
  const prev = String(sel.value || "").trim();
  const names = new Set();
  (keuangan || []).forEach((k) => {
    if (k && k.jenisPengeluaran)
      names.add(String(k.jenisPengeluaran).trim());
  });
  sel.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = "Semua jenis";
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
  const keep = prev && names.has(prev) ? prev : "";
  sel.value = keep;
}

// Fungsi untuk menampilkan data keuangan
async function displayKeuangan() {
  try {
    await loadKeuanganData();
  } catch (error) {
    console.error("Error loading keuangan:", error);
    keuangan = [];
  }

  const tableBody = document.getElementById("tableBodyPengeluaran");
  const searchInput = document.getElementById("searchInput");
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";

  syncKeuanganJenisFilterOptions();
  const jenisFilterEl = document.getElementById("filterJenisPengeluaranKeuangan");
  const filterJenisEff = jenisFilterEl
    ? String(jenisFilterEl.value || "").trim()
    : "";

  // Filter data berdasarkan search
  let filteredKeuangan = keuangan;
  if (searchTerm) {
    filteredKeuangan = keuangan.filter((k) => {
      const tglRaw = k.tanggal != null ? String(k.tanggal) : "";
      const jenis = (k.jenisPengeluaran && String(k.jenisPengeluaran)) || "";
      return (
        tglRaw.toLowerCase().includes(searchTerm) ||
        jenis.toLowerCase().includes(searchTerm) ||
        (k.idBahanBaku &&
          String(k.idBahanBaku).toLowerCase().includes(searchTerm)) ||
        (k.notes && String(k.notes).toLowerCase().includes(searchTerm))
      );
    });
  }
  if (filterJenisEff) {
    filteredKeuangan = filteredKeuangan.filter(
      (k) => (k.jenisPengeluaran || "") === filterJenisEff
    );
  }

  // Sort berdasarkan tanggal (terbaru dulu)
  filteredKeuangan.sort((a, b) => {
    // Prioritas: yang punya ID Bahan Baku (Pembelian Bahan) di atas
    const aHasId = a && a.idBahanBaku ? 1 : 0;
    const bHasId = b && b.idBahanBaku ? 1 : 0;
    if (aHasId !== bHasId) return bHasId - aHasId;

    // Lalu: terbaru dulu
    const dt = new Date(b.tanggal) - new Date(a.tanggal);
    if (dt !== 0) return dt;

    // Stabil: urutkan ID bahan jika sama tanggal
    const aId = a && a.idBahanBaku ? String(a.idBahanBaku) : "";
    const bId = b && b.idBahanBaku ? String(b.idBahanBaku) : "";
    return aId.localeCompare(bId, "id", { numeric: true });
  });

  if (filteredKeuangan.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-4 text-muted">
          <i class="bi bi-inbox fs-1 d-block mb-2"></i>
          Tidak ada data pengeluaran
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filteredKeuangan
    .map(
      (k, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${new Date(k.tanggal).toLocaleDateString("id-ID")}</td>
      <td><span class="badge bg-${
        k.jenisPengeluaran === "Pembelian Bahan Baku" ? "info" : "warning"
      }">${k.jenisPengeluaran}</span></td>
      <td>${k.idBahanBaku || "-"}</td>
      <td>${k.notes || "-"}</td>
      <td class="text-end">Rp ${k.nilai.toLocaleString("id-ID")}</td>
      <td class="text-center">
        <button 
          class="btn btn-sm btn-warning btn-action" 
          onclick="editKeuangan(${k.id || k._id || `'${k._id}'`})"
          title="Edit">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button 
          class="btn btn-sm btn-danger btn-action" 
          onclick="deleteKeuangan(${k.id || k._id || `'${k._id}'`})"
          title="Hapus">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `
    )
    .join("");
}

async function displayPemasukan() {
  try {
    await loadPemasukanData();
  } catch (error) {
    console.error("Error loading pemasukan:", error);
    pemasukan = [];
  }

  const tableBody = document.getElementById("tableBodyPemasukan");
  if (!tableBody) return;

  const searchInput = document.getElementById("searchInput");
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";

  let filtered = pemasukan || [];
  if (searchTerm) {
    filtered = filtered.filter((x) => {
      const tglRaw = x.tanggalPemesanan != null ? String(x.tanggalPemesanan) : "";
      const idp = x.idPembelian != null ? String(x.idPembelian) : "";
      const nama = x.namaPembeli != null ? String(x.namaPembeli) : "";
      const tipe = x.tipePemesanan != null ? String(x.tipePemesanan) : "";
      return (
        tglRaw.toLowerCase().includes(searchTerm) ||
        idp.toLowerCase().includes(searchTerm) ||
        nama.toLowerCase().includes(searchTerm) ||
        tipe.toLowerCase().includes(searchTerm)
      );
    });
  }

  filtered.sort((a, b) => {
    return new Date(b.tanggalPemesanan || 0) - new Date(a.tanggalPemesanan || 0);
  });

  if (!filtered.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-4 text-muted">
          <i class="bi bi-inbox fs-1 d-block mb-2"></i>
          Tidak ada data pemasukan (status pembayaran Lunas)
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filtered
    .map((x, i) => {
      const tgl = x.tanggalPemesanan
        ? new Date(x.tanggalPemesanan).toLocaleDateString("id-ID")
        : "-";
      return `
        <tr>
          <td>${i + 1}</td>
          <td>${tgl}</td>
          <td><strong>${x.idPembelian || "-"}</strong></td>
          <td>${x.namaPembeli || "-"}</td>
          <td>
            <span class="badge ${
              x.tipePemesanan === "International"
                ? "bg-warning text-dark"
                : x.tipePemesanan === "E-commerce"
                  ? "bg-info text-dark"
                  : "bg-primary"
            }">
              ${x.tipePemesanan || "-"}
            </span>
          </td>
          <td class="text-end">Rp ${(x.nilai || 0).toLocaleString("id-ID")}</td>
        </tr>
      `;
    })
    .join("");
}

async function refreshKeuanganPageForActiveTab() {
  const tab = getActiveKeuanganTab();
  syncKeuanganHeaderForTab(tab);
  if (tab === "pemasukan") {
    await displayPemasukan();
  } else {
    await displayKeuangan();
  }
}

// Fungsi untuk membuka modal tambah/edit (mendaftarkan ke window)
window.openModal = async function openModal(mode = "add") {
  currentEditId = null;
  const form = document.getElementById("formKeuangan");
  const modalTitle = document.getElementById("modalKeuanganLabel");
  const nilai = document.getElementById("nilai");

  form.reset();
  nilai.readOnly = false;

  if (mode === "add") {
    modalTitle.textContent = "Tambah Pengeluaran";
    // Set tanggal default ke hari ini
    const today = new Date().toISOString().split("T")[0];
    document.getElementById("tanggal").value = today;
    // Reset jenis pengeluaran
    document.getElementById("jenisPengeluaran").value = "";
    toggleBahanBakuField();
  } else {
    modalTitle.textContent = "Edit Pengeluaran";
  }

  // Load bahan baku options
  await loadBahanBakuOptions();
};

// Fungsi untuk edit keuangan
async function editKeuangan(id) {
  try {
    await loadKeuanganData();
    const k = keuangan.find((item) => item.id === id || item._id === id);
    if (!k) {
      alert("Data keuangan tidak ditemukan!");
      return;
    }

    currentEditId = id;
    document.getElementById("keuanganId").value = k.id || k._id;
    document.getElementById("tanggal").value = k.tanggal;
    document.getElementById("jenisPengeluaran").value = k.jenisPengeluaran;
    document.getElementById("notes").value = k.notes || "";
    document.getElementById("nilai").value = k.nilai.toLocaleString("id-ID");

    // Toggle field berdasarkan jenis pengeluaran
    toggleBahanBakuField();

    // Jika jenis pengeluaran adalah Pembelian Bahan Baku, set ID Bahan Baku
    if (k.jenisPengeluaran === "Pembelian Bahan Baku" && k.idBahanBaku) {
      // Tunggu sampai options ter-load
      setTimeout(() => {
        document.getElementById("idBahanBaku").value = k.idBahanBaku;
        loadNilaiFromBahan();
      }, 100);
    }

    const modal = new bootstrap.Modal(document.getElementById("modalKeuangan"));
    modal.show();
  } catch (error) {
    console.error("Error loading keuangan for edit:", error);
    alert("Error memuat data keuangan");
  }
}

// Fungsi untuk menyimpan keuangan (tambah/edit) (mendaftarkan ke window)
window.saveKeuangan = async function saveKeuangan() {
  const form = document.getElementById("formKeuangan");
  const jenisPengeluaran = document.getElementById("jenisPengeluaran").value;
  const notes = document.getElementById("notes").value;

  // Validasi khusus untuk operasional (notes wajib)
  if (jenisPengeluaran === "Operasional" && !notes.trim()) {
    alert("Notes wajib diisi untuk pengeluaran operasional!");
    notes.focus();
    return;
  }

  // Validasi khusus untuk pembelian bahan baku (ID Bahan Baku wajib)
  if (jenisPengeluaran === "Pembelian Bahan Baku") {
    const idBahanBaku = document.getElementById("idBahanBaku").value;
    if (!idBahanBaku) {
      alert("ID Bahan Baku wajib dipilih!");
      return;
    }
  }

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const keuanganId = document.getElementById("keuanganId").value;
  const tanggal = document.getElementById("tanggal").value;
  const idBahanBaku =
    jenisPengeluaran === "Pembelian Bahan Baku"
      ? document.getElementById("idBahanBaku").value
      : null;
  const nilai = parseCurrencyValue(document.getElementById("nilai").value);

  if (nilai <= 0) {
    alert("Nilai harus lebih dari 0!");
    return;
  }

  try {
    const dataKeuangan = {
      tanggal,
      jenisPengeluaran,
      idBahanBaku,
      notes: notes.trim() || null,
      nilai,
    };

    // VERIFY API AVAILABILITY - NO FALLBACK
    if (!window.API || !window.API.Keuangan) {
      const errorMsg =
        "❌ API.Keuangan tidak tersedia. Tidak dapat menyimpan data. Pastikan backend MongoDB aktif.";
      console.error(errorMsg);
      alert(errorMsg);
      throw new Error(errorMsg);
    }

    if (keuanganId) {
      // Edit mode - Update via API (MongoDB ONLY)
      console.log("🔄 Updating keuangan via API:", keuanganId);
      await window.API.Keuangan.update(keuanganId, dataKeuangan);
      console.log("✅ Keuangan updated in MongoDB");
    } else {
      // Add mode - Create via API (MongoDB ONLY)
      // NOTE: Backend will generate ID automatically via get_next_id('keuangan')
      console.log("🔄 Creating keuangan via API (backend will generate ID)");
      const result = await window.API.Keuangan.create(dataKeuangan);
      console.log("✅ Keuangan created in MongoDB:", result);
    }

    await loadKeuanganData();
    await displayKeuangan();

    // Trigger event untuk update dashboard
    window.dispatchEvent(
      new CustomEvent("dataUpdated", { detail: { type: "keuangan" } })
    );

    // Tutup modal
    const modal = bootstrap.Modal.getInstance(
      document.getElementById("modalKeuangan")
    );
    modal.hide();

    // Reset form
    form.reset();
    currentEditId = null;
    
    // Auto refresh halaman setelah save berhasil
    setTimeout(() => {
      window.location.reload();
    }, 500);
  } catch (error) {
    console.error("Error saving keuangan:", error);
    alert("Error menyimpan data: " + (error.message || "Unknown error"));
  }
};

// Fungsi untuk delete keuangan
async function deleteKeuangan(id) {
  try {
    await loadKeuanganData();
    const k = keuangan.find((item) => item.id === id || item._id === id);
    if (!k) {
      alert("Data keuangan tidak ditemukan!");
      return;
    }

    currentDeleteId = id;
    if (
      confirm(
        `Apakah Anda yakin ingin menghapus pengeluaran pada tanggal ${new Date(
          k.tanggal
        ).toLocaleDateString("id-ID")} sebesar Rp ${k.nilai.toLocaleString(
          "id-ID"
        )}?`
      )
    ) {
      // VERIFY API AVAILABILITY - NO FALLBACK
      if (!window.API || !window.API.Keuangan) {
        const errorMsg =
          "❌ API.Keuangan tidak tersedia. Tidak dapat menghapus data. Pastikan backend MongoDB aktif.";
        alert(errorMsg);
        throw new Error(errorMsg);
      }

      // Delete via API (MongoDB ONLY)
      console.log("🔄 Deleting keuangan via API:", id);
      await window.API.Keuangan.delete(id);
      console.log("✅ Keuangan deleted from MongoDB");

      await loadKeuanganData();
      await displayKeuangan();

      // Trigger event untuk update dashboard
      window.dispatchEvent(
        new CustomEvent("dataUpdated", { detail: { type: "keuangan" } })
      );

      currentDeleteId = null;
    }
  } catch (error) {
    console.error("Error deleting keuangan:", error);
    alert("Error menghapus data: " + (error.message || "Unknown error"));
  }
}

// Event listener untuk search
document.addEventListener("DOMContentLoaded", function () {
  setTimeout(async () => {
    try {
      await refreshKeuanganPageForActiveTab();
    } catch (error) {
      console.error("Error initializing keuangan page:", error);
    }
  }, 100);

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", async () => {
      await refreshKeuanganPageForActiveTab();
    });
  }

  const filterJenis = document.getElementById("filterJenisPengeluaranKeuangan");
  if (filterJenis) {
    filterJenis.addEventListener("change", async () => {
      await refreshKeuanganPageForActiveTab();
    });
  }

  // Event listener untuk modal show
  const modalKeuangan = document.getElementById("modalKeuangan");
  if (modalKeuangan) {
    modalKeuangan.addEventListener("show.bs.modal", async function () {
      await loadBahanBakuOptions();
    });
  }

  // Tabs change: refresh current tab view + header controls
  const tabs = document.querySelectorAll('#keuanganTabs [data-bs-toggle="tab"]');
  tabs.forEach((t) => {
    t.addEventListener("shown.bs.tab", async () => {
      await refreshKeuanganPageForActiveTab();
    });
  });
});
