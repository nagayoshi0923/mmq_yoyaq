-- 他社公演料（他社がMMQに支払う金額）カラムを追加
-- マージン = external_license_amount - franchise_license_amount（計算で算出）

-- 1. scenariosテーブルに他社公演料カラムを追加（通常公演）
ALTER TABLE scenarios
ADD COLUMN IF NOT EXISTS external_license_amount INTEGER DEFAULT 0;

COMMENT ON COLUMN scenarios.external_license_amount IS '他社公演料：他社がMMQに支払う金額（円）。マージン = external_license_amount - franchise_license_amount';

-- 2. scenariosテーブルに他社GMテスト公演料カラムを追加
ALTER TABLE scenarios
ADD COLUMN IF NOT EXISTS external_gm_test_license_amount INTEGER DEFAULT 0;

COMMENT ON COLUMN scenarios.external_gm_test_license_amount IS '他社GMテスト公演料：他社がMMQに支払う金額（円）';

-- 確認クエリ
SELECT 
    column_name, 
    data_type, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'scenarios' 
  AND column_name LIKE '%license%'
ORDER BY column_name;

-- ライセンス料関連カラムの一覧と説明
/*
カラム名                              | 説明                                    | 設定する人
--------------------------------------|----------------------------------------|------------
license_amount                        | 自社公演：作者に支払うライセンス料      | MMQ
gm_test_license_amount                | 自社GMテスト：作者に支払うライセンス料  | MMQ
franchise_license_amount              | 他社公演：作者に支払うライセンス料 ★   | MMQ
franchise_gm_test_license_amount      | 他社GMテスト：作者に支払うライセンス料  | MMQ
external_license_amount               | 他社公演：他社がMMQに支払う金額         | MMQ（管理用）
external_gm_test_license_amount       | 他社GMテスト：他社がMMQに支払う金額     | MMQ（管理用）

★ = 作者に設定を見せる金額

運用例：
  external_license_amount = 5000      （他社がMMQに払う金額）
  franchise_license_amount = 3000     （作者への支払い）★ 作者レポートに表示
  → マージン = 5000 - 3000 = 2000     （MMQの取り分、計算で算出）

表示ルール：
  - 作者レポート → franchise_license_amount のみ
  - 管理画面 → 全て表示可能
*/
