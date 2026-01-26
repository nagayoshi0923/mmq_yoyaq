-- storesテーブルに交通費設定カラムを追加
-- 作成日: 2026-01-26
-- 概要: 担当店舗以外のスタッフがこの店舗で働く場合に加算される交通費を設定

-- transport_allowance カラムを追加（INTEGER型）
-- 担当店舗に設定していないスタッフがこの店舗で働く場合に報酬に加算される金額
ALTER TABLE stores
ADD COLUMN IF NOT EXISTS transport_allowance INTEGER;

-- コメント追加
COMMENT ON COLUMN stores.transport_allowance IS '交通費（担当店舗以外のスタッフが出勤した場合に加算される金額）';

-- 確認
SELECT 'transport_allowance column added to stores successfully!' as result;

