#!/usr/bin/env bash
# 公演作成の要求 ID（migration 20261022010000）: 2 つの接続から同じ要求 ID を同時に送っても、公演は 1 件だけ（PR #1210）。
# 接続 A は作成したあと取引を 2 秒開けたままにし、その間に接続 B が同じ要求 ID で作成する。
# B は A の確定を待ってから、A が作った公演 ID を返すこと（別の公演を作らないこと）を確かめる。
# 使い方: DB_URL=postgresql://postgres:postgres@127.0.0.1:56322/postgres bash scripts/test-create-schedule-event-concurrency-db.sh
#   migration を当てた使い捨ての DB を使う（例: KEEP=1 bash scripts/check-db-baseline.sh が残す 56322 番）。
#   接続をまたぐため架空データを一度確定する。最後に架空データを消す。本番・staging では流さない。
set -euo pipefail
: "${DB_URL:?DB_URL を指定してください（migration を当てた使い捨ての DB）}"
case "$DB_URL" in *127.0.0.1*|*localhost*) ;; *) echo "手元の DB 以外では流しません"; exit 2 ;; esac
ORG=ffffffff-0000-4000-8000-000000000001; ADMIN=ffffffff-0000-4000-8000-0000000000a1; STORE=ffffffff-0000-4000-8000-0000000000b1
REQ=ffffffff-0000-4000-8000-0000000000ee
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
call() { # $1=取引を開けておく秒数
  psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"$ADMIN","role":"authenticated"}',true) \\g /dev/null
SET LOCAL ROLE authenticated;
SELECT public.create_schedule_event_with_staff('$REQ',
 '{"date":"2031-04-01","store_id":"$STORE","venue":"同時店","scenario":"","category":"open","start_time":"10:00","end_time":"14:00","capacity":6,"notes":"concurrency"}',
 ARRAY['同時GM'], '{"同時GM":"main"}', '[]');
SELECT pg_sleep($1) \\g /dev/null
COMMIT;
SQL
}
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
[ -n "$A_ID" ] && [ "$A_ID" = "$B_ID" ] && [ "$COUNT" = "1" ] && [ "$HIST" = "1" ] && [ "$elapsed" -ge 2 ] || { echo "NG: 同じ要求 ID の同時送信で 1 件にならない"; exit 1; }
echo "OK: 2 つの接続から同じ要求 ID を同時に送っても公演は 1 件（B は A の確定を待って同じ ID を返した）"
