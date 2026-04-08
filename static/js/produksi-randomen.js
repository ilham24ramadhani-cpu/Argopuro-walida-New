/**
 * Randomen / rendemen: berat awal ÷ berat akhir (pengemasan).
 * Tampilan utama: N banding 1 (Math.round), arti ±N kg bahan untuk 1 kg hasil.
 * Detail rasio (desimal) untuk tooltip / PDF: formatRandomenDesimal, formatRandomenPerIdTooltip.
 */
(function (global) {
  function safeNum(v) {
    if (v === null || v === undefined) return 0;
    const n = typeof v === "number" ? v : parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  function ratioBahanPerHasil(bahanKg, hasilKg) {
    const h = safeNum(hasilKg);
    const b = safeNum(bahanKg);
    if (h <= 0 || b <= 0) return null;
    return b / h;
  }

  /** Nilai pembulatan: kg bahan per 1 kg hasil (untuk tampilan "N banding 1"). */
  function roundBahanPerSatuKgHasil(ratio) {
    if (ratio == null || !Number.isFinite(ratio) || ratio <= 0) return null;
    const n = Math.round(ratio);
    return n < 1 ? 1 : n;
  }

  /** Tampilan utama: "6 banding 1" = ±6 kg bahan untuk 1 kg hasil (dibulatkan). */
  function formatRandomenBanding1(ratio) {
    const n = roundBahanPerSatuKgHasil(ratio);
    if (n == null) return "—";
    return `${n.toLocaleString("id-ID")} banding 1`;
  }

  /** Angka rasio detail (tooltip / PDF teks penjelas), bukan untuk kolom utama. */
  function formatRandomenDesimal(ratio) {
    if (ratio == null || !Number.isFinite(ratio)) return "—";
    return ratio.toLocaleString("id-ID", { maximumFractionDigits: 4 });
  }

  function formatKgAngka(kg) {
    const n = safeNum(kg);
    if (n <= 0) return "—";
    return n.toLocaleString("id-ID", { maximumFractionDigits: 4 });
  }

  /** @deprecated Gunakan formatRandomenBanding1 untuk rasio; formatKgAngka untuk berat. */
  function formatRandomenRatio(ratio) {
    return formatRandomenBanding1(ratio);
  }

  /** Penyebut rendemen per batch: berat akhir pengemasan (kg). */
  function getDenominatorAkhirProduksi(p) {
    return safeNum(p.beratAkhir);
  }

  /** Produksi sudah pengemasan dan punya berat akhir > 0 untuk perhitungan */
  function isPengemasanUntukRandomen(p) {
    const st = (p.statusTahapan || "").toLowerCase();
    if (!st.includes("pengemasan")) return false;
    return safeNum(p.beratAkhir) > 0;
  }

  function tahapanIncludesPengemasan(name) {
    return (name || "").toLowerCase().includes("pengemasan");
  }

  /**
   * Hasil (kg) untuk pembagi randomen pada satu baris alur.
   * @param {object} item dokumen produksi
   * @param {object|null} h entri history (jika baris dari riwayat)
   * @param {'history'|'current'} rowKind
   */
  function getHasilKgUntukBarisAlur(item, h, rowKind) {
    if (rowKind === "current") {
      if (tahapanIncludesPengemasan(item.statusTahapan)) {
        return safeNum(item.beratAkhir);
      }
      const bt = safeNum(item.beratTerkini);
      return bt > 0 ? bt : 0;
    }
    const nama = getTahapanLabelFromHistory(h, item);
    if (tahapanIncludesPengemasan(nama)) {
      const ba = safeNum(h.beratAkhir);
      if (ba > 0) return ba;
      return safeNum(item.beratAkhir);
    }
    const bt = safeNum(h.beratTerkini);
    if (bt > 0) return bt;
    return safeNum(h.beratAkhir);
  }

  function getTahapanLabelFromHistory(h, doc) {
    return (
      (h && (h.statusTahapan || h.namaTahapan || h.statusTahapanSebelumnya)) ||
      (doc && doc.statusTahapan) ||
      "—"
    );
  }

  /**
   * Randomen per ID produksi: berat awal ÷ berat akhir (tahap pengemasan).
   */
  function computeRandomenPerId(p) {
    if (!isPengemasanUntukRandomen(p)) return null;
    const b = safeNum(p.beratAwal);
    const d = safeNum(p.beratAkhir);
    return ratioBahanPerHasil(b, d);
  }

  function formatRandomenPerIdCell(p) {
    const r = computeRandomenPerId(p);
    return r != null ? formatRandomenBanding1(r) : "—";
  }

  /** Tooltip: contoh 85,5 ÷ 17,09 ≈ 5,0032 */
  function formatRandomenPerIdTooltip(p) {
    const r = computeRandomenPerId(p);
    if (r == null) return "";
    const b = safeNum(p.beratAwal);
    const h = safeNum(p.beratAkhir);
    return `${formatKgAngka(b)} ÷ ${formatKgAngka(h)} ≈ ${formatRandomenDesimal(r)}`;
  }

  /**
   * Ringkasan teks per tahapan untuk tooltip / accordion.
   */
  /** Satu baris dipisah " | " untuk kolom rekap */
  function formatRingkasanPerTahapanSatuBaris(p) {
    const bahan = safeNum(p.beratAwal);
    const hist = Array.isArray(p.historyTahapan) ? p.historyTahapan : [];
    const parts = [];
    const pushShort = (label, hasilKg) => {
      const ratio = ratioBahanPerHasil(bahan, hasilKg);
      const clean = (label || "—").replace(/\s+/g, " ").trim();
      const short =
        clean.length > 22 ? `${clean.slice(0, 19)}…` : clean;
      parts.push(
        `${short}: ${ratio != null ? formatRandomenBanding1(ratio) : "—"}`
      );
    };
    if (hist.length === 0) {
      pushShort(
        `${p.statusTahapan || "—"} ( kini )`,
        getHasilKgUntukBarisAlur(p, null, "current")
      );
      return parts.join(" | ") || "—";
    }
    hist.forEach((h) => {
      pushShort(
        getTahapanLabelFromHistory(h, p),
        getHasilKgUntukBarisAlur(p, h, "history")
      );
    });
    pushShort(
      `${p.statusTahapan || "—"} ( kini )`,
      getHasilKgUntukBarisAlur(p, null, "current")
    );
    return parts.join(" | ") || "—";
  }

  function buildRingkasanPerTahapanText(p) {
    const bahan = safeNum(p.beratAwal);
    const hist = Array.isArray(p.historyTahapan) ? p.historyTahapan : [];
    const parts = [];

    const push = (label, hasilKg) => {
      const ratio = ratioBahanPerHasil(bahan, hasilKg);
      const tail =
        ratio != null ? formatRandomenBanding1(ratio) : "—";
      parts.push(`${label}: ${tail}`);
    };

    if (hist.length === 0) {
      push(
        `${p.statusTahapan || "—"} (status saat ini)`,
        getHasilKgUntukBarisAlur(p, null, "current")
      );
      return parts.join("\n");
    }

    hist.forEach((h) => {
      const nama = getTahapanLabelFromHistory(h, p);
      push(nama, getHasilKgUntukBarisAlur(p, h, "history"));
    });
    push(
      `${p.statusTahapan || "—"} (status saat ini)`,
      getHasilKgUntukBarisAlur(p, null, "current")
    );
    return parts.join("\n");
  }

  /**
   * Agregasi untuk rekap: hanya batch yang sudah pengemasan + berat valid.
   * getProses: (p) => string label proses pengolahan
   */
  function summarizeRandomenAgregat(items, getProses) {
    const byProses = {};
    let sumBahan = 0;
    let sumHasil = 0;

    (items || []).forEach((p) => {
      if (!isPengemasanUntukRandomen(p)) return;
      const b = safeNum(p.beratAwal);
      const h = safeNum(p.beratAkhir);
      if (b <= 0 || h <= 0) return;
      const key = (getProses && getProses(p)) || p.prosesPengolahan || "—";
      if (!byProses[key]) byProses[key] = { bahan: 0, hasil: 0, batch: 0 };
      byProses[key].bahan += b;
      byProses[key].hasil += h;
      byProses[key].batch += 1;
      sumBahan += b;
      sumHasil += h;
    });

    const perProsesLines = Object.keys(byProses)
      .sort()
      .map((k) => {
        const { bahan, hasil } = byProses[k];
        const r = hasil > 0 ? bahan / hasil : null;
        const rasioStr = r != null ? formatRandomenBanding1(r) : "—";
        return `${k}: ${rasioStr} (Σ berat awal ${formatKgAngka(
          bahan
        )} kg ÷ Σ berat akhir ${formatKgAngka(hasil)} kg)`;
      });

    const totalRatio = sumHasil > 0 ? sumBahan / sumHasil : null;

    return {
      byProses,
      perProsesLines,
      sumBahan,
      sumHasil,
      totalRatio,
    };
  }

  global.ProduksiRandomen = {
    safeNum,
    ratioBahanPerHasil,
    formatRandomenRatio,
    formatRandomenBanding1,
    formatRandomenDesimal,
    formatKgAngka,
    roundBahanPerSatuKgHasil,
    getDenominatorAkhirProduksi,
    isPengemasanUntukRandomen,
    computeRandomenPerId,
    formatRandomenPerIdCell,
    formatRandomenPerIdTooltip,
    getHasilKgUntukBarisAlur,
    getTahapanLabelFromHistory,
    buildRingkasanPerTahapanText,
    formatRingkasanPerTahapanSatuBaris,
    summarizeRandomenAgregat,
  };
})(typeof window !== "undefined" ? window : globalThis);
