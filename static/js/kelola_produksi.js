// Data produksi (MONGODB ONLY - NO localStorage fallback)
let produksi = [];
let currentEditId = null;
let currentDeleteId = null;

// Load data produksi dari MongoDB (API ONLY - NO fallback)
async function loadProduksiData() {
  try {
    console.log("🔄 Loading produksi data from MongoDB...");

    // Wait for window.API to be available (max 2 seconds)
    let retries = 0;
    while (!window.API && retries < 20) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      retries++;
    }

    // VERIFY API AVAILABILITY - NO FALLBACK
    if (!window.API || !window.API.Produksi) {
      const errorMsg =
        "❌ API.Produksi tidak tersedia. Backend MongoDB wajib aktif. Pastikan Flask server running dan api-service.js sudah di-load.";
      console.error(errorMsg);
      console.error("window.API:", window.API);
      alert(errorMsg);
      throw new Error(errorMsg);
    }

    console.log("✅ Using API.Produksi.getAll()");
    produksi = await window.API.Produksi.getAll();
    console.log(`✅ Loaded ${produksi.length} produksi records from MongoDB`);

    if (!Array.isArray(produksi)) {
      console.warn("⚠️ API returned non-array data, defaulting to empty array");
      produksi = [];
    }
  } catch (error) {
    console.error("❌ Error loading produksi from MongoDB:", error);
    const errorMsg = `Error memuat data produksi dari MongoDB: ${
      error.message || "Unknown error"
    }. Pastikan backend Flask aktif.`;
    alert(errorMsg);
    produksi = [];
    throw error;
  }
}

// Sisa berat per kombinasi idBahan + proses (atah legacy tanpa proses di query)
async function calculateSisaBahan(idBahan, prosesPengolahan) {
  try {
    if (!window.API || !window.API.Bahan) {
      console.warn("⚠️ API.Bahan not available, cannot calculate sisa bahan");
      return 0;
    }
    const sisaData = await window.API.Bahan.getSisa(idBahan, prosesPengolahan);
    return sisaData.sisaTersedia || 0;
  } catch (error) {
    console.error("Error calculating sisa bahan:", error);
    return 0;
  }
}

function encodeBahanProduksiOption(meta) {
  return encodeURIComponent(JSON.stringify(meta));
}

function decodeBahanProduksiOption(encoded) {
  if (!encoded || String(encoded).trim() === "") return null;
  try {
    return JSON.parse(decodeURIComponent(String(encoded)));
  } catch (e) {
    return null;
  }
}

/** Daftar id bahan dari rekaman produksi (API baru atau legacy). */
function getIdBahanListFromProduksi(p) {
  if (!p) return [];
  if (Array.isArray(p.idBahanList) && p.idBahanList.length > 0) {
    return p.idBahanList.map((x) => String(x).trim()).filter(Boolean);
  }
  if (p.idBahan) return [String(p.idBahan).trim()];
  return [];
}

/**
 * Setelah tahap Pengeringan Akhir (dan berikutnya), tambah ID bahan tidak diizinkan saat edit.
 */
function isTambahBahanTerlarangSetelahPengeringanAkhir(statusTahapan) {
  const s = (statusTahapan || "").trim();
  if (!s) return false;
  if (s.includes("Pengeringan Akhir")) return true;
  const later = [
    "Hulling",
    "Hand Sortasi",
    "Grinding",
    "Pengemasan",
    "Pengupasan Kulit Tanduk",
    "Roasting",
  ];
  return later.some((m) => s.includes(m));
}

let _produksiBahanRowsCache = [];

function clearIdBahanCheckboxUI() {
  const container = document.getElementById("idBahanCheckboxContainer");
  const ph = document.getElementById("idBahanCheckboxPlaceholder");
  if (!container) return;
  container
    .querySelectorAll(".form-check, .readonly-bahan-blok")
    .forEach((el) => el.remove());
  if (ph) {
    ph.classList.remove("d-none");
    ph.textContent = "Pilih proses pengolahan terlebih dahulu.";
  }
  const hid = document.getElementById("idBahan");
  if (hid) hid.value = "";
}

/** Setelah user memilih proses: muat bahan yang boleh dipilih (satu proses, belum terikat produksi). */
window.onProsesPengolahanProduksiChange = async function onProsesPengolahanProduksiChange() {
  const proses = document.getElementById("prosesPengolahan")?.value?.trim();
  const container = document.getElementById("idBahanCheckboxContainer");
  const ph = document.getElementById("idBahanCheckboxPlaceholder");
  if (!container) return;

  if (currentEditId) return;

  container
    .querySelectorAll(".form-check, .readonly-bahan-blok")
    .forEach((el) => el.remove());
  const hid = document.getElementById("idBahan");
  if (hid) hid.value = "";
  const beratAwalInput = document.getElementById("beratAwal");
  if (beratAwalInput && !currentEditId) {
    beratAwalInput.value = "";
  }

  if (!proses) {
    if (ph) {
      ph.classList.remove("d-none");
      ph.textContent = "Pilih proses pengolahan terlebih dahulu.";
    }
    return;
  }

  if (ph) ph.classList.add("d-none");

  if (!window.API?.Bahan?.getUntukProduksi) {
    if (ph) {
      ph.classList.remove("d-none");
      ph.textContent = "API tidak mendukung pemuatan bahan (getUntukProduksi).";
    }
    return;
  }

  try {
    const rows = await window.API.Bahan.getUntukProduksi(proses);
    _produksiBahanRowsCache = Array.isArray(rows) ? rows : [];
    if (_produksiBahanRowsCache.length === 0) {
      if (ph) {
        ph.classList.remove("d-none");
        ph.textContent =
          "Tidak ada ID Bahan tersedia untuk proses ini (sudah dipakai produksi lain atau sisa 0 kg).";
      }
      return;
    }
    _produksiBahanRowsCache.forEach((row, idx) => {
      const id = row.idBahan;
      if (!id) return;
      const sisa = Number(row.sisaTersedia) || 0;
      const cap = Number(row.alokasi) || 0;
      const wrap = document.createElement("div");
      wrap.className = "form-check mb-1";
      wrap.innerHTML = `
        <input class="form-check-input" type="checkbox" name="idBahanProduksi" id="cbBahan_${idx}"
          value="${escapeHtmlProduksi(id)}"
          data-sisa="${sisa}"
          data-id-bahan="${escapeHtmlProduksi(id)}" />
        <label class="form-check-label" for="cbBahan_${idx}">
          <strong>${escapeHtmlProduksi(id)}</strong>
          <span class="text-muted small"> — sisa ${sisa.toLocaleString("id-ID")} kg (alokasi ${cap.toLocaleString("id-ID")} kg)</span>
        </label>`;
      container.appendChild(wrap);
      const cb = wrap.querySelector('input[type="checkbox"]');
      cb.addEventListener("change", () => syncProduksiBahanDariCheckbox());
    });
  } catch (e) {
    console.error("getUntukProduksi:", e);
    if (ph) {
      ph.classList.remove("d-none");
      ph.textContent = "Gagal memuat daftar bahan: " + (e.message || "error");
    }
  }
};

async function syncProduksiBahanDariCheckbox() {
  const proses = document.getElementById("prosesPengolahan")?.value?.trim();
  const container = document.getElementById("idBahanCheckboxContainer");
  const hid = document.getElementById("idBahan");
  if (!container || currentEditId) return;

  const checked = container.querySelectorAll(
    'input[type="checkbox"][name="idBahanProduksi"]:checked',
  );
  const ids = [];
  let sum = 0;
  checked.forEach((cb) => {
    const id = (cb.dataset.idBahan || cb.value || "").trim();
    const sisa = parseFloat(cb.dataset.sisa || "0") || 0;
    if (!id) return;
    ids.push(id);
    sum += sisa;
  });

  if (hid) hid.value = ids[0] || "";

  const beratAwalInput = document.getElementById("beratAwal");
  if (beratAwalInput && !currentEditId) {
    beratAwalInput.value = sum > 0 ? String(Math.round(sum * 10000) / 10000) : "";
    beratAwalInput.readOnly = true;
    beratAwalInput.classList.add("bg-light");
    beratAwalInput.title =
      ids.length > 1
        ? `Total sisa gabungan ${ids.length} bahan pada jalur "${proses}"`
        : `Berat awal mengikuti sisa jalur proses "${proses}"`;
  }

  if (ids.length > 0 && window.API?.Bahan?.getById) {
    try {
      const bahanData = await window.API.Bahan.getById(ids[0]);
      if (bahanData) {
        const vEl = document.getElementById("varietas");
        const tEl = document.getElementById("tanggalMasuk");
        if (vEl) vEl.value = bahanData.varietas || "";
        if (tEl) tEl.value = bahanData.tanggalMasuk || "";
      }
    } catch (err) {
      console.warn("getById varietas:", err);
    }
  } else {
    const vEl = document.getElementById("varietas");
    const tEl = document.getElementById("tanggalMasuk");
    if (vEl) vEl.value = "";
    if (tEl) tEl.value = "";
  }

  if (proses) {
    await loadTahapanFromMasterProduksi(proses);
    loadVarietasOptionsProduksi();
  }
}

/** Bangun daftar centang saat edit: bahan lama terkunci + opsi tambah dari API. */
async function renderIdBahanEditMode(p) {
  const container = document.getElementById("idBahanCheckboxContainer");
  const ph = document.getElementById("idBahanCheckboxPlaceholder");
  if (!container) return;
  container
    .querySelectorAll(".form-check, .readonly-bahan-blok")
    .forEach((el) => el.remove());
  if (ph) ph.classList.add("d-none");

  const statusEff =
    (document.getElementById("statusTahapan")?.value &&
      String(document.getElementById("statusTahapan").value).trim()) ||
    p.statusTahapan ||
    "";
  const kunciTambahBahan =
    isTambahBahanTerlarangSetelahPengeringanAkhir(statusEff);

  const oldIds = getIdBahanListFromProduksi(p);
  let rows = [];
  if (Array.isArray(p.alokasiBeratBahan) && p.alokasiBeratBahan.length > 0) {
    rows = p.alokasiBeratBahan;
  } else if (oldIds.length === 1) {
    rows = [{ idBahan: oldIds[0], berat: p.beratAwal }];
  } else {
    const per = oldIds.length
      ? (parseFloat(p.beratAwal) || 0) / oldIds.length
      : 0;
    rows = oldIds.map((id) => ({ idBahan: id, berat: per }));
  }

  let idx = 0;
  rows.forEach((r) => {
    const id = String(r.idBahan || "").trim();
    const br = parseFloat(r.berat) || 0;
    if (!id) return;
    const wrap = document.createElement("div");
    wrap.className = "form-check mb-1";
    const cid = `cbBahanEditLocked_${idx++}`;
    wrap.innerHTML = `
      <input class="form-check-input" type="checkbox" name="idBahanProduksi" id="${cid}"
        checked disabled data-bahan-locked="1"
        data-id-bahan="${escapeHtmlProduksi(id)}"
        data-berat-alokasi="${br}" />
      <label class="form-check-label text-muted" for="${cid}">
        <strong>${escapeHtmlProduksi(id)}</strong>
        <span class="small"> — alokasi tercatat ${br.toLocaleString("id-ID")} kg (tidak dapat dihapus)</span>
      </label>`;
    container.appendChild(wrap);
  });

  if (kunciTambahBahan) {
    const info = document.createElement("div");
    info.className =
      "alert alert-secondary border py-2 small mb-0 mt-2 readonly-bahan-blok";
    info.setAttribute("role", "status");
    info.innerHTML =
      '<i class="bi bi-lock-fill me-1"></i> Penambahan ID bahan <strong>dikunci</strong> mulai tahap <strong>Pengeringan Akhir</strong> (dan tahap setelahnya).';
    container.appendChild(info);
  }

  if (
    !kunciTambahBahan &&
    window.API?.Bahan?.getUntukProduksi &&
    p.prosesPengolahan &&
    p.idProduksi
  ) {
    try {
      const extra = await window.API.Bahan.getUntukProduksi(
        p.prosesPengolahan,
        p.idProduksi,
      );
      const list = Array.isArray(extra) ? extra : [];
      list.forEach((row) => {
        const id = row.idBahan;
        if (!id || oldIds.includes(id)) return;
        const sisa = Number(row.sisaTersedia) || 0;
        const cap = Number(row.alokasi) || 0;
        if (sisa <= 0) return;
        const wrap = document.createElement("div");
        wrap.className = "form-check mb-1";
        const cid = `cbBahanEditNew_${idx++}`;
        wrap.innerHTML = `
          <input class="form-check-input" type="checkbox" name="idBahanProduksi" id="${cid}"
            value="${escapeHtmlProduksi(id)}"
            data-sisa="${sisa}"
            data-id-bahan="${escapeHtmlProduksi(id)}" />
          <label class="form-check-label" for="${cid}">
            <strong>${escapeHtmlProduksi(id)}</strong>
            <span class="text-muted small"> — sisa ${sisa.toLocaleString("id-ID")} kg (alokasi ${cap.toLocaleString("id-ID")} kg) · tambahan</span>
          </label>`;
        container.appendChild(wrap);
        wrap.querySelector('input[type="checkbox"]')?.addEventListener("change", () =>
          syncProduksiBahanEditCheckbox(),
        );
      });
    } catch (e) {
      console.error("getUntukProduksi (edit):", e);
    }
  }

  const hid = document.getElementById("idBahan");
  if (hid) hid.value = oldIds[0] || "";
  syncProduksiBahanEditCheckbox();
}

/** Total berat awal = jumlah alokasi bahan terkunci + sisa bahan tambahan yang dicentang. */
function syncProduksiBahanEditCheckbox() {
  const container = document.getElementById("idBahanCheckboxContainer");
  const beratAwalInput = document.getElementById("beratAwal");
  if (!container || !beratAwalInput || !currentEditId) return;

  let sum = 0;
  container.querySelectorAll('input[data-bahan-locked="1"]').forEach((cb) => {
    sum += parseFloat(cb.dataset.beratAlokasi || "0") || 0;
  });
  container
    .querySelectorAll(
      'input[name="idBahanProduksi"]:not([data-bahan-locked]):checked',
    )
    .forEach((cb) => {
      sum += parseFloat(cb.dataset.sisa || "0") || 0;
    });

  const rounded = Math.round(sum * 10000) / 10000;
  beratAwalInput.value = sum > 0 ? String(rounded) : "";
  beratAwalInput.readOnly = true;
  beratAwalInput.classList.add("bg-light");
  const st =
    document.getElementById("statusTahapan")?.value ||
    window._produksiEditSnapshot?.statusTahapan ||
    "";
  if (isTambahBahanTerlarangSetelahPengeringanAkhir(st)) {
    beratAwalInput.title =
      "Total alokasi bahan tercatat. Penambahan bahan dikunci mulai tahap Pengeringan Akhir.";
  } else {
    beratAwalInput.title =
      "Jumlah total alokasi semua ID bahan (bertambah otomatis jika menambah centang).";
  }
}

// ========== Berat terkini: total vs per kloter (maks. 100) ==========
const MAX_KLOTER_BERAT_TERKINI = 100;

/** Salinan detail kloter dari server saat edit (untuk isi baris baru saat ubah jumlah kloter). */
let _beratTerkiniKloterServerSnapshot = null;

