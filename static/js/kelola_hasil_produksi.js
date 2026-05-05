// Data hasil produksi (MONGODB ONLY - NO localStorage fallback)
let hasilProduksi = [];
let currentEditId = null;
let currentDeleteId = null;

// Load data hasil produksi dari MongoDB (API ONLY - NO fallback)
async function loadHasilProduksiData() {
  try {
    console.log("🔄 Loading hasil produksi data from MongoDB...");

    // Wait for window.API to be available (max 2 seconds)
    let retries = 0;
    while (!window.API && retries < 20) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      retries++;
    }

    // VERIFY API AVAILABILITY - NO FALLBACK
    if (!window.API || !window.API.HasilProduksi) {
      const errorMsg =
        "❌ API.HasilProduksi tidak tersedia. Backend MongoDB wajib aktif. Pastikan Flask server running dan api-service.js sudah di-load.";
      console.error(errorMsg);
      console.error("window.API:", window.API);
      alert(errorMsg);
      throw new Error(errorMsg);
    }

    console.log("✅ Using API.HasilProduksi.getAll()");
    hasilProduksi = await window.API.HasilProduksi.getAll();
    console.log(
      `✅ Loaded ${hasilProduksi.length} hasil produksi records from MongoDB`
    );

    if (!Array.isArray(hasilProduksi)) {
      console.warn("⚠️ API returned non-array data, defaulting to empty array");
      hasilProduksi = [];
    }
  } catch (error) {
    console.error("❌ Error loading hasil produksi from MongoDB:", error);
    const errorMsg = `Error memuat data hasil produksi dari MongoDB: ${
      error.message || "Unknown error"
    }. Pastikan backend Flask aktif.`;
    alert(errorMsg);
    hasilProduksi = [];
    throw error;
  }
}

// Load data produksi yang sudah masuk pengemasan dengan berat akhir
// [PRODUKSI → DROPDOWN] Ambil data produksi yang sudah masuk tahap Pengemasan
// dan isi pilihan ID Produksi pada form hasil produksi.
async function loadProduksiOptions() {
  try {
    // Load data dari API dengan fallback ke localStorage
    let produksi = [];
    let hasilProduksi = [];

    // Cek apakah API tersedia
    if (window.API && window.API.Produksi && window.API.HasilProduksi) {
      try {
        produksi = await window.API.Produksi.getPengemasan();
        hasilProduksi = await window.API.HasilProduksi.getAll();
        console.log("✅ Data produksi dimuat dari API:", {
          produksi: produksi.length,
          hasilProduksi: hasilProduksi.length,
        });
      } catch (apiError) {
        console.error("❌ Error loading dari API:", apiError);
        // Fallback ke localStorage jika API error
        try {
          const produksiStr = localStorage.getItem("produksi");
          const hasilProduksiStr = localStorage.getItem("hasilProduksi");
          produksi = produksiStr ? JSON.parse(produksiStr) : [];
          hasilProduksi = hasilProduksiStr ? JSON.parse(hasilProduksiStr) : [];
          console.log("⚠️ Fallback ke localStorage");
        } catch (parseError) {
          console.error("❌ Error parsing localStorage:", parseError);
          produksi = [];
          hasilProduksi = [];
        }
      }
    } else {
      // Fallback ke localStorage jika API tidak tersedia
      console.log("⚠️ API tidak tersedia, menggunakan localStorage");
      try {
        const produksiStr = localStorage.getItem("produksi");
        const hasilProduksiStr = localStorage.getItem("hasilProduksi");
        produksi = produksiStr ? JSON.parse(produksiStr) : [];
        hasilProduksi = hasilProduksiStr ? JSON.parse(hasilProduksiStr) : [];
      } catch (parseError) {
        console.error("❌ Error parsing localStorage:", parseError);
        produksi = [];
        hasilProduksi = [];
      }
    }

    console.log("=== loadProduksiOptions() DIPANGGIL ===");

    console.log(`📊 Total produksi: ${produksi.length}`);
    console.log(`📊 Total hasilProduksi: ${hasilProduksi.length}`);

    // Coba cari dropdown dengan beberapa cara
    let idProduksiSelect = document.getElementById("idProduksi");

    // Jika tidak ditemukan, coba lagi dengan delay
    if (!idProduksiSelect) {
      console.warn("⚠️ Dropdown idProduksi tidak ditemukan, mencoba lagi...");
      setTimeout(() => {
        idProduksiSelect = document.getElementById("idProduksi");
        if (idProduksiSelect) {
          loadProduksiOptions();
        } else {
          console.error(
            "❌ Dropdown idProduksi masih tidak ditemukan setelah retry!"
          );
        }
      }, 100);
      return;
    }

    console.log(
      "✅ Dropdown idProduksi ditemukan:",
      idProduksiSelect ? "Ya" : "Tidak"
    );

    // Filter produksi yang statusnya HARUS "Pengemasan" dan punya berat akhir
    const produksiPengemasan = produksi.filter((p) => {
      // Pastikan semua field yang diperlukan ada
      // Cek status dengan lebih fleksibel (trim whitespace, case insensitive)
      const statusTahapan = (p.statusTahapan || "").toString().trim();
      const hasStatusPengemasan =
        statusTahapan === "Pengemasan" || statusTahapan.includes("Pengemasan");

      // Cek berat akhir (bisa number atau string)
      const beratAkhir = parseFloat(p.beratAkhir) || 0;
      const hasBeratAkhir = beratAkhir > 0;

      // Cek idProduksi (bisa string atau number, tapi harus ada)
      const idProduksi = (p.idProduksi || "").toString().trim();
      const hasIdProduksi =
        idProduksi !== "" &&
        idProduksi !== "undefined" &&
        idProduksi !== "null";

      const isValid = hasStatusPengemasan && hasBeratAkhir && hasIdProduksi;

      // Debug log untuk melihat data produksi
      console.log(
        `Produksi ${
          idProduksi || p.id
        }: statusTahapan="${statusTahapan}", beratAkhir=${beratAkhir}, idProduksi="${idProduksi}", hasStatus=${hasStatusPengemasan}, hasBerat=${hasBeratAkhir}, hasId=${hasIdProduksi}, valid=${isValid}`
      );

      return isValid;
    });

    console.log(
      `✅ Produksi dengan status Pengemasan: ${produksiPengemasan.length}`
    );

    // Isi dropdown dengan produksi yang sudah Pengemasan dan punya berat akhir
    idProduksiSelect.innerHTML =
      '<option value="">Pilih ID Produksi yang sudah Pengemasan</option>';
    console.log("✅ Dropdown direset, mulai mengisi options...");
    console.log(
      "📊 Produksi yang akan ditampilkan:",
      produksiPengemasan.length,
      "items"
    );

    // Debug: Tampilkan detail setiap produksi
    if (produksiPengemasan.length > 0) {
      console.log(
        "📋 Detail produksi yang valid:",
        produksiPengemasan.map((p) => ({
          idProduksi: p.idProduksi,
          statusTahapan: p.statusTahapan,
          beratAkhir: p.beratAkhir,
        }))
      );
    }

    if (produksiPengemasan.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent =
        "⚠️ Tidak ada produksi yang statusnya Pengemasan dengan berat akhir";
      option.disabled = true;
      option.style.color = "#dc3545";
      idProduksiSelect.appendChild(option);

      // Tampilkan informasi debug yang lebih lengkap
      console.warn(
        "Tidak ada produksi yang statusnya Pengemasan dengan berat akhir"
      );
      console.log(
        "Semua produksi di localStorage:",
        produksi.map((p) => ({
          id: p.id,
          idProduksi: p.idProduksi,
          statusTahapan: p.statusTahapan,
          beratAkhir: p.beratAkhir,
          beratAwal: p.beratAwal,
        }))
      );

      // Tampilkan juga yang hampir valid untuk debugging
      const hampirValid = produksi.filter((p) => {
        const statusTahapan = (p.statusTahapan || "").toString().trim();
        const beratAkhir = parseFloat(p.beratAkhir) || 0;
        return (
          statusTahapan === "Pengemasan" ||
          statusTahapan.includes("Pengemasan") ||
          beratAkhir > 0
        );
      });
      if (hampirValid.length > 0) {
        console.log(
          "Produksi yang hampir valid (status Pengemasan ATAU punya berat akhir):",
          hampirValid.map((p) => ({
            id: p.id,
            idProduksi: p.idProduksi,
            statusTahapan: p.statusTahapan,
            beratAkhir: p.beratAkhir,
            beratAwal: p.beratAwal,
          }))
        );
      }

      // Jika ada produksi dengan status "Pengemasan" tapi tidak ada berat akhir
      const produksiPengemasanNoBerat = produksi.filter((p) => {
        const statusTahapan = (p.statusTahapan || "").toString().trim();
        const beratAkhir = parseFloat(p.beratAkhir) || 0;
        return (
          (statusTahapan === "Pengemasan" ||
            statusTahapan.includes("Pengemasan")) &&
          beratAkhir <= 0
        );
      });
      if (produksiPengemasanNoBerat.length > 0) {
        console.warn(
          "Ada produksi dengan status Pengemasan tapi TIDAK punya berat akhir:",
          produksiPengemasanNoBerat.map((p) => ({
            id: p.id,
            idProduksi: p.idProduksi,
            statusTahapan: p.statusTahapan,
            beratAkhir: p.beratAkhir,
          }))
        );
        alert(
          `Peringatan: Ada ${produksiPengemasanNoBerat.length} produksi dengan status "Pengemasan" tetapi belum memiliki berat akhir.\n\n` +
            `ID Produksi yang bermasalah:\n${produksiPengemasanNoBerat
              .map((p) => `- ${p.idProduksi}`)
              .join("\n")}\n\n` +
            `Silakan edit produksi tersebut di halaman Kelola Produksi dan isi berat akhir.`
        );
      }
    } else {
      // Hitung sisa yang belum dikemas untuk setiap produksi
      produksiPengemasan.forEach((p, index) => {
        // Hitung total berat yang sudah dikemas dari hasil produksi
        const totalDikemas = hasilProduksi
          .filter((h) => h.idProduksi === p.idProduksi)
          .reduce((sum, h) => sum + (parseFloat(h.beratSaatIni) || 0), 0);

        const sisaTersedia = Math.max(
          0,
          (parseFloat(p.beratAkhir) || 0) - totalDikemas
        );

        const option = document.createElement("option");
        option.value = p.idProduksi; // Gunakan idProduksi (string) sebagai value untuk konsistensi
        // Tampilkan status untuk konfirmasi visual
        option.textContent = `${p.idProduksi} - Status: ${
          p.statusTahapan || "Tidak diketahui"
        } - Berat Akhir: ${(parseFloat(p.beratAkhir) || 0).toLocaleString(
          "id-ID"
        )} kg (Sisa: ${sisaTersedia.toLocaleString("id-ID")} kg)`;
        option.dataset.produksi = JSON.stringify(p);
        option.dataset.sisaTersedia = sisaTersedia;
        option.dataset.statusTahapan = p.statusTahapan || "";
        option.dataset.produksiId = p.id; // Simpan juga p.id untuk referensi
        idProduksiSelect.appendChild(option);

        console.log(
          `✅ Option ${index + 1} ditambahkan: ${p.idProduksi} (value: ${
            p.idProduksi
          }, status: ${p.statusTahapan}, beratAkhir: ${
            p.beratAkhir
          }, sisa: ${sisaTersedia})`
        );
      });

      console.log(
        `✅ Dropdown berhasil diisi dengan ${produksiPengemasan.length} opsi`
      );
      console.log(
        "✅ Total options di dropdown:",
        idProduksiSelect.options.length
      );

      // Verifikasi dropdown terisi dengan benar
      if (idProduksiSelect.options.length > 1) {
        console.log(
          "✅ Dropdown ID Produksi berhasil diisi dengan data produksi"
        );
      } else {
        console.warn(
          "⚠️ Dropdown ID Produksi hanya memiliki 1 option (default), tidak ada data produksi yang valid"
        );
      }
    }
  } catch (error) {
    console.error("Error di loadProduksiOptions():", error);
  }
}

