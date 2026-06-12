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
let masterProdukNames = [];

/**
 * Tipe produk yang hanya untuk invoice (tanpa pengurangan stok).
 * Saat ini: Roasted Beans dan Argopuro Walida Collective.
 * Dicocokkan case-insensitive setelah trim + normalisasi whitespace
 * (mis. non-breaking space, tab, spasi ganda) agar tahan typo ejaan ringan.
 */
const INVOICE_ONLY_TIPE_PRODUK = new Set([
  "roasted beans",
  "argopuro walida collective",
]);

function normalizeTipeProdukForMatch(tipe) {
  return String(tipe || "")
    .replace(/[\s\u00A0]+/g, " ")
    .trim()
    .toLowerCase();
}

function isTipeProdukInvoiceOnly(tipe) {
  const norm = normalizeTipeProdukForMatch(tipe);
  if (!norm) return false;
  if (INVOICE_ONLY_TIPE_PRODUK.has(norm)) return true;
  // Toleransi variasi ejaan untuk "Argopuro Walida Collective" (mis. "Colective",
  // "Collection", trailing word, dst). Tetap aman: hanya nama yang mengandung
  // tiga kata kunci ini yang dianggap invoice-only.
  if (
    norm.includes("argopuro") &&
    norm.includes("walida") &&
    /\bcol[a-z]*/.test(norm)
  ) {
    return true;
  }
  return false;
}

function pemesananIsInvoiceOnly(doc) {
  const lines = getPemesananKloterLinesFromDoc(doc);
  return (
    lines.length > 0 &&
    lines.every((L) => isTipeProdukInvoiceOnly(L.tipeProduk))
  );
}

function kloterRowsAllInvoiceOnly(kloterRows) {
  const valid = (kloterRows || []).filter(
    (r) =>
      (r.tipeProduk || "").trim() &&
      parseFloat(r.beratKg) > 0 &&
      parseFloat(r.hargaPerKg) > 0,
  );
  return (
    valid.length > 0 &&
    valid.every((r) => isTipeProdukInvoiceOnly(r.tipeProduk))
  );
}

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

function pemesananMatchesId(item, id) {
  const sid = String(id ?? "").trim();
  if (!sid || !item) return false;
  return (
    String(item.idPembelian ?? "").trim() === sid ||
    String(item._id ?? "").trim() === sid ||
    String(item.id ?? "").trim() === sid ||
    (!Number.isNaN(Number(sid)) && Number(item.id) === Number(sid))
  );
}

function findPemesananInCache(id) {
  return (
    (pemesananData || []).find((item) => pemesananMatchesId(item, id)) ||
    (pemesanan || []).find((item) => pemesananMatchesId(item, id)) ||
    null
  );
}

/** Gabungkan dokumen hasil PUT/POST ke cache lokal — hindari GET /api/pemesanan penuh. */
function upsertPemesananInCache(doc) {
  const p = unwrapPemesananResponse(doc);
  if (!p || (!p.idPembelian && !p._id && p.id == null)) return;
  const keys = [
    p._id != null ? String(p._id) : "",
    p.idPembelian != null ? String(p.idPembelian) : "",
    p.id != null ? String(p.id) : "",
  ].filter(Boolean);
  const idx = (pemesananData || []).findIndex((item) =>
    keys.some((k) => pemesananMatchesId(item, k)),
  );
  if (idx >= 0) {
    pemesananData[idx] = p;
  } else {
    pemesananData.push(p);
  }
  pemesanan = pemesananData;
}

function refreshPemesananTableFromCache() {
  refreshFilterProsesPemesananOptions();
  applyFilterPemesanan();
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
  if (pemesananIsInvoiceOnly(p)) {
    const displayStokTersedia = document.getElementById("displayStokTersedia");
    const displayProduksiProses = document.getElementById(
      "displayProduksiProses",
    );
    const displayProduksiJenisKopi = document.getElementById(
      "displayProduksiJenisKopi",
    );
    const stokInfoDisplay = document.getElementById("stokInfoDisplay");
    const hintEl = document.getElementById("displayStokAgregatHint");
    if (displayStokTersedia) displayStokTersedia.textContent = "—";
    if (displayProduksiProses)
      displayProduksiProses.textContent = p.prosesPengolahan || "-";
    if (displayProduksiJenisKopi)
      displayProduksiJenisKopi.textContent = p.jenisKopi || "-";
    if (hintEl) {
      hintEl.textContent =
        "Tipe invoice-only (Roasted Beans / Argopuro Walida Collective): tidak terikat stok. Pemesanan bisa langsung Complete (pembayaran Lunas).";
      hintEl.className = "small text-muted mb-0";
    }
    if (stokInfoDisplay) stokInfoDisplay.style.display = "block";
    return;
  }

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
  const names =
    masterProdukNames.length > 0
      ? masterProdukNames
      : ["Green Beans", "Pixel"];
  const opts = names.map(
    (nama) =>
      `<option value="${escapeHtmlAttr(nama)}"${selected === nama ? " selected" : ""}>${escapeHtmlAttr(nama)}</option>`,
  );
  return `<option value="">Pilih</option>${opts.join("")}`;
}