function parseBeratProduksiLocal(raw) {
  if (raw == null || raw === "") return 0;
  const s = String(raw).trim().replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function formatBeratProduksiInput(v) {
  if (v == null || v === "") return "";
  return String(v).trim().replace(/\s/g, "").replace(",", ".");
}

function initJumlahKloterBeratTerkiniSelect() {
  const sel = document.getElementById("jumlahKloterBeratTerkini");
  if (!sel) return;
  if (sel.options && sel.options.length > 2) return;
  const keep = sel.value;
  sel.innerHTML = '<option value="">Pilih jumlah kloter</option>';
  for (let i = 1; i <= MAX_KLOTER_BERAT_TERKINI; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${i} kloter`;
    sel.appendChild(opt);
  }
  if (keep && sel.querySelector(`option[value="${keep}"]`)) sel.value = keep;
}

function getBeratTerkiniKloterRowsFromDom() {
  const tbody = document.getElementById("tbodyBeratTerkiniKloter");
  if (!tbody) return [];
  const rows = [];
  tbody.querySelectorAll("tr").forEach((row) => {
    const berat = row.querySelector(".berat-terkini-kloter-input")?.value ?? "";
    const keterangan = row.querySelector(".keterangan-terkini-kloter")?.value ?? "";
    rows.push({ berat, keterangan });
  });
  return rows;
}

function buildMergedBeratTerkiniKloterRows(newNum) {
  const previous = getBeratTerkiniKloterRowsFromDom();
  const server = _beratTerkiniKloterServerSnapshot || [];
  const out = [];
  for (let i = 0; i < newNum; i++) {
    if (i < previous.length) {
      out.push({
        berat: previous[i].berat,
        keterangan: previous[i].keterangan || "",
      });
    } else {
      const ini = server[i];
      out.push({
        berat: ini != null ? formatBeratProduksiInput(ini.berat) : "",
        keterangan: ini?.keterangan != null ? String(ini.keterangan) : "",
      });
    }
  }
  return out;
}

function renderBeratTerkiniKloterRows(n, prefilled) {
  const tbody = document.getElementById("tbodyBeratTerkiniKloter");
  if (!tbody) return;
  const num = Math.max(0, Math.min(MAX_KLOTER_BERAT_TERKINI, parseInt(n, 10) || 0));
  let rowsData = [];
  if (prefilled && Array.isArray(prefilled) && prefilled.length) {
    rowsData = prefilled.slice(0, num).map((k) => ({
      berat: formatBeratProduksiInput(k.berat),
      keterangan: k.keterangan != null ? String(k.keterangan) : "",
    }));
    while (rowsData.length < num) rowsData.push({ berat: "", keterangan: "" });
  } else {
    rowsData = buildMergedBeratTerkiniKloterRows(num);
  }
  tbody.innerHTML = "";
  for (let idx = 0; idx < num; idx++) {
    const i = idx + 1;
    const saved = rowsData[idx] || { berat: "", keterangan: "" };
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="text-center">${i}</td>
      <td><span class="badge bg-secondary">Kloter ${i}</span></td>
      <td>
        <input type="text" class="form-control berat-terkini-kloter-input" data-i="${i}"
          placeholder="0" inputmode="decimal" autocomplete="off" />
      </td>
      <td>
        <input type="text" class="form-control keterangan-terkini-kloter" placeholder="Opsional" autocomplete="off" />
      </td>`;
    tbody.appendChild(tr);
    const be = tr.querySelector(".berat-terkini-kloter-input");
    const ke = tr.querySelector(".keterangan-terkini-kloter");
    if (be) be.value = saved.berat != null && saved.berat !== "" ? String(saved.berat) : "";
    if (ke) ke.value = saved.keterangan || "";
  }
  tbody.querySelectorAll(".berat-terkini-kloter-input").forEach((el) => {
    el.addEventListener("input", syncBeratTerkiniFromKloter);
    el.addEventListener("change", syncBeratTerkiniFromKloter);
  });
  tbody.querySelectorAll(".keterangan-terkini-kloter").forEach((el) => {
    el.addEventListener("input", syncBeratTerkiniFromKloter);
  });
  syncBeratTerkiniFromKloter();
}

function syncBeratTerkiniFromKloter() {
  const tbody = document.getElementById("tbodyBeratTerkiniKloter");
  const beratInput = document.getElementById("beratTerkini");
  const sumEl = document.getElementById("beratTerkiniKloterSumDisplay");
  if (!tbody || !beratInput) return;
  let sum = 0;
  tbody.querySelectorAll(".berat-terkini-kloter-input").forEach((el) => {
    sum += parseBeratProduksiLocal(el.value);
  });
  if (sum > 0) {
    const rounded = Math.round(sum * 10000) / 10000;
    beratInput.value = String(rounded);
  } else {
    beratInput.value = "";
  }
  if (sumEl) {
    sumEl.textContent = `${sum.toLocaleString("id-ID", { maximumFractionDigits: 4 })} kg`;
  }
}

window.toggleMetodeBeratTerkiniUI = function toggleMetodeBeratTerkiniUI() {
  const metode = document.getElementById("metodeBeratTerkini")?.value || "total";
  const wrapTotal = document.getElementById("wrapBeratTerkiniTotal");
  const wrapKloter = document.getElementById("wrapBeratTerkiniKloter");
  const beratInput = document.getElementById("beratTerkini");
  const pengemasan = isStatusPengemasanSelected();

  if (pengemasan) return;

  if (metode === "kloter") {
    wrapTotal?.classList.add("d-none");
    wrapKloter?.classList.remove("d-none");
    if (beratInput) {
      beratInput.readOnly = true;
      beratInput.classList.add("bg-light");
      beratInput.required = true;
    }
    const tbody = document.getElementById("tbodyBeratTerkiniKloter");
    const hasRows = tbody && tbody.querySelectorAll("tr").length > 0;
    initJumlahKloterBeratTerkiniSelect();
    const jSel = document.getElementById("jumlahKloterBeratTerkini");
    if (hasRows && jSel?.value) {
      syncBeratTerkiniFromKloter();
      return;
    }
    if (jSel && !jSel.value) {
      jSel.value = "1";
      renderBeratTerkiniKloterRows(1, null);
    } else if (jSel?.value) {
      renderBeratTerkiniKloterRows(parseInt(jSel.value, 10), null);
    }
    syncBeratTerkiniFromKloter();
  } else {
    wrapKloter?.classList.add("d-none");
    wrapTotal?.classList.remove("d-none");
    if (beratInput) {
      beratInput.readOnly = false;
      beratInput.classList.remove("bg-light");
      beratInput.required = true;
    }
  }
};

window.onJumlahKloterBeratTerkiniChange = function onJumlahKloterBeratTerkiniChange() {
  const jSel = document.getElementById("jumlahKloterBeratTerkini");
  const v = jSel?.value;
  if (!v) {
    const tbody = document.getElementById("tbodyBeratTerkiniKloter");
    if (tbody) tbody.innerHTML = "";
    syncBeratTerkiniFromKloter();
    return;
  }
  const n = Math.min(MAX_KLOTER_BERAT_TERKINI, Math.max(1, parseInt(v, 10) || 1));
  renderBeratTerkiniKloterRows(n, null);
};

function isStatusPengemasanSelected() {
  const st = document.getElementById("statusTahapan")?.value || "";
  return st === "Pengemasan" || (st && st.includes("Pengemasan"));
}

function resetBeratTerkiniMetodeForAdd() {
  _beratTerkiniKloterServerSnapshot = null;
  const m = document.getElementById("metodeBeratTerkini");
  if (m) m.value = "total";
  const jSel = document.getElementById("jumlahKloterBeratTerkini");
  if (jSel) jSel.value = "";
  const tbody = document.getElementById("tbodyBeratTerkiniKloter");
  if (tbody) tbody.innerHTML = "";
  document.getElementById("wrapBeratTerkiniKloter")?.classList.add("d-none");
  document.getElementById("wrapBeratTerkiniTotal")?.classList.remove("d-none");
  const sumEl = document.getElementById("beratTerkiniKloterSumDisplay");
  if (sumEl) sumEl.textContent = "0 kg";
}

function getBeratTerkiniDetailKloterPayload() {
  const metode = document.getElementById("metodeBeratTerkini")?.value;
  if (metode !== "kloter") return null;
  const tbody = document.getElementById("tbodyBeratTerkiniKloter");
  if (!tbody) return null;
  const out = [];
  tbody.querySelectorAll("tr").forEach((row, idx) => {
    const berat = parseBeratProduksiLocal(row.querySelector(".berat-terkini-kloter-input")?.value);
    const keterangan = row.querySelector(".keterangan-terkini-kloter")?.value?.trim() || "";
    if (berat > 0) out.push({ kloter: idx + 1, berat, keterangan });
  });
  return out.length ? out : null;
}

// Reset / siapkan area pilih bahan (checkbox — pilih proses dulu)
async function loadBahanOptionsProduksi() {
  try {
    if (!document.getElementById("idBahanCheckboxContainer")) {
      return;
    }
    if (currentEditId) {
      return;
    }
    clearIdBahanCheckboxUI();
    const ps = document.getElementById("prosesPengolahan");
    if (ps && ps.value) {
      await onProsesPengolahanProduksiChange();
    }
  } catch (error) {
    console.error("❌ Error loadBahanOptionsProduksi:", error);
  }
}

// Alias kompatibilitas — pemilihan bahan kini lewat checkbox + proses
async function loadBahanDataProduksi() {
  await syncProduksiBahanDariCheckbox();
}

// Konstanta tahapan produksi yang tersedia
// CATATAN: Tahapan sekarang diambil dari Master Data, bukan hardcode
// Konstanta ini hanya untuk referensi/fallback jika diperlukan
const ALL_TAHAPAN = {
  Sortasi: "Sortasi Cherry atau Buah Kopi",
  Fermentasi: "Fermentasi",
  Pulping: "Pulping",
  Pencucian: "Pencucian",
  "Pengeringan Awal": "Pengeringan Awal",
  "Pengeringan Akhir": "Pengeringan Akhir",
  Hulling: "Pengupasan Kulit Tanduk (Hulling)",
  "Hand Sortasi": "Hand Sortasi atau Sortasi Biji Kopi",
  Grinding: "Grinding",
  Pengemasan: "Pengemasan (Tahapan Akhir)",
};

// Load data master dari Kelola Data (MONGODB ONLY)
// Load opsi Tipe Produk dari Master Data (Kelola Data Master - dataProduk)
async function loadTipeProdukOptionsProduksi() {
  const select = document.getElementById("tipeProdukProduksi");
  if (!select) return;
  try {
    let dataProduk = [];
    if (window.API && window.API.MasterData && window.API.MasterData.produk) {
      dataProduk = await window.API.MasterData.produk.getAll();
    } else {
      try {
        const response = await fetch("/api/dataProduk");
        if (response.ok) dataProduk = await response.json();
      } catch (e) {
        console.warn("Fetch dataProduk failed:", e);
      }
    }
    const selected = select.value;
    select.innerHTML = '<option value="">Pilih Tipe Produk</option>';
    if (!Array.isArray(dataProduk) || dataProduk.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Tidak ada data. Tambah di Kelola Data Master → Tipe Produk.";
      opt.disabled = true;
      select.appendChild(opt);
      return;
    }
    dataProduk.forEach((item) => {
      const nama = (item.nama || "").trim();
      if (!nama) return;
      const option = document.createElement("option");
      option.value = nama;
      option.textContent = nama;
      select.appendChild(option);
    });
    if (selected) select.value = selected;
  } catch (err) {
    console.error("Error loadTipeProdukOptionsProduksi:", err);
  }
}

async function loadProsesPengolahanOptions() {
  console.log("🔵 loadProsesPengolahanOptions() dipanggil");

  try {
    let dataProses = [];
    if (
      !window.API ||
      !window.API.MasterData ||
      !window.API.MasterData.proses
    ) {
      console.warn(
        "⚠️ API.MasterData.proses not available, trying direct fetch",
      );
      try {
        const response = await fetch("/api/dataProses");
        if (response.ok) {
          dataProses = await response.json();
          console.log("✅ Data proses dari fetch:", dataProses.length);
        } else {
          console.warn("⚠️ Response tidak OK:", response.status);
          return;
        }
      } catch (fetchError) {
        console.error("❌ Error fetching dataProses:", fetchError);
        return;
      }
    } else {
      dataProses = await window.API.MasterData.proses.getAll();
      console.log("✅ Data proses dari API:", dataProses.length);
    }

    console.log(
      "📋 Data proses:",
      dataProses.map((p) => ({ nama: p.nama, tahapanStatus: p.tahapanStatus })),
    );

    const select = document.getElementById("prosesPengolahan");
    if (!select) {
      console.error("❌ Element prosesPengolahan tidak ditemukan");
      return;
    }

    const selectedValue = select.value;
    select.innerHTML = '<option value="">Pilih Proses Pengolahan</option>';

    if (dataProses.length === 0) {
      console.warn("⚠️ Tidak ada data master proses ditemukan");
      const option = document.createElement("option");
      option.value = "";
      option.textContent =
        "Tidak ada data master. Silakan tambah di halaman Kelola Data Master.";
      option.disabled = true;
      select.appendChild(option);
      return;
    }

    dataProses.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.nama;
      option.textContent = item.nama;
      // Simpan data master termasuk tahapanStatus
      option.dataset.master = JSON.stringify({
        nama: item.nama,
        tahapanStatus: item.tahapanStatus || {},
      });
      select.appendChild(option);
      console.log(
        `➕ Menambahkan option: ${item.nama}`,
        item.tahapanStatus || {},
      );
    });

    if (selectedValue) {
      select.value = selectedValue;
      console.log("✅ Mengembalikan nilai yang dipilih:", selectedValue);
      // Trigger load tahapan jika sudah ada nilai
      await loadTahapanFromMasterProduksi();
    }

    console.log("✅ loadProsesPengolahanOptions() selesai");
  } catch (error) {
    console.error("❌ Error loading proses pengolahan options:", error);
  }
}

// Load tahapan dari master saat memilih proses pengolahan
let currentMasterTahapanProduksi = null;
let currentProduksiTahapanAktif = null;

