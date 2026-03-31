/**
 * Calculator Randomen — hanya perhitungan tampilan, tidak menyimpan data.
 * Memakai total berat bahan masuk (jumlah) per idBahan dan produksi
 * dengan tahap pengemasan + berat akhir > 0 dari id bahan yang sama.
 */

const MAX_CALCULATORS = 30;

let cacheBahan = [];
let cacheProduksi = [];

function normId(v) {
  return v == null ? "" : String(v).trim();
}

function isProduksiPengemasanSelesai(p) {
  const st = (p.statusTahapan || "").toLowerCase();
  if (!st.includes("pengemasan")) return false;
  const ba = parseFloat(p.beratAkhir);
  return Number.isFinite(ba) && ba > 0;
}

function eligibleProduksiForBahan(idBahan) {
  const key = normId(idBahan);
  if (!key) return [];
  return cacheProduksi.filter(
    (p) => normId(p.idBahan) === key && isProduksiPengemasanSelesai(p),
  );
}

function totalBeratBahanMasuk(bahanDoc) {
  if (!bahanDoc) return 0;
  const j = parseFloat(bahanDoc.jumlah);
  return Number.isFinite(j) ? j : 0;
}

async function loadMasterData() {
  if (!window.API?.Bahan?.getAll || !window.API?.Produksi?.getAll) {
    throw new Error("API Bahan/Produksi tidak tersedia");
  }
  const [bahan, produksi] = await Promise.all([
    window.API.Bahan.getAll(),
    window.API.Produksi.getAll(),
  ]);
  cacheBahan = Array.isArray(bahan) ? bahan : [];
  cacheProduksi = Array.isArray(produksi) ? produksi : [];
}

