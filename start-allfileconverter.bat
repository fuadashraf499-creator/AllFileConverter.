@echo off
echo Starting AllFileConverter Application...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Error: Node.js is not installed. Please install Node.js and try again.
    echo Download Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js is installed. Proceeding...
echo.

REM Set paths
set FRONTEND_PATH=.\AllFileConverter-Complete-Package\allfileconverter\frontend
set BACKEND_PATH=.\AllFileConverter-Complete-Package\allfileconverter\backend

REM Check if directories exist
if not exist %FRONTEND_PATH% (
    echo Error: Frontend directory not found at %FRONTEND_PATH%
    pause
    exit /b 1
)

if not exist %BACKEND_PATH% (
    echo Error: Backend directory not found at %BACKEND_PATH%
    pause
    exit /b 1
)

echo Directories found. Installing dependencies...
echo.

REM Install frontend dependencies
echo Installing frontend dependencies...
cd %FRONTEND_PATH%
npm install
if %ERRORLEVEL% NEQ 0 (
    echo Error installing frontend dependencies.
    pause
    exit /b 1
)

REM Install backend dependencies
echo.
echo Installing backend dependencies...
cd ..\..\..\%BACKEND_PATH%
npm install
if %ERRORLEVEL% NEQ 0 (
    echo Error installing backend dependencies.
    pause
    exit /b 1
)

echo.
echo All dependencies installed successfully!
echo.

REM Start backend server in a new window
echo Starting backend server...
start cmd /k "cd %BACKEND_PATH% && npm run dev"

REM Wait a moment for backend to initialize
timeout /t 5 /nobreak > nul

REM Start frontend server in a new window
echo Starting frontend server...
start cmd /k "cd %FRONTEND_PATH% && npm start"

echo.
echo AllFileConverter is starting up!
echo.
echo Frontend will be available at: http://localhost:3000
echo Backend API will be available at: http://localhost:5000
echo.
echo Press any key to close this window. The application will continue running in the other windows.
echo.
pause > nul