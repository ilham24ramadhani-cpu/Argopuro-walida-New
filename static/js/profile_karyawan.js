// Profile Management (Karyawan)
let currentUser = null;

// Load user data from backend session and API
async function loadUserProfile() {
  try {
    // Get session data from backend
    const API_BASE_URL = window.API_BASE_URL || (window.location.origin ? `${window.location.origin}/api` : "http://localhost:5002/api");
    const sessionResponse = await fetch(`${API_BASE_URL}/auth/session`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!sessionResponse.ok) {
      throw new Error('Failed to get session data');
    }

    const sessionData = await sessionResponse.json();
    
    if (!sessionData.logged_in) {
      alert('Anda belum login. Silakan login terlebih dahulu.');
      window.location.href = '/login/karyawan';
      return;
    }

    // Get user_id from session
    const userId = sessionData.user_id;
    const sessionUsername = sessionData.username;
    const sessionRole = sessionData.role;
    const sessionEmail = sessionData.user_email || '';
    const sessionName = sessionData.user_name || sessionUsername;

    // Get full user data from API using user_id
    let userData = null;
    try {
      if (window.API && window.API.Users) {
        // Try to get user by ID
        if (userId) {
          try {
            userData = await window.API.Users.getById(userId);
          } catch (e) {
            console.warn('Could not get user by ID, trying getAll:', e);
            // Fallback: get all users and find by username
            const users = await window.API.Users.getAll();
            userData = users.find((u) => 
              u.username === sessionUsername || 
              u._id === userId || 
              String(u._id) === String(userId)
            );
          }
        }
        
        // If still not found, try by username
        if (!userData) {
          const users = await window.API.Users.getAll();
          userData = users.find((u) => u.username === sessionUsername);
        }
      }
    } catch (error) {
      console.error("Error loading user from API:", error);
    }

    // Set currentUser from API data or session data
    if (userData) {
      currentUser = {
        id: userData._id || userData.id,
        _id: userData._id || userData.id,
        namaLengkap: userData.namaLengkap || sessionName,
        username: userData.username || sessionUsername,
        email: userData.email || sessionEmail,
        noTelepon: userData.noTelepon || "",
        tanggalLahir: userData.tanggalLahir || "",
        jenisKelamin: userData.jenisKelamin || "",
        alamat: userData.alamat || "",
        role: userData.role || sessionRole,
        status: userData.status || "Aktif",
      };
    } else {
      // Fallback: use session data only
      currentUser = {
        id: userId,
        _id: userId,
        namaLengkap: sessionName,
        username: sessionUsername,
        email: sessionEmail,
        noTelepon: "",
        tanggalLahir: "",
        jenisKelamin: "",
        alamat: "",
        role: sessionRole,
        status: "Aktif",
      };
    }
  } catch (error) {
    console.error("Error loading user profile:", error);
    alert("Error memuat data profile. Silakan refresh halaman.");
    return;
  }

  // Populate form
  document.getElementById("namaLengkap").value = currentUser.namaLengkap || "";
  document.getElementById("username").value = currentUser.username || "";
  document.getElementById("email").value = currentUser.email || "";
  document.getElementById("noTelepon").value = currentUser.noTelepon || "";
  document.getElementById("tanggalLahir").value =
    currentUser.tanggalLahir || "";
  document.getElementById("jenisKelamin").value =
    currentUser.jenisKelamin || "";
  document.getElementById("alamat").value = currentUser.alamat || "";

  // Update profile display
  const profileName = document.getElementById("profileName");
  const profileRole = document.getElementById("profileRole");
  const profileStatus = document.getElementById("profileStatus");
  const profileIcon = document.getElementById("profileIcon");

  if (profileName) {
    // Prioritize namaLengkap if it's different from username, otherwise show username
    const displayName =
      currentUser.namaLengkap &&
      currentUser.namaLengkap !== currentUser.username
        ? currentUser.namaLengkap
        : currentUser.username || sessionUsername || "Karyawan Sistem";
    profileName.textContent = displayName;
  }
  if (profileRole) {
    profileRole.textContent = currentUser.role || "Karyawan";
    // Set badge color based on role
    if (currentUser.role === "Admin") {
      profileRole.className = "badge bg-primary";
    } else if (currentUser.role === "Karyawan") {
      profileRole.className = "badge bg-info";
    } else if (currentUser.role === "Owner") {
      profileRole.className = "badge bg-warning text-dark";
    }
  }
  if (profileStatus) {
    profileStatus.textContent = currentUser.status || "Aktif";
    // Update badge color based on status
    profileStatus.className =
      currentUser.status === "Aktif"
        ? "badge bg-success"
        : "badge bg-secondary";
  }
  if (profileIcon) {
    // Karyawan icon - simple user icon
    profileIcon.className = "bi bi-person profile-icon";
  }

  // Update statistik based on role
  updateStatistics();
}

