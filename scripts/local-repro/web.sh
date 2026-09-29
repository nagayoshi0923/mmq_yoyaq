#!/usr/bin/env bash
# 不具合再現用: 画面と /api をローカル Supabase につないで起動する（本番・ステージングには接続しない）
# 前提: scripts/local-repro/db.sh start 済み
set -euo pipefail
cd "$(dirname "$0")/../.."

WEB_PORT="${LOCAL_REPRO_WEB_PORT:-5176}"
API_PORT="${LOCAL_REPRO_API_PORT:-5189}"
eval "$(npx --yes supabase status --workdir local-repro -o env 2>/dev/null | grep -E '^(PUBLISHABLE_KEY|SERVICE_ROLE_KEY)=')"
: "${PUBLISHABLE_KEY:?ローカル Supabase が起動していません（scripts/local-repro/db.sh start）}"

export LOCAL_REPRO_WEB_PORT="$WEB_PORT" LOCAL_REPRO_API_PORT="$API_PORT"
export LOCAL_REPRO_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" LOCAL_REPRO_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export VITE_SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" VITE_SUPABASE_ANON_KEY="$PUBLISHABLE_KEY"
export VITE_API_TARGET="http://127.0.0.1:${API_PORT}"   # /api をステージングではなくローカル関数へ

npx tsx scripts/local-repro/api-server.ts &
API_PID=$!
trap 'kill $API_PID 2>/dev/null || true' EXIT
npx vite --mode local-repro --port "$WEB_PORT" --strictPort
