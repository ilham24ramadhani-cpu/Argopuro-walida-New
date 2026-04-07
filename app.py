from flask import Flask, render_template, request, jsonify, redirect, url_for, make_response, session, send_from_directory  # pyright: ignore[reportMissingImports]
from flask_cors import CORS  # pyright: ignore[reportMissingModuleSource]
from pymongo import MongoClient  # pyright: ignore[reportMissingImports]
import os
from os.path import join, dirname, exists
from dotenv import load_dotenv  # pyright: ignore[reportMissingImports]
from bson import ObjectId  # pyright: ignore[reportMissingImports]
import jwt  # pyright: ignore[reportMissingImports]
import hashlib
from datetime import datetime, timedelta
from urllib.parse import quote_plus
import base64

app = Flask(__name__)
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
    Validasi bahwa tahapan produksi dijalankan secara berurutan sesuai konfigurasi master.
    
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
        
        # Mapping tahapan untuk validasi
        tahapan_map = {
            'Sortasi Cherry atau Buah Kopi': 'Sortasi',
            'Sortasi Buah': 'Sortasi',  # Kompatibilitas nama lama
            'Fermentasi': 'Fermentasi',
            'Pulping': 'Pulping',
            'Pencucian': 'Pencucian',
            'Pengeringan Awal': 'Pengeringan Awal',
            'Pengeringan Akhir': 'Pengeringan Akhir',
            'Pengupasan Kulit Tanduk (Hulling)': 'Hulling',
            'Hand Sortasi atau Sortasi Biji Kopi': 'Hand Sortasi',
            'Roasting': 'Roasting',  # legacy (data lama)
            'Grinding': 'Grinding',
            'Pengemasan': 'Pengemasan'
        }
        
        # Daftar urutan tahapan (sesuai urutan logis)
        # Sortasi → Fermentasi → Pulping → Pencucian → … → Hand Sortasi → Grinding → Pengemasan (Roasting tidak dipakai di master baru)
        urutan_tahapan = ['Sortasi', 'Fermentasi', 'Pulping', 'Pencucian', 'Pengeringan Awal', 'Pengeringan Akhir', 'Hulling', 'Hand Sortasi', 'Grinding', 'Pengemasan']
        
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
                
                # Validasi: tahapan baru harus setelah tahapan lama (tidak boleh mundur atau sama)
                if index_baru <= index_lama:
                    return False, f'Tidak dapat mengubah tahapan dari "{status_tahapan_lama}" ke "{status_tahapan_baru}". Tahapan harus dijalankan secara berurutan.'
                
                # Validasi: tidak boleh loncat tahapan
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


