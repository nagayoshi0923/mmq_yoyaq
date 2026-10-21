#!/usr/bin/env bash
# 公演作成の要求 ID（migration 20261022010000）の「巻き戻し → 当て直し」で、残っていた対応が書き戻されることを確かめる（PR #1210）。
# 対応の行を残したまま rollback → 当て直し → 退避から書き戻し → 同じ要求 ID の再送で元の公演が返る（新しく作らない）。
# 巻き戻し中に公演が消えた要求 ID は書き戻さない（同じ ID で作り直せる）。
# 使い方: DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres bash scripts/test-create-schedule-event-restore-db.sh
#   この migration を当てていない手元の DB を使う。全体を 1 つの取引で流し、最後に ROLLBACK する（何も残らない）。架空データのみ。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${DB_URL:?DB_URL を指定してください（手元の使い捨て DB）}"
# 比較のために旧版の migration を MIGRATION_FILE で渡せる
MIG="${MIGRATION_FILE:-$ROOT/supabase/migrations/20261022010000_create_schedule_event_with_staff.sql}"
RB="$(mktemp)"; trap 'rm -f "$RB"' EXIT
# rollback ファイルは単独で流す前提の BEGIN/COMMIT を持つので、外側の取引に入れるために外す
sed -e 's/^BEGIN;$//' -e 's/^COMMIT;$//' "$ROOT/supabase/rollbacks/20261022010000_create_schedule_event_with_staff.sql" > "$RB"
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -q <<SQL
BEGIN;
\i $MIG
SET LOCAL session_replication_role = replica;
INSERT INTO public.organizations(id, name, slug, is_active) VALUES ('eeeeeeee-0000-4000-8000-000000000001', '要求ID書き戻しテスト', 'event-create-restore-test', true);
INSERT INTO auth.users(id, email) VALUES ('eeeeeeee-0000-4000-8000-0000000000a1', 'event-create-restore@example.invalid');
INSERT INTO public.users(id, email, role, organization_id) VALUES ('eeeeeeee-0000-4000-8000-0000000000a1', 'event-create-restore@example.invalid', 'admin', 'eeeeeeee-0000-4000-8000-000000000001')
 ON CONFLICT (id) DO UPDATE SET role=excluded.role, organization_id=excluded.organization_id;
