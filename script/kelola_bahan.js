// Data bahan (menggunakan API Service dengan fallback ke localStorage)
let bahan = [];
let currentEditId = null;
let currentDeleteId = null;

// Load data bahan dari API atau localStorage
async function loadBahanData() {
  try {
    if (window.API && window.API.Bahan) {
      bahan = await window.API.Bahan.getAll();
    } else {
      // Fallback ke localStorage jika API belum tersedia
      bahan = JSON.parse(localStorage.getItem("bahan") || "[]");

      // Inisialisasi data contoh jika kosong
      if (bahan.length === 0 && !localStorage.getItem("bahan")) {
        bahan = [
          {
            id: 1,
            idBahan: "BHN001",
            pemasok: "Pemasok Utama A",
            jumlah: 100,
            varietas: "Typica",
            hargaPerKg: 50000,
            totalPengeluaran: 5000000,
            jenisKopi: "Arabika",
            tanggalMasuk: "2024-01-15",
            kualitas: "Premium",
          },
          {
            id: 2,
            idBahan: "BHN002",
            pemasok: "Pemasok Utama B",
            jumlah: 150,
            varietas: "Caturra",
            hargaPerKg: 45000,
            totalPengeluaran: 6750000,
            jenisKopi: "Arabika",
            tanggalMasuk: "2024-01-20",
            kualitas: "Grade A",
          },
        ];
        localStorage.setItem("bahan", JSON.stringify(bahan));
      }
    }
  } catch (error) {
    console.error("Error loading bahan:", error);
    bahan = JSON.parse(localStorage.getItem("bahan") || "[]");
  }
}

// Load data pemasok untuk dropdown
async function loadPemasokOptions() {
  try {
    let pemasok = [];
    if (window.API && window.API.Pemasok) {
      pemasok = await window.API.Pemasok.getAll();
    } else {
      pemasok = JSON.parse(localStorage.getItem("pemasok") || "[]");
    }
    const select = document.getElementById("pemasok");
    if (select) {
      select.innerHTML = '<option value="">Pilih Pemasok</option>';
      pemasok.forEach((p) => {
        const option = document.createElement("option");
        option.value = p.nama;
        option.textContent = p.nama;
        select.appendChild(option);
      });
    }
  } catch (error) {
    console.error("Error loading pemasok options:", error);
  }
}

// Load data master dari Kelola Data
async function loadJenisKopiOptions() {
  try {
    let dataJenisKopi = [];
    if (
      window.API &&
      window.API.MasterData &&
      window.API.MasterData.jenisKopi
    ) {
      dataJenisKopi = await window.API.MasterData.jenisKopi.getAll();
    } else {
      dataJenisKopi = JSON.parse(localStorage.getItem("dataJenisKopi") || "[]");
    }
    const select = document.getElementById("jenisKopi");
    if (select) {
      select.innerHTML = '<option value="">Pilih Jenis Kopi</option>';
      dataJenisKopi.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.nama;
        option.textContent = item.nama;
        select.appendChild(option);
      });
    }
  } catch (error) {
    console.error("Error loading jenis kopi options:", error);
  }
}

