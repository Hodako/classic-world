@echo off
title Classic World POS Terminal - Windows
color 0b

echo =======================================================
echo          CLASSIC WORLD - ULTIMATE POS SYSTEM
echo          Connected to Next.js Engine and Hardware
echo =======================================================
echo.

cd /d "%~dp0"

:: 1. Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in your PATH!
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

:: 2. Check if local server is already running on port 3142
powershell -NoProfile -Command "(New-Object Net.Sockets.TcpClient).Connect('127.0.0.1', 3142)" >nul 2>nul
if %errorlevel% equ 0 (
    echo [INFO] Next.js POS Server is already active on port 3142.
) else (
    echo [INFO] Starting Next.js POS Server on port 3142...
    set PORT=3142
    start "ClassicWorld POS Server" /min node server.js
    timeout /t 3 /nobreak >nul
)

:: 3. Launch the Electron Windows POS Application
echo [INFO] Launching Classic World Desktop Application with 1-Click Silent Printing...
if exist "software\ClassicWorld-POS.exe" (
    start "" "software\ClassicWorld-POS.exe"
) else if exist "dist-electron\ClassicWorld-POS-win-x64\ClassicWorld-POS.exe" (
    start "" "dist-electron\ClassicWorld-POS-win-x64\ClassicWorld-POS.exe"
) else (
    npx electron ./electron/main.cjs
)

exit /b 0
