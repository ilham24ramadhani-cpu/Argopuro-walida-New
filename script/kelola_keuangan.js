// Data keuangan (menggunakan API Service dengan fallback ke localStorage)
let keuangan = [];
let currentEditId = null;
let currentDeleteId = null;

// Load data keuangan dari API atau localStorage
async function loadKeuanganData() {
  try {
    if (window.API && window.API.Keuangan) {
      keuangan = await window.API.Keuangan.getAll();
    } else {
      keuangan = JSON.parse(localStorage.getItem("keuangan") || "[]");
    }
  } catch (error) {
    console.error("Error loading keuangan:", error);
    keuangan = JSON.parse(localStorage.getItem("keuangan") || "[]");
  }
}

// Fungsi untuk load data bahan baku untuk dropdown
async function loadBahanBakuOptions() {
  try {
    let bahan = [];
    if (window.API && window.API.Bahan) {
      bahan = await window.API.Bahan.getAll();
    } else {
      bahan = JSON.parse(localStorage.getItem("bahan") || "[]");
    }
  const select = document.getElementById("idBahanBaku");
  if (select) {
    select.innerHTML = '<option value="">Pilih ID Bahan Baku</option>';
    bahan.forEach((b) => {
      const option = document.createElement("option");
      option.value = b.idBahan;
      option.textContent = `${b.idBahan} - ${b.pemasok} (Rp ${b.totalPengeluaran.toLocaleString("id-ID")})`;
      option.dataset.totalPengeluaran = b.totalPengeluaran;
      select.appendChild(option);
    });
  } catch (error) {
    console.error("Error loading bahan baku options:", error);
  }
}

// Fungsi untuk toggle field ID Bahan Baku berdasarkan jenis pengeluaran
async function toggleBahanBakuField() {
  const jenisPengeluaran = document.getElementById("jenisPengeluaran").value;
  const fieldIdBahanBaku = document.getElementById("fieldIdBahanBaku");
  const idBahanBaku = document.getElementById("idBahanBaku");
  const nilai = document.getElementById("nilai");
  const notes = document.getElementById("notes");
  const notesHelp = document.getElementById("notesHelp");

  if (jenisPengeluaran === "Pembelian Bahan Baku") {
    // Tampilkan field ID Bahan Baku
    fieldIdBahanBaku.style.display = "block";
    idBahanBaku.required = true;
    // Load options bahan baku
    await loadBahanBakuOptions();
    // Set nilai menjadi readonly dan kosongkan
    nilai.readOnly = true;
    nilai.value = "";
    // Notes wajib
    notes.required = true;
    notesHelp.textContent = "Wajib diisi";
  } else if (jenisPengeluaran === "Operasional") {
    // Sembunyikan field ID Bahan Baku
    fieldIdBahanBaku.style.display = "none";
    idBahanBaku.required = false;
    idBahanBaku.value = "";
    // Set nilai menjadi editable dan kosongkan
    nilai.readOnly = false;
    nilai.value = "";
    // Notes wajib
    notes.required = true;
    notesHelp.textContent = "Wajib diisi";
  } else {
    // Reset semua field
    fieldIdBahanBaku.style.display = "none";
    idBahanBaku.required = false;
    idBahanBaku.value = "";
    nilai.readOnly = false;
    nilai.value = "";
    notes.required = true;
    notesHelp.textContent = "Wajib diisi";
  }
}

// Fungsi untuk load nilai dari bahan baku yang dipilih
function loadNilaiFromBahan() {
  const jenisPengeluaran = document.getElementById("jenisPengeluaran").value;
  const idBahanBaku = document.getElementById("idBahanBaku");
  const nilai = document.getElementById("nilai");

  if (jenisPengeluaran === "Pembelian Bahan Baku" && idBahanBaku.value) {
    const selectedOption = idBahanBaku.options[idBahanBaku.selectedIndex];
    const totalPengeluaran = parseFloat(selectedOption.dataset.totalPengeluaran);
    if (!isNaN(totalPengeluaran)) {
      nilai.value = totalPengeluaran.toLocaleString("id-ID");
    }
  }
}

// Fungsi untuk format currency input
function formatCurrency(input) {
  // Hapus karakter non-digit
  let value = input.value.replace(/\D/g, "");
  // Format dengan separator ribuan
  if (value) {
    input.value = parseInt(value).toLocaleString("id-ID");
  } else {
    input.value = "";
  }
}

// Fungsi untuk parse currency value ke number
function parseCurrencyValue(value) {
  return parseInt(value.replace(/\D/g, "")) || 0;
}

// Fungsi untuk menampilkan data keuangan
async function displayKeuangan() {
  try {
    await loadKeuanganData();
  } catch (error) {
    console.error("Error loading keuangan:", error);
    keuangan = [];
  }
  
  const tableBody = document.getElementById("tableBody");
  const searchInput = document.getElementById("searchInput");
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";

  // Filter data berdasarkan search
  let filteredKeuangan = keuangan;
  if (searchTerm) {
    filteredKeuangan = keuangan.filter(
      (k) =>
        k.tanggal.toLowerCase().includes(searchTerm) ||
        k.jenisPengeluaran.toLowerCase().includes(searchTerm) ||
        (k.idBahanBaku && k.idBahanBaku.toLowerCase().includes(searchTerm)) ||
        (k.notes && k.notes.toLowerCase().includes(searchTerm))
    );
  }

  // Sort berdasarkan tanggal (terbaru dulu)
  filteredKeuangan.sort((a, b) => {
    return new Date(b.tanggal) - new Date(a.tanggal);
  });

  if (filteredKeuangan.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-4 text-muted">
          <i class="bi bi-inbox fs-1 d-block mb-2"></i>
          Tidak ada data pengeluaran
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filteredKeuangan
    .map(
      (k, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${new Date(k.tanggal).toLocaleDateString("id-ID")}</td>
      <td><span class="badge bg-${
        k.jenisPengeluaran === "Pembelian Bahan Baku" ? "info" : "warning"
      }">${k.jenisPengeluaran}</span></td>
      <td>${k.idBahanBaku || "-"}</td>
      <td>${k.notes || "-"}</td>
      <td class="text-end">Rp ${k.nilai.toLocaleString("id-ID")}</td>
      <td class="text-center">
        <button 
          class="btn btn-sm btn-warning btn-action" 
          onclick="editKeuangan(${k.id || k._id || `'${k._id}'`})"
          title="Edit">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button 
          class="btn btn-sm btn-danger btn-action" 
          onclick="deleteKeuangan(${k.id || k._id || `'${k._id}'`})"
          title="Hapus">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `
    )
    .join("");
}

// Fungsi untuk membuka modal tambah/edit
async function openModal(mode = "add") {
  currentEditId = null;
  const form = document.getElementById("formKeuangan");
  const modalTitle = document.getElementById("modalKeuanganLabel");
  const nilai = document.getElementById("nilai");

  form.reset();
  nilai.readOnly = false;

  if (mode === "add") {
    modalTitle.textContent = "Tambah Pengeluaran";
    // Set tanggal default ke hari ini
    const today = new Date().toISOString().split("T")[0];
    document.getElementById("tanggal").value = today;
    // Reset jenis pengeluaran
    document.getElementById("jenisPengeluaran").value = "";
    toggleBahanBakuField();
  } else {
    modalTitle.textContent = "Edit Pengeluaran";
  }

  // Load bahan baku options
  await loadBahanBakuOptions();
}

// Fungsi untuk edit keuangan
async function editKeuangan(id) {
  try {
    await loadKeuanganData();
    const k = keuangan.find((item) => item.id === id || item._id === id);
    if (!k) {
      alert("Data keuangan tidak ditemukan!");
      return;
    }

    currentEditId = id;
    document.getElementById("keuanganId").value = k.id || k._id;
  document.getElementById("tanggal").value = k.tanggal;
  document.getElementById("jenisPengeluaran").value = k.jenisPengeluaran;
  document.getElementById("notes").value = k.notes || "";
  document.getElementById("nilai").value = k.nilai.toLocaleString("id-ID");

  // Toggle field berdasarkan jenis pengeluaran
  toggleBahanBakuField();

  // Jika jenis pengeluaran adalah Pembelian Bahan Baku, set ID Bahan Baku
  if (k.jenisPengeluaran === "Pembelian Bahan Baku" && k.idBahanBaku) {
    // Tunggu sampai options ter-load
    setTimeout(() => {
      document.getElementById("idBahanBaku").value = k.idBahanBaku;
      loadNilaiFromBahan();
    }, 100);
  }

    const modal = new bootstrap.Modal(document.getElementById("modalKeuangan"));
    modal.show();
  } catch (error) {
    console.error("Error loading keuangan for edit:", error);
    alert("Error memuat data keuangan");
  }
}

// Fungsi untuk menyimpan keuangan (tambah/edit)
async function saveKeuangan() {
  const form = document.getElementById("formKeuangan");
  const jenisPengeluaran = document.getElementById("jenisPengeluaran").value;
  const notesInput = document.getElementById("notes");
  const notes = notesInput.value;

  // Validasi notes wajib untuk semua jenis pengeluaran
  if (!notes.trim()) {
    alert("Notes wajib diisi!");
    notesInput.focus();
    return;
  }

  // Validasi khusus untuk pembelian bahan baku (ID Bahan Baku wajib)
  if (jenisPengeluaran === "Pembelian Bahan Baku") {
    const idBahanBaku = document.getElementById("idBahanBaku").value;
    if (!idBahanBaku) {
      alert("ID Bahan Baku wajib dipilih!");
      return;
    }
  }

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const keuanganId = document.getElementById("keuanganId").value;
  const tanggal = document.getElementById("tanggal").value;
  const idBahanBaku =
    jenisPengeluaran === "Pembelian Bahan Baku"
      ? document.getElementById("idBahanBaku").value
      : null;
  const nilai = parseCurrencyValue(document.getElementById("nilai").value);

  if (nilai <= 0) {
    alert("Nilai harus lebih dari 0!");
    return;
  }

  try {
    const dataKeuangan = {
      tanggal,
      jenisPengeluaran,
      idBahanBaku,
      notes: notes.trim(),
      nilai,
    };

    if (keuanganId) {
      // Edit mode - Update via API
      if (window.API && window.API.Keuangan) {
        await window.API.Keuangan.update(keuanganId, dataKeuangan);
      } else {
        // Fallback to localStorage
        const index = keuangan.findIndex((k) => k.id === parseInt(keuanganId) || k._id === keuanganId);
        if (index !== -1) {
          keuangan[index] = { ...keuangan[index], ...dataKeuangan };
          localStorage.setItem("keuangan", JSON.stringify(keuangan));
        }
      }
    } else {
      // Add mode - Create via API
      if (window.API && window.API.Keuangan) {
        await window.API.Keuangan.create(dataKeuangan);
      } else {
        // Fallback to localStorage
        const newId = keuangan.length > 0 ? Math.max(...keuangan.map((k) => k.id)) + 1 : 1;
        keuangan.push({ id: newId, ...dataKeuangan });
        localStorage.setItem("keuangan", JSON.stringify(keuangan));
      }
    }

    await loadKeuanganData();
    await displayKeuangan();

    // Trigger event untuk update dashboard
    window.dispatchEvent(new CustomEvent("dataUpdated", { detail: { type: "keuangan" } }));

    // Tutup modal
    const modal = bootstrap.Modal.getInstance(document.getElementById("modalKeuangan"));
    modal.hide();

    // Reset form
    form.reset();
    currentEditId = null;
  } catch (error) {
    console.error("Error saving keuangan:", error);
    alert("Error menyimpan data: " + (error.message || "Unknown error"));
  }
}

// Fungsi untuk delete keuangan
async function deleteKeuangan(id) {
  try {
    await loadKeuanganData();
    const k = keuangan.find((item) => item.id === id || item._id === id);
    if (!k) {
      alert("Data keuangan tidak ditemukan!");
      return;
    }

    currentDeleteId = id;
    if (
      confirm(
        `Apakah Anda yakin ingin menghapus pengeluaran pada tanggal ${new Date(
          k.tanggal
        ).toLocaleDateString("id-ID")} sebesar Rp ${k.nilai.toLocaleString(
          "id-ID"
        )}?`
      )
    ) {
      // Delete via API
      if (window.API && window.API.Keuangan) {
        await window.API.Keuangan.delete(id);
      } else {
        // Fallback to localStorage
        keuangan = keuangan.filter((item) => item.id !== id && item._id !== id);
        localStorage.setItem("keuangan", JSON.stringify(keuangan));
      }

      await loadKeuanganData();
      await displayKeuangan();
      
      // Trigger event untuk update dashboard
      window.dispatchEvent(new CustomEvent("dataUpdated", { detail: { type: "keuangan" } }));
      
      currentDeleteId = null;
    }
  } catch (error) {
    console.error("Error deleting keuangan:", error);
    alert("Error menghapus data: " + (error.message || "Unknown error"));
  }
}

// Event listener untuk search
document.addEventListener("DOMContentLoaded", function () {
  setTimeout(async () => {
    try {
      await displayKeuangan();
    } catch (error) {
      console.error("Error initializing keuangan page:", error);
    }
  }, 100);

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", async () => {
      await displayKeuangan();
    });
  }

  // Event listener untuk modal show
  const modalKeuangan = document.getElementById("modalKeuangan");
  if (modalKeuangan) {
    modalKeuangan.addEventListener("show.bs.modal", async function () {
      await loadBahanBakuOptions();
    });
  }
});

