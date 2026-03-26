#!/bin/bash
echo "=== Restart Flask Server ==="
echo ""
echo "1. Mencari process Flask..."
FLASK_PID=$(ps aux | grep -i "python.*app.py" | grep -v grep | awk '{print $2}')

if [ -z "$FLASK_PID" ]; then
    echo "   ⚠️  Flask server tidak running"
    echo "   Mulai Flask server..."
    cd "/Users/ilham10ihsangmail.com/Desktop/Kuliah/Belajar Code"
    source venv/bin/activate
    python app.py &
    echo "   ✅ Flask server started"
else
    echo "   ✅ Flask server found (PID: $FLASK_PID)"
    echo "   Stop Flask server..."
    kill $FLASK_PID
    sleep 2
    echo "   ✅ Flask server stopped"
    echo ""
    echo "   Start Flask server lagi..."
    cd "/Users/ilham10ihsangmail.com/Desktop/Kuliah/Belajar Code"
    source venv/bin/activate
    python app.py &
    echo "   ✅ Flask server restarted"
fi

echo ""
echo "2. Tunggu 3 detik untuk server ready..."
sleep 3

echo ""
echo "3. Test health endpoint..."
HEALTH_RESPONSE=$(curl -s http://localhost:5002/api/health 2>&1)
if echo "$HEALTH_RESPONSE" | grep -q "status.*ok"; then
    echo "   ✅ Health endpoint OK"
    echo "$HEALTH_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$HEALTH_RESPONSE"
else
    echo "   ❌ Health endpoint masih error"
    echo "$HEALTH_RESPONSE"
fi

echo ""
echo "=== Selesai ==="
echo "Flask server running di background"
echo "Untuk stop: pkill -f 'python.*app.py'"
