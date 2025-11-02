#!/bin/bash

# メール関連のEdge Functionsを一括デプロイするスクリプト

echo "======================================"
echo "メール関連 Edge Functions デプロイ開始"
echo "======================================"
echo ""

# カラー出力用
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# デプロイするFunctionのリスト
FUNCTIONS=(
  "send-email"
  "send-booking-confirmation"
  "send-reminder-emails"
  "send-cancellation-confirmation"
  "send-private-booking-confirmation"
  "send-private-booking-rejection"
  "send-booking-change-confirmation"
  "auto-send-reminder-emails"
)

# デプロイ結果を記録
SUCCESS_COUNT=0
FAIL_COUNT=0
FAILED_FUNCTIONS=()

# 各Functionをデプロイ
for FUNCTION in "${FUNCTIONS[@]}"; do
  echo "${YELLOW}[デプロイ中]${NC} $FUNCTION"
  
  if supabase functions deploy "$FUNCTION" --no-verify-jwt; then
    echo "${GREEN}[成功]${NC} $FUNCTION"
    echo ""
    ((SUCCESS_COUNT++))
  else
    echo "${RED}[失敗]${NC} $FUNCTION"
    echo ""
    ((FAIL_COUNT++))
    FAILED_FUNCTIONS+=("$FUNCTION")
  fi
done

# デプロイ結果を表示
echo "======================================"
echo "デプロイ結果"
echo "======================================"
echo "${GREEN}成功: $SUCCESS_COUNT 個${NC}"
echo "${RED}失敗: $FAIL_COUNT 個${NC}"
echo ""

if [ $FAIL_COUNT -gt 0 ]; then
  echo "${RED}失敗した Functions:${NC}"
  for FUNCTION in "${FAILED_FUNCTIONS[@]}"; do
    echo "  - $FUNCTION"
  done
  echo ""
  exit 1
else
  echo "${GREEN}全ての Edge Functions のデプロイに成功しました！${NC}"
  echo ""
fi

echo "======================================"
echo "次のステップ"
echo "======================================"
echo "1. Supabase Dashboard でデプロイを確認"
echo "   https://supabase.com/dashboard/project/<YOUR_PROJECT_ID>/functions"
echo ""
echo "2. 環境変数が設定されているか確認"
echo "   - RESEND_API_KEY"
echo "   - SUPABASE_URL"
echo "   - SUPABASE_SERVICE_ROLE_KEY"
echo ""
echo "3. Cron Jobs を設定（リマインダーメール自動送信）"
echo "   Function: auto-send-reminder-emails"
echo "   Schedule: 0 9 * * * (毎日 9:00 AM UTC)"
echo ""
echo "4. テスト送信を実行"
echo "   各メール機能をテストして動作確認してください"
echo ""

