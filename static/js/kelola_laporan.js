// Data untuk laporan (MONGODB ONLY - NO localStorage)
// Data di-load dari MongoDB via API di loadAllReportData()
let bahan = [];
let produksi = [];
let hasilProduksi = [];
let sanitasi = [];
let pemasok = [];
let keuangan = [];
let pemesanan = []; // TAMBAHAN: Data pemesanan untuk laporan

/** Produksi sudah pengemasan dengan penyebut rendemen valid: berat green beans, atau fallback berat akhir (data lama). Pixel tidak dipakai. */
function isProduksiPengemasanBeratAkhir(p) {
  const st = (p.statusTahapan || "").toLowerCase();
  if (!st.includes("pengemasan")) return false;
  const gb = parseFloat(p.beratGreenBeans);
  if (Number.isFinite(gb) && gb > 0) return true;
  const ba = parseFloat(p.beratAkhir);
  return Number.isFinite(ba) && ba > 0;
}

/** Randemen agregat = Σ bahan (kg) ÷ Σ berat green beans pengemasan (fallback berat akhir jika GB kosong). Pixel tidak dijumlahkan di penyebut. Dua desimal (sama seperti randomen). */
function formatRandemenCell(totalBahanKg, totalPengemasanKg) {
  const d = Number(totalPengemasanKg) || 0;
  const n = Number(totalBahanKg) || 0;
  if (d <= 0) return "—";
  const r = n / d;
  const PR = typeof window !== "undefined" && window.ProduksiRandomen;
  if (PR && typeof PR.formatRandomenDesimal === "function") {
    return PR.formatRandomenDesimal(r);
  }
  const dua = Math.round(r * 100) / 100;
  return dua.toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

/** Daftar ID bahan dari rekaman produksi (multi-bahan atau legacy tunggal). */
function getIdBahanListFromProduksiLaporan(p) {
  if (!p) return [];
  if (Array.isArray(p.idBahanList) && p.idBahanList.length > 0) {
    return p.idBahanList.map((x) => String(x).trim()).filter(Boolean);
  }
  if (p.idBahan) return [String(p.idBahan).trim()];
  return [];
}

/** Format berat untuk PDF ringkasan produksi (termasuk 0 kg). */
function formatBeratKgLaporanPdf(val) {
  if (val == null || val === "") return "—";
  const n = typeof val === "number" ? val : parseFloat(val);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("id-ID", { maximumFractionDigits: 4 })} kg`;
}

/**
 * Matrix untuk tabel PDF: header + baris per ID bahan dengan pemasok & alokasi.
 * @returns {string[][]|null} null jika tidak ada ID bahan.
 */
function buildMatrixSumberBahanProduksiPdf(item) {
  const ids = getIdBahanListFromProduksiLaporan(item);
  if (!ids.length) return null;
  const map = getBahanMapForLaporan();
  const alokRows = Array.isArray(item.alokasiBeratBahan)
    ? item.alokasiBeratBahan
    : [];
  const alokMap = new Map();
  for (const r of alokRows) {
    const id = String(r.idBahan || "").trim();
    if (id) alokMap.set(id, Number(r.berat) || 0);
  }
  const header = ["No", "ID Bahan", "Pemasok", "Alokasi (kg)"];
  const body = ids.map((idBahan, i) => {
    const b = map.get(idBahan);
    let kg = alokMap.has(idBahan) ? alokMap.get(idBahan) : null;
    if (kg == null && ids.length === 1) {
      const ba = Number(item.beratAwal);
      kg = Number.isFinite(ba) ? ba : null;
    }
    let kgStr = "—";
    if (kg != null && Number.isFinite(kg)) {
      kgStr =
        kg === 0
          ? "0"
          : kg.toLocaleString("id-ID", { maximumFractionDigits: 4 });
    }
    return [String(i + 1), idBahan, (b && b.pemasok) || "—", kgStr];
  });
  return [header, ...body];
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

/** Path foto tahapan produksi yang aman untuk href/img (hanya upload server). */
function fotoTahapanUrlLaporanSafe(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  const prefix = "/static/uploads/produksi_tahapan/";
  if (!s.startsWith(prefix)) return null;
  const tail = s.slice(prefix.length);
  if (!tail || tail.includes("..") || tail.includes("/")) return null;
  return s;
}

/**
 * Muat gambar tahapan untuk jsPDF (JPEG data URL).
 * @returns {Promise<{ dataUrl: string, format: 'JPEG' }|null>}
 */
async function loadFotoTahapanForPdfJs(fotoSrc) {
  const safe = fotoTahapanUrlLaporanSafe(fotoSrc);
  if (!safe) return null;
  const absUrl =
    safe.startsWith("http://") || safe.startsWith("https://")
      ? safe
      : `${window.location.origin}${safe}`;

  const toJpegFromBitmap = (bitmap) => {
    const maxPx = 480;
    let w = bitmap.width;
    let h = bitmap.height;
    if (w > maxPx || h > maxPx) {
      const scale = maxPx / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, w, h);
    try {
      bitmap.close();
    } catch (e) {
      /* ignore */
    }
    return {
      dataUrl: canvas.toDataURL("image/jpeg", 0.88),
      format: "JPEG",
    };
  };

  const jpegFromHtmlImage = (img) => {
    const maxPx = 480;
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (!w || !h) return null;
    if (w > maxPx || h > maxPx) {
      const scale = maxPx / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    return {
      dataUrl: canvas.toDataURL("image/jpeg", 0.88),
      format: "JPEG",
    };
  };

  try {
    const res = await fetch(absUrl, { credentials: "include", mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (typeof createImageBitmap === "function") {
      try {
        const bitmap = await createImageBitmap(blob);
        return toJpegFromBitmap(bitmap);
      } catch (e) {
        /* lanjut ke blob URL */
      }
    }
    const objUrl = URL.createObjectURL(blob);
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objUrl);
        try {
          resolve(jpegFromHtmlImage(img));
        } catch (err) {
          resolve(null);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objUrl);
        resolve(null);
      };
      img.src = objUrl;
    });
  } catch (e) {
    console.warn("loadFotoTahapanForPdfJs fetch", e);
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        resolve(jpegFromHtmlImage(img));
      } catch (err) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = absUrl;
  });
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
function buildAlurProduksiTableRows(item, options = {}) {
  const numericWeight = options.numericWeightInCells === true;
  const rows = [];
  const hist = Array.isArray(item.historyTahapan) ? item.historyTahapan : [];
  const PR = window.ProduksiRandomen;
  const fmtKg = (v) => {
    if (v == null || v === "") return "—";
    const n = typeof v === "number" ? v : parseFloat(v);
    if (!Number.isFinite(n)) return "—";
    const s = n.toLocaleString("id-ID");
    return numericWeight ? s : `${s} kg`;
  };
  const fmtKadar = (v) => {
    if (v == null || v === "") return "—";
    return `${v}%`;
  };
  const fmtRandomen = (hasilKg) => {
    if (!PR) return "—";
    const b = PR.safeNum(item.beratAwal);
    const r = PR.ratioBahanPerHasil(b, hasilKg);
    return r != null ? PR.formatRandomenBanding1(r) : "—";
  };

  if (hist.length === 0) {
    const hk = PR
      ? PR.getHasilKgUntukBarisAlur(item, null, "current")
      : 0;
    const fotoU = fotoTahapanUrlLaporanSafe(item.fotoTahapan);
    rows.push({
      no: "1",
      tahapan: `${item.statusTahapan || "—"} (status saat ini)`,
      tanggal: formatDate(item.tanggalSekarang),
      beratAwal: fmtKg(item.beratAwal),
      beratAkhir: fmtKg(item.beratAkhir),
      randomen: fmtRandomen(hk),
      kadar: fmtKadar(item.kadarAir),
      catatan: (item.catatan && String(item.catatan).trim()) || "—",
      fotoSrc: fotoU,
      fotoPdf: fotoU ? "Ada" : "—",
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
    const fotoU = fotoTahapanUrlLaporanSafe(h.fotoTahapan);
    rows.push({
      no: String(i + 1),
      tahapan,
      tanggal: formatDate(h.tanggal),
      beratAwal: fmtKg(h.beratAwal),
      beratAkhir: fmtKg(h.beratAkhir),
      randomen: fmtRandomen(hk),
      kadar: fmtKadar(h.kadarAir),
      catatan: (h.catatan && String(h.catatan).trim()) || "—",
      fotoSrc: fotoU,
      fotoPdf: fotoU ? "Ada" : "—",
    });
  });
  const n = hist.length + 1;
  const hkCur = PR ? PR.getHasilKgUntukBarisAlur(item, null, "current") : 0;
  const fotoCur = fotoTahapanUrlLaporanSafe(item.fotoTahapan);
  rows.push({
    no: String(n),
    tahapan: `${item.statusTahapan || "—"} (status saat ini)`,
    tanggal: formatDate(item.tanggalSekarang),
    beratAwal: fmtKg(item.beratAwal),
    beratAkhir: fmtKg(item.beratAkhir),
    randomen: fmtRandomen(hkCur),
    kadar: fmtKadar(item.kadarAir),
    catatan: (item.catatan && String(item.catatan).trim()) || "—",
    fotoSrc: fotoCur,
    fotoPdf: fotoCur ? "Ada" : "—",
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

/**
 * Menggambar tabel alur produksi di PDF (kolom Foto: thumbnail gambar jika ada).
 * @returns {Promise<number>} posisi y baru
 */
async function pdfRenderAlurProduksiTable(doc, y, rows) {
  if (!rows || rows.length === 0) return y;
  const hw = [5, 30, 20, 12, 12, 11, 9, 14, 57];
  const n = 9;
  const x = [20];
  for (let i = 0; i < n; i++) x.push(x[i] + hw[i]);
  const lineH = 2.75;
  const padT = 2.5;
  const fotoBoxMm = 12;

  const fotoImgs = await Promise.all(
    rows.map((r) => loadFotoTahapanForPdfJs(r.fotoSrc))
  );

  let rowTop = y;
  const headerCells = [
    "No",
    "Tahapan",
    "Tanggal",
    "B. awal",
    "B. akhir",
    "Randomen",
    "Kadar",
    "Foto",
    "Catatan",
  ];

  function renderRow(cells, isHeader, fotoImg) {
    doc.setFontSize(n > 5 ? 7 : 8);
    doc.setFont(undefined, isHeader ? "bold" : "normal");
    doc.setTextColor(0, 0, 0);
    const cellLines = cells.map((text, i) => {
      if (i === 7 && fotoImg) {
        return [""];
      }
      return doc.splitTextToSize(String(text ?? "—"), hw[i] - 1.5);
    });
    const maxLines = Math.max(1, ...cellLines.map((l) => l.length));
    let rowH = maxLines * lineH + padT * 2;
    if (fotoImg) {
      rowH = Math.max(rowH, fotoBoxMm + padT * 2 + 1);
    }

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
      if (i === 7 && fotoImg) {
        const imgW = Math.min(fotoBoxMm, hw[i] - 2);
        const imgH = imgW;
        const ix = x[i] + (hw[i] - imgW) / 2;
        const iy = rowTop + padT + 0.5;
        try {
          doc.addImage(fotoImg.dataUrl, fotoImg.format, ix, iy, imgW, imgH);
        } catch (err) {
          doc.setFontSize(7);
          doc.setFont(undefined, "normal");
          doc.text("—", x[i] + hw[i] / 2 - 1, rowTop + rowH / 2);
        }
      } else {
        cellLines[i].forEach((line, li) => {
          doc.text(line, x[i] + 0.7, rowTop + padT + 2.8 + li * lineH);
        });
      }
    }
    rowTop += rowH;
  }

  renderRow(headerCells, true, null);

  rows.forEach((r, di) => {
    const fi = fotoImgs[di];
    const cells = [
      r.no,
      r.tahapan,
      r.tanggal,
      r.beratAwal,
      r.beratAkhir,
      r.randomen != null ? r.randomen : "—",
      r.kadar,
      fi ? "\u00a0" : "—",
      r.catatan,
    ];
    renderRow(cells, false, fi || null);
  });

  doc.setFont(undefined, "normal");
  doc.setTextColor(0, 0, 0);
  return rowTop + 4;
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
    <th scope="col" class="text-nowrap" title="N banding 1: kg bahan per 1 kg hasil tahap (dua angka di belakang koma)">Randomen</th>
    <th scope="col" class="text-nowrap">Kadar</th>
    <th scope="col" class="text-center text-nowrap">Foto</th>
    <th scope="col">Catatan</th>
  </tr>`;
  const tbody = rows
    .map((r) => {
      const fotoCell =
        r.fotoSrc != null
          ? `<a href="${escapeHtmlLaporan(r.fotoSrc)}" target="_blank" rel="noopener noreferrer" class="alur-produksi-foto-link d-inline-block" title="Buka foto"><img src="${escapeHtmlLaporan(r.fotoSrc)}" alt="" class="alur-produksi-foto-thumb rounded border" loading="lazy" width="72" height="72"/></a>`
          : '<span class="text-muted user-select-none">—</span>';
      return `
    <tr>
      <td class="text-muted text-nowrap">${escapeHtmlLaporan(r.no)}</td>
      <td>${escapeHtmlLaporan(r.tahapan)}</td>
      <td class="text-nowrap">${escapeHtmlLaporan(r.tanggal)}</td>
      <td class="text-nowrap">${escapeHtmlLaporan(r.beratAwal)}</td>
      <td class="text-nowrap">${escapeHtmlLaporan(r.beratAkhir)}</td>
      <td class="text-nowrap small">${escapeHtmlLaporan(r.randomen != null ? r.randomen : "—")}</td>
      <td class="text-nowrap">${escapeHtmlLaporan(r.kadar)}</td>
      <td class="text-center align-middle p-2">${fotoCell}</td>
      <td class="small text-break">${escapeHtmlLaporan(r.catatan)}</td>
    </tr>`;
    })
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
    refreshLaporanProsesTahapanFilterOptions();

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
    renderBahanPriceStats();

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

/** Nilai rupiah tanpa teks "Rp" (untuk sel tabel; keterangan di header kolom). */
function formatCurrencyNumeric(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return "-";
  return Math.round(Number(amount)).toLocaleString("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
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

/** Isi sel tabel ekspor (PDF/HTML rekap/Excel): hapus sufiks kg jika satuan sudah di header kolom. */
function stripKgSuffixForExportCell(value) {
  if (value === undefined || value === null) return "";
  const s = String(value).trim();
  if (s === "" || s === "—" || s === "-") return s;
  return s.replace(/\s+kg(?:\s*\/\s*kg)?\s*$/i, "").trim();
}

function stripRpPrefixForExportCell(value) {
  if (value === undefined || value === null) return "";
  const s = String(value).trim();
  if (s === "" || s === "—" || s === "-") return s;
  return s
    .replace(/^Rp\.?\s*/i, "")
    .replace(/^[\u202f\xa0\s]+/, "")
    .trim();
}

/** Sel tabel rekap untuk PDF/Excel: angka saja (hapus sufiks kg & prefiks Rp jika masih ada). */
function sanitizeRekapDataCellForExport(raw) {
  if (raw === undefined || raw === null) return "";
  let s = String(raw).trim();
  s = stripKgSuffixForExportCell(s);
  s = stripRpPrefixForExportCell(s);
  return s;
}

/**
 * Isi sel lembar «Data» untuk Excel: angka asli jika kolom punya excelValue,
 * supaya SUM/AVERAGE di spreadsheet jalan.
 */
function rekapExcelCellFromColumn(column, item) {
  if (typeof column.excelValue === "function") {
    try {
      const n = column.excelValue(item);
      if (typeof n === "number" && Number.isFinite(n)) {
        return {
          kind: "number",
          value: n,
          numFmt: column.excelNumFmt,
        };
      }
    } catch (e) {
      console.warn("rekapExcelCellFromColumn excelValue", e);
    }
  }
  const raw = column.value(item);
  if (raw === undefined || raw === null) {
    return { kind: "string", value: "" };
  }
  return {
    kind: "string",
    value: sanitizeRekapDataCellForExport(String(raw)),
  };
}

function parseValidDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date) ? null : date;
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
 * Rendemen agregat untuk daftar bahan terfilter: Σ jumlah (kg) ÷ Σ berat green beans (fallback berat akhir)
 * dari produksi yang idBahan-nya ada di daftar. Pixel tidak masuk penyebut.
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
    const gb = parseFloat(p.beratGreenBeans);
    totalPengemasanKg +=
      Number.isFinite(gb) && gb > 0 ? gb : parseFloat(p.beratAkhir) || 0;
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

/** Rata-rata randomen keseluruhan (mean dari randomen per ID, bukan tertimbang). */
function computeAverageRandomenOverall(items) {
  const PR = typeof window !== "undefined" && window.ProduksiRandomen;
  if (!PR || typeof PR.computeRandomenPerId !== "function") return null;
  if (!Array.isArray(items) || items.length === 0) return null;
  let sum = 0;
  let n = 0;
  items.forEach((p) => {
    const r = PR.computeRandomenPerId(p);
    if (Number.isFinite(r) && r > 0) {
      sum += r;
      n += 1;
    }
  });
  if (n === 0) return null;
  return { avgRatio: sum / n, counted: n };
}

function formatMonthYear(date) {
  if (!date) return "-";
  return date.toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });
}

