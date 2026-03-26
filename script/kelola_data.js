// Data master untuk setiap jenis data (menggunakan API Service dengan fallback ke localStorage)
let dataProduk = [];
let dataProses = [];
let dataJenisKopi = [];
let dataVarietas = [];
let dataRoasting = [];
let dataKemasan = [];

let currentEditId = null;
let currentDeleteId = null;
let currentDeleteType = null; // 'produk', 'proses', 'jenisKopi', 'varietas', 'roasting', 'kemasan'

// Helper function untuk load master data dari API atau localStorage
async function loadMasterData(type) {
  try {
    const apiMap = {
      produk: window.API?.MasterData?.produk,
      proses: window.API?.MasterData?.proses,
      jenisKopi: window.API?.MasterData?.jenisKopi,
      varietas: window.API?.MasterData?.varietas,
      roasting: window.API?.MasterData?.roasting,
      kemasan: window.API?.MasterData?.kemasan,
    };

    const storageMap = {
      produk: "dataProduk",
      proses: "dataProses",
      jenisKopi: "dataJenisKopi",
      varietas: "dataVarietas",
      roasting: "dataRoasting",
      kemasan: "dataKemasan",
    };

    const api = apiMap[type];
    const storageKey = storageMap[type];

    if (api) {
      return await api.getAll();
    } else {
      return JSON.parse(localStorage.getItem(storageKey) || "[]");
    }
  } catch (error) {
    console.error(`Error loading ${type}:`, error);
    const storageMap = {
      produk: "dataProduk",
      proses: "dataProses",
      jenisKopi: "dataJenisKopi",
      varietas: "dataVarietas",
      roasting: "dataRoasting",
      kemasan: "dataKemasan",
    };
    return JSON.parse(localStorage.getItem(storageMap[type]) || "[]");
  }
}

// Load all master data
async function loadAllMasterData() {
  dataProduk = await loadMasterData("produk");
  dataProses = await loadMasterData("proses");
  dataJenisKopi = await loadMasterData("jenisKopi");
  dataVarietas = await loadMasterData("varietas");
  dataRoasting = await loadMasterData("roasting");
  dataKemasan = await loadMasterData("kemasan");
}

// Inisialisasi data default hanya jika localStorage benar-benar null (belum pernah dibuat)
// Pattern ini sama dengan kelola_produksi.js untuk konsistensi
function initializeDefaultData() {
  if (!localStorage.getItem("dataProduk")) {
    dataProduk = [
      { id: 1, nama: "Green Beans" },
      { id: 2, nama: "Kopi Sangrai" },
      { id: 3, nama: "Kopi Bubuk" },
    ];
    localStorage.setItem("dataProduk", JSON.stringify(dataProduk));
  }

  if (!localStorage.getItem("dataProses")) {
    dataProses = [
      { id: 1, nama: "Natural Process", waktuProses: 20 },
      { id: 2, nama: "Washed Process", waktuProses: 15 },
      { id: 3, nama: "Semi-Washed (Wet Hulled) Process", waktuProses: 12 },
      { id: 4, nama: "Honey Process", waktuProses: 18 },
    ];
    localStorage.setItem("dataProses", JSON.stringify(dataProses));
  }

  if (!localStorage.getItem("dataJenisKopi")) {
    dataJenisKopi = [
      { id: 1, nama: "Arabika" },
      { id: 2, nama: "Robusta" },
      { id: 3, nama: "Liberika" },
      { id: 4, nama: "Excelsa" },
    ];
    localStorage.setItem("dataJenisKopi", JSON.stringify(dataJenisKopi));
  }

  if (!localStorage.getItem("dataVarietas")) {
    dataVarietas = [
      { id: 1, nama: "Typica" },
      { id: 2, nama: "Caturra" },
      { id: 3, nama: "Bourbon" },
      { id: 4, nama: "Geisha" },
    ];
    localStorage.setItem("dataVarietas", JSON.stringify(dataVarietas));
  }

  if (!localStorage.getItem("dataRoasting")) {
    dataRoasting = [
      { id: 1, nama: "Light Roast" },
      { id: 2, nama: "Medium Roast" },
      { id: 3, nama: "Medium-Dark Roast" },
      { id: 4, nama: "Dark Roast" },
    ];
    localStorage.setItem("dataRoasting", JSON.stringify(dataRoasting));
  }

  if (!localStorage.getItem("dataKemasan")) {
    dataKemasan = [
      { id: 1, ukuran: "250 gram" },
      { id: 2, ukuran: "500 gram" },
      { id: 3, ukuran: "5 kg" },
      { id: 4, ukuran: "10 kg" },
      { id: 5, ukuran: "15 kg" },
      { id: 6, ukuran: "20 kg" },
      { id: 7, ukuran: "25 kg" },
      { id: 8, ukuran: "30 kg" },
    ];
    localStorage.setItem("dataKemasan", JSON.stringify(dataKemasan));
  }
}

