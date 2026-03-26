/**
 * ============================================
 * AUTHENTICATION GUARD - PROTEKSI HALAMAN
 * ============================================
 *
 * File ini berisi fungsi untuk melindungi halaman dari akses tanpa login.
 *
 * Cara Kerja:
 * 1. Mengecek session SERVER-SIDE via /api/auth/session (Flask session)
 * 2. Memvalidasi role user sesuai dengan halaman yang diakses
 * 3. Jika belum login atau role tidak sesuai, redirect ke halaman login
 *
 * Penggunaan:
 * - Panggil checkAuth(requiredRole) di awal setiap halaman yang perlu dilindungi
 * - requiredRole: "Admin", "Owner", "Karyawan", atau null (untuk semua role)
 *
 * ============================================
 */

// Use same origin as current page to ensure cookies are sent correctly
// Use API_BASE_URL from window if already defined (e.g., by api-service.js)
// Use var instead of const to avoid redeclaration error if api-service.js already defined it
var API_BASE_URL =
  window.API_BASE_URL ||
  (typeof window !== "undefined" && window.location.origin
    ? `${window.location.origin}/api`
    : "http://localhost:5002/api");

/**
 * Mengecek apakah user sudah login dan memiliki role yang sesuai
 * MURNI BACKEND-DRIVEN - TIDAK menggunakan localStorage/sessionStorage
 *
 * @param {string|null} requiredRole - Role yang diizinkan mengakses halaman ini
 *                                    "Admin", "Owner", "Karyawan", atau null untuk semua role
 * @param {string} redirectToLogin - URL halaman login jika belum login (default: null)
 * @returns {Promise<boolean>} true jika user sudah login dan role sesuai, false jika tidak
 */
async function checkAuth(requiredRole = null, redirectToLogin = null) {
  console.log("🔒 Checking authentication via backend session...", {
    requiredRole: requiredRole || "ANY",
  });

  try {
    // Check backend session via API - BACKEND ONLY, NO BROWSER STORAGE
    // Use /api/auth/check which returns 401 if not logged in
    const response = await fetch(`${API_BASE_URL}/auth/check`, {
      method: "GET",
      credentials: "include", // CRITICAL: Include cookies for Flask session
      headers: {
        "Content-Type": "application/json",
      },
    });

    // If response is 401, user is not logged in
    if (response.status === 401 || !response.ok) {
      console.log(
        "❌ No active session (HTTP " +
          response.status +
          ") - redirecting to login"
      );
      alert(
        "⚠️ Anda belum login!\n\nSilakan login terlebih dahulu untuk mengakses halaman ini."
      );
      window.location.replace("/");
      return false;
    }

    // Response is 200, user is logged in
    const result = await response.json();

    // Double check logged_in flag (should always be true if status is 200)
    if (!result.logged_in) {
      console.log("❌ Session check returned 200 but logged_in is false");
      alert(
        "⚠️ Anda belum login!\n\nSilakan login terlebih dahulu untuk mengakses halaman ini."
      );
      window.location.replace("/");
      return false;
    }

    const username = result.username;
    const userRole = result.role;
    const userId = result.user_id;

    console.log("✓ Session valid:", {
      username: username,
      userRole: userRole,
      userId: userId,
    });

    // Jika ada requiredRole, cek apakah role user sesuai
    // Support untuk single role (string) atau multiple roles (array)
    if (requiredRole) {
      const allowedRoles = Array.isArray(requiredRole)
        ? requiredRole
        : [requiredRole];
      const roleMatch = allowedRoles.includes(userRole);

      if (!roleMatch) {
        const rolesText = allowedRoles.join(" atau ");
        console.log(
          `❌ Role tidak sesuai - Required: ${rolesText}, User Role: ${userRole}`
        );
        alert(
          `⚠️ Akses Ditolak!\n\n` +
            `Halaman ini hanya dapat diakses oleh ${rolesText}.\n` +
            `Role Anda saat ini: ${userRole}\n\n` +
            `Silakan login dengan akun yang sesuai.`
        );
        window.location.replace("/");
        return false;
      }
    }

    console.log("✓ Authentication check passed - Access granted");
    return true;
  } catch (error) {
    console.error("❌ Error checking session:", error);
    // On network error, redirect to login
    alert(
      "⚠️ Terjadi kesalahan saat memvalidasi sesi!\n\nSilakan login kembali."
    );
    window.location.replace("/");
    return false;
  }
}

/**
 * Menghapus semua data session (logout)
 * Memanggil backend logout endpoint untuk clear Flask session
 */
async function clearSession() {
  try {
    // Call backend logout endpoint
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });
    console.log("✓ Backend session cleared");
  } catch (error) {
    console.warn("⚠️ Backend logout failed:", error);
  }

  // No localStorage/sessionStorage to clear - backend handles everything
  console.log("✓ Logout complete");
}

/**
 * Fungsi logout yang dapat dipanggil dari halaman manapun
 * Memanggil backend logout endpoint dan clear session
 *
 * @param {Event} event - Event object (optional)
 */
async function handleLogout(event) {
  if (event) {
    event.preventDefault();
  }

  // Get user info from backend before logout (optional, for confirm message)
  let username = "Unknown";
  let userRole = "Unknown";

  try {
    const sessionResponse = await fetch(`${API_BASE_URL}/auth/session`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (sessionResponse.ok) {
      const sessionData = await sessionResponse.json();
      if (sessionData.logged_in) {
        username = sessionData.username || "Unknown";
        userRole = sessionData.role || "Unknown";
      }
    }
  } catch (error) {
    console.warn("Could not fetch user info for logout confirmation:", error);
  }

  if (
    confirm(
      `Apakah Anda yakin ingin logout?\n\nUser: ${username}\nRole: ${userRole}`
    )
  ) {
    try {
      // Clear backend session
      await clearSession();
      alert("✓ Anda telah berhasil logout");
    } catch (error) {
      console.error("Error during logout:", error);
      alert("✓ Anda telah berhasil logout");
    }

    // Redirect ke welcome page
    window.location.href = "/";
  }
}

// Export fungsi untuk digunakan di halaman lain
if (typeof module !== "undefined" && module.exports) {
  module.exports = { checkAuth, clearSession, handleLogout };
}

// Pastikan checkAuth tersedia secara global untuk digunakan di HTML
if (typeof window !== "undefined") {
  window.checkAuth = checkAuth;
  window.clearSession = clearSession;
  window.handleLogout = handleLogout;
}
