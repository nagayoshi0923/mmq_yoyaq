#!/usr/bin/env bash
# ローカル開発サーバー起動スクリプト
# - port 5173 が空いていれば npm run dev (vite) を起動
# - /api/* は vite.config.ts の proxy 経由でステージングへ
# - ブラウザは http://localhost:5173 を開く
#
# 注: 以前は vercel dev (port 3000) を起動して /api/* もローカルで動かす構成だったが、
# macOS 上で vercel dev が spawn EBADF を起こし API 関数が実行できないため、
# Vite proxy → staging deploy の構成に変更した。

set -u

cd "$(dirname "$0")/.."

# 既存の vite を kill（5173 を解放）
pid=$(lsof -ti:5173 -sTCP:LISTEN 2>/dev/null || true)
if [[ -n "$pid" ]]; then
  echo "🧹 port 5173 を使っている PID $pid を kill します"
  kill "$pid" 2>/dev/null || true
  sleep 1
fi

echo "🚀 vite を port 5173 で起動します（ブラウザは http://localhost:5173 を開いてください）"
echo "   /api/* はステージング deploy に proxy されます"
exec npm run dev
