/**
 * Helper kloter pemesanan + layout PDF invoice lengkap.
 * Load setelah jsPDF, sebelum kelola_pemesanan.js / kelola_laporan.js.
 */
function invoiceFormatDateForPdf(dateString) {
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

/** Baca kloter dari dokumen API (kloter → items → satu baris root). */
function getPemesananKloterLinesFromDoc(p) {
  if (!p) return [];
  const rows = p.kloter || p.items;
  if (Array.isArray(rows) && rows.length > 0) {
    const mapped = rows.map((r) => ({
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
      jumlahPembayaranKloter:
        r.jumlahPembayaranKloter != null && r.jumlahPembayaranKloter !== ""
          ? r.jumlahPembayaranKloter
          : "",
      pembayaranKloterLunas: r.pembayaranKloterLunas,
    }));
    // Penyimpanan mengikuti urutan tambah (lama → baru); tampilan: terbaru di atas.
    return mapped.slice().reverse();
  }
  return [
    {
      tipeProduk: p.tipeProduk || "",
      jenisKopi: p.jenisKopi || "",
      prosesPengolahan: p.prosesPengolahan || "",
      beratKg: p.jumlahPesananKg != null ? p.jumlahPesananKg : "",
      hargaPerKg: p.hargaPerKg != null ? p.hargaPerKg : "",
      jumlahPembayaranKloter:
        p.jumlahPembayaranKloter != null && p.jumlahPembayaranKloter !== ""
          ? p.jumlahPembayaranKloter
          : "",
    },
  ];
}

/** True = nominal masuk total terbayar & pemasukan (default untuk dokumen lama). */
function pembayaranBarisLunasTrue(raw) {
  if (raw === undefined || raw === null) return true;
  if (typeof raw === "boolean") return raw;
  const s = String(raw).trim().toLowerCase();
  if (["false", "0", "no", "tidak", "belum lunas", "belum"].includes(s)) return false;
  return true;
}

/** Subtotal Rp satu baris kloter (berat × harga/kg), selaras kolom subtotal di DATA PEMESANAN. */
function pemesananKloterSubtotalRpFromRow(row) {
  if (!row) return 0;
  const j = parseFloat(row.beratKg) || 0;
  const hp = parseFloat(row.hargaPerKg) || 0;
  return Math.round(j * hp * 100) / 100;
}

/** Σ pembayaran yang sudah lunas (per kloter + pembayaranBertahapBaris). Selaras totalPembayaranKloter di API. */
function sumJumlahPembayaranKloterFromDoc(p) {
  if (!p) return 0;
  const agg = parseFloat(p.totalPembayaranKloter);
  if (Number.isFinite(agg) && agg >= 0) return Math.round(agg * 100) / 100;
  const rows = p.kloter || p.items;
  let s = 0;
  if (Array.isArray(rows)) {
    rows.forEach((r) => {
      const v = parseFloat(r.jumlahPembayaranKloter);
      if (!Number.isFinite(v) || v <= 0) return;
      if (!pembayaranBarisLunasTrue(r.pembayaranKloterLunas)) return;
      s += v;
    });
  }
  const extra = p.pembayaranBertahapBaris;
  if (Array.isArray(extra)) {
    extra.forEach((it) => {
      const v = parseFloat(it?.jumlahRp);
      if (!Number.isFinite(v) || v <= 0) return;
      if (!pembayaranBarisLunasTrue(it.terminLunas)) return;
      s += v;
    });
  }
  return Math.round(s * 100) / 100;
}

/**
 * Sisa tagihan = total harga − Σ pembayaran tercatat (selaras field totalPembayaranSaatIni di API).
 */
function totalPembayaranSaatIniFromDoc(p) {
  if (!p) return 0;
  const th = parseFloat(p.totalHarga) || 0;
  const fromApi = parseFloat(p.totalPembayaranSaatIni);
  if (Number.isFinite(fromApi) && fromApi >= 0) return Math.round(fromApi * 100) / 100;
  const sum = sumJumlahPembayaranKloterFromDoc(p);
  return Math.max(0, Math.round((th - sum) * 100) / 100);
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
  pdfInvSetFont(doc, "normal");
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
  pdfInvSetFont(doc, "bold");
  doc.text(nama, tx, y + 8);
  doc.setTextColor(55, 55, 55);
  doc.setFontSize(9);
  pdfInvSetFont(doc, "normal");
  doc.text(`Kontak: ${kontak}`, tx, y + 15);
  const addrLines = doc.splitTextToSize(alamat, 132);
  let ay = y + 21;
  addrLines.forEach((ln) => {
    doc.text(ln, tx, ay);
    ay += 4.4;
  });
  doc.setTextColor(0, 0, 0);
  const barY = Math.max(y + 32, ay + 3);
  doc.setDrawColor(46, 125, 50);
  doc.setLineWidth(0.35);
  doc.line(18, barY, 192, barY);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.1);
  doc.setFontSize(15.5);
  pdfInvSetFont(doc, "bold");
  doc.text("INVOICE PEMESANAN", 105, barY + 8.5, { align: "center" });
  doc.setFontSize(8);
  pdfInvSetFont(doc, "normal");
  doc.setTextColor(75, 82, 78);
  doc.text(
    "Dokumen pembelian resmi — mohon periksa rincian berikut.",
    105,
    barY + 13.5,
    { align: "center" },
  );
  doc.setTextColor(0, 0, 0);
  return barY + 18;
}

