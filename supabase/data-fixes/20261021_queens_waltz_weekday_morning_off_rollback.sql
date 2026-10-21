-- 復旧: 20261021_queens_waltz_weekday_morning_off.sql（クインズワルツ平日朝枠の停止）を戻す
-- 退避表 public.business_hours_settings_backup_20261021 の opening_hours を書き戻す。
-- 書き戻すのは「今の値 = 退避した値にデータ修正を当てた値」の行だけ（修正後に設定画面で誰かが変えた行は上書きしない）。
-- 変えられていた行は WARNING で店舗 ID を出して飛ばす → 設定 › 店舗別 › 営業時間 で手で直す（手順書 docs/ops/平日朝枠の停止_2026-10.md）。
-- updated_at は戻らない（更新時の自動記録で復旧時刻になる）。退避表は消さない（照合のため残す）。
-- 冪等: 2 回目は書き戻す行 0 件。
-- 実行: psql -X -v ON_ERROR_STOP=1 -f supabase/data-fixes/20261021_queens_waltz_weekday_morning_off_rollback.sql
-- 変換の式は 20261021_queens_waltz_weekday_morning_off.sql と同じ（変えるときは両方を変える）。
BEGIN;
SET LOCAL lock_timeout = '10s';

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
CREATE OR REPLACE FUNCTION pg_temp.qw_morning_off(p_hours jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN jsonb_typeof(p_hours) IS DISTINCT FROM 'object' OR p_hours = '{}'::jsonb THEN p_hours ELSE (
    SELECT jsonb_object_agg(e.k, CASE WHEN pg_temp.qw_target_day(e.k, e.v)
      THEN e.v || jsonb_build_object('available_slots',
        (SELECT jsonb_agg(s.x ORDER BY s.n) FROM jsonb_array_elements(e.v->'available_slots') WITH ORDINALITY s(x,n)
          WHERE s.x <> '"morning"'::jsonb))
      ELSE e.v END)
    FROM jsonb_each(p_hours) e(k,v)) END
$$;

DO $$
DECLARE r record; v_restored integer := 0; v_skipped integer := 0; v_same integer := 0;
BEGIN
  IF to_regclass('public.business_hours_settings_backup_20261021') IS NULL THEN
    RAISE EXCEPTION '退避表 public.business_hours_settings_backup_20261021 が無い（データ修正を当てていない）。中止';
  END IF;
  FOR r IN
    SELECT k.id, k.store_id, k.opening_hours AS before_hours, b.opening_hours AS now_hours
    FROM public.business_hours_settings_backup_20261021 k
    JOIN public.business_hours_settings b ON b.id = k.id
    ORDER BY k.store_id
    FOR UPDATE OF b
  LOOP
    IF r.now_hours = r.before_hours THEN
      v_same := v_same + 1;
    ELSIF r.now_hours = pg_temp.qw_morning_off(r.before_hours) THEN
      UPDATE public.business_hours_settings SET opening_hours = r.before_hours WHERE id = r.id;
      v_restored := v_restored + 1;
    ELSE
      v_skipped := v_skipped + 1;
      RAISE WARNING '店舗 % は修正後に営業時間が変えられているため書き戻さない（設定画面で手で直す）', r.store_id;
    END IF;
  END LOOP;
  RAISE NOTICE '書き戻し % 店・既に元の値 % 店・飛ばした % 店（退避 % 店）', v_restored, v_same, v_skipped,
    (SELECT count(*) FROM public.business_hours_settings_backup_20261021);
END $$;
COMMIT;