// Load data produksi berdasarkan ID Produksi yang dipilih (dropdown select)
// [PRODUKSI → DATA BINDING] Saat user memilih ID Produksi, muat seluruh
// informasi terkait (proses, jenis kopi, tanggal, berat) lalu tampilkan di form.
async function loadProduksiData() {
  const idProduksiSelect = document.getElementById("idProduksi");
  const selectedOption = idProduksiSelect
    ? idProduksiSelect.options[idProduksiSelect.selectedIndex]
    : null;
  const idProduksiValue = selectedOption ? selectedOption.value : "";
  const statusDiv = document.getElementById("idProduksiStatus");
  const beratInput = document.getElementById("beratSaatIni");
  const hasilProduksiIdEdit = document.getElementById("hasilProduksiId").value;

  // Reset status display
  statusDiv.style.display = "none";
  statusDiv.className = "mt-2";

  if (!idProduksiValue || !selectedOption) {
    // Clear semua field jika tidak ada yang dipilih
    clearProduksiData();
    return;
  }

  // Ambil data produksi dari dataset option atau cari dari localStorage
  let produksiData = null;

  // Coba ambil dari dataset option
  if (selectedOption && selectedOption.dataset.produksi) {
    try {
      produksiData = JSON.parse(selectedOption.dataset.produksi);
    } catch (e) {
      console.error("Error parsing option produksi data:", e);
    }
  }

  // Jika tidak ada di dataset, cari dari API (MONGODB ONLY) berdasarkan idProduksi (string)
  if (!produksiData) {
    try {
      if (!window.API || !window.API.Produksi) {
        console.warn(
          "⚠️ API.Produksi not available, cannot load produksi data"
        );
        return;
      }
      produksiData = await window.API.Produksi.getById(idProduksiValue);
    } catch (error) {
      console.error("Error loading produksi data:", error);
      return;
    }
  }

  if (!produksiData) {
    // ID Produksi tidak ditemukan
    statusDiv.innerHTML = `
      <div class="alert alert-danger mb-0">
        <i class="bi bi-exclamation-triangle"></i> 
        ID Produksi tidak ditemukan!
      </div>
    `;
    statusDiv.style.display = "block";
    clearProduksiData();
    return;
  }

  // Validasi status: HARUS "Pengemasan"
  const statusTahapan = (produksiData.statusTahapan || "").toString().trim();
  const isPengemasan =
    statusTahapan === "Pengemasan" || statusTahapan.includes("Pengemasan");

  if (!isPengemasan) {
    statusDiv.innerHTML = `
      <div class="alert alert-warning mb-0">
        <i class="bi bi-exclamation-triangle"></i> 
        ID Produksi "${
          produksiData.idProduksi || idProduksiValue
        }" belum masuk tahap Pengemasan!<br>
        <small>Status saat ini: <strong>${
          statusTahapan || "Tidak diketahui"
        }</strong></small>
      </div>
    `;
    statusDiv.style.display = "block";
    clearProduksiData();
    return;
  }

  // Validasi berat akhir
  const beratAkhir = parseFloat(produksiData.beratAkhir) || 0;
  if (beratAkhir <= 0) {
    statusDiv.innerHTML = `
      <div class="alert alert-warning mb-0">
        <i class="bi bi-exclamation-triangle"></i> 
        Produksi belum memiliki berat akhir!<br>
        <small>Silakan edit produksi di halaman Kelola Produksi dan isi berat akhir.</small>
      </div>
    `;
    statusDiv.style.display = "block";
    clearProduksiData();
    return;
  }

  // Hitung sisa tersedia dari API atau localStorage
  const idProduksiString = produksiData.idProduksi;
  let sisaTersedia = 0;

  try {
    if (window.API && window.API.Produksi) {
      const sisaData = await window.API.Produksi.getSisa(idProduksiString);
      sisaTersedia = sisaData.sisaTersedia || 0;

      // Exclude current edit dari perhitungan
      if (hasilProduksiIdEdit) {
        await loadHasilProduksiData();
        const currentItem = hasilProduksi.find(
          (h) =>
            h.id === parseInt(hasilProduksiIdEdit) ||
            h._id === hasilProduksiIdEdit ||
            String(h._id) === String(hasilProduksiIdEdit)
        );
        if (currentItem) {
          sisaTersedia += parseFloat(currentItem.beratSaatIni || 0);
        }
      }
    } else {
      console.warn("⚠️ API.Produksi not available, cannot calculate sisa");
      return;
    }
  } catch (error) {
    console.error("Error calculating sisa:", error);
    return;
  }

  // Tampilkan status sukses
  statusDiv.innerHTML = `
    <div class="alert alert-success mb-0">
      <i class="bi bi-check-circle"></i> 
      Data produksi berhasil dimuat!<br>
      <small>
        Berat Akhir: <strong>${beratAkhir.toLocaleString(
          "id-ID"
        )} kg</strong> | 
        Sisa Tersedia: <strong>${sisaTersedia.toLocaleString(
          "id-ID"
        )} kg</strong>
      </small>
    </div>
  `;
  statusDiv.style.display = "block";

  // PASTIKAN OPTIONS TER-LOAD DULU sebelum auto-fill
  // Load options untuk Proses Pengolahan dan Jenis Kopi jika belum ter-load
  console.log("🔄 Memuat options untuk Proses Pengolahan dan Jenis Kopi...");
  await loadProsesPengolahanOptionsHasilProduksi();
  await loadJenisKopiOptionsHasilProduksi();
  console.log("✅ Options berhasil dimuat");

  // Cari jenis kopi dari data bahan berdasarkan ID bahan
  let jenisKopi = "Arabika";
  try {
    if (window.API && window.API.Bahan && produksiData.idBahan) {
      const bahanData = await window.API.Bahan.getById(produksiData.idBahan);
      jenisKopi = bahanData ? bahanData.jenisKopi || "Arabika" : "Arabika";
      console.log("✅ Jenis Kopi dari bahan:", jenisKopi);
    } else {
      console.warn(
        "⚠️ API.Bahan not available, menggunakan jenisKopi dari produksi atau default"
      );
      // Coba ambil dari produksi data jika ada
      if (produksiData.jenisKopi) {
        jenisKopi = produksiData.jenisKopi;
      }
    }
  } catch (error) {
    console.error("Error loading bahan data:", error);
    // Fallback ke default atau dari produksi
    if (produksiData.jenisKopi) {
      jenisKopi = produksiData.jenisKopi;
    }
  }

  // Auto-fill data dari produksi (WAJIB - data terkait langsung terpilih)
  const prosesPengolahanSelect = document.getElementById("prosesPengolahan");
  const jenisKopiSelect = document.getElementById("jenisKopi");
  const tanggalInput = document.getElementById("tanggal");

  // Auto-fill Proses Pengolahan
  if (prosesPengolahanSelect) {
    const wantId =
      produksiData.idProses != null && produksiData.idProses !== ""
        ? String(produksiData.idProses).trim()
        : "";
    let prosesValue = wantId;
    if (
      wantId &&
      !Array.from(prosesPengolahanSelect.options).some((o) => o.value === wantId)
    ) {
      const nm = (produksiData.prosesPengolahan || "").trim();
      const hit = Array.from(prosesPengolahanSelect.options).find(
        (o) => (o.dataset?.namaProses || "").trim() === nm,
      );
      prosesValue = hit ? hit.value : nm;
    }
    if (!prosesValue && produksiData.prosesPengolahan) {
      prosesValue = produksiData.prosesPengolahan;
    }
    console.log("🔄 Mengisi Proses Pengolahan dengan nilai:", prosesValue);

    // Set value setelah options ter-load
    prosesPengolahanSelect.value = prosesValue;
    console.log("📝 Value yang di-set:", prosesPengolahanSelect.value);

    // Jika value tidak ter-set (option belum ada), tunggu sebentar dan coba lagi
    if (prosesPengolahanSelect.value !== prosesValue && prosesValue) {
      console.warn("⚠️ Value tidak ter-set, mencoba lagi setelah delay...");
      setTimeout(() => {
        prosesPengolahanSelect.value = prosesValue;
        if (prosesPengolahanSelect.value === prosesValue) {
          console.log(
            "✅ Proses Pengolahan berhasil di-set setelah delay:",
            prosesValue
          );
        } else {
          console.error("❌ Proses Pengolahan masih tidak ter-set:", {
            expected: prosesValue,
            actual: prosesPengolahanSelect.value,
            availableOptions: Array.from(prosesPengolahanSelect.options).map(
              (o) => o.value
            ),
          });
        }
        // Trigger change event
        prosesPengolahanSelect.dispatchEvent(new Event("change"));
      }, 200);
    } else if (prosesValue) {
      console.log("✅ Proses Pengolahan berhasil di-set:", prosesValue);
    }

    // Trigger change event untuk memastikan event listener terpanggil
    prosesPengolahanSelect.dispatchEvent(new Event("change"));
  } else {
    console.error("❌ Element prosesPengolahan tidak ditemukan!");
  }

  // Auto-fill Jenis Kopi
  if (jenisKopiSelect) {
    console.log("🔄 Mengisi Jenis Kopi dengan nilai:", jenisKopi);

    // Set value setelah options ter-load
    jenisKopiSelect.value = jenisKopi;
    console.log("📝 Value yang di-set:", jenisKopiSelect.value);

    // Jika value tidak ter-set (option belum ada), tunggu sebentar dan coba lagi
    if (jenisKopiSelect.value !== jenisKopi && jenisKopi) {
      console.warn("⚠️ Value tidak ter-set, mencoba lagi setelah delay...");
      setTimeout(() => {
        jenisKopiSelect.value = jenisKopi;
        if (jenisKopiSelect.value === jenisKopi) {
          console.log(
            "✅ Jenis Kopi berhasil di-set setelah delay:",
            jenisKopi
          );
        } else {
          console.error("❌ Jenis Kopi masih tidak ter-set:", {
            expected: jenisKopi,
            actual: jenisKopiSelect.value,
            availableOptions: Array.from(jenisKopiSelect.options).map(
              (o) => o.value
            ),
          });
        }
        // Trigger change event
        jenisKopiSelect.dispatchEvent(new Event("change"));
      }, 200);
    } else if (jenisKopi) {
      console.log("✅ Jenis Kopi berhasil di-set:", jenisKopi);
    }

    // Trigger change event untuk memastikan event listener terpanggil
    jenisKopiSelect.dispatchEvent(new Event("change"));
  } else {
    console.error("❌ Element jenisKopi tidak ditemukan!");
  }

  // Auto-fill Tanggal
  if (tanggalInput) {
    const tanggalValue =
      produksiData.tanggalSekarang || new Date().toISOString().split("T")[0];
    tanggalInput.value = tanggalValue;
    console.log("✅ Tanggal otomatis terisi:", tanggalValue);
  }

  console.log("✅ Data terkait otomatis terisi:", {
    prosesPengolahan: produksiData.prosesPengolahan,
    jenisKopi: jenisKopi,
    tanggal:
      produksiData.tanggalSekarang || new Date().toISOString().split("T")[0],
  });

  // Set berat input
  beratInput.value = "";
  beratInput.max = sisaTersedia;
  beratInput.placeholder = `Sisa tersedia: ${sisaTersedia.toLocaleString(
    "id-ID"
  )} kg`;
  beratInput.title = `Sisa produksi yang belum dikemas: ${sisaTersedia.toLocaleString(
    "id-ID"
  )} kg`;

  // Simpan data produksi di hidden input untuk digunakan saat save
  const hiddenProduksiData = document.createElement("input");
  hiddenProduksiData.type = "hidden";
  hiddenProduksiData.id = "produksiDataHidden";
  hiddenProduksiData.value = JSON.stringify(produksiData);

  // Hapus hidden input lama jika ada
  const oldHidden = document.getElementById("produksiDataHidden");
  if (oldHidden) {
    oldHidden.remove();
  }

  // Tambahkan hidden input baru
  document.getElementById("formHasilProduksi").appendChild(hiddenProduksiData);

  // Clear tipe produk dan kemasan agar user pilih manual
  document.getElementById("tipeProduk").value = "";
  document.getElementById("kemasan").value = "";
  document.getElementById("jumlah").value = "";

  // Hide roasting field
  document.getElementById("roastingField").style.display = "none";
  document.getElementById("levelRoasting").required = false;
  document.getElementById("levelRoasting").value = "";

  // Update sisa info secara realtime saat berat berubah
  const beratInputElement = document.getElementById("beratSaatIni");
  if (beratInputElement) {
    // Hapus event listener lama jika ada
    const newBeratInput = beratInputElement.cloneNode(true);
    beratInputElement.parentNode.replaceChild(newBeratInput, beratInputElement);

    // Tambahkan event listener baru
    newBeratInput.addEventListener("input", function () {
      updateSisaInfo(idProduksiString, hasilProduksiIdEdit);
      calculateJumlahKemasan();
    });
  }

  console.log("Data produksi berhasil dimuat:", {
    idProduksi: produksiData.idProduksi,
    statusTahapan: produksiData.statusTahapan,
    beratAkhir: produksiData.beratAkhir,
    sisaTersedia: sisaTersedia,
  });
}