/** Nama bulan Indonesia untuk angka 1–12 (filter "bulan saja"). */
function formatBulanIndonesia(monthNum) {
  const n = parseInt(String(monthNum), 10);
  if (!Number.isFinite(n) || n < 1 || n > 12) return String(monthNum ?? "");
  const names = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  return names[n - 1];
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
  bahan: { mode: "all", value: "", pemasok: "", prosesPengolahan: "" },
  produksi: {
    mode: "all",
    value: "",
    prosesPengolahan: "",
    statusTahapan: "",
  },
  hasil: { mode: "all", value: "" },
  sanitasi: { mode: "all", value: "" },
  keuangan: { mode: "all", value: "", jenisPengeluaran: "" },
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
        align: "right",
        value: (item) => formatKgValue(safeNumber(item.jumlah)) || "-",
        excelValue: (item) => {
          const j = safeNumber(item.jumlah);
          return j > 0 ? j : null;
        },
        excelNumFmt: "#,##0.00",
      },
      {
        label: "Harga/Kg (Rp)",
        align: "right",
        value: (item) =>
          item.hargaPerKg ? formatCurrencyNumeric(item.hargaPerKg) : "-",
        excelValue: (item) => {
          if (item.hargaPerKg == null || item.hargaPerKg === "") return null;
          const h = safeNumber(item.hargaPerKg);
          return Number.isFinite(h) ? Math.round(h) : null;
        },
        excelNumFmt: "#,##0",
      },
      {
        label: "Total Pengeluaran (Rp)",
        align: "right",
        value: (item) =>
          item.totalPengeluaran
            ? formatCurrencyNumeric(item.totalPengeluaran)
            : "-",
        excelValue: (item) => {
          if (!item.totalPengeluaran) return null;
          const t = safeNumber(item.totalPengeluaran);
          return Number.isFinite(t) ? Math.round(t) : null;
        },
        excelNumFmt: "#,##0",
      },
      {
        label: "Tanggal Masuk",
        value: (item) => formatDate(item.tanggalMasuk),
      },
      {
        label: "Proses pengolahan",
        value: (item) => ringkasanProsesBahanLaporan(item),
      },
      {
        label: "Lunas",
        align: "center",
        value: (item) => (item.lunas ? "Lunas" : "Belum"),
      },
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
        label:
          "Rata-rata Harga/Kg (Rp) — total pengeluaran ÷ total berat (kg)",
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
          return formatCurrencyNumeric(Math.round(avg));
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
      const totalPengeluaranRp = items.reduce((sum, entry) => {
        const tp = safeNumber(entry.totalPengeluaran);
        if (tp > 0) return sum + tp;
        const j = safeNumber(entry.jumlah);
        const h = safeNumber(entry.hargaPerKg);
        return sum + (j > 0 && h > 0 ? j * h : 0);
      }, 0);
      return [
        {
          label: "Harga Tertinggi (Rp/kg)",
          value: `${formatCurrencyNumeric(safeNumber(maxItem.hargaPerKg))} (${
            maxItem.idBahan || "-"
          })`,
        },
        {
          label: "Harga Terendah (Rp/kg)",
          value: `${formatCurrencyNumeric(safeNumber(minItem.hargaPerKg))} (${
            minItem.idBahan || "-"
          })`,
        },
        {
          label: "Total Bahan",
          value: formatKgValue(totalBerat),
        },
        {
          label: "Total pengeluaran terkait bahan masuk",
          value:
            totalPengeluaranRp > 0
              ? formatCurrency(totalPengeluaranRp)
              : "—",
        },
        (() => {
          const { totalBahanKg, totalPengemasanKg } =
            computeRendemenAggregatForBahanItems(items);
          const rasio = formatRandemenCell(totalBahanKg, totalPengemasanKg);
          const detail =
            totalPengemasanKg > 0
              ? `${rasio} | bahan ${formatKgValue(
                  totalBahanKg
                )}, Σ GB (randomen) ${formatKgValue(totalPengemasanKg)}`
              : `${rasio} | belum ada berat green beans / berat akhir pengemasan untuk ID bahan pada filter ini`;
          return {
            label: "Rendemen (Σ bahan kg ÷ Σ berat green beans)",
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
        align: "right",
        value: (item) =>
          safeNumber(item.beratAwal)
            ? `${safeNumber(item.beratAwal).toLocaleString("id-ID")} kg`
            : "-",
        excelValue: (item) => {
          const x = safeNumber(item.beratAwal);
          return x > 0 ? x : null;
        },
        excelNumFmt: "#,##0.00",
      },
      {
        label: "Berat Akhir (kg)",
        align: "right",
        value: (item) =>
          safeNumber(item.beratAkhir)
            ? `${safeNumber(item.beratAkhir).toLocaleString("id-ID")} kg`
            : "-",
        excelValue: (item) => {
          const x = safeNumber(item.beratAkhir);
          return x > 0 ? x : null;
        },
        excelNumFmt: "#,##0.00",
      },
      {
        label: "Randomen ID (N banding 1, 2 desimal)",
        align: "right",
        value: (item) =>
          window.ProduksiRandomen
            ? window.ProduksiRandomen.formatRandomenPerIdCell(item)
            : "—",
        excelValue: (item) => {
          const PR = window.ProduksiRandomen;
          if (!PR) return null;
          const r = PR.computeRandomenPerId(item);
          const n = PR.roundBahanPerSatuKgHasil(r);
          return n != null ? n : null;
        },
        excelNumFmt: "0.00",
      },
      {
        label: "Proses",
        value: (item) => getProsesPengolahanTampilanLaporan(item),
      },
      {
        label: "Kadar Air",
        align: "center",
        value: (item) => (item.kadarAir ? `${item.kadarAir}%` : "-"),
        excelValue: (item) => {
          if (item.kadarAir == null || item.kadarAir === "") return null;
          if (typeof item.kadarAir === "number" && Number.isFinite(item.kadarAir)) {
            return item.kadarAir > 0 ? item.kadarAir : null;
          }
          const raw = String(item.kadarAir).replace(/%/g, "").trim();
          const normalized = raw.includes(",")
            ? raw.replace(/\./g, "").replace(",", ".")
            : raw;
          const k = safeNumber(normalized);
          return k > 0 ? k : null;
        },
        excelNumFmt: "0.00",
      },
      {
        label: "Tanggal Masuk",
        value: (item) => formatDate(item.tanggalMasuk),
      },
      {
        label: "Tanggal Sekarang",
        value: (item) => formatDate(item.tanggalSekarang),
      },
      {
        label: "Status Tahapan",
        align: "center",
        value: (item) => item.statusTahapan || "-",
      },
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

      // Agregat Σ berat awal per proses (= bahan masuk ke produksi per baris rekap)
      const prosesBeratAwal = {};
      const bahanMapSummary = getBahanMapForLaporan();
      items.forEach((entry) => {
        const proses =
          getProsesPengolahanTampilanLaporan(entry, bahanMapSummary) || "-";
        const kg = safeNumber(entry.beratAwal);
        prosesBeratAwal[proses] = (prosesBeratAwal[proses] || 0) + kg;
      });

      let prosesPalingBanyak = null;
      let prosesPalingSedikit = null;
      let maxKg = -Infinity;
      let minKg = Infinity;

      Object.keys(prosesBeratAwal).forEach((proses) => {
        const kg = prosesBeratAwal[proses];
        if (kg > maxKg) {
          maxKg = kg;
          prosesPalingBanyak = proses;
        }
        if (kg < minKg) {
          minKg = kg;
          prosesPalingSedikit = proses;
        }
      });

      const avgRnd = computeAverageRandomenOverall(items);

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
          label: "Rata-rata randomen keseluruhan",
          value: (() => {
            const PR = window.ProduksiRandomen;
            if (!avgRnd || !PR) return "—";
            return `${PR.formatRandomenBanding1(avgRnd.avgRatio)} (dari ${avgRnd.counted} batch pengemasan)`;
          })(),
        },
        {
          label: "Proses pengolahan paling banyak (berdasarkan bahan masuk)",
          value: prosesPalingBanyak
            ? `${prosesPalingBanyak} — Σ ${formatKgValue(maxKg)} berat awal`
            : "-",
        },
        {
          label: "Proses pengolahan paling sedikit (berdasarkan bahan masuk)",
          value: prosesPalingSedikit
            ? `${prosesPalingSedikit} — Σ ${formatKgValue(minKg)} berat awal`
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
        align: "right",
        value: (item) =>
          safeNumber(item.beratSaatIni)
            ? `${safeNumber(item.beratSaatIni).toLocaleString("id-ID")} kg`
            : "-",
        excelValue: (item) => {
          const x = safeNumber(item.beratSaatIni);
          return x > 0 ? x : null;
        },
        excelNumFmt: "#,##0.00",
      },
      {
        label: "Jumlah",
        align: "right",
        value: (item) =>
          safeNumber(item.jumlah)
            ? safeNumber(item.jumlah).toLocaleString("id-ID")
            : "-",
        excelValue: (item) => {
          const x = safeNumber(item.jumlah);
          return x > 0 ? x : null;
        },
        excelNumFmt: "#,##0.##",
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
      {
        label: "Status",
        align: "center",
        value: (item) => item.status || "-",
      },
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
        label: "Nilai (Rp)",
        align: "right",
        value: (item) =>
          item.nilai ? formatCurrencyNumeric(item.nilai) : "-",
        excelValue: (item) => {
          if (item.nilai == null || item.nilai === "") return null;
          const n = safeNumber(item.nilai);
          return Number.isFinite(n) ? Math.round(n) : null;
        },
        excelNumFmt: "#,##0",
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
          label: "Maksimal Total Pengeluaran (Rp)",
          value: `${formatCurrencyNumeric(safeNumber(maxItem.nilai))} (${
            maxItem.jenisPengeluaran || "-"
          }${maxItem.idBahanBaku ? ` - ${maxItem.idBahanBaku}` : ""})`,
        },
        {
          label: "Total Pengeluaran (Rp)",
          value: formatCurrencyNumeric(totalPengeluaran),
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
        align: "right",
        value: (item) =>
          safeNumber(item.totalBerat)
            ? `${safeNumber(item.totalBerat).toLocaleString("id-ID", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} kg`
            : "-",
        excelValue: (item) => {
          const x = safeNumber(item.totalBerat);
          return x > 0 ? x : null;
        },
        excelNumFmt: "#,##0.00",
      },
    ],
    filterKey: "stok",
    dataset: async () => {
      // Gunakan API Stok.getAll() seperti di displayStok()
      try {
        if (window.API && window.API.Stok && window.API.Stok.getAll) {
          const res = await window.API.Stok.getAll({});
          return res.rows || [];
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
  pemesanan: {
    title: "Laporan Rekap Pemesanan",
    extraSummaryHeading: "Total keseluruhan (filter saat ini)",
    extraSummaryWrapClass: "summary rekap-summary-panel rekap-summary-extra",
    columns: [
      { label: "ID Pembelian", value: (item) => item.idPembelian || "-" },
      {
        label: "Tanggal",
        value: (item) => formatDate(item.tanggalPemesanan),
      },
      { label: "Nama Pembeli", value: (item) => item.namaPembeli || "-" },
      {
        label: "Tipe pemesanan",
        align: "center",
        value: (item) => item.tipePemesanan || "-",
      },
      { label: "Negara", value: (item) => item.negara || "-" },
      { label: "Tipe produk", value: (item) => item.tipeProduk || "-" },
      { label: "Jenis kopi", value: (item) => item.jenisKopi || "-" },
      {
        label: "Proses pengolahan",
        value: (item) =>
          (item.prosesPengolahan && String(item.prosesPengolahan).trim()) || "-",
      },
      {
        label: "Jumlah (kg)",
        align: "right",
        value: (item) =>
          safeNumber(item.jumlahPesananKg)
            ? formatKgValue(safeNumber(item.jumlahPesananKg))
            : "-",
        excelValue: (item) => {
          const x = safeNumber(item.jumlahPesananKg);
          return x > 0 ? x : null;
        },
        excelNumFmt: "#,##0.00",
      },
      {
        label: "Harga/kg (Rp)",
        align: "right",
        value: (item) =>
          item.hargaPerKg != null && item.hargaPerKg !== ""
            ? formatCurrencyNumeric(safeNumber(item.hargaPerKg))
            : "-",
        excelValue: (item) => {
          if (item.hargaPerKg == null || item.hargaPerKg === "") return null;
          const n = safeNumber(item.hargaPerKg);
          return Number.isFinite(n) ? Math.round(n) : null;
        },
        excelNumFmt: "#,##0",
      },
      {
        label: "Biaya pajak (Rp)",
        align: "right",
        value: (item) =>
          item.biayaPajak != null && item.biayaPajak !== ""
            ? formatCurrencyNumeric(safeNumber(item.biayaPajak))
            : "-",
        excelValue: (item) => {
          if (item.biayaPajak == null || item.biayaPajak === "") return null;
          const n = safeNumber(item.biayaPajak);
          return Number.isFinite(n) ? Math.round(n) : null;
        },
        excelNumFmt: "#,##0",
      },
      {
        label: "Biaya pengiriman (Rp)",
        align: "right",
        value: (item) =>
          item.biayaPengiriman != null && item.biayaPengiriman !== ""
            ? formatCurrencyNumeric(safeNumber(item.biayaPengiriman))
            : "-",
        excelValue: (item) => {
          if (item.biayaPengiriman == null || item.biayaPengiriman === "")
            return null;
          const n = safeNumber(item.biayaPengiriman);
          return Number.isFinite(n) ? Math.round(n) : null;
        },
        excelNumFmt: "#,##0",
      },
      {
        label: "Total harga (Rp)",
        align: "right",
        value: (item) =>
          item.totalHarga != null && item.totalHarga !== ""
            ? formatCurrencyNumeric(safeNumber(item.totalHarga))
            : "-",
        excelValue: (item) => {
          if (item.totalHarga == null || item.totalHarga === "") return null;
          const n = safeNumber(item.totalHarga);
          return Number.isFinite(n) ? Math.round(n) : null;
        },
        excelNumFmt: "#,##0",
      },
      {
        label: "Status pemesanan",
        align: "center",
        value: (item) => item.statusPemesanan || "-",
      },
      {
        label: "Status pembayaran",
        align: "center",
        value: (item) => item.statusPembayaran || "-",
      },
      {
        label: "Catatan",
        value: (item) =>
          (item.catatanPemesanan && String(item.catatanPemesanan).trim()) || "-",
      },
    ],
    filterKey: "pemesanan",
    dataset: () => pemesanan,
    dateGetter: (item) => item.tanggalPemesanan,
    extraSummary: (items) => {
      if (!items.length) return [];
      const totalKg = items.reduce(
        (sum, p) => sum + safeNumber(p.jumlahPesananKg),
        0
      );
      const totalHarga = items.reduce(
        (sum, p) => sum + safeNumber(p.totalHarga),
        0
      );
      return [
        {
          label: "Total jumlah pesanan (kg)",
          value: formatKgValue(totalKg),
        },
        {
          label: "Total harga (Rp)",
          value: formatCurrencyNumeric(totalHarga),
        },
      ];
    },
  },
  pemasok: {
    title: "Laporan Rekap Pemasok",
    columns: [
      { label: "ID Pemasok", value: (item) => item.idPemasok || "-" },
      { label: "Nama", value: (item) => item.nama || "-" },
      { label: "Alamat", value: (item) => item.alamat || "-" },
      { label: "Kontak", value: (item) => item.kontak || "-" },
      {
        label: "Nama Perkebunan",
        value: (item) => item.namaPerkebunan || "-",
      },
      {
        label: "Status",
        align: "center",
        value: (item) =>
          item.status === "Utama"
            ? "Utama"
            : item.status === "Cadangan"
              ? "Cadangan"
              : item.status || "-",
      },
    ],
    filterKey: "pemasok",
    dataset: () => pemasok,
    dateGetter: () => null,
    extraSummary: (items) => {
      if (!items.length) return [];
      let utama = 0;
      let cadangan = 0;
      items.forEach((x) => {
        if (x.status === "Utama") utama++;
        else if (x.status === "Cadangan") cadangan++;
      });
      return [
        { label: "Jumlah pemasok", value: String(items.length) },
        { label: "Status Utama", value: String(utama) },
        { label: "Status Cadangan", value: String(cadangan) },
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
  } else if (mode === "month_only") {
    input.type = "number";
    input.min = "1";
    input.max = "12";
    input.step = "1";
    input.placeholder = "1–12 (mis. 4 = April)";
    input.disabled = false;
    const v = tableFilters[input.dataset.category]?.value;
    const n = v != null && String(v).trim() !== "" ? parseInt(String(v), 10) : NaN;
    input.value =
      Number.isFinite(n) && n >= 1 && n <= 12 ? String(n) : "";
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
          tableFilters[category] = {
            mode: "all",
            value: "",
            pemasok: "",
            prosesPengolahan: "",
          };
          const pemSel = document.getElementById("bahanFilterPemasok");
          if (pemSel) pemSel.value = "";
          const prosesSel = document.getElementById("bahanFilterProses");
          if (prosesSel) prosesSel.value = "";
        } else if (category === "produksi") {
          tableFilters[category] = {
            mode: "all",
            value: "",
            prosesPengolahan: "",
            statusTahapan: "",
          };
          const ps = document.getElementById("produksiFilterProses");
          const th = document.getElementById("produksiFilterTahapan");
          if (ps) ps.value = "";
          if (th) th.value = "";
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
  if (filter.mode === "month_only") {
    const want = parseInt(String(filter.value).trim(), 10);
    if (!Number.isFinite(want) || want < 1 || want > 12) return true;
    return date.getMonth() + 1 === want;
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

function normalizeLaporanFilterStr(s) {
  return String(s || "").trim().toLowerCase();
}

/** Bahan masuk: filter waktu + pemasok + opsional proses pengolahan (untuk tabel & rekap). */
function getBahanFilteredForDisplay() {
  let data = applyTableFilter("bahan", bahan, (item) => item.tanggalMasuk);
  const bf = tableFilters.bahan;
  const pem = bf && bf.pemasok;
  if (pem) {
    data = data.filter((item) => (item.pemasok || "") === pem);
  }
  const proses = bf && bf.prosesPengolahan;
  if (proses) {
    const pn = normalizeLaporanFilterStr(proses);
    data = data.filter((item) => {
      const lines = Array.isArray(item.prosesBahan) ? item.prosesBahan : [];
      return lines.some(
        (l) =>
          normalizeLaporanFilterStr(l && l.prosesPengolahan) === pn
      );
    });
  }
  return data;
}

/** Produksi: filter waktu + opsional proses pengolahan + status tahapan (untuk tabel, timeline & rekap). */
function getProduksiFilteredForDisplay() {
  let data = applyTableFilter(
    "produksi",
    produksi,
    (item) => item.tanggalMasuk
  );
  const pf = tableFilters.produksi;
  if (!pf) return data;
  const bahanMap = getBahanMapForLaporan();
  const fp = pf.prosesPengolahan;
  if (fp) {
    const fpn = normalizeLaporanFilterStr(fp);
    data = data.filter(
      (p) =>
        normalizeLaporanFilterStr(
          getProsesPengolahanTampilanLaporan(p, bahanMap)
        ) === fpn
    );
  }
  const ft = pf.statusTahapan;
  if (ft) {
    const ftn = normalizeLaporanFilterStr(ft);
    data = data.filter(
      (p) => normalizeLaporanFilterStr(p.statusTahapan) === ftn
    );
  }
  if (typeof window.sortProduksiDocumentsByTahapanThenId === "function") {
    return window.sortProduksiDocumentsByTahapanThenId(data);
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
  if (!tableFilters.bahan)
    tableFilters.bahan = {
      mode: "all",
      value: "",
      pemasok: "",
      prosesPengolahan: "",
    };
  const keep = prev && names.has(prev) ? prev : "";
  tableFilters.bahan.pemasok = keep;
  sel.value = keep;
}

/** Isi dropdown proses (bahan & produksi) dan tahapan produksi dari data terbaru. */
function refreshLaporanProsesTahapanFilterOptions() {
  const ensureBahanFilter = () => {
    if (!tableFilters.bahan)
      tableFilters.bahan = {
        mode: "all",
        value: "",
        pemasok: "",
        prosesPengolahan: "",
      };
    if (!Object.prototype.hasOwnProperty.call(tableFilters.bahan, "prosesPengolahan"))
      tableFilters.bahan.prosesPengolahan = "";
  };
  const ensureProduksiFilter = () => {
    if (!tableFilters.produksi)
      tableFilters.produksi = {
        mode: "all",
        value: "",
        prosesPengolahan: "",
        statusTahapan: "",
      };
    if (!Object.prototype.hasOwnProperty.call(tableFilters.produksi, "prosesPengolahan"))
      tableFilters.produksi.prosesPengolahan = "";
    if (!Object.prototype.hasOwnProperty.call(tableFilters.produksi, "statusTahapan"))
      tableFilters.produksi.statusTahapan = "";
  };

  const fillSelect = (sel, emptyLabel, values, filterObj, prop) => {
    if (!sel) return;
    const set = new Set(values.filter(Boolean));
    const prev = filterObj[prop] || "";
    const keep = prev && set.has(prev) ? prev : "";
    filterObj[prop] = keep;
    sel.innerHTML = "";
    const o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = emptyLabel;
    sel.appendChild(o0);
    [...set]
      .sort((a, b) => a.localeCompare(b, "id"))
      .forEach((v) => {
        const o = document.createElement("option");
        o.value = v;
        o.textContent = v;
        sel.appendChild(o);
      });
    sel.value = keep;
  };

  ensureBahanFilter();
  const prosesBahanNames = [];
  (bahan || []).forEach((b) => {
    (b.prosesBahan || []).forEach((line) => {
      const n = (line && line.prosesPengolahan && String(line.prosesPengolahan).trim()) || "";
      if (n) prosesBahanNames.push(n);
    });
  });
  fillSelect(
    document.getElementById("bahanFilterProses"),
    "Semua proses pengolahan",
    prosesBahanNames,
    tableFilters.bahan,
    "prosesPengolahan"
  );

  ensureProduksiFilter();
  const bahanMap = getBahanMapForLaporan();
  const prosesProdNames = [];
  const tahapanNames = [];
  (produksi || []).forEach((p) => {
    const t = getProsesPengolahanTampilanLaporan(p, bahanMap);
    if (t && t !== "-") prosesProdNames.push(String(t).trim());
    const st = (p.statusTahapan && String(p.statusTahapan).trim()) || "";
    if (st) tahapanNames.push(st);
  });
  fillSelect(
    document.getElementById("produksiFilterProses"),
    "Semua proses pengolahan",
    prosesProdNames,
    tableFilters.produksi,
    "prosesPengolahan"
  );
  fillSelect(
    document.getElementById("produksiFilterTahapan"),
    "Semua tahapan",
    tahapanNames,
    tableFilters.produksi,
    "statusTahapan"
  );
}

function initializeLaporanProsesTahapanFilterListeners() {
  const bp = document.getElementById("bahanFilterProses");
  if (bp && bp.dataset.laporanBound !== "1") {
    bp.dataset.laporanBound = "1";
    bp.addEventListener("change", () => {
      if (!tableFilters.bahan)
        tableFilters.bahan = {
          mode: "all",
          value: "",
          pemasok: "",
          prosesPengolahan: "",
        };
      tableFilters.bahan.prosesPengolahan = bp.value;
      renderTableByCategory("bahan");
    });
  }
  const pp = document.getElementById("produksiFilterProses");
  if (pp && pp.dataset.laporanBound !== "1") {
    pp.dataset.laporanBound = "1";
    pp.addEventListener("change", () => {
      if (!tableFilters.produksi)
        tableFilters.produksi = {
          mode: "all",
          value: "",
          prosesPengolahan: "",
          statusTahapan: "",
        };
      tableFilters.produksi.prosesPengolahan = pp.value;
      renderTableByCategory("produksi");
    });
  }
  const pt = document.getElementById("produksiFilterTahapan");
  if (pt && pt.dataset.laporanBound !== "1") {
    pt.dataset.laporanBound = "1";
    pt.addEventListener("change", () => {
      if (!tableFilters.produksi)
        tableFilters.produksi = {
          mode: "all",
          value: "",
          prosesPengolahan: "",
          statusTahapan: "",
        };
      tableFilters.produksi.statusTahapan = pt.value;
      renderTableByCategory("produksi");
    });
  }
}

function initializeBahanPemasokFilterListener() {
  const sel = document.getElementById("bahanFilterPemasok");
  if (!sel || sel.dataset.laporanBound === "1") return;
  sel.dataset.laporanBound = "1";
  sel.addEventListener("change", () => {
    if (!tableFilters.bahan)
      tableFilters.bahan = {
        mode: "all",
        value: "",
        pemasok: "",
        prosesPengolahan: "",
      };
    tableFilters.bahan.pemasok = sel.value;
    renderTableByCategory("bahan");
  });
}

function updateBahanPemasokInsight() {
  const el = document.getElementById("bahanPemasokInsight");
  if (!el) return;
  const filtered = getBahanFilteredForDisplay();
  const pemFilter = tableFilters.bahan && tableFilters.bahan.pemasok;
  if (pemFilter) {
    const kg = filtered.reduce((s, i) => s + safeNumber(i.jumlah), 0);
    el.innerHTML = `<span class="text-dark fw-semibold">${pemFilter}</span> — total masuk <strong>${formatKgValue(
      kg
    )}</strong> dari <strong>${filtered.length}</strong> transaksi (sesuai filter).`;
    return;
  }
  const bySupplier = {};
  filtered.forEach((item) => {
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
      return getProduksiFilteredForDisplay();
    case "hasil":
      return applyTableFilter("hasil", hasilProduksi, (item) => item.tanggal);
    case "sanitasi":
      return applyTableFilter("sanitasi", sanitasi, (item) => item.tanggal);
    case "keuangan":
      return applyTableFilter("keuangan", keuangan, (item) => item.tanggal);
    case "stok":
      // Gunakan cached stok array dari displayStok() atau fallback ke empty array
      return window.cachedStokArray || [];
    case "pemesanan":
      return getPemesananFilteredForLaporan();
    case "pemasok":
      return Array.isArray(pemasok) ? [...pemasok] : [];
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
      <div class="summary rekap-subtable-card">
        <div class="inner">
        <h2>Rekap randomen per proses pengolahan</h2>
        <p class="meta">
          Belum ada batch pengemasan lengkap (berat awal &amp; berat green beans atau berat akhir valid) pada filter ini.
        </p>
        </div>
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
      <td>${row.batch ?? "—"}</td>
      <td>${fmtKg(row.bahan)}</td>
      <td>${fmtKg(row.hasil)}</td>
      <td>${r != null ? PR.formatRandomenBanding1(r) : "—"}</td>
    </tr>`;
    })
    .join("");

  const trTotal =
    agg.sumHasil > 0
      ? `<tr class="rekap-subtable-total">
      <td><strong>Total (keseluruhan)</strong></td>
      <td><strong>${totalBatch}</strong></td>
      <td><strong>${fmtKg(agg.sumBahan)}</strong></td>
      <td><strong>${fmtKg(agg.sumHasil)}</strong></td>
      <td><strong>${PR.formatRandomenBanding1(
        agg.totalRatio
      )}</strong></td>
    </tr>`
      : "";

  return `
      <div class="summary rekap-subtable-card">
        <div class="inner">
        <h2>Rekap randomen per proses pengolahan</h2>
        <p class="meta">
          Randomen: <strong>N banding 1</strong> (N kg bahan per 1 kg <strong>green beans</strong>), tampilan <strong>dua desimal</strong> dari hasil pembagian. Penyebut = berat green beans; pixel tidak dihitung. Data lama tanpa GB memakai berat akhir. Hanya batch pengemasan dengan berat valid.
        </p>
        <table>
          <thead>
            <tr>
              <th>Proses pengolahan</th>
              <th>Jumlah batch</th>
              <th>Σ Berat awal (kg)</th>
              <th>Σ Berat GB randomen (kg)</th>
              <th>Randomen (N banding 1, 2 desimal)</th>
            </tr>
          </thead>
          <tbody>
            ${bodyRows}
            ${trTotal}
          </tbody>
        </table>
        </div>
      </div>`;
}

/** Agregat pemesanan: banyaknya baris (kloter) & total kg per proses pengolahan. */
function aggregatePemesananPerProses(items) {
  const byProses = new Map();
  if (!Array.isArray(items)) return [];
  items.forEach((p) => {
    const inner =
      Array.isArray(p.kloter) && p.kloter.length
        ? p.kloter
        : Array.isArray(p.items) && p.items.length
          ? p.items
          : null;
    const pieces = inner
      ? inner.map((r) => {
          const kg = safeNumber(
            r.beratKg != null && r.beratKg !== ""
              ? r.beratKg
              : r.jumlahPesananKg,
          );
          return {
            prosesPengolahan: r.prosesPengolahan,
            jumlahPesananKg: kg,
          };
        })
      : [
          {
            prosesPengolahan: p.prosesPengolahan,
            jumlahPesananKg: safeNumber(p.jumlahPesananKg),
          },
        ];
    pieces.forEach((row) => {
      const raw =
        (row.prosesPengolahan && String(row.prosesPengolahan).trim()) || "";
      const key = raw || "(Tanpa proses pengolahan)";
      const cur = byProses.get(key) || { kg: 0, n: 0 };
      cur.kg += safeNumber(row.jumlahPesananKg);
      cur.n += 1;
      byProses.set(key, cur);
    });
  });
  return [...byProses.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "id"))
    .map(([nama, { kg, n }]) => ({ nama, kg, n }));
}

/** Blok tabel ringkasan per proses (lihat rekap / cetak) — selaras pola rekap produksi. */
function htmlRekapPemesananAggPerProses(items) {
  const rows = aggregatePemesananPerProses(items);
  if (!rows.length) return "";
  const fmtKg = (n) =>
    Number.isFinite(n)
      ? n.toLocaleString("id-ID", { maximumFractionDigits: 4 })
      : "—";
  const body = rows
    .map(
      (r) =>
        `<tr>
      <td>${escapeHtmlLaporan(r.nama)}</td>
      <td>${r.n}</td>
      <td>${fmtKg(r.kg)}</td>
    </tr>`
    )
    .join("");
  const totalN = rows.reduce((s, r) => s + r.n, 0);
  const totalKg = rows.reduce((s, r) => s + r.kg, 0);
  return `
      <div class="summary rekap-subtable-card">
        <div class="inner">
        <h2>Ringkasan per proses pengolahan</h2>
        <p class="meta">
          <strong>Jumlah baris</strong> = banyaknya kloter / baris produk (jika satu dokumen punya beberapa kloter, tiap kloter dihitung).
          <strong>Total kg</strong> = penjumlahan berat (kg) per proses pengolahan.
        </p>
        <table>
          <thead>
            <tr>
              <th>Proses pengolahan</th>
              <th>Jumlah baris</th>
              <th>Total kg</th>
            </tr>
          </thead>
          <tbody>
            ${body}
            <tr class="rekap-subtable-total">
              <td><strong>Total</strong></td>
              <td><strong>${totalN}</strong></td>
              <td><strong>${fmtKg(totalKg)}</strong></td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>`;
}

/** Matriks untuk lembar Excel «Per proses» (pemesanan). */
function buildPemesananPerProsesSheetMatrix(items) {
  const rows = aggregatePemesananPerProses(items);
  const header = ["Proses pengolahan", "Jumlah baris", "Total kg"];
  if (!rows.length) return [header, ["—", "", ""]];
  const body = rows.map((r) => [r.nama, r.n, r.kg]);
  const totalN = rows.reduce((s, r) => s + r.n, 0);
  const totalKg = rows.reduce((s, r) => s + r.kg, 0);
  return [header, ...body, ["Total", totalN, totalKg]];
}

function getFilterDescription(category) {
  if (category === "pemesanan") {
    const parts = [];
    const elT = document.getElementById("pemesananFilterTanggal");
    const elB = document.getElementById("pemesananFilterBulan");
    const elS = document.getElementById("pemesananFilterStatus");
    const elTip = document.getElementById("pemesananFilterTipe");
    const ft = elT && elT.value;
    const fb = elB && elB.value;
    const fs = elS && elS.value;
    const ftip = elTip && elTip.value;
    if (ft) parts.push(`Tanggal: ${formatDate(ft)}`);
    if (fb) {
      const m = parseInt(String(fb), 10);
      if (Number.isFinite(m) && m >= 1 && m <= 12) {
        parts.push(`Bulan: ${formatBulanIndonesia(m)} (semua tahun)`);
      }
    }
    if (fs) parts.push(`Status: ${fs}`);
    if (ftip) parts.push(`Tipe: ${ftip}`);
    return parts.length ? parts.join(" | ") : "Filter: semua pemesanan";
  }
  if (category === "pemasok") {
    return "Data: semua pemasok terdaftar";
  }
  const filter = tableFilters[category];
  let timePart = "Periode: Semua";
  if (filter && filter.mode !== "all" && filter.value) {
    if (filter.mode === "daily") {
      timePart = `Periode: Harian (${formatDate(filter.value)})`;
    } else if (filter.mode === "monthly") {
      const date = new Date(`${filter.value}-01`);
      timePart = `Periode: Bulanan (${formatMonthYear(date)})`;
    } else if (filter.mode === "month_only") {
      const m = parseInt(String(filter.value), 10);
      timePart =
        Number.isFinite(m) && m >= 1 && m <= 12
          ? `Periode: ${formatBulanIndonesia(m)} (semua tahun)`
          : "Periode: Bulan (semua tahun)";
    } else if (filter.mode === "yearly") {
      timePart = `Periode: Tahunan (${filter.value})`;
    }
  }
  if (category === "bahan" && filter) {
    const parts = [timePart];
    if (filter.pemasok) parts.push(`Pemasok: ${filter.pemasok}`);
    if (filter.prosesPengolahan)
      parts.push(`Proses pengolahan: ${filter.prosesPengolahan}`);
    return parts.join(" | ");
  }
  if (category === "produksi" && filter) {
    const parts = [timePart];
    if (filter.prosesPengolahan)
      parts.push(`Proses: ${filter.prosesPengolahan}`);
    if (filter.statusTahapan)
      parts.push(`Tahapan: ${filter.statusTahapan}`);
    return parts.join(" | ");
  }
  return timePart;
}

const REKAP_CATEGORY_FILE_SLUG = {
  bahan: "bahan_masuk",
  produksi: "produksi",
  hasil: "hasil_produksi",
  sanitasi: "sanitasi",
  keuangan: "pengeluaran",
  stok: "stok",
  pemesanan: "pemesanan",
  pemasok: "pemasok",
};

/** Muat data rekap sesuai filter. error: 'no_config' | 'no_data' jika gagal. */
async function loadRekapExportContext(category) {
  if (category === "pemesanan" || category === "pemasok") {
    await loadAllReportData();
  }
  const config = LAPORAN_REKAP_CONFIG[category];
  if (!config) return { error: "no_config" };

  let data;
  if (typeof config.dataset === "function" && category === "stok") {
    data = await config.dataset();
  } else {
    data = getFilteredDataForCategory(category);
  }

  if (!data || data.length === 0) {
    return { error: "no_data" };
  }

  return {
    config,
    data,
    filterInfo: getFilterDescription(category),
    generatedAt: new Date().toLocaleString("id-ID", {
      dateStyle: "long",
      timeStyle: "short",
    }),
  };
}

function rekapExportFilenameBase(category) {
  const slug = REKAP_CATEGORY_FILE_SLUG[category] || "rekap";
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `Rekap_${slug}_${y}-${m}-${day}`;
}

/** Baris untuk lembar "Randomen per proses" di Excel (sama logika dengan rekap PDF produksi). */
function buildRandomenPerProsesSheetMatrix(items) {
  const PR = window.ProduksiRandomen;
  if (!PR || !items || !items.length) {
    return [
      [
        "Proses pengolahan",
        "Jumlah batch",
        "Σ Berat awal (kg)",
        "Σ Berat GB randomen (kg)",
        "Randomen (N banding 1, 2 desimal)",
      ],
      ["Tidak ada data produksi pada filter ini.", "", "", "", ""],
    ];
  }
  const bahanMap = getBahanMapForLaporan();
  const agg = PR.summarizeRandomenAgregat(items, (p) =>
    getProsesPengolahanTampilanLaporan(p, bahanMap)
  );
  const keys = Object.keys(agg.byProses || {}).sort();
  const header = [
    "Proses pengolahan",
    "Jumlah batch",
    "Σ Berat awal (kg)",
    "Σ Berat GB randomen (kg)",
    "Randomen (N banding 1, 2 desimal)",
  ];
  if (keys.length === 0) {
    return [
      header,
      [
        "Belum ada batch pengemasan lengkap (berat valid) pada filter ini.",
        "",
        "",
        "",
        "",
      ],
    ];
  }
  let totalBatch = 0;
  const body = keys.map((k) => {
    const row = agg.byProses[k];
    totalBatch += row.batch || 0;
    const r = row.hasil > 0 ? row.bahan / row.hasil : null;
    return [
      k,
      row.batch ?? "",
      row.bahan ?? "",
      row.hasil ?? "",
      r != null ? PR.formatRandomenBanding1(r) : "",
    ];
  });
  if (agg.sumHasil > 0) {
    body.push([
      "Total (keseluruhan)",
      totalBatch,
      agg.sumBahan,
      agg.sumHasil,
      PR.formatRandomenBanding1(agg.totalRatio),
    ]);
  }
  return [header, ...body];
}

/** Class perataan sel rekap (kolom data, bukan nomor urut). */
function rekapDataCellClassAttr(align) {
  if (align === "right") return ' class="rekap-col-right"';
  if (align === "center") return ' class="rekap-col-center"';
  return "";
}

/** Fragmen HTML tabel + ringkasan (dipakai Lihat rekap & PDF). */
function buildRekapReportFragments(config, data) {
  const columnsHeader = config.columns
    .map((column) => {
      const attr = rekapDataCellClassAttr(column.align);
      return `<th${attr}>${column.label}</th>`;
    })
    .join("");
  const rowsHtml = data
    .map((item, index) => {
      const cells = config.columns
        .map((column) => {
          const raw = column.value(item);
          const cell =
            raw === undefined || raw === null
              ? ""
              : sanitizeRekapDataCellForExport(String(raw));
          const attr = rekapDataCellClassAttr(column.align);
          return `<td${attr}>${cell}</td>`;
        })
        .join("");
      return `<tr><td class="rekap-col-no rekap-col-center">${
        index + 1
      }</td>${cells}</tr>`;
    })
    .join("");
  const avgWrap =
    config.averageSummaryWrapClass || "summary rekap-summary-panel";
  const avgHeading =
    config.averageSummaryHeading || "Ringkasan Rata-rata";
  const summaryHtml =
    config.averages && config.averages.length
      ? `
        <div class="${avgWrap}">
          <h2>${avgHeading}</h2>
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
      ? (() => {
          const rows = config.extraSummary(data);
          if (!rows || !rows.length) return "";
          const wrapClass =
            config.extraSummaryWrapClass ||
            "summary rekap-summary-panel rekap-summary-extra";
          const h2 =
            config.extraSummaryHeading || "Ringkasan Tambahan";
          return `
        <div class="${wrapClass}">
          <h2>${h2}</h2>
          <ul>
            ${rows
              .map(
                (item) =>
                  `<li><strong>${item.label}:</strong> ${item.value}</li>`
              )
              .join("")}
          </ul>
        </div>
      `;
        })()
      : "";
  return { columnsHeader, rowsHtml, summaryHtml, extraSummaryHtml };
}

const REKAP_EXCEL_BORDER = {
  style: "thin",
  color: { argb: "FFD1D5DB" },
};

function rekapExcelBorderAll(cell) {
  const b = REKAP_EXCEL_BORDER;
  cell.border = { top: b, left: b, bottom: b, right: b };
}

/** Gaya bersama semua rekap Kelola Laporan (tabel utama, kartu ringkasan, sub-tabel). */
function getRekapLaporanSkinCss() {
  return `
          body.rekap-laporan {
            font-family: "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
          }
          body.rekap-laporan h1 {
            font-size: 22px;
            margin: 0 0 8px 0;
            color: #0f172a;
            font-weight: 700;
            letter-spacing: -0.02em;
          }
          body.rekap-laporan .meta {
            padding: 10px 14px;
            background: #f1f5f9;
            border-radius: 8px;
            border-left: 4px solid #3b82f6;
            margin-bottom: 20px;
            font-size: 12px;
            color: #475569;
            line-height: 1.5;
          }
          body.rekap-laporan table.rekap-laporan-main {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
            border-radius: 8px;
            overflow: hidden;
          }
          body.rekap-laporan table.rekap-laporan-main th,
          body.rekap-laporan table.rekap-laporan-main td {
            border: 1px solid #d1d5db;
            padding: 9px 8px;
            vertical-align: middle;
          }
          body.rekap-laporan table.rekap-laporan-main thead th {
            background: linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%);
            font-weight: 600;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            border-bottom: 2px solid #cbd5e1;
          }
          body.rekap-laporan table.rekap-laporan-main tbody tr:nth-child(even) td {
            background-color: #fafafa;
          }
          body.rekap-laporan table.rekap-laporan-main tbody tr:hover td {
            background-color: #f1f5f9 !important;
          }
          body.rekap-laporan table.rekap-laporan-main .rekap-col-no {
            width: 2.75rem;
            text-align: center;
            white-space: nowrap;
          }
          body.rekap-laporan table.rekap-laporan-main .rekap-col-right {
            text-align: right;
            font-variant-numeric: tabular-nums;
          }
          body.rekap-laporan table.rekap-laporan-main .rekap-col-center {
            text-align: center;
          }
          body.rekap-laporan .rekap-subtable-card {
            margin-top: 28px;
            padding: 0;
            border: none;
            background: transparent;
          }
          body.rekap-laporan .rekap-subtable-card .inner {
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
            background: #fff;
          }
          body.rekap-laporan .rekap-subtable-card h2 {
            margin: 0;
            padding: 12px 16px;
            font-size: 13px;
            background: #0f172a;
            color: #f8fafc;
            letter-spacing: 0.02em;
          }
          body.rekap-laporan .rekap-subtable-card .meta {
            padding: 10px 16px;
            margin: 0;
            background: #f8fafc;
            border-bottom: 1px solid #e2e8f0;
            font-size: 11px;
            color: #64748b;
            border-left: none;
            border-radius: 0;
          }
          body.rekap-laporan .rekap-subtable-card table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            margin: 0;
          }
          body.rekap-laporan .rekap-subtable-card th,
          body.rekap-laporan .rekap-subtable-card td {
            border: 1px solid #e2e8f0;
            padding: 8px 10px;
          }
          body.rekap-laporan .rekap-subtable-card thead th {
            background: #f1f5f9;
            font-weight: 600;
            text-transform: uppercase;
            font-size: 10px;
            letter-spacing: 0.03em;
          }
          body.rekap-laporan .rekap-subtable-card tbody tr:nth-child(even) td {
            background: #fafafa;
          }
          body.rekap-laporan .rekap-subtable-card th:nth-child(n+2),
          body.rekap-laporan .rekap-subtable-card td:nth-child(n+2) {
            text-align: right;
            font-variant-numeric: tabular-nums;
          }
          body.rekap-laporan .rekap-subtable-card th:first-child,
          body.rekap-laporan .rekap-subtable-card td:first-child {
            text-align: left;
          }
          body.rekap-laporan .rekap-subtable-card tr.rekap-subtable-total td {
            background: #fffbeb;
            font-weight: 600;
            border-top: 2px solid #fcd34d;
          }
          body.rekap-laporan .rekap-summary-panel {
            margin-top: 22px;
            padding: 14px 16px;
            background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
            border: 1px solid #e2e8f0;
            border-radius: 8px;
          }
          body.rekap-laporan .rekap-summary-panel h2 {
            margin: 0 0 10px 0;
            font-size: 13px;
            color: #0f172a;
            border-bottom: 1px solid #cbd5e1;
            padding-bottom: 8px;
          }
          body.rekap-laporan .rekap-summary-panel ul {
            list-style: none;
            padding: 0;
            margin: 0;
          }
          body.rekap-laporan .rekap-summary-panel li {
            font-size: 12px;
            color: #374151;
            margin-bottom: 6px;
            line-height: 1.45;
          }
          body.rekap-laporan .rekap-summary-panel li strong {
            color: #334155;
          }
          body.rekap-laporan .rekap-summary-extra ul {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
            gap: 10px 16px;
          }
          body.rekap-laporan .rekap-summary-extra li {
            padding: 10px 12px;
            background: #fff;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            margin: 0;
          }
          body.rekap-laporan .rekap-summary-panel.rekap-summary-extra li {
            margin-bottom: 0;
          }
  `;
}

/**
 * Buka tab baru: hanya tampilan rekap (seperti perilaku awal, tanpa panel cetak PDF).
 */
async function exportRekapView(category) {
  const ctx = await loadRekapExportContext(category);
  if (!ctx || ctx.error) {
    if (ctx && ctx.error === "no_config") {
      alert("Konfigurasi rekap tidak ditemukan.");
    } else {
      alert("Tidak ada data untuk direkap berdasarkan filter saat ini.");
    }
    return;
  }

  const { config, data, filterInfo, generatedAt } = ctx;
  const { columnsHeader, rowsHtml, summaryHtml, extraSummaryHtml } =
    buildRekapReportFragments(config, data);

  const rekapSkin = getRekapLaporanSkinCss();

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${config.title}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 32px;
            color: #1f2937;
            line-height: 1.45;
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
          ${rekapSkin}
        </style>
      </head>
      <body class="rekap-laporan">
        <h1>${config.title}</h1>
        <div class="meta">${filterInfo} • Total data: ${data.length}</div>
        <table class="rekap-laporan-main">
          <thead>
            <tr>
              <th class="rekap-col-no rekap-col-center">No</th>
              ${columnsHeader}
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        ${category === "produksi" ? htmlRekapRandomenPerProsesPengolahan(data) : ""}
        ${category === "pemesanan" ? htmlRekapPemesananAggPerProses(data) : ""}
        ${summaryHtml}
        ${extraSummaryHtml}
        <div class="footer">
          Ditampilkan pada ${generatedAt} — Argopuro Walida
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
      "Pop-up diblokir oleh browser. Mohon izinkan pop-up untuk melihat rekap."
    );
  }
}

/**
 * Rekap untuk dicetak / disimpan sebagai PDF lewat dialog cetak browser.
 */
async function exportRekapPdf(category) {
  const ctx = await loadRekapExportContext(category);
  if (!ctx || ctx.error) {
    if (ctx && ctx.error === "no_config") {
      alert("Konfigurasi rekap tidak ditemukan.");
    } else {
      alert("Tidak ada data untuk direkap berdasarkan filter saat ini.");
    }
    return;
  }

  const { config, data, filterInfo, generatedAt } = ctx;
  const { columnsHeader, rowsHtml, summaryHtml, extraSummaryHtml } =
    buildRekapReportFragments(config, data);

  const rekapSkinPdf = getRekapLaporanSkinCss();

  const infoRowsHtml = `
    <table class="info-table" aria-label="Informasi laporan">
      <tbody>
        <tr><th scope="row">Judul laporan</th><td>${config.title}</td></tr>
        <tr><th scope="row">Filter &amp; periode</th><td>${filterInfo}</td></tr>
        <tr><th scope="row">Jumlah baris data</th><td>${data.length}</td></tr>
        <tr><th scope="row">Waktu generate</th><td>${generatedAt}</td></tr>
        <tr><th scope="row">Sistem</th><td>Argopuro Walida</td></tr>
      </tbody>
    </table>
  `;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="utf-8" />
        <title>${config.title}</title>
        <style>
          body {
            font-family: "Segoe UI", Arial, sans-serif;
            margin: 28px 36px 40px;
            color: #1f2937;
            line-height: 1.45;
          }
          .no-print {
            margin-bottom: 20px;
            padding: 14px 16px;
            background: #eff6ff;
            border: 1px solid #bfdbfe;
            border-radius: 8px;
            font-size: 13px;
            color: #1e3a5f;
          }
          .no-print strong { display: block; margin-bottom: 6px; }
          .no-print button {
            margin-top: 10px;
            padding: 8px 16px;
            font-size: 13px;
            cursor: pointer;
            background: #2563eb;
            color: #fff;
            border: none;
            border-radius: 6px;
          }
          .no-print button:hover { background: #1d4ed8; }
          .brand {
            font-size: 11px;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: #64748b;
            margin-bottom: 6px;
          }
          h1 {
            font-size: 22px;
            margin: 0 0 16px 0;
            color: #0f172a;
          }
          .info-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            margin-bottom: 22px;
          }
          .info-table th,
          .info-table td {
            border: 1px solid #e2e8f0;
            padding: 8px 10px;
            text-align: left;
            vertical-align: top;
          }
          .info-table th {
            width: 28%;
            background: #f8fafc;
            color: #475569;
            font-weight: 600;
          }
          .data-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
          }
          .data-table th, .data-table td {
            border: 1px solid #d1d5db;
            padding: 7px 8px;
            vertical-align: top;
          }
          .data-table th {
            background-color: #f1f5f9;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }
          .data-table tr:nth-child(even) td { background-color: #fafafa; }
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
          .summary li strong { color: #111827; }
          .footer {
            margin-top: 28px;
            padding-top: 12px;
            border-top: 1px solid #e5e7eb;
            font-size: 11px;
            color: #6b7280;
          }
          @media print {
            .no-print { display: none !important; }
            body { margin: 12mm; }
          }
          ${rekapSkinPdf}
        </style>
      </head>
      <body class="rekap-laporan">
        <div class="no-print">
          <strong>Cetak atau simpan sebagai PDF</strong>
          Gunakan menu browser: <kbd>Ctrl+P</kbd> (Windows) atau <kbd>Cmd+P</kbd> (Mac), lalu pilih &quot;Simpan sebagai PDF&quot; sebagai printer.
          <div><button type="button" onclick="window.print()">Buka dialog cetak</button></div>
        </div>
        <div class="brand">Argopuro Walida</div>
        <h1>${config.title}</h1>
        ${infoRowsHtml}
        <table class="data-table rekap-laporan-main">
          <thead>
            <tr>
              <th class="rekap-col-no rekap-col-center">No</th>
              ${columnsHeader}
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        ${category === "produksi" ? htmlRekapRandomenPerProsesPengolahan(data) : ""}
        ${category === "pemesanan" ? htmlRekapPemesananAggPerProses(data) : ""}
        ${summaryHtml}
        ${extraSummaryHtml}
        <div class="footer">
          Dokumen ini dibuat otomatis. Dicetak / diekspor pada ${generatedAt}.
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
      "Pop-up diblokir oleh browser. Mohon izinkan pop-up untuk membuka rekap PDF."
    );
  }
}

/**
 * Rekap ke .xlsx memakai ExcelJS (warna header, zebra, border) agar selaras tampilan PDF.
 */
async function exportRekapExcel(category) {
  const ExcelJS = window.ExcelJS;
  if (!ExcelJS) {
    alert(
      "Library Excel belum dimuat. Muat ulang halaman ini lalu coba lagi."
    );
    return;
  }

  const ctx = await loadRekapExportContext(category);
  if (!ctx || ctx.error) {
    if (ctx && ctx.error === "no_config") {
      alert("Konfigurasi rekap tidak ditemukan.");
    } else {
      alert("Tidak ada data untuk direkap berdasarkan filter saat ini.");
    }
    return;
  }

  const { config, data, filterInfo, generatedAt } = ctx;
  const fillSection = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };
  const fillLabelKey = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF8FAFC" },
  };
  const fillHeader = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF1F5F9" },
  };

  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Argopuro Walida";
    wb.created = new Date();

    // --- Ringkasan (dua kolom: label | nilai, seperti cuplikan Numbers) ---
    const wsRing = wb.addWorksheet("Ringkasan", {
      views: [{ showGridLines: true }],
    });
    let r = 1;
    const sectionTitle = (title) => {
      wsRing.mergeCells(r, 1, r, 2);
      const c = wsRing.getCell(r, 1);
      c.value = title;
      c.font = { bold: true, size: 11, name: "Calibri" };
      c.fill = fillSection;
      c.alignment = { vertical: "middle", horizontal: "left" };
      rekapExcelBorderAll(wsRing.getCell(r, 1));
      rekapExcelBorderAll(wsRing.getCell(r, 2));
      r += 1;
    };
    const kvRing = (label, val, opts = {}) => {
      const c1 = wsRing.getCell(r, 1);
      const c2 = wsRing.getCell(r, 2);
      c1.value = label;
      c1.font = { bold: true, size: 11, name: "Calibri" };
      c1.fill = fillLabelKey;
      c1.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      if (opts.numeric) {
        c2.value =
          typeof val === "number" && !Number.isNaN(val) ? val : Number(val);
      } else {
        c2.value = val === undefined || val === null ? "" : String(val);
      }
      c2.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      rekapExcelBorderAll(c1);
      rekapExcelBorderAll(c2);
      r += 1;
    };

    sectionTitle("RINGKASAN & INFORMASI");
    kvRing("Judul laporan", config.title);
    kvRing("Filter & periode", filterInfo);
    kvRing("Jumlah baris data", data.length, { numeric: true });
    kvRing("Diekspor pada", generatedAt);
    kvRing("Sistem", "Argopuro Walida");
    kvRing(
      "Struktur berkas",
      "Lembar «Data» = tabel utama. Produksi: lembar «Randomen». Pemesanan: lembar «Per proses»."
    );

    if (config.averages && config.averages.length) {
      r += 1;
      sectionTitle("RINGKASAN RATA-RATA");
      config.averages.forEach((avg) => kvRing(avg.label, avg.compute(data)));
    }
    if (typeof config.extraSummary === "function") {
      const extra = config.extraSummary(data);
      if (extra && extra.length) {
        r += 1;
        sectionTitle("RINGKASAN TAMBAHAN");
        extra.forEach((item) => kvRing(item.label, item.value));
      }
    }
    wsRing.getColumn(1).width = 34;
    wsRing.getColumn(2).width = 78;

    // --- Data: blok info seperti PDF + tabel dengan header abu & zebra ---
    const wsData = wb.addWorksheet("Data", {
      views: [{ showGridLines: true }],
    });
    let dr = 1;
    const infoPairs = [
      ["Judul laporan", config.title],
      ["Filter & periode", filterInfo],
      ["Jumlah baris data", data.length],
      ["Waktu generate", generatedAt],
      ["Sistem", "Argopuro Walida"],
    ];
    infoPairs.forEach(([k, v]) => {
      const c1 = wsData.getCell(dr, 1);
      const c2 = wsData.getCell(dr, 2);
      c1.value = k;
      c1.font = { bold: true, name: "Calibri" };
      c1.fill = fillLabelKey;
      c2.value = k === "Jumlah baris data" ? v : String(v);
      c2.fill = fillLabelKey;
      c1.alignment = { vertical: "top", wrapText: true };
      c2.alignment = { vertical: "top", wrapText: true };
      rekapExcelBorderAll(c1);
      rekapExcelBorderAll(c2);
      dr += 1;
    });

    const labels = ["No", ...config.columns.map((c) => c.label)];
    labels.forEach((label, i) => {
      const c = wsData.getCell(dr, i + 1);
      c.value = String(label).toUpperCase();
      c.font = { bold: true, size: 10, name: "Calibri" };
      c.fill = fillHeader;
      c.alignment = {
        vertical: "middle",
        horizontal: "center",
        wrapText: true,
      };
      rekapExcelBorderAll(c);
    });
    const headerRowIndex = dr;
    dr += 1;

    data.forEach((item, idx) => {
      const rowIdx = dr + idx;
      const zebra = idx % 2 === 0 ? "FFFFFFFF" : "FFFAFAFA";
      const rowFill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: zebra },
      };
      const cNo = wsData.getCell(rowIdx, 1);
      cNo.value = idx + 1;
      cNo.fill = rowFill;
      cNo.alignment = {
        vertical: "top",
        horizontal: "center",
        wrapText: true,
      };
      rekapExcelBorderAll(cNo);
      config.columns.forEach((col, ci) => {
        const c = wsData.getCell(rowIdx, ci + 2);
        const payload = rekapExcelCellFromColumn(col, item);
        if (payload.kind === "number") {
          c.value = payload.value;
          if (payload.numFmt) {
            c.numFmt = payload.numFmt;
          }
          c.fill = rowFill;
          c.alignment = {
            vertical: "top",
            horizontal:
              col.align === "center" ? "center" : col.align === "left" ? "left" : "right",
            wrapText: true,
          };
        } else {
          c.value = payload.value;
          c.fill = rowFill;
          c.alignment = {
            vertical: "top",
            horizontal:
              col.align === "right"
                ? "right"
                : col.align === "center"
                  ? "center"
                  : "left",
            wrapText: true,
          };
        }
        rekapExcelBorderAll(c);
      });
    });

    wsData.views = [
      {
        state: "frozen",
        xSplit: 0,
        ySplit: headerRowIndex,
        topLeftCell: `A${headerRowIndex + 1}`,
        activeCell: `A${headerRowIndex + 1}`,
        showGridLines: true,
      },
    ];
    wsData.getColumn(1).width = 6;
    for (let i = 1; i < labels.length; i += 1) {
      const L = String(labels[i]).length;
      wsData.getColumn(i + 1).width = Math.min(
        48,
        Math.max(12, Math.round(L * 0.85 + 8))
      );
    }

    if (category === "produksi") {
      const wsRnd = wb.addWorksheet("Randomen", {
        views: [{ showGridLines: true }],
      });
      const rndMatrix = buildRandomenPerProsesSheetMatrix(data);
      const rndHeader = rndMatrix[0] || [];
      const rndBody = rndMatrix.slice(1);
      const nc = Math.max(rndHeader.length, 5);
      let rr = 1;

      const mergeBorderRow = (row, text, fontSize = 11) => {
        wsRnd.mergeCells(row, 1, row, nc);
        const cell = wsRnd.getCell(row, 1);
        cell.value = text;
        cell.font = { bold: true, size: fontSize, name: "Calibri" };
        cell.fill = fillSection;
        cell.alignment = {
          vertical: "middle",
          horizontal: "left",
          wrapText: true,
        };
        for (let col = 1; col <= nc; col += 1) {
          rekapExcelBorderAll(wsRnd.getCell(row, col));
        }
      };

      mergeBorderRow(
        rr,
        "Rekap randomen per proses pengolahan",
        11
      );
      rr += 1;
      mergeBorderRow(
        rr,
        "N banding 1 (kg bahan per 1 kg green beans), dua desimal. Hanya batch pengemasan dengan berat valid.",
        10
      );
      rr += 1;

      rndHeader.forEach((h, i) => {
        const c = wsRnd.getCell(rr, i + 1);
        c.value = h;
        c.font = { bold: true, size: 10, name: "Calibri" };
        c.fill = fillHeader;
        c.alignment = {
          vertical: "middle",
          horizontal: "center",
          wrapText: true,
        };
        rekapExcelBorderAll(c);
      });
      const rndHeaderRow = rr;
      rr += 1;

      rndBody.forEach((bodyRow, idx) => {
        const rowIdx = rr + idx;
        const zebra = idx % 2 === 0 ? "FFFFFFFF" : "FFFAFAFA";
        const rowFill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: zebra },
        };
        for (let ci = 0; ci < nc; ci += 1) {
          const val = bodyRow[ci];
          const c = wsRnd.getCell(rowIdx, ci + 1);
          if (val === "" || val === undefined || val === null) {
            c.value = "";
          } else if (typeof val === "number") {
            c.value = val;
          } else {
            c.value = String(val);
          }
          c.fill = rowFill;
          c.alignment = {
            vertical: "top",
            horizontal: ci >= 1 ? "right" : "left",
            wrapText: true,
          };
          rekapExcelBorderAll(c);
        }
      });

      wsRnd.views = [
        {
          state: "frozen",
          xSplit: 0,
          ySplit: rndHeaderRow,
          topLeftCell: `A${rndHeaderRow + 1}`,
          activeCell: `A${rndHeaderRow + 1}`,
          showGridLines: true,
        },
      ];
      const rndWidths = [30, 14, 18, 22, 20];
      for (let i = 0; i < nc; i += 1) {
        wsRnd.getColumn(i + 1).width = rndWidths[i] || 14;
      }
    }

    if (category === "pemesanan") {
      const wsPp = wb.addWorksheet("Per proses", {
        views: [{ showGridLines: true }],
      });
      const ppMatrix = buildPemesananPerProsesSheetMatrix(data);
      const ppHeader = ppMatrix[0] || [];
      const ppBody = ppMatrix.slice(1);
      const ncPp = 3;
      let pr = 1;

      const mergeBorderRowPp = (row, text, fontSize = 11) => {
        wsPp.mergeCells(row, 1, row, ncPp);
        const cell = wsPp.getCell(row, 1);
        cell.value = text;
        cell.font = { bold: true, size: fontSize, name: "Calibri" };
        cell.fill = fillSection;
        cell.alignment = {
          vertical: "middle",
          horizontal: "left",
          wrapText: true,
        };
        for (let col = 1; col <= ncPp; col += 1) {
          rekapExcelBorderAll(wsPp.getCell(row, col));
        }
      };

      mergeBorderRowPp(
        pr,
        "Ringkasan jumlah pesanan & total kg per proses pengolahan",
        11
      );
      pr += 1;
      mergeBorderRowPp(
        pr,
        "Jumlah pesanan = banyaknya baris pada filter; total kg = jumlah kolom kg per proses.",
        10
      );
      pr += 1;

      ppHeader.forEach((h, i) => {
        const c = wsPp.getCell(pr, i + 1);
        c.value = h;
        c.font = { bold: true, size: 10, name: "Calibri" };
        c.fill = fillHeader;
        c.alignment = {
          vertical: "middle",
          horizontal: i >= 1 ? "center" : "center",
          wrapText: true,
        };
        rekapExcelBorderAll(c);
      });
      const ppHeaderRow = pr;
      pr += 1;

      ppBody.forEach((bodyRow, idx) => {
        const rowIdx = pr + idx;
        const zebra = idx % 2 === 0 ? "FFFFFFFF" : "FFFAFAFA";
        const rowFill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: zebra },
        };
        for (let ci = 0; ci < ncPp; ci += 1) {
          const val = bodyRow[ci];
          const c = wsPp.getCell(rowIdx, ci + 1);
          if (val === "" || val === undefined || val === null) {
            c.value = "";
          } else if (typeof val === "number") {
            c.value = val;
          } else {
            c.value = String(val);
          }
          c.fill = rowFill;
          c.alignment = {
            vertical: "top",
            horizontal: ci >= 1 ? "right" : "left",
            wrapText: true,
          };
          rekapExcelBorderAll(c);
        }
      });

      wsPp.views = [
        {
          state: "frozen",
          xSplit: 0,
          ySplit: ppHeaderRow,
          topLeftCell: `A${ppHeaderRow + 1}`,
          activeCell: `A${ppHeaderRow + 1}`,
          showGridLines: true,
        },
      ];
      wsPp.getColumn(1).width = 36;
      wsPp.getColumn(2).width = 18;
      wsPp.getColumn(3).width = 14;
    }

    const fname = `${rekapExportFilenameBase(category)}.xlsx`;
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fname;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("exportRekapExcel:", err);
    alert(
      "Gagal membuat file Excel. Coba muat ulang halaman atau gunakan browser lain."
    );
  }
}

