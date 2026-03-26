#!/usr/bin/env python3
"""
Comprehensive Check: Verifikasi semua CRUD operations, variable naming, dan API calls
"""
import re
from pathlib import Path

def check_backend_endpoints():
    """Cek semua endpoint di app.py"""
    print("=" * 80)
    print("1. BACKEND ENDPOINTS CHECK (app.py)")
    print("=" * 80)
    
    app_py = Path("app.py")
    content = app_py.read_text(encoding='utf-8')
    
    modules = {
        'bahan': ['db.bahan'],
        'produksi': ['db.produksi'],
        'hasilProduksi': ['db.hasilProduksi', '/api/hasil-produksi'],
        'pemasok': ['db.pemasok'],
        'sanitasi': ['db.sanitasi'],
        'keuangan': ['db.keuangan'],
        'users': ['db.users']
    }
    
    print("\n📋 Endpoint & Collection Verification:")
    for module, patterns in modules.items():
        # Cek endpoint routes
        get_route = f"@app.route('/api/{module}'" in content or (module == 'hasilProduksi' and "@app.route('/api/hasil-produksi'" in content)
        post_route = f"@app.route('/api/{module}', methods=['POST']" in content or (module == 'hasilProduksi' and "@app.route('/api/hasil-produksi', methods=['POST']" in content)
        put_route = f"/api/{module}/<" in content and "PUT" in content or (module == 'hasilProduksi' and "/api/hasil-produksi/<" in content and "PUT" in content)
        delete_route = f"/api/{module}/<" in content and "DELETE" in content or (module == 'hasilProduksi' and "/api/hasil-produksi/<" in content and "DELETE" in content)
        
        # Cek collection usage
        collection_pattern = patterns[0]  # db.bahan, db.produksi, etc
        has_insert = f"{collection_pattern}.insert_one" in content
        has_find = f"{collection_pattern}.find" in content
        has_update = f"{collection_pattern}.update_one" in content
        has_delete = f"{collection_pattern}.delete_one" in content
        
        status = "✅" if (get_route and post_route and put_route and delete_route) else "❌"
        
        print(f"\n{status} {module.upper():20}")
        print(f"   Endpoints: GET={get_route}, POST={post_route}, PUT={put_route}, DELETE={delete_route}")
        print(f"   Collection: insert={has_insert}, find={has_find}, update={has_update}, delete={has_delete}")
        print(f"   Collection name: {collection_pattern}")

def check_api_service_naming():
    """Cek variable naming di api-service.js"""
    print("\n" + "=" * 80)
    print("2. API SERVICE NAMING CHECK (api-service.js)")
    print("=" * 80)
    
    api_service = Path("static/js/api-service.js")
    content = api_service.read_text(encoding='utf-8')
    
    api_definitions = {
        'BahanAPI': ['/bahan', 'bahan'],
        'ProduksiAPI': ['/produksi', 'produksi'],
        'HasilProduksiAPI': ['/hasil-produksi', 'hasilProduksi'],
        'PemasokAPI': ['/pemasok', 'pemasok'],
        'SanitasiAPI': ['/sanitasi', 'sanitasi'],
        'KeuanganAPI': ['/keuangan', 'keuangan'],
        'UsersAPI': ['/users', 'users']
    }
    
    print("\n📋 API Definitions Check:")
    for api_name, patterns in api_definitions.items():
        endpoint = patterns[0]
        localStorage_key = patterns[1]
        
        # Cek apakah API didefinisikan
        has_definition = f"const {api_name}" in content
        
        # Cek endpoint usage
        has_get = f"apiCall(\"{endpoint}\")" in content or f"apiCall('{endpoint}')" in content
        has_post = f'apiCall("{endpoint}", "POST"' in content or f"apiCall('{endpoint}', 'POST'" in content
        has_put = f'apiCall(`{endpoint}/' in content or f'apiCall("{endpoint}/' in content or f"apiCall('{endpoint}/" in content
        has_delete = f'apiCall(`{endpoint}/' in content and 'DELETE' in content
        
        # Cek localStorage fallback
        has_localStorage = f'localStorage.getItem("{localStorage_key}"' in content or f"localStorage.getItem('{localStorage_key}'" in content
        
        # Cek apakah diexport ke window.API
        is_exported = api_name.replace('API', '') in content.split('window.API = {')[1].split('};')[0] if 'window.API = {' in content else False
        
        status = "✅" if has_definition else "❌"
        
        print(f"\n{status} {api_name:25}")
        print(f"   Endpoint: {endpoint}")
        print(f"   localStorage key: {localStorage_key}")
        print(f"   Methods: GET={has_get}, POST={has_post}, PUT={has_put}, DELETE={has_delete}")
        print(f"   Fallback: localStorage={has_localStorage}")
        print(f"   Exported: {is_exported}")

