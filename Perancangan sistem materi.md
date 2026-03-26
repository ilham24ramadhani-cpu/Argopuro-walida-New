# Perancangan Sistem Materi

Dokumen ini berisi penjelasan detail frontend dan backend beserta cuplikan code dari setiap halaman dan endpoint dalam sistem.

---

## 1. KONFIGURASI DAN SETUP AWAL

### Penjelasan

Bagian ini mengatur konfigurasi dasar aplikasi Flask, koneksi ke database MongoDB, dan helper functions yang digunakan di seluruh aplikasi.

### Backend - Konfigurasi Flask dan MongoDB

**Code Backend:**

```python
from flask import Flask, render_template, request, jsonify, session
from flask_cors import CORS
from pymongo import MongoClient
from dotenv import load_dotenv
from bson import ObjectId
import hashlib
from datetime import datetime, timedelta

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'SPARTA')
app.config['SESSION_PERMANENT'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

CORS(app, supports_credentials=True)

# Koneksi MongoDB
client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=30000)
db = client[DB_NAME]
```

**Penjelasan Backend:**
- Flask digunakan sebagai web framework dengan konfigurasi session 7 hari
- CORS diaktifkan dengan `supports_credentials=True` untuk mengizinkan cookie session
- MongoDB dihubungkan menggunakan PyMongo dengan timeout 30 detik

### Backend - Helper Functions

**Code Backend:**

```python
def json_serialize(data):
    """Konversi ObjectId MongoDB ke string untuk JSON"""
    if isinstance(data, ObjectId):
        return str(data)
    if isinstance(data, list):
        return [json_serialize(item) for item in data]
    if isinstance(data, dict):
        return {key: json_serialize(value) for key, value in data.items()}
    return data

def get_next_id(collection_name):
    """Generate auto-increment ID menggunakan counter collection"""
    counter = db.counters.find_one_and_update(
        {'_id': collection_name},
        {'$inc': {'seq': 1}},
        upsert=True,
        return_document=True
    )
    return counter['seq']
```

**Penjelasan Backend:**
- `json_serialize`: Mengkonversi ObjectId MongoDB menjadi string untuk JSON response
- `get_next_id`: Menggunakan counter collection untuk generate ID auto-increment secara atomic

---

## 2. HALAMAN WELCOME

### Penjelasan Umum

Halaman welcome adalah halaman pertama yang dilihat user saat mengakses aplikasi. Halaman ini menampilkan pilihan untuk login berdasarkan role (Admin, Karyawan, Owner) atau registrasi.

### Backend - Route Welcome

**Code Backend:**

```python
@app.route('/')
def welcome():
    """Welcome page - entry point for all users"""
    return render_template('welcome.html')
```

**Penjelasan Backend:**
- Route `/` mengembalikan template `welcome.html`
- Tidak memerlukan authentication
- Halaman entry point untuk semua user

### Frontend - HTML Structure

**Code Frontend:**

```html
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome - Argopuro Walida</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" rel="stylesheet" />
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css" rel="stylesheet" />
</head>
<body>
  <div class="welcome-container">
    <div class="container">
      <div class="row justify-content-center align-items-center min-vh-100">
        <div class="col-lg-8 col-xl-7">
          <div class="welcome-card shadow-lg">
            <!-- Logo Section -->
            <div class="text-center mb-5">
              <img src="{{ url_for('static', filename='img/logo.png') }}" alt="Logo" class="logo-img" />
              <h1 class="welcome-title">Argopuro Walida</h1>
              <p class="welcome-subtitle">Sistem Manajemen Produksi Kopi</p>
            </div>

            <!-- Role Selection Cards -->
            <div class="row g-4">
              <!-- Admin Card -->
              <div class="col-md-4">
                <a href="{{ url_for('login') }}" class="role-card text-decoration-none">
                  <div class="role-card-inner">
                    <div class="role-icon admin-icon">
                      <i class="bi bi-shield-check"></i>
                    </div>
                    <h4 class="role-title">Admin</h4>
                    <p class="role-description">Akses penuh untuk mengelola sistem</p>
                  </div>
                </a>
              </div>

              <!-- Owner Card -->
              <div class="col-md-4">
                <a href="{{ url_for('login_owner') }}" class="role-card text-decoration-none">
                  <div class="role-card-inner">
                    <div class="role-icon owner-icon">
                      <i class="bi bi-person-badge"></i>
                    </div>
                    <h4 class="role-title">Owner</h4>
                    <p class="role-description">Akses untuk melihat laporan dan data</p>
                  </div>
                </a>
              </div>

              <!-- Karyawan Card -->
              <div class="col-md-4">
                <a href="{{ url_for('login_karyawan') }}" class="role-card text-decoration-none">
                  <div class="role-card-inner">
                    <div class="role-icon karyawan-icon">
                      <i class="bi bi-person-workspace"></i>
                    </div>
                    <h4 class="role-title">Karyawan</h4>
                    <p class="role-description">Akses untuk input data produksi</p>
                  </div>
                </a>
              </div>
            </div>

            <!-- Register Link -->
            <div class="text-center mt-4">
              <a href="{{ url_for('register') }}" class="btn btn-outline-primary">Daftar Akun Baru</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    // Clear session storage saat masuk ke welcome page
    sessionStorage.clear();
  </script>
</body>
</html>
```

**Penjelasan Frontend:**
- Halaman welcome dengan 3 card untuk pilihan role (Admin, Owner, Karyawan)
- Setiap card memiliki icon dan deskripsi
- Link ke halaman login sesuai role
- Link ke halaman register
- Clear session storage untuk logout
- Menggunakan Bootstrap untuk styling responsif

---

## 3. SISTEM AUTHENTICATION (LOGIN & REGISTER)

### Penjelasan Umum

Sistem authentication menggunakan pendekatan **Backend-First** dimana semua data pengguna disimpan di MongoDB. Frontend mengirim request ke backend API untuk login dan register. Backend menggunakan Flask session untuk mengelola state login.

### Alur Kerja Login:
1. User mengisi form login (username, password)
2. Frontend mengirim POST request ke `/api/auth/login`
3. Backend memvalidasi kredensial di MongoDB
4. Jika valid, backend membuat Flask session
5. Backend mengembalikan data user (tanpa password)
6. Frontend redirect ke dashboard sesuai role

---

### 2.1. HALAMAN LOGIN

#### Frontend - HTML Structure

**Code Frontend:**

```html
<form id="loginForm" onsubmit="handleLogin(event, 'Admin')">
  <div class="mb-3">
    <label for="username" class="form-label">Username</label>
    <input type="text" id="username" class="form-control" required />
  </div>
  <div class="mb-3">
    <label for="password" class="form-label">Password</label>
    <input type="password" id="password" class="form-control" required />
  </div>
  <button type="submit" class="btn btn-primary w-100">Login</button>
</form>
```

**Penjelasan Frontend:**
- Form login dengan 2 input: username dan password
- Menggunakan Bootstrap untuk styling responsif
- Form submit memanggil fungsi `handleLogin(event, 'Admin')`
- HTML5 validation dengan atribut `required`

#### Frontend - JavaScript Handle Login

**Code Frontend:**

```javascript
async function handleLogin(event, role) {
  event.preventDefault();
  
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  
  // Validasi input
  if (!username || !password) {
    alert("Username dan password harus diisi!");
    return;
  }
  
  try {
    // Autentikasi via API
    const authenticatedUser = await authenticateUser(username, password, role);
    
    if (authenticatedUser) {
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 100);
    } else {
      alert("Login gagal! Username atau password salah.");
    }
  } catch (error) {
    alert("Terjadi kesalahan saat login.");
  }
}
```

**Penjelasan Frontend:**
- Mencegah default form submission dengan `event.preventDefault()`
- Validasi input di frontend sebelum mengirim request
- Memanggil `authenticateUser()` untuk POST request ke backend
- Redirect ke dashboard jika berhasil dengan delay 100ms untuk memastikan cookie session sudah di-set

#### Frontend - JavaScript Authenticate User

**Code Frontend:**

```javascript
async function authenticateUser(username, password, role) {
  const API_BASE_URL = window.location.origin + "/api";
  
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    credentials: "include", // CRITICAL: Include cookies for session
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password, role }),
  });
  
  const result = await response.json();
  
  if (response.ok && result.success && result.user) {
    return result.user;
  }
  return null;
}
```

**Penjelasan Frontend:**
- Menggunakan `fetch()` untuk HTTP POST request ke `/api/auth/login`
- `credentials: "include"` sangat penting untuk mengirim dan menerima cookie session
- Header `Content-Type: application/json` memberitahu server bahwa body adalah JSON
- Mengembalikan user data jika berhasil, null jika gagal

#### Backend - API Login

**Code Backend:**

```python
@app.route('/api/auth/login', methods=['POST'])
def api_login():
    try:
        data = request.json
        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        role = data.get('role', '').strip()
        
        if not username or not password:
            return jsonify({'error': 'Username dan password required'}), 400
        
        # Cari user di MongoDB (case-insensitive)
        user = db.users.find_one({
            'username': {'$regex': f'^{username}$', '$options': 'i'}
        })
        
        if not user:
            return jsonify({'error': 'Username atau password salah'}), 401
        
        # Hash password dan bandingkan
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        if user.get('password') != password_hash:
            return jsonify({'error': 'Username atau password salah'}), 401
        
        # Validasi role dan status
        if role and user.get('role') != role:
            return jsonify({'error': 'Role tidak sesuai'}), 403
        if user.get('status') != 'Aktif':
            return jsonify({'error': 'Akun tidak aktif'}), 403
        
        # Set Flask session
        session.permanent = True
        session['user_id'] = str(user['_id'])
        session['username'] = user.get('username')
        session['role'] = user.get('role')
        session.modified = True
        
        # Return user data (tanpa password)
        user_data = {
            'id': user.get('id'),
            'username': user.get('username'),
            'role': user.get('role'),
            'namaLengkap': user.get('namaLengkap', ''),
            'email': user.get('email', '')
        }
        
        return jsonify({
            'success': True,
            'user': user_data,
            'message': 'Login berhasil'
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

**Penjelasan Backend:**
1. **Validasi Input**: Memastikan username dan password tidak kosong
2. **Database Query**: Mencari user di MongoDB dengan case-insensitive username
3. **Password Validation**: Hash password dengan SHA-256 dan bandingkan dengan hash di database
4. **Role & Status Validation**: Memastikan role sesuai dan status aktif
5. **Session Management**: Menyimpan data user di Flask session yang otomatis menjadi cookie
6. **Response**: Mengembalikan data user tanpa password dengan status 200 OK

---

### 2.2. HALAMAN REGISTER

#### Frontend - HTML Structure

**Code Frontend:**

```html
<form onsubmit="handleRegister(event)">
  <div class="mb-3">
    <label for="fullname" class="form-label">Nama Lengkap</label>
    <input type="text" id="fullname" class="form-control" required />
  </div>
  <div class="mb-3">
    <label for="username" class="form-label">Username</label>
    <input type="text" id="username" class="form-control" required />
  </div>
  <div class="mb-3">
    <label for="email" class="form-label">Email</label>
    <input type="email" id="email" class="form-control" required />
  </div>
  <div class="mb-3">
    <label for="password" class="form-label">Password</label>
    <input type="password" id="password" class="form-control" required />
  </div>
  <div class="mb-3">
    <label for="confirmPassword" class="form-label">Konfirmasi Password</label>
    <input type="password" id="confirmPassword" class="form-control" required />
  </div>
  <div class="mb-3">
    <label for="role" class="form-label">Role</label>
    <select id="role" class="form-select" required>
      <option value="">Pilih Role</option>
      <option value="Admin">Admin</option>
      <option value="Owner">Owner</option>
      <option value="Karyawan">Karyawan</option>
    </select>
  </div>
  <button type="submit" class="btn btn-primary w-100">Daftar</button>
</form>
```

**Penjelasan Frontend:**
- Form registrasi dengan field: nama lengkap, username, email, password, konfirmasi password, dan role
- Menggunakan HTML5 validation dan Bootstrap untuk styling
- Form submit di-handle oleh fungsi `handleRegister(event)`

#### Frontend - JavaScript Handle Register

**Code Frontend:**

```javascript
async function handleRegister(event) {
  event.preventDefault();
  
  const fullname = document.getElementById("fullname").value.trim();
  const username = document.getElementById("username").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;
  const role = document.getElementById("role").value;
  
  // Validasi password match
  if (password !== confirmPassword) {
    alert("Password dan konfirmasi password tidak cocok!");
    return;
  }
  
  if (password.length < 6) {
    alert("Password harus minimal 6 karakter!");
    return;
  }
  
  try {
    // Validasi username dan email unik
    const existingUsername = await getUserByUsername(username);
    if (existingUsername) {
      alert("Username sudah digunakan!");
      return;
    }
    
    const existingEmail = await getUserByEmail(email);
    if (existingEmail) {
      alert("Email sudah digunakan!");
      return;
    }
    
    // Simpan user baru via API
    const newUser = await saveUser({
      namaLengkap: fullname,
      username: username,
      email: email,
      password: password,
      role: role,
      status: "Aktif"
    });
    
    if (newUser) {
      alert("Registrasi berhasil! Silakan login.");
      window.location.href = "/";
    }
  } catch (error) {
    alert("Terjadi kesalahan saat mendaftar.");
  }
}
```

**Penjelasan Frontend:**
1. **Validasi Form**: Validasi password match dan panjang minimal 6 karakter
2. **Uniqueness Check**: Mengecek username dan email belum terdaftar via API
3. **API Call**: Memanggil `saveUser()` untuk POST request ke backend
4. **Success Handling**: Redirect ke halaman login setelah berhasil

#### Backend - API Register (Create User)

**Code Backend:**

```python
@app.route('/api/users', methods=['POST'])
def create_user():
    try:
        data = request.json
        
        # Validasi field required
        required_fields = ['username', 'password', 'namaLengkap', 'email', 'role']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing field: {field}'}), 400
        
        # Validasi username unik
        existing = db.users.find_one({
            'username': {'$regex': f'^{data["username"]}$', '$options': 'i'}
        })
        if existing:
            return jsonify({'error': 'Username already exists'}), 400
        
        # Validasi email unik
        existing_email = db.users.find_one({
            'email': {'$regex': f'^{data["email"]}$', '$options': 'i'}
        })
        if existing_email:
            return jsonify({'error': 'Email already exists'}), 400
        
        # Hash password
        password_hash = hashlib.sha256(data['password'].encode()).hexdigest()
        
        # Generate ID
        new_id = get_next_id('users')
        
        # Simpan ke MongoDB
        user_data = {
            'id': new_id,
            'username': data['username'],
            'password': password_hash,
            'namaLengkap': data['namaLengkap'],
            'email': data['email'],
            'role': data['role'],
            'status': data.get('status', 'Aktif')
        }
        
        result = db.users.insert_one(user_data)
        user_data['_id'] = result.inserted_id
        user_data.pop('password', None)  # Jangan return password
        
        return jsonify(json_serialize(user_data)), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

