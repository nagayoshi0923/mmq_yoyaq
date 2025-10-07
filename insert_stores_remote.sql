-- リモートSupabase用店舗データ挿入スクリプト
-- SupabaseダッシュボードのSQL Editorで実行してください

-- 既存の店舗データを削除（重複を避けるため）
DELETE FROM stores;

-- 店舗データを挿入
INSERT INTO stores (
  id,
  name, 
  short_name, 
  address, 
  phone_number, 
  email, 
  opening_date, 
  manager_name, 
  status, 
  capacity, 
  rooms, 
  notes, 
  color
) VALUES
('store-001', '高田馬場店', '馬場', '東京都新宿区高田馬場1-1-1', '03-1234-5678', 'takadanobaba@mmq.com', '2020-04-01', '田中太郎', 'active', 24, 4, 'メイン店舗。初心者向けシナリオが充実。', '#3B82F6'),
('store-002', '別館①', '別館①', '東京都新宿区高田馬場1-2-1', '03-2345-6789', 'bekkan1@mmq.com', '2021-06-15', '山田花子', 'active', 18, 3, '中級者向けシナリオ中心。', '#10B981'),
('store-003', '別館②', '別館②', '東京都新宿区高田馬場1-3-1', '03-3456-7890', 'bekkan2@mmq.com', '2022-01-10', '佐藤次郎', 'active', 20, 3, '上級者向けシナリオ専門。', '#8B5CF6'),
('store-004', '大久保店', '大久保', '東京都新宿区大久保2-1-1', '03-4567-8901', 'okubo@mmq.com', '2022-08-20', '鈴木三郎', 'active', 16, 2, '新店舗。アットホームな雰囲気。', '#F97316'),
('store-005', '大塚店', '大塚', '東京都豊島区大塚3-1-1', '03-5678-9012', 'otsuka@mmq.com', '2023-03-01', '高橋四郎', 'temporarily_closed', 12, 2, 'リニューアル工事中。', '#EF4444'),
('store-006', '埼玉大宮店', '埼玉大宮', '埼玉県さいたま市大宮区大宮1-1-1', '048-1234-5678', 'omiya@mmq.com', '2023-10-15', '伊藤五郎', 'active', 30, 5, '最大規模店舗。大型イベント対応可能。', '#F59E0B');

-- 挿入結果を確認
SELECT '店舗データ挿入完了！' as message, COUNT(*) as stores_count FROM stores;