// Fungsi untuk clear data produksi
// [PRODUKSI → RESET FORM] Mengosongkan seluruh field otomatis yang berhubungan
// dengan data produksi ketika form dibersihkan atau user ganti pilihan.
function clearProduksiData() {
  const prosesPengolahan = document.getElementById("prosesPengolahan");
  const jenisKopi = document.getElementById("jenisKopi");
  const tanggal = document.getElementById("tanggal");
  const beratInput = document.getElementById("beratSaatIni");
  const tipeProduk = document.getElementById("tipeProduk");
  const kemasan = document.getElementById("kemasan");
  const jumlah = document.getElementById("jumlah");
  const statusDiv = document.getElementById("idProduksiStatus");

  if (prosesPengolahan) prosesPengolahan.value = "";
  if (jenisKopi) jenisKopi.value = "";
  if (tanggal) tanggal.value = new Date().toISOString().split("T")[0];

  if (beratInput) {
    beratInput.value = "";
    beratInput.max = "";
    beratInput.placeholder = "Masukkan berat yang diproses";
    beratInput.title = "";
  }

  if (tipeProduk) tipeProduk.value = "";
  if (kemasan) {
    kemasan.value = "";
    // Reset kemasan options ke default (hanya "Pilih Kemasan")
    kemasan.innerHTML = '<option value="">Pilih Kemasan</option>';
  }
  if (jumlah) jumlah.value = "";

  // Reset roasting field
  const roastingField = document.getElementById("roastingField");
  if (roastingField) {
    roastingField.style.display = "none";
  }
  const levelRoasting = document.getElementById("levelRoasting");
  if (levelRoasting) {
    levelRoasting.required = false;
    levelRoasting.value = "";
  }

  // Reset label dan hint ke default
  const levelRoastingLabel = document.querySelector(
    'label[for="levelRoasting"]'
  );
  if (levelRoastingLabel) {
    levelRoastingLabel.innerHTML = levelRoastingLabel.innerHTML.replace(
      /\(Optional\)/g,
      ""
    );
    if (
      !levelRoastingLabel.innerHTML.includes(
        '<span class="text-danger">*</span>'
      )
    ) {
      levelRoastingLabel.innerHTML = levelRoastingLabel.innerHTML.replace(
        "Level Roasting",
        'Level Roasting <span class="text-danger">*</span>'
      );
    }
  }

  const roastingHint = document.getElementById("roastingHint");
  if (roastingHint) {
    roastingHint.style.display = "none";
  }

  if (statusDiv) {
    statusDiv.style.display = "none";
    statusDiv.innerHTML = "";
  }

  // Hapus hidden input produksi data
  const hiddenProduksiData = document.getElementById("produksiDataHidden");
  if (hiddenProduksiData) {
    hiddenProduksiData.remove();
  }
}

// Fungsi loadProduksiData sudah diupdate di atas untuk bekerja dengan dropdown select

// Fungsi untuk update info sisa tersedia secara realtime
// [PRODUKSI → STATUS BERAT] Menampilkan sisa berat yang tersedia dari produksi
// terpilih agar user tahu batas maksimum proses pengemasan. (MONGODB ONLY)
async function updateSisaInfo(produksiIdOrIdProduksi, hasilProduksiIdEdit) {
  if (!window.API || !window.API.Produksi) {
    console.warn("⚠️ API.Produksi not available, cannot update sisa info");
    return;
  }

  try {
    // Get data from API (MongoDB ONLY)
    const sisaData = await window.API.Produksi.getSisa(produksiIdOrIdProduksi);
    await loadHasilProduksiData();

    // Get produksi data from API
    const produksiData = await window.API.Produksi.getById(
      produksiIdOrIdProduksi
    );

    if (!produksiData || !produksiData.beratAkhir) {
      return;
    }

    // Gunakan idProduksi string untuk filter hasil produksi
    const idProduksiString = produksiData.idProduksi;

    // Hitung total yang sudah dikemas (exclude yang sedang diedit)
    const totalDikemas = hasilProduksi
      .filter(
        (h) =>
          h.idProduksi === idProduksiString &&
          h.id !== parseInt(hasilProduksiIdEdit)
      )
      .reduce((sum, h) => sum + (parseFloat(h.beratSaatIni) || 0), 0);

    const sisaTersedia = Math.max(
      0,
      parseFloat(produksiData.beratAkhir) - totalDikemas
    );

    const beratInput = document.getElementById("beratSaatIni");
    if (beratInput) {
      beratInput.max = sisaTersedia;
      beratInput.placeholder = `Sisa tersedia: ${sisaTersedia.toLocaleString(
        "id-ID"
      )} kg`;
      beratInput.title = `Sisa produksi yang belum dikemas: ${sisaTersedia.toLocaleString(
        "id-ID"
      )} kg`;

      // Update status div
      const statusDiv = document.getElementById("idProduksiStatus");
      if (statusDiv && statusDiv.style.display !== "none") {
        statusDiv.innerHTML = `
          <div class="alert alert-success mb-0">
            <i class="bi bi-check-circle"></i> 
            Data produksi berhasil dimuat!<br>
            <small>
              Berat Akhir: <strong>${(
                parseFloat(produksiData.beratAkhir) || 0
              ).toLocaleString("id-ID")} kg</strong> | 
              Sisa Tersedia: <strong>${sisaTersedia.toLocaleString(
                "id-ID"
              )} kg</strong>
            </small>
          </div>
        `;
      }

      // Validasi jika nilai saat ini melebihi sisa
      const currentValue = parseFloat(beratInput.value) || 0;
      if (currentValue > sisaTersedia) {
        beratInput.setCustomValidity(
          `Berat tidak boleh melebihi sisa tersedia (${sisaTersedia.toLocaleString(
            "id-ID"
          )} kg)`
        );
      } else {
        beratInput.setCustomValidity("");
      }
    }
  } catch (error) {
    console.error("Error updating sisa info:", error);
  }
}

