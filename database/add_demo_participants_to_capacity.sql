-- 各公演にデモ参加者を追加し、シナリオの最大人数まで埋める
-- 実行前に必ずバックアップを取ってください

-- 1. デモ顧客のIDを確認（必要に応じて変更）
DO $$
DECLARE
  demo_customer_id UUID;
  event_record RECORD;
  scenario_record RECORD;
  current_participants_count INT;
  demo_participants_count INT;
  real_participants_count INT;
  needed_demo_count INT;
  new_reservation_number TEXT;
  participation_fee_amount INT;
BEGIN
  -- デモ顧客を取得
  SELECT id INTO demo_customer_id
  FROM customers
  WHERE name ILIKE '%デモ%' OR email ILIKE '%demo%' OR name ILIKE '%test%'
  LIMIT 1;
  
  IF demo_customer_id IS NULL THEN
    RAISE EXCEPTION 'デモ顧客が見つかりません';
  END IF;
  
  RAISE NOTICE 'デモ顧客ID: %', demo_customer_id;
  
  -- 過去の公演で、中止されていないものをループ
  FOR event_record IN
    SELECT 
      se.id,
      se.date,
      se.scenario,
      se.scenario_id,
      se.venue,
      se.start_time,
      se.category,
      se.current_participants,
      s.id as store_id
    FROM schedule_events se
    LEFT JOIN stores s ON (se.venue = s.name OR se.venue = s.short_name)
    WHERE se.date <= CURRENT_DATE
      AND se.is_cancelled = false
      AND se.scenario IS NOT NULL
      AND se.scenario != ''
    ORDER BY se.date ASC
  LOOP
    -- シナリオ情報を取得
    IF event_record.scenario_id IS NOT NULL THEN
      -- scenario_idがある場合
      SELECT 
        id, 
        title, 
        duration, 
        participation_fee, 
        gm_test_participation_fee, 
        player_count_max
      INTO scenario_record
      FROM scenarios
      WHERE id = event_record.scenario_id;
    ELSE
      -- scenario_idがない場合、タイトルで検索
      SELECT 
        id, 
        title, 
        duration, 
        participation_fee, 
        gm_test_participation_fee, 
        player_count_max
      INTO scenario_record
      FROM scenarios
      WHERE title = event_record.scenario
      LIMIT 1;
    END IF;
    
    -- シナリオが見つからない場合はスキップ
    IF scenario_record.id IS NULL THEN
      RAISE NOTICE 'スキップ: シナリオ未登録 [% %]', event_record.date, event_record.scenario;
      CONTINUE;
    END IF;
    
    -- 現在の参加者数を取得
    current_participants_count := COALESCE(event_record.current_participants, 0);
    
    -- 既存のデモ参加者数を計算
    SELECT COALESCE(SUM(participant_count), 0)
    INTO demo_participants_count
    FROM reservations
    WHERE schedule_event_id = event_record.id
      AND (reservation_source = 'demo_auto' 
           OR participant_names IS NULL 
           OR participant_names = '{}');
    
    -- 実参加者数（デモを除く）
    real_participants_count := current_participants_count - demo_participants_count;
    
    -- シナリオの最大人数を超えている場合はスキップ
    IF real_participants_count >= scenario_record.player_count_max THEN
      RAISE NOTICE 'スキップ: 実参加者が最大人数に到達 [% %] (実%名/最大%名)', 
        event_record.date, event_record.scenario, real_participants_count, scenario_record.player_count_max;
      CONTINUE;
    END IF;
    
    -- 必要なデモ参加者数
    needed_demo_count := scenario_record.player_count_max - real_participants_count;
    
    -- 既にデモ参加者が適正な場合はスキップ
    IF demo_participants_count = needed_demo_count THEN
      RAISE NOTICE 'スキップ: デモ参加者適正 [% %] (%名)', 
        event_record.date, event_record.scenario, demo_participants_count;
      CONTINUE;
    END IF;
    
    -- 過剰なデモ参加者を削除
    IF demo_participants_count > needed_demo_count THEN
      DELETE FROM reservations
      WHERE id IN (
        SELECT id
        FROM reservations
        WHERE schedule_event_id = event_record.id
          AND (reservation_source = 'demo_auto' 
               OR participant_names IS NULL 
               OR participant_names = '{}')
        LIMIT (demo_participants_count - needed_demo_count)
      );
      
      RAISE NOTICE '削除: 過剰デモ [% %] (%名削除)', 
        event_record.date, event_record.scenario, (demo_participants_count - needed_demo_count);
      
      -- 削除のみで終了
      CONTINUE;
    END IF;
    
    -- 不足分のデモ参加者を追加
    needed_demo_count := needed_demo_count - demo_participants_count;
    
    -- 参加費を計算
    IF event_record.category = 'gmtest' THEN
      participation_fee_amount := COALESCE(scenario_record.gm_test_participation_fee, scenario_record.participation_fee, 0);
    ELSE
      participation_fee_amount := COALESCE(scenario_record.participation_fee, 0);
    END IF;
    
    -- 予約番号を生成
    new_reservation_number := TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
                              UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4));
    
    -- デモ参加者予約を挿入
    INSERT INTO reservations (
      schedule_event_id,
      reservation_number,
      title,
      scenario_id,
      store_id,
      customer_id,
      customer_notes,
      requested_datetime,
      duration,
      participant_count,
      participant_names,
      assigned_staff,
      base_price,
      options_price,
      total_price,
      discount_amount,
      final_price,
      payment_method,
      payment_status,
      status,
      reservation_source
    ) VALUES (
      event_record.id,
      new_reservation_number,
      event_record.scenario,
      scenario_record.id,
      event_record.store_id,
      demo_customer_id,
      'デモ参加者（自動追加） - ' || needed_demo_count || '名',
      event_record.date || 'T' || event_record.start_time || '+09:00',
      COALESCE(scenario_record.duration, 120),
      needed_demo_count,
      '{}',
      '{}',
      participation_fee_amount * needed_demo_count,
      0,
      participation_fee_amount * needed_demo_count,
      0,
      participation_fee_amount * needed_demo_count,
      'onsite',
      'paid',
      'confirmed',
      'demo_auto'
    );
    
    RAISE NOTICE '追加: [% %] (%名追加)', event_record.date, event_record.scenario, needed_demo_count;
    
  END LOOP;
  
  RAISE NOTICE '処理完了';
END $$;