function refreshKloterTipeProdukSelects() {
  document.querySelectorAll(".kloter-tipe").forEach((sel) => {
    const cur = sel.value;
    sel.innerHTML = buildTipeProdukOptionsHtml(cur);
  });
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

const MAX_PEMBAYARAN_BERTAHAP_BARIS_TAMBAHAN = 30;

/**
 * Baris untuk form pembayaran bertahap: pakai pembayaranBertahapBaris dari API;
 * jika kosong, migrasi dari jumlahPembayaranKloter per baris (dokumen lama) agar nominal tidak hilang saat simpan ulang.
 */
function pembayaranBertahapBarisUntukFormDariDoc(p) {
  if (!p) return [];
  const api = p.pembayaranBertahapBaris;
  if (Array.isArray(api) && api.length > 0) {
    return api
      .filter((b) => {
        const jj = parseFloat(b?.jumlahRp) || 0;
        const ct = String(b?.catatan || "").trim();
        return jj > 0 || ct.length > 0;
      })
      .map((b) => ({
        jumlahRp: b.jumlahRp,
        catatan: b.catatan != null ? b.catatan : "",
        terminLunas: pembayaranBarisLunasTrue(b.terminLunas),
      }))
      .slice(0, MAX_PEMBAYARAN_BERTAHAP_BARIS_TAMBAHAN);
  }
  const lines = getPemesananKloterLinesFromDoc(p);
  const out = [];
  lines.forEach((L, i) => {
    const j = parseFloat(L.jumlahPembayaranKloter);
    if (Number.isFinite(j) && j > 0) {
      const cat = [L.tipeProduk, L.jenisKopi, L.prosesPengolahan].filter(Boolean).join(" · ") || `Kloter ${i + 1}`;
      out.push({ catatan: cat, jumlahRp: j, terminLunas: true });
    }
  });
  return out.slice(0, MAX_PEMBAYARAN_BERTAHAP_BARIS_TAMBAHAN);
}

function clearPembayaranBertahapTambahanRows() {
  const tb = document.getElementById("tbodyPembayaranBertahapTambahan");
  if (tb) tb.innerHTML = "";
  syncBtnTambahPembayaranBertahapBaris();
}

function syncBtnTambahPembayaranBertahapBaris() {
  const btn = document.getElementById("btnTambahPembayaranBertahapBaris");
  const tb = document.getElementById("tbodyPembayaranBertahapTambahan");
  if (!btn || !tb) return;
  const n = tb.querySelectorAll("tr").length;
  btn.disabled = n >= MAX_PEMBAYARAN_BERTAHAP_BARIS_TAMBAHAN;
}

function renumberPembayaranBertahapTambahanRows() {
  const tb = document.getElementById("tbodyPembayaranBertahapTambahan");
  if (!tb) return;
  tb.querySelectorAll("tr").forEach((tr, i) => {
    const c = tr.querySelector("td.text-muted");
    if (c) c.textContent = String(i + 1);
  });
}

function addPembayaranBertahapTambahanRow(prefill) {
  const tb = document.getElementById("tbodyPembayaranBertahapTambahan");
  if (!tb) return;
  if (tb.querySelectorAll("tr").length >= MAX_PEMBAYARAN_BERTAHAP_BARIS_TAMBAHAN) {
    alert(
      `Maksimal ${MAX_PEMBAYARAN_BERTAHAP_BARIS_TAMBAHAN} baris pembayaran tambahan.`,
    );
    return;
  }
  const jr0 = prefill != null ? parseFloat(prefill.jumlahRp) : NaN;
  const jumlahVal =
    Number.isFinite(jr0) && jr0 > 0 ? escapeHtmlAttr(String(prefill.jumlahRp)) : "";
  const catRaw = prefill != null && prefill.catatan != null ? String(prefill.catatan) : "";
  const catVal = escapeHtmlAttr(catRaw);
  const lunasChecked =
    prefill != null && prefill.terminLunas === false ? "" : " checked";
  const tr = document.createElement("tr");
  tr.innerHTML = `
      <td class="text-muted"></td>
      <td><input type="text" class="form-control form-control-sm bertahap-baris-catatan" maxlength="500" placeholder="Mis. Termin 2, DP, dll." value="${catVal}" /></td>
      <td><input type="number" class="form-control form-control-sm bertahap-baris-jumlah text-end" placeholder="0" min="0" step="1000" value="${jumlahVal}" title="Nominal masuk" /></td>
      <td class="text-center align-middle">
        <input type="checkbox" class="form-check-input bertahap-baris-lunas m-0" title="Sudah diterima — masuk total terbayar & pemasukan"${lunasChecked} />
      </td>
      <td class="text-center">
        <button type="button" class="btn btn-sm btn-outline-danger py-0 px-1" onclick="removePembayaranBertahapTambahanRow(this)" title="Hapus baris"><i class="bi bi-trash"></i></button>
      </td>`;
  tb.appendChild(tr);
  renumberPembayaranBertahapTambahanRows();
  tr.querySelectorAll(".bertahap-baris-catatan, .bertahap-baris-jumlah").forEach((el) => {
    el.addEventListener("input", () => updateRingkasanPembayaranBertahap());
    el.addEventListener("change", () => updateRingkasanPembayaranBertahap());
  });
  const cbL = tr.querySelector(".bertahap-baris-lunas");
  if (cbL) {
    cbL.addEventListener("change", () => updateRingkasanPembayaranBertahap());
  }
  syncBtnTambahPembayaranBertahapBaris();
  updateRingkasanPembayaranBertahap();
}

function removePembayaranBertahapTambahanRow(btn) {
  const tr = btn && btn.closest("tr");
  const tb = document.getElementById("tbodyPembayaranBertahapTambahan");
  if (!tr || !tb || !tb.contains(tr)) return;
  tr.remove();
  renumberPembayaranBertahapTambahanRows();
  syncBtnTambahPembayaranBertahapBaris();
  updateRingkasanPembayaranBertahap();
}

function collectPembayaranBertahapBarisFromForm() {
  const tb = document.getElementById("tbodyPembayaranBertahapTambahan");
  if (!tb) return [];
  const out = [];
  tb.querySelectorAll("tr").forEach((tr) => {
    const cat = (tr.querySelector(".bertahap-baris-catatan")?.value || "").trim();
    const jr = parseFloat(tr.querySelector(".bertahap-baris-jumlah")?.value || 0);
    const j = Number.isFinite(jr) && jr > 0 ? Math.round(jr * 100) / 100 : 0;
    const terminLunas = !!tr.querySelector(".bertahap-baris-lunas")?.checked;
    if (j <= 0 && !cat) return;
    const row = { jumlahRp: j, terminLunas };
    if (cat) row.catatan = cat;
    out.push(row);
  });
  return out;
}

function renderPembayaranBertahapBarisTambahan(rows) {
  clearPembayaranBertahapTambahanRows();
  if (!Array.isArray(rows) || !rows.length) return;
  rows.slice(0, MAX_PEMBAYARAN_BERTAHAP_BARIS_TAMBAHAN).forEach((r) => {
    addPembayaranBertahapTambahanRow({
      jumlahRp: r.jumlahRp,
      catatan: r.catatan != null ? r.catatan : "",
      terminLunas: r.terminLunas !== false,
    });
  });
}

function sumPembayaranBertahapFromFormByLunas(wantLunas) {
  const tb = document.getElementById("tbodyPembayaranBertahapTambahan");
  if (!tb) return 0;
  let sum = 0;
  tb.querySelectorAll("tr").forEach((tr) => {
    const lunas = !!tr.querySelector(".bertahap-baris-lunas")?.checked;
    if (lunas !== wantLunas) return;
    const v = parseFloat(tr.querySelector(".bertahap-baris-jumlah")?.value || 0);
    if (Number.isFinite(v) && v > 0) sum += v;
  });
  return Math.round(sum * 100) / 100;
}

function sumAllPembayaranBertahapFromForm() {
  return (
    Math.round((sumPembayaranBertahapFromFormByLunas(true) + sumPembayaranBertahapFromFormByLunas(false)) * 100) / 100
  );
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

/** Total rupiah pemesanan dari form (subtotal kloter ± pajak + kirim). */
function getTotalHargaNumericFromForm() {
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
  const tipePajak = document.getElementById("tipePajak")?.value || "penjumlahan";
  return hitungTotalPemesananDariKomponen(
    subtotalBarang,
    pajak,
    kirim,
    tipePajak,
  );
}

function updateHintFormulaTotalHarga() {
  const el = document.getElementById("hintFormulaTotalHarga");
  if (!el) return;
  const tipe = normalizeTipePajak(document.getElementById("tipePajak")?.value);
  el.textContent =
    tipe === "pengurangan"
      ? "Subtotal kloter − PPh 22 + pengiriman"
      : "Subtotal kloter + PPh 22 + pengiriman";
}

function updateRingkasanPembayaranBertahap() {
  const wrapForm = document.getElementById("wrapFormPembayaranPerKloter");
  const elSum = document.getElementById("displaySumPembayaranKloter");
  const elBelum = document.getElementById("displaySumPembayaranBelumLunas");
  const elSisa = document.getElementById("displaySisaPembayaranBertahap");
  if (!wrapForm || wrapForm.classList.contains("d-none")) {
    updateBertahapStatusLocks();
    return;
  }
  const sumLunas = sumPembayaranBertahapFromFormByLunas(true);
  const sumBelum = sumPembayaranBertahapFromFormByLunas(false);
  const total = getTotalHargaNumericFromForm();
  const sisa = Math.max(0, Math.round((total - sumLunas) * 100) / 100);
  if (elSum) elSum.textContent = `Rp ${sumLunas.toLocaleString("id-ID")}`;
  if (elBelum) elBelum.textContent = `Rp ${sumBelum.toLocaleString("id-ID")}`;
  if (elSisa) elSisa.textContent = `Rp ${sisa.toLocaleString("id-ID")}`;
  updateBertahapStatusLocks();
}

function syncPembayaranBertahapSections() {
  const sel = document.getElementById("statusPembayaran");
  const on = sel && sel.value === "Pembayaran Bertahap";
  const wrapForm = document.getElementById("wrapFormPembayaranPerKloter");
  if (wrapForm) {
    wrapForm.classList.toggle("d-none", !on);
    if (!on) {
      clearPembayaranBertahapTambahanRows();
    }
  }
  updateRingkasanPembayaranBertahap();
}

/** Sisa tagihan dari form (pembayaran bertahap): total − hanya baris termin lunas. */
function computeSisaTagihanFormPreview() {
  const sp = document.getElementById("statusPembayaran")?.value;
  if (sp !== "Pembayaran Bertahap") return 0;
  const sumLunas = sumPembayaranBertahapFromFormByLunas(true);
  const total = getTotalHargaNumericFromForm();
  return Math.max(0, Math.round((total - sumLunas) * 100) / 100);
}

/**
 * Untuk pembayaran bertahap: jika sisa tagihan > 0, kunci pilihan Lunas & Complete.
 */
function updateBertahapStatusLocks() {
  const spBayar = document.getElementById("statusPembayaran");
  const spPem = document.getElementById("statusPemesanan");
  const hint = document.getElementById("hintBertahapLock");
  if (!spBayar || !spPem) return;

  if (currentEditPreservesComplete) {
    const optLunas = spBayar.querySelector('option[value="Lunas"]');
    const optComplete = spPem.querySelector('option[value="Complete"]');
    if (optLunas) optLunas.disabled = false;
    if (optComplete) optComplete.disabled = false;
    if (hint) hint.classList.add("d-none");
    return;
  }

  const sisa = computeSisaTagihanFormPreview();
  const locked = spBayar.value === "Pembayaran Bertahap" && sisa > 1;
  const optLunas = spBayar.querySelector('option[value="Lunas"]');
  const optComplete = spPem.querySelector('option[value="Complete"]');
  if (optLunas) optLunas.disabled = locked;
  if (optComplete) optComplete.disabled = locked;

  if (hint) {
    if (locked) {
      hint.classList.remove("d-none");
      hint.innerHTML = `<i class="bi bi-lock-fill me-1"></i>Pembayaran bertahap: masih ada <strong>sisa tagihan Rp ${sisa.toLocaleString("id-ID")}</strong>. Lunasi hingga sisa Rp 0 untuk dapat memilih <strong>Lunas</strong> atau <strong>Complete</strong>.`;
    } else {
      hint.classList.add("d-none");
      hint.textContent = "";
    }
  }

  if (locked) {
    if (spBayar.value === "Lunas") spBayar.value = "Pembayaran Bertahap";
    if (spPem.value === "Complete") spPem.value = "Ordering";
  }
  syncStatusPemesananInvoiceOnlyForm();
}

/** Nama lama (tombol / handler) — tetap dipakai agar kompatibel. */
function syncPembayaranKloterColumnsVisibility() {
  syncPembayaranBertahapSections();
}

/**
 * Tampilkan opsi Complete & petunjuk jika semua kloter bertipe invoice-only
 * (Roasted Beans / Argopuro Walida Collective) dengan pembayaran Lunas.
 */
function syncStatusPemesananInvoiceOnlyForm() {
  const statusField = document.getElementById("statusPemesanan");
  const hint = document.getElementById("hintStatusPemesananForm");
  const pemesananId = (document.getElementById("pemesananId")?.value || "").trim();
  if (!statusField) return;

  const allInv = kloterRowsAllInvoiceOnly(collectKloterFromForm());
  const lunas =
    (document.getElementById("statusPembayaran")?.value || "") === "Lunas";
  const allowDirectComplete =
    allInv && lunas && !currentEditPreservesComplete;

  let optComplete = statusField.querySelector('option[value="Complete"]');
  if (allowDirectComplete) {
    if (!optComplete) {
      optComplete = document.createElement("option");
      optComplete.value = "Complete";
      optComplete.textContent = "Complete";
      statusField.appendChild(optComplete);
    }
    if (hint) {
      hint.style.display = "block";
      hint.innerHTML =
        "<strong>Invoice-only (Roasted Beans / Argopuro Walida Collective):</strong> pilih <strong>Complete</strong> untuk menyelesaikan tanpa mengurangi stok (pembayaran <strong>Lunas</strong>).";
    }
  } else if (!pemesananId && !currentEditPreservesComplete) {
    if (optComplete) optComplete.remove();
    if (statusField.value === "Complete") statusField.value = "Ordering";
    if (hint) hint.style.display = "none";
  } else if (pemesananId && allInv && !currentEditPreservesComplete && hint) {
    hint.style.display = "block";
    hint.innerHTML =
      "<strong>Invoice-only (Roasted Beans / Argopuro Walida Collective):</strong> pilih <strong>Complete</strong> untuk menyelesaikan tanpa stok, atau gunakan <strong>Proses Ordering</strong> (sama, tanpa potong stok).";
  }

  const wPem = document.getElementById("wrapSelectIdProduksiPemesanan");
  if (wPem && !currentEditPreservesComplete) {
    wPem.style.display = allInv ? "none" : "";
  }
}

// Calculate total harga (subtotal kloter ± pajak + pengiriman)
function calculateTotalHarga() {
  const total = getTotalHargaNumericFromForm();
  updateHintFormulaTotalHarga();

  const th = document.getElementById("totalHarga");
  if (th) {
    th.value = total.toLocaleString("id-ID").replace(/\./g, ",");
  }
  updateRingkasanPembayaranBertahap();
  syncStatusPemesananInvoiceOnlyForm();
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
  const t0 =
    typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();
  try {
    pembeliMasterList = await window.API.Pembeli.getAll();
  } finally {
    const t1 =
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now();
    const dt = (t1 - t0).toFixed(0);
    if (t1 - t0 > 1500) {
      console.warn(`⚠️ [Pembeli.getAll] respons lambat: ${dt} ms`);
    } else {
      console.log(`📊 [Pembeli.getAll] ${dt} ms`);
    }
  }
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

/**
 * Isi datalist autocomplete region pada modal Pembeli (sekali saja per buka
 * halaman). Datalist akan tetap valid selamanya karena dataset region statis.
 */
function ensureRegionPembeliDatalist() {
  const dl = document.getElementById("regionPembeliDatalist");
  if (!dl || dl.dataset.populated === "1") return;
  if (!window.RegionsIndonesia) return;
  const grouped = window.RegionsIndonesia.getRegionsByProvinsi();
  const frag = document.createDocumentFragment();
  Object.keys(grouped).forEach((prov) => {
    grouped[prov].forEach((canon) => {
      const opt = document.createElement("option");
      opt.value = canon;
      frag.appendChild(opt);
    });
  });
  dl.appendChild(frag);
  dl.dataset.populated = "1";
}

/**
 * Validasi input region pada modal Pembeli. Jika `commit` true (event
 * change), nilai akan dibakukan ke string kanonik dari RegionsIndonesia.
 */
function onRegionPembeliInput(commit) {
  const inp = document.getElementById("regionPembeliMaster");
  const fb = document.getElementById("regionPembeliMasterFeedback");
  if (!inp) return;
  const RI = window.RegionsIndonesia;
  if (!RI) return;
  const v = (inp.value || "").trim();
  if (!v) {
    inp.classList.remove("is-invalid");
    inp.classList.remove("is-valid");
    if (fb) fb.style.display = "none";
    return;
  }
  if (RI.isValidRegion(v)) {
    inp.classList.remove("is-invalid");
    inp.classList.add("is-valid");
    if (fb) fb.style.display = "none";
    return;
  }
  if (commit) {
    const canon = RI.normalizeRegion(v);
    if (canon) {
      inp.value = canon;
      inp.classList.remove("is-invalid");
      inp.classList.add("is-valid");
      if (fb) fb.style.display = "none";
      return;
    }
  }
  inp.classList.add("is-invalid");
  inp.classList.remove("is-valid");
  if (fb) fb.style.display = "block";
}

/** Refresh dropdown filter region pada tab Data Pembeli sesuai data terbaru. */
function refreshFilterRegionPembeliMasterOptions() {
  const sel = document.getElementById("filterRegionPembeliMaster");
  if (!sel) return;
  const prev = sel.value || "";
  const set = new Set();
  (pembeliMasterList || []).forEach((b) => {
    const r = (b.region || "").trim();
    if (r) set.add(r);
  });
  const list = [...set].sort((a, b) => a.localeCompare(b, "id"));
  sel.innerHTML = "";
  const o0 = document.createElement("option");
  o0.value = "";
  o0.textContent = "Semua region";
  sel.appendChild(o0);
  list.forEach((v) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    sel.appendChild(o);
  });
  sel.value = list.includes(prev) ? prev : "";
}

function applyFilterPembeliMaster() {
  const tbody = document.getElementById("tablePembeliMaster");
  if (!tbody) return;
  const q = (document.getElementById("searchPembeliMaster")?.value || "")
    .toLowerCase()
    .trim();
  const region = (
    document.getElementById("filterRegionPembeliMaster")?.value || ""
  ).trim();
  let rows = pembeliMasterList;
  if (q) {
    rows = rows.filter(
      (b) =>
        (b.idPembeli && String(b.idPembeli).toLowerCase().includes(q)) ||
        (b.nama && String(b.nama).toLowerCase().includes(q)) ||
        (b.kontak && String(b.kontak).toLowerCase().includes(q)) ||
        (b.alamat && String(b.alamat).toLowerCase().includes(q)) ||
        (b.region && String(b.region).toLowerCase().includes(q)),
    );
  }
  if (region) {
    rows = rows.filter((b) => (b.region || "").trim() === region);
  }
  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="8" class="text-center py-4 text-muted">Tidak ada data pembeli</td></tr>';
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
      <td>${b.region ? `<span class="badge bg-info text-dark">${escapeHtmlAttr(b.region)}</span>` : '<span class="text-muted small">—</span>'}</td>
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
  const tbody = document.getElementById("tablePembeliMaster");
  // Tampilkan cache lebih dulu kalau sudah pernah di-load di session ini, supaya
  // UI tidak terlihat hang pada koneksi/server lambat. Refresh data tetap
  // dijalankan di background.
  if (tbody && Array.isArray(pembeliMasterList) && pembeliMasterList.length > 0) {
    refreshFilterRegionPembeliMasterOptions();
    applyFilterPembeliMaster();
  } else if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center text-muted py-4">
          <div class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></div>
          Memuat data pembeli dari server...
        </td>
      </tr>`;
  }
  try {
    await loadPembeliMasterList();
    refreshFilterRegionPembeliMasterOptions();
    applyFilterPembeliMaster();
  } catch (e) {
    console.error(e);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">Gagal memuat: ${escapeHtmlAttr(e.message || "Unknown error")}<br><small class="text-muted">Coba refresh halaman atau cek koneksi server.</small></td></tr>`;
    }
  }
}

