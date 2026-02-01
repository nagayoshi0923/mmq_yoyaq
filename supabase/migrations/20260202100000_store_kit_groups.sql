-- 店舗のキットグループ機能を追加
-- 同じ住所にある店舗（例：森1と森2）をグループ化して、
-- キット移動の計算では同一店舗として扱う

-- stores テーブルに kit_group_id カラムを追加
-- 同じ kit_group_id を持つ店舗はキット管理上、同一拠点として扱う
ALTER TABLE stores 
ADD COLUMN IF NOT EXISTS kit_group_id UUID REFERENCES stores(id) ON DELETE SET NULL;

-- コメント
COMMENT ON COLUMN stores.kit_group_id IS 'キットグループの親店舗ID。同じ値を持つ店舗はキット移動計算で同一拠点として扱う';

-- インデックス
CREATE INDEX IF NOT EXISTS idx_stores_kit_group_id ON stores(kit_group_id);
