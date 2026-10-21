#!/usr/bin/env bash
# 本番公開（2026-10 リリース統合 #1204）の「1 取引で当てる／戻す」SQL を、使い捨ての手元 DB で確かめる（2026-10-21 Codex 先行レビュー P1）。
# 本番・staging には接続しない。架空データだけ。app_config の接続先は手元の閉じた番号（外へ送らない）。
#   0. 本番相当: 基準 ＋ 公開分以外の migration（20261020100000・20261021144000 を含む）＋ 履歴。照合の基準（S0）を取る
#   1. 途中失敗: 20261020120000 の後でわざと失敗させた SQL → 全体が取り消され、照合・DB 構造とも S0 と同じ
#   2. 鍵待ち: 別の接続が stores を読んだまま取引を開けておく → lock_timeout（5 秒）で全体が取り消され、S0 と同じ。所要を記録
#   3. 当てる（1 本ごとに 0.2 秒待たせて取引を長くする）: 別の接続が 0.1 秒ごとに 3 関数と #1202 の検査の関数の md5 を読み、
#      「公開前の 4 つ」か「公開後の 3 つ（検査の関数なし）」以外の組み合わせが一度も見えないこと
#   4. ミラーの引き金: 公開後の DB で、scripts/mirror-prod-to-staging.sh の引き金の無効化・復元の文を作って流し、止めた引き金が止まったまま
#   5. 戻す（同じく 0.2 秒ずつ）: 同じ観測で窓が無いこと。戻した後の照合・DB 構造が S0 と同じ
#   6. 待たせない本番相当の SQL で当てる → 戻す。別の接続の読み書き（stores の読み取り、schedule_blocked_slots への書き込み）の待ち時間と所要を記録
# 使い方: bash scripts/test-release-bundle-2026-10.sh   （KEEP=1 で終わっても DB を止めない。LOG=保存先）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
DOC="docs/ops/本番公開の戻し方_2026-10.md"
BASELINE="$(ls supabase/baseline/*_prod.sql | sort | tail -1)"
BASELINE_VERSION="$(basename "$BASELINE" | cut -d_ -f1)"
WORK="$(mktemp -d)"; LOG="${LOG:-$(mktemp -d)}"; mkdir -p "$LOG"
PIDS=()
cleanup() {
  for p in "${PIDS[@]+"${PIDS[@]}"}"; do kill "$p" 2>/dev/null || true; done
  if [ "${KEEP:-0}" != "1" ]; then (cd "$WORK" && supabase stop --no-backup >/dev/null 2>&1) || true; rm -rf "$WORK"; fi
}
trap cleanup EXIT
(
  cd "$WORK"
  supabase init --force >/dev/null 2>&1
  python3 - "$WORK/supabase/config.toml" <<'PY'
import re, sys
p = sys.argv[1]; s = open(p).read()
s = re.sub(r'project_id = ".*?"', 'project_id = "mmq-release-bundle"', s, count=1)
for a, b in [('54321','57521'),('54322','57522'),('54323','57523'),('54324','57524'),('54325','57525'),
             ('54326','57526'),('54327','57527'),('54329','57529'),('54320','57520'),('8083','58583')]:
    s = s.replace(a, b)
s = re.sub(r'major_version = \d+', 'major_version = 17', s, count=1)
open(p, 'w').write(s)
PY
  supabase start -x studio,mailpit,inbucket,edge-runtime,imgproxy,vector,logflare,postgres-meta,supavisor >/dev/null
)
export DB_URL="postgresql://postgres:postgres@127.0.0.1:57522/postgres"
export PGOPTIONS='-c client_min_messages=error'
P=(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1)
mark() { "${P[@]}" -c "INSERT INTO supabase_migrations.schema_migrations(version, name) VALUES ('$1', '$2')" >/dev/null; }
structure() { node scripts/db-structure-snapshot.mjs custom > "$1"; }
same_structure() {
  python3 - "$1" "$2" <<'PY'
import json, sys
a = json.load(open(sys.argv[1])); b = json.load(open(sys.argv[2])); ng = []
for k in ("tables", "views", "functions", "enums"):
    for n in sorted(set(a.get(k, {})) | set(b.get(k, {}))):
        if a.get(k, {}).get(n) != b.get(k, {}).get(n): ng.append(f"{k}.{n}")
if ng: print("NG DB 構造が違う:", *ng[:20], sep="\n  "); sys.exit(1)
print(f"   DB 構造が同じ（表 {len(b['tables'])}・ビュー {len(b['views'])}・関数 {len(b['functions'])}）")
PY
}
state() { psql "$DB_URL" -X -At -F $'\t' -v ON_ERROR_STOP=1 -f scripts/release-state-snapshot.sql > "$1"; }

