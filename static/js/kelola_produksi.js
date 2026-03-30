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

// Load data bahan untuk dropdown (MONGODB ONLY)
async function loadBahanOptionsProduksi() {
  try {
    console.log("🔄 Loading bahan options for produksi dropdown...");

    // Wait for API to be available
    let apiRetries = 0;
    while ((!window.API || !window.API.Bahan) && apiRetries < 20) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      apiRetries++;
    }

    if (!window.API || !window.API.Bahan) {
      console.error(
        "❌ API.Bahan not available after waiting, skipping bahan options",
      );
      const select = document.getElementById("idBahan");
      if (select) {
        select.innerHTML =
          '<option value="">⚠️ Error loading bahan (API tidak tersedia)</option>';
      }
      return;
    }

    let bahan = [];
    try {
      bahan = await window.API.Bahan.getAll();
      console.log(`✅ Loaded ${bahan.length} bahan from MongoDB`);
    } catch (apiError) {
      console.error("❌ Error fetching bahan from API:", apiError);
      const select = document.getElementById("idBahan");
      if (select) {
        select.innerHTML = '<option value="">⚠️ Error loading bahan</option>';
      }
      return;
    }

    if (!bahan || bahan.length === 0) {
      console.warn("⚠️ No bahan data found in MongoDB");
      const select = document.getElementById("idBahan");
      if (select) {
        select.innerHTML = '<option value="">Tidak ada data bahan</option>';
      }
      return;
    }

    // Retry mechanism untuk menunggu element tersedia (modal mungkin masih rendering)
    let select = document.getElementById("idBahan");
    let elementRetries = 0;
    while (!select && elementRetries < 10) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      select = document.getElementById("idBahan");
      elementRetries++;
    }

    if (!select) {
      // Element mungkin tidak ada di template tertentu (misalnya karyawan view)
      console.warn(
        "⚠️ Select element 'idBahan' not found - mungkin tidak ada di template ini",
      );
      console.warn("Available form elements:", {
        modal: !!document.getElementById("modalProduksi"),
        form: !!document.getElementById("formProduksi"),
        idProduksi: !!document.getElementById("idProduksi"),
      });
      // Return tanpa error - mungkin template tidak memerlukan dropdown ini
      return;
    }

    const selectedValue = select.value;
    select.innerHTML =
      '<option value="">Pilih ID Bahan dan proses pengolahan</option>';

    let optionsAdded = 0;
    for (const b of bahan) {
      if (!b?.idBahan) continue;
      const lines =
        b.prosesBahan && Array.isArray(b.prosesBahan) && b.prosesBahan.length > 0
          ? b.prosesBahan
          : null;
      if (!lines) {
        const opt = document.createElement("option");
        opt.disabled = true;
        opt.value = "";
        opt.textContent = `${b.idBahan} — perbarui data bahan masuk (belum ada proses & kloter per proses)`;
        select.appendChild(opt);
        continue;
      }
      for (const line of lines) {
        const proses = line.prosesPengolahan;
        if (!proses) continue;
        const cap = parseFloat(line.jumlahBeratProses) || 0;
        let sisa = 0;
        try {
          sisa = await calculateSisaBahan(b.idBahan, proses);
        } catch (e) {
          console.warn(`sisa ${b.idBahan}/${proses}:`, e);
        }
        const stableKey = { idBahan: b.idBahan, prosesPengolahan: proses };
        const option = document.createElement("option");
        option.value = encodeBahanProduksiOption(stableKey);
        option.textContent = `${b.idBahan} — ${proses} · Sisa ${sisa.toLocaleString("id-ID")} kg (alokasi ${cap.toLocaleString("id-ID")} kg)`;
        option.dataset.bahan = JSON.stringify(b);
        option.dataset.prosesPengolahan = proses;
        option.dataset.beratLini = String(cap);
        select.appendChild(option);
        optionsAdded++;
      }
    }

    console.log(`✅ Added ${optionsAdded} baris bahan×proses ke dropdown`);

    if (selectedValue) {
      const has = Array.from(select.options).some((o) => o.value === selectedValue);
      if (has) select.value = selectedValue;
    }
  } catch (error) {
    console.error("❌ Error loading bahan options:", error);
    const select = document.getElementById("idBahan");
    if (select) {
      select.innerHTML =
        '<option value="">⚠️ Error: ' +
        (error.message || "Unknown error") +
        "</option>";
    }
  }
}

