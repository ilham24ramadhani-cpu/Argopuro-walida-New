/**
 * API Service Layer
 * Menyediakan interface untuk komunikasi dengan backend MongoDB
 * Dengan fallback ke localStorage jika backend tidak tersedia
 */

const API_BASE_URL = "http://localhost:5002/api";
let backendAvailable = false;

// Check backend availability on load
(async function checkBackend() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (response.ok) {
      backendAvailable = true;
      console.log("✅ Backend MongoDB tersedia");
    } else {
      console.warn("⚠️ Backend tidak merespon dengan baik");
    }
  } catch (error) {
    console.warn(
      "⚠️ Backend tidak tersedia, menggunakan localStorage fallback",
    );
    console.warn("Error:", error.message);
  }
})();

/** Urutan kanonik tahapan (sinkron dengan backend). */
window.URUTAN_TAHAPAN_PRODUKSI_KANON = [
  "Sortasi",
  "Fermentasi",
  "Pulping",
  "Pencucian",
  "Pengeringan Awal",
  "Fermentasi 2",
  "Pulping 2",
  "Pengeringan Akhir",
  "Hulling",
  "Hand Sortasi",
  "Grinding",
  "Roasting",
  "Pengemasan",
];

const _TAHAPAN_LABEL_KE_KUNCI_SORT = {
  "Sortasi Cherry atau Buah Kopi": "Sortasi",
  "Sortasi Buah": "Sortasi",
  "Pengeringan Awal (Para - Para)": "Pengeringan Awal",
  "Pengeringan Akhir (Pengeringan Lantai)": "Pengeringan Akhir",
  "Pengupasan Kulit Tanduk (Hulling) Pertama": "Pulping 2",
  "Pengupasan Kulit Tanduk (Hulling) Kedua": "Hulling",
  "Pengupasan Kulit Tanduk (Hulling)": "Hulling",
  "Hand Sortasi atau Sortasi Biji Kopi": "Hand Sortasi",
  Fermentasi: "Fermentasi",
  Pulping: "Pulping",
  Pencucian: "Pencucian",
  "Pengeringan Awal": "Pengeringan Awal",
  "Fermentasi 2": "Fermentasi 2",
  "Pulping 2": "Pulping 2",
  "Pengeringan Akhir": "Pengeringan Akhir",
  Grinding: "Grinding",
  Pengemasan: "Pengemasan",
  Roasting: "Roasting",
  Hulling: "Hulling",
  Sortasi: "Sortasi",
  "Hand Sortasi": "Hand Sortasi",
};
for (let _ti = 0; _ti < window.URUTAN_TAHAPAN_PRODUKSI_KANON.length; _ti++) {
  const _tn = window.URUTAN_TAHAPAN_PRODUKSI_KANON[_ti];
  if (!Object.prototype.hasOwnProperty.call(_TAHAPAN_LABEL_KE_KUNCI_SORT, _tn)) {
    _TAHAPAN_LABEL_KE_KUNCI_SORT[_tn] = _tn;
  }
}
const _TAHAPAN_SORT_KEYS_BY_LEN = Object.keys(_TAHAPAN_LABEL_KE_KUNCI_SORT).sort(
  (a, b) => b.length - a.length,
);

window.sortProduksiDocumentsByTahapanThenId = function (arr) {
  if (!Array.isArray(arr)) return arr;
  const urutan = window.URUTAN_TAHAPAN_PRODUKSI_KANON;
  const mapCanon = _TAHAPAN_LABEL_KE_KUNCI_SORT;
  const keysByLen = _TAHAPAN_SORT_KEYS_BY_LEN;
  function keKunci(st) {
    const s = String(st || "").trim();
    if (!s) return "";
    if (Object.prototype.hasOwnProperty.call(mapCanon, s)) return mapCanon[s];
    for (let i = 0; i < keysByLen.length; i++) {
      const k = keysByLen[i];
      if (s.includes(k)) return mapCanon[k];
    }
    return urutan.includes(s) ? s : "";
  }
  function indeks(st) {
    const k = keKunci(st);
    const ix = urutan.indexOf(k);
    return ix === -1 ? 999 : ix;
  }
  return [...arr].sort((a, b) => {
    const c = indeks(a && a.statusTahapan) - indeks(b && b.statusTahapan);
    if (c !== 0) return c;
    return String(a && a.idProduksi ? a.idProduksi : "").localeCompare(
      String(b && b.idProduksi ? b.idProduksi : ""),
      "id",
      { numeric: true },
    );
  });
};

