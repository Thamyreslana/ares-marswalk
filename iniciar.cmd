@echo off
cd /d "%~dp0"
echo ARES - Abra http://127.0.0.1:4173 no navegador.
if exist "node.exe" (
  "node.exe" server.mjs
) else (
  node server.mjs
)
pause