/** Angka dengan pemisah ribuan Indonesia, tanpa prefiks Rp/kg */
function pdfFmtIdNumber(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("id-ID");
}

/** Font tunggal untuk invoice PDF (built-in jsPDF). */
const PDF_FONT = "helvetica";

function pdfInvSetFont(doc, style) {
  doc.setFont(PDF_FONT, style || "normal");
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
  const optsObj = opts || {};
  const forceSinglePage = !!optsObj.forceSinglePage;
  const pageBottom =
    optsObj && Number.isFinite(optsObj.pageBottom) ? optsObj.pageBottom : 288;
  const W =
    optsObj && Number.isFinite(optsObj.width) ? optsObj.width : 190 - LX;
  const padX = 3.5;
  const innerW = W - padX * 2;
  const marginBottom =
    optsObj && Number.isFinite(optsObj.marginBottom)
      ? optsObj.marginBottom
      : 6;
  const decoded = pdfDecodeHtmlEntities(String(catatanRaw).trim());
  const blocks = decoded
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const lineH = 4;
  const headerH = 8;
  const bodyPadTop = 4.5;
  const bodyPadBottom = 4.5;
  const displayLines = [];
  doc.setFontSize(8);
  pdfInvSetFont(doc, "normal");
  blocks.forEach((blk, idx) => {
    doc.splitTextToSize(blk, innerW).forEach((ln) => displayLines.push(ln));
    if (idx < blocks.length - 1) displayLines.push("");
  });
  let bodyH = bodyPadTop + displayLines.length * lineH + bodyPadBottom;
  let tableH = headerH + bodyH;

  if (!forceSinglePage && y + tableH > 285) {
    doc.addPage();
    y = 22;
  } else if (forceSinglePage && y + tableH > pageBottom) {
    const avail = pageBottom - y - headerH - bodyPadTop - bodyPadBottom;
    const maxLines = Math.max(1, Math.floor(avail / lineH));
    if (displayLines.length > maxLines) {
      const head = displayLines.slice(0, Math.max(0, maxLines - 1));
      head.push("…");
      displayLines.length = 0;
      head.forEach((ln) => displayLines.push(ln));
      bodyH = bodyPadTop + displayLines.length * lineH + bodyPadBottom;
      tableH = headerH + bodyH;
    }
  }

  doc.setDrawColor(46, 125, 50);
  doc.setLineWidth(0.22);
  doc.roundedRect(LX, y, W, tableH, 1.2, 1.2, "S");

  doc.setFillColor(236, 248, 238);
  doc.rect(LX + 0.22, y + 0.22, W - 0.44, headerH - 0.1, "F");
  doc.setDrawColor(46, 125, 50);
  doc.setLineWidth(0.15);
  doc.line(LX, y + headerH, LX + W, y + headerH);

  doc.setTextColor(25, 90, 40);
  pdfInvSetFont(doc, "bold");
  doc.setFontSize(8.5);
  doc.text("CATATAN", LX + padX, y + 5.7);
  doc.setTextColor(35, 35, 35);
  pdfInvSetFont(doc, "normal");
  doc.setFontSize(8);

  let ty = y + headerH + bodyPadTop;
  displayLines.forEach((ln) => {
    if (ln !== "") doc.text(ln, LX + padX, ty);
    ty += lineH;
  });

  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.1);
  doc.setFontSize(9);
  pdfInvSetFont(doc, "normal");
  return y + tableH + marginBottom;
}

