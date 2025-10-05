-- サンプルオープン公演の登録
-- 予約サイトで表示されるテスト用のオープン公演を作成します

-- 注意: このスクリプトを実行する前に、以下が必要です
-- 1. stores テーブルにデータが存在すること
-- 2. scenarios テーブルにデータが存在すること
-- 3. add_reservation_integration.sql が実行済みであること

-- 既存のサンプルオープン公演を削除（重複を避けるため）
DELETE FROM schedule_events 
WHERE category = 'open' 
AND notes LIKE '%サンプルデータ%';

-- 現在の日付から未来の日付を計算するための変数
DO $$
DECLARE
  store_record RECORD;
  scenario_record RECORD;
  event_date DATE;
  start_hour INT;
  event_count INT := 0;
BEGIN
  -- 店舗とシナリオのデータを取得
  FOR store_record IN 
    SELECT id, name, short_name FROM stores WHERE status = 'active' LIMIT 3
  LOOP
    FOR scenario_record IN 
      SELECT id, title, duration, player_count_max FROM scenarios WHERE status = 'available' LIMIT 10
    LOOP
      -- 今日から30日間の範囲でランダムに公演を作成
      FOR i IN 0..4 LOOP
        event_date := CURRENT_DATE + (FLOOR(RANDOM() * 30))::INT;
        start_hour := 10 + (FLOOR(RANDOM() * 8))::INT; -- 10時〜17時の間
        
        -- オープン公演を挿入
        INSERT INTO schedule_events (
          date,
          store_id,
          venue,
          scenario,
          scenario_id,
          category,
          start_time,
          end_time,
          gms,
          capacity,
          max_participants,
          is_cancelled,
          is_reservation_enabled,
          reservation_deadline_hours,
          reservation_notes,
          notes,
          created_at,
          updated_at
        ) VALUES (
          event_date,
          store_record.id,
          store_record.short_name,
          scenario_record.title,
          scenario_record.id,
          'open', -- オープン公演
          (start_hour || ':00:00')::TIME,
          ((start_hour + CEIL(scenario_record.duration / 60.0)::INT) || ':00:00')::TIME,
          ARRAY[]::TEXT[], -- GMは未割当
          scenario_record.player_count_max,
          scenario_record.player_count_max,
          false, -- キャンセルされていない
          true, -- 予約受付中
          24, -- 24時間前まで予約可能
          '当日は開始時刻の10分前までにお越しください。',
          'サンプルデータ: 予約サイトテスト用',
          NOW(),
          NOW()
        )
        ON CONFLICT DO NOTHING;
        
        event_count := event_count + 1;
        
        -- 最大50件まで
        IF event_count >= 50 THEN
          EXIT;
        END IF;
      END LOOP;
      
      IF event_count >= 50 THEN
        EXIT;
      END IF;
    END LOOP;
    
    IF event_count >= 50 THEN
      EXIT;
    END IF;
  END LOOP;
  
  RAISE NOTICE '% 件のオープン公演を作成しました', event_count;
END $$;

-- 作成された公演の確認
SELECT 
  se.date,
  se.start_time,
  s.name as store_name,
  sc.title as scenario_title,
  se.category,
  se.is_reservation_enabled,
  se.max_participants
FROM schedule_events se
LEFT JOIN stores s ON se.store_id = s.id
LEFT JOIN scenarios sc ON se.scenario_id = sc.id
WHERE se.category = 'open'
  AND se.notes LIKE '%サンプルデータ%'
ORDER BY se.date, se.start_time
LIMIT 20;

-- 統計情報の表示
SELECT 
  COUNT(*) as total_open_events,
  COUNT(DISTINCT scenario_id) as unique_scenarios,
  COUNT(DISTINCT store_id) as unique_stores,
  MIN(date) as earliest_date,
  MAX(date) as latest_date
FROM schedule_events
WHERE category = 'open'
  AND notes LIKE '%サンプルデータ%';
