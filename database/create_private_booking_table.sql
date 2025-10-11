-- 貸切リクエストテーブル作成
-- このテーブルは顧客からの貸切リクエストを管理します

CREATE TABLE IF NOT EXISTS private_booking_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- シナリオ情報
  scenario_id UUID REFERENCES scenarios(id) ON DELETE RESTRICT,
  scenario_title TEXT NOT NULL,
  
  -- 顧客情報
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  
  -- リクエスト内容
  preferred_dates TIMESTAMPTZ[] NOT NULL, -- 希望日時の配列
  preferred_stores UUID[] NOT NULL, -- 希望店舗IDの配列
  participant_count INTEGER NOT NULL CHECK (participant_count > 0),
  notes TEXT, -- 顧客からのメモ・要望
  
  -- ステータス管理
  status TEXT NOT NULL DEFAULT 'pending_gm' CHECK (
    status IN ('pending_gm', 'pending_store', 'approved', 'rejected')
  ),
  -- pending_gm: GM確認待ち
  -- pending_store: 店舗確認待ち（GMが対応可能と回答済み）
  -- approved: 承認済み
  -- rejected: 却下
  
  -- GM回答情報（JSONB配列）
  gm_responses JSONB DEFAULT '[]',
  -- 例: [{"gm_id": "uuid", "gm_name": "田中太郎", "available": true, "preferred_date": "2025-10-15T10:00:00Z", "notes": "午前中希望"}]
  
  -- 店舗側の対応
  rejection_reason TEXT, -- 却下理由
  approved_date TIMESTAMPTZ, -- 承認日時
  approved_store_id UUID REFERENCES stores(id) ON DELETE SET NULL, -- 承認された店舗
  
  -- タイムスタンプ
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_private_booking_status ON private_booking_requests(status);
CREATE INDEX IF NOT EXISTS idx_private_booking_scenario ON private_booking_requests(scenario_id);
CREATE INDEX IF NOT EXISTS idx_private_booking_created ON private_booking_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_private_booking_email ON private_booking_requests(customer_email);

-- RLS (Row Level Security) 有効化
ALTER TABLE private_booking_requests ENABLE ROW LEVEL SECURITY;

-- 管理者・スタッフは全てのリクエストにアクセス可能
CREATE POLICY private_booking_admin_staff_policy ON private_booking_requests
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role IN ('admin', 'staff')
    )
  );

-- 顧客は自分のリクエストのみ閲覧可能（メールアドレスで識別）
CREATE POLICY private_booking_customer_policy ON private_booking_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.email = customer_email
    )
  );

-- updated_at自動更新トリガー
CREATE TRIGGER update_private_booking_updated_at
  BEFORE UPDATE ON private_booking_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- コメント追加
COMMENT ON TABLE private_booking_requests IS '貸切リクエスト管理テーブル';
COMMENT ON COLUMN private_booking_requests.status IS 'リクエストのステータス: pending_gm(GM確認待ち), pending_store(店舗確認待ち), approved(承認済み), rejected(却下)';
COMMENT ON COLUMN private_booking_requests.gm_responses IS 'GM回答情報のJSON配列';

