-- シナリオテーブルに項目別設定のカラムを追加
-- 参加費、GM報酬、ライセンス報酬の項目別管理用

-- 既存のカラムを確認してから追加
-- 参加費（時間帯別）
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'scenarios' AND column_name = 'participation_costs') THEN
        ALTER TABLE scenarios ADD COLUMN participation_costs JSONB DEFAULT '[]';
    END IF;
END $$;

-- GM報酬（役割別）
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'scenarios' AND column_name = 'gm_assignments') THEN
        ALTER TABLE scenarios ADD COLUMN gm_assignments JSONB DEFAULT '[]';
    END IF;
END $$;

-- ライセンス報酬（時間帯別）
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'scenarios' AND column_name = 'license_rewards') THEN
        ALTER TABLE scenarios ADD COLUMN license_rewards JSONB DEFAULT '[]';
    END IF;
END $$;

-- 既存のカラムを非推奨として残す（後方互換性のため）
-- participation_fee, gm_fee, license_amount は保持
