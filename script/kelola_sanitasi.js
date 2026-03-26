// Data sanitasi (menggunakan API Service dengan fallback ke localStorage)
let sanitasi = [];
let currentEditId = null;
let currentDeleteId = null;

// Load data sanitasi dari API atau localStorage
async function loadSanitasiData() {
  try {
    if (window.API && window.API.Sanitasi) {
      sanitasi = await window.API.Sanitasi.getAll();
    } else {
      // Fallback ke localStorage jika API belum tersedia
      sanitasi = JSON.parse(localStorage.getItem("sanitasi") || "[]");
      
      // Inisialisasi data contoh jika kosong
      if (sanitasi.length === 0 && !localStorage.getItem("sanitasi")) {
        sanitasi = [
          {
            id: 1,
            tanggal: "2024-01-25",
            waktu: "08:00",
            tipe: "gudang",
            namaPetugas: "Ahmad Rizki",
            fotos: {},
            checklist: {
              "Lantai bersih & kering": true,
              "Dinding bersih tanpa jamur": true,
              "Saluran air lancar": true,
              "Ventilasi berfungsi dan bersih": true,
              "Ruangan tidak ada hama & hewan": true
            },
            status: "Complete"
          },
          {
            id: 2,
            tanggal: "2024-01-25",
            waktu: "14:00",
            tipe: "peralatan",
            namaPetugas: "Budi Santoso",
            fotos: {},
            checklist: {
              "Alat & mesin bersih": true,
              "Tidak ada sisa bahan produksi atau benda asing": true,
              "Alat dalam kondisi baik & normal": false,
              "Air bersih": true
            },
            status: "Uncomplete"
          }
        ];
        localStorage.setItem("sanitasi", JSON.stringify(sanitasi));
      }
    }
  } catch (error) {
    console.error("Error loading sanitasi:", error);
    sanitasi = JSON.parse(localStorage.getItem("sanitasi") || "[]");
  }
}

// Definisi checklist untuk setiap tipe sanitasi
const checklistTemplates = {
  gudang: [
    "Lantai bersih & kering",
    "Dinding bersih tanpa jamur",
    "Saluran air lancar",
    "Ventilasi berfungsi dan bersih",
    "Ruangan tidak ada hama & hewan"
  ],
  peralatan: [
    "Alat & mesin bersih",
    "Tidak ada sisa bahan produksi atau benda asing",
    "Alat dalam kondisi baik & normal",
    "Air bersih"
  ],
  toilet: [
    "Toilet bersih & tidak berbau",
    "Tersedia sabun",
    "Air mengalir & bersih",
    "Tersedia pengering",
    "Tempat sampah tertutup"
  ],
  lingkungan: [
    "Area sekitar bersih dan bebas sampah",
    "Tidak ada bau menyengat",
    "Bebas genangan & sarang nyamuk",
    "Tidak ada tumpukan bahan atau benda asing",
    "Pest control"
  ]
};

// Nama tipe sanitasi untuk display
const tipeSanitasiNames = {
  gudang: "Sanitasi Gudang & Produksi",
  peralatan: "Sanitasi Peralatan Produksi",
  toilet: "Sanitasi Toilet & Cuci Tangan",
  lingkungan: "Sanitasi Lingkungan Sekitar"
};

// Load dan render tabel
async function loadTables() {
  await loadTableByTipe("gudang");
  await loadTableByTipe("peralatan");
  await loadTableByTipe("toilet");
  await loadTableByTipe("lingkungan");
}

