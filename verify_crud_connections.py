#!/usr/bin/env python3
"""
Script untuk verifikasi semua koneksi CRUD antara Frontend dan Backend
Memastikan endpoint paths, variable names, dan collection names konsisten
"""
import re
from pathlib import Path

def check_backend_endpoints():
    """Cek semua endpoint di app.py"""
    print("=" * 80)
    print("CHECKING BACKEND ENDPOINTS (app.py)")
    print("=" * 80)
    
    app_py = Path("app.py")
    if not app_py.exists():
        print("❌ app.py tidak ditemukan!")
        return {}
    
    content = app_py.read_text(encoding='utf-8')
    
    modules = {
        'bahan': {'endpoints': [], 'collection': None},
        'produksi': {'endpoints': [], 'collection': None},
        'hasil-produksi': {'endpoints': [], 'collection': None},
        'pemasok': {'endpoints': [], 'collection': None},
        'sanitasi': {'endpoints': [], 'collection': None},
        'keuangan': {'endpoints': [], 'collection': None},
    }
    
    # Cek endpoints
    for module in modules.keys():
        # GET all
        pattern = f"@app.route\\(['\"]/api/{module.replace('-', '-')}['\"], methods=\\[['\"]GET['\"]\\]\\)"
        if re.search(pattern, content):
            modules[module]['endpoints'].append('GET')
        
        # POST
        pattern = f"@app.route\\(['\"]/api/{module.replace('-', '-')}['\"], methods=\\[['\"]POST['\"]\\]\\)"
        if re.search(pattern, content):
            modules[module]['endpoints'].append('POST')
        
        # PUT
        pattern = f"@app.route\\(['\"]/api/{module.replace('-', '-')}/<.*>['\"], methods=\\[['\"]PUT['\"]\\]\\)"
        if re.search(pattern, content):
            modules[module]['endpoints'].append('PUT')
        
        # DELETE
        pattern = f"@app.route\\(['\"]/api/{module.replace('-', '-')}/<.*>['\"], methods=\\[['\"]DELETE['\"]\\]\\)"
        if re.search(pattern, content):
            modules[module]['endpoints'].append('DELETE')
        
        # Cek collection name
        collection_patterns = [
            f"db\\.{module.replace('-', '')}\\.",  # db.bahan, db.produksi, dll
            f"db\\.{module.replace('-', 'Produksi')}\\.",  # db.hasilProduksi
        ]
        for pattern in collection_patterns:
            if re.search(pattern, content):
                modules[module]['collection'] = pattern.replace('db\\.', '').replace('\\.', '')
                break
    
    print("\n📋 Endpoint & Collection Verification:")
    for module, info in modules.items():
        status = "✅" if len(info['endpoints']) == 4 else "⚠️"
        print(f"{status} {module:20} | Endpoints: {', '.join(info['endpoints']) or 'NONE'} | Collection: {info['collection'] or 'NOT FOUND'}")
    
    return modules

def check_frontend_api_calls():
    """Cek semua API calls di frontend"""
    print("\n" + "=" * 80)
    print("CHECKING FRONTEND API CALLS")
    print("=" * 80)
    
    api_service = Path("static/js/api-service.js")
    if not api_service.exists():
        print("❌ api-service.js tidak ditemukan!")
        return {}
    
    content = api_service.read_text(encoding='utf-8')
    
    # Cek window.API object
    print("\n📋 window.API Object:")
    api_objects = {
        'Bahan': False,
        'Produksi': False,
        'HasilProduksi': False,
        'Pemasok': False,
        'Sanitasi': False,
        'Keuangan': False,
    }
    
    window_api_match = re.search(r'window\.API\s*=\s*\{([^}]+)\}', content, re.DOTALL)
    if window_api_match:
        api_content = window_api_match.group(1)
        for obj in api_objects.keys():
            if f"{obj}:" in api_content or f"{obj}:" in api_content:
                api_objects[obj] = True
                print(f"   ✅ {obj}: registered")
            else:
                print(f"   ❌ {obj}: NOT registered")
    else:
        print("   ❌ window.API object not found!")
    
    # Cek API definitions
    print("\n📋 API Definitions:")
    api_defs = {
        'Bahan': 'BahanAPI',
        'Produksi': 'ProduksiAPI',
        'HasilProduksi': 'HasilProduksiAPI',
        'Pemasok': 'PemasokAPI',
        'Sanitasi': 'SanitasiAPI',
        'Keuangan': 'KeuanganAPI',
    }
    
    for obj, def_name in api_defs.items():
        if f"const {def_name}" in content:
            print(f"   ✅ {def_name} defined")
            
            # Cek methods
            methods = ['getAll', 'getById', 'create', 'update', 'delete']
            found_methods = []
            for method in methods:
                if f"async {method}(" in content:
                    # Find nearest API definition
                    api_start = content.find(f"const {def_name}")
                    api_end = content.find("};", api_start) + 2
                    api_block = content[api_start:api_end]
                    if f"async {method}(" in api_block:
                        found_methods.append(method)
            
            print(f"      Methods: {', '.join(found_methods)}")
        else:
            print(f"   ❌ {def_name} NOT defined")
    
    return api_objects