// ==================== PRODUK ====================
async function displayProduk() {
  try {
    dataProduk = await loadMasterData("produk");
  } catch (e) {
    console.error("Error loading dataProduk:", e);
    dataProduk = [];
  }

  const tableBody = document.getElementById("tableProduk");
  if (!tableBody) return;

  if (dataProduk.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="3" class="text-center py-4 text-muted">
          <i class="bi bi-inbox fs-1 d-block mb-2"></i>
          Tidak ada data produk
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = dataProduk
    .map(
      (item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><span class="badge bg-info">${item.nama}</span></td>
      <td class="text-center">
        <button class="btn btn-sm btn-warning btn-action"           onclick="editProduk(${
          item.id || item._id || `'${item._id}'`
        })" title="Edit">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button class="btn btn-sm btn-danger btn-action" onclick="deleteProduk(${
          item.id || item._id || `'${item._id}'`
        })" title="Hapus">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `,
    )
    .join("");
}

function openModalProduk(mode = "add", id = null) {
  const modal = new bootstrap.Modal(document.getElementById("modalProduk"));
  const form = document.getElementById("formProduk");
  const label = document.getElementById("modalProdukLabel");

  if (mode === "add") {
    label.textContent = "Tambah Produk";
    form.reset();
    document.getElementById("produkId").value = "";
  } else {
    label.textContent = "Edit Produk";
  }

  modal.show();
}

async function editProduk(id) {
  try {
    dataProduk = await loadMasterData("produk");
    const item = dataProduk.find((p) => p.id === id || p._id === id);
    if (!item) {
      alert("Data produk tidak ditemukan!");
      return;
    }

    document.getElementById("produkId").value = item.id || item._id;
    document.getElementById("namaProduk").value = item.nama;
    openModalProduk("edit", id);
  } catch (error) {
    console.error("Error loading produk for edit:", error);
    alert("Error memuat data produk");
  }
}

async function saveProduk() {
  const form = document.getElementById("formProduk");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  dataProduk = await loadMasterData("produk");

  const id = document.getElementById("produkId").value;
  const nama = document.getElementById("namaProduk").value.trim();

  // Validasi duplikasi
  const existing = dataProduk.find(
    (p) =>
      p.nama.toLowerCase() === nama.toLowerCase() &&
      p.id !== parseInt(id) &&
      p._id !== id,
  );
  if (existing) {
    alert("Produk dengan nama tersebut sudah ada!");
    return;
  }

  try {
    const data = { nama };
    if (id) {
      // Edit via API
      if (window.API && window.API.MasterData && window.API.MasterData.produk) {
        await window.API.MasterData.produk.update(id, data);
      } else {
        // Fallback to localStorage
        const index = dataProduk.findIndex(
          (p) => p.id === parseInt(id) || p._id === id,
        );
        if (index !== -1) {
          dataProduk[index].nama = nama;
          localStorage.setItem("dataProduk", JSON.stringify(dataProduk));
        }
      }
    } else {
      // Add via API
      if (window.API && window.API.MasterData && window.API.MasterData.produk) {
        await window.API.MasterData.produk.create(data);
      } else {
        // Fallback to localStorage
        const newId =
          dataProduk.length > 0
            ? Math.max(...dataProduk.map((p) => p.id)) + 1
            : 1;
        dataProduk.push({ id: newId, nama });
        localStorage.setItem("dataProduk", JSON.stringify(dataProduk));
      }
    }

    dataProduk = await loadMasterData("produk");
    await displayProduk();
    bootstrap.Modal.getInstance(document.getElementById("modalProduk")).hide();
    form.reset();
    window.dispatchEvent(
      new CustomEvent("dataMasterUpdated", { detail: { type: "produk" } }),
    );
  } catch (error) {
    console.error("Error saving produk:", error);
    alert("Error menyimpan data: " + (error.message || "Unknown error"));
  }
}