async function loadVarietasOptions() {
  try {
    let dataVarietas = [];
    if (window.API && window.API.MasterData && window.API.MasterData.varietas) {
      dataVarietas = await window.API.MasterData.varietas.getAll();
    } else {
      dataVarietas = JSON.parse(localStorage.getItem("dataVarietas") || "[]");
    }
    const varietasInput = document.getElementById("varietas");
    if (varietasInput) {
      // Jika menggunakan datalist, update datalist
      let datalist = document.getElementById("varietasList");
      if (!datalist) {
        datalist = document.createElement("datalist");
        datalist.id = "varietasList";
        varietasInput.setAttribute("list", "varietasList");
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

// Fungsi untuk menampilkan data bahan
async function displayBahan() {
  // Reload data bahan dari API atau localStorage untuk memastikan data terbaru
  try {
    await loadBahanData();
  } catch (e) {
    console.error("Error loading bahan:", e);
    bahan = [];
  }

  const tableBody = document.getElementById("tableBody");
  if (!tableBody) {
    console.error("Table body element not found!");
    return;
  }

  const searchInput = document.getElementById("searchInput");
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";

  // Filter data berdasarkan search
  let filteredBahan = bahan;
  if (searchTerm) {
    filteredBahan = bahan.filter(
      (b) =>
        (b.idBahan && b.idBahan.toLowerCase().includes(searchTerm)) ||
        (b.pemasok && b.pemasok.toLowerCase().includes(searchTerm)) ||
        (b.varietas && b.varietas.toLowerCase().includes(searchTerm)) ||
        (b.jenisKopi && b.jenisKopi.toLowerCase().includes(searchTerm)) ||
        (b.kualitas && b.kualitas.toLowerCase().includes(searchTerm))
    );
  }

  if (filteredBahan.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="11" class="text-center py-4 text-muted">
          <i class="bi bi-inbox fs-1 d-block mb-2"></i>
          Tidak ada data bahan
        </td>
      </tr>
    `;
    return;
  }

  try {
    tableBody.innerHTML = filteredBahan
      .map((b, index) => {
        // Pastikan semua field ada dengan nilai default
        const idBahan = b.idBahan || "-";
        const pemasok = b.pemasok || "-";
        const jumlah = b.jumlah || 0;
        const varietas = b.varietas || "-";
        const hargaPerKg = b.hargaPerKg || 0;
        const totalPengeluaran = b.totalPengeluaran || jumlah * hargaPerKg;
        const jenisKopi = b.jenisKopi || "-";
        const tanggalMasuk =
          b.tanggalMasuk || new Date().toISOString().split("T")[0];
        const kualitas = b.kualitas || "-";
        const id = b.id || index;

        return `
    <tr>
      <td>${index + 1}</td>
      <td>${idBahan}</td>
      <td>${pemasok}</td>
      <td>${jumlah.toLocaleString("id-ID")} kg</td>
      <td>${varietas}</td>
      <td>Rp ${hargaPerKg.toLocaleString("id-ID")}</td>
      <td>Rp ${totalPengeluaran.toLocaleString("id-ID")}</td>
      <td><span class="badge ${(window.getJenisKopiBadgeClass || (() => 'bg-secondary'))(jenisKopi)}">${jenisKopi}</span></td>
      <td>${new Date(tanggalMasuk).toLocaleDateString("id-ID")}</td>
      <td><span class="badge ${(window.getKualitasBadgeClass || (() => 'bg-secondary'))(kualitas)}">${kualitas}</span></td>
      <td class="text-center">
        <button 
          class="btn btn-sm btn-warning btn-action" 
          onclick="editBahan(${id})"
          title="Edit">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button 
          class="btn btn-sm btn-danger btn-action" 
          onclick="deleteBahan(${id})"
          title="Hapus">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `;
      })
      .join("");
  } catch (error) {
    console.error("Error rendering bahan table:", error);
    tableBody.innerHTML = `
      <tr>
        <td colspan="11" class="text-center py-4 text-danger">
          <i class="bi bi-exclamation-triangle fs-1 d-block mb-2"></i>
          Error menampilkan data: ${error.message}
        </td>
      </tr>
    `;
  }

  // Debug: log jumlah data yang ditampilkan
  console.log(`Displaying ${filteredBahan.length} bahan items`);
}

// Fungsi untuk membuka modal tambah/edit
function openModal(mode = "add") {
  currentEditId = null;
  const modal = document.getElementById("modalBahan");
  const modalLabel = document.getElementById("modalBahanLabel");
  const form = document.getElementById("formBahan");

  if (mode === "add") {
    modalLabel.textContent = "Tambah Bahan";
    form.reset();
    document.getElementById("bahanId").value = "";
    // Reset HACCP checklist
    document.getElementById("haccpBendaAsing").checked = false;
    document.getElementById("haccpHamaJamur").checked = false;
    document.getElementById("haccpKondisiBaik").checked = false;
    loadPemasokOptions();
    loadJenisKopiOptions();
    loadVarietasOptions();
  } else {
    modalLabel.textContent = "Edit Bahan";
    loadPemasokOptions();
    loadJenisKopiOptions();
    loadVarietasOptions();
  }

  // Setup auto calculate total pengeluaran
  setupAutoCalculate();
}

// Setup auto calculate total pengeluaran
function setupAutoCalculate() {
  const jumlah = document.getElementById("jumlah");
  const hargaPerKg = document.getElementById("hargaPerKg");
  const totalPengeluaran = document.getElementById("totalPengeluaran");

  function calculateTotal() {
    const jml = parseFloat(jumlah.value) || 0;
    const hrg = parseFloat(hargaPerKg.value) || 0;
    const total = jml * hrg;
    totalPengeluaran.value = total.toLocaleString("id-ID");
  }

  jumlah.addEventListener("input", calculateTotal);
  hargaPerKg.addEventListener("input", calculateTotal);
}

// Fungsi untuk edit bahan
async function editBahan(id) {
  try {
    // Reload data bahan dari API atau localStorage sebelum edit
    await loadBahanData();

    const b = bahan.find((item) => item.id === id || item._id === id);
    if (!b) {
      alert("Data bahan tidak ditemukan!");
      return;
    }

    currentEditId = id;
    document.getElementById("bahanId").value = b.id || b._id;
    document.getElementById("idBahan").value = b.idBahan;
    document.getElementById("pemasok").value = b.pemasok;
    document.getElementById("jumlah").value = b.jumlah;
    document.getElementById("varietas").value = b.varietas;
    document.getElementById("hargaPerKg").value = b.hargaPerKg;
    document.getElementById("jenisKopi").value = b.jenisKopi;
    document.getElementById("tanggalMasuk").value = b.tanggalMasuk;
    document.getElementById("kualitas").value = b.kualitas;
    document.getElementById("totalPengeluaran").value =
      b.totalPengeluaran.toLocaleString("id-ID");

    // Load HACCP checklist (jika ada)
    if (b.haccp) {
      document.getElementById("haccpBendaAsing").checked =
        b.haccp.bebasBendaAsing || false;
      document.getElementById("haccpHamaJamur").checked =
        b.haccp.bebasHamaJamur || false;
      document.getElementById("haccpKondisiBaik").checked =
        b.haccp.kondisiBaik || false;
    } else {
      // Reset jika tidak ada data HACCP
      document.getElementById("haccpBendaAsing").checked = false;
      document.getElementById("haccpHamaJamur").checked = false;
      document.getElementById("haccpKondisiBaik").checked = false;
    }

    loadPemasokOptions();
    loadJenisKopiOptions();
    loadVarietasOptions();
    setupAutoCalculate();

    const modal = new bootstrap.Modal(document.getElementById("modalBahan"));
    modal.show();
    openModal("edit");
  } catch (error) {
    console.error("Error loading bahan for edit:", error);
    alert("Error memuat data bahan");
  }
}

// Fungsi untuk menyimpan bahan (tambah/edit)
async function saveBahan() {
  const form = document.getElementById("formBahan");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  // Validasi HACCP Checklist
  const haccpBendaAsing = document.getElementById("haccpBendaAsing").checked;
  const haccpHamaJamur = document.getElementById("haccpHamaJamur").checked;
  const haccpKondisiBaik = document.getElementById("haccpKondisiBaik").checked;

  if (!haccpBendaAsing || !haccpHamaJamur || !haccpKondisiBaik) {
    alert("Semua checklist HACCP harus dicentang untuk dapat menyimpan data!");
    return;
  }

  const bahanId = document.getElementById("bahanId").value;
  const idBahan = document.getElementById("idBahan").value;
  const pemasok = document.getElementById("pemasok").value;
  const jumlah = parseFloat(document.getElementById("jumlah").value);
  const varietas = document.getElementById("varietas").value;
  const hargaPerKg = parseFloat(document.getElementById("hargaPerKg").value);
  const jenisKopi = document.getElementById("jenisKopi").value;
  const tanggalMasuk = document.getElementById("tanggalMasuk").value;
  const kualitas = document.getElementById("kualitas").value;
  const totalPengeluaran = jumlah * hargaPerKg;

  // Reload data bahan dari API atau localStorage untuk memastikan data terbaru
  await loadBahanData();

  // Validasi ID bahan unik
  const existingBahan = bahan.find(
    (b) =>
      b.idBahan === idBahan && b.id !== parseInt(bahanId) && b._id !== bahanId
  );
  if (existingBahan) {
    alert("ID Bahan sudah digunakan!");
    return;
  }

  // Data HACCP
  const haccp = {
    bebasBendaAsing: haccpBendaAsing,
    bebasHamaJamur: haccpHamaJamur,
    kondisiBaik: haccpKondisiBaik,
  };

  try {
    const bahanData = {
      idBahan,
      pemasok,
      jumlah,
      varietas,
      hargaPerKg,
      totalPengeluaran,
      jenisKopi,
      tanggalMasuk,
      kualitas,
      haccp,
    };

    if (bahanId) {
      // Edit mode - Update via API
      if (window.API && window.API.Bahan) {
        await window.API.Bahan.update(bahanId, bahanData);
      } else {
        // Fallback to localStorage
        const index = bahan.findIndex(
          (b) => b.id === parseInt(bahanId) || b._id === bahanId
        );
        if (index !== -1) {
          bahan[index] = { ...bahan[index], ...bahanData };
          localStorage.setItem("bahan", JSON.stringify(bahan));
        }
      }
    } else {
      // Add mode - Create via API
      if (window.API && window.API.Bahan) {
        await window.API.Bahan.create(bahanData);
      } else {
        // Fallback to localStorage
        const newId =
          bahan.length > 0 ? Math.max(...bahan.map((b) => b.id)) + 1 : 1;
        bahan.push({ id: newId, ...bahanData });
        localStorage.setItem("bahan", JSON.stringify(bahan));
      }
    }

    // Reload data setelah save
    await loadBahanData();

    // Refresh tampilan tabel
    await displayBahan();

    // Auto-update keuangan untuk pembelian bahan baku
    await updateKeuanganFromBahan(idBahan, totalPengeluaran, tanggalMasuk);

    // Trigger event untuk update dashboard dan laporan
    window.dispatchEvent(
      new CustomEvent("dataUpdated", { detail: { type: "bahan" } })
    );

    // Tutup modal
    const modal = bootstrap.Modal.getInstance(
      document.getElementById("modalBahan")
    );
    modal.hide();

    // Reset form
    form.reset();
    currentEditId = null;
  } catch (error) {
    console.error("Error saving bahan:", error);
    alert("Error menyimpan data: " + (error.message || "Unknown error"));
  }
}

// Fungsi untuk auto-update keuangan dari pembelian bahan baku
async function updateKeuanganFromBahan(idBahan, totalPengeluaran, tanggal) {
  try {
    const dataKeuangan = {
      tanggal: tanggal,
      jenisPengeluaran: "Pembelian Bahan Baku",
      idBahanBaku: idBahan,
      notes: null,
      nilai: totalPengeluaran,
    };

    if (window.API && window.API.Keuangan) {
      // Cari apakah sudah ada record keuangan untuk bahan ini
      const allKeuangan = await window.API.Keuangan.getAll();
      const existingKeuangan = allKeuangan.find(
        (k) =>
          k.idBahanBaku === idBahan &&
          k.jenisPengeluaran === "Pembelian Bahan Baku"
      );

      if (existingKeuangan) {
        // Update existing record
        await window.API.Keuangan.update(
          existingKeuangan.id || existingKeuangan._id,
          dataKeuangan
        );
      } else {
        // Create new record
        await window.API.Keuangan.create(dataKeuangan);
      }
    } else {
      // Fallback to localStorage
      let keuangan = JSON.parse(localStorage.getItem("keuangan") || "[]");
      const existingKeuangan = keuangan.find(
        (k) =>
          k.idBahanBaku === idBahan &&
          k.jenisPengeluaran === "Pembelian Bahan Baku"
      );

      if (existingKeuangan) {
        const index = keuangan.findIndex((k) => k.id === existingKeuangan.id);
        if (index !== -1) {
          keuangan[index] = { ...keuangan[index], ...dataKeuangan };
        }
      } else {
        const newId =
          keuangan.length > 0 ? Math.max(...keuangan.map((k) => k.id)) + 1 : 1;
        keuangan.push({ id: newId, ...dataKeuangan });
      }
      localStorage.setItem("keuangan", JSON.stringify(keuangan));
    }

    // Trigger event untuk update dashboard dan laporan
    window.dispatchEvent(
      new CustomEvent("dataUpdated", { detail: { type: "keuangan" } })
    );
  } catch (error) {
    console.error("Error updating keuangan from bahan:", error);
  }
}

// Fungsi untuk delete bahan
async function deleteBahan(id) {
  try {
    await loadBahanData();
    const b = bahan.find((item) => item.id === id || item._id === id);
    if (!b) {
      alert("Data bahan tidak ditemukan!");
      return;
    }

    currentDeleteId = id;
    document.getElementById(
      "deleteBahanInfo"
    ).textContent = `${b.idBahan} - ${b.pemasok}`;

    const modal = new bootstrap.Modal(document.getElementById("modalDelete"));
    modal.show();
  } catch (error) {
    console.error("Error loading bahan for delete:", error);
    alert("Error memuat data bahan");
  }
}

// Fungsi untuk konfirmasi delete
async function confirmDelete() {
  if (currentDeleteId) {
    try {
      // Simpan idBahan untuk hapus keuangan terkait
      const deletedBahan = bahan.find(
        (b) => b.id === currentDeleteId || b._id === currentDeleteId
      );

      // Delete via API
      if (window.API && window.API.Bahan) {
        await window.API.Bahan.delete(currentDeleteId);
      } else {
        // Fallback to localStorage
        bahan = bahan.filter(
          (b) => b.id !== currentDeleteId && b._id !== currentDeleteId
        );
        localStorage.setItem("bahan", JSON.stringify(bahan));
      }

      // Reload data setelah delete
      await loadBahanData();
      await displayBahan();

      // Hapus record keuangan yang terkait dengan bahan ini
      if (deletedBahan && deletedBahan.idBahan) {
        await deleteKeuanganFromBahan(deletedBahan.idBahan);
      }

      // Trigger event untuk update dashboard
      window.dispatchEvent(
        new CustomEvent("dataUpdated", { detail: { type: "bahan" } })
      );

      const modal = bootstrap.Modal.getInstance(
        document.getElementById("modalDelete")
      );
      modal.hide();
      currentDeleteId = null;
    } catch (error) {
      console.error("Error deleting bahan:", error);
      alert("Error menghapus data: " + (error.message || "Unknown error"));
    }
  }
}

// Fungsi untuk menghapus record keuangan terkait bahan baku
async function deleteKeuanganFromBahan(idBahan) {
  try {
    if (window.API && window.API.Keuangan) {
      const allKeuangan = await window.API.Keuangan.getAll();
      const keuanganToDelete = allKeuangan.filter(
        (k) =>
          k.idBahanBaku === idBahan &&
          k.jenisPengeluaran === "Pembelian Bahan Baku"
      );
      for (const k of keuanganToDelete) {
        await window.API.Keuangan.delete(k.id || k._id);
      }
    } else {
      // Fallback to localStorage
      let keuangan = JSON.parse(localStorage.getItem("keuangan") || "[]");
      keuangan = keuangan.filter(
        (k) =>
          !(
            k.idBahanBaku === idBahan &&
            k.jenisPengeluaran === "Pembelian Bahan Baku"
          )
      );
      localStorage.setItem("keuangan", JSON.stringify(keuangan));
    }

    // Trigger event untuk update dashboard dan laporan
    window.dispatchEvent(
      new CustomEvent("dataUpdated", { detail: { type: "keuangan" } })
    );
  } catch (error) {
    console.error("Error deleting keuangan from bahan:", error);
  }
}

// Event listener untuk search
document.addEventListener("DOMContentLoaded", () => {
  // Pastikan semua elemen DOM sudah tersedia sebelum memanggil fungsi
  console.log("DOM Content Loaded - Initializing bahan page");

  // Delay sedikit untuk memastikan semua elemen tersedia
  setTimeout(async () => {
    try {
      await loadBahanData();
      console.log(`Bahan data loaded: ${bahan.length} items`);

      await displayBahan();
      await loadPemasokOptions();
      await loadJenisKopiOptions();
      await loadVarietasOptions();
    } catch (error) {
      console.error("Error initializing bahan page:", error);
    }
  }, 100);

  // Event listener untuk update ketika data master berubah
  window.addEventListener("dataMasterUpdated", () => {
    loadJenisKopiOptions();
    loadVarietasOptions();
  });

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", displayBahan);
  }

  // Event listener untuk form search
  const searchForm = document.querySelector('form[role="search"]');
  if (searchForm) {
    searchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      displayBahan();
    });
  }

  // Load options saat modal dibuka
  const modalBahan = document.getElementById("modalBahan");
  if (modalBahan) {
    modalBahan.addEventListener("show.bs.modal", () => {
      loadPemasokOptions();
      loadJenisKopiOptions();
      loadVarietasOptions();
    });
  }
});
