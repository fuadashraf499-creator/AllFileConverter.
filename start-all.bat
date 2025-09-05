@echo off
echo Starting AllFileConverter Platform...
echo.
echo [1/3] Starting Backend Server...
start "Backend" "E:\ALL FILE CONVERTER\start-backend-server.bat"
echo Waiting for backend to initialize...
timeout /t 5
echo.
echo [2/3] Starting Frontend Server...
start "Frontend" "E:\ALL FILE CONVERTER\start-frontend-server.bat"
echo Waiting for frontend to initialize...
timeout /t 3
echo.
echo [3/3] Opening AllFileConverter in browser...
start http://localhost:8080/index.html
echo.
echo ✅ AllFileConverter Platform Started!
echo.
echo 🌐 Frontend: http://localhost:8080
echo 🔧 Backend:  http://localhost:5002
echo 📊 Health:   http://localhost:5002/api/health
echo.
echo Press any key to close this window...
pause >nul