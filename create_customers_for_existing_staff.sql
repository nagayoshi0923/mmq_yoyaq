-- ========================================
-- 既存スタッフ用の顧客レコード作成スクリプト
-- ========================================
-- 目的: スタッフも「顧客」として扱えるようにし、予約履歴などを紐付けられるようにする
-- 対象: customersテーブルにレコードがない既存スタッフ

DO $$
DECLARE
  staff_rec RECORD;
  customer_id UUID;
  existing_customer_id UUID;
BEGIN
  RAISE NOTICE 'スタッフの顧客レコード作成を開始します...';

  -- user_idを持つ全てのスタッフをループ
  FOR staff_rec IN 
    SELECT s.id, s.user_id, s.name, s.email 
    FROM staff s 
    WHERE s.user_id IS NOT NULL
  LOOP
    -- 1. user_idで既に顧客レコードが存在するか確認
    SELECT id INTO existing_customer_id
    FROM customers
    WHERE user_id = staff_rec.user_id;

    IF existing_customer_id IS NOT NULL THEN
      RAISE NOTICE 'スタッフ % (ID: %) は既に顧客レコード (ID: %) を持っています。スキップします。', staff_rec.name, staff_rec.id, existing_customer_id;
      CONTINUE;
    END IF;

    -- 2. emailで顧客レコードが存在するか確認（紐付けのみ行う）
    SELECT id INTO existing_customer_id
    FROM customers
    WHERE email = staff_rec.email;

    IF existing_customer_id IS NOT NULL THEN
      -- 既存の顧客レコードにuser_idを紐付け
      UPDATE customers
      SET user_id = staff_rec.user_id,
          updated_at = NOW()
      WHERE id = existing_customer_id;
      
      RAISE NOTICE 'スタッフ % (ID: %) の既存顧客レコード (ID: %) にuser_idを紐付けました。', staff_rec.name, staff_rec.id, existing_customer_id;
    ELSE
      -- 3. 新規顧客レコードを作成
      INSERT INTO customers (
        user_id,
        name,
        email,
        visit_count,
        total_spent,
        created_at,
        updated_at
      ) VALUES (
        staff_rec.user_id,
        staff_rec.name,
        staff_rec.email,
        0,
        0,
        NOW(),
        NOW()
      )
      RETURNING id INTO customer_id;
      
      RAISE NOTICE 'スタッフ % (ID: %) 用の新規顧客レコード (ID: %) を作成しました。', staff_rec.name, staff_rec.id, customer_id;
    END IF;
  END LOOP;

  RAISE NOTICE '処理が完了しました。';
END $$;

