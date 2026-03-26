#!/usr/bin/env python3
"""
Script untuk menambahkan api-service.js ke semua HTML templates
"""
import os
import re
from pathlib import Path

TEMPLATES_DIR = Path("templates")
API_SERVICE_SCRIPT = '<script src="../script/api-service.js" defer></script>'

def update_html_file(file_path):
    """Update HTML file untuk menambahkan api-service.js jika belum ada"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Skip jika sudah ada api-service.js
        if 'api-service.js' in content:
            print(f"⏭️  {file_path.name} - Sudah ada api-service.js")
            return False
        
        # Skip file khusus yang tidak perlu (welcome, login, register, test files)
        skip_files = ['welcome.html', 'login.html', 'login_owner.html', 'login_karyawan.html', 
                     'register.html', 'test_localstorage.html', 'pdf-viewer.html']
        if file_path.name in skip_files:
            print(f"⏭️  {file_path.name} - Skip (file khusus)")
            return False
        
        # Cari pattern script tags untuk JS files
        # Cari lokasi sebelum script utama atau sebelum closing </head>
        patterns = [
            (r'(<script\s+src=["\']\.\./script/[^"\']+\.js["\']\s+defer></script>)', 
             r'\1\n    ' + API_SERVICE_SCRIPT),
            (r'(<!-- JS -->\s*<script)', 
             r'<!-- JS -->\n    ' + API_SERVICE_SCRIPT + '\n    <script'),
            (r'(</head>)', 
             '    ' + API_SERVICE_SCRIPT + '\n  </head>'),
        ]
        
        updated = False
        for pattern, replacement in patterns:
            if re.search(pattern, content, re.MULTILINE):
                content = re.sub(pattern, replacement, content, count=1)
                updated = True
                break
        
        if updated:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"✅ {file_path.name} - Updated")
            return True
        else:
            # Fallback: tambahkan sebelum </head>
            content = content.replace('</head>', f'    {API_SERVICE_SCRIPT}\n  </head>')
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"✅ {file_path.name} - Updated (fallback method)")
            return True
            
    except Exception as e:
        print(f"❌ {file_path.name} - Error: {e}")
        return False

def main():
    """Main function"""
    print("🚀 Starting HTML templates update...\n")
    
    if not TEMPLATES_DIR.exists():
        print(f"❌ Directory {TEMPLATES_DIR} tidak ditemukan!")
        return
    
    html_files = list(TEMPLATES_DIR.glob("*.html"))
    updated_count = 0
    skipped_count = 0
    
    for html_file in sorted(html_files):
        if update_html_file(html_file):
            updated_count += 1
        else:
            skipped_count += 1
    
    print(f"\n📊 Summary:")
    print(f"   ✅ Updated: {updated_count} files")
    print(f"   ⏭️  Skipped: {skipped_count} files")
    print(f"   📁 Total: {len(html_files)} files")

if __name__ == "__main__":
    main()

