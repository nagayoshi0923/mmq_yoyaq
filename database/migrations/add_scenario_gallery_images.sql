-- シナリオマスタに画像ギャラリーカラムを追加
-- 作成日: 2026-01-05
-- 概要: 複数画像をスライドで表示するための機能

-- ============================================================
-- 1. scenario_masters に gallery_images カラム追加
-- ============================================================
ALTER TABLE scenario_masters 
  ADD COLUMN IF NOT EXISTS gallery_images TEXT[] DEFAULT '{}';

-- コメント追加
COMMENT ON COLUMN scenario_masters.gallery_images IS 'ギャラリー画像のURL配列（スライド表示用）';

-- ============================================================
-- 2. scenariosテーブルにも追加（レガシー対応）
-- ============================================================
ALTER TABLE scenarios 
  ADD COLUMN IF NOT EXISTS gallery_images TEXT[] DEFAULT '{}';

COMMENT ON COLUMN scenarios.gallery_images IS 'ギャラリー画像のURL配列（スライド表示用）';

SELECT 'gallery_images column added successfully!' as result;

