@echo off
cd /d "%~dp0"
echo ARES - open http://127.0.0.1:4173/?lang=en in your browser.
if exist "node.exe" (
  "node.exe" server.mjs
) else (
  node server.mjs
)
pause
