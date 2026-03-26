// Data pengguna (menggunakan API Service dengan fallback ke localStorage)
let users = [];
let currentEditId = null;
let currentDeleteId = null;

// Wait for API to be ready (event-based + polling fallback)
async function waitForAPI() {
  // Check if already available
  if (window.API && window.API.Users) {
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
        const available = window.API && window.API.Users;
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
        resolve(window.API && window.API.Users);
      }
    };

    window.addEventListener("APIReady", eventHandler);

    // Polling fallback (check every 100ms)
    let pollCount = 0;
    const pollInterval = setInterval(() => {
      pollCount++;
      if (window.API && window.API.Users) {
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

// Load data pengguna dari MongoDB API ONLY
async function loadUsersData() {
  try {
    console.log("🔄 Loading users data from MongoDB...");
    console.log("🔍 Checking window.API availability...");
    console.log("window.API exists:", !!window.API);
    console.log("window.API.Users exists:", !!(window.API && window.API.Users));

    // Wait for API to be ready
    const apiReady = await waitForAPI();

    if (!apiReady || !window.API || !window.API.Users) {
      console.error("❌ API.Users not available after waiting");
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
        "❌ API.Users tidak tersedia. Pastikan:\n" +
        "1. api-service.js di-load sebelum kelola_pengguna.js\n" +
        "2. Tidak ada error JavaScript di console\n" +
        "3. Backend Flask aktif\n" +
        "\nCek console untuk detail error.";
      console.error(errorMsg);
      alert(errorMsg);
      throw new Error(errorMsg);
    }

    // VERIFY API AVAILABILITY - NO FALLBACK
    if (!window.API || !window.API.Users) {
      console.error("❌ API.Users check failed after wait:");
      console.error("window.API:", window.API);
      console.error("window.API.Users:", window.API ? window.API.Users : "N/A");
      const errorMsg =
        "❌ API.Users tidak tersedia. Tidak dapat memuat data. Pastikan backend MongoDB aktif dan api-service.js di-load dengan benar.";
      console.error(errorMsg);
      alert(errorMsg);
      throw new Error(errorMsg);
    }

    console.log("✅ API.Users confirmed available:", {
      getAll: typeof window.API.Users.getAll === "function",
      create: typeof window.API.Users.create === "function",
    });

    console.log("✅ Using API.Users.getAll()");
    users = await window.API.Users.getAll();
    console.log(`✅ Loaded ${users.length} user records from MongoDB`);

    if (!Array.isArray(users)) {
      console.warn("⚠️ API returned non-array data, defaulting to empty array");
      users = [];
    }
  } catch (error) {
    console.error("❌ Error loading users from MongoDB:", error);
    users = [];
    throw error; // Re-throw untuk memberi tahu caller bahwa ada error
  }
}

// Fungsi untuk menampilkan data pengguna
async function displayUsers() {
  try {
    await loadUsersData();
  } catch (error) {
    console.error("Error loading users:", error);
    users = [];
  }

  const tableBody = document.getElementById("tableBody");
  const searchInput = document.getElementById("searchInput");
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";

  // Filter data berdasarkan search
  let filteredUsers = users;
  if (searchTerm) {
    filteredUsers = users.filter(
      (user) =>
        user.namaLengkap.toLowerCase().includes(searchTerm) ||
        user.username.toLowerCase().includes(searchTerm) ||
        user.email.toLowerCase().includes(searchTerm) ||
        user.role.toLowerCase().includes(searchTerm)
    );
  }

  if (filteredUsers.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-4 text-muted">
          <i class="bi bi-inbox fs-1 d-block mb-2"></i>
          Tidak ada data pengguna
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filteredUsers
    .map(
      (user, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${user.namaLengkap}</td>
      <td>${user.username}</td>
      <td>${user.email}</td>
      <td><span class="badge ${user.role === 'Admin' ? 'bg-success' : user.role === 'Owner' ? 'bg-warning text-dark' : 'bg-info'}">${user.role}</span></td>
      <td>
        <span class="status-badge status-${
          user.status === "Aktif" ? "aktif" : "nonaktif"
        }">
          ${user.status}
        </span>
      </td>
      <td class="text-center">
        <button 
          class="btn btn-sm btn-warning btn-action" 
          onclick="editUser(${user.id || user._id || `'${user._id}'`})"
          title="Edit">
          <i class="bi bi-pencil-square"></i>
        </button>
        <button 
          class="btn btn-sm btn-danger btn-action" 
          onclick="deleteUser(${user.id || user._id || `'${user._id}'`})"
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
  const modal = document.getElementById("modalPengguna");
  const modalLabel = document.getElementById("modalPenggunaLabel");
  const form = document.getElementById("formPengguna");
  const passwordRequired = document.getElementById("passwordRequired");
  const passwordHint = document.getElementById("passwordHint");

  if (mode === "add") {
    modalLabel.textContent = "Tambah Pengguna";
    form.reset();
    document.getElementById("userId").value = "";
    passwordRequired.style.display = "inline";
    passwordHint.style.display = "none";
    document.getElementById("password").required = true;
  } else {
    modalLabel.textContent = "Edit Pengguna";
    passwordRequired.style.display = "none";
    passwordHint.style.display = "block";
    document.getElementById("password").required = false;
  }
}

// Fungsi untuk edit pengguna
async function editUser(id) {
  try {
    await loadUsersData();
    const user = users.find((u) => u.id === id || u._id === id);
    if (!user) {
      alert("Data pengguna tidak ditemukan!");
      return;
    }

    currentEditId = id;
    document.getElementById("userId").value = user.id || user._id;
    document.getElementById("namaLengkap").value = user.namaLengkap;
    document.getElementById("username").value = user.username;
    document.getElementById("email").value = user.email;
    document.getElementById("password").value = "";
    document.getElementById("role").value = user.role;
    document.getElementById("status").value = user.status;

    const modal = new bootstrap.Modal(document.getElementById("modalPengguna"));
    modal.show();
    openModal("edit");
  } catch (error) {
    console.error("Error loading user for edit:", error);
    alert("Error memuat data pengguna");
  }
}

// Fungsi untuk menyimpan pengguna (tambah/edit)
async function saveUser() {
  const form = document.getElementById("formPengguna");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const userId = document.getElementById("userId").value;
  const namaLengkap = document.getElementById("namaLengkap").value;
  const username = document.getElementById("username").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const role = document.getElementById("role").value;
  const status = document.getElementById("status").value;

  // Reload data untuk validasi
  await loadUsersData();

  // Validasi username unik
  const existingUser = users.find(
    (u) =>
      u.username === username && u.id !== parseInt(userId) && u._id !== userId
  );
  if (existingUser) {
    alert("Username sudah digunakan!");
    return;
  }

  // Validasi email unik
  const existingEmail = users.find(
    (u) => u.email === email && u.id !== parseInt(userId) && u._id !== userId
  );
  if (existingEmail) {
    alert("Email sudah digunakan!");
    return;
  }

  try {
    // Wait for API to be ready before saving
    const apiReady = await waitForAPI();

    // VERIFY API AVAILABILITY - NO FALLBACK
    if (!apiReady || !window.API || !window.API.Users) {
      const errorMsg =
        "❌ API.Users tidak tersedia. Tidak dapat menyimpan data. Pastikan backend MongoDB aktif dan api-service.js sudah di-load.";
      console.error(errorMsg);
      console.error("window.API:", window.API);
      alert(errorMsg);
      throw new Error(errorMsg);
    }

    const userData = {
      namaLengkap,
      username,
      email,
      role,
      status,
    };

    if (userId) {
      // Edit mode - Update via API (MongoDB ONLY)
      if (password) {
        userData.password = password;
      }
      console.log("🔄 Updating user via API:", userId);
      await window.API.Users.update(userId, userData);
      console.log("✅ User updated in MongoDB");
      
      // Tampilkan notifikasi update
      if (window.showNotification) {
        window.showNotification('update', 'Pengguna', 'success');
      }
    } else {
      // Add mode - Create via API (MongoDB ONLY)
      if (!password) {
        alert("Password harus diisi untuk pengguna baru!");
        return;
      }
      userData.password = password;
      console.log("🔄 Creating user via API (backend will generate ID)");
      await window.API.Users.create(userData);
      console.log("✅ User created in MongoDB");
      
      // Tampilkan notifikasi create
      if (window.showNotification) {
        window.showNotification('create', 'Pengguna', 'success');
      }
    }

    await loadUsersData();
    await displayUsers();

    // Trigger event untuk update dashboard
    window.dispatchEvent(
      new CustomEvent("dataUpdated", { detail: { type: "users" } })
    );

    // Tutup modal
    const modal = bootstrap.Modal.getInstance(
      document.getElementById("modalPengguna")
    );
    modal.hide();

    // Reset form
    form.reset();
    currentEditId = null;
    
    // Auto refresh halaman setelah save berhasil
    setTimeout(() => {
      window.location.reload();
    }, 500);
  } catch (error) {
    console.error("Error saving user:", error);
    // Tampilkan notifikasi error
    if (window.showNotification) {
      window.showNotification(userId ? 'update' : 'create', 'Pengguna', 'error', 'Gagal menyimpan data: ' + (error.message || "Unknown error"));
    } else {
      alert("Error menyimpan data: " + (error.message || "Unknown error"));
    }
  }
}

// Fungsi untuk delete pengguna
async function deleteUser(id) {
  try {
    await loadUsersData();
    const user = users.find((u) => u.id === id || u._id === id);
    if (!user) {
      alert("Data pengguna tidak ditemukan!");
      return;
    }

    currentDeleteId = id;
    document.getElementById("deleteUserName").textContent = user.namaLengkap;

    const modal = new bootstrap.Modal(document.getElementById("modalDelete"));
    modal.show();
  } catch (error) {
    console.error("Error loading user for delete:", error);
    alert("Error memuat data pengguna");
  }
}

// Fungsi untuk konfirmasi delete
async function confirmDelete() {
  if (currentDeleteId) {
    try {
      // VERIFY API AVAILABILITY - NO FALLBACK
      if (!window.API || !window.API.Users) {
        const errorMsg =
          "❌ API.Users tidak tersedia. Tidak dapat menghapus data. Pastikan backend MongoDB aktif.";
        console.error(errorMsg);
        alert(errorMsg);
        throw new Error(errorMsg);
      }

      // Delete via API (MongoDB ONLY)
      console.log("🔄 Deleting user via API:", currentDeleteId);
      await window.API.Users.delete(currentDeleteId);
      console.log("✅ User deleted from MongoDB");

      // Tampilkan notifikasi delete
      if (window.showNotification) {
        window.showNotification('delete', 'Pengguna', 'success');
      }

      await loadUsersData();
      await displayUsers();

      // Trigger event untuk update dashboard
      window.dispatchEvent(
        new CustomEvent("dataUpdated", { detail: { type: "users" } })
      );

      const modal = bootstrap.Modal.getInstance(
        document.getElementById("modalDelete")
      );
      modal.hide();
      currentDeleteId = null;
    } catch (error) {
      console.error("Error deleting user:", error);
      // Tampilkan notifikasi error
      if (window.showNotification) {
        window.showNotification('delete', 'Pengguna', 'error', 'Gagal menghapus data: ' + (error.message || "Unknown error"));
      } else {
        alert("Error menghapus data: " + (error.message || "Unknown error"));
      }
    }
  }
}

// Event listener untuk search
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(async () => {
    try {
      await displayUsers();
    } catch (error) {
      console.error("Error initializing users page:", error);
    }
  }, 100);

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", async () => {
      await displayUsers();
    });
  }

  // Event listener untuk form search
  const searchForm = document.querySelector('form[role="search"]');
  if (searchForm) {
    searchForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await displayUsers();
    });
  }
});
