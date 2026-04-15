// Data master untuk setiap jenis data (MONGODB ONLY - NO localStorage fallback)
let dataProduk = [];
let dataProses = [];
let dataJenisKopi = [];
let dataVarietas = [];
let dataRoasting = [];
let dataKemasan = [];

let currentEditId = null;
let currentDeleteId = null;
let currentDeleteType = null; // 'produk', 'proses', 'jenisKopi', 'varietas', 'roasting', 'kemasan'

// Konstanta tahapan produksi yang tersedia
// CATATAN: Tahapan sekarang diambil dari Master Data, bukan hardcode
// Konstanta ini hanya untuk referensi/fallback jika diperlukan
// Urutan objek = urutan checkbox di form (sinkron dengan kelola_produksi.js & app.py)
const ALL_TAHAPAN = {
  Sortasi: "Sortasi Cherry atau Buah Kopi",
  Fermentasi: "Fermentasi",
  Pulping: "Pulping",
  Pencucian: "Pencucian",
  "Pengeringan Awal (Para-Para)": "Pengeringan Awal (Para - Para)",
  "Fermentasi 2": "Fermentasi 2",
  "Hulling 1": "Pengupasan Kulit Tanduk (Hulling) 1",
  "Pengeringan Akhir (Pengeringan Lantai)":
    "Pengeringan Akhir (Pengeringan Lantai)",
  "Hulling 2": "Pengupasan Kulit Tanduk (Hulling) 2",
  "Hand Sortasi": "Hand Sortasi atau Sortasi Biji Kopi",
  Grinding: "Grinding",
  Roasting: "Roasting",
  Pengemasan: "Pengemasan (Tahapan Akhir)",
};

// Wait for API to be ready (event-based + polling fallback)
async function waitForAPI() {
  // Check if already available
  if (window.API && window.API.MasterData && window.API.MasterData.produk) {
    console.log("✅ API already available");
    return true;
  }

  console.log("⏳ Waiting for API to be ready...");

  // Wait for APIReady event OR polling (max 5 seconds)
  return new Promise((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.warn("⚠️ Timeout waiting for APIReady event");
        const available =
          window.API && window.API.MasterData && window.API.MasterData.produk;
        if (!available) {
          console.error("❌ window.API:", window.API);
          console.error(
            "Available APIs:",
            window.API ? Object.keys(window.API) : "undefined",
          );
        }
        resolve(available);
      }
    }, 5000);

    // Event listener for APIReady
    const eventHandler = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        window.removeEventListener("APIReady", eventHandler);
        console.log("✅ APIReady event received");
        resolve(
          window.API && window.API.MasterData && window.API.MasterData.produk,
        );
      }
    };

    window.addEventListener("APIReady", eventHandler);

    // Polling fallback (check every 100ms)
    let pollCount = 0;
    const pollInterval = setInterval(() => {
      pollCount++;
      if (window.API && window.API.MasterData && window.API.MasterData.produk) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          clearInterval(pollInterval);
          window.removeEventListener("APIReady", eventHandler);
          console.log(`✅ API detected via polling (attempt ${pollCount})`);
          resolve(true);
        }
      }
      if (pollCount >= 50) {
        // 5 seconds max
        clearInterval(pollInterval);
      }
    }, 100);
  });
}

// Helper function untuk load master data dari MongoDB (API ONLY - NO fallback)
async function loadMasterData(type) {
  try {
    // Wait for API to be ready
    const apiReady = await waitForAPI();

    if (!apiReady || !window.API || !window.API.MasterData) {
      const errorMsg = `❌ API.MasterData tidak tersedia. Tidak dapat memuat data ${type}. Pastikan backend MongoDB aktif dan api-service.js sudah di-load.`;
      console.error(errorMsg);
      console.error("window.API:", window.API);
      alert(errorMsg);
      throw new Error(errorMsg);
    }

    const apiMap = {
      produk: window.API.MasterData.produk,
      proses: window.API.MasterData.proses,
      jenisKopi: window.API.MasterData.jenisKopi,
      varietas: window.API.MasterData.varietas,
      roasting: window.API.MasterData.roasting,
      kemasan: window.API.MasterData.kemasan,
    };

    const api = apiMap[type];

    if (!api) {
      const errorMsg = `❌ API.MasterData.${type} tidak tersedia. Pastikan api-service.js sudah di-load dengan benar.`;
      console.error(errorMsg);
      alert(errorMsg);
      throw new Error(errorMsg);
    }

    console.log(`✅ Using API.MasterData.${type}.getAll()`);
    const data = await api.getAll();
    console.log(`✅ Loaded ${data.length} ${type} records from MongoDB`);
    return data;
  } catch (error) {
    console.error(`❌ Error loading ${type} from MongoDB:`, error);
    throw error; // Re-throw untuk memberi tahu caller bahwa ada error
  }
}