def check_frontend_usage():
    """Cek penggunaan API di frontend files"""
    print("\n" + "=" * 80)
    print("3. FRONTEND API USAGE CHECK")
    print("=" * 80)
    
    js_files = {
        'kelola_bahan.js': ['Bahan', 'bahan'],
        'kelola_produksi.js': ['Produksi', 'produksi'],
        'kelola_hasil_produksi.js': ['HasilProduksi', 'hasilProduksi'],
        'kelola_pemasok.js': ['Pemasok', 'pemasok'],
        'kelola_sanitasi.js': ['Sanitasi', 'sanitasi'],
        'kelola_keuangan.js': ['Keuangan', 'keuangan'],
        'kelola_pengguna.js': ['Users', 'users']
    }
    
    print("\n📋 Frontend File Check:")
    for js_file, api_info in js_files.items():
        api_name = api_info[0]
        localStorage_key = api_info[1]
        file_path = Path(f"static/js/{js_file}")
        
        if not file_path.exists():
            print(f"\n❌ {js_file:30} - FILE NOT FOUND")
            continue
        
        content = file_path.read_text(encoding='utf-8')
        
        # Cek penggunaan API
        api_usage = content.count(f'window.API.{api_name}')
        api_get_all = f'window.API.{api_name}.getAll()' in content
        api_create = f'window.API.{api_name}.create(' in content
        api_update = f'window.API.{api_name}.update(' in content
        api_delete = f'window.API.{api_name}.delete(' in content
        
        # Cek localStorage fallback
        localStorage_usage = content.count(f'localStorage.getItem("{localStorage_key}"') + content.count(f"localStorage.getItem('{localStorage_key}'")
        localStorage_set = content.count(f'localStorage.setItem("{localStorage_key}"') + content.count(f"localStorage.setItem('{localStorage_key}'")
        
        status = "✅" if api_usage > 0 else "❌"
        
        print(f"\n{status} {js_file:30}")
        print(f"   API calls: {api_usage} times")
        print(f"   Methods: getAll={api_get_all}, create={api_create}, update={api_update}, delete={api_delete}")
        print(f"   localStorage: get={localStorage_usage}, set={localStorage_set}")

