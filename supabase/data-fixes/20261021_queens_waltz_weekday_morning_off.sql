-- データ修正: クインズワルツ（組織 slug queens-waltz）の店舗で、平日（月〜金）の「朝」枠を無効にする（issue #1200 / PR #1201）
-- 社長の意図: 平日は昼・夜のみ。朝枠は出さない。
-- これはデータ（設定）の修正で、migration ではない。マージしても適用されない。手順は docs/ops/平日朝枠の停止_2026-10.md。
--
-- 変えるもの: business_hours_settings.opening_hours.<monday〜friday>.available_slots から "morning" だけを外す
--   （設定 › 店舗別 › 営業時間 で、その曜日の「朝」を消灯したのと同じ結果）。
-- 対象の曜日（すべて満たすものだけ）:
--   組織 queens-waltz の行／曜日が monday〜friday／is_open が true／open_time が 13:00 以降（= 朝に営業していない日）／
--   available_slots に "morning" がある／"morning" を外しても枠が 1 つ以上残る（空の配列は DB では「3 枠とも有効」になるため）。
-- 変えないもの: saturday・sunday、open_time・close_time・slot_start_times（朝の開始時刻も残す。無効な枠では使われない）、
--   holidays・special_open_days・special_closed_days・time_restrictions、他の組織（札幌店 queenswaltz-sapporo を含む）、
--   既存の候補日・申請中・確定済みの予約の行。
-- 冪等: 2 回目は対象 0 件で何も変えない（退避表も上書きしない）。
-- 安全装置: 変える曜日の数が 0（適用済み）でも mmq_fix.expected_days（未設定なら 35 = 7 店 × 5 曜日。2026-10-21 の staging・本番）
--   でもなければ中止する（何も変わらない）。試験では SET mmq_fix.expected_days = 'N' で上書きする。
-- 実行: psql -X -v ON_ERROR_STOP=1 -f supabase/data-fixes/20261021_queens_waltz_weekday_morning_off.sql
--   （ファイル自体が BEGIN〜COMMIT の 1 取引。途中で失敗すれば何も変わらない）
-- 照合: supabase/data-fixes/20261021_queens_waltz_weekday_morning_off_check.sql
-- 復旧: supabase/data-fixes/20261021_queens_waltz_weekday_morning_off_rollback.sql
-- 変換の式（qw_target_day / qw_morning_off）は復旧 SQL にも同じものがある。変えるときは両方を変える
-- （supabase/tests/data_fix_queens_waltz_weekday_morning_off.sql が食い違いを検出する）。
BEGIN;
SET LOCAL lock_timeout = '10s';

-- この曜日の朝を外すか
CREATE OR REPLACE FUNCTION pg_temp.qw_target_day(p_key text, p_day jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(
    lower(p_key) IN ('monday','tuesday','wednesday','thursday','friday')
    AND jsonb_typeof(p_day) = 'object'
    AND p_day->'is_open' = 'true'::jsonb
    AND CASE WHEN COALESCE(p_day->>'open_time','') ~ '^[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?$'
             THEN (p_day->>'open_time')::time >= time '13:00' ELSE false END
    AND jsonb_typeof(p_day->'available_slots') = 'array'
    AND p_day->'available_slots' @> '["morning"]'::jsonb
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_day->'available_slots') s(x) WHERE s.x <> '"morning"'::jsonb),
  false)
$$;
-- opening_hours 全体の変換（対象の曜日だけ "morning" を外す。他の値・順序はそのまま）
CREATE OR REPLACE FUNCTION pg_temp.qw_morning_off(p_hours jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN jsonb_typeof(p_hours) IS DISTINCT FROM 'object' OR p_hours = '{}'::jsonb THEN p_hours ELSE (
    SELECT jsonb_object_agg(e.k, CASE WHEN pg_temp.qw_target_day(e.k, e.v)
      THEN e.v || jsonb_build_object('available_slots',
        (SELECT jsonb_agg(s.x ORDER BY s.n) FROM jsonb_array_elements(e.v->'available_slots') WITH ORDINALITY s(x,n)
          WHERE s.x <> '"morning"'::jsonb))
      ELSE e.v END)
    FROM jsonb_each(p_hours) e(k,v)) END
$$;

-- 退避表（ブラウザの役割からは読めない。復旧と照合に使う。不要になったら手順書に従って削除する）
CREATE TABLE IF NOT EXISTS public.business_hours_settings_backup_20261021 (
  id uuid PRIMARY KEY,
  store_id uuid,
  opening_hours jsonb,
  updated_at timestamptz,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE public.business_hours_settings_backup_20261021 FROM anon, authenticated;
ALTER TABLE public.business_hours_settings_backup_20261021 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_hours_settings_backup_20261021 FORCE ROW LEVEL SECURITY;
COMMENT ON TABLE public.business_hours_settings_backup_20261021 IS
  '2026-10-21 クインズワルツ平日朝枠の停止（PR #1201）の退避。復旧は supabase/data-fixes/20261021_queens_waltz_weekday_morning_off_rollback.sql';

-- 対象の行を固定（更新が終わるまで他から書き換えさせない）
DROP TABLE IF EXISTS pg_temp._qw_target;
CREATE TEMP TABLE _qw_target ON COMMIT DROP AS
SELECT b.id, b.store_id, b.opening_hours, b.updated_at,
  (SELECT count(*) FROM jsonb_each(b.opening_hours) e(k,v) WHERE pg_temp.qw_target_day(e.k, e.v)) AS days
FROM public.business_hours_settings b
JOIN public.organizations o ON o.id = b.organization_id
WHERE o.slug = 'queens-waltz'
  AND jsonb_typeof(b.opening_hours) = 'object'
  AND EXISTS (SELECT 1 FROM jsonb_each(b.opening_hours) e(k,v) WHERE pg_temp.qw_target_day(e.k, e.v))
FOR UPDATE OF b;

DO $$
DECLARE v_days bigint; v_expected bigint := COALESCE(NULLIF(current_setting('mmq_fix.expected_days', true), '')::bigint, 35);
BEGIN
  SELECT COALESCE(sum(days), 0) INTO v_days FROM _qw_target;
  IF v_days <> 0 AND v_days <> v_expected THEN
    RAISE EXCEPTION '対象の曜日が % 件（見込み % 件）。想定外のため中止（何も変えていない）', v_days, v_expected;
  END IF;
  RAISE NOTICE '対象: % 店・% 曜日', (SELECT count(*) FROM _qw_target), v_days;
END $$;

-- 退避（既にある行は上書きしない = 最初の値を残す）
INSERT INTO public.business_hours_settings_backup_20261021(id, store_id, opening_hours, updated_at)
SELECT id, store_id, opening_hours, updated_at FROM _qw_target
ON CONFLICT (id) DO NOTHING;

-- 更新（退避と同じ取引）
UPDATE public.business_hours_settings b
SET opening_hours = pg_temp.qw_morning_off(b.opening_hours)
FROM _qw_target t
WHERE b.id = t.id;

-- 結果の確認（対象の組織に、外し残しが無い）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.business_hours_settings b JOIN public.organizations o ON o.id = b.organization_id
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(b.opening_hours) = 'object' THEN b.opening_hours ELSE '{}'::jsonb END) e(k,v)
    WHERE o.slug = 'queens-waltz' AND pg_temp.qw_target_day(e.k, e.v)
  ) THEN
    RAISE EXCEPTION '更新後も対象の曜日が残っている。中止（何も変えていない）';
  END IF;
END $$;
COMMIT;
