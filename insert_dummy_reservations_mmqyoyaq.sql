-- mmqyoyaq顧客用ダミー予約データ挿入スクリプト
-- 実行前に organization_id, customer_id, scenario_id, store_id を確認・置換してください

-- 1. まず顧客を確認（存在しなければ作成）
-- 顧客名で検索
SELECT id, name, email, user_id FROM customers WHERE name ILIKE '%mmqyoyaq%' OR email ILIKE '%mmqyoyaq%';

-- 2. 利用可能なシナリオを確認
SELECT id, title, duration, player_count_min, player_count_max FROM scenarios LIMIT 20;

-- 3. 利用可能な店舗を確認
SELECT id, name, short_name FROM stores WHERE status = 'active' LIMIT 10;

-- 4. organization_idを確認
SELECT id, name FROM organizations LIMIT 5;

-- ===================================
-- 以下、取得したIDを使ってダミーデータを挿入
-- ===================================

-- 顧客が存在しない場合は作成（organization_idを置換してください）
/*
INSERT INTO customers (
  organization_id,
  name,
  email,
  visit_count,
  total_spent,
  created_at,
  updated_at
) VALUES (
  'YOUR_ORGANIZATION_ID',  -- 置換
  'mmqyoyaq',
  'mmqyoyaq@example.com',
  0,
  0,
  NOW(),
  NOW()
) ON CONFLICT DO NOTHING
RETURNING id;
*/

-- ダミー予約を挿入（各IDを置換してください）
-- 例: 過去3ヶ月分の参加履歴
/*
DO $$
DECLARE
  v_org_id UUID := 'YOUR_ORGANIZATION_ID';  -- 置換
  v_customer_id UUID := 'YOUR_CUSTOMER_ID';  -- 置換
  v_scenarios UUID[] := ARRAY[
    'SCENARIO_ID_1',  -- 置換
    'SCENARIO_ID_2',  -- 置換
    'SCENARIO_ID_3',  -- 置換
    'SCENARIO_ID_4'   -- 置換
  ]::UUID[];
  v_stores UUID[] := ARRAY[
    'STORE_ID_1',  -- 置換
    'STORE_ID_2'   -- 置換
  ]::UUID[];
  v_reservation_number TEXT;
  v_i INT;
BEGIN
  FOR v_i IN 1..4 LOOP
    v_reservation_number := 'R-' || TO_CHAR(NOW() - (v_i * 30 || ' days')::INTERVAL, 'YYYYMMDD') || '-' || LPAD(v_i::TEXT, 4, '0');
    
    INSERT INTO reservations (
      organization_id,
      reservation_number,
      title,
      scenario_id,
      store_id,
      customer_id,
      requested_datetime,
      actual_datetime,
      duration,
      participant_count,
      base_price,
      options_price,
      total_price,
      discount_amount,
      status,
      payment_status,
      created_at,
      updated_at
    ) VALUES (
      v_org_id,
      v_reservation_number,
      'ダミー予約 ' || v_i,
      v_scenarios[v_i],
      v_stores[(v_i % 2) + 1],
      v_customer_id,
      (NOW() - (v_i * 30 || ' days')::INTERVAL)::DATE + TIME '14:00:00',
      (NOW() - (v_i * 30 || ' days')::INTERVAL)::DATE + TIME '14:00:00',
      240,
      4,
      20000,
      0,
      20000,
      0,
      'completed',
      'paid',
      NOW(),
      NOW()
    );
  END LOOP;
END $$;
*/

-- 確認クエリ
-- SELECT r.*, s.title as scenario_title, st.name as store_name
-- FROM reservations r
-- LEFT JOIN scenarios s ON r.scenario_id = s.id
-- LEFT JOIN stores st ON r.store_id = st.id
-- WHERE r.customer_id = 'YOUR_CUSTOMER_ID'
-- ORDER BY r.requested_datetime DESC;