echo "== 0. 本番相当の DB を作る（基準 $BASELINE_VERSION ＋ 公開分以外 ＋ 20261020100000・20261021144000）"
grep -oE '^\| [0-9]+ \| `[0-9]{14}_[^`]+\.sql`' "$DOC" | grep -oE '[0-9]{14}' > "$LOG/release_versions.txt"
"${P[@]}" -f "$BASELINE" >/dev/null
# 新しい定期実行（process-web-push は https://<ref>.supabase.co の形のときだけ作られる）まで作られるよう、架空の接続設定を入れる。
# 定期実行は基準を取る前に全部止め、新しいものは同じ取引で無効にして作るので、どこへも呼びに行かない
"${P[@]}" -c "INSERT INTO public.app_config(key, value) VALUES ('supabase_url', 'https://releasebundletest.supabase.co'), ('supabase_anon_key', 'test-anon'), ('trigger_secret', 'test-secret') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value" >/dev/null
"${P[@]}" -c "CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY, name text, statements text[])" >/dev/null
mark "$BASELINE_VERSION" baseline
pre=0
for f in $(ls supabase/migrations/*.sql | sort); do
  b="$(basename "$f" .sql)"; v="${b%%_*}"
  [[ "$v" > "$BASELINE_VERSION" ]] || continue
  if grep -qx "$v" "$LOG/release_versions.txt" && [ "$v" != 20261020100000 ]; then continue; fi
  "${P[@]}" -1 -f "$f" >/dev/null; mark "$v" "${b#*_}"; pre=$((pre + 1))
done
"${P[@]}" -f supabase/seed.sql >/dev/null
# 定期実行が手元で外へ呼びに行かないよう、全部止めたうえで基準を取る（照合は active の値も含めて前後で比べる）
"${P[@]}" -c "SELECT cron.alter_job(jobid, active := false) FROM cron.job" >/dev/null
echo "   公開前に当たっている分: $pre 本、定期実行 $("${P[@]}" -Atc "SELECT count(*) FROM cron.job") 本"
structure "$LOG/S0.json"; state "$LOG/S0.tsv"

BUNDLES="$LOG/bundles"; mkdir -p "$BUNDLES"
node scripts/release-bundle-2026-10.mjs forward "$BUNDLES/forward.sql" >/dev/null
node scripts/release-bundle-2026-10.mjs rollback "$BUNDLES/rollback.sql" >/dev/null
node scripts/release-bundle-2026-10.mjs forward "$BUNDLES/forward-fail.sql" --test-fail-after 20261020120000 >/dev/null
node scripts/release-bundle-2026-10.mjs forward "$BUNDLES/forward-slow.sql" --test-sleep 0.2 >/dev/null
node scripts/release-bundle-2026-10.mjs rollback "$BUNDLES/rollback-slow.sql" --test-sleep 0.2 >/dev/null

# 戻した後は、写真のバケット private-group-photos（中身は空）だけが残る。Supabase の Storage はバケットを SQL から消させない
#（rollback の DO ブロックは NOTICE を出して続ける）。手順書 (c) の 1 で Storage の API から消す。それ以外は公開前と同じであること
check_same_as_s0() { structure "$LOG/$1.json"; same_structure "$LOG/S0.json" "$LOG/$1.json"; state "$LOG/$1.tsv"
  ALLOW_ADDED="${2:-}" node scripts/release-state-compare.mjs same "$LOG/S0.tsv" "$LOG/$1.tsv" | sed 's/^/   /'; [ "${PIPESTATUS[0]}" -eq 0 ] || exit 1; }

echo "== 1. 途中失敗（20261020120000 の後でわざと失敗）"
if OUT="$LOG/run-fail" bash scripts/release-apply-2026-10.sh forward "$BUNDLES/forward-fail.sql" > "$LOG/run-fail.txt" 2>&1; then echo "NG: 失敗するはずの SQL が通った"; exit 1; fi
grep -E '所要|ERROR' "$LOG/run-fail.txt" | head -2 | sed 's/^/   /'
check_same_as_s0 after-fail

echo "== 2. 鍵待ち（別の接続が stores を読んだまま取引を開けている）"
psql "$DB_URL" -X -q -c "BEGIN; SELECT count(*) FROM public.stores; SELECT pg_sleep(40); COMMIT;" >/dev/null 2>&1 &
LOCK_PID=$!; PIDS+=("$LOCK_PID"); sleep 1
if OUT="$LOG/run-lock" bash scripts/release-apply-2026-10.sh forward "$BUNDLES/forward.sql" > "$LOG/run-lock.txt" 2>&1; then echo "NG: 鍵待ちで止まるはずが通った"; exit 1; fi
grep -E '所要|ERROR' "$LOG/run-lock.txt" | head -2 | sed 's/^/   /'
kill "$LOCK_PID" 2>/dev/null || true; "${P[@]}" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query LIKE '%pg_sleep(40)%' AND pid <> pg_backend_pid()" >/dev/null || true
check_same_as_s0 after-lock

# 0.1 秒ごとに 3 関数と検査の関数の md5 を読む（自動で確定する 1 文ずつ = ほかのお客様の接続と同じ見え方）
POLL_SQL="SELECT clock_timestamp()::time(3), string_agg(proname || '=' || md5(prosrc), ' ' ORDER BY proname) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('create_private_booking_request','create_private_group_atomic','private_group_set_preferred_stores','private_booking_store_slot_rule')"
start_poll() { printf '%s\n\\watch i=0.1\n' "$POLL_SQL" | psql "$DB_URL" -X -At -F ' ' > "$1" 2>/dev/null & PIDS+=($!); POLL_PID=$!; }
PRE_SET="create_private_booking_request=f5ebfb22dc6bd56276a9297252670d86 create_private_group_atomic=c8704b6826f8f621bad8557782af2e87 private_booking_store_slot_rule=5bb140c7086928097e37d4f4243a2c0a private_group_set_preferred_stores=40c5130066af552342bb3bfabf628eb5"
POST_SET="create_private_booking_request=e9a9b7734feef48aaaa861502d7df13c create_private_group_atomic=ee6f42bfc6f950f6b77e00f6bd24e90d private_group_set_preferred_stores=7789faef2c22581c7a7dbdcb0313342a"
judge_poll() {
  local f="$1" total pre post other
  total=$(grep -c . "$f" || true); pre=$(grep -cF "$PRE_SET" "$f" || true); post=$(grep -cF "$POST_SET" "$f" || true)
  other=$(grep -vF -e "$PRE_SET" -e "$POST_SET" "$f" | grep -c . || true)
  echo "   観測 $total 回（公開前の組 $pre 回・公開後の組 $post 回・それ以外 $other 回）"
  [ "$other" -eq 0 ] || { echo "NG: 保護の無い組み合わせが見えた"; grep -vF -e "$PRE_SET" -e "$POST_SET" "$f" | head -3; exit 1; }
  [ "$pre" -gt 0 ] && [ "$post" -gt 0 ] || { echo "NG: 前後の両方を観測できていない"; exit 1; }
}

echo "== 3. 当てる（1 本ごとに 0.2 秒待たせた試験用の SQL。外から 0.1 秒ごとに観測）"
start_poll "$LOG/poll-forward.txt"; sleep 1
OUT="$LOG/run-forward-slow" bash scripts/release-apply-2026-10.sh forward "$BUNDLES/forward-slow.sql" > "$LOG/run-forward-slow.txt" 2>&1 || { cat "$LOG/run-forward-slow.txt"; exit 1; }
sleep 1; kill "$POLL_PID" 2>/dev/null || true; sleep 0.3
grep -E '所要|照合|OK|NG' "$LOG/run-forward-slow.txt" | sed 's/^/   /'
judge_poll "$LOG/poll-forward.txt"

echo "== 4. staging のミラーが止めた引き金を有効に戻さない（scripts/mirror-prod-to-staging.sh の文で確かめる）"
gen() { awk -v name="$1" '$0 ~ "^"name"=\\$\\(staging_psql -c \"" {on=1; next} on && /^"\)$/ {on=0} on' scripts/mirror-prod-to-staging.sh; }
gen TRIGGERS_DISABLE > "$LOG/mirror-disable.sql"; gen TRIGGERS_ENABLE > "$LOG/mirror-enable.sql"
[ -s "$LOG/mirror-disable.sql" ] && [ -s "$LOG/mirror-enable.sql" ] || { echo "NG: ミラーの文を取り出せない"; exit 1; }
TG="SELECT string_agg(c.relname || '.' || t.tgname || '=' || t.tgenabled::text, ' ' ORDER BY c.relname, t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace"
before_tg="$("${P[@]}" -Atc "$TG")"
echo "$before_tg" | grep -q 'private_group_messages.web_push_on_group_message=D' || { echo "NG: 前提（web_push の引き金が D）になっていない"; exit 1; }
dis="$("${P[@]}" -At -f "$LOG/mirror-disable.sql")"; ena="$("${P[@]}" -At -f "$LOG/mirror-enable.sql")"
printf 'BEGIN;\n%s\n%s\nCOMMIT;\n' "$dis" "$ena" | "${P[@]}" >/dev/null
after_tg="$("${P[@]}" -Atc "$TG")"
[ "$before_tg" = "$after_tg" ] || { echo "NG: ミラーの後で引き金の状態が変わった"; diff <(tr ' ' '\n' <<<"$before_tg") <(tr ' ' '\n' <<<"$after_tg") | head; exit 1; }
echo "   引き金 $(tr ' ' '\n' <<<"$after_tg" | grep -c .) 本の状態がミラーの前後で同じ（web_push の 2 本は D のまま）"

echo "== 5. 戻す（同じく 0.2 秒ずつ。外から観測）"
start_poll "$LOG/poll-rollback.txt"; sleep 1
OUT="$LOG/run-rollback-slow" bash scripts/release-apply-2026-10.sh rollback "$BUNDLES/rollback-slow.sql" > "$LOG/run-rollback-slow.txt" 2>&1 || { cat "$LOG/run-rollback-slow.txt"; exit 1; }
sleep 1; kill "$POLL_PID" 2>/dev/null || true; sleep 0.3
grep -E '所要|照合|OK|NG' "$LOG/run-rollback-slow.txt" | sed 's/^/   /'
judge_poll "$LOG/poll-rollback.txt"
check_same_as_s0 after-rollback-slow "bucket private-group-photos"

echo "== 6. 本番と同じ SQL（待たせない）で当てる → 戻す。別の接続の読み書きの待ち時間"
# 5 の戻しの退避（同じ日の名前）を脇へ移す。残っていると同じ日の 2 回目の戻しは「退避先が既にある」で止まる（安全側の決まり）
"${P[@]}" -c "ALTER SCHEMA rollback_backup RENAME TO rollback_backup_step5" >/dev/null
LOAD_SQL="SELECT count(*) FROM public.stores; INSERT INTO public.schedule_blocked_slots(organization_id, store_id, date, time_slot) VALUES ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000101', DATE '2030-01-01', 'morning'); DELETE FROM public.schedule_blocked_slots WHERE date = DATE '2030-01-01';"
for m in forward rollback; do
  printf '\\timing on\n%s\n\\watch i=0.02\n' "$LOAD_SQL" | psql "$DB_URL" -X -At > "$LOG/load-$m.txt" 2>&1 & PIDS+=($!); LP=$!
  sleep 1
  OUT="$LOG/run-$m" bash scripts/release-apply-2026-10.sh "$m" "$BUNDLES/$m.sql" > "$LOG/run-$m.txt" 2>&1 || { cat "$LOG/run-$m.txt"; exit 1; }
  sleep 1; kill "$LP" 2>/dev/null || true; sleep 0.3
  grep -E '所要|^OK|NG' "$LOG/run-$m.txt" | sed 's/^/   /'
  python3 - "$LOG/load-$m.txt" "$m" <<'PY'
import re, sys
ms = [float(x) for x in re.findall(r'Time: ([0-9.]+) ms', open(sys.argv[1]).read())]
errs = open(sys.argv[1]).read().count('ERROR')
print(f"   {sys.argv[2]}: 別の接続の読み書き {len(ms)} 回、最長 {max(ms) if ms else 0:.0f} ms、エラー {errs} 件")
PY
done
check_same_as_s0 after-final "bucket private-group-photos"
echo "OK: test-release-bundle-2026-10（記録: $LOG）"