/**
 * Perkiraan tinggi tabel catatan (mm), selaras perhitungan pdfDrawCatatanPemesananTable.
 */
function pdfEstimateCatatanTableHeight(doc, catatanRaw, W, marginBottom) {
  const mb = Number.isFinite(marginBottom) ? marginBottom : 6;
  const padX = 3.5;
  const innerW = W - padX * 2;
  const decoded = pdfDecodeHtmlEntities(String(catatanRaw || "").trim());
  const blocks = decoded
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const lineH = 4;
  const headerH = 8;
  const bodyPadTop = 4.5;
  const bodyPadBottom = 4.5;
  const displayLines = [];
  doc.setFontSize(8);
  pdfInvSetFont(doc, "normal");
  blocks.forEach((blk, idx) => {
    doc.splitTextToSize(blk, innerW).forEach((ln) => displayLines.push(ln));
    if (idx < blocks.length - 1) displayLines.push("");
  });
  const bodyH = bodyPadTop + displayLines.length * lineH + bodyPadBottom;
  return headerH + bodyH + mb;
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
  pdfInvSetFont(doc, "bold");
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
  pdfInvSetFont(doc, "normal");
  doc.setFontSize(9);
}

function pdfDrawPaymentBadge(doc, x, yBaseline, label) {
  pdfDrawColoredBadge(doc, x, yBaseline, label, pdfPaymentBadgeColors);
}

function pdfDrawOrderStatusBadge(doc, x, yBaseline, label) {
  pdfDrawColoredBadge(doc, x, yBaseline, label, pdfOrderStatusBadgeColors);
}

/** Hanya baris tambahan dari API (DP/termin); pembayaran per kloter tampil di baris kloter, tanpa migrasi ganda. */
function pdfPembayaranBertahapBarisOnlyForInvoice(p) {
  if (!Array.isArray(p?.pembayaranBertahapBaris)) return [];
  return p.pembayaranBertahapBaris.filter((ex) => {
    const jj = parseFloat(ex?.jumlahRp) || 0;
    const ct = String(ex?.catatan || "").trim();
    return jj > 0 || ct.length > 0;
  });
}

/**
 * Untuk laporan HTML & kompatibilitas: baris bertahap dari API, atau migrasi dari jumlahPembayaranKloter (dokumen lama).
 * PDF invoice memakai pdfPembayaranBertahapBarisOnlyForInvoice + kolom di tabel kloter agar tidak dobel.
 */
function pdfPembayaranBertahapRowsForInvoice(p) {
  const fromApi = pdfPembayaranBertahapBarisOnlyForInvoice(p);
  if (fromApi.length > 0) return fromApi;
  const lines = getPemesananKloterLinesFromDoc(p);
  const out = [];
  lines.forEach((row) => {
    const jj = parseFloat(row.jumlahPembayaranKloter) || 0;
    if (jj > 0) {
      const desk = `${row.tipeProduk || "-"} · ${row.jenisKopi || "-"} · ${row.prosesPengolahan || "-"}`;
      out.push({ catatan: desk, jumlahRp: jj, terminLunas: true });
    }
  });
  return out;
}

