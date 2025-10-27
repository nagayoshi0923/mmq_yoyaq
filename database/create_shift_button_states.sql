-- シフトボタンの状態を保存するテーブル

CREATE TABLE IF NOT EXISTS shift_button_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE NOT NULL,
  notification_id UUID REFERENCES shift_notifications(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  time_slot TEXT NOT NULL CHECK (time_slot IN ('morning', 'afternoon', 'evening', 'allday')),
  is_selected BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(staff_id, date, time_slot)
);

CREATE INDEX IF NOT EXISTS idx_shift_button_states_staff_id ON shift_button_states(staff_id);
CREATE INDEX IF NOT EXISTS idx_shift_button_states_date ON shift_button_states(date);
CREATE INDEX IF NOT EXISTS idx_shift_button_states_notification_id ON shift_button_states(notification_id);

-- RLS有効化
ALTER TABLE shift_button_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authenticated users" ON shift_button_states
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON shift_button_states
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON shift_button_states
  FOR UPDATE USING (auth.role() = 'authenticated');

-- 確認クエリ
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'shift_button_states'
ORDER BY ordinal_position;

