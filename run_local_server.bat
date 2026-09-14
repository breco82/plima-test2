@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "run_local_server.ps1"
pause
