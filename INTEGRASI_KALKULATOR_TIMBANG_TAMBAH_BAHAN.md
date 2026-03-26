# Integrasi Kalkulator Timbang ke Tambah Bahan

## Ringkasan

Dokumen ini menjelaskan **penyesuaian** dan **mekanisme** yang diperlukan agar fitur **Tambah Bahan** mengikuti model pencatatan **Kalkulator Timbang**. Pencatatan bahan nantinya menggunakan model kloter (multi-baris) seperti kalkulator timbang, bukan satu baris input jumlah total.

---

## 1. Perbandingan Model Saat Ini

### Kalkulator Timbang (Model Acuan)

| Aspek | Deskripsi |
|-------|-----------|
| **Input** | Dropdown jumlah kloter (1–30) → Tabel dengan baris per kloter |
| **Per kloter** | Berat Karung (kg), Harga per Kg (Rp), Keterangan |
| **Perhitungan** | Total Berat = Σ berat, Total Harga = Σ(berat × harga/kg), Rata-rata Harga = Total Harga / Total Berat |
| **Output** | Cetak Invoice PDF |
| **Penyimpanan** | ❌ Tidak menyimpan ke database |

### Tambah Bahan (Model Saat Ini)

| Aspek | Deskripsi |
|-------|-----------|
| **Input** | Form modal dengan field tunggal |
| **Per record** | ID Bahan, Pemasok, Jumlah (kg), Varietas, Harga per Kg, Jenis Kopi, Tanggal Masuk, Kualitas |
| **Perhitungan** | Total Pengeluaran = Jumlah × Harga per Kg |
| **Output** | Simpan ke database `bahan` |
| **Penyimpanan** | ✅ API `/api/bahan` POST |

---

## 2. Penyesuaian yang Diperlukan

### 2.1 Frontend (UI/UX)

| No | Penyesuaian | Detail |
|----|-------------|--------|
| 1 | **Form Tambah Bahan** | Ubah dari form tunggal menjadi dua bagian: **Header** (metadata) + **Kloter** (tabel multi-baris) |
| 2 | **Bagian Header** | Tetap: ID Bahan, Pemasok, Varietas, Jenis Kopi, Tanggal Masuk, Kualitas, HACCP |
| 3 | **Bagian Kloter** | Tambah: Dropdown "Jumlah Kloter" (1–30) + Tabel dinamis seperti kalkulator timbang (Berat Karung, Harga per Kg, Keterangan per kloter) |
| 4 | **Perhitungan Real-time** | Total Berat, Total Harga, Rata-rata Harga per Kg dihitung otomatis dari data kloter |
| 5 | **Tombol Aksi** | Tambah tombol "Simpan ke Bahan" di halaman Kalkulator Timbang (opsional) agar bisa langsung simpan dari kalkulator |

### 2.2 Backend (API & Database)

| No | Penyesuaian | Detail |
|----|-------------|--------|
| 1 | **API Create Bahan** | Terima payload baru: `kloter[]` (array) atau `detailKloter[]` |
| 2 | **Agregasi di Backend** | Hitung: `jumlah` = Σ berat, `totalPengeluaran` = Σ(berat × hargaPerKg), `hargaPerKg` = rata-rata tertimbang (Total Harga / Total Berat) |
| 3 | **Field Baru (Opsional)** | Simpan `detailKloter` atau `kloterDetail` untuk audit/historis per kloter |
| 4 | **Validasi** | Minimal 1 kloter dengan berat > 0 dan hargaPerKg > 0 |

### 2.3 Model Data Bahan

**Struktur saat ini (tetap dipakai untuk kompatibilitas):**

```json
{
  "id": 1,
  "idBahan": "BHN001",
  "pemasok": "Pemasok A",
  "jumlah": 250,
  "varietas": "Typica",
  "hargaPerKg": 48000,
  "totalPengeluaran": 12000000,
  "jenisKopi": "Arabika",
  "tanggalMasuk": "2024-01-15",
  "kualitas": "Premium"
}
```

