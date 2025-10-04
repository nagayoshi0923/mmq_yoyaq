-- スタッフテーブルにアバター画像カラムを追加
ALTER TABLE staff ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- アバター背景色カラムを追加（未設定時のデフォルト色用）
ALTER TABLE staff ADD COLUMN IF NOT EXISTS avatar_color TEXT DEFAULT '#3B82F6';

