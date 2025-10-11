-- テスト用貸切リクエストデータ挿入
-- まず既存のシナリオIDを確認してから実行してください

-- 例: シナリオID '123e4567-e89b-12d3-a456-426614174000' が存在すると仮定
-- 実際のシナリオIDはSupabaseダッシュボードで確認してください

-- テストデータ1: GM確認待ち
INSERT INTO private_booking_requests (
  scenario_id,
  scenario_title,
  customer_name,
  customer_email,
  customer_phone,
  preferred_dates,
  preferred_stores,
  participant_count,
  notes,
  status,
  gm_responses
) VALUES (
  (SELECT id FROM scenarios LIMIT 1), -- 最初のシナリオを使用
  (SELECT title FROM scenarios LIMIT 1),
  '田中太郎',
  'tanaka@example.com',
  '090-1234-5678',
  ARRAY['2025-11-15 10:00:00+09'::TIMESTAMPTZ, '2025-11-16 14:00:00+09'::TIMESTAMPTZ],
  ARRAY[(SELECT id FROM stores LIMIT 1)], -- 最初の店舗を使用
  6,
  '初めての貸切予約です。よろしくお願いします。',
  'pending_gm',
  '[]'::JSONB
);

-- テストデータ2: 店舗確認待ち（GMが対応可能と回答済み）
INSERT INTO private_booking_requests (
  scenario_id,
  scenario_title,
  customer_name,
  customer_email,
  customer_phone,
  preferred_dates,
  preferred_stores,
  participant_count,
  notes,
  status,
  gm_responses
) VALUES (
  (SELECT id FROM scenarios LIMIT 1 OFFSET 1), -- 2番目のシナリオを使用
  (SELECT title FROM scenarios LIMIT 1 OFFSET 1),
  '佐藤花子',
  'sato@example.com',
  '080-9876-5432',
  ARRAY['2025-11-20 18:00:00+09'::TIMESTAMPTZ, '2025-11-21 18:00:00+09'::TIMESTAMPTZ],
  ARRAY[(SELECT id FROM stores LIMIT 1)],
  8,
  '会社のイベントで利用したいです。',
  'pending_store',
  '[
    {
      "gm_id": "gm-001",
      "gm_name": "山田GM",
      "available": true,
      "preferred_date": "2025-11-20T18:00:00+09:00",
      "notes": "20日の夜間希望です"
    },
    {
      "gm_id": "gm-002",
      "gm_name": "鈴木GM",
      "available": true,
      "preferred_date": "2025-11-21T18:00:00+09:00",
      "notes": "21日でも対応可能です"
    }
  ]'::JSONB
);

-- テストデータ3: 店舗確認待ち（複数GMが対応可能）
INSERT INTO private_booking_requests (
  scenario_id,
  scenario_title,
  customer_name,
  customer_email,
  customer_phone,
  preferred_dates,
  preferred_stores,
  participant_count,
  notes,
  status,
  gm_responses
) VALUES (
  (SELECT id FROM scenarios LIMIT 1 OFFSET 2), -- 3番目のシナリオを使用
  (SELECT title FROM scenarios LIMIT 1 OFFSET 2),
  '高橋次郎',
  'takahashi@example.com',
  '070-5555-6666',
  ARRAY['2025-11-25 13:00:00+09'::TIMESTAMPTZ],
  ARRAY[(SELECT id FROM stores LIMIT 1), (SELECT id FROM stores LIMIT 1 OFFSET 1)],
  7,
  '友人の誕生日パーティーで利用予定です。',
  'pending_store',
  '[
    {
      "gm_id": "gm-001",
      "gm_name": "山田GM",
      "available": true,
      "preferred_date": "2025-11-25T13:00:00+09:00",
      "notes": "午後の時間帯、対応可能です"
    },
    {
      "gm_id": "gm-003",
      "gm_name": "伊藤GM",
      "available": true,
      "preferred_date": "2025-11-25T13:00:00+09:00",
      "notes": "問題なく対応できます"
    },
    {
      "gm_id": "gm-004",
      "gm_name": "渡辺GM",
      "available": false,
      "notes": "この日は予定があり対応できません"
    }
  ]'::JSONB
);

-- テストデータ4: 承認済み
INSERT INTO private_booking_requests (
  scenario_id,
  scenario_title,
  customer_name,
  customer_email,
  customer_phone,
  preferred_dates,
  preferred_stores,
  participant_count,
  notes,
  status,
  gm_responses,
  approved_date,
  approved_store_id
) VALUES (
  (SELECT id FROM scenarios LIMIT 1),
  (SELECT title FROM scenarios LIMIT 1),
  '中村美咲',
  'nakamura@example.com',
  '090-7777-8888',
  ARRAY['2025-11-10 10:00:00+09'::TIMESTAMPTZ],
  ARRAY[(SELECT id FROM stores LIMIT 1)],
  5,
  NULL,
  'approved',
  '[
    {
      "gm_id": "gm-002",
      "gm_name": "鈴木GM",
      "available": true,
      "preferred_date": "2025-11-10T10:00:00+09:00",
      "notes": "対応可能です"
    }
  ]'::JSONB,
  NOW(),
  (SELECT id FROM stores LIMIT 1)
);

-- テストデータ5: 却下
INSERT INTO private_booking_requests (
  scenario_id,
  scenario_title,
  customer_name,
  customer_email,
  customer_phone,
  preferred_dates,
  preferred_stores,
  participant_count,
  notes,
  status,
  gm_responses,
  rejection_reason
) VALUES (
  (SELECT id FROM scenarios LIMIT 1 OFFSET 1),
  (SELECT title FROM scenarios LIMIT 1 OFFSET 1),
  '小林健太',
  'kobayashi@example.com',
  '080-3333-4444',
  ARRAY['2025-11-05 20:00:00+09'::TIMESTAMPTZ],
  ARRAY[(SELECT id FROM stores LIMIT 1)],
  4,
  NULL,
  'rejected',
  '[]'::JSONB,
  '希望日時に対応可能なGMがおりませんでした。別の日程をご検討ください。'
);

-- 挿入確認
SELECT 
  id,
  scenario_title,
  customer_name,
  status,
  participant_count,
  created_at
FROM private_booking_requests
ORDER BY created_at DESC;