**Struktur baru (dengan detail kloter, opsional):**

```json
{
  "id": 1,
  "idBahan": "BHN001",
  "pemasok": "Pemasok A",
  "jumlah": 250,
  "varietas": "Typica",
  "hargaPerKg": 48000,
  "totalPengeluaran": 12000000,
  "jenisKopi": "Arabika",
  "tanggalMasuk": "2024-01-15",
  "kualitas": "Premium",
  "detailKloter": [
    { "kloter": 1, "berat": 50, "hargaPerKg": 50000, "keterangan": "Karung A" },
    { "kloter": 2, "berat": 100, "hargaPerKg": 47000, "keterangan": "Karung B" },
    { "kloter": 3, "berat": 100, "hargaPerKg": 48000, "keterangan": "Karung C" }
  ]
}
```

---

## 3. Mekanisme Integrasi

### 3.1 Alur Pengguna (User Flow)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TAMBAH BAHAN (Model Kalkulator Timbang)                    │
└─────────────────────────────────────────────────────────────────────────────┘

  [1] User klik "Tambah Bahan"
           │
           ▼
  [2] Modal terbuka dengan 2 bagian:
      ├── BAGIAN A: Metadata (ID Bahan, Pemasok, Varietas, Jenis Kopi, dll)
      └── BAGIAN B: Kloter Timbangan
           │
           ▼
  [3] User pilih "Jumlah Kloter" (1–30)
           │
           ▼
  [4] Tabel kloter muncul (sama seperti Kalkulator Timbang)
      │  No │ Kloter │ Berat Karung (kg) │ Harga per Kg (Rp) │ Keterangan │
      │  1  │ Kloter 1│       [____]     │      [____]       │  [____]    │
      │  2  │ Kloter 2│       [____]     │      [____]       │  [____]    │
           │
           ▼
  [5] User isi berat & harga per kloter
      → Total Berat, Total Harga, Rata-rata Harga ter-update real-time
           │
           ▼
  [6] User centang HACCP, isi metadata, klik "Simpan"
           │
           ▼
  [7] Frontend agregasi:
      - jumlah = Σ berat
      - totalPengeluaran = Σ(berat × hargaPerKg)
      - hargaPerKg = totalPengeluaran / jumlah
           │
           ▼
  [8] POST /api/bahan dengan payload:
      { idBahan, pemasok, jumlah, varietas, hargaPerKg, totalPengeluaran,
        jenisKopi, tanggalMasuk, kualitas, detailKloter? }
           │
           ▼
  [9] Backend simpan ke MongoDB collection `bahan`
```

### 3.2 Skema Integrasi (Diagram)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         SKEMA INTEGRASI                                      │
└──────────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────┐         ┌─────────────────────┐
  │  KALKULATOR TIMBANG  │         │    TAMBAH BAHAN     │
  │  (Halaman Terpisah)  │         │  (Modal di Kelola   │
  │                     │         │   Bahan)            │
  └──────────┬──────────┘         └──────────┬──────────┘
             │                              │
             │  Model Kloter                 │  Model Kloter
             │  (1–30 baris)                 │  (1–30 baris)
             │                              │
             └──────────────┬───────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │   KOMPONEN BERSAMA          │
              │   - Dropdown Jumlah Kloter  │
              │   - Tabel: Berat, Harga/kg  │
              │   - Keterangan per kloter   │
              │   - Hitung: Total, Rata2    │
              └──────────────┬──────────────┘
                             │
                             ▼
              ┌─────────────────────────────┐
              │   TAMBAH BAHAN TAMBAHAN:    │
              │   - Metadata (pemasok, dll)  │
              │   - HACCP checklist         │
              │   - Tombol Simpan → API     │
              └──────────────┬──────────────┘
                             │
                             ▼
              ┌─────────────────────────────┐
              │   API /api/bahan POST       │
              │   - Terima kloter[]         │
              │   - Agregasi jumlah, total  │
              │   - Simpan ke MongoDB        │
              └─────────────────────────────┘
```

