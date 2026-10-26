#!/usr/bin/env bash
# お客様本人の同じ公演の 2 件目（migration 20261026120000、点検 F14）と、貸切の申込の保存済み確認の読み取り（点検 F09）を、
# 本物の権限（authenticated・行の権限）の手元 DB で確かめる。
# 1) 本人の 1 件目は作れる。同じ予約番号・同じ内容の再送は同じ予約を返す。別の番号の 2 件目は P0059
# 2) 同時送信: 接続 A が作成して取引を 2 秒開けたまま、接続 B が別の番号で作成 → B は A の確定を待って P0059（有効な予約は 1 件）
# 3) 来店済み（checked_in）も有効として断る。取消済みなら作れる。スタッフの代理は従来どおり作れる
# 4) 巻き戻し（supabase/rollbacks/…）を当てると 2 件目を止めなくなり、migration を当て直すと（前提の確認を通って）また止める
# 5) 貸切の申込の確認の読み取り: 本人は予約番号・グループ・顧客・組織で自分の申込を読める。別の利用者は読めない
# 使い方: DB_URL=postgresql://postgres:postgres@127.0.0.1:56322/postgres bash scripts/test-reservation-self-duplicate-db.sh
#   migration を当てた使い捨ての DB を使う（例: KEEP=1 bash scripts/check-db-baseline.sh が残す 56322 番）。架空データは最後に消す。本番・staging では流さない。
set -euo pipefail
: "${DB_URL:?DB_URL を指定してください（migration を当てた使い捨ての DB）}"
case "$DB_URL" in *127.0.0.1*|*localhost*) ;; *) echo "手元の DB 以外では流しません"; exit 2 ;; esac
ORG=eeeeeeee-0000-4000-8000-000000000001; CUST=eeeeeeee-0000-4000-8000-0000000000c1; OTHER=eeeeeeee-0000-4000-8000-0000000000c2
ADMIN=eeeeeeee-0000-4000-8000-0000000000a1; STORE=eeeeeeee-0000-4000-8000-0000000000b1; SM=eeeeeeee-0000-4000-8000-0000000000d1
OS=eeeeeeee-0000-4000-8000-0000000000d2; EV=eeeeeeee-0000-4000-8000-0000000000e1; C=eeeeeeee-0000-4000-8000-0000000000f1; G=eeeeeeee-0000-4000-8000-0000000000f9
FAIL=0
q() { psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1 "$@"; }
cleanup() {
  q <<SQL >/dev/null
SET session_replication_role = replica;
DELETE FROM public.reservations WHERE organization_id='$ORG';
DELETE FROM public.schedule_events WHERE organization_id='$ORG';
DELETE FROM public.customers WHERE id='$C';
DELETE FROM public.organization_scenarios WHERE id='$OS';
DELETE FROM public.scenario_masters WHERE id='$SM';
DELETE FROM public.stores WHERE organization_id='$ORG';
DELETE FROM public.staff WHERE organization_id='$ORG';
DELETE FROM public.users WHERE id IN ('$ADMIN','$CUST','$OTHER');
DELETE FROM auth.users WHERE id IN ('$ADMIN','$CUST','$OTHER');
DELETE FROM public.organizations WHERE id='$ORG';
SQL
}
trap cleanup EXIT
cleanup
q <<SQL
SET session_replication_role = replica;
INSERT INTO public.organizations(id, name, slug, is_active) VALUES ('$ORG', '重複予約テスト', 'self-duplicate-test', true);
INSERT INTO auth.users(id, email) VALUES ('$ADMIN', 'dup-admin@example.invalid'), ('$CUST', 'dup-cust@example.invalid'), ('$OTHER', 'dup-other@example.invalid');
INSERT INTO public.users(id, email, role, organization_id) VALUES ('$ADMIN', 'dup-admin@example.invalid', 'admin', '$ORG');
INSERT INTO public.users(id, email, role) VALUES ('$CUST', 'dup-cust@example.invalid', 'customer'), ('$OTHER', 'dup-other@example.invalid', 'customer');
INSERT INTO public.staff(id, organization_id, name, user_id) VALUES ('eeeeeeee-0000-4000-8000-0000000000a2', '$ORG', '代理GM', '$ADMIN');
INSERT INTO public.stores(id, organization_id, name, short_name) VALUES ('$STORE', '$ORG', '重複店', '重');
INSERT INTO public.scenario_masters(id, title, official_duration) VALUES ('$SM', '架空の作品', 180);
INSERT INTO public.organization_scenarios(id, organization_id, scenario_master_id, participation_fee) VALUES ('$OS', '$ORG', '$SM', 4000);
INSERT INTO public.schedule_events(id, organization_id, organization_scenario_id, store_id, date, start_time, end_time, venue, scenario, category, max_participants, capacity, is_cancelled)
  VALUES ('$EV', '$ORG', '$OS', '$STORE', '2031-05-01', '14:00', '17:00', '重複店', '架空の作品', 'open', 8, 8, false);
