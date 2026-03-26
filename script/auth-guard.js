/**
 * ============================================
 * AUTHENTICATION GUARD - PROTEKSI HALAMAN
 * ============================================
 *
 * File ini berisi fungsi untuk melindungi halaman dari akses tanpa login.
 *
 * Cara Kerja:
 * 1. Mengecek apakah user sudah login (ada data di sessionStorage)
 * 2. Memvalidasi role user sesuai dengan halaman yang diakses
 * 3. Jika belum login atau role tidak sesuai, redirect ke halaman login
 *
 * Penggunaan:
 * - Panggil checkAuth(requiredRole) di awal setiap halaman yang perlu dilindungi
 * - requiredRole: "Admin", "Owner", "Karyawan", atau null (untuk semua role)
 *
 * ============================================
 */

/**
 * Mengecek apakah user sudah login dan memiliki role yang sesuai
 *
 * @param {string|null} requiredRole - Role yang diizinkan mengakses halaman ini
 *                                    "Admin", "Owner", "Karyawan", atau null untuk semua role
 * @param {string} redirectToLogin - URL halaman login jika belum login (default: "welcome.html")
 * @returns {boolean} true jika user sudah login dan role sesuai, false jika tidak
 */
async function checkAuth(requiredRole = null, redirectToLogin = null) {
  // Ambil data dari sessionStorage
  const username = sessionStorage.getItem("username");
  const userRole = sessionStorage.getItem("userRole");
  const userId = sessionStorage.getItem("userId");

  console.log("🔒 Checking authentication...", {
    username: username || "NOT FOUND",
    userRole: userRole || "NOT FOUND",
    userId: userId || "NOT FOUND",
    requiredRole: requiredRole || "ANY",
  });

  // Cek apakah ada data session (user sudah login)
  if (!username || !userRole || !userId) {
    console.log("❌ User belum login - redirecting to welcome page");

    // Tampilkan alert dan setelah user klik OK, redirect ke welcome page
    alert(
      "⚠️ Anda belum login!\n\nSilakan login terlebih dahulu untuk mengakses halaman ini."
    );

    // Redirect ke welcome page setelah alert ditutup
    // Karena auth-guard.js dipanggil dari file HTML di templates/, gunakan path relatif
    // Jika pathname mengandung /templates/, berarti kita di dalam folder templates
    const isInTemplates = window.location.pathname.includes("/templates/");
    const redirectPath = isInTemplates
      ? "welcome.html"
      : "templates/welcome.html";

    // Redirect ke welcome page
    window.location.replace(redirectPath);
    return false;
  }

  // Jika ada requiredRole, cek apakah role user sesuai
  if (requiredRole && userRole !== requiredRole) {
    console.log(
      `❌ Role tidak sesuai - Required: ${requiredRole}, User Role: ${userRole}`
    );
    alert(
      `⚠️ Akses Ditolak!\n\n` +
        `Halaman ini hanya dapat diakses oleh ${requiredRole}.\n` +
        `Role Anda saat ini: ${userRole}\n\n` +
        `Silakan login dengan akun yang sesuai.`
    );

    // Redirect ke welcome page setelah alert ditutup
    const isInTemplates = window.location.pathname.includes("/templates/");
    const redirectPath = isInTemplates
      ? "welcome.html"
      : "templates/welcome.html";
    window.location.replace(redirectPath);
    return false;
  }

  // Validasi tambahan: cek apakah user masih ada di API atau localStorage dan status aktif
  try {
    let users = [];
    if (window.API && window.API.Users) {
      users = await window.API.Users.getAll();
    } else {
      users = JSON.parse(localStorage.getItem("users") || "[]");
    }

    const userData = users.find(
      (u) =>
        (u.id === parseInt(userId) || u._id === userId) &&
        u.username === username &&
        u.role === userRole
    );

    if (!userData) {
      console.log("❌ User tidak ditemukan di localStorage");
      alert("⚠️ Sesi Anda tidak valid!\n\nSilakan login kembali.");
      clearSession();

      // Redirect ke welcome page dengan path yang benar
      const isInTemplates = window.location.pathname.includes("/templates/");
      const redirectPath = isInTemplates
        ? "welcome.html"
        : "templates/welcome.html";
      window.location.replace(redirectPath);
      return false;
    }

    if (userData.status !== "Aktif") {
      console.log("❌ User status tidak aktif");
      alert("⚠️ Akun Anda tidak aktif!\n\nSilakan hubungi administrator.");
      clearSession();

      // Redirect ke welcome page dengan path yang benar
      const isInTemplates = window.location.pathname.includes("/templates/");
      const redirectPath = isInTemplates
        ? "welcome.html"
        : "templates/welcome.html";
      window.location.replace(redirectPath);
      return false;
    }

    console.log("✓ Authentication check passed");
    return true;
  } catch (error) {
    console.error("❌ Error saat validasi user:", error);
    alert(
      "⚠️ Terjadi kesalahan saat memvalidasi sesi!\n\nSilakan login kembali."
    );
    clearSession();

    // Redirect ke welcome page dengan path yang benar
    const isInTemplates = window.location.pathname.includes("/templates/");
    const redirectPath = isInTemplates
      ? "welcome.html"
      : "templates/welcome.html";
    window.location.replace(redirectPath);
    return false;
  }
}

/**
 * Menghapus semua data session (logout)
 */
function clearSession() {
  sessionStorage.removeItem("username");
  sessionStorage.removeItem("userRole");
  sessionStorage.removeItem("userId");
  sessionStorage.removeItem("userName");
  sessionStorage.removeItem("userEmail");
  console.log("✓ Session cleared");
}

/**
 * Fungsi logout yang dapat dipanggil dari halaman manapun
 *
 * @param {Event} event - Event object (optional)
 */
function handleLogout(event) {
  if (event) {
    event.preventDefault();
  }

  const userRole = sessionStorage.getItem("userRole");
  const username = sessionStorage.getItem("username");

  if (
    confirm(
      `Apakah Anda yakin ingin logout?\n\nUser: ${
        username || "Unknown"
      }\nRole: ${userRole || "Unknown"}`
    )
  ) {
    clearSession();

    alert("✓ Anda telah berhasil logout");

    // Redirect ke halaman login sesuai role
    if (userRole === "Admin") {
      window.location.href = "templates/login.html";
    } else if (userRole === "Owner") {
      window.location.href = "templates/login_owner.html";
    } else if (userRole === "Karyawan") {
      window.location.href = "templates/login_karyawan.html";
    } else {
      window.location.href = "templates/welcome.html";
    }
  }
}

// Export fungsi untuk digunakan di halaman lain
if (typeof module !== "undefined" && module.exports) {
  module.exports = { checkAuth, clearSession, handleLogout };
}
