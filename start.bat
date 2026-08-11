@echo off
title Quiz Platform - One-Click Start
cd /d "%~dp0"

echo ============================================================
echo   Quiz Platform - One-Click Start
echo   Production server (node server.mjs :8080 + API)
echo   Cloudflare tunnel (hoshinonyamain.me)
echo ============================================================
echo.

REM ---------- 0. Check node ----------
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo [ERROR] Node.js not found in PATH.
  echo          Please install Node.js first, or run from cmd with node available.
  pause
  exit /b 1
)

REM ---------- 1. Production server (includes backend API) ----------
echo [1/3] Production server ...
netstat -ano | findstr /i "LISTENING" | findstr /c:":8080" >nul 2>&1
if %errorlevel%==0 (
  echo       Port 8080 already running, skip.
) else (
  start "quiz-platform-server" cmd /k "cd /d %~dp0 && node server.mjs"
  echo       Started (node server.mjs)
)

REM ---------- 2. Cloudflare tunnel ----------
echo [2/3] Cloudflare tunnel ...
set "CF=%USERPROFILE%\..\cloudflared\cloudflared.exe"
if not exist "%CF%" set "CF=D:\cloudflared\cloudflared.exe"
if not exist "%CF%" set "CF=cloudflared"
tasklist | findstr /i "cloudflared" >nul 2>&1
if %errorlevel%==0 (
  echo       cloudflared already running, skip.
) else (
  start "quiz-platform-tunnel" cmd /k ""%CF%" tunnel run quiz-tunnel"
  echo       Started (cloudflared tunnel run quiz-tunnel)
)

REM ---------- 3. Verify ----------
echo [3/3] Verifying ...
ping -n 7 127.0.0.1 >nul
echo.
curl -s -o nul http://localhost:8080/ 2>nul && echo "  Local 8080    : OK" || echo "  Local 8080    : FAIL (not running)"
curl -s -o nul -m 20 https://hoshinonyamain.me/ 2>nul && echo "  Public hoshino : OK" || echo "  Public hoshino : FAIL (tunnel down)"
echo.
echo.
echo Done!
echo   Local  : http://localhost:8080
echo   Public : https://hoshinonyamain.me
echo   (Closing this window will NOT stop the services.)
echo   To stop: taskkill /F /IM node.exe /IM cloudflared.exe
echo.
pause
