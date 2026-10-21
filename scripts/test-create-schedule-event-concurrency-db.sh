#!/usr/bin/env bash
# 公演作成の要求 ID（migration 20261022010000、PR #1210）を、別々の接続で確かめる。
# 1) 同時送信: 接続 A が作成して取引を 2 秒開けたまま、接続 B が同じ要求 ID で作成 → B は A の確定を待って同じ公演 ID を返す（1 件）。
# 2) 照合のあとの遅着: 接続 A が照合（find）で要求 R を「未作成」と確認 → 入力を変えた新しい要求 S を作成 →
#    遅れて接続 B から元の R の作成が届く → R は作らない（公演は S の 1 件。Codex 再レビュー 929c857）。
# 3) 処理中の照合: 接続 B が R を作成して取引を 2 秒開けたまま、接続 A が R を照合 → B の確定を待って R の公演 ID を返す（未作成と誤答しない）。
# 使い方: DB_URL=postgresql://postgres:postgres@127.0.0.1:56322/postgres bash scripts/test-create-schedule-event-concurrency-db.sh
#   migration を当てた使い捨ての DB を使う（例: KEEP=1 bash scripts/check-db-baseline.sh が残す 56322 番）。
#   接続をまたぐため架空データを一度確定する。最後に架空データを消す。本番・staging では流さない。
set -euo pipefail
: "${DB_URL:?DB_URL を指定してください（migration を当てた使い捨ての DB）}"
case "$DB_URL" in *127.0.0.1*|*localhost*) ;; *) echo "手元の DB 以外では流しません"; exit 2 ;; esac
ORG=ffffffff-0000-4000-8000-000000000001; ADMIN=ffffffff-0000-4000-8000-0000000000a1; STORE=ffffffff-0000-4000-8000-0000000000b1
REQ=ffffffff-0000-4000-8000-0000000000ee; REQ_R=ffffffff-0000-4000-8000-0000000000e1; REQ_S=ffffffff-0000-4000-8000-0000000000e2; REQ_T=ffffffff-0000-4000-8000-0000000000e3
FAIL=0
cleanup() {
  psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 <<SQL >/dev/null
SET session_replication_role = replica;
DELETE FROM public.schedule_event_history WHERE organization_id='$ORG';
DELETE FROM public.schedule_event_create_requests WHERE organization_id='$ORG';
DELETE FROM public.schedule_events WHERE organization_id='$ORG';
DELETE FROM public.stores WHERE organization_id='$ORG';
DELETE FROM public.staff WHERE organization_id='$ORG';
DELETE FROM public.users WHERE id='$ADMIN';
DELETE FROM auth.users WHERE id='$ADMIN';
DELETE FROM public.organizations WHERE id='$ORG';
SQL
}
trap cleanup EXIT
cleanup
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 <<SQL
SET session_replication_role = replica;
INSERT INTO public.organizations(id, name, slug, is_active) VALUES ('$ORG', '同時送信テスト', 'event-create-concurrency-test', true);
INSERT INTO auth.users(id, email) VALUES ('$ADMIN', 'event-create-concurrency@example.invalid');
INSERT INTO public.users(id, email, role, organization_id) VALUES ('$ADMIN', 'event-create-concurrency@example.invalid', 'admin', '$ORG');
INSERT INTO public.staff(id, organization_id, name, user_id) VALUES ('ffffffff-0000-4000-8000-0000000000c1', '$ORG', '同時GM', '$ADMIN');
INSERT INTO public.stores(id, organization_id, name, short_name) VALUES ('$STORE', '$ORG', '同時店', '同');
SQL
call() { # $1=取引を開けておく秒数 $2=要求 ID $3=備考（notes）
  psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"$ADMIN","role":"authenticated"}',true) \\g /dev/null