/** Kompatibilitas lama: sama dengan melihat rekap di tab baru. */
async function exportRekap(category) {
  await exportRekapView(category);
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

  avgElement.textContent = formatCurrencyNumeric(
    Math.round(avgHargaTertimbang)
  );
  maxElement.textContent = formatCurrencyNumeric(
    safeNumber(maxEntry.hargaPerKg)
  );
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

  const filteredList = getProduksiFilteredForDisplay();

  if (filteredList.length === 0) {
    wrapper.innerHTML = "";
    emptyState?.classList.remove("d-none");
    return;
  }

  emptyState?.classList.add("d-none");
  const bahanById = getBahanMapForLaporan();
  const sortedProduksi = [...filteredList].sort((a, b) => {
    const dateA =
      parseValidDate(a.tanggalSekarang) || parseValidDate(a.tanggalMasuk);
    const dateB =
      parseValidDate(b.tanggalSekarang) || parseValidDate(b.tanggalMasuk);
    return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
  });

  const avgRnd = computeAverageRandomenOverall(sortedProduksi);
  const avgBanner = (() => {
    const PR = window.ProduksiRandomen;
    if (!avgRnd || !PR) return "";
    return `<div class="alert alert-light border small mb-3 py-2">
      <strong>Rata-rata randomen keseluruhan</strong>:
      <span class="fw-semibold">${escapeHtmlLaporan(
        PR.formatRandomenBanding1(avgRnd.avgRatio)
      )}</span>
      <span class="text-muted">— mean dari ${avgRnd.counted} batch pengemasan (sesuai filter)</span>
    </div>`;
  })();

  wrapper.innerHTML = `${avgBanner}` + sortedProduksi
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
          <span class="text-muted"> — ${escapeHtmlLaporan(PR.formatRandomenPerIdTooltip(item) || "setelah pengemasan")}</span>
        </div>
        <p class="small text-muted mt-2 mb-1 fw-semibold">Randomen per tahapan (N banding 1, dua desimal)</p>
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

  const stTahap = (item.statusTahapan || "").trim();
  if (stTahap.includes("Pengemasan") && Number.isFinite(beratAwalValue)) {
    const beratAkhirValue =
      typeof item.beratAkhir === "number"
        ? item.beratAkhir
        : parseFloat(item.beratAkhir);
    const parts = [];
    if (Number.isFinite(beratAkhirValue)) {
      parts.push(`Berat akhir: ${beratAkhirValue.toLocaleString("id-ID")} kg`);
    } else {
      parts.push("Berat akhir belum diinput");
    }
    const gbTxt = formatBeratKgLaporanPdf(item.beratGreenBeans);
    const pxTxt = formatBeratKgLaporanPdf(item.beratPixel);
    if (gbTxt !== "—") parts.push(`Green beans: ${gbTxt}`);
    if (pxTxt !== "—") parts.push(`Pixel: ${pxTxt}`);
    steps.push({
      title: "Pengemasan",
      subtitle: formatDate(item.tanggalSekarang),
      details: parts.join(" · "),
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
      <td>${item.jumlah ? item.jumlah.toLocaleString("id-ID") : "-"}</td>
      <td>${item.varietas || "-"}</td>
      <td>${item.hargaPerKg ? formatCurrencyNumeric(item.hargaPerKg) : "-"}</td>
        <td>${
          item.totalPengeluaran
            ? formatCurrencyNumeric(item.totalPengeluaran)
            : "-"
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
    renderProduksiTimeline();
    return;
  }

  const filteredProduksi = getProduksiFilteredForDisplay();

  if (filteredProduksi.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="14" class="text-center text-muted py-4">
          <i class="bi bi-funnel d-block mb-2"></i>
          Tidak ada data sesuai filter.
        </td>
      </tr>
    `;
    renderProduksiTimeline();
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
            [
              PR.formatRandomenPerIdTooltip(item),
              String(PR.buildRingkasanPerTahapanText(item) || "").replace(
                /\n/g,
                " "
              ),
            ]
              .filter(Boolean)
              .join(" | ")
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
      <td><span class="badge ${(window.getProsesPengolahanBadgeClass || ((a) => 'bg-secondary'))(prosesTampilan, item.idProses)}">${prosesTampilan}</span></td>
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
  renderProduksiTimeline();
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
      "Jumlah (kg)",
      // Jangan “terlihat dibulatkan” di invoice: tampilkan presisi sampai 4 desimal.
      formatBeratKgLaporanPdf(item.jumlah),
    ],
    ["Varietas", item.varietas || "—"],
    [
      "Harga per Kg (Rp)",
      item.hargaPerKg ? formatCurrencyNumeric(item.hargaPerKg) : "—",
    ],
    [
      "Total Pengeluaran (Rp)",
      item.totalPengeluaran
        ? formatCurrencyNumeric(item.totalPengeluaran)
        : "—",
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
async function generateProduksiPDF(id) {
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
      ? `${PRpdf.formatRandomenBanding1(rndValPdf)} — ${PRpdf.formatRandomenPerIdTooltip(item)}`
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
    [
      "Berat green beans (hasil pengemasan)",
      formatBeratKgLaporanPdf(item.beratGreenBeans),
    ],
    [
      "Berat produk pixel (pengemasan)",
      formatBeratKgLaporanPdf(item.beratPixel),
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

  const sumberMatrix = buildMatrixSumberBahanProduksiPdf(item);
  if (y > 200) {
    doc.addPage();
    y = 20;
  }
  doc.setFontSize(11);
  doc.setFont(undefined, "bold");
  doc.text("Sumber bahan (ID & pemasok)", 20, y);
  y += 6;
  doc.setFontSize(8);
  doc.setFont(undefined, "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(
    "Alokasi = berat bahan awal per ID yang dipakai untuk produksi ini (sesuai Kelola Produksi). Pemasok diambil dari data bahan masuk.",
    20,
    y
  );
  y += 5;
  doc.setTextColor(0, 0, 0);
  if (sumberMatrix) {
    y = pdfRenderTableFromMatrix(doc, y, sumberMatrix, [8, 42, 72, 48]);
  } else {
    doc.setFontSize(9);
    doc.text("— Tidak ada ID bahan tercatat pada produksi ini.", 20, y);
    y += 8;
  }

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
    "Tiap baris: randomen = N banding 1 (dua desimal), bahan per 1 kg green beans (pengemasan); pixel tidak di penyebut; kadar air, catatan.",
    20,
    y
  );
  y += 6;
  doc.setTextColor(0, 0, 0);
  doc.line(20, y, 190, y);
  y += 5;
  const alurRowsPdf = buildAlurProduksiTableRows(item, {
    numericWeightInCells: true,
  });
  try {
    y = await pdfRenderAlurProduksiTable(doc, y, alurRowsPdf);
  } catch (err) {
    console.error("pdfRenderAlurProduksiTable", err);
    alert(
      "Gagal menyusun tabel alur produksi di PDF (foto). " +
        (err && err.message ? err.message : "Coba lagi.")
    );
    return;
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

// Fungsi generateHasilProduksiPDF dihapus karena laporan hasil produksi sudah tidak digunakan
async function generateHasilProduksiPDF(id) {
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
    doc.text("Jumlah (kg):", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(
      bahanData.jumlah ? bahanData.jumlah.toLocaleString("id-ID") : "-",
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
    doc.text("Harga per Kg (Rp):", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(
      bahanData.hargaPerKg
        ? formatCurrencyNumeric(bahanData.hargaPerKg)
        : "-",
      60,
      y
    );
    y += 10;

    doc.setFont(undefined, "bold");
    doc.text("Total Pengeluaran (Rp):", 20, y);
    doc.setFont(undefined, "normal");
    doc.text(
      bahanData.totalPengeluaran
        ? formatCurrencyNumeric(bahanData.totalPengeluaran)
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
    const alurRowsHasilPdf = buildAlurProduksiTableRows(produksiData, {
      numericWeightInCells: true,
    });
    y = await pdfRenderAlurProduksiTable(doc, y, alurRowsHasilPdf);
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
      <td>${item.nilai ? formatCurrencyNumeric(item.nilai) : "-"}</td>
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
      const res = await window.API.Stok.getAll({});
      stokArray = res.rows || [];
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
          "Jumlah (kg)",
          bahanData.jumlah
            ? bahanData.jumlah.toLocaleString("id-ID")
            : "—",
        ],
        ["Varietas", bahanData.varietas || "—"],
        [
          "Harga per Kg (Rp)",
          bahanData.hargaPerKg
            ? formatCurrencyNumeric(bahanData.hargaPerKg)
            : "—",
        ],
        [
          "Total Pengeluaran (Rp)",
          bahanData.totalPengeluaran
            ? formatCurrencyNumeric(bahanData.totalPengeluaran)
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
      detailY = await pdfRenderAlurProduksiTable(
        detailDoc,
        detailY,
        buildAlurProduksiTableRows(produksiData, {
          numericWeightInCells: true,
        })
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
    ["Nilai (Rp)", item.nilai ? formatCurrencyNumeric(item.nilai) : "—"],
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
      initializeLaporanProsesTahapanFilterListeners();

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

/** Filter pemesanan dari kontrol tab laporan (sama untuk tabel & rekap). */
function getPemesananFilteredForLaporan() {
  if (!Array.isArray(pemesanan)) return [];
  const filterTanggal = document.getElementById("pemesananFilterTanggal")
    ? document.getElementById("pemesananFilterTanggal").value
    : "";
  const filterBulanRaw = document.getElementById("pemesananFilterBulan")
    ? document.getElementById("pemesananFilterBulan").value.trim()
    : "";
  const filterBulan = filterBulanRaw ? parseInt(filterBulanRaw, 10) : NaN;
  const filterStatus = document.getElementById("pemesananFilterStatus")
    ? document.getElementById("pemesananFilterStatus").value
    : "";
  const filterTipe = document.getElementById("pemesananFilterTipe")
    ? document.getElementById("pemesananFilterTipe").value
    : "";
  return pemesanan.filter((p) => {
    const matchTanggal =
      !filterTanggal || p.tanggalPemesanan === filterTanggal;
    let matchBulan = true;
    if (Number.isFinite(filterBulan) && filterBulan >= 1 && filterBulan <= 12) {
      const d = parseValidDate(p.tanggalPemesanan);
      matchBulan = !!(d && d.getMonth() + 1 === filterBulan);
    }
    const matchStatus = !filterStatus || p.statusPemesanan === filterStatus;
    const matchTipe = !filterTipe || p.tipePemesanan === filterTipe;
    return matchTanggal && matchBulan && matchStatus && matchTipe;
  });
}

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
    const filteredPemesanan = getPemesananFilteredForLaporan();

    if (filteredPemesanan.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="15" class="text-center py-4 text-muted">
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
        <td>${(p.prosesPengolahan && String(p.prosesPengolahan).trim()) || "-"}</td>
        <td>${p.jenisKopi || "-"}</td>
        <td>${(p.hargaPerKg != null ? Number(p.hargaPerKg) : 0).toLocaleString("id-ID")}</td>
        <td>${(p.jumlahPesananKg || 0).toLocaleString("id-ID")}</td>
        <td>${(p.totalHarga || 0).toLocaleString("id-ID")}</td>
        <td>
          <span class="badge ${
            p.statusPemesanan === "Complete" ? "bg-success" : "bg-warning"
          }">
            ${p.statusPemesanan || "-"}
          </span>
        </td>
        <td>${p.statusPembayaran || "-"}</td>
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
        <td colspan="15" class="text-center py-4 text-danger">
          <i class="bi bi-exclamation-triangle fs-1 d-block mb-2"></i>
          Error menampilkan data: ${error.message}
        </td>
      </tr>
    `;
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
        "Jumlah Pesanan (kg)",
        (p.jumlahPesananKg || 0).toLocaleString("id-ID"),
      ],
      [
        "Harga per Kg (Rp)",
        (p.hargaPerKg || 0).toLocaleString("id-ID"),
      ],
      [
        "Total Harga (Rp)",
        (p.totalHarga || 0).toLocaleString("id-ID"),
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
        "Jumlah Pesanan (kg)",
        (p.jumlahPesananKg || 0).toLocaleString("id-ID"),
      ],
      [
        "Harga per Kg (Rp)",
        (p.hargaPerKg || 0).toLocaleString("id-ID"),
      ],
      [
        "Total Harga (Rp)",
        (p.totalHarga || 0).toLocaleString("id-ID"),
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
  const pemesananFilterBulan = document.getElementById("pemesananFilterBulan");
  if (pemesananFilterBulan) {
    pemesananFilterBulan.addEventListener("change", displayPemesananLaporan);
  }
});
