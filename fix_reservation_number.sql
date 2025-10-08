-- reservation_numberカラムにデフォルト値を設定、またはNULL許可にする

-- オプション1: NULL許可にする（推奨）
ALTER TABLE reservations 
ALTER COLUMN reservation_number DROP NOT NULL;

-- オプション2: もしくは、自動生成の関数を作成してデフォルト値を設定
-- まず、予約番号を自動生成する関数を作成
CREATE OR REPLACE FUNCTION generate_reservation_number()
RETURNS TEXT AS $$
DECLARE
  new_number TEXT;
  max_number INTEGER;
BEGIN
  -- 今日の日付をYYYYMMDD形式で取得
  SELECT COALESCE(MAX(CAST(SUBSTRING(reservation_number FROM 10) AS INTEGER)), 0) + 1
  INTO max_number
  FROM reservations
  WHERE reservation_number LIKE TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '%';
  
  -- 予約番号を生成 (例: 20250608-001)
  new_number := TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(max_number::TEXT, 3, '0');
  
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- デフォルト値として関数を設定
ALTER TABLE reservations 
ALTER COLUMN reservation_number SET DEFAULT generate_reservation_number();