function openModalPembeli(mode) {
  ensureRegionPembeliDatalist();
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
    const regInp = document.getElementById("regionPembeliMaster");
    if (regInp) {
      regInp.value = "";
      regInp.classList.remove("is-valid", "is-invalid");
    }
    const fb = document.getElementById("regionPembeliMasterFeedback");
    if (fb) fb.style.display = "none";
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
  const regInp = document.getElementById("regionPembeliMaster");
  if (regInp) {
    regInp.value = b.region || "";
    onRegionPembeliInput(true);
  }
  const m = new bootstrap.Modal(document.getElementById("modalPembeli"));
  m.show();
}

async function savePembeliMaster() {
  const form = document.getElementById("formPembeli");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  const RI = window.RegionsIndonesia;
  const regionRaw = document.getElementById("regionPembeliMaster").value.trim();
  let regionCanon = regionRaw;
  if (RI) {
    regionCanon = RI.normalizeRegion(regionRaw) || (RI.isValidRegion(regionRaw) ? regionRaw : "");
    if (!regionCanon) {
      onRegionPembeliInput(true);
      regionCanon = document.getElementById("regionPembeliMaster").value.trim();
    }
    if (!regionCanon) {
      alert("Region tidak valid. Pilih kabupaten/kota dari daftar suggestion.");
      document.getElementById("regionPembeliMaster").focus();
      return;
    }
    document.getElementById("regionPembeliMaster").value = regionCanon;
  } else if (!regionRaw) {
    alert("Region wajib diisi.");
    return;
  }
  const payload = {
    nama: document.getElementById("namaPembeliMaster").value.trim(),
    kontak: document.getElementById("kontakPembeliMaster").value.trim(),
    alamat: document.getElementById("alamatPembeliMaster").value.trim(),
    tipePembeli: document.getElementById("tipePembeliMaster").value,
    region: regionCanon,
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

    const produk = await window.API.MasterData.produk.getAll();
    masterProdukNames = (produk || [])
      .map((p) => (p.nama || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "id"));

    refreshKloterTipeProdukSelects();

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
        <td><span class="badge bg-info">${escapeHtmlAttr(s.tipeProduk || "-")}</span></td>
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

    refreshFilterProsesPemesananOptions();
    applyFilterPemesanan();
  } catch (error) {
    console.error("❌ Error loading pemesanan:", error);
    pemesananData = [];
    pemesanan = [];
    refreshFilterProsesPemesananOptions();
    applyFilterPemesanan();
  }
}

