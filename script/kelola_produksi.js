// Data produksi (menggunakan API Service dengan fallback ke localStorage)
let produksi = [];
let currentEditId = null;
let currentDeleteId = null;

// Load data produksi dari API atau localStorage
async function loadProduksiData() {
  try {
    if (window.API && window.API.Produksi) {
      produksi = await window.API.Produksi.getAll();
    } else {
      // Fallback ke localStorage jika API belum tersedia
      produksi = JSON.parse(localStorage.getItem("produksi") || "[]");
    }
  } catch (error) {
    console.error("Error loading produksi:", error);
    produksi = JSON.parse(localStorage.getItem("produksi") || "[]");
  }
}

// Fungsi untuk menghitung sisa bahan berdasarkan ID Bahan
async function calculateSisaBahan(idBahan) {
  try {
    if (window.API && window.API.Bahan) {
      const sisaData = await window.API.Bahan.getSisa(idBahan);
      return sisaData.sisaTersedia || 0;
    } else {
      // Fallback ke localStorage
      const bahan = JSON.parse(localStorage.getItem("bahan") || "[]");
      const produksi = JSON.parse(localStorage.getItem("produksi") || "[]");
      const bahanData = bahan.find((b) => b.idBahan === idBahan);
      if (!bahanData) return 0;
      const totalDigunakan = produksi
        .filter((p) => p.idBahan === idBahan)
        .reduce((sum, p) => sum + (parseFloat(p.beratAwal) || 0), 0);
      return Math.max(0, (parseFloat(bahanData.jumlah) || 0) - totalDigunakan);
    }
  } catch (error) {
    console.error("Error calculating sisa bahan:", error);
    return 0;
  }
}

// Load data bahan untuk dropdown
async function loadBahanOptionsProduksi() {
  try {
    let bahan = [];
    if (window.API && window.API.Bahan) {
      bahan = await window.API.Bahan.getAll();
    } else {
      bahan = JSON.parse(localStorage.getItem("bahan") || "[]");
    }

    const select = document.getElementById("idBahan");
    if (select) {
      const selectedValue = select.value; // Simpan nilai yang dipilih
      select.innerHTML = '<option value="">Pilih ID Bahan</option>';

      // Load semua sisa bahan secara paralel
      const bahanPromises = bahan.map(async (b) => {
        const sisaBahan = await calculateSisaBahan(b.idBahan);
        return { ...b, sisaBahan };
      });

      const bahanWithSisa = await Promise.all(bahanPromises);

      bahanWithSisa.forEach((b) => {
        const option = document.createElement("option");
        option.value = b.idBahan;
        option.textContent = `${b.idBahan} - ${b.pemasok} (Total: ${
          b.jumlah
        } kg, Sisa: ${b.sisaBahan.toLocaleString("id-ID")} kg)`;
        option.dataset.bahan = JSON.stringify(b); // Simpan data bahan di option
        select.appendChild(option);
      });

      // Kembalikan nilai yang dipilih jika ada
      if (selectedValue) {
        select.value = selectedValue;
      }
    }
  } catch (error) {
    console.error("Error loading bahan options:", error);
  }
}

// Fungsi untuk auto-fill data dari bahan yang dipilih
async function loadBahanDataProduksi() {
  const idBahanSelect = document.getElementById("idBahan");
  const selectedOption = idBahanSelect.options[idBahanSelect.selectedIndex];

  if (!selectedOption || !selectedOption.value) {
    // Jika tidak ada yang dipilih, reset field
    return;
  }

  // Ambil data bahan dari dataset option
  let bahanData = null;
  try {
    bahanData = JSON.parse(selectedOption.dataset.bahan || "null");
  } catch (e) {
    // Jika parsing gagal, cari dari API atau localStorage
  }

  if (!bahanData) {
    // Jika tidak ada data di dataset, cari dari API atau localStorage
    try {
      if (window.API && window.API.Bahan) {
        bahanData = await window.API.Bahan.getById(selectedOption.value);
      } else {
        const bahan = JSON.parse(localStorage.getItem("bahan") || "[]");
        bahanData = bahan.find((b) => b.idBahan === selectedOption.value);
      }
    } catch (error) {
      console.error("Error loading bahan data:", error);
      return;
    }
    if (!bahanData) return;
  }

  // Auto-fill data (TANPA berat awal - user input manual)
  document.getElementById("varietas").value = bahanData.varietas || "";
  document.getElementById("tanggalMasuk").value = bahanData.tanggalMasuk || "";

  // Tampilkan info sisa bahan di placeholder atau label
  const sisaBahan = await calculateSisaBahan(bahanData.idBahan);
  const beratAwalInput = document.getElementById("beratAwal");
  if (beratAwalInput) {
    beratAwalInput.placeholder = `Masukkan berat awal (Sisa bahan: ${sisaBahan.toLocaleString(
      "id-ID",
    )} kg)`;
    beratAwalInput.title = `Sisa bahan tersedia: ${sisaBahan.toLocaleString(
      "id-ID",
    )} kg dari total ${bahanData.jumlah.toLocaleString("id-ID")} kg`;
    beratAwalInput.max = sisaBahan; // Set max value untuk validasi
  }

  // Load varietas options untuk memastikan datalist ter-update
  loadVarietasOptionsProduksi();
}