**Penjelasan Backend:**
1. **Validasi Field**: Memastikan semua field required ada
2. **Uniqueness Validation**: Validasi username dan email unik (case-insensitive)
3. **Password Hashing**: Hash password dengan SHA-256 sebelum disimpan
4. **ID Generation**: Generate auto-increment ID menggunakan counter collection
5. **Database Insert**: Simpan user ke MongoDB collection `users`
6. **Response**: Return data user tanpa password dengan status 201 Created

---

## 4. HALAMAN DASHBOARD

### Penjelasan Umum

Dashboard adalah halaman utama setelah login. Terdapat 3 versi dashboard: Admin, Karyawan, dan Owner. Setiap dashboard memiliki menu dan akses yang berbeda sesuai role.

### Backend - Route Dashboard Admin

**Code Backend:**

```python
@app.route('/dashboard')
def dashboard():
    """Dashboard - Admin (requires auth)"""
    # Server-side session check
    if 'user_id' not in session or not session.get('username') or not session.get('role'):
        return redirect(url_for('welcome'))
    # Role check - only Admin can access
    if session.get('role') != 'Admin':
        return redirect(url_for('welcome'))
    return render_template('index.html')
```

**Penjelasan Backend:**
- Validasi session di server-side
- Validasi role harus "Admin"
- Redirect ke welcome jika tidak valid
- Render template `index.html` untuk dashboard Admin

### Frontend - HTML Structure Dashboard Admin

**Code Frontend:**

```html
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dashboard Admin - Argopuro Walida</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" rel="stylesheet" />
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css" rel="stylesheet" />
</head>
<body>
  <!-- Sidebar Navigation -->
  <div class="sidebar">
    <div class="logo-details">
      <i class="bi bi-cup-hot"></i>
      <span class="logo_name">Argopuro Walida</span>
    </div>
    <ul class="nav-links">
      <li><a href="/dashboard" class="active"><i class="bi bi-speedometer2"></i><span>Dashboard</span></a></li>
      <li><a href="/kelola/pengguna"><i class="bi bi-people"></i><span>Kelola Pengguna</span></a></li>
      <li><a href="/kelola/bahan"><i class="bi bi-box-seam"></i><span>Kelola Bahan</span></a></li>
      <li><a href="/kelola/produksi"><i class="bi bi-gear"></i><span>Kelola Produksi</span></a></li>
      <li><a href="/kelola/hasil-produksi"><i class="bi bi-check-circle"></i><span>Hasil Produksi</span></a></li>
      <li><a href="/kelola/stok"><i class="bi bi-archive"></i><span>Kelola Stok</span></a></li>
      <li><a href="/kelola/pemesanan"><i class="bi bi-cart"></i><span>Pemesanan</span></a></li>
      <li><a href="/kelola/pemasok"><i class="bi bi-truck"></i><span>Pemasok</span></a></li>
      <li><a href="/kelola/keuangan"><i class="bi bi-cash-coin"></i><span>Keuangan</span></a></li>
      <li><a href="/kelola/sanitasi"><i class="bi bi-shield-check"></i><span>Sanitasi</span></a></li>
      <li><a href="/kelola/laporan"><i class="bi bi-file-earmark-pdf"></i><span>Laporan</span></a></li>
      <li><a href="/profile"><i class="bi bi-person"></i><span>Profile</span></a></li>
      <li><a href="/pengaturan"><i class="bi bi-gear"></i><span>Pengaturan</span></a></li>
    </ul>
  </div>

  <!-- Main Content -->
  <section class="home-section">
    <div class="home-content">
      <i class="bi bi-list toggle"></i>
      <span class="text">Dashboard Admin</span>
    </div>

    <!-- Dashboard Cards -->
    <div class="row g-4 mt-3">
      <div class="col-md-3">
        <div class="card bg-primary text-white">
          <div class="card-body">
            <h5 class="card-title">Total Bahan</h5>
            <h2 id="totalBahan">0</h2>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card bg-success text-white">
          <div class="card-body">
            <h5 class="card-title">Total Produksi</h5>
            <h2 id="totalProduksi">0</h2>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card bg-warning text-white">
          <div class="card-body">
            <h5 class="card-title">Total Stok</h5>
            <h2 id="totalStok">0</h2>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card bg-info text-white">
          <div class="card-body">
            <h5 class="card-title">Total Pemesanan</h5>
            <h2 id="totalPemesanan">0</h2>
          </div>
        </div>
      </div>
    </div>
  </section>

  <script src="{{ url_for('static', filename='js/api-service.js') }}"></script>
  <script src="{{ url_for('static', filename='js/auth-guard.js') }}"></script>
  <script>
    // Load dashboard statistics
    async function loadDashboardStats() {
      try {
        const [bahan, produksi, stok, pemesanan] = await Promise.all([
          window.API.Bahan.getAll(),
          window.API.Produksi.getAll(),
          window.API.Stok.getAll(),
          window.API.Pemesanan.getAll()
        ]);
        
        document.getElementById('totalBahan').textContent = bahan.length;
        document.getElementById('totalProduksi').textContent = produksi.length;
        document.getElementById('totalStok').textContent = stok.length;
        document.getElementById('totalPemesanan').textContent = pemesanan.length;
      } catch (error) {
        console.error('Error loading dashboard stats:', error);
      }
    }
    
    document.addEventListener('DOMContentLoaded', loadDashboardStats);
  </script>
</body>
</html>
```

**Penjelasan Frontend:**
- Sidebar navigation dengan menu lengkap untuk Admin
- Dashboard cards menampilkan statistik (Total Bahan, Produksi, Stok, Pemesanan)
- Load statistik dari API saat halaman dimuat
- Auth guard untuk proteksi halaman
- Toggle sidebar untuk mobile view

### Backend - Route Dashboard Karyawan

**Code Backend:**

```python
@app.route('/dashboard/karyawan')
def dashboard_karyawan():
    """Dashboard - Karyawan (requires auth)"""
    if 'user_id' not in session or not session.get('username') or not session.get('role'):
        return redirect(url_for('welcome'))
    if session.get('role') != 'Karyawan':
        return redirect(url_for('welcome'))
    return render_template('index_karyawan.html')
```

**Penjelasan Backend:**
- Validasi session dan role "Karyawan"
- Render template `index_karyawan.html`

### Frontend - HTML Structure Dashboard Karyawan

**Code Frontend:**

```html
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>Dashboard Karyawan - Argopuro Walida</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" rel="stylesheet" />
</head>
<body>
  <!-- Sidebar Navigation -->
  <div class="sidebar">
    <ul class="nav-links">
      <li><a href="/dashboard/karyawan" class="active"><i class="bi bi-speedometer2"></i><span>Dashboard</span></a></li>
      <li><a href="/kelola/bahan/karyawan"><i class="bi bi-box-seam"></i><span>Kelola Bahan</span></a></li>
      <li><a href="/kelola/produksi/karyawan"><i class="bi bi-gear"></i><span>Kelola Produksi</span></a></li>
      <li><a href="/kelola/hasil-produksi/karyawan"><i class="bi bi-check-circle"></i><span>Hasil Produksi</span></a></li>
      <li><a href="/kelola/sanitasi/karyawan"><i class="bi bi-shield-check"></i><span>Sanitasi</span></a></li>
      <li><a href="/profile/karyawan"><i class="bi bi-person"></i><span>Profile</span></a></li>
    </ul>
  </div>

  <!-- Main Content -->
  <section class="home-section">
    <div class="home-content">
      <span class="text">Dashboard Karyawan</span>
    </div>
    <!-- Dashboard content untuk karyawan -->
  </section>

  <script src="{{ url_for('static', filename='js/api-service.js') }}"></script>
  <script src="{{ url_for('static', filename='js/auth-guard.js') }}"></script>
</body>
</html>
```

**Penjelasan Frontend:**
- Sidebar dengan menu terbatas untuk Karyawan
- Menu: Dashboard, Kelola Bahan, Kelola Produksi, Hasil Produksi, Sanitasi, Profile
- Tidak memiliki akses ke pengguna, keuangan, laporan, pemesanan

### Backend - Route Dashboard Owner

**Code Backend:**

```python
@app.route('/dashboard/owner')
def dashboard_owner():
    """Dashboard - Owner (requires auth)"""
    if 'user_id' not in session or not session.get('username') or not session.get('role'):
        return redirect(url_for('welcome'))
    if session.get('role') != 'Owner':
        return redirect(url_for('welcome'))
    return render_template('index_owner.html')
```

**Penjelasan Backend:**
- Validasi session dan role "Owner"
- Render template `index_owner.html`

### Frontend - HTML Structure Dashboard Owner

**Code Frontend:**

```html
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>Dashboard Owner - Argopuro Walida</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" rel="stylesheet" />
</head>
<body>
  <!-- Sidebar Navigation -->
  <div class="sidebar">
    <ul class="nav-links">
      <li><a href="/dashboard/owner" class="active"><i class="bi bi-speedometer2"></i><span>Dashboard</span></a></li>
      <li><a href="/kelola/stok"><i class="bi bi-archive"></i><span>Kelola Stok</span></a></li>
      <li><a href="/kelola/pemesanan"><i class="bi bi-cart"></i><span>Pemesanan</span></a></li>
      <li><a href="/kelola/keuangan"><i class="bi bi-cash-coin"></i><span>Keuangan</span></a></li>
      <li><a href="/kelola/laporan/owner"><i class="bi bi-file-earmark-pdf"></i><span>Laporan</span></a></li>
      <li><a href="/profile/owner"><i class="bi bi-person"></i><span>Profile</span></a></li>
    </ul>
  </div>

  <!-- Main Content -->
  <section class="home-section">
    <div class="home-content">
      <span class="text">Dashboard Owner</span>
    </div>
    <!-- Dashboard content untuk owner -->
  </section>

  <script src="{{ url_for('static', filename='js/api-service.js') }}"></script>
  <script src="{{ url_for('static', filename='js/auth-guard.js') }}"></script>
</body>
</html>
```

**Penjelasan Frontend:**
- Sidebar dengan menu untuk Owner (read-only dan laporan)
- Menu: Dashboard, Kelola Stok, Pemesanan, Keuangan, Laporan, Profile
- Tidak memiliki akses untuk edit data produksi, bahan, pengguna

---

## 5. HALAMAN KELOLA PENGGUNA

### Penjelasan Umum

Halaman Kelola Pengguna digunakan oleh Admin untuk mengelola data pengguna (Admin, Owner, Karyawan). Admin dapat menambah, mengedit, menghapus, dan melihat data pengguna. Data disimpan di MongoDB collection `users`.

### Alur Kerja:
1. Frontend load data dari `/api/users` saat halaman dimuat
2. User dapat menambah pengguna baru melalui form modal
3. Frontend mengirim POST request ke `/api/users`
4. Backend validasi dan simpan ke MongoDB
5. Frontend refresh data setelah berhasil

### Backend - Route Kelola Pengguna

**Code Backend:**

```python
@app.route('/kelola/pengguna')
def kelola_pengguna():
    """User management page"""
    return render_template('kelola_pengguna.html')
```

---

### 5.1. FRONTEND - HTML Structure

**Code Frontend:**

```html
<!-- Tabel Data Pengguna -->
<div class="table-responsive">
  <table class="table table-striped" id="usersTable">
    <thead>
      <tr>
        <th>No</th>
        <th>Nama Lengkap</th>
        <th>Username</th>
        <th>Email</th>
        <th>Role</th>
        <th>Status</th>
        <th>Aksi</th>
      </tr>
    </thead>
    <tbody id="tableBody">
      <!-- Data akan diisi oleh JavaScript -->
    </tbody>
  </table>
</div>

<!-- Modal Form -->
<div class="modal fade" id="modalPengguna">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="modalPenggunaLabel">Tambah Pengguna</h5>
      </div>
      <div class="modal-body">
        <form id="formPengguna">
          <input type="hidden" id="userId" />
          <div class="mb-3">
            <label for="namaLengkap" class="form-label">Nama Lengkap</label>
            <input type="text" class="form-control" id="namaLengkap" required />
          </div>
          <div class="mb-3">
            <label for="username" class="form-label">Username</label>
            <input type="text" class="form-control" id="username" required />
          </div>
          <div class="mb-3">
            <label for="email" class="form-label">Email</label>
            <input type="email" class="form-control" id="email" required />
          </div>
          <div class="mb-3">
            <label for="password" class="form-label">Password <span id="passwordRequired">*</span></label>
            <input type="password" class="form-control" id="password" />
            <small id="passwordHint" class="text-muted">Kosongkan jika tidak ingin mengubah password</small>
          </div>
          <div class="mb-3">
            <label for="role" class="form-label">Role</label>
            <select class="form-select" id="role" required>
              <option value="">Pilih Role</option>
              <option value="Admin">Admin</option>
              <option value="Owner">Owner</option>
              <option value="Karyawan">Karyawan</option>
            </select>
          </div>
          <div class="mb-3">
            <label for="status" class="form-label">Status</label>
            <select class="form-select" id="status" required>
              <option value="Aktif">Aktif</option>
              <option value="Nonaktif">Nonaktif</option>
            </select>
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Batal</button>
        <button type="button" class="btn btn-primary" onclick="saveUser()">Simpan</button>
      </div>
    </div>
  </div>
</div>
```

**Penjelasan Frontend:**
- Tabel Bootstrap untuk menampilkan data pengguna
- Modal Bootstrap untuk form tambah/edit
- Form memiliki input untuk Nama Lengkap, Username, Email, Password, Role, Status
- Password optional saat edit (hanya di-update jika diisi)

---

### 5.2. FRONTEND - JavaScript CRUD

**Code Frontend:**