async function loadTahapanFromMasterProduksi(overrideProsesNama) {
  console.log("🔵 loadTahapanFromMasterProduksi() dipanggil");

  const prosesSelect = document.getElementById("prosesPengolahan");
  const statusSelect = document.getElementById("statusTahapan");
  const statusInfo = document.getElementById("statusTahapanInfo");
  const statusError = document.getElementById("statusTahapanError");

  if (!prosesSelect || !statusSelect) {
    console.error("❌ Element prosesSelect atau statusSelect tidak ditemukan");
    return;
  }

  let selectedValue =
    overrideProsesNama != null && String(overrideProsesNama).trim() !== ""
      ? String(overrideProsesNama).trim()
      : null;
  if (!selectedValue) {
    const selectedOption = prosesSelect.options[prosesSelect.selectedIndex];
    selectedValue = selectedOption ? selectedOption.value : null;
  } else if (prosesSelect) {
    prosesSelect.value = selectedValue;
  }

  const selectedOption = selectedValue
    ? Array.from(prosesSelect.options).find((o) => o.value === selectedValue)
    : null;

  console.log("📋 Proses yang dipilih:", selectedValue);

  if (!selectedValue) {
    // Reset jika tidak ada yang dipilih
    statusSelect.innerHTML = '<option value="">Pilih Status Tahapan</option>';
    if (statusInfo) {
      statusInfo.innerHTML =
        '<i class="bi bi-info-circle"></i> Pilih proses pengolahan terlebih dahulu untuk melihat tahapan yang tersedia.';
    }
    if (statusError) {
      statusError.classList.add("d-none");
    }
    currentMasterTahapanProduksi = null;
    return;
  }

  // Ambil data master dari dataset option atau fetch dari API
  let masterData = null;
  try {
    const masterDataStr = selectedOption.dataset.master;
    console.log("📦 Data master dari dataset:", masterDataStr);

    if (masterDataStr) {
      masterData = JSON.parse(masterDataStr);
      console.log("✅ Data master dari dataset:", masterData);
    }
  } catch (e) {
    console.warn("⚠️ Gagal parse dataset.master:", e);
  }

  // Jika tidak ada di dataset, fetch dari API
  if (!masterData || !masterData.tahapanStatus) {
    console.log("🔄 Fetching dari API...");
    try {
      if (window.API && window.API.MasterData && window.API.MasterData.proses) {
        console.log("✅ Menggunakan window.API.MasterData.proses");
        const allProses = await window.API.MasterData.proses.getAll();
        console.log("📊 Total proses dari API:", allProses.length);
        console.log(
          "📋 Semua proses:",
          allProses.map((p) => p.nama),
        );

        const prosesData = allProses.find((p) => p.nama === selectedValue);
        console.log("🔍 Mencari proses:", selectedValue);
        console.log("📦 Data proses ditemukan:", prosesData);

        if (prosesData) {
          masterData = { tahapanStatus: prosesData.tahapanStatus || {} };
          console.log("✅ Tahapan status:", masterData.tahapanStatus);
        } else {
          console.warn(
            "⚠️ Proses tidak ditemukan di API. Mencoba dengan nama yang berbeda...",
          );
          // Coba dengan nama yang lebih fleksibel (case insensitive, partial match)
          const prosesDataFlexible = allProses.find(
            (p) =>
              p.nama.toLowerCase().includes(selectedValue.toLowerCase()) ||
              selectedValue.toLowerCase().includes(p.nama.toLowerCase()),
          );
          if (prosesDataFlexible) {
            console.log(
              "✅ Proses ditemukan dengan matching fleksibel:",
              prosesDataFlexible.nama,
            );
            masterData = {
              tahapanStatus: prosesDataFlexible.tahapanStatus || {},
            };
          }
        }
      } else {
        console.log("🔄 Menggunakan fetch langsung ke /api/dataProses");
        const response = await fetch(`/api/dataProses`);
        if (response.ok) {
          const allProses = await response.json();
          console.log("📊 Total proses dari fetch:", allProses.length);
          console.log(
            "📋 Semua proses:",
            allProses.map((p) => p.nama),
          );

          const prosesData = allProses.find((p) => p.nama === selectedValue);
          console.log("🔍 Mencari proses:", selectedValue);
          console.log("📦 Data proses ditemukan:", prosesData);

          if (prosesData) {
            masterData = { tahapanStatus: prosesData.tahapanStatus || {} };
            console.log("✅ Tahapan status:", masterData.tahapanStatus);
          } else {
            // Coba dengan matching fleksibel
            const prosesDataFlexible = allProses.find(
              (p) =>
                p.nama.toLowerCase().includes(selectedValue.toLowerCase()) ||
                selectedValue.toLowerCase().includes(p.nama.toLowerCase()),
            );
            if (prosesDataFlexible) {
              console.log(
                "✅ Proses ditemukan dengan matching fleksibel:",
                prosesDataFlexible.nama,
              );
              masterData = {
                tahapanStatus: prosesDataFlexible.tahapanStatus || {},
              };
            }
          }
        } else {
          console.error(
            "❌ Response tidak OK:",
            response.status,
            response.statusText,
          );
        }
      }
    } catch (error) {
      console.error("❌ Error fetching tahapan from API:", error);
    }
  }

  if (!masterData || !masterData.tahapanStatus) {
    console.warn("⚠️ Data master tidak ditemukan atau tahapanStatus kosong");
    statusSelect.innerHTML = '<option value="">Pilih Status Tahapan</option>';
    if (statusInfo) {
      statusInfo.innerHTML =
        '<i class="bi bi-exclamation-triangle text-warning"></i> Data master tidak ditemukan atau belum dikonfigurasi. Silakan konfigurasi tahapan di halaman Kelola Data Master.';
    }
    if (statusError) {
      statusError.classList.add("d-none");
    }
    return;
  }

  // Cek apakah tahapanStatus kosong atau tidak ada tahapan yang aktif
  const tahapanAktif = Object.entries(masterData.tahapanStatus).filter(
    ([key, value]) => value === true,
  );
  console.log("📊 Tahapan aktif:", tahapanAktif.length);

  if (tahapanAktif.length === 0) {
    console.warn("⚠️ Tidak ada tahapan yang aktif di konfigurasi master");
    statusSelect.innerHTML = '<option value="">Pilih Status Tahapan</option>';
    if (statusInfo) {
      statusInfo.innerHTML =
        '<i class="bi bi-exclamation-triangle text-warning"></i> Proses pengolahan ini belum memiliki tahapan yang dikonfigurasi. Silakan edit di halaman Kelola Data Master dan pilih tahapan yang diperlukan.';
    }
    if (statusError) {
      statusError.classList.add("d-none");
    }
    return;
  }

  // Simpan master tahapan
  currentMasterTahapanProduksi = masterData.tahapanStatus;

  // Get tahapan yang tersedia dari master
  const availableTahapan = [];
  const tahapanMap = {
    Sortasi: "Sortasi Cherry atau Buah Kopi",
    Fermentasi: "Fermentasi",
    Pulping: "Pulping",
    Pencucian: "Pencucian",
    "Pengeringan Awal": "Pengeringan Awal",
    "Pengeringan Akhir": "Pengeringan Akhir",
    Hulling: "Pengupasan Kulit Tanduk (Hulling)",
    "Hand Sortasi": "Hand Sortasi atau Sortasi Biji Kopi",
    Grinding: "Grinding",
    Pengemasan: "Pengemasan (Tahapan Akhir)",
  };
  // Urutan baku: Sortasi → Fermentasi → Pulping → Pencucian → … → Hand Sortasi → Grinding → Pengemasan
  const urutanTahapan = [
    "Sortasi",
    "Fermentasi",
    "Pulping",
    "Pencucian",
    "Pengeringan Awal",
    "Pengeringan Akhir",
    "Hulling",
    "Hand Sortasi",
    "Grinding",
    "Pengemasan",
  ];

  console.log("🔄 Memproses tahapan dari master:", masterData.tahapanStatus);

  for (const [tahapan, status] of Object.entries(masterData.tahapanStatus)) {
    if (status === true) {
      // Skip Pengemasan di loop ini, akan ditambahkan setelahnya
      if (tahapan === "Pengemasan") {
        continue;
      }
      const mappedValue = tahapanMap[tahapan] || tahapan;
      const mappedLabel = tahapanMap[tahapan] || tahapan;
      availableTahapan.push({
        value: mappedValue,
        label: mappedLabel,
        key: tahapan,
      });
      console.log(`✅ Menambahkan tahapan: ${tahapan} -> ${mappedLabel}`);
    }
  }

  // Tambahkan Pengemasan selalu di akhir (selalu tersedia sebagai tahap akhir)
  // Hapus Pengemasan jika sudah ada (dari master data), lalu tambahkan lagi dengan label yang benar
  const pengemasanIndex = availableTahapan.findIndex(
    (t) => t.key === "Pengemasan" || t.value === "Pengemasan"
  );
  if (pengemasanIndex !== -1) {
    availableTahapan.splice(pengemasanIndex, 1);
    console.log("🔄 Menghapus Pengemasan dari master untuk menambahkan ulang dengan label yang benar");
  }
  
  // Selalu tambahkan Pengemasan di akhir
  availableTahapan.push({
    value: "Pengemasan",
    label: "Pengemasan (Tahapan Akhir)",
    key: "Pengemasan",
  });
  console.log("✅ Menambahkan Pengemasan (tahap akhir)");

  // Urutkan sesuai urutan tahapan baku
  availableTahapan.sort((a, b) => {
    const idxA =
      urutanTahapan.indexOf(a.key) === -1 ? 999 : urutanTahapan.indexOf(a.key);
    const idxB =
      urutanTahapan.indexOf(b.key) === -1 ? 999 : urutanTahapan.indexOf(b.key);
    return idxA - idxB;
  });

  console.log("📋 Total tahapan tersedia:", availableTahapan.length);

  // Update dropdown
  const previousSelectedValue = statusSelect.value;
  statusSelect.innerHTML = '<option value="">Pilih Status Tahapan</option>';

  // Tentukan mode: add atau edit
  const isAddMode = !currentEditId;
  
  if (isAddMode) {
    // ADD MODE: Tampilkan semua tahapan, tapi hanya tahapan PERTAMA yang bisa dipilih
    const tahapanPertama = availableTahapan.length > 0 ? availableTahapan[0] : null;
    
    // Tampilkan semua tahapan yang tersedia
    availableTahapan.forEach((tahapan, index) => {
      const option = document.createElement("option");
      option.value = tahapan.value;
      option.textContent = tahapan.label;
      // Auto-select tahapan pertama
      if (index === 0 && tahapanPertama) {
        option.selected = true;
      } else {
        // Disable semua tahapan selain yang pertama untuk ADD MODE
        option.disabled = true;
        option.textContent += " (Tidak tersedia untuk produksi baru)";
      }
      statusSelect.appendChild(option);
      console.log(`➕ [ADD MODE] Menambahkan option: ${tahapan.value} - ${tahapan.label}${index === 0 ? ' (SELECTED - tahapan pertama)' : ' (DISABLED)'}`);
    });
    
    if (tahapanPertama) {
      // Lock dropdown untuk ADD MODE (hanya tahapan pertama yang bisa dipilih)
      statusSelect.disabled = false; // Tetap enabled tapi option lain disabled
      
      // Trigger toggle functions untuk tahapan pertama
      if (window.toggleBeratAkhirField) toggleBeratAkhirField();
      if (window.toggleKadarAirField) toggleKadarAirField();
      
      // Update info untuk menjelaskan bahwa hanya tahapan pertama yang bisa dipilih
      if (statusInfo) {
        statusInfo.innerHTML = `<i class="bi bi-info-circle text-info"></i> Untuk produksi baru, Anda harus memulai dari tahapan pertama: <strong>${tahapanPertama.label}</strong>. Tahapan lainnya akan tersedia setelah Anda menyelesaikan tahapan sebelumnya.`;
      }
    } else {
      console.warn("⚠️ Tidak ada tahapan tersedia untuk proses ini");
    }
  } else {
    // EDIT MODE: Tampilkan semua tahapan yang aktif, tapi disable yang tidak valid
    const tahapanLama = currentProduksiTahapanAktif || "";
    
    // Mapping untuk normalisasi
    const tahapanMap = {
      "Sortasi Cherry atau Buah Kopi": "Sortasi",
      "Sortasi Buah": "Sortasi",  // Kompatibilitas nama lama
      "Fermentasi": "Fermentasi",
      "Pulping": "Pulping",
      "Pencucian": "Pencucian",
      "Pengeringan Awal": "Pengeringan Awal",
      "Pengeringan Akhir": "Pengeringan Akhir",
      "Pengupasan Kulit Tanduk (Hulling)": "Hulling",
      "Hand Sortasi atau Sortasi Biji Kopi": "Hand Sortasi",
      "Roasting": "Roasting",
      "Grinding": "Grinding",
      "Pengemasan": "Pengemasan",
    };
    
    const urutanTahapan = [
      "Sortasi",
      "Fermentasi",
      "Pulping",
      "Pencucian",
      "Pengeringan Awal",
      "Pengeringan Akhir",
      "Hulling",
      "Hand Sortasi",
      "Grinding",
      "Pengemasan",
    ];
    
    const tahapanLamaNormalized = tahapanMap[tahapanLama] || tahapanLama;
    const indexLama = urutanTahapan.indexOf(tahapanLamaNormalized);
    
    availableTahapan.forEach((tahapan) => {
      const option = document.createElement("option");
      option.value = tahapan.value;
      option.textContent = tahapan.label;
      
      // Normalisasi tahapan untuk validasi
      const tahapanNormalized = tahapanMap[tahapan.key] || tahapan.key;
      const indexBaru = urutanTahapan.indexOf(tahapanNormalized);
      
      // Disable tahapan yang tidak valid:
      // 1. Tahapan yang sama dengan tahapan lama
      // 2. Tahapan yang sebelum tahapan lama (mundur)
      // 3. Tahapan yang loncat (tidak berurutan)
      if (indexLama !== -1 && indexBaru !== -1) {
        if (indexBaru <= indexLama) {
          // Mundur atau sama
          option.disabled = true;
          option.textContent += " (Tidak dapat mundur)";
        } else if (indexBaru - indexLama > 1) {
          // Cek apakah ada tahapan terlewat yang aktif di master
          const tahapanTerlewat = urutanTahapan.slice(indexLama + 1, indexBaru);
          const adaTahapanTerlewatAktif = tahapanTerlewat.some((t) => {
            if (t === "Pengemasan") return true;
            return currentMasterTahapanProduksi && currentMasterTahapanProduksi[t];
          });
          
          if (adaTahapanTerlewatAktif) {
            // Ada tahapan terlewat yang aktif
            option.disabled = true;
            const tahapanTerlewatLabels = tahapanTerlewat
              .filter((t) => {
                if (t === "Pengemasan") return true;
                return currentMasterTahapanProduksi && currentMasterTahapanProduksi[t];
              })
              .map((t) => {
                const map = {
                  Sortasi: "Sortasi",
                  Fermentasi: "Fermentasi",
                  Pulping: "Pulping",
                  Pencucian: "Pencucian",
                  "Pengeringan Awal": "Pengeringan Awal",
                  "Pengeringan Akhir": "Pengeringan Akhir",
                  Hulling: "Hulling",
                  "Hand Sortasi": "Hand Sortasi",
                  Grinding: "Grinding",
                  Pengemasan: "Pengemasan",
                };
                return map[t] || t;
              });
            option.textContent += ` (Loncat: ${tahapanTerlewatLabels.join(", ")})`;
          }
        }
      }
      
      statusSelect.appendChild(option);
      console.log(`➕ [EDIT MODE] Menambahkan option: ${tahapan.value} - ${tahapan.label}${option.disabled ? ' (DISABLED)' : ''}`);
    });
    
    // Pastikan dropdown enabled untuk EDIT MODE
    statusSelect.disabled = false;
  }

  // Kembalikan nilai yang dipilih jika ada (hanya untuk edit mode)
  if (!isAddMode && previousSelectedValue && availableTahapan.some((t) => t.value === previousSelectedValue)) {
    statusSelect.value = previousSelectedValue;
    console.log("✅ [EDIT MODE] Mengembalikan nilai yang dipilih:", previousSelectedValue);
    
    // Trigger toggle functions untuk nilai yang dipilih
    if (window.toggleBeratAkhirField) toggleBeratAkhirField();
    if (window.toggleKadarAirField) toggleKadarAirField();
  }

  // Update info (hanya jika belum di-set di ADD MODE)
  if (statusInfo && (!isAddMode || !statusInfo.innerHTML.includes("produksi baru"))) {
    const tahapanCount = availableTahapan.filter(
      (t) => t.key !== "Pengemasan",
    ).length;
    statusInfo.innerHTML = `<i class="bi bi-check-circle text-success"></i> Tahapan tersedia: ${tahapanCount} tahapan dari master + Pengemasan`;
  }
  if (statusError) {
    statusError.classList.add("d-none");
  }
  
  // Tambahkan event listener untuk mencegah perubahan ke tahapan yang disabled
  // Simpan reference ke variabel yang diperlukan untuk digunakan di event listener
  const availableTahapanForListener = [...availableTahapan]; // Copy array
  const isAddModeForListener = isAddMode;
  
  // Buat wrapper function untuk event listener
  const handleStatusChange = function(e) {
    const selectedOption = this.options[this.selectedIndex];
    
    // Cek jika option yang dipilih disabled
    if (selectedOption && selectedOption.disabled) {
      e.preventDefault();
      e.stopPropagation();
      
      // Kembalikan ke nilai sebelumnya atau tahapan pertama untuk ADD MODE
      if (isAddModeForListener && availableTahapanForListener.length > 0) {
        this.value = availableTahapanForListener[0].value;
        alert("⚠️ Untuk produksi baru, Anda harus memulai dari tahapan pertama: " + availableTahapanForListener[0].label);
      } else if (!isAddModeForListener && currentProduksiTahapanAktif) {
        // Kembalikan ke tahapan lama untuk EDIT MODE
        const tahapanLamaOption = Array.from(this.options).find(
          opt => !opt.disabled && opt.value && (
            opt.value === currentProduksiTahapanAktif || 
            opt.value.includes(currentProduksiTahapanAktif) ||
            currentProduksiTahapanAktif.includes(opt.value)
          )
        );
        if (tahapanLamaOption) {
          this.value = tahapanLamaOption.value;
        } else {
          // Jika tidak ditemukan, reset ke option pertama yang tidak disabled
          const firstEnabled = Array.from(this.options).find(opt => !opt.disabled && opt.value);
          if (firstEnabled) {
            this.value = firstEnabled.value;
          }
        }
        alert("⚠️ Tidak dapat meloncat tahapan. Pilih tahapan berikutnya secara berurutan.");
      }
      
      // Trigger validasi dan toggle functions
      if (window.validateSequentialTahapan) validateSequentialTahapan();
      if (window.toggleBeratAkhirField) toggleBeratAkhirField();
      if (window.toggleKadarAirField) toggleKadarAirField();
      
      return false;
    }
    
    // Jika option valid, jalankan fungsi yang sudah ada di HTML onchange
    if (window.toggleBeratAkhirField) toggleBeratAkhirField();
    if (window.toggleKadarAirField) toggleKadarAirField();
    if (window.validateSequentialTahapan) validateSequentialTahapan();
  };
  
  // Hapus listener lama jika ada (dengan nama function yang sama)
  statusSelect.removeEventListener('change', handleStatusChange);
  // Tambahkan listener baru
  statusSelect.addEventListener('change', handleStatusChange);

  console.log("✅ loadTahapanFromMasterProduksi() selesai");
}

// Validasi sequential tahapan di frontend (untuk UI feedback)
function validateSequentialTahapan() {
  const statusSelect = document.getElementById("statusTahapan");
  const statusError = document.getElementById("statusTahapanError");
  const statusErrorText = document.getElementById("statusTahapanErrorText");

  if (!statusSelect || !statusError || !statusErrorText) {
    return;
  }

  // Hanya validasi saat edit mode dan ada currentProduksiTahapanAktif
  if (!currentEditId || !currentProduksiTahapanAktif) {
    statusError.classList.add("d-none");
    return;
  }

  const selectedTahapan = statusSelect.value;
  if (!selectedTahapan) {
    statusError.classList.add("d-none");
    return;
  }

  // Mapping tahapan untuk validasi
  const tahapanMap = {
    "Sortasi Cherry atau Buah Kopi": "Sortasi",
    "Sortasi Buah": "Sortasi",  // Kompatibilitas nama lama
    Fermentasi: "Fermentasi",
    Pulping: "Pulping",
    Pencucian: "Pencucian",
    "Pengeringan Awal": "Pengeringan Awal",
    "Pengeringan Akhir": "Pengeringan Akhir",
    "Pengupasan Kulit Tanduk (Hulling)": "Hulling",
    "Hand Sortasi atau Sortasi Biji Kopi": "Hand Sortasi",
    Roasting: "Roasting",
    Grinding: "Grinding",
    Pengemasan: "Pengemasan",
  };

  const urutanTahapan = [
    "Sortasi",
    "Fermentasi",
    "Pulping",
    "Pencucian",
    "Pengeringan Awal",
    "Pengeringan Akhir",
    "Hulling",
    "Hand Sortasi",
    "Grinding",
    "Pengemasan",
  ];

  // Normalisasi tahapan
  const tahapanLamaNormalized =
    tahapanMap[currentProduksiTahapanAktif] || currentProduksiTahapanAktif;
  const tahapanBaruNormalized = tahapanMap[selectedTahapan] || selectedTahapan;

  try {
    const indexLama = urutanTahapan.indexOf(tahapanLamaNormalized);
    const indexBaru = urutanTahapan.indexOf(tahapanBaruNormalized);

    if (indexLama === -1 || indexBaru === -1) {
      // Jika tahapan tidak ditemukan di urutan, skip validasi
      statusError.classList.add("d-none");
      return;
    }

    // Validasi: tahapan baru harus setelah tahapan lama
    if (indexBaru <= indexLama) {
      statusErrorText.textContent = `Tidak dapat mengubah tahapan dari "${currentProduksiTahapanAktif}" ke "${selectedTahapan}". Tahapan harus dijalankan secara berurutan.`;
      statusError.classList.remove("d-none");
      return;
    }

    // Validasi: tidak boleh loncat tahapan
    if (indexBaru - indexLama > 1) {
      const tahapanTerlewat = urutanTahapan.slice(indexLama + 1, indexBaru);
      // Filter hanya tahapan yang ada di konfigurasi master
      const tahapanTerlewatValid = tahapanTerlewat.filter((t) => {
        if (t === "Pengemasan") return true;
        return currentMasterTahapanProduksi && currentMasterTahapanProduksi[t];
      });

      if (tahapanTerlewatValid.length > 0) {
        const tahapanTerlewatLabels = tahapanTerlewatValid.map((t) => {
          const map = {
            Sortasi: "Sortasi Cherry atau Buah Kopi",
            Fermentasi: "Fermentasi",
            Pulping: "Pulping",
            Pencucian: "Pencucian",
            "Pengeringan Awal": "Pengeringan Awal",
            "Pengeringan Akhir": "Pengeringan Akhir",
            Hulling: "Pengupasan Kulit Tanduk (Hulling)",
            "Hand Sortasi": "Hand Sortasi atau Sortasi Biji Kopi",
            Grinding: "Grinding",
            Pengemasan: "Pengemasan",
          };
          return map[t] || t;
        });
        statusErrorText.textContent = `Tidak dapat melompati tahapan. Tahapan yang terlewat: ${tahapanTerlewatLabels.join(", ")}`;
        statusError.classList.remove("d-none");
        return;
      }
    }

    // Validasi berhasil
    statusError.classList.add("d-none");
  } catch (error) {
    console.error("Error validating sequential tahapan:", error);
    statusError.classList.add("d-none");
  }
}

