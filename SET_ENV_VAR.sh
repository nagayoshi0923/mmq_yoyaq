#!/bin/bash
# Supabase Edge Function環境変数を設定

echo "🔧 環境変数を設定中..."

npx supabase secrets set GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycbzCbdPDDprw5ENRJu_e7qJBYwyGu1WOobkJ6XSbHeA2q5ZnsoeUxSlE8Z97aVR3VPQ/exec

echo "✅ 設定完了！"