```javascript
let users = [];
let currentEditId = null;

// Load data dari API
async function loadUsersData() {
  try {
    users = await window.API.Users.getAll();
    renderUsersTable();
  } catch (error) {
    alert("Error memuat data pengguna: " + error.message);
  }
}

// Render table
function renderUsersTable() {
  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = "";
  
  users.forEach((user, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${user.namaLengkap || ''}</td>
      <td>${user.username}</td>
      <td>${user.email || ''}</td>
      <td><span class="badge bg-primary">${user.role}</span></td>
      <td><span class="badge ${user.status === 'Aktif' ? 'bg-success' : 'bg-danger'}">${user.status}</span></td>
      <td>
        <button class="btn btn-sm btn-warning" onclick="editUser('${user._id || user.id}')">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteUser('${user._id || user.id}')">Hapus</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// Save user (create/update)
async function saveUser() {
  const form = document.getElementById("formPengguna");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  
  const userData = {
    namaLengkap: document.getElementById("namaLengkap").value,
    username: document.getElementById("username").value,
    email: document.getElementById("email").value,
    role: document.getElementById("role").value,
    status: document.getElementById("status").value
  };
  
  // Jika password diisi, tambahkan ke data
  const password = document.getElementById("password").value;
  if (password) {
    userData.password = password;
  }
  
  try {
    const userId = document.getElementById("userId").value;
    if (userId) {
      await window.API.Users.update(userId, userData);
      alert("Pengguna berhasil diupdate!");
    } else {
      await window.API.Users.create(userData);
      alert("Pengguna berhasil ditambahkan!");
    }
    
    const modal = bootstrap.Modal.getInstance(document.getElementById("modalPengguna"));
    modal.hide();
    await loadUsersData();
  } catch (error) {
    alert("Error: " + error.message);
  }
}

// Edit user
async function editUser(id) {
  try {
    const user = await window.API.Users.getById(id);
    document.getElementById("userId").value = user._id || user.id;
    document.getElementById("namaLengkap").value = user.namaLengkap || '';
    document.getElementById("username").value = user.username;
    document.getElementById("email").value = user.email || '';
    document.getElementById("password").value = '';
    document.getElementById("role").value = user.role;
    document.getElementById("status").value = user.status || 'Aktif';
    
    document.getElementById("modalPenggunaLabel").textContent = "Edit Pengguna";
    document.getElementById("passwordRequired").style.display = "none";
    document.getElementById("password").required = false;
    
    const modal = new bootstrap.Modal(document.getElementById("modalPengguna"));
    modal.show();
  } catch (error) {
    alert("Error memuat data pengguna: " + error.message);
  }
}

// Delete user
async function deleteUser(id) {
  if (!confirm("Apakah Anda yakin ingin menghapus pengguna ini?")) {
    return;
  }
  
  try {
    await window.API.Users.delete(id);
    alert("Pengguna berhasil dihapus!");
    await loadUsersData();
  } catch (error) {
    alert("Error: " + error.message);
  }
}

// Load saat halaman dimuat
document.addEventListener("DOMContentLoaded", loadUsersData);
```

**Penjelasan Frontend:**
1. **Load Data**: Memanggil `API.Users.getAll()` untuk GET request ke backend
2. **Render Table**: Menampilkan data dalam tabel HTML dengan tombol Edit dan Delete
3. **Save**: Validasi form, lalu POST/PUT ke backend (password optional saat update)
4. **Edit**: Load data user dan isi form modal
5. **Delete**: Konfirmasi user, lalu DELETE request ke backend
6. **Auto Reload**: Reload data setelah create/update/delete berhasil

---

### 5.3. BACKEND - API USERS

#### GET /api/users - Get All Users

**Code Backend:**

```python
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
```

**Penjelasan Backend:**
- Query semua document dari collection `users`
- Sort berdasarkan `id` ascending
- Hapus field `password` dari setiap user untuk keamanan
- Serialize ObjectId ke string untuk JSON response

#### POST /api/users - Create User

**Code Backend:**

```python
@app.route('/api/users', methods=['POST'])
def create_user():
    try:
        data = request.json
        
        # Validasi field required
        required_fields = ['username', 'password', 'namaLengkap', 'email', 'role']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing field: {field}'}), 400
        
        # Validasi username unik
        existing = db.users.find_one({
            'username': {'$regex': f'^{data["username"]}$', '$options': 'i'}
        })
        if existing:
            return jsonify({'error': 'Username already exists'}), 400
        
        # Validasi email unik
        existing_email = db.users.find_one({
            'email': {'$regex': f'^{data["email"]}$', '$options': 'i'}
        })
        if existing_email:
            return jsonify({'error': 'Email already exists'}), 400
        
        # Hash password
        password_hash = hashlib.sha256(data['password'].encode()).hexdigest()
        
        # Generate ID
        new_id = get_next_id('users')
        
        # Simpan ke MongoDB
        user_data = {
            'id': new_id,
            'username': data['username'],
            'password': password_hash,
            'namaLengkap': data['namaLengkap'],
            'email': data['email'],
            'role': data['role'],
            'status': data.get('status', 'Aktif')
        }
        
        result = db.users.insert_one(user_data)
        user_data['_id'] = result.inserted_id
        user_data.pop('password', None)  # Jangan return password
        
        return jsonify(json_serialize(user_data)), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

**Penjelasan Backend:**
1. **Validasi Field**: Memastikan semua field required ada
2. **Uniqueness Validation**: Validasi username dan email unik (case-insensitive)
3. **Password Hashing**: Hash password dengan SHA-256 sebelum disimpan
4. **ID Generation**: Generate auto-increment ID
5. **Database Insert**: Simpan ke MongoDB collection `users`
6. **Response**: Return data user tanpa password dengan status 201

#### PUT /api/users/<user_id> - Update User

**Code Backend:**

```python
@app.route('/api/users/<user_id>', methods=['PUT'])
def update_user(user_id):
    try:
        data = request.json
        
        # Find user
        try:
            user = db.users.find_one({'_id': ObjectId(user_id)})
        except:
            user = db.users.find_one({'id': int(user_id)})
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # Validasi username unik (jika diubah)
        if 'username' in data:
            existing = db.users.find_one({
                'username': {'$regex': f'^{data["username"]}$', '$options': 'i'},
                '_id': {'$ne': user['_id']}
            })
            if existing:
                return jsonify({'error': 'Username already exists'}), 400
        
        # Validasi email unik (jika diubah)
        if 'email' in data:
            existing_email = db.users.find_one({
                'email': {'$regex': f'^{data["email"]}$', '$options': 'i'},
                '_id': {'$ne': user['_id']}
            })
            if existing_email:
                return jsonify({'error': 'Email already exists'}), 400
        
        # Update data
        update_data = {}
        for field in ['username', 'namaLengkap', 'email', 'role', 'status']:
            if field in data:
                update_data[field] = data[field]
        
        # Jika password diubah, hash dulu
        if 'password' in data and data['password']:
            update_data['password'] = hashlib.sha256(data['password'].encode()).hexdigest()
        
        # Update MongoDB
        db.users.update_one(
            {'_id': user['_id']},
            {'$set': update_data}
        )
        
        # Get updated document
        updated = db.users.find_one({'_id': user['_id']})
        updated.pop('password', None)
        return jsonify(json_serialize(updated)), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

**Penjelasan Backend:**
- Mencari user dengan ObjectId atau id
- Validasi username dan email unik jika diubah
- Password hanya di-update jika dikirim (optional)
- Hash password jika diubah
- Return document yang sudah di-update tanpa password

#### DELETE /api/users/<user_id> - Delete User

**Code Backend:**

```python
@app.route('/api/users/<user_id>', methods=['DELETE'])
def delete_user(user_id):
    try:
        try:
            user = db.users.find_one({'_id': ObjectId(user_id)})
        except:
            user = db.users.find_one({'id': int(user_id)})
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        db.users.delete_one({'_id': user['_id']})
        return jsonify({'message': 'User deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

**Penjelasan Backend:**
- Mencari user yang akan dihapus
- Hapus dari MongoDB
- Return success message dengan status 200

---

## 6. HALAMAN KELOLA BAHAN

### Penjelasan Umum

Halaman Kelola Bahan digunakan untuk mengelola data bahan baku kopi. Admin dapat menambah, mengedit, menghapus, dan melihat data bahan. Data disimpan di MongoDB collection `bahan`.

### Alur Kerja:
1. Frontend load data dari `/api/bahan` saat halaman dimuat
2. User dapat menambah bahan baru melalui form modal
3. Frontend mengirim POST request ke `/api/bahan`
4. Backend validasi dan simpan ke MongoDB
5. Frontend refresh data setelah berhasil

---

### 6.1. FRONTEND - HTML Structure

**Code Frontend:**

```html
<!-- Tabel Data Bahan -->
<div class="table-responsive">
  <table class="table table-striped" id="bahanTable">
    <thead>
      <tr>
        <th>ID Bahan</th>
        <th>Pemasok</th>
        <th>Jumlah (kg)</th>
        <th>Varietas</th>
        <th>Jenis Kopi</th>
        <th>Harga per Kg</th>
        <th>Total Pengeluaran</th>
        <th>Aksi</th>
      </tr>
    </thead>
    <tbody id="bahanTableBody">
      <!-- Data akan diisi oleh JavaScript -->
    </tbody>
  </table>
</div>

<!-- Modal Form -->
<div class="modal fade" id="bahanModal">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="modalTitle">Tambah Bahan</h5>
      </div>
      <div class="modal-body">
        <form id="bahanForm">
          <input type="hidden" id="bahanId" />
          <div class="mb-3">
            <label for="idBahan" class="form-label">ID Bahan</label>
            <input type="text" class="form-control" id="idBahan" required />
          </div>
          <div class="mb-3">
            <label for="pemasok" class="form-label">Pemasok</label>
            <select class="form-select" id="pemasok" required></select>
          </div>
          <div class="mb-3">
            <label for="jumlah" class="form-label">Jumlah (kg)</label>
            <input type="number" step="0.01" class="form-control" id="jumlah" required />
          </div>
          <div class="mb-3">
            <label for="hargaPerKg" class="form-label">Harga per Kg</label>
            <input type="number" step="0.01" class="form-control" id="hargaPerKg" required />
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Batal</button>
        <button type="button" class="btn btn-primary" onclick="saveBahan()">Simpan</button>
      </div>
    </div>
  </div>
</div>
```

**Penjelasan Frontend:**
- Tabel Bootstrap untuk menampilkan data bahan
- Modal Bootstrap untuk form tambah/edit
- Form memiliki input untuk ID Bahan, Pemasok, Jumlah, Harga per Kg
- Dropdown pemasok di-load dari master data via API

---

### 6.2. FRONTEND - JavaScript CRUD

**Code Frontend:**

```javascript
let bahan = [];
let currentEditId = null;

// Load data dari API
async function loadBahanData() {
  try {
    bahan = await window.API.Bahan.getAll();
    renderBahanTable();
  } catch (error) {
    alert("Error memuat data bahan: " + error.message);
  }
}

