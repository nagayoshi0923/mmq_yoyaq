-- サンプルシフトデータを挿入
-- 注意: 実行前にスタッフIDを確認して、実際のIDに置き換えてください

-- 10月のシフトデータ（2025年10月1日～31日）
-- スタッフ1: 田中 太郎（週3-4日、主に夜間）
INSERT INTO shift_submissions (staff_id, date, morning, afternoon, evening, all_day, status, submitted_at)
SELECT 
  id,
  date::date,
  CASE WHEN EXTRACT(DOW FROM date::date) IN (1, 3, 5) THEN true ELSE false END, -- 月水金の午前
  CASE WHEN EXTRACT(DOW FROM date::date) IN (1, 3, 5, 6) THEN true ELSE false END, -- 月水金土の午後
  CASE WHEN EXTRACT(DOW FROM date::date) IN (1, 2, 3, 4, 5, 6) THEN true ELSE false END, -- 平日+土の夜間
  false,
  'submitted',
  NOW()
FROM staff, generate_series('2025-10-01'::date, '2025-10-31'::date, '1 day'::interval) date
WHERE name = '田中 太郎'
ON CONFLICT (staff_id, date) DO UPDATE SET
  morning = EXCLUDED.morning,
  afternoon = EXCLUDED.afternoon,
  evening = EXCLUDED.evening,
  status = EXCLUDED.status,
  submitted_at = EXCLUDED.submitted_at;

-- スタッフ2: 佐藤 花子（週5日、終日可能な日が多い）
INSERT INTO shift_submissions (staff_id, date, morning, afternoon, evening, all_day, status, submitted_at)
SELECT 
  id,
  date::date,
  CASE WHEN EXTRACT(DOW FROM date::date) NOT IN (0, 3) THEN true ELSE false END, -- 水日以外の午前
  CASE WHEN EXTRACT(DOW FROM date::date) NOT IN (0) THEN true ELSE false END, -- 日曜以外の午後
  CASE WHEN EXTRACT(DOW FROM date::date) IN (2, 4, 5, 6) THEN true ELSE false END, -- 火木金土の夜間
  CASE WHEN EXTRACT(DOW FROM date::date) IN (5, 6) THEN true ELSE false END, -- 金土は終日
  'submitted',
  NOW()
FROM staff, generate_series('2025-10-01'::date, '2025-10-31'::date, '1 day'::interval) date
WHERE name = '佐藤 花子'
ON CONFLICT (staff_id, date) DO UPDATE SET
  morning = EXCLUDED.morning,
  afternoon = EXCLUDED.afternoon,
  evening = EXCLUDED.evening,
  all_day = EXCLUDED.all_day,
  status = EXCLUDED.status,
  submitted_at = EXCLUDED.submitted_at;

-- スタッフ3: 鈴木 一郎（週末中心、夜間多め）
INSERT INTO shift_submissions (staff_id, date, morning, afternoon, evening, all_day, status, submitted_at)
SELECT 
  id,
  date::date,
  CASE WHEN EXTRACT(DOW FROM date::date) IN (0, 6) THEN true ELSE false END, -- 土日の午前
  CASE WHEN EXTRACT(DOW FROM date::date) IN (0, 5, 6) THEN true ELSE false END, -- 金土日の午後
  CASE WHEN EXTRACT(DOW FROM date::date) IN (1, 2, 3, 4, 5, 6, 0) THEN true ELSE false END, -- 毎日夜間可能
  CASE WHEN EXTRACT(DOW FROM date::date) IN (6, 0) THEN true ELSE false END, -- 土日は終日
  'submitted',
  NOW()
FROM staff, generate_series('2025-10-01'::date, '2025-10-31'::date, '1 day'::interval) date
WHERE name = '鈴木 一郎'
ON CONFLICT (staff_id, date) DO UPDATE SET
  morning = EXCLUDED.morning,
  afternoon = EXCLUDED.afternoon,
  evening = EXCLUDED.evening,
  all_day = EXCLUDED.all_day,
  status = EXCLUDED.status,
  submitted_at = EXCLUDED.submitted_at;

