/**
 * Randomen / rendemen: berat awal ÷ berat green beans (pengemasan).
 * Berat pixel hanya dicatat, tidak masuk penyebut. Jika beratGreenBeans belum ada (data lama), fallback ke beratAkhir.
 * Tampilan utama: rasio sebenarnya (bahan ÷ hasil) dengan dua angka di belakang koma, contoh "6,43 banding 1".
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

  /** Rasio kg bahan per 1 kg hasil, dua angka di belakang koma (perseratus terdekat). */
  function roundBahanPerSatuKgHasil(ratio) {
    if (ratio == null || !Number.isFinite(ratio) || ratio <= 0) return null;
    return Math.round(ratio * 100) / 100;
  }

  /** Angka utama dua desimal (locale id-ID), tanpa sufiks " banding 1". */
  function formatAngkaRandomenUtama(ratio) {
    const n = roundBahanPerSatuKgHasil(ratio);
    if (n == null) return null;
    return n.toLocaleString("id-ID", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /** Tampilan utama: "6,43 banding 1" = kg bahan per 1 kg hasil GB (dua desimal). */
  function formatRandomenBanding1(ratio) {
    const s = formatAngkaRandomenUtama(ratio);
    if (s == null) return "—";
    return `${s} banding 1`;
  }

  /** Rasio untuk tooltip / ringkasan (sama dua desimal dengan kolom utama). */
  function formatRandomenDesimal(ratio) {
    if (ratio == null || !Number.isFinite(ratio)) return "—";
    return formatAngkaRandomenUtama(ratio) || "—";
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

  /**
   * Penyebut randomen: berat green beans (kg). Pixel tidak dihitung.
   * Fallback beratAkhir untuk dokumen lama tanpa beratGreenBeans.
   */
  function getDenominatorHasilRandomenFromDoc(doc) {
    if (!doc) return 0;
    const gb = safeNum(doc.beratGreenBeans);
    if (gb > 0) return gb;
    return safeNum(doc.beratAkhir);
  }

  function getDenominatorHasilRandomenFromHistory(h, doc) {
    if (!h) return getDenominatorHasilRandomenFromDoc(doc);
    const gbH = safeNum(h.beratGreenBeans);
    if (gbH > 0) return gbH;
    const baH = safeNum(h.beratAkhir);
    if (baH > 0) return baH;
    return getDenominatorHasilRandomenFromDoc(doc);
  }

  /** @deprecated Gunakan getDenominatorHasilRandomenFromDoc */
  function getDenominatorAkhirProduksi(p) {
    return getDenominatorHasilRandomenFromDoc(p);
  }

  /** Produksi sudah pengemasan dan punya penyebut randomen (GB atau fallback akhir) > 0 */
  function isPengemasanUntukRandomen(p) {
    const st = (p.statusTahapan || "").toLowerCase();
    if (!st.includes("pengemasan")) return false;
    return getDenominatorHasilRandomenFromDoc(p) > 0;
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
        return getDenominatorHasilRandomenFromDoc(item);
      }
      const bt = safeNum(item.beratTerkini);
      return bt > 0 ? bt : 0;
    }
    const nama = getTahapanLabelFromHistory(h, item);
    if (tahapanIncludesPengemasan(nama)) {
      return getDenominatorHasilRandomenFromHistory(h, item);
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
   * Randomen per ID produksi: berat awal ÷ berat green beans (tahap pengemasan; pixel tidak dihitung).
   */
  function computeRandomenPerId(p) {
    if (!isPengemasanUntukRandomen(p)) return null;
    const b = safeNum(p.beratAwal);
    const d = getDenominatorHasilRandomenFromDoc(p);
    return ratioBahanPerHasil(b, d);
  }

  function formatRandomenPerIdCell(p) {
    const r = computeRandomenPerId(p);
    return r != null ? formatRandomenBanding1(r) : "—";
  }

  /** Tooltip: contoh 921,75 ÷ 143,25 kg (green beans) = 6,43 */
  function formatRandomenPerIdTooltip(p) {
    const r = computeRandomenPerId(p);
    if (r == null) return "";
    const b = safeNum(p.beratAwal);
    const h = getDenominatorHasilRandomenFromDoc(p);
    const pakaiGb = safeNum(p.beratGreenBeans) > 0;
    const label = pakaiGb ? "green beans" : "berat akhir (data lama)";
    return `${formatKgAngka(b)} ÷ ${formatKgAngka(h)} kg (${label}) = ${formatRandomenDesimal(r)}`;
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
      const h = getDenominatorHasilRandomenFromDoc(p);
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
        )} kg ÷ Σ GB randomen ${formatKgAngka(hasil)} kg)`;
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
    formatAngkaRandomenUtama,
    formatKgAngka,
    roundBahanPerSatuKgHasil,
    getDenominatorAkhirProduksi,
    getDenominatorHasilRandomenFromDoc,
    getDenominatorHasilRandomenFromHistory,
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
