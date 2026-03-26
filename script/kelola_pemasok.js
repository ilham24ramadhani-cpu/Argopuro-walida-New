// Data pemasok (menggunakan API Service dengan fallback ke localStorage)
let pemasok = [];
let currentEditId = null;
let currentDeleteId = null;

// Load data pemasok dari API atau localStorage
async function loadPemasokData() {
  try {
    if (window.API && window.API.Pemasok) {
      pemasok = await window.API.Pemasok.getAll();
    } else {
      // Fallback ke localStorage jika API belum tersedia
      pemasok = JSON.parse(localStorage.getItem("pemasok") || "[]");

      // Inisialisasi data contoh jika kosong
      if (pemasok.length === 0 && !localStorage.getItem("pemasok")) {
        pemasok = [
          {
            id: 1,
            idPemasok: "PMSK001",
            nama: "Pemasok Utama A",
            alamat: "Jl. Perkebunan No. 123, Jember",
            kontak: "081234567890",
            namaPerkebunan: "Perkebunan Kopi Jember",
            status: "Utama",
          },
          {
            id: 2,
            idPemasok: "PMSK002",
            nama: "Pemasok Utama B",
            alamat: "Jl. Kopi Raya No. 456, Malang",
            kontak: "082345678901",
            namaPerkebunan: "Kebun Kopi Malang",
            status: "Utama",
          },
          {
            id: 3,
            idPemasok: "PMSK003",
            nama: "Pemasok Cadangan C",
            alamat: "Jl. Tanah Kopi No. 789, Banyuwangi",
            kontak: "083456789012",
            namaPerkebunan: "Perkebunan Banyuwangi",
            status: "Cadangan",
          },
        ];
        localStorage.setItem("pemasok", JSON.stringify(pemasok));
      }
    }
  } catch (error) {
    console.error("Error loading pemasok:", error);
    pemasok = JSON.parse(localStorage.getItem("pemasok") || "[]");
  }
}