/** True jika pemesanan punya minimal satu kloter dengan proses pengolahan = nilai filter. */
function pemesananMatchesProsesPengolahanFilter(p, filterProses) {
  const want = String(filterProses || "").trim();
  if (!want) return true;
  const lines =
    typeof getPemesananKloterLinesFromDoc === "function"
      ? getPemesananKloterLinesFromDoc(p)
      : [];
  if (lines.some((L) => (L.prosesPengolahan || "").trim() === want)) {
    return true;
  }
  const root = String(p?.prosesPengolahan || "").trim();
  return root === want;
}

/** Isi ulang opsi dropdown proses pengolahan dari agregat data pemesanan. */
function refreshFilterProsesPemesananOptions() {
  const sel = document.getElementById("filterProsesPemesanan");
  if (!sel) return;
  const prev = sel.value;
  const set = new Set();
  (pemesananData || []).forEach((p) => {
    const lines =
      typeof getPemesananKloterLinesFromDoc === "function"
        ? getPemesananKloterLinesFromDoc(p)
        : [];
    lines.forEach((L) => {
      const pr = String(L?.prosesPengolahan || "").trim();
      if (pr) set.add(pr);
    });
    const r = String(p?.prosesPengolahan || "").trim();
    if (r) set.add(r);
  });
  const sorted = Array.from(set).sort((a, b) =>
    a.localeCompare(b, "id", { sensitivity: "base" }),
  );
  sel.innerHTML = '<option value="">Semua proses</option>';
  sorted.forEach((label) => {
    const op = document.createElement("option");
    op.value = label;
    op.textContent = label;
    sel.appendChild(op);
  });
  if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
}