async function deleteProduk(id) {
  try {
    dataProduk = await loadMasterData("produk");
    const item = dataProduk.find((p) => p.id === id || p._id === id);
    if (!item) {
      alert("Data produk tidak ditemukan!");
      return;
    }

    currentDeleteId = id;
    currentDeleteType = "produk";
    document.getElementById("deleteDataInfo").textContent = item.nama;
    new bootstrap.Modal(document.getElementById("modalDelete")).show();
  } catch (error) {
    console.error("Error loading produk for delete:", error);
    alert("Error memuat data produk");
  }
}

// ==================== PROSES PENGOLAHAN ====================
function displayProses() {
  // Reload data dari localStorage untuk memastikan data terbaru
  try {
    dataProses = JSON.parse(localStorage.getItem("dataProses")) || [];
  } catch (e) {
    console.error("Error loading dataProses from localStorage:", e);
    dataProses = [];
  }

  const tableBody = document.getElementById("tableProses");
  if (!tableBody) return;

  if (dataProses.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center py-4 text-muted">
          <i class="bi bi-inbox fs-1 d-block mb-2"></i>
          Tidak ada data proses pengolahan
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = dataProses
    .map(
      (item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${item.nama}</td>
      <td>${item.waktuProses} hari</td>
      <td class="text-center">
        <button class="btn btn-sm btn-warning btn-action" onclick="editProses(${
          item.id
        })" title="Edit">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button class="btn btn-sm btn-danger btn-action" onclick="deleteProses(${
          item.id
        })" title="Hapus">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `,
    )
    .join("");
}

function openModalProses(mode = "add", id = null) {
  const modal = new bootstrap.Modal(document.getElementById("modalProses"));
  const form = document.getElementById("formProses");
  const label = document.getElementById("modalProsesLabel");

  if (mode === "add") {
    label.textContent = "Tambah Proses Pengolahan";
    form.reset();
    document.getElementById("prosesId").value = "";
  } else {
    label.textContent = "Edit Proses Pengolahan";
  }

  modal.show();
}

function editProses(id) {
  // Reload data dari localStorage sebelum edit
  dataProses = JSON.parse(localStorage.getItem("dataProses")) || [];

  const item = dataProses.find((p) => p.id === id);
  if (!item) return;

  document.getElementById("prosesId").value = item.id;
  document.getElementById("namaProses").value = item.nama;
  document.getElementById("waktuProses").value = item.waktuProses;
  openModalProses("edit", id);
}

function saveProses() {
  const form = document.getElementById("formProses");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  // Reload data dari localStorage sebelum validasi
  dataProses = JSON.parse(localStorage.getItem("dataProses")) || [];

  const id = document.getElementById("prosesId").value;
  const nama = document.getElementById("namaProses").value.trim();
  const waktuProses = parseInt(document.getElementById("waktuProses").value);

  // Validasi duplikasi
  const existing = dataProses.find(
    (p) => p.nama.toLowerCase() === nama.toLowerCase() && p.id !== parseInt(id),
  );
  if (existing) {
    alert("Proses pengolahan dengan nama tersebut sudah ada!");
    return;
  }

  if (id) {
    // Edit
    const index = dataProses.findIndex((p) => p.id === parseInt(id));
    if (index !== -1) {
      dataProses[index].nama = nama;
      dataProses[index].waktuProses = waktuProses;
    }
  } else {
    // Add
    const newId =
      dataProses.length > 0 ? Math.max(...dataProses.map((p) => p.id)) + 1 : 1;
    dataProses.push({ id: newId, nama, waktuProses });
  }

  localStorage.setItem("dataProses", JSON.stringify(dataProses));
  // Reload data dari localStorage sebelum display
  dataProses = JSON.parse(localStorage.getItem("dataProses")) || [];
  displayProses();
  bootstrap.Modal.getInstance(document.getElementById("modalProses")).hide();
  form.reset();
  // Kirim CustomEvent dengan detail type untuk memberitahu halaman lain data mana yang di-update
  window.dispatchEvent(
    new CustomEvent("dataMasterUpdated", { detail: { type: "proses" } }),
  );
}

