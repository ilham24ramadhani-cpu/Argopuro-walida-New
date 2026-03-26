// Settings Management (Admin Only)
let settings = {
  displayName: "",
  timezone: "WIB",
  language: "id",
  emailNotification: true,
  systemNotification: true,
  updateNotification: false,
  twoFactorAuth: false,
  publicProfile: false,
  shareActivity: false,
  dataRetention: 365,
};

// Load settings from API or localStorage
async function loadSettings() {
  try {
    if (window.API && window.API.Settings) {
      const settingsData = await window.API.Settings.get();
      if (settingsData) {
        settings = { ...settings, ...settingsData };
      }
    } else {
      // Fallback to localStorage
      settings = JSON.parse(
        localStorage.getItem("userSettings") || JSON.stringify(settings)
      );
    }
  } catch (error) {
    console.error("Error loading settings:", error);
    settings = JSON.parse(
      localStorage.getItem("userSettings") || JSON.stringify(settings)
    );
  }
  document.getElementById("displayName").value = settings.displayName || "";
  document.getElementById("timezone").value = settings.timezone || "WIB";
  document.getElementById("language").value = settings.language || "id";
  document.getElementById("emailNotification").checked =
    settings.emailNotification || false;
  document.getElementById("systemNotification").checked =
    settings.systemNotification || false;
  document.getElementById("updateNotification").checked =
    settings.updateNotification || false;
  document.getElementById("twoFactorAuth").checked =
    settings.twoFactorAuth || false;
  document.getElementById("publicProfile").checked =
    settings.publicProfile || false;
  document.getElementById("shareActivity").checked =
    settings.shareActivity || false;
  document.getElementById("dataRetention").value =
    settings.dataRetention || 365;
}

// Save account settings
async function saveAccountSettings(event) {
  event.preventDefault();

  settings.displayName = document.getElementById("displayName").value;
  settings.timezone = document.getElementById("timezone").value;
  settings.language = document.getElementById("language").value;

  try {
    if (window.API && window.API.Settings) {
      await window.API.Settings.update(settings);
    } else {
      localStorage.setItem("userSettings", JSON.stringify(settings));
    }
    alert("Pengaturan akun berhasil disimpan!");
  } catch (error) {
    console.error("Error saving account settings:", error);
    alert("Error menyimpan pengaturan: " + (error.message || "Unknown error"));
  }
}

// Save security settings
async function saveSecuritySettings(event) {
  event.preventDefault();

  const currentPassword = document.getElementById("currentPassword").value;
  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (newPassword !== confirmPassword) {
    alert("Password baru dan konfirmasi password tidak cocok!");
    return;
  }

  if (newPassword.length < 6) {
    alert("Password baru minimal 6 karakter!");
    return;
  }

  try {
    // Save password change via API if available
    const sessionUserId = sessionStorage.getItem("userId");
    if (window.API && window.API.Users && sessionUserId && newPassword) {
      await window.API.Users.update(sessionUserId, { password: newPassword });
    }

    // Save twoFactorAuth setting
    settings.twoFactorAuth = document.getElementById("twoFactorAuth").checked;

    if (window.API && window.API.Settings) {
      await window.API.Settings.update(settings);
    } else {
      localStorage.setItem("userSettings", JSON.stringify(settings));
    }

    alert("Password berhasil diubah!");

    // Reset form
    document.getElementById("securityForm").reset();
  } catch (error) {
    console.error("Error saving security settings:", error);
    alert("Error menyimpan pengaturan: " + (error.message || "Unknown error"));
  }
}

// Save notification settings
async function saveNotificationSettings() {
  settings.emailNotification =
    document.getElementById("emailNotification").checked;
  settings.systemNotification =
    document.getElementById("systemNotification").checked;
  settings.updateNotification =
    document.getElementById("updateNotification").checked;

  try {
    if (window.API && window.API.Settings) {
      await window.API.Settings.update(settings);
    } else {
      localStorage.setItem("userSettings", JSON.stringify(settings));
    }
    alert("Pengaturan notifikasi berhasil disimpan!");
  } catch (error) {
    console.error("Error saving notification settings:", error);
    alert("Error menyimpan pengaturan: " + (error.message || "Unknown error"));
  }
}

// Save privacy settings
async function savePrivacySettings() {
  settings.publicProfile = document.getElementById("publicProfile").checked;
  settings.shareActivity = document.getElementById("shareActivity").checked;
  settings.dataRetention = document.getElementById("dataRetention").value;

  try {
    if (window.API && window.API.Settings) {
      await window.API.Settings.update(settings);
    } else {
      localStorage.setItem("userSettings", JSON.stringify(settings));
    }
    alert("Pengaturan privasi berhasil disimpan!");
  } catch (error) {
    console.error("Error saving privacy settings:", error);
    alert("Error menyimpan pengaturan: " + (error.message || "Unknown error"));
  }
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(async () => {
    try {
      await loadSettings();

      const accountForm = document.getElementById("accountForm");
      if (accountForm) {
        accountForm.addEventListener("submit", saveAccountSettings);
      }

      const securityForm = document.getElementById("securityForm");
      if (securityForm) {
        securityForm.addEventListener("submit", saveSecuritySettings);
      }
    } catch (error) {
      console.error("Error initializing settings page:", error);
    }
  }, 100);
});
