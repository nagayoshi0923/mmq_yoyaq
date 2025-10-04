-- avatar_colorのデフォルト値を削除して、NULLを許可
ALTER TABLE staff ALTER COLUMN avatar_color DROP DEFAULT;
ALTER TABLE staff ALTER COLUMN avatar_color DROP NOT NULL;

-- 既存のデフォルト値(#3B82F6)をNULLに更新
UPDATE staff SET avatar_color = NULL WHERE avatar_color = '#3B82F6';
