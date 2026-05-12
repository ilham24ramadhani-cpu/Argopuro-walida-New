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
/** Warna border netral #e5e5e5 (dipakai header & tabel). */
const INVOICE_BORDER_RGB = [229, 229, 229];
/** Aksen hijau merek (judul bagian, total, nama perusahaan di kop). */
const INV_GREEN_RGB = [28, 115, 68];
/** Latar header tabel / baris ringkasan (hijau lembut). */
const INV_GREEN_LIGHT_RGB = [228, 241, 232];
/** Latar kotak ringkasan dokumen. */
const INV_GRAY_BOX_RGB = [248, 249, 250];
/** Baris total tegas (teks putih di atas hijau tua). */
const INV_GREEN_DARK_RGB = [22, 101, 52];

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

/**
 * Kop invoice (gaya INVOICE PEMESANAN): logo kiri, perusahaan kanan (hijau), judul tengah.
 * ID / tanggal / badge status ada di kotak "Ringkasan dokumen" pada isi halaman.
 */
function pdfDrawArgopuroInvoiceHeader(doc, logoDataUrl, p) {
  void p;
  const MARGIN_L = invoicePxToMm(40);
  const MARGIN_R = invoicePxToMm(40);
  const MARGIN_T = invoicePxToMm(30);
  const PAGE_W = 210;
  const RX = PAGE_W - MARGIN_R;
  const CX = PAGE_W / 2;
  const FT_TITLE = invoiceFontPtFromPx(18);
  const FT_BODY = invoiceFontPtFromPx(12);
  const FT_CO = invoiceFontPtFromPx(14);
  const SECTION_AFTER_TITLE = invoicePxToMm(24);

  const nama = "Argopuro Walida";
  const kontak = "+62 857-0766-1006";
  const alamat =
    "Ds. Tlogosari Rt 06/Rw 01, Kecamatan Sumbermalang, Kabupaten Situbondo";

  let y = MARGIN_T;
  const logoW = 22;
  const logoH = 22;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", MARGIN_L, y, logoW, logoH);
    } catch (e) {
      console.warn("addImage logo:", e);
    }
  }

  const addrW = Math.min(88, RX - MARGIN_L - logoW - 14);
  doc.setTextColor(...INV_GREEN_RGB);
  doc.setFontSize(FT_CO);
  pdfInvSetFont(doc, "bold");
  doc.text(nama, RX, y + 6.5, { align: "right" });
  doc.setTextColor(70, 70, 70);
  doc.setFontSize(FT_BODY);
  pdfInvSetFont(doc, "normal");
  doc.text(`Kontak: ${kontak}`, RX, y + 11.5, { align: "right" });
  const addrLines = doc.splitTextToSize(alamat, addrW);
  let ay = y + 16.5;
  addrLines.forEach((ln) => {
    doc.text(ln, RX, ay, { align: "right" });
    ay += invoicePxToMm(24) / 4;
  });

  const yLeftBottom = logoDataUrl ? y + logoH : y;
  const yRule = Math.max(yLeftBottom, ay + 2);

  doc.setDrawColor(...INVOICE_BORDER_RGB);
  doc.setLineWidth(0.2);
  doc.line(MARGIN_L, yRule, RX, yRule);

  let yTitle = yRule + invoicePxToMm(24) / 2;
  doc.setTextColor(22, 22, 22);
  doc.setFontSize(FT_TITLE);
  pdfInvSetFont(doc, "bold");
  doc.text("INVOICE PEMESANAN", CX, yTitle, { align: "center" });
  pdfInvSetFont(doc, "normal");
  doc.setFontSize(FT_BODY - 0.5);
  doc.setTextColor(95, 95, 95);
  doc.text(
    "Dokumen pembelian resmi — mohon periksa rincian berikut.",
    CX,
    yTitle + 6,
    { align: "center" },
  );
  doc.setTextColor(0, 0, 0);

  return yTitle + SECTION_AFTER_TITLE;
}

/**
 * Kotak abu lembut: ID pembelian, tanggal, status (badge).
 * @returns {number} y di bawah kotak
 */
