-- シンプルなサンプルシフトデータ
-- 10月1日～31日のシフトを各スタッフに設定

-- まず、スタッフIDを取得（実行前に確認）
-- SELECT id, name FROM staff ORDER BY name;

-- =====================================
-- 田中 太郎: 平日夜間メイン + 週末午後
-- =====================================
WITH target_staff AS (
  SELECT id FROM staff WHERE name = '田中 太郎' LIMIT 1
)
INSERT INTO shift_submissions (staff_id, date, morning, afternoon, evening, status, submitted_at)
SELECT 
  target_staff.id,
  d::date,
  false,
  CASE WHEN EXTRACT(DOW FROM d) IN (0, 6) THEN true ELSE false END, -- 週末午後
  CASE WHEN EXTRACT(DOW FROM d) IN (1, 2, 3, 4, 5) THEN true ELSE false END, -- 平日夜間
  'submitted',
  NOW()
FROM target_staff, generate_series('2025-10-01', '2025-10-31', '1 day'::interval) d
ON CONFLICT (staff_id, date) DO NOTHING;

-- =====================================
-- 佐藤 花子: 週末フルタイム + 平日午後
-- =====================================
WITH target_staff AS (
  SELECT id FROM staff WHERE name = '佐藤 花子' LIMIT 1
)
INSERT INTO shift_submissions (staff_id, date, morning, afternoon, evening, all_day, status, submitted_at)
SELECT 
  target_staff.id,
  d::date,
  CASE WHEN EXTRACT(DOW FROM d) IN (0, 6) THEN true ELSE false END,
  true, -- 毎日午後可
  CASE WHEN EXTRACT(DOW FROM d) IN (0, 5, 6) THEN true ELSE false END, -- 金土日夜間
  CASE WHEN EXTRACT(DOW FROM d) IN (0, 6) THEN true ELSE false END, -- 週末終日
  'submitted',
  NOW()
FROM target_staff, generate_series('2025-10-01', '2025-10-31', '1 day'::interval) d
ON CONFLICT (staff_id, date) DO NOTHING;

-- =====================================
-- 鈴木 一郎: 週末専門 + 金曜夜
-- =====================================
WITH target_staff AS (
  SELECT id FROM staff WHERE name = '鈴木 一郎' LIMIT 1
)
INSERT INTO shift_submissions (staff_id, date, morning, afternoon, evening, all_day, status, submitted_at)
SELECT 
  target_staff.id,
  d::date,
  CASE WHEN EXTRACT(DOW FROM d) IN (0, 6) THEN true ELSE false END,
  CASE WHEN EXTRACT(DOW FROM d) IN (0, 6) THEN true ELSE false END,
  CASE WHEN EXTRACT(DOW FROM d) IN (0, 5, 6) THEN true ELSE false END,
  CASE WHEN EXTRACT(DOW FROM d) IN (0, 6) THEN true ELSE false END,
  'submitted',
  NOW()
FROM target_staff, generate_series('2025-10-01', '2025-10-31', '1 day'::interval) d
ON CONFLICT (staff_id, date) DO NOTHING;

-- =====================================
-- 伊藤 健太: 火水木金 終日
-- =====================================
WITH target_staff AS (
  SELECT id FROM staff WHERE name = '伊藤 健太' LIMIT 1
)
INSERT INTO shift_submissions (staff_id, date, morning, afternoon, evening, all_day, status, submitted_at)
SELECT 
  target_staff.id,
  d::date,
  CASE WHEN EXTRACT(DOW FROM d) IN (2, 3, 4, 5) THEN true ELSE false END,
  CASE WHEN EXTRACT(DOW FROM d) IN (2, 3, 4, 5) THEN true ELSE false END,
  CASE WHEN EXTRACT(DOW FROM d) IN (2, 3, 4, 5) THEN true ELSE false END,
  CASE WHEN EXTRACT(DOW FROM d) IN (2, 3, 4, 5) THEN true ELSE false END,
  'submitted',
  NOW()
FROM target_staff, generate_series('2025-10-01', '2025-10-31', '1 day'::interval) d
ON CONFLICT (staff_id, date) DO NOTHING;

-- =====================================
-- 山田 美咲: 月水金 午後～夜間
-- =====================================
WITH target_staff AS (
  SELECT id FROM staff WHERE name = '山田 美咲' LIMIT 1
)
INSERT INTO shift_submissions (staff_id, date, morning, afternoon, evening, status, submitted_at)
SELECT 
  target_staff.id,
  d::date,
  false,
  CASE WHEN EXTRACT(DOW FROM d) IN (1, 3, 5) THEN true ELSE false END,
  CASE WHEN EXTRACT(DOW FROM d) IN (1, 3, 5) THEN true ELSE false END,
  'submitted',
  NOW()
FROM target_staff, generate_series('2025-10-01', '2025-10-31', '1 day'::interval) d
ON CONFLICT (staff_id, date) DO NOTHING;

-- =====================================
-- 高橋 健: ほぼフルタイム（日曜休み）
-- =====================================
WITH target_staff AS (
  SELECT id FROM staff WHERE name = '高橋 健' LIMIT 1
)
INSERT INTO shift_submissions (staff_id, date, morning, afternoon, evening, all_day, status, submitted_at)
SELECT 
  target_staff.id,
  d::date,
  CASE WHEN EXTRACT(DOW FROM d) != 0 THEN true ELSE false END,
  CASE WHEN EXTRACT(DOW FROM d) != 0 THEN true ELSE false END,
  CASE WHEN EXTRACT(DOW FROM d) != 0 THEN true ELSE false END,
  CASE WHEN EXTRACT(DOW FROM d) != 0 THEN true ELSE false END,
  'submitted',
  NOW()
FROM target_staff, generate_series('2025-10-01', '2025-10-31', '1 day'::interval) d
ON CONFLICT (staff_id, date) DO NOTHING;

-- 結果確認用クエリ
SELECT 
  s.name,
  COUNT(*) as shift_count,
  SUM(CASE WHEN ss.morning THEN 1 ELSE 0 END) as morning_count,
  SUM(CASE WHEN ss.afternoon THEN 1 ELSE 0 END) as afternoon_count,
  SUM(CASE WHEN ss.evening THEN 1 ELSE 0 END) as evening_count,
  SUM(CASE WHEN ss.all_day THEN 1 ELSE 0 END) as all_day_count
FROM shift_submissions ss
JOIN staff s ON s.id = ss.staff_id
WHERE ss.date >= '2025-10-01' AND ss.date <= '2025-10-31'
GROUP BY s.name
ORDER BY s.name;

