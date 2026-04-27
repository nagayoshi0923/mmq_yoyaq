-- 臨時馬場3号店（クインズワルツ臨時馬場3号店）の business_hours_settings を挿入
-- 他の馬場系店舗と同じデフォルト営業時間を設定

DO $$
DECLARE
  v_store_id UUID;
  v_org_id UUID;
BEGIN
  -- 店舗IDを取得
  SELECT id, organization_id INTO v_store_id, v_org_id
  FROM stores
  WHERE name = 'クインズワルツ臨時馬場3号店'
  LIMIT 1;

  IF v_store_id IS NULL THEN
    RAISE NOTICE '⚠️ クインズワルツ臨時馬場3号店 が見つかりませんでした。スキップします。';
    RETURN;
  END IF;

  -- 既存行があればスキップ、なければ挿入
  IF EXISTS (SELECT 1 FROM business_hours_settings WHERE store_id = v_store_id) THEN
    RAISE NOTICE '✅ クインズワルツ臨時馬場3号店 の business_hours_settings は既に存在します。スキップします。';
    RETURN;
  END IF;

  INSERT INTO business_hours_settings (
    store_id,
    organization_id,
    opening_hours,
    holidays,
    special_open_days,
    special_closed_days
  ) VALUES (
    v_store_id,
    v_org_id,
    '{
      "monday":    {"is_open": true, "open_time": "10:00", "close_time": "23:00", "available_slots": ["morning", "afternoon", "evening"], "slot_start_times": {"morning": "10:00", "afternoon": "13:00", "evening": "19:00"}},
      "tuesday":   {"is_open": true, "open_time": "10:00", "close_time": "23:00", "available_slots": ["morning", "afternoon", "evening"], "slot_start_times": {"morning": "10:00", "afternoon": "13:00", "evening": "19:00"}},
      "wednesday": {"is_open": true, "open_time": "10:00", "close_time": "23:00", "available_slots": ["morning", "afternoon", "evening"], "slot_start_times": {"morning": "10:00", "afternoon": "13:00", "evening": "19:00"}},
      "thursday":  {"is_open": true, "open_time": "10:00", "close_time": "23:00", "available_slots": ["morning", "afternoon", "evening"], "slot_start_times": {"morning": "10:00", "afternoon": "13:00", "evening": "19:00"}},
      "friday":    {"is_open": true, "open_time": "10:00", "close_time": "23:00", "available_slots": ["morning", "afternoon", "evening"], "slot_start_times": {"morning": "10:00", "afternoon": "13:00", "evening": "19:00"}},
      "saturday":  {"is_open": true, "open_time": "09:00", "close_time": "23:00", "available_slots": ["morning", "afternoon", "evening"], "slot_start_times": {"morning": "09:00", "afternoon": "14:00", "evening": "19:00"}},
      "sunday":    {"is_open": true, "open_time": "09:00", "close_time": "23:00", "available_slots": ["morning", "afternoon", "evening"], "slot_start_times": {"morning": "09:00", "afternoon": "14:00", "evening": "19:00"}}
    }'::jsonb,
    '{}'::text[],
    '[]'::jsonb,
    '[]'::jsonb
  );

  RAISE NOTICE '✅ クインズワルツ臨時馬場3号店 の business_hours_settings を挿入しました (store_id: %)', v_store_id;
END $$;
