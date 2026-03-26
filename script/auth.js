/**
 * ============================================
 * SISTEM AUTHENTIKASI - LOCALSTORAGE
 * ============================================
 *
 * File ini mengelola sistem login dan register yang terintegrasi dengan localStorage.
 * Semua data pengguna disimpan di localStorage dengan key "users".
 *
 * Struktur Data Pengguna di localStorage:
 * {
 *   "users": [
 *     {
 *       "id": 1,
 *       "namaLengkap": "Nama Lengkap",
 *       "username": "username",
 *       "email": "email@example.com",
 *       "password": "password123",
 *       "role": "Admin" | "Owner" | "Karyawan",
 *       "status": "Aktif" | "Nonaktif"
 *     }
 *   ]
 * }
 *
 * Sumber Data Pengguna:
 * 1. Data yang ditambahkan oleh Admin melalui halaman "Kelola Pengguna"
 * 2. Data yang didaftarkan melalui halaman "Register" (Sign Up)
 *
 * Login hanya dapat dilakukan jika:
 * - Username dan password cocok dengan data di localStorage
 * - Role sesuai dengan halaman login yang digunakan
 * - Status pengguna adalah "Aktif"
 *
 * ============================================
 */

/**
 * Mendapatkan semua data pengguna dari API atau localStorage
 * @returns {Promise<Array>} Array berisi semua data pengguna
 */
async function getAllUsers() {
  try {
    if (window.API && window.API.Users) {
      const users = await window.API.Users.getAll();
      console.log(
        `✓ Data pengguna berhasil dimuat dari API: ${users.length} pengguna ditemukan`
      );
      return users;
    } else {
      // Fallback to localStorage
      const usersData = localStorage.getItem("users");
      if (!usersData) {
        console.log(
          "⚠️ Data pengguna belum ada di localStorage. Mengembalikan array kosong."
        );
        return [];
      }
      const users = JSON.parse(usersData);
      console.log(
        `✓ Data pengguna berhasil dimuat dari localStorage: ${users.length} pengguna ditemukan`
      );
      return users;
    }
  } catch (error) {
    console.error("❌ Error saat memuat data pengguna:", error);
    // Fallback to localStorage
    try {
      const usersData = localStorage.getItem("users");
      return usersData ? JSON.parse(usersData) : [];
    } catch (e) {
      return [];
    }
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
  const users = await getAllUsers();

  // Trim username untuk menghindari spasi
  const trimmedUsername = username ? username.trim() : "";

  // Debug: log data untuk troubleshooting
  console.log("=== AUTHENTICATION DEBUG ===");
  console.log("Input:", { username: trimmedUsername, password: "***", role });
  console.log(
    "Available users:",
    users.map((u) => ({
      id: u.id,
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
      // Fallback: capitalize first letter
      normalizedRole =
        role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
    }
  }

  console.log("Normalized role:", normalizedRole);

  // Cari user yang cocok - username case-insensitive, password exact match
  const user = users.find((u) => {
    const usernameMatch =
      u.username.toLowerCase().trim() === trimmedUsername.toLowerCase();
    const passwordMatch = u.password === password;
    const roleMatch = u.role === normalizedRole;
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
        passwordMatch:
          userExists.password === password
            ? "✓"
            : `✗ (expected: ${userExists.password}, got: ${password})`,
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
    console.log("✓✓✓ USER AUTHENTICATED SUCCESSFULLY ✓✓✓");
  }

  console.log("=== END AUTHENTICATION DEBUG ===");

  return user;
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
 * Menyimpan pengguna baru ke localStorage
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
 * @returns {Object} Data pengguna yang baru disimpan (termasuk ID yang di-generate)
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
 * console.log("Pengguna baru berhasil didaftarkan dengan ID:", newUser.id);
 */
async function saveUser(userData) {
  try {
    const userPayload = {
      namaLengkap: userData.namaLengkap || "",
      username: userData.username || "",
      email: userData.email || "",
      password: userData.password || "",
      role: userData.role || "Karyawan",
      status: userData.status || "Aktif",
    };

    if (window.API && window.API.Users) {
      // Create via API
      const newUser = await window.API.Users.create(userPayload);
      console.log("✓ Pengguna baru berhasil disimpan via API:", {
        id: newUser.id || newUser._id,
        username: newUser.username,
        role: newUser.role,
        status: newUser.status,
      });
      return newUser;
    } else {
      // Fallback to localStorage
      const users = await getAllUsers();

      // Generate ID baru (ID terakhir + 1, atau 1 jika belum ada data)
      const newId =
        users.length > 0 ? Math.max(...users.map((u) => u.id)) + 1 : 1;

      // Buat objek pengguna baru
      const newUser = {
        id: newId,
        ...userPayload,
      };

      // Tambahkan ke array users
      users.push(newUser);

      // Simpan ke localStorage
      localStorage.setItem("users", JSON.stringify(users));

      console.log("✓ Pengguna baru berhasil disimpan ke localStorage:", {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role,
        status: newUser.status,
      });

      return newUser;
    }
  } catch (error) {
    console.error("❌ Error saat menyimpan pengguna baru:", error);
    return null;
  }
}

/**
 * Memperbarui data pengguna yang sudah ada di localStorage
 *
 * @param {number} userId - ID pengguna yang akan diupdate
 * @param {Object} userData - Data baru yang akan diupdate
 * @returns {Object|null} Data pengguna yang sudah diupdate, null jika tidak ditemukan
 */
async function updateUser(userId, userData) {
  try {
    if (window.API && window.API.Users) {
      // Update via API
      const updatedUser = await window.API.Users.update(userId, userData);
      console.log(
        `✓ Data pengguna dengan ID ${userId} berhasil diupdate via API`
      );
      return updatedUser;
    } else {
      // Fallback to localStorage
      const users = await getAllUsers();
      const userIndex = users.findIndex(
        (u) => u.id === userId || u._id === userId
      );
      if (userIndex !== -1) {
        users[userIndex] = { ...users[userIndex], ...userData };
        localStorage.setItem("users", JSON.stringify(users));
        console.log(
          `✓ Data pengguna dengan ID ${userId} berhasil diupdate di localStorage`
        );
        return users[userIndex];
      }
      console.log(`⚠️ Pengguna dengan ID ${userId} tidak ditemukan`);
      return null;
    }
  } catch (error) {
    console.error("❌ Error saat mengupdate pengguna:", error);
    return null;
  }
}

/**
 * Menghapus pengguna dari API atau localStorage
 *
 * @param {number} userId - ID pengguna yang akan dihapus
 * @returns {Promise<boolean>} true jika berhasil dihapus, false jika gagal
 */
async function deleteUser(userId) {
  try {
    if (window.API && window.API.Users) {
      // Delete via API
      await window.API.Users.delete(userId);
      console.log(`✓ Pengguna dengan ID ${userId} berhasil dihapus via API`);
      return true;
    } else {
      // Fallback to localStorage
      const users = await getAllUsers();
      const filteredUsers = users.filter(
        (u) => u.id !== userId && u._id !== userId
      );
      localStorage.setItem("users", JSON.stringify(filteredUsers));
      console.log(
        `✓ Pengguna dengan ID ${userId} berhasil dihapus dari localStorage`
      );
      return true;
    }
  } catch (error) {
    console.error("❌ Error saat menghapus pengguna:", error);
    return false;
  }
}