// Fungsi untuk menghitung jumlah kemasan otomatis dan update sisa
// [PRODUKSI ↔ KEMASAN] Hitung berapa banyak unit kemasan yang dihasilkan
// berdasarkan berat yang dimasukkan dan ukuran kemasan yang dipilih.
function calculateJumlahKemasan() {
  const beratSaatIni =
    parseFloat(document.getElementById("beratSaatIni").value) || 0;
  const kemasan = document.getElementById("kemasan").value;
  const jumlahInput = document.getElementById("jumlah");
  const idProduksiSelect = document.getElementById("idProduksi");
  const hasilProduksiIdEdit = document.getElementById("hasilProduksiId").value;
  const tipeProdukValue = document.getElementById("tipeProduk").value || "";
  const tipeProdukLower = tipeProdukValue.trim().toLowerCase();

  // Update sisa tersedia secara realtime
  if (idProduksiSelect && idProduksiSelect.value) {
    updateSisaInfo(idProduksiSelect.value, hasilProduksiIdEdit);
  }

  let efektifBerat = beratSaatIni;
  // Deteksi Pixel dengan partial matching untuk mendukung variasi nama seperti "pixel(bahankopral)"
  if (tipeProdukLower.includes("pixel")) {
    efektifBerat = beratSaatIni * 0.8; // kurangi 20% karena penyusutan roasting
    console.log(
      `🔧 Tipe produk Pixel terdeteksi (${tipeProdukValue}). Berat awal ${beratSaatIni} kg dikurangi 20% menjadi ${efektifBerat} kg untuk perhitungan kemasan.`
    );
  }

  if (!kemasan || beratSaatIni <= 0) {
    jumlahInput.value = "";
    jumlahInput.setCustomValidity(
      "Isi berat dan pilih kemasan terlebih dahulu"
    );
    return;
  }

  // Parse ukuran kemasan ke kg
  let ukuranKg = 0;
  if (kemasan.toLowerCase().includes("kg")) {
    // Green beans: "5 kg" -> 5
    const match = kemasan.match(/(\d+(?:\.\d+)?)\s*kg/i);
    if (match) {
      ukuranKg = parseFloat(match[1]);
    } else {
      ukuranKg = parseFloat(kemasan.replace(/kg/gi, "").trim());
    }
  } else if (kemasan.toLowerCase().includes("gram")) {
    // Kopi sangrai/bubuk: "250 gram" -> 0.25 kg
    const match = kemasan.match(/(\d+(?:\.\d+)?)\s*gram/i);
    if (match) {
      ukuranKg = parseFloat(match[1]) / 1000;
    } else {
      ukuranKg = parseFloat(kemasan.replace(/gram/gi, "").trim()) / 1000;
    }
  }

  if (ukuranKg > 0) {
    const jumlahKemasan = Math.floor(efektifBerat / ukuranKg);
    jumlahInput.value = jumlahKemasan;
    jumlahInput.setCustomValidity(""); // Clear validation error

    // Deteksi Pixel dengan partial matching untuk mendukung variasi nama
    if (tipeProdukLower.includes("pixel")) {
      jumlahInput.title = `Jumlah dihitung setelah penyusutan 20% (berat efektif ${efektifBerat.toLocaleString(
        "id-ID"
      )} kg)`;
    } else {
      jumlahInput.removeAttribute("title");
    }

    console.log("✅ Jumlah kemasan dihitung:", {
      beratSaatIni,
      efektifBerat,
      kemasan,
      ukuranKg,
      jumlahKemasan,
    });
  } else {
    jumlahInput.value = "";
    jumlahInput.setCustomValidity(
      "Ukuran kemasan tidak valid. Pastikan kemasan memiliki format yang benar (contoh: '250 gram' atau '5 kg')"
    );
    jumlahInput.removeAttribute("title");
    console.warn("⚠️ Ukuran kemasan tidak valid:", kemasan);
  }
}

// Load opsi tipe produk (Green Beans dan Pixel)
// Tipe produk sudah standar: Green Beans (wajib) dan Pixel (opsional)
async function loadProdukOptionsHasilProduksi() {
  try {
    const tipeProdukList = ['Green Beans', 'Pixel'];
    const select = document.getElementById("tipeProduk");
    if (select) {
      const selectedValue = select.value;
      select.innerHTML = '<option value="">Pilih Tipe Produk</option>';
      tipeProdukList.forEach((nama) => {
        const option = document.createElement("option");
        option.value = nama;
        option.textContent = nama;
        select.appendChild(option);
      });
      if (selectedValue) {
        select.value = selectedValue;
      }
    }
  } catch (error) {
    console.error("Error loading produk options:", error);
  }
}

// [MASTER DATA → JENIS KOPI] Sinkronisasi pilihan jenis kopi dari kelola data
// ke form hasil produksi.
async function loadJenisKopiOptionsHasilProduksi() {
  try {
    let dataJenisKopi = [];
    if (
      !window.API ||
      !window.API.MasterData ||
      !window.API.MasterData.jenisKopi
    ) {
      console.warn(
        "⚠️ API.MasterData.jenisKopi not available, skipping options"
      );
      return;
    }
    dataJenisKopi = await window.API.MasterData.jenisKopi.getAll();
    const select = document.getElementById("jenisKopi");
    if (select) {
      const selectedValue = select.value;
      select.innerHTML = '<option value="">Pilih Jenis Kopi</option>';
      dataJenisKopi.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.nama;
        option.textContent = item.nama;
        select.appendChild(option);
      });
      if (selectedValue) {
        select.value = selectedValue;
      }
    }
  } catch (error) {
    console.error("Error loading jenis kopi options:", error);
  }
}

// [MASTER DATA → PROSES] Menyediakan opsi proses pengolahan terbaru dari master
// data untuk memastikan dokumentasi alur produksi lengkap.
async function loadProsesPengolahanOptionsHasilProduksi() {
  try {
    let dataProses = [];
    if (
      !window.API ||
      !window.API.MasterData ||
      !window.API.MasterData.proses
    ) {
      console.warn("⚠️ API.MasterData.proses not available, skipping options");
      return;
    }
    dataProses = await window.API.MasterData.proses.getAll();
    const select = document.getElementById("prosesPengolahan");
    if (select) {
      const selectedValue = select.value;
      select.innerHTML = '<option value="">Pilih Proses Pengolahan</option>';
      dataProses.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.id != null ? String(item.id) : (item.nama || "");
        option.textContent = item.nama || "";
        option.dataset.namaProses = item.nama || "";
        select.appendChild(option);
      });
      if (selectedValue) {
        select.value = selectedValue;
      }
    }
  } catch (error) {
    console.error("Error loading proses options:", error);
  }
}

// [MASTER DATA → LEVEL ROASTING] Mengisi pilihan level roasting hanya bila
// tipe produk membutuhkan parameter roasting.
async function loadLevelRoastingOptions() {
  try {
    let dataRoasting = [];
    if (
      !window.API ||
      !window.API.MasterData ||
      !window.API.MasterData.roasting
    ) {
      console.warn(
        "⚠️ API.MasterData.roasting not available, skipping options"
      );
      return;
    }
    dataRoasting = await window.API.MasterData.roasting.getAll();
    const select = document.getElementById("levelRoasting");
    if (select) {
      const selectedValue = select.value;
      select.innerHTML = '<option value="">Pilih Level Roasting</option>';
      dataRoasting.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.nama;
        option.textContent = item.nama;
        select.appendChild(option);
      });
      if (selectedValue) {
        select.value = selectedValue;
      }
    }
  } catch (error) {
    console.error("Error loading roasting options:", error);
  }
}

// [MASTER DATA → KEMASAN] Membaca daftar kemasan dari API dengan fallback ke localStorage
let dataKemasanHasilProduksi = [];

async function loadKemasanOptionsHasilProduksi() {
  try {
    // Coba load dari API terlebih dahulu
    if (window.API && window.API.MasterData && window.API.MasterData.kemasan) {
      try {
        dataKemasanHasilProduksi = await window.API.MasterData.kemasan.getAll();
        console.log(
          "[KEMASAN] Data kemasan dimuat dari API:",
          dataKemasanHasilProduksi.length,
          "items"
        );

        // Simpan ke localStorage sebagai cache
        if (
          Array.isArray(dataKemasanHasilProduksi) &&
          dataKemasanHasilProduksi.length > 0
        ) {
          localStorage.setItem(
            "dataKemasan",
            JSON.stringify(dataKemasanHasilProduksi)
          );
        }
      } catch (apiError) {
        console.warn(
          "⚠️ Error loading kemasan dari API, fallback ke localStorage:",
          apiError
        );
        // Fallback ke localStorage jika API error
        try {
          dataKemasanHasilProduksi = JSON.parse(
            localStorage.getItem("dataKemasan") || "[]"
          );
        } catch (parseError) {
          console.error(
            "Error loading dataKemasan dari localStorage:",
            parseError
          );
          dataKemasanHasilProduksi = [];
        }
      }
    } else {
      // Fallback ke localStorage jika API tidak tersedia
      console.log("[KEMASAN] API tidak tersedia, menggunakan localStorage");
      try {
        dataKemasanHasilProduksi = JSON.parse(
          localStorage.getItem("dataKemasan") || "[]"
        );
      } catch (error) {
        console.error("Error loading dataKemasan dari localStorage:", error);
        dataKemasanHasilProduksi = [];
      }
    }

    if (!Array.isArray(dataKemasanHasilProduksi)) {
      console.error("❌ dataKemasan bukan array!", dataKemasanHasilProduksi);
      dataKemasanHasilProduksi = [];
    }

    const ukuranKemasan = dataKemasanHasilProduksi
      .map((item, index) => {
        if (typeof item === "object" && item !== null) {
          // Cek properti 'ukuran' terlebih dahulu
          if (item.ukuran) {
            return item.ukuran;
          }
          // Fallback ke 'nama' jika 'ukuran' tidak ada
          if (item.nama) {
            return item.nama;
          }
          console.warn(
            `[KEMASAN] Item index ${index} tidak memiliki properti "ukuran" atau "nama":`,
            item
          );
          return null;
        }
        if (typeof item === "string") {
          return item;
        }
        console.warn(
          `[KEMASAN] Format item index ${index} tidak dikenal:`,
          item
        );
        return null;
      })
      .filter((ukuran) => ukuran && ukuran.trim() !== "");

    console.log(
      `[KEMASAN] Data kemasan siap pakai: ${ukuranKemasan.length} ukuran`,
      ukuranKemasan
    );

    return ukuranKemasan;
  } catch (error) {
    console.error("Error di loadKemasanOptionsHasilProduksi():", error);
    return [];
  }
}

