// Data pemesanan (MONGODB ONLY - NO localStorage fallback)
let pemesanan = [];
let pemesananData = []; // Array untuk filtering
let stokData = [];
let stokProduksiData = []; // Data stok produksi
let ordering = [];
let currentEditId = null;
let currentDeleteId = null;
/** Saat edit pemesanan yang sudah Complete: status tetap Complete, stok tidak diubah dari form ini. */
let currentEditPreservesComplete = false;
let pembeliMasterList = [];
let currentPembeliEditId = null;
/** Opsi master untuk baris kloter (diisi loadMasterDataOptions) */
let masterProsesNames = [];
let masterJenisKopiNames = [];

// Wait for API to be ready (event-based + polling fallback)
async function waitForAPI() {
  if (window.API && window.API.Pemesanan && window.API.Pembeli) return true;
  return new Promise((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(!!(window.API && window.API.Pemesanan && window.API.Pembeli));
      }
    }, 5000);
    const eventHandler = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        window.removeEventListener("APIReady", eventHandler);
        resolve(!!(window.API && window.API.Pemesanan && window.API.Pembeli));
      }
    };
    window.addEventListener("APIReady", eventHandler);
    let pollCount = 0;
    const pollInterval = setInterval(() => {
      pollCount++;
      if (window.API && window.API.Pemesanan && window.API.Pembeli) {
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

// Load stok agregat (sama dengan Kelola Stok: /api/stok)
async function loadStokData() {
  console.log(
    "🔄 [LOAD STOK DATA] Loading stok agregat (selaras Kelola Stok)...",
  );

  if (!window.API) {
    console.error("❌ [LOAD STOK DATA] window.API tidak tersedia");
    throw new Error("window.API tidak tersedia");
  }

  if (!window.API.Stok || !window.API.Stok.getAll) {
    console.error("❌ [LOAD STOK DATA] window.API.Stok.getAll tidak tersedia");
    throw new Error("API.Stok.getAll tidak tersedia");
  }

  const res = await window.API.Stok.getAll({});
  const rows = Array.isArray(res.rows) ? res.rows : [];
  stokData = rows.map((r) => ({
    tipeProduk: r.tipeProduk,
    jenisKopi: r.jenisKopi,
    prosesPengolahan: r.prosesPengolahan,
    totalBerat: parseFloat(r.totalBerat) || 0,
    stokTersedia: parseFloat(r.totalBerat) || 0,
  }));

  console.log(
    `✅ [LOAD STOK DATA] Loaded ${stokData.length} baris stok agregat`,
  );
  return stokData;
}

function findStokRowForPemesanan(p) {
  if (!p || !Array.isArray(stokData)) return null;
  const tipe = (p.tipeProduk || "").trim();
  const jk = (p.jenisKopi || "").trim();
  const proses = (p.prosesPengolahan || "").trim();
  return stokData.find(
    (s) =>
      (s.tipeProduk || "").trim() === tipe &&
      (s.jenisKopi || "").trim() === jk &&
      (s.prosesPengolahan || "").trim() === proses,
  );
}

function showAggregatedStokForPemesanan(p) {
  const lines = getPemesananKloterLinesFromDoc(p);
  const multi =
    lines.length > 1 ||
    new Set(
      lines.map(
        (L) =>
          `${(L.tipeProduk || "").trim()}|${(L.jenisKopi || "").trim()}|${(L.prosesPengolahan || "").trim()}`,
      ),
    ).size > 1;

  const displayStokTersedia = document.getElementById("displayStokTersedia");
  const displayProduksiProses = document.getElementById(
    "displayProduksiProses",
  );
  const displayProduksiJenisKopi = document.getElementById(
    "displayProduksiJenisKopi",
  );
  const stokInfoDisplay = document.getElementById("stokInfoDisplay");
  const hintEl = document.getElementById("displayStokAgregatHint");

  if (multi) {
    if (displayStokTersedia) displayStokTersedia.textContent = "—";
    if (displayProduksiProses) displayProduksiProses.textContent = "Campuran";
    if (displayProduksiJenisKopi)
      displayProduksiJenisKopi.textContent = "Campuran";
    if (hintEl) {
      hintEl.textContent =
        "Beberapa kloter: stok dicek per kombinasi tipe, jenis kopi, dan proses saat Anda menekan Proses Ordering (validasi di server).";
      hintEl.className = "small text-muted mb-0";
    }
    if (stokInfoDisplay) stokInfoDisplay.style.display = "block";
    return;
  }

  const row = findStokRowForPemesanan(p);
  const stok = row
    ? parseFloat(row.stokTersedia ?? row.totalBerat ?? 0) || 0
    : 0;

  if (displayStokTersedia) {
    displayStokTersedia.textContent = stok.toLocaleString("id-ID", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  if (displayProduksiProses) {
    displayProduksiProses.textContent = p.prosesPengolahan || "-";
  }
  if (displayProduksiJenisKopi) {
    displayProduksiJenisKopi.textContent = p.jenisKopi || "-";
  }
  if (hintEl) {
    hintEl.textContent = row
      ? "Stok dihitung per kombinasi tipe produk, jenis kopi, dan proses (sama dengan halaman Kelola Stok)."
      : "Tidak ada baris stok yang cocok dengan pemesanan ini. Periksa proses pengolahan dan jenis kopi agar sama dengan data produksi.";
    hintEl.className = row ? "small text-muted mb-0" : "small text-warning mb-0";
  }
  if (stokInfoDisplay) stokInfoDisplay.style.display = "block";
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

/** Baca kloter dari dokumen API (kloter → items → satu baris root). */
function getPemesananKloterLinesFromDoc(p) {
  if (!p) return [];
  const rows = p.kloter || p.items;
  if (Array.isArray(rows) && rows.length > 0) {
    return rows.map((r) => ({
      tipeProduk: r.tipeProduk || "",
      jenisKopi: r.jenisKopi || "",
      prosesPengolahan: r.prosesPengolahan || "",
      beratKg:
        r.beratKg != null && r.beratKg !== ""
          ? r.beratKg
          : r.jumlahPesananKg != null
            ? r.jumlahPesananKg
            : "",
      hargaPerKg: r.hargaPerKg != null ? r.hargaPerKg : "",
    }));
  }
  return [
    {
      tipeProduk: p.tipeProduk || "",
      jenisKopi: p.jenisKopi || "",
      prosesPengolahan: p.prosesPengolahan || "",
      beratKg: p.jumlahPesananKg != null ? p.jumlahPesananKg : "",
      hargaPerKg: p.hargaPerKg != null ? p.hargaPerKg : "",
    },
  ];
}

function totalBeratKloterFromDoc(p) {
  const lines = getPemesananKloterLinesFromDoc(p);
  let s = 0;
  lines.forEach((L) => {
    const w = parseFloat(L.beratKg);
    if (Number.isFinite(w)) s += w;
  });
  return s || parseFloat(p.jumlahPesananKg) || 0;
}

function ringkasProdukUntukTabel(p) {
  const lines = getPemesananKloterLinesFromDoc(p);
  if (lines.length > 1) {
    const t0 = (lines[0].tipeProduk || "").trim();
    return `${lines.length} kloter${t0 ? ` · ${t0}…` : ""}`;
  }
  if (lines.length === 1) {
    const L = lines[0];
    const bits = [L.tipeProduk, L.jenisKopi, L.prosesPengolahan].filter(
      Boolean,
    );
    return bits.join(" · ") || p.tipeProduk || "—";
  }
  return p.tipeProduk || "—";
}

function buildTipeProdukOptionsHtml(selected) {
  const opts = ["Green Beans", "Pixel"].map(
    (nama) =>
      `<option value="${escapeHtmlAttr(nama)}"${selected === nama ? " selected" : ""}>${escapeHtmlAttr(nama)}</option>`,
  );
  return `<option value="">Pilih</option>${opts.join("")}`;
}

function buildJenisKopiOptionsHtml(selected) {
  let html = '<option value="">Pilih</option>';
  masterJenisKopiNames.forEach((nama) => {
    html += `<option value="${escapeHtmlAttr(nama)}"${selected === nama ? " selected" : ""}>${escapeHtmlAttr(nama)}</option>`;
  });
  return html;
}

function buildProsesOptionsHtml(selected) {
  let html = '<option value="">Pilih</option>';
  masterProsesNames.forEach((nama) => {
    html += `<option value="${escapeHtmlAttr(nama)}"${selected === nama ? " selected" : ""}>${escapeHtmlAttr(nama)}</option>`;
  });
  return html;
}

function updateKloterRowSubtotal(tr) {
  const b = parseFloat(tr.querySelector(".kloter-berat")?.value || 0);
  const h = parseFloat(tr.querySelector(".kloter-harga")?.value || 0);
  const sub = Number.isFinite(b) && Number.isFinite(h) ? b * h : 0;
  const span = tr.querySelector(".kloter-subtotal");
  if (span) {
    span.textContent =
      sub > 0
        ? `Rp ${sub.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`
        : "—";
    span.dataset.subnilai = String(sub);
  }
}

function syncKloterRemoveButtons() {
  const tb = document.getElementById("tbodyKloterPemesanan");
  if (!tb) return;
  const rows = tb.querySelectorAll("tr.kloter-row");
  rows.forEach((tr) => {
    const btn = tr.querySelector("button[data-remove-kloter]");
    if (btn) btn.disabled = rows.length <= 1;
  });
}

function addKloterRow(initial = {}) {
  const tb = document.getElementById("tbodyKloterPemesanan");
  if (!tb) return;
  const tipe = (initial.tipeProduk || "").trim();
  const jk = (initial.jenisKopi || "").trim();
  const pr = (initial.prosesPengolahan || "").trim();
  const berat =
    initial.beratKg !== "" && initial.beratKg != null ? initial.beratKg : "";
  const hp =
    initial.hargaPerKg !== "" && initial.hargaPerKg != null
      ? initial.hargaPerKg
      : "";
  const tr = document.createElement("tr");
  tr.className = "kloter-row";
  tr.innerHTML = `
    <td><select class="form-select form-select-sm kloter-tipe" required>${buildTipeProdukOptionsHtml(tipe)}</select></td>
    <td><select class="form-select form-select-sm kloter-jenis" required>${buildJenisKopiOptionsHtml(jk)}</select></td>
    <td><select class="form-select form-select-sm kloter-proses" required>${buildProsesOptionsHtml(pr)}</select></td>
    <td><input type="number" class="form-control form-control-sm kloter-berat text-end" placeholder="0" min="0" step="0.01" value="${berat === "" ? "" : escapeHtmlAttr(String(berat))}" required /></td>
    <td><input type="number" class="form-control form-control-sm kloter-harga text-end" placeholder="0" min="0" step="1000" value="${hp === "" ? "" : escapeHtmlAttr(String(hp))}" required /></td>
    <td class="text-end"><span class="kloter-subtotal small text-muted" data-subnilai="0">—</span></td>
    <td class="text-center p-0 align-middle"><button type="button" class="btn btn-sm btn-outline-danger border-0" data-remove-kloter="1" onclick="removeKloterRow(this)" title="Hapus kloter"><i class="bi bi-x-lg"></i></button></td>
  `;
  tb.appendChild(tr);
  tr.querySelectorAll("select, input").forEach((el) => {
    el.addEventListener("change", () => calculateTotalHarga());
    el.addEventListener("input", () => calculateTotalHarga());
  });
  updateKloterRowSubtotal(tr);
  syncKloterRemoveButtons();
}

function addKloterRowClick() {
  addKloterRow({});
  calculateTotalHarga();
}

function removeKloterRow(btn) {
  const tr = btn.closest("tr");
  const tb = document.getElementById("tbodyKloterPemesanan");
  if (!tr || !tb) return;
  if (tb.querySelectorAll("tr.kloter-row").length <= 1) return;
  tr.remove();
  syncKloterRemoveButtons();
  calculateTotalHarga();
}

function renderKloterTable(rows) {
  const tb = document.getElementById("tbodyKloterPemesanan");
  if (!tb) return;
  tb.innerHTML = "";
  const list = Array.isArray(rows) && rows.length ? rows : [{}];
  list.forEach((r) => addKloterRow(r));
  calculateTotalHarga();
}

function collectKloterFromForm() {
  const tb = document.getElementById("tbodyKloterPemesanan");
  if (!tb) return [];
  const out = [];
  tb.querySelectorAll("tr.kloter-row").forEach((tr) => {
    const tipe = (tr.querySelector(".kloter-tipe")?.value || "").trim();
    const jk = (tr.querySelector(".kloter-jenis")?.value || "").trim();
    const pr = (tr.querySelector(".kloter-proses")?.value || "").trim();
    const berat = parseFloat(tr.querySelector(".kloter-berat")?.value || 0);
    const hp = parseFloat(tr.querySelector(".kloter-harga")?.value || 0);
    out.push({
      tipeProduk: tipe,
      jenisKopi: jk,
      prosesPengolahan: pr,
      beratKg: berat,
      hargaPerKg: hp,
    });
  });
  return out;
}

// Calculate total harga (Σ subtotal kloter + pajak + pengiriman)
function calculateTotalHarga() {
  const tb = document.getElementById("tbodyKloterPemesanan");
  let subtotalBarang = 0;
  if (tb) {
    tb.querySelectorAll("tr.kloter-row").forEach((tr) => {
      updateKloterRowSubtotal(tr);
      const v = parseFloat(tr.querySelector(".kloter-subtotal")?.dataset.subnilai || 0);
      if (Number.isFinite(v)) subtotalBarang += v;
    });
  }
  const pajakRaw = parseFloat(
    document.getElementById("biayaPajak")?.value || 0,
  );
  const kirimRaw = parseFloat(
    document.getElementById("biayaPengiriman")?.value || 0,
  );
  const pajak = Number.isFinite(pajakRaw) ? Math.max(0, pajakRaw) : 0;
  const kirim = Number.isFinite(kirimRaw) ? Math.max(0, kirimRaw) : 0;
  const total = subtotalBarang + pajak + kirim;

  const th = document.getElementById("totalHarga");
  if (th) {
    th.value = total.toLocaleString("id-ID").replace(/\./g, ",");
  }
}

// ==================== MASTER PEMBELI (tab Data Pembeli) ====================

function escapeHtmlAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function loadPembeliMasterList() {
  if (!window.API?.Pembeli?.getAll) return [];
  pembeliMasterList = await window.API.Pembeli.getAll();
  if (!Array.isArray(pembeliMasterList)) pembeliMasterList = [];
  return pembeliMasterList;
}

async function refreshSelectMasterPembeli() {
  await loadPembeliMasterList();
  const sel = document.getElementById("selectMasterPembeli");
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Manual / tanpa master —</option>';
  pembeliMasterList.forEach((b) => {
    const opt = document.createElement("option");
    opt.value = (b.idPembeli || "").trim();
    opt.textContent = `${b.idPembeli || "-"} — ${b.nama || "-"}`;
    sel.appendChild(opt);
  });
  if (cur && Array.from(sel.options).some((o) => o.value === cur)) {
    sel.value = cur;
  }
}

function mapTipePembeliKePemesanan(tipe) {
  if (tipe === "ecommerce") return "E-commerce";
  if (tipe === "International") return "International";
  return "Lokal";
}

function onSelectMasterPembeliChange() {
  const sel = document.getElementById("selectMasterPembeli");
  const id = sel?.value?.trim();
  const hid = document.getElementById("idMasterPembeli");
  if (!id) {
    if (hid) hid.value = "";
    return;
  }
  const b = pembeliMasterList.find((x) => (x.idPembeli || "").trim() === id);
  if (!b) return;
  if (hid) hid.value = b.idPembeli || "";
  const n = document.getElementById("namaPembeli");
  const k = document.getElementById("kontakPembeli");
  const a = document.getElementById("alamatPembeli");
  const t = document.getElementById("tipePemesanan");
  if (n) n.value = b.nama || "";
  if (k) k.value = b.kontak || "";
  if (a) a.value = b.alamat || "";
  if (t) {
    t.value = mapTipePembeliKePemesanan(b.tipePembeli || "");
    toggleNegaraField();
  }
}

function labelTipePembeli(t) {
  if (t === "ecommerce") return "E-commerce";
  return t || "-";
}

function applyFilterPembeliMaster() {
  const tbody = document.getElementById("tablePembeliMaster");
  if (!tbody) return;
  const q = (document.getElementById("searchPembeliMaster")?.value || "")
    .toLowerCase()
    .trim();
  let rows = pembeliMasterList;
  if (q) {
    rows = rows.filter(
      (b) =>
        (b.idPembeli && String(b.idPembeli).toLowerCase().includes(q)) ||
        (b.nama && String(b.nama).toLowerCase().includes(q)) ||
        (b.kontak && String(b.kontak).toLowerCase().includes(q)) ||
        (b.alamat && String(b.alamat).toLowerCase().includes(q)),
    );
  }
  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="text-center py-4 text-muted">Tidak ada data pembeli</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(
      (b, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${escapeHtmlAttr(b.idPembeli)}</strong></td>
      <td>${escapeHtmlAttr(b.nama)}</td>
      <td>${escapeHtmlAttr(b.kontak)}</td>
      <td>${escapeHtmlAttr(b.alamat)}</td>
      <td><span class="badge bg-secondary">${escapeHtmlAttr(labelTipePembeli(b.tipePembeli))}</span></td>
      <td class="text-center">
        <button type="button" class="btn btn-sm btn-warning me-1" data-pembeli-edit="${escapeHtmlAttr(b._id)}" title="Edit"><i class="bi bi-pencil"></i></button>
        <button type="button" class="btn btn-sm btn-danger" data-pembeli-del="${escapeHtmlAttr(b._id)}" title="Hapus"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`,
    )
    .join("");
  tbody.querySelectorAll("[data-pembeli-edit]").forEach((btn) => {
    btn.addEventListener("click", () =>
      editPembeliMaster(btn.getAttribute("data-pembeli-edit")),
    );
  });
  tbody.querySelectorAll("[data-pembeli-del]").forEach((btn) => {
    btn.addEventListener("click", () =>
      deletePembeliMaster(btn.getAttribute("data-pembeli-del")),
    );
  });
}

async function loadPembeliMasterTable() {
  try {
    await loadPembeliMasterList();
    applyFilterPembeliMaster();
  } catch (e) {
    console.error(e);
    const tbody = document.getElementById("tablePembeliMaster");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">Gagal memuat: ${escapeHtmlAttr(e.message)}</td></tr>`;
    }
  }
}

function openModalPembeli(mode) {
  const label = document.getElementById("modalPembeliLabel");
  const form = document.getElementById("formPembeli");
  if (mode === "add") {
    if (label) label.textContent = "Tambah Pembeli";
    if (form) form.reset();
    const mid = document.getElementById("pembeliMongoId");
    if (mid) mid.value = "";
    const idf = document.getElementById("idPembeliMaster");
    if (idf) {
      idf.value = "";
      idf.readOnly = false;
    }
    currentPembeliEditId = null;
  }
}

async function editPembeliMaster(mongoId) {
  await loadPembeliMasterList();
  const b = pembeliMasterList.find((x) => String(x._id) === String(mongoId));
  if (!b) {
    alert("Data tidak ditemukan");
    return;
  }
  currentPembeliEditId = mongoId;
  openModalPembeli("edit");
  if (document.getElementById("modalPembeliLabel")) {
    document.getElementById("modalPembeliLabel").textContent = "Edit Pembeli";
  }
  document.getElementById("pembeliMongoId").value = mongoId;
  document.getElementById("idPembeliMaster").value = b.idPembeli || "";
  document.getElementById("idPembeliMaster").readOnly = true;
  document.getElementById("namaPembeliMaster").value = b.nama || "";
  document.getElementById("kontakPembeliMaster").value = b.kontak || "";
  document.getElementById("alamatPembeliMaster").value = b.alamat || "";
  document.getElementById("tipePembeliMaster").value = b.tipePembeli || "";
  const m = new bootstrap.Modal(document.getElementById("modalPembeli"));
  m.show();
}

async function savePembeliMaster() {
  const form = document.getElementById("formPembeli");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  const payload = {
    nama: document.getElementById("namaPembeliMaster").value.trim(),
    kontak: document.getElementById("kontakPembeliMaster").value.trim(),
    alamat: document.getElementById("alamatPembeliMaster").value.trim(),
    tipePembeli: document.getElementById("tipePembeliMaster").value,
  };
  const idManual = document.getElementById("idPembeliMaster").value.trim();
  if (idManual) payload.idPembeli = idManual;
  try {
    const mid = document.getElementById("pembeliMongoId").value;
    if (mid) {
      await window.API.Pembeli.update(mid, payload);
    } else {
      await window.API.Pembeli.create(payload);
    }
    bootstrap.Modal.getInstance(document.getElementById("modalPembeli"))?.hide();
    await loadPembeliMasterTable();
    await refreshSelectMasterPembeli();
    if (window.showNotification) {
      window.showNotification(
        "update",
        "Pemesanan",
        "success",
        "Data pembeli berhasil disimpan",
      );
    } else {
      alert("Data pembeli berhasil disimpan");
    }
  } catch (e) {
    console.error(e);
    const msg = e.data?.error || e.message || "Gagal menyimpan";
    alert(msg);
  }
}

async function deletePembeliMaster(mongoId) {
  if (!confirm("Hapus pembeli ini?")) return;
  try {
    await window.API.Pembeli.delete(mongoId);
    await loadPembeliMasterTable();
    await refreshSelectMasterPembeli();
  } catch (e) {
    alert(e.data?.error || e.message || "Gagal menghapus");
  }
}

// Load Master Data options
async function loadMasterDataOptions() {
  try {
    if (!window.API || !window.API.MasterData) {
      console.warn("⚠️ API.MasterData not available");
      return;
    }

    const proses = await window.API.MasterData.proses.getAll();
    masterProsesNames = (proses || [])
      .map((p) => (p.namaProses || p.nama || "").trim())
      .filter(Boolean);

    const jenisKopi = await window.API.MasterData.jenisKopi.getAll();
    masterJenisKopiNames = (jenisKopi || [])
      .map((j) => (j.namaJenisKopi || j.nama || "").trim())
      .filter(Boolean);

    // Kemasan tidak lagi digunakan di pemesanan
  } catch (error) {
    console.error("❌ Error loading master data options:", error);
  }
}

// Fungsi loadKemasanOptions dihapus - kemasan tidak lagi digunakan di pemesanan

// Filter stok table (removed - no longer needed)

// ==================== STOK PRODUKSI (READ-ONLY) ====================

// Load stok produksi (sumber data = GET /api/stok, sama dengan Kelola Stok)
async function loadStokProduksi() {
  try {
    console.log("🔄 [STOK PRODUKSI] Loading stok hasil produksi (agregat)...");

    if (!window.API) {
      throw new Error("window.API tidak tersedia");
    }

    await loadStokData();
    stokProduksiData = (stokData || []).map((s) => {
      const w = parseFloat(s.stokTersedia ?? s.totalBerat) || 0;
      return {
        tipeProduk: s.tipeProduk || "-",
        jenisKopi: s.jenisKopi || "-",
        prosesPengolahan: s.prosesPengolahan || "-",
        stokTersedia: w,
        statusStok: w > 0 ? "Cukup" : "Habis",
      };
    });

    console.log(
      `✅ [STOK PRODUKSI] ${stokProduksiData.length} baris (agregat, selaras Kelola Stok)`,
    );
    displayStokProduksi();
  } catch (error) {
    console.error("❌ [STOK PRODUKSI] Error loading stok produksi:", error);
    stokProduksiData = [];
    displayStokProduksi();

    const tableBody = document.getElementById("tableStokProduksi");
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-4 text-danger">
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
          <td colspan="6" class="text-center py-4 text-muted">
            <i class="bi bi-inbox fs-1 d-block mb-2"></i>
            Tidak ada data stok hasil produksi
            <br><small>Selaras Kelola Stok: batch pengemasan dengan tanggal pengemasan dan berat akhir</small>
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
        <td><span class="badge ${s.tipeProduk === 'Green Beans' ? 'bg-success' : 'bg-info'}">${s.tipeProduk || "-"}</span></td>
        <td><span class="badge ${(window.getJenisKopiBadgeClass || (() => 'bg-secondary'))(s.jenisKopi)}">${s.jenisKopi || "-"}</span></td>
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
        <td colspan="6" class="text-center py-4 text-danger">
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
            p.tipePemesanan === "International"
              ? "bg-warning text-dark"
              : p.tipePemesanan === "E-commerce"
                ? "bg-info text-dark"
                : "bg-primary"
          }">
            ${p.tipePemesanan || "-"}
          </span>
        </td>
        <td>${p.negara || "-"}</td>
        <td>${escapeHtmlAttr(ringkasProdukUntukTabel(p))}</td>
        <td>${totalBeratKloterFromDoc(p).toLocaleString("id-ID")} kg</td>
        <td>Rp ${(p.totalHarga || 0).toLocaleString("id-ID")}</td>
        <td>
          <span class="badge ${
            (p.statusPembayaran || "Belum Lunas") === "Lunas"
              ? "bg-success"
              : (p.statusPembayaran || "") === "Pembayaran Bertahap"
                ? "bg-info text-dark"
                : "bg-warning text-dark"
          }">
            ${p.statusPembayaran || "Belum Lunas"}
          </span>
        </td>
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
          <button class="btn btn-sm btn-warning btn-action me-1" onclick="editPemesanan('${p.idPembelian || p.id || p._id}')" title="Edit Pemesanan"><i class="bi bi-pencil"></i></button>
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
async function openModalOrderingForPemesanan(idPembelian) {
  await openModalOrdering();

  const idPembelianSelect = document.getElementById("idPembelianOrdering");
  if (idPembelianSelect) {
    idPembelianSelect.value = idPembelian;
    if (typeof loadPemesananDataForOrdering === "function") {
      await loadPemesananDataForOrdering();
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
async function openModal(mode = "add") {
  currentEditId = null;
  currentEditPreservesComplete = false;
  const modal = document.getElementById("modalPemesanan");
  const modalLabel = document.getElementById("modalPemesananLabel");
  const form = document.getElementById("formPemesanan");

  if (mode === "add") {
    modalLabel.textContent = "Tambah Pemesanan";
    form.reset();
    document.getElementById("pemesananId").value = "";

    const statusField = document.getElementById("statusPemesanan");
    if (statusField) {
      statusField.disabled = false;
      const completeOption = statusField.querySelector(
        'option[value="Complete"]',
      );
      if (completeOption) completeOption.remove();
      statusField.value = "Ordering";
    }
    const htAdd = document.getElementById("hintStatusPemesananForm");
    if (htAdd) htAdd.style.display = "none";

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

    const idMaster = document.getElementById("idMasterPembeli");
    if (idMaster) idMaster.value = "";
    const selMp = document.getElementById("selectMasterPembeli");
    if (selMp) selMp.value = "";
    const kpb = document.getElementById("kontakPembeli");
    const apb = document.getElementById("alamatPembeli");
    if (kpb) kpb.value = "";
    if (apb) apb.value = "";
    refreshSelectMasterPembeli();
    const spBayar = document.getElementById("statusPembayaran");
    if (spBayar) spBayar.value = "Belum Lunas";
    const catPm = document.getElementById("catatanPemesanan");
    if (catPm) catPm.value = "";
    const bp = document.getElementById("biayaPajak");
    if (bp) bp.value = "0";
    const bpg = document.getElementById("biayaPengiriman");
    if (bpg) bpg.value = "0";

    const btnCetak = document.getElementById("btnSimpanCetakInvoice");
    if (btnCetak) btnCetak.style.display = "";

    const wPem = document.getElementById("wrapSelectIdProduksiPemesanan");
    if (wPem) wPem.style.display = "none";
    const selPem = document.getElementById("selectIdProduksiPemesanan");
    if (selPem) selPem.innerHTML = '<option value="">Otomatis (FIFO)</option>';

    await loadMasterDataOptions();
    renderKloterTable([{}]);
  } else {
    modalLabel.textContent = "Edit Pemesanan";
    const btnCetak = document.getElementById("btnSimpanCetakInvoice");
    if (btnCetak) btnCetak.style.display = "none";
    await loadMasterDataOptions();
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

    currentEditPreservesComplete = p.statusPemesanan === "Complete";
    currentEditId = id;
    document.getElementById("pemesananId").value = p.id || p._id;
    document.getElementById("idPembelian").value = p.idPembelian;
    document.getElementById("namaPembeli").value = p.namaPembeli || "";
    document.getElementById("tipePemesanan").value = p.tipePemesanan || "";
    document.getElementById("negara").value = p.negara || "";
    const kEl = document.getElementById("kontakPembeli");
    const aEl = document.getElementById("alamatPembeli");
    if (kEl) kEl.value = p.kontakPembeli || "";
    if (aEl) aEl.value = p.alamatPembeli || "";
    const im = document.getElementById("idMasterPembeli");
    if (im) im.value = p.idMasterPembeli || "";
    await refreshSelectMasterPembeli();
    const smp = document.getElementById("selectMasterPembeli");
    if (smp && p.idMasterPembeli) {
      smp.value = p.idMasterPembeli;
    }
    await loadMasterDataOptions();
    renderKloterTable(getPemesananKloterLinesFromDoc(p));
    const bpEl = document.getElementById("biayaPajak");
    if (bpEl) bpEl.value = p.biayaPajak != null ? p.biayaPajak : "0";
    const bpgEl = document.getElementById("biayaPengiriman");
    if (bpgEl) bpgEl.value = p.biayaPengiriman != null ? p.biayaPengiriman : "0";
    calculateTotalHarga();
    document.getElementById("statusPemesanan").value =
      p.statusPemesanan || "Ordering";
    const spb = document.getElementById("statusPembayaran");
    if (spb) spb.value = p.statusPembayaran || "Belum Lunas";
    const cpn = document.getElementById("catatanPemesanan");
    if (cpn) cpn.value = p.catatanPemesanan || "";
    document.getElementById("tanggalPemesanan").value =
      p.tanggalPemesanan || "";

    const statusField = document.getElementById("statusPemesanan");
    if (statusField) {
      if (currentEditPreservesComplete) {
        statusField.disabled = true;
        if (!statusField.querySelector('option[value="Complete"]')) {
          const o = document.createElement("option");
          o.value = "Complete";
          o.textContent = "Complete";
          statusField.appendChild(o);
        }
        statusField.value = "Complete";
      } else {
        statusField.disabled = false;
        if (!statusField.querySelector('option[value="Complete"]')) {
          const o = document.createElement("option");
          o.value = "Complete";
          o.textContent = "Complete";
          statusField.appendChild(o);
        }
      }
    }

    await refreshSelectIdProduksiPemesananForm(p);
    if (currentEditPreservesComplete) {
      const wP = document.getElementById("wrapSelectIdProduksiPemesanan");
      if (wP) wP.style.display = "none";
    }
    const htEdit = document.getElementById("hintStatusPemesananForm");
    if (htEdit)
      htEdit.style.display = currentEditPreservesComplete ? "none" : "";

    // Disable ID Pembelian saat edit (tidak bisa diubah)
    const idPembelianField = document.getElementById("idPembelian");
    if (idPembelianField) {
      idPembelianField.disabled = true;
    }

    toggleNegaraField();

    const modal = new bootstrap.Modal(
      document.getElementById("modalPemesanan"),
    );
    modal.show();
  } catch (error) {
    console.error("Error loading pemesanan for edit:", error);
    alert("Error memuat data pemesanan");
  }
}

// Save pemesanan (add/edit). cetakInvoice: hanya untuk mode tambah.
async function savePemesanan(cetakInvoice) {
  const form = document.getElementById("formPemesanan");
  const tanggalEl = document.getElementById("tanggalPemesanan");
  if (tanggalEl && !tanggalEl.value) {
    alert("Tanggal pemesanan wajib diisi.");
    tanggalEl.focus();
    return;
  }

  const pemesananId = document.getElementById("pemesananId").value;
  const idPembelian = document.getElementById("idPembelian").value;
  const namaPembeli = document.getElementById("namaPembeli").value;
  const tipePemesanan = document.getElementById("tipePemesanan").value;
  const negara = document.getElementById("negara").value;
  const idMasterPembeli = (
    document.getElementById("idMasterPembeli")?.value || ""
  ).trim();
  const kontakPembeli = (
    document.getElementById("kontakPembeli")?.value || ""
  ).trim();
  const alamatPembeli = (
    document.getElementById("alamatPembeli")?.value || ""
  ).trim();

  const kloterRaw = collectKloterFromForm();
  for (let i = 0; i < kloterRaw.length; i++) {
    const k = kloterRaw[i];
    if (!k.tipeProduk || !k.jenisKopi || !k.prosesPengolahan) {
      alert(
        `Kloter ${i + 1}: pilih tipe produk, jenis kopi, dan proses pengolahan.`,
      );
      return;
    }
    if (k.beratKg <= 0 || !Number.isFinite(k.beratKg)) {
      alert(`Kloter ${i + 1}: berat (kg) harus lebih dari 0.`);
      return;
    }
    if (k.hargaPerKg <= 0 || !Number.isFinite(k.hargaPerKg)) {
      alert(`Kloter ${i + 1}: harga per kg harus lebih dari 0.`);
      return;
    }
  }

  const kloterPayload = kloterRaw.map((k) => ({
    tipeProduk: k.tipeProduk,
    jenisKopi: k.jenisKopi,
    prosesPengolahan: k.prosesPengolahan,
    beratKg: k.beratKg,
    hargaPerKg: k.hargaPerKg,
  }));

  let biayaPajak = parseFloat(
    document.getElementById("biayaPajak")?.value || 0,
  );
  if (!Number.isFinite(biayaPajak) || biayaPajak < 0) biayaPajak = 0;
  let biayaPengiriman = parseFloat(
    document.getElementById("biayaPengiriman")?.value || 0,
  );
  if (!Number.isFinite(biayaPengiriman) || biayaPengiriman < 0) {
    biayaPengiriman = 0;
  }

  const subtotalBarang = kloterPayload.reduce(
    (s, k) => s + k.beratKg * k.hargaPerKg,
    0,
  );
  const totalHarga = subtotalBarang + biayaPajak + biayaPengiriman;

  const statusPemesanan = document.getElementById("statusPemesanan").value;
  const statusPembayaran = document.getElementById("statusPembayaran")?.value || "Belum Lunas";
  const catatanPemesanan = (
    document.getElementById("catatanPemesanan")?.value || ""
  ).trim();
  const tanggalPemesanan = document.getElementById("tanggalPemesanan").value;

  console.log("💰 Total (kloter):", {
    nKloter: kloterPayload.length,
    subtotalBarang,
    totalHarga,
  });

  if (tipePemesanan === "International" && !negara.trim()) {
    alert("Negara wajib diisi untuk pemesanan International!");
    document.getElementById("negara").focus();
    return;
  }

  if (!namaPembeli.trim()) {
    alert("Nama pembeli wajib diisi.");
    return;
  }

  try {
    const pemesananData = {
      idPembelian,
      namaPembeli,
      tipePemesanan,
      negara: tipePemesanan === "International" ? negara : "",
      kloter: kloterPayload,
      biayaPajak,
      biayaPengiriman,
      totalHarga,
      statusPemesanan,
      statusPembayaran,
      catatanPemesanan,
      tanggalPemesanan,
    };
    if (idMasterPembeli) pemesananData.idMasterPembeli = idMasterPembeli;
    if (kontakPembeli) pemesananData.kontakPembeli = kontakPembeli;
    if (alamatPembeli) pemesananData.alamatPembeli = alamatPembeli;

    if (pemesananId) {
      if (currentEditPreservesComplete) {
        pemesananData.statusPemesanan = "Complete";
        console.log(`🔄 Updating pemesanan ID: ${pemesananId}`);
        await window.API.Pemesanan.update(pemesananId, pemesananData);
        if (window.showNotification) {
          window.showNotification("update", "Pemesanan", "success");
        } else {
          alert("Data pemesanan berhasil diupdate!");
        }
      } else if (statusPemesanan === "Complete") {
        const idProdForm = (
          document.getElementById("selectIdProduksiPemesanan")?.value || ""
        ).trim();
        const beforeProses = { ...pemesananData, statusPemesanan: "Ordering" };
        console.log(`🔄 Simpan sebagai Ordering lalu proses stok → Complete: ${pemesananId}`);
        await window.API.Pemesanan.update(pemesananId, beforeProses);

        let pFromApi = await window.API.Pemesanan.getById(pemesananId);
        pFromApi = unwrapPemesananResponse(pFromApi);
        if (!pFromApi || !pFromApi.idPembelian) {
          throw new Error("Gagal memuat data pemesanan setelah simpan");
        }
        await loadStokData();
        const stokErr = await validateOrderingStok(pFromApi, idProdForm);
        if (stokErr) {
          alert(
            `${stokErr}\n\nPerubahan data telah disimpan sebagai **Ordering**. Lengkapi stok lalu selesaikan lagi (Edit → Complete atau Proses Ordering).`,
          );
          if (window.showNotification) {
            window.showNotification(
              "update",
              "Pemesanan",
              "warning",
              "Disimpan sebagai Ordering — stok belum mencukupi untuk Complete.",
            );
          }
          await loadPemesanan();
          const modal = bootstrap.Modal.getInstance(
            document.getElementById("modalPemesanan"),
          );
          modal?.hide();
          return;
        }

        const tanggalOrdering =
          tanggalPemesanan ||
          new Date().toISOString().split("T")[0];
        const orderingPayload = buildOrderingProsesPayload(
          pFromApi,
          tanggalOrdering,
          idProdForm,
        );
        await window.API.Ordering.proses(orderingPayload);

        await window.API.Pemesanan.update(pemesananId, {
          ...pemesananData,
          statusPemesanan: "Complete",
        });

        if (window.showNotification) {
          window.showNotification(
            "update",
            "Pemesanan",
            "success",
            "Pemesanan Complete — stok telah dikurangi (sama seperti Proses Ordering).",
          );
        } else {
          alert("Pemesanan diselesaikan (Complete) dan stok telah dikurangi.");
        }

        await loadPemesanan();
        await loadStokProduksi();
        await loadStokData();
        await loadOrderingData();
        window.dispatchEvent(new CustomEvent("hasilProduksiUpdated"));
        window.dispatchEvent(
          new CustomEvent("dataUpdated", {
            detail: { type: "hasilProduksi" },
          }),
        );

        const modal = bootstrap.Modal.getInstance(
          document.getElementById("modalPemesanan"),
        );
        modal?.hide();
        return;
      } else {
        pemesananData.statusPemesanan = "Ordering";
        console.log(`🔄 Updating pemesanan ID: ${pemesananId}`);
        await window.API.Pemesanan.update(pemesananId, pemesananData);
        if (window.showNotification) {
          window.showNotification("update", "Pemesanan", "success");
        } else {
          alert("Data pemesanan berhasil diupdate!");
        }
      }
    } else {
      if (statusPemesanan === "Complete") {
        alert(
          "Pemesanan baru tidak bisa langsung **Complete**. Simpan sebagai **Ordering** dulu, lalu selesaikan lewat **Edit → pilih Complete** atau tombol **Proses Ordering**.",
        );
        return;
      }
      // Add mode - Create via API
      console.log("🔄 Creating new pemesanan");
      const created = await window.API.Pemesanan.create(pemesananData);
      const newId =
        created?.idPembelian || idPembelian;

      if (window.showNotification) {
        window.showNotification("create", "Pemesanan", "success");
      } else {
        alert("Data pemesanan berhasil ditambahkan!");
      }

      const modal = bootstrap.Modal.getInstance(
        document.getElementById("modalPemesanan"),
      );
      modal?.hide();

      await loadPemesanan();

      if (cetakInvoice && newId) {
        await generateInvoicePDF(newId);
      }
      return;
    }

    // Reload data (edit)
    await loadPemesanan();

    // Close modal
    const modal = bootstrap.Modal.getInstance(
      document.getElementById("modalPemesanan"),
    );
    modal.hide();
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
  const form = document.getElementById("formOrdering");
  if (form) form.reset();
  const pembelianSelect = document.getElementById("idPembelianOrdering");
  if (pembelianSelect) pembelianSelect.value = "";
  const wrapIdProd = document.getElementById("wrapSelectIdProduksiOrdering");
  const selIdProd = document.getElementById("selectIdProduksiOrdering");
  if (wrapIdProd) wrapIdProd.style.display = "none";
  if (selIdProd) {
    selIdProd.innerHTML =
      '<option value="">Otomatis (FIFO — sistem memilih batch)</option>';
  }
  const pemesananDisplay = document.getElementById("pemesananDataDisplay");
  const stokDisplay = document.getElementById("stokInfoDisplay");
  if (pemesananDisplay) pemesananDisplay.style.display = "none";
  if (stokDisplay) stokDisplay.style.display = "none";

  const today = new Date().toISOString().split("T")[0];
  const tanggalInput = document.getElementById("tanggalOrdering");
  if (tanggalInput) tanggalInput.value = today;

  try {
    await loadPemesananOptionsForOrdering();
    await loadStokData();
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
      option.textContent = `${p.idPembelian} - ${p.namaPembeli} (${totalBeratKloterFromDoc(p)} kg)`;
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
    const dk = document.getElementById("displayKontakPembeliOrdering");
    const da = document.getElementById("displayAlamatPembeliOrdering");
    if (dk) dk.textContent = p.kontakPembeli || "-";
    if (da) da.textContent = p.alamatPembeli || "-";
    const wIm = document.getElementById("wrapIdMasterPembeli");
    const dIm = document.getElementById("displayIdMasterPembeliOrdering");
    if (p.idMasterPembeli) {
      if (wIm) wIm.style.display = "block";
      if (dIm) dIm.textContent = p.idMasterPembeli;
    } else {
      if (wIm) wIm.style.display = "none";
      if (dIm) dIm.textContent = "-";
    }
    document.getElementById("displayTipePemesanan").textContent =
      p.tipePemesanan || "-";
    const linesOrd = getPemesananKloterLinesFromDoc(p);
    const tbOrd = document.getElementById("tbodyOrderingKloterPreview");
    if (tbOrd) {
      tbOrd.innerHTML = linesOrd
        .map((L) => {
          const w = parseFloat(L.beratKg) || 0;
          const hp = parseFloat(L.hargaPerKg) || 0;
          return `<tr>
            <td>${escapeHtmlAttr(L.tipeProduk || "—")}</td>
            <td>${escapeHtmlAttr(L.jenisKopi || "—")}</td>
            <td>${escapeHtmlAttr(L.prosesPengolahan || "—")}</td>
            <td class="text-end">${w.toLocaleString("id-ID")}</td>
            <td class="text-end">${hp.toLocaleString("id-ID")}</td>
          </tr>`;
        })
        .join("");
    }
    document.getElementById("displayJumlahPesanan").textContent =
      totalBeratKloterFromDoc(p).toLocaleString("id-ID");
    document.getElementById("displayTotalHarga").textContent = `Rp ${(
      p.totalHarga || 0
    ).toLocaleString("id-ID")}`;
    const dsp = document.getElementById("displayStatusPembayaranOrdering");
    if (dsp) dsp.textContent = p.statusPembayaran || "Belum Lunas";
    const dct = document.getElementById("displayCatatanPemesananOrdering");
    if (dct)
      dct.textContent =
        (p.catatanPemesanan && String(p.catatanPemesanan).trim()) || "—";

    document.getElementById("pemesananDataDisplay").style.display = "block";

    window.currentPemesananData = p;

    try {
      await loadStokData();
      showAggregatedStokForPemesanan(p);
    } catch (e) {
      console.warn("⚠️ Gagal memuat stok agregat untuk pemesanan:", e);
    }

    await refreshSelectIdProduksiOrdering(p);
  } catch (error) {
    console.error("❌ Error loading pemesanan data:", error);
    alert("Error memuat data pemesanan");
  }
}

function idBahanListFromProduksiDoc(doc) {
  if (!doc) return [];
  const lst = doc.idBahanList;
  if (Array.isArray(lst) && lst.length) {
    return lst.map((x) => String(x || "").trim()).filter(Boolean);
  }
  if (doc.idBahan) return [String(doc.idBahan).trim()];
  return [];
}

function prosesTampilanAgregasiClient(produksi, bahan) {
  const lines = bahan?.prosesBahan;
  if (Array.isArray(lines) && lines.length === 1) {
    const only = (lines[0].prosesPengolahan || "").trim();
    if (only) return only;
  }
  return (produksi.prosesPengolahan || "").trim();
}

function produksiMasukStokPengemasanClient(p) {
  const st = (p.statusTahapan || "").toLowerCase();
  if (!st || !st.includes("pengemasan")) return false;
  if ((parseFloat(p.beratAkhir) || 0) <= 0) return false;
  if (!(p.tanggalPengemasan || "").toString().trim()) return false;
  return true;
}

function stokGbPixelValidClient(p) {
  const ba = parseFloat(p.beratAkhir) || 0;
  if (ba <= 0) return false;
  const gb = parseFloat(p.beratGreenBeans) || 0;
  const px = parseFloat(p.beratPixel) || 0;
  return gb + px <= ba + 0.02;
}

function beratGreenEffectiveClient(p) {
  const ba = parseFloat(p.beratAkhir) || 0;
  const px = parseFloat(p.beratPixel) || 0;
  return Math.max(0, ba - px);
}

function isHasilFromOrderingFlag(h) {
  const v = h.isFromOrdering;
  return v === true || v === 1 || v === "true" || v === "True";
}

function unwrapPemesananResponse(res) {
  if (res == null) return null;
  if (
    typeof res === "object" &&
    res.data != null &&
    typeof res.data === "object" &&
    !Array.isArray(res.data)
  ) {
    return res.data;
  }
  return res;
}

/**
 * Validasi stok sebelum POST /api/ordering/proses.
 * @returns {Promise<string|null>} pesan error, atau null jika OK
 */
async function validateOrderingStok(pemesananDoc, idProduksiPilihan) {
  const linesCheck = getPemesananKloterLinesFromDoc(pemesananDoc);
  const multiStok =
    linesCheck.length > 1 ||
    new Set(
      linesCheck.map(
        (L) =>
          `${(L.tipeProduk || "").trim()}|${(L.jenisKopi || "").trim()}|${(L.prosesPengolahan || "").trim()}`,
      ),
    ).size > 1;

  const idP = (idProduksiPilihan || "").trim();

  if (idP) {
    if (multiStok || linesCheck.length !== 1) {
      return "Pemilihan ID produksi hanya untuk pemesanan satu kloter. Kosongkan pilihan untuk alokasi otomatis (FIFO).";
    }
    const L0 = linesCheck[0];
    const tipeL0 = (L0.tipeProduk || "").trim();
    if (!window.API?.Produksi?.getSisa) {
      return "API Produksi tidak tersedia.";
    }
    let sisaRes;
    try {
      sisaRes = await window.API.Produksi.getSisa(idP);
    } catch (e) {
      return e.data?.error || e.message || "Gagal mengecek sisa stok batch";
    }
    const need = parseFloat(L0.beratKg) || 0;
    const avail =
      tipeL0 === "Pixel"
        ? parseFloat(sisaRes?.sisaTersediaPixel) || 0
        : parseFloat(sisaRes?.sisaTersedia) || 0;
    if (avail < need - 1e-9) {
      return `Stok pada batch ${idP} tidak mencukupi.\nTersedia: ${avail.toLocaleString(
        "id-ID",
      )} kg\nDibutuhkan: ${need.toLocaleString("id-ID")} kg`;
    }
    return null;
  }

  if (!multiStok) {
    let stokRow = findStokRowForPemesanan(pemesananDoc);
    if (!stokRow) {
      try {
        await loadStokData();
        stokRow = findStokRowForPemesanan(pemesananDoc);
      } catch (_) {
        /* noop */
      }
    }
    const stokTersedia = stokRow
      ? parseFloat(stokRow.stokTersedia ?? stokRow.totalBerat ?? 0) || 0
      : 0;
    const jumlahPesanan = totalBeratKloterFromDoc(pemesananDoc);

    if (!stokRow) {
      return "Tidak ada stok hasil produksi yang cocok dengan pemesanan ini.\nPastikan kombinasi tipe produk, jenis kopi, dan proses pengolahan sama dengan baris di Kelola Stok.";
    }

    if (stokTersedia < jumlahPesanan) {
      return `Stok tidak mencukupi!\n\nStok tersedia (agregat): ${stokTersedia.toLocaleString(
        "id-ID",
      )} kg\nJumlah pesanan: ${jumlahPesanan.toLocaleString(
        "id-ID",
      )} kg\nKekurangan: ${(jumlahPesanan - stokTersedia).toLocaleString(
        "id-ID",
      )} kg`;
    }
    return null;
  }

  try {
    await loadStokData();
  } catch (_) {
    /* noop */
  }
  for (let i = 0; i < linesCheck.length; i++) {
    const L = linesCheck[i];
    const pseudo = {
      tipeProduk: L.tipeProduk,
      jenisKopi: L.jenisKopi,
      prosesPengolahan: L.prosesPengolahan,
    };
    const stokRow = findStokRowForPemesanan(pseudo);
    const need = parseFloat(L.beratKg) || 0;
    const ada = stokRow
      ? parseFloat(stokRow.stokTersedia ?? stokRow.totalBerat ?? 0) || 0
      : 0;
    if (!stokRow || ada < need - 1e-9) {
      return `Kloter ${i + 1} (${L.tipeProduk || "-"} · ${L.jenisKopi || "-"} · ${L.prosesPengolahan || "-"}): stok tidak mencukupi atau kombinasi tidak ada di Kelola Stok.\nTersedia: ${ada.toLocaleString("id-ID")} kg, dibutuhkan: ${need.toLocaleString("id-ID")} kg`;
    }
  }
  return null;
}

function buildOrderingProsesPayload(
  pemesananDoc,
  tanggalOrdering,
  idProduksiPilihan,
) {
  const linesForTipe = getPemesananKloterLinesFromDoc(pemesananDoc);
  const tipeReq =
    (linesForTipe[0] && linesForTipe[0].tipeProduk) ||
    pemesananDoc.tipeProduk ||
    "";
  const out = {
    idPembelian: pemesananDoc.idPembelian,
    tanggalOrdering,
    tipeProduk: tipeReq,
  };
  const idp = (idProduksiPilihan || "").trim();
  if (idp) out.idProduksi = idp;
  return out;
}

/**
 * Isi dropdown ID Produksi (satu kloter) — dipakai modal Ordering & form Edit Pemesanan.
 */
async function fillSelectIdProduksiUntukPemesanan(
  pemesananDoc,
  wrapId,
  selectId,
  hintId,
) {
  const wrap = document.getElementById(wrapId);
  const sel = document.getElementById(selectId);
  const hint = hintId ? document.getElementById(hintId) : null;
  if (!wrap || !sel) return;

  const optFifo =
    wrapId === "wrapSelectIdProduksiPemesanan"
      ? '<option value="">Otomatis (FIFO)</option>'
      : '<option value="">Otomatis (FIFO — sistem memilih batch)</option>';
  sel.innerHTML = optFifo;

  const lines = getPemesananKloterLinesFromDoc(pemesananDoc);
  const multi =
    lines.length > 1 ||
    new Set(
      lines.map(
        (L) =>
          `${(L.tipeProduk || "").trim()}|${(L.jenisKopi || "").trim()}|${(L.prosesPengolahan || "").trim()}`,
      ),
    ).size > 1;

  if (multi || lines.length === 0) {
    wrap.style.display = "none";
    if (hint) {
      hint.textContent =
        lines.length > 1
          ? "Beberapa kloter: pemilihan satu ID produksi tidak tersedia — gunakan alokasi otomatis (FIFO)."
          : "";
    }
    return;
  }

  const L0 = lines[0];
  const tipe = (L0.tipeProduk || "").trim();
  if (tipe !== "Green Beans" && tipe !== "Pixel") {
    wrap.style.display = "none";
    return;
  }

  if (
    !window.API?.Produksi?.getPengemasan ||
    !window.API?.Bahan?.getAll ||
    !window.API?.HasilProduksi?.getAll
  ) {
    wrap.style.display = "none";
    return;
  }

  wrap.style.display = "block";
  if (hint) {
    hint.textContent =
      "Pilih batch pengemasan tertentu, atau biarkan otomatis (FIFO).";
  }

  try {
    const [produksiList, bahanList, hasilList] = await Promise.all([
      window.API.Produksi.getPengemasan(),
      window.API.Bahan.getAll(),
      window.API.HasilProduksi.getAll(),
    ]);
    const pl = Array.isArray(produksiList) ? produksiList : [];
    const bahanById = {};
    (Array.isArray(bahanList) ? bahanList : []).forEach((b) => {
      if (b.idBahan) bahanById[String(b.idBahan).trim()] = b;
    });
    const hasilArr = Array.isArray(hasilList) ? hasilList : [];

    const jkPem = (L0.jenisKopi || "").trim();
    const prPem = (L0.prosesPengolahan || "").trim();
    const need = parseFloat(L0.beratKg) || 0;

    const candidates = [];
    for (const p of pl) {
      if (!produksiMasukStokPengemasanClient(p) || !stokGbPixelValidClient(p))
        continue;
      const bids = idBahanListFromProduksiDoc(p);
      const bahan = bids.length ? bahanById[bids[0]] : null;
      if (!bahan) continue;
      if ((bahan.jenisKopi || "").trim() !== jkPem) continue;
      const prRaw = (p.prosesPengolahan || "").trim();
      const prDisp = prosesTampilanAgregasiClient(p, bahan);
      if (prPem !== prRaw && prPem !== prDisp) continue;

      const idp = String(p.idProduksi || "").trim();
      if (!idp) continue;

      const pool =
        tipe === "Green Beans"
          ? beratGreenEffectiveClient(p)
          : parseFloat(p.beratPixel) || 0;
      let used = 0;
      for (const h of hasilArr) {
        if (String(h.idProduksi || "").trim() !== idp) continue;
        if ((h.tipeProduk || "").trim() !== tipe) continue;
        if (!isHasilFromOrderingFlag(h)) continue;
        used += parseFloat(h.beratSaatIni) || 0;
      }
      const avail = Math.max(0, pool - used);
      if (avail <= 1e-9) continue;

      candidates.push({
        p,
        avail,
        tgl: (p.tanggalPengemasan || "").toString().slice(0, 10) || "—",
      });
    }

    candidates.sort((a, b) => {
      const c = (a.tgl || "").localeCompare(b.tgl || "");
      if (c !== 0) return c;
      return String(a.p.idProduksi || "").localeCompare(
        String(b.p.idProduksi || ""),
        "id",
        { numeric: true },
      );
    });

    for (const { p, avail, tgl } of candidates) {
      const idp = String(p.idProduksi || "").trim();
      const opt = document.createElement("option");
      opt.value = idp;
      const ok = avail >= need - 1e-9;
      opt.textContent = `${idp} — sisa ${avail.toLocaleString("id-ID", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} kg — ${tgl}${ok ? "" : " (stok batch < berat pesanan)"}`;
      if (!ok) opt.disabled = true;
      sel.appendChild(opt);
    }
  } catch (e) {
    console.warn("[fillSelectIdProduksiUntukPemesanan]", e);
    wrap.style.display = "none";
  }
}

async function refreshSelectIdProduksiOrdering(pemesananDoc) {
  await fillSelectIdProduksiUntukPemesanan(
    pemesananDoc,
    "wrapSelectIdProduksiOrdering",
    "selectIdProduksiOrdering",
    "hintSelectIdProduksiOrdering",
  );
}

async function refreshSelectIdProduksiPemesananForm(pemesananDoc) {
  await fillSelectIdProduksiUntukPemesanan(
    pemesananDoc,
    "wrapSelectIdProduksiPemesanan",
    "selectIdProduksiPemesanan",
    "hintSelectIdProduksiPemesanan",
  );
}

// Save ordering
async function saveOrdering() {
  const form = document.getElementById("formOrdering");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const idPembelian = document.getElementById("idPembelianOrdering").value;
  const tanggalOrdering = document.getElementById("tanggalOrdering").value;

  if (!idPembelian) {
    alert("ID Pembelian wajib dipilih!");
    return;
  }

  const pemesananData = window.currentPemesananData;
  if (!pemesananData) {
    alert("Pilih ID Pembelian terlebih dahulu agar data pemesanan termuat.");
    return;
  }

  const idProduksiPilihan = (
    document.getElementById("selectIdProduksiOrdering")?.value || ""
  ).trim();

  const stokErr = await validateOrderingStok(pemesananData, idProduksiPilihan);
  if (stokErr) {
    alert(stokErr);
    return;
  }

  try {
    const orderingData = buildOrderingProsesPayload(
      pemesananData,
      tanggalOrdering,
      idProduksiPilihan,
    );

    console.log("🔄 Memproses ordering:", orderingData);
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

/** Logo + kop surat Argopuro Walida untuk PDF invoice */
async function fetchArgopuroLogoForPdf() {
  try {
    const url = `${window.location.origin}/brand-assets/logo.png`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn("Logo tidak dimuat:", e);
    return null;
  }
}

function pdfDrawArgopuroInvoiceHeader(doc, logoDataUrl) {
  const nama = "Argopuro Walida";
  const kontak = "+62 857-0766-1006";
  const alamat =
    "Ds. Tlogosari Rt 06/Rw 01, Kecamatan Sumbermalang, Kabupaten Situbondo";
  let y = 12;
  const tx = logoDataUrl ? 54 : 20;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", 18, y, 28, 28);
    } catch (e) {
      console.warn("addImage logo:", e);
    }
  }
  doc.setTextColor(25, 90, 40);
  doc.setFontSize(15);
  doc.setFont(undefined, "bold");
  doc.text(nama, tx, y + 8);
  doc.setTextColor(55, 55, 55);
  doc.setFontSize(9);
  doc.setFont(undefined, "normal");
  doc.text(`Kontak: ${kontak}`, tx, y + 15);
  const addrLines = doc.splitTextToSize(alamat, 132);
  let ay = y + 21;
  addrLines.forEach((ln) => {
    doc.text(ln, tx, ay);
    ay += 4.5;
  });
  doc.setTextColor(0, 0, 0);
  const barY = Math.max(y + 32, ay + 3);
  doc.setDrawColor(46, 125, 50);
  doc.setLineWidth(0.35);
  doc.line(18, barY, 192, barY);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.1);
  doc.setFontSize(16);
  doc.setFont(undefined, "bold");
  doc.text("INVOICE PEMESANAN", 105, barY + 9, { align: "center" });
  doc.setFontSize(8);
  doc.setFont(undefined, "normal");
  doc.text(
    "Dokumen pembelian resmi — mohon periksa rincian berikut.",
    105,
    barY + 14,
    { align: "center" },
  );
  return barY + 19;
}

/** Angka dengan pemisah ribuan Indonesia, tanpa prefiks Rp/kg */
function pdfFmtIdNumber(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("id-ID");
}

/** Teks untuk PDF: uraikan entitas HTML bertingkat (mis. &amp;amp; → &). */
function pdfDecodeHtmlEntities(raw) {
  let s = String(raw ?? "");
  for (let i = 0; i < 12; i++) {
    const t = s
      .replace(/&nbsp;/gi, " ")
      .replace(/&#(\d+);/g, (m, n) => {
        const c = parseInt(n, 10);
        return Number.isFinite(c) && c >= 0 && c <= 0x10ffff
          ? String.fromCodePoint(c)
          : m;
      })
      .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => {
        const c = parseInt(h, 16);
        return Number.isFinite(c) && c >= 0 && c <= 0x10ffff
          ? String.fromCodePoint(c)
          : m;
      })
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
    if (t === s) break;
    s = t;
  }
  return s;
}

/**
 * Tabel catatan pemesanan (bingkai + header + isi).
 * @returns {number} y di bawah tabel + jarak kecil
 */
function pdfDrawCatatanPemesananTable(doc, LX, y, catatanRaw, opts) {
  const W =
    opts && Number.isFinite(opts.width) ? opts.width : 190 - LX;
  const padX = 3.5;
  const innerW = W - padX * 2;
  const marginBottom =
    opts && Number.isFinite(opts.marginBottom) ? opts.marginBottom : 6;
  const decoded = pdfDecodeHtmlEntities(String(catatanRaw).trim());
  const blocks = decoded
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const lineH = 3.85;
  const headerH = 7;
  const bodyPadTop = 4;
  const bodyPadBottom = 4;
  const displayLines = [];
  doc.setFontSize(8.5);
  doc.setFont(undefined, "normal");
  blocks.forEach((blk, idx) => {
    doc.splitTextToSize(blk, innerW).forEach((ln) => displayLines.push(ln));
    if (idx < blocks.length - 1) displayLines.push("");
  });
  const bodyH = bodyPadTop + displayLines.length * lineH + bodyPadBottom;
  const tableH = headerH + bodyH;

  doc.setDrawColor(46, 125, 50);
  doc.setLineWidth(0.22);
  doc.roundedRect(LX, y, W, tableH, 1.2, 1.2, "S");

  doc.setFillColor(236, 248, 238);
  doc.rect(LX + 0.22, y + 0.22, W - 0.44, headerH - 0.1, "F");
  doc.setDrawColor(46, 125, 50);
  doc.setLineWidth(0.15);
  doc.line(LX, y + headerH, LX + W, y + headerH);

  doc.setTextColor(25, 90, 40);
  doc.setFont(undefined, "bold");
  doc.setFontSize(9);
  doc.text("CATATAN", LX + padX, y + 5);
  doc.setTextColor(35, 35, 35);
  doc.setFont(undefined, "normal");
  doc.setFontSize(8.5);

  let ty = y + headerH + bodyPadTop;
  displayLines.forEach((ln) => {
    if (ln !== "") doc.text(ln, LX + padX, ty);
    ty += lineH;
  });

  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.1);
  doc.setFontSize(9);
  return y + tableH + marginBottom;
}

/** Warna badge status pembayaran: teks putih tebal di atas bg */
function pdfPaymentBadgeColors(status) {
  const s = (status || "Belum Lunas").trim();
  if (s === "Lunas") return { rgb: [25, 135, 84] };
  const low = s.toLowerCase();
  if (
    s === "Pembayaran Bertahap" ||
    low === "pembayaran bertahap"
  ) {
    /* Kuning tua agar teks putih tetap terbaca */
    return { rgb: [212, 160, 23] };
  }
  return { rgb: [220, 53, 69] };
}

/** Warna badge status pemesanan (invoice) */
function pdfOrderStatusBadgeColors(status) {
  const s = (status || "").trim();
  if (s === "Complete") return { rgb: [25, 135, 84] };
  if (s === "Ordering") return { rgb: [212, 160, 23] };
  return { rgb: [108, 117, 125] };
}

function pdfDrawColoredBadge(doc, x, yBaseline, label, colorFn) {
  const text = String(label || "—");
  doc.setFontSize(8);
  doc.setFont(undefined, "bold");
  const w = doc.getTextWidth(text);
  const padX = 2.2;
  const padY = 1.2;
  const h = 4.8;
  const x0 = x;
  const y0 = yBaseline - h + padY;
  const { rgb } = colorFn(text);
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  doc.roundedRect(x0, y0, w + padX * 2, h, 0.8, 0.8, "F");
  doc.setTextColor(255, 255, 255);
  doc.text(text, x0 + padX, yBaseline);
  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, "normal");
  doc.setFontSize(9);
}

function pdfDrawPaymentBadge(doc, x, yBaseline, label) {
  pdfDrawColoredBadge(doc, x, yBaseline, label, pdfPaymentBadgeColors);
}

function pdfDrawOrderStatusBadge(doc, x, yBaseline, label) {
  pdfDrawColoredBadge(doc, x, yBaseline, label, pdfOrderStatusBadgeColors);
}

function pdfDrawInvoiceBody(doc, p, y) {
  const LX = 20;
  const VX = 58;
  const bayarLabel = (p.statusPembayaran || "Belum Lunas").trim();
  const orderLabel = (p.statusPemesanan || "—").trim();
  doc.setFontSize(9.5);
  doc.setFillColor(240, 248, 242);
  doc.roundedRect(LX, y - 2, 170, 36, 1, 1, "F");
  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, "bold");
  doc.text("Ringkasan dokumen", LX + 3, y + 4.5);
  doc.setFont(undefined, "normal");
  doc.setFontSize(8.5);
  doc.text(`ID Pembelian: ${p.idPembelian || "-"}`, LX + 3, y + 10);
  doc.setTextColor(55, 55, 55);
  doc.text(
    `Tanggal pemesanan: ${formatDate(p.tanggalPemesanan || new Date().toISOString())}`,
    LX + 3,
    y + 15.5,
  );
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  doc.setFont(undefined, "normal");
  doc.setTextColor(60, 60, 60);
  doc.text("Status pemesanan", LX + 3, y + 21.5);
  const osw = doc.getTextWidth("Status pemesanan");
  doc.setTextColor(0, 0, 0);
  pdfDrawOrderStatusBadge(doc, LX + 3 + osw + 2, y + 21.5, orderLabel);
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  doc.text("Status pembayaran", LX + 3, y + 27.5);
  const spw = doc.getTextWidth("Status pembayaran");
  doc.setTextColor(0, 0, 0);
  pdfDrawPaymentBadge(doc, LX + 3 + spw + 2, y + 27.5, bayarLabel);
  y += 41;

  doc.setFontSize(10.5);
  doc.setFont(undefined, "bold");
  doc.text("PEMBELI", LX, y);
  y += 5;
  doc.setLineWidth(0.15);
  doc.line(LX, y, 190, y);
  y += 6;
  doc.setFontSize(9.5);
  doc.setFont(undefined, "bold");
  doc.text("Nama", LX, y);
  doc.setFont(undefined, "normal");
  const namaPembeliKop = pdfDecodeHtmlEntities(
    String(p.namaPembeli || "-").trim(),
  );
  const namaKopLines = doc.splitTextToSize(namaPembeliKop, 120);
  namaKopLines.forEach((ln) => {
    doc.text(ln, VX, y);
    y += 4.3;
  });
  y += 1;
  doc.setFont(undefined, "bold");
  doc.text("Kontak", LX, y);
  doc.setFont(undefined, "normal");
  doc.text(String(p.kontakPembeli || "-"), VX, y);
  y += 6;
  doc.setFont(undefined, "bold");
  doc.text("Alamat", LX, y);
  doc.setFont(undefined, "normal");
  const alLines = doc.splitTextToSize(String(p.alamatPembeli || "-"), 120);
  alLines.forEach((ln) => {
    doc.text(ln, VX, y);
    y += 4.3;
  });
  y += 1;
  if (p.idMasterPembeli) {
    doc.setFont(undefined, "bold");
    doc.text("ID master", LX, y);
    doc.setFont(undefined, "normal");
    doc.text(String(p.idMasterPembeli), VX, y);
    y += 6;
  }
  doc.setFont(undefined, "bold");
  doc.text("Tipe", LX, y);
  doc.setFont(undefined, "normal");
  doc.text(p.tipePemesanan || "-", VX, y);
  y += 6;
  if (p.tipePemesanan === "International" && p.negara) {
    doc.setFont(undefined, "bold");
    doc.text("Negara", LX, y);
    doc.setFont(undefined, "normal");
    doc.text(p.negara || "-", VX, y);
    y += 6;
  }
  y += 4;

  const C_QTY = 118;
  const C_HARGA = 150;
  const C_SUB = 188;

  doc.setFontSize(10.5);
  doc.setFont(undefined, "bold");
  doc.text("RINCIAN PRODUK & HARGA", LX, y);
  y += 5;
  doc.setLineWidth(0.2);
  doc.line(LX, y, 190, y);
  y += 6;
  doc.setFontSize(8.2);
  doc.setFont(undefined, "bold");
  doc.setTextColor(55, 55, 55);
  doc.text("Deskripsi", LX, y);
  doc.text("Qty (kg)", C_QTY, y, { align: "right" });
  doc.text("Harga/kg (Rp)", C_HARGA, y, { align: "right" });
  doc.text("Subtotal (Rp)", C_SUB, y, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y += 3.5;
  doc.setLineWidth(0.15);
  doc.line(LX, y, 190, y);
  y += 5;

  doc.setFont(undefined, "normal");
  doc.setFontSize(8.5);
  const invLines = getPemesananKloterLinesFromDoc(p);
  invLines.forEach((row) => {
    const desk = `${row.tipeProduk || "-"} · ${row.jenisKopi || "-"} · ${row.prosesPengolahan || "-"}`;
    const dLines = doc.splitTextToSize(desk, 78);
    const yStartBlock = y;
    dLines.forEach((ln) => {
      doc.text(ln, LX, y);
      y += 3.75;
    });
    const jumlahKg = parseFloat(row.beratKg) || 0;
    const hargaKg = parseFloat(row.hargaPerKg) || 0;
    const subtotalBaris = jumlahKg * hargaKg;
    doc.text(pdfFmtIdNumber(jumlahKg), C_QTY, yStartBlock, { align: "right" });
    doc.text(pdfFmtIdNumber(hargaKg), C_HARGA, yStartBlock, { align: "right" });
    doc.text(pdfFmtIdNumber(subtotalBaris), C_SUB, yStartBlock, {
      align: "right",
    });
    y = Math.max(y, yStartBlock + 6.5);
    y += 1.2;
  });
  doc.line(LX, y, 190, y);
  y += 5;

  const pajakInv = Math.max(0, parseFloat(p.biayaPajak) || 0);
  doc.setFont(undefined, "bold");
  doc.setFontSize(8.5);
  doc.text("Pajak (Rp)", LX, y);
  doc.setFont(undefined, "normal");
  doc.text(pdfFmtIdNumber(pajakInv), C_SUB, y, { align: "right" });
  y += 5.5;
  const kirimInv = Math.max(0, parseFloat(p.biayaPengiriman) || 0);
  doc.setFont(undefined, "bold");
  doc.text("Pengiriman (Rp)", LX, y);
  doc.setFont(undefined, "normal");
  doc.text(pdfFmtIdNumber(kirimInv), C_SUB, y, { align: "right" });
  y += 5.5;
  doc.line(LX, y, 190, y);
  y += 6;
  doc.setFontSize(10);
  doc.setFont(undefined, "bold");
  doc.text("Total pembayaran (Rp)", LX, y);
  doc.text(
    pdfFmtIdNumber(p.totalHarga || 0),
    C_SUB,
    y,
    { align: "right" },
  );
  doc.setFont(undefined, "normal");
  doc.setFontSize(9);
  y += 7;

  const catatan = (p.catatanPemesanan && String(p.catatanPemesanan).trim()) || "";
  const RX = 190;
  const boxPad = 3;
  const gapPembeliKeTtd = 8;
  const ttdTurunMm = 3;
  const gapTtdKeRuangTtd = 12;
  const gapGarisKeNama = 4.5;
  const lineHNama = 4.6;

  const namaPembeliTtd = pdfDecodeHtmlEntities(
    String(p.namaPembeli || "-").trim(),
  );

  const computeTtdLayout = (yTop, sigL, sigR, namaLines) => {
    const xC = (sigL + sigR) / 2;
    const yLbl = yTop + 5.5 + gapPembeliKeTtd + ttdTurunMm;
    const yGr = yLbl + 3.8 + gapTtdKeRuangTtd;
    const yNm = yGr + gapGarisKeNama;
    const bottomNama = yNm + namaLines.length * lineHNama;
    const bTop = yTop - boxPad;
    const bH = Math.max(bottomNama + boxPad - bTop, 44);
    return {
      xCenterSig: xC,
      yLblTtdFinal: yLbl,
      yGarisFinal: yGr,
      yNamaStartFinal: yNm,
      boxTop: bTop,
      boxH: bH,
      outerL: sigL - boxPad,
      outerW: sigR - sigL + boxPad * 2,
    };
  };

  const drawTtdBlock = (yTop, geo, namaLines) => {
    const {
      xCenterSig,
      yLblTtdFinal,
      yGarisFinal,
      yNamaStartFinal,
      boxTop,
      boxH,
      outerL,
      outerW,
    } = geo;
    const sigL = geo.sigL;
    const sigR = geo.sigR;
    doc.setDrawColor(198, 208, 198);
    doc.setLineWidth(0.16);
    doc.roundedRect(outerL, boxTop, outerW, boxH, 1, 1, "S");
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.1);
    doc.setFontSize(8.5);
    doc.setFont(undefined, "normal");
    doc.setTextColor(75, 75, 75);
    doc.text("Pembeli,", xCenterSig, yTop + 5.5, { align: "center" });
    doc.setFontSize(8);
    doc.setTextColor(70, 70, 70);
    doc.text("TTD", xCenterSig, yLblTtdFinal, { align: "center" });
    doc.setDrawColor(88, 88, 88);
    doc.setLineWidth(0.2);
    doc.line(sigL, yGarisFinal, sigR, yGarisFinal);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.1);
    doc.setFontSize(9);
    doc.setFont(undefined, "bold");
    doc.setTextColor(0, 0, 0);
    let yN = yNamaStartFinal;
    namaLines.forEach((ln) => {
      doc.text(ln, xCenterSig, yN, { align: "center" });
      yN += lineHNama;
    });
    doc.setFont(undefined, "normal");
    return boxTop + boxH;
  };

  const yFooter = y + 3;
  let yBottom = yFooter;

  if (catatan) {
    const WCAT = 100;
    const outerLTtd = LX + WCAT + 4;
    const sigL = outerLTtd + boxPad;
    const sigR = RX - boxPad;
    doc.setFontSize(9);
    doc.setFont(undefined, "bold");
    const namaLinesSig = doc.splitTextToSize(namaPembeliTtd, sigR - sigL);
    doc.setFont(undefined, "normal");
    const geo = computeTtdLayout(yFooter, sigL, sigR, namaLinesSig);
    const yCatEnd = pdfDrawCatatanPemesananTable(doc, LX, yFooter, catatan, {
      width: WCAT,
      marginBottom: 4,
    });
    drawTtdBlock(yFooter, { ...geo, sigL, sigR }, namaLinesSig);
    yBottom = Math.max(yCatEnd, geo.boxTop + geo.boxH + 6);
  } else {
    const sigR = RX - boxPad;
    const sigL = sigR - 68;
    doc.setFontSize(9);
    doc.setFont(undefined, "bold");
    const namaLinesSig = doc.splitTextToSize(namaPembeliTtd, sigR - sigL);
    doc.setFont(undefined, "normal");
    const geo = computeTtdLayout(yFooter + 2, sigL, sigR, namaLinesSig);
    drawTtdBlock(yFooter + 2, { ...geo, sigL, sigR }, namaLinesSig);
    yBottom = geo.boxTop + geo.boxH + 8;
  }

  return yBottom;
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
    const logoDataUrl = await fetchArgopuroLogoForPdf();
    const doc = new jsPDFLib();
    let yCur = pdfDrawArgopuroInvoiceHeader(doc, logoDataUrl);
    yCur = pdfDrawInvoiceBody(doc, p, yCur);

    let pdfBase64 = doc.output("datauristring");
    console.log("📤 Uploading Invoice PDF to backend...");

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

    const pdfUrl = uploadResult.fullUrl || uploadResult.url;
    console.log("✅ Invoice PDF uploaded:", pdfUrl);

    if (pdfUrl && pdfUrl.startsWith("http")) {
      window.open(pdfUrl, "_blank");
    }

    alert(
      `Invoice PDF berhasil dibuat.${pdfUrl ? `\n\n${pdfUrl}` : ""}`,
    );
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
  if (!apiReady || !window.API || !window.API.Pemesanan || !window.API.Stok || !window.API.Pembeli) {
    console.error("❌ API.Pemesanan, Stok, atau Pembeli tidak tersedia");
    alert("API tidak tersedia. Pastikan backend aktif.");
    return;
  }

  // Load all data
  console.log("🚀 [INIT] Starting data load...");
  await loadPemesanan(); // Load pemesanan data
  console.log("🚀 [INIT] Pemesanan data loaded, loading stok produksi...");
  await loadStokProduksi(); // memuat /api/stok (sama dengan Kelola Stok)
  console.log("🚀 [INIT] Stok produksi loaded, loading ordering...");
  await loadOrderingData();
  console.log("✅ [INIT] All data loaded successfully");
  await refreshSelectMasterPembeli();

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

  const dataPembeliTab = document.getElementById("data-pembeli-tab");
  if (dataPembeliTab) {
    dataPembeliTab.addEventListener("shown.bs.tab", function () {
      loadPembeliMasterTable();
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
  window.applyFilterPembeliMaster = applyFilterPembeliMaster;
  window.openModalPembeli = openModalPembeli;
  window.savePembeliMaster = savePembeliMaster;
  window.onSelectMasterPembeliChange = onSelectMasterPembeliChange;

  console.log("✅ Kelola Pemesanan page initialized");
});
