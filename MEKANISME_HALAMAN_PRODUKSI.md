# Mekanisme Halaman Produksi (Kelola Produksi)

## 1. Ringkasan

Halaman **Kelola Produksi** digunakan untuk mengelola proses produksi kopi dari bahan baku hingga tahap pengemasan. Setiap record produksi merekam alur pengolahan kopi dengan tahapan yang berurutan (sequential), pencatatan berat di setiap tahapan, dan validasi sisa bahan.

---

## 2. Struktur Data Produksi

### 2.1 Field Utama

| Field | Tipe | Deskripsi |
|-------|------|-----------|
| `idProduksi` | string | ID unik produksi (dihasilkan otomatis backend, format PRD-YYYYMM-XXXX) |
| `idBahan` | string | ID bahan baku yang digunakan (dari Kelola Bahan) |
| `beratAwal` | number | Berat awal bahan saat mulai produksi (kg) |
| `beratTerkini` | number | Berat terkini pada tahapan saat ini (kg) |
| `beratAkhir` | number | Berat akhir setelah pengemasan (kg) — hanya untuk tahap Pengemasan |
| `prosesPengolahan` | string | Jenis proses (dari Master Data, mis. Natural Process, Honey Process) |
| `statusTahapan` | string | Tahapan saat ini (Sortasi, Fermentasi, Pencucian, dll.) |
| `kadarAir` | number | Kadar air (%) |
| `varietas` | string | Varietas kopi |
| `tanggalMasuk` | date | Tanggal bahan masuk |
| `tanggalSekarang` | date | Tanggal pencatatan |
| `haccp` | object | Checklist HACCP (bebasBendaAsing, bebasHamaJamur, kondisiBaik) |
| `historyTahapan` | array | Riwayat perubahan tahapan dan berat |

### 2.2 Urutan Tahapan Baku

```
Sortasi → Fermentasi → Pencucian → Pengeringan → Hulling → Roasting → Grinding → Pengemasan
```

- **Pengemasan** selalu menjadi tahapan akhir.
- Tahapan yang tersedia per proses pengolahan dikonfigurasi di **Kelola Data Master** (field `tahapanStatus` pada `dataProses`).

---

## 3. Alur Kerja (Workflow)

### 3.1 Tambah Produksi Baru

```
1. User klik "Tambah Produksi"
2. Form modal terbuka
3. User pilih ID Bahan → auto-fill varietas, tanggal masuk
4. Sistem tampilkan sisa bahan tersedia
5. User input: berat awal, proses pengolahan, kadar air (ID Produksi dihasilkan otomatis, preview dari API)
6. User pilih proses pengolahan → dropdown tahapan dimuat dari Master Data
7. User pilih status tahapan (harus tahapan pertama yang aktif di master)
8. User input berat terkini (wajib)
9. Jika tahap Pengemasan: user input berat akhir
10. User centang HACCP
11. Simpan → validasi sisa bahan, sequential tahapan → POST /api/produksi
```

### 3.2 Edit Produksi (Update Tahapan)

```
1. User klik Edit pada baris produksi
2. Form terisi dengan data produksi
3. ID Bahan dan berat awal dikunci (readonly)
4. User bisa ubah status tahapan (hanya maju, tidak boleh mundur/loncat)
5. User input berat terkini baru (wajib, kecuali Pengemasan)
6. Jika ubah ke Pengemasan: field berat akhir muncul, berat terkini dikunci
7. Simpan → validasi sequential → PUT /api/produksi/<id>
8. historyTahapan diperbarui
```

### 3.3 Validasi Sequential Tahapan

- Tahapan baru harus **setelah** tahapan lama (tidak boleh mundur).
- Tidak boleh **loncat** tahapan (mis. dari Sortasi langsung ke Pencucian tanpa Fermentasi).
- Validasi dilakukan di **frontend** (UI feedback) dan **backend** (saat create/update).

---

## 4. Mekanisme Detail

