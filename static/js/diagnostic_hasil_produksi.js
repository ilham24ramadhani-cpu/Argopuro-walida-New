// Script diagnostik untuk memeriksa masalah ID Produksi tidak muncul di dropdown
// Jalankan script ini di Console browser untuk diagnosa lengkap

async function diagnosticHasilProduksi() {
  console.log("=== DIAGNOSTIK HASIL PRODUKSI ===");
  console.log("");

  // 1. Cek localStorage dan API
  console.log("1. CEK DATA SOURCE");
  console.log(
    "   localStorage tersedia:",
    typeof Storage !== "undefined" ? "✅ Ya" : "❌ Tidak"
  );
  console.log("   API tersedia:", window.API ? "✅ Ya" : "❌ Tidak");

  // Load data dari API atau localStorage
  let produksi = [];
  let hasilProduksi = [];

  try {
    if (window.API && window.API.Produksi) {
      produksi = await window.API.Produksi.getAll();
      console.log(
        "   ✅ Data produksi dimuat dari API:",
        produksi.length,
        "items"
      );
    } else {
      const produksiStr = localStorage.getItem("produksi");
      produksi = produksiStr ? JSON.parse(produksiStr) : [];
      console.log(
        "   ✅ Data produksi dimuat dari localStorage:",
        produksi.length,
        "items"
      );
    }

    if (window.API && window.API.HasilProduksi) {
      hasilProduksi = await window.API.HasilProduksi.getAll();
      console.log(
        "   ✅ Data hasilProduksi dimuat dari API:",
        hasilProduksi.length,
        "items"
      );
    } else {
      const hasilProduksiStr = localStorage.getItem("hasilProduksi");
      hasilProduksi = hasilProduksiStr ? JSON.parse(hasilProduksiStr) : [];
      console.log(
        "   ✅ Data hasilProduksi dimuat dari localStorage:",
        hasilProduksi.length,
        "items"
      );
    }
  } catch (e) {
    console.error("   ❌ Error loading data:", e);
    return;
  }

  if (produksi.length === 0) {
    console.error("   ❌ TIDAK ADA DATA PRODUKSI!");
    console.log(
      "   Solusi: Buat data produksi terlebih dahulu di halaman Kelola Produksi"
    );
    return;
  }

  console.log(`   Total produksi: ${produksi.length}`);
  console.log(`   Total hasilProduksi: ${hasilProduksi.length}`);
  console.log("");

  // 3. Cek struktur data produksi
  console.log("2. CEK STRUKTUR DATA PRODUKSI");
  if (produksi.length > 0) {
    const sample = produksi[0];
    console.log("   Contoh data produksi:", sample);
    console.log("");

    console.log("   Field yang diperlukan:");
    console.log("   - id:", sample.id !== undefined ? "✅" : "❌", sample.id);
    console.log(
      "   - idProduksi:",
      sample.idProduksi !== undefined ? "✅" : "❌",
      sample.idProduksi
    );
    console.log(
      "   - statusTahapan:",
      sample.statusTahapan !== undefined ? "✅" : "❌",
      sample.statusTahapan
    );
    console.log(
      "   - beratAkhir:",
      sample.beratAkhir !== undefined ? "✅" : "❌",
      sample.beratAkhir
    );
    console.log(
      "   - idBahan:",
      sample.idBahan !== undefined ? "✅" : "❌",
      sample.idBahan
    );
    console.log("");
  } else {
    console.log("   ❌ Tidak ada data produksi!");
    console.log(
      "   Solusi: Buat data produksi terlebih dahulu di halaman Kelola Produksi"
    );
    return;
  }

  // 4. Cek filter status Pengemasan
  console.log("3. CEK FILTER STATUS PENGEMASAN");
  console.log("   Semua produksi:");
  produksi.forEach((p, i) => {
    const status = (p.statusTahapan || "").toString().trim();
    const beratAkhir = parseFloat(p.beratAkhir) || 0;
    const idProduksi = (p.idProduksi || "").toString().trim();

    const hasStatus = status === "Pengemasan" || status.includes("Pengemasan");
    const hasBerat = beratAkhir > 0;
    const hasId =
      idProduksi !== "" && idProduksi !== "undefined" && idProduksi !== "null";

    const valid = hasStatus && hasBerat && hasId;

    console.log(
      `   ${i + 1}. ID: ${
        p.id
      }, ID Produksi: "${idProduksi}", Status: "${status}", Berat Akhir: ${beratAkhir} kg`
    );
    console.log(
      `      hasStatus: ${hasStatus ? "✅" : "❌"}, hasBerat: ${
        hasBerat ? "✅" : "❌"
      }, hasId: ${hasId ? "✅" : "❌"}, VALID: ${valid ? "✅" : "❌"}`
    );
  });
  console.log("");

  // 5. Cek produksi yang memenuhi syarat
  console.log("4. PRODUKSI YANG MEMENUHI SYARAT");
  const produksiValid = produksi.filter((p) => {
    const status = (p.statusTahapan || "").toString().trim();
    const beratAkhir = parseFloat(p.beratAkhir) || 0;
    const idProduksi = (p.idProduksi || "").toString().trim();

    const hasStatus = status === "Pengemasan" || status.includes("Pengemasan");
    const hasBerat = beratAkhir > 0;
    const hasId =
      idProduksi !== "" && idProduksi !== "undefined" && idProduksi !== "null";

    return hasStatus && hasBerat && hasId;
  });

  console.log(`   Total produksi yang valid: ${produksiValid.length}`);
  if (produksiValid.length > 0) {
    produksiValid.forEach((p, i) => {
      console.log(
        `   ${i + 1}. ${p.idProduksi} - Status: ${
          p.statusTahapan
        } - Berat Akhir: ${p.beratAkhir} kg`
      );
    });
  } else {
    console.warn("   ❌ TIDAK ADA PRODUKSI YANG MEMENUHI SYARAT!");
    console.log("");
    console.log("   Syarat yang harus dipenuhi:");
    console.log(
      "   1. statusTahapan harus 'Pengemasan' atau mengandung 'Pengemasan'"
    );
    console.log("   2. beratAkhir harus > 0");
    console.log("   3. idProduksi harus ada dan tidak kosong");
    console.log("");
    console.log("   Solusi:");
    console.log("   - Edit produksi di halaman Kelola Produksi");
    console.log("   - Pilih status tahapan 'Pengemasan'");
    console.log("   - Isi berat akhir (wajib jika status Pengemasan)");
    console.log("   - Pastikan ID Produksi sudah diisi");
  }
  console.log("");

  // 6. Cek dropdown element
  console.log("5. CEK DROPDOWN ELEMENT");
  const idProduksiSelect = document.getElementById("idProduksi");
  console.log(
    "   Element dropdown ditemukan:",
    idProduksiSelect ? "✅ Ya" : "❌ Tidak"
  );

  if (idProduksiSelect) {
    console.log("   Tag name:", idProduksiSelect.tagName);
    console.log("   Type:", idProduksiSelect.type || "N/A");
    console.log("   Total options:", idProduksiSelect.options.length);
    console.log("   Options di dropdown:");
    for (let i = 0; i < idProduksiSelect.options.length; i++) {
      const opt = idProduksiSelect.options[i];
      console.log(`      ${i + 1}. Value: "${opt.value}", Text: "${opt.text}"`);
    }
  } else {
    console.error("   ❌ DROPDOWN TIDAK DITEMUKAN!");
    console.log("   Pastikan Anda membuka modal 'Tambah Hasil Produksi'");
    console.log("   Element ID yang dicari: 'idProduksi'");
  }
  console.log("");

  // 7. Cek fungsi loadProduksiOptions
  console.log("6. CEK FUNGSI loadProduksiOptions");
  if (typeof loadProduksiOptions === "function") {
    console.log("   ✅ Fungsi loadProduksiOptions tersedia");
    console.log("   Memanggil fungsi...");
    try {
      loadProduksiOptions();
      console.log("   ✅ Fungsi berhasil dipanggil");

      // Cek lagi dropdown setelah dipanggil
      setTimeout(() => {
        const idProduksiSelect2 = document.getElementById("idProduksi");
        if (idProduksiSelect2) {
          console.log(
            "   Total options setelah dipanggil:",
            idProduksiSelect2.options.length
          );
        }
      }, 500);
    } catch (e) {
      console.error("   ❌ Error saat memanggil fungsi:", e);
    }
  } else {
    console.error("   ❌ Fungsi loadProduksiOptions tidak ditemukan!");
    console.log("   Pastikan script kelola_hasil_produksi.js sudah dimuat");
  }
  console.log("");

  // 8. Cek modal
  console.log("7. CEK MODAL");
  const modal = document.getElementById("modalHasilProduksi");
  console.log("   Modal ditemukan:", modal ? "✅ Ya" : "❌ Tidak");

  if (modal) {
    const isVisible = modal.classList.contains("show");
    console.log("   Modal sedang terlihat:", isVisible ? "✅ Ya" : "❌ Tidak");

    if (!isVisible) {
      console.log(
        "   💡 Modal tidak terlihat. Buka modal terlebih dahulu dengan klik tombol 'Tambah Hasil Produksi'"
      );
    }
  }
  console.log("");

  // 9. Kesimpulan
  console.log("=== KESIMPULAN ===");
  if (produksiValid.length > 0) {
    if (idProduksiSelect && idProduksiSelect.options.length > 1) {
      console.log("✅ Semuanya berfungsi dengan baik!");
      console.log(`   Ada ${produksiValid.length} produksi yang valid`);
      console.log(
        `   Dropdown memiliki ${idProduksiSelect.options.length} options`
      );
    } else {
      console.warn("⚠️ Ada produksi yang valid, tapi dropdown tidak terisi");
      console.log("   Kemungkinan masalah:");
      console.log("   1. Fungsi loadProduksiOptions() tidak dipanggil");
      console.log("   2. Modal belum dibuka");
      console.log("   3. Ada error di fungsi loadProduksiOptions()");
      console.log("");
      console.log("   Solusi:");
      console.log("   - Buka modal 'Tambah Hasil Produksi'");
      console.log("   - Cek Console untuk error");
      console.log("   - Coba klik tombol 'Cek ID Produksi'");
    }
  } else {
    console.error("❌ TIDAK ADA PRODUKSI YANG VALID!");
    console.log("   Solusi:");
    console.log("   1. Buka halaman Kelola Produksi");
    console.log("   2. Edit atau tambah produksi");
    console.log("   3. Pilih status tahapan 'Pengemasan'");
    console.log("   4. Isi berat akhir (wajib untuk status Pengemasan)");
    console.log("   5. Simpan data");
    console.log("   6. Kembali ke halaman Kelola Hasil Produksi");
  }
  console.log("");
  console.log("=== SELESAI DIAGNOSTIK ===");
}

// Auto-run saat script dimuat (untuk testing)
// diagnosticHasilProduksi();