function fillBahanSelect(selectEl) {
  if (!selectEl) return;
  const cur = selectEl.value;
  selectEl.innerHTML =
    '<option value="">— Pilih ID Bahan —</option>' +
    cacheBahan
      .filter((b) => b.idBahan)
      .sort((a, b) =>
        String(a.idBahan).localeCompare(String(b.idBahan), "id"),
      )
      .map(
        (b) =>
          `<option value="${escapeAttr(b.idBahan)}">${escapeAttr(b.idBahan)}</option>`,
      )
      .join("");
  if (cur && [...selectEl.options].some((o) => o.value === cur)) {
    selectEl.value = cur;
  }
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function renderProduksiCheckboxes(container, idBahan, selectedIds, cardIdx) {
  if (!container) return;
  const list = eligibleProduksiForBahan(idBahan);
  if (!idBahan) {
    container.innerHTML =
      '<p class="text-muted small mb-0">Pilih ID Bahan terlebih dahulu.</p>';
    return;
  }
  if (list.length === 0) {
    container.innerHTML =
      '<p class="text-muted small mb-0">Tidak ada produksi tahap pengemasan dengan berat akhir &gt; 0 untuk bahan ini.</p>';
    return;
  }
  const sel = new Set((selectedIds || []).map(normId));
  const ci = cardIdx || 0;
  container.innerHTML = list
    .map((p, idx) => {
      const idp = normId(p.idProduksi);
      const checked = sel.has(idp) ? " checked" : "";
      const ba = parseFloat(p.beratAkhir) || 0;
      const fid = `cr_cb_${ci}_${idx}`;
      return `<div class="form-check mb-1">
        <input class="form-check-input cr-prd-cb" type="checkbox" value="${escapeAttr(idp)}" id="${fid}"${checked} />
        <label class="form-check-label small" for="${fid}">${escapeAttr(idp)} <span class="text-muted">(berat akhir ${ba.toLocaleString("id-ID", { maximumFractionDigits: 2 })} kg)</span></label>
      </div>`;
    })
    .join("");
}

function recalcCard(cardEl) {
  const out = cardEl.querySelector(".cr-result");
  const selBahan = cardEl.querySelector(".cr-bahan-select");
  const idBahan = selBahan?.value?.trim() || "";
  const checks = cardEl.querySelectorAll(".cr-prd-cb:checked");
  const ids = [...checks].map((c) => c.value);

  if (!idBahan) {
    out.innerHTML =
      '<span class="text-muted">Pilih ID Bahan dan centang minimal satu ID Produksi.</span>';
    return;
  }
  const bahanDoc = cacheBahan.find((b) => normId(b.idBahan) === idBahan);
  const totalMasuk = totalBeratBahanMasuk(bahanDoc);

  if (ids.length === 0) {
    out.innerHTML = `<div class="mb-1">Total berat bahan masuk: <strong>${totalMasuk.toLocaleString("id-ID", { maximumFractionDigits: 2 })} kg</strong></div>
      <span class="text-warning small">Centang minimal satu ID Produksi (pengemasan selesai) dari bahan yang sama.</span>`;
    return;
  }

  const rows = ids
    .map((idp) => cacheProduksi.find((p) => normId(p.idProduksi) === idp))
    .filter(Boolean);
  const invalid = rows.filter((p) => normId(p.idBahan) !== idBahan);
  if (invalid.length) {
    out.innerHTML =
      '<span class="text-danger small">Ada produksi yang tidak cocok dengan ID Bahan.</span>';
    return;
  }

  const sumBeratAkhir = rows.reduce(
    (s, p) => s + (parseFloat(p.beratAkhir) || 0),
    0,
  );
  const n = ids.length;
  const bagiJumlahId = n > 0 ? totalMasuk / n : 0;
  const rasioBahanPerHasil =
    sumBeratAkhir > 0 ? totalMasuk / sumBeratAkhir : null;

  out.innerHTML = `
    <ul class="list-unstyled small mb-0">
      <li>Total berat bahan masuk: <strong>${totalMasuk.toLocaleString("id-ID", { maximumFractionDigits: 2 })} kg</strong></li>
      <li>Jumlah ID produksi terpilih: <strong>${n}</strong> (tahap pengemasan, berat akhir &gt; 0, id bahan sama)</li>
      <li>Bahan masuk ÷ jumlah ID produksi: <strong>${bagiJumlahId.toLocaleString("id-ID", { maximumFractionDigits: 4 })} kg</strong> per produksi</li>
      <li>Σ berat akhir terpilih: <strong>${sumBeratAkhir.toLocaleString("id-ID", { maximumFractionDigits: 2 })} kg</strong></li>
      <li>Bahan masuk ÷ Σ berat akhir: <strong>${
        rasioBahanPerHasil != null
          ? rasioBahanPerHasil.toLocaleString("id-ID", {
              maximumFractionDigits: 4,
            })
          : "—"
      }</strong>${rasioBahanPerHasil != null ? " (kg bahan per kg hasil kemasan)" : ""}</li>
    </ul>
    <p class="text-muted small mt-2 mb-0"><i class="bi bi-info-circle"></i> Hasil hanya ditampilkan; tidak disimpan ke database.</p>`;
}

function attachCardEvents(cardEl) {
  const sel = cardEl.querySelector(".cr-bahan-select");
  const boxHost = cardEl.querySelector(".cr-produksi-boxes");
  const btnAll = cardEl.querySelector(".cr-select-all-prd");
  const btnNone = cardEl.querySelector(".cr-clear-prd");

  const cardIdx = parseInt(cardEl.dataset.crIndex, 10) || 0;
  sel.addEventListener("change", () => {
    renderProduksiCheckboxes(boxHost, sel.value, [], cardIdx);
    recalcCard(cardEl);
  });

  boxHost.addEventListener("change", (e) => {
    if (e.target.classList.contains("cr-prd-cb")) recalcCard(cardEl);
  });

  btnAll?.addEventListener("click", (ev) => {
    ev.preventDefault();
    boxHost.querySelectorAll(".cr-prd-cb").forEach((c) => {
      c.checked = true;
    });
    recalcCard(cardEl);
  });

  btnNone?.addEventListener("click", (ev) => {
    ev.preventDefault();
    boxHost.querySelectorAll(".cr-prd-cb").forEach((c) => {
      c.checked = false;
    });
    recalcCard(cardEl);
  });
}

function buildCard(index) {
  const wrap = document.createElement("div");
  wrap.className = "card mb-3 shadow-sm";
  wrap.dataset.crIndex = String(index);
  wrap.innerHTML = `
    <div class="card-header py-2 d-flex justify-content-between align-items-center">
      <span class="fw-semibold"><i class="bi bi-calculator me-2"></i>Perhitungan #${index}</span>
    </div>
    <div class="card-body">
      <div class="row g-3">
        <div class="col-md-5">
          <label class="form-label">ID Bahan</label>
          <select class="form-select cr-bahan-select"></select>
        </div>
        <div class="col-md-7">
          <label class="form-label">ID Produksi (pengemasan selesai, bahan sama)</label>
          <div class="d-flex gap-2 mb-2">
            <button type="button" class="btn btn-sm btn-outline-secondary cr-select-all-prd">Pilih semua</button>
            <button type="button" class="btn btn-sm btn-outline-secondary cr-clear-prd">Hapus pilihan</button>
          </div>
          <div class="border rounded p-2 bg-light cr-produksi-boxes" style="max-height: 180px; overflow-y: auto;"></div>
        </div>
      </div>
      <hr class="my-3" />
      <div class="cr-result text-muted">Pilih ID Bahan dan centang minimal satu ID Produksi.</div>
    </div>`;
  fillBahanSelect(wrap.querySelector(".cr-bahan-select"));
  const box = wrap.querySelector(".cr-produksi-boxes");
  renderProduksiCheckboxes(box, "", [], index);
  attachCardEvents(wrap);
  return wrap;
}

function renderCalculators(count) {
  const host = document.getElementById("crCalculatorsHost");
  if (!host) return;
  host.innerHTML = "";
  const n = Math.min(MAX_CALCULATORS, Math.max(1, parseInt(count, 10) || 1));
  for (let i = 1; i <= n; i++) {
    host.appendChild(buildCard(i));
  }
}

function setupDropdownCount() {
  const menu = document.getElementById("crCountMenu");
  const label = document.getElementById("crCountLabel");
  if (!menu || !label) return;
  menu.innerHTML = "";
  for (let i = 1; i <= MAX_CALCULATORS; i++) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.className = "dropdown-item";
    a.href = "#";
    a.textContent = `${i} kalkulator`;
    a.dataset.count = String(i);
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      label.textContent = `${i} kalkulator`;
      renderCalculators(i);
      const btn = document.getElementById("crCountDropdown");
      if (btn && window.bootstrap?.Dropdown) {
        bootstrap.Dropdown.getOrCreateInstance(btn).hide();
      }
    });
    li.appendChild(a);
    menu.appendChild(li);
  }
}

async function initPage() {
  const statusEl = document.getElementById("crLoadStatus");
  try {
    await new Promise((resolve) => {
      if (window.API?.Bahan?.getAll) {
        resolve();
        return;
      }
      window.addEventListener("APIReady", resolve, { once: true });
      setTimeout(resolve, 5000);
    });
    await loadMasterData();
    if (statusEl) statusEl.textContent = "";
    setupDropdownCount();
    renderCalculators(1);
  } catch (e) {
    console.error(e);
    if (statusEl) {
      statusEl.textContent =
        "Gagal memuat data: " + (e.message || String(e));
      statusEl.classList.add("text-danger");
    }
  }
}

document.addEventListener("DOMContentLoaded", initPage);
