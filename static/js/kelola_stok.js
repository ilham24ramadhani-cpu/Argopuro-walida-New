// Fungsi untuk mengagregasi stok dari hasil produksi (MONGODB ONLY)
// Menggunakan logika yang sama dengan Kelola Pemesanan untuk konsistensi
async function aggregateStok() {
  let hasilProduksi = [];
  let produksi = [];

  try {
    if (!window.API || !window.API.HasilProduksi) {
      console.warn("⚠️ API.HasilProduksi not available, cannot aggregate stok");
      return [];
    }

    // Load hasilProduksi dan produksi untuk perhitungan yang akurat
    hasilProduksi = await window.API.HasilProduksi.getAll();

    // Load produksi untuk mendapatkan beratAkhir per idProduksi
    if (window.API.Produksi) {
      produksi = await window.API.Produksi.getAll();
    }
  } catch (error) {
    console.error("Error loading hasil produksi for stok:", error);
    return [];
  }

  // Objek untuk tracking beratAkhir per idProduksi
  const produksiMap = {};
  produksi.forEach((p) => {
    if (p.idProduksi && p.beratAkhir) {
      produksiMap[String(p.idProduksi).trim()] = parseFloat(p.beratAkhir) || 0;
    }
  });

  // Group hasilProduksi by idProduksi untuk menghitung stok tersedia per produksi
  const hasilProduksiByProduksi = {};
  hasilProduksi.forEach((h) => {
    const idProduksi = String(h.idProduksi || "").trim();
    if (!hasilProduksiByProduksi[idProduksi]) {
      hasilProduksiByProduksi[idProduksi] = [];
    }
    hasilProduksiByProduksi[idProduksi].push(h);
  });

  // Hitung stok tersedia per idProduksi
  // KONSEP: Stok tersedia = berat akhir - total hasil produksi dari ordering
  // (hasil produksi dari ordering mengurangi stok)
  const stokTersediaPerProduksi = {};
  Object.keys(hasilProduksiByProduksi).forEach((idProduksi) => {
    const hasilList = hasilProduksiByProduksi[idProduksi];
    const beratAkhir = produksiMap[idProduksi] || 0;

    // Hitung total hasil produksi dari ordering (yang mengurangi stok)
    // Pastikan filter bekerja dengan benar (handle boolean true, string "true", dll)
    const hasilOrdering = hasilList.filter((h) => {
      const isFromOrdering = h.isFromOrdering;
      // Handle berbagai format: boolean true, string "true", dll
      return (
        isFromOrdering === true ||
        isFromOrdering === "true" ||
        isFromOrdering === 1
      );
    });

    const totalDariOrdering = hasilOrdering.reduce(
      (sum, h) => sum + (parseFloat(h.beratSaatIni) || 0),
      0
    );

    // Stok tersedia = berat akhir - total dari ordering
    stokTersediaPerProduksi[idProduksi] = Math.max(
      0,
      beratAkhir - totalDariOrdering
    );

    // Debug logging untuk semua produksi (khususnya PRD002)
    if (
      idProduksi === "PRD002" ||
      Object.keys(stokTersediaPerProduksi).length <= 3
    ) {
      const hasilNormal = hasilList.filter((h) => {
        const isFromOrdering = h.isFromOrdering;
        return !(
          isFromOrdering === true ||
          isFromOrdering === "true" ||
          isFromOrdering === 1
        );
      });

      console.log(`📊 [KELOLA STOK] ${idProduksi}:`, {
        beratAkhir,
        totalDariOrdering,
        stokTersedia: stokTersediaPerProduksi[idProduksi],
        jumlahHasilProduksi: hasilList.length,
        jumlahHasilProduksiNormal: hasilNormal.length,
        jumlahHasilProduksiOrdering: hasilOrdering.length,
        hasilOrderingDetail: hasilOrdering.map((h) => ({
          id: h.id || h._id,
          idProduksi: h.idProduksi,
          isFromOrdering: h.isFromOrdering,
          isFromOrderingType: typeof h.isFromOrdering,
          beratSaatIni: h.beratSaatIni,
        })),
        perhitungan: {
          formula: "stokTersedia = beratAkhir - totalDariOrdering",
          calculation: `${beratAkhir} - ${totalDariOrdering} = ${stokTersediaPerProduksi[idProduksi]} kg`,
        },
      });
    }
  });

  // Objek untuk menyimpan agregasi stok per kombinasi produk
  // Key: kombinasi tipeProduk + kemasan + jenisKopi + prosesPengolahan + levelRoasting
  const stokMap = {};

  // Agregasi berdasarkan kombinasi produk
  // Pastikan setiap idProduksi hanya dihitung sekali per kombinasi produk
  hasilProduksi.forEach((h) => {
    const idProduksi = String(h.idProduksi || "").trim();
    const key = `${h.tipeProduk}|${h.kemasan}|${h.jenisKopi}|${
      h.prosesPengolahan
    }|${h.levelRoasting || ""}`;

    if (!stokMap[key]) {
      // Inisialisasi jika belum ada
      stokMap[key] = {
        tipeProduk: h.tipeProduk,
        kemasan: h.kemasan,
        jenisKopi: h.jenisKopi,
        prosesPengolahan: h.prosesPengolahan,
        levelRoasting: h.levelRoasting || "",
        totalBerat: 0,
        totalJumlah: 0,
        idProduksiSet: new Set(), // Track idProduksi yang sudah dihitung untuk stok
        idProduksiKemasanSet: new Set(), // Track idProduksi yang sudah dihitung untuk kemasan
      };
    }

    // Tambahkan stok tersedia dari idProduksi ini (hanya sekali per idProduksi per kombinasi)
    if (!stokMap[key].idProduksiSet.has(idProduksi)) {
      stokMap[key].idProduksiSet.add(idProduksi);
      const stokTersedia = stokTersediaPerProduksi[idProduksi] || 0;
      stokMap[key].totalBerat += stokTersedia;

      // Debug logging untuk beberapa kombinasi pertama
      if (stokMap[key].idProduksiSet.size <= 2) {
        console.log(`📊 [KELOLA STOK] Kombinasi "${key}":`, {
          idProduksi,
          stokTersedia,
          totalBeratSekarang: stokMap[key].totalBerat,
        });
      }
    }

    // Agregasi jumlah kemasan (hanya dari hasil produksi normal, hanya sekali per idProduksi)
    if (
      !h.isFromOrdering &&
      !stokMap[key].idProduksiKemasanSet.has(idProduksi)
    ) {
      stokMap[key].idProduksiKemasanSet.add(idProduksi);
      // Hitung total kemasan dari idProduksi ini untuk kombinasi produk ini
      const kemasanDariProduksi = hasilProduksi
        .filter(
          (hp) =>
            String(hp.idProduksi || "").trim() === idProduksi &&
            !hp.isFromOrdering &&
            `${hp.tipeProduk}|${hp.kemasan}|${hp.jenisKopi}|${
              hp.prosesPengolahan
            }|${hp.levelRoasting || ""}` === key
        )
        .reduce((sum, hp) => sum + parseInt(hp.jumlah || 0), 0);

      stokMap[key].totalJumlah += kemasanDariProduksi;
    }
  });

  // Konversi map ke array dan cleanup
  const stokArray = Object.values(stokMap).map((s) => {
    delete s.idProduksiSet; // Hapus Set yang tidak perlu di return
    delete s.idProduksiKemasanSet; // Hapus Set yang tidak perlu di return
    return {
      ...s,
      totalBerat: Math.max(0, s.totalBerat), // Jangan biarkan negatif
      totalJumlah: Math.max(0, s.totalJumlah),
    };
  });

  // Sort berdasarkan tipe produk dan kemasan
  stokArray.sort((a, b) => {
    if (a.tipeProduk !== b.tipeProduk) {
      return a.tipeProduk.localeCompare(b.tipeProduk);
    }
    if (a.jenisKopi !== b.jenisKopi) {
      return a.jenisKopi.localeCompare(b.jenisKopi);
    }
    return a.kemasan.localeCompare(b.kemasan);
  });

  // Debug logging untuk summary
  console.log(`📊 [KELOLA STOK] Summary agregasi:`, {
    totalKombinasiProduk: stokArray.length,
    totalStokTersedia:
      stokArray.reduce((sum, s) => sum + s.totalBerat, 0).toFixed(2) + " kg",
    detail: stokArray.map((s) => ({
      kombinasi: `${s.tipeProduk}|${s.kemasan}|${s.jenisKopi}|${s.prosesPengolahan}`,
      totalBerat: s.totalBerat.toFixed(2) + " kg",
      totalJumlah: s.totalJumlah,
    })),
  });

  return stokArray;
}