function deleteProses(id) {
  const item = dataProses.find((p) => p.id === id);
  if (!item) return;

  currentDeleteId = id;
  currentDeleteType = "proses";
  document.getElementById("deleteDataInfo").textContent = item.nama;
  new bootstrap.Modal(document.getElementById("modalDelete")).show();
}

// ==================== JENIS KOPI ====================
function displayJenisKopi() {
  // Reload data dari localStorage untuk memastikan data terbaru
  try {
    dataJenisKopi = JSON.parse(localStorage.getItem("dataJenisKopi")) || [];
  } catch (e) {
    console.error("Error loading dataJenisKopi from localStorage:", e);
    dataJenisKopi = [];
  }

  const tableBody = document.getElementById("tableJenisKopi");
  if (!tableBody) return;

  if (dataJenisKopi.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="3" class="text-center py-4 text-muted">
          <i class="bi bi-inbox fs-1 d-block mb-2"></i>
          Tidak ada data jenis kopi
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = dataJenisKopi
    .map(
      (item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><span class="badge bg-primary">${item.nama}</span></td>
      <td class="text-center">
        <button class="btn btn-sm btn-warning btn-action" onclick="editJenisKopi(${
          item.id
        })" title="Edit">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button class="btn btn-sm btn-danger btn-action" onclick="deleteJenisKopi(${
          item.id
        })" title="Hapus">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `,
    )
    .join("");
}

function openModalJenisKopi(mode = "add", id = null) {
  const modal = new bootstrap.Modal(document.getElementById("modalJenisKopi"));
  const form = document.getElementById("formJenisKopi");
  const label = document.getElementById("modalJenisKopiLabel");

  if (mode === "add") {
    label.textContent = "Tambah Jenis Kopi";
    form.reset();
    document.getElementById("jenisKopiId").value = "";
  } else {
    label.textContent = "Edit Jenis Kopi";
  }

  modal.show();
}

function editJenisKopi(id) {
  // Reload data dari localStorage sebelum edit
  dataJenisKopi = JSON.parse(localStorage.getItem("dataJenisKopi")) || [];

  const item = dataJenisKopi.find((j) => j.id === id);
  if (!item) return;

  document.getElementById("jenisKopiId").value = item.id;
  document.getElementById("namaJenisKopi").value = item.nama;
  openModalJenisKopi("edit", id);
}

function saveJenisKopi() {
  const form = document.getElementById("formJenisKopi");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  // Reload data dari localStorage sebelum validasi
  dataJenisKopi = JSON.parse(localStorage.getItem("dataJenisKopi")) || [];

  const id = document.getElementById("jenisKopiId").value;
  const nama = document.getElementById("namaJenisKopi").value.trim();

  // Validasi duplikasi
  const existing = dataJenisKopi.find(
    (j) => j.nama.toLowerCase() === nama.toLowerCase() && j.id !== parseInt(id),
  );
  if (existing) {
    alert("Jenis kopi dengan nama tersebut sudah ada!");
    return;
  }

  if (id) {
    // Edit
    const index = dataJenisKopi.findIndex((j) => j.id === parseInt(id));
    if (index !== -1) {
      dataJenisKopi[index].nama = nama;
    }
  } else {
    // Add
    const newId =
      dataJenisKopi.length > 0
        ? Math.max(...dataJenisKopi.map((j) => j.id)) + 1
        : 1;
    dataJenisKopi.push({ id: newId, nama });
  }

  localStorage.setItem("dataJenisKopi", JSON.stringify(dataJenisKopi));
  // Reload data dari localStorage sebelum display
  dataJenisKopi = JSON.parse(localStorage.getItem("dataJenisKopi")) || [];
  displayJenisKopi();
  bootstrap.Modal.getInstance(document.getElementById("modalJenisKopi")).hide();
  form.reset();
  // Kirim CustomEvent dengan detail type untuk memberitahu halaman lain data mana yang di-update
  window.dispatchEvent(
    new CustomEvent("dataMasterUpdated", { detail: { type: "jenisKopi" } }),
  );
}