// Load data master proses pengolahan dari dataProses (Master Data)
async function loadProsesPengolahanOptions() {
  console.log("🔵 loadProsesPengolahanOptions() dipanggil");

  try {
    let masterProses = [];
    try {
      if (window.API && window.API.MasterData && window.API.MasterData.proses) {
        console.log("✅ Menggunakan window.API.MasterData.proses");
        masterProses = await window.API.MasterData.proses.getAll();
        console.log("📊 Total proses dari API:", masterProses.length);
      } else {
        console.log("🔄 Menggunakan fetch langsung ke /api/dataProses");
        const response = await fetch("/api/dataProses");
        if (response.ok) {
          masterProses = await response.json();
          console.log("📊 Total proses dari fetch:", masterProses.length);
        } else {
          console.warn("⚠️ Response tidak OK, menggunakan localStorage");
          masterProses = JSON.parse(localStorage.getItem("dataProses") || "[]");
        }
      }
    } catch (error) {
      console.error("❌ Error loading proses pengolahan:", error);
      masterProses = JSON.parse(localStorage.getItem("dataProses") || "[]");
    }

    console.log(
      "📋 Data master proses:",
      masterProses.map((p) => ({
        nama: p.nama,
        tahapanStatus: p.tahapanStatus,
      })),
    );

    const select = document.getElementById("prosesPengolahan");
    if (!select) {
      console.error("❌ Element prosesPengolahan tidak ditemukan");
      return;
    }

    const selectedValue = select.value;
    select.innerHTML = '<option value="">Pilih Proses Pengolahan</option>';

    if (masterProses.length === 0) {
      console.warn("⚠️ Tidak ada data master proses ditemukan");
      const option = document.createElement("option");
      option.value = "";
      option.textContent =
        "Tidak ada data master. Silakan tambah di halaman Kelola Data Master.";
      option.disabled = true;
      select.appendChild(option);
      return;
    }

    masterProses.forEach((item) => {
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

async function loadTahapanFromMasterProduksi() {
  console.log("🔵 loadTahapanFromMasterProduksi() dipanggil");

  const prosesSelect = document.getElementById("prosesPengolahan");
  const statusSelect = document.getElementById("statusTahapan");
  const statusInfo = document.getElementById("statusTahapanInfo");
  const statusError = document.getElementById("statusTahapanError");

  if (!prosesSelect || !statusSelect) {
    console.error("❌ Element prosesSelect atau statusSelect tidak ditemukan");
    return;
  }

  const selectedOption = prosesSelect.options[prosesSelect.selectedIndex];
  const selectedValue = selectedOption ? selectedOption.value : null;

  console.log("📋 Proses yang dipilih:", selectedValue);

  if (!selectedOption || !selectedValue) {
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
    Sortasi: "Sortasi Buah",
    Fermentasi: "Fermentasi",
    Pencucian: "Pencucian",
    Pengeringan: "Pengeringan",
    Hulling: "Pengupasan Kulit Tanduk (Hulling) Kedua",
    Roasting: "Roasting",
    Grinding: "Grinding",
  };

  console.log("🔄 Memproses tahapan dari master:", masterData.tahapanStatus);

  for (const [tahapan, status] of Object.entries(masterData.tahapanStatus)) {
    if (status === true) {
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

  // Tambahkan Pengemasan (selalu tersedia)
  availableTahapan.push({
    value: "Pengemasan",
    label: "Pengemasan (Tahapan Akhir)",
    key: "Pengemasan",
  });

  console.log("📋 Total tahapan tersedia:", availableTahapan.length);

  // Update dropdown
  const previousSelectedValue = statusSelect.value;
  statusSelect.innerHTML = '<option value="">Pilih Status Tahapan</option>';

  availableTahapan.forEach((tahapan) => {
    const option = document.createElement("option");
    option.value = tahapan.value;
    option.textContent = tahapan.label;
    statusSelect.appendChild(option);
    console.log(`➕ Menambahkan option: ${tahapan.value} - ${tahapan.label}`);
  });

  // Kembalikan nilai yang dipilih jika ada
  if (
    previousSelectedValue &&
    availableTahapan.some((t) => t.value === previousSelectedValue)
  ) {
    statusSelect.value = previousSelectedValue;
    console.log("✅ Mengembalikan nilai yang dipilih:", previousSelectedValue);
  }

  // Update info
  if (statusInfo) {
    const tahapanCount = availableTahapan.length - 1; // Exclude Pengemasan dari count
    statusInfo.innerHTML = `<i class="bi bi-check-circle text-success"></i> Tahapan tersedia: ${tahapanCount} tahapan dari master + Pengemasan`;
  }
  if (statusError) {
    statusError.classList.add("d-none");
  }

  console.log("✅ loadTahapanFromMasterProduksi() selesai");
}

// Validasi sequential tahapan di frontend
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
    "Sortasi Buah": "Sortasi",
    Fermentasi: "Fermentasi",
    Pencucian: "Pencucian",
    Pengeringan: "Pengeringan",
    "Pengupasan Kulit Tanduk (Hulling) Pertama": "Pulping 2",
    "Pengupasan Kulit Tanduk (Hulling) Kedua": "Hulling",
    "Pengupasan Kulit Tanduk (Hulling)": "Hulling",
    Roasting: "Roasting",
    Grinding: "Grinding",
    Pengemasan: "Pengemasan",
  };

  const urutanTahapan = [
    "Sortasi",
    "Fermentasi",
    "Pencucian",
    "Pengeringan",
    "Hulling",
    "Roasting",
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

    if (indexBaru < indexLama) {
      statusErrorText.textContent = `Tidak dapat mengubah tahapan dari "${currentProduksiTahapanAktif}" ke "${selectedTahapan}". Tidak boleh kembali ke tahapan sebelumnya.`;
      statusError.classList.remove("d-none");
      return;
    }

    if (indexBaru === indexLama) {
      statusError.classList.add("d-none");
      return;
    }

    if (indexBaru - indexLama > 1) {
      const tahapanTerlewat = urutanTahapan.slice(indexLama + 1, indexBaru);
      // Filter hanya tahapan yang ada di konfigurasi master
      const tahapanTerlewatValid = tahapanTerlewat.filter((t) => {
        if (t === "Pengemasan") return true;
        return currentMasterTahapanProduksi && currentMasterTahapanProduksi[t];
      });

      if (tahapanTerlewatValid.length > 0) {
        statusErrorText.textContent = `Tidak dapat melompati tahapan. Tahapan yang terlewat: ${tahapanTerlewatValid.join(", ")}`;
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

async function loadVarietasOptionsProduksi() {
  try {
    let dataVarietas = [];
    if (window.API && window.API.MasterData && window.API.MasterData.varietas) {
      dataVarietas = await window.API.MasterData.varietas.getAll();
    } else {
      dataVarietas = JSON.parse(localStorage.getItem("dataVarietas") || "[]");
    }

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

// Fungsi untuk menampilkan data produksi
async function displayProduksi() {
  // Reload data produksi dari API atau localStorage untuk memastikan data terbaru
  try {
    await loadProduksiData();
  } catch (e) {
    console.error("Error loading produksi:", e);
    produksi = [];
  }

  const tableBody = document.getElementById("tableBody");
  if (!tableBody) {
    console.error("Table body element not found!");
    return;
  }

  const searchInput = document.getElementById("searchInput");
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";

  // Filter data berdasarkan search
  let filteredProduksi = produksi;
  if (searchTerm) {
    filteredProduksi = produksi.filter(
      (p) =>
        (p.idProduksi && p.idProduksi.toLowerCase().includes(searchTerm)) ||
        (p.idBahan && p.idBahan.toLowerCase().includes(searchTerm)) ||
        (p.prosesPengolahan &&
          p.prosesPengolahan.toLowerCase().includes(searchTerm)) ||
        (p.varietas && p.varietas.toLowerCase().includes(searchTerm)) ||
        (p.statusTahapan && p.statusTahapan.toLowerCase().includes(searchTerm)),
    );
  }

  if (filteredProduksi.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="13" class="text-center py-4 text-muted">
          <i class="bi bi-inbox fs-1 d-block mb-2"></i>
          Tidak ada data produksi
        </td>
      </tr>
    `;
    return;
  }

  if (typeof window.sortProduksiDocumentsByTahapanThenId === "function") {
    filteredProduksi = window.sortProduksiDocumentsByTahapanThenId(
      filteredProduksi,
    );
  }

  try {
    tableBody.innerHTML = filteredProduksi
      .map((p, index) => {
        return `
    <tr>
      <td>${index + 1}</td>
      <td>${p.idProduksi || "-"}</td>
      <td><span class="badge bg-info">${p.idBahan || "-"}</span></td>
      <td>${(p.beratAwal || 0).toLocaleString("id-ID")} kg</td>
      <td>${p.beratTerkini ? p.beratTerkini.toLocaleString("id-ID") : "-"} kg</td>
      <td>${p.beratAkhir ? p.beratAkhir.toLocaleString("id-ID") : "-"} kg</td>
      <td><span class="badge ${(window.getProsesPengolahanBadgeClass || (() => 'bg-secondary'))(p.prosesPengolahan)}">${p.prosesPengolahan || "-"}</span></td>
      <td>${p.kadarAir || "-"}%</td>
      <td>${p.varietas || "-"}</td>
      <td>${new Date(p.tanggalMasuk).toLocaleDateString("id-ID")}</td>
      <td>${new Date(p.tanggalSekarang).toLocaleDateString("id-ID")}</td>
      <td>
        <span class="badge ${(window.getStatusTahapanBadgeClass || (() => 'bg-secondary'))(p.statusTahapan)}">${p.statusTahapan || "-"}</span>
      </td>
      <td class="text-center">
        <button 
          class="btn btn-sm btn-warning btn-action" 
          onclick="editProduksi(${p.id})"
          title="Edit">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button 
          class="btn btn-sm btn-danger btn-action" 
          onclick="deleteProduksi(${p.id})"
          title="Hapus">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `;
      })
      .join("");
  } catch (error) {
    console.error("Error rendering produksi table:", error);
    tableBody.innerHTML = `
      <tr>
        <td colspan="13" class="text-center py-4 text-danger">
          <i class="bi bi-exclamation-triangle fs-1 d-block mb-2"></i>
          Error menampilkan data: ${error.message}
        </td>
      </tr>
    `;
  }

  console.log(`Displaying ${filteredProduksi.length} produksi items`);
}

// Fungsi untuk toggle field berat akhir
function toggleBeratAkhirField() {
  const statusTahapan = document.getElementById("statusTahapan").value;
  const beratAkhirField = document.getElementById("beratAkhirField");
  const beratAkhirInput = document.getElementById("beratAkhir");

  // Cek status dengan lebih fleksibel (support "Pengemasan" atau yang mengandung "Pengemasan")
  const isPengemasan =
    statusTahapan === "Pengemasan" ||
    (statusTahapan && statusTahapan.includes("Pengemasan"));

  if (isPengemasan) {
    if (beratAkhirField) beratAkhirField.style.display = "block";
    if (beratAkhirInput) {
      beratAkhirInput.required = true;
      beratAkhirInput.disabled = false;
    }
  } else {
    if (beratAkhirField) beratAkhirField.style.display = "none";
    if (beratAkhirInput) {
      beratAkhirInput.required = false;
      beratAkhirInput.value = "";
      beratAkhirInput.disabled = true; // Disable jika bukan pengemasan
    }
  }
}

// Fungsi untuk membuka modal tambah/edit
function openModal(mode = "add") {
  currentEditId = null;
  const modal = document.getElementById("modalProduksi");
  const modalLabel = document.getElementById("modalProduksiLabel");
  const form = document.getElementById("formProduksi");

  loadProsesPengolahanOptions();
  loadVarietasOptionsProduksi();
  loadBahanOptionsProduksi();

  if (mode === "add") {
    modalLabel.textContent = "Tambah Produksi";
    form.reset();
    document.getElementById("produksiId").value = "";
    const today = new Date().toISOString().split("T")[0];
    document.getElementById("tanggalSekarang").value = today;

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
        '<i class="bi bi-info-circle"></i> Pilih proses pengolahan terlebih dahulu untuk melihat tahapan yang tersedia.';
    }
    const statusError = document.getElementById("statusTahapanError");
    if (statusError) {
      statusError.classList.add("d-none");
    }

    // Reset berat awal dan ID Bahan untuk add mode (bisa diisi)
    const beratAwalInput = document.getElementById("beratAwal");
    const beratAwalInfo = document.getElementById("beratAwalInfo");
    const beratAwalWarning = document.getElementById("beratAwalWarning");
    const idBahanSelect = document.getElementById("idBahan");

    if (beratAwalInput) {
      beratAwalInput.value = "";
      beratAwalInput.placeholder =
        "Masukkan berat awal (pilih ID Bahan terlebih dahulu)";
      beratAwalInput.title = "";
      beratAwalInput.max = "";
      beratAwalInput.readOnly = false; // Bisa diisi saat add mode
      beratAwalInput.style.backgroundColor = ""; // Reset warna background
    }
    if (beratAwalInfo) {
      beratAwalInfo.classList.remove("d-none");
    }
    if (beratAwalWarning) {
      beratAwalWarning.classList.add("d-none");
    }

    // ID Bahan juga enabled saat add mode
    if (idBahanSelect) {
      idBahanSelect.disabled = false;
      idBahanSelect.style.backgroundColor = "";
      idBahanSelect.title = "";
    }

    // Reset berat terkini untuk add mode
    const beratTerkiniInput = document.getElementById("beratTerkini");
    if (beratTerkiniInput) {
      beratTerkiniInput.value = "";
      beratTerkiniInput.readOnly = false;
      beratTerkiniInput.style.backgroundColor = "";
    }

    toggleBeratAkhirField();
    document.getElementById("haccpBendaAsingProduksi").checked = false;
    document.getElementById("haccpHamaJamurProduksi").checked = false;
    document.getElementById("haccpKondisiBaikProduksi").checked = false;
  } else {
    modalLabel.textContent = "Edit Produksi";
  }
}

// Fungsi untuk edit produksi
async function editProduksi(id) {
  try {
    // Reload data produksi dari API atau localStorage sebelum edit
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
    document.getElementById("produksiId").value = p.id;
    document.getElementById("idProduksi").value = p.idProduksi;
    document.getElementById("idBahan").value = p.idBahan || "";

    // Berat awal dan ID Bahan dibuat readonly saat edit mode (nilai referensi, tidak bisa diubah)
    const beratAwalInput = document.getElementById("beratAwal");
    const beratAwalInfo = document.getElementById("beratAwalInfo");
    const beratAwalWarning = document.getElementById("beratAwalWarning");
    const idBahanSelect = document.getElementById("idBahan");

    if (beratAwalInput) {
      beratAwalInput.value = p.beratAwal;
      beratAwalInput.readOnly = true; // Readonly saat edit
      beratAwalInput.style.backgroundColor = "#e9ecef"; // Warna abu-abu untuk menunjukkan readonly
      beratAwalInput.title =
        "Berat awal tidak dapat diubah. Ini adalah nilai referensi dari pencatatan awal.";
    }
    if (beratAwalInfo) {
      beratAwalInfo.classList.add("d-none");
    }
    if (beratAwalWarning) {
      beratAwalWarning.classList.remove("d-none");
    }

    // ID Bahan juga readonly saat edit mode
    if (idBahanSelect) {
      idBahanSelect.disabled = true; // Disabled saat edit mode
      idBahanSelect.style.backgroundColor = "#e9ecef";
      idBahanSelect.title =
        "ID Bahan tidak dapat diubah setelah produksi dibuat.";
    }

    document.getElementById("prosesPengolahan").value = p.prosesPengolahan;
    document.getElementById("kadarAir").value = p.kadarAir;
    document.getElementById("varietas").value = p.varietas;
    document.getElementById("tanggalMasuk").value = p.tanggalMasuk;
    document.getElementById("tanggalSekarang").value = p.tanggalSekarang;

    // Load tahapan dari master setelah set prosesPengolahan
    await loadTahapanFromMasterProduksi();

    // Set statusTahapan setelah dropdown ter-update
    document.getElementById("statusTahapan").value = p.statusTahapan;
    currentProduksiTahapanAktif = p.statusTahapan;

    // Set berat terkini (bisa diubah saat update tahapan)
    const beratTerkiniInput = document.getElementById("beratTerkini");
    if (beratTerkiniInput) {
      beratTerkiniInput.value = p.beratTerkini || "";
      beratTerkiniInput.readOnly = false; // Bisa diubah untuk update berat terkini
      beratTerkiniInput.style.backgroundColor = "";
    }

    if (p.haccp) {
      document.getElementById("haccpBendaAsingProduksi").checked =
        p.haccp.bebasBendaAsing || false;
      document.getElementById("haccpHamaJamurProduksi").checked =
        p.haccp.bebasHamaJamur || false;
      document.getElementById("haccpKondisiBaikProduksi").checked =
        p.haccp.kondisiBaik || false;
    } else {
      document.getElementById("haccpBendaAsingProduksi").checked = false;
      document.getElementById("haccpHamaJamurProduksi").checked = false;
      document.getElementById("haccpKondisiBaikProduksi").checked = false;
    }

    loadVarietasOptionsProduksi();
    loadBahanOptionsProduksi();

    // Trigger load bahan data untuk auto-fill jika ada idBahan
    if (p.idBahan) {
      setTimeout(async () => {
        await loadBahanDataProduksi();
      }, 100);
    }

    toggleBeratAkhirField();
    // Cek status dengan lebih fleksibel (support "Pengemasan" atau yang mengandung "Pengemasan")
    const isPengemasan =
      p.statusTahapan === "Pengemasan" ||
      (p.statusTahapan && p.statusTahapan.includes("Pengemasan"));
    if (isPengemasan && p.beratAkhir) {
      const beratAkhirInput = document.getElementById("beratAkhir");
      if (beratAkhirInput) {
        beratAkhirInput.value = p.beratAkhir;
        beratAkhirInput.disabled = false;
      }
    }

    const modal = new bootstrap.Modal(document.getElementById("modalProduksi"));
    modal.show();
    openModal("edit");
  } catch (error) {
    console.error("Error loading produksi for edit:", error);
    alert("Error memuat data produksi");
  }
}

// Fungsi untuk menyimpan produksi (tambah/edit)
async function saveProduksi() {
  const form = document.getElementById("formProduksi");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const haccpBendaAsing = document.getElementById(
    "haccpBendaAsingProduksi",
  ).checked;
  const haccpHamaJamur = document.getElementById(
    "haccpHamaJamurProduksi",
  ).checked;
  const haccpKondisiBaik = document.getElementById(
    "haccpKondisiBaikProduksi",
  ).checked;

  if (!haccpBendaAsing || !haccpHamaJamur || !haccpKondisiBaik) {
    alert("Semua checklist HACCP harus dicentang untuk dapat menyimpan data!");
    return;
  }

  const produksiId = document.getElementById("produksiId").value;
  const idProduksi = document.getElementById("idProduksi").value;
  const idBahan = document.getElementById("idBahan").value;

  // Reload data produksi untuk mendapatkan data terbaru
  await loadProduksiData();

  // Jika edit mode, gunakan berat awal yang sudah ada (readonly, nilai referensi)
  // Jika add mode, ambil dari input
  let beratAwal;
  if (produksiId) {
    // Edit mode: ambil dari data produksi yang sudah ada (nilai referensi, tidak bisa diubah)
    const produksiLama = produksi.find(
      (p) =>
        p.id === parseInt(produksiId) ||
        p.idProduksi === idProduksi ||
        p._id === produksiId,
    );
    if (!produksiLama) {
      alert("Data produksi tidak ditemukan!");
      return;
    }
    beratAwal = parseFloat(produksiLama.beratAwal) || 0;

    // Validasi: berat awal harus ada (harus sudah diinput saat add mode)
    if (beratAwal <= 0) {
      alert(
        "Berat awal tidak valid. Pastikan berat awal sudah diinput saat menambah produksi.",
      );
      return;
    }
  } else {
    // Add mode: ambil dari input (harus diisi user)
    const beratAwalInput = document.getElementById("beratAwal").value;
    if (!beratAwalInput || beratAwalInput.trim() === "") {
      alert("Berat awal harus diisi!");
      return;
    }
    beratAwal = parseFloat(beratAwalInput);

    // Validasi: berat awal harus lebih dari 0
    if (beratAwal <= 0) {
      alert("Berat awal harus lebih dari 0!");
      return;
    }
  }

  const prosesPengolahan = document.getElementById("prosesPengolahan").value;
  const kadarAir = parseFloat(document.getElementById("kadarAir").value);
  const varietas = document.getElementById("varietas").value;
  const tanggalMasuk = document.getElementById("tanggalMasuk").value;
  const tanggalSekarang = document.getElementById("tanggalSekarang").value;
  const statusTahapan = document.getElementById("statusTahapan").value;

  // Validasi berat terkini (wajib diisi)
  const beratTerkiniValue = document.getElementById("beratTerkini").value;
  if (!beratTerkiniValue || beratTerkiniValue.trim() === "") {
    alert("Berat terkini harus diisi!");
    return;
  }
  const beratTerkini = parseFloat(beratTerkiniValue);
  if (beratTerkini <= 0) {
    alert("Berat terkini harus lebih dari 0!");
    return;
  }
  if (beratTerkini > beratAwal) {
    alert("Berat terkini tidak boleh lebih besar dari berat awal!");
    return;
  }

  let beratAkhir = null;

  // Validasi berat akhir jika status = Pengemasan (support "Pengemasan" atau yang mengandung "Pengemasan")
  const isPengemasan =
    statusTahapan === "Pengemasan" ||
    (statusTahapan && statusTahapan.includes("Pengemasan"));

  if (isPengemasan) {
    const beratAkhirValue = document.getElementById("beratAkhir").value;
    if (!beratAkhirValue || beratAkhirValue === "") {
      alert("Berat akhir wajib diisi jika status tahapan adalah Pengemasan!");
      return;
    }
    beratAkhir = parseFloat(beratAkhirValue);
    if (beratAkhir <= 0) {
      alert("Berat akhir harus lebih dari 0!");
      return;
    }
    if (beratAkhir > beratAwal) {
      alert("Berat akhir tidak boleh lebih besar dari berat awal!");
      return;
    }
  }

  if (!isPengemasan) {
    // Reset berat akhir jika bukan pengemasan
    beratAkhir = null;
  }

  // Data produksi sudah di-reload di atas

  const existingProduksi = produksi.find(
    (p) => p.idProduksi === idProduksi && p.id !== parseInt(produksiId),
  );
  if (existingProduksi) {
    alert("ID Produksi sudah digunakan!");
    return;
  }

  // Validasi sisa bahan HANYA untuk ADD mode
  // Untuk edit mode, berat awal sudah readonly (tidak bisa diubah), jadi tidak perlu validasi ulang
  if (!produksiId) {
    // Add mode: validasi sisa bahan
    const sisaBahan = await calculateSisaBahan(idBahan);

    // Validasi apakah sisa bahan mencukupi
    if (beratAwal > sisaBahan) {
      let bahanData = null;
      try {
        if (window.API && window.API.Bahan) {
          bahanData = await window.API.Bahan.getById(idBahan);
        } else {
          const bahan = JSON.parse(localStorage.getItem("bahan") || "[]");
          bahanData = bahan.find((b) => b.idBahan === idBahan);
        }
      } catch (error) {
        console.error("Error loading bahan data:", error);
      }

      const totalBahan = bahanData ? bahanData.jumlah : 0;
      const sudahDigunakan = totalBahan - sisaBahan;

      alert(
        `Sisa bahan tidak mencukupi!\n\n` +
          `ID Bahan: ${idBahan}\n` +
          `Total Bahan: ${totalBahan.toLocaleString("id-ID")} kg\n` +
          `Sudah Digunakan: ${sudahDigunakan.toLocaleString("id-ID")} kg\n` +
          `Sisa Tersedia: ${sisaBahan.toLocaleString("id-ID")} kg\n` +
          `Berat Awal yang Diminta: ${beratAwal.toLocaleString(
            "id-ID",
          )} kg\n\n` +
          `Pencatatan produksi dibatalkan. Silakan kurangi berat awal atau pilih ID Bahan lain.`,
      );
      return;
    }
  } else {
    // Edit mode: validasi bahwa ID Bahan tidak berubah
    // (berat awal sudah readonly, jadi tidak perlu validasi)
    const produksiLama = produksi.find(
      (p) =>
        p.id === parseInt(produksiId) ||
        p.idProduksi === idProduksi ||
        p._id === produksiId,
    );
    if (produksiLama && produksiLama.idBahan !== idBahan) {
      alert(
        `ID Bahan tidak dapat diubah setelah produksi dibuat!\n\n` +
          `ID Bahan Sebelumnya: ${produksiLama.idBahan}\n` +
          `ID Bahan Baru: ${idBahan}\n\n` +
          `Silakan batalkan dan buat produksi baru jika ingin menggunakan ID Bahan yang berbeda.`,
      );
      return;
    }
  }

  if (
    prosesPengolahan === "Natural Process" &&
    statusTahapan === "Fermentasi"
  ) {
    alert(
      "Natural Process tidak melalui tahapan Fermentasi. Silakan pilih tahapan lain!",
    );
    return;
  }

  const haccp = {
    bebasBendaAsing: haccpBendaAsing,
    bebasHamaJamur: haccpHamaJamur,
    kondisiBaik: haccpKondisiBaik,
  };

  if (produksiId) {
    const produksiIndex = produksi.findIndex(
      (p) => p.id === parseInt(produksiId),
    );
    if (produksiIndex !== -1) {
      const produksiLama = produksi[produksiIndex];

      // Inisialisasi history jika belum ada
      if (!produksiLama.historyTahapan) {
        produksiLama.historyTahapan = [];
      }

      // Jika status tahapan berubah, tambahkan ke history
      if (produksiLama.statusTahapan !== statusTahapan) {
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

      produksi[produksiIndex] = {
        ...produksiLama,
        idProduksi,
        idBahan,
        beratAwal,
        beratTerkini,
        beratAkhir,
        prosesPengolahan,
        kadarAir,
        varietas,
        tanggalMasuk,
        tanggalSekarang,
        statusTahapan,
        haccp,
      };
    }
  } else {
    const newId =
      produksi.length > 0 ? Math.max(...produksi.map((p) => p.id)) + 1 : 1;

    // Inisialisasi history untuk produksi baru
    const historyTahapan = [
      {
        statusTahapan: statusTahapan,
        tanggal: tanggalSekarang,
        beratAwal: beratAwal,
        beratTerkini: beratTerkini,
        beratAkhir: beratAkhir,
        kadarAir: kadarAir,
      },
    ];

    produksi.push({
      id: newId,
      idProduksi,
      idBahan,
      beratAwal,
      beratTerkini,
      beratAkhir,
      prosesPengolahan,
      kadarAir,
      varietas,
      tanggalMasuk,
      tanggalSekarang,
      statusTahapan,
      haccp,
      historyTahapan: historyTahapan,
    });
  }

  // Save via API (untuk add dan edit mode)
  try {
    const produksiData = {
      idProduksi,
      idBahan,
      beratAwal,
      beratTerkini,
      beratAkhir,
      prosesPengolahan,
      kadarAir,
      varietas,
      tanggalMasuk,
      tanggalSekarang,
      statusTahapan,
      haccp,
    };

    if (produksiId) {
      // Edit mode - Get existing data untuk history
      const produksiLama = produksi.find(
        (p) =>
          p.id === parseInt(produksiId) ||
          p.idProduksi === idProduksi ||
          p._id === produksiId,
      );

      if (produksiLama) {
        // Inisialisasi history jika belum ada
        if (!produksiLama.historyTahapan) {
          produksiLama.historyTahapan = [];
        }

        // Jika status tahapan berubah, tambahkan ke history
        if (produksiLama.statusTahapan !== statusTahapan) {
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
      }

      // Update via API
      if (window.API && window.API.Produksi) {
        await window.API.Produksi.update(produksiId, produksiData);
      } else {
        // Fallback to localStorage
        const index = produksi.findIndex(
          (p) =>
            p.id === parseInt(produksiId) ||
            p.idProduksi === idProduksi ||
            p._id === produksiId,
        );
        if (index !== -1) {
          produksi[index] = { ...produksi[index], ...produksiData };
          localStorage.setItem("produksi", JSON.stringify(produksi));
        }
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

      // Create via API
      if (window.API && window.API.Produksi) {
        await window.API.Produksi.create(produksiData);
      } else {
        // Fallback to localStorage
        const newId =
          produksi.length > 0 ? Math.max(...produksi.map((p) => p.id)) + 1 : 1;
        produksi.push({ id: newId, ...produksiData });
        localStorage.setItem("produksi", JSON.stringify(produksi));
      }
    }

    // Reload data setelah save
    await loadProduksiData();

    // Reload dropdown bahan untuk update info sisa bahan
    await loadBahanOptionsProduksi();

    await displayProduksi();

    window.dispatchEvent(
      new CustomEvent("dataUpdated", { detail: { type: "produksi" } }),
    );

    const modal = bootstrap.Modal.getInstance(
      document.getElementById("modalProduksi"),
    );
    modal.hide();

    form.reset();
    currentEditId = null;
  } catch (error) {
    console.error("Error saving produksi:", error);
    alert("Error menyimpan data: " + (error.message || "Unknown error"));
  }
}

// Fungsi untuk delete produksi
async function deleteProduksi(id) {
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

    const modal = new bootstrap.Modal(document.getElementById("modalDelete"));
    modal.show();
  } catch (error) {
    console.error("Error loading produksi for delete:", error);
    alert("Error memuat data produksi");
  }
}

// Fungsi untuk konfirmasi delete
async function confirmDelete() {
  if (currentDeleteId) {
    try {
      // Simpan idBahan untuk update sisa bahan
      const produksiDihapus = produksi.find(
        (p) =>
          p.id === currentDeleteId ||
          p._id === currentDeleteId ||
          p.idProduksi === currentDeleteId,
      );

      // Delete via API
      if (window.API && window.API.Produksi) {
        await window.API.Produksi.delete(currentDeleteId);
      } else {
        // Fallback to localStorage
        produksi = produksi.filter(
          (p) =>
            p.id !== currentDeleteId &&
            p._id !== currentDeleteId &&
            p.idProduksi !== currentDeleteId,
        );
        localStorage.setItem("produksi", JSON.stringify(produksi));
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

      const modal = bootstrap.Modal.getInstance(
        document.getElementById("modalDelete"),
      );
      modal.hide();
      currentDeleteId = null;
    } catch (error) {
      console.error("Error deleting produksi:", error);
      alert("Error menghapus data: " + (error.message || "Unknown error"));
    }
  }
}

// Event listener
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM Content Loaded - Initializing produksi page");

  setTimeout(async () => {
    try {
      await loadProduksiData();
      console.log(`Produksi data loaded: ${produksi.length} items`);
      await displayProduksi();
      await loadProsesPengolahanOptions();
      await loadVarietasOptionsProduksi();
      await loadBahanOptionsProduksi();
    } catch (error) {
      console.error("Error initializing produksi page:", error);
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
      await loadProsesPengolahanOptions();
      await loadVarietasOptionsProduksi();
      await loadBahanOptionsProduksi();
      // Reset tahapan dropdown saat modal dibuka (akan diisi saat proses pengolahan dipilih)
      const statusSelect = document.getElementById("statusTahapan");
      if (statusSelect && !statusSelect.value) {
        statusSelect.innerHTML =
          '<option value="">Pilih Status Tahapan</option>';
        const statusInfo = document.getElementById("statusTahapanInfo");
        if (statusInfo) {
          statusInfo.innerHTML =
            '<i class="bi bi-info-circle"></i> Pilih proses pengolahan terlebih dahulu untuk melihat tahapan yang tersedia.';
        }
      }
    });
  }
});