// Update statistics based on role
function updateStatistics() {
  // Calculate statistics for karyawan (data yang diinput)
  const bahan = JSON.parse(localStorage.getItem("bahan")) || [];
  const produksi = JSON.parse(localStorage.getItem("produksi")) || [];
  const hasilProduksi = JSON.parse(localStorage.getItem("hasilProduksi")) || [];
  const sanitasi = JSON.parse(localStorage.getItem("sanitasi")) || [];

  // Count data input by this user (if we track userId in data)
  // For now, just show total data
  const totalInput =
    bahan.length + produksi.length + hasilProduksi.length + sanitasi.length;

  // You can update statistics display here if needed
}

// Save profile
async function saveProfile(event) {
  event.preventDefault();

  // Get form values
  currentUser.namaLengkap = document.getElementById("namaLengkap").value;
  currentUser.username = document.getElementById("username").value;
  currentUser.email = document.getElementById("email").value;
  currentUser.noTelepon = document.getElementById("noTelepon").value;
  currentUser.tanggalLahir = document.getElementById("tanggalLahir").value;
  currentUser.jenisKelamin = document.getElementById("jenisKelamin").value;
  currentUser.alamat = document.getElementById("alamat").value;

  try {
    const userData = {
      namaLengkap: currentUser.namaLengkap,
      username: currentUser.username,
      email: currentUser.email,
      noTelepon: currentUser.noTelepon,
      tanggalLahir: currentUser.tanggalLahir,
      jenisKelamin: currentUser.jenisKelamin,
      alamat: currentUser.alamat,
      role: currentUser.role,
    };

    // Update via API (MongoDB ONLY)
    if (!window.API || !window.API.Users) {
      throw new Error("API.Users tidak tersedia. Pastikan backend aktif.");
    }

    if (!currentUser.id && !currentUser._id) {
      throw new Error("User ID tidak ditemukan. Tidak dapat menyimpan profile.");
    }

    const userId = currentUser._id || currentUser.id;
    await window.API.Users.update(userId, userData);

    // Update currentUser object
    currentUser = { ...currentUser, ...userData };

    // Trigger event untuk update dashboard
    window.dispatchEvent(
      new CustomEvent("dataUpdated", { detail: { type: "users" } })
    );

    // Tampilkan notifikasi jika tersedia
    if (window.showNotification) {
      window.showNotification('update', 'Pengguna', 'success', 'Profile berhasil diperbarui');
    }

    // Show success message
    if (!window.showNotification) {
      alert("Profile berhasil disimpan!");
    }
    
    // Auto refresh setelah save berhasil
    setTimeout(() => {
      window.location.reload();
    }, 500);
  } catch (error) {
    console.error("Error saving profile:", error);
    // Tampilkan notifikasi error jika tersedia
    if (window.showNotification) {
      window.showNotification('update', 'Pengguna', 'error', 'Gagal menyimpan profile: ' + (error.message || "Unknown error"));
    } else {
      alert("Error menyimpan profile: " + (error.message || "Unknown error"));
    }
  }
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(async () => {
    try {
      await loadUserProfile();
    } catch (error) {
      console.error("Error loading user profile:", error);
    }
  }, 100);

  const profileForm = document.getElementById("profileForm");
  if (profileForm) {
    profileForm.addEventListener("submit", saveProfile);
  }
});
