from flask import Flask, render_template, request, jsonify, redirect, url_for, make_response, session, send_from_directory  # pyright: ignore[reportMissingImports]
from flask_cors import CORS  # pyright: ignore[reportMissingModuleSource]
from pymongo import MongoClient  # pyright: ignore[reportMissingImports]
import os
from os.path import join, dirname, exists, abspath
from dotenv import load_dotenv  # pyright: ignore[reportMissingImports]
from bson import ObjectId  # pyright: ignore[reportMissingImports]
import jwt  # pyright: ignore[reportMissingImports]
import hashlib
from datetime import datetime, timedelta
from urllib.parse import quote_plus
import base64

app = Flask(__name__)
_APP_ROOT_DIR = abspath(dirname(__file__))
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'SPARTA')
app.config['SESSION_PERMANENT'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)  # 7 days session
# Cookie settings for session
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'  # Allows cookies to be sent with same-site requests
app.config['SESSION_COOKIE_SECURE'] = False  # Set to True in production with HTTPS
app.config['SESSION_COOKIE_PATH'] = '/'  # Cookie available for all paths

CORS(app, supports_credentials=True)  # Enable CORS with credentials for session

dotenv_path = join(dirname(__file__), '.env')
load_dotenv(dotenv_path)

MONGODB_URI = os.environ.get("MONGODB_URI")
DB_NAME = os.environ.get("DB_NAME")
SECRET_KEY = os.environ.get("SECRET_KEY", "SPARTA")

# Clean and encode MongoDB URI
if MONGODB_URI:
    MONGODB_URI = MONGODB_URI.strip().strip('"').strip("'")
    if '@' in MONGODB_URI and 'mongodb+srv://' in MONGODB_URI:
        try:
            parts = MONGODB_URI.split('@')
            if len(parts) == 2:
                auth_part = parts[0]
                if '://' in auth_part:
                    protocol = auth_part.split('://')[0] + '://'
                    user_pass = auth_part.split('://')[1]
                    if ':' in user_pass:
                        username, password = user_pass.split(':', 1)
                        password = password.strip('<>')
                        password_encoded = quote_plus(password)
                        MONGODB_URI = f'{protocol}{username}:{password_encoded}@{parts[1]}'
        except:
            pass

client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=8080)
db = client[DB_NAME]
try:
    client.admin.command('ping')
    print("DEBUG: KONEKSI BERHASIL!")
except Exception as e:
    print(f"DEBUG: KONEKSI GAGAL KARENA: {e}")

TOKEN_KEY = 'mytoken'

# Helper function to convert ObjectId to string in dict
# Optimized version for better performance
def json_serialize(data):
    """Optimized JSON serialization for MongoDB documents"""
    if isinstance(data, ObjectId):
        return str(data)
    if isinstance(data, list):
        # Use list comprehension for better performance
        return [json_serialize(item) for item in data]
    if isinstance(data, dict):
        # Use dict comprehension for better performance
        return {key: json_serialize(value) for key, value in data.items()}
    # Handle datetime and other types that might need conversion
    if hasattr(data, 'isoformat'):  # datetime objects
        return data.isoformat()
    return data

def parse_bool_payload(val, default=False):
    """Parse boolean dari JSON (bool, angka, atau string)."""
    if val is None:
        return default
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return bool(val)
    if isinstance(val, str):
        return val.strip().lower() in ('true', '1', 'yes', 'on')
    return default

# Helper function to get next ID for a collection
def get_next_id(collection_name):
    counter_collection = db.counters
    counter = counter_collection.find_one_and_update(
        {'_id': collection_name},
        {'$inc': {'seq': 1}},
        upsert=True,
        return_document=True
    )
    return counter['seq']

# Helper function to preview next ID without incrementing (for UI display)
def get_next_id_preview(collection_name):
    counter = db.counters.find_one({'_id': collection_name})
    seq = counter['seq'] if counter else 0
    return seq + 1

# Helper function to generate idBahan (format BHN001, BHN002, ...)
def generate_id_bahan():
    next_seq = get_next_id_preview('bahan')
    return f"BHN{str(next_seq).zfill(3)}"

# Helper function to generate idProduksi (format PRD-YYYYMM-XXXX)
def generate_id_produksi():
    """Generate next idProduksi. Atomically increments counter."""
    yyyymm = datetime.now().strftime('%Y%m')
    counter_key = f'produksi_{yyyymm}'
    seq = get_next_id(counter_key)
    return f"PRD-{yyyymm}-{str(seq).zfill(4)}"

def get_next_id_produksi_preview():
    """Preview next idProduksi without incrementing (for UI display)."""
    yyyymm = datetime.now().strftime('%Y%m')
    counter_key = f'produksi_{yyyymm}'
    seq = get_next_id_preview(counter_key)
    return f"PRD-{yyyymm}-{str(seq).zfill(4)}"

# Helper function untuk validasi sequential tahapan produksi
def validate_sequential_tahapan(proses_pengolahan, status_tahapan_baru, status_tahapan_lama=None):
    """
    Validasi urutan tahapan menurut master. Pada update: boleh menyimpan dengan tahapan **sama**
    (edit berat, tambah ID bahan, catatan); tidak boleh mundur; maju hanya satu langkah aktif
    sekaligus (anti-loncat) kecuali tidak ada tahapan terlewat yang wajib.
    
    Args:
        proses_pengolahan: Nama proses pengolahan
        status_tahapan_baru: Status tahapan baru yang ingin di-set
        status_tahapan_lama: Status tahapan lama (untuk update mode)
    
    Returns:
        tuple: (is_valid, error_message)
    """
    try:
        # Ambil data master proses pengolahan
        master_proses = db.dataProses.find_one({'nama': proses_pengolahan})
        if not master_proses:
            return False, f'Proses pengolahan "{proses_pengolahan}" tidak ditemukan di master data'
        
        tahapan_status = master_proses.get('tahapanStatus', {})
        
        # Mapping tahapan untuk validasi (nilai kanonik = kunci di tahapanStatus master)
        tahapan_map = {
            'Sortasi Cherry atau Buah Kopi': 'Sortasi',
            'Sortasi Buah': 'Sortasi',  # Kompatibilitas nama lama
            'Fermentasi': 'Fermentasi',
            'Pulping': 'Pulping',
            'Pencucian': 'Pencucian',
            'Pengeringan Awal': 'Pengeringan Awal',
            'Pengeringan Awal (Para - Para)': 'Pengeringan Awal',
            'Fermentasi 2': 'Fermentasi 2',
            'Pulping 2': 'Pulping 2',
            'Pengeringan Akhir': 'Pengeringan Akhir',
            'Pengeringan Akhir (Pengeringan Lantai)': 'Pengeringan Akhir',
            'Pengupasan Kulit Tanduk (Hulling)': 'Hulling',
            'Hand Sortasi atau Sortasi Biji Kopi': 'Hand Sortasi',
            'Roasting': 'Roasting',  # legacy (data lama)
            'Grinding': 'Grinding',
            'Pengemasan': 'Pengemasan'
        }
        
        # Daftar urutan tahapan (sesuai urutan logis proses basah → pengeringan para-para → siklus kedua → pengeringan lantai → …)
        urutan_tahapan = [
            'Sortasi', 'Fermentasi', 'Pulping', 'Pencucian',
            'Pengeringan Awal', 'Fermentasi 2', 'Pulping 2', 'Pengeringan Akhir',
            'Hulling', 'Hand Sortasi', 'Grinding', 'Pengemasan',
        ]
        
        # Mapping urutan tahapan untuk mendapatkan index
        urutan_map = {tahapan: idx for idx, tahapan in enumerate(urutan_tahapan)}
        
        # Normalisasi status tahapan baru
        status_baru_normalized = None
        for key, value in tahapan_map.items():
            if key in status_tahapan_baru or status_tahapan_baru == key:
                status_baru_normalized = value
                break
        
        if not status_baru_normalized:
            # Jika tidak ditemukan di map, coba langsung
            status_baru_normalized = status_tahapan_baru
        
        # Validasi: tahapan baru harus ada di konfigurasi master (kecuali Pengemasan yang selalu tersedia)
        if status_baru_normalized != 'Pengemasan':
            if not tahapan_status.get(status_baru_normalized, False):
                return False, f'Tahapan "{status_tahapan_baru}" tidak tersedia untuk proses pengolahan "{proses_pengolahan}"'
        
        # Jika ini adalah update (ada status lama), validasi sequential
        if status_tahapan_lama:
            # Normalisasi status lama
            status_lama_normalized = None
            for key, value in tahapan_map.items():
                if key in status_tahapan_lama or status_tahapan_lama == key:
                    status_lama_normalized = value
                    break
            
            if not status_lama_normalized:
                status_lama_normalized = status_tahapan_lama
            
            # Cari index tahapan lama dan baru
            try:
                index_lama = urutan_tahapan.index(status_lama_normalized)
                index_baru = urutan_tahapan.index(status_baru_normalized)
                
                # Tidak boleh mundur ke tahapan sebelumnya. Tahapan **sama** diperbolehkan
                # agar bisa simpan edit (tambah ID bahan, berat, catatan) tanpa memajukan proses.
                if index_baru < index_lama:
                    return False, (
                        f'Tidak dapat mengubah tahapan dari "{status_tahapan_lama}" ke "{status_tahapan_baru}". '
                        'Tidak boleh kembali ke tahapan sebelumnya.'
                    )
                
                # Jika tidak maju tahapan, tidak perlu cek loncat
                if index_baru == index_lama:
                    return True, None
                
                # Validasi: tidak boleh loncat tahapan (hanya saat maju)
                if index_baru - index_lama > 1:
                    tahapan_terlewat = urutan_tahapan[index_lama + 1:index_baru]
                    # Filter hanya tahapan yang ada di konfigurasi master
                    tahapan_terlewat_valid = [t for t in tahapan_terlewat if tahapan_status.get(t, False) or t == 'Pengemasan']
                    if tahapan_terlewat_valid:
                        return False, f'Tidak dapat melompati tahapan. Tahapan yang terlewat: {", ".join(tahapan_terlewat_valid)}'
            except ValueError:
                # Jika tahapan tidak ditemukan di urutan, skip validasi sequential
                pass
        
        return True, None
    except Exception as e:
        return False, f'Error validasi tahapan: {str(e)}'


def _clean_detail_kloter_list(detail_kloter):
    """Normalize detailKloter: only rows with berat > 0, renumber kloter."""
    detail_kloter_clean = []
    if not detail_kloter or not isinstance(detail_kloter, list):
        return detail_kloter_clean
    for k in detail_kloter:
        berat = float(k.get('berat', 0) or 0)
        if berat > 0:
            detail_kloter_clean.append({
                'kloter': len(detail_kloter_clean) + 1,
                'berat': berat,
                'keterangan': k.get('keterangan', '') or ''
            })
    return detail_kloter_clean


def _normalize_proses_bahan_payload(proses_bahan_raw):
    """
    Validate prosesBahan[] against master dataProses.
    Returns (clean_list, total_berat, error_message).
    """
    if not proses_bahan_raw or not isinstance(proses_bahan_raw, list) or len(proses_bahan_raw) == 0:
        return None, 0, 'prosesBahan wajib berisi minimal satu proses dengan kloter timbangan'
    pro_names = []
    proses_bahan_clean = []
    for item in proses_bahan_raw:
        pn = (item.get('prosesPengolahan') or '').strip()
        if not pn:
            return None, 0, 'Setiap baris wajib memiliki nama proses pengolahan'
        if pn in pro_names:
            return None, 0, f'Proses "{pn}" tidak boleh duplikat pada satu bahan'
        pro_names.append(pn)
        if not db.dataProses.find_one({'nama': pn}):
            return None, 0, f'Proses pengolahan "{pn}" tidak terdaftar di master data'
        dk = _clean_detail_kloter_list(item.get('detailKloter') or item.get('kloter') or [])
        if not dk:
            return None, 0, f'Minimal satu kloter dengan berat > 0 untuk proses "{pn}"'
        subtotal = sum(k['berat'] for k in dk)
        proses_bahan_clean.append({
            'prosesPengolahan': pn,
            'detailKloter': dk,
            'jumlahBeratProses': round(subtotal, 4)
        })
    total = sum(x['jumlahBeratProses'] for x in proses_bahan_clean)
    return proses_bahan_clean, total, None


def _id_bahan_list_from_produksi(doc):
    """Daftar id bahan pada dokumen produksi (idBahanList atau legacy idBahan)."""
    if not doc:
        return []
    lst = doc.get('idBahanList')
    if isinstance(lst, list) and len(lst) > 0:
        out = []
        for x in lst:
            s = str(x or '').strip()
            if s:
                out.append(s)
        return out
    ib = doc.get('idBahan')
    if ib:
        return [str(ib).strip()]
    return []


def _alokasi_map_from_produksi(doc):
    """Map idBahan -> berat terpakai dari alokasiBeratBahan atau legacy beratAwal tunggal."""
    if not doc:
        return {}
    rows = doc.get('alokasiBeratBahan')
    if isinstance(rows, list) and len(rows) > 0:
        m = {}
        for r in rows:
            if not isinstance(r, dict):
                continue
            bid = str(r.get('idBahan') or '').strip()
            if not bid:
                continue
            m[bid] = m.get(bid, 0) + float(r.get('berat', 0) or 0)
        return m
    ib = doc.get('idBahan')
    if ib:
        return {str(ib).strip(): float(doc.get('beratAwal', 0) or 0)}
    return {}


def _total_digunakan_bahan_proses(id_bahan, proses_q=None):
    """
    Total berat terpakai untuk satu id_bahan.
    Jika proses_q diisi: hanya produksi dengan prosesPengolahan sama (bahan multi-proses).
    Jika None: semua produksi yang mengalokasikan berat ke id_bahan (pool legacy).
    """
    total = 0.0
    id_bahan = str(id_bahan or '').strip()
    if not id_bahan:
        return 0.0
    pq = (proses_q or '').strip() if proses_q is not None else None
    for p in db.produksi.find({}):
        if pq is not None:
            if (p.get('prosesPengolahan') or '').strip() != pq:
                continue
        m = _alokasi_map_from_produksi(p)
        total += float(m.get(id_bahan, 0) or 0)
    return total


def _total_digunakan_bahan_proses_except(id_bahan, proses_q, exclude_id_produksi_str):
    """
    Seperti _total_digunakan_bahan_proses, tetapi mengabaikan satu dokumen produksi
    (idProduksi string) agar bisa menghitung ruang alokasi maksimum untuk dokumen itu.
    """
    total = 0.0
    id_bahan = str(id_bahan or '').strip()
    if not id_bahan:
        return 0.0
    ex = (exclude_id_produksi_str or '').strip() or None
    pq = (proses_q or '').strip() if proses_q is not None else None
    for p in db.produksi.find({}):
        if ex and (p.get('idProduksi') or '') == ex:
            continue
        if pq is not None:
            if (p.get('prosesPengolahan') or '').strip() != pq:
                continue
        m = _alokasi_map_from_produksi(p)
        total += float(m.get(id_bahan, 0) or 0)
    return total


def _all_id_bahan_terpakai_produksi(exclude_id_produksi_str=None):
    """Kumpulan id bahan yang sudah muncul di dokumen produksi (untuk bahan legacy tanpa prosesBahan: satu id hanya satu produksi)."""
    used = set()
    ex = (exclude_id_produksi_str or '').strip() or None
    for p in db.produksi.find({}, {'idBahan': 1, 'idBahanList': 1, 'idProduksi': 1}):
        if ex and (p.get('idProduksi') or '') == ex:
            continue
        used.update(_id_bahan_list_from_produksi(p))
    return used


def _produksi_filter_by_bahan_id(id_bahan):
    """Query MongoDB untuk produksi yang memakai id_bahan (tunggal atau dalam daftar)."""
    id_bahan = str(id_bahan or '').strip()
    return {'$or': [{'idBahan': id_bahan}, {'idBahanList': id_bahan}]}


def _status_tambah_bahan_dikunci(status_tahapan):
    """
    Setelah tahap Pengeringan Akhir (dan selanjutnya), penambahan ID bahan tidak diizinkan.
    """
    s = (status_tahapan or '').strip()
    if not s:
        return False
    if 'Pengeringan Akhir' in s:
        return True
    for m in (
        'Hulling', 'Hand Sortasi', 'Grinding', 'Pengemasan',
        'Pengupasan Kulit Tanduk', 'Roasting',
    ):
        if m in s:
            return True
    return False


def _sisa_bahan_line(bahan_doc, id_bahan, proses_pengolahan):
    """
    Sisa berat untuk kombinasi idBahan + proses (atau legacy: satu pool per idBahan).
    Returns (sisa_float, error_message or None).
    """
    lines = bahan_doc.get('prosesBahan') or []
    if lines:
        if not proses_pengolahan:
            return None, 'prosesPengolahan wajib untuk bahan yang memiliki pemisahan proses'
        line = next((l for l in lines if l.get('prosesPengolahan') == proses_pengolahan), None)
        if not line:
            return None, f'Proses "{proses_pengolahan}" tidak terdaftar pada bahan ini'
        cap = float(line.get('jumlahBeratProses', 0) or 0)
        used = _total_digunakan_bahan_proses(id_bahan, proses_pengolahan)
        return max(0.0, cap - used), None
    # Legacy: satu pool stok per idBahan
    cap = float(bahan_doc.get('jumlah', 0) or 0)
    used = _total_digunakan_bahan_proses(id_bahan, None)
    return max(0.0, cap - used), None


def _sync_produksi_proses_pengolahan_after_bahan_update(id_bahan, old_proses_rows, new_proses_rows):
    """
    Menyamakan prosesPengolahan pada dokumen produksi ketika baris proses di kelola bahan
    diubah (nama/urutan). Produksi menyimpan salinan string proses saat dibuat; tanpa
    sinkron ini data produksi tetap memakai nama lama walau master bahan sudah diperbarui.
    """
    id_bahan = str(id_bahan or '').strip()
    if not id_bahan or not new_proses_rows:
        return
    old_list = old_proses_rows if isinstance(old_proses_rows, list) else []
    new_list = new_proses_rows if isinstance(new_proses_rows, list) else []
    if len(new_list) == 1:
        only = (new_list[0].get('prosesPengolahan') or '').strip()
        if only:
            r = db.produksi.update_many(
                _produksi_filter_by_bahan_id(id_bahan),
                {'$set': {'prosesPengolahan': only}}
            )
            if r.matched_count and not r.modified_count:
                print(
                    f"ℹ️ [SYNC PROSES] idBahan={id_bahan}: produksi sudah '{only}' "
                    f"({r.matched_count} dokumen)"
                )
            elif r.modified_count:
                print(
                    f"✅ [SYNC PROSES] idBahan={id_bahan}: semua produksi → '{only}' "
                    f"({r.modified_count} dokumen)"
                )
            elif r.matched_count == 0:
                print(
                    f"⚠️ [SYNC PROSES] idBahan={id_bahan}: tidak ada produksi dengan idBahan ini. "
                    "Periksa konsistensi penulisan idBahan di data produksi."
                )
        return
    n = min(len(old_list), len(new_list))
    changes = []
    for i in range(n):
        o = (old_list[i].get('prosesPengolahan') or '').strip()
        nn = (new_list[i].get('prosesPengolahan') or '').strip()
        if o and nn and o != nn:
            changes.append((o, nn))
    if not changes:
        return
    # Dua fase agar swap nama antar baris tidak saling menimpa
    TEMP = '__sync_proses_pp__'
    for idx, (o, _) in enumerate(changes):
        mid = f'{TEMP}{idx}'
        db.produksi.update_many(
            {**_produksi_filter_by_bahan_id(id_bahan), 'prosesPengolahan': o},
            {'$set': {'prosesPengolahan': mid}}
        )
    for idx, (_, nn) in enumerate(changes):
        mid = f'{TEMP}{idx}'
        r = db.produksi.update_many(
            {**_produksi_filter_by_bahan_id(id_bahan), 'prosesPengolahan': mid},
            {'$set': {'prosesPengolahan': nn}}
        )
        if r.modified_count:
            print(
                f"✅ [SYNC PROSES] idBahan={id_bahan}: '{nn}' "
                f"({r.modified_count} dokumen)"
            )
    if len(old_list) > len(new_list):
        print(
            f"⚠️ [SYNC PROSES] idBahan={id_bahan}: jumlah baris proses berkurang; "
            "produksi yang memakai nama proses yang dihapus tidak diubah otomatis."
        )


def _proses_bahan_stok_equivalent(old_lines, new_lines):
    """True jika setiap jalur punya nama proses + jumlahBeratProses yang sama (abaikan detail kloter)."""
    def norm(lst):
        if not isinstance(lst, list):
            return []
        out = []
        for x in lst:
            if not isinstance(x, dict):
                continue
            pn = (x.get('prosesPengolahan') or '').strip()
            try:
                w = round(float(x.get('jumlahBeratProses', 0) or 0), 4)
            except (TypeError, ValueError):
                w = 0.0
            out.append((pn, w))
        return sorted(out, key=lambda t: t[0])

    return norm(old_lines) == norm(new_lines)


def _adjust_produksi_allocations_after_bahan_master_change(id_bahan):
    """
    Setelah master bahan (prosesBahan atau jumlah legacy) berubah dengan ID yang sama:
    sesuaikan alokasi per produksi ke kapasitas jalur / pool baru — tanpa membuang ID
    jika proses produksi masih punya baris di master. Jika proses produksi tidak lagi ada
    di master, ID dilepas dari dokumen itu (setara uncentang untuk jalur yang hilang).
    """
    id_bahan = str(id_bahan or '').strip()
    if not id_bahan:
        return {'updated': 0}
    bdoc = db.bahan.find_one({'idBahan': id_bahan})
    if not bdoc:
        return {'updated': 0}
    lines = bdoc.get('prosesBahan') or []
    updated = 0
    for p in db.produksi.find(_produksi_filter_by_bahan_id(id_bahan)):
        if id_bahan not in _id_bahan_list_from_produksi(p):
            continue
        amap = _alokasi_map_from_produksi(p)
        cur = float(amap.get(id_bahan, 0) or 0)
        if cur <= 1e-9:
            continue
        pp = (p.get('prosesPengolahan') or '').strip()
        id_prod = (p.get('idProduksi') or '').strip() or None
        if lines:
            line = next((l for l in lines if l.get('prosesPengolahan') == pp), None)
            if not line:
                # Proses produksi tidak lagi ada di master → lepaskan ID (sama seperti cascade parsial)
                ids = _id_bahan_list_from_produksi(p)
                new_ids = [x for x in ids if x != id_bahan]
                alok_rows = p.get('alokasiBeratBahan')
                new_alok = []
                if isinstance(alok_rows, list):
                    for r in alok_rows:
                        if not isinstance(r, dict):
                            continue
                        bid = str(r.get('idBahan', '') or '').strip()
                        if not bid or bid == id_bahan:
                            continue
                        try:
                            bw = float(r.get('berat', 0) or 0)
                        except (TypeError, ValueError):
                            bw = 0.0
                        new_alok.append({'idBahan': bid, 'berat': bw})
                old_bw = float(p.get('beratAwal', 0) or 0)
                new_bw = max(0.0, round(old_bw - cur, 4))
                primary = new_ids[0] if new_ids else ''
                fields = {
                    'idBahanList': new_ids,
                    'idBahan': primary,
                    'alokasiBeratBahan': new_alok,
                    'beratAwal': new_bw,
                    'bahanMasterBerubahLepasOtomatis': True,
                    'bahanMasterBerubahLepasPada': datetime.now().isoformat(),
                }
                try:
                    bt_f = float(p.get('beratTerkini'))
                except (TypeError, ValueError):
                    bt_f = None
                if bt_f is not None:
                    if new_bw <= 1e-6:
                        fields['beratTerkini'] = 0.0
                    elif bt_f > new_bw:
                        fields['beratTerkini'] = new_bw
                try:
                    ba_f = float(p.get('beratAkhir')) if p.get('beratAkhir') is not None else None
                except (TypeError, ValueError):
                    ba_f = None
                if ba_f is not None:
                    if new_bw <= 1e-6:
                        fields['beratAkhir'] = None
                    elif ba_f > new_bw:
                        fields['beratAkhir'] = round(min(ba_f, new_bw), 4)
                db.produksi.update_one(
                    {'_id': p['_id']},
                    {
                        '$set': fields,
                        '$unset': {
                            'bahanMasterAlokasiDisesuaikan': '',
                            'bahanMasterAlokasiDisesuaikanPada': '',
                        },
                    },
                )
                updated += 1
                continue
            cap = float(line.get('jumlahBeratProses', 0) or 0)
            used_ex = _total_digunakan_bahan_proses_except(id_bahan, pp, id_prod)
            room = max(0.0, cap - used_ex)
        else:
            cap = float(bdoc.get('jumlah', 0) or 0)
            used_ex = _total_digunakan_bahan_proses_except(id_bahan, None, id_prod)
            room = max(0.0, cap - used_ex)
        new_w = round(min(cur, room), 4)
        new_w = max(0.0, new_w)
        if abs(new_w - cur) < 1e-5:
            continue
        alok_rows = p.get('alokasiBeratBahan')
        new_alok = []
        new_ids = []
        if isinstance(alok_rows, list) and len(alok_rows) > 0:
            for r in alok_rows:
                if not isinstance(r, dict):
                    continue
                bid = str(r.get('idBahan', '') or '').strip()
                try:
                    bw = float(r.get('berat', 0) or 0)
                except (TypeError, ValueError):
                    bw = 0.0
                if bid == id_bahan:
                    bw = new_w
                if bid and bw > 1e-6:
                    new_alok.append({'idBahan': bid, 'berat': round(bw, 4)})
            new_ids = [x['idBahan'] for x in new_alok]
            new_bw = round(sum(x['berat'] for x in new_alok), 4)
        else:
            if new_w <= 1e-6:
                new_ids = []
                new_alok = []
            else:
                new_ids = [id_bahan]
                new_alok = [{'idBahan': id_bahan, 'berat': new_w}]
            new_bw = round(sum(x['berat'] for x in new_alok), 4)
        primary = new_ids[0] if new_ids else ''
        fields = {
            'idBahanList': new_ids,
            'idBahan': primary,
            'alokasiBeratBahan': new_alok,
            'beratAwal': new_bw,
            'bahanMasterAlokasiDisesuaikan': True,
            'bahanMasterAlokasiDisesuaikanPada': datetime.now().isoformat(),
        }
        try:
            bt_f = float(p.get('beratTerkini'))
        except (TypeError, ValueError):
            bt_f = None
        if bt_f is not None:
            if new_bw <= 1e-6:
                fields['beratTerkini'] = 0.0
            elif bt_f > new_bw:
                fields['beratTerkini'] = new_bw
        try:
            ba_f = float(p.get('beratAkhir')) if p.get('beratAkhir') is not None else None
        except (TypeError, ValueError):
            ba_f = None
        if ba_f is not None:
            if new_bw <= 1e-6:
                fields['beratAkhir'] = None
            elif ba_f > new_bw:
                fields['beratAkhir'] = round(min(ba_f, new_bw), 4)
        db.produksi.update_one(
            {'_id': p['_id']},
            {
                '$set': fields,
                '$unset': {
                    'bahanMasterBerubahLepasOtomatis': '',
                    'bahanMasterBerubahLepasPada': '',
                },
            },
        )
        updated += 1
    if updated:
        print(
            f"✅ [ADJUST BAHAN→PRODUKSI] idBahan={id_bahan}: "
            f"alokasi disesuaikan ke kapasitas master pada {updated} dokumen."
        )
    return {'updated': updated}


