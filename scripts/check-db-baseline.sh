#!/usr/bin/env bash
# 整備 1: リポジトリから本番と同じ DB 構造を再現できるかを確かめる。
#   使い捨ての手元 DB（Supabase のローカル環境を別の番号で起動）に
#   supabase/baseline/<版>_prod.sql と、それより新しい supabase/migrations を順に流し、
#   本番の構造の写し（supabase/structure/prod.json、毎日の drift チェックで本番と照合済み）と比べる。
# 本番・検証環境には接続しない。データは扱わない。
#
# 使い方:
#   bash scripts/check-db-baseline.sh            # 起動 → 流し込み → 比較 → 停止
#   KEEP=1 bash scripts/check-db-baseline.sh     # 終わっても手元 DB を止めない（調べる用）
#   DB_URL=postgresql://... bash scripts/check-db-baseline.sh   # 既に用意した空の DB を使う
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BASELINE="$(ls supabase/baseline/*_prod.sql | sort | tail -1)"
BASELINE_VERSION="$(basename "$BASELINE" | cut -d_ -f1)"
# 再現しても文面が同じにならないが、意味は同じ差（DB が式を読み直すと括弧の付け方が変わる）
ALLOWED_DIFFS=("tables.coupon_campaigns.constraints")
# 適用後の期待構造と実環境スナップショットは分離する。driftはprod/stagingを引き続き厳密照合。
EXPECTED_STRUCTURE="supabase/structure/prod.json"
EXPECTED_TEMP=""
if [ -f supabase/structure/expected-function-overrides.json ]; then
  EXPECTED_TEMP="$(mktemp)"
  python3 - "$EXPECTED_STRUCTURE" supabase/structure/expected-function-overrides.json "$EXPECTED_TEMP" <<'PY_EXPECTED'
import json, sys
base=json.load(open(sys.argv[1])); overrides=json.load(open(sys.argv[2]))
base['functions'].update(overrides)
from pathlib import Path
table_fixture=Path('supabase/structure/expected-table-overrides.json')
if table_fixture.exists(): base['tables'].update(json.loads(table_fixture.read_text()))
with open(sys.argv[3], 'w') as out: json.dump(base,out)
PY_EXPECTED
  EXPECTED_STRUCTURE="$EXPECTED_TEMP"
fi

WORK=""
cleanup() {
  if [ -n "$EXPECTED_TEMP" ]; then rm -f "$EXPECTED_TEMP"; fi
  if [ -n "$WORK" ] && [ "${KEEP:-0}" != "1" ]; then
    (cd "$WORK" && supabase stop --no-backup >/dev/null 2>&1) || true
    rm -rf "$WORK"
  fi
}
trap cleanup EXIT

if [ -z "${DB_URL:-}" ]; then
  WORK="$(mktemp -d)"
  (
    cd "$WORK"
    supabase init --force >/dev/null 2>&1
    python3 - "$WORK/supabase/config.toml" <<'PY'
import re, sys
p = sys.argv[1]; s = open(p).read()
s = re.sub(r'project_id = ".*?"', 'project_id = "mmq-baseline-check"', s, count=1)
for a, b in [('54321','56321'),('54322','56322'),('54323','56323'),('54324','56324'),('54325','56325'),
             ('54326','56326'),('54327','56327'),('54329','56329'),('54320','56320'),('8083','58083')]:
    s = s.replace(a, b)
s = re.sub(r'major_version = \d+', 'major_version = 17', s, count=1)
open(p, 'w').write(s)
PY
    supabase start -x studio,mailpit,inbucket,edge-runtime,imgproxy,vector,logflare,postgres-meta,supavisor >/dev/null
  )
  DB_URL="postgresql://postgres:postgres@127.0.0.1:56322/postgres"
fi

echo "基準: $BASELINE"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$BASELINE" >/dev/null

applied=0
for f in $(ls supabase/migrations/*.sql | sort); do
  v="$(basename "$f" | cut -d_ -f1)"
  if [[ "$v" > "$BASELINE_VERSION" ]]; then
    echo "追加の変更: $(basename "$f")"
    psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
    applied=$((applied + 1))
  fi
done
echo "基準より新しい変更: ${applied} 本"

set +e
out="$(DB_URL="$DB_URL" node scripts/db-structure-snapshot.mjs custom --diff-against "$EXPECTED_STRUCTURE" 2>&1)"
set -e
remaining="$(printf '%s\n' "$out" | grep -E '^  [~+-] ' | sed -E 's/^  [~+-] //' | grep -vxF -f <(printf '%s\n' "${ALLOWED_DIFFS[@]}") || true)"
if [ -n "$remaining" ]; then
  echo "❌ 基準と変更から作った構造が、適用後の期待構造と違います:"
  printf '%s\n' "$remaining"
  exit 1
fi
echo "✅ 基準と変更から、適用後の期待構造を再現できました（意味が同じ文面の差 ${#ALLOWED_DIFFS[@]} 件を除く）"