INSERT INTO public.customers(id, user_id, organization_id, name, email, phone) VALUES ('$C', '$CUST', NULL, '架空の客', 'dup-cust@example.invalid', '09000000000');
SQL
book() { # $1=実行する利用者 $2=予約番号 $3=取引を開けておく秒数 → 予約 ID かエラーコード
  psql "$DB_URL" -X -q -At 2>&1 <<SQL | tr -d '\n' | sed -E 's/.*SQLSTATE[: ]*([A-Z0-9]{5}).*/ERR:\1/; s/^ERROR:.*DUPLICATE_ACTIVE_RESERVATION.*/ERR:P0059/'
\set VERBOSITY verbose
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"$1","role":"authenticated"}',true) \\g /dev/null
SET LOCAL ROLE authenticated;
SELECT public.create_reservation_with_lock_v2('$EV', 2, '$C', '架空の客', 'dup-cust@example.invalid', '09000000000', NULL, NULL, '$2', NULL);
SELECT pg_sleep(${3:-0}) \\g /dev/null
COMMIT;
SQL
}
check() { if [ "$2" = "$3" ]; then echo "  OK $1"; else echo "  NG $1: 期待 $3／実際 $2"; FAIL=1; fi; }
is_id() { [[ "$1" =~ ^[0-9a-f-]{36}$ ]] && echo id || echo "$1"; }
active() { q -c "SELECT count(*) FROM public.reservations WHERE schedule_event_id='$EV' AND status IN ('pending','confirmed','gm_confirmed','checked_in')"; }

echo "1) 本人の 1 件目・同じ番号の再送・別の番号の 2 件目"
first=$(book $CUST DUP-0001); check "1 件目は作れる" "$(is_id "$first")" id
again=$(book $CUST DUP-0001); check "同じ番号・同じ内容の再送は同じ予約" "$again" "$first"
second=$(book $CUST DUP-0002); check "別の番号の 2 件目は P0059" "$second" "ERR:P0059"
check "有効な予約は 1 件" "$(active)" 1

echo "2) 同時送信（別の番号）"
q -c "UPDATE public.reservations SET status='cancelled' WHERE schedule_event_id='$EV'" >/dev/null
book $CUST DUP-0101 2 > /tmp/dup_a.$$ & PA=$!
sleep 0.5
b=$(book $CUST DUP-0102)
wait $PA; a=$(cat /tmp/dup_a.$$); rm -f /tmp/dup_a.$$
check "先の接続は作れる" "$(is_id "$a")" id
check "後の接続は先の確定を待って P0059" "$b" "ERR:P0059"
check "有効な予約は 1 件" "$(active)" 1