// Auto-fill dari pilihan kombinasi idBahan + proses pengolahan
async function loadBahanDataProduksi() {
  const idBahanSelect = document.getElementById("idBahan");
  const selectedOption = idBahanSelect?.options[idBahanSelect.selectedIndex];
  if (!selectedOption || !selectedOption.value) return;

  const meta = decodeBahanProduksiOption(selectedOption.value);
  if (!meta?.idBahan || !meta.prosesPengolahan) return;

  let bahanData = null;
  try {
    bahanData = JSON.parse(selectedOption.dataset.bahan || "null");
  } catch (e) {
    bahanData = null;
  }
  if (!bahanData && window.API?.Bahan) {
    try {
      bahanData = await window.API.Bahan.getById(meta.idBahan);
    } catch (error) {
      console.error("Error loading bahan data:", error);
      return;
    }
  }
  if (!bahanData) return;

  document.getElementById("varietas").value = bahanData.varietas || "";
  document.getElementById("tanggalMasuk").value = bahanData.tanggalMasuk || "";

  const prosesSel = document.getElementById("prosesPengolahan");
  if (prosesSel && meta.prosesPengolahan) {
    prosesSel.value = meta.prosesPengolahan;
  }

  const sisaBahan = await calculateSisaBahan(
    meta.idBahan,
    meta.prosesPengolahan,
  );

  const beratAwalInput = document.getElementById("beratAwal");
  if (beratAwalInput) {
    if (!currentEditId) {
      beratAwalInput.value =
        sisaBahan > 0 ? String(sisaBahan) : "";
      beratAwalInput.readOnly = true;
      beratAwalInput.classList.add("bg-light");
      beratAwalInput.title = `Berat awal mengikuti sisa jalur proses "${meta.prosesPengolahan}"`;
    }
    beratAwalInput.placeholder = `Sisa jalur: ${sisaBahan.toLocaleString("id-ID")} kg`;
    beratAwalInput.max = sisaBahan;
  }

  await loadTahapanFromMasterProduksi(meta.prosesPengolahan);
  loadVarietasOptionsProduksi();
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
        (p.prosesPengolahan &&
          p.prosesPengolahan.toLowerCase().includes(searchTerm)) ||
        (p.varietas && p.varietas.toLowerCase().includes(searchTerm)) ||
        (p.statusTahapan && p.statusTahapan.toLowerCase().includes(searchTerm)),
    );
  }

  if (filteredProduksi.length === 0) {
    console.log("⚠️ No produksi data to display (filtered or total)");
    tableBody.innerHTML = `
      <tr>
        <td colspan="12" class="text-center py-4 text-muted">
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
        <td colspan="12" class="text-center py-4 text-danger">
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

  if (isPengemasan) {
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

    // Aktifkan kembali field berat terkini (wajib diisi)
    if (beratTerkiniInput) {
      beratTerkiniInput.readOnly = false; // Bisa diubah
      beratTerkiniInput.required = true; // Wajib diisi
      beratTerkiniInput.style.backgroundColor = ""; // Reset warna
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
        '<i class="bi bi-info-circle"></i> Pilih <strong>ID Bahan dan proses pengolahan</strong>; tahapan mengikuti proses yang dipilih saat bahan masuk.';
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
        "Otomatis setelah pilih bahan + proses (sisa jalur)";
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

    // ID Bahan juga enabled saat add mode
    if (idBahanSelect) {
      idBahanSelect.disabled = false;
      idBahanSelect.style.backgroundColor = "";
      idBahanSelect.title = "";
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
    const idBahanSelect = document.getElementById("idBahan");

    if (beratAwalInput) {
      beratAwalInput.value = p.beratAwal || "";
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

    // Set berat terkini berdasarkan status tahapan
    const beratTerkiniInput = document.getElementById("beratTerkini");
    const isPengemasan =
      p.statusTahapan === "Pengemasan" ||
      (p.statusTahapan && p.statusTahapan.includes("Pengemasan"));

    if (beratTerkiniInput) {
      if (isPengemasan) {
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
        // Jika bukan Pengemasan: wajib diisi setiap update tahapan
        // Kosongkan field untuk memaksa user mengisi berat terkini baru setiap update
        beratTerkiniInput.value = "";
        beratTerkiniInput.readOnly = false; // Bisa diubah untuk update berat terkini
        beratTerkiniInput.required = true;
        beratTerkiniInput.style.backgroundColor = "";
        beratTerkiniInput.style.borderLeft = "4px solid #0d6efd";
        beratTerkiniInput.placeholder = `Masukkan berat terkini baru (Sebelumnya: ${(p.beratTerkini || p.beratAwal || 0).toLocaleString("id-ID")} kg)`;
        beratTerkiniInput.title =
          "Wajib diisi setiap kali update tahapan produksi. Masukkan berat terkini yang baru pada tahapan ini.";

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
          loadBahanOptionsProduksi(),
          loadTipeProdukOptionsProduksi(),
        ]);

        const idBahanSelectAfterLoad = document.getElementById("idBahan");
        if (idBahanSelectAfterLoad && p.idBahan && p.prosesPengolahan) {
          const v = encodeBahanProduksiOption({
            idBahan: p.idBahan,
            prosesPengolahan: p.prosesPengolahan,
          });
          if (!Array.from(idBahanSelectAfterLoad.options).some((o) => o.value === v)) {
            const opt = document.createElement("option");
            opt.value = v;
            opt.textContent = `${p.idBahan} — ${p.prosesPengolahan} (produksi ini)`;
            idBahanSelectAfterLoad.appendChild(opt);
          }
          idBahanSelectAfterLoad.value = v;
        }
        setElementValue("prosesPengolahan", p.prosesPengolahan);
        currentProduksiTahapanAktif = p.statusTahapan;
        await loadTahapanFromMasterProduksi(p.prosesPengolahan);
        setElementValue("statusTahapan", p.statusTahapan);

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
    let decodedBahanMeta = null;
    const idBahanElement = document.getElementById("idBahan");
    if (idBahanElement && idBahanElement.value) {
      decodedBahanMeta = decodeBahanProduksiOption(idBahanElement.value);
      if (decodedBahanMeta?.idBahan) {
        idBahan = decodedBahanMeta.idBahan;
        console.log("✅ idBahan from encoded option:", idBahan);
      } else {
        idBahan = idBahanElement.value.trim();
        console.log("✅ idBahan raw (legacy):", idBahan);
      }
    } else if (isEditMode) {
      if (produksiLama && produksiLama.idBahan) {
        idBahan = produksiLama.idBahan;
      } else {
        alert(
          "Error: ID Bahan tidak ditemukan. Tidak dapat melanjutkan update.",
        );
        return;
      }
    } else {
      alert("Error: Field ID Bahan tidak ditemukan. Pastikan form lengkap.");
      return;
    }

    if (!idBahan || idBahan.trim() === "") {
      alert("Error: ID Bahan tidak valid. Tidak dapat melanjutkan.");
      return;
    }

    console.log("✅ idBahan validated:", idBahan);

    // ==================== GET BERAT AWAL ====================
    console.log("🔍 Getting beratAwal...");
    let beratAwal;
    if (isEditMode) {
      // Edit mode: ambil dari data produksi yang sudah ada (readonly, nilai referensi)
      console.log(
        "📝 Edit mode - getting beratAwal from produksiLama:",
        produksiLama?.beratAwal,
      );
      beratAwal = parseFloat(produksiLama.beratAwal) || 0;
      console.log("📝 Parsed beratAwal:", beratAwal);
      if (beratAwal <= 0) {
        console.error("❌ Berat awal tidak valid:", beratAwal);
        alert(
          "Berat awal tidak valid. Pastikan berat awal sudah diinput saat menambah produksi.",
        );
        return;
      }
      console.log("✅ beratAwal validated:", beratAwal);
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
      alert("Proses pengolahan wajib. Pilih baris bahan yang sudah mencantumkan proses.");
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
        
        // Validasi: berat terkini Pengeringan Akhir ≤ berat terkini Pengeringan Awal
        const beratTerkiniElement = document.getElementById("beratTerkini");
        const beratTerkiniBaru = beratTerkiniElement ? parseFloat(beratTerkiniElement.value) : 0;
        const beratTerkiniAwal = produksiLama.beratTerkini || 0;
        if (beratTerkiniBaru > beratTerkiniAwal) {
          alert(`Berat terkini Pengeringan Akhir (${beratTerkiniBaru} kg) tidak boleh lebih besar dari berat terkini Pengeringan Awal (${beratTerkiniAwal} kg)`);
          if (beratTerkiniElement) beratTerkiniElement.focus();
          return;
        }
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
          beratTerkini = parseFloat(beratTerkiniValue);
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

      beratTerkini = parseFloat(beratTerkiniValue);
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

    // Validasi sisa bahan HANYA untuk ADD mode
    if (!isEditMode) {
      const sisaBahan = await calculateSisaBahan(idBahan, prosesPengolahan);

      // Validasi apakah sisa bahan mencukupi
      if (beratAwal > sisaBahan) {
        let bahanData = null;
        try {
          if (!window.API || !window.API.Bahan) {
            console.warn("⚠️ API.Bahan not available, cannot validate bahan");
          } else {
            bahanData = await window.API.Bahan.getById(idBahan);
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
    // Pastikan tipe data sesuai dengan yang diharapkan backend
    // Khusus untuk UPDATE: Pastikan beratAwal sesuai dengan data lama (backend akan validasi)
    let finalBeratAwal = parseFloat(beratAwal) || 0;

    // Untuk UPDATE mode, gunakan nilai yang persis sama dengan produksiLama (untuk menghindari float comparison issues)
    if (isEditMode && produksiLama) {
      // Gunakan beratAwal dari data lama (bukan dari input) untuk memastikan tidak ada perbedaan float precision
      finalBeratAwal = parseFloat(produksiLama.beratAwal) || finalBeratAwal;
      console.log(
        "📝 Using beratAwal from produksiLama for update:",
        finalBeratAwal,
      );
    }

    const produksiData = {
      idProduksi: String(idProduksiForPayload),
      idBahan: String(idBahan),
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
    };
    if (isPengemasan) {
      produksiData.beratGreenBeans = parseFloat(getElementValue("beratGreenBeans")) || 0;
      produksiData.beratPixel = parseFloat(getElementValue("beratPixel")) || 0;
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
