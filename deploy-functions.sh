#!/bin/bash

# Supabase Edge Functions 一括デプロイスクリプト
# すべてのFunctionを --no-verify-jwt でデプロイ

echo "🚀 Supabase Edge Functions デプロイ開始"
echo ""

# デプロイする関数のリスト
FUNCTIONS=(
  "notify-shift-request-discord-simple"
  "notify-shift-submitted-discord"
  "sync-shifts-to-google-sheet"
  "discord-shift-interactions"
)

# 各関数をデプロイ
SUCCESS_COUNT=0
FAILED_COUNT=0

for func in "${FUNCTIONS[@]}"; do
  echo "📦 デプロイ中: $func"
  
  if npx supabase functions deploy "$func" --no-verify-jwt; then
    echo "✅ 成功: $func"
    ((SUCCESS_COUNT++))
  else
    echo "❌ 失敗: $func"
    ((FAILED_COUNT++))
  fi
  
  echo ""
done

# 結果表示
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 デプロイ結果"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 成功: $SUCCESS_COUNT 個"
echo "❌ 失敗: $FAILED_COUNT 個"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $FAILED_COUNT -eq 0 ]; then
  echo ""
  echo "🎉 すべてのFunctionのデプロイが完了しました！"
  exit 0
else
  echo ""
  echo "⚠️  一部のFunctionのデプロイに失敗しました"
  exit 1
fi

