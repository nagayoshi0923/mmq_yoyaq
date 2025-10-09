-- GM出勤可否確認テーブル

CREATE TABLE IF NOT EXISTS gm_availability_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reservation_id UUID REFERENCES reservations(id) ON DELETE CASCADE NOT NULL,
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE NOT NULL,
  response_status TEXT CHECK (response_status IN ('available', 'all_unavailable', 'pending')) DEFAULT 'pending',
  available_candidates JSONB, -- 出勤可能な候補のリスト [1, 3] など
  confirmed_candidate INTEGER, -- 確定した候補番号（店側が決定後に設定）
  responded_at TIMESTAMPTZ,
  notes TEXT,
  notified_at TIMESTAMPTZ, -- 通知送信日時
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(reservation_id, staff_id) -- 1つのリクエストに対して1GMは1回のみ回答
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_gm_responses_reservation ON gm_availability_responses(reservation_id);
CREATE INDEX IF NOT EXISTS idx_gm_responses_staff ON gm_availability_responses(staff_id);
CREATE INDEX IF NOT EXISTS idx_gm_responses_status ON gm_availability_responses(response_status);

-- コメント追加
COMMENT ON TABLE gm_availability_responses IS 'GM出勤可否確認の回答を管理';
COMMENT ON COLUMN gm_availability_responses.available_candidates IS '出勤可能な候補番号のリスト（例: [1, 3]）';
COMMENT ON COLUMN gm_availability_responses.confirmed_candidate IS '店側が確定した候補番号（1つのみ）';
COMMENT ON COLUMN gm_availability_responses.response_status IS 'available=1つ以上可能, all_unavailable=すべて不可, pending=未回答';