/** Header baris tabel hijau seragam (invoice Argopuro). */
function pdfInvoiceGreenTableHeader(doc, lx, rx, yTop, hdrH, cols, hdrFontSize) {
  const w = rx - lx;
  doc.setFillColor(228, 241, 232);
  doc.roundedRect(lx, yTop, w, hdrH, 0.5, 0.5, "F");
  doc.setDrawColor(38, 120, 55);
  doc.setLineWidth(0.2);
  doc.roundedRect(lx, yTop, w, hdrH, 0.5, 0.5, "S");
  const ty = yTop + hdrH * 0.55 + 1.05;
  doc.setFontSize(
    Number.isFinite(hdrFontSize) && hdrFontSize > 0 ? hdrFontSize : 8,
  );
  pdfInvSetFont(doc, "bold");
  doc.setTextColor(32, 88, 48);
  cols.forEach((c) => {
    doc.text(c.label, c.x, ty, c.opt || {});
  });
  doc.setTextColor(0, 0, 0);
  pdfInvSetFont(doc, "normal");
  return yTop + hdrH + 3.2;
}

function pdfDrawInvoiceBody(doc, p, y) {
  pdfInvSetFont(doc, "normal");
  const LX = 14;
  const VX = 52;
  const tblRx = 196;
  const HDR_H = 8.5;
  const FS_RING = 8.5;
  const FS_RING_TTL = 10;
  const FS_LABEL = 8.5;
  const FS_BODY = 8;
  /** Isi tabel invoice: sedikit lebih besar agar selaras dengan blok PEMBELI (8,5 pt). */
  const FS_TABLE = 8.5;
  const FS_TABLE_HEAD = 8.5;
  const FS_SEC = 11;
  const FS_SEC_SUB = 7.5;
  const LH_ROW = 4;
  const LH_TABLE = 4.35;
  const LH_PEMBELI = 4.5;
  /** Grid kolom DATA PEMESANAN (mm): angka rata kanan di tepi kolom, Status setelah Pemb. */
  const C_NO_R = 20;
  const C_DESC = 23;
  const C_QTY_R = 78;
  const C_HP_R = 92;
  const C_SUB_R = 108;
  const C_PAY_R = 128;
  const C_STAT_X = 131;
  const W_DESC = Math.max(46, C_QTY_R - C_DESC - 3);
  const W_STATUS = Math.max(20, tblRx - C_STAT_X - 2);
  /** Garis vertikal grid (sisi kiri tiap zona kolom). */
  const V_GRID_X = [
    LX,
    C_NO_R + 2,
    C_QTY_R - 11,
    C_HP_R - 13,
    C_SUB_R - 17,
    C_PAY_R - 23,
    C_STAT_X - 1.5,
    tblRx,
  ];

  const bayarLabel = (p.statusPembayaran || "Belum Lunas").trim();
  const statusBayarKey = (p.statusPembayaran || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  const modePembayaranBertahap = statusBayarKey === "pembayaran bertahap";
  const orderLabel = (p.statusPemesanan || "—").trim();
  const sumBayarInv = sumJumlahPembayaranKloterFromDoc(p);
  const sisaInv = totalPembayaranSaatIniFromDoc(p);
  const totalInv = parseFloat(p.totalHarga) || 0;
  const pajakInv = Math.max(0, parseFloat(p.biayaPajak) || 0);
  const kirimInv = Math.max(0, parseFloat(p.biayaPengiriman) || 0);
  const barisPembayaranTambahan = pdfPembayaranBertahapBarisOnlyForInvoice(p);

  /** Invoice disederhanakan satu halaman: tanpa page break otomatis di isi. */
  const pageBreakIfNeeded = (yy) => yy;

  const drawRowSep = (yy) => {
    doc.setDrawColor(220, 228, 222);
    doc.setLineWidth(0.1);
    doc.line(LX, yy, tblRx, yy);
  };

  const drawInvoiceTableVerticalGrid = (yTop, yBottom) => {
    if (yBottom <= yTop) return;
    doc.setDrawColor(228, 234, 230);
    doc.setLineWidth(0.08);
    V_GRID_X.forEach((vx) => {
      doc.line(vx, yTop, vx, yBottom);
    });
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.1);
  };

  // --- Ringkasan dokumen: identitas & status (tanpa duplikat angka keuangan) ---
  doc.setFontSize(FS_SEC_SUB);
  doc.setTextColor(95, 110, 100);
  const hintRingkasan = modePembayaranBertahap
    ? "Rincian nominal ada pada tabel di bawah."
    : "Total tagihan (pajak & pengiriman) tercantum pada bagian DATA PEMESANAN.";
  const hintLines = doc.splitTextToSize(hintRingkasan, 168);
  const hintLineH = 3.9;
  const ringBoxExtra = Math.max(0, (hintLines.length - 1) * hintLineH);
  const ringBoxH = 36 + ringBoxExtra;

  doc.setFillColor(240, 248, 242);
  doc.roundedRect(LX, y - 2, 182, ringBoxH, 1, 1, "F");
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(FS_RING_TTL);
  pdfInvSetFont(doc, "bold");
  doc.text("Ringkasan dokumen", LX + 3, y + 4.8);
  pdfInvSetFont(doc, "normal");
  doc.setFontSize(FS_RING);
  doc.text(`ID Pembelian: ${p.idPembelian || "-"}`, LX + 3, y + 10.2);
  doc.setTextColor(55, 55, 55);
  doc.text(
    `Tanggal pemesanan: ${invoiceFormatDateForPdf(p.tanggalPemesanan || new Date().toISOString())}`,
    LX + 3,
    y + 15.8,
  );
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(FS_BODY);
  doc.setTextColor(60, 60, 60);
  doc.text("Status pemesanan", LX + 3, y + 21.5);
  const osw = doc.getTextWidth("Status pemesanan");
  doc.setTextColor(0, 0, 0);
  pdfDrawOrderStatusBadge(doc, LX + 3 + osw + 2, y + 21.5, orderLabel);
  doc.setFontSize(FS_BODY);
  doc.setTextColor(60, 60, 60);
  doc.text("Status pembayaran", LX + 3, y + 27.5);
  const spw = doc.getTextWidth("Status pembayaran");
  doc.setTextColor(0, 0, 0);
  pdfDrawPaymentBadge(doc, LX + 3 + spw + 2, y + 27.5, bayarLabel);
  doc.setFontSize(FS_SEC_SUB);
  doc.setTextColor(95, 110, 100);
  let yHint = y + 31.2;
  hintLines.forEach((ln) => {
    doc.text(ln, LX + 3, yHint);
    yHint += hintLineH;
  });
  doc.setTextColor(0, 0, 0);
  y += ringBoxH + 2;

  doc.setFontSize(FS_SEC);
  pdfInvSetFont(doc, "bold");
  doc.text("PEMBELI", LX, y);
  y += 5;
  doc.setLineWidth(0.15);
  doc.line(LX, y, 190, y);
  y += 6;
  doc.setFontSize(FS_LABEL);
  pdfInvSetFont(doc, "bold");
  doc.text("Nama", LX, y);
  pdfInvSetFont(doc, "normal");
  doc.setFontSize(FS_BODY);
  const namaPembeliKop = pdfDecodeHtmlEntities(
    String(p.namaPembeli || "-").trim(),
  );
  const namaKopLines = doc.splitTextToSize(namaPembeliKop, 120);
  namaKopLines.forEach((ln) => {
    doc.text(ln, VX, y);
    y += LH_PEMBELI;
  });
  y += 1;
  doc.setFontSize(FS_LABEL);
  pdfInvSetFont(doc, "bold");
  doc.text("Kontak", LX, y);
  pdfInvSetFont(doc, "normal");
  doc.setFontSize(FS_BODY);
  doc.text(String(p.kontakPembeli || "-"), VX, y);
  y += 6;
  doc.setFontSize(FS_LABEL);
  pdfInvSetFont(doc, "bold");
  doc.text("Alamat", LX, y);
  pdfInvSetFont(doc, "normal");
  doc.setFontSize(FS_BODY);
  const alLines = doc.splitTextToSize(String(p.alamatPembeli || "-"), 120);
  alLines.forEach((ln) => {
    doc.text(ln, VX, y);
    y += LH_PEMBELI;
  });
  y += 1;
  if (p.idMasterPembeli) {
    doc.setFontSize(FS_LABEL);
    pdfInvSetFont(doc, "bold");
    doc.text("ID master", LX, y);
    pdfInvSetFont(doc, "normal");
    doc.setFontSize(FS_BODY);
    doc.text(String(p.idMasterPembeli), VX, y);
    y += 6;
  }
  doc.setFontSize(FS_LABEL);
  pdfInvSetFont(doc, "bold");
  doc.text("Tipe", LX, y);
  pdfInvSetFont(doc, "normal");
  doc.setFontSize(FS_BODY);
  doc.text(p.tipePemesanan || "-", VX, y);
  y += 6;
  if (p.tipePemesanan === "International" && p.negara) {
    doc.setFontSize(FS_LABEL);
    pdfInvSetFont(doc, "bold");
    doc.text("Negara", LX, y);
    pdfInvSetFont(doc, "normal");
    doc.setFontSize(FS_BODY);
    doc.text(p.negara || "-", VX, y);
    y += 6;
  }
  y += 4;

  // ========== TABEL 1: DATA PEMESANAN ==========
  y = pageBreakIfNeeded(y + 2);
  doc.setFontSize(FS_SEC);
  pdfInvSetFont(doc, "bold");
  doc.setTextColor(25, 90, 40);
  doc.text("DATA PEMESANAN", LX, y);
  doc.setFontSize(FS_SEC_SUB);
  pdfInvSetFont(doc, "normal");
  doc.setTextColor(88, 98, 92);
  doc.text("Barang dipesan, harga, pajak & pengiriman.", LX, y + 4.4);
  doc.setTextColor(0, 0, 0);
  y += 9;
  const yHdr = y;
  y = pdfInvoiceGreenTableHeader(doc, LX, tblRx, yHdr, HDR_H, [
    { label: "No", x: C_NO_R, opt: { align: "right" } },
    { label: "Item (tipe · jenis · proses)", x: C_DESC },
    { label: "Kg", x: C_QTY_R, opt: { align: "right" } },
    { label: "Harga/Kg", x: C_HP_R, opt: { align: "right" } },
    { label: "Subtotal (Rp)", x: C_SUB_R, opt: { align: "right" } },
    { label: "Pemb. (Rp)", x: C_PAY_R, opt: { align: "right" } },
    { label: "Status", x: C_STAT_X },
  ], FS_TABLE_HEAD);

  const yTableGridTop = y;
  doc.setFontSize(FS_TABLE);
  pdfInvSetFont(doc, "normal");
  const invLines = getPemesananKloterLinesFromDoc(p);
  let rowIdx = 0;

  const drawInvoiceTableRow = ({
    itemLines,
    kgStr,
    hpStr,
    subStr,
    payStr,
    statusStr,
    emphasizeUnpaid,
  }) => {
    const yStartBlock = y;
    doc.setFontSize(FS_TABLE);
    if (emphasizeUnpaid) {
      doc.setTextColor(200, 42, 42);
      pdfInvSetFont(doc, "bold");
    } else {
      doc.setTextColor(0, 0, 0);
      pdfInvSetFont(doc, "normal");
    }
    rowIdx += 1;
    doc.text(String(rowIdx), C_NO_R, yStartBlock, { align: "right" });
    itemLines.forEach((ln) => {
      doc.text(ln, C_DESC, y);
      y += LH_TABLE;
    });
    doc.text(kgStr, C_QTY_R, yStartBlock, { align: "right" });
    doc.text(hpStr, C_HP_R, yStartBlock, { align: "right" });
    doc.text(subStr, C_SUB_R, yStartBlock, { align: "right" });
    doc.text(payStr, C_PAY_R, yStartBlock, { align: "right" });
    const stLines = doc.splitTextToSize(String(statusStr || "—"), W_STATUS);
    let ys = yStartBlock;
    stLines.forEach((ln) => {
      doc.text(ln, C_STAT_X, ys);
      ys += LH_TABLE;
    });
    if (!emphasizeUnpaid) {
      doc.setTextColor(0, 0, 0);
      pdfInvSetFont(doc, "normal");
    }
    const hStatus =
      stLines.length > 0 ? stLines.length * LH_TABLE + 1 : LH_TABLE + 2;
    y = Math.max(y, yStartBlock + hStatus);
    drawRowSep(y);
    y += 2.2;
    doc.setTextColor(0, 0, 0);
    pdfInvSetFont(doc, "normal");
  };

  invLines.forEach((row) => {
    y = pageBreakIfNeeded(y);
    const desk = `${row.tipeProduk || "-"} · ${row.jenisKopi || "-"} · ${row.prosesPengolahan || "-"}`;
    const dLines = doc.splitTextToSize(desk, W_DESC);
    const jumlahKg = parseFloat(row.beratKg) || 0;
    const hargaKg = parseFloat(row.hargaPerKg) || 0;
    const subtotalBaris = jumlahKg * hargaKg;
    const payK = parseFloat(row.jumlahPembayaranKloter) || 0;
    const adaPayK = Number.isFinite(payK) && payK > 0;
    const lunasK = pembayaranBarisLunasTrue(row.pembayaranKloterLunas);
    const emphasizeK = adaPayK && !lunasK;
    drawInvoiceTableRow({
      itemLines: dLines,
      kgStr: pdfFmtIdNumber(jumlahKg),
      hpStr: pdfFmtIdNumber(hargaKg),
      subStr: pdfFmtIdNumber(subtotalBaris),
      payStr: adaPayK ? pdfFmtIdNumber(payK) : "—",
      statusStr: adaPayK ? (lunasK ? "Lunas" : "Belum lunas") : "—",
      emphasizeUnpaid: emphasizeK,
    });
  });

  barisPembayaranTambahan.forEach((ex) => {
    y = pageBreakIfNeeded(y);
    const lunas = pembayaranBarisLunasTrue(ex.terminLunas);
    const catBase = String(ex.catatan || "").trim() || "Pembayaran tahap";
    const catShow = lunas ? catBase : `${catBase} — belum lunas`;
    const jj = parseFloat(ex.jumlahRp) || 0;
    const wItem = Math.max(46, C_QTY_R - C_DESC - 3);
    const itemLines = doc.splitTextToSize(catShow, wItem);
    drawInvoiceTableRow({
      itemLines,
      kgStr: "—",
      hpStr: "—",
      subStr: "—",
      payStr: jj > 0 ? pdfFmtIdNumber(jj) : "—",
      statusStr: lunas ? "Lunas" : "Belum lunas",
      emphasizeUnpaid: !lunas,
    });
  });

  doc.setDrawColor(46, 125, 50);
  doc.setLineWidth(0.2);
  doc.line(LX, y, tblRx, y);
  y += 4;

  /** Baris ringkasan: label di kolom Item, nominal di kolom Subtotal atau Pemb. (font = isi tabel). */
  const drawSummaryLine = (label, amountFormatted, amountRightX) => {
    doc.setFontSize(FS_TABLE);
    pdfInvSetFont(doc, "normal");
    doc.setTextColor(55, 65, 60);
    const maxLab = Math.max(28, amountRightX - C_DESC - 8);
    const labLines = doc.splitTextToSize(label, maxLab);
    const y0 = y;
    labLines.forEach((ln, i) => {
      doc.text(ln, C_DESC, y0 + i * LH_TABLE);
    });
    doc.setTextColor(35, 40, 38);
    doc.text(amountFormatted, amountRightX, y0, { align: "right" });
    doc.setTextColor(0, 0, 0);
    y = y0 + Math.max(labLines.length, 1) * LH_TABLE + 0.8;
    drawRowSep(y);
    y += 2.2;
  };

  drawSummaryLine("Pajak (Rp)", pdfFmtIdNumber(pajakInv), C_SUB_R);
  drawSummaryLine("Pengiriman (Rp)", pdfFmtIdNumber(kirimInv), C_SUB_R);
  drawSummaryLine("Total nilai pemesanan (Rp)", pdfFmtIdNumber(totalInv), C_SUB_R);
  drawSummaryLine("Sudah terbayar (Rp)", pdfFmtIdNumber(sumBayarInv), C_PAY_R);

  doc.setDrawColor(46, 125, 50);
  doc.setLineWidth(0.28);
  doc.line(LX, y, tblRx, y);
  y += 4.5;
  doc.setFontSize(FS_TABLE + 0.5);
  pdfInvSetFont(doc, "bold");
  doc.setTextColor(25, 90, 40);
  const sisaLabel = "SISA TAGIHAN (Rp)";
  const maxSisaLab = Math.max(28, C_PAY_R - C_DESC - 8);
  const sisaLabLines = doc.splitTextToSize(sisaLabel, maxSisaLab);
  const yS0 = y;
  sisaLabLines.forEach((ln, i) => {
    doc.text(ln, C_DESC, yS0 + i * LH_TABLE);
  });
  doc.text(pdfFmtIdNumber(sisaInv), C_PAY_R, yS0, { align: "right" });
  doc.setTextColor(0, 0, 0);
  pdfInvSetFont(doc, "normal");
  doc.setFontSize(FS_BODY);
  y = yS0 + Math.max(sisaLabLines.length, 1) * LH_TABLE + 3;
  doc.setDrawColor(46, 125, 50);
  doc.setLineWidth(0.22);
  doc.line(LX, y, tblRx, y);
  const yTableGridBottom = y;
  y += 6;
  drawInvoiceTableVerticalGrid(yTableGridTop, yTableGridBottom);

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
    pdfInvSetFont(doc, "normal");
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
    pdfInvSetFont(doc, "bold");
    doc.setTextColor(0, 0, 0);
    let yN = yNamaStartFinal;
    namaLines.forEach((ln) => {
      doc.text(ln, xCenterSig, yN, { align: "center" });
      yN += lineHNama;
    });
    pdfInvSetFont(doc, "normal");
    return boxTop + boxH;
  };

  const WCAT = 100;

  let yFooter = y + 8;

  let yBottom = yFooter;

  if (catatan) {
    const outerLTtd = LX + WCAT + 4;
    const sigL = outerLTtd + boxPad;
    const sigR = RX - boxPad;
    doc.setFontSize(9);
    pdfInvSetFont(doc, "bold");
    const namaLinesSig = doc.splitTextToSize(namaPembeliTtd, sigR - sigL);
    pdfInvSetFont(doc, "normal");
    const geo = computeTtdLayout(yFooter, sigL, sigR, namaLinesSig);
    const yCatEnd = pdfDrawCatatanPemesananTable(doc, LX, yFooter, catatan, {
      width: WCAT,
      marginBottom: 4,
      forceSinglePage: true,
      pageBottom: 286,
    });
    drawTtdBlock(yFooter, { ...geo, sigL, sigR }, namaLinesSig);
    yBottom = Math.max(yCatEnd, geo.boxTop + geo.boxH + 6);
  } else {
    const sigR = RX - boxPad;
    const sigL = sigR - 68;
    doc.setFontSize(9);
    pdfInvSetFont(doc, "bold");
    const namaLinesSig = doc.splitTextToSize(namaPembeliTtd, sigR - sigL);
    pdfInvSetFont(doc, "normal");
    const geo = computeTtdLayout(yFooter + 2, sigL, sigR, namaLinesSig);
    drawTtdBlock(yFooter + 2, { ...geo, sigL, sigR }, namaLinesSig);
    yBottom = geo.boxTop + geo.boxH + 8;
  }

  return yBottom;
}