// Fungsi untuk update opsi kemasan berdasarkan tipe produk
// [KEMASAN → DROPDOWN] Mengisi dropdown kemasan sesuai tipe produk yang
// dipilih, termasuk validasi dan pesan ketika tidak ada ukuran yang cocok.
async function updateKemasanOptions() {
  const tipeProduk = document.getElementById("tipeProduk");
  const kemasan = document.getElementById("kemasan");

  if (!tipeProduk || !kemasan) {
    console.warn("⚠️ Element tipeProduk atau kemasan tidak ditemukan!");
    return;
  }

  const tipeProdukValue = tipeProduk.value;
  const selectedValue = kemasan.value;

  console.log(
    "🔄 updateKemasanOptions() dipanggil dengan tipe produk:",
    tipeProdukValue
  );

  kemasan.innerHTML = '<option value="">Pilih Kemasan</option>';

  // Jika tipe produk belum dipilih, tidak perlu load kemasan
  if (!tipeProdukValue) {
    console.log("⚠️ Tipe produk belum dipilih, kemasan options tidak diisi");
    return;
  }

  // Await loadKemasanOptionsHasilProduksi() karena sekarang async
  const allKemasan = await loadKemasanOptionsHasilProduksi();
  console.log("📦 Semua kemasan yang tersedia:", allKemasan);
  console.log("📦 Jumlah semua kemasan:", allKemasan.length);
  console.log("📦 Tipe produk yang dipilih:", tipeProdukValue);
  console.log("📦 Tipe produk (typeof):", typeof tipeProdukValue);
  console.log(
    "📦 Tipe produk (length):",
    tipeProdukValue ? tipeProdukValue.length : 0
  );

  // Validasi: pastikan allKemasan adalah array dan tidak kosong
  if (!Array.isArray(allKemasan)) {
    console.error("❌ allKemasan bukan array!", allKemasan);
    return;
  }

  if (allKemasan.length === 0) {
    console.error(
      "❌ allKemasan array kosong! Data kemasan tidak ter-load dengan benar."
    );
    console.error(
      "❌ Cek apakah loadKemasanOptionsHasilProduksi() mengembalikan data."
    );
    return;
  }

  let filteredKemasan = [];

  // Normalize tipe produk untuk perbandingan (trim whitespace)
  const normalizedTipeProduk = (tipeProdukValue || "").trim();
  const normalizedTipeProdukLower = normalizedTipeProduk.toLowerCase();

  if (normalizedTipeProdukLower === "green beans") {
    // Filter kemasan untuk Green Beans (yang mengandung "kg")
    console.log("🔍 Filtering untuk Green Beans (mencari 'kg')...");
    filteredKemasan = allKemasan.filter((k) => {
      if (!k || typeof k !== "string") {
        console.warn(`  - Item tidak valid:`, k);
        return false;
      }
      const lowerK = k.toLowerCase();
      const hasKg = lowerK.includes("kg");
      console.log(`  - "${k}" -> contains "kg": ${hasKg}`);
      return hasKg;
    });
    console.log("📦 Kemasan untuk Green Beans:", filteredKemasan);
    console.log("📦 Jumlah kemasan untuk Green Beans:", filteredKemasan.length);
  } else if (normalizedTipeProdukLower.includes("pixel")) {
    // Pixel bisa menggunakan semua kemasan (gram dan kg)
    console.log(
      "🔍 Pixel terdeteksi - menampilkan semua kemasan yang tersedia..."
    );
    filteredKemasan = allKemasan; // Tampilkan semua kemasan untuk Pixel
    console.log("📦 Kemasan untuk Pixel (semua):", filteredKemasan);
    console.log("📦 Jumlah kemasan untuk Pixel:", filteredKemasan.length);
  } else if (
    normalizedTipeProdukLower === "kopi sangrai" ||
    normalizedTipeProdukLower === "kopi bubuk"
  ) {
    // Filter kemasan untuk Kopi Sangrai/Bubuk (yang mengandung "gram")
    console.log("🔍 Filtering untuk Kopi Sangrai/Bubuk (mencari 'gram')...");
    filteredKemasan = allKemasan.filter((k) => {
      if (!k || typeof k !== "string") {
        console.warn(`  - Item tidak valid:`, k);
        return false;
      }
      const lowerK = k.toLowerCase();
      const hasGram = lowerK.includes("gram");
      console.log(`  - "${k}" -> contains "gram": ${hasGram}`);
      return hasGram;
    });
    console.log("📦 Kemasan untuk Kopi Sangrai/Bubuk:", filteredKemasan);
    console.log(
      "📦 Jumlah kemasan untuk Kopi Sangrai/Bubuk:",
      filteredKemasan.length
    );
  } else {
    console.warn(`⚠️ Tipe produk "${tipeProdukValue}" tidak dikenali!`);
    console.warn(`⚠️ Tipe produk (normalized): "${normalizedTipeProduk}"`);
    console.warn(
      "⚠️ Tipe produk yang valid: 'Green Beans', 'Kopi Sangrai', 'Kopi Bubuk', 'Pixel'"
    );
    console.warn(
      "⚠️ Periksa apakah tipe produk di dropdown sama persis dengan yang diharapkan."
    );
    console.warn("⚠️ Menampilkan semua ukuran kemasan sebagai fallback.");
    filteredKemasan = allKemasan;
  }

  // Isi dropdown dengan kemasan yang sesuai
  if (filteredKemasan.length === 0) {
    console.warn(
      `⚠️ Tidak ada kemasan yang sesuai untuk tipe produk "${tipeProdukValue}"`
    );
    console.warn(`⚠️ Semua kemasan yang tersedia:`, allKemasan);
    console.warn(`⚠️ Jumlah semua kemasan:`, allKemasan.length);
    console.warn(`⚠️ Apakah allKemasan array kosong?`, allKemasan.length === 0);
    // Tambahkan option warning
    const option = document.createElement("option");
    option.value = "";
    option.textContent = `⚠️ Tidak ada kemasan yang tersedia untuk ${tipeProdukValue}`;
    option.disabled = true;
    option.style.color = "#dc3545";
    kemasan.appendChild(option);
  } else {
    filteredKemasan.forEach((k) => {
      const option = document.createElement("option");
      option.value = k;
      option.textContent = k;
      kemasan.appendChild(option);
    });
    console.log(
      `✅ ${filteredKemasan.length} kemasan options ditambahkan untuk ${tipeProdukValue}`
    );
  }

  // Kembalikan nilai yang dipilih sebelumnya jika ada
  if (selectedValue) {
    kemasan.value = selectedValue;
  }

  // Recalculate setelah update options
  calculateJumlahKemasan();
}

// Fungsi untuk toggle field roasting
// [UI → ROASTING FIELD] Mengatur visibilitas dan kewajiban field roasting
// berdasarkan tipe produk sekaligus memicu update kemasan.
async function toggleRoastingField() {
  const tipeProduk = document.getElementById("tipeProduk");
  if (!tipeProduk) {
    console.error("❌ Element tipeProduk tidak ditemukan!");
    return;
  }

  const tipeProdukValue = tipeProduk.value;
  const tipeProdukLower = (tipeProdukValue || "").trim().toLowerCase();
  const roastingField = document.getElementById("roastingField");
  if (!roastingField) return;

  console.log("🔄 toggleRoastingField() dipanggil");
  console.log("🔄 Tipe produk yang dipilih:", tipeProdukValue);
  console.log("🔄 Tipe produk (normalized):", tipeProdukLower);

  // Update kemasan options - ini akan mengisi dropdown kemasan berdasarkan tipe produk
  // Harus dipanggil setiap kali tipe produk berubah, terlepas dari kondisi roasting
  // Await karena updateKemasanOptions() sekarang async
  await updateKemasanOptions();

  // Cek apakah produk membutuhkan level roasting
  // Menggunakan normalisasi string dan partial matching untuk fleksibilitas
  // Mendukung: "Kopi Sangrai", "Kopi Bubuk", "Pixel", "pixel(bahankopral)", dll
  const isPixel = tipeProdukLower.includes("pixel");
  const needsRoastingRequired =
    tipeProdukLower === "kopi sangrai" || tipeProdukLower === "kopi bubuk";
  const needsRoastingOptional = isPixel; // Pixel membutuhkan level roasting tapi optional

  if (needsRoastingRequired || needsRoastingOptional) {
    console.log("✅ Produk membutuhkan level roasting, menampilkan field...");
    roastingField.style.display = "block";
    const levelRoasting = document.getElementById("levelRoasting");
    const levelRoastingLabel = document.querySelector(
      'label[for="levelRoasting"]'
    );

    if (levelRoasting) {
      // Untuk pixel: optional (tidak required), untuk kopi sangrai/bubuk: required
      levelRoasting.required = needsRoastingRequired;

      // Update label dan hint untuk menunjukkan optional untuk pixel
      if (levelRoastingLabel) {
        if (isPixel) {
          // Hapus tanda required (*) dan tambahkan (Optional)
          levelRoastingLabel.innerHTML = levelRoastingLabel.innerHTML.replace(
            /<span class="text-danger">\*<\/span>/g,
            ""
          );
          if (!levelRoastingLabel.textContent.includes("(Optional)")) {
            levelRoastingLabel.innerHTML +=
              ' <span class="text-muted">(Optional)</span>';
          }
        } else {
          // Pastikan ada tanda required untuk kopi sangrai/bubuk
          if (!levelRoastingLabel.innerHTML.includes("text-danger")) {
            levelRoastingLabel.innerHTML = levelRoastingLabel.innerHTML.replace(
              /\(Optional\)/g,
              ""
            );
            if (
              !levelRoastingLabel.innerHTML.includes(
                '<span class="text-danger">*</span>'
              )
            ) {
              levelRoastingLabel.innerHTML =
                levelRoastingLabel.innerHTML.replace(
                  "Level Roasting",
                  'Level Roasting <span class="text-danger">*</span>'
                );
            }
          }
        }
      }

      // Tampilkan/sembunyikan hint untuk pixel
      const roastingHint = document.getElementById("roastingHint");
      if (roastingHint) {
        roastingHint.style.display = isPixel ? "block" : "none";
      }
    }
    // Load level roasting options dari data master (kelola data)
    loadLevelRoastingOptions();
    console.log(
      `✅ Field level roasting ditampilkan dan opsi dimuat dari data master (${
        isPixel ? "Optional untuk Pixel" : "Required untuk Kopi Sangrai/Bubuk"
      })`
    );
  } else {
    console.log(
      "❌ Produk tidak membutuhkan level roasting, menyembunyikan field..."
    );
    roastingField.style.display = "none";
    const levelRoasting = document.getElementById("levelRoasting");
    const levelRoastingLabel = document.querySelector(
      'label[for="levelRoasting"]'
    );

    if (levelRoasting) {
      levelRoasting.required = false;
      levelRoasting.value = "";
    }

    // Reset label ke default
    if (levelRoastingLabel) {
      levelRoastingLabel.innerHTML = levelRoastingLabel.innerHTML.replace(
        /\(Optional\)/g,
        ""
      );
      if (
        !levelRoastingLabel.innerHTML.includes(
          '<span class="text-danger">*</span>'
        )
      ) {
        levelRoastingLabel.innerHTML = levelRoastingLabel.innerHTML.replace(
          "Level Roasting",
          'Level Roasting <span class="text-danger">*</span>'
        );
      }
    }
  }
}