echo "3) 来店済み・取消済み・スタッフの代理"
check "同時送信で作った DUP-0101 だけが有効" "$(q -c "SELECT string_agg(reservation_number||':'||status, ',') FROM public.reservations WHERE schedule_event_id='$EV' AND status <> 'cancelled'")" "DUP-0101:confirmed"
check "DUP-0101 を来店済みにする（1 件）" "$(q -c "WITH u AS (UPDATE public.reservations SET status='checked_in' WHERE schedule_event_id='$EV' AND reservation_number='DUP-0101' RETURNING 1) SELECT count(*) FROM u")" 1
check "来店済み以外の有効な予約は無い" "$(q -c "SELECT string_agg(reservation_number||':'||status, ',') FROM public.reservations WHERE schedule_event_id='$EV' AND status <> 'cancelled'")" "DUP-0101:checked_in"
check "来店済みがあれば P0059" "$(book $CUST DUP-0201)" "ERR:P0059"
q -c "UPDATE public.reservations SET status='cancelled' WHERE schedule_event_id='$EV'" >/dev/null
r=$(book $CUST DUP-0202); check "取消済みだけなら作れる" "$(is_id "$r")" id
r=$(book $ADMIN DUP-0203); check "スタッフの代理は作れる（従来どおり）" "$(is_id "$r")" id
q -c "UPDATE public.reservations SET status='cancelled' WHERE schedule_event_id='$EV'" >/dev/null

echo "4) 巻き戻しと当て直し"
book $CUST DUP-0301 >/dev/null
q -f supabase/rollbacks/20261026120000_reservation_self_duplicate_guard.sql >/dev/null
check "巻き戻しの定義は元の md5" "$(q -c "SELECT md5(prosrc) FROM pg_proc WHERE proname='create_reservation_with_lock_v2'")" e1bb7fc9bf8da1bb999bb92da35eb6d0
r=$(book $CUST DUP-0302); check "巻き戻し後は 2 件目を止めない" "$(is_id "$r")" id
q -c "UPDATE public.reservations SET status='cancelled' WHERE schedule_event_id='$EV' AND reservation_number='DUP-0302'" >/dev/null
q -f supabase/migrations/20261026120000_reservation_self_duplicate_guard.sql >/dev/null
check "当て直し後の md5" "$(q -c "SELECT md5(prosrc) FROM pg_proc WHERE proname='create_reservation_with_lock_v2'")" 5f57015d9a18d8efadc4ae992918ff97
check "当て直し後はまた P0059" "$(book $CUST DUP-0303)" "ERR:P0059"
check "権限（GRANT）は同じ" "$(q -c "SELECT proacl::text FROM pg_proc WHERE proname='create_reservation_with_lock_v2'")" "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}"

echo "5) 貸切の申込の保存済み確認の読み取り（本物の行の権限）"
q -c "SET session_replication_role = replica; UPDATE public.reservations SET private_group_id='$G' WHERE reservation_number='DUP-0301'" >/dev/null
read_as() { psql "$DB_URL" -X -q -At <<SQL
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"$1","role":"authenticated"}',true) \\g /dev/null
SET LOCAL ROLE authenticated;
SELECT reservation_number FROM public.reservations WHERE reservation_number='DUP-0301' AND private_group_id='$G' AND customer_id='$C' AND organization_id='$ORG';
COMMIT;
SQL
}
check "本人は読める" "$(read_as $CUST)" DUP-0301
check "別の利用者は読めない" "$(read_as $OTHER)" ""
check "貸切グループの表は直接読めない（権限なし）" "$(psql "$DB_URL" -X -q -At 2>&1 <<SQL | grep -c 'permission denied' || true
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"$CUST","role":"authenticated"}',true) \\g /dev/null
SET LOCAL ROLE authenticated;
SELECT count(*) FROM public.private_groups;
COMMIT;
SQL
)" 1

if [ "$FAIL" = 0 ]; then echo "✅ すべて期待どおり"; else echo "❌ 期待と違う結果があります"; exit 1; fi