function deleteJenisKopi(id) {
  const item = dataJenisKopi.find((j) => j.id === id);
  if (!item) return;

  currentDeleteId = id;
  currentDeleteType = "jenisKopi";
  document.getElementById("deleteDataInfo").textContent = item.nama;
  new bootstrap.Modal(document.getElementById("modalDelete")).show();
}

// ==================== VARIETAS ====================
function displayVarietas() {
  // Reload data dari localStorage untuk memastikan data terbaru
  try {
    dataVarietas = JSON.parse(localStorage.getItem("dataVarietas")) || [];
  } catch (e) {
    console.error("Error loading dataVarietas from localStorage:", e);
    dataVarietas = [];
  }

  const tableBody = document.getElementById("tableVarietas");
  if (!tableBody) return;

  if (dataVarietas.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="3" class="text-center py-4 text-muted">
          <i class="bi bi-inbox fs-1 d-block mb-2"></i>
          Tidak ada data varietas
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = dataVarietas
    .map(
      (item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${item.nama}</td>
      <td class="text-center">
        <button class="btn btn-sm btn-warning btn-action" onclick="editVarietas(${
          item.id
        })" title="Edit">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button class="btn btn-sm btn-danger btn-action" onclick="deleteVarietas(${
          item.id
        })" title="Hapus">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `,
    )
    .join("");
}

function openModalVarietas(mode = "add", id = null) {
  const modal = new bootstrap.Modal(document.getElementById("modalVarietas"));
  const form = document.getElementById("formVarietas");
  const label = document.getElementById("modalVarietasLabel");

  if (mode === "add") {
    label.textContent = "Tambah Varietas";
    form.reset();
    document.getElementById("varietasId").value = "";
  } else {
    label.textContent = "Edit Varietas";
  }

  modal.show();
}

function editVarietas(id) {
  // Reload data dari localStorage sebelum edit
  dataVarietas = JSON.parse(localStorage.getItem("dataVarietas")) || [];

  const item = dataVarietas.find((v) => v.id === id);
  if (!item) return;

  document.getElementById("varietasId").value = item.id;
  document.getElementById("namaVarietas").value = item.nama;
  openModalVarietas("edit", id);
}

function saveVarietas() {
  const form = document.getElementById("formVarietas");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  // Reload data dari localStorage sebelum validasi
  dataVarietas = JSON.parse(localStorage.getItem("dataVarietas")) || [];

  const id = document.getElementById("varietasId").value;
  const nama = document.getElementById("namaVarietas").value.trim();

  // Validasi duplikasi
  const existing = dataVarietas.find(
    (v) => v.nama.toLowerCase() === nama.toLowerCase() && v.id !== parseInt(id),
  );
  if (existing) {
    alert("Varietas dengan nama tersebut sudah ada!");
    return;
  }

  if (id) {
    // Edit
    const index = dataVarietas.findIndex((v) => v.id === parseInt(id));
    if (index !== -1) {
      dataVarietas[index].nama = nama;
    }
  } else {
    // Add
    const newId =
      dataVarietas.length > 0
        ? Math.max(...dataVarietas.map((v) => v.id)) + 1
        : 1;
    dataVarietas.push({ id: newId, nama });
  }

  localStorage.setItem("dataVarietas", JSON.stringify(dataVarietas));
  // Reload data dari localStorage sebelum display
  dataVarietas = JSON.parse(localStorage.getItem("dataVarietas")) || [];
  displayVarietas();
  bootstrap.Modal.getInstance(document.getElementById("modalVarietas")).hide();
  form.reset();
  // Kirim CustomEvent dengan detail type untuk memberitahu halaman lain data mana yang di-update
  window.dispatchEvent(
    new CustomEvent("dataMasterUpdated", { detail: { type: "varietas" } }),
  );
}