### 4.1 Pemilihan Bahan Baku

1. **loadBahanOptionsProduksi()**: Memuat daftar bahan dari API, menghitung sisa per bahan.
2. **calculateSisaBahan(idBahan)**: Memanggil `/api/bahan/sisa/<idBahan>`.
   - Sisa = `jumlah bahan` − Σ `beratAwal` produksi yang pakai bahan tersebut.
3. **loadBahanDataProduksi()**: Saat user pilih ID Bahan:
   - Auto-fill varietas, tanggal masuk.
   - Tampilkan sisa bahan di placeholder berat awal.
   - Set `max` berat awal = sisa bahan.

### 4.2 Proses Pengolahan dan Tahapan

1. **loadProsesPengolahanOptions()**: Memuat proses dari Master Data (`dataProses`).
2. **loadTahapanFromMasterProduksi()**: Saat user pilih proses:
   - Ambil `tahapanStatus` dari master (checkbox mana yang aktif).
   - Filter tahapan yang `true`.
   - Urutkan sesuai urutan baku.
   - Pengemasan selalu ditambahkan sebagai tahap akhir.
   - Isi dropdown Status Tahapan.

### 4.3 Field Berat

| Tahapan | Berat Awal | Berat Terkini | Berat Akhir |
|---------|------------|---------------|-------------|
| Non-Pengemasan | Wajib (add), readonly (edit) | Wajib diisi setiap update | Tidak dipakai |
| Pengemasan | Readonly | Dikunci (nilai terakhir) | Wajib diisi |

**Aturan:**
- `beratTerkini` ≤ `beratAwal`
- `beratAkhir` ≤ `beratTerkini` dan ≤ `beratAwal`

### 4.4 Validasi Sisa Bahan (Create Only)

- Backend: `sisa_bahan = jumlah_bahan - total_beratAwal_produksi`
- Jika `beratAwal` > `sisa_bahan` → error "Sisa bahan tidak mencukupi".

### 4.5 Natural Process + Fermentasi

- Natural Process **tidak** melalui Fermentasi.
- Jika proses = "Natural Process" dan tahapan = "Fermentasi" → error.

---

## 5. Backend API

