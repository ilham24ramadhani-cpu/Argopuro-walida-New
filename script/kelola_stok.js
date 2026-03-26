// Fungsi untuk mengagregasi stok dari hasil produksi
async function aggregateStok() {
  let hasilProduksi = [];
  try {
    if (window.API && window.API.HasilProduksi) {
      hasilProduksi = await window.API.HasilProduksi.getAll();
    } else {
      hasilProduksi = JSON.parse(localStorage.getItem("hasilProduksi") || "[]");
    }
  } catch (error) {
    console.error("Error loading hasil produksi for stok:", error);
    hasilProduksi = JSON.parse(localStorage.getItem("hasilProduksi") || "[]");
  }

  // Objek untuk menyimpan agregasi stok
  // Key: kombinasi tipeProduk + kemasan + jenisKopi + prosesPengolahan + levelRoasting
  const stokMap = {};

  hasilProduksi.forEach((h) => {
    // Buat key unik berdasarkan kombinasi produk
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
      };
    }

    // Agregasi total berat dan jumlah
    stokMap[key].totalBerat += parseFloat(h.beratSaatIni || 0);
    stokMap[key].totalJumlah += parseInt(h.jumlah || 0);
  });

  // Konversi map ke array
  const stokArray = Object.values(stokMap);

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

  return stokArray;
}

// Fungsi untuk menampilkan stok
async function displayStok() {
  const stokArray = await aggregateStok();
  const tableBody = document.getElementById("tableBody");
  const searchInput = document.getElementById("searchInput");
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";

  // Filter data berdasarkan search
  let filteredStok = stokArray;
  if (searchTerm) {
    filteredStok = stokArray.filter(
      (s) =>
        s.tipeProduk.toLowerCase().includes(searchTerm) ||
        s.kemasan.toLowerCase().includes(searchTerm) ||
        s.jenisKopi.toLowerCase().includes(searchTerm) ||
        s.prosesPengolahan.toLowerCase().includes(searchTerm) ||
        (s.levelRoasting && s.levelRoasting.toLowerCase().includes(searchTerm))
    );
  }

  if (filteredStok.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-5 text-muted">
          <i class="bi bi-inbox fs-1 d-block mb-3"></i>
          <p class="mb-0">Tidak ada data stok</p>
          <small>Data stok akan muncul setelah ada data hasil produksi</small>
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
      <td><span class="badge bg-info">${s.tipeProduk}</span></td>
      <td>${s.kemasan}</td>
      <td><span class="badge ${(window.getJenisKopiBadgeClass || (() => 'bg-secondary'))(s.jenisKopi)}">${s.jenisKopi}</span></td>
      <td>${s.prosesPengolahan}</td>
      <td>${
        s.levelRoasting
          ? `<span class="badge bg-warning text-dark">${s.levelRoasting}</span>`
          : '<span class="text-muted">-</span>'
      }</td>
      <td class="text-end"><strong class="text-primary">${s.totalBerat.toLocaleString(
        "id-ID",
        { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      )} kg</strong></td>
      <td class="text-end"><strong class="text-success">${s.totalJumlah.toLocaleString(
        "id-ID"
      )} <small class="text-muted">kemasan</small></strong></td>
    </tr>
  `
    )
    .join("");
}

// Fungsi untuk refresh stok
async function refreshStok() {
  await displayStok();

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

// Event listener untuk search
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(async () => {
    try {
      await displayStok();
    } catch (error) {
      console.error("Error initializing stok page:", error);
    }
  }, 100);

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", async () => {
      await displayStok();
    });
  }

  // Event listener untuk form search
  const searchForm = document.querySelector('form[role="search"]');
  if (searchForm) {
    searchForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await displayStok();
    });
  }
});

// Event listener untuk update otomatis saat data hasil produksi berubah
window.addEventListener("hasilProduksiUpdated", async function () {
  await displayStok();
});

// Event listener untuk dataUpdated event (lebih general)
window.addEventListener("dataUpdated", async function (e) {
  if (e.detail && e.detail.type === "hasilProduksi") {
    await displayStok();
  }
});
