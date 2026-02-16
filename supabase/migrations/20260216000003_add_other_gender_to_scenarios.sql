-- シナリオに「その他/不明」カラムを追加
-- 男女比に加えて、性別不問・その他の人数も設定可能に

ALTER TABLE scenarios
ADD COLUMN IF NOT EXISTS other_count INTEGER DEFAULT NULL;

-- コメントを追加
COMMENT ON COLUMN scenarios.other_count IS 'その他/性別不問プレイヤー数（NULLの場合は設定なし）';
