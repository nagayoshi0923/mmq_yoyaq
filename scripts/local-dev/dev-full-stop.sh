#!/usr/bin/env bash
# npm run dev:full で起動したものを止める（API 3000・画面 5173・ローカル Supabase）。DB の中身は残る。
set -uo pipefail
cd "$(dirname "$0")/../.."
pids=$(lsof -ti:3000,5173 -sTCP:LISTEN 2>/dev/null || true)
[ -n "$pids" ] && kill $pids 2>/dev/null || true
bash scripts/local-dev/supabase.sh stop
