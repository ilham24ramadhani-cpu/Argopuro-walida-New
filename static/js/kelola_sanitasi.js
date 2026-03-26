// Data sanitasi (MONGODB ONLY - NO localStorage fallback)
let sanitasi = [];
let currentEditId = null;
let currentDeleteId = null;
let sanitasiDataLoaded = false; // Flag untuk cache data

// Load data sanitasi dari MongoDB (API ONLY - NO fallback)
async function loadSanitasiData(forceReload = false) {
  // Jika data sudah dimuat dan tidak dipaksa reload, skip
  if (sanitasiDataLoaded && !forceReload && sanitasi.length > 0) {
    console.log("✅ Using cached sanitasi data");
    return;
  }

  try {
    console.log("🔄 Loading sanitasi data from MongoDB...");

    // Wait for window.API to be available (max 2 seconds)
    let retries = 0;
    while (!window.API && retries < 20) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      retries++;
    }

    // VERIFY API AVAILABILITY - NO FALLBACK
    if (!window.API || !window.API.Sanitasi) {
      const errorMsg =
        "❌ API.Sanitasi tidak tersedia. Backend MongoDB wajib aktif. Pastikan Flask server running dan api-service.js sudah di-load.";
      console.error(errorMsg);
      console.error("window.API:", window.API);
      alert(errorMsg);
      throw new Error(errorMsg);
    }

    console.log("✅ Using API.Sanitasi.getAll()");
    // Exclude fotos for initial table load to improve performance (fotos are large base64 strings)
    // Fotos will be loaded when viewing details
    sanitasi = await window.API.Sanitasi.getAll(true); // excludeFotos = true for faster loading
    console.log(
      `✅ Loaded ${sanitasi.length} sanitasi records from MongoDB (fotos excluded for performance)`
    );

    if (!Array.isArray(sanitasi)) {
      console.warn("⚠️ API returned non-array data, defaulting to empty array");
      sanitasi = [];
    }

    sanitasiDataLoaded = true; // Mark data as loaded
  } catch (error) {
    console.error("❌ Error loading sanitasi from MongoDB:", error);
    const errorMsg = `Error memuat data sanitasi dari MongoDB: ${
      error.message || "Unknown error"
    }. Pastikan backend Flask aktif.`;
    alert(errorMsg);
    sanitasi = [];
    sanitasiDataLoaded = false;
    throw error;
  }
}

// Definisi checklist untuk setiap tipe sanitasi
const checklistTemplates = {
  gudang: [
    "Lantai bersih & kering",
    "Dinding bersih tanpa jamur",
    "Saluran air lancar",
    "Ventilasi berfungsi dan bersih",
    "Ruangan tidak ada hama & hewan",
  ],
  peralatan: [
    "Alat & mesin bersih",
    "Tidak ada sisa bahan produksi atau benda asing",
    "Alat dalam kondisi baik & normal",
    "Air bersih",
  ],
  toilet: [
    "Toilet bersih & tidak berbau",
    "Tersedia sabun",
    "Air mengalir & bersih",
    "Tersedia pengering",
    "Tempat sampah tertutup",
  ],
  lingkungan: [
    "Area sekitar bersih dan bebas sampah",
    "Tidak ada bau menyengat",
    "Bebas genangan & sarang nyamuk",
    "Tidak ada tumpukan bahan atau benda asing",
    "Pest control",
  ],
};

// Nama tipe sanitasi untuk display
const tipeSanitasiNames = {
  gudang: "Sanitasi Gudang & Produksi",
  peralatan: "Sanitasi Peralatan Produksi",
  toilet: "Sanitasi Toilet & Cuci Tangan",
  lingkungan: "Sanitasi Lingkungan Sekitar",
};

// Load dan render tabel
async function loadTables() {
  // Load data sekali saja sebelum render semua tabel
  try {
    await loadSanitasiData();
  } catch (error) {
    console.error("Error loading sanitasi:", error);
    sanitasi = [];
    return; // Exit early if data loading fails
  }

  // Render semua tabel setelah data dimuat
  await loadTableByTipe("gudang");
  await loadTableByTipe("peralatan");
  await loadTableByTipe("toilet");
  await loadTableByTipe("lingkungan");
}

