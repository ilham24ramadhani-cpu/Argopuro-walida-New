// Data bahan (MONGODB ONLY - NO localStorage fallback)
let bahan = [];
let currentEditId = null;
let currentDeleteId = null;

// Kloter timbangan (model Kalkulator Timbang)
const MIN_KLOTER = 1;
const MAX_KLOTER = 100;

// Wait for API to be ready (event-based + polling fallback)
async function waitForAPI() {
  // Check if already available
  if (window.API && window.API.Bahan) {
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
        const available = window.API && window.API.Bahan;
        if (!available) {
          console.error("❌ window.API:", window.API);
          console.error(
            "Available APIs:",
            window.API ? Object.keys(window.API) : "undefined"
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
        resolve(window.API && window.API.Bahan);
      }
    };

    window.addEventListener("APIReady", eventHandler);

    // Polling fallback (check every 100ms)
    let pollCount = 0;
    const pollInterval = setInterval(() => {
      pollCount++;
      if (window.API && window.API.Bahan) {
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

// Load data bahan dari MongoDB (API ONLY - NO fallback)
async function loadBahanData() {
  try {
    console.log("🔄 Loading bahan data from MongoDB...");
    console.log("🔍 Checking window.API availability...");
    console.log("window.API exists:", !!window.API);
    console.log("window.API.Bahan exists:", !!(window.API && window.API.Bahan));

    // Wait for API to be ready
    const apiReady = await waitForAPI();

    // VERIFY API AVAILABILITY - NO FALLBACK
    if (!apiReady || !window.API || !window.API.Bahan) {
      console.error("❌ API.Bahan not available after waiting");
      console.error("window.API:", window.API);
      console.error(
        "Available APIs:",
        window.API ? Object.keys(window.API) : "window.API is undefined"
      );

      // Check if api-service.js was loaded
      const scripts = Array.from(
        document.querySelectorAll('script[src*="api-service"]')
      );
      console.log("api-service.js scripts found:", scripts.length);

      const errorMsg =
        "❌ API.Bahan tidak tersedia. Pastikan:\n" +
        "1. api-service.js di-load sebelum kelola_bahan.js\n" +
        "2. Tidak ada error JavaScript di console\n" +
        "3. Backend Flask aktif\n" +
        "\nCek console untuk detail error.";
      console.error(errorMsg);
      alert(errorMsg);
      throw new Error(errorMsg);
    }

    console.log("✅ Using API.Bahan.getAll()");
    bahan = await window.API.Bahan.getAll();
    console.log(`✅ Loaded ${bahan.length} bahan records from MongoDB`);

    if (!Array.isArray(bahan)) {
      console.warn("⚠️ API returned non-array data, defaulting to empty array");
      bahan = [];
    }
  } catch (error) {
    console.error("❌ Error loading bahan from MongoDB:", error);
    const errorMsg = `Error memuat data bahan dari MongoDB: ${
      error.message || "Unknown error"
    }. Pastikan backend Flask aktif.`;
    alert(errorMsg);
    bahan = [];
    throw error;
  }
}

// Load data pemasok untuk dropdown (MONGODB ONLY)
async function loadPemasokOptions() {
  try {
    let pemasok = [];
    if (!window.API || !window.API.Pemasok) {
      console.warn("⚠️ API.Pemasok not available, skipping pemasok options");
      return;
    }
    pemasok = await window.API.Pemasok.getAll();
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

// Load data master dari Kelola Data (MONGODB ONLY)
async function loadJenisKopiOptions() {
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
    if (
      !window.API ||
      !window.API.MasterData ||
      !window.API.MasterData.varietas
    ) {
      console.warn(
        "⚠️ API.MasterData.varietas not available, skipping options"
      );
      return;
    }
    dataVarietas = await window.API.MasterData.varietas.getAll();
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
  // Reload data bahan dari MongoDB untuk memastikan data terbaru
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
        <td colspan="12" class="text-center py-4 text-muted">
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
      <td>${
        b.lunas
          ? '<span class="badge bg-success">Lunas</span>'
          : '<span class="badge bg-secondary">Belum</span>'
      }</td>
      <td class="text-center">
        <button 
          class="btn btn-sm btn-info btn-action" 
          onclick="cetakInvoiceBahan('${(idBahan || '').replace(/'/g, "\\'")}')"
          title="Cetak Invoice PDF">
          <i class="bi bi-printer"></i>
        </button>
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
        <td colspan="12" class="text-center py-4 text-danger">
          <i class="bi bi-exclamation-triangle fs-1 d-block mb-2"></i>
          Error menampilkan data: ${error.message}
        </td>
      </tr>
    `;
  }

  // Debug: log jumlah data yang ditampilkan
  console.log(`Displaying ${filteredBahan.length} bahan items`);
}

// Init dropdown jumlah kloter (1–MAX_KLOTER)
function initKloterDropdown() {
  const dropdown = document.getElementById("kloterTimbangan");
  if (!dropdown) return;
  dropdown.innerHTML = '<option value="">Pilih jumlah kloter</option>';
  for (let i = MIN_KLOTER; i <= MAX_KLOTER; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${i} kloter`;
    dropdown.appendChild(opt);
  }
}

// Render form kloter dinamis (model Kalkulator Timbang)
function renderKloterForms(n) {
  const dropdown = document.getElementById("kloterTimbangan");
  const container = document.getElementById("formKloterContainer");
  const tbody = document.getElementById("kloterForms");
  const hasilContainer = document.getElementById("hasilPerhitunganContainer");

  const num = Math.max(0, Math.min(MAX_KLOTER, parseInt(n, 10) || 0));
  tbody.innerHTML = "";
  if (num === 0) {
    if (container) container.style.display = "none";
    if (hasilContainer) hasilContainer.style.display = "none";
    return;
  }
  if (container) container.style.display = "block";
  for (let i = 1; i <= num; i++) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="text-center">${i}</td>
      <td><span class="badge bg-info text-white fw-semibold">Kloter ${i}</span></td>
      <td>
        <input type="number" class="form-control berat-karung" data-kloter="${i}"
          placeholder="0" min="0" step="0.01" inputmode="decimal" />
      </td>
      <td>
        <input type="text" class="form-control keterangan" data-kloter="${i}"
          placeholder="Masukkan keterangan" />
      </td>
    `;
    tbody.appendChild(tr);
  }
  attachKloterInputListeners();
  hitungFromKloter();
  if (hasilContainer) hasilContainer.style.display = "flex";
}

// Attach listeners untuk perhitungan real-time
function attachKloterInputListeners() {
  const tbody = document.getElementById("kloterForms");
  if (!tbody) return;
  tbody.querySelectorAll(".berat-karung").forEach((el) => {
    el.removeEventListener("input", onKloterInput);
    el.removeEventListener("change", onKloterInput);
    el.addEventListener("input", onKloterInput);
    el.addEventListener("change", onKloterInput);
  });
  const hargaGlobalEl = document.getElementById("hargaPerKgGlobal");
  if (hargaGlobalEl) {
    hargaGlobalEl.removeEventListener("input", onKloterInput);
    hargaGlobalEl.removeEventListener("change", onKloterInput);
    hargaGlobalEl.addEventListener("input", onKloterInput);
    hargaGlobalEl.addEventListener("change", onKloterInput);
  }
}

function onKloterInput() {
  hitungFromKloter();
}

// Perhitungan real-time: hargaPerKg diinput sekali, totalHarga = hargaPerKg × totalBerat
function hitungFromKloter() {
  const tbody = document.getElementById("kloterForms");
  const elTotalBerat = document.getElementById("totalBeratDisplay");
  const elTotalHarga = document.getElementById("totalHargaDisplay");
  const elRataRata = document.getElementById("rataRataHargaDisplay");
  const hargaPerKgEl = document.getElementById("hargaPerKgGlobal");

  let totalBerat = 0;
  if (tbody) {
    tbody.querySelectorAll("tr").forEach((row) => {
      const beratEl = row.querySelector(".berat-karung");
      const berat = parseFloat(beratEl?.value) || 0;
      totalBerat += berat;
    });
  }
  const hargaPerKg = parseFloat(hargaPerKgEl?.value) || 0;
  const totalHarga = totalBerat * hargaPerKg; // Total harga = hargaPerKg × total berat
  const rataRata = totalBerat > 0 ? totalHarga / totalBerat : 0; // Rata-rata = totalHarga ÷ totalBerat (sama dengan hargaPerKg)

  if (elTotalBerat) elTotalBerat.textContent = `${totalBerat.toLocaleString("id-ID")} kg`;
  if (elTotalHarga) elTotalHarga.textContent = `Rp ${totalHarga.toLocaleString("id-ID")}`;
  if (elRataRata) elRataRata.textContent = `Rp ${rataRata.toLocaleString("id-ID", { maximumFractionDigits: 2 })}`;
}

// Fungsi untuk membuka modal tambah/edit
async function openModal(mode = "add") {
  currentEditId = null;
  const modal = document.getElementById("modalBahan");
  const modalLabel = document.getElementById("modalBahanLabel");
  const form = document.getElementById("formBahan");
  const idBahanDisplay = document.getElementById("idBahanDisplay");
  const idBahanHidden = document.getElementById("idBahan");
  const kloterDropdown = document.getElementById("kloterTimbangan");
  const formKloterContainer = document.getElementById("formKloterContainer");
  const hasilContainer = document.getElementById("hasilPerhitunganContainer");

  initKloterDropdown();

  if (mode === "add") {
    modalLabel.textContent = "Tambah Bahan";
    form.reset();
    document.getElementById("bahanId").value = "";
    idBahanHidden.value = "";
    if (idBahanDisplay) idBahanDisplay.value = "";
    document.getElementById("haccpBendaAsing").checked = false;
    document.getElementById("haccpHamaJamur").checked = false;
    document.getElementById("haccpKondisiBaik").checked = false;
    const lunasEl = document.getElementById("bahanLunas");
    if (lunasEl) lunasEl.checked = false;
    if (kloterDropdown) kloterDropdown.value = "";
    const hargaPerKgGlobalEl = document.getElementById("hargaPerKgGlobal");
    if (hargaPerKgGlobalEl) hargaPerKgGlobalEl.value = "";
    if (formKloterContainer) formKloterContainer.style.display = "none";
    if (hasilContainer) hasilContainer.style.display = "none";
    document.getElementById("kloterForms").innerHTML = "";

    // Fetch auto-generated idBahan untuk preview
    if (window.API && window.API.Bahan && window.API.Bahan.getNextId) {
      try {
        const nextId = await window.API.Bahan.getNextId();
        if (nextId && idBahanDisplay) {
          idBahanDisplay.value = nextId;
          idBahanHidden.value = nextId;
        }
      } catch (e) {
        console.warn("Could not fetch next idBahan:", e);
      }
    }

    loadPemasokOptions();
    loadJenisKopiOptions();
    loadVarietasOptions();
  } else {
    modalLabel.textContent = "Edit Bahan";
    loadPemasokOptions();
    loadJenisKopiOptions();
    loadVarietasOptions();
  }

  // Event listener untuk dropdown kloter (jika belum ada)
  if (kloterDropdown && !kloterDropdown.dataset.kloterBound) {
    kloterDropdown.dataset.kloterBound = "1";
    kloterDropdown.addEventListener("change", () => {
      const val = kloterDropdown.value;
      renderKloterForms(val);
    });
  }
}

// Fungsi untuk edit bahan
async function editBahan(id) {
  try {
    await loadBahanData();

    const b = bahan.find((item) => item.id === id || item._id === id);
    if (!b) {
      alert("Data bahan tidak ditemukan!");
      return;
    }

    currentEditId = id;
    document.getElementById("bahanId").value = b.id || b._id;
    document.getElementById("idBahan").value = b.idBahan;
    const idBahanDisplay = document.getElementById("idBahanDisplay");
    if (idBahanDisplay) idBahanDisplay.value = b.idBahan;
    document.getElementById("pemasok").value = b.pemasok;
    document.getElementById("varietas").value = b.varietas;
    document.getElementById("jenisKopi").value = b.jenisKopi;
    document.getElementById("tanggalMasuk").value = b.tanggalMasuk;
    document.getElementById("kualitas").value = b.kualitas;

    if (b.haccp) {
      document.getElementById("haccpBendaAsing").checked = b.haccp.bebasBendaAsing || false;
      document.getElementById("haccpHamaJamur").checked = b.haccp.bebasHamaJamur || false;
      document.getElementById("haccpKondisiBaik").checked = b.haccp.kondisiBaik || false;
    } else {
      document.getElementById("haccpBendaAsing").checked = false;
      document.getElementById("haccpHamaJamur").checked = false;
      document.getElementById("haccpKondisiBaik").checked = false;
    }
    const lunasEdit = document.getElementById("bahanLunas");
    if (lunasEdit) lunasEdit.checked = !!b.lunas;

    await loadPemasokOptions();
    await loadJenisKopiOptions();
    await loadVarietasOptions();

    // Set hargaPerKg global (diinput sekali, bukan per kloter)
    const hargaPerKgEl = document.getElementById("hargaPerKgGlobal");
    if (hargaPerKgEl) {
      hargaPerKgEl.value = b.hargaPerKg || "";
    }

    // Render kloter: jika ada detailKloter gunakan, else 1 baris dari jumlah
    const detailKloter = b.detailKloter || b.kloter;
    let kloterData = [];
    if (detailKloter && Array.isArray(detailKloter) && detailKloter.length > 0) {
      kloterData = detailKloter;
    } else {
      kloterData = [{ berat: b.jumlah || 0, keterangan: "" }];
    }

    const kloterDropdown = document.getElementById("kloterTimbangan");
    initKloterDropdown();
    kloterDropdown.value = String(kloterData.length);
    renderKloterForms(kloterData.length);

    // Pre-fill kloter values (hanya berat dan keterangan)
    const tbody = document.getElementById("kloterForms");
    if (tbody) {
      tbody.querySelectorAll("tr").forEach((row, idx) => {
        const k = kloterData[idx];
        if (k) {
          const beratEl = row.querySelector(".berat-karung");
          const ketEl = row.querySelector(".keterangan");
          if (beratEl) beratEl.value = k.berat || "";
          if (ketEl) ketEl.value = k.keterangan || "";
        }
      });
      hitungFromKloter();
    }

    const modal = new bootstrap.Modal(document.getElementById("modalBahan"));
    modal.show();
  } catch (error) {
    console.error("Error loading bahan for edit:", error);
    alert("Error memuat data bahan");
  }
}

// Cetak Invoice PDF dari data bahan di database (detailKloter + metadata)
function cetakInvoiceBahan(idBahan) {
  if (!window.jspdf) {
    alert("❌ Library jsPDF tidak tersedia. Pastikan library sudah di-load.");
    return;
  }
  const b = bahan.find((item) => item.idBahan === idBahan);
  if (!b) {
    alert("Data bahan tidak ditemukan!");
    return;
  }
  let dataKloter = [];
  const detailKloter = b.detailKloter || b.kloter;
  if (detailKloter && Array.isArray(detailKloter) && detailKloter.length > 0) {
    // hargaPerKg per kloter atau fallback ke global b.hargaPerKg
    const globalHargaPerKg = parseFloat(b.hargaPerKg) || 0;
    dataKloter = detailKloter.map((k, idx) => {
      const berat = parseFloat(k.berat) || 0;
      const hpkg = parseFloat(k.hargaPerKg) || globalHargaPerKg;
      return {
        no: idx + 1,
        kloter: `Kloter ${idx + 1}`,
        berat,
        hargaPerKg: hpkg,
        hargaKloter: berat * hpkg,
        keterangan: k.keterangan || "-",
      };
    });
  } else {
    const jumlah = parseFloat(b.jumlah) || 0;
    const hargaPerKg = parseFloat(b.hargaPerKg) || 0;
    if (jumlah > 0 || hargaPerKg > 0) {
      dataKloter = [{
        no: 1,
        kloter: "Kloter 1",
        berat: jumlah,
        hargaPerKg: hargaPerKg,
        hargaKloter: jumlah * hargaPerKg,
        keterangan: "-",
      }];
    }
  }
  const validKloter = dataKloter.filter((k) => k.berat > 0 || k.hargaPerKg > 0);
  if (validKloter.length === 0) {
    alert("⚠️ Tidak ada data kloter untuk dicetak pada bahan ini.");
    return;
  }
  let totalBerat = 0;
  let totalHarga = 0;
  // totalHarga = Σ (beratKarung × hargaPerKg) = Σ hargaKloter per kloter
  validKloter.forEach((k) => {
    totalBerat += k.berat;
    totalHarga += k.hargaKloter;
  });
  const rataRata = totalBerat > 0 ? totalHarga / totalBerat : 0;

  const { jsPDF } = window.jspdf;
  // Ukuran kertas: 1.89in x 4in (48mm x 102mm)
  const PAGE_W = 48; // 1.89 inch = 48mm
  const PAGE_H = 102; // 4 inch = 102mm
  const MARGIN = 2;
  const CENTER = PAGE_W / 2;
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: [PAGE_W, PAGE_H] });
  // Gunakan tanggal masuk bahan, bukan tanggal saat cetak
  const tglMasuk = b.tanggalMasuk ? new Date(b.tanggalMasuk) : new Date();
  const tanggal = tglMasuk.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const fmtRp = (v) => "Rp" + Math.round(v).toLocaleString("id-ID");

  doc.setFillColor(0, 102, 93);
  doc.rect(0, 0, PAGE_W, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("INVOICE BAHAN", CENTER, 6, { align: "center" });
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.text("Argopuro Walida", CENTER, 11, { align: "center" });
  doc.text(`Tgl Masuk: ${tanggal}`, CENTER, 15, { align: "center" });
  doc.setTextColor(0, 0, 0);

  let yPos = 21;
  doc.setFontSize(6);
  doc.text(`ID: ${b.idBahan}`, MARGIN, yPos);
  yPos += 3;
  doc.text(`Pemasok: ${b.pemasok || "-"}`, MARGIN, yPos);
  yPos += 4;

  if (b.lunas) {
    doc.setTextColor(25, 135, 84);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.text("LUNAS", CENTER, yPos, { align: "center" });
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    yPos += 4;
  }

  doc.setFont("helvetica", "bold");
  doc.text("Detail Kloter", MARGIN, yPos);
  yPos += 3;
  doc.setDrawColor(180, 180, 180);
  doc.line(MARGIN, yPos, PAGE_W - MARGIN, yPos);
  yPos += 3;
  doc.setFontSize(5);
  doc.text("No", MARGIN, yPos);
  doc.text("Berat", MARGIN + 6, yPos);
  doc.text("Harga", MARGIN + 18, yPos);
  doc.text("Total", MARGIN + 30, yPos);
  yPos += 3;

  doc.setFont("helvetica", "normal");
  validKloter.forEach((row) => {
    if (yPos > PAGE_H - 18) {
      doc.addPage([PAGE_W, PAGE_H]);
      yPos = 8;
    }
    const hargaPerKg = row.hargaPerKg > 0 ? row.hargaPerKg : (b.hargaPerKg || 0);
    doc.setFontSize(5);
    doc.text(String(row.no), MARGIN, yPos);
    doc.text(row.berat.toFixed(1), MARGIN + 6, yPos);
    doc.text(fmtRp(hargaPerKg), MARGIN + 18, yPos);
    doc.text(fmtRp(row.hargaKloter), MARGIN + 30, yPos);
    yPos += 3;
  });

  yPos += 2;
  doc.setDrawColor(180, 180, 180);
  doc.line(MARGIN, yPos, PAGE_W - MARGIN, yPos);
  yPos += 4;
  doc.setFontSize(6);
  doc.setFont("helvetica", "bold");
  doc.text("Total Berat:", MARGIN, yPos);
  doc.text(`${totalBerat.toFixed(2)} kg`, PAGE_W - MARGIN, yPos, { align: "right" });
  yPos += 4;
  doc.text("Total Harga:", MARGIN, yPos);
  doc.text(fmtRp(totalHarga), PAGE_W - MARGIN, yPos, { align: "right" });
  yPos += 4;
  doc.text("Rata2/kg:", MARGIN, yPos);
  doc.text(fmtRp(rataRata), PAGE_W - MARGIN, yPos, { align: "right" });
  yPos += 5;
  doc.setFontSize(4);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(128, 128, 128);
  doc.text("Argopuro Walida", CENTER, PAGE_H - 3, { align: "center" });

  const now = new Date();
  const fileName = `Invoice_Bahan_${b.idBahan}_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}.pdf`;
  doc.save(fileName);
}

// Kumpulkan data kloter dari tabel (tanpa hargaPerKg per kloter)
function collectDetailKloter() {
  const tbody = document.getElementById("kloterForms");
  if (!tbody) return [];
  const detailKloter = [];
  tbody.querySelectorAll("tr").forEach((row, idx) => {
    const beratEl = row.querySelector(".berat-karung");
    const ketEl = row.querySelector(".keterangan");
    const berat = parseFloat(beratEl?.value) || 0;
    const keterangan = ketEl?.value?.trim() || "";
    if (berat > 0) {
      detailKloter.push({ kloter: idx + 1, berat, keterangan });
    }
  });
  return detailKloter;
}

// Fungsi untuk menyimpan bahan (tambah/edit) - model kloter Kalkulator Timbang
async function saveBahan() {
  const form = document.getElementById("formBahan");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const haccpBendaAsing = document.getElementById("haccpBendaAsing").checked;
  const haccpHamaJamur = document.getElementById("haccpHamaJamur").checked;
  const haccpKondisiBaik = document.getElementById("haccpKondisiBaik").checked;

  if (!haccpBendaAsing || !haccpHamaJamur || !haccpKondisiBaik) {
    alert("Semua checklist HACCP harus dicentang untuk dapat menyimpan data!");
    return;
  }

  const detailKloter = collectDetailKloter();
  const totalBerat = detailKloter.reduce((s, k) => s + k.berat, 0);
  const hargaPerKg = parseFloat(document.getElementById("hargaPerKgGlobal")?.value) || 0;

  if (totalBerat <= 0) {
    alert("Minimal 1 kloter dengan berat > 0. Silakan pilih jumlah kloter dan isi data.");
    return;
  }
  if (hargaPerKg <= 0) {
    alert("Harga per Kg harus diisi dan lebih dari 0.");
    document.getElementById("hargaPerKgGlobal")?.focus();
    return;
  }

  const totalHarga = totalBerat * hargaPerKg; // Total harga = hargaPerKg × total berat

  const bahanId = document.getElementById("bahanId").value;
  const idBahan = document.getElementById("idBahan").value;
  const pemasok = document.getElementById("pemasok").value;
  const varietas = document.getElementById("varietas").value;
  const jenisKopi = document.getElementById("jenisKopi").value;
  const tanggalMasuk = document.getElementById("tanggalMasuk").value;
  const kualitas = document.getElementById("kualitas").value;

  if (!window.API || !window.API.Bahan) {
    alert("❌ API.Bahan tidak tersedia. Pastikan backend aktif.");
    return;
  }

  const haccp = {
    bebasBendaAsing: haccpBendaAsing,
    bebasHamaJamur: haccpHamaJamur,
    kondisiBaik: haccpKondisiBaik,
  };

  const lunas = document.getElementById("bahanLunas")?.checked === true;

  try {
    const bahanData = {
      pemasok,
      varietas,
      jenisKopi,
      tanggalMasuk,
      kualitas,
      haccp,
      lunas,
      detailKloter,
      hargaPerKg, // Harga per kg diinput sekali (bukan per kloter)
    };

    let savedIdBahan = idBahan;
    if (bahanId) {
      bahanData.idBahan = idBahan;
      console.log("🔄 Updating bahan via API:", bahanId);
      await window.API.Bahan.update(bahanId, bahanData);
      console.log("✅ Bahan updated in MongoDB");
      
      // Tampilkan notifikasi update
      if (window.showNotification) {
        window.showNotification('update', 'Bahan', 'success');
      }
    } else {
      console.log("🔄 Creating bahan via API (kloter mode, idBahan auto-generated)");
      const result = await window.API.Bahan.create(bahanData);
      savedIdBahan = result?.idBahan || savedIdBahan;
      console.log("✅ Bahan created in MongoDB:", result);
      
      // Tampilkan notifikasi create
      if (window.showNotification) {
        window.showNotification('create', 'Bahan', 'success');
      }
    }

    await loadBahanData();
    await displayBahan();

    try {
      await updateKeuanganFromBahan(savedIdBahan, totalHarga, tanggalMasuk);
    } catch (e) {
      console.warn("⚠️ Auto-update keuangan skipped:", e);
    }

    window.dispatchEvent(new CustomEvent("dataUpdated", { detail: { type: "bahan" } }));

    const modal = bootstrap.Modal.getInstance(document.getElementById("modalBahan"));
    if (modal) modal.hide();

    form.reset();
    currentEditId = null;
    
    // Auto refresh halaman setelah save berhasil
    setTimeout(() => {
      window.location.reload();
    }, 500);
  } catch (error) {
    console.error("Error saving bahan:", error);
    // Tampilkan notifikasi error
    if (window.showNotification) {
      window.showNotification(bahanId ? 'update' : 'create', 'Bahan', 'error', 'Gagal menyimpan data: ' + (error.message || "Unknown error"));
    } else {
      alert("Error menyimpan data: " + (error.message || "Unknown error"));
    }
  }
}

// Fungsi untuk auto-update keuangan dari pembelian bahan baku (MONGODB ONLY)
async function updateKeuanganFromBahan(idBahan, totalPengeluaran, tanggal) {
  try {
    console.log("🔄 Auto-updating keuangan from bahan purchase:", {
      idBahan,
      totalPengeluaran,
      tanggal,
    });

    // VERIFY API AVAILABILITY - NO FALLBACK
    if (!window.API || !window.API.Keuangan) {
      console.warn(
        "⚠️ API.Keuangan not available, skipping auto-update keuangan"
      );
      return;
    }

    const dataKeuangan = {
      tanggal: tanggal,
      jenisPengeluaran: "Pembelian Bahan Baku",
      idBahanBaku: idBahan,
      notes: null,
      nilai: totalPengeluaran,
    };

    console.log("📤 Keuangan data to create/update:", dataKeuangan);

    // Cari apakah sudah ada record keuangan untuk bahan ini (MongoDB ONLY)
    const allKeuangan = await window.API.Keuangan.getAll();
    const existingKeuangan = allKeuangan.find(
      (k) =>
        k.idBahanBaku === idBahan &&
        k.jenisPengeluaran === "Pembelian Bahan Baku"
    );

    if (existingKeuangan) {
      // Update existing record (MongoDB)
      console.log(
        "🔄 Updating existing keuangan record via API:",
        existingKeuangan.id || existingKeuangan._id
      );
      await window.API.Keuangan.update(
        existingKeuangan.id || existingKeuangan._id,
        dataKeuangan
      );
      console.log("✅ Keuangan updated in MongoDB");
    } else {
      // Create new record (MongoDB)
      console.log("🔄 Creating new keuangan record via API");
      const result = await window.API.Keuangan.create(dataKeuangan);
      console.log("✅ Keuangan created in MongoDB:", result);
    }

    // Trigger event untuk update dashboard dan laporan
    window.dispatchEvent(
      new CustomEvent("dataUpdated", { detail: { type: "keuangan" } })
    );
    console.log("✅ Event 'dataUpdated' dispatched for keuangan");
  } catch (error) {
    console.error("❌ Error updating keuangan from bahan:", error);
    throw error; // Re-throw untuk memberi tahu caller bahwa ada error
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

// Fungsi untuk konfirmasi delete (MONGODB ONLY)
async function confirmDelete() {
  if (currentDeleteId) {
    try {
      // VERIFY API AVAILABILITY - NO FALLBACK
      if (!window.API || !window.API.Bahan) {
        const errorMsg =
          "❌ API.Bahan tidak tersedia. Tidak dapat menghapus data. Pastikan backend MongoDB aktif.";
        alert(errorMsg);
        throw new Error(errorMsg);
      }

      // Simpan idBahan untuk hapus keuangan terkait
      const deletedBahan = bahan.find(
        (b) =>
          b.id === currentDeleteId ||
          b._id === currentDeleteId ||
          String(b._id) === String(currentDeleteId)
      );

      // Delete via API (MongoDB ONLY)
      console.log("🔄 Deleting bahan via API:", currentDeleteId);
      await window.API.Bahan.delete(currentDeleteId);
      console.log("✅ Bahan deleted from MongoDB");

      // Tampilkan notifikasi delete
      if (window.showNotification) {
        window.showNotification('delete', 'Bahan', 'success');
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
      // Tampilkan notifikasi error
      if (window.showNotification) {
        window.showNotification('delete', 'Bahan', 'error', 'Gagal menghapus data: ' + (error.message || "Unknown error"));
      } else {
        alert("Error menghapus data: " + (error.message || "Unknown error"));
      }
    }
  }
}

// Fungsi untuk menghapus record keuangan terkait bahan baku (MONGODB ONLY)
async function deleteKeuanganFromBahan(idBahan) {
  try {
    if (!window.API || !window.API.Keuangan) {
      console.warn("⚠️ API.Keuangan not available, skipping delete keuangan");
      return;
    }

    const allKeuangan = await window.API.Keuangan.getAll();
    const keuanganToDelete = allKeuangan.filter(
      (k) =>
        k.idBahanBaku === idBahan &&
        k.jenisPengeluaran === "Pembelian Bahan Baku"
    );

    for (const k of keuanganToDelete) {
      console.log("🔄 Deleting keuangan record via API:", k.id || k._id);
      await window.API.Keuangan.delete(k.id || k._id);
    }
    console.log(
      `✅ Deleted ${keuanganToDelete.length} keuangan records from MongoDB`
    );

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

  // Load options dan bind kloter dropdown saat modal dibuka
  const modalBahan = document.getElementById("modalBahan");
  if (modalBahan) {
    modalBahan.addEventListener("show.bs.modal", () => {
      loadPemasokOptions();
      loadJenisKopiOptions();
      loadVarietasOptions();
      const kloterDropdown = document.getElementById("kloterTimbangan");
      if (kloterDropdown && !kloterDropdown.dataset.kloterBound) {
        kloterDropdown.dataset.kloterBound = "1";
        kloterDropdown.addEventListener("change", () => {
          renderKloterForms(kloterDropdown.value);
        });
      }
    });
  }
});
