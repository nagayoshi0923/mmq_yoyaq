-- サンプルオープン公演の登録（シンプル版）
-- 予約サイトで表示されるテスト用のオープン公演を作成します

-- 注意: 
-- 1. このスクリプトを実行する前に、stores と scenarios にデータが必要です
-- 2. add_reservation_integration.sql が実行済みである必要があります
-- 3. 以下の変数を実際のIDに置き換えてください

-- ============================================
-- 変数設定（実際のIDに置き換えてください）
-- ============================================

-- 店舗IDを確認
SELECT id, name, short_name FROM stores LIMIT 5;

-- シナリオIDを確認
SELECT id, title, duration, player_count_max FROM scenarios LIMIT 10;

-- ============================================
-- サンプルデータ挿入
-- ============================================

-- 既存のサンプルオープン公演を削除（重複を避けるため）
DELETE FROM schedule_events 
WHERE category = 'open' 
AND notes = 'サンプルデータ: 予約サイトテスト用';

-- サンプルオープン公演を挿入
-- 注意: store_id と scenario_id を実際の値に置き換えてください

-- 公演1: 今日から3日後
INSERT INTO schedule_events (
  date,
  store_id,
  venue,
  scenario_id,
  scenario,
  category,
  start_time,
  end_time,
  capacity,
  max_participants,
  is_cancelled,
  is_reservation_enabled,
  reservation_deadline_hours,
  reservation_notes,
  notes
) 
SELECT 
  CURRENT_DATE + 3,
  s.id,
  s.short_name,
  sc.id,
  sc.title,
  'open',
  '14:00:00',
  '16:00:00',
  sc.player_count_max,
  sc.player_count_max,
  false,
  true,
  24,
  '当日は開始時刻の10分前までにお越しください。',
  'サンプルデータ: 予約サイトテスト用'
FROM stores s, scenarios sc
WHERE s.status = 'active' 
  AND sc.status = 'available'
LIMIT 1;

-- 公演2: 今日から5日後
INSERT INTO schedule_events (
  date,
  store_id,
  venue,
  scenario_id,
  scenario,
  category,
  start_time,
  end_time,
  capacity,
  max_participants,
  is_cancelled,
  is_reservation_enabled,
  reservation_deadline_hours,
  reservation_notes,
  notes
) 
SELECT 
  CURRENT_DATE + 5,
  s.id,
  s.short_name,
  sc.id,
  sc.title,
  'open',
  '18:00:00',
  '20:00:00',
  sc.player_count_max,
  sc.player_count_max,
  false,
  true,
  24,
  '当日は開始時刻の10分前までにお越しください。',
  'サンプルデータ: 予約サイトテスト用'
FROM stores s, scenarios sc
WHERE s.status = 'active' 
  AND sc.status = 'available'
OFFSET 1 LIMIT 1;

-- 公演3: 今日から7日後
INSERT INTO schedule_events (
  date,
  store_id,
  venue,
  scenario_id,
  scenario,
  category,
  start_time,
  end_time,
  capacity,
  max_participants,
  is_cancelled,
  is_reservation_enabled,
  reservation_deadline_hours,
  reservation_notes,
  notes
) 
SELECT 
  CURRENT_DATE + 7,
  s.id,
  s.short_name,
  sc.id,
  sc.title,
  'open',
  '10:00:00',
  '12:00:00',
  sc.player_count_max,
  sc.player_count_max,
  false,
  true,
  24,
  '当日は開始時刻の10分前までにお越しください。',
  'サンプルデータ: 予約サイトテスト用'
FROM stores s, scenarios sc
WHERE s.status = 'active' 
  AND sc.status = 'available'
OFFSET 2 LIMIT 1;