// Fungsi untuk menampilkan data hasil produksi
// [CRUD → READ] Menampilkan seluruh data hasil produksi dalam tabel interaktif
// termasuk pencarian, badge status, dan tombol aksi.
async function displayHasilProduksi() {
  // Reload data hasil produksi dari API atau localStorage untuk memastikan data terbaru
  try {
    await loadHasilProduksiData();
  } catch (e) {
    console.error("Error loading hasilProduksi:", e);
    hasilProduksi = [];
  }

  const tableBody = document.getElementById("tableBody");
  if (!tableBody) {
    console.error("Table body element not found!");
    return;
  }

  const searchInput = document.getElementById("searchInput");
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";

  // Filter data berdasarkan search
  let filteredHasilProduksi = hasilProduksi;
  if (searchTerm) {
    filteredHasilProduksi = hasilProduksi.filter(
      (h) =>
        (h.tipeProduk && h.tipeProduk.toLowerCase().includes(searchTerm)) ||
        (h.kemasan && h.kemasan.toLowerCase().includes(searchTerm)) ||
        (h.jenisKopi && h.jenisKopi.toLowerCase().includes(searchTerm)) ||
        (h.prosesPengolahan &&
          h.prosesPengolahan.toLowerCase().includes(searchTerm)) ||
        (h.idProduksi && h.idProduksi.toLowerCase().includes(searchTerm)) ||
        (h.idBahan && h.idBahan.toLowerCase().includes(searchTerm)) ||
        (h.levelRoasting && h.levelRoasting.toLowerCase().includes(searchTerm))
    );
  }

  if (filteredHasilProduksi.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="12" class="text-center py-4 text-muted">
          <i class="bi bi-inbox fs-1 d-block mb-2"></i>
          Tidak ada data hasil produksi
        </td>
      </tr>
    `;
    return;
  }

  try {
    tableBody.innerHTML = filteredHasilProduksi
      .map(
        (h, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><span class="badge bg-secondary">${h.idProduksi || "-"}</span></td>
      <td><span class="badge bg-info">${h.idBahan || "-"}</span></td>
      <td><span class="badge bg-primary">${h.tipeProduk || "-"}</span></td>
      <td>${h.kemasan || "-"}</td>
      <td><span class="badge ${(window.getJenisKopiBadgeClass || (() => 'bg-secondary'))(h.jenisKopi)}">${h.jenisKopi}</span></td>
      <td><span class="badge ${(window.getProsesPengolahanBadgeClass || (() => 'bg-secondary'))(h.prosesPengolahan)}">${h.prosesPengolahan}</span></td>
      <td>${h.levelRoasting || "-"}</td>
      <td>${(h.beratSaatIni || 0).toLocaleString("id-ID")} kg</td>
      <td>${new Date(h.tanggal).toLocaleDateString("id-ID")}</td>
      <td>${h.jumlah.toLocaleString("id-ID")} kemasan</td>
      <td class="text-center">
        <button 
          class="btn btn-sm btn-warning btn-action" 
          onclick="editHasilProduksi(${h.id})"
          title="Edit">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button 
          class="btn btn-sm btn-danger btn-action" 
          onclick="deleteHasilProduksi(${h.id})"
          title="Hapus">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `
      )
      .join("");
  } catch (error) {
    console.error("Error rendering hasil produksi table:", error);
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
    `Displaying ${filteredHasilProduksi.length} hasil produksi items`
  );
}

// Fungsi untuk membuka modal tambah/edit
// [CRUD → MODAL HANDLER] Menangani pembukaan modal tambah/edit hasil produksi,
// termasuk reset form dan pre-load master data.
async function openModal(mode = "add") {
  currentEditId = null;
  const modal = document.getElementById("modalHasilProduksi");
  const modalLabel = document.getElementById("modalHasilProduksiLabel");
  const form = document.getElementById("formHasilProduksi");

  if (!modal || !modalLabel || !form) {
    console.error("Modal elements tidak ditemukan!");
    return;
  }

  console.log("openModal() dipanggil dengan mode:", mode);

  // Load semua data master (akan di-reload lagi di show.bs.modal untuk memastikan data terbaru)
  await loadProdukOptionsHasilProduksi();
  await loadJenisKopiOptionsHasilProduksi();
  await loadProsesPengolahanOptionsHasilProduksi();
  await loadLevelRoastingOptions();

  if (mode === "add") {
    modalLabel.textContent = "Tambah Hasil Produksi";
    form.reset();
    document.getElementById("hasilProduksiId").value = "";

    // Clear status display
    const statusDiv = document.getElementById("idProduksiStatus");
    if (statusDiv) {
      statusDiv.style.display = "none";
      statusDiv.innerHTML = "";
    }

    // Set tanggal default ke hari ini
    const today = new Date().toISOString().split("T")[0];
    document.getElementById("tanggal").value = today;

    // Reset fields
    document.getElementById("roastingField").style.display = "none";
    const levelRoasting = document.getElementById("levelRoasting");
    if (levelRoasting) {
      levelRoasting.required = false;
      levelRoasting.value = "";
    }

    // Reset label dan hint ke default
    const levelRoastingLabel = document.querySelector(
      'label[for="levelRoasting"]'
    );
    if (levelRoastingLabel) {
      levelRoastingLabel.innerHTML = levelRoastingLabel.innerHTML.replace(
        /\(Optional\)/g,
        ""
      );
      if (
        !levelRoastingLabel.innerHTML.includes(
          '<span class="text-danger">*</span>'
        )
      ) {
        levelRoastingLabel.innerHTML = levelRoastingLabel.innerHTML.replace(
          "Level Roasting",
          'Level Roasting <span class="text-danger">*</span>'
        );
      }
    }

    const roastingHint = document.getElementById("roastingHint");
    if (roastingHint) {
      roastingHint.style.display = "none";
    }

    // Reset ID Produksi dropdown
    const idProduksiSelect = document.getElementById("idProduksi");
    if (idProduksiSelect) {
      idProduksiSelect.value = "";
      // Reload produksi options untuk dropdown - akan di-reload lagi di show.bs.modal
      // Tapi kita panggil di sini juga untuk memastikan dropdown terisi
      await loadProduksiOptions();
    }

    // Clear produksi data dan status
    clearProduksiData();
  } else {
    modalLabel.textContent = "Edit Hasil Produksi";
  }
}

// Fungsi untuk edit hasil produksi
// [CRUD → EDIT] Memuat data hasil produksi tertentu ke dalam form untuk
// diperbarui, lengkap dengan sinkronisasi dropdown terkait.
async function editHasilProduksi(id) {
  try {
    // Reload data hasil produksi dari API atau localStorage sebelum edit
    await loadHasilProduksiData();

    const h = hasilProduksi.find((item) => item.id === id || item._id === id);
    if (!h) {
      alert("Data hasil produksi tidak ditemukan!");
      return;
    }

    // Load semua options terlebih dahulu
    await loadProdukOptionsHasilProduksi();
    await loadJenisKopiOptionsHasilProduksi();
    await loadProsesPengolahanOptionsHasilProduksi();
    await loadLevelRoastingOptions();
    await loadProduksiOptions(); // Load opsi produksi untuk dropdown

    currentEditId = id;
    document.getElementById("hasilProduksiId").value = h.id || h._id;

    // Set idProduksi jika ada (gunakan dropdown select)
    if (h.idProduksi) {
      // Tunggu dropdown terisi dulu, lalu set value
      setTimeout(async () => {
        // Set value dropdown dengan idProduksi (string) - konsisten dengan value dropdown
        const idProduksiSelect = document.getElementById("idProduksi");
        if (idProduksiSelect) {
          idProduksiSelect.value = h.idProduksi;
          // Load produksi data untuk update sisa info
          await loadProduksiData();
        }
      }, 300);
    }

    document.getElementById("tipeProduk").value = h.tipeProduk || "";
    document.getElementById("jenisKopi").value = h.jenisKopi || "";
    const psel = document.getElementById("prosesPengolahan");
    if (psel) {
      const idPv = h.idProses != null ? String(h.idProses) : "";
      if (
        idPv &&
        Array.from(psel.options).some((o) => o.value === idPv)
      ) {
        psel.value = idPv;
      } else {
        const hit = Array.from(psel.options).find(
          (o) =>
            (o.dataset?.namaProses || "").trim() ===
            String(h.prosesPengolahan || "").trim(),
        );
        psel.value = hit ? hit.value : h.prosesPengolahan || "";
      }
    }
    document.getElementById("tanggal").value = h.tanggal || "";
    document.getElementById("beratSaatIni").value = h.beratSaatIni || "";
    document.getElementById("jumlah").value = h.jumlah || "";

    // Update kemasan options dan roasting field
    // toggleRoastingField() akan memanggil updateKemasanOptions()
    // Await karena toggleRoastingField() sekarang async
    await toggleRoastingField();

    // Set kemasan value setelah options di-update
    if (h.kemasan) {
      // Tunggu sebentar untuk memastikan options sudah terisi
      setTimeout(() => {
        document.getElementById("kemasan").value = h.kemasan || "";
        calculateJumlahKemasan();
      }, 100);
    }

    if (h.levelRoasting) {
      document.getElementById("levelRoasting").value = h.levelRoasting;
    }

    const modal = new bootstrap.Modal(
      document.getElementById("modalHasilProduksi")
    );
    modal.show();
    openModal("edit");
  } catch (error) {
    console.error("Error loading hasil produksi for edit:", error);
    alert("Error memuat data hasil produksi");
  }
}

