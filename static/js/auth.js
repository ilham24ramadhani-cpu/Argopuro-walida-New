/**
 * ============================================
 * SISTEM AUTHENTIKASI - BACKEND-FIRST (MongoDB)
 * ============================================
 *
 * File ini mengelola sistem login dan register yang terintegrasi dengan MongoDB.
 * Semua data pengguna disimpan di MongoDB via Flask API.
 *
 * BACKEND-FIRST APPROACH:
 * - Semua operasi CRUD via API Flask → MongoDB
 * - localStorage TIDAK digunakan sebagai sumber data
 * - Backend adalah single source of truth
 *
 * Sumber Data Pengguna:
 * 1. Data yang ditambahkan oleh Admin melalui halaman "Kelola Pengguna" (via API)
 * 2. Data yang didaftarkan melalui halaman "Register" (via API)
 *
 * Login hanya dapat dilakukan jika:
 * - Username dan password cocok dengan data di MongoDB
 * - Role sesuai dengan halaman login yang digunakan
 * - Status pengguna adalah "Aktif"
 *
 * ============================================
 */

/**
 * Mendapatkan semua data pengguna dari MongoDB API ONLY
 * @returns {Promise<Array>} Array berisi semua data pengguna
 */
async function getAllUsers() {
  try {
    // VERIFY API AVAILABILITY - NO FALLBACK
    if (!window.API || !window.API.Users) {
      const errorMsg =
        "❌ API.Users tidak tersedia. Tidak dapat memuat data pengguna. Pastikan backend MongoDB aktif.";
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    const users = await window.API.Users.getAll();
    console.log(
      `✓ Data pengguna berhasil dimuat dari MongoDB: ${users.length} pengguna ditemukan`
    );
    return users;
  } catch (error) {
    console.error("❌ Error saat memuat data pengguna dari MongoDB:", error);
    throw error; // Re-throw untuk memberi tahu caller bahwa ada error
  }
}

/**
 * Autentikasi pengguna berdasarkan username, password, dan role
 *
 * Fungsi ini memvalidasi kredensial pengguna dengan data yang ada di localStorage.
 * Login hanya berhasil jika:
 * 1. Username ditemukan di localStorage (case-insensitive)
 * 2. Password cocok (exact match)
 * 3. Role sesuai dengan role yang diharapkan
 * 4. Status pengguna adalah "Aktif"
 *
 * @param {string} username - Username pengguna
 * @param {string} password - Password pengguna
 * @param {string} role - Role yang diharapkan ("Admin", "Owner", atau "Karyawan")
 * @returns {Object|null} Data pengguna jika autentikasi berhasil, null jika gagal
 *
 * @example
 * const user = authenticateUser("admin", "admin123", "Admin");
 * if (user) {
 *   console.log("Login berhasil:", user);
 * } else {
 *   console.log("Login gagal: username/password salah atau user tidak aktif");
 * }
 */
async function authenticateUser(username, password, role) {
  // Trim username untuk menghindari spasi
  const trimmedUsername = username ? username.trim() : "";

  // Debug: log input (tidak log password)
  console.log("=== AUTHENTICATION DEBUG ===");
  console.log("Input:", { username: trimmedUsername, password: "***", role });

  // Try backend login API first (preferred and secure method)
  try {
    // Use same origin as current page to ensure cookies are sent correctly
    const API_BASE_URL =
      window.API_BASE_URL ||
      (window.location.origin
        ? `${window.location.origin}/api`
        : "http://localhost:5002/api");
    const loginPayload = {
      username: trimmedUsername,
      password: password,
      role: role,
    };

    console.log("🔐 Attempting backend login...");
    console.log("   Payload:", {
      username: trimmedUsername,
      password: "***",
      role,
    });

    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      credentials: "include", // CRITICAL: Include cookies for session
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(loginPayload),
    });

    const result = await response.json();

    if (response.ok && result.success && result.user) {
      console.log("✅ Login successful via backend API");
      console.log("   User data:", {
        id: result.user.id || result.user._id,
        username: result.user.username,
        role: result.user.role,
        status: result.user.status,
      });
      console.log("=== END AUTHENTICATION DEBUG ===");
      return result.user;
    } else {
      // Login failed
      const errorMsg = result.error || "Unknown error";
      console.log(
        `❌ Backend login failed (HTTP ${response.status}):`,
        errorMsg
      );
      console.log("   Response:", result);
      console.log("=== END AUTHENTICATION DEBUG ===");
      return null;
    }
  } catch (error) {
    console.error("⚠️ Backend login endpoint error:", error.message);
    console.warn("   Falling back to localStorage...");
    // Fall through to localStorage fallback for backward compatibility
  }

  // Fallback: Use localStorage (for backward compatibility only)
  // NOTE: This requires password to be hashed if backend was used before
  console.log("Using localStorage fallback for authentication");

  const users = await getAllUsers();

  console.log(
    "Fallback: Available users:",
    users.map((u) => ({
      id: u.id || u._id,
      username: u.username,
      role: u.role,
      status: u.status,
    }))
  );

  // Normalize role (case-insensitive comparison) - Admin, Owner, Karyawan
  let normalizedRole = null;
  if (role) {
    const roleLower = role.toLowerCase().trim();
    if (roleLower === "admin") {
      normalizedRole = "Admin";
    } else if (roleLower === "owner") {
      normalizedRole = "Owner";
    } else if (roleLower === "karyawan") {
      normalizedRole = "Karyawan";
    } else {
      normalizedRole =
        role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
    }
  }

  console.log("Normalized role:", normalizedRole);

  // Hash password for comparison (backend uses SHA-256)
  const passwordHash = await hashPasswordSha256(password);

  // Cari user yang cocok - username case-insensitive, password hashed comparison
  const user = users.find((u) => {
    const usernameMatch =
      u.username.toLowerCase().trim() === trimmedUsername.toLowerCase();

    // Compare hashed password OR plain password (for backward compatibility)
    const storedPassword = u.password || "";
    const passwordMatch =
      storedPassword === passwordHash || storedPassword === password;

    const roleMatch = normalizedRole ? u.role === normalizedRole : true;
    const statusMatch = u.status === "Aktif";

    const allMatch = usernameMatch && passwordMatch && roleMatch && statusMatch;

    if (usernameMatch) {
      console.log(`✓ User found: ${u.username}`, {
        passwordMatch: passwordMatch ? "✓" : "✗",
        roleMatch: roleMatch
          ? `✓ (${u.role})`
          : `✗ (expected: ${normalizedRole}, got: ${u.role})`,
        statusMatch: statusMatch ? "✓" : "✗",
        allMatch: allMatch ? "✓ AUTHENTICATED" : "✗ FAILED",
      });
    }

    return allMatch;
  });

  if (!user) {
    // Cek apakah user ada tapi ada masalah lain
    const userExists = users.find(
      (u) => u.username.toLowerCase().trim() === trimmedUsername.toLowerCase()
    );
    if (userExists) {
      console.log("✗ User found but validation failed:", {
        username: userExists.username,
        passwordMatch: "✗ (password hash mismatch or wrong password)",
        roleMatch:
          userExists.role === normalizedRole
            ? "✓"
            : `✗ (expected: ${normalizedRole}, got: ${userExists.role})`,
        statusActive:
          userExists.status === "Aktif"
            ? "✓"
            : `✗ (status: ${userExists.status})`,
        userRole: userExists.role,
        expectedRole: normalizedRole,
      });
    } else {
      console.log("✗ User not found with username:", trimmedUsername);
      console.log(
        "Available usernames:",
        users.map((u) => u.username)
      );
    }
  } else {
    console.log(
      "✓✓✓ USER AUTHENTICATED SUCCESSFULLY (localStorage fallback) ✓✓✓"
    );
  }

  console.log("=== END AUTHENTICATION DEBUG ===");

  return user;
}

