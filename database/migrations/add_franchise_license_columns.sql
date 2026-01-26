-- フランチャイズ公演時の金額設定用カラムを追加
-- 他店公演時とフランチャイズ公演時を分けて設定できるようにする

-- scenariosテーブル
ALTER TABLE scenarios 
ADD COLUMN IF NOT EXISTS fc_receive_license_amount INTEGER,
ADD COLUMN IF NOT EXISTS fc_receive_gm_test_license_amount INTEGER,
ADD COLUMN IF NOT EXISTS fc_author_license_amount INTEGER,
ADD COLUMN IF NOT EXISTS fc_author_gm_test_license_amount INTEGER;

-- organization_scenariosテーブル
ALTER TABLE organization_scenarios 
ADD COLUMN IF NOT EXISTS fc_receive_license_amount INTEGER,
ADD COLUMN IF NOT EXISTS fc_receive_gm_test_license_amount INTEGER,
ADD COLUMN IF NOT EXISTS fc_author_license_amount INTEGER,
ADD COLUMN IF NOT EXISTS fc_author_gm_test_license_amount INTEGER;

-- コメント追加
COMMENT ON COLUMN scenarios.fc_receive_license_amount IS 'フランチャイズ公演時：フランチャイズから受け取る金額（通常）';
COMMENT ON COLUMN scenarios.fc_receive_gm_test_license_amount IS 'フランチャイズ公演時：フランチャイズから受け取る金額（GMテスト）';
COMMENT ON COLUMN scenarios.fc_author_license_amount IS 'フランチャイズ公演時：作者に支払う金額（通常）';
COMMENT ON COLUMN scenarios.fc_author_gm_test_license_amount IS 'フランチャイズ公演時：作者に支払う金額（GMテスト）';

COMMENT ON COLUMN organization_scenarios.fc_receive_license_amount IS 'フランチャイズ公演時：フランチャイズから受け取る金額（通常）';
COMMENT ON COLUMN organization_scenarios.fc_receive_gm_test_license_amount IS 'フランチャイズ公演時：フランチャイズから受け取る金額（GMテスト）';
COMMENT ON COLUMN organization_scenarios.fc_author_license_amount IS 'フランチャイズ公演時：作者に支払う金額（通常）';
COMMENT ON COLUMN organization_scenarios.fc_author_gm_test_license_amount IS 'フランチャイズ公演時：作者に支払う金額（GMテスト）';