// Generic API call function
async function apiCall(endpoint, method = "GET", data = null) {
  if (!backendAvailable) {
    throw new Error("Backend tidak tersedia");
  }

  const options = {
    method: method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (data && (method === "POST" || method === "PUT")) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`API Error (${method} ${endpoint}):`, error);
    throw error;
  }
}

// ==================== PRODUKSI API ====================
const ProduksiAPI = {
  async getAll() {
    try {
      const data = await apiCall("/produksi");
      if (!Array.isArray(data)) return data;
      return typeof window.sortProduksiDocumentsByTahapanThenId === "function"
        ? window.sortProduksiDocumentsByTahapanThenId(data)
        : data;
    } catch (error) {
      // Fallback to localStorage
      const data = JSON.parse(localStorage.getItem("produksi") || "[]");
      return typeof window.sortProduksiDocumentsByTahapanThenId === "function"
        ? window.sortProduksiDocumentsByTahapanThenId(data)
        : data;
    }
  },

  async getById(id) {
    try {
      return await apiCall(`/produksi/${id}`);
    } catch (error) {
      // Fallback to localStorage
      const data = JSON.parse(localStorage.getItem("produksi") || "[]");
      return data.find(
        (p) => p.id === parseInt(id) || p.idProduksi === id || p._id === id,
      );
    }
  },

  async create(data) {
    try {
      return await apiCall("/produksi", "POST", data);
    } catch (error) {
      // Fallback to localStorage
      const produksi = JSON.parse(localStorage.getItem("produksi") || "[]");
      const newId =
        produksi.length > 0 ? Math.max(...produksi.map((p) => p.id)) + 1 : 1;
      const newData = { id: newId, ...data };
      produksi.push(newData);
      localStorage.setItem("produksi", JSON.stringify(produksi));
      return newData;
    }
  },

  async update(id, data) {
    try {
      return await apiCall(`/produksi/${id}`, "PUT", data);
    } catch (error) {
      // Fallback to localStorage
      const produksi = JSON.parse(localStorage.getItem("produksi") || "[]");
      const index = produksi.findIndex(
        (p) => p.id === parseInt(id) || p.idProduksi === id,
      );
      if (index !== -1) {
        produksi[index] = { ...produksi[index], ...data };
        localStorage.setItem("produksi", JSON.stringify(produksi));
        return produksi[index];
      }
      throw new Error("Produksi tidak ditemukan");
    }
  },

  async delete(id) {
    try {
      return await apiCall(`/produksi/${id}`, "DELETE");
    } catch (error) {
      // Fallback to localStorage
      const produksi = JSON.parse(localStorage.getItem("produksi") || "[]");
      const filtered = produksi.filter(
        (p) => p.id !== parseInt(id) && p.idProduksi !== id,
      );
      localStorage.setItem("produksi", JSON.stringify(filtered));
      return { message: "Produksi deleted successfully" };
    }
  },

  async getPengemasan() {
    try {
      return await apiCall("/produksi/pengemasan");
    } catch (error) {
      // Fallback to localStorage
      const data = JSON.parse(localStorage.getItem("produksi") || "[]");
      return data.filter(
        (p) =>
          (p.statusTahapan || "").includes("Pengemasan") &&
          p.beratAkhir &&
          p.beratAkhir > 0,
      );
    }
  },

  async getSisa(idProduksi) {
    try {
      return await apiCall(`/produksi/${idProduksi}/sisa`);
    } catch (error) {
      // Fallback to localStorage
      const produksi = JSON.parse(localStorage.getItem("produksi") || "[]");
      const hasilProduksi = JSON.parse(
        localStorage.getItem("hasilProduksi") || "[]",
      );
      const prod = produksi.find((p) => p.idProduksi === idProduksi);
      if (!prod || !prod.beratAkhir) {
        return { sisaTersedia: 0, beratAkhir: 0, totalDikemas: 0 };
      }
      const totalDikemas = hasilProduksi
        .filter((h) => h.idProduksi === idProduksi)
        .reduce((sum, h) => sum + (parseFloat(h.beratSaatIni) || 0), 0);
      const sisaTersedia = Math.max(0, prod.beratAkhir - totalDikemas);
      return { sisaTersedia, beratAkhir: prod.beratAkhir, totalDikemas };
    }
  },
};