// Validasi sequential tahapan sebelum save (untuk prevent save jika ada tahapan terlewat)
function validateSequentialTahapanBeforeSave(
  statusTahapanBaru,
  statusTahapanLama,
  masterTahapanStatus,
) {
  if (!statusTahapanBaru) {
    return { valid: true, error: null };
  }

  const tahapanMap = {
    "Sortasi Cherry atau Buah Kopi": "Sortasi",
    "Sortasi Buah": "Sortasi",  // Kompatibilitas nama lama
    Fermentasi: "Fermentasi",
    Pulping: "Pulping",
    Pencucian: "Pencucian",
    "Pengeringan Awal": "Pengeringan Awal",
    "Pengeringan Akhir": "Pengeringan Akhir",
    "Pengupasan Kulit Tanduk (Hulling)": "Hulling",
    "Hand Sortasi atau Sortasi Biji Kopi": "Hand Sortasi",
    Roasting: "Roasting",
    Grinding: "Grinding",
    Pengemasan: "Pengemasan",
  };

  const urutanTahapan = [
    "Sortasi",
    "Fermentasi",
    "Pulping",
    "Pencucian",
    "Pengeringan Awal",
    "Pengeringan Akhir",
    "Hulling",
    "Hand Sortasi",
    "Grinding",
    "Pengemasan",
  ];

  // Normalisasi tahapan
  const tahapanBaruNormalized =
    tahapanMap[statusTahapanBaru] || statusTahapanBaru;
  const indexBaru = urutanTahapan.indexOf(tahapanBaruNormalized);

  if (indexBaru === -1) {
    return { valid: true, error: null }; // Skip validasi jika tahapan tidak dikenal
  }

  // Jika ada status lama, validasi sequential
  if (statusTahapanLama) {
    const tahapanLamaNormalized =
      tahapanMap[statusTahapanLama] || statusTahapanLama;
    const indexLama = urutanTahapan.indexOf(tahapanLamaNormalized);

    if (indexLama !== -1) {
      // Validasi: tahapan baru harus setelah tahapan lama
      if (indexBaru <= indexLama) {
        return {
          valid: false,
          error: `Tahapan harus dijalankan secara berurutan. Tidak dapat mengubah dari "${statusTahapanLama}" ke "${statusTahapanBaru}".`,
        };
      }

      // Validasi: tidak boleh loncat tahapan
      if (indexBaru - indexLama > 1) {
        const tahapanTerlewat = urutanTahapan.slice(indexLama + 1, indexBaru);
        // Filter hanya tahapan yang ada di konfigurasi master
        const tahapanTerlewatValid = tahapanTerlewat.filter((t) => {
          if (t === "Pengemasan") return true;
          return masterTahapanStatus && masterTahapanStatus[t];
        });

        if (tahapanTerlewatValid.length > 0) {
          const tahapanTerlewatLabels = tahapanTerlewatValid.map((t) => {
            const map = {
              Sortasi: "Sortasi Cherry atau Buah Kopi",
              Fermentasi: "Fermentasi",
              Pulping: "Pulping",
              Pencucian: "Pencucian",
              "Pengeringan Awal": "Pengeringan Awal",
              "Pengeringan Akhir": "Pengeringan Akhir",
              Hulling: "Pengupasan Kulit Tanduk (Hulling)",
              "Hand Sortasi": "Hand Sortasi atau Sortasi Biji Kopi",
              Grinding: "Grinding",
              Pengemasan: "Pengemasan",
            };
            return map[t] || t;
          });
          return {
            valid: false,
            error: `Tidak dapat melompati tahapan. Tahapan yang terlewat: ${tahapanTerlewatLabels.join(", ")}. Data tidak dapat disimpan.`,
          };
        }
      }
    }
  } else {
    // Untuk create mode, pastikan tidak mulai dari tengah
    // Harus mulai dari tahapan pertama yang ada di master
    if (masterTahapanStatus) {
      const tahapanAktif = Object.entries(masterTahapanStatus)
        .filter(([key, value]) => value === true)
        .map(([key]) => key);

      if (tahapanAktif.length > 0) {
        const tahapanPertama = tahapanAktif[0];
        const indexPertama = urutanTahapan.indexOf(tahapanPertama);

        if (indexBaru > indexPertama) {
          // Cek apakah ada tahapan sebelum statusTahapanBaru yang harus dilalui dulu
          const tahapanSebelumnya = urutanTahapan.slice(
            indexPertama,
            indexBaru,
          );
          const tahapanSebelumnyaValid = tahapanSebelumnya.filter((t) => {
            if (t === tahapanBaruNormalized) return false; // Exclude tahapan baru sendiri
            if (t === "Pengemasan") return true;
            return masterTahapanStatus[t];
          });

          if (tahapanSebelumnyaValid.length > 0) {
            const tahapanSebelumnyaLabels = tahapanSebelumnyaValid.map((t) => {
              const map = {
                Sortasi: "Sortasi Cherry atau Buah Kopi",
                Fermentasi: "Fermentasi",
                Pulping: "Pulping",
                Pencucian: "Pencucian",
                "Pengeringan Awal": "Pengeringan Awal",
                "Pengeringan Akhir": "Pengeringan Akhir",
                Hulling: "Pengupasan Kulit Tanduk (Hulling)",
                "Hand Sortasi": "Hand Sortasi atau Sortasi Biji Kopi",
                Grinding: "Grinding",
                Pengemasan: "Pengemasan",
              };
              return map[t] || t;
            });
            return {
              valid: false,
              error: `Tahapan harus dimulai dari awal. Tahapan yang harus dilalui terlebih dahulu: ${tahapanSebelumnyaLabels.join(", ")}. Data tidak dapat disimpan.`,
            };
          }
        }
      }
    }
  }

  return { valid: true, error: null };
}

async function loadVarietasOptionsProduksi() {
  try {
    let dataVarietas = [];
    if (
      !window.API ||
      !window.API.MasterData ||
      !window.API.MasterData.varietas
    ) {
      console.warn(
        "⚠️ API.MasterData.varietas not available, skipping options",
      );
      return;
    }
    dataVarietas = await window.API.MasterData.varietas.getAll();

    const varietasInput = document.getElementById("varietas");
    if (varietasInput) {
      let datalist = document.getElementById("varietasListProduksi");
      if (!datalist) {
        datalist = document.createElement("datalist");
        datalist.id = "varietasListProduksi";
        varietasInput.setAttribute("list", "varietasListProduksi");
        varietasInput.parentElement.appendChild(datalist);
      }
      datalist.innerHTML = dataVarietas
        .map((item) => `<option value="${item.nama}">${item.nama}</option>`)
        .join("");
    }
  } catch (error) {
    console.error("Error loading varietas options:", error);
  }
}

