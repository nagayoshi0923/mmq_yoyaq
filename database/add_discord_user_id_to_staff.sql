-- staffテーブルにdiscord_user_idカラムを追加

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'staff' 
    AND column_name = 'discord_user_id'
  ) THEN
    ALTER TABLE staff
    ADD COLUMN discord_user_id TEXT;
    
    CREATE INDEX IF NOT EXISTS idx_staff_discord_user_id ON staff(discord_user_id);
    
    RAISE NOTICE 'Column discord_user_id added to staff table.';
  ELSE
    RAISE NOTICE 'Column discord_user_id already exists in staff table.';
  END IF;
END $$;

-- 確認クエリ
SELECT column_name, data_type 
FROM information_schema.columns
WHERE table_name = 'staff' AND column_name = 'discord_user_id';