// Fungsi untuk menyimpan hasil produksi (tambah/edit)
// [CRUD → CREATE/UPDATE] Validasi form, kurangi stok produksi, simpan hasil
// produksi baru atau perubahan ke API, dan trigger event sinkronisasi.
async function saveHasilProduksi() {
  const form = document.getElementById("formHasilProduksi");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const hasilProduksiId = document.getElementById("hasilProduksiId").value;
  const idProduksiSelect = document.getElementById("idProduksi");
  const selectedOption = idProduksiSelect
    ? idProduksiSelect.options[idProduksiSelect.selectedIndex]
    : null;
  const idProduksiValue = selectedOption ? selectedOption.value : "";
  const tipeProduk = document.getElementById("tipeProduk").value;
  const tipeProdukLower = (tipeProduk || "").trim().toLowerCase();
  const kemasan = document.getElementById("kemasan").value;
  const jenisKopi = document.getElementById("jenisKopi").value;
  const prosesSel = document.getElementById("prosesPengolahan");
  const prosesRaw = prosesSel ? prosesSel.value : "";
  const tanggal = document.getElementById("tanggal").value;
  const beratSaatIni = parseFloat(
    document.getElementById("beratSaatIni").value
  );
  const jumlah = parseInt(document.getElementById("jumlah").value);

  // Validasi ID Produksi wajib (BUKAN OPTIONAL - WAJIB DIPILIH)
  if (!idProduksiValue || idProduksiValue.trim() === "") {
    alert(
      "ID Produksi WAJIB dipilih! Silakan pilih ID Produksi yang sudah masuk tahap Pengemasan."
    );
    if (idProduksiSelect) {
      idProduksiSelect.focus();
      idProduksiSelect.classList.add("is-invalid");
      // Hapus class invalid setelah 3 detik
      setTimeout(() => {
        idProduksiSelect.classList.remove("is-invalid");
      }, 3000);
    }
    return;
  }

  // Pastikan ID Produksi tidak kosong
  if (idProduksiSelect) {
    idProduksiSelect.classList.remove("is-invalid");
  }

  // Ambil data produksi dari dropdown option atau cari dari localStorage
  let produksiData = null;

  // Coba ambil dari hidden input dulu (jika sudah di-load sebelumnya)
  const hiddenProduksiData = document.getElementById("produksiDataHidden");
  if (hiddenProduksiData && hiddenProduksiData.value) {
    try {
      produksiData = JSON.parse(hiddenProduksiData.value);
    } catch (e) {
      console.error("Error parsing hidden produksi data:", e);
    }
  }

  // Jika tidak ada di hidden input, cari dari dropdown option dataset
  if (!produksiData && selectedOption && selectedOption.dataset.produksi) {
    try {
      produksiData = JSON.parse(selectedOption.dataset.produksi);
    } catch (e) {
      console.error("Error parsing option produksi data:", e);
    }
  }

  // Jika masih tidak ada, cari dari API (MONGODB ONLY) berdasarkan idProduksi (string)
  if (!produksiData) {
    try {
      if (!window.API || !window.API.Produksi) {
        console.warn(
          "⚠️ API.Produksi not available, cannot load produksi data"
        );
        return;
      }
      produksiData = await window.API.Produksi.getById(idProduksiValue);
    } catch (error) {
      console.error("Error loading produksi data:", error);
      return;
    }
  }

  // Validasi: Data produksi harus ada
  if (!produksiData) {
    alert(
      `Data produksi tidak ditemukan!\n\n` +
        `ID Produksi yang dipilih tidak valid atau telah dihapus.\n` +
        `Silakan pilih ID Produksi yang sudah masuk tahap Pengemasan.`
    );
    if (idProduksiSelect) {
      idProduksiSelect.focus();
    }
    return;
  }

  // Validasi: Status produksi HARUS "Pengemasan" (fleksibel untuk "Pengemasan" atau "Pengemasan (Tahapan Akhir)")
  const statusTahapan = (produksiData.statusTahapan || "").toString().trim();
  const isPengemasan =
    statusTahapan === "Pengemasan" || statusTahapan.includes("Pengemasan");

  if (!isPengemasan) {
    const statusSaatIni = statusTahapan || "Tidak diketahui";
    alert(
      `ID Produksi belum masuk tahap Pengemasan!\n\n` +
        `ID Produksi: ${produksiData.idProduksi || idProduksiValue}\n` +
        `Status Saat Ini: ${statusSaatIni}\n` +
        `Status Diperlukan: Pengemasan\n\n` +
        `Hasil produksi hanya dapat ditambahkan untuk produksi yang sudah masuk tahap Pengemasan.\n` +
        `Silakan ubah status produksi ke "Pengemasan" terlebih dahulu di halaman Kelola Produksi.`
    );
    if (idProduksiSelect) {
      idProduksiSelect.focus();
    }
    return;
  }

  // Validasi: Produksi harus memiliki berat akhir
  const beratAkhir = parseFloat(produksiData.beratAkhir) || 0;
  if (beratAkhir <= 0) {
    alert(
      `Produksi belum memiliki berat akhir!\n\n` +
        `ID Produksi: ${produksiData.idProduksi || idProduksiValue}\n` +
        `Status: ${produksiData.statusTahapan}\n\n` +
        `Produksi harus memiliki berat akhir untuk dapat menambahkan hasil produksi.\n` +
        `Silakan lengkapi data berat akhir di halaman Kelola Produksi.`
    );
    if (idProduksiSelect) {
      idProduksiSelect.focus();
    }
    return;
  }

  // Validasi jumlah kemasan - hitung ulang jika masih 0 atau kosong
  if (!jumlah || jumlah <= 0) {
    // Coba hitung ulang sebelum menampilkan error
    calculateJumlahKemasan();
    const jumlahRecalculated =
      parseInt(document.getElementById("jumlah").value) || 0;

    if (jumlahRecalculated <= 0) {
      const beratSaatIni =
        parseFloat(document.getElementById("beratSaatIni").value) || 0;
      const kemasanValue = document.getElementById("kemasan").value;

      let errorMessage = "Jumlah kemasan harus lebih dari 0.\n\n";
      if (beratSaatIni <= 0) {
        errorMessage += "❌ Berat saat ini belum diisi atau tidak valid.\n";
      }
      if (!kemasanValue) {
        errorMessage += "❌ Kemasan belum dipilih.\n";
      }
      if (beratSaatIni > 0 && kemasanValue) {
        errorMessage +=
          "⚠️ Periksa apakah ukuran kemasan valid atau berat mencukupi untuk kemasan yang dipilih.";
      }
      errorMessage +=
        "\n\nPastikan:\n1. Berat saat ini sudah diisi (lebih dari 0)\n2. Kemasan sudah dipilih\n3. Ukuran kemasan valid";

      alert(errorMessage);

      // Focus ke field yang bermasalah
      if (beratSaatIni <= 0) {
        document.getElementById("beratSaatIni").focus();
      } else if (!kemasanValue) {
        document.getElementById("kemasan").focus();
      } else {
        document.getElementById("jumlah").focus();
      }
      return;
    }

    // Update jumlah dengan nilai yang dihitung ulang
    jumlah = jumlahRecalculated;
  }

  // Reload data hasil produksi dari API atau localStorage sebelum validasi
  await loadHasilProduksiData();

  // Ambil idProduksi string dan idBahan dari produksi
  const idProduksiString = produksiData.idProduksi;
  const idBahan = produksiData.idBahan || null;

  // Hitung total yang sudah dikemas (exclude yang sedang diedit)
  const totalDikemas = hasilProduksi
    .filter(
      (h) =>
        h.idProduksi === idProduksiString &&
        h.id !== parseInt(hasilProduksiId || 0)
    )
    .reduce((sum, h) => sum + (parseFloat(h.beratSaatIni) || 0), 0);

  const sisaTersedia = Math.max(0, beratAkhir - totalDikemas);

  // Validasi berat tidak melebihi sisa
  if (beratSaatIni > sisaTersedia) {
    const statusDiv = document.getElementById("idProduksiStatus");
    if (statusDiv) {
      statusDiv.innerHTML = `
        <div class="alert alert-warning mb-0">
          <i class="bi bi-exclamation-triangle"></i>
          Produksi yang belum dikemas tidak mencukupi!<br>
          <small>
            ID Produksi: <strong>${idProduksiString}</strong><br>
            Sisa tersedia: <strong>${sisaTersedia.toLocaleString(
              "id-ID"
            )} kg</strong><br>
            Berat diminta: <strong>${beratSaatIni.toLocaleString(
              "id-ID"
            )} kg</strong><br>
            Silakan kurangi berat atau pilih produksi lain.
          </small>
        </div>
      `;
      statusDiv.style.display = "block";
    }
    const beratInputField = document.getElementById("beratSaatIni");
    if (beratInputField) {
      beratInputField.focus();
    }
    return;
  }

  // Level roasting untuk Kopi Sangrai, Kopi Bubuk (required), dan Pixel (optional)
  let levelRoasting = "";
  const isPixel = tipeProdukLower.includes("pixel");
  const needsRoastingRequired =
    tipeProdukLower === "kopi sangrai" || tipeProdukLower === "kopi bubuk";
  const needsRoastingOptional = isPixel;

  if (needsRoastingRequired || needsRoastingOptional) {
    levelRoasting = document.getElementById("levelRoasting").value || "";

    // Validasi: Level roasting WAJIB untuk Kopi Sangrai dan Kopi Bubuk
    // Tapi OPTIONAL untuk Pixel
    if (needsRoastingRequired && !levelRoasting) {
      alert("Level Roasting harus diisi untuk " + tipeProduk + "!");
      document.getElementById("levelRoasting").focus();
      return;
    }

    // Untuk Pixel, level roasting optional (bisa kosong)
    // Tidak perlu validasi tambahan
  }

  try {
    const prosesOpt = prosesSel?.options?.[prosesSel?.selectedIndex];
    let prosesPengolahanNama = (prosesOpt?.dataset?.namaProses || "").trim();
    let idProsesHasil =
      prosesRaw && /^\d+$/.test(String(prosesRaw).trim())
        ? parseInt(String(prosesRaw).trim(), 10)
        : null;
    if (!prosesPengolahanNama && produksiData?.prosesPengolahan) {
      prosesPengolahanNama = String(produksiData.prosesPengolahan).trim();
    }
    if (idProsesHasil == null && produksiData?.idProses != null) {
      idProsesHasil = Number(produksiData.idProses);
    }

    const hasilProduksiData = {
      idProduksi: idProduksiString,
      idBahan: idBahan,
      tipeProduk,
      kemasan,
      jenisKopi,
      prosesPengolahan:
        prosesPengolahanNama ||
        produksiData?.prosesPengolahan ||
        String(prosesRaw || ""),
      levelRoasting,
      tanggal,
      beratSaatIni,
      jumlah,
    };
    if (idProsesHasil != null && !Number.isNaN(idProsesHasil)) {
      hasilProduksiData.idProses = idProsesHasil;
    }

    // VERIFY API AVAILABILITY - NO FALLBACK
    if (!window.API || !window.API.HasilProduksi) {
      const errorMsg =
        "❌ API.HasilProduksi tidak tersedia. Tidak dapat menyimpan data. Pastikan backend MongoDB aktif.";
      console.error(errorMsg);
      alert(errorMsg);
      throw new Error(errorMsg);
    }

    if (hasilProduksiId) {
      // Edit mode - Update via API (MongoDB ONLY)
      console.log("🔄 Updating hasil produksi via API:", hasilProduksiId);
      await window.API.HasilProduksi.update(hasilProduksiId, hasilProduksiData);
      console.log("✅ Hasil Produksi updated in MongoDB");
    } else {
      // Add mode - Create via API (MongoDB ONLY)
      // NOTE: Backend will generate ID automatically via get_next_id('hasilProduksi')
      console.log(
        "🔄 Creating hasil produksi via API (backend will generate ID)"
      );
      const result = await window.API.HasilProduksi.create(hasilProduksiData);
      console.log("✅ Hasil Produksi created in MongoDB:", result);
    }

    // Reload data setelah save
    await loadHasilProduksiData();

    await displayHasilProduksi();

    // Trigger update stok jika halaman stok terbuka
    try {
      window.dispatchEvent(new Event("hasilProduksiUpdated"));
    } catch (error) {
      console.error("Error saat trigger event hasilProduksiUpdated:", error);
    }

    // Trigger event untuk update dashboard
    try {
      window.dispatchEvent(
        new CustomEvent("dataUpdated", { detail: { type: "hasilProduksi" } })
      );
    } catch (error) {
      console.error("Error saat trigger event dataUpdated:", error);
    }

    // Tutup modal
    try {
      const modal = bootstrap.Modal.getInstance(
        document.getElementById("modalHasilProduksi")
      );
      if (modal) {
        modal.hide();
      }
    } catch (error) {
      console.error("Error saat menutup modal:", error);
    }

    // Reset form
    try {
      form.reset();
      currentEditId = null;
    } catch (error) {
      console.error("Error saat reset form:", error);
    }

    // Note: Removed auto-refresh karena data sudah di-reload via API
    console.log("✅ Data berhasil disimpan");
  } catch (error) {
    console.error("Error saving hasil produksi:", error);
    alert("Error menyimpan data: " + (error.message || "Unknown error"));
  }
}

// Fungsi untuk delete hasil produksi
// [CRUD → DELETE PREP] Menyimpan ID yang akan dihapus dan menampilkan modal
// konfirmasi kepada user.
async function deleteHasilProduksi(id) {
  try {
    await loadHasilProduksiData();
    const h = hasilProduksi.find((item) => item.id === id || item._id === id);
    if (!h) {
      alert("Data hasil produksi tidak ditemukan!");
      return;
    }

    currentDeleteId = id;
    document.getElementById(
      "deleteHasilProduksiInfo"
    ).textContent = `${h.tipeProduk} - ${h.kemasan} - ${h.tanggal}`;

    const modal = new bootstrap.Modal(document.getElementById("modalDelete"));
    modal.show();
  } catch (error) {
    console.error("Error loading hasil produksi for delete:", error);
    alert("Error memuat data hasil produksi");
  }
}

