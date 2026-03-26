// Data pengguna (menggunakan API Service dengan fallback ke localStorage)
let users = [];
let currentEditId = null;
let currentDeleteId = null;

// Load data pengguna dari API atau localStorage
async function loadUsersData() {
  try {
    if (window.API && window.API.Users) {
      users = await window.API.Users.getAll();
    } else {
      // Fallback ke localStorage jika API belum tersedia
      users = JSON.parse(localStorage.getItem("users") || "[]");

      // Inisialisasi data contoh jika kosong
      if (users.length === 0 && !localStorage.getItem("users")) {
        users = [
          {
            id: 1,
            namaLengkap: "Admin Sistem",
            username: "admin",
            email: "admin@argopuro.com",
            password: "admin123",
            role: "Admin",
            status: "Aktif",
          },
          {
            id: 2,
            namaLengkap: "Owner Argopuro",
            username: "owner",
            email: "owner@argopuro.com",
            password: "owner123",
            role: "Owner",
            status: "Aktif",
          },
          {
            id: 3,
            namaLengkap: "Karyawan Produksi",
            username: "karyawan",
            email: "karyawan@argopuro.com",
            password: "karyawan123",
            role: "Karyawan",
            status: "Aktif",
          },
        ];
        localStorage.setItem("users", JSON.stringify(users));
      }
    }
  } catch (error) {
    console.error("Error loading users:", error);
    users = JSON.parse(localStorage.getItem("users") || "[]");
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
    const userData = {
      namaLengkap,
      username,
      email,
      role,
      status,
    };

    if (userId) {
      // Edit mode - Update via API
      if (password) {
        userData.password = password;
      }
      if (window.API && window.API.Users) {
        await window.API.Users.update(userId, userData);
      } else {
        // Fallback to localStorage
        const index = users.findIndex(
          (u) => u.id === parseInt(userId) || u._id === userId
        );
        if (index !== -1) {
          users[index] = { ...users[index], ...userData };
          localStorage.setItem("users", JSON.stringify(users));
        }
      }
    } else {
      // Add mode
      if (!password) {
        alert("Password harus diisi untuk pengguna baru!");
        return;
      }
      userData.password = password;
      if (window.API && window.API.Users) {
        await window.API.Users.create(userData);
      } else {
        // Fallback to localStorage
        const newId =
          users.length > 0 ? Math.max(...users.map((u) => u.id)) + 1 : 1;
        users.push({ id: newId, ...userData });
        localStorage.setItem("users", JSON.stringify(users));
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
  } catch (error) {
    console.error("Error saving user:", error);
    alert("Error menyimpan data: " + (error.message || "Unknown error"));
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
      // Delete via API
      if (window.API && window.API.Users) {
        await window.API.Users.delete(currentDeleteId);
      } else {
        // Fallback to localStorage
        users = users.filter(
          (u) => u.id !== currentDeleteId && u._id !== currentDeleteId
        );
        localStorage.setItem("users", JSON.stringify(users));
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
      alert("Error menghapus data: " + (error.message || "Unknown error"));
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
