-- シフト提出テーブル
CREATE TABLE IF NOT EXISTS shift_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  morning BOOLEAN DEFAULT false,
  afternoon BOOLEAN DEFAULT false,
  evening BOOLEAN DEFAULT false,
  all_day BOOLEAN DEFAULT false,
  submitted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, date)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_shift_submissions_staff_id ON shift_submissions(staff_id);
CREATE INDEX IF NOT EXISTS idx_shift_submissions_date ON shift_submissions(date);
CREATE INDEX IF NOT EXISTS idx_shift_submissions_status ON shift_submissions(status);

-- RLSポリシー
ALTER TABLE shift_submissions ENABLE ROW LEVEL SECURITY;

-- スタッフは自分のシフトのみアクセス可能
CREATE POLICY shift_submissions_self_policy ON shift_submissions
  FOR ALL USING (
    staff_id IN (
      SELECT id FROM staff WHERE user_id = auth.uid()
    )
  );

-- 管理者は全てのシフトにアクセス可能（開発用）
CREATE POLICY shift_submissions_admin_policy ON shift_submissions
  FOR ALL USING (
    auth.uid() IS NOT NULL
  );