SET LOCAL ROLE authenticated;
SELECT public.create_schedule_event_with_staff('${2:-$REQ}',
 '{"date":"2031-04-01","store_id":"$STORE","venue":"同時店","scenario":"","category":"open","start_time":"10:00","end_time":"14:00","capacity":6,"notes":"${3:-concurrency}"}',
 ARRAY['同時GM'], '{"同時GM":"main"}', '[]');
SELECT pg_sleep($1) \\g /dev/null
COMMIT;
SQL
}
find() { # $1=要求 ID
  psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"$ADMIN","role":"authenticated"}',true) \\g /dev/null
SET LOCAL ROLE authenticated;
SELECT coalesce(public.find_schedule_event_create_request('$1')::text, 'NULL');
COMMIT;
SQL
}
count_notes() { psql "$DB_URL" -X -At -c "SELECT count(*) FROM public.schedule_events WHERE organization_id='$ORG' AND notes IN ($1)"; }
A_OUT="$(mktemp)"; B_OUT="$(mktemp)"
start=$(date +%s)
call 2 > "$A_OUT" &
A_PID=$!
sleep 0.5
call 0 > "$B_OUT" &
B_PID=$!
wait $A_PID; wait $B_PID
elapsed=$(( $(date +%s) - start ))
A_ID="$(grep -E '^[0-9a-f-]{36}$' "$A_OUT")"; B_ID="$(grep -E '^[0-9a-f-]{36}$' "$B_OUT")"
COUNT="$(psql "$DB_URL" -X -At -c "SELECT count(*) FROM public.schedule_events WHERE organization_id='$ORG' AND notes='concurrency'")"
HIST="$(psql "$DB_URL" -X -At -c "SELECT count(*) FROM public.schedule_event_history WHERE organization_id='$ORG' AND action_type='create'")"
echo "A=$A_ID B=$B_ID 公演=$COUNT 件 作成履歴=$HIST 件 所要=${elapsed}秒"
rm -f "$A_OUT" "$B_OUT"
if [ -n "$A_ID" ] && [ "$A_ID" = "$B_ID" ] && [ "$COUNT" = "1" ] && [ "$HIST" = "1" ] && [ "$elapsed" -ge 2 ]; then
  echo "OK 1: 2 つの接続から同じ要求 ID を同時に送っても公演は 1 件（B は A の確定を待って同じ ID を返した）"
else echo "NG 1: 同じ要求 ID の同時送信で 1 件にならない"; FAIL=1; fi

# 2) 照合のあとの遅着
F="$(find "$REQ_R" 2>&1 | tail -1 || true)"
call 0 "$REQ_S" late-new > /dev/null 2>&1 || true
LATE="$(call 0 "$REQ_R" late-original 2>&1 | grep -E "ERROR|^[0-9a-f-]{36}$" | head -1 || true)"
N2="$(count_notes "'late-new','late-original'")"
echo "2) 照合=$F 遅着の結果=${LATE:0:80} 公演=$N2 件"
if [ "$F" = "NULL" ] && [ "$N2" = "1" ] && [ "$(count_notes "'late-original'")" = "0" ]; then
  echo "OK 2: 照合で未作成と答えた要求は、遅れて届いても作らない（公演は新しい保存の 1 件）"
else echo "NG 2: 照合のあとに元の要求が遅れて届くと二重に作成される"; FAIL=1; fi

# 3) 処理中の照合
T_OUT="$(mktemp)"
call 2 "$REQ_T" in-flight > "$T_OUT" 2>&1 &
T_PID=$!
sleep 0.5
F3="$(find "$REQ_T" 2>&1 | tail -1 || true)"
wait $T_PID
T_ID="$(grep -E '^[0-9a-f-]{36}$' "$T_OUT" || true)"; rm -f "$T_OUT"
echo "3) 処理中の作成=$T_ID 照合=$F3"
if [ -n "$T_ID" ] && [ "$F3" = "$T_ID" ]; then
  echo "OK 3: 処理中の作成を照合すると、確定を待って作成済みと答える"
else echo "NG 3: 処理中の作成を未作成と答えた"; FAIL=1; fi
exit $FAIL