INSERT INTO public.staff(id, organization_id, name, user_id) VALUES ('eeeeeeee-0000-4000-8000-0000000000c1', 'eeeeeeee-0000-4000-8000-000000000001', '書き戻しGM', 'eeeeeeee-0000-4000-8000-0000000000a1');
INSERT INTO public.stores(id, organization_id, name, short_name) VALUES ('eeeeeeee-0000-4000-8000-0000000000b1', 'eeeeeeee-0000-4000-8000-000000000001', '書き戻し店', '書');
SET LOCAL session_replication_role = origin;
CREATE TEMP TABLE got(label text, id uuid);
GRANT ALL ON got TO authenticated;
SELECT set_config('request.jwt.claims','{"sub":"eeeeeeee-0000-4000-8000-0000000000a1","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
-- 残る公演（要求 X）と、後で消す公演（要求 Y）
INSERT INTO got SELECT 'x1', public.create_schedule_event_with_staff('eeeeeeee-0000-4000-8000-0000000000aa',
 '{"date":"2031-03-01","store_id":"eeeeeeee-0000-4000-8000-0000000000b1","venue":"書き戻し店","scenario":"","category":"open","start_time":"10:00","end_time":"14:00","capacity":6,"notes":"restore-x"}',
 ARRAY['書き戻しGM'], '{"書き戻しGM":"main"}', '[]');
INSERT INTO got SELECT 'y1', public.create_schedule_event_with_staff('eeeeeeee-0000-4000-8000-0000000000bb',
 '{"date":"2031-03-02","store_id":"eeeeeeee-0000-4000-8000-0000000000b1","venue":"書き戻し店","scenario":"","category":"open","start_time":"10:00","end_time":"14:00","capacity":6,"notes":"restore-y"}',
 ARRAY[]::text[], '{}', '[]');
SET LOCAL ROLE postgres;
DO \$\$ BEGIN
 ASSERT (SELECT count(*) FROM public.schedule_event_create_requests WHERE organization_id='eeeeeeee-0000-4000-8000-000000000001')=2, '巻き戻し前の対応は X・Y の 2 行';
END \$\$;
\echo == 巻き戻し（行を残したまま）
\i $RB
DO \$\$ BEGIN
 ASSERT to_regclass('public.schedule_event_create_requests') IS NULL, '巻き戻しで表が消える';
 ASSERT (SELECT count(*) FROM pg_proc WHERE proname IN ('create_schedule_event_with_staff','find_schedule_event_create_request'))=0, '巻き戻しで関数が消える';
 ASSERT EXISTS (SELECT 1 FROM public.schedule_events WHERE id=(SELECT id FROM got WHERE label='x1') AND gms=ARRAY['書き戻しGM']), '巻き戻しで公演は残る';
END \$\$;
-- 巻き戻し中（表が無い間）に Y の公演が消えた場合
DELETE FROM public.schedule_events WHERE id=(SELECT id FROM got WHERE label='y1');
\echo == 当て直し（退避から書き戻し）
\i $MIG
DO \$\$ BEGIN
 ASSERT (SELECT count(*) FROM public.schedule_event_create_requests WHERE organization_id='eeeeeeee-0000-4000-8000-000000000001')=1, '公演が残る X だけ書き戻す';
 ASSERT (SELECT event_id FROM public.schedule_event_create_requests WHERE request_id='eeeeeeee-0000-4000-8000-0000000000aa')=(SELECT id FROM got WHERE label='x1'), 'X の対応が元の公演';
 ASSERT NOT EXISTS (SELECT 1 FROM public.schedule_event_create_requests WHERE request_id='eeeeeeee-0000-4000-8000-0000000000bb'), '公演が消えた Y は戻さない';
END \$\$;
SET LOCAL ROLE authenticated;
INSERT INTO got SELECT 'x2', public.create_schedule_event_with_staff('eeeeeeee-0000-4000-8000-0000000000aa',
 '{"date":"2031-03-01","store_id":"eeeeeeee-0000-4000-8000-0000000000b1","venue":"書き戻し店","scenario":"","category":"open","start_time":"10:00","end_time":"14:00","capacity":6,"notes":"restore-x"}',
 ARRAY['書き戻しGM'], '{"書き戻しGM":"main"}', '[]');
INSERT INTO got SELECT 'find_x', public.find_schedule_event_create_request('eeeeeeee-0000-4000-8000-0000000000aa');
INSERT INTO got SELECT 'find_y', public.find_schedule_event_create_request('eeeeeeee-0000-4000-8000-0000000000bb');
SET LOCAL ROLE postgres;
SELECT label, id FROM got ORDER BY label;
DO \$\$ BEGIN
 ASSERT (SELECT id FROM got WHERE label='x2')=(SELECT id FROM got WHERE label='x1'), '書き戻し後の同じ要求 ID の再送は元の公演を返す';
 ASSERT (SELECT count(*) FROM public.schedule_events WHERE notes='restore-x')=1, '公演は 1 件のまま';
 ASSERT (SELECT id FROM got WHERE label='find_x')=(SELECT id FROM got WHERE label='x1'), '照合で作成済みと分かる';
 ASSERT (SELECT id FROM got WHERE label='find_y') IS NULL, '公演が消えた要求は未作成と答える';
END \$\$;
\echo OK: 行を残した巻き戻し → 当て直し → 書き戻し → 同じ要求 ID の再送で元の公演
ROLLBACK;
SQL
psql "$DB_URL" -X -At -c "select 'remaining functions: '||count(*) from pg_proc where proname in ('create_schedule_event_with_staff','find_schedule_event_create_request')"
