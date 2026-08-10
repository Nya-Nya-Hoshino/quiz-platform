#!/usr/bin/env bash
# 刷题平台 · 一键启动（生产服务器 + 后端 API + 公网隧道）
# 用法: ./start.sh    （在项目根目录执行）
set -u
cd "$(dirname "$0")" || exit 1

echo "============================================================"
echo "  刷题平台 · 一键启动"
echo "  生产服务器 (node server.mjs :8080 + 后端 API)"
echo "  公网隧道 (cloudflared → hoshinonyamain.me)"
echo "============================================================"

# ---------- 1. 生产服务器（含后端 API） ----------
echo "[1/3] 生产服务器 ..."
if curl -s -o /dev/null -m 2 http://localhost:8080/ 2>/dev/null; then
  echo "      8080 端口已在运行，跳过启动"
else
  nohup node server.mjs > /tmp/quiz-platform-server.log 2>&1 &
  echo "      已启动 (node server.mjs) → 日志 /tmp/quiz-platform-server.log"
fi

# ---------- 2. cloudflared 隧道 ----------
echo "[2/3] 公网隧道 ..."
CF=""
for c in \
  "$USERPROFILE/../cloudflared/cloudflared.exe" \
  "/d/cloudflared/cloudflared.exe" \
  "cloudflared"; do
  if [ -f "$c" ] || command -v "$c" >/dev/null 2>&1; then CF="$c"; break; fi
done
if [ -z "$CF" ]; then
  echo "      ⚠ 未找到 cloudflared（请安装或放到 D:\\cloudflared\\）"
else
  if tasklist 2>/dev/null | grep -i cloudflared >/dev/null; then
    echo "      cloudflared 已在运行，跳过启动"
  else
    nohup "$CF" tunnel run quiz-tunnel > /tmp/quiz-platform-tunnel.log 2>&1 &
    echo "      已启动 (cloudflared tunnel run quiz-tunnel) → 日志 /tmp/quiz-platform-tunnel.log"
  fi
fi

# ---------- 3. 验证 ----------
echo "[3/3] 验证服务 ..."
sleep 8
echo "  本机 8080   : $(curl -s -o /dev/null -w '%{http_code}' -m 5 http://localhost:8080/ 2>/dev/null || echo '无法连接')"
echo "  公网 hoshino: $(curl -s -o /dev/null -w '%{http_code}' -m 20 https://hoshinonyamain.me/ 2>/dev/null || echo '无法连接')"
echo
echo "启动流程完成！"
echo "  本机访问: http://localhost:8080"
echo "  公网访问: https://hoshinonyamain.me"
echo "  停止服务: taskkill //F //IM node.exe //IM cloudflared.exe"
