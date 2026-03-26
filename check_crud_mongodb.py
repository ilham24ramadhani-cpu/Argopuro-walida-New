#!/usr/bin/env python3
"""
Script untuk mengecek apakah semua CRUD operations menggunakan MongoDB atau localStorage
"""
import os
import re
from pathlib import Path

def check_api_endpoints():
    """Cek apakah semua endpoint API ada di app.py"""
    print("=" * 80)
    print("CHECKING API ENDPOINTS IN app.py")
    print("=" * 80)
    
    app_py = Path("app.py")
    if not app_py.exists():
        print("❌ app.py tidak ditemukan!")
        return
    
    content = app_py.read_text(encoding='utf-8')
    
    # Cek endpoint untuk berbagai modul
    modules = ['sanitasi', 'keuangan', 'users', 'bahan', 'produksi', 'hasil_produksi', 
               'pemasok', 'stok', 'dataJenisKopi', 'dataVarietas', 'dataProses']
    
    print("\n📋 MODULE ENDPOINT CHECK:")
    for module in modules:
        get_route = f"@app.route('/api/{module}'"
        post_route = f"@app.route('/api/{module}', methods=['POST']"
        put_route = f"@app.route('/api/{module}/<"
        delete_route = f"@app.route('/api/{module}/<"
        
        has_get = get_route in content
        has_post = post_route in content
        has_put = put_route in content or f"/api/{module}/<" in content and "PUT" in content
        has_delete = delete_route in content or f"/api/{module}/<" in content and "DELETE" in content
        
        status = "✅" if (has_get and has_post and has_put and has_delete) else "⚠️"
        print(f"{status} {module:20} | GET: {'✅' if has_get else '❌'} POST: {'✅' if has_post else '❌'} PUT: {'✅' if has_put else '❌'} DELETE: {'✅' if has_delete else '❌'}")

def check_frontend_api_calls():
    """Cek apakah frontend menggunakan API atau localStorage"""
    print("\n" + "=" * 80)
    print("CHECKING FRONTEND API USAGE")
    print("=" * 80)
    
    js_files = list(Path("static/js").glob("*.js"))
    
    print("\n📋 FILE-BY-FILE CHECK:")
    for js_file in sorted(js_files):
        if js_file.name in ['api-service.js', 'auth.js', 'auth-guard.js']:
            continue
            
        content = js_file.read_text(encoding='utf-8')
        
        # Cek penggunaan API
        api_usage = re.findall(r'window\.API\.\w+\.(getAll|getById|create|update|delete)', content)
        localStorage_usage = re.findall(r'localStorage\.(getItem|setItem).*["\']sanitasi["\']', content, re.IGNORECASE)
        
        if api_usage or 'window.API' in content:
            print(f"✅ {js_file.name:40} | API calls: {len(api_usage)} | localStorage: {len(localStorage_usage)}")
        elif localStorage_usage:
            print(f"⚠️  {js_file.name:40} | API calls: 0 | localStorage: {len(localStorage_usage)} (FALLBACK?)")

def check_sanitasi_specific():
    """Cek khusus untuk sanitasi CRUD"""
    print("\n" + "=" * 80)
    print("CHECKING SANITASI CRUD SPECIFICALLY")
    print("=" * 80)
    
    # Cek api-service.js
    api_service = Path("static/js/api-service.js")
    if api_service.exists():
        content = api_service.read_text(encoding='utf-8')
        
        if 'const SanitasiAPI' in content:
            print("\n✅ SanitasiAPI found in api-service.js")
            
            # Cek methods
            methods = ['getAll', 'getById', 'create', 'update', 'delete']
            for method in methods:
                if f'async {method}(' in content and 'SanitasiAPI' in content[:content.find(f'async {method}(')+200]:
                    print(f"   ✅ {method}() method exists")
                else:
                    print(f"   ❌ {method}() method missing")
            
            # Cek apakah menggunakan apiCall
            if 'apiCall("/sanitasi")' in content:
                print("\n✅ API calls found for sanitasi")
            else:
                print("\n❌ API calls NOT found for sanitasi")
    
    # Cek kelola_sanitasi.js
    kelola_sanitasi = Path("static/js/kelola_sanitasi.js")
    if kelola_sanitasi.exists():
        content = kelola_sanitasi.read_text(encoding='utf-8')
        
        print("\n📋 CRUD Operations in kelola_sanitasi.js:")
        
        # CREATE
        if 'window.API.Sanitasi.create' in content:
            print("   ✅ CREATE: Using API")
        elif 'localStorage.setItem.*sanitasi' in content:
            print("   ⚠️  CREATE: Using localStorage (fallback)")
        
        # READ
        if 'window.API.Sanitasi.getAll' in content:
            print("   ✅ READ: Using API")
        elif 'localStorage.getItem.*sanitasi' in content:
            print("   ⚠️  READ: Using localStorage (fallback)")
        
        # UPDATE
        if 'window.API.Sanitasi.update' in content:
            print("   ✅ UPDATE: Using API")
        
        # DELETE
        if 'window.API.Sanitasi.delete' in content:
            print("   ✅ DELETE: Using API")

def check_backend_connection():
    """Cek konfigurasi koneksi backend"""
    print("\n" + "=" * 80)
    print("CHECKING BACKEND CONNECTION CONFIG")
    print("=" * 80)
    
    # Cek .env
    env_file = Path(".env")
    if env_file.exists():
        env_content = env_file.read_text(encoding='utf-8')
        print("\n📋 .env Configuration:")
        for line in env_content.strip().split('\n'):
            if 'MONGODB_URI' in line or 'DB_NAME' in line:
                # Mask sensitive info
                if 'MONGODB_URI' in line:
                    parts = line.split('=')
                    if len(parts) == 2:
                        uri = parts[1].strip()
                        # Show only connection info, not credentials
                        if '@' in uri:
                            masked = uri.split('@')[1] if '@' in uri else uri
                            print(f"   ✅ MONGODB_URI = ...@{masked}")
                        else:
                            print(f"   ✅ MONGODB_URI = {uri[:50]}...")
                    else:
                        print(f"   ⚠️  MONGODB_URI format unclear")
                else:
                    print(f"   ✅ {line}")
    
    # Cek app.py MongoDB connection
    app_py = Path("app.py")
    if app_py.exists():
        content = app_py.read_text(encoding='utf-8')
        
        if 'MongoClient' in content and 'MONGODB_URI' in content:
            print("\n✅ MongoDB connection code found in app.py")
        else:
            print("\n❌ MongoDB connection code NOT found in app.py")

if __name__ == "__main__":
    print("\n" + "=" * 80)
    print("CRUD MONGODB CHECKER")
    print("=" * 80)
    
    check_api_endpoints()
    check_backend_connection()
    check_frontend_api_calls()
    check_sanitasi_specific()
    
    print("\n" + "=" * 80)
    print("RECOMMENDATIONS:")
    print("=" * 80)
    print("1. Pastikan Flask server running (python app.py)")
    print("2. Buka browser console dan cek:")
    print("   - window.API.Sanitasi apakah terdefinisi?")
    print("   - window.backendAvailable() apakah true?")
    print("3. Test create sanitasi dan cek network tab:")
    print("   - Apakah request ke /api/sanitasi?")
    print("   - Apakah response status 201?")
    print("4. Cek MongoDB Atlas:")
    print("   - Apakah collection 'sanitasi' ada?")
    print("   - Apakah ada documents baru setelah create?")
    print("=" * 80 + "\n")