// Load all master data (MONGODB ONLY)
async function loadAllMasterData() {
  dataProduk = await loadMasterData("produk");
  dataProses = await loadMasterData("proses");
  dataJenisKopi = await loadMasterData("jenisKopi");
  dataVarietas = await loadMasterData("varietas");
  dataRoasting = await loadMasterData("roasting");
  dataKemasan = await loadMasterData("kemasan");
}

// ==================== PRODUK ====================
async function displayProduk() {
  // Load data dari MongoDB (API ONLY - NO localStorage)
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
    // VERIFY API AVAILABILITY - NO FALLBACK
    if (
      !window.API ||
      !window.API.MasterData ||
      !window.API.MasterData.produk
    ) {
      const errorMsg =
        "❌ API.MasterData.produk tidak tersedia. Tidak dapat menyimpan data. Pastikan backend MongoDB aktif.";
      console.error(errorMsg);
      alert(errorMsg);
      throw new Error(errorMsg);
    }

    const data = { nama };
    if (id) {
      // Edit via API (MongoDB ONLY)
      console.log("🔄 Updating produk via API:", id);
      await window.API.MasterData.produk.update(id, data);
      console.log("✅ Produk updated in MongoDB");
    } else {
      // Add via API (MongoDB ONLY)
      // NOTE: Backend will generate ID automatically
      console.log("🔄 Creating produk via API (backend will generate ID)");
      await window.API.MasterData.produk.create(data);
      console.log("✅ Produk created in MongoDB");
    }

    dataProduk = await loadMasterData("produk");
    await displayProduk();
    bootstrap.Modal.getInstance(document.getElementById("modalProduk")).hide();
    form.reset();
    window.dispatchEvent(
      new CustomEvent("dataMasterUpdated", { detail: { type: "produk" } }),
    );
    
    // Auto refresh halaman setelah save berhasil
    setTimeout(() => {
      window.location.reload();
    }, 500);
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
async function displayProses() {
  // Reload data dari MongoDB untuk memastikan data terbaru
  try {
    dataProses = await loadMasterData("proses");
  } catch (e) {
    console.error("Error loading dataProses from MongoDB:", e);
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
    .map((item, index) => {
      // Format tahapan yang dipilih untuk ditampilkan
      const tahapanStatus = item.tahapanStatus || {};
      const selectedTahapan = Object.entries(tahapanStatus)
        .filter(([key, value]) => value === true)
        .map(([key]) => ALL_TAHAPAN[key] || key);

      const tahapanDisplay =
        selectedTahapan.length > 0
          ? selectedTahapan
              .map((t) => `<span class="badge bg-secondary me-1">${t}</span>`)
              .join("")
          : '<span class="text-muted">Belum dikonfigurasi</span>';

      return `
    <tr>
      <td>${index + 1}</td>
      <td>${item.nama}</td>
      <td>${tahapanDisplay}</td>
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
  `;
    })
    .join("");
}

// Fungsi untuk render checkbox tahapan
function renderTahapanCheckboxes(tahapanStatus = {}) {
  const container = document.getElementById("tahapanContainer");
  if (!container) return;

  container.innerHTML = "";

  // Render checkbox untuk setiap tahapan
  for (const [key, label] of Object.entries(ALL_TAHAPAN)) {
    const div = document.createElement("div");
    div.className = "form-check mb-2";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "form-check-input";
    checkbox.id = `tahapan_${key}`;
    checkbox.value = key;
    checkbox.checked = tahapanStatus[key] || false;

    const labelEl = document.createElement("label");
    labelEl.className = "form-check-label";
    labelEl.htmlFor = `tahapan_${key}`;
    labelEl.textContent = label;

    div.appendChild(checkbox);
    div.appendChild(labelEl);
    container.appendChild(div);
  }
}

// Fungsi untuk mendapatkan tahapan yang dipilih
function getSelectedTahapan() {
  const tahapanStatus = {};
  for (const key of Object.keys(ALL_TAHAPAN)) {
    const checkbox = document.getElementById(`tahapan_${key}`);
    tahapanStatus[key] = checkbox ? checkbox.checked : false;
  }
  return tahapanStatus;
}

function openModalProses(mode = "add", id = null) {
  const modal = new bootstrap.Modal(document.getElementById("modalProses"));
  const form = document.getElementById("formProses");
  const label = document.getElementById("modalProsesLabel");

  if (mode === "add") {
    label.textContent = "Tambah Proses Pengolahan";
    form.reset();
    document.getElementById("prosesId").value = "";
    // Render checkbox dengan semua unchecked
    renderTahapanCheckboxes({});
  } else {
    label.textContent = "Edit Proses Pengolahan";
  }

  modal.show();
}

async function editProses(id) {
  // Reload data dari MongoDB sebelum edit
  dataProses = await loadMasterData("proses");

  const item = dataProses.find((p) => p.id === id || p._id === id);
  if (!item) {
    alert("Data proses tidak ditemukan!");
    return;
  }

  document.getElementById("prosesId").value = item.id || item._id;
  document.getElementById("namaProses").value = item.nama;

  // Load tahapanStatus yang sudah ada (default ke semua false jika belum ada)
  const tahapanStatus = item.tahapanStatus || {};
  renderTahapanCheckboxes(tahapanStatus);

  openModalProses("edit", id);
}

async function saveProses() {
  const form = document.getElementById("formProses");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  try {
    // Reload data dari MongoDB sebelum validasi
    dataProses = await loadMasterData("proses");

    const id = document.getElementById("prosesId").value;
    const nama = document.getElementById("namaProses").value.trim();

    // Ambil tahapan yang dipilih
    const tahapanStatus = getSelectedTahapan();

    // Validasi: minimal harus ada satu tahapan yang dipilih
    const selectedTahapan = Object.values(tahapanStatus).filter(
      (v) => v === true,
    );
    if (selectedTahapan.length === 0) {
      alert("Minimal pilih satu tahapan proses pengolahan!");
      return;
    }

    // Validasi duplikasi
    const existing = dataProses.find(
      (p) =>
        p.nama.toLowerCase() === nama.toLowerCase() &&
        p.id !== parseInt(id) &&
        p._id !== id,
    );
    if (existing) {
      alert("Proses pengolahan dengan nama tersebut sudah ada!");
      return;
    }

    // VERIFY API AVAILABILITY - NO FALLBACK
    if (
      !window.API ||
      !window.API.MasterData ||
      !window.API.MasterData.proses
    ) {
      const errorMsg =
        "❌ API.MasterData.proses tidak tersedia. Tidak dapat menyimpan data. Pastikan backend MongoDB aktif.";
      console.error(errorMsg);
      alert(errorMsg);
      throw new Error(errorMsg);
    }

    const data = { nama, tahapanStatus };
    if (id) {
      // Edit via API (MongoDB ONLY)
      console.log("🔄 Updating proses via API:", id);
      await window.API.MasterData.proses.update(id, data);
      console.log("✅ Proses updated in MongoDB");
    } else {
      // Add via API (MongoDB ONLY)
      console.log("🔄 Creating proses via API (backend will generate ID)");
      await window.API.MasterData.proses.create(data);
      console.log("✅ Proses created in MongoDB");
    }

    // Reload data dari MongoDB sebelum display
    dataProses = await loadMasterData("proses");
    await displayProses();
    bootstrap.Modal.getInstance(document.getElementById("modalProses")).hide();
    form.reset();
    // Kirim CustomEvent dengan detail type untuk memberitahu halaman lain data mana yang di-update
    window.dispatchEvent(
      new CustomEvent("dataMasterUpdated", { detail: { type: "proses" } }),
    );
    
    // Auto refresh halaman setelah save berhasil
    setTimeout(() => {
      window.location.reload();
    }, 500);
  } catch (error) {
    console.error("Error saving proses:", error);
    alert("Error menyimpan data: " + (error.message || "Unknown error"));
  }
}

async function deleteProses(id) {
  dataProses = await loadMasterData("proses");
  const item = dataProses.find((p) => p.id === id || p._id === id);
  if (!item) {
    alert("Data proses tidak ditemukan!");
    return;
  }

  currentDeleteId = id;
  currentDeleteType = "proses";
  document.getElementById("deleteDataInfo").textContent = item.nama;
  new bootstrap.Modal(document.getElementById("modalDelete")).show();
}

// ==================== JENIS KOPI ====================
async function displayJenisKopi() {
  // Load data dari MongoDB (API ONLY - NO localStorage)
  try {
    dataJenisKopi = await loadMasterData("jenisKopi");
  } catch (e) {
    console.error("Error loading dataJenisKopi:", e);
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

async function editJenisKopi(id) {
  // Reload data dari MongoDB sebelum edit (API ONLY - NO localStorage)
  try {
    dataJenisKopi = await loadMasterData("jenisKopi");
  } catch (e) {
    console.error("Error loading dataJenisKopi:", e);
    alert("Error memuat data jenis kopi");
    return;
  }

  const item = dataJenisKopi.find(
    (j) => j.id === id || j._id === id || String(j._id) === String(id),
  );
  if (!item) {
    alert("Data jenis kopi tidak ditemukan");
    return;
  }

  document.getElementById("jenisKopiId").value = item.id;
  document.getElementById("namaJenisKopi").value = item.nama;
  openModalJenisKopi("edit", id);
}

async function saveJenisKopi() {
  const form = document.getElementById("formJenisKopi");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  dataJenisKopi = await loadMasterData("jenisKopi");

  const id = document.getElementById("jenisKopiId").value;
  const nama = document.getElementById("namaJenisKopi").value.trim();

  // Validasi duplikasi
  const existing = dataJenisKopi.find(
    (j) =>
      j.nama.toLowerCase() === nama.toLowerCase() &&
      j.id !== parseInt(id) &&
      j._id !== id,
  );
  if (existing) {
    alert("Jenis kopi dengan nama tersebut sudah ada!");
    return;
  }

  try {
    // VERIFY API AVAILABILITY - NO FALLBACK
    if (
      !window.API ||
      !window.API.MasterData ||
      !window.API.MasterData.jenisKopi
    ) {
      const errorMsg =
        "❌ API.MasterData.jenisKopi tidak tersedia. Tidak dapat menyimpan data. Pastikan backend MongoDB aktif.";
      console.error(errorMsg);
      alert(errorMsg);
      throw new Error(errorMsg);
    }

    const data = { nama };
    if (id) {
      // Edit via API (MongoDB ONLY)
      console.log("🔄 Updating jenisKopi via API:", id);
      await window.API.MasterData.jenisKopi.update(id, data);
      console.log("✅ JenisKopi updated in MongoDB");
    } else {
      // Add via API (MongoDB ONLY)
      console.log("🔄 Creating jenisKopi via API (backend will generate ID)");
      await window.API.MasterData.jenisKopi.create(data);
      console.log("✅ JenisKopi created in MongoDB");
    }

    dataJenisKopi = await loadMasterData("jenisKopi");
    await displayJenisKopi();
    bootstrap.Modal.getInstance(
      document.getElementById("modalJenisKopi"),
    ).hide();
    form.reset();
    window.dispatchEvent(
      new CustomEvent("dataMasterUpdated", { detail: { type: "jenisKopi" } }),
    );
    
    // Auto refresh halaman setelah save berhasil
    setTimeout(() => {
      window.location.reload();
    }, 500);
  } catch (error) {
    console.error("Error saving jenisKopi:", error);
    alert("Error menyimpan data: " + (error.message || "Unknown error"));
  }
}

async function deleteJenisKopi(id) {
  dataJenisKopi = await loadMasterData("jenisKopi");
  const item = dataJenisKopi.find((j) => j.id === id || j._id === id);
  if (!item) {
    alert("Data jenis kopi tidak ditemukan!");
    return;
  }

  currentDeleteId = id;
  currentDeleteType = "jenisKopi";
  document.getElementById("deleteDataInfo").textContent = item.nama;
  new bootstrap.Modal(document.getElementById("modalDelete")).show();
}

// ==================== VARIETAS ====================
async function displayVarietas() {
  // Load data dari MongoDB (API ONLY - NO localStorage)
  try {
    dataVarietas = await loadMasterData("varietas");
  } catch (e) {
    console.error("Error loading dataVarietas:", e);
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

async function editVarietas(id) {
  // Reload data dari MongoDB sebelum edit (API ONLY - NO localStorage)
  try {
    dataVarietas = await loadMasterData("varietas");
  } catch (e) {
    console.error("Error loading dataVarietas:", e);
    alert("Error memuat data varietas");
    return;
  }

  const item = dataVarietas.find(
    (v) => v.id === id || v._id === id || String(v._id) === String(id),
  );
  if (!item) {
    alert("Data varietas tidak ditemukan");
    return;
  }

  document.getElementById("varietasId").value = item.id;
  document.getElementById("namaVarietas").value = item.nama;
  openModalVarietas("edit", id);
}

async function saveVarietas() {
  const form = document.getElementById("formVarietas");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  dataVarietas = await loadMasterData("varietas");

  const id = document.getElementById("varietasId").value;
  const nama = document.getElementById("namaVarietas").value.trim();

  // Validasi duplikasi
  const existing = dataVarietas.find(
    (v) =>
      v.nama.toLowerCase() === nama.toLowerCase() &&
      v.id !== parseInt(id) &&
      v._id !== id,
  );
  if (existing) {
    alert("Varietas dengan nama tersebut sudah ada!");
    return;
  }

  try {
    // VERIFY API AVAILABILITY - NO FALLBACK
    if (
      !window.API ||
      !window.API.MasterData ||
      !window.API.MasterData.varietas
    ) {
      const errorMsg =
        "❌ API.MasterData.varietas tidak tersedia. Tidak dapat menyimpan data. Pastikan backend MongoDB aktif.";
      console.error(errorMsg);
      alert(errorMsg);
      throw new Error(errorMsg);
    }

    const data = { nama };
    if (id) {
      // Edit via API (MongoDB ONLY)
      console.log("🔄 Updating varietas via API:", id);
      await window.API.MasterData.varietas.update(id, data);
      console.log("✅ Varietas updated in MongoDB");
    } else {
      // Add via API (MongoDB ONLY)
      console.log("🔄 Creating varietas via API (backend will generate ID)");
      await window.API.MasterData.varietas.create(data);
      console.log("✅ Varietas created in MongoDB");
    }

    dataVarietas = await loadMasterData("varietas");
    await displayVarietas();
    bootstrap.Modal.getInstance(
      document.getElementById("modalVarietas"),
    ).hide();
    form.reset();
    window.dispatchEvent(
      new CustomEvent("dataMasterUpdated", { detail: { type: "varietas" } }),
    );
    
    // Auto refresh halaman setelah save berhasil
    setTimeout(() => {
      window.location.reload();
    }, 500);
  } catch (error) {
    console.error("Error saving varietas:", error);
    alert("Error menyimpan data: " + (error.message || "Unknown error"));
  }
}

async function deleteVarietas(id) {
  dataVarietas = await loadMasterData("varietas");
  const item = dataVarietas.find((v) => v.id === id || v._id === id);
  if (!item) {
    alert("Data varietas tidak ditemukan!");
    return;
  }

  currentDeleteId = id;
  currentDeleteType = "varietas";
  document.getElementById("deleteDataInfo").textContent = item.nama;
  new bootstrap.Modal(document.getElementById("modalDelete")).show();
}

// ==================== LEVEL ROASTING ====================
async function displayRoasting() {
  // Load data dari MongoDB (API ONLY - NO localStorage)
  try {
    dataRoasting = await loadMasterData("roasting");
  } catch (e) {
    console.error("Error loading dataRoasting:", e);
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

async function editRoasting(id) {
  // Reload data dari MongoDB sebelum edit (API ONLY - NO localStorage)
  try {
    dataRoasting = await loadMasterData("roasting");
  } catch (e) {
    console.error("Error loading dataRoasting:", e);
    alert("Error memuat data roasting");
    return;
  }

  const item = dataRoasting.find(
    (r) => r.id === id || r._id === id || String(r._id) === String(id),
  );
  if (!item) {
    alert("Data roasting tidak ditemukan");
    return;
  }

  document.getElementById("roastingId").value = item.id;
  document.getElementById("namaRoasting").value = item.nama;
  openModalRoasting("edit", id);
}

async function saveRoasting() {
  const form = document.getElementById("formRoasting");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  dataRoasting = await loadMasterData("roasting");

  const id = document.getElementById("roastingId").value;
  const nama = document.getElementById("namaRoasting").value.trim();

  // Validasi duplikasi
  const existing = dataRoasting.find(
    (r) =>
      r.nama.toLowerCase() === nama.toLowerCase() &&
      r.id !== parseInt(id) &&
      r._id !== id,
  );
  if (existing) {
    alert("Level roasting dengan nama tersebut sudah ada!");
    return;
  }

  try {
    // VERIFY API AVAILABILITY - NO FALLBACK
    if (
      !window.API ||
      !window.API.MasterData ||
      !window.API.MasterData.roasting
    ) {
      const errorMsg =
        "❌ API.MasterData.roasting tidak tersedia. Tidak dapat menyimpan data. Pastikan backend MongoDB aktif.";
      console.error(errorMsg);
      alert(errorMsg);
      throw new Error(errorMsg);
    }

    const data = { nama };
    if (id) {
      // Edit via API (MongoDB ONLY)
      console.log("🔄 Updating roasting via API:", id);
      await window.API.MasterData.roasting.update(id, data);
      console.log("✅ Roasting updated in MongoDB");
    } else {
      // Add via API (MongoDB ONLY)
      console.log("🔄 Creating roasting via API (backend will generate ID)");
      await window.API.MasterData.roasting.create(data);
      console.log("✅ Roasting created in MongoDB");
    }

    dataRoasting = await loadMasterData("roasting");
    await displayRoasting();
    bootstrap.Modal.getInstance(
      document.getElementById("modalRoasting"),
    ).hide();
    form.reset();
    window.dispatchEvent(
      new CustomEvent("dataMasterUpdated", { detail: { type: "roasting" } }),
    );
    
    // Auto refresh halaman setelah save berhasil
    setTimeout(() => {
      window.location.reload();
    }, 500);
  } catch (error) {
    console.error("Error saving roasting:", error);
    alert("Error menyimpan data: " + (error.message || "Unknown error"));
  }
}

async function deleteRoasting(id) {
  dataRoasting = await loadMasterData("roasting");
  const item = dataRoasting.find((r) => r.id === id || r._id === id);
  if (!item) {
    alert("Data roasting tidak ditemukan!");
    return;
  }

  currentDeleteId = id;
  currentDeleteType = "roasting";
  document.getElementById("deleteDataInfo").textContent = item.nama;
  new bootstrap.Modal(document.getElementById("modalDelete")).show();
}

// ==================== KEMASAN ====================
async function displayKemasan() {
  // Load data dari MongoDB (API ONLY - NO localStorage)
  try {
    dataKemasan = await loadMasterData("kemasan");
  } catch (e) {
    console.error("Error loading dataKemasan:", e);
    dataKemasan = [];
  }

  const tableBody = document.getElementById("tableKemasan");
  if (!tableBody) return;

  if (dataKemasan.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center py-4 text-muted">
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
      <td>${item.ukuran || item.nama || "-"}</td>
      <td class="text-end">
        <strong class="${(item.stok || 0) > 0 ? "text-success" : "text-danger"}">
          ${(item.stok || 0).toLocaleString("id-ID")}
        </strong>
        <small class="text-muted"> kemasan</small>
      </td>
      <td class="text-center">
        <button class="btn btn-sm btn-warning btn-action" onclick="editKemasan(${
          item.id || item._id || `'${item._id}'`
        })" title="Edit">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button class="btn btn-sm btn-danger btn-action" onclick="deleteKemasan(${
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

function openModalKemasan(mode = "add", id = null) {
  const modal = new bootstrap.Modal(document.getElementById("modalKemasan"));
  const form = document.getElementById("formKemasan");
  const label = document.getElementById("modalKemasanLabel");

  if (mode === "add") {
    label.textContent = "Tambah Kemasan";
    form.reset();
    document.getElementById("kemasanId").value = "";
    document.getElementById("stokKemasan").value = 0;
  } else {
    label.textContent = "Edit Kemasan";
  }

  modal.show();
}

async function editKemasan(id) {
  // Reload data dari MongoDB sebelum edit (API ONLY - NO localStorage)
  try {
    dataKemasan = await loadMasterData("kemasan");
  } catch (e) {
    console.error("Error loading dataKemasan:", e);
    alert("Error memuat data kemasan");
    return;
  }

  const item = dataKemasan.find(
    (k) => k.id === id || k._id === id || String(k._id) === String(id),
  );
  if (!item) {
    alert("Data kemasan tidak ditemukan");
    return;
  }

  document.getElementById("kemasanId").value = item.id || item._id;
  // Backend menggunakan field 'nama' dan 'ukuran', tampilkan ukuran di form
  document.getElementById("ukuranKemasan").value =
    item.ukuran || item.nama || "";
  document.getElementById("stokKemasan").value = item.stok || 0;
  openModalKemasan("edit", id);
}

async function saveKemasan() {
  const form = document.getElementById("formKemasan");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  dataKemasan = await loadMasterData("kemasan");

  const id = document.getElementById("kemasanId").value;
  const ukuran = document.getElementById("ukuranKemasan").value.trim();
  const stok = parseInt(document.getElementById("stokKemasan").value || 0);

  // Validasi field wajib
  if (!ukuran) {
    alert("Ukuran kemasan wajib diisi");
    return;
  }

  if (stok < 0) {
    alert("Stok kemasan tidak boleh negatif");
    return;
  }

  // Backend mengharapkan field 'nama' dan 'ukuran'
  // Menggunakan ukuran sebagai nama juga untuk konsistensi
  const nama = ukuran;

  // Validasi duplikasi (cek berdasarkan nama atau ukuran)
  const existing = dataKemasan.find((k) => {
    const isSameName = k.nama && k.nama.toLowerCase() === nama.toLowerCase();
    const isSameUkuran =
      k.ukuran && k.ukuran.toLowerCase() === ukuran.toLowerCase();
    const isDifferentId =
      k.id !== parseInt(id) && k._id !== id && String(k._id) !== String(id);
    return (isSameName || isSameUkuran) && isDifferentId;
  });
  if (existing) {
    alert("Kemasan dengan ukuran tersebut sudah ada!");
    return;
  }

  try {
    // VERIFY API AVAILABILITY - NO FALLBACK
    if (
      !window.API ||
      !window.API.MasterData ||
      !window.API.MasterData.kemasan
    ) {
      const errorMsg =
        "❌ API.MasterData.kemasan tidak tersedia. Tidak dapat menyimpan data. Pastikan backend MongoDB aktif.";
      console.error(errorMsg);
      alert(errorMsg);
      throw new Error(errorMsg);
    }

    // Backend mengharapkan: { nama: string, ukuran: string, stok: int }
    const data = {
      nama: nama,
      ukuran: ukuran,
      stok: stok,
    };

    // Log payload sebelum dikirim
    console.log("📤 Payload kemasan:", data);

    if (id) {
      // Edit via API (MongoDB ONLY)
      console.log("🔄 Updating kemasan via API:", id);
      await window.API.MasterData.kemasan.update(id, data);
      console.log("✅ Kemasan updated in MongoDB");
    } else {
      // Add via API (MongoDB ONLY)
      console.log("🔄 Creating kemasan via API (backend will generate ID)");
      await window.API.MasterData.kemasan.create(data);
      console.log("✅ Kemasan created in MongoDB");
    }

    dataKemasan = await loadMasterData("kemasan");
    await displayKemasan();
    bootstrap.Modal.getInstance(document.getElementById("modalKemasan")).hide();
    form.reset();
    window.dispatchEvent(
      new CustomEvent("dataMasterUpdated", { detail: { type: "kemasan" } }),
    );
    
    // Auto refresh halaman setelah save berhasil
    setTimeout(() => {
      window.location.reload();
    }, 500);
  } catch (error) {
    console.error("Error saving kemasan:", error);
    alert("Error menyimpan data: " + (error.message || "Unknown error"));
  }
}

async function deleteKemasan(id) {
  dataKemasan = await loadMasterData("kemasan");
  const item = dataKemasan.find((k) => k.id === id || k._id === id);
  if (!item) {
    alert("Data kemasan tidak ditemukan!");
    return;
  }

  currentDeleteId = id;
  currentDeleteType = "kemasan";
  // Tampilkan nama atau ukuran untuk konfirmasi delete
  document.getElementById("deleteDataInfo").textContent =
    item.nama || item.ukuran || "kemasan ini";
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

    // VERIFY API AVAILABILITY - NO FALLBACK
    if (!api) {
      const errorMsg = `❌ API.MasterData.${currentDeleteType} tidak tersedia. Tidak dapat menghapus data. Pastikan backend MongoDB aktif.`;
      alert(errorMsg);
      throw new Error(errorMsg);
    }

    // Delete via API (MongoDB ONLY)
    console.log(`🔄 Deleting ${currentDeleteType} via API:`, currentDeleteId);
    await api.delete(currentDeleteId);
    console.log(`✅ ${currentDeleteType} deleted from MongoDB`);

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
      // Note: Tidak ada lagi initializeDefaultData karena semua data harus dari MongoDB

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
