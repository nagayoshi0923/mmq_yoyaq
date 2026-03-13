-- =============================================================================
-- 20260313140000: タイトルベースで貸切予約を更新
-- =============================================================================
-- reservation_type が設定されていない可能性があるため、
-- タイトルに「貸切希望」を含む予約を更新
-- =============================================================================

-- タイトルベースで貸切予約を更新
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE reservations 
  SET 
    reservation_source = 'web_private',
    reservation_type = 'private'
  WHERE title LIKE '%貸切希望%'
    AND (reservation_source IS NULL OR reservation_source = '' OR reservation_source != 'web_private');
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'タイトルベースで % 件の貸切予約を更新しました', updated_count;
END $$;