// ==================== HASIL PRODUKSI API ====================
const HasilProduksiAPI = {
  async getAll() {
    try {
      return await apiCall("/hasil-produksi");
    } catch (error) {
      const data = JSON.parse(localStorage.getItem("hasilProduksi") || "[]");
      return data;
    }
  },

  async getById(id) {
    try {
      return await apiCall(`/hasil-produksi/${id}`);
    } catch (error) {
      const data = JSON.parse(localStorage.getItem("hasilProduksi") || "[]");
      return data.find((h) => h.id === parseInt(id));
    }
  },

  async create(data) {
    try {
      return await apiCall("/hasil-produksi", "POST", data);
    } catch (error) {
      const hasilProduksi = JSON.parse(
        localStorage.getItem("hasilProduksi") || "[]",
      );
      const newId =
        hasilProduksi.length > 0
          ? Math.max(...hasilProduksi.map((h) => h.id)) + 1
          : 1;
      const newData = { id: newId, ...data };
      hasilProduksi.push(newData);
      localStorage.setItem("hasilProduksi", JSON.stringify(hasilProduksi));
      return newData;
    }
  },

  async update(id, data) {
    try {
      return await apiCall(`/hasil-produksi/${id}`, "PUT", data);
    } catch (error) {
      const hasilProduksi = JSON.parse(
        localStorage.getItem("hasilProduksi") || "[]",
      );
      const index = hasilProduksi.findIndex((h) => h.id === parseInt(id));
      if (index !== -1) {
        hasilProduksi[index] = { ...hasilProduksi[index], ...data };
        localStorage.setItem("hasilProduksi", JSON.stringify(hasilProduksi));
        return hasilProduksi[index];
      }
      throw new Error("Hasil produksi tidak ditemukan");
    }
  },

  async delete(id) {
    try {
      return await apiCall(`/hasil-produksi/${id}`, "DELETE");
    } catch (error) {
      const hasilProduksi = JSON.parse(
        localStorage.getItem("hasilProduksi") || "[]",
      );
      const filtered = hasilProduksi.filter((h) => h.id !== parseInt(id));
      localStorage.setItem("hasilProduksi", JSON.stringify(filtered));
      return { message: "Hasil produksi deleted successfully" };
    }
  },

  async getByProduksi(idProduksi) {
    try {
      return await apiCall(`/hasil-produksi/produksi/${idProduksi}`);
    } catch (error) {
      const data = JSON.parse(localStorage.getItem("hasilProduksi") || "[]");
      return data.filter((h) => h.idProduksi === idProduksi);
    }
  },
};

// ==================== BAHAN API ====================
const BahanAPI = {
  async getAll() {
    try {
      return await apiCall("/bahan");
    } catch (error) {
      const data = JSON.parse(localStorage.getItem("bahan") || "[]");
      return data;
    }
  },

  async getById(id) {
    try {
      return await apiCall(`/bahan/${id}`);
    } catch (error) {
      const data = JSON.parse(localStorage.getItem("bahan") || "[]");
      return data.find((b) => b.id === parseInt(id) || b.idBahan === id);
    }
  },

  async create(data) {
    try {
      return await apiCall("/bahan", "POST", data);
    } catch (error) {
      const bahan = JSON.parse(localStorage.getItem("bahan") || "[]");
      const newId =
        bahan.length > 0 ? Math.max(...bahan.map((b) => b.id)) + 1 : 1;
      const newData = { id: newId, ...data };
      bahan.push(newData);
      localStorage.setItem("bahan", JSON.stringify(bahan));
      return newData;
    }
  },

  async update(id, data) {
    try {
      return await apiCall(`/bahan/${id}`, "PUT", data);
    } catch (error) {
      const bahan = JSON.parse(localStorage.getItem("bahan") || "[]");
      const index = bahan.findIndex(
        (b) => b.id === parseInt(id) || b.idBahan === id,
      );
      if (index !== -1) {
        bahan[index] = { ...bahan[index], ...data };
        localStorage.setItem("bahan", JSON.stringify(bahan));
        return bahan[index];
      }
      throw new Error("Bahan tidak ditemukan");
    }
  },

  async delete(id) {
    try {
      return await apiCall(`/bahan/${id}`, "DELETE");
    } catch (error) {
      const bahan = JSON.parse(localStorage.getItem("bahan") || "[]");
      const filtered = bahan.filter(
        (b) => b.id !== parseInt(id) && b.idBahan !== id,
      );
      localStorage.setItem("bahan", JSON.stringify(filtered));
      return { message: "Bahan deleted successfully" };
    }
  },

  async getSisa(idBahan, prosesPengolahan) {
    try {
      let path = `/bahan/sisa/${encodeURIComponent(idBahan)}`;
      if (prosesPengolahan != null && String(prosesPengolahan).trim() !== "") {
        path += `?proses=${encodeURIComponent(String(prosesPengolahan).trim())}`;
      }
      return await apiCall(path);
    } catch (error) {
      const bahan = JSON.parse(localStorage.getItem("bahan") || "[]");
      const produksi = JSON.parse(localStorage.getItem("produksi") || "[]");
      const b = bahan.find((bb) => bb.idBahan === idBahan);
      if (!b) return { sisaTersedia: 0 };
      const totalDigunakan = produksi
        .filter((p) => p.idBahan === idBahan)
        .reduce((sum, p) => sum + (parseFloat(p.beratAwal) || 0), 0);
      const sisa = Math.max(0, b.jumlah - totalDigunakan);
      return { sisaTersedia: sisa, totalBahan: b.jumlah, totalDigunakan };
    }
  },
};