// Helper function to hash password using SHA-256 (same as backend)
async function hashPasswordSha256(password) {
  try {
    // Use Web Crypto API for hashing (SHA-256)
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hashHex;
  } catch (error) {
    console.error("Error hashing password:", error);
    // Fallback: return password as-is (for compatibility, not secure)
    return password;
  }
}

/**
 * Mencari pengguna berdasarkan username saja (untuk validasi)
 * Digunakan untuk mengecek apakah username sudah terdaftar sebelum registrasi
 *
 * @param {string} username - Username yang akan dicari
 * @returns {Promise<Object|null>} Data pengguna jika ditemukan, null jika tidak ditemukan
 */
async function getUserByUsername(username) {
  const users = await getAllUsers();
  const trimmedUsername = username ? username.trim().toLowerCase() : "";
  return users.find((u) => u.username.toLowerCase().trim() === trimmedUsername);
}

/**
 * Mencari pengguna berdasarkan email saja (untuk validasi)
 * Digunakan untuk mengecek apakah email sudah terdaftar sebelum registrasi
 *
 * @param {string} email - Email yang akan dicari
 * @returns {Promise<Object|null>} Data pengguna jika ditemukan, null jika tidak ditemukan
 */
async function getUserByEmail(email) {
  const users = await getAllUsers();
  const trimmedEmail = email ? email.trim().toLowerCase() : "";
  return users.find((u) => u.email.toLowerCase().trim() === trimmedEmail);
}

