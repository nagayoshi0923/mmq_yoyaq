-- =============================================================================
-- 20260313130000: 既存の貸切予約の reservation_source を修正
-- =============================================================================
-- 問題: 以前作成された貸切予約の reservation_source が NULL のため
--       マイページに表示されない
-- 修正: reservation_source = 'web_private' に更新
-- =============================================================================

-- 貸切予約の reservation_source を web_private に設定
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE reservations 
  SET reservation_source = 'web_private' 
  WHERE reservation_type = 'private' 
    AND (reservation_source IS NULL OR reservation_source = '');
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE '既存の貸切予約を % 件更新しました', updated_count;
END $$;