def _cascade_remove_id_bahan_dari_produksi_setelah_master_bahan_diubah(id_bahan):
    """
    Setelah master bahan diubah (proses/berat/id/jumlah), lepaskan ID bahan tersebut
    dari semua dokumen produksi yang memakainya: hapus dari idBahanList & alokasi,
    kurangi beratAwal, sesuaikan berat terkini/akhir. Setara 'uncentang' di UI agar
    operator memilih ulang dan mendapat sisa baru.
    """
    id_bahan = str(id_bahan or '').strip()
    if not id_bahan:
        return {'matched': 0, 'updated': 0}
    matched = 0
    updated = 0
    for p in db.produksi.find(_produksi_filter_by_bahan_id(id_bahan)):
        matched += 1
        ids = _id_bahan_list_from_produksi(p)
        if id_bahan not in ids:
            continue
        amap = _alokasi_map_from_produksi(p)
        removed_w = float(amap.get(id_bahan, 0) or 0)
        new_ids = [x for x in ids if x != id_bahan]
        alok_rows = p.get('alokasiBeratBahan')
        new_alok = []
        if isinstance(alok_rows, list):
            for r in alok_rows:
                if not isinstance(r, dict):
                    continue
                bid = str(r.get('idBahan', '') or '').strip()
                if not bid or bid == id_bahan:
                    continue
                try:
                    bw = float(r.get('berat', 0) or 0)
                except (TypeError, ValueError):
                    bw = 0.0
                new_alok.append({'idBahan': bid, 'berat': bw})
        old_bw = float(p.get('beratAwal', 0) or 0)
        new_bw = max(0.0, round(old_bw - removed_w, 4))
        primary = new_ids[0] if new_ids else ''
        fields = {
            'idBahanList': new_ids,
            'idBahan': primary,
            'alokasiBeratBahan': new_alok,
            'beratAwal': new_bw,
            'bahanMasterBerubahLepasOtomatis': True,
            'bahanMasterBerubahLepasPada': datetime.now().isoformat(),
        }
        try:
            bt_f = float(p.get('beratTerkini'))
        except (TypeError, ValueError):
            bt_f = None
        if bt_f is not None:
            if new_bw <= 1e-6:
                fields['beratTerkini'] = 0.0
            elif bt_f > new_bw:
                fields['beratTerkini'] = new_bw
        try:
            ba_f = float(p.get('beratAkhir')) if p.get('beratAkhir') is not None else None
        except (TypeError, ValueError):
            ba_f = None
        if ba_f is not None:
            if new_bw <= 1e-6:
                fields['beratAkhir'] = None
            elif ba_f > new_bw:
                fields['beratAkhir'] = round(min(ba_f, new_bw), 4)
        db.produksi.update_one({'_id': p['_id']}, {'$set': fields})
        updated += 1
    if updated:
        print(
            f"✅ [CASCADE BAHAN→PRODUKSI] idBahan={id_bahan}: "
            f"melepaskan dari {updated} dokumen produksi (dari {matched} kandidat)."
        )
    return {'matched': matched, 'updated': updated}


def _cascade_rename_master_proses_pengolahan(old_nama, new_nama):
    """
    Saat nama proses di dataProses diubah, perbarui semua salinan string nama lama
    (produksi, bahan.prosesBahan, pemesanan, hasilProduksi) agar validasi master
    seperti validate_sequential_tahapan tidak gagal dengan 'tidak ditemukan'.
    """
    old_nama = (old_nama or '').strip()
    new_nama = (new_nama or '').strip()
    if not old_nama or not new_nama or old_nama == new_nama:
        return {
            'produksi_updated': 0,
            'bahan_updated': 0,
            'pemesanan_updated': 0,
            'hasilProduksi_updated': 0,
        }
    stats = {
        'produksi_updated': 0,
        'bahan_updated': 0,
        'pemesanan_updated': 0,
        'hasilProduksi_updated': 0,
    }
    r_prod = db.produksi.update_many(
        {'prosesPengolahan': old_nama},
        {'$set': {'prosesPengolahan': new_nama}},
    )
    stats['produksi_updated'] = int(r_prod.modified_count or 0)

    r_hasil = db.hasilProduksi.update_many(
        {'prosesPengolahan': old_nama},
        {'$set': {'prosesPengolahan': new_nama}},
    )
    stats['hasilProduksi_updated'] = int(r_hasil.modified_count or 0)

    for doc in db.bahan.find({'prosesBahan.prosesPengolahan': old_nama}):
        lines = list(doc.get('prosesBahan') or [])
        changed = False
        for line in lines:
            if not isinstance(line, dict):
                continue
            if (line.get('prosesPengolahan') or '').strip() == old_nama:
                line['prosesPengolahan'] = new_nama
                changed = True
        if changed:
            db.bahan.update_one({'_id': doc['_id']}, {'$set': {'prosesBahan': lines}})
            stats['bahan_updated'] += 1

    pem_filter = {
        '$or': [
            {'prosesPengolahan': old_nama},
            {'kloter.prosesPengolahan': old_nama},
            {'items.prosesPengolahan': old_nama},
        ]
    }
    for doc in db.pemesanan.find(pem_filter):
        set_fields = {}
        if (doc.get('prosesPengolahan') or '').strip() == old_nama:
            set_fields['prosesPengolahan'] = new_nama
        for arr_key in ('kloter', 'items'):
            arr = doc.get(arr_key)
            if not isinstance(arr, list):
                continue
            new_arr = []
            row_changed = False
            for row in arr:
                if isinstance(row, dict) and (row.get('prosesPengolahan') or '').strip() == old_nama:
                    new_row = dict(row)
                    new_row['prosesPengolahan'] = new_nama
                    new_arr.append(new_row)
                    row_changed = True
                else:
                    new_arr.append(row)
            if row_changed:
                set_fields[arr_key] = new_arr
        if set_fields:
            db.pemesanan.update_one({'_id': doc['_id']}, {'$set': set_fields})
            stats['pemesanan_updated'] += 1

    total = sum(stats.values())
    if total:
        print(
            f"✅ [RENAME PROSES] '{old_nama}' → '{new_nama}': "
            f"produksi={stats['produksi_updated']}, bahan={stats['bahan_updated']}, "
            f"pemesanan={stats['pemesanan_updated']}, hasilProduksi={stats['hasilProduksi_updated']}"
        )
    return stats


def _last_snapshot_pengeringan_awal(produksi_lama):
    """
    Ambil kadar air & berat terkini acuan dari Pengeringan Awal terakhir
    (dokumen saat ini jika sedang di tahap itu, atau entri history terbaru).
    Dipakai saat validasi Pengeringan Akhir setelah tahap antara (mis. Pulping 2).
    """
    if not produksi_lama:
        return None, None
    st = (produksi_lama.get('statusTahapan') or '')
    if 'Pengeringan Awal' in st and produksi_lama.get('kadarAir') is not None:
        try:
            ka = float(produksi_lama['kadarAir'])
        except (TypeError, ValueError):
            ka = None
        try:
            bt = float(produksi_lama['beratTerkini']) if produksi_lama.get('beratTerkini') is not None else None
        except (TypeError, ValueError):
            bt = None
        if ka is not None:
            return ka, bt
    hist = produksi_lama.get('historyTahapan') or []
    if not isinstance(hist, list):
        return None, None
    for entry in reversed(hist):
        if not isinstance(entry, dict):
            continue
        nama = (entry.get('namaTahapan') or entry.get('statusTahapanSebelumnya') or '')
        if 'Pengeringan Awal' not in nama:
            continue
        ka = entry.get('kadarAir')
        bt = entry.get('beratTerkini')
        if ka is None:
            continue
        try:
            ka_f = float(ka)
        except (TypeError, ValueError):
            continue
        try:
            bt_f = float(bt) if bt is not None else None
        except (TypeError, ValueError):
            bt_f = None
        return ka_f, bt_f
    return None, None


# Helper function untuk validasi khusus tahapan Pengeringan Awal dan Akhir
def validate_pengeringan_tahapan(status_tahapan_baru, kadar_air_baru, berat_terkini_baru, produksi_lama=None):
    """
    Validasi khusus untuk tahapan Pengeringan Awal dan Pengeringan Akhir.
    
    Args:
        status_tahapan_baru: Status tahapan baru
        kadar_air_baru: Kadar air baru (wajib untuk Pengeringan Awal & Akhir)
        berat_terkini_baru: Berat terkini baru
        produksi_lama: Data produksi lama (untuk validasi Pengeringan Akhir)
    
    Returns:
        tuple: (is_valid, error_message)
    """
    try:
        # Normalisasi status tahapan
        status_normalized = status_tahapan_baru
        if 'Pengeringan Awal' in status_tahapan_baru:
            status_normalized = 'Pengeringan Awal'
        elif 'Pengeringan Akhir' in status_tahapan_baru:
            status_normalized = 'Pengeringan Akhir'
        
        # Validasi kadar air wajib untuk Pengeringan Awal & Akhir
        if status_normalized in ['Pengeringan Awal', 'Pengeringan Akhir']:
            if not kadar_air_baru or kadar_air_baru < 0 or kadar_air_baru > 100:
                return False, f'Kadar air wajib diisi untuk tahapan {status_normalized} (0-100%)'
        
        # Validasi khusus untuk Pengeringan Akhir
        if status_normalized == 'Pengeringan Akhir':
            # Harus ada produksi lama untuk validasi (hanya untuk update mode)
            if not produksi_lama:
                # Untuk create mode, Pengeringan Akhir tidak bisa langsung dipilih (harus melalui Pengeringan Awal dulu)
                # Validasi sequential akan menangani ini
                return True, None  # Biarkan validasi sequential menangani
            
            status_lama = (produksi_lama.get('statusTahapan') or '').strip()
            # Alur lama: langsung setelah Pengeringan Awal. Alur baru: setelah Pulping 2.
            sl = status_lama
            boleh_dari_awal = 'Pengeringan Awal' in sl
            boleh_dari_pulping2 = sl == 'Pulping 2' or 'Pulping 2' in sl
            if not (boleh_dari_awal or boleh_dari_pulping2):
                return False, (
                    'Pengeringan Akhir hanya dapat dipilih jika tahapan sebelumnya '
                    'adalah Pengeringan Awal atau Pulping 2 (sesuai alur yang dikonfigurasi).'
                )

            kadar_air_awal, berat_terkini_awal = _last_snapshot_pengeringan_awal(produksi_lama)

            # Validasi kadar air Pengeringan Akhir harus lebih kecil dari acuan Pengeringan Awal (jika ada)
            if kadar_air_awal is not None:
                if kadar_air_baru >= kadar_air_awal:
                    return False, f'Kadar air Pengeringan Akhir ({kadar_air_baru}%) harus lebih kecil dari kadar air Pengeringan Awal ({kadar_air_awal}%)'

            # Validasi berat terkini Pengeringan Akhir ≤ acuan berat setelah Pengeringan Awal (jika ada)
            if berat_terkini_awal is not None:
                if berat_terkini_baru > berat_terkini_awal:
                    return False, f'Berat terkini Pengeringan Akhir ({berat_terkini_baru} kg) tidak boleh lebih besar dari berat terkini Pengeringan Awal ({berat_terkini_awal} kg)'
        
        return True, None
    except Exception as e:
        return False, f'Error validasi tahapan pengeringan: {str(e)}'

# ==================== AUTHENTICATION & SESSION HELPERS ====================

def check_auth_session():
    """Check if user is authenticated via sessionStorage"""
    # Since we're using sessionStorage on client-side, we'll check via request headers or cookies
    # For now, we'll allow access and let client-side auth-guard handle it
    # This function can be extended to check server-side session if needed
    return True

def get_user_role_from_session():
    """Get user role from session (can be extended for server-side sessions)"""
    # Currently handled client-side via sessionStorage
    return None

# ==================== BRAND ASSETS (invoice, dll.) ====================

@app.route('/brand-assets/logo.png')
def brand_logo_argopuro():
    """Logo Argopuro Walida untuk invoice PDF (Image/logo.png)."""
    img_dir = join(_APP_ROOT_DIR, 'Image')
    logo_path = join(img_dir, 'logo.png')
    if not exists(logo_path):
        return jsonify({'error': 'Logo tidak ditemukan'}), 404
    return send_from_directory(img_dir, 'logo.png', mimetype='image/png')


# ==================== MAIN ROUTES ====================

@app.route('/')
def welcome():
    """Welcome page - entry point for all users"""
    return render_template('welcome.html')

@app.route('/login')
def login():
    """Login page - Admin"""
    return render_template('login.html')

@app.route('/login/karyawan')
def login_karyawan():
    """Login page - Karyawan"""
    return render_template('login_karyawan.html')

@app.route('/login/owner')
def login_owner():
    """Login page - Owner"""
    return render_template('login_owner.html')

@app.route('/register')
def register():
    """Registration page"""
    return render_template('register.html')

@app.route('/dashboard')
def dashboard():
    """Dashboard - Admin (requires auth)"""
    # Debug: Log session state
    print(f"🔍 Dashboard access check:")
    print(f"   Session keys: {list(session.keys())}")
    print(f"   user_id in session: {'user_id' in session}")
    print(f"   username: {session.get('username', 'NOT SET')}")
    print(f"   role: {session.get('role', 'NOT SET')}")
    print(f"   Request origin: {request.headers.get('Origin', 'N/A')}")
    print(f"   Request host: {request.headers.get('Host', 'N/A')}")
    
    # Server-side session check - if not logged in, redirect to welcome
    if 'user_id' not in session or not session.get('username') or not session.get('role'):
        print("❌ Session check failed - redirecting to welcome")
        return redirect(url_for('welcome'))
    # Role check - only Admin can access this dashboard
    if session.get('role') != 'Admin':
        print(f"❌ Role check failed - User role: {session.get('role')}, Required: Admin")
        return redirect(url_for('welcome'))
    
    print(f"✅ Dashboard access granted for {session.get('username')}")
    # Auth check will also be done client-side via auth-guard.js for additional protection
    return render_template('index.html')

@app.route('/dashboard/karyawan')
def dashboard_karyawan():
    """Dashboard - Karyawan (requires auth)"""
    # Server-side session check - if not logged in, redirect to welcome
    if 'user_id' not in session or not session.get('username') or not session.get('role'):
        return redirect(url_for('welcome'))
    # Role check - only Karyawan can access this dashboard
    if session.get('role') != 'Karyawan':
        return redirect(url_for('welcome'))
    # Auth check will also be done client-side via auth-guard.js for additional protection
    return render_template('index_karyawan.html')

@app.route('/dashboard/owner')
def dashboard_owner():
    """Dashboard - Owner (requires auth)"""
    # Server-side session check - if not logged in, redirect to welcome
    if 'user_id' not in session or not session.get('username') or not session.get('role'):
        return redirect(url_for('welcome'))
    # Role check - only Owner can access this dashboard
    if session.get('role') != 'Owner':
        return redirect(url_for('welcome'))
    # Auth check will also be done client-side via auth-guard.js for additional protection
    return render_template('index_owner.html')

# ==================== MANAGEMENT ROUTES ====================

@app.route('/kelola/pengguna')
def kelola_pengguna():
    """User management page"""
    return render_template('kelola_pengguna.html')

@app.route('/kelola/bahan')
def kelola_bahan():
    """Material management page"""
    return render_template('kelola_bahan.html')

@app.route('/kelola/bahan/karyawan')
def kelola_bahan_karyawan():
    """Material management page - Karyawan"""
    return render_template('kelola_bahan_karyawan.html')

@app.route('/kelola/produksi')
def kelola_produksi():
    """Production management page"""
    return render_template('kelola_produksi.html')

@app.route('/kelola/produksi/karyawan')
def kelola_produksi_karyawan():
    """Production management page - Karyawan"""
    return render_template('kelola_produksi_karyawan.html')

@app.route('/kelola/hasil-produksi')
def kelola_hasil_produksi():
    """Redirect: stok otomatis dari produksi tahap Pengemasan, tidak ada input hasil produksi manual."""
    return redirect(url_for('kelola_stok'))

@app.route('/kelola/hasil-produksi/karyawan')
def kelola_hasil_produksi_karyawan():
    """Hapus: fitur hasil produksi tidak tersedia untuk karyawan."""
    return redirect(url_for('dashboard_karyawan'))

@app.route('/kelola/pemasok')
def kelola_pemasok():
    """Supplier management page"""
    return render_template('kelola_pemasok.html')

@app.route('/kelola/stok')
def kelola_stok():
    """Stock management page"""
    return render_template('kelola_stok.html')

@app.route('/kelola/keuangan')
def kelola_keuangan():
    """Financial management page"""
    return render_template('kelola_keuangan.html')

@app.route('/kelola/data')
def kelola_data():
    """Master data management page"""
    return render_template('kelola_data.html')

@app.route('/kelola/sanitasi')
def kelola_sanitasi():
    """Sanitation management page"""
    return render_template('kelola_sanitasi.html')

@app.route('/kelola/sanitasi/karyawan')
def kelola_sanitasi_karyawan():
    """Sanitation management page - Karyawan"""
    return render_template('kelola_sanitasi_karyawan.html')

@app.route('/kelola/laporan')
def kelola_laporan():
    """Report page"""
    return render_template('kelola_laporan.html')

@app.route('/kelola/laporan/owner')
def kelola_laporan_owner():
    """Report page - Owner"""
    return render_template('kelola_laporan_owner.html')

@app.route('/kelola/pemesanan')
def kelola_pemesanan():
    """Pemesanan management page"""
    return render_template('kelola_pemesanan.html')

@app.route('/profile')
def profile():
    """Profile page"""
    return render_template('profile.html')

@app.route('/profile/karyawan')
def profile_karyawan():
    """Profile page - Karyawan"""
    return render_template('profile_karyawan.html')

@app.route('/profile/owner')
def profile_owner():
    """Profile page - Owner"""
    return render_template('profile_owner.html')

@app.route('/pengaturan')
def pengaturan():
    """Settings page"""
    return render_template('pengaturan.html')

@app.route('/pengaturan/karyawan')
def pengaturan_karyawan():
    """Settings page - Karyawan"""
    return render_template('pengaturan_karyawan.html')

@app.route('/pengaturan/owner')
def pengaturan_owner():
    """Settings page - Owner"""
    return render_template('pengaturan_owner.html')

@app.route('/api/health', methods=['GET'])
def health_check():
    """
    Health check endpoint.

    Railway sering butuh respons cepat untuk readiness/liveness.
    Jadi endpoint ini akan selalu balas HTTP 200 (status 'ok') dan
    hanya menginformasikan status koneksi MongoDB secara best-effort.
    """
    # Jika env MongoDB belum diset, tetap balas 200 agar container dianggap responsive
    if not MONGODB_URI or not DB_NAME:
        return jsonify({
            'status': 'ok',
            'database': 'missing_config',
            'message': 'Backend is running, MongoDB env is not configured'
        }), 200

    # Best-effort ping Mongo dengan timeout kecil supaya tidak menggantung
    try:
        test_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=1000)
        test_client.admin.command('ping')
        return jsonify({
            'status': 'ok',
            'database': 'connected',
            'message': 'Backend is running and MongoDB is connected'
        }), 200
    except Exception as e:
        return jsonify({
            'status': 'ok',
            'database': 'disconnected',
            'error': str(e)
        }), 200


def _normalize_catatan_produksi(raw):
    """Catatan opsional pada dokumen produksi; teks dipotong aman."""
    if raw is None:
        return ''
    s = str(raw).strip()
    if len(s) > 2000:
        s = s[:2000]
    return s


def _upsert_catatan_per_tahapan(existing, nama_tahapan, catatan, tanggal_sekarang):
    """
    Menyimpan catatan per nama tahapan. Entri dengan nama tahapan yang sama diganti
    (update berulang di tahap yang sama). Saat pindah tahap, tahap lama dibekukan
    lalu tahap baru diisi dari form — teks boleh sama (mengikuti alur pembaruan).
    """
    existing = list(existing) if isinstance(existing, list) else []
    key = (nama_tahapan or '').strip()
    norm = _normalize_catatan_produksi(catatan)
    if tanggal_sekarang is not None and not isinstance(tanggal_sekarang, str):
        tgl = str(tanggal_sekarang)
    else:
        tgl = tanggal_sekarang or ''
    row = {
        'namaTahapan': key,
        'catatan': norm,
        'tanggalSekarang': tgl,
    }
    for i, r in enumerate(existing):
        nk = (r.get('namaTahapan') or r.get('tahapan') or '').strip()
        if nk == key:
            existing[i] = row
            return existing
    existing.append(row)
    return existing


# ==================== PRODUKSI ENDPOINTS ====================