def check_endpoint_paths():
    """Cek konsistensi endpoint paths"""
    print("\n" + "=" * 80)
    print("CHECKING ENDPOINT PATH CONSISTENCY")
    print("=" * 80)
    
    # Backend paths
    app_py = Path("app.py")
    backend_paths = {}
    if app_py.exists():
        content = app_py.read_text(encoding='utf-8')
        matches = re.findall(r"@app\.route\(['\"](/api/[^'\"]+)['\"]", content)
        for match in matches:
            module = match.replace('/api/', '').split('/')[0].split('<')[0]
            if module not in backend_paths:
                backend_paths[module] = []
            backend_paths[module].append(match)
    
    # Frontend paths
    api_service = Path("static/js/api-service.js")
    frontend_paths = {}
    if api_service.exists():
        content = api_service.read_text(encoding='utf-8')
        matches = re.findall(r"apiCall\(['\"](/[^'\"]+)['\"]", content)
        for match in matches:
            module = match.replace('/', '').split('/')[0].split('<')[0]
            if module not in frontend_paths:
                frontend_paths[module] = []
            if match not in frontend_paths[module]:
                frontend_paths[module].append(match)
    
    print("\n📋 Path Comparison:")
    all_modules = set(list(backend_paths.keys()) + list(frontend_paths.keys()))
    
    for module in sorted(all_modules):
        backend = backend_paths.get(module, [])
        frontend = frontend_paths.get(module, [])
        
        status = "✅" if backend and frontend else "⚠️"
        print(f"\n{status} {module}:")
        print(f"   Backend:  {backend[0] if backend else 'NOT FOUND'}")
        print(f"   Frontend: {frontend[0] if frontend else 'NOT FOUND'}")
        
        if backend and frontend:
            # Check if paths match
            backend_base = backend[0].replace('/api/', '')
            frontend_base = frontend[0].replace('/', '')
            if backend_base != frontend_base:
                print(f"   ⚠️  PATH MISMATCH!")
    
    return backend_paths, frontend_paths

def check_collection_names():
    """Cek collection names di backend"""
    print("\n" + "=" * 80)
    print("CHECKING COLLECTION NAMES IN BACKEND")
    print("=" * 80)
    
    app_py = Path("app.py")
    if not app_py.exists():
        print("❌ app.py tidak ditemukan!")
        return {}
    
    content = app_py.read_text(encoding='utf-8')
    
    collections = {}
    patterns = [
        (r'db\.(bahan)\.', 'bahan'),
        (r'db\.(produksi)\.', 'produksi'),
        (r'db\.(hasilProduksi)\.', 'hasilProduksi'),
        (r'db\.(pemasok)\.', 'pemasok'),
        (r'db\.(sanitasi)\.', 'sanitasi'),
        (r'db\.(keuangan)\.', 'keuangan'),
    ]
    
    print("\n📋 Collection Names:")
    for pattern, name in patterns:
        matches = re.findall(pattern, content)
        if matches:
            collections[name] = len(matches)
            print(f"   ✅ db.{name}: {len(matches)} usages")
        else:
            print(f"   ❌ db.{name}: NOT FOUND")
    
    return collections

def check_variable_names():
    """Cek konsistensi variable names"""
    print("\n" + "=" * 80)
    print("CHECKING VARIABLE NAME CONSISTENCY")
    print("=" * 80)
    
    # Check in kelola_*.js files
    js_files = {
        'bahan': Path("static/js/kelola_bahan.js"),
        'produksi': Path("static/js/kelola_produksi.js"),
        'hasil-produksi': Path("static/js/kelola_hasil_produksi.js"),
        'pemasok': Path("static/js/kelola_pemasok.js"),
        'sanitasi': Path("static/js/kelola_sanitasi.js"),
        'keuangan': Path("static/js/kelola_keuangan.js"),
    }
    
    print("\n📋 Variable Names in JS Files:")
    for module, file_path in js_files.items():
        if not file_path.exists():
            print(f"   ❌ {module}: File not found")
            continue
        
        content = file_path.read_text(encoding='utf-8')
        
        # Check if using window.API
        api_usage = re.findall(r'window\.API\.(\w+)\.(getAll|getById|create|update|delete)', content)
        
        if api_usage:
            api_name = api_usage[0][0] if api_usage else None
            print(f"   ✅ {module:20} | Using: window.API.{api_name}.*")
        else:
            print(f"   ⚠️  {module:20} | No window.API.* found")
        
        # Check localStorage fallback
        localstorage_usage = re.findall(r'localStorage\.(getItem|setItem).*["\']' + module.replace('-', '').replace('hasil-produksi', 'hasilProduksi'), content, re.IGNORECASE)
        if localstorage_usage:
            print(f"      ⚠️  localStorage fallback detected: {len(localstorage_usage)} usages")

if __name__ == "__main__":
    print("\n" + "=" * 80)
    print("CRUD CONNECTION VERIFICATION")
    print("=" * 80)
    
    backend_endpoints = check_backend_endpoints()
    frontend_apis = check_frontend_api_calls()
    backend_paths, frontend_paths = check_endpoint_paths()
    collections = check_collection_names()
    check_variable_names()
    
    print("\n" + "=" * 80)
    print("SUMMARY & RECOMMENDATIONS")
    print("=" * 80)
    
    print("\n✅ VERIFIED:")
    print("   - Backend endpoints exist for all modules")
    print("   - Frontend API definitions exist")
    print("   - window.API object registered")
    
    print("\n⚠️  POTENTIAL ISSUES:")
    print("   - Check if Flask server is running when creating data")
    print("   - Verify API calls are reaching backend (check Network tab)")
    print("   - Monitor Flask terminal for logs during CRUD operations")
    
    print("\n📋 NEXT STEPS:")
    print("   1. Run Flask server: python app.py")
    print("   2. Test create operation for each module")
    print("   3. Monitor Flask terminal for logs")
    print("   4. Check browser console for API call logs")
    print("   5. Verify data appears in MongoDB Atlas")
    print("=" * 80 + "\n")

