#!/usr/bin/env bash
# 本番公開の戻し方（docs/ops/本番公開の戻し方_2026-10.md）の「今回新しく当てた版だけを戻す」手順を、使い捨ての手元 DB で確かめる。
# 2026-10-21 Codex 第 3 回レビュー N3: 戻す一覧に本番 hotfix 済みの 20261020100000 が入っていて、公開前へ戻すつもりで
#   札幌店の平日朝の枠（private_booking_store_day_slots の hotfix）まで戻してしまう問題への対応の確認。
# 流れ:
#   1. 本番の今の状態を作る: 基準（supabase/baseline）＋ 1 章の公開分以外の migration ＋ hotfix 済みの 20261020100000
#   2. 手順書 2 章の 0 のとおり、適用済みの一覧を基準ファイルに保存する。private_booking_store_day_slots の md5 = hotfix 後
#   3. 公開分を古い順に当てる（基準ファイルに無い版だけ。29 本）。ここで構造照合（N2）も実 DB の構造で行う:
#        20261021120000 の手前で A（staging 4380f874 相当、旧 claim あり）の期待差分、当て終えて B（#1196）の期待差分
#   4. 手順書 (c) の 3 のとおり、基準ファイルに無い版だけを新しい順に戻す（29 本。20261020100000 は戻さない）
#   5. 適用済みの一覧が基準ファイルと同じ、private_booking_store_day_slots の md5 が hotfix 後のまま
#   6. 対照: 古い手順（30 本）なら 20261020100000 の rollback も流れ、md5 が変わる（取引の中で確かめて巻き戻す）
# 2026-10-21 リリース統合: 本番には #1202 の 20261021144000 も当て済み（1 章の一覧の外。公開前の状態に入る）。1 章に reconcile 20261021170000 を
#   足して 31 行、当てるのは 29 本＋reconcile の 30 本。戻した後に 144000 を当て直し（手順書 (c) の 3）、公開前の DB 構造全体（public の表・ビュー・関数・型）と
#   比べる（以前は private_booking_store_day_slots の md5 だけを見ていた）。
# 本番・staging には接続しない（使い捨ての DB を別の番号で起動する）。メール・通知は送らない。
# 使い方: bash scripts/test-release-rollback-scope.sh   （KEEP=1 で終わっても DB を止めない）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
DOC="docs/ops/本番公開の戻し方_2026-10.md"
HOTFIX=20261020100000
HOTFIX_MD5=c0bec3c1cd17722fe446b23745ce89b8
FN="private_booking_store_day_slots"
A_SHA=4380f874db1ca5917d53036cd2e92c55c2081aef
BASELINE="$(ls supabase/baseline/*_prod.sql | sort | tail -1)"
BASELINE_VERSION="$(basename "$BASELINE" | cut -d_ -f1)"
WORK="$(mktemp -d)"; OUT="$(mktemp -d)"
cleanup() {
  if [ "${KEEP:-0}" != "1" ]; then (cd "$WORK" && supabase stop --no-backup >/dev/null 2>&1) || true; rm -rf "$WORK"; fi
  rm -rf "$OUT"
}
trap cleanup EXIT
(
  cd "$WORK"
  supabase init --force >/dev/null 2>&1
  python3 - "$WORK/supabase/config.toml" <<'PY'
import re, sys
p = sys.argv[1]; s = open(p).read()
s = re.sub(r'project_id = ".*?"', 'project_id = "mmq-release-scope"', s, count=1)
for a, b in [('54321','57321'),('54322','57322'),('54323','57323'),('54324','57324'),('54325','57325'),
             ('54326','57326'),('54327','57327'),('54329','57329'),('54320','57320'),('8083','58183')]:
    s = s.replace(a, b)
s = re.sub(r'major_version = \d+', 'major_version = 17', s, count=1)
open(p, 'w').write(s)
PY
  supabase start -x studio,mailpit,inbucket,edge-runtime,imgproxy,vector,logflare,postgres-meta,supavisor >/dev/null
)
DB_URL="postgresql://postgres:postgres@127.0.0.1:57322/postgres"
export PGOPTIONS='-c client_min_messages=error'
P=(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1)
md5_fn() { "${P[@]}" -Atc "SELECT md5(prosrc) FROM pg_proc WHERE proname = '$FN' AND pronamespace = 'public'::regnamespace"; }
mark() { "${P[@]}" -c "INSERT INTO supabase_migrations.schema_migrations(version, name) VALUES ('$1', '$2')" >/dev/null; }

