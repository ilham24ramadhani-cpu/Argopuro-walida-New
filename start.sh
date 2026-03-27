#!/usr/bin/env bash

pip install -r requirements.txt

PORT="${PORT:-${RAILWAY_HTTP_PORT:-${RAILWAY_TCP_PORT:-8080}}}"
gunicorn app:app --bind 0.0.0.0:$PORT