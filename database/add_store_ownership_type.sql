-- storesテーブルに店舗タイプ（直営店/フランチャイズ）カラムを追加

-- ownership_type カラムを追加
ALTER TABLE stores
ADD COLUMN IF NOT EXISTS ownership_type TEXT CHECK (ownership_type IN ('corporate', 'franchise'));

COMMENT ON COLUMN stores.ownership_type IS '店舗タイプ: corporate（直営店）, franchise（フランチャイズ）';

-- 既存の店舗にデフォルト値を設定（全て直営店として設定）
UPDATE stores
SET ownership_type = 'corporate'
WHERE ownership_type IS NULL;

-- 確認
SELECT 
  name,
  short_name,
  CASE 
    WHEN ownership_type = 'corporate' THEN '直営店'
    WHEN ownership_type = 'franchise' THEN 'フランチャイズ'
    ELSE '未設定'
  END as 店舗タイプ,
  status
FROM stores
ORDER BY name;

-- 例: 特定店舗をフランチャイズに設定
-- UPDATE stores
-- SET ownership_type = 'franchise'
-- WHERE name = '埼玉大宮店';