function deleteVarietas(id) {
  const item = dataVarietas.find((v) => v.id === id);
  if (!item) return;

  currentDeleteId = id;
  currentDeleteType = "varietas";
  document.getElementById("deleteDataInfo").textContent = item.nama;
  new bootstrap.Modal(document.getElementById("modalDelete")).show();
}

// ==================== LEVEL ROASTING ====================
function displayRoasting() {
  // Reload data dari localStorage untuk memastikan data terbaru
  try {
    dataRoasting = JSON.parse(localStorage.getItem("dataRoasting")) || [];
  } catch (e) {
    console.error("Error loading dataRoasting from localStorage:", e);
    dataRoasting = [];
  }

  const tableBody = document.getElementById("tableRoasting");
  if (!tableBody) return;

  if (dataRoasting.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="3" class="text-center py-4 text-muted">
          <i class="bi bi-inbox fs-1 d-block mb-2"></i>
          Tidak ada data level roasting
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = dataRoasting
    .map(
      (item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${item.nama}</td>
      <td class="text-center">
        <button class="btn btn-sm btn-warning btn-action" onclick="editRoasting(${
          item.id
        })" title="Edit">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button class="btn btn-sm btn-danger btn-action" onclick="deleteRoasting(${
          item.id
        })" title="Hapus">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `,
    )
    .join("");
}

function openModalRoasting(mode = "add", id = null) {
  const modal = new bootstrap.Modal(document.getElementById("modalRoasting"));
  const form = document.getElementById("formRoasting");
  const label = document.getElementById("modalRoastingLabel");

  if (mode === "add") {
    label.textContent = "Tambah Level Roasting";
    form.reset();
    document.getElementById("roastingId").value = "";
  } else {
    label.textContent = "Edit Level Roasting";
  }

  modal.show();
}

function editRoasting(id) {
  // Reload data dari localStorage sebelum edit
  dataRoasting = JSON.parse(localStorage.getItem("dataRoasting")) || [];

  const item = dataRoasting.find((r) => r.id === id);
  if (!item) return;

  document.getElementById("roastingId").value = item.id;
  document.getElementById("namaRoasting").value = item.nama;
  openModalRoasting("edit", id);
}

function saveRoasting() {
  const form = document.getElementById("formRoasting");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  // Reload data dari localStorage sebelum validasi
  dataRoasting = JSON.parse(localStorage.getItem("dataRoasting")) || [];

  const id = document.getElementById("roastingId").value;
  const nama = document.getElementById("namaRoasting").value.trim();

  // Validasi duplikasi
  const existing = dataRoasting.find(
    (r) => r.nama.toLowerCase() === nama.toLowerCase() && r.id !== parseInt(id),
  );
  if (existing) {
    alert("Level roasting dengan nama tersebut sudah ada!");
    return;
  }

  if (id) {
    // Edit
    const index = dataRoasting.findIndex((r) => r.id === parseInt(id));
    if (index !== -1) {
      dataRoasting[index].nama = nama;
    }
  } else {
    // Add
    const newId =
      dataRoasting.length > 0
        ? Math.max(...dataRoasting.map((r) => r.id)) + 1
        : 1;
    dataRoasting.push({ id: newId, nama });
  }

  localStorage.setItem("dataRoasting", JSON.stringify(dataRoasting));
  // Reload data dari localStorage sebelum display
  dataRoasting = JSON.parse(localStorage.getItem("dataRoasting")) || [];
  displayRoasting();
  bootstrap.Modal.getInstance(document.getElementById("modalRoasting")).hide();
  form.reset();
  // Kirim CustomEvent dengan detail type untuk memberitahu halaman lain data mana yang di-update
  window.dispatchEvent(
    new CustomEvent("dataMasterUpdated", { detail: { type: "roasting" } }),
  );
}

function deleteRoasting(id) {
  const item = dataRoasting.find((r) => r.id === id);
  if (!item) return;

  currentDeleteId = id;
  currentDeleteType = "roasting";
  document.getElementById("deleteDataInfo").textContent = item.nama;
  new bootstrap.Modal(document.getElementById("modalDelete")).show();
}

