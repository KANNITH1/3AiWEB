@echo off
cd /d %~dp0
start "auth.py 5001" cmd /k python auth.py
start "server.py 5000" cmd /k python server.py
