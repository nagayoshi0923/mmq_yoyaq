#!/bin/bash
# Google Apps Script URLを環境変数に設定するスクリプト

echo "https://script.google.com/macros/s/AKfycbz3Fw-g9mbl5Q3r6_26mHiDTUhPcVMS2SzTu4fQkxbLggkTftdW8tYF7bnq2dVLy7Y/exec:"
read -r GOOGLE_URL

echo "設定中..."
npx supabase secrets set GOOGLE_APPS_SCRIPT_URL="$GOOGLE_URL"

echo "✅ 設定完了！"
echo "テストするにはシフトを提出してください"


