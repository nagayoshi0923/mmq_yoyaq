#!/usr/bin/env bash
# 来店確認（もぎる）の rollback が、実行中の来店確認の更新を取りこぼさないことを 2 本の接続で確かめる（Codex 第 2 回再レビュー R2）。
#   接続 A: 5 件目の使用履歴を「来店確認済み」に UPDATE し、確定せずに持ったままにする（実行中の「もぎる」）。
#   接続 B: 20261020220000 → 20261020130000 の rollback を新しい順に流す。130000 の冒頭の表ロックで A の確定を待ち、
#           A が確定してから退避するので、退避は 5 件（A の分を含む）になる。
#   2 回目: A が 15 秒持ち続けると、B は 10 秒（lock_timeout）で失敗し、退避表も作らず列も消さない。
# B は外側の取引の中で流して最後に巻き戻す（手元 DB の構造は変えない）。下準備の行は最後に消す。メール・通知は送らない。
# 使い方: bash supabase/tests/coupon_redeem_rollback_race.sh   （DB_URL で接続先を変えられる。既定は手元の supabase）
#         ROLLBACK_FILE=<旧版の rollback> を渡すと、その版で同じ試験を流せる（直す前の版では 1 回目が失敗する）。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
DB_URL="${DB_URL:-$(npx --no-install supabase status --output json 2>/dev/null | jq -r '.DB_URL' 2>/dev/null || true)}"
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in *127.0.0.1*|*localhost*) ;; *) echo "手元の DB 以外では流さない: $DB_URL" >&2; exit 2 ;; esac
ROLLBACK_FILE="${ROLLBACK_FILE:-supabase/rollbacks/20261020130000_coupon_usage_redeem.sql}"
WORK="$(mktemp -d)"
P=(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1)
strip() { sed -E '/^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;[[:space:]]*$/d' "$1"; }

cleanup_rows() {
  "${P[@]}" >/dev/null 2>&1 <<'SQL' || true
SET session_replication_role = replica;
DELETE FROM public.coupon_usages WHERE id::text LIKE 'ecececec-%';
DELETE FROM public.reservations WHERE id::text LIKE 'ecececec-%';
DELETE FROM public.customer_coupons WHERE id::text LIKE 'ecececec-%';
DELETE FROM public.coupon_campaigns WHERE id::text LIKE 'ecececec-%';
DELETE FROM public.customers WHERE id::text LIKE 'ecececec-%';
DELETE FROM auth.users WHERE id::text LIKE 'ecececec-%';
DELETE FROM public.organizations WHERE id::text LIKE 'ecececec-%';
SQL
}
cleanup() { cleanup_rows; rm -rf "$WORK"; }
trap cleanup EXIT

"${P[@]}" -Atc "SELECT to_regclass('rollback_backup.coupon_usages_redeem_backup_' || to_char(now() AT TIME ZONE 'Asia/Tokyo', 'YYYYMMDD')) IS NULL" | grep -qx t \
  || { echo "手元 DB に今日の rollback_backup.coupon_usages_redeem_backup_* があります。消すか別名へ移してから流してください" >&2; exit 2; }