-- 公演4: 今日から10日後
INSERT INTO schedule_events (
  date,
  store_id,
  venue,
  scenario_id,
  scenario,
  category,
  start_time,
  end_time,
  capacity,
  max_participants,
  is_cancelled,
  is_reservation_enabled,
  reservation_deadline_hours,
  reservation_notes,
  notes
) 
SELECT 
  CURRENT_DATE + 10,
  s.id,
  s.short_name,
  sc.id,
  sc.title,
  'open',
  '15:00:00',
  '17:00:00',
  sc.player_count_max,
  sc.player_count_max,
  false,
  true,
  24,
  '当日は開始時刻の10分前までにお越しください。',
  'サンプルデータ: 予約サイトテスト用'
FROM stores s, scenarios sc
WHERE s.status = 'active' 
  AND sc.status = 'available'
OFFSET 3 LIMIT 1;

-- 公演5: 今日から14日後
INSERT INTO schedule_events (
  date,
  store_id,
  venue,
  scenario_id,
  scenario,
  category,
  start_time,
  end_time,
  capacity,
  max_participants,
  is_cancelled,
  is_reservation_enabled,
  reservation_deadline_hours,
  reservation_notes,
  notes
) 
SELECT 
  CURRENT_DATE + 14,
  s.id,
  s.short_name,
  sc.id,
  sc.title,
  'open',
  '13:00:00',
  '15:00:00',
  sc.player_count_max,
  sc.player_count_max,
  false,
  true,
  24,
  '当日は開始時刻の10分前までにお越しください。',
  'サンプルデータ: 予約サイトテスト用'
FROM stores s, scenarios sc
WHERE s.status = 'active' 
  AND sc.status = 'available'
OFFSET 4 LIMIT 1;

-- さらに複数の公演を追加（異なる店舗・シナリオの組み合わせ）
INSERT INTO schedule_events (
  date,
  store_id,
  venue,
  scenario_id,
  scenario,
  category,
  start_time,
  end_time,
  capacity,
  max_participants,
  is_cancelled,
  is_reservation_enabled,
  reservation_deadline_hours,
  reservation_notes,
  notes
) 
SELECT 
  CURRENT_DATE + (row_number() OVER () + 2),
  s.id,
  s.short_name,
  sc.id,
  sc.title,
  'open',
  (10 + (row_number() OVER () % 8))::TEXT || ':00:00',
  (12 + (row_number() OVER () % 8))::TEXT || ':00:00',
  sc.player_count_max,
  sc.player_count_max,
  false,
  true,
  24,
  '当日は開始時刻の10分前までにお越しください。',
  'サンプルデータ: 予約サイトテスト用'
FROM 
  (SELECT id, short_name FROM stores WHERE status = 'active' LIMIT 3) s,
  (SELECT id, title, player_count_max FROM scenarios WHERE status = 'available' LIMIT 5) sc
LIMIT 15;

-- ============================================
-- 確認クエリ
-- ============================================

-- 作成された公演の確認
SELECT 
  se.date,
  se.start_time,
  s.name as store_name,
  sc.title as scenario_title,
  se.category,
  se.is_reservation_enabled,
  se.max_participants,
  se.capacity
FROM schedule_events se
LEFT JOIN stores s ON se.store_id = s.id
LEFT JOIN scenarios sc ON se.scenario_id = sc.id
WHERE se.category = 'open'
  AND se.notes = 'サンプルデータ: 予約サイトテスト用'
ORDER BY se.date, se.start_time;

-- 統計情報の表示
SELECT 
  COUNT(*) as total_open_events,
  COUNT(DISTINCT scenario_id) as unique_scenarios,
  COUNT(DISTINCT store_id) as unique_stores,
  MIN(date) as earliest_date,
  MAX(date) as latest_date
FROM schedule_events
WHERE category = 'open'
  AND notes = 'サンプルデータ: 予約サイトテスト用';

-- 予約サイトで表示される条件を満たす公演の確認
SELECT 
  COUNT(*) as viewable_events
FROM schedule_events
WHERE category = 'open'
  AND is_reservation_enabled = true
  AND is_cancelled = false
  AND date >= CURRENT_DATE
  AND notes = 'サンプルデータ: 予約サイトテスト用';
