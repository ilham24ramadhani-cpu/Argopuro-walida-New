#!/bin/bash
echo "=== 1. Cek Flask Process ==="
if ps aux | grep -i "python.*app.py\|flask" | grep -v grep > /dev/null; then
    echo "✅ Flask server running"
    ps aux | grep -i "python.*app.py\|flask" | grep -v grep
else
    echo "❌ Flask server tidak running"
fi

echo -e "\n=== 2. Cek Port 5002 ==="
if lsof -ti:5002 > /dev/null 2>&1; then
    echo "✅ Port 5002 digunakan"
    lsof -ti:5002 | xargs ps -p
else
    echo "❌ Port 5002 tidak digunakan"
fi

echo -e "\n=== 3. Test Health Endpoint ==="
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:5002/api/health 2>&1)
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
BODY=$(echo "$HEALTH_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Health endpoint accessible (HTTP $HTTP_CODE)"
    echo "Response: $BODY"
else
    echo "❌ Health endpoint error (HTTP $HTTP_CODE)"
    echo "Response: $BODY"
fi

echo -e "\n=== 4. Cek MongoDB Connection ==="
python3 << 'PYTHON'
import sys
import os
from dotenv import load_dotenv
from pymongo import MongoClient
from urllib.parse import quote_plus
from os.path import join, dirname

try:
    dotenv_path = join(dirname(__file__), '.env')
    load_dotenv(dotenv_path)
    
    MONGODB_URI = os.environ.get('MONGODB_URI')
    DB_NAME = os.environ.get('DB_NAME')
    
    if not MONGODB_URI or not DB_NAME:
        print('❌ Missing environment variables')
        exit(1)
    
    MONGODB_URI = MONGODB_URI.strip().strip('"').strip("'")
    DB_NAME = DB_NAME.strip().strip('"').strip("'")
    
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
    
    client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=30000)
    db = client[DB_NAME]
    client.admin.command('ping')
    
    print('✅ MongoDB Connection: SUCCESS')
    print(f'✅ Database: {DB_NAME}')
    
    collections = db.list_collection_names()
    print(f'\n📊 Collections: {len(collections)}')
    
    total_docs = 0
    for collection_name in collections:
        count = db[collection_name].count_documents({})
        total_docs += count
        print(f'  - {collection_name}: {count} documents')
    
    if total_docs == 0:
        print('\n⚠️  Tidak ada data di MongoDB!')
        print('   Kemungkinan: Data masih di localStorage')
    else:
        print(f'\n✅ Total documents: {total_docs}')
    
    client.close()
except Exception as e:
    print(f'❌ MongoDB Connection: FAILED')
    print(f'   Error: {str(e)[:200]}')
PYTHON

echo -e "\n=== 5. Cek localStorage (via browser) ==="
echo "Buka browser console dan jalankan:"
echo "  JSON.parse(localStorage.getItem('users') || '[]').length"
echo "  JSON.parse(localStorage.getItem('pemasok') || '[]').length"
echo "  JSON.parse(localStorage.getItem('bahan') || '[]').length"
