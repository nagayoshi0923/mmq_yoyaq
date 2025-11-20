-- シナリオテーブルに公演可能店舗カラムを追加
-- シナリオごとに公演可能な店舗IDの配列を設定できるようにする

DO $$ 
BEGIN
    -- available_stores カラムを追加（UUID配列）
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'scenarios' AND column_name = 'available_stores'
    ) THEN
        ALTER TABLE scenarios ADD COLUMN available_stores UUID[] DEFAULT '{}';
        COMMENT ON COLUMN scenarios.available_stores IS 'このシナリオを公演可能な店舗IDの配列。空の場合は全店舗で公演可能';
    END IF;
END $$;