-- スタッフ4: 伊藤 健太（週4日、バランス良く）
INSERT INTO shift_submissions (staff_id, date, morning, afternoon, evening, all_day, status, submitted_at)
SELECT 
  id,
  date::date,
  CASE WHEN EXTRACT(DOW FROM date::date) IN (2, 3, 4, 5) THEN true ELSE false END, -- 火水木金の午前
  CASE WHEN EXTRACT(DOW FROM date::date) IN (1, 2, 3, 4, 5, 6) THEN true ELSE false END, -- 月～土の午後
  CASE WHEN EXTRACT(DOW FROM date::date) IN (3, 4, 5, 6) THEN true ELSE false END, -- 水木金土の夜間
  false,
  'submitted',
  NOW()
FROM staff, generate_series('2025-10-01'::date, '2025-10-31'::date, '1 day'::interval) date
WHERE name = '伊藤 健太'
ON CONFLICT (staff_id, date) DO UPDATE SET
  morning = EXCLUDED.morning,
  afternoon = EXCLUDED.afternoon,
  evening = EXCLUDED.evening,
  status = EXCLUDED.status,
  submitted_at = EXCLUDED.submitted_at;

-- スタッフ5: 山田 美咲（週3日、午後中心）
INSERT INTO shift_submissions (staff_id, date, morning, afternoon, evening, all_day, status, submitted_at)
SELECT 
  id,
  date::date,
  CASE WHEN EXTRACT(DOW FROM date::date) IN (6, 0) THEN true ELSE false END, -- 土日の午前
  CASE WHEN EXTRACT(DOW FROM date::date) IN (2, 4, 6, 0) THEN true ELSE false END, -- 火木土日の午後
  CASE WHEN EXTRACT(DOW FROM date::date) IN (4, 6, 0) THEN true ELSE false END, -- 木土日の夜間
  false,
  'submitted',
  NOW()
FROM staff, generate_series('2025-10-01'::date, '2025-10-31'::date, '1 day'::interval) date
WHERE name = '山田 美咲'
ON CONFLICT (staff_id, date) DO UPDATE SET
  morning = EXCLUDED.morning,
  afternoon = EXCLUDED.afternoon,
  evening = EXCLUDED.evening,
  status = EXCLUDED.status,
  submitted_at = EXCLUDED.submitted_at;

-- スタッフ6: 高橋 健（週6日、フルタイム）
INSERT INTO shift_submissions (staff_id, date, morning, afternoon, evening, all_day, status, submitted_at)
SELECT 
  id,
  date::date,
  CASE WHEN EXTRACT(DOW FROM date::date) != 0 THEN true ELSE false END, -- 日曜以外の午前
  CASE WHEN EXTRACT(DOW FROM date::date) != 0 THEN true ELSE false END, -- 日曜以外の午後
  CASE WHEN EXTRACT(DOW FROM date::date) != 0 THEN true ELSE false END, -- 日曜以外の夜間
  CASE WHEN EXTRACT(DOW FROM date::date) IN (1, 2, 3, 4, 5, 6) THEN true ELSE false END, -- 月～土は終日
  'submitted',
  NOW()
FROM staff, generate_series('2025-10-01'::date, '2025-10-31'::date, '1 day'::interval) date
WHERE name = '高橋 健'
ON CONFLICT (staff_id, date) DO UPDATE SET
  morning = EXCLUDED.morning,
  afternoon = EXCLUDED.afternoon,
  evening = EXCLUDED.evening,
  all_day = EXCLUDED.all_day,
  status = EXCLUDED.status,
  submitted_at = EXCLUDED.submitted_at;

-- 下書きデータも追加（11月分の一部）
INSERT INTO shift_submissions (staff_id, date, morning, afternoon, evening, all_day, status)
SELECT 
  id,
  date::date,
  CASE WHEN EXTRACT(DOW FROM date::date) IN (1, 3, 5) THEN true ELSE false END,
  CASE WHEN EXTRACT(DOW FROM date::date) IN (1, 3, 5, 6) THEN true ELSE false END,
  CASE WHEN EXTRACT(DOW FROM date::date) IN (1, 2, 3, 4, 5, 6) THEN true ELSE false END,
  false,
  'draft'
FROM staff, generate_series('2025-11-01'::date, '2025-11-10'::date, '1 day'::interval) date
WHERE name IN ('田中 太郎', '佐藤 花子')
ON CONFLICT (staff_id, date) DO NOTHING;