def _all_id_bahan_terpakai_produksi(exclude_id_produksi_str=None):
    """Kumpulan id bahan yang sudah terikat ke dokumen produksi (satu id hanya satu produksi)."""
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
            
            # Cek apakah tahapan sebelumnya adalah Pengeringan Awal
            status_lama = produksi_lama.get('statusTahapan', '')
            if 'Pengeringan Awal' not in status_lama:
                return False, 'Pengeringan Akhir hanya dapat dipilih jika tahapan sebelumnya adalah Pengeringan Awal'
            
            # Cari kadar air dan berat terkini dari tahapan Pengeringan Awal (bisa dari history atau data saat ini)
            kadar_air_awal = None
            berat_terkini_awal = None
            
            # Cek dari history untuk menemukan entry Pengeringan Awal
            history = produksi_lama.get('historyTahapan', [])
            for entry in reversed(history):  # Cari dari yang terbaru
                if 'Pengeringan Awal' in str(entry.get('statusTahapan', '')) or 'Pengeringan Awal' in str(entry.get('namaTahapan', '')):
                    kadar_air_awal = entry.get('kadarAir')
                    berat_terkini_awal = entry.get('beratTerkini')
                    break
            
            # Jika tidak ditemukan di history, gunakan data saat ini jika status saat ini adalah Pengeringan Awal
            if kadar_air_awal is None and 'Pengeringan Awal' in status_lama:
                kadar_air_awal = produksi_lama.get('kadarAir')
                berat_terkini_awal = produksi_lama.get('beratTerkini')
            
            # Validasi kadar air Pengeringan Akhir harus lebih kecil dari Pengeringan Awal
            if kadar_air_awal is not None:
                if kadar_air_baru >= kadar_air_awal:
                    return False, f'Kadar air Pengeringan Akhir ({kadar_air_baru}%) harus lebih kecil dari kadar air Pengeringan Awal ({kadar_air_awal}%)'
            
            # Validasi berat terkini Pengeringan Akhir ≤ berat terkini Pengeringan Awal
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
        overlap = used_globally.intersection(set(id_bahan_list))
        if overlap:
            return jsonify({
                'error': 'ID bahan berikut sudah terpakai di produksi lain',
                'idBahanTerpakai': sorted(overlap),
            }), 400
        
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
        
        # Validasi per bahan: proses terdaftar + sisa cukup
        for bid in id_bahan_list:
            bahan_one = db.bahan.find_one({'idBahan': bid})
            if not bahan_one:
                return jsonify({'error': f'Bahan tidak ditemukan: {bid}'}), 400
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
        
        if isPengemasan:
            # Saat Pengemasan: gunakan nilai dari data lama jika tidak ada di request
            if not beratTerkini or beratTerkini <= 0:
                # Ambil dari produksi lama (nilai terakhir sebelum pengemasan)
                beratTerkini = produksi.get('beratTerkini') or produksi.get('beratAwal') or 0
                if beratTerkini <= 0:
                    return jsonify({'error': 'Berat terkini tidak valid. Pastikan produksi sudah memiliki berat terkini sebelum masuk tahap Pengemasan'}), 400
        else:
            # Untuk tahapan lain: wajib diisi
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
        
        db.produksi.update_one(
            {'_id': produksi['_id']},
            {'$set': update_data}
        )
        
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
    """Hitung sisa stok produksi: berat akhir - total yang sudah dipakai untuk ordering (isFromOrdering)"""
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
        total_dari_ordering = sum(
            float(h.get('beratSaatIni', 0))
            for h in hasil_list
            if h.get('isFromOrdering') in (True, 'true', 1)
        )
        sisa_tersedia = max(0, berat_akhir - total_dari_ordering)
        
        return jsonify({
            'idProduksi': produksi.get('idProduksi'),
            'beratAkhir': berat_akhir,
            'totalDariOrdering': total_dari_ordering,
            'sisaTersedia': sisa_tersedia
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
    Bahan yang boleh dipilih untuk produksi baru: punya proses yang diminta,
    belum terikat produksi manapun (kecuali idProduksi= untuk edit dokumen ini),
    dan sisa > 0 untuk jalur proses tersebut.
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
            if not bid or bid in terpakai:
                continue
            lines = bahan.get('prosesBahan') or []
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


@app.route('/api/stok', methods=['GET'])
def get_stok():
    """
    Stok dari produksi tahap Pengemasan: beratGreenBeans / beratPixel (tidak melebihi berat akhir),
    hanya batch dengan tanggal pengemasan tercatat. Kurangi pemesanan by berat.
    Query: tipeProduk (Green Beans/Pixel), tanggalPengemasan (YYYY-MM-DD) untuk filter.
    """
    try:
        tipe_filter = request.args.get('tipeProduk', '').strip()
        tanggal_filter = request.args.get('tanggalPengemasan', '').strip()
        
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
            
            # Aggregate Green Beans
            berat_green_beans = float(p.get('beratGreenBeans', 0) or 0)
            if berat_green_beans > 0:
                if not tipe_filter or tipe_filter == 'Green Beans':
                    key_gb = _stok_key('Green Beans', jenis_kopi, proses_pengolahan)
                    if key_gb not in stok_map:
                        stok_map[key_gb] = {
                            'tipeProduk': 'Green Beans',
                            'jenisKopi': jenis_kopi,
                            'prosesPengolahan': proses_pengolahan,
                            'totalBerat': 0,
                        }
                    stok_map[key_gb]['totalBerat'] += berat_green_beans
            
            # Aggregate Pixel (jika ada)
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
                print(f"⚠️ [STOK GET] Key ordering tidak ada di stok_map (pengurangan {berat_kurangi} kg dilewati): {key}")
        
        stok_array = [v for v in stok_map.values() if v['totalBerat'] > 0]
        stok_array.sort(key=lambda x: (x['tipeProduk'], x['jenisKopi']))

        s_ba = sum(float(p.get('beratAkhir') or 0) for p in produksi_list)
        s_gb = sum(float(p.get('beratGreenBeans') or 0) for p in produksi_list)
        s_px = sum(float(p.get('beratPixel') or 0) for p in produksi_list)
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
            'sumBeratGreenBeansBruto': round(s_gb, 4),
            'sumBeratPixelBruto': round(s_px, 4),
            'selisihBeratAkhirVsGbPx': round(s_ba - s_gb - s_px, 4),
            'totalStokGreenBeansSetelahOrdering': round(tot_gb_stok, 4),
            'totalStokPixelSetelahOrdering': round(tot_px_stok, 4),
        }
        
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
        if 'nama' in data:
            update_data['nama'] = data['nama']
        if 'tahapanStatus' in data:
            update_data['tahapanStatus'] = data['tahapanStatus']
        
        db.dataProses.update_one(
            {'_id': item['_id']},
            {'$set': update_data}
        )
        
        updated = db.dataProses.find_one({'_id': item['_id']})
        return jsonify(json_serialize(updated)), 200
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
        
        # Validate required fields
        required_fields = ['idPembelian', 'namaPembeli', 'tipePemesanan', 'tipeProduk', 
                          'prosesPengolahan', 'jenisKopi', 'jumlahPesananKg', 
                          'hargaPerKg', 'totalHarga', 'statusPemesanan']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Validate International requires negara
        if data['tipePemesanan'] == 'International' and not data.get('negara'):
            return jsonify({'error': 'Negara wajib diisi untuk pemesanan International'}), 400
        
        # Validate harga and jumlah > 0
        if float(data['jumlahPesananKg']) <= 0:
            return jsonify({'error': 'Jumlah pesanan harus lebih dari 0'}), 400
        if float(data['hargaPerKg']) <= 0:
            return jsonify({'error': 'Harga per kg harus lebih dari 0'}), 400
        
        # Validate totalHarga calculation
        jumlah_pesanan = float(data['jumlahPesananKg'])
        harga_per_kg = float(data['hargaPerKg'])
        total_harga_received = float(data['totalHarga'])
        calculated_total = jumlah_pesanan * harga_per_kg
        
        # Allow small floating point differences (0.01)
        if abs(total_harga_received - calculated_total) > 0.01:
            print(f"❌ [PEMESANAN CREATE] Total harga mismatch:")
            print(f"   Received: {total_harga_received}")
            print(f"   Calculated: {calculated_total}")
            print(f"   Difference: {abs(total_harga_received - calculated_total)}")
            return jsonify({
                'error': 'Total harga tidak sesuai dengan perhitungan',
                'received': total_harga_received,
                'calculated': calculated_total,
                'difference': abs(total_harga_received - calculated_total)
            }), 400
        
        # Check if idPembelian already exists
        existing = db.pemesanan.find_one({'idPembelian': data['idPembelian']})
        if existing:
            return jsonify({'error': 'ID Pembelian already exists'}), 400
        
        new_id = get_next_id('pemesanan')
        
        pemesanan_data = {
            'id': new_id,
            'idPembelian': data['idPembelian'],
            'namaPembeli': data['namaPembeli'],
            'tipePemesanan': data['tipePemesanan'],
            'negara': data.get('negara', '') if data['tipePemesanan'] == 'International' else '',
            'tipeProduk': data['tipeProduk'],
            'prosesPengolahan': data['prosesPengolahan'],
            'jenisKopi': data['jenisKopi'],
            'jumlahPesananKg': float(data['jumlahPesananKg']),
            'hargaPerKg': float(data['hargaPerKg']),
            'totalHarga': float(data['totalHarga']),
            'statusPemesanan': data['statusPemesanan'],
            'tanggalPemesanan': data.get('tanggalPemesanan', datetime.now().strftime('%Y-%m-%d')),
            'createdAt': datetime.now(),
            'updatedAt': datetime.now()
        }
        
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
                     'totalHarga', 'statusPemesanan', 'tanggalPemesanan']:
            if field in data:
                if field in ['jumlahPesananKg', 'hargaPerKg', 'totalHarga']:
                    update_data[field] = float(data[field])
                else:
                    update_data[field] = data[field]
        
        # Validasi: Status tidak boleh diubah menjadi Complete dari endpoint ini
        # Complete hanya bisa dicapai melalui /api/ordering/proses
        if 'statusPemesanan' in update_data and update_data['statusPemesanan'] == 'Complete':
            # Cek apakah sudah ada ordering untuk pemesanan ini
            ordering = db.ordering.find_one({'idPembelian': pemesanan.get('idPembelian')})
            if not ordering:
                return jsonify({
                    'error': 'Status Complete hanya bisa dicapai melalui proses ordering. Gunakan endpoint /api/ordering/proses untuk mengurangi stok dan menyelesaikan pemesanan.'
                }), 400
        
        update_data['updatedAt'] = datetime.now()
        
        db.pemesanan.update_one(
            {'_id': pemesanan['_id']},
            {'$set': update_data}
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
    """
    try:
        data = request.json
        
        # Validate required fields
        required_fields = ['idPembelian', 'idProduksi', 'tipeProduk']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        tipe_produk_selected = data['tipeProduk']
        if tipe_produk_selected not in ['Green Beans', 'Pixel']:
            return jsonify({'error': 'Tipe produk harus Green Beans atau Pixel'}), 400
        
        # 1. Ambil data pemesanan berdasarkan ID Pembelian
        pemesanan = db.pemesanan.find_one({'idPembelian': data['idPembelian']})
        if not pemesanan:
            return jsonify({'error': 'Pemesanan not found'}), 404
        
        # Cek apakah pemesanan sudah diproses (sudah ada ordering)
        existing_ordering = db.ordering.find_one({'idPembelian': data['idPembelian']})
        if existing_ordering:
            return jsonify({'error': 'Pemesanan ini sudah diproses sebelumnya'}), 400
        
        # Validasi tipeProduk dari stok sama dengan tipeProduk dari pemesanan
        tipe_produk_pemesanan = pemesanan.get('tipeProduk', '')
        if tipe_produk_pemesanan and tipe_produk_selected != tipe_produk_pemesanan:
            return jsonify({
                'error': 'Tipe produk tidak sesuai',
                'tipeProdukStok': tipe_produk_selected,
                'tipeProdukPemesanan': tipe_produk_pemesanan
            }), 400
        
        # 2. Ambil data produksi berdasarkan ID Produksi
        produksi = db.produksi.find_one({'idProduksi': data['idProduksi']})
        if not produksi:
            return jsonify({'error': 'Produksi not found'}), 404
        
        # Validasi produksi memiliki berat untuk tipe produk yang dipilih
        if tipe_produk_selected == 'Green Beans':
            berat_produk = float(produksi.get('beratGreenBeans', 0) or 0)
        else:
            berat_produk = float(produksi.get('beratPixel', 0) or 0)
        
        if berat_produk <= 0:
            return jsonify({'error': f'Produksi belum memiliki berat {tipe_produk_selected}'}), 400
        
        # 3–4. Bahan pertama + jenis kopi + proses (raw vs tampilan master bahan, selaras /api/stok)
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
        ps_pem = (pemesanan.get('prosesPengolahan') or '').strip()
        ps_raw = (produksi.get('prosesPengolahan') or '').strip()
        if ps_pem not in (ps_raw, proses_tampilan):
            return jsonify({
                'error': 'Proses pengolahan tidak sesuai',
                'prosesProduksi': ps_raw,
                'prosesTampilan': proses_tampilan,
                'prosesPemesanan': ps_pem
            }), 400
        
        if bahan.get('jenisKopi') != pemesanan.get('jenisKopi'):
            return jsonify({
                'error': 'Jenis kopi tidak sesuai',
                'jenisKopiProduksi': bahan.get('jenisKopi'),
                'jenisKopiPemesanan': pemesanan.get('jenisKopi')
            }), 400
        
        # 5. VALIDASI: stok_produksi >= jumlah_pemesanan
        jumlah_pesanan = float(pemesanan['jumlahPesananKg'])
        
        # KONSEP: Stok tersedia = berat produk (per tipe) - total hasil produksi dari ordering (per tipe)
        # (hasil produksi dari ordering mengurangi stok)
        hasil_produksi_list = list(db.hasilProduksi.find({
            'idProduksi': data['idProduksi'],
            'tipeProduk': tipe_produk_selected,
            'isFromOrdering': True
        }))
        total_dari_ordering = sum(
            float(h.get('beratSaatIni', 0)) 
            for h in hasil_produksi_list
        )
        stok_tersedia = max(0, berat_produk - total_dari_ordering)
        
        print(f"📦 [ORDERING PROSES] idProduksi={data['idProduksi']}, tipeProduk={tipe_produk_selected}, berat_produk={berat_produk}, total_dari_ordering={total_dari_ordering}, stok_tersedia={stok_tersedia}, jumlah_pesanan={jumlah_pesanan}")
        
        # JIKA stok kurang → return error (400)
        if stok_tersedia < jumlah_pesanan:
            return jsonify({
                'error': 'Stok tidak mencukupi',
                'stokTersedia': stok_tersedia,
                'jumlahPesanan': jumlah_pesanan,
                'kekurangan': jumlah_pesanan - stok_tersedia
            }), 400
        
        # 5a. VALIDASI STOK PRODUKSI SUDAH CUKUP (tidak ada validasi kemasan lagi)
        
        # 6. JIKA valid: Kurangi stok by berat (insert hasilProduksi isFromOrdering → stok ter-update)
        hasil_produksi_id = get_next_id('hasilProduksi')
        hasil_produksi_data = {
            'id': hasil_produksi_id,
            'idProduksi': str(data['idProduksi']).strip(),
            'idBahan': produksi.get('idBahan'),
            'tipeProduk': tipe_produk_selected,
            'kemasan': pemesanan.get('kemasan', ''),
            'jenisKopi': pemesanan.get('jenisKopi'),
            'prosesPengolahan': pemesanan.get('prosesPengolahan'),
            'levelRoasting': pemesanan.get('levelRoasting', ''),
            'tanggal': data.get('tanggalOrdering', datetime.now().strftime('%Y-%m-%d')),
            'beratSaatIni': jumlah_pesanan,
            'jumlah': 0,
            'isFromOrdering': True,
            'idPembelian': data['idPembelian']
        }
        
        # 7. Simpan log transaksi ke koleksi ordering
        new_id = get_next_id('ordering')
        ordering_data = {
            'id': new_id,
            'idPembelian': data['idPembelian'],
            'idProduksi': data['idProduksi'],
            'tipeProduk': tipe_produk_selected,
            'jumlahPesananKg': jumlah_pesanan,
            'stokSebelum': stok_tersedia,
            'stokSesudah': stok_tersedia - jumlah_pesanan,
            'statusPemesanan': 'Complete',  # Set status menjadi Complete saat diproses
            'tanggalOrdering': data.get('tanggalOrdering', datetime.now().strftime('%Y-%m-%d')),
            'createdAt': datetime.now(),
            'updatedAt': datetime.now()
        }
        
        # Atomic operation: Insert ordering dan hasilProduksi dalam satu transaksi
        print(f"🔵 [ORDERING PROSES] Inserting ordering log: {ordering_data}")
        result_ordering = db.ordering.insert_one(ordering_data)
        ordering_data['_id'] = result_ordering.inserted_id
        
        print(f"🔵 [ORDERING PROSES] Inserting hasilProduksi untuk mengurangi stok: {hasil_produksi_data}")
        result_hasil = db.hasilProduksi.insert_one(hasil_produksi_data)
        hasil_produksi_data['_id'] = result_hasil.inserted_id
        
        # 8. Update status pemesanan menjadi "Complete"
        db.pemesanan.update_one(
            {'idPembelian': data['idPembelian']},
            {'$set': {
                'statusPemesanan': 'Complete',
                'updatedAt': datetime.now()
            }}
        )
        
        print(f"✅ [ORDERING PROSES] Stok berhasil dikurangi! Stok sebelum: {stok_tersedia} kg, Stok sesudah: {stok_tersedia - jumlah_pesanan} kg")
        return jsonify({
            'success': True,
            'message': 'Ordering berhasil diproses, stok telah dikurangi',
            'ordering': json_serialize(ordering_data),
            'stokSebelum': stok_tersedia,
            'stokSesudah': stok_tersedia - jumlah_pesanan,
            'jumlahDikurangi': jumlah_pesanan
        }), 201
        
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
            db.pemesanan.update_one(
                {'idPembelian': ordering['idPembelian']},
                {'$set': {
                    'statusPemesanan': new_status,
                    'updatedAt': datetime.now()
                }}
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
        
        # Find and delete associated hasilProduksi
        hasil_produksi = db.hasilProduksi.find_one({
            'idPembelian': ordering.get('idPembelian'),
            'isFromOrdering': True
        })
        
        if hasil_produksi:
            db.hasilProduksi.delete_one({'_id': hasil_produksi['_id']})
        
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
    """Get stok available for pemesanan (produksi with beratGreenBeans dan beratPixel)"""
    try:
        print(f"🔵 [STOK PEMESANAN] GET /api/pemesanan/stok - Request received")
        
        # Validate database connection
        if db is None:
            print(f"❌ [STOK PEMESANAN] Database connection not available")
            return jsonify({'error': 'Database connection not available', 'success': False}), 500
        
        # Get all produksi with Pengemasan status
        try:
            produksi_list = list(db.produksi.find({
                'statusTahapan': {'$regex': 'Pengemasan', '$options': 'i'}
            }))
            print(f"📊 [STOK PEMESANAN] Found {len(produksi_list)} produksi with Pengemasan status")
        except Exception as db_error:
            print(f"❌ [STOK PEMESANAN] Error querying produksi: {str(db_error)}")
            return jsonify({'error': f'Error querying produksi: {str(db_error)}', 'success': False}), 500
        
        # Sama seperti /api/stok: hanya batch pengemasan lengkap & konsisten
        produksi_list = [
            p for p in produksi_list
            if _produksi_masuk_stok_hasil_pengemasan(p)
            and _stok_gb_pixel_tidak_lebih_dari_berat_akhir(p)
        ]
        
        print(f"📊 [STOK PEMESANAN] Found {len(produksi_list)} produksi eligible (pengemasan + tanggal + GB/Pixel vs akhir)")
        
        # Get all hasilProduksi for calculating used stock
        hasil_produksi_all = list(db.hasilProduksi.find({'isFromOrdering': True}))
        
        # Group hasil produksi by idProduksi and tipeProduk
        hasil_map = {}
        for h in hasil_produksi_all:
            id_produksi = str(h.get('idProduksi', '')).strip()
            tipe_produk = (h.get('tipeProduk', '') or '').strip()
            key = f"{id_produksi}|{tipe_produk}"
            if key not in hasil_map:
                hasil_map[key] = 0
            hasil_map[key] += float(h.get('beratSaatIni', 0) or 0)
        
        stok_list = []
        bahan_cache = {}
        
        for produksi in produksi_list:
            try:
                id_produksi = produksi.get('idProduksi')
                if not id_produksi:
                    print(f"⚠️ [STOK PEMESANAN] Skipping produksi without idProduksi: {produksi.get('_id')}")
                    continue
                
                id_produksi_str = str(id_produksi).strip()
                
                bahan = _bahan_cache_get_for_produksi(produksi, bahan_cache)
                jenis_kopi = bahan.get('jenisKopi', '')
                varietas = bahan.get('varietas', '')
                proses_pengolahan = _proses_pengolahan_tampilan_untuk_agregasi(produksi, bahan)
                
                # Process Green Beans stock
                berat_green_beans = float(produksi.get('beratGreenBeans', 0) or 0)
                if berat_green_beans > 0:
                    key_gb = f"{id_produksi_str}|Green Beans"
                    total_ordering_gb = hasil_map.get(key_gb, 0)
                    stok_tersedia_gb = max(0.0, berat_green_beans - total_ordering_gb)
                    
                    stok_list.append({
                        'idProduksi': id_produksi_str,
                        'tipeProduk': 'Green Beans',
                        'jenisKopi': jenis_kopi,
                        'varietas': varietas,
                        'prosesPengolahan': proses_pengolahan,
                        'stokTersedia': float(stok_tersedia_gb),
                        'status': produksi.get('statusTahapan', ''),
                        'beratAwal': float(berat_green_beans),
                        'totalDariOrdering': float(total_ordering_gb),
                    })
                    print(f"✅ [STOK PEMESANAN] {id_produksi} Green Beans: berat={berat_green_beans}, ordering={total_ordering_gb}, tersedia={stok_tersedia_gb}")
                
                # Process Pixel stock (if any)
                berat_pixel = float(produksi.get('beratPixel', 0) or 0)
                if berat_pixel > 0:
                    key_px = f"{id_produksi_str}|Pixel"
                    total_ordering_px = hasil_map.get(key_px, 0)
                    stok_tersedia_px = max(0.0, berat_pixel - total_ordering_px)
                    
                    stok_list.append({
                        'idProduksi': id_produksi_str,
                        'tipeProduk': 'Pixel',
                        'jenisKopi': jenis_kopi,
                        'varietas': varietas,
                        'prosesPengolahan': proses_pengolahan,
                        'stokTersedia': float(stok_tersedia_px),
                        'status': produksi.get('statusTahapan', ''),
                        'beratAwal': float(berat_pixel),
                        'totalDariOrdering': float(total_ordering_px),
                    })
                    print(f"✅ [STOK PEMESANAN] {id_produksi} Pixel: berat={berat_pixel}, ordering={total_ordering_px}, tersedia={stok_tersedia_px}")
                    
            except Exception as item_error:
                print(f"❌ [STOK PEMESANAN] Error processing produksi item: {str(item_error)}")
                import traceback
                traceback.print_exc()
                continue
        
        print(f"✅ [STOK PEMESANAN] Returning {len(stok_list)} stok records")
        
        response_data = json_serialize(stok_list)
        return jsonify(response_data), 200
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