// Fungsi untuk menampilkan data pemasok
async function displayPemasok() {
  try {
    await loadPemasokData();
  } catch (error) {
    console.error("Error loading pemasok:", error);
    pemasok = [];
  }
  const tableBody = document.getElementById("tableBody");
  const searchInput = document.getElementById("searchInput");
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";

  // Filter data berdasarkan search
  let filteredPemasok = pemasok;
  if (searchTerm) {
    filteredPemasok = pemasok.filter(
      (p) =>
        p.idPemasok.toLowerCase().includes(searchTerm) ||
        p.nama.toLowerCase().includes(searchTerm) ||
        p.alamat.toLowerCase().includes(searchTerm) ||
        p.namaPerkebunan.toLowerCase().includes(searchTerm) ||
        p.status.toLowerCase().includes(searchTerm)
    );
  }

  if (filteredPemasok.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-4 text-muted">
          <i class="bi bi-inbox fs-1 d-block mb-2"></i>
          Tidak ada data pemasok
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filteredPemasok
    .map(
      (p, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${p.idPemasok}</td>
      <td>${p.nama}</td>
      <td>${p.alamat}</td>
      <td>${p.kontak}</td>
      <td>${p.namaPerkebunan}</td>
      <td>
        <span class="badge bg-${
          p.status === "Utama" ? "primary" : "secondary"
        }">
          ${p.status}
        </span>
      </td>
      <td class="text-center">
        <button 
          class="btn btn-sm btn-warning btn-action" 
          onclick="editPemasok(${p.id || p._id || `'${p._id}'`})"
          title="Edit">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button 
          class="btn btn-sm btn-danger btn-action" 
          onclick="deletePemasok(${p.id || p._id || `'${p._id}'`})"
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
function openModal(mode = "add") {
  currentEditId = null;
  const modal = document.getElementById("modalPemasok");
  const modalLabel = document.getElementById("modalPemasokLabel");
  const form = document.getElementById("formPemasok");

  if (mode === "add") {
    modalLabel.textContent = "Tambah Pemasok";
    form.reset();
    document.getElementById("pemasokId").value = "";
  } else {
    modalLabel.textContent = "Edit Pemasok";
  }
}

// Fungsi untuk edit pemasok
async function editPemasok(id) {
  try {
    await loadPemasokData();
    const p = pemasok.find((item) => item.id === id || item._id === id);
    if (!p) {
      alert("Data pemasok tidak ditemukan!");
      return;
    }

    currentEditId = id;
    document.getElementById("pemasokId").value = p.id || p._id;
    document.getElementById("idPemasok").value = p.idPemasok;
    document.getElementById("nama").value = p.nama;
    document.getElementById("alamat").value = p.alamat;
    document.getElementById("kontak").value = p.kontak;
    document.getElementById("namaPerkebunan").value = p.namaPerkebunan;
    document.getElementById("status").value = p.status;

    const modal = new bootstrap.Modal(document.getElementById("modalPemasok"));
    modal.show();
    openModal("edit");
  } catch (error) {
    console.error("Error loading pemasok for edit:", error);
    alert("Error memuat data pemasok");
  }
}

// Fungsi untuk menyimpan pemasok (tambah/edit)
async function savePemasok() {
  const form = document.getElementById("formPemasok");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const pemasokId = document.getElementById("pemasokId").value;
  const idPemasok = document.getElementById("idPemasok").value;
  const nama = document.getElementById("nama").value;
  const alamat = document.getElementById("alamat").value;
  const kontak = document.getElementById("kontak").value;
  const namaPerkebunan = document.getElementById("namaPerkebunan").value;
  const status = document.getElementById("status").value;

  // Reload data untuk validasi
  await loadPemasokData();

  // Validasi ID pemasok unik
  const existingPemasok = pemasok.find(
    (p) =>
      p.idPemasok === idPemasok &&
      p.id !== parseInt(pemasokId) &&
      p._id !== pemasokId
  );
  if (existingPemasok) {
    alert("ID Pemasok sudah digunakan!");
    return;
  }

  try {
    const pemasokData = {
      idPemasok,
      nama,
      alamat,
      kontak,
      namaPerkebunan,
      status,
    };

    if (pemasokId) {
      // Edit mode - Update via API
      if (window.API && window.API.Pemasok) {
        await window.API.Pemasok.update(pemasokId, pemasokData);
      } else {
        // Fallback to localStorage
        const index = pemasok.findIndex(
          (p) => p.id === parseInt(pemasokId) || p._id === pemasokId
        );
        if (index !== -1) {
          pemasok[index] = { ...pemasok[index], ...pemasokData };
          localStorage.setItem("pemasok", JSON.stringify(pemasok));
        }
      }
    } else {
      // Add mode - Create via API
      if (window.API && window.API.Pemasok) {
        await window.API.Pemasok.create(pemasokData);
      } else {
        // Fallback to localStorage
        const newId =
          pemasok.length > 0 ? Math.max(...pemasok.map((p) => p.id)) + 1 : 1;
        pemasok.push({ id: newId, ...pemasokData });
        localStorage.setItem("pemasok", JSON.stringify(pemasok));
      }
    }

    await loadPemasokData();
    await displayPemasok();

    // Trigger event untuk update dashboard dan laporan
    window.dispatchEvent(
      new CustomEvent("dataUpdated", { detail: { type: "pemasok" } })
    );

    // Tutup modal
    const modal = bootstrap.Modal.getInstance(
      document.getElementById("modalPemasok")
    );
    modal.hide();

    // Reset form
    form.reset();
    currentEditId = null;
  } catch (error) {
    console.error("Error saving pemasok:", error);
    alert("Error menyimpan data: " + (error.message || "Unknown error"));
  }
}

// Fungsi untuk delete pemasok
async function deletePemasok(id) {
  try {
    await loadPemasokData();
    const p = pemasok.find((item) => item.id === id || item._id === id);
    if (!p) {
      alert("Data pemasok tidak ditemukan!");
      return;
    }

    currentDeleteId = id;
    document.getElementById(
      "deletePemasokInfo"
    ).textContent = `${p.idPemasok} - ${p.nama}`;

    const modal = new bootstrap.Modal(document.getElementById("modalDelete"));
    modal.show();
  } catch (error) {
    console.error("Error loading pemasok for delete:", error);
    alert("Error memuat data pemasok");
  }
}

// Fungsi untuk konfirmasi delete
async function confirmDelete() {
  if (currentDeleteId) {
    try {
      // Delete via API
      if (window.API && window.API.Pemasok) {
        await window.API.Pemasok.delete(currentDeleteId);
      } else {
        // Fallback to localStorage
        pemasok = pemasok.filter(
          (p) => p.id !== currentDeleteId && p._id !== currentDeleteId
        );
        localStorage.setItem("pemasok", JSON.stringify(pemasok));
      }

      await loadPemasokData();
      await displayPemasok();

      // Trigger event untuk update dashboard dan laporan
      window.dispatchEvent(
        new CustomEvent("dataUpdated", { detail: { type: "pemasok" } })
      );

      const modal = bootstrap.Modal.getInstance(
        document.getElementById("modalDelete")
      );
      modal.hide();
      currentDeleteId = null;
    } catch (error) {
      console.error("Error deleting pemasok:", error);
      alert("Error menghapus data: " + (error.message || "Unknown error"));
    }
  }
}

// Event listener untuk search
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(async () => {
    try {
      await displayPemasok();
    } catch (error) {
      console.error("Error initializing pemasok page:", error);
    }
  }, 100);

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", async () => {
      await displayPemasok();
    });
  }

  // Event listener untuk form search
  const searchForm = document.querySelector('form[role="search"]');
  if (searchForm) {
    searchForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await displayPemasok();
    });
  }
});