// Apply filter to pemesanan table
function applyFilterPemesanan() {
  const tableBody = document.getElementById("tablePemesanan");
  if (!tableBody) return;

  try {
    const searchTerm = document.getElementById("searchPemesanan")
      ? document.getElementById("searchPemesanan").value.toLowerCase()
      : "";
    const filterProses = document.getElementById("filterProsesPemesanan")
      ? document.getElementById("filterProsesPemesanan").value
      : "";
    const filterPembayaran = document.getElementById(
      "filterStatusPembayaranPemesanan",
    )
      ? document.getElementById("filterStatusPembayaranPemesanan").value
      : "";
    const filterStatusPemesanan = document.getElementById(
      "filterStatusPemesanan",
    )
      ? document.getElementById("filterStatusPemesanan").value
      : "";

    // Filter data
    let filteredPemesanan = pemesananData.filter((p) => {
      const matchSearch =
        !searchTerm ||
        (p.idPembelian && p.idPembelian.toLowerCase().includes(searchTerm)) ||
        (p.namaPembeli && p.namaPembeli.toLowerCase().includes(searchTerm));
      const matchProses = pemesananMatchesProsesPengolahanFilter(
        p,
        filterProses,
      );
      const statusBayar = String(p.statusPembayaran || "Belum Lunas").trim();
      const matchPembayaran =
        !filterPembayaran || statusBayar === filterPembayaran;
      const matchStatusPemesanan =
        !filterStatusPemesanan ||
        String(p.statusPemesanan || "").trim() === filterStatusPemesanan;

      return (
        matchSearch &&
        matchProses &&
        matchPembayaran &&
        matchStatusPemesanan
      );
    });

    if (filteredPemesanan.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="12" class="text-center py-4 text-muted">
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
        <td class="text-end">
          ${(() => {
            const sisa = totalPembayaranSaatIniFromDoc(p);
            const sumK = sumJumlahPembayaranKloterFromDoc(p);
            const isBt =
              String(p.statusPembayaran || "").trim() === "Pembayaran Bertahap";
            if (isBt || sumK > 0) {
              return `<span class="fw-semibold">Rp ${sisa.toLocaleString("id-ID")}</span>
                <div class="small text-muted">Terbayar: Rp ${sumK.toLocaleString("id-ID")}</div>`;
            }
            return '<span class="text-muted">—</span>';
          })()}
        </td>
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
          <td colspan="12" class="text-center py-4 text-danger">
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
    const tp = document.getElementById("tipePajak");
    if (tp) tp.value = "penjumlahan";
    const bp = document.getElementById("biayaPajak");
    if (bp) bp.value = "0";
    const bpg = document.getElementById("biayaPengiriman");
    if (bpg) bpg.value = "0";
    updateHintFormulaTotalHarga();

    const btnCetak = document.getElementById("btnSimpanCetakInvoice");
    if (btnCetak) btnCetak.style.display = "";

    const wPem = document.getElementById("wrapSelectIdProduksiPemesanan");
    if (wPem) wPem.style.display = "none";
    const selPem = document.getElementById("selectIdProduksiPemesanan");
    if (selPem) selPem.innerHTML = '<option value="">Otomatis (FIFO)</option>';

    await loadMasterDataOptions();
    renderKloterTable([{}]);
    clearPembayaranBertahapTambahanRows();
    syncPembayaranKloterColumnsVisibility();
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
    let p = findPemesananInCache(id);
    if (!p) {
      await loadPemesanan();
      p = findPemesananInCache(id);
    }
    if (!p) {
      alert("Data pemesanan tidak ditemukan!");
      return;
    }

    const modalLabel = document.getElementById("modalPemesananLabel");
    if (modalLabel) modalLabel.textContent = "Edit Pemesanan";
    const btnCetak = document.getElementById("btnSimpanCetakInvoice");
    if (btnCetak) btnCetak.style.display = "none";

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
    const tpEl = document.getElementById("tipePajak");
    if (tpEl) tpEl.value = normalizeTipePajak(p.tipePajak);
    const bpEl = document.getElementById("biayaPajak");
    if (bpEl) bpEl.value = p.biayaPajak != null ? p.biayaPajak : "0";
    const bpgEl = document.getElementById("biayaPengiriman");
    if (bpgEl) bpgEl.value = p.biayaPengiriman != null ? p.biayaPengiriman : "0";
    calculateTotalHarga();
    document.getElementById("statusPemesanan").value =
      p.statusPemesanan || "Ordering";
    const spb = document.getElementById("statusPembayaran");
    if (spb) spb.value = p.statusPembayaran || "Belum Lunas";
    syncPembayaranKloterColumnsVisibility();
    if (spb && spb.value === "Pembayaran Bertahap") {
      renderPembayaranBertahapBarisTambahan(pembayaranBertahapBarisUntukFormDariDoc(p));
    } else {
      clearPembayaranBertahapTambahanRows();
    }
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
    syncStatusPemesananInvoiceOnlyForm();
    const htEdit = document.getElementById("hintStatusPemesananForm");
    if (htEdit && currentEditPreservesComplete) htEdit.style.display = "none";

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

  const statusPemesanan = document.getElementById("statusPemesanan").value;
  const statusPembayaran =
    document.getElementById("statusPembayaran")?.value || "Belum Lunas";

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
  const tipePajak = normalizeTipePajak(
    document.getElementById("tipePajak")?.value || "penjumlahan",
  );

  const subtotalBarang = kloterPayload.reduce(
    (s, k) => s + k.beratKg * k.hargaPerKg,
    0,
  );
  const totalHarga = hitungTotalPemesananDariKomponen(
    subtotalBarang,
    biayaPajak,
    biayaPengiriman,
    tipePajak,
  );

  if (statusPembayaran === "Pembayaran Bertahap") {
    const sumSemua = sumAllPembayaranBertahapFromForm();
    if (sumSemua > totalHarga + 1e-6) {
      alert(
        "Jumlah nominal pembayaran (termasuk yang belum lunas) tidak boleh melebihi total harga pemesanan.",
      );
      return;
    }
    const sumLunas = sumPembayaranBertahapFromFormByLunas(true);
    const sisaSave = Math.max(0, Math.round((totalHarga - sumLunas) * 100) / 100);
    if (sisaSave > 1 && statusPemesanan === "Complete") {
      alert(
        "Pembayaran bertahap: masih ada sisa tagihan. Lunasi hingga sisa Rp 0 sebelum menyelesaikan pemesanan (Complete).",
      );
      return;
    }
  }

  if (statusPembayaran === "Lunas") {
    const sumLunas = sumPembayaranBertahapFromFormByLunas(true);
    const sisaL = Math.max(0, Math.round((totalHarga - sumLunas) * 100) / 100);
    if (sumLunas > 0 && sisaL > 1) {
      alert(
        "Masih ada sisa tagihan dari pembayaran bertahap. Centang Lunas atau lunasi hingga sisa Rp 0 sebelum mengatur status pembayaran ke Lunas.",
      );
      return;
    }
  }

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

  const saveBtns = document.querySelectorAll(
    '#modalPemesanan button[onclick^="savePemesanan"]',
  );
  saveBtns.forEach((b) => {
    b.disabled = true;
    b.dataset.prevHtml = b.innerHTML;
    b.innerHTML =
      '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Menyimpan...';
  });

  try {
    const pemesananPayload = {
      idPembelian,
      namaPembeli,
      tipePemesanan,
      negara: tipePemesanan === "International" ? negara : "",
      kloter: kloterPayload,
      tipePajak,
      biayaPajak,
      biayaPengiriman,
      totalHarga,
      statusPemesanan,
      statusPembayaran,
      catatanPemesanan,
      tanggalPemesanan,
    };
    if (idMasterPembeli) pemesananPayload.idMasterPembeli = idMasterPembeli;
    if (kontakPembeli) pemesananPayload.kontakPembeli = kontakPembeli;
    if (alamatPembeli) pemesananPayload.alamatPembeli = alamatPembeli;
    pemesananPayload.pembayaranBertahapBaris =
      statusPembayaran === "Pembayaran Bertahap"
        ? collectPembayaranBertahapBarisFromForm()
        : [];

    if (pemesananId) {
      if (currentEditPreservesComplete) {
        pemesananPayload.statusPemesanan = "Complete";
        pemesananPayload.statusPembayaran = "Lunas";
        console.log(`🔄 Updating pemesanan ID: ${pemesananId}`);
        const updated = await window.API.Pemesanan.update(
          pemesananId,
          pemesananPayload,
        );
        upsertPemesananInCache(updated);
        if (window.showNotification) {
          window.showNotification("update", "Pemesanan", "success");
        } else {
          alert("Data pemesanan berhasil diupdate!");
        }
      } else if (statusPemesanan === "Complete") {
        const idProdForm = (
          document.getElementById("selectIdProduksiPemesanan")?.value || ""
        ).trim();
        const beforeProses = { ...pemesananPayload, statusPemesanan: "Ordering" };
        console.log(`🔄 Simpan sebagai Ordering lalu proses stok → Complete: ${pemesananId}`);
        const orderingSaved = await window.API.Pemesanan.update(
          pemesananId,
          beforeProses,
        );
        upsertPemesananInCache(orderingSaved);

        let pFromApi = unwrapPemesananResponse(orderingSaved);
        if (!pFromApi || !pFromApi.idPembelian) {
          throw new Error("Gagal memuat data pemesanan setelah simpan");
        }

        if (pemesananIsInvoiceOnly(pFromApi)) {
          if (statusPembayaran !== "Lunas") {
            alert(
              "Pemesanan invoice-only (Roasted Beans / Argopuro Walida Collective) hanya bisa Complete jika pembayaran sudah Lunas.",
            );
            return;
          }
          const invDone = await window.API.Pemesanan.update(pemesananId, {
            ...pemesananPayload,
            statusPemesanan: "Complete",
            statusPembayaran: "Lunas",
          });
          upsertPemesananInCache(invDone);
          if (window.showNotification) {
            window.showNotification(
              "update",
              "Pemesanan",
              "success",
              "Pemesanan invoice-only diselesaikan (Complete, tanpa pengurangan stok).",
            );
          } else {
            alert(
              "Pemesanan invoice-only diselesaikan (tanpa pengurangan stok).",
            );
          }
          refreshPemesananTableFromCache();
          const modalInv = bootstrap.Modal.getInstance(
            document.getElementById("modalPemesanan"),
          );
          modalInv?.hide();
          return;
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
          refreshPemesananTableFromCache();
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

        const completeSaved = await window.API.Pemesanan.update(pemesananId, {
          ...pemesananPayload,
          statusPemesanan: "Complete",
          statusPembayaran: "Lunas",
        });
        upsertPemesananInCache(completeSaved);

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

        refreshPemesananTableFromCache();
        await loadStokProduksi();
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
        pemesananPayload.statusPemesanan = "Ordering";
        console.log(`🔄 Updating pemesanan ID: ${pemesananId}`);
        const updated = await window.API.Pemesanan.update(
          pemesananId,
          pemesananPayload,
        );
        upsertPemesananInCache(updated);
        if (window.showNotification) {
          window.showNotification("update", "Pemesanan", "success");
        } else {
          alert("Data pemesanan berhasil diupdate!");
        }
      }
    } else {
      if (statusPemesanan === "Complete") {
        if (!kloterRowsAllInvoiceOnly(kloterRaw)) {
          alert(
            "Pemesanan baru tidak bisa langsung **Complete** (kecuali semua kloter bertipe invoice-only — **Roasted Beans** atau **Argopuro Walida Collective** — dengan pembayaran **Lunas**). Simpan sebagai **Ordering** dulu, lalu selesaikan lewat **Edit → Complete** atau **Proses Ordering**.",
          );
          return;
        }
        if (statusPembayaran !== "Lunas") {
          alert(
            "Pemesanan invoice-only (Roasted Beans / Argopuro Walida Collective) hanya bisa langsung Complete jika pembayaran **Lunas**.",
          );
          return;
        }
      }
      // Add mode - Create via API
      console.log("🔄 Creating new pemesanan");
      const created = await window.API.Pemesanan.create(pemesananPayload);
      upsertPemesananInCache(created);
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

      refreshPemesananTableFromCache();

      if (cetakInvoice && newId) {
        await generateInvoicePDF(newId);
      }
      return;
    }

    refreshPemesananTableFromCache();

    const modal = bootstrap.Modal.getInstance(
      document.getElementById("modalPemesanan"),
    );
    modal.hide();
  } catch (error) {
    console.error("Error saving pemesanan:", error);
    if (window.showNotification) {
      window.showNotification(pemesananId ? 'update' : 'create', 'Pemesanan', 'error', 'Gagal menyimpan data: ' + (error.message || "Unknown error"));
    } else {
      alert(
        `Error menyimpan data pemesanan: ${error.message || "Unknown error"}`,
      );
    }
  } finally {
    saveBtns.forEach((b) => {
      b.disabled = false;
      if (b.dataset.prevHtml) {
        b.innerHTML = b.dataset.prevHtml;
        delete b.dataset.prevHtml;
      }
    });
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
          const sub = w * hp;
          const subCell =
            sub > 0
              ? `Rp ${sub.toLocaleString("id-ID")}`
              : '<span class="text-muted">—</span>';
          return `<tr>
            <td>${escapeHtmlAttr(L.tipeProduk || "—")}</td>
            <td>${escapeHtmlAttr(L.jenisKopi || "—")}</td>
            <td>${escapeHtmlAttr(L.prosesPengolahan || "—")}</td>
            <td class="text-end">${w.toLocaleString("id-ID")}</td>
            <td class="text-end">${hp.toLocaleString("id-ID")}</td>
            <td class="text-end">${subCell}</td>
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
  if (pemesananIsInvoiceOnly(pemesananDoc)) {
    return null;
  }

  const linesCheck = getPemesananKloterLinesFromDoc(pemesananDoc).filter(
    (L) => !isTipeProdukInvoiceOnly(L.tipeProduk),
  );
  if (!linesCheck.length) {
    return null;
  }

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
    const pseudoSingle = {
      tipeProduk: linesCheck[0].tipeProduk,
      jenisKopi: linesCheck[0].jenisKopi,
      prosesPengolahan: linesCheck[0].prosesPengolahan,
    };
    let stokRow = findStokRowForPemesanan(pseudoSingle);
    if (!stokRow) {
      try {
        await loadStokData();
        stokRow = findStokRowForPemesanan(pseudoSingle);
      } catch (_) {
        /* noop */
      }
    }
    const stokTersedia = stokRow
      ? parseFloat(stokRow.stokTersedia ?? stokRow.totalBerat ?? 0) || 0
      : 0;
    const jumlahPesanan = parseFloat(linesCheck[0].beratKg) || 0;

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

  if (pemesananIsInvoiceOnly(pemesananDoc)) {
    wrap.style.display = "none";
    if (hint) {
      hint.textContent =
        "Tipe invoice-only (Roasted Beans / Argopuro Walida Collective): tidak perlu pilih batch — stok tidak dikurangi.";
      hint.classList.remove("d-none");
    }
    return;
  }

  const lines = getPemesananKloterLinesFromDoc(pemesananDoc).filter(
    (L) => !isTipeProdukInvoiceOnly(L.tipeProduk),
  );
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
      if (result.alreadyProcessed) {
        const msg =
          result.message ||
          (result.statusRepaired
            ? "Data ordering sudah ada; status pemesanan diselaraskan (stok tidak dikurangi lagi)."
            : "Pemesanan ini sudah pernah diproses.");
        alert(msg);
      } else if (result.invoiceOnly) {
        alert(
          result.message ||
            "Pemesanan invoice-only diselesaikan (tanpa pengurangan stok).",
        );
      } else if (
        result.stokSebelum != null &&
        result.stokSesudah != null &&
        result.jumlahDikurangi != null
      ) {
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
  let pdfViewTab = null;
  try {
    pdfViewTab = window.open("about:blank", "_blank");
  } catch (e) {
    pdfViewTab = null;
  }

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
      if (pdfViewTab && !pdfViewTab.closed) pdfViewTab.close();
      alert("Data pemesanan tidak ditemukan!");
      return;
    }

    console.log("📄 Generating Invoice PDF for:", p.idPembelian);

    // Wait for jsPDF library
    if (!window.jspdf) {
      if (pdfViewTab && !pdfViewTab.closed) pdfViewTab.close();
      alert("Library jsPDF belum dimuat. Silakan refresh halaman.");
      return;
    }

    const { jsPDF: jsPDFLib } = window.jspdf;
    const logoDataUrl = await fetchArgopuroLogoForPdf();

    /**
     * Mode "satu halaman" diaktifkan jika:
     * 1. User mencentang checkbox `invoicePdfSatuHalaman` (override manual), ATAU
     * 2. Auto-deteksi: render percobaan dengan layout normal pecah halaman /
     *    melewati batas aman A4 (297mm − 10mm safe-bottom = 287mm).
     * Tanpa auto-deteksi, invoice dengan banyak kloter, catatan panjang, atau
     * banyak baris pembayaran bertahap dapat tumpah ke halaman 2 dan tampak
     * tidak rapi meski user lupa mencentang.
     */
    const userExplicitOn = !!document.getElementById("invoicePdfSatuHalaman")
      ?.checked;
    let singlePagePdf = userExplicitOn;
    if (!userExplicitOn) {
      try {
        const dryDoc = new jsPDFLib();
        const dryOpts = { singlePage: false };
        const dryHeaderY = pdfDrawArgopuroInvoiceHeader(
          dryDoc,
          logoDataUrl,
          p,
          dryOpts,
        );
        const dryFinalY = pdfDrawInvoiceBody(dryDoc, p, dryHeaderY, dryOpts);
        const dryPages =
          typeof dryDoc.getNumberOfPages === "function"
            ? dryDoc.getNumberOfPages()
            : (dryDoc.internal?.getNumberOfPages?.() || 1);
        const pageBottomLimit = 287;
        const overflow =
          dryPages > 1 || (Number.isFinite(dryFinalY) && dryFinalY > pageBottomLimit);
        if (overflow) {
          singlePagePdf = true;
          console.log(
            `📄 Auto-singlePage aktif (dryPages=${dryPages}, finalY=${
              Number.isFinite(dryFinalY) ? dryFinalY.toFixed(1) : "?"
            }mm > ${pageBottomLimit}mm)`,
          );
        }
      } catch (autoErr) {
        console.warn(
          "Auto-deteksi singlePage gagal, fallback ke mode normal:",
          autoErr,
        );
      }
    }
    const doc = new jsPDFLib();
    const pdfPageOpts = { singlePage: singlePagePdf };
    let yCur = pdfDrawArgopuroInvoiceHeader(doc, logoDataUrl, p, pdfPageOpts);
    yCur = pdfDrawInvoiceBody(doc, p, yCur, pdfPageOpts);

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

    const resolvePdf =
      typeof window.resolveUploadedLaporanPdfUrl === "function"
        ? window.resolveUploadedLaporanPdfUrl
        : (r) => (r && (r.fullUrl || r.url)) || "";
    const pdfUrl = resolvePdf(uploadResult);
    console.log("✅ Invoice PDF uploaded:", pdfUrl);

    if (pdfUrl) {
      let openedInTab = false;
      if (pdfViewTab && !pdfViewTab.closed) {
        if (typeof window.openPdfInTabFromUrl === "function") {
          openedInTab = await window.openPdfInTabFromUrl(pdfViewTab, pdfUrl);
        }
        if (!openedInTab) {
          try {
            pdfViewTab.location.replace(pdfUrl);
            openedInTab = true;
          } catch (e) {
            console.warn("location.replace PDF failed:", e);
          }
        }
      }
      if (!openedInTab) {
        const w = window.open(pdfUrl, "_blank", "noopener,noreferrer");
        if (!w) {
          alert(
            `Popup diblokir browser. Salin URL ini lalu buka di tab baru:\n\n${pdfUrl}`,
          );
        }
      }
    } else if (pdfViewTab && !pdfViewTab.closed) {
      pdfViewTab.close();
    }

    alert(
      `Invoice PDF berhasil dibuat.${pdfUrl ? `\n\n${pdfUrl}` : ""}`,
    );
  } catch (error) {
    console.error("❌ Error generating invoice PDF:", error);
    if (pdfViewTab && !pdfViewTab.closed) pdfViewTab.close();
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

  const statusPembayaranEl = document.getElementById("statusPembayaran");
  if (statusPembayaranEl) {
    statusPembayaranEl.addEventListener("change", () => {
      syncPembayaranKloterColumnsVisibility();
      updateBertahapStatusLocks();
    });
  }

  const statusPemesananEl = document.getElementById("statusPemesanan");
  if (statusPemesananEl) {
    statusPemesananEl.addEventListener("change", updateBertahapStatusLocks);
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
  window.syncPembayaranKloterColumnsVisibility = syncPembayaranKloterColumnsVisibility;
  window.updateBertahapStatusLocks = updateBertahapStatusLocks;
  window.addPembayaranBertahapTambahanRow = addPembayaranBertahapTambahanRow;
  window.removePembayaranBertahapTambahanRow = removePembayaranBertahapTambahanRow;
  // loadKemasanOptions dihapus - kemasan tidak lagi digunakan
  window.loadPemesananDataForOrdering = loadPemesananDataForOrdering;
  window.applyFilterPembeliMaster = applyFilterPembeliMaster;
  window.openModalPembeli = openModalPembeli;
  window.savePembeliMaster = savePembeliMaster;
  window.onSelectMasterPembeliChange = onSelectMasterPembeliChange;
  window.onRegionPembeliInput = onRegionPembeliInput;

  window.addEventListener("dataMasterUpdated", async (event) => {
    const t = event?.detail?.type;
    if (t && t !== "produk") return;
    try {
      await loadMasterDataOptions();
      console.log("✅ Master tipe produk diperbarui dari Kelola Data");
    } catch (e) {
      console.warn("Gagal refresh master tipe produk:", e);
    }
  });

  console.log("✅ Kelola Pemesanan page initialized");
});