function pdfDrawRingkasanDokumenBox(doc, LX, RX, yTop, p) {
  const pad = 4;
  const lineH = 5.4;
  const titleH = 5.2;
  const idDoc = p?.idPembelian || "-";
  const tgl = invoiceFormatDateForPdf(
    p?.tanggalPemesanan || new Date().toISOString(),
  );
  const orderLabel = (p?.statusPemesanan || "—").trim();
  const bayarLabel = (p?.statusPembayaran || "Belum Lunas").trim();
  const boxH = pad * 2 + titleH + lineH * 4 + 3;
  const lxVal = LX + 52;

  doc.setFillColor(...INV_GRAY_BOX_RGB);
  doc.setDrawColor(...INVOICE_BORDER_RGB);
  doc.setLineWidth(0.15);
  doc.roundedRect(LX, yTop, RX - LX, boxH, 0.6, 0.6, "FD");

  doc.setFontSize(invoiceFontPtFromPx(12));
  let yy = yTop + pad + titleH * 0.75;
  pdfInvSetFont(doc, "bold");
  doc.setTextColor(40, 40, 40);
  doc.text("Ringkasan dokumen", LX + pad, yy);
  yy = yTop + pad + titleH + 1.5;
  pdfInvSetFont(doc, "normal");
  doc.setTextColor(70, 70, 70);
  doc.text("ID Pembelian", LX + pad, yy);
  doc.setTextColor(22, 22, 22);
  doc.text(String(idDoc), lxVal, yy);
  yy += lineH;
  doc.setTextColor(70, 70, 70);
  doc.text("Tanggal pemesanan", LX + pad, yy);
  doc.setTextColor(22, 22, 22);
  doc.text(tgl, lxVal, yy);
  yy += lineH;
  doc.setTextColor(70, 70, 70);
  doc.text("Status pemesanan", LX + pad, yy);
  pdfDrawOrderStatusBadge(doc, lxVal, yy + 0.35, orderLabel);
  yy += lineH;
  doc.setTextColor(70, 70, 70);
  doc.text("Status pembayaran", LX + pad, yy);
  pdfDrawPaymentBadge(doc, lxVal, yy + 0.35, bayarLabel);

  doc.setTextColor(0, 0, 0);
  pdfInvSetFont(doc, "normal");
  return yTop + boxH + 2;
}

/** Angka dengan pemisah ribuan Indonesia, tanpa prefiks Rp/kg */
function pdfFmtIdNumber(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("id-ID");
}

/** Konversi px (96dpi) → mm untuk layout A4 di jsPDF. */
function invoicePxToMm(px) {
  return (Number(px) * 25.4) / 96;
}

/** Ukuran font PDF (pt) dari px layar (96dpi): px × 72/96. */
function invoiceFontPtFromPx(px) {
  return (Number(px) * 72) / 96;
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

  doc.setDrawColor(38, 120, 55);
  doc.setLineWidth(0.15);
  doc.roundedRect(LX, y, W, tableH, 1, 1, "S");

  doc.setFillColor(...INV_GREEN_LIGHT_RGB);
  doc.rect(LX + 0.2, y + 0.2, W - 0.4, headerH - 0.05, "F");
  doc.setDrawColor(38, 120, 55);
  doc.setLineWidth(0.12);
  doc.line(LX, y + headerH, LX + W, y + headerH);

  doc.setTextColor(...INV_GREEN_RGB);
  pdfInvSetFont(doc, "bold");
  doc.setFontSize(8.5);
  doc.text("CATATAN PEMESANAN", LX + padX, y + 5.7);
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
  return yTop + hdrH + 1.2;
}

/** Header tabel abu-abu lembut + border netral (layout profesional). */
function pdfInvoiceNeutralTableHeader(doc, lx, rx, yTop, hdrH, cols, fontPt) {
  const w = rx - lx;
  doc.setFillColor(242, 244, 246);
  doc.setDrawColor(...INVOICE_BORDER_RGB);
  doc.setLineWidth(0.15);
  doc.rect(lx, yTop, w, hdrH, "FD");
  const ty = yTop + hdrH * 0.7;
  doc.setFontSize(
    Number.isFinite(fontPt) && fontPt > 0 ? fontPt : invoiceFontPtFromPx(12),
  );
  pdfInvSetFont(doc, "bold");
  doc.setTextColor(38, 38, 38);
  cols.forEach((c) => {
    doc.text(c.label, c.x, ty, c.opt || {});
  });
  doc.setTextColor(0, 0, 0);
  pdfInvSetFont(doc, "normal");
  return yTop + hdrH;
}

