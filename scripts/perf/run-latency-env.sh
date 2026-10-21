#!/usr/bin/env bash
# 性能計測用: 本番の距離を模した遅延つきで、画面と /api を手元の local-repro DB につないで起動する。
#   画面        http://127.0.0.1:${PERF_WEB_PORT:-5196}
#   遅延の目安  API_DELAY: 画面→/api 1 往復（Vercel 関数の起動・距離込み）、DB_DELAY: /api→DB 1 往復、SB_DELAY: 画面→Supabase 1 往復
#   現状（関数 iad1・DB 東京）: API_DELAY=250 DB_DELAY=150 SB_DELAY=45
#   東京（関数 hnd1・DB 東京）: API_DELAY=60  DB_DELAY=3   SB_DELAY=45
# 遅延は起動中に変えられる: curl '127.0.0.1:5208/__latency?ms=60'（/api）、:55331（DB）、:55341（Supabase）
# 本番・ステージングには接続しない。
set -euo pipefail
cd "$(dirname "$0")/../.."
WEB_PORT="${PERF_WEB_PORT:-5196}"
API_PORT=5209; API_PROXY=5208; DB_PROXY=55331; SB_PROXY=55341
eval "$(npx --yes supabase status --workdir local-repro -o env 2>/dev/null | grep -E '^(PUBLISHABLE_KEY|SERVICE_ROLE_KEY)=')"
: "${PUBLISHABLE_KEY:?ローカル Supabase が起動していません（scripts/local-repro/db.sh start）}"

pids=()
trap 'kill "${pids[@]}" 2>/dev/null || true' EXIT
node scripts/perf/latency-proxy.mjs --listen "$DB_PROXY" --target 55321 --delay "${DB_DELAY:-150}" & pids+=($!)
node scripts/perf/latency-proxy.mjs --listen "$SB_PROXY" --target 55321 --delay "${SB_DELAY:-45}" & pids+=($!)
node scripts/perf/latency-proxy.mjs --listen "$API_PROXY" --target "$API_PORT" --delay "${API_DELAY:-250}" & pids+=($!)

LOCAL_REPRO_WEB_PORT="$WEB_PORT" LOCAL_REPRO_API_PORT="$API_PORT" LOCAL_REPRO_SUPABASE_URL="http://127.0.0.1:${DB_PROXY}" \
LOCAL_REPRO_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" LOCAL_REPRO_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  npx tsx scripts/local-repro/api-server.ts & pids+=($!)

VITE_SUPABASE_URL="http://127.0.0.1:${SB_PROXY}" VITE_SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" VITE_SUPABASE_ANON_KEY="$PUBLISHABLE_KEY" \
VITE_API_TARGET="http://127.0.0.1:${API_PROXY}" \
  npx vite --mode local-repro --port "$WEB_PORT" --strictPort