// Load opsi filter (tipe produk, tanggal pengemasan)
async function loadStokFilterOptions() {
  const tipeSelect = document.getElementById("filterTipeProduk");
  const tanggalSelect = document.getElementById("filterTanggalPengemasan");
  if (!tipeSelect || !tanggalSelect) return;
  try {
    if (window.API && window.API.Stok && window.API.Stok.getFilterOptions) {
      const opts = await window.API.Stok.getFilterOptions();
      tipeSelect.innerHTML = "<option value=\"\">Semua tipe</option>" + (opts.tipeProduk || []).map((t) => `<option value="${t}">${t}</option>`).join("");
      tanggalSelect.innerHTML = "<option value=\"\">Semua tanggal</option>" + (opts.tanggalPengemasan || []).map((d) => `<option value="${d}">${d}</option>`).join("");
    }
  } catch (e) {
    console.warn("Filter options load failed:", e);
  }
}

// Menampilkan stok (dengan filter tipe produk & tanggal pengemasan)
async function displayStok() {
  const tableBody = document.getElementById("tableBody");
  const searchInput = document.getElementById("searchInput");
  const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : "";

  try {
    let stokArray = [];
    const tipeProduk = document.getElementById("filterTipeProduk")?.value?.trim() || "";
    const tanggalPengemasan = document.getElementById("filterTanggalPengemasan")?.value?.trim() || "";

    let ringkasanStok = null;
    if (window.API && window.API.Stok && window.API.Stok.getAll) {
      const res = await window.API.Stok.getAll({ tipeProduk, tanggalPengemasan });
      stokArray = res.rows || [];
      ringkasanStok = res.ringkasan || null;
      console.log(`✅ Loaded ${stokArray.length} stok (filter: tipe=${tipeProduk || "semua"}, tanggal=${tanggalPengemasan || "semua"})`);
    }

    if (!Array.isArray(stokArray)) stokArray = [];

    const footerEl = document.getElementById("stokRingkasanFooter");
    if (footerEl) {
      if (ringkasanStok && ringkasanStok.jumlahBatchPengemasan > 0) {
        const fmt = (n) =>
          Number(n || 0).toLocaleString("id-ID", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 4,
          });
        const ba = ringkasanStok.sumBeratAkhir;
        const gbBruto = ringkasanStok.sumBeratGreenBeansBruto;
        const pxBruto = ringkasanStok.sumBeratPixelBruto;
        const sel = ringkasanStok.selisihBeratAkhirVsGbPx;
        const gbStok = ringkasanStok.totalStokGreenBeansSetelahOrdering;
        footerEl.classList.remove("d-none");
        footerEl.innerHTML =
          `<i class="bi bi-calculator me-1"></i><strong>Penjelasan angka:</strong> Kolom total adalah <strong>stok green beans / pixel</strong> (setelah kurangi pemesanan), ` +
          `bukan jumlah berat akhir. Untuk <strong>${ringkasanStok.jumlahBatchPengemasan}</strong> batch pengemasan pada filter ini: ` +
          `Σ berat akhir = <strong>${fmt(ba)} kg</strong>, Σ green beans (bruto) = <strong>${fmt(gbBruto)} kg</strong>` +
          (pxBruto > 0 ? `, Σ pixel (bruto) = <strong>${fmt(pxBruto)} kg</strong>` : "") +
          `. Selisih berat akhir − (GB + pixel) = <strong>${fmt(sel)} kg</strong> (belum dialokasi ke GB/pixel di form). ` +
          `Stok GB tersedia sekarang = <strong>${fmt(gbStok)} kg</strong>.`;
      } else {
        footerEl.classList.add("d-none");
        footerEl.textContent = "";
      }
    }

    let filteredStok = stokArray;
    if (searchTerm) {
      filteredStok = stokArray.filter(
        (s) =>
          (s.tipeProduk || "").toLowerCase().includes(searchTerm) ||
          (s.jenisKopi || "").toLowerCase().includes(searchTerm) ||
          (s.prosesPengolahan || "").toLowerCase().includes(searchTerm)
      );
    }

    if (filteredStok.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-5 text-muted">
            <i class="bi bi-inbox fs-1 d-block mb-3"></i>
            <p class="mb-0">Tidak ada data stok</p>
            <small>Stok dari produksi tahap Pengemasan. Ubah filter atau pastikan ada produksi dengan berat akhir.</small>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filteredStok
      .map(
        (s, index) => `
      <tr>
        <td class="text-muted">${index + 1}</td>
        <td><span class="badge bg-info">${s.tipeProduk || "-"}</span></td>
        <td><span class="badge ${(window.getJenisKopiBadgeClass || (() => "bg-secondary"))(s.jenisKopi)}">${s.jenisKopi || "-"}</span></td>
        <td>${s.prosesPengolahan || "-"}</td>
        <td class="text-end"><strong class="text-primary">${(s.totalBerat || 0).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</strong></td>
      </tr>
    `
      )
      .join("");
  } catch (error) {
    console.error("Error loading stok:", error);
    if (tableBody) {
      tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-4 text-danger">
          <i class="bi bi-exclamation-triangle fs-1 d-block mb-2"></i>
          Error memuat data stok: ${error.message}
        </td>
      </tr>
    `;
    }
  }
}

// Fungsi untuk menampilkan stok bahan baku
async function displayStokBahan() {
  const tableBodyBahan = document.getElementById("tableBodyBahan");
  if (!tableBodyBahan) return;

  try {
    let stokBahan = [];
    if (window.API && window.API.Stok && window.API.Stok.getBahan) {
      stokBahan = await window.API.Stok.getBahan();
      console.log(`✅ Loaded ${stokBahan.length} stok bahan records`);
    } else {
      console.warn("⚠️ API.Stok.getBahan not available");
      stokBahan = [];
    }

    if (!Array.isArray(stokBahan)) {
      stokBahan = [];
    }

    if (stokBahan.length === 0) {
      tableBodyBahan.innerHTML = `
        <tr>
          <td colspan="10" class="text-center py-5 text-muted">
            <i class="bi bi-inbox fs-1 d-block mb-3"></i>
            <p class="mb-0">Tidak ada data stok bahan baku</p>
            <small>Data stok akan muncul setelah ada data bahan dan produksi</small>
          </td>
        </tr>
      `;
      return;
    }

    tableBodyBahan.innerHTML = stokBahan
      .map((b, index) => {
        const persentase = b.persentaseTersedia || 0;
        let statusBadge = "";
        let statusClass = "";

        if (persentase >= 50) {
          statusBadge = '<span class="badge bg-success">Aman</span>';
          statusClass = "text-success";
        } else if (persentase >= 20) {
          statusBadge =
            '<span class="badge bg-warning text-dark">Hampir Habis</span>';
          statusClass = "text-warning";
        } else {
          statusBadge = '<span class="badge bg-danger">Habis</span>';
          statusClass = "text-danger";
        }

        return `
            <tr>
              <td class="text-muted">${index + 1}</td>
              <td><span class="badge bg-info">${b.idBahan || "-"}</span></td>
              <td>${b.pemasok || "-"}</td>
              <td>${b.varietas || "-"}</td>
              <td><span class="badge ${(window.getJenisKopiBadgeClass || (() => 'bg-secondary'))(b.jenisKopi)}">${b.jenisKopi || "-"}</span></td>
              <td><small class="text-muted">${b.ringkasanProses || "—"}</small></td>
              <td class="text-end"><strong>${(b.totalBahan || 0).toLocaleString(
                "id-ID",
                {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }
              )} kg</strong></td>
              <td class="text-end"><strong class="text-warning">${(
                b.totalDigunakan || 0
              ).toLocaleString("id-ID", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} kg</strong></td>
              <td class="text-end"><strong class="${statusClass}">${(
          b.sisaTersedia || 0
        ).toLocaleString("id-ID", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} kg</strong></td>
              <td class="text-center">${statusBadge}</td>
            </tr>
          `;
      })
      .join("");
  } catch (error) {
    console.error("Error loading stok bahan:", error);
    tableBodyBahan.innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-4 text-danger">
          <i class="bi bi-exclamation-triangle fs-1 d-block mb-2"></i>
          Error memuat data stok bahan: ${error.message}
        </td>
      </tr>
    `;
  }
}

// Fungsi untuk refresh stok
async function refreshStok() {
  await displayStok();
  await displayStokBahan();

  // Tampilkan notifikasi sukses
  const btnRefresh = document.getElementById("btnRefreshStok");
  const originalText = btnRefresh.innerHTML;
  btnRefresh.innerHTML =
    '<i class="bi bi-check-circle me-2"></i>Berhasil Diupdate';
  btnRefresh.classList.remove("btn-outline-primary");
  btnRefresh.classList.add("btn-success");

  setTimeout(() => {
    btnRefresh.innerHTML = originalText;
    btnRefresh.classList.remove("btn-success");
    btnRefresh.classList.add("btn-outline-primary");
  }, 2000);
}

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(async () => {
    try {
      await loadStokFilterOptions();
      await displayStok();
      await displayStokBahan();
    } catch (error) {
      console.error("Error initializing stok page:", error);
    }
  }, 100);

  const btnApplyFilter = document.getElementById("btnApplyFilterStok");
  if (btnApplyFilter) {
    btnApplyFilter.addEventListener("click", async () => {
      await displayStok();
    });
  }

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", async () => {
      await displayStok();
    });
  }

  const searchForm = document.querySelector('form[role="search"]');
  if (searchForm) {
    searchForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await displayStok();
    });
  }

  // Event listener untuk tab change
  const tabButtons = document.querySelectorAll(
    '#stokTabs button[data-bs-toggle="tab"]'
  );
  tabButtons.forEach((button) => {
    button.addEventListener("shown.bs.tab", function (e) {
      const targetTab = e.target.getAttribute("data-bs-target");
      if (targetTab === "#bahan-baku") {
        displayStokBahan();
      }
    });
  });
});

// Event listener untuk update otomatis saat data hasil produksi berubah
window.addEventListener("hasilProduksiUpdated", async function () {
  await displayStok();
  await displayStokBahan();
});

// Event listener untuk dataUpdated event (lebih general)
window.addEventListener("dataUpdated", async function (e) {
  if (e.detail && e.detail.type === "hasilProduksi") {
    await displayStok();
  }
  if (e.detail && (e.detail.type === "produksi" || e.detail.type === "bahan")) {
    await displayStokBahan();
  }
});
