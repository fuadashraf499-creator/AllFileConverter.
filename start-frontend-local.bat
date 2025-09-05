@echo off
echo Starting AllFileConverter Frontend Server...
echo.
cd /d "E:\ALL FILE CONVERTER\frontend"
echo Frontend directory: %CD%
echo.
echo Checking for http-server...
npm list -g http-server >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing http-server globally...
    npm install -g http-server
)
echo.
echo Starting frontend server on port 8080...
echo Frontend will be available at: http://localhost:8080
http-server -p 8080 -c-1
pause