function escapeHtmlProduksi(s) {
  if (s == null || s === "") return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function attrEscapeProduksi(s) {
  return escapeHtmlProduksi(s).replace(/\n/g, " ");
}

/** Tampilan proses: jika master bahan hanya punya satu baris proses, tampilkan nama itu (selaras dengan kelola bahan). */
function getProsesPengolahanTampilan(prod, bahanById) {
  const firstId = getIdBahanListFromProduksi(prod)[0] || prod?.idBahan;
  const b =
    firstId && bahanById instanceof Map ? bahanById.get(firstId) : null;
  const lines = b?.prosesBahan;
  if (Array.isArray(lines) && lines.length === 1 && lines[0]?.prosesPengolahan) {
    return String(lines[0].prosesPengolahan);
  }
  return prod?.prosesPengolahan || "-";
}

// Fungsi untuk menampilkan data produksi
async function displayProduksi() {
  console.log("🔄 displayProduksi() called");

  // Reload data produksi dari MongoDB untuk memastikan data terbaru
  try {
    await loadProduksiData();
    console.log(`✅ Produksi data ready: ${produksi.length} items`);
  } catch (e) {
    console.error("❌ Error loading produksi:", e);
    produksi = [];
  }

  let bahanById = new Map();
  try {
    if (window.API?.Bahan) {
      const bl = await window.API.Bahan.getAll();
      for (const b of bl || []) {
        if (b?.idBahan) bahanById.set(b.idBahan, b);
      }
    }
  } catch (e) {
    console.warn("⚠️ Gagal memuat bahan untuk kolom proses:", e);
  }

  const tableBody = document.getElementById("tableBody");
  if (!tableBody) {
    console.error("❌ Table body element 'tableBody' not found!");
    console.error("Available elements:", {
      modal: !!document.getElementById("modalProduksi"),
      form: !!document.getElementById("formProduksi"),
      searchInput: !!document.getElementById("searchInput"),
    });
    return;
  }

  console.log("✅ Table body element found, rendering data...");

  const searchInput = document.getElementById("searchInput");
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";

  // Filter data berdasarkan search
  let filteredProduksi = produksi;
  if (searchTerm) {
    filteredProduksi = produksi.filter(
      (p) =>
        (p.idProduksi && p.idProduksi.toLowerCase().includes(searchTerm)) ||
        (p.idBahan && p.idBahan.toLowerCase().includes(searchTerm)) ||
        (Array.isArray(p.idBahanList) &&
          p.idBahanList.some((x) =>
            String(x).toLowerCase().includes(searchTerm),
          )) ||
        (p.prosesPengolahan &&
          p.prosesPengolahan.toLowerCase().includes(searchTerm)) ||
        (p.varietas && p.varietas.toLowerCase().includes(searchTerm)) ||
        (p.statusTahapan && p.statusTahapan.toLowerCase().includes(searchTerm)) ||
        (p.catatan && String(p.catatan).toLowerCase().includes(searchTerm)),
    );
  }

  if (filteredProduksi.length === 0) {
    console.log("⚠️ No produksi data to display (filtered or total)");
    tableBody.innerHTML = `
      <tr>
        <td colspan="14" class="text-center py-4 text-muted">
          <i class="bi bi-inbox fs-1 d-block mb-2"></i>
          Tidak ada data produksi
        </td>
      </tr>
    `;
    return;
  }

  console.log(
    `📊 Displaying ${filteredProduksi.length} produksi items in table`,
  );

  try {
    tableBody.innerHTML = filteredProduksi
      .map((p, index) => {
        const prosesLabel = getProsesPengolahanTampilan(p, bahanById);
        const catRaw = (p.catatan && String(p.catatan).trim()) || "";
        const catShort =
          catRaw.length > 36 ? `${catRaw.slice(0, 36)}…` : catRaw;
        const catCell = catRaw
          ? `<span class="small text-muted d-inline-block text-truncate" style="max-width: 10rem" title="${attrEscapeProduksi(catRaw)}">${escapeHtmlProduksi(catShort)}</span>`
          : '<span class="text-muted">—</span>';
        const PR = window.ProduksiRandomen;
        const cellRandomen = PR ? PR.formatRandomenPerIdCell(p) : "—";
        const titleRand = PR
          ? attrEscapeProduksi(
              String(PR.buildRingkasanPerTahapanText(p) || "").replace(
                /\n/g,
                " ",
              ),
            )
          : "";
        const idBahanTampil = (() => {
          const lst = getIdBahanListFromProduksi(p);
          if (lst.length > 1) {
            return lst
              .map((id) => `<span class="badge bg-info me-1">${escapeHtmlProduksi(id)}</span>`)
              .join("");
          }
          return `<span class="badge bg-info">${escapeHtmlProduksi(lst[0] || p.idBahan || "-")}</span>`;
        })();
        return `
    <tr>
      <td>${index + 1}</td>
      <td>${p.idProduksi || "-"}</td>
      <td>${idBahanTampil}</td>
      <td>${(p.beratAwal || 0).toLocaleString("id-ID")} kg</td>
      <td>${p.beratTerkini ? p.beratTerkini.toLocaleString("id-ID") : "-"} kg</td>
      <td>${p.beratAkhir ? p.beratAkhir.toLocaleString("id-ID") : "-"} kg</td>
      <td class="text-nowrap small" title="${titleRand}">${escapeHtmlProduksi(cellRandomen)}</td>
      <td><span class="badge ${(window.getProsesPengolahanBadgeClass || (() => 'bg-secondary'))(prosesLabel)}">${prosesLabel}</span></td>
      <td>${p.kadarAir || "-"}%</td>
      <td>${p.varietas || "-"}</td>
      <td>${new Date(p.tanggalMasuk).toLocaleDateString("id-ID")}</td>
      <td>${new Date(p.tanggalSekarang).toLocaleDateString("id-ID")}</td>
      <td>
        <span class="badge ${(window.getStatusTahapanBadgeClass || (() => 'bg-secondary'))(p.statusTahapan)}">${p.statusTahapan || "-"}</span>
      </td>
      <td class="small">${catCell}</td>
      <td class="text-center">
        <button 
          class="btn btn-sm btn-warning btn-action" 
          onclick="editProduksi(${
            p.id || (p._id ? "'" + p._id + "'" : "null")
          })"
          title="Edit">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button 
          class="btn btn-sm btn-danger btn-action" 
          onclick="deleteProduksi(${
            p.id || (p._id ? "'" + p._id + "'" : "null")
          })"
          title="Hapus">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `;
      })
      .join("");
  } catch (error) {
    console.error("❌ Error rendering produksi table:", error);
    tableBody.innerHTML = `
      <tr>
        <td colspan="14" class="text-center py-4 text-danger">
          <i class="bi bi-exclamation-triangle fs-1 d-block mb-2"></i>
          Error menampilkan data: ${error.message}
        </td>
      </tr>
    `;
  }

  console.log(
    `✅ Successfully displayed ${filteredProduksi.length} produksi items`,
  );
}

// Fungsi untuk toggle field kemasan (untuk karyawan view)
window.toggleKemasanField = function toggleKemasanField() {
  const statusTahapan = document.getElementById("statusTahapan");
  if (!statusTahapan) return;

  const kemasanField = document.getElementById("kemasanField");
  const kemasanSelect = document.getElementById("kemasan");

  if (!kemasanField || !kemasanSelect) {
    // Fields mungkin tidak ada di semua views
    return;
  }

  // Tampilkan field kemasan jika status adalah Pengemasan
  const isPengemasan =
    statusTahapan.value === "Pengemasan" ||
    (statusTahapan.value && statusTahapan.value.includes("Pengemasan"));

  if (isPengemasan) {
    kemasanField.style.display = "block";
    kemasanSelect.required = true;
  } else {
    kemasanField.style.display = "none";
    kemasanSelect.required = false;
    kemasanSelect.value = "";
  }
};

// Fungsi untuk calculate jumlah kemasan (placeholder - implementasi sesuai kebutuhan)
window.calculateJumlahKemasanProduksi =
  function calculateJumlahKemasanProduksi() {
    // Placeholder function - implementasi sesuai logika bisnis
    const beratAkhirInput = document.getElementById("beratAkhir");
    const kemasanSelect = document.getElementById("kemasan");
    const jumlahKemasanInput = document.getElementById("jumlahKemasan");

    if (!beratAkhirInput || !kemasanSelect || !jumlahKemasanInput) {
      return;
    }

    const beratAkhir = parseFloat(beratAkhirInput.value) || 0;
    const kemasan = kemasanSelect.value;

    // Jika ada data kemasan dan berat akhir, hitung jumlah kemasan
    // Implementasi logic sesuai kebutuhan bisnis
    if (beratAkhir > 0 && kemasan) {
      // Placeholder: perlu implementasi logic perhitungan sesuai kapasitas kemasan
      // jumlahKemasanInput.value = Math.ceil(beratAkhir / kapasitasKemasan);
    }
  };

// Fungsi untuk update kemasan options (placeholder)
window.updateKemasanOptions = function updateKemasanOptions() {
  // Placeholder function - implementasi sesuai kebutuhan
  // Load kemasan options berdasarkan kriteria tertentu
};

// Fungsi untuk toggle field kadar air hanya untuk tahapan Pengeringan Awal & Akhir
window.toggleKadarAirField = function toggleKadarAirField() {
  const statusTahapanElement = document.getElementById("statusTahapan");
  if (!statusTahapanElement) return;
  
  const statusTahapan = statusTahapanElement.value;
  const kadarAirField = document.getElementById("kadarAirField");
  const kadarAirInput = document.getElementById("kadarAir");
  const kadarAirAsterisk = document.getElementById("kadarAirAsterisk");
  const kadarAirInfo = document.getElementById("kadarAirInfo");

  if (!kadarAirField || !kadarAirInput) {
    console.warn("⚠️ Field kadar air tidak ditemukan di template");
    return; // Field tidak ada di template ini
  }

  // Field kadar air selalu terlihat dan bisa diisi untuk semua tahapan
  kadarAirField.style.display = "block";
  kadarAirInput.disabled = false;
  kadarAirInput.style.backgroundColor = ""; // Reset background
  kadarAirInput.placeholder = "Masukkan kadar air";
  
  // Cek apakah tahapan adalah Pengeringan Awal atau Pengeringan Akhir
  const isPengeringan =
    (statusTahapan && statusTahapan.includes("Pengeringan Awal")) ||
    (statusTahapan && statusTahapan.includes("Pengeringan Akhir"));

  if (isPengeringan) {
    // Untuk tahapan Pengeringan: wajib diisi
    kadarAirInput.required = true;
    
    // Tampilkan asterisk wajib
    if (kadarAirAsterisk) {
      kadarAirAsterisk.style.display = "inline";
    }
    
    // Update info text
    if (kadarAirInfo) {
      kadarAirInfo.innerHTML = `<i class="bi bi-info-circle text-warning"></i> <strong>Wajib diisi:</strong> Kadar air wajib untuk tahapan ${statusTahapan.includes("Pengeringan Awal") ? "Pengeringan Awal" : "Pengeringan Akhir"}. ${statusTahapan.includes("Pengeringan Akhir") ? "Kadar air Pengeringan Akhir harus lebih kecil dari kadar air Pengeringan Awal." : ""}`;
    }
  } else {
    // Untuk tahapan lain: opsional tapi bisa diisi
    kadarAirInput.required = false;
    
    // Sembunyikan asterisk wajib
    if (kadarAirAsterisk) {
      kadarAirAsterisk.style.display = "none";
    }
    
    // Update info text
    if (kadarAirInfo) {
      kadarAirInfo.innerHTML = `<i class="bi bi-info-circle text-muted"></i> Kadar air dapat diinputkan untuk semua tahapan. Wajib diisi untuk tahapan Pengeringan Awal dan Pengeringan Akhir.`;
    }
  }
};

// Fungsi untuk toggle field berat akhir dan kunci berat terkini saat Pengemasan
window.toggleBeratAkhirField = function toggleBeratAkhirField() {
  const statusTahapan = document.getElementById("statusTahapan").value;
  const beratAkhirField = document.getElementById("beratAkhirField");
  const beratAkhirInput = document.getElementById("beratAkhir");
  const beratTerkiniInput = document.getElementById("beratTerkini");
  const beratTerkiniLabel = document.querySelector('label[for="beratTerkini"]');

  // Cek status dengan lebih fleksibel (support "Pengemasan" atau yang mengandung "Pengemasan")
  const isPengemasan =
    statusTahapan === "Pengemasan" ||
    (statusTahapan && statusTahapan.includes("Pengemasan"));
  
  // Toggle kadar air field juga
  if (window.toggleKadarAirField) {
    window.toggleKadarAirField();
  } else {
    // Fallback: Pastikan field kadar air terlihat jika fungsi belum tersedia
    const kadarAirField = document.getElementById("kadarAirField");
    if (kadarAirField) {
      kadarAirField.style.display = "block";
    }
  }

  const metodeRow = document.getElementById("beratTerkiniMetodeRow");

  if (isPengemasan) {
    if (metodeRow) metodeRow.classList.add("d-none");
    document.getElementById("wrapBeratTerkiniKloter")?.classList.add("d-none");
    document.getElementById("wrapBeratTerkiniTotal")?.classList.remove("d-none");

    // Tampilkan dan aktifkan field berat akhir
    if (beratAkhirField) beratAkhirField.style.display = "block";
    if (beratAkhirInput) {
      beratAkhirInput.required = true;
      beratAkhirInput.disabled = false;
    }
    // Tampilkan field pencatatan berat green beans dan pixel
    const dataProdukStokField = document.getElementById("dataProdukStokField");
    if (dataProdukStokField) dataProdukStokField.style.display = "block";
    const beratGreenBeansEl = document.getElementById("beratGreenBeans");
    if (beratGreenBeansEl) beratGreenBeansEl.required = true;
    const beratPixelEl = document.getElementById("beratPixel");
    if (beratPixelEl) beratPixelEl.required = false; // Pixel opsional

    // Kunci field berat terkini saat Pengemasan (gunakan nilai terakhir, tidak wajib)
    if (beratTerkiniInput) {
      // Jika field kosong, ambil dari data produksi lama jika ada
      if (!beratTerkiniInput.value || beratTerkiniInput.value.trim() === "") {
        // Coba ambil dari produksi lama jika sedang edit
        const produksiIdElement = document.getElementById("produksiId");
        if (produksiIdElement && produksiIdElement.value) {
          // Akan di-handle di editProduksi, tapi kita pastikan field terlihat
        }
      }
      beratTerkiniInput.readOnly = true; // Kunci field
      beratTerkiniInput.required = false; // Tidak wajib lagi
      beratTerkiniInput.style.backgroundColor = "#e9ecef"; // Warna abu-abu untuk menunjukkan readonly
      beratTerkiniInput.title =
        "Berat terkini dikunci. Pada tahap Pengemasan, hanya berat akhir yang perlu diinput.";

      // Update label untuk hapus asterisk wajib
      const asterisk = document.getElementById("beratTerkiniAsterisk");
      if (asterisk) asterisk.style.display = "none";

      // Update info text
      const infoText = document.getElementById("beratTerkiniInfo");
      const pengemasanInfo = document.getElementById(
        "beratTerkiniPengemasanInfo",
      );
      if (infoText) infoText.classList.add("d-none");
      if (pengemasanInfo) pengemasanInfo.classList.remove("d-none");
    }
  } else {
    if (metodeRow) metodeRow.classList.remove("d-none");

    // Sembunyikan field berat akhir dan data produk stok
    if (beratAkhirField) beratAkhirField.style.display = "none";
    if (beratAkhirInput) {
      beratAkhirInput.required = false;
      beratAkhirInput.value = "";
      beratAkhirInput.disabled = true; // Disable jika bukan pengemasan
    }
    const dataProdukStokField = document.getElementById("dataProdukStokField");
    if (dataProdukStokField) dataProdukStokField.style.display = "none";
    const beratGreenBeansEl = document.getElementById("beratGreenBeans");
    if (beratGreenBeansEl) {
      beratGreenBeansEl.required = false;
      beratGreenBeansEl.value = "";
    }
    const beratPixelEl = document.getElementById("beratPixel");
    if (beratPixelEl) {
      beratPixelEl.required = false;
      beratPixelEl.value = "";
    }

    // Aktifkan kembali field berat terkini (wajib diisi); mode kloter tetap readonly + diisi dari tabel
    if (beratTerkiniInput) {
      const m = document.getElementById("metodeBeratTerkini")?.value;
      if (m === "kloter") {
        beratTerkiniInput.readOnly = true;
        beratTerkiniInput.classList.add("bg-light");
        beratTerkiniInput.required = true;
      } else {
        beratTerkiniInput.readOnly = false;
        beratTerkiniInput.required = true;
        beratTerkiniInput.style.backgroundColor = "";
        beratTerkiniInput.classList.remove("bg-light");
      }
      beratTerkiniInput.title =
        "Wajib diisi setiap kali update tahapan produksi";

      // Update label untuk tampilkan asterisk wajib
      const asterisk = document.getElementById("beratTerkiniAsterisk");
      if (asterisk) asterisk.style.display = "inline";

      // Update info text
      const infoText = document.getElementById("beratTerkiniInfo");
      const pengemasanInfo = document.getElementById(
        "beratTerkiniPengemasanInfo",
      );
      if (infoText) infoText.classList.remove("d-none");
      if (pengemasanInfo) pengemasanInfo.classList.add("d-none");
    }
  }
};

// Fungsi untuk membuka modal tambah/edit
// Fungsi untuk membuka modal (mendaftarkan ke window untuk akses dari HTML)
window.openModal = async function openModal(mode = "add") {
  currentEditId = null;
  window._produksiEditSnapshot = null;
  const modalElement = document.getElementById("modalProduksi");
  const modalLabel = document.getElementById("modalProduksiLabel");
  const form = document.getElementById("formProduksi");

  if (!modalElement || !modalLabel || !form) {
    console.error("❌ Modal elements not found");
    return;
  }

  // Load options dengan await untuk memastikan data ready sebelum modal muncul
  try {
    await Promise.all([
      loadProsesPengolahanOptions(),
      loadVarietasOptionsProduksi(),
      loadBahanOptionsProduksi(),
      loadTipeProdukOptionsProduksi(),
    ]);
    console.log("✅ All dropdown options loaded for produksi modal");
  } catch (error) {
    console.error("⚠️ Error loading some dropdown options:", error);
    // Continue anyway - modal can still be shown
  }

  if (mode === "add") {
    modalLabel.textContent = "Tambah Produksi";
    form.reset();
    document.getElementById("produksiId").value = "";
    const today = new Date().toISOString().split("T")[0];
    document.getElementById("tanggalSekarang").value = today;

    // ID Produksi: fetch preview dari API (read-only, dihasilkan otomatis oleh backend)
    const idProduksiInput = document.getElementById("idProduksi");
    if (idProduksiInput) {
      idProduksiInput.value = "";
      idProduksiInput.placeholder = "Loading...";
      idProduksiInput.readOnly = true;
      idProduksiInput.disabled = false; // Enable untuk bisa di-set value
      idProduksiInput.style.backgroundColor = "#e9ecef";
      (async () => {
        try {
          if (window.API && window.API.Produksi && window.API.Produksi.getNextId) {
            const nextId = await window.API.Produksi.getNextId();
            if (nextId) {
              idProduksiInput.value = nextId;
              idProduksiInput.placeholder = "";
            } else {
              idProduksiInput.placeholder = "Gagal memuat preview";
            }
          } else {
            idProduksiInput.placeholder = "API tidak tersedia";
          }
        } catch (err) {
          console.error("Error fetching next idProduksi:", err);
          idProduksiInput.placeholder = "Gagal memuat preview";
        }
      })();
    }

    // Reset tahapan states untuk add mode
    currentProduksiTahapanAktif = null;
    currentMasterTahapanProduksi = null;
    const statusSelect = document.getElementById("statusTahapan");
    if (statusSelect) {
      statusSelect.innerHTML = '<option value="">Pilih Status Tahapan</option>';
    }
    const statusInfo = document.getElementById("statusTahapanInfo");
    if (statusInfo) {
      statusInfo.innerHTML =
        '<i class="bi bi-info-circle"></i> Pilih <strong>proses pengolahan</strong> lalu centang <strong>ID Bahan</strong>; tahapan mengikuti proses tersebut.';
    }
    const statusError = document.getElementById("statusTahapanError");
    if (statusError) {
      statusError.classList.add("d-none");
    }

    // Reset berat awal dan ID Bahan untuk add mode (bisa diisi)
    const beratAwalInput = document.getElementById("beratAwal");
    const beratAwalInfo = document.getElementById("beratAwalInfo");
    const beratAwalWarning = document.getElementById("beratAwalWarning");
    const prosesPengolahanEl = document.getElementById("prosesPengolahan");
    if (prosesPengolahanEl) {
      prosesPengolahanEl.disabled = false;
      prosesPengolahanEl.style.backgroundColor = "";
    }
    clearIdBahanCheckboxUI();

    if (beratAwalInput) {
      beratAwalInput.value = "";
      beratAwalInput.placeholder =
        "Otomatis setelah pilih proses dan centang bahan (jumlah sisa)";
      beratAwalInput.title = "";
      beratAwalInput.max = "";
      beratAwalInput.readOnly = true;
      beratAwalInput.classList.add("bg-light");
      const ps = document.getElementById("prosesPengolahan");
      if (ps) ps.value = "";
    }
    if (beratAwalInfo) {
      beratAwalInfo.classList.remove("d-none");
    }
    if (beratAwalWarning) {
      beratAwalWarning.classList.add("d-none");
    }


    // Reset berat terkini untuk add mode - wajib diisi
    const beratTerkiniInput = document.getElementById("beratTerkini");
    if (beratTerkiniInput) {
      beratTerkiniInput.value = "";
      beratTerkiniInput.readOnly = false;
      beratTerkiniInput.required = true;
      beratTerkiniInput.style.backgroundColor = "";
      beratTerkiniInput.style.borderLeft = "";
      beratTerkiniInput.placeholder = "Masukkan berat terkini pada tahapan ini";
      beratTerkiniInput.title =
        "Wajib diisi setiap kali update tahapan produksi";
    }
    resetBeratTerkiniMetodeForAdd();
    const mRow = document.getElementById("beratTerkiniMetodeRow");
    if (mRow) mRow.classList.remove("d-none");
    if (typeof toggleMetodeBeratTerkiniUI === "function") {
      toggleMetodeBeratTerkiniUI();
    }

    toggleBeratAkhirField();
    if (window.toggleKadarAirField) {
      toggleKadarAirField();
    } else {
      // Fallback: Pastikan field kadar air terlihat
      const kadarAirField = document.getElementById("kadarAirField");
      if (kadarAirField) {
        kadarAirField.style.display = "block";
      }
    }
    document.getElementById("haccpBendaAsingProduksi").checked = false;
    document.getElementById("haccpHamaJamurProduksi").checked = false;
    document.getElementById("haccpKondisiBaikProduksi").checked = false;
  } else {
    modalLabel.textContent = "Edit Produksi";
  }

  // Gunakan variabel yang berbeda untuk Bootstrap Modal instance
  const modalInstance = new bootstrap.Modal(modalElement);
  modalInstance.show();
};

// Fungsi untuk edit produksi (mendaftarkan ke window untuk akses dari HTML)
window.editProduksi = async function editProduksi(id) {
  try {
    // Reload data produksi dari MongoDB sebelum edit
    await loadProduksiData();

    const p = produksi.find(
      (item) =>
        item.id === parseInt(id) || item.idProduksi === id || item._id === id,
    );
    if (!p) {
      alert("Data produksi tidak ditemukan!");
      return;
    }

    currentEditId = id;
    window._produksiEditSnapshot = p;

    // Pastikan modal element ada sebelum set value
    const modalElement = document.getElementById("modalProduksi");
    if (!modalElement) {
      console.error("❌ Modal element not found!");
      alert("Error: Modal form tidak ditemukan");
      return;
    }

    // Helper function untuk set value dengan null check
    const setElementValue = (id, value) => {
      const element = document.getElementById(id);
      if (element) {
        element.value = value || "";
      } else {
        console.warn(`⚠️ Element '${id}' not found`);
      }
    };

    const setElementChecked = (id, checked) => {
      const element = document.getElementById(id);
      if (element) {
        element.checked = checked;
      } else {
        console.warn(`⚠️ Element '${id}' not found`);
      }
    };

    // Set form values dengan null check
    setElementValue("produksiId", p.id || p._id);
    setElementValue("idProduksi", p.idProduksi);
    // ID Produksi readonly saat edit (tidak dapat diubah)
    const idProduksiInputEdit = document.getElementById("idProduksi");
    if (idProduksiInputEdit) {
      idProduksiInputEdit.readOnly = true;
      idProduksiInputEdit.disabled = false;
      idProduksiInputEdit.style.backgroundColor = "#e9ecef";
    }
    // idBahan (terenkode dengan proses) di-set setelah dropdown dimuat di modal shown

    // Berat awal dan ID Bahan dibuat readonly saat edit mode (nilai referensi, tidak bisa diubah)
    const beratAwalInput = document.getElementById("beratAwal");
    const beratAwalInfo = document.getElementById("beratAwalInfo");
    const beratAwalWarning = document.getElementById("beratAwalWarning");

    if (beratAwalInput) {
      beratAwalInput.value = p.beratAwal || "";
      beratAwalInput.readOnly = true;
      beratAwalInput.style.backgroundColor = "#e9ecef";
      beratAwalInput.title = isTambahBahanTerlarangSetelahPengeringanAkhir(
        p.statusTahapan,
      )
        ? "Total alokasi bahan tercatat. Penambahan bahan dikunci mulai tahap Pengeringan Akhir."
        : "Total alokasi semua ID bahan. Bertambah otomatis jika Anda menambah centang bahan baru.";
    }
    if (beratAwalInfo) {
      beratAwalInfo.classList.add("d-none");
    }
    if (beratAwalWarning) {
      beratAwalWarning.classList.remove("d-none");
    }

    const prosesPengolahanEdit = document.getElementById("prosesPengolahan");
    if (prosesPengolahanEdit) {
      prosesPengolahanEdit.disabled = true;
      prosesPengolahanEdit.style.backgroundColor = "#e9ecef";
      prosesPengolahanEdit.title =
        "Proses tidak dapat diubah setelah produksi dibuat.";
    }

    // Set berat terkini berdasarkan status tahapan
    const beratTerkiniInput = document.getElementById("beratTerkini");
    const isPengemasan =
      p.statusTahapan === "Pengemasan" ||
      (p.statusTahapan && p.statusTahapan.includes("Pengemasan"));

    if (beratTerkiniInput) {
      if (isPengemasan) {
        document.getElementById("beratTerkiniMetodeRow")?.classList.add("d-none");
        document.getElementById("wrapBeratTerkiniKloter")?.classList.add("d-none");
        document.getElementById("wrapBeratTerkiniTotal")?.classList.remove("d-none");
        _beratTerkiniKloterServerSnapshot = null;
        // Jika sudah Pengemasan: kunci dengan nilai terakhir sebelum pengemasan
        // Gunakan nilai berat terkini terakhir dari history atau dari data produksi
        const beratTerkiniTerakhir = p.beratTerkini || p.beratAwal || "";
        beratTerkiniInput.value = beratTerkiniTerakhir;
        beratTerkiniInput.readOnly = true; // Kunci field
        beratTerkiniInput.required = false; // Tidak wajib lagi
        beratTerkiniInput.style.backgroundColor = "#e9ecef"; // Warna abu-abu
        beratTerkiniInput.style.borderLeft = "";
        beratTerkiniInput.placeholder =
          "Berat terkini dikunci pada tahap Pengemasan";
        beratTerkiniInput.title =
          "Berat terkini dikunci. Pada tahap Pengemasan, hanya berat akhir yang perlu diinput.";

        // Update label untuk hapus asterisk
        const asterisk = document.getElementById("beratTerkiniAsterisk");
        if (asterisk) asterisk.style.display = "none";

        // Update info text
        const infoText = document.getElementById("beratTerkiniInfo");
        const pengemasanInfo = document.getElementById(
          "beratTerkiniPengemasanInfo",
        );
        if (infoText) infoText.classList.add("d-none");
        if (pengemasanInfo) pengemasanInfo.classList.remove("d-none");
      } else {
        _beratTerkiniKloterServerSnapshot = Array.isArray(p.beratTerkiniDetailKloter)
          ? JSON.parse(JSON.stringify(p.beratTerkiniDetailKloter))
          : null;
        const metodeEl = document.getElementById("metodeBeratTerkini");
        const metode =
          p.metodeBeratTerkini === "kloter" ? "kloter" : "total";
        if (metodeEl) metodeEl.value = metode;

        const wrapTot = document.getElementById("wrapBeratTerkiniTotal");
        const wrapKl = document.getElementById("wrapBeratTerkiniKloter");
        document.getElementById("beratTerkiniMetodeRow")?.classList.remove("d-none");

        if (
          metode === "kloter" &&
          Array.isArray(p.beratTerkiniDetailKloter) &&
          p.beratTerkiniDetailKloter.length > 0
        ) {
          wrapTot?.classList.add("d-none");
          wrapKl?.classList.remove("d-none");
          initJumlahKloterBeratTerkiniSelect();
          const n = Math.min(
            MAX_KLOTER_BERAT_TERKINI,
            p.beratTerkiniDetailKloter.length,
          );
          const jSel = document.getElementById("jumlahKloterBeratTerkini");
          if (jSel) jSel.value = String(n);
          beratTerkiniInput.readOnly = true;
          beratTerkiniInput.classList.add("bg-light");
          beratTerkiniInput.required = true;
          renderBeratTerkiniKloterRows(n, p.beratTerkiniDetailKloter);
          beratTerkiniInput.placeholder =
            "Total dihitung dari kloter (isi timbangan per kloter di bawah)";
          beratTerkiniInput.title =
            "Berat terkini = jumlah berat semua kloter. Ubah jumlah kloter atau isi berat per kloter.";
        } else {
          _beratTerkiniKloterServerSnapshot = null;
          if (metodeEl) metodeEl.value = "total";
          wrapKl?.classList.add("d-none");
          wrapTot?.classList.remove("d-none");
          const tbody = document.getElementById("tbodyBeratTerkiniKloter");
          if (tbody) tbody.innerHTML = "";
          const jSel = document.getElementById("jumlahKloterBeratTerkini");
          if (jSel) jSel.innerHTML = "";
          beratTerkiniInput.value = "";
          beratTerkiniInput.readOnly = false;
          beratTerkiniInput.classList.remove("bg-light");
          beratTerkiniInput.required = true;
          beratTerkiniInput.style.backgroundColor = "";
          beratTerkiniInput.style.borderLeft = "4px solid #0d6efd";
          beratTerkiniInput.placeholder = `Masukkan berat terkini baru (Sebelumnya: ${(p.beratTerkini || p.beratAwal || 0).toLocaleString("id-ID")} kg)`;
          beratTerkiniInput.title =
            "Wajib diisi setiap kali update tahapan produksi. Masukkan berat terkini yang baru pada tahapan ini.";
        }

        // Update label untuk tampilkan asterisk
        const asterisk = document.getElementById("beratTerkiniAsterisk");
        if (asterisk) asterisk.style.display = "inline";

        // Update info text
        const infoText = document.getElementById("beratTerkiniInfo");
        const pengemasanInfo = document.getElementById(
          "beratTerkiniPengemasanInfo",
        );
        if (infoText) infoText.classList.remove("d-none");
        if (pengemasanInfo) pengemasanInfo.classList.add("d-none");
      }
    }

    // Set other form fields dengan null check
    setElementValue("prosesPengolahan", p.prosesPengolahan);
    // Set kadar air (bisa diinputkan untuk semua tahapan)
    if (p.kadarAir !== null && p.kadarAir !== undefined) {
      setElementValue("kadarAir", p.kadarAir);
    } else {
      setElementValue("kadarAir", "");
    }
    // Toggle kadar air field berdasarkan status tahapan (untuk set required/optional)
    if (window.toggleKadarAirField) toggleKadarAirField();
    setElementValue("varietas", p.varietas);
    setElementValue("tanggalMasuk", p.tanggalMasuk);
    setElementValue("tanggalSekarang", p.tanggalSekarang);
    setElementValue("catatanProduksi", p.catatan || "");

    await loadProsesPengolahanOptions();
    setElementValue("prosesPengolahan", p.prosesPengolahan);

    // Set HACCP checkboxes dengan null check
    if (p.haccp) {
      setElementChecked(
        "haccpBendaAsingProduksi",
        p.haccp.bebasBendaAsing || false,
      );
      setElementChecked(
        "haccpHamaJamurProduksi",
        p.haccp.bebasHamaJamur || false,
      );
      setElementChecked(
        "haccpKondisiBaikProduksi",
        p.haccp.kondisiBaik || false,
      );
    } else {
      setElementChecked("haccpBendaAsingProduksi", false);
      setElementChecked("haccpHamaJamurProduksi", false);
      setElementChecked("haccpKondisiBaikProduksi", false);
    }

    // Open modal first, then load options (modal must be in DOM for elements to be accessible)
    const editModalInstance = new bootstrap.Modal(modalElement);

    // Wait for modal to be shown in DOM, then load dropdown options
    const handleModalShown = async function onModalShown() {
      try {
        // Wait a bit more for DOM to be fully ready
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Verify modal is in DOM
        const modalInDOM = document.getElementById("modalProduksi");
        if (!modalInDOM) {
          console.error("❌ Modal not found in DOM after shown event!");
          return;
        }

        // Load dropdown options after modal is shown
        await Promise.all([
          loadVarietasOptionsProduksi(),
          loadTipeProdukOptionsProduksi(),
        ]);

        setElementValue("prosesPengolahan", p.prosesPengolahan);
        currentProduksiTahapanAktif = p.statusTahapan;
        await loadTahapanFromMasterProduksi(p.prosesPengolahan);
        setElementValue("statusTahapan", p.statusTahapan);
        await renderIdBahanEditMode(p);

        const stSel = document.getElementById("statusTahapan");
        if (stSel) {
          if (stSel._bahanStatusListener) {
            stSel.removeEventListener("change", stSel._bahanStatusListener);
          }
          stSel._bahanStatusListener = async function onStatusTahapanRefreshBahan() {
            if (!currentEditId || !window._produksiEditSnapshot) return;
            const snap = window._produksiEditSnapshot;
            const merged = {
              ...snap,
              statusTahapan: stSel.value || snap.statusTahapan,
            };
            await renderIdBahanEditMode(merged);
          };
          stSel.addEventListener("change", stSel._bahanStatusListener);
        }

        // Toggle berat akhir field setelah status tahapan sudah di-set
        toggleBeratAkhirField();
        if (window.toggleKadarAirField) toggleKadarAirField();

        // Handle berat akhir untuk pengemasan (dilakukan setelah dropdown loaded)
        const isPengemasan =
          p.statusTahapan === "Pengemasan" ||
          (p.statusTahapan && p.statusTahapan.includes("Pengemasan"));
        if (isPengemasan) {
          const beratAkhirInput = document.getElementById("beratAkhir");
          if (beratAkhirInput) {
            const beratAkhirField = document.getElementById("beratAkhirField");
            if (beratAkhirField) beratAkhirField.style.display = "block";
            beratAkhirInput.required = true;
            beratAkhirInput.disabled = false;
            if (p.beratAkhir) beratAkhirInput.value = p.beratAkhir || "";
          }
          const dataProdukStokField = document.getElementById("dataProdukStokField");
          if (dataProdukStokField) dataProdukStokField.style.display = "block";
          const beratGreenBeansEl = document.getElementById("beratGreenBeans");
          if (beratGreenBeansEl && p.beratGreenBeans) beratGreenBeansEl.value = p.beratGreenBeans;
          const beratPixelEl = document.getElementById("beratPixel");
          if (beratPixelEl && p.beratPixel) beratPixelEl.value = p.beratPixel;
        }
      } catch (error) {
        console.error("⚠️ Error loading dropdown options in modal:", error);
      }
    };

    // Add event listener for modal shown (use once option to auto-remove after first call)
    modalElement.addEventListener("shown.bs.modal", handleModalShown, {
      once: true,
    });

    // Open modal (will trigger shown.bs.modal event)
    editModalInstance.show();
  } catch (error) {
    console.error("Error loading produksi for edit:", error);
    alert("Error memuat data produksi");
  }
};

// Helper function untuk get element value dengan null check
function getElementValue(id, defaultValue = "") {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(`⚠️ Element '${id}' not found, using default:`, defaultValue);
    return defaultValue;
  }
  return element.value || defaultValue;
}

