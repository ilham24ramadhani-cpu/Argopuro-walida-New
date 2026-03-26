// Settings Management (Karyawan Only)
let settings = {
  displayName: "",
  timezone: "WIB",
  language: "id",
  emailNotification: true,
  systemNotification: true,
  updateNotification: false,
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
        localStorage.getItem("userSettings_Karyawan") ||
          JSON.stringify(settings)
      );
    }
  } catch (error) {
    console.error("Error loading settings:", error);
    settings = JSON.parse(
      localStorage.getItem("userSettings_Karyawan") || JSON.stringify(settings)
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
      localStorage.setItem("userSettings_Karyawan", JSON.stringify(settings));
    }
    alert("Pengaturan akun berhasil disimpan!");
  } catch (error) {
    console.error("Error saving account settings:", error);
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
      localStorage.setItem("userSettings_Karyawan", JSON.stringify(settings));
    }
    alert("Pengaturan notifikasi berhasil disimpan!");
  } catch (error) {
    console.error("Error saving notification settings:", error);
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
    } catch (error) {
      console.error("Error initializing settings page:", error);
    }
  }, 100);
});
