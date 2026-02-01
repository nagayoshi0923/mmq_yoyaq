-- 店舗の表示順序を管理するカラムを追加
ALTER TABLE stores ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 999;

-- 既存店舗にデフォルトの表示順序を設定
-- 馬場 → 別館① → 別館② → 大久保 → 大塚 → 埼玉大宮
UPDATE stores SET display_order = 1 WHERE short_name = '馬場' OR name LIKE '%馬場%';
UPDATE stores SET display_order = 2 WHERE short_name = '別館①' OR name LIKE '%フォレスト①%';
UPDATE stores SET display_order = 3 WHERE short_name = '別館②' OR name LIKE '%フォレスト②%';
UPDATE stores SET display_order = 4 WHERE short_name = '大久保' OR name LIKE '%大久保%';
UPDATE stores SET display_order = 5 WHERE short_name = '大塚' OR name LIKE '%大塚%';
UPDATE stores SET display_order = 6 WHERE short_name = '埼玉大宮' OR name LIKE '%埼玉大宮%';

-- 臨時会場は最後に表示（900番台）
UPDATE stores SET display_order = 901 WHERE short_name = '臨時1' OR name = '臨時会場1';
UPDATE stores SET display_order = 902 WHERE short_name = '臨時2' OR name = '臨時会場2';
UPDATE stores SET display_order = 903 WHERE short_name = '臨時3' OR name = '臨時会場3';
UPDATE stores SET display_order = 904 WHERE short_name = '臨時4' OR name = '臨時会場4';
UPDATE stores SET display_order = 905 WHERE short_name = '臨時5' OR name = '臨時会場5';

-- オフィスは表示しないが、念のため順序設定
UPDATE stores SET display_order = 999 WHERE ownership_type = 'office';

-- インデックス追加（並び替えパフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_stores_display_order ON stores(display_order);








