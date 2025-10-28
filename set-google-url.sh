#!/bin/bash

# Google Apps Script WebアプリURLを設定するスクリプト

echo "📝 Google Apps Script URL設定"
echo ""
echo "1. Google Apps Scriptエディタを開く: https://script.google.com/home"
echo "2. 「シフト提出」プロジェクトを選択"
echo "3. 右上の「デプロイ」→「デプロイを管理」"
echo "4. WebアプリのURLをコピー"
echo ""
echo "URLを貼り付けてください:"
echo "(例: https://script.google.com/macros/s/...../exec)"
echo ""

# URLを環境変数として受け取る
if [ -z "$GOOGLE_URL" ]; then
  echo "❌ エラー: GOOGLE_URL環境変数が設定されていません"
  echo ""
  echo "使い方:"
  echo "  GOOGLE_URL='https://script.google.com/...' ./set-google-url.sh"
  exit 1
fi

# Supabaseシークレットに設定
supabase secrets set GOOGLE_APPS_SCRIPT_URL="$GOOGLE_URL"

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ 設定完了！"
  echo ""
  echo "次のステップ:"
  echo "1. Edge Functionを再デプロイ:"
  echo "   npx supabase functions deploy sync-shifts-to-google-sheet"
  echo ""
  echo "2. シフト提出ページでテスト"
else
  echo "❌ 設定失敗"
  exit 1
fi