function getElementNumberValue(id, defaultValue = 0) {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(`⚠️ Element '${id}' not found, using default:`, defaultValue);
    return defaultValue;
  }
  const value = parseFloat(element.value);
  return isNaN(value) ? defaultValue : value;
}

function getElementChecked(id, defaultValue = false) {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(`⚠️ Element '${id}' not found, using default:`, defaultValue);
    return defaultValue;
  }
  return element.checked || defaultValue;
}

// Fungsi untuk menyimpan produksi (tambah/edit) (mendaftarkan ke window)
window.saveProduksi = async function saveProduksi() {
  console.log("🚀 saveProduksi() called");

  try {
    // Check form element first
    const form = document.getElementById("formProduksi");
    if (!form) {
      console.error("❌ Form element 'formProduksi' not found!");
      alert("Error: Form tidak ditemukan. Pastikan modal masih terbuka.");
      return;
    }
    console.log("✅ Form element found");

    // Validate form
    console.log("🔍 Validating form...");
    if (!form.checkValidity()) {
      console.warn("⚠️ Form validation failed");
      form.reportValidity();
      return;
    }
    console.log("✅ Form validation passed");

    // Get required elements
    const produksiIdElement = document.getElementById("produksiId");
    const idProduksiElement = document.getElementById("idProduksi");

    if (!produksiIdElement || !idProduksiElement) {
      const missingElements = [];
      if (!produksiIdElement) missingElements.push("produksiId");
      if (!idProduksiElement) missingElements.push("idProduksi");
      console.error("❌ Required form elements not found:", missingElements);
      alert(
        `Error: Form elements tidak ditemukan: ${missingElements.join(", ")}`,
      );
      return;
    }

    const produksiId = produksiIdElement.value;
    const idProduksi = idProduksiElement.value;
    const isEditMode = !!produksiId;

    console.log(
      `🔄 saveProduksi() - Mode: ${isEditMode ? "UPDATE" : "CREATE"}`,
    );

    // Reload data produksi untuk mendapatkan data terbaru (penting untuk edit mode)
    console.log("🔄 Reloading produksi data...");
    await loadProduksiData();
    console.log("✅ Produksi data reloaded");

    // Get produksi lama untuk edit mode
    let produksiLama = null;
    if (isEditMode) {
      console.log(
        "🔍 Finding produksiLama with produksiId:",
        produksiId,
        "idProduksi:",
        idProduksi,
      );
      produksiLama = produksi.find(
        (p) =>
          p.id === parseInt(produksiId) ||
          p.idProduksi === idProduksi ||
          p._id === produksiId,
      );
      if (!produksiLama) {
        console.error("❌ produksiLama not found for:", {
          produksiId,
          idProduksi,
        });
        console.error(
          "Available produksi:",
          produksi.map((p) => ({
            id: p.id,
            idProduksi: p.idProduksi,
            _id: p._id,
          })),
        );
        alert("Data produksi tidak ditemukan!");
        return;
      }
      console.log("✅ produksiLama found:", {
        id: produksiLama.id,
        idProduksi: produksiLama.idProduksi,
        idBahan: produksiLama.idBahan,
        beratAwal: produksiLama.beratAwal,
      });
    }

    let idBahan;
    let idBahanList = [];
    let alokasiBeratBahan = [];
    let decodedBahanMeta = null;

    if (isEditMode && produksiLama) {
      const container = document.getElementById("idBahanCheckboxContainer");
      const locked = container?.querySelectorAll('input[data-bahan-locked="1"]') || [];
      const newChecked = container?.querySelectorAll(
        'input[name="idBahanProduksi"]:not([data-bahan-locked]):checked',
      ) || [];
      idBahanList = [];
      alokasiBeratBahan = [];
      locked.forEach((cb) => {
        const bid = (cb.dataset.idBahan || "").trim();
        const br = parseFloat(cb.dataset.beratAlokasi || "0") || 0;
        if (bid) {
          idBahanList.push(bid);
          alokasiBeratBahan.push({ idBahan: bid, berat: br });
        }
      });
      newChecked.forEach((cb) => {
        const bid = (cb.dataset.idBahan || cb.value || "").trim();
        const sisa = parseFloat(cb.dataset.sisa || "0") || 0;
        if (bid) {
          idBahanList.push(bid);
          alokasiBeratBahan.push({ idBahan: bid, berat: sisa });
        }
      });
      idBahan = idBahanList[0] || produksiLama.idBahan;
    } else {
      const container = document.getElementById("idBahanCheckboxContainer");
      const checked = container?.querySelectorAll(
        'input[type="checkbox"][name="idBahanProduksi"]:checked',
      );
      if (!checked || checked.length === 0) {
        alert(
          "Pilih minimal satu ID Bahan (centang) setelah memilih proses pengolahan.",
        );
        return;
      }
      checked.forEach((cb) => {
        const bid = (cb.dataset.idBahan || cb.value || "").trim();
        const sisa = parseFloat(cb.dataset.sisa || "0") || 0;
        if (bid) {
          idBahanList.push(bid);
          alokasiBeratBahan.push({ idBahan: bid, berat: sisa });
        }
      });
      idBahan = idBahanList[0];
      decodedBahanMeta = {
        idBahan,
        prosesPengolahan: getElementValue("prosesPengolahan", ""),
      };
    }

    if (!idBahan || String(idBahan).trim() === "") {
      alert("Error: ID Bahan tidak valid. Tidak dapat melanjutkan.");
      return;
    }

    console.log("✅ idBahan validated:", idBahan, idBahanList, alokasiBeratBahan);

    // ==================== GET BERAT AWAL ====================
    console.log("🔍 Getting beratAwal...");
    let beratAwal;
    if (isEditMode) {
      const beratAwalEl = document.getElementById("beratAwal");
      beratAwal = parseFloat(beratAwalEl?.value) || 0;
      console.log("📝 Edit mode beratAwal (total alokasi):", beratAwal);
      if (beratAwal <= 0 || isNaN(beratAwal)) {
        alert("Berat awal tidak valid (total alokasi semua bahan).");
        return;
      }
    } else {
      // Add mode: ambil dari input (harus diisi user)
      const beratAwalElement = document.getElementById("beratAwal");
      if (!beratAwalElement) {
        alert("Error: Field berat awal tidak ditemukan!");
        return;
      }
      const beratAwalValue = beratAwalElement.value;
      if (!beratAwalValue || beratAwalValue.trim() === "") {
        alert("Berat awal harus diisi!");
        return;
      }
      beratAwal = parseFloat(beratAwalValue);
      if (beratAwal <= 0 || isNaN(beratAwal)) {
        alert("Berat awal harus lebih dari 0!");
        return;
      }
    }

    // ==================== GET FORM FIELDS (dengan null check) ====================
    console.log("🔍 Getting form fields...");
    // Fields yang mungkin tidak ada di template tertentu
    let prosesPengolahan = getElementValue(
      "prosesPengolahan",
      produksiLama?.prosesPengolahan || "",
    );
    if (!isEditMode && decodedBahanMeta?.prosesPengolahan) {
      prosesPengolahan = decodedBahanMeta.prosesPengolahan;
      const ps = document.getElementById("prosesPengolahan");
      if (ps) ps.value = prosesPengolahan;
    }
    if (!prosesPengolahan || String(prosesPengolahan).trim() === "") {
      alert("Proses pengolahan wajib. Pilih proses di atas terlebih dahulu.");
      return;
    }
    console.log("📝 prosesPengolahan:", prosesPengolahan);

    // GET STATUS TAHAPAN TERLEBIH DAHULU (sebelum digunakan di validasi kadar air)
    const statusTahapan = getElementValue(
      "statusTahapan",
      produksiLama?.statusTahapan || "",
    );
    console.log("📝 statusTahapan:", statusTahapan);

    const kadarAirElement = document.getElementById("kadarAir");
    // Kadar air hanya wajib untuk tahapan Pengeringan Awal & Akhir
    let kadarAir = null;
    if (kadarAirElement && kadarAirElement.value && kadarAirElement.value.trim() !== "") {
      kadarAir = parseFloat(kadarAirElement.value);
    } else if (produksiLama?.kadarAir && statusTahapan && 'Pengeringan' in statusTahapan) {
      kadarAir = parseFloat(produksiLama.kadarAir);
    }
    console.log("📝 kadarAir:", kadarAir);
    
    // Validasi kadar air wajib untuk Pengeringan Awal & Akhir
    if (statusTahapan && (statusTahapan.includes("Pengeringan Awal") || statusTahapan.includes("Pengeringan Akhir"))) {
      if (!kadarAir || isNaN(kadarAir) || kadarAir < 0 || kadarAir > 100) {
        alert("Kadar air wajib diisi untuk tahapan " + statusTahapan + " (0-100%)");
        if (kadarAirElement) kadarAirElement.focus();
        return;
      }
    }
    
    // Validasi khusus untuk Pengeringan Akhir
    if (statusTahapan && statusTahapan.includes("Pengeringan Akhir")) {
      if (isEditMode && produksiLama) {
        // Validasi: tahapan sebelumnya harus Pengeringan Awal
        const statusLama = produksiLama.statusTahapan || "";
        if (!statusLama.includes("Pengeringan Awal")) {
          alert("Pengeringan Akhir hanya dapat dipilih jika tahapan sebelumnya adalah Pengeringan Awal");
          return;
        }
        
        // Validasi: kadar air Pengeringan Akhir harus lebih kecil dari Pengeringan Awal
        const kadarAirAwal = produksiLama.kadarAir || 0;
        if (kadarAir >= kadarAirAwal) {
          alert(`Kadar air Pengeringan Akhir (${kadarAir}%) harus lebih kecil dari kadar air Pengeringan Awal (${kadarAirAwal}%)`);
          if (kadarAirElement) kadarAirElement.focus();
          return;
        }
        // Perbandingan berat terkini Pengeringan Akhir vs Awal dilakukan setelah
        // sinkronisasi berat dari kloter (jika metode kloter), lihat blok GET BERAT TERKINI.
      }
    }

    const varietas = getElementValue("varietas", produksiLama?.varietas || "");
    console.log("📝 varietas:", varietas);

    const tanggalMasuk = getElementValue(
      "tanggalMasuk",
      produksiLama?.tanggalMasuk || "",
    );
    console.log("📝 tanggalMasuk:", tanggalMasuk);

    const tanggalSekarang = getElementValue(
      "tanggalSekarang",
      new Date().toISOString().split("T")[0],
    );
    console.log("📝 tanggalSekarang:", tanggalSekarang);

    // Validasi required fields (idProduksi untuk add mode dihasilkan backend, untuk edit diambil dari produksiLama)
    if (!statusTahapan) {
      console.error("❌ Status Tahapan wajib diisi");
      alert("Error: Status Tahapan wajib diisi!");
      return;
    }
    
    // Validasi ADD MODE: Hanya tahapan pertama yang boleh dipilih
    if (!isEditMode && currentMasterTahapanProduksi) {
      // Ambil tahapan pertama yang aktif dari master
      const tahapanAktif = Object.entries(currentMasterTahapanProduksi)
        .filter(([key, value]) => value === true && key !== 'Pengemasan')
        .map(([key]) => key);
      
      // Urutkan sesuai urutan tahapan
    const urutanTahapan = [
      "Sortasi",
      "Fermentasi",
      "Pulping",
      "Pencucian",
      "Pengeringan Awal",
      "Pengeringan Akhir",
      "Hulling",
      "Hand Sortasi",
      "Grinding",
      "Pengemasan",
    ];
      
      tahapanAktif.sort((a, b) => {
        const idxA = urutanTahapan.indexOf(a) === -1 ? 999 : urutanTahapan.indexOf(a);
        const idxB = urutanTahapan.indexOf(b) === -1 ? 999 : urutanTahapan.indexOf(b);
        return idxA - idxB;
      });
      
      const tahapanPertama = tahapanAktif.length > 0 ? tahapanAktif[0] : null;
      
      // Normalisasi status tahapan yang dipilih untuk perbandingan
      const tahapanMap = {
        "Sortasi Cherry atau Buah Kopi": "Sortasi",
        "Sortasi Buah": "Sortasi",  // Kompatibilitas nama lama
        "Fermentasi": "Fermentasi",
        "Pulping": "Pulping",
        "Pencucian": "Pencucian",
        "Pengeringan Awal": "Pengeringan Awal",
        "Pengeringan Akhir": "Pengeringan Akhir",
        "Pengupasan Kulit Tanduk (Hulling)": "Hulling",
        "Hand Sortasi atau Sortasi Biji Kopi": "Hand Sortasi",
        "Roasting": "Roasting",
        "Grinding": "Grinding",
        "Pengemasan": "Pengemasan",
      };
      
      const statusTahapanNormalized = tahapanMap[statusTahapan] || statusTahapan;
      
      if (tahapanPertama && statusTahapanNormalized !== tahapanPertama) {
        console.error(`❌ Untuk produksi baru, hanya tahapan pertama yang boleh dipilih: ${tahapanPertama}`);
        alert(`Untuk produksi baru, Anda harus memulai dari tahapan pertama: ${tahapanPertama}. Silakan pilih tahapan tersebut.`);
        // Reset ke tahapan pertama
        const statusSelect = document.getElementById("statusTahapan");
        if (statusSelect) {
          // Cari option yang sesuai dengan tahapan pertama
          for (let option of statusSelect.options) {
            const optionNormalized = tahapanMap[option.value] || option.value;
            if (optionNormalized === tahapanPertama) {
              statusSelect.value = option.value;
              break;
            }
          }
          // Trigger toggle functions
          if (window.toggleBeratAkhirField) toggleBeratAkhirField();
          if (window.toggleKadarAirField) toggleKadarAirField();
        }
        return;
      }
    }
    if (isEditMode && !produksiLama?.idProduksi) {
      console.error("❌ ID Produksi tidak valid untuk edit mode");
      alert("Error: ID Produksi tidak valid!");
      return;
    }
    // Untuk edit mode, gunakan idProduksi dari produksiLama (bukan dari form)
    const idProduksiForPayload = isEditMode
      ? produksiLama.idProduksi
      : (idProduksiElement?.value || ""); // Add mode: tidak dikirim (backend generate)
    console.log("✅ Required fields validated");

    // Validasi sequential tahapan sebelum save
    const statusTahapanLama = produksiLama?.statusTahapan || null;
    const masterTahapanStatus = currentMasterTahapanProduksi || null;
    const sequentialValidation = validateSequentialTahapanBeforeSave(
      statusTahapan,
      statusTahapanLama,
      masterTahapanStatus,
    );

    if (!sequentialValidation.valid) {
      console.error(
        "❌ Sequential validation failed:",
        sequentialValidation.error,
      );
      alert("⚠️ " + sequentialValidation.error + "\n\nSilakan pilih tahapan yang sesuai urutan.");
      
      // Reset ke tahapan yang valid
      const statusSelect = document.getElementById("statusTahapan");
      if (statusSelect) {
        if (isEditMode && statusTahapanLama) {
          // Kembalikan ke tahapan lama untuk EDIT MODE
          const tahapanLamaOption = Array.from(statusSelect.options).find(
            opt => !opt.disabled && (
              opt.value === statusTahapanLama || 
              opt.value.includes(statusTahapanLama) ||
              statusTahapanLama.includes(opt.value)
            )
          );
          if (tahapanLamaOption) {
            statusSelect.value = tahapanLamaOption.value;
          }
        } else if (!isEditMode && availableTahapan.length > 0) {
          // Kembalikan ke tahapan pertama untuk ADD MODE
          statusSelect.value = availableTahapan[0].value;
        }
        
        // Trigger toggle functions
        if (window.toggleBeratAkhirField) toggleBeratAkhirField();
        if (window.toggleKadarAirField) toggleKadarAirField();
        if (window.validateSequentialTahapan) validateSequentialTahapan();
      }
      return;
    }
    console.log("✅ Sequential validation passed");
    
    // ==================== VALIDASI KHUSUS PENGERINGAN AWAL & AKHIR ====================
    // Validasi kadar air wajib untuk Pengeringan Awal & Akhir
    if (statusTahapan && (statusTahapan.includes("Pengeringan Awal") || statusTahapan.includes("Pengeringan Akhir"))) {
      if (!kadarAir || isNaN(kadarAir) || kadarAir < 0 || kadarAir > 100) {
        alert("Kadar air wajib diisi untuk tahapan " + statusTahapan + " (0-100%)");
        if (kadarAirElement) {
          kadarAirElement.focus();
          kadarAirElement.style.borderColor = "#dc3545";
        }
        return;
      }
    }
    
    // Validasi khusus untuk Pengeringan Akhir
    if (statusTahapan && statusTahapan.includes("Pengeringan Akhir")) {
      if (isEditMode && produksiLama) {
        // Validasi: tahapan sebelumnya harus Pengeringan Awal
        const statusLama = produksiLama.statusTahapan || "";
        if (!statusLama.includes("Pengeringan Awal")) {
          alert("Pengeringan Akhir hanya dapat dipilih jika tahapan sebelumnya adalah Pengeringan Awal");
          return;
        }
        
        // Validasi: kadar air Pengeringan Akhir harus lebih kecil dari Pengeringan Awal
        const kadarAirAwal = produksiLama.kadarAir || 0;
        if (kadarAir >= kadarAirAwal) {
          alert(`Kadar air Pengeringan Akhir (${kadarAir}%) harus lebih kecil dari kadar air Pengeringan Awal (${kadarAirAwal}%)`);
          if (kadarAirElement) {
            kadarAirElement.focus();
            kadarAirElement.style.borderColor = "#dc3545";
          }
          return;
        }
      }
    }

    // ==================== GET BERAT TERKINI ====================
    // BERAT TERKINI WAJIB DIISI KECUALI SAAT TAHAP PENGEMASAN
    console.log("🔍 Getting beratTerkini...");
    const isPengemasan =
      statusTahapan === "Pengemasan" ||
      (statusTahapan && statusTahapan.includes("Pengemasan"));

    const beratTerkiniElement = document.getElementById("beratTerkini");
    let beratTerkini;

    if (!isPengemasan) {
      const me = document.getElementById("metodeBeratTerkini")?.value;
      if (me === "kloter") {
        syncBeratTerkiniFromKloter();
        const det = getBeratTerkiniDetailKloterPayload();
        if (!det || det.length === 0) {
          alert(
            "Pilih jumlah kloter dan isi minimal satu berat kloter lebih dari 0.",
          );
          return;
        }
      }
    }

    if (isPengemasan) {
      // Saat Pengemasan: gunakan nilai dari field (yang sudah dikunci dengan nilai terakhir)
      // atau dari produksi lama jika field kosong
      if (!beratTerkiniElement) {
        console.error("❌ Field berat terkini tidak ditemukan!");
        // Jika tidak ada field, ambil dari produksi lama
        beratTerkini =
          produksiLama?.beratTerkini || produksiLama?.beratAwal || 0;
        console.log("ℹ️ Using beratTerkini from produksiLama:", beratTerkini);
      } else {
        const beratTerkiniValue = beratTerkiniElement.value;
        if (beratTerkiniValue && beratTerkiniValue.trim() !== "") {
          beratTerkini = parseBeratProduksiLocal(beratTerkiniValue);
        } else {
          // Jika field kosong, ambil dari produksi lama
          beratTerkini =
            produksiLama?.beratTerkini || produksiLama?.beratAwal || 0;
          console.log(
            "ℹ️ Field kosong, using beratTerkini from produksiLama:",
            beratTerkini,
          );
        }
      }

      // Validasi berat terkini saat Pengemasan (harus valid number)
      if (isNaN(beratTerkini) || beratTerkini <= 0) {
        console.error("❌ Berat terkini tidak valid untuk tahap Pengemasan!");
        alert(
          "Error: Berat terkini tidak valid. Pastikan data produksi sudah memiliki berat terkini sebelum masuk tahap Pengemasan.",
        );
        return;
      }
      console.log("✅ beratTerkini (Pengemasan - dikunci):", beratTerkini);
    } else {
      // Bukan Pengemasan: WAJIB diisi
      if (!beratTerkiniElement) {
        console.error("❌ Field berat terkini tidak ditemukan!");
        alert("Error: Field berat terkini tidak ditemukan!");
        return;
      }

      const beratTerkiniValue = beratTerkiniElement.value;
      if (!beratTerkiniValue || beratTerkiniValue.trim() === "") {
        console.error("❌ Berat terkini wajib diisi!");
        alert(
          "⚠️ BERAT TERKINI WAJIB DIISI!\n\nBerat terkini harus diinput setiap kali update tahapan proses produksi.\n\nSetiap perubahan tahapan memerlukan pencatatan berat terkini yang baru.",
        );
        beratTerkiniElement.focus();
        beratTerkiniElement.style.borderColor = "#dc3545";
        return;
      }

      beratTerkini = parseBeratProduksiLocal(beratTerkiniValue);
      if (isNaN(beratTerkini) || beratTerkini <= 0) {
        console.error("❌ Berat terkini harus lebih dari 0!");
        alert("Berat terkini harus lebih dari 0!");
        beratTerkiniElement.focus();
        beratTerkiniElement.style.borderColor = "#dc3545";
        return;
      }

      if (beratTerkini > beratAwal) {
        console.error(
          "❌ Berat terkini tidak boleh lebih besar dari berat awal!",
        );
        alert("Berat terkini tidak boleh lebih besar dari berat awal!");
        beratTerkiniElement.focus();
        beratTerkiniElement.style.borderColor = "#dc3545";
        return;
      }
      
      // Validasi khusus: berat terkini Pengeringan Akhir ≤ berat terkini Pengeringan Awal
      if (statusTahapan && statusTahapan.includes("Pengeringan Akhir") && isEditMode && produksiLama) {
        const beratTerkiniAwal = produksiLama.beratTerkini || 0;
        if (beratTerkini > beratTerkiniAwal) {
          alert(`Berat terkini Pengeringan Akhir (${beratTerkini} kg) tidak boleh lebih besar dari berat terkini Pengeringan Awal (${beratTerkiniAwal} kg)`);
          beratTerkiniElement.focus();
          beratTerkiniElement.style.borderColor = "#dc3545";
          return;
        }
      }

      // Reset border color jika validasi berhasil
      beratTerkiniElement.style.borderColor = "";
      console.log("✅ beratTerkini validated:", beratTerkini);
    }

    // ==================== GET BERAT AKHIR ====================
    // isPengemasan sudah dideklarasikan di atas (line 1140), tidak perlu dideklarasikan lagi
    console.log("🔍 Getting beratAkhir...");
    let beratAkhir = null;

    console.log(
      "📝 isPengemasan:",
      isPengemasan,
      "statusTahapan:",
      statusTahapan,
    );

    if (isPengemasan) {
      console.log("📝 Pengemasan mode - getting beratAkhir element...");
      const beratAkhirElement = document.getElementById("beratAkhir");
      const beratAkhirField = document.getElementById("beratAkhirField");

      // PERBAIKAN: Validasi field dengan lebih robust
      if (!beratAkhirElement) {
        // Coba cari field dengan delay (untuk handle dynamic field)
        console.warn("⚠️ Field berat akhir tidak ditemukan, mencoba lagi...");
        await new Promise((resolve) => setTimeout(resolve, 100));
        const retryElement = document.getElementById("beratAkhir");
        if (!retryElement) {
          console.error(
            "❌ Field berat akhir tidak ditemukan untuk tahap pengemasan!",
          );
          // PERBAIKAN: Jangan return error, tapi set beratAkhir ke null dan lanjutkan
          // Backend akan validasi dan return error yang lebih jelas
          console.warn(
            "⚠️ Field berat akhir tidak ditemukan, akan di-set null. Backend akan validasi.",
          );
          beratAkhir = null;
        } else {
          const beratAkhirValue = retryElement.value;
          if (!beratAkhirValue || beratAkhirValue.trim() === "") {
            console.error("❌ Berat akhir wajib diisi untuk pengemasan!");
            alert(
              "Berat akhir wajib diisi jika status tahapan adalah Pengemasan!",
            );
            return;
          }
          beratAkhir = parseFloat(beratAkhirValue);
          if (isNaN(beratAkhir) || beratAkhir <= 0) {
            console.error("❌ Berat akhir harus lebih dari 0!");
            alert("Berat akhir harus lebih dari 0!");
            return;
          }
          if (beratAkhir > beratAwal) {
            console.error(
              "❌ Berat akhir tidak boleh lebih besar dari berat awal!",
            );
            alert("Berat akhir tidak boleh lebih besar dari berat awal!");
            return;
          }
          if (beratAkhir > beratTerkini) {
            console.error(
              "❌ Berat akhir tidak boleh lebih besar dari berat terkini!",
            );
            alert("Berat akhir tidak boleh lebih besar dari berat terkini!");
            return;
          }
          console.log("✅ beratAkhir validated:", beratAkhir);
        }
      } else {
        const beratAkhirValue = beratAkhirElement.value;
        console.log("📝 beratAkhirValue:", beratAkhirValue);
        if (!beratAkhirValue || beratAkhirValue.trim() === "") {
          console.error("❌ Berat akhir wajib diisi untuk pengemasan!");
          alert(
            "Berat akhir wajib diisi jika status tahapan adalah Pengemasan!",
          );
          return;
        }
        beratAkhir = parseFloat(beratAkhirValue);
        console.log("📝 Parsed beratAkhir:", beratAkhir);
        if (isNaN(beratAkhir) || beratAkhir <= 0) {
          console.error("❌ Berat akhir harus lebih dari 0!");
          alert("Berat akhir harus lebih dari 0!");
          return;
        }
        if (beratAkhir > beratAwal) {
          console.error(
            "❌ Berat akhir tidak boleh lebih besar dari berat awal!",
          );
          alert("Berat akhir tidak boleh lebih besar dari berat awal!");
          return;
        }
        if (beratAkhir > beratTerkini) {
          console.error(
            "❌ Berat akhir tidak boleh lebih besar dari berat terkini!",
          );
          alert("Berat akhir tidak boleh lebih besar dari berat terkini!");
          return;
        }
        console.log("✅ beratAkhir validated:", beratAkhir);
      }
    } else {
      console.log("ℹ️ Not pengemasan - beratAkhir will be null");
    }

    // Validasi: berat green beans wajib saat Pengemasan, berat pixel opsional
    if (isPengemasan) {
      const beratGreenBeans = parseFloat(getElementValue("beratGreenBeans")) || 0;
      if (!beratGreenBeans || beratGreenBeans <= 0) {
        alert("Berat Green Beans wajib diisi untuk tahap Pengemasan.");
        document.getElementById("beratGreenBeans")?.focus();
        return;
      }
      // Validasi berat green beans tidak boleh lebih besar dari berat akhir
      if (beratGreenBeans > beratAkhir) {
        alert("Berat Green Beans tidak boleh lebih besar dari berat akhir!");
        document.getElementById("beratGreenBeans")?.focus();
        return;
      }
      // Berat pixel opsional, tapi jika diisi harus valid
      const beratPixel = parseFloat(getElementValue("beratPixel")) || 0;
      if (beratPixel < 0) {
        alert("Berat Produk Pixel tidak boleh bernilai negatif.");
        document.getElementById("beratPixel")?.focus();
        return;
      }
      // Total berat green beans + pixel tidak boleh lebih dari berat akhir
      if ((beratGreenBeans + beratPixel) > beratAkhir) {
        alert("Total berat Green Beans + Pixel tidak boleh lebih besar dari berat akhir!");
        return;
      }
    }

    // ==================== VALIDASI ====================
    console.log("🔍 Starting validations...");
    console.log("📋 Data to validate:", {
      isEditMode,
      produksiId,
      idProduksi,
      idBahan,
      beratAwal,
      beratTerkini,
      statusTahapan,
      isPengemasan,
      produksiLamaExists: !!produksiLama,
    });

    // Validasi ID Produksi duplikat: untuk add mode tidak perlu (backend generate).
    // Untuk edit mode: idProduksi tidak berubah, jadi tidak ada duplikat.
    // (Block dihapus - backend menjamin idProduksi unik untuk create)

    // Validasi sisa bahan HANYA untuk ADD mode (per id dalam alokasi)
    if (!isEditMode) {
      for (const row of alokasiBeratBahan) {
        const sisaBahan = await calculateSisaBahan(
          row.idBahan,
          prosesPengolahan,
        );
        if (row.berat > sisaBahan + 1e-4) {
          alert(
            `Sisa bahan tidak mencukupi untuk ${row.idBahan}.\n` +
              `Sisa tersedia: ${sisaBahan.toLocaleString("id-ID")} kg\n` +
              `Alokasi: ${row.berat.toLocaleString("id-ID")} kg`,
          );
          return;
        }
      }
    } else {
      const oldSet = new Set(
        getIdBahanListFromProduksi(produksiLama).map(String),
      );
      const newSet = new Set(idBahanList.map(String));
      for (const oid of oldSet) {
        if (!newSet.has(oid)) {
          alert(
            "Tidak boleh menghapus ID Bahan yang sudah tercatat. Hanya penambahan bahan yang diizinkan.",
          );
          return;
        }
      }
      let sumAlok = 0;
      alokasiBeratBahan.forEach((r) => {
        sumAlok += parseFloat(r.berat) || 0;
      });
      if (Math.abs(sumAlok - beratAwal) > 1e-3) {
        alert(
          "Berat awal harus sama dengan jumlah alokasi semua ID bahan (total otomatis).",
        );
        return;
      }
    }

    // Validasi Natural Process + Fermentasi
    console.log("🔍 Validating Natural Process + Fermentasi...");
    if (
      prosesPengolahan === "Natural Process" &&
      statusTahapan === "Fermentasi"
    ) {
      console.error("❌ Natural Process tidak bisa melalui Fermentasi");
      alert(
        "Natural Process tidak melalui tahapan Fermentasi. Silakan pilih tahapan lain!",
      );
      return;
    }
    console.log("✅ Natural Process validation passed");

    // ==================== GET HACCP CHECKBOXES (dengan null check) ====================
    console.log("🔍 Getting HACCP checkboxes...");
    const haccpBendaAsing = getElementChecked(
      "haccpBendaAsingProduksi",
      produksiLama?.haccp?.bebasBendaAsing || false,
    );
    const haccpHamaJamur = getElementChecked(
      "haccpHamaJamurProduksi",
      produksiLama?.haccp?.bebasHamaJamur || false,
    );
    const haccpKondisiBaik = getElementChecked(
      "haccpKondisiBaikProduksi",
      produksiLama?.haccp?.kondisiBaik || false,
    );

    // Validasi HACCP hanya untuk add mode atau jika checkboxes ada
    console.log("🔍 HACCP values:", {
      haccpBendaAsing,
      haccpHamaJamur,
      haccpKondisiBaik,
    });

    const haccpBendaAsingElement = document.getElementById(
      "haccpBendaAsingProduksi",
    );
    console.log("🔍 HACCP element exists:", !!haccpBendaAsingElement);

    if (
      haccpBendaAsingElement &&
      (!haccpBendaAsing || !haccpHamaJamur || !haccpKondisiBaik)
    ) {
      console.error("❌ HACCP validation failed - checkboxes not all checked");
      alert(
        "Semua checklist HACCP harus dicentang untuk dapat menyimpan data!",
      );
      return;
    }
    console.log("✅ HACCP validation passed");

    const haccp = {
      bebasBendaAsing: haccpBendaAsing,
      bebasHamaJamur: haccpHamaJamur,
      kondisiBaik: haccpKondisiBaik,
    };

    // VERIFY API AVAILABILITY - NO FALLBACK
    console.log("🔍 Verifying API availability...");
    if (!window.API || !window.API.Produksi) {
      const errorMsg =
        "❌ API.Produksi tidak tersedia. Tidak dapat menyimpan data. Pastikan backend MongoDB aktif.";
      console.error(errorMsg);
      alert(errorMsg);
      throw new Error(errorMsg);
    }
    console.log("✅ API.Produksi available");
    console.log("🔄 Preparing produksi data for save...");
    const finalBeratAwal = parseFloat(beratAwal) || 0;

    const produksiData = {
      idProduksi: String(idProduksiForPayload),
      idBahan: String(idBahan),
      idBahanList: idBahanList.map(String),
      alokasiBeratBahan,
      beratAwal: finalBeratAwal,
      beratTerkini: parseFloat(beratTerkini),
      beratAkhir: beratAkhir !== null ? parseFloat(beratAkhir) : null,
      prosesPengolahan: String(prosesPengolahan),
      kadarAir: kadarAir !== null && !isNaN(kadarAir) ? parseFloat(kadarAir) : null,
      varietas: String(varietas),
      tanggalMasuk: String(tanggalMasuk),
      tanggalSekarang: String(tanggalSekarang),
      statusTahapan: String(statusTahapan),
      haccp: {
        bebasBendaAsing: Boolean(haccp.bebasBendaAsing),
        bebasHamaJamur: Boolean(haccp.bebasHamaJamur),
        kondisiBaik: Boolean(haccp.kondisiBaik),
      },
      catatan: String(
        document.getElementById("catatanProduksi")?.value ?? "",
      ).trim(),
    };
    if (isPengemasan) {
      produksiData.beratGreenBeans = parseFloat(getElementValue("beratGreenBeans")) || 0;
      produksiData.beratPixel = parseFloat(getElementValue("beratPixel")) || 0;
    }

    if (!isPengemasan) {
      const me = document.getElementById("metodeBeratTerkini")?.value || "total";
      produksiData.metodeBeratTerkini = me;
      produksiData.beratTerkiniDetailKloter =
        me === "kloter" ? getBeratTerkiniDetailKloterPayload() : null;
    }

    console.log("📦 Produksi data prepared for API:", {
      ...produksiData,
      beratAwal_type: typeof produksiData.beratAwal,
      beratAwal_value: produksiData.beratAwal,
      original_beratAwal_from_lama: produksiLama?.beratAwal,
    });

    if (isEditMode) {
      console.log("📝 UPDATE MODE - Processing history...");
      // Edit mode - produksiLama sudah didefinisikan di atas
      if (produksiLama) {
        // Inisialisasi history jika belum ada
        if (!produksiLama.historyTahapan) {
          produksiLama.historyTahapan = [];
        }

        // Jika status tahapan berubah atau berat terkini berubah, tambahkan ke history
        const statusChanged = produksiLama.statusTahapan !== statusTahapan;
        const beratTerkiniChanged = produksiLama.beratTerkini !== beratTerkini;

        if (statusChanged || beratTerkiniChanged) {
          console.log("📝 Status atau berat terkini changed:", {
            statusChanged,
            beratTerkiniChanged,
            oldStatus: produksiLama.statusTahapan,
            newStatus: statusTahapan,
            oldBeratTerkini: produksiLama.beratTerkini,
            newBeratTerkini: beratTerkini,
          });
          produksiLama.historyTahapan.push({
            statusTahapan: produksiLama.statusTahapan,
            tanggal:
              produksiLama.tanggalSekarang ||
              new Date().toISOString().split("T")[0],
            beratAwal: produksiLama.beratAwal,
            beratTerkini: produksiLama.beratTerkini,
            beratAkhir: produksiLama.beratAkhir,
            kadarAir: produksiLama.kadarAir,
          });
        }

        produksiData.historyTahapan = produksiLama.historyTahapan;
        console.log(
          "📝 History prepared:",
          produksiData.historyTahapan.length,
          "entries",
        );
      } else {
        console.warn("⚠️ produksiLama not found in UPDATE mode!");
      }

      // Update via API (MongoDB ONLY)
      console.log("🔄 Updating produksi via API:", {
        produksiId,
        produksiData: {
          ...produksiData,
          historyTahapan: produksiData.historyTahapan?.length || 0,
        },
      });

      const updateResult = await window.API.Produksi.update(
        produksiId,
        produksiData,
      );
      console.log("✅ Produksi updated in MongoDB:", updateResult);
      
      // Tampilkan notifikasi update
      if (window.showNotification) {
        window.showNotification('update', 'Produksi', 'success');
      }
    } else {
      // Add mode - Create new
      // Inisialisasi history untuk produksi baru
      produksiData.historyTahapan = [
        {
          statusTahapan: statusTahapan,
          tanggal: tanggalSekarang,
          beratAwal: beratAwal,
          beratTerkini: beratTerkini,
          beratAkhir: beratAkhir,
          kadarAir: kadarAir,
        },
      ];

      // Create via API (MongoDB ONLY)
      // NOTE: Backend will generate ID automatically via get_next_id('produksi')
      console.log("🔄 Creating produksi via API (backend will generate ID)");
      const result = await window.API.Produksi.create(produksiData);
      console.log("✅ Produksi created in MongoDB:", result);
      
      // Tampilkan notifikasi create
      if (window.showNotification) {
        window.showNotification('create', 'Produksi', 'success');
      }
    }

    console.log("✅ Save operation completed successfully");

    // Reload data setelah save
    await loadProduksiData();

    // Reload dropdown bahan untuk update info sisa bahan
    await loadBahanOptionsProduksi();

    await displayProduksi();

    window.dispatchEvent(
      new CustomEvent("dataUpdated", { detail: { type: "produksi" } }),
    );

    const saveModalInstance = bootstrap.Modal.getInstance(
      document.getElementById("modalProduksi"),
    );
    if (saveModalInstance) {
      saveModalInstance.hide();
    }

    form.reset();
    currentEditId = null;
    window._produksiEditSnapshot = null;

    // Show success message via notification (not alert)
    // Alert sudah ditangani di bagian create/update di atas
    
    // Auto refresh halaman setelah save berhasil
    setTimeout(() => {
      window.location.reload();
    }, 500);
  } catch (error) {
    console.error("❌ Error saving produksi:", error);
    console.error("Error stack:", error.stack);
    console.error("Error details:", {
      message: error.message,
      status: error.status,
      data: error.data,
    });

    // Extract error message from API response or use default
    let errorMessage = "Error menyimpan data produksi";
    if (error.data && error.data.error) {
      errorMessage = error.data.error;
    } else if (error.message) {
      errorMessage = error.message;
    }

    // Tampilkan notifikasi error
    if (window.showNotification) {
      window.showNotification(produksiId ? 'update' : 'create', 'Produksi', 'error', errorMessage);
    } else {
      alert(`❌ ${errorMessage}`);
    }
  } finally {
    console.log("🏁 saveProduksi() completed");
  }
};