/**
 * Menyimpan pengguna baru ke MongoDB API ONLY
 *
 * Fungsi ini digunakan untuk:
 * 1. Registrasi pengguna baru melalui halaman Register
 * 2. Menambahkan pengguna baru oleh Admin melalui halaman Kelola Pengguna
 *
 * Data yang disimpan akan otomatis tersedia untuk proses login.
 *
 * @param {Object} userData - Data pengguna baru
 * @param {string} userData.namaLengkap - Nama lengkap pengguna
 * @param {string} userData.username - Username (harus unik)
 * @param {string} userData.email - Email (harus unik)
 * @param {string} userData.password - Password
 * @param {string} userData.role - Role ("Admin", "Owner", atau "Karyawan")
 * @param {string} [userData.status="Aktif"] - Status pengguna (default: "Aktif")
 * @returns {Object} Data pengguna yang baru disimpan (termasuk ID yang di-generate oleh backend)
 *
 * @example
 * const newUser = saveUser({
 *   namaLengkap: "John Doe",
 *   username: "johndoe",
 *   email: "john@example.com",
 *   password: "password123",
 *   role: "Karyawan",
 *   status: "Aktif"
 * });
 * console.log("Pengguna baru berhasil didaftarkan dengan ID:", newUser.id || newUser._id);
 */
async function saveUser(userData) {
  try {
    // VERIFY API AVAILABILITY - NO FALLBACK
    if (!window.API || !window.API.Users) {
      const errorMsg =
        "❌ API.Users tidak tersedia. Tidak dapat menyimpan data pengguna. Pastikan backend MongoDB aktif.";
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    const userPayload = {
      namaLengkap: userData.namaLengkap || "",
      username: userData.username || "",
      email: userData.email || "",
      password: userData.password || "",
      role: userData.role || "Karyawan",
      status: userData.status || "Aktif",
    };

    // Create via API (MongoDB ONLY)
    // NOTE: Backend will generate ID automatically via get_next_id('users')
    console.log("🔄 Creating user via API (backend will generate ID)");
    const newUser = await window.API.Users.create(userPayload);
    console.log("✓ Pengguna baru berhasil disimpan di MongoDB:", {
      id: newUser.id || newUser._id,
      username: newUser.username,
      role: newUser.role,
      status: newUser.status,
    });
    return newUser;
  } catch (error) {
    console.error("❌ Error saat menyimpan pengguna baru:", error);
    throw error; // Re-throw untuk memberi tahu caller bahwa ada error
  }
}

/**
 * Memperbarui data pengguna yang sudah ada di MongoDB API ONLY
 *
 * @param {number|string} userId - ID pengguna yang akan diupdate
 * @param {Object} userData - Data baru yang akan diupdate
 * @returns {Object|null} Data pengguna yang sudah diupdate, null jika tidak ditemukan
 */
async function updateUser(userId, userData) {
  try {
    // VERIFY API AVAILABILITY - NO FALLBACK
    if (!window.API || !window.API.Users) {
      const errorMsg =
        "❌ API.Users tidak tersedia. Tidak dapat mengupdate data pengguna. Pastikan backend MongoDB aktif.";
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Update via API (MongoDB ONLY)
    console.log(`🔄 Updating user via API: ${userId}`);
    const updatedUser = await window.API.Users.update(userId, userData);
    console.log(
      `✓ Data pengguna dengan ID ${userId} berhasil diupdate di MongoDB`
    );
    return updatedUser;
  } catch (error) {
    console.error("❌ Error saat mengupdate pengguna:", error);
    throw error; // Re-throw untuk memberi tahu caller bahwa ada error
  }
}

/**
 * Menghapus pengguna dari MongoDB API ONLY
 *
 * @param {number|string} userId - ID pengguna yang akan dihapus
 * @returns {Promise<boolean>} true jika berhasil dihapus, false jika gagal
 */
async function deleteUser(userId) {
  try {
    // VERIFY API AVAILABILITY - NO FALLBACK
    if (!window.API || !window.API.Users) {
      const errorMsg =
        "❌ API.Users tidak tersedia. Tidak dapat menghapus data pengguna. Pastikan backend MongoDB aktif.";
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Delete via API (MongoDB ONLY)
    console.log(`🔄 Deleting user via API: ${userId}`);
    await window.API.Users.delete(userId);
    console.log(`✓ Pengguna dengan ID ${userId} berhasil dihapus dari MongoDB`);
    return true;
  } catch (error) {
    console.error("❌ Error saat menghapus pengguna:", error);
    throw error; // Re-throw untuk memberi tahu caller bahwa ada error
  }
}
