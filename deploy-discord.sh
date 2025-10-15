#!/bin/bash
# Discord関連のEdge Functionsをデプロイして、JWT検証を無効化

echo "📦 Deploying Discord functions..."

# notify-private-booking-discord をデプロイ
echo "1/2 Deploying notify-private-booking-discord..."
supabase functions deploy notify-private-booking-discord

# discord-interactions をデプロイ
echo "2/2 Deploying discord-interactions..."
supabase functions deploy discord-interactions

echo ""
echo "✅ Deployment complete!"
echo ""
echo "⚠️  重要: 次の手順を実行してください:"
echo "1. Supabase Dashboard を開く"
echo "2. Edge Functions → discord-interactions → Settings"
echo "3. 'Verify JWT' を OFF にする"
echo ""
echo "Dashboard: https://supabase.com/dashboard/project/cznpcewciwywcqcxktba/functions"