/** Baris ringkasan di bawah tabel: latar hijau tua, teks putih tebal (kontras cetak). */
function pdfInvoiceTableTotalBand(doc, lx, rx, y, label, valueStr) {
  const h = 7;
  doc.setFillColor(...INV_GREEN_DARK_RGB);
  doc.setDrawColor(18, 90, 48);
  doc.setLineWidth(0.1);
  doc.rect(lx, y, rx - lx, h, "FD");
  doc.setTextColor(255, 255, 255);
  pdfInvSetFont(doc, "bold");
  doc.setFontSize(invoiceFontPtFromPx(11));
  doc.text(label, lx + 3, y + h * 0.7);
  doc.text(valueStr, rx - 3, y + h * 0.7, { align: "right" });
  doc.setTextColor(0, 0, 0);
  pdfInvSetFont(doc, "normal");
  return y + h;
}

function pdfDrawInvoiceBody(doc, p, y) {
  pdfInvSetFont(doc, "normal");
  const MARGIN_L = invoicePxToMm(40);
  const MARGIN_R = invoicePxToMm(40);
  const LX = MARGIN_L;
  const RX = 210 - MARGIN_R;
  const LABEL_COL = invoicePxToMm(160);
  const ROW_PAD = invoicePxToMm(8) / 2;
  const SIG_BEFORE = invoicePxToMm(36);
  const FT_SEC = invoiceFontPtFromPx(14);
  const FT_BODY = invoiceFontPtFromPx(12);
  const HDR_H = 7.5;
  const LH = 4.2;
  const SECTION_GAP = invoicePxToMm(24);

  const xStatC = RX - 9;
  const xPayR = xStatC - 20;
  const xSubR = xPayR - 24;
  const xHpR = xSubR - 22;
  const xKgR = xHpR - 17;
  const xItem1 = LX + 12;
  const W_ITEM = Math.max(22, xKgR - 2 - xItem1);
  const xNoL = LX + 3;

  const sisaInv = totalPembayaranSaatIniFromDoc(p);
  const pajakInv = Math.max(0, parseFloat(p.biayaPajak) || 0);
  const kirimInv = Math.max(0, parseFloat(p.biayaPengiriman) || 0);
  const invLines = getPemesananKloterLinesFromDoc(p);
  const barisPembayaranTambahan = pdfPembayaranBertahapBarisOnlyForInvoice(p);

  const orderTableCols = () => [
    { label: "No", x: xNoL },
    { label: "Item", x: xItem1 + 0.5 },
    { label: "Kg", x: xKgR - 0.5, opt: { align: "right" } },
    { label: "Harga/Kg", x: xHpR - 0.5, opt: { align: "right" } },
    { label: "Subtotal", x: xSubR - 0.5, opt: { align: "right" } },
    { label: "Pembayaran", x: xPayR - 0.5, opt: { align: "right" } },
    { label: "Status", x: xStatC, opt: { align: "center" } },
  ];

  const drawH = (yy) => {
    doc.setDrawColor(...INVOICE_BORDER_RGB);
    doc.setLineWidth(0.12);
    doc.line(LX, yy, RX, yy);
  };

  y += SECTION_GAP * 0.3;
  y = pdfDrawRingkasanDokumenBox(doc, LX, RX, y, p);
  y += SECTION_GAP * 0.65;

  const yPembeliBar = y;
  doc.setFillColor(...INV_GREEN_LIGHT_RGB);
  doc.setDrawColor(...INVOICE_BORDER_RGB);
  doc.setLineWidth(0.1);
  doc.rect(LX, yPembeliBar, RX - LX, 5.8, "FD");
  doc.setFontSize(FT_SEC);
  pdfInvSetFont(doc, "bold");
  doc.setTextColor(...INV_GREEN_RGB);
  doc.text("PEMBELI", LX + 2, yPembeliBar + 4.1);
  pdfInvSetFont(doc, "normal");
  doc.setTextColor(0, 0, 0);
  y = yPembeliBar + 5.8 + 2;
  drawH(y);
  y += 3.5;

  const drawBuyerRow = (label, valueRaw) => {
    doc.setFontSize(FT_BODY);
    pdfInvSetFont(doc, "bold");
    doc.setTextColor(72, 72, 72);
    doc.text(label, LX, y);
    pdfInvSetFont(doc, "normal");
    doc.setTextColor(28, 28, 28);
    const vx = LX + LABEL_COL;
    const val = pdfDecodeHtmlEntities(String(valueRaw ?? "—").trim()) || "—";
    const lines = doc.splitTextToSize(val, RX - vx - 2);
    lines.forEach((ln, idx) => {
      doc.text(ln, vx, y + idx * LH);
    });
    y += Math.max(lines.length, 1) * LH + 2.2;
  };

  drawBuyerRow("Nama", String(p.namaPembeli || "-").trim() || "-");
  drawBuyerRow("Kontak", p.kontakPembeli || "-");
  drawBuyerRow("Alamat", p.alamatPembeli || "-");
  if (p.idMasterPembeli) {
    drawBuyerRow("ID master", String(p.idMasterPembeli));
  }
  drawBuyerRow("Tipe", p.tipePemesanan || "-");
  if (p.tipePemesanan === "International" && p.negara) {
    drawBuyerRow("Negara", p.negara || "-");
  }

  y += 1.5;
  drawH(y);
  y += SECTION_GAP * 0.65;

  const yDataBar = y;
  doc.setFillColor(...INV_GREEN_LIGHT_RGB);
  doc.setDrawColor(...INVOICE_BORDER_RGB);
  doc.setLineWidth(0.1);
  doc.rect(LX, yDataBar, RX - LX, 5.8, "FD");
  doc.setFontSize(FT_SEC);
  pdfInvSetFont(doc, "bold");
  doc.setTextColor(...INV_GREEN_RGB);
  doc.text("DATA PEMESANAN", LX + 2, yDataBar + 4.1);
  pdfInvSetFont(doc, "normal");
  doc.setTextColor(0, 0, 0);
  y = yDataBar + 5.8 + 2;

  y = pdfInvoiceGreenTableHeader(
    doc,
    LX,
    RX,
    y,
    HDR_H,
    orderTableCols(),
    7,
  );

  doc.setFontSize(FT_BODY - 0.5);
  let rowIdx = 0;

  const drawPemesananRow = ({
    itemLines,
    kgStr,
    hpStr,
    subStr,
    payStr,
    statusStr,
    emphasizeUnpaid,
  }) => {
    const yStart = y + ROW_PAD;
    rowIdx += 1;
    if (emphasizeUnpaid) {
      doc.setTextColor(195, 40, 40);
      pdfInvSetFont(doc, "bold");
    } else {
      doc.setTextColor(22, 22, 22);
      pdfInvSetFont(doc, "normal");
    }
    doc.text(String(rowIdx), xNoL, yStart);
    let yi = yStart;
    itemLines.forEach((ln) => {
      doc.text(ln, xItem1 + 0.5, yi);
      yi += LH;
    });
    doc.text(kgStr, xKgR - 0.5, yStart, { align: "right" });
    doc.text(hpStr, xHpR - 0.5, yStart, { align: "right" });
    doc.text(subStr, xSubR - 0.5, yStart, { align: "right" });
    doc.text(payStr, xPayR - 0.5, yStart, { align: "right" });
    const st = String(statusStr || "—");
    doc.setFontSize(FT_BODY - 1);
    doc.text(st, xStatC, yStart, { align: "center" });
    doc.setFontSize(FT_BODY - 0.5);
    const hInner = Math.max(yi - yStart, LH);
    y = yStart + hInner + ROW_PAD;
    drawH(y);
    y += 1;
    doc.setTextColor(0, 0, 0);
    pdfInvSetFont(doc, "normal");
  };

  invLines.forEach((row) => {
    const desk = `${row.tipeProduk || "-"} - ${row.jenisKopi || "-"} - ${row.prosesPengolahan || "-"}`;
    const itemLines = doc.splitTextToSize(desk, W_ITEM);
    const jumlahKg = parseFloat(row.beratKg) || 0;
    const hargaKg = parseFloat(row.hargaPerKg) || 0;
    const subtotalBaris = jumlahKg * hargaKg;
    const payK = parseFloat(row.jumlahPembayaranKloter) || 0;
    const adaPayK = Number.isFinite(payK) && payK > 0;
    const lunasK = pembayaranBarisLunasTrue(row.pembayaranKloterLunas);
    drawPemesananRow({
      itemLines,
      kgStr: pdfFmtIdNumber(jumlahKg),
      hpStr: pdfFmtIdNumber(hargaKg),
      subStr: pdfFmtIdNumber(subtotalBaris),
      payStr: adaPayK ? pdfFmtIdNumber(payK) : "—",
      statusStr: adaPayK ? (lunasK ? "Lunas" : "Belum") : "—",
      emphasizeUnpaid: adaPayK && !lunasK,
    });
  });

  barisPembayaranTambahan.forEach((ex) => {
    const lunas = pembayaranBarisLunasTrue(ex.terminLunas);
    const catBase = String(ex.catatan || "").trim() || "Pembayaran tahap";
    const catShow = lunas ? catBase : `${catBase} (belum lunas)`;
    const jj = parseFloat(ex.jumlahRp) || 0;
    const itemLines = doc.splitTextToSize(
      pdfDecodeHtmlEntities(catShow),
      W_ITEM,
    );
    drawPemesananRow({
      itemLines,
      kgStr: "—",
      hpStr: "—",
      subStr: "—",
      payStr: jj > 0 ? pdfFmtIdNumber(jj) : "—",
      statusStr: lunas ? "Lunas" : "Belum",
      emphasizeUnpaid: !lunas,
    });
  });

  const drawSummaryLine = (label, amountStr) => {
    doc.setFontSize(FT_BODY - 0.5);
    doc.setTextColor(60, 60, 60);
    pdfInvSetFont(doc, "normal");
    doc.text(label, xItem1, y + 3.8);
    doc.setTextColor(28, 28, 28);
    doc.text(amountStr, xSubR - 0.5, y + 3.8, { align: "right" });
    y += 5;
    drawH(y);
    y += 0.8;
  };

  y += 2;
  drawSummaryLine("Pajak (Rp)", pdfFmtIdNumber(pajakInv));
  drawSummaryLine("Pengiriman (Rp)", pdfFmtIdNumber(kirimInv));
  y += 0.5;
  y = pdfInvoiceTableTotalBand(
    doc,
    LX,
    RX,
    y,
    "TOTAL TAGIHAN (Rp)",
    pdfFmtIdNumber(sisaInv),
  );
  y += SECTION_GAP * 0.45;

  const catatan = (p.catatanPemesanan && String(p.catatanPemesanan).trim()) || "";
  const boxPad = 3;
  const gapTtdKeRuangTtd = 10;
  const gapGarisKeNama = 4;
  const lineHNama = 4.5;

  y += SIG_BEFORE;
  let yFooter = y;

  const drawTtdSeller = (yTop, sigL, sigR) => {
    const xC = (sigL + sigR) / 2;
    const y0 = yTop + 4;
    const yGr = y0 + gapTtdKeRuangTtd + 5;
    const yNm = yGr + gapGarisKeNama;
    const bTop = yTop - boxPad;
    const bottomNama = yNm + lineHNama + 3;
    const bH = Math.max(bottomNama + boxPad - bTop, 32);
    const outerL = sigL - boxPad;
    const outerW = sigR - sigL + boxPad * 2;
    doc.setDrawColor(...INVOICE_BORDER_RGB);
    doc.setLineWidth(0.12);
    doc.roundedRect(outerL, bTop, outerW, bH, 0.8, 0.8, "S");
    doc.setFontSize(FT_BODY);
    pdfInvSetFont(doc, "normal");
    doc.setTextColor(75, 75, 75);
    doc.text("Hormat Kami,", xC, y0, { align: "center" });
    doc.setDrawColor(110, 110, 110);
    doc.setLineWidth(0.18);
    doc.line(sigL, yGr, sigR, yGr);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.1);
    doc.setFontSize(FT_BODY);
    pdfInvSetFont(doc, "bold");
    doc.setTextColor(...INV_GREEN_RGB);
    doc.text("Argopuro Walida", xC, yNm, { align: "center" });
    doc.setTextColor(0, 0, 0);
    pdfInvSetFont(doc, "normal");
    return bTop + bH;
  };

  const sigW = 58;
  const WCAT = Math.max(38, RX - LX - sigW - 14);
  let yBottom = yFooter;

  if (catatan) {
    const sigR = RX - boxPad;
    const sigL = sigR - 56;
    const useSigL = Math.max(sigL, LX + WCAT + 8);
    const yCatEnd = pdfDrawCatatanPemesananTable(doc, LX, yFooter, catatan, {
      width: WCAT,
      marginBottom: 3,
      forceSinglePage: true,
      pageBottom: 297 - invoicePxToMm(40),
    });
    const ySigEnd = drawTtdSeller(yFooter, useSigL, sigR);
    yBottom = Math.max(yCatEnd, ySigEnd + 4);
  } else {
    const sigR = RX - boxPad;
    const sigL = sigR - 56;
    const ySigEnd = drawTtdSeller(yFooter, sigL, sigR);
    yBottom = ySigEnd + 6;
  }

  return yBottom;
}

