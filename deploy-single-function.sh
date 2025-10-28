#!/bin/bash

# Supabase Edge Function 単体デプロイスクリプト
# 常に --no-verify-jwt でデプロイ

if [ -z "$1" ]; then
  echo "❌ エラー: 関数名を指定してください"
  echo ""
  echo "使い方:"
  echo "  ./deploy-single-function.sh <関数名>"
  echo ""
  echo "例:"
  echo "  ./deploy-single-function.sh sync-shifts-to-google-sheet"
  exit 1
fi

FUNCTION_NAME="$1"

echo "🚀 Edge Functionデプロイ: $FUNCTION_NAME"
echo ""

# --no-verify-jwt を常に適用
npx supabase functions deploy "$FUNCTION_NAME" --no-verify-jwt

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ デプロイ完了: $FUNCTION_NAME"
  exit 0
else
  echo ""
  echo "❌ デプロイ失敗: $FUNCTION_NAME"
  exit 1
fi