### 5.1 Endpoint

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/api/produksi/next-id` | Preview ID Produksi berikutnya (PRD-YYYYMM-XXXX) |
| GET | `/api/produksi` | Ambil semua produksi |
| GET | `/api/produksi/<id>` | Ambil satu produksi |
| POST | `/api/produksi` | Buat produksi baru |
| PUT | `/api/produksi/<id>` | Update produksi |
| DELETE | `/api/produksi/<id>` | Hapus produksi |
| GET | `/api/produksi/pengemasan` | Produksi dengan status Pengemasan + berat akhir |
| GET | `/api/produksi/<id>/sisa` | Sisa produksi (berat akhir − total dikemas) |

### 5.2 Validasi Backend (Create)

- Field wajib: idProduksi, idBahan, beratAwal, prosesPengolahan, kadarAir, varietas, tanggalMasuk, tanggalSekarang, statusTahapan, haccp.
- idProduksi unik.
- Bahan harus ada.
- Sisa bahan ≥ beratAwal.
- Sequential tahapan (harus tahap pertama yang aktif).
- beratTerkini wajib, ≤ beratAwal.
- Jika Pengemasan: beratAkhir wajib, ≤ beratAwal, ≤ beratTerkini.

### 5.3 Validasi Backend (Update)

- idBahan dan beratAwal tidak boleh berubah.
- Sequential tahapan (tahapan baru harus setelah lama, tidak loncat).
- Saat Pengemasan: beratTerkini bisa dari data lama jika kosong.
- historyTahapan diperbarui jika status atau berat terkini berubah.

---

## 6. Integrasi dengan Modul Lain

### 6.1 Kelola Bahan

- Produksi memakai bahan dari Kelola Bahan.
- Berat awal produksi mengurangi sisa bahan.
- Hapus produksi menambah kembali sisa bahan.

### 6.2 Kelola Hasil Produksi

- Hanya produksi dengan status **Pengemasan** dan **berat akhir > 0** yang bisa dipilih.
- Hasil produksi merekam produk jadi (tipe, kemasan, berat saat ini) dari produksi yang sudah pengemasan.

### 6.3 Kelola Data Master

- Proses pengolahan dan tahapan diambil dari `dataProses`.
- Field `tahapanStatus` menentukan tahapan mana yang aktif per proses.

---

## 7. Diagram Alur

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        KELOLA PRODUKSI - ALUR UTAMA                       │
└─────────────────────────────────────────────────────────────────────────┘

  [Tambah Produksi]
        │
        ▼
  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
  │ Pilih       │────▶│ Pilih       │────▶│ Pilih       │
  │ ID Bahan    │     │ Proses      │     │ Status      │
  │             │     │ Pengolahan  │     │ Tahapan     │
  └─────────────┘     └─────────────┘     └─────────────┘
        │                    │                    │
        │ Auto-fill          │ Load tahapan       │ Validasi
        │ varietas,          │ dari Master        │ sequential
        │ tanggal            │                    │
        ▼                    ▼                    ▼
  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
  │ Input       │     │ Input       │     │ Jika        │
  │ berat awal  │     │ kadar air   │     │ Pengemasan: │
  │ (≤ sisa)    │     │             │     │ berat akhir │
  └─────────────┘     └─────────────┘     └─────────────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ HACCP Checklist  │
                    │ Simpan           │
                    └─────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ POST /api/       │
                    │ produksi         │
                    └─────────────────┘

  [Edit Produksi]
        │
        ▼
  ID Bahan, berat awal LOCKED
        │
        ▼
  Ubah status tahapan (hanya maju, tidak loncat)
        │
        ▼
  Input berat terkini (wajib, kecuali Pengemasan)
        │
        ▼
  PUT /api/produksi/<id>
```

---

## 8. Fungsi JavaScript Utama

| Fungsi | Deskripsi |
|--------|-----------|
| `loadProduksiData()` | Muat data produksi dari API |
| `loadBahanOptionsProduksi()` | Muat dropdown bahan + sisa |
| `loadBahanDataProduksi()` | Auto-fill saat pilih bahan |
| `loadProsesPengolahanOptions()` | Muat dropdown proses dari Master |
| `loadTahapanFromMasterProduksi()` | Muat dropdown tahapan sesuai proses |
| `validateSequentialTahapan()` | Validasi UI (feedback saat pilih tahapan) |
| `validateSequentialTahapanBeforeSave()` | Validasi sebelum simpan |
| `toggleBeratAkhirField()` | Tampilkan/sembunyikan field berat akhir |
| `displayProduksi()` | Render tabel produksi |
| `openModal()` | Buka modal tambah/edit |
| `editProduksi(id)` | Buka modal edit dengan data produksi |
| `saveProduksi()` | Simpan (create/update) |
| `deleteProduksi(id)` | Buka modal konfirmasi hapus |
| `confirmDelete()` | Eksekusi hapus |

---

## 9. Akses dan Keamanan

- **Route**: `/kelola/produksi` (Admin), `/kelola/produksi/karyawan` (Karyawan)
- **Auth Guard**: `checkAuth("Admin")` atau `checkAuth("Karyawan")`
- **Template**: `kelola_produksi.html`, `kelola_produksi_karyawan.html`

---

## 10. Catatan Penting

1. **Berat awal** tidak bisa diubah setelah produksi dibuat.
2. **ID Bahan** tidak bisa diubah setelah produksi dibuat.
3. Tahapan harus berurutan; tidak boleh loncat atau mundur.
4. Produksi dengan **hasil produksi** terkait tidak bisa dihapus.
5. **Pengemasan** adalah tahap akhir; setelah itu produksi siap untuk Kelola Hasil Produksi.

---

## 11. Detail Teknis Implementasi

