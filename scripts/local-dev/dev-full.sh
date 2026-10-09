#!/usr/bin/env bash
# 手元で 画面・API・DB を全部動かす（npm run dev:full）。本番・staging には一切接続しない。
#
#   1. ローカル Supabase（Docker）を起動。初回は DB を作り、構造と試験データ（supabase/seed.sql）を入れる
#   2. API サーバー（scripts/dev-api-server.mjs、http://localhost:3000、ファイル変更で自動再起動）
#   3. 画面（vite。.env.local を読むが Supabase の接続先は手元に固定。http://localhost:5173。/api は 3000 番へ転送）
#      ※ vite は "local" という mode 名を使えない（.env.*.local と衝突）ため通常の development mode で起動する
#
# Ctrl+C で API と画面は止まる。Supabase は動いたまま（止めるなら npm run dev:full:stop）。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if ! docker info >/dev/null 2>&1; then
  echo "Docker が起動していません。Docker Desktop を起動してから、もう一度 npm run dev:full を実行してください。" >&2
  exit 1
fi

for port in 3000 5173; do
  if lsof -ti:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "port $port が使用中です。npm run dev:full:stop（または npm run dev:stop）で止めてから実行してください。" >&2
    exit 1
  fi
done

# 例ファイルから手元用の設定を作る（既にあれば触らない）
[ -f .env.local ] || { cp .env.local.example .env.local; echo ".env.local を .env.local.example から作成しました"; }
[ -f .env.api.local ] || { cp .env.api.local.example .env.api.local; echo ".env.api.local を .env.api.local.example から作成しました"; }

bash scripts/local-dev/supabase.sh start

# 接続先は .env.local の内容に関わらず、必ず手元の Supabase に固定する
# （既に設定済みの環境変数は vite・API サーバーとも .env ファイルより優先される）
eval "$(bash scripts/local-dev/supabase.sh env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
: "${ANON_KEY:?ローカル Supabase のキーを取得できませんでした（npm run supabase:status で確認）}"
export SUPABASE_URL="$API_URL" SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export VITE_SUPABASE_URL="$API_URL" VITE_SUPABASE_ANON_KEY="$ANON_KEY" VITE_SUPABASE_PUBLISHABLE_KEY="$ANON_KEY"
export ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-http://localhost:5173}"
export VITE_API_TARGET="http://127.0.0.1:${DEV_API_PORT:-3000}"

cat <<MSG

────────────────────────────────────────────────────────────
 画面      http://localhost:5173/queens-waltz
 API       http://localhost:${DEV_API_PORT:-3000}/api/...
 DB 管理   http://localhost:54323（Supabase Studio）
 メール    http://localhost:54324（Mailpit。送ったメールはここに届く）
 試験アカウント: docs/development/local-dev.md
────────────────────────────────────────────────────────────

MSG

exec npx concurrently --kill-others --names api,web --prefix-colors cyan,magenta \
  "tsx watch --clear-screen=false scripts/dev-api-server.mjs" \
  "vite"
