@echo off
echo Starting AllFileConverter Backend Server...
echo.
cd /d "E:\ALL FILE CONVERTER\backend"
echo Backend directory: %CD%
echo.
echo Starting Node.js server on port 3000...
node server.js
pause