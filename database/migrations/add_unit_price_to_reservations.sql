-- =====================================================
-- 予約テーブルに unit_price（1人あたり料金）を追加
-- 予約時点の料金を保持し、シナリオ料金変更の影響を受けないようにする
-- =====================================================

-- 1. unit_price カラムを追加
ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS unit_price INTEGER;

-- 2. 既存データを埋める
-- base_price / participant_count で予約時点の1人あたり料金を計算
-- participant_count が 0 の場合は NULL のまま
UPDATE reservations 
SET unit_price = CASE 
  WHEN participant_count > 0 THEN ROUND(base_price::numeric / participant_count)
  ELSE NULL
END
WHERE unit_price IS NULL;

-- 3. シナリオの participation_fee からも補完（base_priceが0または異常値の場合）
UPDATE reservations r
SET unit_price = s.participation_fee
FROM scenarios s
WHERE r.scenario_id = s.id
  AND r.unit_price IS NULL
  AND s.participation_fee IS NOT NULL;

-- 確認クエリ
-- SELECT id, participant_count, base_price, unit_price, final_price 
-- FROM reservations 
-- ORDER BY created_at DESC 
-- LIMIT 20;

COMMENT ON COLUMN reservations.unit_price IS '予約時点の1人あたり参加料金。人数変更時の再計算に使用。';

