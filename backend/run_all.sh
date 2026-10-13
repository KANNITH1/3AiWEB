#!/usr/bin/env bash
cd "$(dirname "$0")"
python3 auth.py & python3 server.py &
wait
