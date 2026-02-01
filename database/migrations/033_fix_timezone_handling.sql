-- =============================================================================
-- マイグレーション 033: タイムゾーン処理の明示的な統一
-- =============================================================================
-- 
-- 作成日: 2026-02-01
-- 
-- 問題:
--   NOW() がDBサーバーのタイムゾーンに依存しており、
--   フロントエンド（ブラウザのタイムゾーン）との不一致で
--   締切判定がずれる可能性があった
-- 
-- 修正:
--   締切判定を Asia/Tokyo タイムゾーンで明示的に行う
-- 
-- =============================================================================

-- タイムゾーン付きの現在時刻を取得するヘルパー関数
CREATE OR REPLACE FUNCTION now_jst()
RETURNS TIMESTAMP
LANGUAGE SQL
STABLE
AS $$
  SELECT NOW() AT TIME ZONE 'Asia/Tokyo'
$$;

COMMENT ON FUNCTION now_jst() IS '日本時間（Asia/Tokyo）での現在時刻を返す';

-- 日本時間での日付を取得するヘルパー関数
CREATE OR REPLACE FUNCTION today_jst()
RETURNS DATE
LANGUAGE SQL
STABLE
AS $$
  SELECT (NOW() AT TIME ZONE 'Asia/Tokyo')::DATE
$$;

COMMENT ON FUNCTION today_jst() IS '日本時間（Asia/Tokyo）での今日の日付を返す';

-- イベント開始時刻と現在時刻の差を時間単位で計算する関数
-- フロントエンドとサーバーのタイムゾーン不一致を防ぐため、Asia/Tokyoで統一
CREATE OR REPLACE FUNCTION hours_until_event_jst(
  p_event_date DATE,
  p_event_start_time TIME
)
RETURNS NUMERIC
LANGUAGE SQL
STABLE
AS $$
  SELECT EXTRACT(EPOCH FROM (
    ((p_event_date + p_event_start_time)::timestamp AT TIME ZONE 'Asia/Tokyo') -
    NOW()
  )) / 3600.0
$$;

COMMENT ON FUNCTION hours_until_event_jst IS 
'イベント開始までの時間（時間単位）を日本時間ベースで計算';

-- 完了確認
DO $$ 
BEGIN
  RAISE NOTICE '✅ マイグレーション 033 完了: タイムゾーンヘルパー関数を追加';
END $$;

-- =============================================================================
-- 注意: create_reservation_with_lock_v2 の修正は別途行う
-- 以下のように hours_until_event_jst を使用するように変更する
-- 
-- 変更前:
--   v_event_start_at := (v_date + v_start_time)::timestamptz;
--   v_hours_until_event := EXTRACT(EPOCH FROM (v_event_start_at - NOW())) / 3600.0;
-- 
-- 変更後:
--   v_hours_until_event := hours_until_event_jst(v_date, v_start_time);
-- =============================================================================