// Render table
function renderBahanTable() {
  const tbody = document.getElementById("bahanTableBody");
  tbody.innerHTML = "";
  
  bahan.forEach((b) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${b.idBahan}</td>
      <td>${b.pemasok}</td>
      <td>${b.jumlah}</td>
      <td>${b.varietas}</td>
      <td>${b.jenisKopi}</td>
      <td>${formatCurrency(b.hargaPerKg)}</td>
      <td>${formatCurrency(b.totalPengeluaran)}</td>
      <td>
        <button class="btn btn-sm btn-warning" onclick="editBahan('${b._id}')">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteBahan('${b._id}')">Hapus</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// Save bahan (create/update)
async function saveBahan() {
  const form = document.getElementById("bahanForm");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  
  const bahanData = {
    idBahan: document.getElementById("idBahan").value,
    pemasok: document.getElementById("pemasok").value,
    jumlah: parseFloat(document.getElementById("jumlah").value),
    hargaPerKg: parseFloat(document.getElementById("hargaPerKg").value),
    totalPengeluaran: parseFloat(document.getElementById("jumlah").value) * 
                     parseFloat(document.getElementById("hargaPerKg").value)
  };
  
  try {
    if (currentEditId) {
      await window.API.Bahan.update(currentEditId, bahanData);
      alert("Bahan berhasil diupdate!");
    } else {
      await window.API.Bahan.create(bahanData);
      alert("Bahan berhasil ditambahkan!");
    }
    
    const modal = bootstrap.Modal.getInstance(document.getElementById("bahanModal"));
    modal.hide();
    await loadBahanData();
  } catch (error) {
    alert("Error: " + error.message);
  }
}

// Delete bahan
async function deleteBahan(id) {
  if (!confirm("Apakah Anda yakin ingin menghapus bahan ini?")) {
    return;
  }
  
  try {
    await window.API.Bahan.delete(id);
    alert("Bahan berhasil dihapus!");
    await loadBahanData();
  } catch (error) {
    alert("Error: " + error.message);
  }
}

// Load saat halaman dimuat
document.addEventListener("DOMContentLoaded", loadBahanData);
```

**Penjelasan Frontend:**
1. **Load Data**: Memanggil `API.Bahan.getAll()` untuk GET request ke backend
2. **Render Table**: Menampilkan data dalam tabel HTML dengan tombol Edit dan Delete
3. **Save**: Validasi form, calculate totalPengeluaran, lalu POST/PUT ke backend
4. **Delete**: Konfirmasi user, lalu DELETE request ke backend
5. **Auto Reload**: Reload data setelah create/update/delete berhasil

---

### 6.3. BACKEND - API BAHAN

#### GET /api/bahan - Get All Bahan

**Code Backend:**

```python
@app.route('/api/bahan', methods=['GET'])
def get_bahan():
    try:
        bahan = list(db.bahan.find().sort('id', 1))
        return jsonify(json_serialize(bahan)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

**Penjelasan Backend:**
- Query semua document dari collection `bahan`
- Sort berdasarkan `id` ascending
- Serialize ObjectId ke string untuk JSON response

#### POST /api/bahan - Create Bahan

**Code Backend:**

```python
@app.route('/api/bahan', methods=['POST'])
def create_bahan():
    try:
        data = request.json
        
        # Validasi field required
        required_fields = ['idBahan', 'pemasok', 'jumlah', 'varietas', 
                          'hargaPerKg', 'totalPengeluaran', 'jenisKopi', 
                          'tanggalMasuk', 'kualitas']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing field: {field}'}), 400
        
        # Validasi idBahan unik
        existing = db.bahan.find_one({'idBahan': data['idBahan']})
        if existing:
            return jsonify({'error': 'ID Bahan already exists'}), 400
        
        # Generate ID
        new_id = get_next_id('bahan')
        
        # Simpan ke MongoDB
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
            'kualitas': data['kualitas']
        }
        
        result = db.bahan.insert_one(bahan_data)
        bahan_data['_id'] = result.inserted_id
        
        return jsonify(json_serialize(bahan_data)), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

**Penjelasan Backend:**
1. **Validasi Field**: Memastikan semua field required ada
2. **Uniqueness Validation**: Validasi `idBahan` unik
3. **ID Generation**: Generate auto-increment ID
4. **Type Conversion**: Convert jumlah dan harga ke float
5. **Database Insert**: Simpan ke MongoDB collection `bahan`
6. **Response**: Return data yang baru dibuat dengan status 201

#### PUT /api/bahan/<bahan_id> - Update Bahan

**Code Backend:**

```python
@app.route('/api/bahan/<bahan_id>', methods=['PUT'])
def update_bahan(bahan_id):
    try:
        data = request.json
        
        # Find bahan
        try:
            bahan = db.bahan.find_one({'_id': ObjectId(bahan_id)})
        except:
            bahan = db.bahan.find_one({'id': int(bahan_id)}) or \
                   db.bahan.find_one({'idBahan': bahan_id})
        
        if not bahan:
            return jsonify({'error': 'Bahan not found'}), 404
        
        # Validasi idBahan unik (jika diubah)
        if 'idBahan' in data:
            existing = db.bahan.find_one({
                'idBahan': data['idBahan'],
                '_id': {'$ne': bahan['_id']}
            })
            if existing:
                return jsonify({'error': 'ID Bahan already exists'}), 400
        
        # Update data
        update_data = {}
        for field in ['idBahan', 'pemasok', 'varietas', 'jenisKopi', 'tanggalMasuk', 'kualitas']:
            if field in data:
                update_data[field] = data[field]
        
        for field in ['jumlah', 'hargaPerKg', 'totalPengeluaran']:
            if field in data:
                update_data[field] = float(data[field])
        
        # Update MongoDB
        db.bahan.update_one(
            {'_id': bahan['_id']},
            {'$set': update_data}
        )
        
        # Get updated document
        updated = db.bahan.find_one({'_id': bahan['_id']})
        return jsonify(json_serialize(updated)), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

**Penjelasan Backend:**
- Mencari bahan dengan berbagai cara (ObjectId, id, idBahan)
- Validasi `idBahan` unik jika diubah
- Update hanya field yang dikirim (partial update)
- Return document yang sudah di-update

#### DELETE /api/bahan/<bahan_id> - Delete Bahan

**Code Backend:**

```python
@app.route('/api/bahan/<bahan_id>', methods=['DELETE'])
def delete_bahan(bahan_id):
    try:
        # Find bahan
        try:
            bahan = db.bahan.find_one({'_id': ObjectId(bahan_id)})
        except:
            bahan = db.bahan.find_one({'id': int(bahan_id)}) or \
                   db.bahan.find_one({'idBahan': bahan_id})
        
        if not bahan:
            return jsonify({'error': 'Bahan not found'}), 404
        
        # Validasi referential integrity
        produksi_count = db.produksi.count_documents({'idBahan': bahan.get('idBahan')})
        if produksi_count > 0:
            return jsonify({
                'error': f'Cannot delete. {produksi_count} produksi using this bahan'
            }), 400
        
        # Delete dari MongoDB
        db.bahan.delete_one({'_id': bahan['_id']})
        return jsonify({'message': 'Bahan deleted successfully'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

**Penjelasan Backend:**
- Mencari bahan yang akan dihapus
- **Referential Integrity Check**: Memastikan tidak ada produksi yang menggunakan bahan ini
- Jika aman, hapus dari MongoDB
- Return success message dengan status 200

---

## 7. HALAMAN KELOLA PRODUKSI

### Penjelasan Umum

Sistem produksi mengelola proses pengolahan kopi dari bahan baku hingga hasil produksi. Setiap produksi memiliki tahapan (Fermentasi, Pengeringan, Pengemasan) dan history tahapan.

### Alur Kerja:
1. Admin membuat produksi baru dengan memilih bahan baku
2. Sistem validasi sisa bahan tersedia
3. Produksi melalui tahapan dengan update berat terkini
4. Setelah pengemasan, hasil produksi dapat dibuat
5. Hasil produksi mengurangi stok bahan yang digunakan

---

### 4.1. BACKEND - API PRODUKSI

#### POST /api/produksi - Create Produksi

**Code Backend:**

```python
@app.route('/api/produksi', methods=['POST'])
def create_produksi():
    try:
        data = request.json
        
        # Validasi field required
        required_fields = ['idProduksi', 'idBahan', 'beratAwal', 'prosesPengolahan', 
                          'kadarAir', 'varietas', 'tanggalMasuk', 'tanggalSekarang', 
                          'statusTahapan', 'haccp']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing field: {field}'}), 400
        
        # Validasi idProduksi unik
        existing = db.produksi.find_one({'idProduksi': data['idProduksi']})
        if existing:
            return jsonify({'error': 'ID Produksi already exists'}), 400
        
        # Validasi sisa bahan
        bahan = db.bahan.find_one({'idBahan': data['idBahan']})
        if not bahan:
            return jsonify({'error': 'Bahan not found'}), 400
        
        # Hitung sisa bahan
        produksi_list = list(db.produksi.find({'idBahan': data['idBahan']}))
        total_digunakan = sum(p.get('beratAwal', 0) for p in produksi_list)
        sisa_bahan = bahan.get('jumlah', 0) - total_digunakan
        
        if data['beratAwal'] > sisa_bahan:
            return jsonify({
                'error': 'Sisa bahan tidak mencukupi',
                'totalBahan': bahan.get('jumlah', 0),
                'sudahDigunakan': total_digunakan,
                'sisaTersedia': sisa_bahan,
                'beratDiminta': data['beratAwal']
            }), 400
        
        # Validasi business logic
        if data['prosesPengolahan'] == 'Natural Process' and data['statusTahapan'] == 'Fermentasi':
            return jsonify({'error': 'Natural Process tidak melalui Fermentasi'}), 400
        
        # Validasi berat terkini
        beratTerkini = data.get('beratTerkini')
        if not beratTerkini or beratTerkini <= 0:
            return jsonify({'error': 'Berat terkini wajib diisi'}), 400
        if beratTerkini > data['beratAwal']:
            return jsonify({'error': 'Berat terkini tidak boleh > berat awal'}), 400
        
        # Generate ID
        new_id = get_next_id('produksi')
        
        # Initialize history
        historyTahapan = [{
            'statusTahapan': data['statusTahapan'],
            'tanggal': data['tanggalSekarang'],
            'beratAwal': data['beratAwal'],
            'beratTerkini': float(beratTerkini),
            'kadarAir': data['kadarAir']
        }]
        
        # Simpan ke MongoDB
        produksi_data = {
            'id': new_id,
            'idProduksi': data['idProduksi'],
            'idBahan': data['idBahan'],
            'beratAwal': float(data['beratAwal']),
            'beratTerkini': float(beratTerkini),
            'prosesPengolahan': data['prosesPengolahan'],
            'kadarAir': float(data['kadarAir']),
            'varietas': data['varietas'],
            'tanggalMasuk': data['tanggalMasuk'],
            'statusTahapan': data['statusTahapan'],
            'haccp': data['haccp'],
            'historyTahapan': historyTahapan
        }
        
        result = db.produksi.insert_one(produksi_data)
        produksi_data['_id'] = result.inserted_id
        
        return jsonify(json_serialize(produksi_data)), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

**Penjelasan Backend:**
1. **Validasi Field**: Memastikan semua field required ada
2. **Uniqueness Validation**: Validasi `idProduksi` unik
3. **Sisa Bahan Validation**: 
   - Hitung total bahan yang sudah digunakan
   - Bandingkan dengan sisa yang tersedia
   - Return error dengan detail jika tidak cukup
4. **Business Logic Validation**: 
   - Natural Process tidak boleh melalui Fermentasi
   - Berat terkini harus <= berat awal
5. **History Initialization**: Membuat history tahapan pertama
6. **Database Insert**: Simpan ke MongoDB collection `produksi`

---

### Penjelasan Umum

Sistem stok mengelola agregasi stok dari hasil produksi. Stok dihitung berdasarkan kombinasi: tipeProduk + kemasan + jenisKopi + prosesPengolahan + levelRoasting.

### Alur Kerja:
1. Hasil produksi dibuat setelah pengemasan
2. Stok di-agregasi dari hasil produksi (kecuali yang `isFromOrdering: true`)
3. Stok untuk pemesanan dihitung dari produksi yang sudah pengemasan

### Backend - Route Kelola Stok

**Code Backend:**

```python
@app.route('/kelola/stok')
def kelola_stok():
    """Stok management page"""
    return render_template('kelola_stok.html')
```

### 10.1. BACKEND - API STOK

#### GET /api/stok - Get Aggregated Stok

**Code Backend:**

```python
@app.route('/api/stok', methods=['GET'])
def get_stok():
    try:
        hasil_produksi = list(db.hasilProduksi.find())
        
        # Aggregate stok by kombinasi produk
        stok_map = {}
        
        for h in hasil_produksi:
            # Skip hasil produksi dari ordering (mengurangi stok)
            if h.get('isFromOrdering', False) == True:
                continue
            
            # Key: kombinasi produk
            key = f"{h.get('tipeProduk', '')}|{h.get('kemasan', '')}|{h.get('jenisKopi', '')}|{h.get('prosesPengolahan', '')}|{h.get('levelRoasting', '')}"
            
            if key not in stok_map:
                stok_map[key] = {
                    'tipeProduk': h.get('tipeProduk', ''),
                    'kemasan': h.get('kemasan', ''),
                    'jenisKopi': h.get('jenisKopi', ''),
                    'prosesPengolahan': h.get('prosesPengolahan', ''),
                    'levelRoasting': h.get('levelRoasting', ''),
                    'totalBerat': 0,
                    'totalJumlah': 0
                }
            
            stok_map[key]['totalBerat'] += float(h.get('beratSaatIni', 0))
            stok_map[key]['totalJumlah'] += int(h.get('jumlah', 0))
        
        stok_array = list(stok_map.values())
        
        # Sort by tipe produk, jenis kopi, kemasan
        stok_array.sort(key=lambda x: (x['tipeProduk'], x['jenisKopi'], x['kemasan']))
        
        return jsonify(json_serialize(stok_array)), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

**Penjelasan Backend:**
1. **Query Database**: Ambil semua hasil produksi dari MongoDB
2. **Filter**: Skip hasil produksi dengan `isFromOrdering: true` (ini mengurangi stok)
3. **Agregasi**: 
   - Group by kombinasi: tipeProduk + kemasan + jenisKopi + prosesPengolahan + levelRoasting
   - Sum totalBerat dan totalJumlah untuk setiap kombinasi
4. **Sorting**: Sort berdasarkan tipe produk, jenis kopi, kemasan
5. **Response**: Return array stok yang sudah di-agregasi

**Konsep Stok Agregasi:**
- Stok = agregasi dari hasil produksi normal (isFromOrdering: false)
- Hasil produksi dari ordering (isFromOrdering: true) TIDAK masuk ke stok
- Agregasi berdasarkan kombinasi produk untuk memudahkan pencarian

### Frontend - HTML Structure Kelola Stok

**Code Frontend:**

```html
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>Kelola Stok - Argopuro Walida</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" rel="stylesheet" />
</head>
<body>
  <div class="container-fluid">
    <div class="row">
      <div class="col-12">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h2>Kelola Stok</h2>
          <button class="btn btn-primary" onclick="refreshStok()">
            <i class="bi bi-arrow-clockwise"></i> Refresh
          </button>
        </div>

        <!-- Search Input -->
        <div class="mb-3">
          <input type="text" id="searchInput" class="form-control" placeholder="Cari stok..." />
        </div>

        <!-- Stok Table -->
        <div class="table-responsive">
          <table class="table table-striped">
            <thead>
              <tr>
                <th>No</th>
                <th>Tipe Produk</th>
                <th>Kemasan</th>
                <th>Jenis Kopi</th>
                <th>Proses Pengolahan</th>
                <th>Level Roasting</th>
                <th class="text-end">Total Berat (kg)</th>
                <th class="text-end">Total Jumlah</th>
              </tr>
            </thead>
            <tbody id="tableBody">
              <!-- Data akan diisi oleh JavaScript -->
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <script src="{{ url_for('static', filename='js/api-service.js') }}"></script>
  <script src="{{ url_for('static', filename='js/kelola_stok.js') }}"></script>
</body>
</html>
```

**Penjelasan Frontend:**
- Tabel untuk menampilkan stok yang sudah di-agregasi
- Search input untuk filter stok
- Tombol refresh untuk reload data
- Kolom: Tipe Produk, Kemasan, Jenis Kopi, Proses Pengolahan, Level Roasting, Total Berat, Total Jumlah

### Frontend - JavaScript Kelola Stok

**Code Frontend:**

```javascript
// Load dan tampilkan stok
async function displayStok() {
  try {
    // Load stok dari API
    const stokArray = await window.API.Stok.getAll();
    
    const tableBody = document.getElementById("tableBody");
    const searchInput = document.getElementById("searchInput");
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";

    // Filter berdasarkan search
    let filteredStok = stokArray;
    if (searchTerm) {
      filteredStok = stokArray.filter(
        (s) =>
          s.tipeProduk.toLowerCase().includes(searchTerm) ||
          s.kemasan.toLowerCase().includes(searchTerm) ||
          s.jenisKopi.toLowerCase().includes(searchTerm) ||
          s.prosesPengolahan.toLowerCase().includes(searchTerm) ||
          (s.levelRoasting && s.levelRoasting.toLowerCase().includes(searchTerm))
      );
    }

    // Render table
    if (filteredStok.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-5 text-muted">
            <i class="bi bi-inbox fs-1 d-block mb-3"></i>
            <p class="mb-0">Tidak ada data stok</p>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filteredStok
      .map(
        (s, index) => `
      <tr>
        <td class="text-muted">${index + 1}</td>
        <td><span class="badge bg-info">${s.tipeProduk}</span></td>
        <td>${s.kemasan}</td>
        <td><span class="badge bg-primary">${s.jenisKopi}</span></td>
        <td>${s.prosesPengolahan}</td>
        <td>${s.levelRoasting ? `<span class="badge bg-warning">${s.levelRoasting}</span>` : '<span class="text-muted">-</span>'}</td>
        <td class="text-end"><strong class="text-primary">${s.totalBerat.toFixed(2)} kg</strong></td>
        <td class="text-end"><strong class="text-success">${s.totalJumlah} kemasan</strong></td>
      </tr>
    `
      )
      .join("");
  } catch (error) {
    alert("Error memuat data stok: " + error.message);
  }
}

// Refresh stok
async function refreshStok() {
  await displayStok();
  alert("Stok berhasil di-refresh!");
}

// Event listener
document.addEventListener("DOMContentLoaded", () => {
  displayStok();
  
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", displayStok);
  }
});
```

**Penjelasan Frontend:**
- Load stok dari API `/api/stok` yang sudah di-agregasi
- Filter stok berdasarkan search term
- Render table dengan data stok
- Format angka dengan 2 desimal untuk berat
- Badge untuk tipe produk, jenis kopi, dan level roasting
- Auto refresh saat search input berubah

---

## 8. HALAMAN KELOLA HASIL PRODUKSI

### Penjelasan Umum

Halaman Kelola Hasil Produksi digunakan untuk mengelola hasil produksi yang sudah dikemas. Hasil produksi dibuat dari produksi yang sudah masuk tahap Pengemasan.

### Backend - Route Kelola Hasil Produksi

**Code Backend:**

```python
@app.route('/kelola/hasil-produksi')
def kelola_hasil_produksi():
    """Production result management page"""
    return render_template('kelola_hasil_produksi.html')

@app.route('/kelola/hasil-produksi/karyawan')
def kelola_hasil_produksi_karyawan():
    """Production result management page - Karyawan"""
    return render_template('kelola_hasil_produksi_karyawan.html')
```

### Frontend - JavaScript Kelola Hasil Produksi

**Code Frontend:**

```javascript
let hasilProduksi = [];
let currentEditId = null;

// Load data dari API
async function loadHasilProduksiData() {
  try {
    hasilProduksi = await window.API.HasilProduksi.getAll();
    renderHasilProduksiTable();
  } catch (error) {
    alert("Error memuat data hasil produksi: " + error.message);
  }
}

// Load produksi untuk dropdown
async function loadProduksiOptions() {
  try {
    const produksi = await window.API.Produksi.getPengemasan();
    const select = document.getElementById("idProduksi");
    select.innerHTML = '<option value="">Pilih Produksi</option>';
    produksi.forEach((p) => {
      const option = document.createElement("option");
      option.value = p.idProduksi;
      option.textContent = `${p.idProduksi} - ${p.varietas}`;
      select.appendChild(option);
    });
  } catch (error) {
    console.error("Error loading produksi options:", error);
  }
}

// Save hasil produksi
async function saveHasilProduksi() {
  const form = document.getElementById("hasilProduksiForm");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  
  const hasilData = {
    idProduksi: document.getElementById("idProduksi").value,
    tipeProduk: document.getElementById("tipeProduk").value,
    kemasan: document.getElementById("kemasan").value,
    jenisKopi: document.getElementById("jenisKopi").value,
    prosesPengolahan: document.getElementById("prosesPengolahan").value,
    levelRoasting: document.getElementById("levelRoasting").value,
    beratSaatIni: parseFloat(document.getElementById("beratSaatIni").value),
    tanggal: document.getElementById("tanggal").value
  };
  
  try {
    if (currentEditId) {
      await window.API.HasilProduksi.update(currentEditId, hasilData);
      alert("Hasil produksi berhasil diupdate!");
    } else {
      await window.API.HasilProduksi.create(hasilData);
      alert("Hasil produksi berhasil ditambahkan!");
    }
    
    await loadHasilProduksiData();
  } catch (error) {
    alert("Error: " + error.message);
  }
}

// Load saat halaman dimuat
document.addEventListener("DOMContentLoaded", () => {
  loadHasilProduksiData();
  loadProduksiOptions();
});
```

**Penjelasan Frontend:**
- Load data hasil produksi dari API
- Load produksi yang sudah pengemasan untuk dropdown
- Form untuk create/update hasil produksi
- Backend akan calculate jumlah kemasan otomatis

### Backend - API Hasil Produksi

#### POST /api/hasil-produksi - Create Hasil Produksi

**Code Backend:**

```python
@app.route('/api/hasil-produksi', methods=['POST'])
def create_hasil_produksi():
    try:
        data = request.json
        
        # Validasi field required
        required_fields = ['idProduksi', 'tipeProduk', 'kemasan', 'jenisKopi', 
                          'prosesPengolahan', 'tanggal', 'beratSaatIni', 'jumlah']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing field: {field}'}), 400
        
        # Validasi produksi ada dan status Pengemasan
        produksi = db.produksi.find_one({'idProduksi': data['idProduksi']})
        if not produksi:
            return jsonify({'error': 'Produksi not found'}), 404
        
        if 'Pengemasan' not in produksi.get('statusTahapan', ''):
            return jsonify({'error': 'Produksi belum masuk tahap Pengemasan'}), 400
        
        # Validasi berat akhir ada
        beratAkhir = float(produksi.get('beratAkhir', 0))
        if beratAkhir <= 0:
            return jsonify({'error': 'Produksi belum memiliki berat akhir'}), 400
        
        # Validasi sisa tersedia
        hasil_list = list(db.hasilProduksi.find({'idProduksi': data['idProduksi']}))
        total_dikemas = sum(h.get('beratSaatIni', 0) for h in hasil_list)
        sisa_tersedia = max(0, beratAkhir - total_dikemas)
        
        if float(data['beratSaatIni']) > sisa_tersedia:
            return jsonify({
                'error': 'Sisa produksi tidak mencukupi',
                'sisaTersedia': sisa_tersedia
            }), 400
        
        # Calculate jumlah kemasan
        tipe_produk_lower = data.get('tipeProduk', '').lower()
        jumlah = calculate_jumlah_kemasan(
            float(data['beratSaatIni']),
            data['kemasan'],
            tipe_produk_lower
        )
        
        # Generate ID
        new_id = get_next_id('hasilProduksi')
        
        # Simpan ke MongoDB
        hasil_data = {
            'id': new_id,
            'idProduksi': data['idProduksi'],
            'idBahan': produksi.get('idBahan'),
            'tipeProduk': data['tipeProduk'],
            'kemasan': data['kemasan'],
            'jenisKopi': data['jenisKopi'],
            'prosesPengolahan': data['prosesPengolahan'],
            'levelRoasting': data.get('levelRoasting', ''),
            'tanggal': data['tanggal'],
            'beratSaatIni': float(data['beratSaatIni']),
            'jumlah': jumlah,
            'isFromOrdering': data.get('isFromOrdering', False)
        }
        
        result = db.hasilProduksi.insert_one(hasil_data)
        hasil_data['_id'] = result.inserted_id
        
        return jsonify(json_serialize(hasil_data)), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

#### GET /api/hasil-produksi/produksi/<id_produksi> - Get Hasil Produksi by Produksi

**Code Backend:**

```python
@app.route('/api/hasil-produksi/produksi/<id_produksi>', methods=['GET'])
def get_hasil_produksi_by_produksi(id_produksi):
    """Get all hasil produksi by idProduksi"""
    try:
        hasil_list = list(db.hasilProduksi.find({'idProduksi': id_produksi}).sort('id', 1))
        return jsonify(json_serialize(hasil_list)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

**Penjelasan Backend:**
- Mengambil semua hasil produksi berdasarkan `idProduksi`
- Digunakan untuk menampilkan hasil produksi dari suatu produksi tertentu

---

## 9. HALAMAN KELOLA PEMASOK

### Penjelasan Umum

Halaman Kelola Pemasok digunakan untuk mengelola data pemasok bahan baku kopi. Admin dapat menambah, mengedit, menghapus, dan melihat data pemasok.

### Backend - Route Kelola Pemasok

**Code Backend:**

```python
@app.route('/kelola/pemasok')
def kelola_pemasok():
    """Supplier management page"""
    return render_template('kelola_pemasok.html')
```

### Frontend - JavaScript Kelola Pemasok

**Code Frontend:**

```javascript
let pemasok = [];
let currentEditId = null;

// Load data dari API
async function loadPemasokData() {
  try {
    pemasok = await window.API.Pemasok.getAll();
    renderPemasokTable();
  } catch (error) {
    alert("Error memuat data pemasok: " + error.message);
  }
}

// Save pemasok (create/update)
async function savePemasok() {
  const form = document.getElementById("pemasokForm");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  
  const pemasokData = {
    idPemasok: document.getElementById("idPemasok").value,
    nama: document.getElementById("nama").value,
    alamat: document.getElementById("alamat").value,
    kontak: document.getElementById("kontak").value,
    namaPerkebunan: document.getElementById("namaPerkebunan").value,
    status: document.getElementById("status").value
  };
  
  try {
    if (currentEditId) {
      await window.API.Pemasok.update(currentEditId, pemasokData);
      alert("Pemasok berhasil diupdate!");
    } else {
      await window.API.Pemasok.create(pemasokData);
      alert("Pemasok berhasil ditambahkan!");
    }
    
    await loadPemasokData();
  } catch (error) {
    alert("Error: " + error.message);
  }
}

// Load saat halaman dimuat
document.addEventListener("DOMContentLoaded", loadPemasokData);
```

**Penjelasan Frontend:**
- Load data pemasok dari API
- Form untuk create/update pemasok
- Validasi referential integrity di backend (tidak bisa delete jika ada bahan yang menggunakan)

### Backend - API Pemasok

#### GET /api/pemasok - Get All Pemasok

**Code Backend:**

```python
@app.route('/api/pemasok', methods=['GET'])
def get_pemasok():
    """Get all pemasok data"""
    try:
        pemasok = list(db.pemasok.find().sort('id', 1))
        return jsonify(json_serialize(pemasok)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

#### POST /api/pemasok - Create Pemasok

**Code Backend:**

```python
@app.route('/api/pemasok', methods=['POST'])
def create_pemasok():
    try:
        data = request.json
        
        required_fields = ['idPemasok', 'nama', 'alamat', 'kontak', 'namaPerkebunan', 'status']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing field: {field}'}), 400
        
        # Validasi idPemasok unik
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
        
        result = db.pemasok.insert_one(pemasok_data)
        pemasok_data['_id'] = result.inserted_id
        
        return jsonify(json_serialize(pemasok_data)), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

#### DELETE /api/pemasok/<pemasok_id> - Delete Pemasok

**Code Backend:**

```python
@app.route('/api/pemasok/<pemasok_id>', methods=['DELETE'])
def delete_pemasok(pemasok_id):
    try:
        pemasok = db.pemasok.find_one({'idPemasok': pemasok_id}) or \
                 db.pemasok.find_one({'_id': ObjectId(pemasok_id)})
        
        if not pemasok:
            return jsonify({'error': 'Pemasok not found'}), 404
        
        # Validasi referential integrity
        bahan_count = db.bahan.count_documents({'pemasok': pemasok.get('nama')})
        if bahan_count > 0:
            return jsonify({
                'error': f'Cannot delete. {bahan_count} bahan using this pemasok'
            }), 400
        
        db.pemasok.delete_one({'_id': pemasok['_id']})
        return jsonify({'message': 'Pemasok deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

---

## 10. HALAMAN KELOLA STOK

### Penjelasan Umum

Sistem stok mengelola agregasi stok dari hasil produksi. Stok dihitung berdasarkan kombinasi: tipeProduk + kemasan + jenisKopi + prosesPengolahan + levelRoasting.

### Alur Kerja:
1. Hasil produksi dibuat setelah pengemasan
2. Stok di-agregasi dari hasil produksi (kecuali yang `isFromOrdering: true`)
3. Stok untuk pemesanan dihitung dari produksi yang sudah pengemasan

### Backend - Route Kelola Stok

**Code Backend:**

```python
@app.route('/kelola/stok')
def kelola_stok():
    """Stok management page"""
    return render_template('kelola_stok.html')
```

### 10.1. BACKEND - API STOK

#### GET /api/stok - Get Aggregated Stok

**Code Backend:**

```python
@app.route('/api/stok', methods=['GET'])
def get_stok():
    try:
        hasil_produksi = list(db.hasilProduksi.find())
        
        # Aggregate stok by kombinasi produk
        stok_map = {}
        
        for h in hasil_produksi:
            # Skip hasil produksi dari ordering (mengurangi stok)
            if h.get('isFromOrdering', False) == True:
                continue
            
            # Key: kombinasi produk
            key = f"{h.get('tipeProduk', '')}|{h.get('kemasan', '')}|{h.get('jenisKopi', '')}|{h.get('prosesPengolahan', '')}|{h.get('levelRoasting', '')}"
            
            if key not in stok_map:
                stok_map[key] = {
                    'tipeProduk': h.get('tipeProduk', ''),
                    'kemasan': h.get('kemasan', ''),
                    'jenisKopi': h.get('jenisKopi', ''),
                    'prosesPengolahan': h.get('prosesPengolahan', ''),
                    'levelRoasting': h.get('levelRoasting', ''),
                    'totalBerat': 0,
                    'totalJumlah': 0
                }
            
            stok_map[key]['totalBerat'] += float(h.get('beratSaatIni', 0))
            stok_map[key]['totalJumlah'] += int(h.get('jumlah', 0))
        
        stok_array = list(stok_map.values())
        
        # Sort by tipe produk, jenis kopi, kemasan
        stok_array.sort(key=lambda x: (x['tipeProduk'], x['jenisKopi'], x['kemasan']))
        
        return jsonify(json_serialize(stok_array)), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

**Penjelasan Backend:**
1. **Query Database**: Ambil semua hasil produksi dari MongoDB
2. **Filter**: Skip hasil produksi dengan `isFromOrdering: true` (ini mengurangi stok)
3. **Agregasi**: 
   - Group by kombinasi: tipeProduk + kemasan + jenisKopi + prosesPengolahan + levelRoasting
   - Sum totalBerat dan totalJumlah untuk setiap kombinasi
4. **Sorting**: Sort berdasarkan tipe produk, jenis kopi, kemasan
5. **Response**: Return array stok yang sudah di-agregasi

**Konsep Stok Agregasi:**
- Stok = agregasi dari hasil produksi normal (isFromOrdering: false)
- Hasil produksi dari ordering (isFromOrdering: true) TIDAK masuk ke stok
- Agregasi berdasarkan kombinasi produk untuk memudahkan pencarian

### Frontend - HTML Structure Kelola Stok

**Code Frontend:**

```html
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>Kelola Stok - Argopuro Walida</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" rel="stylesheet" />
</head>
<body>
  <div class="container-fluid">
    <div class="row">
      <div class="col-12">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h2>Kelola Stok</h2>
          <button class="btn btn-primary" onclick="refreshStok()">
            <i class="bi bi-arrow-clockwise"></i> Refresh
          </button>
        </div>

        <!-- Search Input -->
        <div class="mb-3">
          <input type="text" id="searchInput" class="form-control" placeholder="Cari stok..." />
        </div>

        <!-- Stok Table -->
        <div class="table-responsive">
          <table class="table table-striped">
            <thead>
              <tr>
                <th>No</th>
                <th>Tipe Produk</th>
                <th>Kemasan</th>
                <th>Jenis Kopi</th>
                <th>Proses Pengolahan</th>
                <th>Level Roasting</th>
                <th class="text-end">Total Berat (kg)</th>
                <th class="text-end">Total Jumlah</th>
              </tr>
            </thead>
            <tbody id="tableBody">
              <!-- Data akan diisi oleh JavaScript -->
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <script src="{{ url_for('static', filename='js/api-service.js') }}"></script>
  <script src="{{ url_for('static', filename='js/kelola_stok.js') }}"></script>
</body>
</html>
```

**Penjelasan Frontend:**
- Tabel untuk menampilkan stok yang sudah di-agregasi
- Search input untuk filter stok
- Tombol refresh untuk reload data
- Kolom: Tipe Produk, Kemasan, Jenis Kopi, Proses Pengolahan, Level Roasting, Total Berat, Total Jumlah

### Frontend - JavaScript Kelola Stok

**Code Frontend:**

```javascript
// Load dan tampilkan stok
async function displayStok() {
  try {
    // Load stok dari API
    const stokArray = await window.API.Stok.getAll();
    
    const tableBody = document.getElementById("tableBody");
    const searchInput = document.getElementById("searchInput");
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";

    // Filter berdasarkan search
    let filteredStok = stokArray;
    if (searchTerm) {
      filteredStok = stokArray.filter(
        (s) =>
          s.tipeProduk.toLowerCase().includes(searchTerm) ||
          s.kemasan.toLowerCase().includes(searchTerm) ||
          s.jenisKopi.toLowerCase().includes(searchTerm) ||
          s.prosesPengolahan.toLowerCase().includes(searchTerm) ||
          (s.levelRoasting && s.levelRoasting.toLowerCase().includes(searchTerm))
      );
    }

    // Render table
    if (filteredStok.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-5 text-muted">
            <i class="bi bi-inbox fs-1 d-block mb-3"></i>
            <p class="mb-0">Tidak ada data stok</p>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filteredStok
      .map(
        (s, index) => `
      <tr>
        <td class="text-muted">${index + 1}</td>
        <td><span class="badge bg-info">${s.tipeProduk}</span></td>
        <td>${s.kemasan}</td>
        <td><span class="badge bg-primary">${s.jenisKopi}</span></td>
        <td>${s.prosesPengolahan}</td>
        <td>${s.levelRoasting ? `<span class="badge bg-warning">${s.levelRoasting}</span>` : '<span class="text-muted">-</span>'}</td>
        <td class="text-end"><strong class="text-primary">${s.totalBerat.toFixed(2)} kg</strong></td>
        <td class="text-end"><strong class="text-success">${s.totalJumlah} kemasan</strong></td>
      </tr>
    `
      )
      .join("");
  } catch (error) {
    alert("Error memuat data stok: " + error.message);
  }
}

// Refresh stok
async function refreshStok() {
  await displayStok();
  alert("Stok berhasil di-refresh!");
}

// Event listener
document.addEventListener("DOMContentLoaded", () => {
  displayStok();
  
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", displayStok);
  }
});
```

**Penjelasan Frontend:**
- Load stok dari API `/api/stok` yang sudah di-agregasi
- Filter stok berdasarkan search term
- Render table dengan data stok
- Format angka dengan 2 desimal untuk berat
- Badge untuk tipe produk, jenis kopi, dan level roasting
- Auto refresh saat search input berubah

---

## 11. HALAMAN KELOLA KEUANGAN

### Penjelasan Umum

Halaman Kelola Keuangan digunakan untuk mengelola data keuangan perusahaan, termasuk pengeluaran untuk bahan baku dan operasional.

### Backend - Route Kelola Keuangan

**Code Backend:**

```python
@app.route('/kelola/keuangan')
def kelola_keuangan():
    """Financial management page"""
    return render_template('kelola_keuangan.html')
```

### Frontend - JavaScript Kelola Keuangan

**Code Frontend:**

```javascript
let keuangan = [];
let currentEditId = null;

// Load data dari API
async function loadKeuanganData() {
  try {
    keuangan = await window.API.Keuangan.getAll();
    renderKeuanganTable();
  } catch (error) {
    alert("Error memuat data keuangan: " + error.message);
  }
}

// Save keuangan
async function saveKeuangan() {
  const form = document.getElementById("keuanganForm");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  
  const keuanganData = {
    tanggal: document.getElementById("tanggal").value,
    jenisPengeluaran: document.getElementById("jenisPengeluaran").value,
    idBahanBaku: document.getElementById("idBahanBaku").value,
    nilai: parseFloat(document.getElementById("nilai").value),
    notes: document.getElementById("notes").value.trim()
  };
  
  // Validasi notes wajib
  if (!keuanganData.notes) {
    alert("Notes wajib diisi!");
    return;
  }
  
  try {
    if (currentEditId) {
      await window.API.Keuangan.update(currentEditId, keuanganData);
      alert("Data keuangan berhasil diupdate!");
    } else {
      await window.API.Keuangan.create(keuanganData);
      alert("Data keuangan berhasil ditambahkan!");
    }
    
    await loadKeuanganData();
  } catch (error) {
    alert("Error: " + error.message);
  }
}

// Load saat halaman dimuat
document.addEventListener("DOMContentLoaded", loadKeuanganData);
```

**Penjelasan Frontend:**
- Load data keuangan dari API
- Form untuk create/update keuangan
- Validasi notes wajib diisi (frontend dan backend)

### Backend - API Keuangan

#### GET /api/keuangan - Get All Keuangan

**Code Backend:**

```python
@app.route('/api/keuangan', methods=['GET'])
def get_keuangan():
    """Get all keuangan data"""
    try:
        keuangan = list(db.keuangan.find().sort('id', 1))
        return jsonify(json_serialize(keuangan)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

#### POST /api/keuangan - Create Keuangan

**Code Backend:**

```python
@app.route('/api/keuangan', methods=['POST'])
def create_keuangan():
    try:
        data = request.json
        
        # Validasi notes wajib
        notes = data.get('notes', '').strip()
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
        
        result = db.keuangan.insert_one(keuangan_data)
        keuangan_data['_id'] = result.inserted_id
        
        return jsonify(json_serialize(keuangan_data)), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

---

## 12. HALAMAN KELOLA DATA (MASTER DATA)

### Penjelasan Umum

Halaman Kelola Data digunakan untuk mengelola master data seperti jenis kopi, varietas, proses pengolahan, level roasting, kemasan, dan tipe produk. Data ini digunakan sebagai referensi di seluruh sistem.

### Backend - Route Kelola Data

**Code Backend:**

```python
@app.route('/kelola/data')
def kelola_data():
    """Master data management page"""
    return render_template('kelola_data.html')
```

### Frontend - JavaScript Kelola Data

**Code Frontend:**

```javascript
// Master data collections
const masterDataTypes = [
  { name: 'dataJenisKopi', label: 'Jenis Kopi', fields: ['nama'] },
  { name: 'dataVarietas', label: 'Varietas', fields: ['nama'] },
  { name: 'dataProses', label: 'Proses Pengolahan', fields: ['nama'] },
  { name: 'dataRoasting', label: 'Level Roasting', fields: ['nama'] },
  { name: 'dataKemasan', label: 'Kemasan', fields: ['nama', 'ukuran'] },
  { name: 'dataProduk', label: 'Tipe Produk', fields: ['nama'] }
];

let currentDataType = null;
let currentData = [];

// Load data berdasarkan type
async function loadMasterData(type) {
  try {
    currentDataType = type;
    const apiName = type.charAt(0).toUpperCase() + type.slice(1);
    currentData = await window.API[apiName].getAll();
    renderMasterDataTable();
  } catch (error) {
    alert("Error memuat data: " + error.message);
  }
}

// Save master data
async function saveMasterData() {
  const form = document.getElementById("masterDataForm");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  
  const data = {
    nama: document.getElementById("nama").value
  };
  
  // Jika ada field ukuran (untuk kemasan)
  const ukuranInput = document.getElementById("ukuran");
  if (ukuranInput) {
    data.ukuran = ukuranInput.value;
  }
  
  try {
    const apiName = currentDataType.charAt(0).toUpperCase() + currentDataType.slice(1);
    if (currentEditId) {
      await window.API[apiName].update(currentEditId, data);
      alert("Data berhasil diupdate!");
    } else {
      await window.API[apiName].create(data);
      alert("Data berhasil ditambahkan!");
    }
    
    await loadMasterData(currentDataType);
  } catch (error) {
    alert("Error: " + error.message);
  }
}

// Load saat halaman dimuat
document.addEventListener("DOMContentLoaded", () => {
  // Load jenis kopi sebagai default
  loadMasterData('dataJenisKopi');
});
```

**Penjelasan Frontend:**
- Dynamic loading untuk semua jenis master data
- Form yang menyesuaikan dengan field yang diperlukan
- Field `ukuran` khusus untuk kemasan
- CRUD operations untuk semua master data

### Backend - Dynamic Master Data Endpoints

**Code Backend:**

```python
def get_master_data_endpoints(collection_name, fields):
    """Helper to create CRUD endpoints for master data"""
    
    @app.route(f'/api/{collection_name}', methods=['GET'])
    def get_all():
        try:
            data = list(db[collection_name].find().sort('id', 1))
            return jsonify(json_serialize(data)), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    @app.route(f'/api/{collection_name}', methods=['POST'])
    def create():
        try:
            data = request.json
            for field in fields:
                if field not in data:
                    return jsonify({'error': f'Missing field: {field}'}), 400
            
            # Validasi nama unik
            if 'nama' in fields:
                existing = db[collection_name].find_one({'nama': data['nama']})
                if existing:
                    return jsonify({'error': 'Nama already exists'}), 400
            
            new_id = get_next_id(collection_name)
            item_data = {'id': new_id}
            for field in fields:
                item_data[field] = data[field]
            
            if 'ukuran' in data:
                item_data['ukuran'] = data['ukuran']
            
            result = db[collection_name].insert_one(item_data)
            item_data['_id'] = result.inserted_id
            return jsonify(json_serialize(item_data)), 201
        except Exception as e:
            return jsonify({'error': str(e)}), 500

# Create master data endpoints
get_master_data_endpoints('dataJenisKopi', ['nama'])
get_master_data_endpoints('dataVarietas', ['nama'])
get_master_data_endpoints('dataProses', ['nama'])
get_master_data_endpoints('dataRoasting', ['nama'])
get_master_data_endpoints('dataKemasan', ['nama', 'ukuran'])
get_master_data_endpoints('dataProduk', ['nama'])
```

**Penjelasan Backend:**
- Fungsi `get_master_data_endpoints()` membuat CRUD endpoints secara dinamis
- Setiap master data memiliki collection terpisah
- Endpoints yang dibuat: GET, POST, PUT, DELETE untuk setiap collection
- Validasi nama unik untuk master data

---

## 13. HALAMAN KELOLA SANITASI

### Penjelasan Umum

Halaman Kelola Sanitasi digunakan untuk mengelola data sanitasi dan kebersihan fasilitas produksi. Data sanitasi dapat dilengkapi dengan foto dan checklist.

### Backend - Route Kelola Sanitasi

**Code Backend:**

```python
@app.route('/kelola/sanitasi')
def kelola_sanitasi():
    """Sanitation management page"""
    return render_template('kelola_sanitasi.html')

@app.route('/kelola/sanitasi/karyawan')
def kelola_sanitasi_karyawan():
    """Sanitation management page - Karyawan"""
    return render_template('kelola_sanitasi_karyawan.html')
```

### Frontend - JavaScript Kelola Sanitasi

**Code Frontend:**

```javascript
let sanitasi = [];
let currentEditId = null;

// Load data dari API (exclude fotos untuk performa)
async function loadSanitasiData() {
  try {
    sanitasi = await window.API.Sanitasi.getAll({ exclude_fotos: true });
    renderSanitasiTable();
  } catch (error) {
    alert("Error memuat data sanitasi: " + error.message);
  }
}

// Save sanitasi
async function saveSanitasi() {
  const form = document.getElementById("sanitasiForm");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  
  // Convert foto files to base64
  const fotoInput = document.getElementById("fotos");
  const fotos = {};
  if (fotoInput && fotoInput.files.length > 0) {
    for (let i = 0; i < fotoInput.files.length; i++) {
      const file = fotoInput.files[i];
      const base64 = await fileToBase64(file);
      fotos[`foto${i + 1}`] = base64;
    }
  }
  
  const sanitasiData = {
    tanggal: document.getElementById("tanggal").value,
    waktu: document.getElementById("waktu").value,
    tipe: document.getElementById("tipe").value,
    namaPetugas: document.getElementById("namaPetugas").value,
    fotos: fotos,
    checklist: getChecklistData(),
    status: document.getElementById("status").value
  };
  
  try {
    if (currentEditId) {
      await window.API.Sanitasi.update(currentEditId, sanitasiData);
      alert("Data sanitasi berhasil diupdate!");
    } else {
      await window.API.Sanitasi.create(sanitasiData);
      alert("Data sanitasi berhasil ditambahkan!");
    }
    
    await loadSanitasiData();
  } catch (error) {
    alert("Error: " + error.message);
  }
}

// Helper: Convert file to base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Load saat halaman dimuat
document.addEventListener("DOMContentLoaded", loadSanitasiData);
```

**Penjelasan Frontend:**
- Load data sanitasi dengan exclude fotos untuk performa
- Form untuk create/update sanitasi dengan upload foto
- Foto di-convert ke base64 sebelum dikirim ke backend
- Checklist data diambil dari form checkbox

### Backend - API Sanitasi

#### GET /api/sanitasi - Get All Sanitasi

**Code Backend:**

```python
@app.route('/api/sanitasi', methods=['GET'])
def get_sanitasi():
    """Get all sanitasi data - Optimized for performance"""
    try:
        # Optional: exclude fotos for list view
        exclude_fotos = request.args.get('exclude_fotos', 'false').lower() == 'true'
        
        if exclude_fotos:
            # Exclude fotos to reduce payload size
            sanitasi = list(db.sanitasi.find({}, {'fotos': 0, '_id': 0}).sort('id', 1))
        else:
            sanitasi = list(db.sanitasi.find({}, {'_id': 0}).sort('id', 1))
        
        return jsonify(json_serialize(sanitasi)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

**Penjelasan Backend:**
- Query parameter `exclude_fotos=true` untuk exclude foto dari response (mengurangi payload)
- Foto disimpan sebagai base64 string yang bisa sangat besar
- Untuk list view, exclude foto untuk performa lebih baik

#### POST /api/sanitasi - Create Sanitasi

**Code Backend:**

```python
@app.route('/api/sanitasi', methods=['POST'])
def create_sanitasi():
    try:
        data = request.json
        
        new_id = get_next_id('sanitasi')
        
        sanitasi_data = {
            'id': new_id,
            'tanggal': data.get('tanggal'),
            'waktu': data.get('waktu'),
            'tipe': data.get('tipe'),
            'namaPetugas': data.get('namaPetugas'),
            'fotos': data.get('fotos', {}),  # Base64 encoded images
            'checklist': data.get('checklist', {}),
            'status': data.get('status', 'Uncomplete')
        }
        
        result = db.sanitasi.insert_one(sanitasi_data)
        sanitasi_data['_id'] = result.inserted_id
        
        return jsonify(json_serialize(sanitasi_data)), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

---

## 14. HALAMAN KELOLA LAPORAN

### Penjelasan Umum

Halaman Kelola Laporan digunakan untuk mengelola laporan PDF yang di-generate dari data produksi, hasil produksi, dan data lainnya. Laporan dapat di-upload dan di-download.

### Backend - Route Kelola Laporan

**Code Backend:**

```python
@app.route('/kelola/laporan')
def kelola_laporan():
    """Report page"""
    return render_template('kelola_laporan.html')

@app.route('/kelola/laporan/owner')
def kelola_laporan_owner():
    """Report page - Owner"""
    return render_template('kelola_laporan_owner.html')
```

### Frontend - JavaScript Kelola Laporan

**Code Frontend:**

```javascript
// Generate dan upload laporan PDF
async function generateAndUploadLaporan(type, itemId, data) {
  try {
    // Generate PDF menggunakan jsPDF atau library lain
    const pdfDoc = new jsPDF();
    
    // Add content to PDF
    pdfDoc.text(`Laporan ${type}`, 10, 10);
    // ... add more content based on data
    
    // Convert PDF to base64
    const pdfBase64 = pdfDoc.output('datauristring');
    
    // Upload ke server
    const response = await fetch('/api/laporan/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pdfData: pdfBase64,
        type: type,
        id: itemId
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      alert("Laporan berhasil di-generate dan di-upload!");
      // Open PDF in new tab
      window.open(result.url, '_blank');
    }
  } catch (error) {
    alert("Error generating laporan: " + error.message);
  }
}

// List laporan PDF
async function loadLaporanList(type, itemId) {
  try {
    const response = await fetch(`/api/laporan/list?type=${type}&id=${itemId}`);
    const laporanList = await response.json();
    
    renderLaporanList(laporanList);
  } catch (error) {
    console.error("Error loading laporan list:", error);
  }
}
```

**Penjelasan Frontend:**
- Generate PDF menggunakan jsPDF atau library PDF lainnya
- Convert PDF ke base64 untuk upload
- Upload PDF ke server via API
- List dan download laporan PDF yang sudah tersimpan

### Backend - API Laporan

#### POST /api/laporan/upload - Upload Laporan PDF

**Code Backend:**

```python
@app.route('/api/laporan/upload', methods=['POST'])
def upload_laporan_pdf():
    """Upload PDF laporan ke server"""
    try:
        data = request.json
        
        required_fields = ['pdfData', 'type', 'id']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing field: {field}'}), 400
        
        pdf_type = data['type']
        item_id = data['id']
        pdf_data = data['pdfData']  # Base64 encoded PDF
        
        # Extract base64 data
        if ',' in pdf_data:
            pdf_base64 = pdf_data.split(',')[1]
        else:
            pdf_base64 = pdf_data
        
        # Decode base64 to bytes
        pdf_bytes = base64.b64decode(pdf_base64)
        
        # Validasi PDF format
        if not pdf_bytes.startswith(b'%PDF'):
            return jsonify({'error': 'Invalid PDF file format'}), 400
        
        # Buat folder static/laporan jika belum ada
        laporan_dir = join(dirname(__file__), 'static', 'laporan')
        if not exists(laporan_dir):
            os.makedirs(laporan_dir)
        
        # Generate filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'laporan_{pdf_type}_{item_id}_{timestamp}.pdf'
        filepath = join(laporan_dir, filename)
        
        # Simpan file PDF
        with open(filepath, 'wb') as f:
            f.write(pdf_bytes)
        
        # Simpan metadata ke MongoDB
        db.laporanPdf.insert_one({
            'type': pdf_type,
            'itemId': item_id,
            'filename': filename,
            'url': f"/static/laporan/{filename}",
            'createdAt': datetime.now(),
            'fileSize': len(pdf_bytes)
        })
        
        return jsonify({
            'success': True,
            'url': f"/static/laporan/{filename}",
            'filename': filename
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

#### GET /api/laporan/list - List Laporan PDF

**Code Backend:**

```python
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
```

---

## 15. HALAMAN KELOLA PEMESANAN

### Penjelasan Umum

Halaman Kelola Pemesanan digunakan untuk mengelola pemesanan dari customer. Pemesanan hanya mencatat permintaan dan tidak mengurangi stok. Stok dikurangi saat proses ordering.

### Backend - Route Kelola Pemesanan

**Code Backend:**

```python
@app.route('/kelola/pemesanan')
def kelola_pemesanan():
    """Pemesanan management page"""
    return render_template('kelola_pemesanan.html')
```

### Frontend - JavaScript Kelola Pemesanan

**Code Frontend:**

```javascript
let pemesanan = [];
let stokList = [];

// Load data dari API
async function loadPemesananData() {
  try {
    pemesanan = await window.API.Pemesanan.getAll();
    renderPemesananTable();
  } catch (error) {
    alert("Error memuat data pemesanan: " + error.message);
  }
}

// Load stok untuk pemesanan
async function loadStokForPemesanan() {
  try {
    stokList = await window.API.Pemesanan.getStok();
    // Populate dropdown stok
    const select = document.getElementById("idProduksi");
    select.innerHTML = '<option value="">Pilih Produksi</option>';
    stokList.forEach((s) => {
      const option = document.createElement("option");
      option.value = s.idProduksi;
      option.textContent = `${s.idProduksi} - ${s.jenisKopi} (Stok: ${s.stokTersedia} kg)`;
      select.appendChild(option);
    });
  } catch (error) {
    console.error("Error loading stok:", error);
  }
}

// Save pemesanan
async function savePemesanan() {
  const form = document.getElementById("pemesananForm");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  
  const pemesananData = {
    idPembelian: document.getElementById("idPembelian").value,
    namaPembeli: document.getElementById("namaPembeli").value,
    tipePemesanan: document.getElementById("tipePemesanan").value,
    tipeProduk: document.getElementById("tipeProduk").value,
    prosesPengolahan: document.getElementById("prosesPengolahan").value,
    jenisKopi: document.getElementById("jenisKopi").value,
    kemasan: document.getElementById("kemasan").value,
    jumlahPesananKg: parseFloat(document.getElementById("jumlahPesananKg").value),
    hargaPerKg: parseFloat(document.getElementById("hargaPerKg").value),
    totalHarga: parseFloat(document.getElementById("jumlahPesananKg").value) * 
                parseFloat(document.getElementById("hargaPerKg").value),
    statusPemesanan: "Ordering"
  };
  
  // Jika International, tambahkan negara
  if (pemesananData.tipePemesanan === "International") {
    pemesananData.negara = document.getElementById("negara").value;
  }
  
  try {
    if (currentEditId) {
      await window.API.Pemesanan.update(currentEditId, pemesananData);
      alert("Pemesanan berhasil diupdate!");
    } else {
      await window.API.Pemesanan.create(pemesananData);
      alert("Pemesanan berhasil ditambahkan!");
    }
    
    await loadPemesananData();
  } catch (error) {
    alert("Error: " + error.message);
  }
}

// Proses ordering (mengurangi stok)
async function prosesOrdering(idPembelian, idProduksi) {
  if (!confirm("Apakah Anda yakin ingin memproses pemesanan ini? Stok akan dikurangi.")) {
    return;
  }
  
  try {
    const result = await window.API.Ordering.proses({
      idPembelian: idPembelian,
      idProduksi: idProduksi,
      tanggalOrdering: new Date().toISOString().split('T')[0]
    });
    
    if (result.success) {
      alert(`Ordering berhasil diproses!\nStok sebelum: ${result.stokSebelum} kg\nStok sesudah: ${result.stokSesudah} kg`);
      await loadPemesananData();
    }
  } catch (error) {
    alert("Error: " + error.message);
  }
}

// Load saat halaman dimuat
document.addEventListener("DOMContentLoaded", () => {
  loadPemesananData();
  loadStokForPemesanan();
});
```

**Penjelasan Frontend:**
- Load data pemesanan dari API
- Load stok tersedia untuk dropdown produksi
- Form untuk create/update pemesanan
- Tombol "Proses Ordering" untuk mengurangi stok
- Validasi total harga calculation

### Backend - API Pemesanan

#### GET /api/pemesanan - Get All Pemesanan

**Code Backend:**

```python
@app.route('/api/pemesanan', methods=['GET'])
def get_pemesanan():
    """Get all pemesanan data"""
    try:
        pemesanan = list(db.pemesanan.find().sort('id', 1))
        return jsonify(json_serialize(pemesanan)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

#### POST /api/pemesanan - Create Pemesanan

**Code Backend:**

```python
@app.route('/api/pemesanan', methods=['POST'])
def create_pemesanan():
    """
    Create new pemesanan - HANYA PENCATATAN PERMINTAAN
    Endpoint ini TIDAK BOLEH mengurangi stok.
    """
    try:
        data = request.json
        
        required_fields = ['idPembelian', 'namaPembeli', 'tipePemesanan', 'tipeProduk', 
                          'prosesPengolahan', 'jenisKopi', 'kemasan', 'jumlahPesananKg', 
                          'hargaPerKg', 'totalHarga', 'statusPemesanan']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing field: {field}'}), 400
        
        # Validasi International requires negara
        if data['tipePemesanan'] == 'International' and not data.get('negara'):
            return jsonify({'error': 'Negara wajib diisi untuk pemesanan International'}), 400
        
        # Validasi harga dan jumlah > 0
        if float(data['jumlahPesananKg']) <= 0:
            return jsonify({'error': 'Jumlah pesanan harus > 0'}), 400
        
        # Validasi totalHarga calculation
        jumlah_pesanan = float(data['jumlahPesananKg'])
        harga_per_kg = float(data['hargaPerKg'])
        total_harga_received = float(data['totalHarga'])
        calculated_total = jumlah_pesanan * harga_per_kg
        
        if abs(total_harga_received - calculated_total) > 0.01:
            return jsonify({'error': 'Total harga tidak sesuai'}), 400
        
        # Validasi idPembelian unik
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
            'kemasan': data['kemasan'],
            'jumlahPesananKg': jumlah_pesanan,
            'hargaPerKg': harga_per_kg,
            'totalHarga': total_harga_received,
            'statusPemesanan': data['statusPemesanan'],
            'tanggalPemesanan': data.get('tanggalPemesanan', datetime.now().strftime('%Y-%m-%d')),
            'createdAt': datetime.now(),
            'updatedAt': datetime.now()
        }
        
        result = db.pemesanan.insert_one(pemesanan_data)
        pemesanan_data['_id'] = result.inserted_id
        
        return jsonify(json_serialize(pemesanan_data)), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

#### GET /api/pemesanan/stok - Get Stok untuk Pemesanan

**Code Backend:**

```python
@app.route('/api/pemesanan/stok', methods=['GET'])
def get_stok_for_pemesanan():
    """Get stok available for pemesanan"""
    try:
        # Get produksi with berat akhir
        produksi_list = list(db.produksi.find({
            'statusTahapan': {'$regex': 'Pengemasan', '$options': 'i'}
        }))
        
        produksi_list = [p for p in produksi_list if float(p.get('beratAkhir', 0)) > 0]
        
        stok_list = []
        for produksi in produksi_list:
            id_produksi = produksi.get('idProduksi')
            berat_akhir = float(produksi.get('beratAkhir', 0))
            
            # Hitung stok tersedia
            hasil_produksi_list = list(db.hasilProduksi.find({'idProduksi': id_produksi}))
            total_dari_ordering = sum(
                float(h.get('beratSaatIni', 0)) 
                for h in hasil_produksi_list 
                if h.get('isFromOrdering', False) == True
            )
            stok_tersedia = max(0, berat_akhir - total_dari_ordering)
            
            # Get jenis kopi from bahan
            bahan = db.bahan.find_one({'idBahan': produksi.get('idBahan')})
            jenis_kopi = bahan.get('jenisKopi', '') if bahan else ''
            
            stok_list.append({
                'idProduksi': str(id_produksi),
                'jenisKopi': jenis_kopi,
                'prosesPengolahan': produksi.get('prosesPengolahan', ''),
                'stokTersedia': float(stok_tersedia)
            })
        
        return jsonify(json_serialize(stok_list)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

---

## 16. HALAMAN PROFILE

### Penjelasan Umum

Halaman Profile digunakan untuk melihat dan mengedit profil user yang sedang login. Terdapat 3 versi: Admin, Karyawan, dan Owner.

### Backend - Route Profile

**Code Backend:**

```python
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
```

### Frontend - JavaScript Profile

**Code Frontend:**

```javascript
let currentUser = null;

// Load user profile
async function loadUserProfile() {
  try {
    // Get user ID from session
    const sessionResponse = await fetch('/api/auth/session');
    const sessionData = await sessionResponse.json();
    
    if (sessionData.logged_in) {
      currentUser = await window.API.Users.getById(sessionData.user_id);
      fillProfileForm();
    }
  } catch (error) {
    alert("Error memuat profil: " + error.message);
  }
}

// Fill form dengan data user
function fillProfileForm() {
  if (!currentUser) return;
  
  document.getElementById("namaLengkap").value = currentUser.namaLengkap || "";
  document.getElementById("email").value = currentUser.email || "";
  document.getElementById("noTelepon").value = currentUser.noTelepon || "";
  document.getElementById("tanggalLahir").value = currentUser.tanggalLahir || "";
  document.getElementById("jenisKelamin").value = currentUser.jenisKelamin || "";
  document.getElementById("alamat").value = currentUser.alamat || "";
}

// Update profile
async function updateProfile() {
  const form = document.getElementById("profileForm");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  
  const userData = {
    namaLengkap: document.getElementById("namaLengkap").value,
    email: document.getElementById("email").value,
    noTelepon: document.getElementById("noTelepon").value,
    tanggalLahir: document.getElementById("tanggalLahir").value,
    jenisKelamin: document.getElementById("jenisKelamin").value,
    alamat: document.getElementById("alamat").value
  };
  
  // Jika password diisi, tambahkan
  const password = document.getElementById("password").value;
  if (password) {
    userData.password = password;
  }
  
  try {
    await window.API.Users.update(currentUser._id || currentUser.id, userData);
    alert("Profil berhasil diupdate!");
    await loadUserProfile();
  } catch (error) {
    alert("Error: " + error.message);
  }
}

// Load saat halaman dimuat
document.addEventListener("DOMContentLoaded", loadUserProfile);
```

**Penjelasan Frontend:**
- Load user profile dari session
- Form untuk update profil user
- Password optional (hanya di-update jika diisi)
- Update menggunakan API Users PUT

---

## 17. HALAMAN PENGATURAN

### Penjelasan Umum

Halaman Pengaturan digunakan untuk mengelola pengaturan aplikasi seperti nama aplikasi, nama perusahaan, alamat, kontak, dll.

### Backend - Route Pengaturan

**Code Backend:**

```python
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
```

### Frontend - JavaScript Pengaturan

**Code Frontend:**

```javascript
// Load settings
async function loadSettings() {
  try {
    const settings = await window.API.Settings.get();
    fillSettingsForm(settings);
  } catch (error) {
    alert("Error memuat pengaturan: " + error.message);
  }
}

// Fill form dengan settings
function fillSettingsForm(settings) {
  document.getElementById("appName").value = settings.appName || "";
  document.getElementById("companyName").value = settings.companyName || "";
  document.getElementById("address").value = settings.address || "";
  document.getElementById("phone").value = settings.phone || "";
  document.getElementById("email").value = settings.email || "";
}

// Save settings
async function saveSettings() {
  const form = document.getElementById("settingsForm");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  
  const settingsData = {
    appName: document.getElementById("appName").value,
    companyName: document.getElementById("companyName").value,
    address: document.getElementById("address").value,
    phone: document.getElementById("phone").value,
    email: document.getElementById("email").value
  };
  
  try {
    await window.API.Settings.save(settingsData);
    alert("Pengaturan berhasil disimpan!");
    await loadSettings();
  } catch (error) {
    alert("Error: " + error.message);
  }
}

// Load saat halaman dimuat
document.addEventListener("DOMContentLoaded", loadSettings);
```

**Penjelasan Frontend:**
- Load settings dari API
- Form untuk update pengaturan aplikasi
- Settings disimpan dengan `_id: 'app_settings'` di MongoDB

### Backend - API Settings

#### GET /api/settings - Get Settings

**Code Backend:**

```python
@app.route('/api/settings', methods=['GET'])
def get_settings():
    """Get application settings"""
    try:
        settings = db.settings.find_one({'_id': 'app_settings'})
        if not settings:
            # Return default settings
            return jsonify({
                'appName': 'Coffee Management System',
                'companyName': '',
                'address': '',
                'phone': '',
                'email': ''
            }), 200
        
        settings.pop('_id', None)
        return jsonify(json_serialize(settings)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

#### POST/PUT /api/settings - Save Settings

**Code Backend:**

```python
@app.route('/api/settings', methods=['POST', 'PUT'])
def save_settings():
    """Save application settings"""
    try:
        data = request.json
        
        settings_data = {
            '_id': 'app_settings',
            'appName': data.get('appName', 'Coffee Management System'),
            'companyName': data.get('companyName', ''),
            'address': data.get('address', ''),
            'phone': data.get('phone', ''),
            'email': data.get('email', ''),
            'updatedAt': datetime.now()
        }
        
        db.settings.update_one(
            {'_id': 'app_settings'},
            {'$set': settings_data},
            upsert=True
        )
        
        settings_data.pop('_id', None)
        return jsonify(json_serialize(settings_data)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

---

## 18. HALAMAN KALKULATOR TIMBANG

### Penjelasan Umum

Halaman Kalkulator Timbang digunakan untuk menghitung berat bahan baku saat masuk. Kalkulator membantu menghitung berat bersih dari berat kotor dan berat kemasan.

### Backend - Route Kalkulator Timbang

**Code Backend:**

```python
@app.route('/kelola/bahan/kalkulator-timbang')
def kalkulator_timbang():
    """Kalkulator timbangan bahan masuk"""
    return render_template('kalkulator_timbang.html')
```

### Frontend - JavaScript Kalkulator Timbang

**Code Frontend:**

```javascript
// Calculate berat bersih
function calculateBeratBersih() {
  const beratKotor = parseFloat(document.getElementById("beratKotor").value) || 0;
  const beratKemasan = parseFloat(document.getElementById("beratKemasan").value) || 0;
  
  const beratBersih = beratKotor - beratKemasan;
  
  document.getElementById("beratBersih").value = beratBersih.toFixed(2);
  
  // Update total jika ada multiple kemasan
  const jumlahKemasan = parseInt(document.getElementById("jumlahKemasan").value) || 1;
  const totalBeratBersih = beratBersih * jumlahKemasan;
  document.getElementById("totalBeratBersih").value = totalBeratBersih.toFixed(2);
}

// Event listeners
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("beratKotor").addEventListener("input", calculateBeratBersih);
  document.getElementById("beratKemasan").addEventListener("input", calculateBeratBersih);
  document.getElementById("jumlahKemasan").addEventListener("input", calculateBeratBersih);
});
```

**Penjelasan Frontend:**
- Kalkulator untuk menghitung berat bersih bahan
- Formula: Berat Bersih = Berat Kotor - Berat Kemasan
- Support multiple kemasan dengan total berat bersih
- Perhitungan real-time saat input berubah

---

## 19. SISTEM PEMESANAN DAN ORDERING (Detail Backend)

### Penjelasan Umum

Sistem pemesanan dan ordering mengelola proses dari pencatatan permintaan hingga pengurangan stok. Pemesanan hanya mencatat permintaan, sedangkan Ordering adalah proses yang benar-benar mengurangi stok.

### Alur Kerja:
1. **Pemesanan**: Admin mencatat permintaan customer (tidak mengurangi stok)
2. **Ordering**: Admin memproses pemesanan dengan mengurangi stok dari produksi tertentu
3. **Stok Update**: Stok dikurangi melalui hasil produksi dengan flag `isFromOrdering: true`

---

### 19.1. BACKEND - API ORDERING PROSES

## 20. BACKEND - API AUTHENTICATION TAMBAHAN

### GET /api/auth/session - Check Session

**Code Backend:**

```python
@app.route('/api/auth/session', methods=['GET'])
def check_session():
    """Check if user has valid session"""
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
        return jsonify({'logged_in': False, 'error': str(e)}), 500
```

### GET /api/auth/check - Auth Check

**Code Backend:**

```python
@app.route('/api/auth/check', methods=['GET'])
def auth_check():
    """Check if user has valid session - returns 200 if logged in, 401 if not"""
    try:
        if 'user_id' in session and session.get('username') and session.get('role'):
            return jsonify({
                'logged_in': True,
                'username': session.get('username'),
                'role': session.get('role')
            }), 200
        else:
            return jsonify({'logged_in': False}), 401
    except Exception as e:
        return jsonify({'logged_in': False, 'error': str(e)}), 500
```

### POST /api/auth/logout - Logout

**Code Backend:**

```python
@app.route('/api/auth/logout', methods=['POST'])
def api_logout():
    """Logout user - clear session"""
    try:
        username = session.get('username', 'Unknown')
        session.clear()
        return jsonify({
            'success': True,
            'message': 'Logout berhasil'
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
```

---

## 21. BACKEND - API STOK BAHAN

### GET /api/stok/bahan - Get Stok Bahan

**Code Backend:**

```python
@app.route('/api/stok/bahan', methods=['GET'])
def get_stok_bahan():
    """Get stok bahan baku dengan perhitungan otomatis"""
    try:
        bahan_list = list(db.bahan.find().sort('id', 1))
        stok_bahan = []
        
        for bahan in bahan_list:
            # Hitung total digunakan
            produksi_list = list(db.produksi.find({'idBahan': bahan.get('idBahan')}))
            total_digunakan = sum(p.get('beratAwal', 0) for p in produksi_list)
            sisa = bahan.get('jumlah', 0) - total_digunakan
            
            stok_bahan.append({
                'idBahan': bahan.get('idBahan'),
                'pemasok': bahan.get('pemasok'),
                'varietas': bahan.get('varietas'),
                'jenisKopi': bahan.get('jenisKopi'),
                'totalBahan': bahan.get('jumlah', 0),
                'totalDigunakan': total_digunakan,
                'sisaTersedia': max(0, sisa)
            })
        
        return jsonify(json_serialize(stok_bahan)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

**Penjelasan Backend:**
- Menghitung stok bahan baku secara otomatis
- Stok = jumlah bahan - total yang sudah digunakan dalam produksi
- Return array dengan informasi stok setiap bahan

---

## 22. BACKEND - API ORDERING

### GET /api/ordering - Get All Ordering

**Code Backend:**

```python
@app.route('/api/ordering', methods=['GET'])
def get_ordering():
    """Get all ordering data"""
    try:
        ordering = list(db.ordering.find().sort('id', 1))
        return jsonify(json_serialize(ordering)), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

### GET /api/ordering/<ordering_id> - Get Ordering by ID

**Code Backend:**

```python
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
```

### DELETE /api/ordering/<ordering_id> - Delete Ordering

**Code Backend:**

```python
@app.route('/api/ordering/<ordering_id>', methods=['DELETE'])
def delete_ordering(ordering_id):
    """Delete ordering - Reverse stock reduction"""
    try:
        ordering = db.ordering.find_one({'_id': ObjectId(ordering_id)}) or \
                  db.ordering.find_one({'id': int(ordering_id)})
        
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
        
        # Revert pemesanan status
        db.pemesanan.update_one(
            {'idPembelian': ordering['idPembelian']},
            {'$set': {'statusPemesanan': 'Ordering'}}
        )
        
        return jsonify({'success': True, 'message': 'Ordering deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
```

**Penjelasan Backend:**
- Delete ordering akan menghapus hasil produksi dengan `isFromOrdering: true`
- Ini akan mengembalikan stok yang sudah dikurangi
- Status pemesanan di-revert menjadi "Ordering"

---

---

## 23. BACKEND - HEALTH CHECK

### Penjelasan Umum

Health check endpoint digunakan untuk monitoring status aplikasi dan koneksi database.

### Backend - API Health Check

**Code Backend:**

```python
@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint to verify backend is running"""
    try:
        # Test MongoDB connection
        client.admin.command('ping')
        return jsonify({
            'status': 'healthy',
            'database': 'connected',
            'message': 'Backend is running and MongoDB is connected'
        }), 200
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'database': 'disconnected',
            'error': str(e)
        }), 503
```

**Penjelasan Backend:**
- Endpoint untuk monitoring kesehatan aplikasi
- Test koneksi MongoDB dengan command `ping`
- Return status healthy/unhealthy dengan detail koneksi database
- Digunakan untuk load balancer atau monitoring tools

---

## 24. BACKEND - RUN APPLICATION

### Penjelasan Umum

Bagian ini mengatur bagaimana aplikasi Flask dijalankan.

### Backend - Main Entry Point

**Code Backend:**

```python
if __name__ == '__main__':
   app.run('0.0.0.0', port=5002, debug=True)
```

**Penjelasan Backend:**
- Aplikasi dijalankan di host `0.0.0.0` (accessible dari semua network interface)
- Port 5002 untuk development
- `debug=True` untuk auto-reload saat code berubah (development only)
- Untuk production, gunakan production WSGI server seperti Gunicorn

---

## RINGKASAN LENGKAP

Dokumen ini mencakup penjelasan detail frontend dan backend untuk **SEMUA** halaman dan fitur:

### Halaman yang Didokumentasikan:
1. ✅ **Welcome** - Halaman entry point
2. ✅ **Login** (Admin/Karyawan/Owner) - Authentication dengan frontend & backend
3. ✅ **Register** - Pendaftaran user baru dengan frontend & backend
4. ✅ **Dashboard** (Admin/Karyawan/Owner) - Halaman utama dengan route protection
5. ✅ **Kelola Pengguna** - Manajemen user dengan frontend & backend CRUD
6. ✅ **Kelola Bahan** - Manajemen bahan baku dengan frontend & backend CRUD
7. ✅ **Kelola Produksi** - Manajemen produksi dengan frontend & backend CRUD
8. ✅ **Kelola Hasil Produksi** - Manajemen hasil produksi dengan frontend & backend CRUD
9. ✅ **Kelola Pemasok** - Manajemen pemasok dengan frontend & backend CRUD
10. ✅ **Kelola Stok** - Manajemen stok dengan agregasi
11. ✅ **Kelola Keuangan** - Manajemen keuangan dengan frontend & backend CRUD
12. ✅ **Kelola Data** - Master data management dengan frontend & backend dynamic CRUD
13. ✅ **Kelola Sanitasi** - Manajemen sanitasi dengan foto upload
14. ✅ **Kelola Laporan** - Manajemen laporan PDF dengan generate & upload
15. ✅ **Kelola Pemesanan** - Manajemen pemesanan dengan proses ordering
16. ✅ **Profile** (Admin/Karyawan/Owner) - Profil user dengan frontend & backend
17. ✅ **Pengaturan** (Admin/Karyawan/Owner) - Pengaturan aplikasi dengan frontend & backend
18. ✅ **Kalkulator Timbang** - Kalkulator berat bahan dengan JavaScript

### API Endpoints yang Didokumentasikan:
1. ✅ **Authentication**: login, logout, session, check (dengan penjelasan lengkap)
2. ✅ **Users**: GET, POST, PUT, DELETE (dengan validasi unik)
3. ✅ **Bahan**: GET, POST, PUT, DELETE, GET sisa (dengan referential integrity)
4. ✅ **Produksi**: GET, POST, PUT, DELETE, GET pengemasan, GET sisa (dengan validasi kompleks)
5. ✅ **Hasil Produksi**: GET, POST, PUT, DELETE, GET by produksi (dengan calculate kemasan)
6. ✅ **Pemasok**: GET, POST, PUT, DELETE (dengan referential integrity)
7. ✅ **Stok**: GET (agregasi), GET bahan (dengan perhitungan otomatis)
8. ✅ **Keuangan**: GET, POST, PUT, DELETE (dengan validasi notes wajib)
9. ✅ **Sanitasi**: GET, POST, PUT, DELETE (dengan optimasi exclude fotos)
10. ✅ **Settings**: GET, POST/PUT (dengan upsert)
11. ✅ **Laporan**: POST upload, GET list, GET serve PDF (dengan base64 handling)
12. ✅ **Pemesanan**: GET, POST, PUT, DELETE, GET stok (dengan validasi total harga)
13. ✅ **Ordering**: GET, POST proses, PUT, DELETE (dengan pengurangan stok)
14. ✅ **Master Data**: Dynamic CRUD untuk semua master data (6 jenis)
15. ✅ **Health Check**: GET untuk monitoring

### Fitur Khusus yang Didokumentasikan:
1. ✅ **Session Management** - Flask session dengan cookie
2. ✅ **Password Hashing** - SHA-256 untuk keamanan
3. ✅ **Auto-increment ID** - Counter collection untuk ID generation
4. ✅ **Referential Integrity** - Validasi sebelum delete
5. ✅ **Stok Management** - Agregasi dan pengurangan stok
6. ✅ **History Tracking** - History tahapan produksi
7. ✅ **Business Logic Validation** - Natural Process, berat validation, dll
8. ✅ **File Upload** - PDF dan foto dengan base64 encoding
9. ✅ **Dynamic Endpoints** - Master data dengan dynamic CRUD

Setiap bagian mencakup:
- ✅ Penjelasan umum dan alur kerja
- ✅ Cuplikan code frontend (HTML + JavaScript) - **POTONGAN PENDEK**
- ✅ Cuplikan code backend (Python/Flask) - **POTONGAN PENDEK**
- ✅ Penjelasan detail setiap fungsi dan validasi

Sistem menggunakan pendekatan **Backend-First** dimana semua data disimpan di MongoDB dan frontend berkomunikasi melalui REST API. Dokumentasi ini lengkap dan siap digunakan untuk proposal skripsi.