// Fungsi untuk delete produksi (mendaftarkan ke window untuk akses dari HTML)
window.deleteProduksi = async function deleteProduksi(id) {
  try {
    await loadProduksiData();
    const p = produksi.find(
      (item) => item.id === id || item._id === id || item.idProduksi === id,
    );
    if (!p) {
      alert("Data produksi tidak ditemukan!");
      return;
    }

    currentDeleteId = id;
    document.getElementById("deleteProduksiInfo").textContent =
      `${p.idProduksi} - ${p.prosesPengolahan}`;

    const deleteModalInstance = new bootstrap.Modal(
      document.getElementById("modalDelete"),
    );
    deleteModalInstance.show();
  } catch (error) {
    console.error("Error loading produksi for delete:", error);
    alert("Error memuat data produksi");
  }
};

// Fungsi untuk konfirmasi delete (mendaftarkan ke window untuk akses dari HTML)
window.confirmDelete = async function confirmDelete() {
  if (currentDeleteId) {
    try {
      // Simpan idBahan untuk update sisa bahan
      const produksiDihapus = produksi.find(
        (p) =>
          p.id === currentDeleteId ||
          p._id === currentDeleteId ||
          p.idProduksi === currentDeleteId,
      );

      // VERIFY API AVAILABILITY - NO FALLBACK
      if (!window.API || !window.API.Produksi) {
        const errorMsg =
          "❌ API.Produksi tidak tersedia. Tidak dapat menghapus data. Pastikan backend MongoDB aktif.";
        alert(errorMsg);
        throw new Error(errorMsg);
      }

      // Delete via API (MongoDB ONLY)
      console.log("🔄 Deleting produksi via API:", currentDeleteId);
      await window.API.Produksi.delete(currentDeleteId);
      console.log("✅ Produksi deleted from MongoDB");

      // Tampilkan notifikasi delete
      if (window.showNotification) {
        window.showNotification('delete', 'Produksi', 'success');
      }

      // Reload data setelah delete
      await loadProduksiData();

      // Reload dropdown bahan untuk update info sisa (karena produksi dihapus, sisa bahan bertambah)
      if (produksiDihapus && produksiDihapus.idBahan) {
        await loadBahanOptionsProduksi();
      }

      await displayProduksi();

      window.dispatchEvent(
        new CustomEvent("dataUpdated", { detail: { type: "produksi" } }),
      );

      const confirmDeleteModalInstance = bootstrap.Modal.getInstance(
        document.getElementById("modalDelete"),
      );
      if (confirmDeleteModalInstance) {
        confirmDeleteModalInstance.hide();
      }
      currentDeleteId = null;
    } catch (error) {
      console.error("Error deleting produksi:", error);
      // Tampilkan notifikasi error
      if (window.showNotification) {
        window.showNotification('delete', 'Produksi', 'error', 'Gagal menghapus data: ' + (error.message || "Unknown error"));
      } else {
        alert("Error menghapus data: " + (error.message || "Unknown error"));
      }
    }
  }
};

