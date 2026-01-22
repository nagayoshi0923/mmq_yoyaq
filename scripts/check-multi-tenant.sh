#!/bin/bash

# マルチテナント対応チェックスクリプト
# 使用方法: ./scripts/check-multi-tenant.sh

set -e

echo "🔍 マルチテナント対応チェックを開始..."

# カラー出力
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# チェック対象テーブル（organization_idが必要なテーブル）
TABLES=(
  "schedule_events"
  "reservations"
  "scenarios"
  "staff"
  "stores"
  "customers"
  "daily_memos"
  "shift_submissions"
  "staff_scenario_assignments"
  "schedule_event_history"
)

# 例外テーブル（organization_id不要）
EXCEPTION_TABLES=(
  "users"
  "organizations"
  "authors"
  "auth_logs"
)

# 問題を記録する配列
ISSUES=()

# 各テーブルをチェック
for table in "${TABLES[@]}"; do
  echo ""
  echo "📋 ${table} テーブルをチェック中..."
  
  # .from('table') または .from("table") を検索
  files=$(grep -r "\.from(['\"]${table}['\"])" src --include="*.ts" --include="*.tsx" | cut -d: -f1 | sort -u)
  
  if [ -z "$files" ]; then
    echo "  ✅ 使用されていません"
    continue
  fi
  
  for file in $files; do
    # ファイル内の該当行を取得
    lines=$(grep -n "\.from(['\"]${table}['\"])" "$file")
    
    while IFS= read -r line; do
      line_num=$(echo "$line" | cut -d: -f1)
      line_content=$(echo "$line" | cut -d: -f2-)
      
      # その行の前後20行を取得してコンテキストを確認
      context_start=$((line_num - 20))
      context_end=$((line_num + 20))
      if [ $context_start -lt 1 ]; then
        context_start=1
      fi
      
      context=$(sed -n "${context_start},${context_end}p" "$file")
      
      # organization_idフィルタがあるかチェック
      has_org_filter=false
      
      # パターン1: .eq('organization_id', orgId)
      if echo "$context" | grep -q "\.eq(['\"]organization_id['\"]"; then
        has_org_filter=true
      fi
      
      # パターン2: .eq("organization_id", orgId)
      if echo "$context" | grep -q '\.eq("organization_id"'; then
        has_org_filter=true
      fi
      
      # パターン3: organization_idが変数として設定されている（INSERT/UPSERTの場合）
      if echo "$context" | grep -q "organization_id:"; then
        has_org_filter=true
      fi
      
      # パターン4: getCurrentOrganizationId()が呼ばれている
      if echo "$context" | grep -q "getCurrentOrganizationId"; then
        has_org_filter=true
      fi
      
      if [ "$has_org_filter" = false ]; then
        echo "  ${RED}❌ 問題発見:${NC} $file:$line_num"
        echo "     $line_content"
        ISSUES+=("$file:$line_num:${table}")
      fi
    done <<< "$lines"
  done
done

# 結果サマリー
echo ""
echo "=========================================="
if [ ${#ISSUES[@]} -eq 0 ]; then
  echo "${GREEN}✅ 問題は見つかりませんでした！${NC}"
  exit 0
else
  echo "${RED}❌ ${#ISSUES[@]}件の問題が見つかりました:${NC}"
  for issue in "${ISSUES[@]}"; do
    echo "  - $issue"
  done
  echo ""
  echo "${YELLOW}💡 修正方法:${NC}"
  echo "  1. 該当ファイルを確認"
  echo "  2. organization_idフィルタを追加"
  echo "  3. 例外テーブル（users, organizations, authors, auth_logs）の場合は除外"
  exit 1
fi

