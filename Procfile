web: bash -c 'PORT="${PORT:-${RAILWAY_HTTP_PORT:-${RAILWAY_TCP_PORT:-8080}}}"; exec gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --threads 8 --timeout 0'