// Event listener
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM Content Loaded - Initializing produksi page");

  setTimeout(async () => {
    try {
      console.log("🔄 Initializing produksi page...");
      await loadProduksiData();
      console.log(`✅ Produksi data loaded: ${produksi.length} items`);
      await displayProduksi();
      await loadProsesPengolahanOptions();
      await loadVarietasOptionsProduksi();
      await loadBahanOptionsProduksi();
      console.log("✅ Produksi page initialization complete");
    } catch (error) {
      console.error("❌ Error initializing produksi page:", error);
      console.error("Error details:", error.stack);
    }
  }, 100);

  window.addEventListener("dataMasterUpdated", async () => {
    await loadProsesPengolahanOptions();
    await loadVarietasOptionsProduksi();
    await loadBahanOptionsProduksi();
  });

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", async () => {
      await displayProduksi();
    });
  }

  const searchForm = document.querySelector('form[role="search"]');
  if (searchForm) {
    searchForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await displayProduksi();
    });
  }

  const modalProduksi = document.getElementById("modalProduksi");
  if (modalProduksi) {
    modalProduksi.addEventListener("show.bs.modal", async () => {
      try {
        await Promise.all([
          loadProsesPengolahanOptions(),
          loadVarietasOptionsProduksi(),
          loadBahanOptionsProduksi(),
          loadTipeProdukOptionsProduksi(),
        ]);
        console.log(
          "✅ All dropdown options loaded for produksi modal (show.bs.modal event)",
        );

        // Reset dropdown tahapan jika tidak ada proses yang dipilih
        const prosesSelect = document.getElementById("prosesPengolahan");
        const statusSelect = document.getElementById("statusTahapan");
        if (prosesSelect && statusSelect && !prosesSelect.value) {
          statusSelect.innerHTML =
            '<option value="">Pilih Status Tahapan</option>';
          const statusInfo = document.getElementById("statusTahapanInfo");
          if (statusInfo) {
            statusInfo.innerHTML =
              '<i class="bi bi-info-circle"></i> Pilih proses pengolahan terlebih dahulu untuk melihat tahapan yang tersedia.';
          }
        }
      } catch (error) {
        console.error(
          "⚠️ Error loading dropdown options in modal event:",
          error,
        );
      }
    });
  }
});
