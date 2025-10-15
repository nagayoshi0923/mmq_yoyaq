#!/bin/bash
# Discord関連のEdge Functionsをデプロイして、自動的にJWT検証を無効化

set -e  # エラーが発生したら停止

PROJECT_REF="cznpcewciwywcqcxktba"

echo "📦 Deploying Discord functions..."
echo ""

# notify-private-booking-discord をデプロイ
echo "1/2 Deploying notify-private-booking-discord..."
supabase functions deploy notify-private-booking-discord
echo "✅ notify-private-booking-discord deployed"
echo ""

# discord-interactions をデプロイ
echo "2/2 Deploying discord-interactions..."
supabase functions deploy discord-interactions
echo "✅ discord-interactions deployed"
echo ""

# JWT検証を無効化（Supabase Management API使用）
echo "🔧 Configuring JWT verification..."

# 環境変数からトークンを取得
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  # .env.local から読み込み
  if [ -f .env.local ]; then
    export $(cat .env.local | grep SUPABASE_ACCESS_TOKEN | xargs)
  fi
fi

if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  echo ""
  echo "⚠️  SUPABASE_ACCESS_TOKEN が設定されていません"
  echo ""
  echo "手動で設定してください:"
  echo "1. Supabase Dashboard を開く"
  echo "2. Edge Functions → discord-interactions → Settings"
  echo "3. 'Verify JWT' を OFF にする"
  echo ""
  echo "または、SUPABASE_API_TOKEN_SETUP.md を参照してトークンを設定してください"
  exit 0
fi

# discord-interactions のJWT検証を無効化
echo "  - discord-interactions: Disabling JWT verification..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X PATCH \
  "https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/discord-interactions" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"verify_jwt": false}')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "204" ]; then
  echo "  ✅ JWT verification disabled for discord-interactions"
else
  echo "  ⚠️  Failed to disable JWT verification (HTTP $HTTP_CODE)"
  echo "  Response: $BODY"
  echo ""
  echo "  手動で無効化してください:"
  echo "  Dashboard → Edge Functions → discord-interactions → Settings → Verify JWT OFF"
fi

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "Dashboard: https://supabase.com/dashboard/project/${PROJECT_REF}/functions"