def check_variable_naming_consistency():
    """Cek konsistensi naming antara backend dan frontend"""
    print("\n" + "=" * 80)
    print("4. VARIABLE NAMING CONSISTENCY CHECK")
    print("=" * 80)
    
    app_py = Path("app.py")
    api_service = Path("static/js/api-service.js")
    
    app_content = app_py.read_text(encoding='utf-8')
    api_content = api_service.read_text(encoding='utf-8')
    
    mappings = {
        'backend_collection': {
            'db.bahan': {'frontend_api': 'BahanAPI', 'endpoint': '/bahan', 'localStorage': 'bahan'},
            'db.produksi': {'frontend_api': 'ProduksiAPI', 'endpoint': '/produksi', 'localStorage': 'produksi'},
            'db.hasilProduksi': {'frontend_api': 'HasilProduksiAPI', 'endpoint': '/hasil-produksi', 'localStorage': 'hasilProduksi'},
            'db.pemasok': {'frontend_api': 'PemasokAPI', 'endpoint': '/pemasok', 'localStorage': 'pemasok'},
            'db.sanitasi': {'frontend_api': 'SanitasiAPI', 'endpoint': '/sanitasi', 'localStorage': 'sanitasi'},
            'db.keuangan': {'frontend_api': 'KeuanganAPI', 'endpoint': '/keuangan', 'localStorage': 'keuangan'},
            'db.users': {'frontend_api': 'UsersAPI', 'endpoint': '/users', 'localStorage': 'users'}
        }
    }
    
    print("\n📋 Naming Consistency:")
    for backend_coll, info in mappings['backend_collection'].items():
        # Cek backend
        backend_has = backend_coll in app_content
        endpoint_has = info['endpoint'] in app_content
        
        # Cek frontend
        api_def_has = f"const {info['frontend_api']}" in api_content
        api_export_has = info['frontend_api'].replace('API', '') in api_content.split('window.API = {')[1].split('};')[0] if 'window.API = {' in api_content else False
        localStorage_has = info['localStorage'] in api_content
        
        status = "✅" if (backend_has and endpoint_has and api_def_has) else "⚠️"
        
        print(f"\n{status} {backend_coll:25}")
        print(f"   Backend: collection={backend_has}, endpoint={endpoint_has}")
        print(f"   Frontend: API def={api_def_has}, exported={api_export_has}, localStorage={localStorage_has}")
        if not (backend_has and endpoint_has and api_def_has):
            print(f"   ⚠️  MISMATCH DETECTED!")

def check_endpoint_paths():
    """Cek apakah endpoint paths konsisten"""
    print("\n" + "=" * 80)
    print("5. ENDPOINT PATH CONSISTENCY CHECK")
    print("=" * 80)
    
    app_py = Path("app.py")
    api_service = Path("static/js/api-service.js")
    
    app_content = app_py.read_text(encoding='utf-8')
    api_content = api_service.read_text(encoding='utf-8')
    
    endpoints = {
        '/api/bahan': {'collection': 'db.bahan', 'api': 'BahanAPI'},
        '/api/produksi': {'collection': 'db.produksi', 'api': 'ProduksiAPI'},
        '/api/hasil-produksi': {'collection': 'db.hasilProduksi', 'api': 'HasilProduksiAPI'},
        '/api/pemasok': {'collection': 'db.pemasok', 'api': 'PemasokAPI'},
        '/api/sanitasi': {'collection': 'db.sanitasi', 'api': 'SanitasiAPI'},
        '/api/keuangan': {'collection': 'db.keuangan', 'api': 'KeuanganAPI'},
        '/api/users': {'collection': 'db.users', 'api': 'UsersAPI'}
    }
    
    print("\n📋 Endpoint Consistency:")
    for endpoint, info in endpoints.items():
        # Backend
        backend_route = endpoint in app_content
        backend_collection = info['collection'] in app_content
        
        # Frontend
        frontend_call = endpoint.replace('/api', '') in api_content
        frontend_api = info['api'] in api_content
        
        status = "✅" if (backend_route and backend_collection and frontend_call and frontend_api) else "⚠️"
        
        print(f"{status} {endpoint:25} | Backend={backend_route}, Frontend={frontend_call}, API={frontend_api}")

if __name__ == "__main__":
    print("\n" + "=" * 80)
    print("COMPREHENSIVE CRUD & NAMING CHECK")
    print("=" * 80)
    
    check_backend_endpoints()
    check_api_service_naming()
    check_frontend_usage()
    check_variable_naming_consistency()
    check_endpoint_paths()
    
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print("\n✅ Check completed!")
    print("📋 Review output above for any ⚠️ or ❌ markers")
    print("=" * 80 + "\n")