# 1 章の公開分（手順書の表から読む）
grep -oE '^\| [0-9]+ \| `[0-9]{14}_[^`]+\.sql`' "$DOC" | grep -oE '[0-9]{14}_[^`]+' | sed 's/\.sql$//' > "$OUT/release.txt"
[ "$(wc -l < "$OUT/release.txt")" -eq 31 ] || { echo "1 章の一覧が 31 行ではない"; cat "$OUT/release.txt"; exit 1; }
RECONCILE_FIX=20261021144000
cut -d_ -f1 "$OUT/release.txt" > "$OUT/release_versions.txt"

echo "== 1. 本番の今の状態を作る（基準 $BASELINE_VERSION ＋ 公開分以外 ＋ hotfix ${HOTFIX}）"
"${P[@]}" -f "$BASELINE" >/dev/null
"${P[@]}" -c "CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY, name text, statements text[])" >/dev/null
"${P[@]}" -c "INSERT INTO supabase_migrations.schema_migrations(version, name) VALUES ('$BASELINE_VERSION', 'baseline') ON CONFLICT DO NOTHING" >/dev/null
pre=0
for f in $(ls supabase/migrations/*.sql | sort); do
  b="$(basename "$f" .sql)"; v="${b%%_*}"
  [[ "$v" > "$BASELINE_VERSION" ]] || continue
  if grep -qx "$v" "$OUT/release_versions.txt" && [ "$v" != "$HOTFIX" ]; then continue; fi
  "${P[@]}" -1 -f "$f" >/dev/null; mark "$v" "${b#*_}"; pre=$((pre + 1))
done
echo "   公開前に当たっている分: $pre 本（$HOTFIX を含む）"
[ "$(md5_fn)" = "$HOTFIX_MD5" ] || { echo "NG: 公開前の $FN が hotfix 後の md5 ではない: $(md5_fn)"; exit 1; }
DB_URL="$DB_URL" node scripts/db-structure-snapshot.mjs custom > "$OUT/before.json"

echo "== 2. 手順書 2 章の 0: 適用済みの一覧を基準ファイルに保存"
"${P[@]}" -At -c "SELECT version FROM supabase_migrations.schema_migrations ORDER BY 1" > "$OUT/release-baseline.txt"
echo "   保存 $(wc -l < "$OUT/release-baseline.txt") 行、$FN の md5 $(md5_fn)"

echo "== 3. 公開分を古い順に当てる（基準ファイルに無い版だけ）"
n=0
while read -r b; do
  v="${b%%_*}"; grep -qx "$v" "$OUT/release-baseline.txt" && continue
  if [ "$v" = 20261021120000 ]; then
    DB_URL="$DB_URL" node scripts/db-structure-snapshot.mjs custom > "$OUT/A_actual.json"
    git show "$A_SHA:supabase/structure/expected-function-overrides.json" > "$OUT/A_ov.json"
    echo "   構造照合 A（staging $A_SHA 相当、実 DB）: $(node scripts/check-function-overrides.mjs "$OUT/A_actual.json" "$OUT/A_ov.json")"
  fi
  "${P[@]}" -1 -f "supabase/migrations/$b.sql" >/dev/null; mark "$v" "${b#*_}"; n=$((n + 1))
done < "$OUT/release.txt"
echo "   当てた分: $n 本"
[ "$n" -eq 30 ] || { echo "NG: 当てる分が 30 本（29 本＋reconcile）ではない"; exit 1; }
DB_URL="$DB_URL" node scripts/db-structure-snapshot.mjs custom > "$OUT/B_actual.json"
echo "   構造照合 B（#1196、実 DB）: $(node scripts/check-function-overrides.mjs "$OUT/B_actual.json" supabase/structure/expected-function-overrides.json)"

echo "== 4. 手順書 (c) の 3: 基準ファイルに無い版だけを新しい順に戻す"
"${P[@]}" -At -c "SELECT version FROM supabase_migrations.schema_migrations ORDER BY 1 DESC" > "$OUT/now.txt"
grep -vxFf "$OUT/release-baseline.txt" "$OUT/now.txt" > "$OUT/to-rollback.txt" || true
[ "$(wc -l < "$OUT/to-rollback.txt")" -eq 30 ] || { echo "NG: 戻す分が 30 本ではない"; cat "$OUT/to-rollback.txt"; exit 1; }
! grep -qx "$RECONCILE_FIX" "$OUT/to-rollback.txt" || { echo "NG: #1202 の $RECONCILE_FIX が戻す対象に入った"; exit 1; }
! grep -qx "$HOTFIX" "$OUT/to-rollback.txt" || { echo "NG: hotfix $HOTFIX が戻す対象に入った"; exit 1; }
while read -r v; do
  f="$(ls supabase/rollbacks/${v}_*.sql)"
  "${P[@]}" -1 -f "$f" >/dev/null
  "${P[@]}" -c "DELETE FROM supabase_migrations.schema_migrations WHERE version = '$v'" >/dev/null
done < "$OUT/to-rollback.txt"
echo "   戻した分: $(wc -l < "$OUT/to-rollback.txt" | tr -d ' ') 本（$HOTFIX は含まない）"
# 手順書 (c) の 3: 29 本の rollback は 3 関数を 144000 より前に戻すので、最後に 144000 を当て直す（履歴は既にある）
"${P[@]}" -1 -f "$(ls supabase/migrations/${RECONCILE_FIX}_*.sql)" >/dev/null
echo "   $RECONCILE_FIX を当て直した"

echo "== 5. 公開前の状態に戻ったか"
"${P[@]}" -At -c "SELECT version FROM supabase_migrations.schema_migrations ORDER BY 1" > "$OUT/after.txt"
diff -q "$OUT/release-baseline.txt" "$OUT/after.txt" >/dev/null || { echo "NG: 適用済みの一覧が基準と違う"; diff "$OUT/release-baseline.txt" "$OUT/after.txt"; exit 1; }
[ "$(md5_fn)" = "$HOTFIX_MD5" ] || { echo "NG: 戻した後の $FN が hotfix 後の md5 ではない: $(md5_fn)"; exit 1; }
echo "   適用済みの一覧 = 基準ファイル、$FN の md5 = ${HOTFIX_MD5}（hotfix 後のまま）"
DB_URL="$DB_URL" node scripts/db-structure-snapshot.mjs custom > "$OUT/after.json"
python3 - "$OUT/before.json" "$OUT/after.json" <<'PY_CMP' || exit 1
import json, sys
a = json.load(open(sys.argv[1])); b = json.load(open(sys.argv[2])); ng = []
for k in ("tables", "views", "functions", "enums"):
    for name in sorted(set(a.get(k, {})) | set(b.get(k, {}))):
        if a.get(k, {}).get(name) != b.get(k, {}).get(name): ng.append(f"{k}.{name}")
if ng:
    print("NG: 戻した後の DB 構造が公開前と違う:"); print("\n".join("  " + x for x in ng)); sys.exit(1)
print(f"   DB 構造（表 {len(b['tables'])}・ビュー {len(b['views'])}・関数 {len(b['functions'])}）が公開前と一致")
PY_CMP

echo "== 6. 対照: 古い手順（30 本）なら hotfix も戻ってしまう"
old_md5="$("${P[@]}" -At <<SQL | tail -1
BEGIN;
\i $(ls supabase/rollbacks/${HOTFIX}_*.sql | sed 's/^/.\//')
SELECT md5(prosrc) FROM pg_proc WHERE proname = '$FN' AND pronamespace = 'public'::regnamespace;
ROLLBACK;
SQL
)"
echo "   $HOTFIX の rollback を流すと $FN の md5 は ${old_md5}（hotfix 前に戻る）。今回の手順では流さない"
[ "$old_md5" != "$HOTFIX_MD5" ] || { echo "NG: 対照で md5 が変わらなかった"; exit 1; }
[ "$(md5_fn)" = "$HOTFIX_MD5" ] || { echo "NG: 対照の巻き戻しが効いていない"; exit 1; }
echo "OK: test-release-rollback-scope"