setup() {
  cleanup_rows
  "${P[@]}" <<'SQL'
SET session_replication_role = replica;
INSERT INTO public.organizations(id, name, slug, is_active) VALUES ('ecececec-0000-4000-8000-000000000001', 'もぎる競合テスト', 'redeem-race-test', true);
INSERT INTO auth.users(id, email) VALUES ('ecececec-0000-4000-8000-0000000000a1', 'redeem-race@example.invalid');
INSERT INTO public.customers(id, organization_id, user_id, name)
 VALUES ('ecececec-0000-4000-8000-0000000000c1', 'ecececec-0000-4000-8000-000000000001', 'ecececec-0000-4000-8000-0000000000a1', 'もぎる競合テスト');
INSERT INTO public.coupon_campaigns(id, organization_id, name, discount_amount)
 VALUES ('ecececec-0000-4000-8000-0000000000e1', 'ecececec-0000-4000-8000-000000000001', 'もぎる競合テスト', 500);
INSERT INTO public.customer_coupons(id, campaign_id, customer_id, organization_id, uses_remaining, status)
 VALUES ('ecececec-0000-4000-8000-0000000000f1', 'ecececec-0000-4000-8000-0000000000e1', 'ecececec-0000-4000-8000-0000000000c1', 'ecececec-0000-4000-8000-000000000001', 5, 'active');
INSERT INTO public.reservations(id, organization_id, customer_id, title, requested_datetime, duration, status)
 SELECT ('ecececec-0000-4000-8000-00000000020' || n)::uuid, 'ecececec-0000-4000-8000-000000000001', 'ecececec-0000-4000-8000-0000000000c1',
        'もぎる競合テスト', timestamptz '2026-10-20 13:00+09', 180, 'confirmed' FROM generate_series(1, 5) n;
-- 来店確認済み 4 件＋未確認 1 件（5 件目）
INSERT INTO public.coupon_usages(id, customer_coupon_id, reservation_id, discount_amount, redeemed_at, redeemed_by_member, redeemed_source)
 SELECT ('ecececec-0000-4000-8000-00000000010' || n)::uuid, 'ecececec-0000-4000-8000-0000000000f1', ('ecececec-0000-4000-8000-00000000020' || n)::uuid, 500,
        CASE WHEN n < 5 THEN timestamptz '2026-10-20 13:00+09' + n * interval '1 hour' END,
        CASE WHEN n < 5 THEN 'ecececec-0000-4000-8000-0000000000c1'::uuid END,
        CASE WHEN n < 5 THEN 'customer_present' END
 FROM generate_series(1, 5) n;
SQL
}

# 接続 A: 5 件目を来店確認済みにして $1 秒持ってから確定する
start_a() {
  PGAPPNAME=redeem-race-a "${P[@]}" >"$WORK/a.log" 2>&1 <<SQL &
BEGIN;
UPDATE public.coupon_usages SET redeemed_at = timestamptz '2026-10-21 19:00+09', redeemed_by_member = 'ecececec-0000-4000-8000-0000000000c1', redeemed_source = 'venue_use'
 WHERE id = 'ecececec-0000-4000-8000-000000000105';
SELECT pg_sleep($1);
COMMIT;
SQL
  A_PID=$!
  for _ in $(seq 1 50); do
    "${P[@]}" -Atc "SELECT 1 FROM pg_stat_activity WHERE application_name = 'redeem-race-a' AND query LIKE '%pg_sleep%' AND state = 'active'" | grep -qx 1 && return 0
    perl -e 'select(undef,undef,undef,0.1)'
  done
  echo "接続 A が更新を持った状態になりませんでした" >&2; cat "$WORK/a.log" >&2; exit 1
}