### 3.3 Opsi Implementasi

| Opsi | Deskripsi | Kelebihan | Kekurangan |
|------|-----------|-----------|------------|
| **A** | Form Tambah Bahan diubah total: ganti field Jumlah & Harga dengan tabel kloter | Konsisten dengan kalkulator, satu sumber kebenaran | Perubahan besar di form |
| **B** | Kalkulator Timbang ditambah tombol "Simpan ke Bahan" → redirect ke form dengan data pre-filled | User bisa timbang dulu, lalu simpan | Dua alur berbeda |
| **C** | Gabungan: Form Tambah Bahan punya mode "Input Manual" (1 baris) dan "Input Kloter" (tabel) | Fleksibel | UI lebih kompleks |

**Rekomendasi:** Opsi A — Form Tambah Bahan mengadopsi model kloter penuh, sama seperti Kalkulator Timbang.

---

## 4. Daftar Perubahan File

| File | Perubahan |
|------|-----------|
| `templates/kelola_bahan.html` | Modal form: tambah dropdown kloter + tabel kloter, hapus/ubah field jumlah & hargaPerKg tunggal |
| `templates/kelola_bahan_karyawan.html` | Sama seperti kelola_bahan.html |
| `static/js/kelola_bahan.js` | Fungsi `renderKloterForms()`, `hitungFromKloter()`, ubah `saveBahan()` untuk agregasi dari kloter |
| `app.py` | API `create_bahan`: terima `kloter` atau `detailKloter`, agregasi `jumlah`, `hargaPerKg`, `totalPengeluaran` |
| `static/js/kalkulator_timbang.js` | (Opsional) Tambah tombol "Simpan ke Bahan" yang redirect dengan query params |

---

## 5. Contoh Payload API Baru

**Request POST /api/bahan (dengan model kloter):**

```json
{
  "idBahan": "BHN001",
  "pemasok": "Pemasok Utama A",
  "varietas": "Typica",
  "jenisKopi": "Arabika",
  "tanggalMasuk": "2024-01-15",
  "kualitas": "Premium",
  "haccpBendaAsing": true,
  "haccpHamaJamur": true,
  "haccpKondisiBaik": true,
  "detailKloter": [
    { "kloter": 1, "berat": 50, "hargaPerKg": 50000, "keterangan": "Karung A" },
    { "kloter": 2, "berat": 100, "hargaPerKg": 47000, "keterangan": "Karung B" },
    { "kloter": 3, "berat": 100, "hargaPerKg": 48000, "keterangan": "Karung C" }
  ]
}
```

**Backend menghitung:**
- `jumlah` = 50 + 100 + 100 = **250**
- `totalPengeluaran` = (50×50000) + (100×47000) + (100×48000) = **12.000.000**
- `hargaPerKg` = 12.000.000 / 250 = **48.000**

**Response (sama seperti saat ini):** Record bahan dengan field agregat.

---

## 6. Kesimpulan

| Aspek | Sebelum | Sesudah (Model Kalkulator Timbang) |
|-------|---------|-------------------------------------|
| Input jumlah | Satu field "Jumlah (kg)" | Tabel kloter: banyak baris berat per kloter |
| Input harga | Satu field "Harga per Kg" | Tabel kloter: harga per kg per kloter |
| Perhitungan | Jumlah × Harga | Σ(berat × hargaPerKg), rata-rata tertimbang |
| Konsistensi | Berbeda dengan kalkulator | Sama dengan kalkulator timbang |
| Audit | Tidak ada detail per kloter | Opsional: simpan `detailKloter` |

Dengan integrasi ini, **pencatatan bahan mengikuti model kalkulator timbang**: multi-kloter, per-kloter ada berat dan harga, dengan agregasi otomatis ke jumlah total dan total pengeluaran.
