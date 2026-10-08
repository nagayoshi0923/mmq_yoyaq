#!/usr/bin/env bash
# ローカル開発サーバー起動スクリプト
# - port 5173 が空いていれば npm run dev (vite) を起動
# - /api/* は vite.config.ts の proxy 経由でステージングへ
# - ブラウザは http://localhost:5173 を開く
#
# 画面だけを直すとき向け（API・DB は staging のものを使う）。
# API や DB も手元で動かして試すときは npm run dev:full（docs/development/local-dev.md）。
# 注: macOS 上で vercel dev は spawn EBADF を起こし API 関数を実行できないため使わない。
#     手元の API は scripts/dev-api-server.mjs が vercel dev の代わりに api/*.ts を直接実行する。

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