// ==================== KEMASAN ====================
function displayKemasan() {
  // Reload data dari localStorage untuk memastikan data terbaru
  try {
    dataKemasan = JSON.parse(localStorage.getItem("dataKemasan")) || [];
  } catch (e) {
    console.error("Error loading dataKemasan from localStorage:", e);
    dataKemasan = [];
  }

  const tableBody = document.getElementById("tableKemasan");
  if (!tableBody) return;

  if (dataKemasan.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="3" class="text-center py-4 text-muted">
          <i class="bi bi-inbox fs-1 d-block mb-2"></i>
          Tidak ada data kemasan
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = dataKemasan
    .map(
      (item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${item.ukuran}</td>
      <td class="text-center">
        <button class="btn btn-sm btn-warning btn-action" onclick="editKemasan(${
          item.id
        })" title="Edit">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button class="btn btn-sm btn-danger btn-action" onclick="deleteKemasan(${
          item.id
        })" title="Hapus">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `,
    )
    .join("");
}

function openModalKemasan(mode = "add", id = null) {
  const modal = new bootstrap.Modal(document.getElementById("modalKemasan"));
  const form = document.getElementById("formKemasan");
  const label = document.getElementById("modalKemasanLabel");

  if (mode === "add") {
    label.textContent = "Tambah Kemasan";
    form.reset();
    document.getElementById("kemasanId").value = "";
  } else {
    label.textContent = "Edit Kemasan";
  }

  modal.show();
}

function editKemasan(id) {
  // Reload data dari localStorage sebelum edit
  dataKemasan = JSON.parse(localStorage.getItem("dataKemasan")) || [];

  const item = dataKemasan.find((k) => k.id === id);
  if (!item) return;

  document.getElementById("kemasanId").value = item.id;
  document.getElementById("ukuranKemasan").value = item.ukuran;
  openModalKemasan("edit", id);
}

function saveKemasan() {
  const form = document.getElementById("formKemasan");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  // Reload data dari localStorage sebelum validasi
  dataKemasan = JSON.parse(localStorage.getItem("dataKemasan")) || [];

  const id = document.getElementById("kemasanId").value;
  const ukuran = document.getElementById("ukuranKemasan").value.trim();

  // Validasi duplikasi
  const existing = dataKemasan.find(
    (k) =>
      k.ukuran.toLowerCase() === ukuran.toLowerCase() && k.id !== parseInt(id),
  );
  if (existing) {
    alert("Kemasan dengan ukuran tersebut sudah ada!");
    return;
  }

  if (id) {
    // Edit
    const index = dataKemasan.findIndex((k) => k.id === parseInt(id));
    if (index !== -1) {
      dataKemasan[index].ukuran = ukuran;
    }
  } else {
    // Add
    const newId =
      dataKemasan.length > 0
        ? Math.max(...dataKemasan.map((k) => k.id)) + 1
        : 1;
    dataKemasan.push({ id: newId, ukuran });
  }

  localStorage.setItem("dataKemasan", JSON.stringify(dataKemasan));
  // Reload data dari localStorage sebelum display
  dataKemasan = JSON.parse(localStorage.getItem("dataKemasan")) || [];
  displayKemasan();
  bootstrap.Modal.getInstance(document.getElementById("modalKemasan")).hide();
  form.reset();
  // Kirim CustomEvent dengan detail type untuk memberitahu halaman lain data mana yang di-update
  window.dispatchEvent(
    new CustomEvent("dataMasterUpdated", { detail: { type: "kemasan" } }),
  );
}

function deleteKemasan(id) {
  const item = dataKemasan.find((k) => k.id === id);
  if (!item) return;

  currentDeleteId = id;
  currentDeleteType = "kemasan";
  document.getElementById("deleteDataInfo").textContent = item.ukuran;
  new bootstrap.Modal(document.getElementById("modalDelete")).show();
}

