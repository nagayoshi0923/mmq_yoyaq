-- ========================================
-- 予約番号形式の一括更新スクリプト
-- ========================================
-- 目的: 既存の長い予約番号 (YYYYMMDD-...) を短い形式 (YYMMDD-XXXX) に変換する
-- 対象: 全ての予約レコード

DO $$
DECLARE
  r RECORD;
  new_number TEXT;
  original_date_part TEXT;
  original_random_part TEXT;
  retry_count INTEGER;
  updated_count INTEGER := 0;
BEGIN
  RAISE NOTICE '予約番号の更新を開始します...';

  FOR r IN SELECT id, reservation_number, created_at FROM reservations WHERE LENGTH(reservation_number) > 11 LOOP
    -- 日付部分の抽出 (作成日から YYMMDD を生成)
    original_date_part := TO_CHAR(r.created_at, 'YYMMDD');
    
    -- ランダム部分の生成 (元の番号から流用、または新規生成)
    -- 元の番号がハイフンを含んでいる場合
    IF r.reservation_number LIKE '%-%' THEN
      -- ハイフン以降を取得
      original_random_part := SPLIT_PART(r.reservation_number, '-', 2);
      -- PVが含まれていれば除去
      IF original_random_part LIKE 'PV%' THEN
        original_random_part := SUBSTRING(original_random_part FROM 3);
      END IF;
      -- 4桁に切り詰め、足りなければパディング、またはランダム生成
      IF LENGTH(original_random_part) >= 4 THEN
        original_random_part := SUBSTRING(original_random_part FROM 1 FOR 4);
      ELSE
        -- ランダム生成 (英数字4桁)
        original_random_part := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4));
      END IF;
    ELSE
      -- ハイフンがない場合、完全ランダム生成
      original_random_part := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4));
    END IF;

    -- 新しい番号の候補
    new_number := original_date_part || '-' || original_random_part;

    -- 重複チェックとリトライループ
    retry_count := 0;
    LOOP
      BEGIN
        UPDATE reservations
        SET reservation_number = new_number
        WHERE id = r.id;
        
        updated_count := updated_count + 1;
        EXIT; -- 成功したらループを抜ける
      EXCEPTION WHEN unique_violation THEN
        -- 重複エラーが発生した場合、ランダム部分を再生成してリトライ
        retry_count := retry_count + 1;
        IF retry_count > 10 THEN
          RAISE WARNING '予約ID % の更新に失敗しました (リトライ回数超過)', r.id;
          EXIT;
        END IF;
        -- 新しいランダム4桁を生成
        original_random_part := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 4));
        new_number := original_date_part || '-' || original_random_part;
      END;
    END LOOP;
  END LOOP;

  RAISE NOTICE '処理完了: % 件の予約番号を更新しました。', updated_count;
END $$;

