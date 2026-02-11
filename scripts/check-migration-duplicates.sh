#!/bin/bash
# マイグレーションの重複バージョン番号を検出
# Usage: ./scripts/check-migration-duplicates.sh

set -e
cd "$(dirname "$0")/.."

echo "=== マイグレーション重複チェック ==="
echo ""

dupes=$(ls supabase/migrations/*.sql 2>/dev/null | while read f; do
  basename "$f" .sql | grep -oE '^[0-9]{14}' || true
done | sort | uniq -c | awk '$1>1{print $2" (出現回数: "$1")"}')

if [ -n "$dupes" ]; then
  echo "❌ 重複したバージョン番号を検出:"
  echo "$dupes"
  echo ""
  echo "対応: いずれかのファイルのバージョン番号を変更してください。"
  echo "例: 20260202100000_foo.sql → 20260202100001_foo.sql"
  exit 1
else
  echo "✅ 重複なし"
  exit 0
fi
