@echo off
chcp 65001 >nul
title 刷题平台 · 一键启动
cd /d "%~dp0"

echo ============================================================
echo   刷题平台 · 一键启动
echo   生产服务器 (node server.mjs :8080 + 后端 API)
echo   公网隧道 (cloudflared → hoshinonyamain.me)
echo ============================================================
echo.

REM ---------- 1. 生产服务器（含后端 API） ----------
echo [1/3] 生产服务器 ...
netstat -ano | findstr /c:":8080 " | findstr /i "LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo       8080 端口已在运行，跳过启动
) else (
  start "quiz-platform-server" cmd /k "cd /d %~dp0 && node server.mjs"
  echo       已启动 (node server.mjs)
)

REM ---------- 2. cloudflared 隧道 ----------
echo [2/3] 公网隧道 ...
set "CF=%USERPROFILE%\..\cloudflared\cloudflared.exe"
if not exist "%CF%" set "CF=D:\cloudflared\cloudflared.exe"
if not exist "%CF%" set "CF=cloudflared"
tasklist | findstr /i "cloudflared" >nul 2>&1
if %errorlevel%==0 (
  echo       cloudflared 已在运行，跳过启动
) else (
  start "quiz-platform-tunnel" cmd /k ""%CF%" tunnel run quiz-tunnel"
  echo       已启动 (cloudflared tunnel run quiz-tunnel)
)

REM ---------- 3. 验证 ----------
echo [3/3] 验证服务 ...
timeout /t 6 /nobreak >nul
echo.
curl -s -o nul -w "  本机 8080    : %%{http_code}" http://localhost:8080/ 2>nul
echo.
curl -s -o nul -w "  公网 hoshino  : %%{http_code}" https://hoshinonyamain.me/ 2>nul
echo.
echo.
echo 启动流程完成！
echo   本机访问: http://localhost:8080
echo   公网访问: https://hoshinonyamain.me
echo   （关闭本窗口不会停止服务；停止服务请关闭对应窗口或 taskkill /IM node.exe /IM cloudflared.exe）
echo.
pause