// ==================== KONFIRMASI DELETE ====================
async function confirmDelete() {
  if (!currentDeleteId || !currentDeleteType) return;

  try {
    const apiMap = {
      produk: window.API?.MasterData?.produk,
      proses: window.API?.MasterData?.proses,
      jenisKopi: window.API?.MasterData?.jenisKopi,
      varietas: window.API?.MasterData?.varietas,
      roasting: window.API?.MasterData?.roasting,
      kemasan: window.API?.MasterData?.kemasan,
    };

    const api = apiMap[currentDeleteType];

    if (api) {
      await api.delete(currentDeleteId);
    } else {
      // Fallback to localStorage
      switch (currentDeleteType) {
        case "produk":
          dataProduk = dataProduk.filter(
            (p) => p.id !== currentDeleteId && p._id !== currentDeleteId,
          );
          localStorage.setItem("dataProduk", JSON.stringify(dataProduk));
          break;
        case "proses":
          dataProses = dataProses.filter(
            (p) => p.id !== currentDeleteId && p._id !== currentDeleteId,
          );
          localStorage.setItem("dataProses", JSON.stringify(dataProses));
          break;
        case "jenisKopi":
          dataJenisKopi = dataJenisKopi.filter(
            (j) => j.id !== currentDeleteId && j._id !== currentDeleteId,
          );
          localStorage.setItem("dataJenisKopi", JSON.stringify(dataJenisKopi));
          break;
        case "varietas":
          dataVarietas = dataVarietas.filter(
            (v) => v.id !== currentDeleteId && v._id !== currentDeleteId,
          );
          localStorage.setItem("dataVarietas", JSON.stringify(dataVarietas));
          break;
        case "roasting":
          dataRoasting = dataRoasting.filter(
            (r) => r.id !== currentDeleteId && r._id !== currentDeleteId,
          );
          localStorage.setItem("dataRoasting", JSON.stringify(dataRoasting));
          break;
        case "kemasan":
          dataKemasan = dataKemasan.filter(
            (k) => k.id !== currentDeleteId && k._id !== currentDeleteId,
          );
          localStorage.setItem("dataKemasan", JSON.stringify(dataKemasan));
          break;
      }
    }

    // Reload and display
    switch (currentDeleteType) {
      case "produk":
        dataProduk = await loadMasterData("produk");
        await displayProduk();
        break;
      case "proses":
        dataProses = await loadMasterData("proses");
        await displayProses();
        break;
      case "jenisKopi":
        dataJenisKopi = await loadMasterData("jenisKopi");
        await displayJenisKopi();
        break;
      case "varietas":
        dataVarietas = await loadMasterData("varietas");
        await displayVarietas();
        break;
      case "roasting":
        dataRoasting = await loadMasterData("roasting");
        await displayRoasting();
        break;
      case "kemasan":
        dataKemasan = await loadMasterData("kemasan");
        await displayKemasan();
        break;
    }

    bootstrap.Modal.getInstance(document.getElementById("modalDelete")).hide();

    // Kirim CustomEvent dengan detail type untuk memberitahu halaman lain data mana yang di-delete
    window.dispatchEvent(
      new CustomEvent("dataMasterUpdated", {
        detail: { type: currentDeleteType },
      }),
    );

    currentDeleteId = null;
    currentDeleteType = null;
  } catch (error) {
    console.error("Error deleting master data:", error);
    alert("Error menghapus data: " + (error.message || "Unknown error"));
  }
}

// ==================== INITIALIZE ====================
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(async () => {
    try {
      await loadAllMasterData();
      // Initialize default data if empty (fallback only)
      if (dataProduk.length === 0 && !localStorage.getItem("dataProduk")) {
        initializeDefaultData();
        await loadAllMasterData();
      }

      // Display all tables
      displayProduk();
      await displayProduk();
      await displayProses();
      await displayJenisKopi();
      await displayVarietas();
      await displayRoasting();
      await displayKemasan();

      // Event listener untuk tab change
      const tabButtons = document.querySelectorAll(
        '#dataTabs button[data-bs-toggle="tab"]',
      );
      tabButtons.forEach((button) => {
        button.addEventListener("shown.bs.tab", async function (event) {
          // Refresh display saat tab berubah
          await loadAllMasterData();
          await displayProduk();
          await displayProses();
          await displayJenisKopi();
          await displayVarietas();
          await displayRoasting();
          await displayKemasan();
        });
      });
    } catch (error) {
      console.error("Error initializing master data page:", error);
    }
  }, 100);
});