// Load tabel berdasarkan tipe
async function loadTableByTipe(tipe) {
  // Data sudah dimuat di loadTables(), tidak perlu load lagi
  // Hanya render tabel berdasarkan data yang sudah ada
  const tableBodyId = `tableBody${
    tipe.charAt(0).toUpperCase() + tipe.slice(1)
  }`;
  const tableBody = document.getElementById(tableBodyId);
  if (!tableBody) return;

  const filteredData = sanitasi.filter((s) => s.tipe === tipe);

  if (filteredData.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted py-4">
          Tidak ada data sanitasi
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filteredData
    .map((s, index) => {
      const statusBadge =
        s.status === "Complete"
          ? '<span class="badge bg-success">Complete</span>'
          : '<span class="badge bg-warning">Uncomplete</span>';

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${formatDate(s.tanggal)} ${s.waktu}</td>
          <td>${s.namaPetugas}</td>
          <td>${s.waktu}</td>
          <td>${statusBadge}</td>
          <td class="text-center">
            <button
              class="btn btn-sm btn-primary btn-action"
              onclick="editSanitasi(${s.id || s._id || `'${s._id}'`})"
              title="Edit"
            >
              <i class="bi bi-pencil"></i>
            </button>
            <button
              class="btn btn-sm btn-danger btn-action"
              onclick="deleteSanitasi(${s.id || s._id || `'${s._id}'`})"
              title="Hapus"
            >
              <i class="bi bi-trash"></i>
            </button>
            <button
              class="btn btn-sm btn-info btn-action"
              onclick="viewDetail(${s.id || s._id || `'${s._id}'`})"
              title="Detail"
            >
              <i class="bi bi-eye"></i>
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

// Format tanggal
function formatDate(dateString) {
  const date = new Date(dateString + "T00:00:00");
  const options = { year: "numeric", month: "long", day: "numeric" };
  return date.toLocaleDateString("id-ID", options);
}

// Change tipe sanitasi dan update checklist
// Make function available globally for inline calls (fallback)
window.changeTipeSanitasi = function () {
  console.log("🔧 changeTipeSanitasi() called");
  const tipeSelect = document.getElementById("tipeSanitasi");
  const checklistContent = document.getElementById("checklistContent");

  if (!tipeSelect) {
    console.error("❌ tipeSanitasi element not found");
    return;
  }

  if (!checklistContent) {
    console.error("❌ checklistContent element not found");
    console.error("   Attempting to find it in modal...");
    // Try to find it again after a delay (in case modal wasn't fully loaded)
    setTimeout(() => {
      const retryChecklist = document.getElementById("checklistContent");
      if (retryChecklist) {
        console.log("   ✅ Found checklistContent on retry");
        changeTipeSanitasi();
      } else {
        console.error("   ❌ checklistContent still not found");
      }
    }, 100);
    return;
  }

  const tipe = tipeSelect.value;
  console.log("   Selected tipe:", tipe || "(empty)");

  if (!tipe) {
    console.log("   No tipe selected, showing placeholder");
    checklistContent.innerHTML =
      '<p class="text-muted small"><i class="bi bi-info-circle me-1"></i>Pilih tipe sanitasi terlebih dahulu untuk menampilkan checklist</p>';
    if (window.updateStatus) {
      window.updateStatus();
    }
    return;
  }

  const checklistItems = checklistTemplates[tipe];
  console.log(
    "   Checklist items for",
    tipe + ":",
    checklistItems ? checklistItems.length + " items" : "NOT FOUND"
  );

  if (!checklistItems || checklistItems.length === 0) {
    console.error("❌ Checklist items not found for tipe:", tipe);
    checklistContent.innerHTML =
      '<p class="text-danger small">Tipe sanitasi tidak valid atau belum memiliki checklist</p>';
    if (window.updateStatus) {
      window.updateStatus();
    }
    return;
  }

  // Get existing checklist values if editing (support both id and _id)
  const existingChecklist = currentEditId
    ? sanitasi.find(
        (s) =>
          s.id === currentEditId ||
          s._id === currentEditId ||
          String(s._id) === String(currentEditId)
      )?.checklist || {}
    : {};

  // Get existing foto data if editing (support both id and _id)
  const existingFotos = currentEditId
    ? sanitasi.find(
        (s) =>
          s.id === currentEditId ||
          s._id === currentEditId ||
          String(s._id) === String(currentEditId)
      )?.fotos || {}
    : {};

  const checklistHTML = checklistItems
    .map((item, index) => {
      const isChecked = existingChecklist[item] || false;
      const existingFoto = existingFotos[item] || null;
      const safeItemId = item.replace(/[^a-zA-Z0-9]/g, "_");

      return `
        <div class="checklist-item-container mb-3 p-3 border rounded">
          <div class="d-flex align-items-start mb-2">
            <input
              type="checkbox"
              id="checklist_${index}"
              name="checklist"
              value="${item}"
              class="me-3 mt-1"
              ${isChecked ? "checked" : ""}
              onchange="if(window.updateStatus) window.updateStatus(); if(window.toggleFotoInput) window.toggleFotoInput('${safeItemId}', this.checked)"
              style="width: 18px; height: 18px; cursor: pointer;"
            />
            <label for="checklist_${index}" class="flex-grow-1" style="cursor: pointer; font-weight: 500;">
              ${item}
            </label>
          </div>
          
          <!-- Foto Input untuk item ini -->
          <div id="fotoContainer_${safeItemId}" class="mt-2 ${
        isChecked ? "" : "d-none"
      }">
            <label for="foto_${safeItemId}" class="form-label small">
              Upload Foto Bukti
            </label>
            <input
              type="file"
              class="form-control form-control-sm"
              id="foto_${safeItemId}"
              name="foto_${safeItemId}"
              accept="image/*"
              onchange="if(window.previewChecklistImage) window.previewChecklistImage('${safeItemId}', this)"
              data-item="${item}"
            />
            <small class="text-muted">Upload foto sebagai bukti untuk item ini</small>
            
            <!-- Preview Foto -->
            <div id="fotoPreview_${safeItemId}" class="mt-2">
              ${
                existingFoto
                  ? `<img src="${existingFoto}" alt="Preview" class="checklist-preview-img" style="max-width: 200px; max-height: 200px; border-radius: 4px;" /><br><button type="button" class="btn btn-sm btn-danger mt-1" onclick="if(window.removeFoto) window.removeFoto('${safeItemId}')">Hapus Foto</button>`
                  : ""
              }
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  checklistContent.innerHTML = checklistHTML;
  console.log("✅ Checklist HTML rendered:", checklistItems.length, "items");

  // Verify checkboxes were actually rendered
  const renderedCheckboxes = document.querySelectorAll(
    '#checklistContent input[type="checkbox"]'
  );
  console.log(
    "   ✅ Verification: Found",
    renderedCheckboxes.length,
    "checkboxes in DOM"
  );
  if (renderedCheckboxes.length === 0) {
    console.error("   ❌ WARNING: No checkboxes found after rendering!");
  }

  if (window.updateStatus) {
    window.updateStatus();
  }
};

// Update status berdasarkan checklist - Make available globally
window.updateStatus = function () {
  const checkboxes = document.querySelectorAll(
    '#checklistContent input[type="checkbox"]'
  );
  const statusDisplay = document.getElementById("statusDisplay");

  if (checkboxes.length === 0) {
    statusDisplay.textContent = "Uncomplete";
    statusDisplay.className = "badge bg-secondary";
    return;
  }

  const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
  const anyChecked = Array.from(checkboxes).some((cb) => cb.checked);

  if (allChecked && checkboxes.length > 0) {
    statusDisplay.textContent = "Complete";
    statusDisplay.className = "badge bg-success";
  } else if (anyChecked) {
    statusDisplay.textContent = "Uncomplete";
    statusDisplay.className = "badge bg-warning";
  } else {
    statusDisplay.textContent = "Uncomplete";
    statusDisplay.className = "badge bg-secondary";
  }
};
const updateStatus = window.updateStatus;

// Toggle foto input berdasarkan checkbox - Make available globally
window.toggleFotoInput = function (itemId, isChecked) {
  const fotoContainer = document.getElementById(`fotoContainer_${itemId}`);
  if (fotoContainer) {
    if (isChecked) {
      fotoContainer.classList.remove("d-none");
    } else {
      fotoContainer.classList.add("d-none");
      // Clear foto input when unchecked
      const fotoInput = document.getElementById(`foto_${itemId}`);
      if (fotoInput) {
        fotoInput.value = "";
      }
      const fotoPreview = document.getElementById(`fotoPreview_${itemId}`);
      if (fotoPreview) {
        fotoPreview.innerHTML = "";
      }
    }
  }
};
const toggleFotoInput = window.toggleFotoInput;

// Preview image untuk checklist item - Make available globally
window.previewChecklistImage = function (itemId, input) {
  const preview = document.getElementById(`fotoPreview_${itemId}`);
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function (e) {
      preview.innerHTML = `
        <img src="${e.target.result}" alt="Preview" class="checklist-preview-img" />
        <button type="button" class="btn btn-sm btn-danger mt-1" onclick="removeFoto('${itemId}')">Hapus Foto</button>
      `;
    };
    reader.readAsDataURL(input.files[0]);
  } else {
    preview.innerHTML = "";
  }
};
const previewChecklistImage = window.previewChecklistImage;

// Remove foto - Make available globally
window.removeFoto = function (itemId) {
  const fotoInput = document.getElementById(`foto_${itemId}`);
  const fotoPreview = document.getElementById(`fotoPreview_${itemId}`);
  if (fotoInput) {
    fotoInput.value = "";
    // Trigger change event to clear the preview
    fotoInput.dispatchEvent(new Event("change"));
  }
  if (fotoPreview) {
    fotoPreview.innerHTML = "";
  }
  // Note: The foto will be removed from data when saving if input is empty
};
const removeFoto = window.removeFoto;

// Open modal - Make available globally
window.openModal = function (mode) {
  currentEditId = null;
  resetForm();
  const modalElement = document.getElementById("modalSanitasi");

  if (!modalElement) {
    console.error("❌ Modal element not found");
    return;
  }

  const modal = new bootstrap.Modal(modalElement);

  // Show modal - checklist will appear when user selects tipe sanitasi from dropdown
  modal.show();

  // Set placeholder message for checklist (will be replaced when tipe is selected)
  setTimeout(() => {
    const checklistContent = document.getElementById("checklistContent");
    if (checklistContent && !checklistContent.innerHTML.trim()) {
      checklistContent.innerHTML =
        '<p class="text-muted small">Pilih tipe sanitasi terlebih dahulu untuk menampilkan checklist</p>';
    }
  }, 100);
};
const openModal = window.openModal;

// Reset form
function resetForm() {
  const form = document.getElementById("formSanitasi");
  const checklistContent = document.getElementById("checklistContent");
  const statusDisplay = document.getElementById("statusDisplay");
  const modalLabel = document.getElementById("modalSanitasiLabel");

  if (form) form.reset();
  if (document.getElementById("sanitasiId")) {
    document.getElementById("sanitasiId").value = "";
  }

  // Clear checklist content but DON'T render yet (will be rendered after modal shown)
  if (checklistContent) {
    checklistContent.innerHTML = "";
  }

  if (statusDisplay) {
    statusDisplay.textContent = "Uncomplete";
    statusDisplay.className = "badge bg-secondary";
  }

  if (modalLabel) {
    modalLabel.textContent = "Tambah Sanitasi";
  }

  currentEditId = null;
}

// Close modal and refresh page - Make available globally
window.closeModalAndRefresh = function () {
  resetForm();
  // Refresh halaman setelah modal ditutup
  setTimeout(() => {
    window.location.reload();
  }, 200);
};
const closeModalAndRefresh = window.closeModalAndRefresh;

// Edit sanitasi - Make available globally
window.editSanitasi = async function (id) {
  try {
    await loadSanitasiData();
    const data = sanitasi.find((s) => s.id === id || s._id === id);
    if (!data) {
      alert("Data sanitasi tidak ditemukan!");
      return;
    }

    currentEditId = id;
    const modalElement = document.getElementById("modalSanitasi");

    // Set form values BEFORE opening modal
    if (document.getElementById("sanitasiId")) {
      document.getElementById("sanitasiId").value = id;
    }
    if (document.getElementById("tanggalSanitasi")) {
      document.getElementById("tanggalSanitasi").value = data.tanggal;
    }
    if (document.getElementById("waktuSanitasi")) {
      document.getElementById("waktuSanitasi").value = data.waktu;
    }

    const tipeSelect = document.getElementById("tipeSanitasi");
    if (tipeSelect && data.tipe) {
      tipeSelect.value = data.tipe;
    }

    if (document.getElementById("namaPetugas")) {
      document.getElementById("namaPetugas").value = data.namaPetugas;
    }

    // Update modal title
    if (document.getElementById("modalSanitasiLabel")) {
      document.getElementById("modalSanitasiLabel").textContent =
        "Edit Sanitasi";
    }

    const modal = new bootstrap.Modal(modalElement);

    // Load checklist AFTER modal is fully shown (since tipe is already set)
    const handleModalShown = function () {
      console.log(
        "🔍 Edit modal shown - loading checklist with existing data..."
      );
      setTimeout(() => {
        // Render checklist since tipe is already set
        if (window.changeTipeSanitasi) {
          window.changeTipeSanitasi();
          const renderedCheckboxes = document.querySelectorAll(
            '#checklistContent input[type="checkbox"]'
          );
          console.log(
            "   ✅ Checklist rendered for edit:",
            renderedCheckboxes.length,
            "items"
          );
        } else {
          console.error("   ❌ changeTipeSanitasi function not found!");
        }
      }, 100);
      modalElement.removeEventListener("shown.bs.modal", handleModalShown);
    };

    modalElement.addEventListener("shown.bs.modal", handleModalShown, {
      once: true,
    });
    modal.show();
  } catch (error) {
    console.error("Error loading sanitasi for edit:", error);
    alert("Error memuat data sanitasi");
  }
};
const editSanitasi = window.editSanitasi;

// Delete sanitasi - Make available globally
window.deleteSanitasi = async function (id) {
  try {
    await loadSanitasiData();
    const data = sanitasi.find((s) => s.id === id || s._id === id);
    if (!data) {
      alert("Data sanitasi tidak ditemukan!");
      return;
    }

    currentDeleteId = id;
    document.getElementById("deleteSanitasiInfo").textContent = `${
      tipeSanitasiNames[data.tipe]
    } - ${data.namaPetugas} - ${formatDate(data.tanggal)}`;

    const modal = new bootstrap.Modal(document.getElementById("modalDelete"));
    modal.show();
  } catch (error) {
    console.error("Error loading sanitasi for delete:", error);
    alert("Error memuat data sanitasi");
  }
};
const deleteSanitasi = window.deleteSanitasi;

// Confirm delete - Make available globally
window.confirmDelete = async function () {
  if (!currentDeleteId) return;

  try {
    // VERIFY API AVAILABILITY - NO FALLBACK
    if (!window.API || !window.API.Sanitasi) {
      const errorMsg =
        "❌ API.Sanitasi tidak tersedia. Tidak dapat menghapus data. Pastikan backend MongoDB aktif.";
      alert(errorMsg);
      throw new Error(errorMsg);
    }

    console.log("🔄 Deleting sanitasi via API:", currentDeleteId);
    await window.API.Sanitasi.delete(currentDeleteId);
    console.log("✅ Sanitasi deleted from MongoDB");

    // Tampilkan notifikasi delete
    if (window.showNotification) {
      window.showNotification('delete', 'Sanitasi', 'success');
    }

    await loadSanitasiData(true); // Force reload setelah delete
    await loadTables();

    // Trigger event untuk update dashboard
    window.dispatchEvent(
      new CustomEvent("dataUpdated", { detail: { type: "sanitasi" } })
    );

    const modal = bootstrap.Modal.getInstance(
      document.getElementById("modalDelete")
    );
    modal.hide();

    currentDeleteId = null;
    // Notifikasi sudah ditampilkan di atas, tidak perlu showAlert lagi
  } catch (error) {
    console.error("Error deleting sanitasi:", error);
    // Tampilkan notifikasi error
    if (window.showNotification) {
      window.showNotification('delete', 'Sanitasi', 'error', 'Gagal menghapus data: ' + (error.message || "Unknown error"));
    } else {
      alert("Error menghapus data: " + (error.message || "Unknown error"));
    }
  }
};
const confirmDelete = window.confirmDelete;

// View detail - Make available globally
window.viewDetail = async function (id) {
  try {
    // Load full data with fotos for detail view
    await loadSanitasiData(true); // Force reload to get fotos
    // If data doesn't have fotos, reload with fotos included
    let data = sanitasi.find((s) => s.id === id || s._id === id);
    if (data && (!data.fotos || Object.keys(data.fotos || {}).length === 0)) {
      // Reload with fotos if not present
      sanitasi = await window.API.Sanitasi.getAll(false); // Include fotos
      data = sanitasi.find((s) => s.id === id || s._id === id);
    }
    if (!data) {
      console.warn("Data sanitasi tidak ditemukan untuk id:", id);
      return;
    }

    const checklistItems = Object.entries(data.checklist)
      .map(([key, value]) => {
        const icon = value
          ? '<i class="bi bi-check-circle-fill text-success"></i>'
          : '<i class="bi bi-x-circle-fill text-danger"></i>';
        const foto =
          data.fotos && data.fotos[key]
            ? `<div class="mt-2"><img src="${data.fotos[key]}" alt="Foto ${key}" class="img-fluid" style="max-width: 200px; border-radius: 8px;" /></div>`
            : '<span class="text-muted small">(Tidak ada foto)</span>';
        return `<li class="mb-3">
        <div>${icon} <strong>${key}</strong></div>
        ${value ? foto : ""}
      </li>`;
      })
      .join("");

    const statusBadge =
      data.status === "Complete"
        ? '<span class="badge bg-success">Complete</span>'
        : '<span class="badge bg-warning">Uncomplete</span>';

    const detailHtml = `
    <div class="row">
      <div class="col-md-6">
        <p><strong>Tanggal:</strong> ${formatDate(data.tanggal)}</p>
        <p><strong>Waktu/Shift:</strong> ${data.waktu}</p>
        <p><strong>Tipe Sanitasi:</strong> ${tipeSanitasiNames[data.tipe]}</p>
        <p><strong>Nama Petugas:</strong> ${data.namaPetugas}</p>
        <p><strong>Status:</strong> ${statusBadge}</p>
      </div>
      <div class="col-md-12">
        <p><strong>Checklist & Foto Bukti:</strong></p>
        <ul class="list-unstyled">${checklistItems}</ul>
      </div>
    </div>
  `;

    // Create and show modal for detail
    const detailModal = document.createElement("div");
    detailModal.className = "modal fade";
    detailModal.innerHTML = `
    <div class="modal-dialog modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Detail Sanitasi</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          ${detailHtml}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Tutup</button>
        </div>
      </div>
    </div>
  `;
    document.body.appendChild(detailModal);
    const modal = new bootstrap.Modal(detailModal);
    modal.show();
    detailModal.addEventListener("hidden.bs.modal", () => {
      document.body.removeChild(detailModal);
    });
  } catch (error) {
    console.error("Error loading sanitasi detail:", error);
    alert(
      "Error memuat detail sanitasi: " + (error.message || "Unknown error")
    );
  }
};
const viewDetail = window.viewDetail;

// Save sanitasi - Make available globally
window.saveSanitasi = async function () {
  const form = document.getElementById("formSanitasi");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const tipe = document.getElementById("tipeSanitasi").value;
  if (!tipe) {
    showAlert("Pilih tipe sanitasi terlebih dahulu", "warning");
    return;
  }

  // Get checklist values
  const checkboxes = document.querySelectorAll(
    '#checklistContent input[type="checkbox"]'
  );
  const checklist = {};
  checkboxes.forEach((cb) => {
    checklist[cb.value] = cb.checked;
  });

  // Calculate status
  const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
  const status =
    allChecked && checkboxes.length > 0 ? "Complete" : "Uncomplete";

  // Get existing fotos if editing (support both id and _id)
  const existingFotos = currentEditId
    ? sanitasi.find(
        (s) =>
          s.id === currentEditId ||
          s._id === currentEditId ||
          String(s._id) === String(currentEditId)
      )?.fotos || {}
    : {};

  // Get all foto inputs
  const fotoInputs = document.querySelectorAll(
    '#checklistContent input[type="file"]'
  );
  const fotoPromises = [];
  const fotos = {};

  // Process checklist items and their fotos
  Object.keys(checklist).forEach((item) => {
    // Only process checked items
    if (checklist[item]) {
      const safeItemId = item.replace(/[^a-zA-Z0-9]/g, "_");
      const fotoInput = document.getElementById(`foto_${safeItemId}`);

      // If there's a new file upload, use it
      if (fotoInput && fotoInput.files && fotoInput.files[0]) {
        const promise = new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = function (e) {
            fotos[item] = e.target.result;
            resolve();
          };
          reader.readAsDataURL(fotoInput.files[0]);
        });
        fotoPromises.push(promise);
      }
      // Otherwise, keep existing foto if editing
      else if (currentEditId && existingFotos[item]) {
        fotos[item] = existingFotos[item];
      }
    }
    // If item is unchecked, don't include its foto (it will be removed)
  });

  // Wait for all foto uploads to complete, then save
  if (fotoPromises.length > 0) {
    await Promise.all(fotoPromises);
    await saveData(null, fotos);
  } else {
    await saveData(null, fotos);
  }
};

// Save data to MongoDB (API ONLY - NO localStorage fallback)
async function saveData(foto, fotos) {
  // VERIFY API AVAILABILITY - NO FALLBACK
  if (!window.API || !window.API.Sanitasi) {
    const errorMsg =
      "❌ API.Sanitasi tidak tersedia. Tidak dapat menyimpan data. Pastikan backend MongoDB aktif.";
    console.error(errorMsg);
    alert(errorMsg);
    throw new Error(errorMsg);
  }

  const tanggal = document.getElementById("tanggalSanitasi").value;
  const waktu = document.getElementById("waktuSanitasi").value;
  const tipe = document.getElementById("tipeSanitasi").value;
  const namaPetugas = document.getElementById("namaPetugas").value;

  // Get checklist values
  const checkboxes = document.querySelectorAll(
    '#checklistContent input[type="checkbox"]'
  );
  const checklist = {};
  checkboxes.forEach((cb) => {
    checklist[cb.value] = cb.checked;
  });

  // Calculate status
  const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
  const status =
    allChecked && checkboxes.length > 0 ? "Complete" : "Uncomplete";

  try {
    // Prepare data WITHOUT id (backend will generate it)
    const data = {
      tanggal: tanggal,
      waktu: waktu,
      tipe: tipe,
      namaPetugas: namaPetugas,
      fotos: fotos || {}, // Store fotos per checklist item
      checklist: checklist,
      status: status,
    };

    if (currentEditId) {
      // Edit mode - Update via API (MongoDB ONLY)
      console.log("🔄 Updating sanitasi via API:", currentEditId);
      await window.API.Sanitasi.update(currentEditId, data);
      console.log("✅ Sanitasi updated in MongoDB");
      
      // Tampilkan notifikasi update
      if (window.showNotification) {
        window.showNotification('update', 'Sanitasi', 'success');
      }
    } else {
      // Add mode - Create via API (MongoDB ONLY)
      // NOTE: Backend will generate ID automatically via get_next_id('sanitasi')
      console.log("🔄 Creating sanitasi via API (backend will generate ID)");
      const result = await window.API.Sanitasi.create(data);
      console.log("✅ Sanitasi created in MongoDB:", result);
      
      // Tampilkan notifikasi create
      if (window.showNotification) {
        window.showNotification('create', 'Sanitasi', 'success');
      }
    }

    await loadSanitasiData(true); // Force reload setelah save
    await loadTables();

    // Trigger event untuk update dashboard
    window.dispatchEvent(
      new CustomEvent("dataUpdated", { detail: { type: "sanitasi" } })
    );

    const modal = bootstrap.Modal.getInstance(
      document.getElementById("modalSanitasi")
    );
    modal.hide();

    resetForm();
    
    // Auto refresh halaman setelah save berhasil
    setTimeout(() => {
      window.location.reload();
    }, 500);
  } catch (error) {
    console.error("Error saving sanitasi:", error);
    // Tampilkan notifikasi error
    if (window.showNotification) {
      window.showNotification(currentEditId ? 'update' : 'create', 'Sanitasi', 'error', 'Gagal menyimpan data: ' + (error.message || "Unknown error"));
    } else {
      alert("Error menyimpan data: " + (error.message || "Unknown error"));
    }
  }
}
const saveSanitasi = window.saveSanitasi;

// Show alert
function showAlert(message, type) {
  const alertDiv = document.createElement("div");
  alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3`;
  alertDiv.style.zIndex = "9999";
  alertDiv.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;
  document.body.appendChild(alertDiv);

  setTimeout(() => {
    alertDiv.remove();
  }, 3000);
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", function () {
  setTimeout(async () => {
    try {
      await loadTables();
    } catch (error) {
      console.error("Error initializing sanitasi page:", error);
    }
  }, 100);

  // Set default date/time when modal opens (BEFORE modal is shown)
  const modalElement = document.getElementById("modalSanitasi");
  if (modalElement) {
    // Handle modal show event (before modal is displayed) - set defaults only
    modalElement.addEventListener("show.bs.modal", function () {
      if (!currentEditId) {
        // Set default date to today
        const today = new Date().toISOString().split("T")[0];
        const tanggalInput = document.getElementById("tanggalSanitasi");
        if (tanggalInput) {
          tanggalInput.value = today;
        }

        // Set default time to current time
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, "0");
        const minutes = String(now.getMinutes()).padStart(2, "0");
        const waktuInput = document.getElementById("waktuSanitasi");
        if (waktuInput) {
          waktuInput.value = `${hours}:${minutes}`;
        }
      }
    });

    // Note: Checklist rendering is handled in openModal() and editSanitasi() functions
    // via "shown.bs.modal" event to ensure DOM is ready
  }

  // Switch tab event listener untuk reload tabel saat tab berubah
  const tabButtons = document.querySelectorAll(
    '#sanitasiTabs button[data-bs-toggle="tab"]'
  );
  tabButtons.forEach((button) => {
    button.addEventListener("shown.bs.tab", function (e) {
      const targetTab = e.target.getAttribute("data-bs-target");
      // Tabel sudah di-load di loadTables(), tidak perlu reload lagi
    });
  });

  // Attach event listener to tipeSanitasi dropdown
  const tipeSelect = document.getElementById("tipeSanitasi");
  if (tipeSelect) {
    console.log("✅ Attaching event listener to tipeSanitasi dropdown");
    tipeSelect.addEventListener("change", function () {
      console.log("🔄 Dropdown change event triggered");
      changeTipeSanitasi();
    });
  } else {
    console.warn("⚠️ tipeSanitasi dropdown not found during DOMContentLoaded");
  }
});

// Search functionality
document.addEventListener("DOMContentLoaded", function () {
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", function (e) {
      const searchTerm = e.target.value.toLowerCase();
      // Implement search logic if needed
    });
  }
});
