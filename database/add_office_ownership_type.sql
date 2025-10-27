-- ownership_typeにofficeを追加

-- 既存のCHECK制約を削除
ALTER TABLE stores
DROP CONSTRAINT IF EXISTS stores_ownership_type_check;

-- 新しいCHECK制約を追加（corporate, franchise, office）
ALTER TABLE stores
ADD CONSTRAINT stores_ownership_type_check
CHECK (ownership_type IN ('corporate', 'franchise', 'office'));

COMMENT ON COLUMN stores.ownership_type IS '店舗の所有形態（直営店 or フランチャイズ or オフィス）';

-- 確認クエリ
SELECT id, name, ownership_type 
FROM stores 
ORDER BY 
  CASE ownership_type
    WHEN 'corporate' THEN 1
    WHEN 'office' THEN 2
    WHEN 'franchise' THEN 3
    ELSE 4
  END,
  name;