// ==================== PEMASOK API ====================
const PemasokAPI = {
  async getAll() {
    try {
      return await apiCall("/pemasok");
    } catch (error) {
      const data = JSON.parse(localStorage.getItem("pemasok") || "[]");
      return data;
    }
  },

  async getById(id) {
    try {
      return await apiCall(`/pemasok/${id}`);
    } catch (error) {
      const data = JSON.parse(localStorage.getItem("pemasok") || "[]");
      return data.find((p) => p.id === parseInt(id) || p.idPemasok === id);
    }
  },

  async create(data) {
    try {
      return await apiCall("/pemasok", "POST", data);
    } catch (error) {
      const pemasok = JSON.parse(localStorage.getItem("pemasok") || "[]");
      const newId =
        pemasok.length > 0 ? Math.max(...pemasok.map((p) => p.id)) + 1 : 1;
      const newData = { id: newId, ...data };
      pemasok.push(newData);
      localStorage.setItem("pemasok", JSON.stringify(pemasok));
      return newData;
    }
  },

  async update(id, data) {
    try {
      return await apiCall(`/pemasok/${id}`, "PUT", data);
    } catch (error) {
      const pemasok = JSON.parse(localStorage.getItem("pemasok") || "[]");
      const index = pemasok.findIndex(
        (p) => p.id === parseInt(id) || p.idPemasok === id,
      );
      if (index !== -1) {
        pemasok[index] = { ...pemasok[index], ...data };
        localStorage.setItem("pemasok", JSON.stringify(pemasok));
        return pemasok[index];
      }
      throw new Error("Pemasok tidak ditemukan");
    }
  },

  async delete(id) {
    try {
      return await apiCall(`/pemasok/${id}`, "DELETE");
    } catch (error) {
      const pemasok = JSON.parse(localStorage.getItem("pemasok") || "[]");
      const filtered = pemasok.filter(
        (p) => p.id !== parseInt(id) && p.idPemasok !== id,
      );
      localStorage.setItem("pemasok", JSON.stringify(filtered));
      return { message: "Pemasok deleted successfully" };
    }
  },
};

// ==================== STOK API ====================
const StokAPI = {
  async getAll() {
    try {
      return await apiCall("/stok");
    } catch (error) {
      // Calculate from hasilProduksi
      const hasilProduksi = JSON.parse(
        localStorage.getItem("hasilProduksi") || "[]",
      );
      const stokMap = {};

      hasilProduksi.forEach((h) => {
        const key = `${h.tipeProduk}|${h.kemasan}|${h.jenisKopi}|${h.prosesPengolahan}|${h.levelRoasting || ""}`;
        if (!stokMap[key]) {
          stokMap[key] = {
            tipeProduk: h.tipeProduk,
            kemasan: h.kemasan,
            jenisKopi: h.jenisKopi,
            prosesPengolahan: h.prosesPengolahan,
            levelRoasting: h.levelRoasting || "",
            totalBerat: 0,
            totalJumlah: 0,
          };
        }
        stokMap[key].totalBerat += parseFloat(h.beratSaatIni || 0);
        stokMap[key].totalJumlah += parseInt(h.jumlah || 0);
      });

      return Object.values(stokMap);
    }
  },
};