// Fungsi untuk konfirmasi delete
// [CRUD → DELETE EXECUTION] Menjalankan penghapusan hasil produksi yang
// terpilih, memperbarui API, dan memicu refresh tampilan.
async function confirmDelete() {
  if (currentDeleteId) {
    try {
      // VERIFY API AVAILABILITY - NO FALLBACK
      if (!window.API || !window.API.HasilProduksi) {
        const errorMsg =
          "❌ API.HasilProduksi tidak tersedia. Tidak dapat menghapus data. Pastikan backend MongoDB aktif.";
        alert(errorMsg);
        throw new Error(errorMsg);
      }

      // Delete via API (MongoDB ONLY)
      console.log("🔄 Deleting hasil produksi via API:", currentDeleteId);
      await window.API.HasilProduksi.delete(currentDeleteId);
      console.log("✅ Hasil Produksi deleted from MongoDB");

      // Reload data setelah delete
      await loadHasilProduksiData();
      await displayHasilProduksi();

      // Trigger update stok jika halaman stok terbuka
      window.dispatchEvent(new Event("hasilProduksiUpdated"));

      // Trigger event untuk update dashboard
      window.dispatchEvent(
        new CustomEvent("dataUpdated", { detail: { type: "hasilProduksi" } })
      );

      const modal = bootstrap.Modal.getInstance(
        document.getElementById("modalDelete")
      );
      modal.hide();
      currentDeleteId = null;
    } catch (error) {
      console.error("Error deleting hasil produksi:", error);
      alert("Error menghapus data: " + (error.message || "Unknown error"));
    }
  }
}

// Event listener untuk search
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM Content Loaded - Initializing hasil produksi page");

  // Delay sedikit untuk memastikan semua elemen tersedia (pattern sama dengan kelola_produksi dan kelola_bahan)
  setTimeout(async () => {
    try {
      // Load data dari API atau localStorage
      await loadHasilProduksiData();
      console.log(`Hasil produksi data loaded: ${hasilProduksi.length} items`);

      // Panggil displayHasilProduksi
      await displayHasilProduksi();

      // Load produksi options untuk dropdown
      await loadProduksiOptions();
      await loadProdukOptionsHasilProduksi();
      await loadJenisKopiOptionsHasilProduksi();
      await loadProsesPengolahanOptionsHasilProduksi();
      await loadLevelRoastingOptions();
    } catch (error) {
      console.error("Error initializing hasil produksi page:", error);
    }
  }, 100);

  // Event listener untuk update ketika data master berubah
  // Pattern ini sama dengan kelola_bahan.js dan kelola_produksi.js
  window.addEventListener("dataMasterUpdated", async (event) => {
    const dataType = event.detail ? event.detail.type : null;

    console.log("📦 Event dataMasterUpdated diterima:", {
      dataType,
      detail: event.detail,
    });

    // Reload semua options master data (konsisten dengan kelola_bahan dan kelola_produksi)
    loadProdukOptionsHasilProduksi();
    loadJenisKopiOptionsHasilProduksi();
    loadProsesPengolahanOptionsHasilProduksi();
    loadLevelRoastingOptions();

    // Jika data kemasan berubah, update kemasan options jika tipe produk sudah dipilih
    // Kemasan options berbeda karena harus di-filter berdasarkan tipe produk
    if (!dataType || dataType === "kemasan") {
      console.log(
        "📦 Data kemasan diupdate (dataMasterUpdated event) - update kemasan options"
      );

      // Update kemasan options jika tipe produk sudah dipilih
      const tipeProduk = document.getElementById("tipeProduk");
      if (tipeProduk && tipeProduk.value) {
        console.log(
          "📦 Tipe produk sudah dipilih, memanggil updateKemasanOptions()"
        );
        // Await karena updateKemasanOptions() sekarang async
        await updateKemasanOptions();
      } else {
        console.log(
          "📦 Tipe produk belum dipilih, kemasan options akan di-update saat user memilih tipe produk"
        );
      }
    }

    // Jika data produksi berubah, reload produksi options
    if (!dataType || dataType === "produksi") {
      console.log(
        "Data produksi diupdate (dataMasterUpdated event) - reload produksi options"
      );
      loadProduksiOptions();
    }
  });

  // Event listener untuk update produksi options saat data berubah
  window.addEventListener("dataUpdated", (event) => {
    const dataType = event.detail ? event.detail.type : null;

    console.log("Event dataUpdated diterima:", {
      dataType,
      detail: event.detail,
    });

    // Jika data produksi berubah, reload produksi options
    if (!dataType || dataType === "produksi") {
      console.log(
        "Data produksi diupdate (dataUpdated event) - reload produksi options"
      );
      // Reload options (tidak perlu cek modal, langsung reload untuk sinkronisasi)
      loadProduksiOptions();

      // Juga reload jika modal sedang terbuka
      const modalHasilProduksi = document.getElementById("modalHasilProduksi");
      if (modalHasilProduksi && modalHasilProduksi.classList.contains("show")) {
        console.log("Modal sedang terbuka - reload dropdown ID Produksi");
        setTimeout(() => {
          loadProduksiOptions();
        }, 200);
      }
    }
  });

  // Event listener untuk modal show (Bootstrap 5 event)
  // Pattern ini disederhanakan untuk konsistensi dengan kelola_produksi dan kelola_bahan
  const modalHasilProduksi = document.getElementById("modalHasilProduksi");
  if (modalHasilProduksi) {
    // Event saat modal akan ditampilkan (sebelum modal ditampilkan)
    // Hanya gunakan show.bs.modal seperti di kelola_produksi dan kelola_bahan
    // Event listener untuk modal show (pattern sama dengan kelola_bahan.js dan kelola_produksi.js)
    modalHasilProduksi.addEventListener("show.bs.modal", async () => {
      console.log(
        "📋 Modal show.bs.modal event triggered - loading all options"
      );

      // Load semua options saat modal dibuka (konsisten dengan kelola_bahan dan kelola_produksi)
      await loadProduksiOptions();
      await loadProdukOptionsHasilProduksi();
      await loadJenisKopiOptionsHasilProduksi();
      await loadProsesPengolahanOptionsHasilProduksi();
      await loadLevelRoastingOptions();

      // Reset kemasan options ke default (karena kemasan harus di-filter berdasarkan tipe produk)
      const kemasanSelect = document.getElementById("kemasan");
      if (kemasanSelect) {
        kemasanSelect.innerHTML = '<option value="">Pilih Kemasan</option>';
      }

      // Update kemasan options jika tipe produk sudah dipilih (untuk edit mode)
      // Ini berbeda dengan options lainnya karena kemasan harus di-filter berdasarkan tipe produk
      const tipeProduk = document.getElementById("tipeProduk");
      if (tipeProduk && tipeProduk.value) {
        console.log(
          "📋 Tipe produk sudah dipilih saat modal dibuka, memanggil updateKemasanOptions()"
        );
        // Await karena updateKemasanOptions() sekarang async
        await updateKemasanOptions();
      } else {
        console.log(
          "📋 Tipe produk belum dipilih, kemasan options akan di-update saat user memilih tipe produk"
        );
      }
    });
  } else {
    console.error("Modal modalHasilProduksi tidak ditemukan!");
  }

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", displayHasilProduksi);
  }

  // Event listener untuk form search
  const searchForm = document.querySelector('form[role="search"]');
  if (searchForm) {
    searchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      displayHasilProduksi();
    });
  }

  // Set tanggal default ke hari ini
  const tanggalInput = document.getElementById("tanggal");
  if (tanggalInput) {
    const today = new Date().toISOString().split("T")[0];
    tanggalInput.value = today;
  }

  // Test function untuk debugging - bisa dipanggil dari console
  // [DEBUG TOOL → KEMASAN] Utility untuk mengecek isi localStorage, hasil
  // parsing, serta output filtering kemasan langsung dari console browser.
  window.testKemasan = function () {
    console.log("=== TEST KEMASAN ===");
    const dataKemasanStr = localStorage.getItem("dataKemasan");
    console.log(
      "1. Data kemasan di localStorage:",
      dataKemasanStr ? "Ada" : "Tidak ada"
    );

    if (dataKemasanStr) {
      try {
        const dataKemasan = JSON.parse(dataKemasanStr);
        console.log("2. Data kemasan yang di-parse:", dataKemasan);
        console.log("3. Jumlah data kemasan:", dataKemasan.length);
        console.log(
          "4. Format data:",
          Array.isArray(dataKemasan) ? "Array" : "Bukan array"
        );

        if (Array.isArray(dataKemasan) && dataKemasan.length > 0) {
          console.log("5. Contoh item pertama:", dataKemasan[0]);
          console.log("6. Property item pertama:", Object.keys(dataKemasan[0]));
          console.log("6a. Item pertama.ukuran:", dataKemasan[0].ukuran);
        }

        console.log("7. Memanggil loadKemasanOptionsHasilProduksi()...");
        const allKemasan = loadKemasanOptionsHasilProduksi();
        console.log("8. Ukuran kemasan yang di-extract:", allKemasan);
        console.log("9. Jumlah ukuran kemasan:", allKemasan.length);
        console.log("9a. Apakah array kosong?", allKemasan.length === 0);

        const tipeProduk = document.getElementById("tipeProduk");
        const kemasan = document.getElementById("kemasan");
        console.log(
          "10. Element tipeProduk:",
          tipeProduk ? "Ada" : "Tidak ada"
        );
        console.log("11. Element kemasan:", kemasan ? "Ada" : "Tidak ada");

        if (tipeProduk) {
          console.log(
            "12. Tipe produk yang dipilih:",
            tipeProduk.value || "(belum dipilih)"
          );
        }

        if (kemasan) {
          console.log(
            "13. Jumlah options di dropdown kemasan:",
            kemasan.options.length
          );
          console.log(
            "14. Options di dropdown kemasan:",
            Array.from(kemasan.options).map((o) => o.text)
          );
        }

        // Test filter
        if (allKemasan.length > 0) {
          console.log("15. Testing filter...");
          const testGram = allKemasan.filter((k) =>
            k.toLowerCase().includes("gram")
          );
          const testKg = allKemasan.filter((k) =>
            k.toLowerCase().includes("kg")
          );
          console.log("15a. Kemasan dengan 'gram':", testGram);
          console.log("15b. Kemasan dengan 'kg':", testKg);
        }
      } catch (e) {
        console.error("Error parsing data kemasan:", e);
        console.error("Error stack:", e.stack);
      }
    } else {
      console.warn("⚠️ Data kemasan tidak ada di localStorage!");
      console.warn(
        "⚠️ Coba buka halaman 'Kelola Data' dan pastikan ada data kemasan"
      );
    }
    console.log("=== END TEST ===");
  };

  console.log(
    "✅ Test function tersedia: window.testKemasan() - panggil dari console untuk test"
  );
});
