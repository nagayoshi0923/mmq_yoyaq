-- シフトデータが空になる問題の調査用クエリ
-- Supabase SQL Editorで実行してください

-- 1. 問題のあるスタッフのuser_id連携を確認
-- （報告者のメールアドレスに置き換えて実行）
SELECT 
  s.id as staff_id,
  s.name as staff_name,
  s.user_id,
  s.organization_id as staff_org_id,
  u.email,
  u.created_at as user_created
FROM staff s
LEFT JOIN auth.users u ON s.user_id = u.id
WHERE s.name LIKE '%報告者名%'  -- 報告者の名前に置き換え
   OR u.email LIKE '%報告者メール%';  -- 報告者のメールに置き換え

-- 2. そのスタッフのshift_submissionsを直接確認（RLSをバイパス）
-- （上記で取得したstaff_idに置き換え）
SELECT 
  id,
  staff_id,
  date,
  morning,
  afternoon,
  evening,
  all_day,
  status,
  organization_id,
  submitted_at
FROM shift_submissions
WHERE staff_id = 'STAFF_ID_HERE'  -- 上記で取得したstaff_idに置き換え
  AND date >= '2026-01-01'
ORDER BY date
LIMIT 50;

-- 3. organization_idの不一致を確認
SELECT 
  s.name,
  s.organization_id as staff_org,
  ss.organization_id as shift_org,
  ss.date,
  ss.status
FROM shift_submissions ss
JOIN staff s ON ss.staff_id = s.id
WHERE s.organization_id != ss.organization_id
LIMIT 20;

-- 4. user_idがNULLのスタッフを確認（ログインしても紐づかない）
SELECT id, name, user_id, organization_id
FROM staff
WHERE user_id IS NULL
  AND status = 'active';

-- 5. 最近の提出を確認（正常に動作しているか）
SELECT 
  s.name,
  ss.date,
  ss.morning,
  ss.afternoon,
  ss.evening,
  ss.status,
  ss.submitted_at
FROM shift_submissions ss
JOIN staff s ON ss.staff_id = s.id
WHERE ss.submitted_at > NOW() - INTERVAL '24 hours'
ORDER BY ss.submitted_at DESC
LIMIT 20;





