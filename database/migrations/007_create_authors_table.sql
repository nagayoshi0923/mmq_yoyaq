-- 作者ポータル機能（メールアドレスベース）
-- 実行日: 2024-12-17
-- 
-- 設計方針:
-- - 作者は自分で登録しない（報告者がシナリオに作者メールを登録）
-- - 報告があると作者メールに通知が届く
-- - 作者はメールアドレスでログインして報告を確認
-- - 同じメールアドレス宛の全報告が見れる

-- ================================================
-- 1. scenarios テーブルに author_email を追加
-- ================================================
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS author_email TEXT;
CREATE INDEX IF NOT EXISTS idx_scenarios_author_email ON scenarios(author_email);

-- ================================================
-- 2. 作者向けの公演報告ビュー（メールアドレスベース）
-- ================================================
CREATE OR REPLACE VIEW author_performance_reports AS
SELECT 
  s.author_email,
  s.author AS author_name,
  s.id AS scenario_id,
  s.title AS scenario_title,
  o.id AS organization_id,
  o.name AS organization_name,
  epr.id AS report_id,
  epr.performance_date,
  epr.performance_count,
  epr.participant_count,
  epr.venue_name,
  epr.status AS report_status,
  epr.created_at AS reported_at,
  s.license_amount,
  (epr.performance_count * COALESCE(s.license_amount, 0)) AS calculated_license_fee
FROM scenarios s
JOIN external_performance_reports epr ON epr.scenario_id = s.id
JOIN organizations o ON o.id = epr.organization_id
WHERE s.author_email IS NOT NULL;

-- ================================================
-- 3. 作者メール別の集計ビュー
-- ================================================
CREATE OR REPLACE VIEW author_summary AS
SELECT 
  s.author_email,
  COUNT(DISTINCT s.id) AS total_scenarios,
  COUNT(DISTINCT CASE WHEN epr.status = 'approved' THEN epr.id END) AS total_approved_reports,
  COALESCE(SUM(CASE WHEN epr.status = 'approved' THEN epr.performance_count END), 0) AS total_performance_count,
  COALESCE(SUM(CASE WHEN epr.status = 'approved' THEN epr.performance_count * COALESCE(s.license_amount, 0) END), 0) AS total_license_fee,
  COUNT(DISTINCT epr.organization_id) AS organizations_count
FROM scenarios s
LEFT JOIN external_performance_reports epr ON epr.scenario_id = s.id
WHERE s.author_email IS NOT NULL
GROUP BY s.author_email;

-- ================================================
-- 確認用クエリ
-- ================================================
-- SELECT * FROM author_performance_reports WHERE author_email = 'example@author.com';
-- SELECT * FROM author_summary WHERE author_email = 'example@author.com';