@app.route('/api/produksi/next-id', methods=['GET'])
def get_next_id_produksi():
    """Get next auto-generated idProduksi (format PRD-YYYYMM-XXXX) for preview. Does NOT increment counter."""
    try:
        id_produksi = get_next_id_produksi_preview()
        return jsonify({'idProduksi': id_produksi}), 200
    except Exception as e:
        print(f"❌ [PRODUKSI NEXT-ID] ERROR: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/produksi', methods=['GET'])
def get_produksi():
    """Get all produksi data"""
    try:
        produksi = list(db.produksi.find().sort('id', 1))
        print(f"📊 [PRODUKSI GET] Retrieved {len(produksi)} documents from MongoDB collection 'produksi'")
        return jsonify(json_serialize(produksi)), 200
    except Exception as e:
        print(f"❌ [PRODUKSI GET] ERROR: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/produksi/<produksi_id>', methods=['GET'])
def get_produksi_by_id(produksi_id):
    """Get produksi by ID or idProduksi"""
    try:
        # Try to find by MongoDB _id first
        try:
            produksi = db.produksi.find_one({'_id': ObjectId(produksi_id)})
            if produksi:
                return jsonify(json_serialize(produksi)), 200
        except:
            pass
        
        # Try to find by idProduksi (string)
        produksi = db.produksi.find_one({'idProduksi': produksi_id})
        if produksi:
            return jsonify(json_serialize(produksi)), 200
        
        # Try to find by id (number)
        try:
            produksi = db.produksi.find_one({'id': int(produksi_id)})
            if produksi:
                return jsonify(json_serialize(produksi)), 200
        except:
            pass
        
        return jsonify({'error': 'Produksi not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def _normalize_berat_terkini_detail_kloter_produksi(data):
    """Detail kloter opsional untuk berat terkini (maks. 100 baris)."""
    raw = data.get('beratTerkiniDetailKloter')
    if raw is None:
        return None, None
    if not isinstance(raw, list):
        return None, 'beratTerkiniDetailKloter harus berupa array'
    if len(raw) > 100:
        return None, 'Maksimal 100 kloter untuk pencatatan berat terkini'
    out = []
    for i, row in enumerate(raw):
        if not isinstance(row, dict):
            continue
        try:
            b = float(row.get('berat', 0) or 0)
        except (TypeError, ValueError):
            return None, 'Berat kloter tidak valid'
        if b < 0:
            return None, 'Berat kloter tidak boleh negatif'
        out.append({
            'kloter': int(row.get('kloter', i + 1)),
            'berat': b,
            'keterangan': (row.get('keterangan') or '').strip()
        })
    return out, None


@app.route('/api/produksi', methods=['POST'])
def create_produksi():
    """Create new produksi. idProduksi is auto-generated by backend (format PRD-YYYYMM-XXXX)."""
    try:
        data = request.json
        
        # Validate required fields (idProduksi NOT required - backend generates it)
        # idBahan / idBahanList: minimal satu ID bahan (multi-bahan satu proses)
        # kadarAir hanya wajib untuk tahapan Pengeringan Awal & Akhir
        required_fields = ['beratAwal', 'prosesPengolahan',
                          'varietas', 'tanggalMasuk', 'tanggalSekarang',
                          'statusTahapan', 'haccp']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        raw_list = data.get('idBahanList')
        if isinstance(raw_list, list) and len(raw_list) > 0:
            id_bahan_list = [str(x).strip() for x in raw_list if str(x).strip()]
        elif data.get('idBahan'):
            id_bahan_list = [str(data['idBahan']).strip()]
        else:
            return jsonify({'error': 'Wajib menyediakan idBahanList atau idBahan'}), 400
        
        if len(id_bahan_list) < 1:
            return jsonify({'error': 'Minimal satu ID Bahan'}), 400
        if len(id_bahan_list) != len(set(id_bahan_list)):
            return jsonify({'error': 'ID Bahan tidak boleh duplikat dalam satu produksi'}), 400
        
        proses_pp = str(data.get('prosesPengolahan') or '').strip()
        used_globally = _all_id_bahan_terpakai_produksi(None)

        berat_awal_req = float(data['beratAwal'])
        alokasi_rows = data.get('alokasiBeratBahan')
        alokasi_clean = []
        if isinstance(alokasi_rows, list) and len(alokasi_rows) > 0:
            for r in alokasi_rows:
                if not isinstance(r, dict):
                    continue
                bid = str(r.get('idBahan') or '').strip()
                bw = float(r.get('berat', 0) or 0)
                if bid and bw > 0:
                    alokasi_clean.append({'idBahan': bid, 'berat': bw})
        elif len(id_bahan_list) == 1:
            alokasi_clean = [{'idBahan': id_bahan_list[0], 'berat': berat_awal_req}]
        else:
            return jsonify({'error': 'alokasiBeratBahan wajib jika lebih dari satu ID Bahan'}), 400
        
        ids_in_alok = {a['idBahan'] for a in alokasi_clean}
        if ids_in_alok != set(id_bahan_list):
            return jsonify({'error': 'alokasiBeratBahan harus memuat setiap ID Bahan yang dipilih tepat sekali'}), 400
        
        sum_alok = sum(a['berat'] for a in alokasi_clean)
        if abs(sum_alok - berat_awal_req) > 1e-4:
            return jsonify({'error': 'Jumlah alokasiBeratBahan harus sama dengan beratAwal'}), 400
        
        # Auto-generate idProduksi (ignore any value from frontend)
        id_produksi = generate_id_produksi()

        legacy_overlap = []
        bahan_by_id = {}
        for bid in id_bahan_list:
            bahan_one = db.bahan.find_one({'idBahan': bid})
            if not bahan_one:
                return jsonify({'error': f'Bahan tidak ditemukan: {bid}'}), 400
            bahan_by_id[bid] = bahan_one
            if not (bahan_one.get('prosesBahan') or []) and bid in used_globally:
                legacy_overlap.append(bid)
        if legacy_overlap:
            return jsonify({
                'error': 'ID bahan berikut sudah terpakai di produksi lain',
                'idBahanTerpakai': sorted(set(legacy_overlap)),
            }), 400
        
        # Validasi per bahan: proses terdaftar + sisa cukup
        for bid in id_bahan_list:
            bahan_one = bahan_by_id[bid]
            lines = bahan_one.get('prosesBahan') or []
            need = next((a['berat'] for a in alokasi_clean if a['idBahan'] == bid), 0)
            if lines:
                line = next((l for l in lines if l.get('prosesPengolahan') == proses_pp), None)
                if not line:
                    return jsonify({'error': f'Proses "{proses_pp}" tidak terdaftar pada bahan {bid}'}), 400
                sisa, err = _sisa_bahan_line(bahan_one, bid, proses_pp)
                if err:
                    return jsonify({'error': f'{bid}: {err}'}), 400
                if need > (sisa or 0) + 1e-4:
                    return jsonify({
                        'error': 'Sisa bahan tidak mencukupi',
                        'idBahan': bid,
                        'sisaTersedia': sisa,
                        'beratDiminta': need,
                    }), 400
            else:
                sisa, err = _sisa_bahan_line(bahan_one, bid, None)
                if err:
                    return jsonify({'error': f'{bid}: {err}'}), 400
                if need > (sisa or 0) + 1e-4:
                    return jsonify({
                        'error': 'Sisa bahan tidak mencukupi',
                        'idBahan': bid,
                        'sisaTersedia': sisa,
                        'beratDiminta': need,
                    }), 400
        
        id_bahan_primary = id_bahan_list[0]
        
        # Validasi sequential tahapan berdasarkan konfigurasi master
        is_valid, error_msg = validate_sequential_tahapan(
            data['prosesPengolahan'],
            data['statusTahapan'],
            None  # Tidak ada status lama untuk create mode
        )
        if not is_valid:
            return jsonify({'error': error_msg}), 400
        
        # Get and validate beratTerkini (required for every production stage)
        beratTerkini = data.get('beratTerkini')
        if not beratTerkini or beratTerkini <= 0:
            return jsonify({'error': 'Berat terkini wajib diisi dan harus lebih dari 0'}), 400
        if beratTerkini > data['beratAwal']:
            return jsonify({'error': 'Berat terkini tidak boleh lebih besar dari berat awal'}), 400
        
        detail_bt_kloter, err_detail_bt = _normalize_berat_terkini_detail_kloter_produksi(data)
        if err_detail_bt:
            return jsonify({'error': err_detail_bt}), 400
        metode_bt = data.get('metodeBeratTerkini') or 'total'
        if metode_bt not in ('total', 'kloter'):
            metode_bt = 'total'
        
        # Validasi khusus untuk tahapan Pengeringan Awal & Akhir
        kadar_air = data.get('kadarAir')
        is_valid_pengeringan, error_msg_pengeringan = validate_pengeringan_tahapan(
            data['statusTahapan'],
            kadar_air,
            beratTerkini,
            None  # Tidak ada produksi lama untuk create mode
        )
        if not is_valid_pengeringan:
            return jsonify({'error': error_msg_pengeringan}), 400
        
        # Saat Pengemasan: berat akhir + berat green beans (wajib) + berat pixel (opsional)
        beratAkhir = None
        beratGreenBeans = None
        beratPixel = None
        if 'Pengemasan' in data['statusTahapan']:
            beratAkhir = data.get('beratAkhir')
            if not beratAkhir or beratAkhir <= 0:
                return jsonify({'error': 'Berat akhir wajib diisi jika status tahapan adalah Pengemasan'}), 400
            if beratAkhir > data['beratAwal']:
                return jsonify({'error': 'Berat akhir tidak boleh lebih besar dari berat awal'}), 400
            if beratAkhir > beratTerkini:
                return jsonify({'error': 'Berat akhir tidak boleh lebih besar dari berat terkini'}), 400
            # Validasi berat green beans (wajib)
            beratGreenBeans = data.get('beratGreenBeans')
            if not beratGreenBeans or beratGreenBeans <= 0:
                return jsonify({'error': 'Berat Green Beans wajib diisi untuk tahap Pengemasan'}), 400
            if beratGreenBeans > beratAkhir:
                return jsonify({'error': 'Berat Green Beans tidak boleh lebih besar dari berat akhir'}), 400
            # Validasi berat pixel (opsional)
            beratPixel = data.get('beratPixel') or 0
            if beratPixel < 0:
                return jsonify({'error': 'Berat Produk Pixel tidak boleh bernilai negatif'}), 400
            # Total berat tidak boleh lebih dari berat akhir
            if (beratGreenBeans + beratPixel) > beratAkhir:
                return jsonify({'error': 'Total berat Green Beans + Pixel tidak boleh lebih besar dari berat akhir'}), 400
        
        # Get next ID
        new_id = get_next_id('produksi')
        
        # Tentukan kadar air: bisa diinputkan untuk semua tahapan
        # Wajib untuk Pengeringan Awal & Akhir, optional untuk lainnya
        kadar_air_value = None
        if 'kadarAir' in data and data['kadarAir'] is not None:
            # Jika ada input kadar air, gunakan nilai tersebut
            kadar_air_value = float(data.get('kadarAir', 0))
        elif 'Pengeringan' in data['statusTahapan']:
            # Untuk tahapan Pengeringan, wajib ada kadar air
            kadar_air_value = float(data.get('kadarAir', 0))
        
        # Initialize history
        # Kadar air bisa diinputkan untuk semua tahapan
        kadar_air_history = kadar_air_value
        
        historyTahapan = [{
            'namaTahapan': data['statusTahapan'],  # Nama tahapan
            'statusTahapan': data['statusTahapan'],
            'tanggal': data['tanggalSekarang'],
            'tanggalUpdate': datetime.now().isoformat(),  # Tanggal update
            'beratAwal': data['beratAwal'],
            'beratTerkini': float(beratTerkini),
            'beratAkhir': float(beratAkhir) if beratAkhir else None,
            'kadarAir': kadar_air_history  # Kadar air bisa diinputkan untuk semua tahapan
        }]
        
        catatan_norm = _normalize_catatan_produksi(data.get('catatan'))
        produksi_data = {
            'id': new_id,
            'idProduksi': id_produksi,
            'idBahan': id_bahan_primary,
            'idBahanList': id_bahan_list,
            'alokasiBeratBahan': alokasi_clean,
            'beratAwal': float(data['beratAwal']),
            'beratTerkini': float(beratTerkini),
            'beratAkhir': float(beratAkhir) if beratAkhir else None,
            'prosesPengolahan': data['prosesPengolahan'],
            'kadarAir': kadar_air_value,  # Kadar air bisa diinputkan untuk semua tahapan
            'varietas': data['varietas'],
            'tanggalMasuk': data['tanggalMasuk'],
            'tanggalSekarang': data['tanggalSekarang'],
            'statusTahapan': data['statusTahapan'],
            'haccp': data['haccp'],
            'historyTahapan': historyTahapan,
            'metodeBeratTerkini': metode_bt,
            'catatan': catatan_norm,
            'catatanPerTahapan': _upsert_catatan_per_tahapan(
                [], data['statusTahapan'], catatan_norm, data.get('tanggalSekarang')
            ),
        }
        if detail_bt_kloter:
            produksi_data['beratTerkiniDetailKloter'] = detail_bt_kloter
        if 'Pengemasan' in data['statusTahapan']:
            produksi_data['beratGreenBeans'] = float(beratGreenBeans) if beratGreenBeans else 0
            produksi_data['beratPixel'] = float(beratPixel) if beratPixel else 0
            produksi_data['tanggalPengemasan'] = data.get('tanggalSekarang') or datetime.now().strftime('%Y-%m-%d')
        
        print(f"🔵 [PRODUKSI CREATE] Inserting to MongoDB collection 'produksi': {produksi_data}")
        result = db.produksi.insert_one(produksi_data)
        produksi_data['_id'] = result.inserted_id
        print(f"✅ [PRODUKSI CREATE] Successfully inserted! ID: {result.inserted_id}, Collection: produksi")
        return jsonify(json_serialize(produksi_data)), 201
    except Exception as e:
        print(f"❌ [PRODUKSI CREATE] ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/produksi/<produksi_id>', methods=['PUT'])
def update_produksi(produksi_id):
    """Update produksi"""
    try:
        data = request.json
        
        # Find existing produksi
        try:
            produksi = db.produksi.find_one({'_id': ObjectId(produksi_id)})
        except:
            produksi = db.produksi.find_one({'id': int(produksi_id)}) or \
                      db.produksi.find_one({'idProduksi': produksi_id})
        
        if not produksi:
            return jsonify({'error': 'Produksi not found'}), 404
        
        # Validate required fields
        # kadarAir hanya wajib untuk tahapan Pengeringan Awal & Akhir
        required_fields = ['idProduksi', 'idBahan', 'beratAwal', 'prosesPengolahan', 
                          'varietas', 'tanggalMasuk', 'tanggalSekarang', 
                          'statusTahapan', 'haccp']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Check if idProduksi already exists (excluding current)
        existing = db.produksi.find_one({
            'idProduksi': data['idProduksi'],
            '_id': {'$ne': produksi['_id']}
        })
        if existing:
            return jsonify({'error': 'ID Produksi already exists'}), 400
        
        # Edit: hanya boleh MENAMBAH id bahan (tidak boleh menghapus); alokasi lama tidak boleh diubah
        old_ids = _id_bahan_list_from_produksi(produksi)
        old_set = set(old_ids)
        old_map = _alokasi_map_from_produksi(produksi)
        new_raw = data.get('idBahanList')
        if isinstance(new_raw, list) and len(new_raw) > 0:
            new_list = [str(x).strip() for x in new_raw if str(x).strip()]
        else:
            new_list = [str(data.get('idBahan') or '').strip()] if data.get('idBahan') else []
        new_set = set(new_list)
        if not old_set <= new_set:
            return jsonify({
                'error': 'Hanya boleh menambah ID Bahan pada produksi ini; tidak boleh menghapus bahan yang sudah tercatat',
            }), 400
        if len(new_list) != len(new_set):
            return jsonify({'error': 'idBahanList tidak boleh mengandung duplikat'}), 400

        added_ids = new_set - old_set
        st_lama = produksi.get('statusTahapan')
        st_baru = data.get('statusTahapan')
        if added_ids and (
            _status_tambah_bahan_dikunci(st_lama) or _status_tambah_bahan_dikunci(st_baru)
        ):
            return jsonify({
                'error': 'Menambah ID Bahan tidak diizinkan setelah tahap Pengeringan Akhir.',
            }), 400

        alokasi_req = data.get('alokasiBeratBahan')
        new_alok_rows = []
        if isinstance(alokasi_req, list):
            for r in alokasi_req:
                if not isinstance(r, dict):
                    continue
                bid = str(r.get('idBahan') or '').strip()
                bw = float(r.get('berat', 0) or 0)
                if bid and bw >= 0:
                    new_alok_rows.append({'idBahan': bid, 'berat': bw})
        new_map = {r['idBahan']: r['berat'] for r in new_alok_rows}
        if set(new_map.keys()) != new_set:
            return jsonify({'error': 'alokasiBeratBahan harus memuat tepat satu entri per id di idBahanList'}), 400

        for bid in old_set:
            o = float(old_map.get(bid, 0) or 0)
            n = float(new_map.get(bid, 0) or 0)
            if abs(o - n) > 1e-3:
                return jsonify({
                    'error': f'Alokasi bahan {bid} tidak boleh diubah; hanya boleh menambah bahan baru',
                }), 400

        proses_pp = str(data['prosesPengolahan'] or '').strip()
        for bid in new_set - old_set:
            need = float(new_map.get(bid, 0) or 0)
            if need <= 0:
                return jsonify({'error': f'Berat alokasi untuk bahan baru {bid} harus lebih dari 0'}), 400
            bahan_one = db.bahan.find_one({'idBahan': bid})
            if not bahan_one:
                return jsonify({'error': f'Bahan tidak ditemukan: {bid}'}), 400
            lines = bahan_one.get('prosesBahan') or []
            if lines:
                line = next((l for l in lines if l.get('prosesPengolahan') == proses_pp), None)
                if not line:
                    return jsonify({'error': f'Proses "{proses_pp}" tidak terdaftar pada bahan {bid}'}), 400
                sisa, err = _sisa_bahan_line(bahan_one, bid, proses_pp)
                if err:
                    return jsonify({'error': f'{bid}: {err}'}), 400
                if need > (sisa or 0) + 1e-3:
                    return jsonify({
                        'error': 'Sisa bahan tidak mencukupi untuk bahan tambahan',
                        'idBahan': bid,
                        'sisaTersedia': sisa,
                        'beratDiminta': need,
                    }), 400
            else:
                sisa, err = _sisa_bahan_line(bahan_one, bid, None)
                if err:
                    return jsonify({'error': f'{bid}: {err}'}), 400
                if need > (sisa or 0) + 1e-3:
                    return jsonify({
                        'error': 'Sisa bahan tidak mencukupi untuk bahan tambahan',
                        'idBahan': bid,
                        'sisaTersedia': sisa,
                        'beratDiminta': need,
                    }), 400

        berat_baru = float(data['beratAwal'])
        sum_alok = sum(float(new_map[b]) for b in new_list)
        if abs(berat_baru - sum_alok) > 1e-3:
            return jsonify({'error': 'beratAwal harus sama dengan jumlah alokasi semua ID bahan'}), 400

        # Proses pengolahan ditetapkan saat bahan masuk — tidak boleh diubah
        if produksi.get('prosesPengolahan') != data['prosesPengolahan']:
            return jsonify({'error': 'Proses pengolahan tidak dapat diubah setelah produksi dibuat'}), 400
        
        # Validasi sequential tahapan berdasarkan konfigurasi master
        status_tahapan_lama = produksi.get('statusTahapan')
        is_valid, error_msg = validate_sequential_tahapan(
            data['prosesPengolahan'],
            data['statusTahapan'],
            status_tahapan_lama
        )
        if not is_valid:
            return jsonify({'error': error_msg}), 400
        
        # Get and validate beratTerkini
        # Saat Pengemasan: berat terkini tidak wajib diisi (gunakan nilai terakhir dari data lama)
        # Untuk tahapan lain: berat terkini wajib diisi
        isPengemasan = 'Pengemasan' in data['statusTahapan']
        beratTerkini = data.get('beratTerkini')
        
        berat_awal_req = float(data.get('beratAwal', 0) or 0)
        alokasi_ulang_setelah_master = bool(
            (
                produksi.get('bahanMasterBerubahLepasOtomatis')
                or produksi.get('bahanMasterAlokasiDisesuaikan')
            )
            and berat_awal_req < 1e-6
        )

        if isPengemasan:
            # Saat Pengemasan: gunakan nilai dari data lama jika tidak ada di request
            if not beratTerkini or beratTerkini <= 0:
                # Ambil dari produksi lama (nilai terakhir sebelum pengemasan)
                beratTerkini = produksi.get('beratTerkini') or produksi.get('beratAwal') or 0
                if beratTerkini <= 0:
                    return jsonify({'error': 'Berat terkini tidak valid. Pastikan produksi sudah memiliki berat terkini sebelum masuk tahap Pengemasan'}), 400
        else:
            # Untuk tahapan lain: wajib diisi — kecuali menunggu alokasi ulang setelah master bahan diubah
            if alokasi_ulang_setelah_master:
                try:
                    beratTerkini = float(beratTerkini) if beratTerkini is not None else 0.0
                except (TypeError, ValueError):
                    beratTerkini = 0.0
                if beratTerkini < 0:
                    return jsonify({'error': 'Berat terkini tidak boleh negatif'}), 400
                if beratTerkini > berat_awal_req + 1e-6:
                    return jsonify({'error': 'Berat terkini tidak boleh lebih besar dari berat awal'}), 400
            else:
                if not beratTerkini or beratTerkini <= 0:
                    return jsonify({'error': 'Berat terkini wajib diisi dan harus lebih dari 0 setiap kali update tahapan'}), 400
                if beratTerkini > data['beratAwal']:
                    return jsonify({'error': 'Berat terkini tidak boleh lebih besar dari berat awal'}), 400
        
        detail_bt_kloter, err_detail_bt = _normalize_berat_terkini_detail_kloter_produksi(data)
        if err_detail_bt:
            return jsonify({'error': err_detail_bt}), 400
        metode_bt = data.get('metodeBeratTerkini') or 'total'
        if metode_bt not in ('total', 'kloter'):
            metode_bt = 'total'
        
        # Saat Pengemasan: berat akhir + berat green beans (wajib) + berat pixel (opsional)
        beratAkhir = None
        beratGreenBeans = None
        beratPixel = None
        if 'Pengemasan' in data['statusTahapan']:
            beratAkhir = data.get('beratAkhir')
            if not beratAkhir or beratAkhir <= 0:
                return jsonify({'error': 'Berat akhir wajib diisi jika status tahapan adalah Pengemasan'}), 400
            if beratAkhir > data['beratAwal']:
                return jsonify({'error': 'Berat akhir tidak boleh lebih besar dari berat awal'}), 400
            if beratAkhir > beratTerkini:
                return jsonify({'error': 'Berat akhir tidak boleh lebih besar dari berat terkini'}), 400
            # Validasi berat green beans (wajib)
            beratGreenBeans = data.get('beratGreenBeans') or produksi.get('beratGreenBeans')
            if not beratGreenBeans or beratGreenBeans <= 0:
                return jsonify({'error': 'Berat Green Beans wajib diisi untuk tahap Pengemasan'}), 400
            if beratGreenBeans > beratAkhir:
                return jsonify({'error': 'Berat Green Beans tidak boleh lebih besar dari berat akhir'}), 400
            # Validasi berat pixel (opsional)
            beratPixel = data.get('beratPixel') or produksi.get('beratPixel') or 0
            if beratPixel < 0:
                return jsonify({'error': 'Berat Produk Pixel tidak boleh bernilai negatif'}), 400
            # Total berat tidak boleh lebih dari berat akhir
            if (beratGreenBeans + beratPixel) > beratAkhir:
                return jsonify({'error': 'Total berat Green Beans + Pixel tidak boleh lebih besar dari berat akhir'}), 400
        
        # Validasi khusus untuk tahapan Pengeringan Awal & Akhir
        kadar_air = data.get('kadarAir')
        if not (alokasi_ulang_setelah_master and berat_awal_req < 1e-6):
            is_valid_pengeringan, error_msg_pengeringan = validate_pengeringan_tahapan(
                data['statusTahapan'],
                kadar_air,
                beratTerkini,
                produksi  # Ada produksi lama untuk validasi Pengeringan Akhir
            )
            if not is_valid_pengeringan:
                return jsonify({'error': error_msg_pengeringan}), 400
        
        # Update history if status changed (always record beratTerkini when updating)
        historyTahapan = produksi.get('historyTahapan', [])
        statusChanged = produksi.get('statusTahapan') != data['statusTahapan']
        beratTerkiniChanged = produksi.get('beratTerkini') != float(beratTerkini)
        kadarAirChanged = produksi.get('kadarAir') != float(kadar_air) if kadar_air else False
        
        # Add to history if status changed or if this is a weight/kadar air update for the same stage
        if statusChanged or beratTerkiniChanged or kadarAirChanged:
            # Tentukan kadar air untuk history
            # Gunakan kadar air baru jika ada, jika tidak gunakan kadar air lama
            kadar_air_history = None
            if 'kadarAir' in data and data['kadarAir'] is not None:
                kadar_air_history = float(data.get('kadarAir', 0))
            else:
                kadar_air_history = produksi.get('kadarAir')
            
            # Save current state to history before update dengan informasi lengkap
            history_entry = {
                'namaTahapan': produksi.get('statusTahapan'),  # Nama tahapan
                'statusTahapanSebelumnya': produksi.get('statusTahapan'),
                'tanggal': produksi.get('tanggalSekarang'),
                'tanggalUpdate': datetime.now().isoformat(),  # Tanggal update
                'waktu': datetime.now().isoformat(),
                'beratAwal': produksi.get('beratAwal'),
                'beratTerkini': produksi.get('beratTerkini'),
                'beratAkhir': produksi.get('beratAkhir'),
                'kadarAir': kadar_air_history,  # Kadar air (bisa diinputkan untuk semua tahapan)
                'catatan': _normalize_catatan_produksi(produksi.get('catatan')),
                'pengguna': 'System',  # TODO: Ambil dari session jika ada
                'userId': None  # TODO: Ambil dari session jika ada
            }
            
            # Jika status berubah, tambahkan informasi status baru
            if statusChanged:
                history_entry['statusTahapanBaru'] = data['statusTahapan']
                history_entry['namaTahapan'] = data['statusTahapan']  # Update nama tahapan
            
            historyTahapan.append(history_entry)
        
        # Tentukan kadar air: bisa diinputkan untuk semua tahapan
        # Wajib untuk Pengeringan Awal & Akhir, optional untuk lainnya
        kadar_air_value = None
        if 'kadarAir' in data and data['kadarAir'] is not None:
            # Jika ada input kadar air, gunakan nilai tersebut
            kadar_air_value = float(data.get('kadarAir', 0))
        elif 'Pengeringan' in data['statusTahapan']:
            # Untuk tahapan Pengeringan, wajib ada kadar air
            kadar_air_value = float(data.get('kadarAir', 0))
        else:
            # Untuk tahapan non-pengeringan, gunakan nilai lama jika ada, atau None
            kadar_air_value = produksi.get('kadarAir')
        
        old_status = (produksi.get('statusTahapan') or '').strip()
        new_status = (data['statusTahapan'] or '').strip()
        cp = produksi.get('catatanPerTahapan')
        if not isinstance(cp, list):
            cp = []
        else:
            cp = list(cp)
        if old_status != new_status:
            cp = _upsert_catatan_per_tahapan(
                cp,
                old_status,
                produksi.get('catatan'),
                produksi.get('tanggalSekarang'),
            )
        catatan_baru = (
            _normalize_catatan_produksi(data.get('catatan'))
            if 'catatan' in data
            else _normalize_catatan_produksi(produksi.get('catatan'))
        )
        cp = _upsert_catatan_per_tahapan(
            cp, new_status, catatan_baru, data.get('tanggalSekarang')
        )

        primary_id_bahan = old_ids[0] if old_ids else (new_list[0] if new_list else data.get('idBahan'))
        update_data = {
            'idProduksi': data['idProduksi'],
            'idBahan': primary_id_bahan,
            'idBahanList': new_list,
            'alokasiBeratBahan': new_alok_rows,
            'beratAwal': float(data['beratAwal']),
            'beratTerkini': float(beratTerkini),
            'beratAkhir': float(beratAkhir) if beratAkhir else None,
            'prosesPengolahan': data['prosesPengolahan'],
            'kadarAir': kadar_air_value,
            'varietas': data['varietas'],
            'tanggalMasuk': data['tanggalMasuk'],
            'tanggalSekarang': data['tanggalSekarang'],
            'statusTahapan': data['statusTahapan'],
            'haccp': data['haccp'],
            'historyTahapan': historyTahapan,
            'catatan': _normalize_catatan_produksi(data.get('catatan'))
            if 'catatan' in data
            else (produksi.get('catatan') or ''),
            'catatanPerTahapan': cp,
        }
        if not isPengemasan:
            update_data['metodeBeratTerkini'] = metode_bt
            update_data['beratTerkiniDetailKloter'] = detail_bt_kloter
        if 'Pengemasan' in data['statusTahapan']:
            update_data['beratGreenBeans'] = float(beratGreenBeans) if beratGreenBeans else 0
            update_data['beratPixel'] = float(beratPixel) if beratPixel else 0
            update_data['tanggalPengemasan'] = data.get('tanggalSekarang') or datetime.now().strftime('%Y-%m-%d')

        mongo_update = {'$set': update_data}
        if new_list and float(data['beratAwal']) > 0:
            mongo_update['$unset'] = {
                'bahanMasterBerubahLepasOtomatis': '',
                'bahanMasterBerubahLepasPada': '',
                'bahanMasterAlokasiDisesuaikan': '',
                'bahanMasterAlokasiDisesuaikanPada': '',
            }

        db.produksi.update_one({'_id': produksi['_id']}, mongo_update)

        updated = db.produksi.find_one({'_id': produksi['_id']})
        return jsonify(json_serialize(updated)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/produksi/<produksi_id>', methods=['DELETE'])
def delete_produksi(produksi_id):
    """Delete produksi"""
    try:
        # Find produksi
        try:
            produksi = db.produksi.find_one({'_id': ObjectId(produksi_id)})
        except:
            produksi = db.produksi.find_one({'id': int(produksi_id)}) or \
                      db.produksi.find_one({'idProduksi': produksi_id})
        
        if not produksi:
            return jsonify({'error': 'Produksi not found'}), 404
        
        # Tidak boleh hapus jika ada pemesanan (ordering) yang sudah diproses untuk produksi ini
        hasil_count = db.hasilProduksi.count_documents({'idProduksi': produksi.get('idProduksi')})
        if hasil_count > 0:
            return jsonify({
                'error': f'Tidak dapat menghapus produksi. Ada {hasil_count} pemesanan yang sudah diproses untuk produksi ini.'
            }), 400
        
        db.produksi.delete_one({'_id': produksi['_id']})
        return jsonify({'message': 'Produksi deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/produksi/pengemasan', methods=['GET'])
def get_produksi_pengemasan():
    """Get produksi that are in Pengemasan status with berat akhir"""
    try:
        produksi = list(db.produksi.find({
            'statusTahapan': {'$regex': 'Pengemasan', '$options': 'i'},
            'beratAkhir': {'$exists': True, '$ne': None, '$gt': 0}
        }).sort('id', 1))
        return jsonify(json_serialize(produksi)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/produksi/<produksi_id>/sisa', methods=['GET'])
def get_produksi_sisa(produksi_id):
    """Sisa pool green beans = (berat akhir − pixel) − pemesanan GB; sisa pixel terpisah."""
    try:
        produksi = db.produksi.find_one({'idProduksi': produksi_id})
        if not produksi:
            try:
                produksi = db.produksi.find_one({'_id': ObjectId(produksi_id)})
            except:
                produksi = db.produksi.find_one({'id': int(produksi_id)})
        
        if not produksi:
            return jsonify({'error': 'Produksi not found'}), 404
        
        berat_akhir = float(produksi.get('beratAkhir') or 0)
        if berat_akhir <= 0:
            return jsonify({
                'idProduksi': produksi.get('idProduksi'),
                'beratAkhir': 0,
                'totalDariOrdering': 0,
                'sisaTersedia': 0,
                'error': 'Produksi belum memiliki berat akhir'
            }), 200
        
        id_p = produksi.get('idProduksi')
        hasil_list = list(db.hasilProduksi.find({'idProduksi': id_p}))
        px = float(produksi.get('beratPixel') or 0)
        pool_gb = max(0.0, berat_akhir - px)
        total_ordering_gb = sum(
            float(h.get('beratSaatIni', 0))
            for h in hasil_list
            if h.get('isFromOrdering') in (True, 'true', 1)
            and (h.get('tipeProduk') or '').strip() == 'Green Beans'
        )
        total_ordering_px = sum(
            float(h.get('beratSaatIni', 0))
            for h in hasil_list
            if h.get('isFromOrdering') in (True, 'true', 1)
            and (h.get('tipeProduk') or '').strip() == 'Pixel'
        )
        sisa_gb = max(0, pool_gb - total_ordering_gb)
        sisa_px = max(0, px - total_ordering_px)
        # sisaTersedia = sisa pool green beans (selaras stok & pemesanan GB)
        sisa_tersedia = sisa_gb
        
        return jsonify({
            'idProduksi': produksi.get('idProduksi'),
            'beratAkhir': berat_akhir,
            'beratPixel': px,
            'poolGreenBeans': pool_gb,
            'totalDariOrderingGreenBeans': total_ordering_gb,
            'totalDariOrderingPixel': total_ordering_px,
            'sisaTersedia': sisa_tersedia,
            'sisaTersediaPixel': sisa_px,
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== HASIL PRODUKSI ENDPOINTS ====================

@app.route('/api/hasil-produksi', methods=['GET'])
def get_hasil_produksi():
    """Get all hasil produksi data"""
    try:
        hasil_produksi = list(db.hasilProduksi.find().sort('id', 1))
        print(f"📊 [HASIL PRODUKSI GET] Retrieved {len(hasil_produksi)} documents from MongoDB collection 'hasilProduksi'")
        return jsonify(json_serialize(hasil_produksi)), 200
    except Exception as e:
        print(f"❌ [HASIL PRODUKSI GET] ERROR: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/hasil-produksi/<hasil_id>', methods=['GET'])
def get_hasil_produksi_by_id(hasil_id):
    """Get hasil produksi by ID"""
    try:
        try:
            hasil = db.hasilProduksi.find_one({'_id': ObjectId(hasil_id)})
        except:
            hasil = db.hasilProduksi.find_one({'id': int(hasil_id)})
        
        if not hasil:
            return jsonify({'error': 'Hasil produksi not found'}), 404
        
        return jsonify(json_serialize(hasil)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# POST/PUT/DELETE hasil produksi dihapus: stok otomatis dari produksi tahap Pengemasan.
# GET tetap ada untuk kebutuhan ordering dan kompatibilitas.

@app.route('/api/hasil-produksi/produksi/<id_produksi>', methods=['GET'])
def get_hasil_produksi_by_produksi(id_produksi):
    """Get all hasil produksi by idProduksi"""
    try:
        hasil_list = list(db.hasilProduksi.find({'idProduksi': id_produksi}).sort('id', 1))
        return jsonify(json_serialize(hasil_list)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Helper function for packaging calculation
def calculate_jumlah_kemasan(berat_saat_ini, kemasan, tipe_produk_lower):
    """Calculate jumlah kemasan based on weight and packaging size"""
    # Apply 20% reduction for Pixel products (roasting shrinkage)
    efektif_berat = berat_saat_ini
    if 'pixel' in tipe_produk_lower:
        efektif_berat = berat_saat_ini * 0.8
    
    if not kemasan or efektif_berat <= 0:
        return 0
    
    # Parse ukuran kemasan to kg
    ukuran_kg = 0
    try:
        kemasan_lower = kemasan.lower().strip()
        if 'kg' in kemasan_lower:
            # Green beans: "5 kg" -> 5, "5kg" -> 5, " 5 kg " -> 5
            # Extract number before "kg"
            import re
            match = re.search(r'([\d.]+)\s*kg', kemasan_lower)
            if match:
                ukuran_kg = float(match.group(1))
            else:
                # Fallback: remove "kg" and parse
                ukuran_kg = float(kemasan_lower.replace('kg', '').strip())
        elif 'gram' in kemasan_lower or 'gr' in kemasan_lower:
            # Kopi sangrai/bubuk: "250 gram" -> 0.25 kg, "250gr" -> 0.25 kg
            import re
            match = re.search(r'([\d.]+)\s*(?:gram|gr)', kemasan_lower)
            if match:
                ukuran_kg = float(match.group(1)) / 1000
            else:
                # Fallback: remove "gram"/"gr" and parse
                ukuran_kg = float(kemasan_lower.replace('gram', '').replace('gr', '').strip()) / 1000
    except (ValueError, AttributeError) as e:
        print(f"⚠️ [CALCULATE KEMASAN] Error parsing kemasan '{kemasan}': {str(e)}")
        return 0
    
    if ukuran_kg > 0:
        # Use floor division untuk konsistensi dengan frontend
        return int(efektif_berat / ukuran_kg)
    return 0

# ==================== BAHAN ENDPOINTS ====================

@app.route('/api/bahan', methods=['GET'])
def get_bahan():
    """Get all bahan data"""
    try:
        bahan = list(db.bahan.find().sort('id', 1))
        print(f"📊 [BAHAN GET] Retrieved {len(bahan)} documents from MongoDB collection 'bahan'")
        return jsonify(json_serialize(bahan)), 200
    except Exception as e:
        print(f"❌ [BAHAN GET] ERROR: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/bahan/next-id', methods=['GET'])
def get_next_id_bahan():
    """Get next auto-generated idBahan (format BHN001, BHN002, ...)"""
    try:
        id_bahan = generate_id_bahan()
        return jsonify({'idBahan': id_bahan}), 200
    except Exception as e:
        print(f"❌ [BAHAN NEXT-ID] ERROR: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/bahan/<bahan_id>', methods=['GET'])
def get_bahan_by_id(bahan_id):
    """Get bahan by ID or idBahan"""
    try:
        try:
            bahan = db.bahan.find_one({'_id': ObjectId(bahan_id)})
        except:
            bahan = db.bahan.find_one({'idBahan': bahan_id}) or \
                   db.bahan.find_one({'id': int(bahan_id)})
        
        if not bahan:
            return jsonify({'error': 'Bahan not found'}), 404
        
        return jsonify(json_serialize(bahan)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bahan', methods=['POST'])
def create_bahan():
    """Create new bahan.
    Format utama: prosesBahan[] (per proses: prosesPengolahan + detailKloter[]), hargaPerKg sekali, idBahan auto.
    Legacy single-row (idBahan + jumlah manual) tetap didukung tanpa field kualitas.
    """
    try:
        data = request.json
        
        proses_bahan_raw = data.get('prosesBahan')
        if proses_bahan_raw and isinstance(proses_bahan_raw, list) and len(proses_bahan_raw) > 0:
            harga_per_kg = float(data.get('hargaPerKg', 0) or 0)
            if harga_per_kg <= 0:
                return jsonify({'error': 'Harga per Kg wajib diisi dan harus lebih dari 0'}), 400
            
            proses_bahan_clean, total_berat, err = _normalize_proses_bahan_payload(proses_bahan_raw)
            if err:
                return jsonify({'error': err}), 400
            
            for field in ['pemasok', 'varietas', 'jenisKopi', 'tanggalMasuk']:
                if field not in data:
                    return jsonify({'error': f'Missing required field: {field}'}), 400
            
            total_pengeluaran = harga_per_kg * total_berat
            new_id = get_next_id('bahan')
            id_bahan = f"BHN{str(new_id).zfill(3)}"
            
            bahan_data = {
                'id': new_id,
                'idBahan': id_bahan,
                'pemasok': data['pemasok'],
                'jumlah': total_berat,
                'varietas': data['varietas'],
                'hargaPerKg': round(harga_per_kg, 2),
                'totalPengeluaran': round(total_pengeluaran, 2),
                'jenisKopi': data['jenisKopi'],
                'tanggalMasuk': data['tanggalMasuk'],
                'prosesBahan': proses_bahan_clean
            }
        else:
            # Legacy mode: single values (tanpa kualitas)
            required_fields = ['idBahan', 'pemasok', 'jumlah', 'varietas',
                              'hargaPerKg', 'totalPengeluaran', 'jenisKopi',
                              'tanggalMasuk']
            for field in required_fields:
                if field not in data:
                    return jsonify({'error': f'Missing required field: {field}'}), 400
            
            existing = db.bahan.find_one({'idBahan': data['idBahan']})
            if existing:
                return jsonify({'error': 'ID Bahan already exists'}), 400
            
            new_id = get_next_id('bahan')
            
            bahan_data = {
                'id': new_id,
                'idBahan': data['idBahan'],
                'pemasok': data['pemasok'],
                'jumlah': float(data['jumlah']),
                'varietas': data['varietas'],
                'hargaPerKg': float(data['hargaPerKg']),
                'totalPengeluaran': float(data['totalPengeluaran']),
                'jenisKopi': data['jenisKopi'],
                'tanggalMasuk': data['tanggalMasuk'],
            }
        
        # Check idBahan unique
        existing = db.bahan.find_one({'idBahan': bahan_data['idBahan']})
        if existing:
            return jsonify({'error': 'ID Bahan already exists'}), 400
        
        # HACCP if provided
        if 'haccp' in data:
            bahan_data['haccp'] = data['haccp']

        bahan_data['lunas'] = parse_bool_payload(data.get('lunas'), False)
        
        print(f"🔵 [BAHAN CREATE] Inserting to MongoDB collection 'bahan': {bahan_data}")
        result = db.bahan.insert_one(bahan_data)
        bahan_data['_id'] = result.inserted_id
        print(f"✅ [BAHAN CREATE] Successfully inserted! ID: {result.inserted_id}, Collection: bahan")
        return jsonify(json_serialize(bahan_data)), 201
    except Exception as e:
        print(f"❌ [BAHAN CREATE] ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/bahan/<bahan_id>', methods=['PUT'])
def update_bahan(bahan_id):
    """Update bahan"""
    try:
        data = request.json
        
        try:
            bahan = db.bahan.find_one({'_id': ObjectId(bahan_id)})
        except:
            bahan = db.bahan.find_one({'id': int(bahan_id)}) or \
                   db.bahan.find_one({'idBahan': bahan_id})
        
        if not bahan:
            return jsonify({'error': 'Bahan not found'}), 404
        
        # Check if idBahan already exists (excluding current)
        if 'idBahan' in data:
            existing = db.bahan.find_one({
                'idBahan': data['idBahan'],
                '_id': {'$ne': bahan['_id']}
            })
            if existing:
                return jsonify({'error': 'ID Bahan already exists'}), 400
        
        update_data = {}
        extra_unset = {}
        for field in ['idBahan', 'pemasok', 'varietas', 'jenisKopi', 'tanggalMasuk']:
            if field in data:
                update_data[field] = data[field]
        
        if 'prosesBahan' in data and isinstance(data.get('prosesBahan'), list):
            harga_per_kg = float(data.get('hargaPerKg', 0) or 0)
            if harga_per_kg <= 0:
                return jsonify({'error': 'Harga per Kg wajib diisi dan harus lebih dari 0'}), 400
            proses_bahan_clean, total_berat, err = _normalize_proses_bahan_payload(data['prosesBahan'])
            if err:
                return jsonify({'error': err}), 400
            update_data['prosesBahan'] = proses_bahan_clean
            update_data['jumlah'] = total_berat
            update_data['hargaPerKg'] = round(harga_per_kg, 2)
            update_data['totalPengeluaran'] = round(harga_per_kg * total_berat, 2)
            extra_unset['detailKloter'] = ''
            extra_unset['kualitas'] = ''
        else:
            # Legacy: detailKloter flat (bahan tanpa prosesBahan)
            detail_kloter = data.get('detailKloter') or data.get('kloter')
            if detail_kloter and isinstance(detail_kloter, list):
                harga_per_kg = float(data.get('hargaPerKg', 0) or 0)
                if harga_per_kg <= 0:
                    return jsonify({'error': 'Harga per Kg wajib diisi dan harus lebih dari 0'}), 400
                
                total_berat = 0
                detail_kloter_clean = []
                for i, k in enumerate(detail_kloter):
                    berat = float(k.get('berat', 0) or 0)
                    if berat > 0:
                        total_berat += berat
                        detail_kloter_clean.append({
                            'kloter': len(detail_kloter_clean) + 1,
                            'berat': berat,
                            'keterangan': k.get('keterangan', '') or ''
                        })
                if total_berat > 0:
                    update_data['jumlah'] = total_berat
                    update_data['hargaPerKg'] = round(harga_per_kg, 2)
                    update_data['totalPengeluaran'] = round(harga_per_kg * total_berat, 2)
                    update_data['detailKloter'] = detail_kloter_clean
            else:
                for field in ['jumlah', 'hargaPerKg', 'totalPengeluaran']:
                    if field in data:
                        update_data[field] = float(data[field])
        
        if 'haccp' in data:
            update_data['haccp'] = data['haccp']

        if 'lunas' in data:
            update_data['lunas'] = parse_bool_payload(data.get('lunas'), False)
        
        update_op = {'$set': update_data}
        if extra_unset:
            update_op['$unset'] = extra_unset

        id_bahan_untuk_cascade = str(bahan.get('idBahan') or '').strip()

        db.bahan.update_one({'_id': bahan['_id']}, update_op)

        if 'prosesBahan' in update_data:
            eff_id_bahan = str(
                (update_data.get('idBahan') if update_data.get('idBahan') is not None else None)
                or bahan.get('idBahan')
                or ''
            ).strip()
            _sync_produksi_proses_pengolahan_after_bahan_update(
                eff_id_bahan,
                bahan.get('prosesBahan'),
                update_data['prosesBahan']
            )

        # Ubahan stok/master: sesuaikan alokasi produksi (ID sama) atau lepaskan ID lama (rename)
        cascade_stok = False
        if 'prosesBahan' in update_data:
            cascade_stok = not _proses_bahan_stok_equivalent(
                bahan.get('prosesBahan'),
                update_data['prosesBahan'],
            )
        elif 'idBahan' in update_data:
            cascade_stok = str(update_data.get('idBahan', '')).strip() != str(
                bahan.get('idBahan', '')
            ).strip()
        else:
            if 'jumlah' in update_data:
                try:
                    old_j = float(bahan.get('jumlah', 0) or 0)
                    new_j = float(update_data['jumlah'])
                    cascade_stok = abs(old_j - new_j) > 1e-4
                except (TypeError, ValueError):
                    cascade_stok = True
            elif 'detailKloter' in update_data:
                cascade_stok = True

        updated = db.bahan.find_one({'_id': bahan['_id']})
        id_bahan_setelah_update = str(updated.get('idBahan') or '').strip()

        if cascade_stok and id_bahan_untuk_cascade:
            if id_bahan_untuk_cascade == id_bahan_setelah_update:
                _adjust_produksi_allocations_after_bahan_master_change(
                    id_bahan_setelah_update
                )
            else:
                _cascade_remove_id_bahan_dari_produksi_setelah_master_bahan_diubah(
                    id_bahan_untuk_cascade
                )
            updated = db.bahan.find_one({'_id': bahan['_id']})

        return jsonify(json_serialize(updated)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/bahan/<bahan_id>/sync-produksi-proses', methods=['POST'])
def post_sync_produksi_proses_from_bahan_master(bahan_id):
    """
    Menyelaraskan ulang prosesPengolahan pada produksi dari dokumen bahan terkini.
    Berguna jika data produksi sempat tidak ikut ter-update. Untuk bahan dengan satu
    baris proses, semua produksi dengan idBahan tersebut diset ke nama proses itu.
    """
    try:
        try:
            bahan = db.bahan.find_one({'_id': ObjectId(bahan_id)})
        except Exception:
            bahan = db.bahan.find_one({'id': int(bahan_id)}) if str(bahan_id).isdigit() else None
        if not bahan:
            bahan = db.bahan.find_one({'idBahan': bahan_id})
        if not bahan:
            return jsonify({'error': 'Bahan not found'}), 404
        lines = bahan.get('prosesBahan') or []
        if not lines:
            return jsonify({'error': 'Bahan tidak memiliki prosesBahan'}), 400
        eff_id = str(bahan.get('idBahan') or '').strip()
        _sync_produksi_proses_pengolahan_after_bahan_update(eff_id, lines, lines)
        return jsonify({'ok': True, 'idBahan': eff_id}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/bahan/<bahan_id>', methods=['DELETE'])
def delete_bahan(bahan_id):
    """Delete bahan"""
    try:
        try:
            bahan = db.bahan.find_one({'_id': ObjectId(bahan_id)})
        except:
            bahan = db.bahan.find_one({'id': int(bahan_id)}) or \
                   db.bahan.find_one({'idBahan': bahan_id})
        
        if not bahan:
            return jsonify({'error': 'Bahan not found'}), 404
        
        # Check if there are produksi using this bahan (tunggal atau dalam idBahanList)
        bid = bahan.get('idBahan')
        produksi_count = db.produksi.count_documents({
            '$or': [{'idBahan': bid}, {'idBahanList': bid}]
        })
        if produksi_count > 0:
            return jsonify({
                'error': f'Cannot delete bahan. There are {produksi_count} produksi using this bahan'
            }), 400
        
        db.bahan.delete_one({'_id': bahan['_id']})
        return jsonify({'message': 'Bahan deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bahan/sisa/<id_bahan>', methods=['GET'])
def get_sisa_bahan(id_bahan):
    """Sisa berat: per jalur proses (?proses=Nama) jika bahan punya prosesBahan; legacy = satu pool."""
    try:
        bahan = db.bahan.find_one({'idBahan': id_bahan})
        if not bahan:
            return jsonify({'error': 'Bahan not found'}), 404
        
        proses_q = request.args.get('proses')
        lines = bahan.get('prosesBahan') or []
        if lines:
            if not proses_q:
                return jsonify({'error': 'Parameter query proses wajib untuk bahan dengan pemisahan proses'}), 400
            line = next((l for l in lines if l.get('prosesPengolahan') == proses_q), None)
            if not line:
                return jsonify({'error': f'Proses "{proses_q}" tidak ada pada bahan ini'}), 404
            cap = float(line.get('jumlahBeratProses', 0) or 0)
            produksi_list = list(db.produksi.find({'prosesPengolahan': proses_q}))
            total_digunakan = sum(
                _alokasi_map_from_produksi(p).get(id_bahan, 0) or 0
                for p in produksi_list
            )
            sisa = max(0.0, cap - total_digunakan)
            return jsonify({
                'idBahan': id_bahan,
                'prosesPengolahan': proses_q,
                'totalBahan': cap,
                'totalDigunakan': total_digunakan,
                'sisaTersedia': sisa
            }), 200
        
        total_digunakan = _total_digunakan_bahan_proses(id_bahan, None)
        cap = float(bahan.get('jumlah', 0) or 0)
        sisa = max(0.0, cap - total_digunakan)
        return jsonify({
            'idBahan': id_bahan,
            'totalBahan': cap,
            'totalDigunakan': total_digunakan,
            'sisaTersedia': sisa
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/bahan/untuk-produksi', methods=['GET'])
def get_bahan_untuk_produksi():
    """
    Bahan yang boleh dipilih untuk produksi baru: punya baris proses yang diminta,
    sisa > 0 untuk jalur tersebut. Bahan legacy (tanpa prosesBahan): id belum dipakai
    produksi lain (kecuali idProduksi= mengabaikan dokumen itu). Bahan dengan prosesBahan:
    id yang sama boleh dipakai beberapa id produksi — pembatasan lewat sisa per jalur proses.
    """
    try:
        proses = request.args.get('proses', '').strip()
        exclude_id_produksi = request.args.get('idProduksi', '').strip() or None
        if not proses:
            return jsonify({'error': 'Parameter query proses wajib'}), 400
        
        terpakai = _all_id_bahan_terpakai_produksi(exclude_id_produksi)
        out = []
        for bahan in db.bahan.find().sort('id', 1):
            bid = bahan.get('idBahan')
            if not bid:
                continue
            lines = bahan.get('prosesBahan') or []
            if not lines and bid in terpakai:
                continue
            line = next((l for l in lines if l.get('prosesPengolahan') == proses), None) if lines else None
            if not line:
                continue
            cap = float(line.get('jumlahBeratProses', 0) or 0)
            td = _total_digunakan_bahan_proses(bid, proses)
            sisa = max(0.0, cap - td)
            if sisa <= 0:
                continue
            out.append({
                'idBahan': bid,
                'prosesPengolahan': proses,
                'sisaTersedia': sisa,
                'alokasi': cap,
                'varietas': bahan.get('varietas'),
                'tanggalMasuk': bahan.get('tanggalMasuk'),
            })
        return jsonify(json_serialize(out)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== PEMASOK ENDPOINTS ====================

@app.route('/api/pemasok', methods=['GET'])
def get_pemasok():
    """Get all pemasok data"""
    try:
        pemasok = list(db.pemasok.find().sort('id', 1))
        print(f"📊 [PEMASOK GET] Retrieved {len(pemasok)} documents from MongoDB collection 'pemasok'")
        return jsonify(json_serialize(pemasok)), 200
    except Exception as e:
        print(f"❌ [PEMASOK GET] ERROR: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/pemasok/<pemasok_id>', methods=['GET'])
def get_pemasok_by_id(pemasok_id):
    """Get pemasok by ID or idPemasok"""
    try:
        try:
            pemasok = db.pemasok.find_one({'_id': ObjectId(pemasok_id)})
        except:
            pemasok = db.pemasok.find_one({'idPemasok': pemasok_id}) or \
                     db.pemasok.find_one({'id': int(pemasok_id)})
        
        if not pemasok:
            return jsonify({'error': 'Pemasok not found'}), 404
        
        return jsonify(json_serialize(pemasok)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/pemasok', methods=['POST'])
def create_pemasok():
    """Create new pemasok"""
    try:
        data = request.json
        
        required_fields = ['idPemasok', 'nama', 'alamat', 'kontak', 'namaPerkebunan', 'status']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        existing = db.pemasok.find_one({'idPemasok': data['idPemasok']})
        if existing:
            return jsonify({'error': 'ID Pemasok already exists'}), 400
        
        new_id = get_next_id('pemasok')
        
        pemasok_data = {
            'id': new_id,
            'idPemasok': data['idPemasok'],
            'nama': data['nama'],
            'alamat': data['alamat'],
            'kontak': data['kontak'],
            'namaPerkebunan': data['namaPerkebunan'],
            'status': data['status']
        }
        
        print(f"🔵 [PEMASOK CREATE] Inserting to MongoDB collection 'pemasok': {pemasok_data}")
        result = db.pemasok.insert_one(pemasok_data)
        pemasok_data['_id'] = result.inserted_id
        print(f"✅ [PEMASOK CREATE] Successfully inserted! ID: {result.inserted_id}, Collection: pemasok")
        return jsonify(json_serialize(pemasok_data)), 201
    except Exception as e:
        print(f"❌ [PEMASOK CREATE] ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/pemasok/<pemasok_id>', methods=['PUT'])
def update_pemasok(pemasok_id):
    """Update pemasok"""
    try:
        data = request.json
        
        try:
            pemasok = db.pemasok.find_one({'_id': ObjectId(pemasok_id)})
        except:
            pemasok = db.pemasok.find_one({'id': int(pemasok_id)}) or \
                     db.pemasok.find_one({'idPemasok': pemasok_id})
        
        if not pemasok:
            return jsonify({'error': 'Pemasok not found'}), 404
        
        if 'idPemasok' in data:
            existing = db.pemasok.find_one({
                'idPemasok': data['idPemasok'],
                '_id': {'$ne': pemasok['_id']}
            })
            if existing:
                return jsonify({'error': 'ID Pemasok already exists'}), 400
        
        update_data = {}
        for field in ['idPemasok', 'nama', 'alamat', 'kontak', 'namaPerkebunan', 'status']:
            if field in data:
                update_data[field] = data[field]
        
        db.pemasok.update_one(
            {'_id': pemasok['_id']},
            {'$set': update_data}
        )
        
        updated = db.pemasok.find_one({'_id': pemasok['_id']})
        return jsonify(json_serialize(updated)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/pemasok/<pemasok_id>', methods=['DELETE'])
def delete_pemasok(pemasok_id):
    """Delete pemasok"""
    try:
        try:
            pemasok = db.pemasok.find_one({'_id': ObjectId(pemasok_id)})
        except:
            pemasok = db.pemasok.find_one({'id': int(pemasok_id)}) or \
                     db.pemasok.find_one({'idPemasok': pemasok_id})
        
        if not pemasok:
            return jsonify({'error': 'Pemasok not found'}), 404
        
        # Check if there are bahan using this pemasok
        bahan_count = db.bahan.count_documents({'pemasok': pemasok.get('nama')})
        if bahan_count > 0:
            return jsonify({
                'error': f'Cannot delete pemasok. There are {bahan_count} bahan using this pemasok'
            }), 400
        
        db.pemasok.delete_one({'_id': pemasok['_id']})
        return jsonify({'message': 'Pemasok deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ==================== PEMBELI (MASTER DATA PEMBELI) ====================

@app.route('/api/pembeli', methods=['GET'])
def get_pembeli():
    """Daftar master pembeli."""
    try:
        rows = list(db.pembeli.find().sort('id', 1))
        print(f"📊 [PEMBELI GET] {len(rows)} dokumen")
        return jsonify(json_serialize(rows)), 200
    except Exception as e:
        print(f"❌ [PEMBELI GET] {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/pembeli/<pembeli_id>', methods=['GET'])
def get_pembeli_by_id(pembeli_id):
    try:
        try:
            doc = db.pembeli.find_one({'_id': ObjectId(pembeli_id)})
        except Exception:
            doc = None
        if not doc:
            doc = db.pembeli.find_one({'idPembeli': pembeli_id}) or \
                  db.pembeli.find_one({'id': int(pembeli_id)})
        if not doc:
            return jsonify({'error': 'Pembeli not found'}), 404
        return jsonify(json_serialize(doc)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/pembeli', methods=['POST'])
def create_pembeli():
    try:
        data = request.json or {}
        required = ['nama', 'kontak', 'alamat', 'tipePembeli']
        for f in required:
            if not str(data.get(f, '')).strip():
                return jsonify({'error': f'Missing or empty field: {f}'}), 400
        tipe = (data.get('tipePembeli') or '').strip()
        if tipe not in ('Lokal', 'International', 'ecommerce'):
            return jsonify({'error': 'tipePembeli harus Lokal, International, atau ecommerce'}), 400

        numeric_id = get_next_id('pembeli')
        id_pembeli = (data.get('idPembeli') or '').strip()
        if id_pembeli:
            if db.pembeli.find_one({'idPembeli': id_pembeli}):
                return jsonify({'error': 'ID Pembeli sudah dipakai'}), 400
        else:
            id_pembeli = f"PBL{str(numeric_id).zfill(3)}"

        row = {
            'id': numeric_id,
            'idPembeli': id_pembeli,
            'nama': str(data['nama']).strip(),
            'kontak': str(data['kontak']).strip(),
            'alamat': str(data['alamat']).strip(),
            'tipePembeli': tipe,
            'createdAt': datetime.now(),
            'updatedAt': datetime.now(),
        }
        ins = db.pembeli.insert_one(row)
        row['_id'] = ins.inserted_id
        print(f"✅ [PEMBELI CREATE] {row['idPembeli']}")
        return jsonify(json_serialize(row)), 201
    except Exception as e:
        print(f"❌ [PEMBELI CREATE] {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/pembeli/<pembeli_id>', methods=['PUT'])
def update_pembeli(pembeli_id):
    try:
        data = request.json or {}
        try:
            doc = db.pembeli.find_one({'_id': ObjectId(pembeli_id)})
        except Exception:
            doc = None
        if not doc:
            doc = db.pembeli.find_one({'idPembeli': pembeli_id}) or \
                  db.pembeli.find_one({'id': int(pembeli_id)})
        if not doc:
            return jsonify({'error': 'Pembeli not found'}), 404

        if 'idPembeli' in data and data['idPembeli']:
            other = db.pembeli.find_one({
                'idPembeli': data['idPembeli'],
                '_id': {'$ne': doc['_id']},
            })
            if other:
                return jsonify({'error': 'ID Pembeli sudah dipakai'}), 400

        update_data = {}
        for field in ['idPembeli', 'nama', 'kontak', 'alamat', 'tipePembeli']:
            if field in data:
                update_data[field] = data[field]
        if 'tipePembeli' in update_data:
            if update_data['tipePembeli'] not in ('Lokal', 'International', 'ecommerce'):
                return jsonify({'error': 'tipePembeli tidak valid'}), 400
        update_data['updatedAt'] = datetime.now()
        db.pembeli.update_one({'_id': doc['_id']}, {'$set': update_data})
        updated = db.pembeli.find_one({'_id': doc['_id']})
        return jsonify(json_serialize(updated)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/pembeli/<pembeli_id>', methods=['DELETE'])
def delete_pembeli(pembeli_id):
    try:
        try:
            doc = db.pembeli.find_one({'_id': ObjectId(pembeli_id)})
        except Exception:
            doc = None
        if not doc:
            doc = db.pembeli.find_one({'idPembeli': pembeli_id}) or \
                  db.pembeli.find_one({'id': int(pembeli_id)})
        if not doc:
            return jsonify({'error': 'Pembeli not found'}), 404
        id_master = doc.get('idPembeli')
        n = db.pemesanan.count_documents({'idMasterPembeli': id_master})
        if n > 0:
            return jsonify({
                'error': f'Tidak dapat menghapus: ada {n} pemesanan terkait pembeli ini',
            }), 400
        db.pembeli.delete_one({'_id': doc['_id']})
        return jsonify({'success': True, 'message': 'Pembeli dihapus'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ==================== STOK ENDPOINTS ====================

def _stok_key(tipe, jenis_kopi, proses):
    """Key agregasi stok: hanya tipe produk, jenis kopi, proses (tanpa kemasan)."""
    def s(v):
        if v is None:
            return ''
        return str(v).strip()
    return f"{s(tipe)}|{s(jenis_kopi)}|{s(proses)}"


def _produksi_masuk_stok_hasil_pengemasan(p):
    """
    Stok hasil hanya dari batch yang menyelesaikan alur pengemasan dengan benar:
    status memuat Pengemasan, berat akhir > 0, dan tanggal pengemasan tercatat
    (field di-set saat create/update saat status pengemasan).
    """
    st = (p.get('statusTahapan') or '')
    if not st or 'pengemasan' not in st.lower():
        return False
    if float(p.get('beratAkhir', 0) or 0) <= 0:
        return False
    if not str(p.get('tanggalPengemasan') or '').strip():
        return False
    return True


def _stok_gb_pixel_tidak_lebih_dari_berat_akhir(p, tol=0.02):
    """GB + Pixel tidak boleh melebihi berat akhir (data tidak konsisten → tidak dihitung stok)."""
    ba = float(p.get('beratAkhir', 0) or 0)
    if ba <= 0:
        return False
    gb = float(p.get('beratGreenBeans', 0) or 0)
    px = float(p.get('beratPixel', 0) or 0)
    return gb + px <= ba + tol


def _proses_pengolahan_tampilan_untuk_agregasi(produksi_doc, bahan_doc):
    """
    Selaras dengan getProsesPengolahanTampilan di kelola_produksi.js / laporan:
    jika master bahan hanya punya satu baris prosesBahan, pakai nama itu untuk agregasi.
    Sehingga stok mengikuti yang tampil di UI meskipun field produksi.prosesPengolahan belum diperbarui.
    """
    if not produksi_doc:
        return ''
    lines = (bahan_doc or {}).get('prosesBahan')
    if isinstance(lines, list) and len(lines) == 1:
        only = (lines[0].get('prosesPengolahan') or '').strip()
        if only:
            return only
    return (produksi_doc.get('prosesPengolahan') or '').strip()


def _bahan_cache_get_for_produksi(produksi_doc, bahan_cache):
    """Ambil dokumen bahan (pertama) untuk produksi; isi bahan_cache."""
    ids_p = _id_bahan_list_from_produksi(produksi_doc)
    id_bahan = ids_p[0] if ids_p else produksi_doc.get('idBahan')
    if not id_bahan:
        return {}
    if id_bahan not in bahan_cache:
        bahan_cache[id_bahan] = db.bahan.find_one({'idBahan': id_bahan}) or {}
    return bahan_cache[id_bahan]


def _stok_berat_green_effective_dari_produksi(p):
    """
    Stok green beans = berat akhir − berat pixel (sisanya setelah bagian pixel).
    Selaras Σ berat akhir saat pixel=0; field beratGreenBeans di form hanya referensi/validasi.
    """
    ba = float(p.get('beratAkhir', 0) or 0)
    px = float(p.get('beratPixel', 0) or 0)
    return max(0.0, ba - px)


def _is_hasil_from_ordering_flag(h):
    v = h.get('isFromOrdering')
    return v in (True, 'true', 1, 'True')


def _compute_stok_hasil_aggregate(tipe_filter='', tanggal_filter=''):
    """
    Logika sama dengan GET /api/stok: agregasi per tipeProduk + jenisKopi + prosesPengolahan,
    setelah dikurangi hasil ordering. Mengembalikan (stok_array, ringkasan).
    """
    produksi_list = list(db.produksi.find({
        'statusTahapan': {'$regex': 'Pengemasan', '$options': 'i'},
    }))
    produksi_list = [
        p for p in produksi_list
        if _produksi_masuk_stok_hasil_pengemasan(p)
        and _stok_gb_pixel_tidak_lebih_dari_berat_akhir(p)
    ]

    if tanggal_filter:
        produksi_list = [p for p in produksi_list if (p.get('tanggalPengemasan') or '')[:10] == tanggal_filter[:10]]

    stok_map = {}
    bahan_cache = {}

    for p in produksi_list:
        bahan = _bahan_cache_get_for_produksi(p, bahan_cache)
        jenis_kopi = (bahan.get('jenisKopi') or '').strip()
        proses_pengolahan = _proses_pengolahan_tampilan_untuk_agregasi(p, bahan)

        stok_gb_batch = _stok_berat_green_effective_dari_produksi(p)
        if stok_gb_batch > 0:
            if not tipe_filter or tipe_filter == 'Green Beans':
                key_gb = _stok_key('Green Beans', jenis_kopi, proses_pengolahan)
                if key_gb not in stok_map:
                    stok_map[key_gb] = {
                        'tipeProduk': 'Green Beans',
                        'jenisKopi': jenis_kopi,
                        'prosesPengolahan': proses_pengolahan,
                        'totalBerat': 0,
                    }
                stok_map[key_gb]['totalBerat'] += stok_gb_batch

        berat_pixel = float(p.get('beratPixel', 0) or 0)
        if berat_pixel > 0:
            if not tipe_filter or tipe_filter == 'Pixel':
                key_px = _stok_key('Pixel', jenis_kopi, proses_pengolahan)
                if key_px not in stok_map:
                    stok_map[key_px] = {
                        'tipeProduk': 'Pixel',
                        'jenisKopi': jenis_kopi,
                        'prosesPengolahan': proses_pengolahan,
                        'totalBerat': 0,
                    }
                stok_map[key_px]['totalBerat'] += berat_pixel

    hasil_ordering = list(db.hasilProduksi.find({'isFromOrdering': True}))
    id_untuk_resolve = set()
    for p in produksi_list:
        ip = str(p.get('idProduksi') or '').strip()
        if ip:
            id_untuk_resolve.add(ip)
    for h in hasil_ordering:
        ip = str(h.get('idProduksi') or '').strip()
        if ip:
            id_untuk_resolve.add(ip)
    produksi_by_id = {}
    if id_untuk_resolve:
        for doc in db.produksi.find({'idProduksi': {'$in': list(id_untuk_resolve)}}):
            produksi_by_id[str(doc.get('idProduksi') or '').strip()] = doc

    for h in hasil_ordering:
        idp = str(h.get('idProduksi') or '').strip()
        pdoc = produksi_by_id.get(idp)
        tipe_p = (h.get('tipeProduk') or '').strip()
        berat_kurangi = float(h.get('beratSaatIni', 0) or 0)
        if pdoc:
            bh = _bahan_cache_get_for_produksi(pdoc, bahan_cache)
            jk = (bh.get('jenisKopi') or '').strip() or (h.get('jenisKopi') or '').strip()
            proses_eff = _proses_pengolahan_tampilan_untuk_agregasi(pdoc, bh)
        else:
            jk = (h.get('jenisKopi') or '').strip()
            proses_eff = (h.get('prosesPengolahan') or '').strip()
        key = _stok_key(tipe_p, jk, proses_eff)
        if key in stok_map:
            stok_map[key]['totalBerat'] = max(0, stok_map[key]['totalBerat'] - berat_kurangi)
        else:
            print(f"⚠️ [STOK AGREGAT] Key ordering tidak ada di stok_map (pengurangan {berat_kurangi} kg dilewati): {key}")

    stok_array = [v for v in stok_map.values() if v['totalBerat'] > 0]
    stok_array.sort(key=lambda x: (x['tipeProduk'], x['jenisKopi']))

    s_ba = sum(float(p.get('beratAkhir') or 0) for p in produksi_list)
    s_px = sum(float(p.get('beratPixel') or 0) for p in produksi_list)
    s_stok_gb_bruto = sum(_stok_berat_green_effective_dari_produksi(p) for p in produksi_list)
    s_gb_form = sum(float(p.get('beratGreenBeans') or 0) for p in produksi_list)
    tot_gb_stok = sum(
        float(v.get('totalBerat') or 0)
        for v in stok_array
        if (v.get('tipeProduk') or '').strip() == 'Green Beans'
    )
    tot_px_stok = sum(
        float(v.get('totalBerat') or 0)
        for v in stok_array
        if (v.get('tipeProduk') or '').strip() == 'Pixel'
    )
    ringkasan = {
        'jumlahBatchPengemasan': len(produksi_list),
        'sumBeratAkhir': round(s_ba, 4),
        'sumBeratPixelBruto': round(s_px, 4),
        'sumStokGreenBeansBruto': round(s_stok_gb_bruto, 4),
        'sumBeratGreenBeansDiForm': round(s_gb_form, 4),
        'totalStokGreenBeansSetelahOrdering': round(tot_gb_stok, 4),
        'totalStokPixelSetelahOrdering': round(tot_px_stok, 4),
    }
    return stok_array, ringkasan


def _batch_stok_pool_tipe(produksi_doc, tipe_produk_selected):
    if tipe_produk_selected == 'Green Beans':
        return _stok_berat_green_effective_dari_produksi(produksi_doc)
    return float(produksi_doc.get('beratPixel', 0) or 0)


def _batch_stok_tersedia_setelah_ordering(produksi_doc, tipe_produk_selected):
    """Sisa stok per batch untuk tipe produk (GB pool atau Pixel), setelah hasil ordering."""
    idp = produksi_doc.get('idProduksi')
    pool = _batch_stok_pool_tipe(produksi_doc, tipe_produk_selected)
    if pool <= 0:
        return 0.0
    hasil_list = list(db.hasilProduksi.find({'idProduksi': idp, 'tipeProduk': tipe_produk_selected}))
    total_ord = sum(
        float(h.get('beratSaatIni', 0) or 0)
        for h in hasil_list
        if _is_hasil_from_ordering_flag(h)
    )
    return max(0.0, pool - total_ord)


def _fifo_allocate_ordering_batches(pemesanan, tipe_produk_selected, jumlah_pesanan,
                                    jenis_kopi_override=None, proses_pengolahan_override=None):
    """
    Memenuhi jumlah pesanan dari batch pengemasan yang cocok (jenis kopi + proses),
    prioritas tanggal pengemasan lebih awal (FIFO).
    Mengembalikan daftar (produksi_doc, kg_diambil).
    Override jenis_kopi / proses untuk satu baris pemesanan multi-item.
    """
    ps_pem = (proses_pengolahan_override if proses_pengolahan_override is not None
              else (pemesanan.get('prosesPengolahan') or '')).strip()
    jk_pem = (jenis_kopi_override if jenis_kopi_override is not None
              else (pemesanan.get('jenisKopi') or '')).strip()
    need = float(jumlah_pesanan)
    if need <= 0:
        return []

    produksi_list = list(db.produksi.find({
        'statusTahapan': {'$regex': 'Pengemasan', '$options': 'i'},
    }))
    produksi_list = [
        p for p in produksi_list
        if _produksi_masuk_stok_hasil_pengemasan(p)
        and _stok_gb_pixel_tidak_lebih_dari_berat_akhir(p)
    ]
    bahan_cache = {}
    candidates = []
    for p in produksi_list:
        bahan = _bahan_cache_get_for_produksi(p, bahan_cache)
        jk = (bahan.get('jenisKopi') or '').strip()
        if jk != jk_pem:
            continue
        ps_disp = _proses_pengolahan_tampilan_untuk_agregasi(p, bahan)
        ps_raw = (p.get('prosesPengolahan') or '').strip()
        if ps_pem not in (ps_raw, ps_disp):
            continue
        avail = _batch_stok_tersedia_setelah_ordering(p, tipe_produk_selected)
        if avail <= 0:
            continue
        candidates.append((p, avail))

    candidates.sort(key=lambda x: (
        (x[0].get('tanggalPengemasan') or '')[:10],
        str(x[0].get('idProduksi') or ''),
    ))

    out = []
    for p, avail in candidates:
        if need <= 1e-9:
            break
        take = min(need, avail)
        if take <= 0:
            continue
        out.append((p, take))
        need -= take
    if need > 1e-6:
        raise RuntimeError('Alokasi FIFO gagal; stok agregat berubah atau data tidak konsisten')
    return out


@app.route('/api/stok', methods=['GET'])
def get_stok():
    """
    Stok Pengemasan: Green Beans = (berat akhir − pixel) per batch; Pixel = beratPixel.
    Hanya batch dengan tanggal pengemasan tercatat; GB+pixel di form tidak melebihi berat akhir.
    Kurangi pemesanan per tipe. Query: tipeProduk, tanggalPengemasan.
    """
    try:
        tipe_filter = request.args.get('tipeProduk', '').strip()
        tanggal_filter = request.args.get('tanggalPengemasan', '').strip()
        stok_array, ringkasan = _compute_stok_hasil_aggregate(tipe_filter, tanggal_filter)
        print(f"📊 [STOK GET] Aggregated {len(stok_array)} stok (filter tipe={tipe_filter or 'semua'}, tanggal={tanggal_filter or 'semua'})")
        return jsonify(json_serialize({'rows': stok_array, 'ringkasan': ringkasan})), 200
    except Exception as e:
        print(f"❌ [STOK GET] ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/stok/filter-options', methods=['GET'])
def get_stok_filter_options():
    """Opsi filter stok: tipe produk (Green Beans/Pixel), tanggal pengemasan dari produksi."""
    try:
        # Tipe produk tetap: Green Beans dan Pixel
        tipe_produk_list = ['Green Beans', 'Pixel']
        # Tanggal pengemasan dari produksi yang memenuhi syarat stok hasil
        produksi_list = list(db.produksi.find({
            'statusTahapan': {'$regex': 'Pengemasan', '$options': 'i'},
        }))
        tanggal_set = set()
        for p in produksi_list:
            if not _produksi_masuk_stok_hasil_pengemasan(p):
                continue
            if not _stok_gb_pixel_tidak_lebih_dari_berat_akhir(p):
                continue
            d = (p.get('tanggalPengemasan') or '')[:10]
            if d:
                tanggal_set.add(d)
        return jsonify({
            'tipeProduk': tipe_produk_list,
            'tanggalPengemasan': sorted(tanggal_set)
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/stok/bahan', methods=['GET'])
def get_stok_bahan():
    """Get stok bahan baku dengan perhitungan otomatis dari produksi"""
    try:
        bahan_list = list(db.bahan.find().sort('id', 1))
        produksi_list = list(db.produksi.find())
        
        # Hitung total yang digunakan per idBahan (dukung alokasi multi-bahan)
        total_digunakan_map = {}
        for p in produksi_list:
            m = _alokasi_map_from_produksi(p)
            for bid, w in m.items():
                total_digunakan_map[bid] = total_digunakan_map.get(bid, 0) + float(w or 0)
        
        # Buat array stok bahan dengan sisa tersedia
        stok_bahan_array = []
        for bahan in bahan_list:
            id_bahan = bahan.get('idBahan')
            total_bahan = float(bahan.get('jumlah', 0))
            total_digunakan = total_digunakan_map.get(id_bahan, 0)
            sisa_tersedia = max(0, total_bahan - total_digunakan)
            
            proses_lines = bahan.get('prosesBahan') or []
            ringkasan_proses = ', '.join(
                f"{x.get('prosesPengolahan', '')} ({float(x.get('jumlahBeratProses', 0) or 0):g} kg)"
                for x in proses_lines
            ) if proses_lines else ''
            stok_bahan_array.append({
                'id': bahan.get('id'),
                'idBahan': id_bahan,
                'pemasok': bahan.get('pemasok', ''),
                'varietas': bahan.get('varietas', ''),
                'jenisKopi': bahan.get('jenisKopi', ''),
                'ringkasanProses': ringkasan_proses,
                'tanggalMasuk': bahan.get('tanggalMasuk', ''),
                'totalBahan': total_bahan,
                'totalDigunakan': total_digunakan,
                'sisaTersedia': sisa_tersedia,
                'persentaseTersedia': (sisa_tersedia / total_bahan * 100) if total_bahan > 0 else 0
            })
        
        # Sort by idBahan
        stok_bahan_array.sort(key=lambda x: x.get('idBahan', ''))
        
        return jsonify(json_serialize(stok_bahan_array)), 200
    except Exception as e:
        print(f"❌ [STOK BAHAN GET] ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# ==================== MASTER DATA ENDPOINTS ====================

def get_master_data_endpoints(collection_name, fields):
    """Helper to create CRUD endpoints for master data"""
    
    @app.route(f'/api/{collection_name}', methods=['GET'], endpoint=f'get_all_{collection_name}')
    def get_all():
        try:
            data = list(db[collection_name].find().sort('id', 1))
            return jsonify(json_serialize(data)), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    @app.route(f'/api/{collection_name}/<item_id>', methods=['GET'], endpoint=f'get_one_{collection_name}')
    def get_one(item_id):
        try:
            try:
                item = db[collection_name].find_one({'_id': ObjectId(item_id)})
            except:
                item = db[collection_name].find_one({'id': int(item_id)}) or \
                      db[collection_name].find_one({'nama': item_id})
            
            if not item:
                return jsonify({'error': f'{collection_name} not found'}), 404
            
            return jsonify(json_serialize(item)), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    @app.route(f'/api/{collection_name}', methods=['POST'], endpoint=f'create_{collection_name}')
    def create():
        try:
            data = request.json
            
            for field in fields:
                if field not in data:
                    return jsonify({'error': f'Missing required field: {field}'}), 400
            
            # Check if nama already exists (if 'nama' is a field)
            if 'nama' in fields:
                existing = db[collection_name].find_one({'nama': data['nama']})
                if existing:
                    return jsonify({'error': 'Nama already exists'}), 400
            
            new_id = get_next_id(collection_name)
            
            item_data = {'id': new_id}
            for field in fields:
                item_data[field] = data[field]
            
            # Handle special fields like 'ukuran' for kemasan
            if 'ukuran' in fields and 'ukuran' in data:
                item_data['ukuran'] = data['ukuran']
            
            result = db[collection_name].insert_one(item_data)
            item_data['_id'] = result.inserted_id
            
            return jsonify(json_serialize(item_data)), 201
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    @app.route(f'/api/{collection_name}/<item_id>', methods=['PUT'], endpoint=f'update_{collection_name}')
    def update(item_id):
        try:
            data = request.json
            
            try:
                item = db[collection_name].find_one({'_id': ObjectId(item_id)})
            except:
                item = db[collection_name].find_one({'id': int(item_id)}) or \
                      db[collection_name].find_one({'nama': item_id})
            
            if not item:
                return jsonify({'error': f'{collection_name} not found'}), 404
            
            if 'nama' in data and 'nama' in fields:
                existing = db[collection_name].find_one({
                    'nama': data['nama'],
                    '_id': {'$ne': item['_id']}
                })
                if existing:
                    return jsonify({'error': 'Nama already exists'}), 400
            
            update_data = {}
            for field in fields:
                if field in data:
                    update_data[field] = data[field]
            
            if 'ukuran' in data:
                update_data['ukuran'] = data['ukuran']
            
            db[collection_name].update_one(
                {'_id': item['_id']},
                {'$set': update_data}
            )
            
            updated = db[collection_name].find_one({'_id': item['_id']})
            return jsonify(json_serialize(updated)), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    @app.route(f'/api/{collection_name}/<item_id>', methods=['DELETE'], endpoint=f'delete_{collection_name}')
    def delete(item_id):
        try:
            try:
                item = db[collection_name].find_one({'_id': ObjectId(item_id)})
            except:
                item = db[collection_name].find_one({'id': int(item_id)}) or \
                      db[collection_name].find_one({'nama': item_id})
            
            if not item:
                return jsonify({'error': f'{collection_name} not found'}), 404
            
            db[collection_name].delete_one({'_id': item['_id']})
            return jsonify({'message': f'{collection_name} deleted successfully'}), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500

# Create master data endpoints
get_master_data_endpoints('dataJenisKopi', ['nama'])
get_master_data_endpoints('dataVarietas', ['nama'])
# dataProses menggunakan endpoint khusus karena memiliki tahapanStatus
get_master_data_endpoints('dataRoasting', ['nama'])
# dataKemasan menggunakan endpoint khusus karena memiliki stok
get_master_data_endpoints('dataProduk', ['nama'])

# ==================== DATA PROSES ENDPOINTS (Khusus dengan tahapanStatus) ====================
@app.route('/api/dataProses', methods=['GET'])
def get_all_dataProses():
    try:
        data = list(db.dataProses.find().sort('id', 1))
        return jsonify(json_serialize(data)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/dataProses/<item_id>', methods=['GET'])
def get_one_dataProses(item_id):
    try:
        try:
            item = db.dataProses.find_one({'_id': ObjectId(item_id)})
        except:
            item = db.dataProses.find_one({'id': int(item_id)}) or \
                  db.dataProses.find_one({'nama': item_id})
        
        if not item:
            return jsonify({'error': 'dataProses not found'}), 404
        
        return jsonify(json_serialize(item)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/dataProses', methods=['POST'])
def create_dataProses():
    try:
        data = request.json
        
        if 'nama' not in data:
            return jsonify({'error': 'Missing required field: nama'}), 400
        
        # Check if nama already exists
        existing = db.dataProses.find_one({'nama': data['nama']})
        if existing:
            return jsonify({'error': 'Nama already exists'}), 400
        
        new_id = get_next_id('dataProses')
        
        item_data = {
            'id': new_id,
            'nama': data['nama'],
            'tahapanStatus': data.get('tahapanStatus', {})
        }
        
        result = db.dataProses.insert_one(item_data)
        item_data['_id'] = result.inserted_id
        
        return jsonify(json_serialize(item_data)), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/dataProses/<item_id>', methods=['PUT'])
def update_dataProses(item_id):
    try:
        data = request.json
        
        try:
            item = db.dataProses.find_one({'_id': ObjectId(item_id)})
        except:
            item = db.dataProses.find_one({'id': int(item_id)}) or \
                  db.dataProses.find_one({'nama': item_id})
        
        if not item:
            return jsonify({'error': 'dataProses not found'}), 404
        
        # Check duplicate nama
        if 'nama' in data:
            existing = db.dataProses.find_one({
                'nama': data['nama'],
                '_id': {'$ne': item['_id']}
            })
            if existing:
                return jsonify({'error': 'Nama already exists'}), 400
        
        update_data = {}
        old_nama = (item.get('nama') or '').strip()
        if 'nama' in data:
            update_data['nama'] = data['nama']
        if 'tahapanStatus' in data:
            update_data['tahapanStatus'] = data['tahapanStatus']

        new_nama = (update_data.get('nama') or item.get('nama') or '').strip()
        cascade_stats = None
        if 'nama' in update_data and old_nama and new_nama and new_nama != old_nama:
            cascade_stats = _cascade_rename_master_proses_pengolahan(old_nama, new_nama)

        db.dataProses.update_one(
            {'_id': item['_id']},
            {'$set': update_data}
        )

        updated = db.dataProses.find_one({'_id': item['_id']})
        payload = json_serialize(updated)
        if cascade_stats and isinstance(payload, dict):
            payload['referensiDiperbarui'] = cascade_stats
        return jsonify(payload), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/dataProses/<item_id>', methods=['DELETE'])
def delete_dataProses(item_id):
    try:
        try:
            item = db.dataProses.find_one({'_id': ObjectId(item_id)})
        except:
            item = db.dataProses.find_one({'id': int(item_id)}) or \
                  db.dataProses.find_one({'nama': item_id})
        
        if not item:
            return jsonify({'error': 'dataProses not found'}), 404
        
        db.dataProses.delete_one({'_id': item['_id']})
        return jsonify({'message': 'dataProses deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== MIGRATION ENDPOINT: Update Tahapan Pengeringan ====================
@app.route('/api/migrate/tahapan-pengeringan', methods=['POST'])
def migrate_tahapan_pengeringan():
    """
    Endpoint untuk migrasi tahapan Pengeringan menjadi Pengeringan Awal dan Pengeringan Akhir.
    Hanya bisa diakses oleh admin atau melalui script khusus.
    """
    try:
        # Ambil semua dataProses
        data_proses_list = list(db.dataProses.find())
        
        updated_count = 0
        skipped_count = 0
        results = []
        
        for proses in data_proses_list:
            tahapan_status = proses.get('tahapanStatus', {})
            
            # Cek apakah ada tahapan "Pengeringan"
            has_pengeringan = tahapan_status.get('Pengeringan', False)
            
            if not has_pengeringan:
                skipped_count += 1
                continue
            
            # Hapus "Pengeringan"
            new_tahapan_status = tahapan_status.copy()
            if 'Pengeringan' in new_tahapan_status:
                del new_tahapan_status['Pengeringan']
            
            # Tambahkan "Pengeringan Awal" dan "Pengeringan Akhir"
            if has_pengeringan:
                new_tahapan_status['Pengeringan Awal'] = True
                new_tahapan_status['Pengeringan Akhir'] = True
            
            # Pastikan Natural Process tidak memiliki Fermentasi
            if proses.get('nama') == 'Natural Process':
                if 'Fermentasi' in new_tahapan_status:
                    new_tahapan_status['Fermentasi'] = False
            
            # Update di database
            db.dataProses.update_one(
                {'_id': proses['_id']},
                {'$set': {'tahapanStatus': new_tahapan_status}}
            )
            
            results.append({
                'id': proses.get('id'),
                'nama': proses.get('nama'),
                'tahapanStatus_lama': tahapan_status,
                'tahapanStatus_baru': new_tahapan_status
            })
            updated_count += 1
        
        # Verifikasi: Pastikan tidak ada lagi referensi "Pengeringan"
        remaining_pengeringan = list(db.dataProses.find({'tahapanStatus.Pengeringan': {'$exists': True}}))
        
        return jsonify({
            'success': True,
            'message': 'Migrasi tahapan Pengeringan berhasil',
            'updated_count': updated_count,
            'skipped_count': skipped_count,
            'total_proses': len(data_proses_list),
            'remaining_pengeringan': len(remaining_pengeringan),
            'results': json_serialize(results)
        }), 200
        
    except Exception as e:
        print(f"❌ [MIGRATE] ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# ==================== DATA KEMASAN ENDPOINTS (Khusus dengan stok) ====================
@app.route('/api/dataKemasan', methods=['GET'])
def get_all_dataKemasan():
    try:
        data = list(db.dataKemasan.find().sort('id', 1))
        return jsonify(json_serialize(data)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/dataKemasan/<item_id>', methods=['GET'])
def get_one_dataKemasan(item_id):
    try:
        try:
            item = db.dataKemasan.find_one({'_id': ObjectId(item_id)})
        except:
            item = db.dataKemasan.find_one({'id': int(item_id)}) or \
                  db.dataKemasan.find_one({'nama': item_id})
        
        if not item:
            return jsonify({'error': 'dataKemasan not found'}), 404
        
        return jsonify(json_serialize(item)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/dataKemasan', methods=['POST'])
def create_dataKemasan():
    try:
        data = request.json
        
        if 'nama' not in data:
            return jsonify({'error': 'Missing required field: nama'}), 400
        
        # Check if nama already exists
        existing = db.dataKemasan.find_one({'nama': data['nama']})
        if existing:
            return jsonify({'error': 'Nama already exists'}), 400
        
        new_id = get_next_id('dataKemasan')
        
        item_data = {
            'id': new_id,
            'nama': data['nama'],
            'ukuran': data.get('ukuran', ''),
            'stok': int(data.get('stok', 0))  # Default stok = 0
        }
        
        result = db.dataKemasan.insert_one(item_data)
        item_data['_id'] = result.inserted_id
        
        return jsonify(json_serialize(item_data)), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/dataKemasan/<item_id>', methods=['PUT'])
def update_dataKemasan(item_id):
    try:
        data = request.json
        
        try:
            item = db.dataKemasan.find_one({'_id': ObjectId(item_id)})
        except:
            item = db.dataKemasan.find_one({'id': int(item_id)}) or \
                  db.dataKemasan.find_one({'nama': item_id})
        
        if not item:
            return jsonify({'error': 'dataKemasan not found'}), 404
        
        # Check duplicate nama
        if 'nama' in data:
            existing = db.dataKemasan.find_one({
                'nama': data['nama'],
                '_id': {'$ne': item['_id']}
            })
            if existing:
                return jsonify({'error': 'Nama already exists'}), 400
        
        update_data = {}
        if 'nama' in data:
            update_data['nama'] = data['nama']
        if 'ukuran' in data:
            update_data['ukuran'] = data['ukuran']
        if 'stok' in data:
            update_data['stok'] = int(data['stok'])
        
        db.dataKemasan.update_one(
            {'_id': item['_id']},
            {'$set': update_data}
        )
        
        updated = db.dataKemasan.find_one({'_id': item['_id']})
        return jsonify(json_serialize(updated)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/dataKemasan/<item_id>', methods=['DELETE'])
def delete_dataKemasan(item_id):
    try:
        try:
            item = db.dataKemasan.find_one({'_id': ObjectId(item_id)})
        except:
            item = db.dataKemasan.find_one({'id': int(item_id)}) or \
                  db.dataKemasan.find_one({'nama': item_id})
        
        if not item:
            return jsonify({'error': 'dataKemasan not found'}), 404
        
        db.dataKemasan.delete_one({'_id': item['_id']})
        return jsonify({'message': 'dataKemasan deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== SANITASI ENDPOINTS ====================

@app.route('/api/sanitasi', methods=['GET'])
def get_sanitasi():
    """Get all sanitasi data - Optimized for performance"""
    import time
    start_time = time.time()
    
    try:
        # Optional: exclude fotos for list view (fotos can be large base64 strings)
        exclude_fotos = request.args.get('exclude_fotos', 'false').lower() == 'true'
        
        # Ensure index exists for faster sorting (only create if not exists)
        try:
            db.sanitasi.create_index('id', background=True)
        except:
            pass  # Index might already exist
        
        query_start = time.time()
        
        if exclude_fotos:
            # Exclude fotos field to reduce payload size for list view
            # Use projection to exclude fotos and _id for smaller payload
            sanitasi = list(db.sanitasi.find({}, {'fotos': 0, '_id': 0}).sort('id', 1))
            query_time = time.time() - query_start
            print(f"📊 [SANITASI GET] Retrieved {len(sanitasi)} documents (fotos excluded) in {query_time:.3f}s")
        else:
            # Exclude _id to reduce payload size
            sanitasi = list(db.sanitasi.find({}, {'_id': 0}).sort('id', 1))
            query_time = time.time() - query_start
            print(f"📊 [SANITASI GET] Retrieved {len(sanitasi)} documents in {query_time:.3f}s")
        
        # Serialize data
        serialize_start = time.time()
        serialized_data = json_serialize(sanitasi)
        serialize_time = time.time() - serialize_start
        
        total_time = time.time() - start_time
        print(f"⏱️ [SANITASI GET] Total time: {total_time:.3f}s (Query: {query_time:.3f}s, Serialize: {serialize_time:.3f}s)")
        
        return jsonify(serialized_data), 200
    except Exception as e:
        total_time = time.time() - start_time
        print(f"❌ [SANITASI GET] ERROR after {total_time:.3f}s: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/sanitasi/<sanitasi_id>', methods=['GET'])
def get_sanitasi_by_id(sanitasi_id):
    """Get sanitasi by ID"""
    try:
        try:
            sanitasi = db.sanitasi.find_one({'_id': ObjectId(sanitasi_id)})
        except:
            sanitasi = db.sanitasi.find_one({'id': int(sanitasi_id)})
        if not sanitasi:
            return jsonify({'error': 'Sanitasi not found'}), 404
        return jsonify(json_serialize(sanitasi)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sanitasi', methods=['POST'])
def create_sanitasi():
    """Create new sanitasi"""
    try:
        data = request.json
        print(f"🔵 [SANITASI CREATE] Received request: {data}")
        
        new_id = get_next_id('sanitasi')
        print(f"🔵 [SANITASI CREATE] Generated ID: {new_id}")
        
        sanitasi_data = {
            'id': new_id,
            'tanggal': data.get('tanggal'),
            'waktu': data.get('waktu'),
            'tipe': data.get('tipe'),
            'namaPetugas': data.get('namaPetugas'),
            'fotos': data.get('fotos', {}),
            'checklist': data.get('checklist', {}),
            'status': data.get('status', 'Uncomplete')
        }
        
        print(f"🔵 [SANITASI CREATE] Inserting to MongoDB collection 'sanitasi': {sanitasi_data}")
        result = db.sanitasi.insert_one(sanitasi_data)
        sanitasi_data['_id'] = result.inserted_id
        
        print(f"✅ [SANITASI CREATE] Successfully inserted! ID: {result.inserted_id}, Collection: sanitasi")
        return jsonify(json_serialize(sanitasi_data)), 201
    except Exception as e:
        print(f"❌ [SANITASI CREATE] ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/sanitasi/<sanitasi_id>', methods=['PUT'])
def update_sanitasi(sanitasi_id):
    """Update sanitasi"""
    try:
        data = request.json
        try:
            sanitasi = db.sanitasi.find_one({'_id': ObjectId(sanitasi_id)})
        except:
            sanitasi = db.sanitasi.find_one({'id': int(sanitasi_id)})
        if not sanitasi:
            return jsonify({'error': 'Sanitasi not found'}), 404
        
        update_data = {}
        for field in ['tanggal', 'waktu', 'tipe', 'namaPetugas', 'fotos', 'checklist', 'status']:
            if field in data:
                update_data[field] = data[field]
        
        db.sanitasi.update_one({'_id': sanitasi['_id']}, {'$set': update_data})
        updated = db.sanitasi.find_one({'_id': sanitasi['_id']})
        return jsonify(json_serialize(updated)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sanitasi/<sanitasi_id>', methods=['DELETE'])
def delete_sanitasi(sanitasi_id):
    """Delete sanitasi"""
    try:
        try:
            sanitasi = db.sanitasi.find_one({'_id': ObjectId(sanitasi_id)})
        except:
            sanitasi = db.sanitasi.find_one({'id': int(sanitasi_id)})
        if not sanitasi:
            return jsonify({'error': 'Sanitasi not found'}), 404
        db.sanitasi.delete_one({'_id': sanitasi['_id']})
        return jsonify({'message': 'Sanitasi deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== KEUANGAN ENDPOINTS ====================

@app.route('/api/keuangan', methods=['GET'])
def get_keuangan():
    """Get all keuangan data"""
    try:
        keuangan = list(db.keuangan.find().sort('id', 1))
        print(f"📊 [KEUANGAN GET] Retrieved {len(keuangan)} documents from MongoDB collection 'keuangan'")
        return jsonify(json_serialize(keuangan)), 200
    except Exception as e:
        print(f"❌ [KEUANGAN GET] ERROR: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/keuangan/<keuangan_id>', methods=['GET'])
def get_keuangan_by_id(keuangan_id):
    """Get keuangan by ID"""
    try:
        try:
            keuangan = db.keuangan.find_one({'_id': ObjectId(keuangan_id)})
        except:
            keuangan = db.keuangan.find_one({'id': int(keuangan_id)})
        if not keuangan:
            return jsonify({'error': 'Keuangan not found'}), 404
        return jsonify(json_serialize(keuangan)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/keuangan', methods=['POST'])
def create_keuangan():
    """Create new keuangan"""
    try:
        data = request.json
        # Validasi notes wajib diisi
        notes = data.get('notes', '').strip() if data.get('notes') else ''
        if not notes:
            return jsonify({'error': 'Notes wajib diisi'}), 400
        
        new_id = get_next_id('keuangan')
        keuangan_data = {
            'id': new_id,
            'tanggal': data.get('tanggal'),
            'jenisPengeluaran': data.get('jenisPengeluaran'),
            'idBahanBaku': data.get('idBahanBaku'),
            'nilai': data.get('nilai'),
            'notes': notes
        }
        print(f"🔵 [KEUANGAN CREATE] Inserting to MongoDB collection 'keuangan': {keuangan_data}")
        result = db.keuangan.insert_one(keuangan_data)
        keuangan_data['_id'] = result.inserted_id
        print(f"✅ [KEUANGAN CREATE] Successfully inserted! ID: {result.inserted_id}, Collection: keuangan")
        return jsonify(json_serialize(keuangan_data)), 201
    except Exception as e:
        print(f"❌ [KEUANGAN CREATE] ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/keuangan/<keuangan_id>', methods=['PUT'])
def update_keuangan(keuangan_id):
    """Update keuangan"""
    try:
        data = request.json
        try:
            keuangan = db.keuangan.find_one({'_id': ObjectId(keuangan_id)})
        except:
            keuangan = db.keuangan.find_one({'id': int(keuangan_id)})
        if not keuangan:
            return jsonify({'error': 'Keuangan not found'}), 404
        
        # Validasi notes wajib diisi jika ada di data
        if 'notes' in data:
            notes = data.get('notes', '').strip() if data.get('notes') else ''
            if not notes:
                return jsonify({'error': 'Notes wajib diisi'}), 400
        
        update_data = {}
        for field in ['tanggal', 'jenisPengeluaran', 'idBahanBaku', 'nilai', 'notes']:
            if field in data:
                if field == 'notes':
                    update_data[field] = data[field].strip() if data[field] else ''
                else:
                    update_data[field] = data[field]
        
        db.keuangan.update_one({'_id': keuangan['_id']}, {'$set': update_data})
        updated = db.keuangan.find_one({'_id': keuangan['_id']})
        return jsonify(json_serialize(updated)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/keuangan/<keuangan_id>', methods=['DELETE'])
def delete_keuangan(keuangan_id):
    """Delete keuangan"""
    try:
        try:
            keuangan = db.keuangan.find_one({'_id': ObjectId(keuangan_id)})
        except:
            keuangan = db.keuangan.find_one({'id': int(keuangan_id)})
        if not keuangan:
            return jsonify({'error': 'Keuangan not found'}), 404
        db.keuangan.delete_one({'_id': keuangan['_id']})
        return jsonify({'message': 'Keuangan deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== AUTHENTICATION ENDPOINTS ====================

@app.route('/api/auth/session', methods=['GET'])
def check_session():
    """Check if user has valid session - returns 200 with logged_in status"""
    try:
        if 'user_id' in session and session.get('username') and session.get('role'):
            return jsonify({
                'logged_in': True,
                'username': session.get('username'),
                'role': session.get('role'),
                'user_id': session.get('user_id'),
                'user_email': session.get('user_email', ''),
                'user_name': session.get('user_name', '')
            }), 200
        else:
            return jsonify({
                'logged_in': False,
                'message': 'No active session'
            }), 200
    except Exception as e:
        print(f"❌ Session check error: {str(e)}")
        return jsonify({
            'logged_in': False,
            'error': str(e)
        }), 500

@app.route('/api/auth/check', methods=['GET'])
def auth_check():
    """Check if user has valid session - returns 200 if logged in, 401 if not"""
    try:
        if 'user_id' in session and session.get('username') and session.get('role'):
            return jsonify({
                'logged_in': True,
                'username': session.get('username'),
                'role': session.get('role'),
                'user_id': session.get('user_id'),
                'user_email': session.get('user_email', ''),
                'user_name': session.get('user_name', '')
            }), 200
        else:
            return jsonify({
                'logged_in': False,
                'message': 'No active session'
            }), 401
    except Exception as e:
        print(f"❌ Auth check error: {str(e)}")
        return jsonify({
            'logged_in': False,
            'error': str(e)
        }), 500

@app.route('/api/auth/logout', methods=['POST'])
def api_logout():
    """Logout user - clear session"""
    try:
        username = session.get('username', 'Unknown')
        session.clear()
        print(f"✅ Logout successful: User '{username}'")
        return jsonify({
            'success': True,
            'message': 'Logout berhasil'
        }), 200
    except Exception as e:
        print(f"❌ Logout error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/auth/login', methods=['POST'])
def api_login():
    """Login endpoint - validates username/password and returns user data"""
    try:
        data = request.json
        
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        role = data.get('role', '').strip()
        
        if not username or not password:
            return jsonify({'error': 'Username and password are required'}), 400
        
        # Normalize role
        normalized_role = None
        if role:
            role_lower = role.lower()
            if role_lower == 'admin':
                normalized_role = 'Admin'
            elif role_lower == 'owner':
                normalized_role = 'Owner'
            elif role_lower == 'karyawan':
                normalized_role = 'Karyawan'
        
        # Find user by username (case-insensitive)
        user = db.users.find_one({
            'username': {'$regex': f'^{username}$', '$options': 'i'}
        })
        
        if not user:
            print(f"❌ Login failed: User '{username}' not found in database")
            print(f"   Searched with regex: ^{username}$ (case-insensitive)")
            return jsonify({'error': 'Username atau password salah'}), 401
        
        print(f"✓ User found: {user.get('username')} (ID: {user.get('id')}, Role: {user.get('role')})")
        
        # Hash the provided password using SHA-256 (same as register)
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        
        # Get stored password from database
        stored_password = user.get('password', '')
        
        # Debug logging (do not log actual passwords, only hashes for comparison)
        print(f"   Stored password hash length: {len(stored_password)}")
        print(f"   Provided password hash length: {len(password_hash)}")
        print(f"   Hash match: {stored_password == password_hash}")
        
        # Compare hashed passwords
        if not stored_password or stored_password != password_hash:
            print(f"❌ Login failed: Password mismatch for user '{username}'")
            print(f"   Stored hash: {stored_password[:20]}..." if stored_password else "   Stored hash: (empty)")
            print(f"   Provided hash: {password_hash[:20]}...")
            return jsonify({'error': 'Username atau password salah'}), 401
        
        # Check role if provided
        if normalized_role and user.get('role') != normalized_role:
            print(f"❌ Login failed: Role mismatch for user '{username}'. Expected: {normalized_role}, Got: {user.get('role')}")
            return jsonify({'error': f'Role tidak sesuai. Halaman ini hanya untuk {normalized_role}'}), 403
        
        # Check status
        if user.get('status') != 'Aktif':
            print(f"❌ Login failed: User '{username}' is not active (status: {user.get('status')})")
            return jsonify({'error': 'Akun Anda tidak aktif. Silakan hubungi administrator'}), 403
        
        # Prepare user data to return (without password)
        user_data = {
            '_id': str(user['_id']),
            'id': user.get('id'),
            'username': user.get('username'),
            'namaLengkap': user.get('namaLengkap', ''),
            'email': user.get('email', ''),
            'role': user.get('role'),
            'status': user.get('status'),
            'noTelepon': user.get('noTelepon', ''),
            'tanggalLahir': user.get('tanggalLahir', ''),
            'jenisKelamin': user.get('jenisKelamin', ''),
            'alamat': user.get('alamat', '')
        }
        
        # Set Flask session
        session.permanent = True
        session['user_id'] = str(user['_id'])
        session['username'] = user.get('username')
        session['role'] = user.get('role')
        session['user_email'] = user.get('email', '')
        session['user_name'] = user.get('namaLengkap', '')
        
        print(f"✅ Login successful: User '{username}' (Role: {user.get('role')}) - Session created")
        print(f"   Session keys: {list(session.keys())}")
        
        response = jsonify({
            'success': True,
            'user': user_data,
            'message': 'Login berhasil'
        })
        
        # Flask handles session cookie automatically with configured settings
        # Ensure session is saved before returning response
        session.modified = True
        
        return response, 200
        
    except Exception as e:
        print(f"❌ Login error: {str(e)}")
        return jsonify({'error': f'Terjadi kesalahan saat login: {str(e)}'}), 500

# ==================== USERS ENDPOINTS ====================

@app.route('/api/users', methods=['GET'])
def get_users():
    """Get all users"""
    try:
        users = list(db.users.find().sort('id', 1))
        # Don't return password
        for user in users:
            user.pop('password', None)
        return jsonify(json_serialize(users)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/<user_id>', methods=['GET'])
def get_user_by_id(user_id):
    """Get user by ID"""
    try:
        try:
            user = db.users.find_one({'_id': ObjectId(user_id)})
        except:
            user = db.users.find_one({'id': int(user_id)}) or \
                  db.users.find_one({'username': user_id})
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        user.pop('password', None)
        return jsonify(json_serialize(user)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/users', methods=['POST'])
def create_user():
    """Create new user"""
    try:
        data = request.json
        
        required_fields = ['username', 'password', 'namaLengkap', 'email', 'role']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Check username uniqueness
        existing_username = db.users.find_one({'username': {'$regex': f"^{data['username']}$", '$options': 'i'}})
        if existing_username:
            return jsonify({'error': 'Username sudah digunakan'}), 400
        
        # Check email uniqueness if provided
        if data.get('email'):
            existing_email = db.users.find_one({'email': {'$regex': f"^{data['email']}$", '$options': 'i'}})
            if existing_email:
                return jsonify({'error': 'Email sudah digunakan'}), 400
        
        new_id = get_next_id('users')
        
        # Hash password using SHA-256 (consistent with login)
        password_hash = hashlib.sha256(data['password'].encode()).hexdigest()
        
        print(f"📝 Creating new user: {data['username']}")
        print(f"   Password hash length: {len(password_hash)}")
        print(f"   Hash: {password_hash[:20]}...")
        
        user_data = {
            'id': new_id,
            'username': data['username'],
            'password': password_hash,
            'namaLengkap': data['namaLengkap'],
            'email': data.get('email', ''),
            'noTelepon': data.get('noTelepon', ''),
            'tanggalLahir': data.get('tanggalLahir', ''),
            'jenisKelamin': data.get('jenisKelamin', ''),
            'alamat': data.get('alamat', ''),
            'role': data['role'],
            'status': data.get('status', 'Aktif')
        }
        
        print(f"🔵 [USERS CREATE] Inserting to MongoDB collection 'users': {user_data}")
        result = db.users.insert_one(user_data)
        print(f"✅ [USERS CREATE] Successfully inserted! ID: {result.inserted_id}, Collection: users")
        user_data['_id'] = result.inserted_id
        
        print(f"✅ User created successfully: {user_data['username']} (ID: {new_id}, _id: {user_data['_id']})")
        
        # Remove password before returning
        user_data.pop('password', None)
        
        # Auto-login after registration (set session)
        session.permanent = True
        session['user_id'] = str(result.inserted_id)
        session['username'] = user_data['username']
        session['role'] = user_data['role']
        session['user_email'] = user_data.get('email', '')
        session['user_name'] = user_data.get('namaLengkap', '')
        
        response = jsonify(json_serialize(user_data))
        # Flask handles session cookie automatically, no need to set manually
        return response, 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/<user_id>', methods=['PUT'])
def update_user(user_id):
    """Update user"""
    try:
        data = request.json
        
        try:
            user = db.users.find_one({'_id': ObjectId(user_id)})
        except:
            user = db.users.find_one({'id': int(user_id)}) or \
                  db.users.find_one({'username': user_id})
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        if 'username' in data:
            existing = db.users.find_one({
                'username': data['username'],
                '_id': {'$ne': user['_id']}
            })
            if existing:
                return jsonify({'error': 'Username already exists'}), 400
        
        update_data = {}
        for field in ['username', 'namaLengkap', 'email', 'noTelepon', 
                     'tanggalLahir', 'jenisKelamin', 'alamat', 'role', 'status']:
            if field in data:
                update_data[field] = data[field]
        
        if 'password' in data and data['password']:
            # Hash password using SHA-256 (consistent with register and login)
            update_data['password'] = hashlib.sha256(data['password'].encode()).hexdigest()
            print(f"📝 Password updated for user ID: {user_id}")
        
        db.users.update_one(
            {'_id': user['_id']},
            {'$set': update_data}
        )
        
        updated = db.users.find_one({'_id': user['_id']})
        updated.pop('password', None)
        return jsonify(json_serialize(updated)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/<user_id>', methods=['DELETE'])
def delete_user(user_id):
    """Delete user"""
    try:
        try:
            user = db.users.find_one({'_id': ObjectId(user_id)})
        except:
            user = db.users.find_one({'id': int(user_id)}) or \
                  db.users.find_one({'username': user_id})
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        db.users.delete_one({'_id': user['_id']})
        return jsonify({'message': 'User deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== SETTINGS ENDPOINTS ====================

@app.route('/api/settings', methods=['GET'])
def get_settings():
    """Get user settings"""
    try:
        settings = db.userSettings.find_one({'userId': request.args.get('userId')})
        if not settings:
            # Return default settings
            default_settings = {
                'displayName': '',
                'timezone': 'WIB',
                'language': 'id',
                'emailNotification': True,
                'systemNotification': True,
                'updateNotification': False,
                'twoFactorAuth': False,
                'publicProfile': False,
                'shareActivity': False,
                'dataRetention': 365
            }
            return jsonify(json_serialize(default_settings)), 200
        
        settings.pop('_id', None)
        return jsonify(json_serialize(settings)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/settings', methods=['POST', 'PUT'])
def save_settings():
    """Save user settings"""
    try:
        data = request.json
        
        if 'userId' not in data:
            return jsonify({'error': 'Missing userId'}), 400
        
        # Upsert settings
        db.userSettings.update_one(
            {'userId': data['userId']},
            {'$set': data},
            upsert=True
        )
        
        settings = db.userSettings.find_one({'userId': data['userId']})
        settings.pop('_id', None)
        return jsonify(json_serialize(settings)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== LAPORAN PDF ENDPOINTS ====================

@app.route('/api/laporan/upload', methods=['POST'])
def upload_laporan_pdf():
    """Upload PDF laporan ke server dan simpan ke static/laporan/"""
    try:
        data = request.json
        
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        
        # Validasi required fields
        required_fields = ['pdfData', 'type', 'id']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        pdf_type = data['type']  # 'hasil-produksi', 'produksi', 'data-kemasan', dll
        item_id = data['id']
        pdf_data = data['pdfData']  # Base64 encoded PDF
        
        # Validasi PDF data (harus base64)
        if not pdf_data.startswith('data:application/pdf;base64,'):
            # Jika tidak ada prefix, tambahkan
            if not pdf_data.startswith('data:'):
                pdf_data = 'data:application/pdf;base64,' + pdf_data
        
        # Extract base64 data
        if ',' in pdf_data:
            pdf_base64 = pdf_data.split(',')[1]
        else:
            pdf_base64 = pdf_data
        
        # Decode base64 to bytes
        try:
            pdf_bytes = base64.b64decode(pdf_base64)
        except Exception as e:
            return jsonify({'error': f'Invalid base64 PDF data: {str(e)}'}), 400
        
        # Validasi bahwa ini benar-benar PDF (cek magic bytes)
        if not pdf_bytes.startswith(b'%PDF'):
            return jsonify({'error': 'Invalid PDF file format'}), 400
        
        # Buat folder static/laporan jika belum ada
        laporan_dir = join(dirname(__file__), 'static', 'laporan')
        if not exists(laporan_dir):
            os.makedirs(laporan_dir)
            print(f"✅ Created directory: {laporan_dir}")
        
        # Generate filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'laporan_{pdf_type}_{item_id}_{timestamp}.pdf'
        filepath = join(laporan_dir, filename)
        
        # Simpan file PDF
        with open(filepath, 'wb') as f:
            f.write(pdf_bytes)
        
        print(f"✅ PDF saved: {filepath}")
        
        # Generate URL untuk akses file
        # PERBAIKAN: Pastikan URL selalu benar format: /static/laporan/filename.pdf
        # Backend mengirim relative URL dan fullUrl (absolute)
        relative_url = f"/static/laporan/{filename}"
        
        # Generate absolute URL untuk QR Code
        base_url = request.url_root.rstrip('/')
        full_url = f"{base_url}{relative_url}"
        
        # Validasi URL format
        if not relative_url.startswith("/static/laporan/"):
            raise ValueError(f"Invalid relative URL format: {relative_url}")
        if not full_url.startswith("http"):
            raise ValueError(f"Invalid full URL format: {full_url}")
        
        # Log URL untuk debugging
        print(f"🔗 Generated PDF URLs:")
        print(f"  - Relative URL: {relative_url}")
        print(f"  - Full URL: {full_url}")
        print(f"  - Request host: {request.host}")
        print(f"  - Request scheme: {request.scheme}")
        
        # Simpan metadata ke MongoDB (opsional, untuk tracking)
        try:
            db.laporanPdf.insert_one({
                'type': pdf_type,
                'itemId': item_id,
                'filename': filename,
                'url': relative_url,  # Simpan relative URL
                'fullUrl': full_url,  # Simpan full URL untuk QR Code
                'createdAt': datetime.now(),
                'fileSize': len(pdf_bytes)
            })
        except Exception as e:
            print(f"⚠️ Warning: Could not save metadata to MongoDB: {str(e)}")
            # Tidak fatal, lanjutkan saja
        
        return jsonify({
            'success': True,
            'url': relative_url,  # Relative URL: /static/laporan/filename.pdf
            'fullUrl': full_url,  # Full absolute URL: http://HOST:PORT/static/laporan/filename.pdf
            'filename': filename,
            'message': 'PDF uploaded successfully'
        }), 200
        
    except Exception as e:
        print(f"❌ Error uploading PDF: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/static/laporan/<filename>')
def serve_laporan_pdf(filename):
    """Serve PDF laporan dari static/laporan/"""
    try:
        laporan_dir = join(dirname(__file__), 'static', 'laporan')
        filepath = join(laporan_dir, filename)
        
        # Security: validasi filename (prevent path traversal)
        if not filename.endswith('.pdf') or '..' in filename or '/' in filename:
            return jsonify({'error': 'Invalid filename'}), 400
        
        if not exists(filepath):
            return jsonify({'error': 'PDF not found'}), 404
        
        return send_from_directory(laporan_dir, filename, mimetype='application/pdf')
    except Exception as e:
        print(f"❌ Error serving PDF: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/laporan/list', methods=['GET'])
def list_laporan_pdf():
    """List semua PDF laporan yang tersimpan"""
    try:
        pdf_type = request.args.get('type')
        item_id = request.args.get('id')
        
        query = {}
        if pdf_type:
            query['type'] = pdf_type
        if item_id:
            query['itemId'] = item_id
        
        laporan_list = list(db.laporanPdf.find(query).sort('createdAt', -1))
        return jsonify(json_serialize(laporan_list)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== PEMESANAN ENDPOINTS ====================

def _berat_kg_dari_baris_pemesanan(it):
    """Ambil berat (kg) dari kloter/barisan: beratKg, berat, atau jumlahPesananKg."""
    if not isinstance(it, dict):
        return 0.0
    for key in ('beratKg', 'berat', 'jumlahPesananKg'):
        if key not in it or it[key] is None:
            continue
        try:
            return float(it[key])
        except (TypeError, ValueError):
            continue
    return 0.0


def _normalize_pemesanan_kloter_from_body(data):
    """
    Normalisasi array `kloter` (model utama) atau `items` (kompatibel lama).
    Tiap kloter: tipeProduk, jenisKopi, prosesPengolahan, beratKg, hargaPerKg,
    subtotal; jumlahPesananKg disamakan dengan beratKg untuk alur stok/ordering.
    Mengembalikan (list_atau_None, pesan_error_atau_None).
    """
    raw = None
    kloter_in = data.get('kloter')
    if isinstance(kloter_in, list) and len(kloter_in) > 0:
        raw = kloter_in
    else:
        items_in = data.get('items')
        if isinstance(items_in, list) and len(items_in) > 0:
            raw = items_in
    if raw is None:
        return None, None
    out = []
    for idx, it in enumerate(raw):
        if not isinstance(it, dict):
            return None, f'Kloter {idx + 1}: format tidak valid'
        tp = (it.get('tipeProduk') or '').strip()
        jk = (it.get('jenisKopi') or '').strip()
        pr = (it.get('prosesPengolahan') or '').strip()
        jm = _berat_kg_dari_baris_pemesanan(it)
        try:
            hp = float(it.get('hargaPerKg') or 0)
        except (TypeError, ValueError):
            return None, f'Kloter {idx + 1}: harga tidak valid'
        if tp not in ('Green Beans', 'Pixel'):
            return None, f'Kloter {idx + 1}: tipeProduk harus Green Beans atau Pixel'
        if not jk or not pr:
            return None, f'Kloter {idx + 1}: jenis kopi dan proses pengolahan wajib diisi'
        if jm <= 0 or hp <= 0:
            return None, f'Kloter {idx + 1}: berat (kg) dan harga per kg harus lebih dari 0'
        sub = round(jm * hp, 2)
        out.append({
            'tipeProduk': tp,
            'jenisKopi': jk,
            'prosesPengolahan': pr,
            'beratKg': jm,
            'hargaPerKg': hp,
            'subtotal': sub,
            'jumlahPesananKg': jm,
        })
    if not out:
        return None, 'Tidak ada kloter yang valid'
    return out, None


def pemesanan_items_from_doc(doc):
    """Baca baris barang untuk stok/ordering: kloter[] → items[] → bentuk tunggal root."""
    if not doc:
        return []
    raw = None
    kl = doc.get('kloter')
    if isinstance(kl, list) and len(kl) > 0:
        raw = kl
    else:
        it = doc.get('items')
        if isinstance(it, list) and len(it) > 0:
            raw = it
    if raw:
        lines = []
        for row in raw:
            if not isinstance(row, dict):
                continue
            jm = _berat_kg_dari_baris_pemesanan(row)
            try:
                hp = float(row.get('hargaPerKg') or 0)
            except (TypeError, ValueError):
                hp = 0.0
            if jm <= 0 or hp <= 0:
                continue
            lines.append({
                'tipeProduk': (row.get('tipeProduk') or '').strip(),
                'jenisKopi': (row.get('jenisKopi') or '').strip(),
                'prosesPengolahan': (row.get('prosesPengolahan') or '').strip(),
                'beratKg': jm,
                'jumlahPesananKg': jm,
                'hargaPerKg': hp,
                'subtotal': float(row.get('subtotal') or round(jm * hp, 2) or 0),
            })
        return lines
    jm = float(doc.get('jumlahPesananKg') or 0)
    hp = float(doc.get('hargaPerKg') or 0)
    if jm <= 0 or hp <= 0:
        return []
    return [{
        'tipeProduk': (doc.get('tipeProduk') or '').strip(),
        'jenisKopi': (doc.get('jenisKopi') or '').strip(),
        'prosesPengolahan': (doc.get('prosesPengolahan') or '').strip(),
        'beratKg': jm,
        'jumlahPesananKg': jm,
        'hargaPerKg': hp,
        'subtotal': round(jm * hp, 2),
    }]


@app.route('/api/pemesanan', methods=['GET'])
def get_pemesanan():
    """Get all pemesanan data"""
    try:
        # Sort by id if exists, fallback to _id for documents without id field
        try:
            pemesanan = list(db.pemesanan.find().sort('id', 1))
        except Exception:
            pemesanan = list(db.pemesanan.find())
        print(f"📊 [PEMESANAN GET] Retrieved {len(pemesanan)} documents from MongoDB collection 'pemesanan'")
        return jsonify(json_serialize(pemesanan)), 200
    except Exception as e:
        print(f"❌ [PEMESANAN GET] ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/pemesanan/<pemesanan_id>', methods=['GET'])
def get_pemesanan_by_id(pemesanan_id):
    """Get pemesanan by ID"""
    try:
        try:
            pemesanan = db.pemesanan.find_one({'_id': ObjectId(pemesanan_id)})
        except:
            pemesanan = db.pemesanan.find_one({'id': int(pemesanan_id)}) or \
                       db.pemesanan.find_one({'idPembelian': pemesanan_id})
        
        if not pemesanan:
            return jsonify({'error': 'Pemesanan not found'}), 404
        
        return jsonify(json_serialize(pemesanan)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/pemesanan', methods=['POST'])
def create_pemesanan():
    """
    Create new pemesanan - HANYA PENCATATAN PERMINTAAN
    Endpoint ini TIDAK BOLEH mengurangi stok.
    Stok hanya dikurangi saat proses ordering dipanggil (/api/ordering/proses).
    """
    try:
        data = request.json
        
        base_required = ['idPembelian', 'namaPembeli', 'tipePemesanan', 'totalHarga', 'statusPemesanan']
        for field in base_required:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        kloter_norm, kloter_err = _normalize_pemesanan_kloter_from_body(data)
        use_kloter = kloter_norm is not None
        if use_kloter and kloter_err:
            return jsonify({'error': kloter_err}), 400
        if not use_kloter:
            legacy_req = ['tipeProduk', 'prosesPengolahan', 'jenisKopi', 'jumlahPesananKg', 'hargaPerKg']
            for field in legacy_req:
                if field not in data:
                    return jsonify({'error': f'Missing required field: {field}'}), 400
        
        tipe_pm = (data.get('tipePemesanan') or '').strip()
        if tipe_pm not in ('Lokal', 'International', 'E-commerce'):
            return jsonify({'error': 'tipePemesanan harus Lokal, International, atau E-commerce'}), 400

        status_bayar = (data.get('statusPembayaran') or 'Belum Lunas').strip()
        if status_bayar not in ('Lunas', 'Belum Lunas', 'Pembayaran Bertahap'):
            return jsonify({'error': 'statusPembayaran harus Lunas, Belum Lunas, atau Pembayaran Bertahap'}), 400
        
        if tipe_pm == 'International' and not data.get('negara'):
            return jsonify({'error': 'Negara wajib diisi untuk pemesanan International'}), 400

        biaya_pajak = float(data.get('biayaPajak') or 0)
        if biaya_pajak < 0:
            return jsonify({'error': 'Biaya pajak tidak boleh negatif'}), 400
        biaya_pengiriman = float(data.get('biayaPengiriman') or 0)
        if biaya_pengiriman < 0:
            return jsonify({'error': 'Biaya pengiriman tidak boleh negatif'}), 400

        if use_kloter:
            jumlah_total_kg = sum(float(i['jumlahPesananKg']) for i in kloter_norm)
            subtotal_barang = sum(float(i['subtotal']) for i in kloter_norm)
        else:
            if float(data['jumlahPesananKg']) <= 0:
                return jsonify({'error': 'Jumlah pesanan harus lebih dari 0'}), 400
            if float(data['hargaPerKg']) <= 0:
                return jsonify({'error': 'Harga per kg harus lebih dari 0'}), 400
            jumlah_total_kg = float(data['jumlahPesananKg'])
            subtotal_barang = jumlah_total_kg * float(data['hargaPerKg'])

        total_harga_received = float(data['totalHarga'])
        calculated_total = subtotal_barang + biaya_pajak + biaya_pengiriman

        if abs(total_harga_received - calculated_total) > 0.01:
            print(f"❌ [PEMESANAN CREATE] Total harga mismatch:")
            print(f"   Received: {total_harga_received}")
            print(f"   Calculated: {calculated_total}")
            return jsonify({
                'error': 'Total harga tidak sesuai dengan perhitungan (subtotal barang + pajak + pengiriman)',
                'received': total_harga_received,
                'calculated': calculated_total,
            }), 400
        
        existing = db.pemesanan.find_one({'idPembelian': data['idPembelian']})
        if existing:
            return jsonify({'error': 'ID Pembelian already exists'}), 400
        
        new_id = get_next_id('pemesanan')

        if use_kloter:
            first = kloter_norm[0]
            tipe_root = first['tipeProduk'] if len(kloter_norm) == 1 else 'Campuran'
            jk_root = first['jenisKopi'] if len(kloter_norm) == 1 else 'Campuran'
            pr_root = first['prosesPengolahan'] if len(kloter_norm) == 1 else 'Campuran'
            harga_avg = round(subtotal_barang / jumlah_total_kg, 4) if jumlah_total_kg > 0 else 0.0
            pemesanan_data = {
                'id': new_id,
                'idPembelian': data['idPembelian'],
                'namaPembeli': data['namaPembeli'],
                'tipePemesanan': tipe_pm,
                'negara': data.get('negara', '') if tipe_pm == 'International' else '',
                'kloter': kloter_norm,
                'tipeProduk': tipe_root,
                'jenisKopi': jk_root,
                'prosesPengolahan': pr_root,
                'jumlahPesananKg': jumlah_total_kg,
                'hargaPerKg': harga_avg,
                'biayaPajak': biaya_pajak,
                'biayaPengiriman': biaya_pengiriman,
                'totalHarga': float(data['totalHarga']),
                'statusPemesanan': data['statusPemesanan'],
                'statusPembayaran': status_bayar,
                'tanggalPemesanan': data.get('tanggalPemesanan', datetime.now().strftime('%Y-%m-%d')),
                'createdAt': datetime.now(),
                'updatedAt': datetime.now()
            }
        else:
            pemesanan_data = {
                'id': new_id,
                'idPembelian': data['idPembelian'],
                'namaPembeli': data['namaPembeli'],
                'tipePemesanan': tipe_pm,
                'negara': data.get('negara', '') if tipe_pm == 'International' else '',
                'tipeProduk': data['tipeProduk'],
                'prosesPengolahan': data['prosesPengolahan'],
                'jenisKopi': data['jenisKopi'],
                'jumlahPesananKg': float(data['jumlahPesananKg']),
                'hargaPerKg': float(data['hargaPerKg']),
                'biayaPajak': biaya_pajak,
                'biayaPengiriman': biaya_pengiriman,
                'totalHarga': float(data['totalHarga']),
                'statusPemesanan': data['statusPemesanan'],
                'statusPembayaran': status_bayar,
                'tanggalPemesanan': data.get('tanggalPemesanan', datetime.now().strftime('%Y-%m-%d')),
                'createdAt': datetime.now(),
                'updatedAt': datetime.now()
            }
        catatan_pm = (data.get('catatanPemesanan') or '').strip()
        if catatan_pm:
            pemesanan_data['catatanPemesanan'] = catatan_pm
        im = (data.get('idMasterPembeli') or '').strip()
        if im:
            pemesanan_data['idMasterPembeli'] = im
        kpb = (data.get('kontakPembeli') or '').strip()
        if kpb:
            pemesanan_data['kontakPembeli'] = kpb
        apb = (data.get('alamatPembeli') or '').strip()
        if apb:
            pemesanan_data['alamatPembeli'] = apb
        
        print(f"🔵 [PEMESANAN CREATE] Inserting to MongoDB collection 'pemesanan': {pemesanan_data}")
        result = db.pemesanan.insert_one(pemesanan_data)
        pemesanan_data['_id'] = result.inserted_id
        print(f"✅ [PEMESANAN CREATE] Successfully inserted! ID: {result.inserted_id}, Collection: pemesanan")
        return jsonify(json_serialize(pemesanan_data)), 201
    except Exception as e:
        print(f"❌ [PEMESANAN CREATE] ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/pemesanan/<pemesanan_id>', methods=['PUT'])
def update_pemesanan(pemesanan_id):
    """
    Update pemesanan - HANYA PENCATATAN PERMINTAAN
    Endpoint ini TIDAK BOLEH mengurangi stok.
    Untuk mengurangi stok, gunakan endpoint /api/ordering/proses.
    """
    try:
        data = request.json
        
        try:
            pemesanan = db.pemesanan.find_one({'_id': ObjectId(pemesanan_id)})
        except:
            pemesanan = db.pemesanan.find_one({'id': int(pemesanan_id)}) or \
                       db.pemesanan.find_one({'idPembelian': pemesanan_id})
        
        if not pemesanan:
            return jsonify({'error': 'Pemesanan not found'}), 404
        
        # Validasi: Jika pemesanan sudah Complete (sudah diproses ordering), tidak boleh diubah
        if pemesanan.get('statusPemesanan') == 'Complete':
            return jsonify({
                'error': 'Pemesanan yang sudah Complete tidak dapat diubah. Stok sudah dikurangi melalui proses ordering.'
            }), 400
        
        # Validate if updating idPembelian
        if 'idPembelian' in data:
            existing = db.pemesanan.find_one({
                'idPembelian': data['idPembelian'],
                '_id': {'$ne': pemesanan['_id']}
            })
            if existing:
                return jsonify({'error': 'ID Pembelian already exists'}), 400
        
        # Validate International requires negara
        tipe_pemesanan = data.get('tipePemesanan', pemesanan.get('tipePemesanan'))
        if tipe_pemesanan == 'International' and not data.get('negara') and not pemesanan.get('negara'):
            return jsonify({'error': 'Negara wajib diisi untuk pemesanan International'}), 400
        
        update_data = {}
        for field in ['idPembelian', 'namaPembeli', 'tipePemesanan', 'negara', 'tipeProduk',
                     'prosesPengolahan', 'jenisKopi', 'jumlahPesananKg', 'hargaPerKg',
                     'biayaPajak', 'biayaPengiriman', 'totalHarga', 'statusPemesanan', 'tanggalPemesanan', 'idMasterPembeli',
                     'kontakPembeli', 'alamatPembeli', 'statusPembayaran', 'catatanPemesanan']:
            if field in data:
                if field in ['jumlahPesananKg', 'hargaPerKg', 'totalHarga', 'biayaPajak', 'biayaPengiriman']:
                    if field in ('biayaPajak', 'biayaPengiriman'):
                        update_data[field] = float(data[field] or 0)
                    else:
                        update_data[field] = float(data[field])
                elif field == 'catatanPemesanan':
                    update_data[field] = (data[field] or '').strip()
                else:
                    update_data[field] = data[field]

        unset_legacy_items = False
        if 'kloter' in data or 'items' in data:
            kloter_norm, kloter_err = _normalize_pemesanan_kloter_from_body(data)
            if kloter_err:
                return jsonify({'error': kloter_err}), 400
            if not kloter_norm:
                return jsonify({'error': 'kloter kosong atau tidak valid'}), 400
            update_data['kloter'] = kloter_norm
            unset_legacy_items = True
            jum = sum(float(i['jumlahPesananKg']) for i in kloter_norm)
            subb = sum(float(i['subtotal']) for i in kloter_norm)
            first = kloter_norm[0]
            update_data['jumlahPesananKg'] = jum
            update_data['hargaPerKg'] = round(subb / jum, 4) if jum > 0 else 0.0
            update_data['tipeProduk'] = first['tipeProduk'] if len(kloter_norm) == 1 else 'Campuran'
            update_data['jenisKopi'] = first['jenisKopi'] if len(kloter_norm) == 1 else 'Campuran'
            update_data['prosesPengolahan'] = first['prosesPengolahan'] if len(kloter_norm) == 1 else 'Campuran'

        _total_keys = ('totalHarga', 'jumlahPesananKg', 'hargaPerKg', 'biayaPajak', 'biayaPengiriman', 'kloter', 'items')
        if any(k in update_data for k in _total_keys):
            if 'kloter' in update_data:
                sub_lines = sum(float(i.get('subtotal', 0) or 0) for i in update_data['kloter'])
            elif 'items' in update_data:
                sub_lines = sum(float(i.get('subtotal', 0) or 0) for i in update_data['items'])
            else:
                j = float(update_data.get('jumlahPesananKg', pemesanan.get('jumlahPesananKg', 0)))
                hk = float(update_data.get('hargaPerKg', pemesanan.get('hargaPerKg', 0)))
                sub_lines = j * hk
            pj = float(update_data.get('biayaPajak', pemesanan.get('biayaPajak', 0)) or 0)
            pg = float(update_data.get('biayaPengiriman', pemesanan.get('biayaPengiriman', 0)) or 0)
            th = float(update_data.get('totalHarga', pemesanan.get('totalHarga', 0)))
            if pj < 0:
                return jsonify({'error': 'Biaya pajak tidak boleh negatif'}), 400
            if pg < 0:
                return jsonify({'error': 'Biaya pengiriman tidak boleh negatif'}), 400
            expected = sub_lines + pj + pg
            if abs(th - expected) > 0.01:
                return jsonify({
                    'error': 'Total harga tidak sesuai (subtotal barang + pajak + pengiriman)',
                    'expected': expected,
                    'received': th,
                }), 400

        if 'statusPembayaran' in update_data:
            sb = (update_data.get('statusPembayaran') or '').strip()
            if sb not in ('Lunas', 'Belum Lunas', 'Pembayaran Bertahap'):
                return jsonify({'error': 'statusPembayaran tidak valid'}), 400
            update_data['statusPembayaran'] = sb
        
        if 'tipePemesanan' in update_data:
            tt = (update_data.get('tipePemesanan') or '').strip()
            if tt not in ('Lokal', 'International', 'E-commerce'):
                return jsonify({'error': 'tipePemesanan tidak valid'}), 400
            if tt != 'International':
                update_data['negara'] = ''
        
        # Validasi: Status tidak boleh diubah menjadi Complete dari endpoint ini
        # Complete hanya bisa dicapai melalui /api/ordering/proses
        if 'statusPemesanan' in update_data and update_data['statusPemesanan'] == 'Complete':
            # Cek apakah sudah ada ordering untuk pemesanan ini
            ordering = db.ordering.find_one({'idPembelian': pemesanan.get('idPembelian')})
            if not ordering:
                return jsonify({
                    'error': 'Status Complete hanya bisa dicapai melalui proses ordering. Gunakan endpoint /api/ordering/proses untuk mengurangi stok dan menyelesaikan pemesanan.'
                }), 400
            # Pemesanan selesai → pembayaran dianggap lunas
            update_data['statusPembayaran'] = 'Lunas'
        
        update_data['updatedAt'] = datetime.now()

        update_payload = {'$set': update_data}
        if unset_legacy_items:
            update_payload['$unset'] = {'items': ''}

        db.pemesanan.update_one(
            {'_id': pemesanan['_id']},
            update_payload
        )
        
        updated = db.pemesanan.find_one({'_id': pemesanan['_id']})
        return jsonify(json_serialize(updated)), 200
    except Exception as e:
        print(f"❌ [PEMESANAN UPDATE] ERROR: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/pemesanan/<pemesanan_id>', methods=['DELETE'])
def delete_pemesanan(pemesanan_id):
    """Delete pemesanan"""
    try:
        print(f"🗑️ [DELETE PEMESANAN] Attempting to delete: {pemesanan_id}")
        
        # Try multiple ways to find pemesanan
        pemesanan = None
        
        # 1. Try ObjectId first (if it's a valid ObjectId string)
        try:
            pemesanan = db.pemesanan.find_one({'_id': ObjectId(pemesanan_id)})
            if pemesanan:
                print(f"✅ [DELETE PEMESANAN] Found by ObjectId: {pemesanan_id}")
        except:
            pass
        
        # 2. Try idPembelian (string match - most common case)
        if not pemesanan:
            pemesanan = db.pemesanan.find_one({'idPembelian': pemesanan_id})
            if pemesanan:
                print(f"✅ [DELETE PEMESANAN] Found by idPembelian: {pemesanan_id}")
        
        # 3. Try id (integer) only if pemesanan_id is numeric
        if not pemesanan:
            try:
                id_int = int(pemesanan_id)
                pemesanan = db.pemesanan.find_one({'id': id_int})
                if pemesanan:
                    print(f"✅ [DELETE PEMESANAN] Found by id (int): {pemesanan_id}")
            except ValueError:
                # pemesanan_id is not numeric, skip this attempt
                pass
        
        if not pemesanan:
            print(f"❌ [DELETE PEMESANAN] Pemesanan not found: {pemesanan_id}")
            return jsonify({'error': 'Pemesanan not found'}), 404
        
        # Validasi: Tidak bisa delete jika status = "Complete"
        if pemesanan.get('statusPemesanan') == 'Complete':
            print(f"⚠️ [DELETE PEMESANAN] Cannot delete - status is Complete")
            return jsonify({'error': 'Tidak dapat menghapus pemesanan yang sudah Complete. Pemesanan sudah diproses dan stok sudah dikurangi.'}), 400
        
        # Check if there's ordering associated
        id_pembelian = pemesanan.get('idPembelian')
        ordering_count = db.ordering.count_documents({'idPembelian': id_pembelian})
        if ordering_count > 0:
            print(f"⚠️ [DELETE PEMESANAN] Cannot delete - has {ordering_count} ordering(s)")
            return jsonify({'error': 'Tidak dapat menghapus pemesanan yang sudah memiliki proses ordering'}), 400
        
        # Delete pemesanan
        result = db.pemesanan.delete_one({'_id': pemesanan['_id']})
        if result.deleted_count > 0:
            print(f"✅ [DELETE PEMESANAN] Successfully deleted: {pemesanan_id}")
            return jsonify({'success': True, 'message': 'Pemesanan deleted successfully'}), 200
        else:
            print(f"⚠️ [DELETE PEMESANAN] Delete operation returned 0 deleted count")
            return jsonify({'error': 'Failed to delete pemesanan'}), 500
            
    except Exception as e:
        print(f"❌ [DELETE PEMESANAN] ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# ==================== ORDERING ENDPOINTS ====================

@app.route('/api/ordering', methods=['GET'])
def get_ordering():
    """Get all ordering data"""
    try:
        ordering = list(db.ordering.find().sort('id', 1))
        print(f"📊 [ORDERING GET] Retrieved {len(ordering)} documents from MongoDB collection 'ordering'")
        return jsonify(json_serialize(ordering)), 200
    except Exception as e:
        print(f"❌ [ORDERING GET] ERROR: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/ordering/<ordering_id>', methods=['GET'])
def get_ordering_by_id(ordering_id):
    """Get ordering by ID"""
    try:
        try:
            ordering = db.ordering.find_one({'_id': ObjectId(ordering_id)})
        except:
            ordering = db.ordering.find_one({'id': int(ordering_id)})
        
        if not ordering:
            return jsonify({'error': 'Ordering not found'}), 404
        
        return jsonify(json_serialize(ordering)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/ordering/proses', methods=['POST'])
def proses_ordering():
    """
    PROSES ORDERING - SATU-SATUNYA ENDPOINT YANG MENGURANGI STOK
    Endpoint ini adalah titik eksekusi gudang yang mengurangi stok secara nyata.
    Tanpa idProduksi: stok diambil dari agregat Kelola Stok (tipe + jenis kopi + proses),
    dialokasikan FIFO ke batch pengemasan. Dengan idProduksi: perilaku lama per batch.
    """
    try:
        data = request.json or {}
        
        if 'idPembelian' not in data:
            return jsonify({'error': 'Missing required field: idPembelian'}), 400
        
        pemesanan = db.pemesanan.find_one({'idPembelian': data['idPembelian']})
        if not pemesanan:
            return jsonify({'error': 'Pemesanan not found'}), 404
        
        existing_ordering = db.ordering.find_one({'idPembelian': data['idPembelian']})
        if existing_ordering:
            return jsonify({'error': 'Pemesanan ini sudah diproses sebelumnya'}), 400

        line_items = pemesanan_items_from_doc(pemesanan)
        if not line_items:
            return jsonify({'error': 'Pemesanan tidak memiliki barang'}), 400

        tanggal_ordering = data.get('tanggalOrdering', datetime.now().strftime('%Y-%m-%d'))
        id_produksi_payload = data.get('idProduksi')
        use_single_batch = id_produksi_payload is not None and str(id_produksi_payload).strip() != ''

        tipe_from_req = (data.get('tipeProduk') or pemesanan.get('tipeProduk') or '').strip()
        if tipe_from_req in ('Green Beans', 'Pixel'):
            tipe_produk_selected = tipe_from_req
        elif line_items:
            tipe_produk_selected = (line_items[0].get('tipeProduk') or '').strip()
        else:
            tipe_produk_selected = ''
        if tipe_produk_selected not in ('Green Beans', 'Pixel'):
            return jsonify({'error': 'Tipe produk harus Green Beans atau Pixel'}), 400

        tipe_produk_pemesanan = (pemesanan.get('tipeProduk') or '').strip()
        multi_barang = len(line_items) > 1
        if not multi_barang and tipe_produk_pemesanan and tipe_produk_pemesanan not in ('Campuran',):
            if tipe_produk_selected != tipe_produk_pemesanan:
                return jsonify({
                    'error': 'Tipe produk tidak sesuai',
                    'tipeProdukStok': tipe_produk_selected,
                    'tipeProdukPemesanan': tipe_produk_pemesanan
                }), 400

        jumlah_pesanan_total = float(sum(float(x.get('jumlahPesananKg') or 0) for x in line_items))

        if use_single_batch:
            if len(line_items) != 1:
                return jsonify({
                    'error': 'Pemesanan beberapa barang tidak mendukung pemilihan satu id produksi. Kosongkan id produksi untuk alokasi otomatis (FIFO).'
                }), 400
            it0 = line_items[0]
            jumlah_pesanan = float(it0['jumlahPesananKg'])
            tipe_produk_selected = (it0.get('tipeProduk') or tipe_produk_selected).strip()
            if tipe_produk_selected not in ('Green Beans', 'Pixel'):
                return jsonify({'error': 'Tipe produk baris harus Green Beans atau Pixel'}), 400
            # --- Cabang lama: satu id produksi eksplisit ---
            produksi = db.produksi.find_one({'idProduksi': id_produksi_payload})
            if not produksi:
                return jsonify({'error': 'Produksi not found'}), 400
            
            if tipe_produk_selected == 'Green Beans':
                berat_produk = _stok_berat_green_effective_dari_produksi(produksi)
            else:
                berat_produk = float(produksi.get('beratPixel', 0) or 0)
            
            if berat_produk <= 0:
                return jsonify({'error': f'Produksi belum memiliki berat {tipe_produk_selected}'}), 400
            
            ids_prod = _id_bahan_list_from_produksi(produksi)
            jenis_set = set()
            bahan = None
            for bid in ids_prod:
                bh = db.bahan.find_one({'idBahan': bid})
                if bh:
                    jenis_set.add((bh.get('jenisKopi') or '').strip())
                    if bahan is None:
                        bahan = bh
            if not bahan:
                return jsonify({'error': 'Bahan tidak ditemukan untuk produksi ini'}), 404
            if len(jenis_set) > 1:
                return jsonify({'error': 'Produksi menggabungkan bahan dengan jenis kopi berbeda'}), 400
            
            proses_tampilan = _proses_pengolahan_tampilan_untuk_agregasi(produksi, bahan)
            ps_pem = (it0.get('prosesPengolahan') or '').strip()
            ps_raw = (produksi.get('prosesPengolahan') or '').strip()
            if ps_pem not in (ps_raw, proses_tampilan):
                return jsonify({
                    'error': 'Proses pengolahan tidak sesuai',
                    'prosesProduksi': ps_raw,
                    'prosesTampilan': proses_tampilan,
                    'prosesPemesanan': ps_pem
                }), 400
            
            if (bahan.get('jenisKopi') or '').strip() != (it0.get('jenisKopi') or '').strip():
                return jsonify({
                    'error': 'Jenis kopi tidak sesuai',
                    'jenisKopiProduksi': bahan.get('jenisKopi'),
                    'jenisKopiPemesanan': it0.get('jenisKopi')
                }), 400
            
            hasil_produksi_list = list(db.hasilProduksi.find({
                'idProduksi': id_produksi_payload,
                'tipeProduk': tipe_produk_selected,
                'isFromOrdering': True
            }))
            total_dari_ordering = sum(float(h.get('beratSaatIni', 0)) for h in hasil_produksi_list)
            stok_tersedia = max(0, berat_produk - total_dari_ordering)
            
            print(f"📦 [ORDERING PROSES] (per-batch) idProduksi={id_produksi_payload}, tipe={tipe_produk_selected}, stok_tersedia={stok_tersedia}, jumlah={jumlah_pesanan}")
            
            if stok_tersedia < jumlah_pesanan:
                return jsonify({
                    'error': 'Stok tidak mencukupi',
                    'stokTersedia': stok_tersedia,
                    'jumlahPesanan': jumlah_pesanan,
                    'kekurangan': jumlah_pesanan - stok_tersedia
                }), 400
            
            hasil_produksi_id = get_next_id('hasilProduksi')
            hasil_produksi_data = {
                'id': hasil_produksi_id,
                'idProduksi': str(id_produksi_payload).strip(),
                'idBahan': produksi.get('idBahan'),
                'tipeProduk': tipe_produk_selected,
                'kemasan': pemesanan.get('kemasan', ''),
                'jenisKopi': it0.get('jenisKopi'),
                'prosesPengolahan': it0.get('prosesPengolahan'),
                'levelRoasting': pemesanan.get('levelRoasting', ''),
                'tanggal': tanggal_ordering,
                'beratSaatIni': jumlah_pesanan,
                'jumlah': 0,
                'isFromOrdering': True,
                'idPembelian': data['idPembelian']
            }
            
            new_id = get_next_id('ordering')
            ordering_data = {
                'id': new_id,
                'idPembelian': data['idPembelian'],
                'idProduksi': id_produksi_payload,
                'tipeProduk': tipe_produk_selected,
                'jumlahPesananKg': jumlah_pesanan,
                'stokSebelum': stok_tersedia,
                'stokSesudah': stok_tersedia - jumlah_pesanan,
                'statusPemesanan': 'Complete',
                'tanggalOrdering': tanggal_ordering,
                'createdAt': datetime.now(),
                'updatedAt': datetime.now()
            }
            
            print(f"🔵 [ORDERING PROSES] Inserting ordering log: {ordering_data}")
            result_ordering = db.ordering.insert_one(ordering_data)
            ordering_data['_id'] = result_ordering.inserted_id
            
            print(f"🔵 [ORDERING PROSES] Inserting hasilProduksi: {hasil_produksi_data}")
            result_hasil = db.hasilProduksi.insert_one(hasil_produksi_data)
            hasil_produksi_data['_id'] = result_hasil.inserted_id
            
            db.pemesanan.update_one(
                {'idPembelian': data['idPembelian']},
                {'$set': {
                    'statusPemesanan': 'Complete',
                    'statusPembayaran': 'Lunas',
                    'updatedAt': datetime.now()
                }}
            )
            
            return jsonify({
                'success': True,
                'message': 'Ordering berhasil diproses, stok telah dikurangi',
                'ordering': json_serialize(ordering_data),
                'stokSebelum': stok_tersedia,
                'stokSesudah': stok_tersedia - jumlah_pesanan,
                'jumlahDikurangi': jumlah_pesanan
            }), 201
        
        # --- Cabang agregat: FIFO per baris (satu atau beberapa kombinasi tipe/jenis/proses) ---
        tipe_ordering_label = 'Campuran' if multi_barang else tipe_produk_selected
        stok_rows_all, _ = _compute_stok_hasil_aggregate('', '')
        stok_remaining_by_key = {}
        inserted_hasil_ids = []
        all_prod_ids_order = []
        first_stok_before = None
        last_stok_after = None

        try:
            for idx, it in enumerate(line_items):
                tipe_sel = (it.get('tipeProduk') or '').strip()
                if tipe_sel not in ('Green Beans', 'Pixel'):
                    raise ValueError(f'Baris {idx + 1}: tipeProduk harus Green Beans atau Pixel')
                jum_baris = float(it.get('jumlahPesananKg') or 0)
                if jum_baris <= 0:
                    raise ValueError(f'Baris {idx + 1}: jumlah (kg) tidak valid')
                jk_it = (it.get('jenisKopi') or '').strip()
                pr_it = (it.get('prosesPengolahan') or '').strip()
                if not jk_it or not pr_it:
                    raise ValueError(f'Baris {idx + 1}: jenis kopi dan proses wajib diisi')

                key_pem = _stok_key(tipe_sel, jk_it, pr_it)
                if key_pem not in stok_remaining_by_key:
                    stok_tersedia = 0.0
                    for r in stok_rows_all:
                        rk = _stok_key(r.get('tipeProduk'), r.get('jenisKopi'), r.get('prosesPengolahan'))
                        if rk == key_pem:
                            stok_tersedia = float(r.get('totalBerat', 0) or 0)
                            break
                    stok_remaining_by_key[key_pem] = stok_tersedia
                stok_tersedia = stok_remaining_by_key[key_pem]

                if idx == 0:
                    first_stok_before = stok_tersedia

                if stok_tersedia < jum_baris - 1e-9:
                    raise ValueError(
                        f'Baris {idx + 1}: stok tidak mencukupi (tersedia {stok_tersedia:g} kg, butuh {jum_baris:g} kg)'
                    )

                try:
                    allocations = _fifo_allocate_ordering_batches(
                        pemesanan, tipe_sel, jum_baris,
                        jenis_kopi_override=jk_it,
                        proses_pengolahan_override=pr_it,
                    )
                except RuntimeError as re:
                    raise ValueError(f'Baris {idx + 1}: {str(re)}') from re

                if not allocations:
                    raise ValueError(f'Baris {idx + 1}: tidak ada batch pengemasan yang cocok')

                for produksi, kg in allocations:
                    hasil_produksi_id = get_next_id('hasilProduksi')
                    hasil_produksi_data = {
                        'id': hasil_produksi_id,
                        'idProduksi': str(produksi.get('idProduksi') or '').strip(),
                        'idBahan': produksi.get('idBahan'),
                        'tipeProduk': tipe_sel,
                        'kemasan': pemesanan.get('kemasan', ''),
                        'jenisKopi': jk_it,
                        'prosesPengolahan': pr_it,
                        'levelRoasting': pemesanan.get('levelRoasting', ''),
                        'tanggal': tanggal_ordering,
                        'beratSaatIni': float(kg),
                        'jumlah': 0,
                        'isFromOrdering': True,
                        'idPembelian': data['idPembelian'],
                    }
                    ins = db.hasilProduksi.insert_one(hasil_produksi_data)
                    inserted_hasil_ids.append(ins.inserted_id)
                    ip = str(produksi.get('idProduksi') or '').strip()
                    if ip:
                        all_prod_ids_order.append(ip)

                stok_remaining_by_key[key_pem] = stok_tersedia - jum_baris
                last_stok_after = stok_remaining_by_key[key_pem]

            id_produksi_gabung = ','.join(dict.fromkeys(all_prod_ids_order))
            new_id = get_next_id('ordering')
            ordering_data = {
                'id': new_id,
                'idPembelian': data['idPembelian'],
                'idProduksi': id_produksi_gabung,
                'tipeProduk': tipe_ordering_label,
                'jumlahPesananKg': jumlah_pesanan_total,
                'kloterRingkasan': line_items,
                'stokSebelum': first_stok_before if first_stok_before is not None else 0.0,
                'stokSesudah': last_stok_after if last_stok_after is not None else 0.0,
                'statusPemesanan': 'Complete',
                'tanggalOrdering': tanggal_ordering,
                'createdAt': datetime.now(),
                'updatedAt': datetime.now(),
            }

            print(f"🔵 [ORDERING PROSES] Inserting ordering (FIFO multi-baris): {ordering_data}")
            result_ordering = db.ordering.insert_one(ordering_data)
            ordering_data['_id'] = result_ordering.inserted_id

            db.pemesanan.update_one(
                {'idPembelian': data['idPembelian']},
                {'$set': {
                    'statusPemesanan': 'Complete',
                    'statusPembayaran': 'Lunas',
                    'updatedAt': datetime.now(),
                }},
            )

            return jsonify({
                'success': True,
                'message': 'Ordering berhasil diproses, stok telah dikurangi (semua barang)',
                'ordering': json_serialize(ordering_data),
                'stokSebelum': first_stok_before,
                'stokSesudah': last_stok_after,
                'jumlahDikurangi': jumlah_pesanan_total,
                'idProduksiAlokasi': id_produksi_gabung,
            }), 201

        except ValueError as ve:
            if inserted_hasil_ids:
                db.hasilProduksi.delete_many({'_id': {'$in': inserted_hasil_ids}})
            return jsonify({'error': str(ve)}), 400
        except Exception:
            if inserted_hasil_ids:
                db.hasilProduksi.delete_many({'_id': {'$in': inserted_hasil_ids}})
            raise
        
    except Exception as e:
        print(f"❌ [ORDERING PROSES] ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/ordering', methods=['POST'])
def create_ordering():
    """
    DEPRECATED: Gunakan /api/ordering/proses untuk proses ordering yang mengurangi stok.
    Endpoint ini tetap ada untuk backward compatibility tapi akan redirect ke proses_ordering.
    """
    return proses_ordering()

@app.route('/api/ordering/<ordering_id>', methods=['PUT'])
def update_ordering(ordering_id):
    """Update ordering"""
    try:
        data = request.json
        
        try:
            ordering = db.ordering.find_one({'_id': ObjectId(ordering_id)})
        except:
            ordering = db.ordering.find_one({'id': int(ordering_id)})
        
        if not ordering:
            return jsonify({'error': 'Ordering not found'}), 404
        
        update_data = {}
        for field in ['statusPemesanan', 'tanggalOrdering']:
            if field in data:
                update_data[field] = data[field]
        
        update_data['updatedAt'] = datetime.now()
        
        db.ordering.update_one(
            {'_id': ordering['_id']},
            {'$set': update_data}
        )
        
        # Update pemesanan status if changed
        if 'statusPemesanan' in update_data:
            new_status = update_data['statusPemesanan']
            old_status = ordering.get('statusPemesanan', '')
            
            # Jika status berubah menjadi "Complete", pastikan stok sudah dikurangi
            if new_status == 'Complete' and old_status != 'Complete':
                # Validasi: Pastikan hasilProduksi dengan isFromOrdering sudah dibuat
                hasil_produksi_ordering = db.hasilProduksi.find_one({
                    'idProduksi': ordering['idProduksi'],
                    'idPembelian': ordering['idPembelian'],
                    'isFromOrdering': True
                })
                
                if not hasil_produksi_ordering:
                    # Jika belum ada, buat hasilProduksi record untuk tracking pengurangan stok
                    print(f"⚠️ [ORDERING UPDATE] HasilProduksi dari ordering belum ditemukan, membuat baru...")
                    produksi = db.produksi.find_one({'idProduksi': ordering['idProduksi']})
                    pemesanan = db.pemesanan.find_one({'idPembelian': ordering['idPembelian']})
                    
                    if produksi and pemesanan:
                        hasil_produksi_id = get_next_id('hasilProduksi')
                        hasil_produksi_data = {
                            'id': hasil_produksi_id,
                            'idProduksi': ordering['idProduksi'],
                            'idBahan': produksi.get('idBahan'),
                            'tipeProduk': pemesanan.get('tipeProduk'),
                            'kemasan': pemesanan.get('kemasan', ''),
                            'jenisKopi': pemesanan.get('jenisKopi'),
                            'prosesPengolahan': pemesanan.get('prosesPengolahan'),
                            'levelRoasting': pemesanan.get('levelRoasting', ''),
                            'tanggal': ordering.get('tanggalOrdering', datetime.now().strftime('%Y-%m-%d')),
                            'beratSaatIni': ordering.get('jumlahPesananKg', 0),
                            'jumlah': 0,
                            'isFromOrdering': True,
                            'idPembelian': ordering['idPembelian']
                        }
                        db.hasilProduksi.insert_one(hasil_produksi_data)
                        print(f"✅ [ORDERING UPDATE] Created hasilProduksi record for Complete status")
            
            # Update pemesanan status
            pem_set = {
                'statusPemesanan': new_status,
                'updatedAt': datetime.now(),
            }
            if new_status == 'Complete':
                pem_set['statusPembayaran'] = 'Lunas'
            db.pemesanan.update_one(
                {'idPembelian': ordering['idPembelian']},
                {'$set': pem_set}
            )
            print(f"✅ [ORDERING UPDATE] Updated pemesanan status to: {new_status}")
        
        updated = db.ordering.find_one({'_id': ordering['_id']})
        return jsonify(json_serialize(updated)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/ordering/<ordering_id>', methods=['DELETE'])
def delete_ordering(ordering_id):
    """Delete ordering - Reverse stock reduction"""
    try:
        try:
            ordering = db.ordering.find_one({'_id': ObjectId(ordering_id)})
        except:
            ordering = db.ordering.find_one({'id': int(ordering_id)})
        
        if not ordering:
            return jsonify({'error': 'Ordering not found'}), 404
        
        # Hapus semua hasilProduksi ordering untuk pembelian ini (bisa beberapa batch FIFO)
        del_res = db.hasilProduksi.delete_many({
            'idPembelian': ordering.get('idPembelian'),
            'isFromOrdering': True,
        })
        print(f"🗑️ [ORDERING DELETE] Removed {del_res.deleted_count} hasilProduksi (ordering) rows")
        
        # Delete ordering
        db.ordering.delete_one({'_id': ordering['_id']})
        
        # Revert pemesanan status to Ordering
        db.pemesanan.update_one(
            {'idPembelian': ordering['idPembelian']},
            {'$set': {
                'statusPemesanan': 'Ordering',
                'updatedAt': datetime.now()
            }}
        )
        
        return jsonify({'success': True, 'message': 'Ordering deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/pemesanan/stok', methods=['GET'])
def get_stok_for_pemesanan():
    """
    Stok untuk halaman pemesanan: sama dengan agregasi GET /api/stok (Kelola Stok),
    per kombinasi tipe produk + jenis kopi + proses pengolahan — bukan per id produksi.
    """
    try:
        print(f"🔵 [STOK PEMESANAN] GET /api/pemesanan/stok - Request received")
        
        if db is None:
            print(f"❌ [STOK PEMESANAN] Database connection not available")
            return jsonify({'error': 'Database connection not available', 'success': False}), 500
        
        rows, _ = _compute_stok_hasil_aggregate('', '')
        stok_list = []
        for r in rows:
            tb = float(r.get('totalBerat', 0) or 0)
            stok_list.append({
                'tipeProduk': r.get('tipeProduk', ''),
                'jenisKopi': r.get('jenisKopi', ''),
                'prosesPengolahan': r.get('prosesPengolahan', ''),
                'totalBerat': tb,
                'stokTersedia': tb,
            })
        
        print(f"✅ [STOK PEMESANAN] Returning {len(stok_list)} aggregated stok rows (selaras /api/stok)")
        return jsonify(json_serialize(stok_list)), 200
    except Exception as e:
        print(f"❌ [STOK PEMESANAN] ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': str(e),
            'success': False,
            'data': []
        }), 500

import os

if __name__ == "__main__":
    # Railway akan otomatis mengisi variabel PORT ini
    port_raw = (
        os.environ.get("PORT")
        or os.environ.get("RAILWAY_HTTP_PORT")
        or os.environ.get("RAILWAY_TCP_PORT")
        or "8080"
    )
    port = int(port_raw)
    app.run(host='0.0.0.0', port=port)