# 接続 B: rollback を新しい順に（外側の取引の中で）流し、退避を確かめて巻き戻す
write_b() {
  {
    echo '\set ON_ERROR_STOP on'
    echo 'BEGIN;'
    echo 'SET LOCAL client_min_messages = warning;'
    for f in supabase/rollbacks/20261020220000_*.sql supabase/rollbacks/20261020210000_*.sql supabase/rollbacks/20261020190000_*.sql \
             supabase/rollbacks/20261020180000_*.sql supabase/rollbacks/20261020160000_*.sql supabase/rollbacks/20261020150000_*.sql \
             supabase/rollbacks/20261020140000_*.sql; do strip "$f"; done
    echo "SELECT clock_timestamp() AS b_before_130 \\gset"
    strip "$ROLLBACK_FILE"
    cat <<'SQL'
DO $$
DECLARE v_dst text := 'rollback_backup.coupon_usages_redeem_backup_' || to_char(now() AT TIME ZONE 'Asia/Tokyo', 'YYYYMMDD'); v_n int; v_fifth int;
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'coupon_usages' AND column_name LIKE 'redeemed%'),
    'rollback 後も来店確認の列が残っている';
  EXECUTE format('SELECT count(*) FROM %s WHERE usage_id::text LIKE ''ecececec-%%''', v_dst) INTO v_n;
  EXECUTE format('SELECT count(*) FROM %s WHERE usage_id = ''ecececec-0000-4000-8000-000000000105'' AND redeemed_at = timestamptz ''2026-10-21 19:00+09''
                  AND redeemed_by_member = ''ecececec-0000-4000-8000-0000000000c1'' AND redeemed_source = ''venue_use''', v_dst) INTO v_fifth;
  RAISE WARNING 'RESULT backed_up=% fifth=%', v_n, v_fifth;
  ASSERT v_n = 5 AND v_fifth = 1, format('退避は A が確定した 5 件目を含む 5 件のはず: 退避 %s 件、5 件目 %s 件', v_n, v_fifth);
END $$;
SQL
    echo 'ROLLBACK;'
  } >"$WORK/b.sql"
}

wait_a() { wait "$A_PID" || { echo "接続 A が失敗しました" >&2; cat "$WORK/a.log" >&2; exit 1; }; }

echo "== 1. 実行中の来店確認（A）が確定するのを待ってから退避する"
setup
write_b
start_a 3
t0=$(date +%s)
B_OK=0
( PGAPPNAME=redeem-race-b psql "$DB_URL" -X -q -v VERBOSITY=verbose -f "$WORK/b.sql" >"$WORK/b1.log" 2>&1 ) & B_PID=$!
# B が A のロック待ちに入ったことを見る
WAITED=0
for _ in $(seq 1 30); do
  if "${P[@]}" -Atc "SELECT 1 FROM pg_stat_activity WHERE application_name = 'redeem-race-b' AND wait_event_type = 'Lock'" | grep -qx 1; then WAITED=1; break; fi
  perl -e 'select(undef,undef,undef,0.1)'
done
wait_a
wait "$B_PID" && B_OK=1 || true
t1=$(date +%s)
grep -E "RESULT|ERROR|ASSERT" "$WORK/b1.log" || true
[ "$WAITED" = 1 ] || { echo "NG: B が A のロックを待たなかった（表ロックが無い）"; cat "$WORK/b1.log"; exit 1; }
[ "$B_OK" = 1 ] || { echo "NG: B が失敗した"; cat "$WORK/b1.log"; exit 1; }
echo "OK: B は A の確定を待ってから（約 $((t1 - t0)) 秒）退避し、5 件目を含む 5 件を退避した"

echo "== 2. A が 10 秒より長く持つと、B は失敗して何も変えない"
setup
start_a 15
( PGAPPNAME=redeem-race-b psql "$DB_URL" -X -q -v VERBOSITY=verbose -f "$WORK/b.sql" >"$WORK/b2.log" 2>&1 ) && B2=0 || B2=$?
wait_a
grep -q "55P03" "$WORK/b2.log" || { echo "NG: B がロック待ちの期限切れ（55P03）で止まっていない (exit $B2)"; cat "$WORK/b2.log"; exit 1; }
"${P[@]}" -Atc "SELECT (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='coupon_usages' AND column_name LIKE 'redeemed%') = 3
  AND to_regclass('rollback_backup.coupon_usages_redeem_backup_' || to_char(now() AT TIME ZONE 'Asia/Tokyo', 'YYYYMMDD')) IS NULL
  AND (SELECT count(*) FROM public.coupon_usages WHERE id::text LIKE 'ecececec-%' AND redeemed_at IS NOT NULL) = 5" | grep -qx t \
  || { echo "NG: 失敗したのに何かが変わった"; exit 1; }
echo "OK: B は 10 秒で lock_timeout（55P03）になり、列・退避表・来店確認 5 件はそのまま"
echo "OK: coupon_redeem_rollback_race"