// Load tabel berdasarkan tipe
async function loadTableByTipe(tipe) {
  try {
    await loadSanitasiData();
  } catch (error) {
    console.error("Error loading sanitasi:", error);
    sanitasi = [];
  }
  const tableBodyId = `tableBody${tipe.charAt(0).toUpperCase() + tipe.slice(1)}`;
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
function changeTipeSanitasi() {
  const tipe = document.getElementById("tipeSanitasi").value;
  const checklistContent = document.getElementById("checklistContent");
  
  if (!tipe) {
    checklistContent.innerHTML = "";
    updateStatus();
    return;
  }

  const checklistItems = checklistTemplates[tipe];
  if (!checklistItems) return;

  // Get existing checklist values if editing
  const existingChecklist = currentEditId
    ? sanitasi.find((s) => s.id === currentEditId)?.checklist || {}
    : {};

  // Get existing foto data if editing
  const existingFotos = currentEditId
    ? sanitasi.find((s) => s.id === currentEditId)?.fotos || {}
    : {};

  checklistContent.innerHTML = checklistItems
    .map((item, index) => {
      const isChecked = existingChecklist[item] || false;
      const existingFoto = existingFotos[item] || null;
      const safeItemId = item.replace(/[^a-zA-Z0-9]/g, '_');
      
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
              onchange="updateStatus(); toggleFotoInput('${safeItemId}', this.checked)"
              style="width: 18px; height: 18px; cursor: pointer;"
            />
            <label for="checklist_${index}" class="flex-grow-1" style="cursor: pointer; font-weight: 500;">
              ${item}
            </label>
          </div>
          
          <!-- Foto Input untuk item ini -->
          <div id="fotoContainer_${safeItemId}" class="mt-2 ${isChecked ? '' : 'd-none'}">
            <label for="foto_${safeItemId}" class="form-label small">
              Upload Foto Bukti
            </label>
            <input
              type="file"
              class="form-control form-control-sm"
              id="foto_${safeItemId}"
              name="foto_${safeItemId}"
              accept="image/*"
              onchange="previewChecklistImage('${safeItemId}', this)"
              data-item="${item}"
            />
            <small class="text-muted">Upload foto sebagai bukti untuk item ini</small>
            
            <!-- Preview Foto -->
            <div id="fotoPreview_${safeItemId}" class="mt-2">
              ${existingFoto ? `<img src="${existingFoto}" alt="Preview" class="checklist-preview-img" /><br><button type="button" class="btn btn-sm btn-danger mt-1" onclick="removeFoto('${safeItemId}')">Hapus Foto</button>` : ''}
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  updateStatus();
}

// Update status berdasarkan checklist
function updateStatus() {
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
}

// Toggle foto input berdasarkan checkbox
function toggleFotoInput(itemId, isChecked) {
  const fotoContainer = document.getElementById(`fotoContainer_${itemId}`);
  if (fotoContainer) {
    if (isChecked) {
      fotoContainer.classList.remove('d-none');
    } else {
      fotoContainer.classList.add('d-none');
      // Clear foto input when unchecked
      const fotoInput = document.getElementById(`foto_${itemId}`);
      if (fotoInput) {
        fotoInput.value = '';
      }
      const fotoPreview = document.getElementById(`fotoPreview_${itemId}`);
      if (fotoPreview) {
        fotoPreview.innerHTML = '';
      }
    }
  }
}

// Preview image untuk checklist item
function previewChecklistImage(itemId, input) {
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
    preview.innerHTML = '';
  }
}

// Remove foto
function removeFoto(itemId) {
  const fotoInput = document.getElementById(`foto_${itemId}`);
  const fotoPreview = document.getElementById(`fotoPreview_${itemId}`);
  if (fotoInput) {
    fotoInput.value = '';
    // Trigger change event to clear the preview
    fotoInput.dispatchEvent(new Event('change'));
  }
  if (fotoPreview) {
    fotoPreview.innerHTML = '';
  }
  // Note: The foto will be removed from data when saving if input is empty
}

// Open modal
function openModal(mode) {
  currentEditId = null;
  resetForm();
  const modal = new bootstrap.Modal(document.getElementById("modalSanitasi"));
  modal.show();
}

// Reset form
function resetForm() {
  document.getElementById("formSanitasi").reset();
  document.getElementById("sanitasiId").value = "";
  document.getElementById("checklistContent").innerHTML = "";
  document.getElementById("statusDisplay").textContent = "Uncomplete";
  document.getElementById("statusDisplay").className = "badge bg-secondary";
  document.getElementById("modalSanitasiLabel").textContent = "Tambah Sanitasi";
  currentEditId = null;
}

// Close modal and refresh page
function closeModalAndRefresh() {
  resetForm();
  // Refresh halaman setelah modal ditutup
  setTimeout(() => {
    window.location.reload();
  }, 200);
}

// Edit sanitasi
async function editSanitasi(id) {
  try {
    await loadSanitasiData();
    const data = sanitasi.find((s) => s.id === id || s._id === id);
    if (!data) {
      alert("Data sanitasi tidak ditemukan!");
      return;
    }

    currentEditId = id;
    document.getElementById("sanitasiId").value = id;
  document.getElementById("tanggalSanitasi").value = data.tanggal;
  document.getElementById("waktuSanitasi").value = data.waktu;
  document.getElementById("tipeSanitasi").value = data.tipe;
  document.getElementById("namaPetugas").value = data.namaPetugas;

  // Update modal title
  document.getElementById("modalSanitasiLabel").textContent = "Edit Sanitasi";

  // Load checklist setelah set tipe (gunakan setTimeout untuk memastikan DOM sudah update)
  setTimeout(() => {
    changeTipeSanitasi();
  }, 100);

    const modal = new bootstrap.Modal(document.getElementById("modalSanitasi"));
    modal.show();
  } catch (error) {
    console.error("Error loading sanitasi for edit:", error);
    alert("Error memuat data sanitasi");
  }
}

// Delete sanitasi
async function deleteSanitasi(id) {
  try {
    await loadSanitasiData();
    const data = sanitasi.find((s) => s.id === id || s._id === id);
    if (!data) {
      alert("Data sanitasi tidak ditemukan!");
      return;
    }

    currentDeleteId = id;
  document.getElementById("deleteSanitasiInfo").textContent = 
    `${tipeSanitasiNames[data.tipe]} - ${data.namaPetugas} - ${formatDate(data.tanggal)}`;

    const modal = new bootstrap.Modal(document.getElementById("modalDelete"));
    modal.show();
  } catch (error) {
    console.error("Error loading sanitasi for delete:", error);
    alert("Error memuat data sanitasi");
  }
}

// Confirm delete
async function confirmDelete() {
  if (!currentDeleteId) return;

  try {
    // Delete via API
    if (window.API && window.API.Sanitasi) {
      await window.API.Sanitasi.delete(currentDeleteId);
    } else {
      // Fallback to localStorage
      sanitasi = sanitasi.filter((s) => s.id !== currentDeleteId && s._id !== currentDeleteId);
      localStorage.setItem("sanitasi", JSON.stringify(sanitasi));
    }

    await loadSanitasiData();
    await loadTables();

  // Trigger event untuk update dashboard
  window.dispatchEvent(new CustomEvent("dataUpdated", { detail: { type: "sanitasi" } }));

  const modal = bootstrap.Modal.getInstance(document.getElementById("modalDelete"));
  modal.hide();

    currentDeleteId = null;
    showAlert("Data sanitasi berhasil dihapus", "success");
  } catch (error) {
    console.error("Error deleting sanitasi:", error);
    alert("Error menghapus data: " + (error.message || "Unknown error"));
  }
}

// View detail
async function viewDetail(id) {
  try {
    await loadSanitasiData();
    const data = sanitasi.find((s) => s.id === id || s._id === id);
  if (!data) return;

  const checklistItems = Object.entries(data.checklist)
    .map(([key, value]) => {
      const icon = value ? '<i class="bi bi-check-circle-fill text-success"></i>' : '<i class="bi bi-x-circle-fill text-danger"></i>';
      const foto = data.fotos && data.fotos[key] 
        ? `<div class="mt-2"><img src="${data.fotos[key]}" alt="Foto ${key}" class="img-fluid" style="max-width: 200px; border-radius: 8px;" /></div>`
        : '<span class="text-muted small">(Tidak ada foto)</span>';
      return `<li class="mb-3">
        <div>${icon} <strong>${key}</strong></div>
        ${value ? foto : ''}
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
}

// Save sanitasi
async function saveSanitasi() {
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
  const status = allChecked && checkboxes.length > 0 ? "Complete" : "Uncomplete";

  // Get existing fotos if editing
  const existingFotos = currentEditId
    ? sanitasi.find((s) => s.id === currentEditId)?.fotos || {}
    : {};

  // Get all foto inputs
  const fotoInputs = document.querySelectorAll('#checklistContent input[type="file"]');
  const fotoPromises = [];
  const fotos = {};

  // Process checklist items and their fotos
  Object.keys(checklist).forEach(item => {
    // Only process checked items
    if (checklist[item]) {
      const safeItemId = item.replace(/[^a-zA-Z0-9]/g, '_');
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
}

// Save data to API or localStorage
async function saveData(foto, fotos) {
  const id = currentEditId || Date.now();
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
  const status = allChecked && checkboxes.length > 0 ? "Complete" : "Uncomplete";

  try {
    const data = {
      tanggal: tanggal,
      waktu: waktu,
      tipe: tipe,
      namaPetugas: namaPetugas,
      fotos: fotos || {}, // Store fotos per checklist item
      checklist: checklist,
      status: status
    };

    if (currentEditId) {
      // Edit mode - Update via API
      if (window.API && window.API.Sanitasi) {
        await window.API.Sanitasi.update(currentEditId, data);
      } else {
        // Fallback to localStorage
        const index = sanitasi.findIndex((s) => s.id === currentEditId || s._id === currentEditId);
        if (index !== -1) {
          sanitasi[index] = { ...sanitasi[index], ...data };
          localStorage.setItem("sanitasi", JSON.stringify(sanitasi));
        }
      }
    } else {
      // Add mode - Create via API
      if (window.API && window.API.Sanitasi) {
        await window.API.Sanitasi.create(data);
      } else {
        // Fallback to localStorage
        const newId = Date.now();
        sanitasi.push({ id: newId, ...data });
        localStorage.setItem("sanitasi", JSON.stringify(sanitasi));
      }
    }

    await loadSanitasiData();
    await loadTables();

    // Trigger event untuk update dashboard
    window.dispatchEvent(new CustomEvent("dataUpdated", { detail: { type: "sanitasi" } }));

    const modal = bootstrap.Modal.getInstance(document.getElementById("modalSanitasi"));
    modal.hide();

    resetForm();
  } catch (error) {
    console.error("Error saving sanitasi:", error);
    alert("Error menyimpan data: " + (error.message || "Unknown error"));
  }
}

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

  // Set default date to today when modal opens
  const modalElement = document.getElementById("modalSanitasi");
  if (modalElement) {
    modalElement.addEventListener("show.bs.modal", function () {
      if (!currentEditId) {
        const today = new Date().toISOString().split("T")[0];
        document.getElementById("tanggalSanitasi").value = today;

        // Set default time to current time
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, "0");
        const minutes = String(now.getMinutes()).padStart(2, "0");
        document.getElementById("waktuSanitasi").value = `${hours}:${minutes}`;
      }
    });

  }

  // Switch tab event listener untuk reload tabel saat tab berubah
  const tabButtons = document.querySelectorAll('#sanitasiTabs button[data-bs-toggle="tab"]');
  tabButtons.forEach(button => {
    button.addEventListener('shown.bs.tab', function (e) {
      const targetTab = e.target.getAttribute('data-bs-target');
      // Tabel sudah di-load di loadTables(), tidak perlu reload lagi
    });
  });
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