### 11.1 Sumber Data dan API

- **API Service**: Halaman menggunakan `window.API.Produksi` dari `api-service.js` untuk operasi CRUD.
- **Fallback**: Jika API belum tersedia, data diambil dari `localStorage` dengan key `produksi`.
- **Master Data**: Proses pengolahan diambil dari `/api/dataProses` atau `window.API.MasterData.proses`.
- **Bahan**: Dropdown bahan memanggil `window.API.Bahan.getAll()` dan `window.API.Bahan.getSisa(idBahan)`.

### 11.2 Mapping Tahapan (Frontend ↔ Master)

Master Data menggunakan key singkat; frontend menampilkan label lengkap:

| Key Master | Label Frontend |
|------------|----------------|
| Sortasi | Sortasi Buah |
| Fermentasi | Fermentasi |
| Pencucian | Pencucian |
| Pengeringan | Pengeringan |
| Hulling | Pengupasan Kulit Tanduk (Hulling) |
| Roasting | Roasting |
| Grinding | Grinding |
| Pengemasan | Pengemasan (Tahapan Akhir) |

### 11.3 Validasi Backend: `validate_sequential_tahapan()`

Fungsi di `app.py` memvalidasi:

1. **Create mode** (`status_tahapan_lama=None`):
   - Tahapan baru harus ada di `tahapanStatus` master (kecuali Pengemasan).
2. **Update mode** (ada `status_tahapan_lama`):
   - Tahapan baru harus **setelah** tahapan lama (index lebih besar).
   - Tidak boleh **loncat** tahapan yang aktif di master.
   - Tahapan terlewat dihitung dari `urutan_tahapan[index_lama+1:index_baru]`.

### 11.4 Inisialisasi Halaman (DOMContentLoaded)

```
1. loadProduksiData() → ambil data dari API/localStorage
2. displayProduksi() → render tabel
3. loadProsesPengolahanOptions() → isi dropdown proses
4. loadVarietasOptionsProduksi() → isi datalist varietas
5. loadBahanOptionsProduksi() → isi dropdown bahan (dengan sisa per bahan)
```

### 11.5 Event Listener

| Event | Target | Aksi |
|-------|--------|------|
| `input` | searchInput | displayProduksi() (filter tabel) |
| `submit` | form[role="search"] | displayProduksi() |
| `show.bs.modal` | modalProduksi | loadProsesPengolahanOptions(), loadBahanOptionsProduksi(), reset tahapan |
| `change` | idBahan | loadBahanDataProduksi() (auto-fill varietas, tanggal, sisa) |
| `change` | prosesPengolahan | loadTahapanFromMasterProduksi() |
| `change` | statusTahapan | toggleBeratAkhirField(), validateSequentialTahapan() |
| `dataMasterUpdated` | window | Reload proses, varietas, bahan |

### 11.6 Struktur historyTahapan

Setiap entri history menyimpan:

```json
{
  "statusTahapanSebelumnya": "Sortasi",
  "statusTahapanBaru": "Fermentasi",
  "tanggal": "2025-01-28",
  "waktu": "2025-01-28T10:30:00.000Z",
  "beratAwal": 100,
  "beratTerkini": 98,
  "beratAkhir": null,
  "kadarAir": 12.5,
  "pengguna": "System",
  "userId": null
}
```

### 11.7 Urutan Simpan (saveProduksi)

1. Validasi form (checkValidity).
2. Validasi HACCP (semua checkbox harus dicentang).
3. Ambil berat awal: dari input (add) atau dari data lama (edit).
4. Validasi berat terkini: wajib, > 0, ≤ berat awal.
5. Jika Pengemasan: validasi berat akhir wajib, ≤ berat terkini, ≤ berat awal.
6. Validasi sisa bahan (hanya add mode).
7. Validasi Natural Process + Fermentasi (frontend).
8. Validasi sequential tahapan (frontend, edit mode).
9. POST/PUT ke API → reload data → tutup modal.