// ==================== MASTER DATA API ====================
function createMasterDataAPI(collectionName, localStorageKey) {
  return {
    async getAll() {
      try {
        return await apiCall(`/${collectionName}`);
      } catch (error) {
        const data = JSON.parse(localStorage.getItem(localStorageKey) || "[]");
        return data;
      }
    },

    async getById(id) {
      try {
        return await apiCall(`/${collectionName}/${id}`);
      } catch (error) {
        const data = JSON.parse(localStorage.getItem(localStorageKey) || "[]");
        return data.find(
          (item) => item.id === parseInt(id) || item.nama === id,
        );
      }
    },

    async create(data) {
      try {
        return await apiCall(`/${collectionName}`, "POST", data);
      } catch (error) {
        const items = JSON.parse(localStorage.getItem(localStorageKey) || "[]");
        const newId =
          items.length > 0 ? Math.max(...items.map((i) => i.id || 0)) + 1 : 1;
        const newData = { id: newId, ...data };
        items.push(newData);
        localStorage.setItem(localStorageKey, JSON.stringify(items));
        return newData;
      }
    },

    async update(id, data) {
      try {
        return await apiCall(`/${collectionName}/${id}`, "PUT", data);
      } catch (error) {
        const items = JSON.parse(localStorage.getItem(localStorageKey) || "[]");
        const index = items.findIndex(
          (item) => item.id === parseInt(id) || item.nama === id,
        );
        if (index !== -1) {
          items[index] = { ...items[index], ...data };
          localStorage.setItem(localStorageKey, JSON.stringify(items));
          return items[index];
        }
        throw new Error(`${collectionName} tidak ditemukan`);
      }
    },

    async delete(id) {
      try {
        return await apiCall(`/${collectionName}/${id}`, "DELETE");
      } catch (error) {
        const items = JSON.parse(localStorage.getItem(localStorageKey) || "[]");
        const filtered = items.filter(
          (item) => item.id !== parseInt(id) && item.nama !== id,
        );
        localStorage.setItem(localStorageKey, JSON.stringify(filtered));
        return { message: `${collectionName} deleted successfully` };
      }
    },
  };
}

const MasterDataAPI = {
  jenisKopi: createMasterDataAPI("dataJenisKopi", "dataJenisKopi"),
  varietas: createMasterDataAPI("dataVarietas", "dataVarietas"),
  proses: createMasterDataAPI("dataProses", "dataProses"),
  roasting: createMasterDataAPI("dataRoasting", "dataRoasting"),
  kemasan: createMasterDataAPI("dataKemasan", "dataKemasan"),
  produk: createMasterDataAPI("dataProduk", "dataProduk"),
};

// ==================== USERS API ====================
const UsersAPI = {
  async getAll() {
    try {
      return await apiCall("/users");
    } catch (error) {
      const data = JSON.parse(localStorage.getItem("users") || "[]");
      return data;
    }
  },

  async getById(id) {
    try {
      return await apiCall(`/users/${id}`);
    } catch (error) {
      const data = JSON.parse(localStorage.getItem("users") || "[]");
      return data.find((u) => u.id === parseInt(id) || u.username === id);
    }
  },

  async create(data) {
    try {
      return await apiCall("/users", "POST", data);
    } catch (error) {
      const users = JSON.parse(localStorage.getItem("users") || "[]");
      const newId =
        users.length > 0 ? Math.max(...users.map((u) => u.id)) + 1 : 1;
      const newData = { id: newId, ...data };
      users.push(newData);
      localStorage.setItem("users", JSON.stringify(users));
      return newData;
    }
  },

  async update(id, data) {
    try {
      return await apiCall(`/users/${id}`, "PUT", data);
    } catch (error) {
      const users = JSON.parse(localStorage.getItem("users") || "[]");
      const index = users.findIndex(
        (u) => u.id === parseInt(id) || u.username === id,
      );
      if (index !== -1) {
        users[index] = { ...users[index], ...data };
        localStorage.setItem("users", JSON.stringify(users));
        return users[index];
      }
      throw new Error("User tidak ditemukan");
    }
  },

  async delete(id) {
    try {
      return await apiCall(`/users/${id}`, "DELETE");
    } catch (error) {
      const users = JSON.parse(localStorage.getItem("users") || "[]");
      const filtered = users.filter(
        (u) => u.id !== parseInt(id) && u.username !== id,
      );
      localStorage.setItem("users", JSON.stringify(filtered));
      return { message: "User deleted successfully" };
    }
  },
};

// ==================== SETTINGS API ====================
const SettingsAPI = {
  async get(userId) {
    try {
      return await apiCall(`/settings?userId=${userId}`);
    } catch (error) {
      const data = JSON.parse(localStorage.getItem("userSettings") || "{}");
      return data;
    }
  },

  async save(data) {
    try {
      return await apiCall("/settings", "POST", data);
    } catch (error) {
      localStorage.setItem("userSettings", JSON.stringify(data));
      return data;
    }
  },
};

// Export for use in other scripts
window.API = {
  Produksi: ProduksiAPI,
  HasilProduksi: HasilProduksiAPI,
  Bahan: BahanAPI,
  Pemasok: PemasokAPI,
  Stok: StokAPI,
  MasterData: MasterDataAPI,
  Users: UsersAPI,
  Settings: SettingsAPI,
  isBackendAvailable: () => backendAvailable,
};

// Make backendAvailable accessible globally
window.backendAvailable = () => backendAvailable;
