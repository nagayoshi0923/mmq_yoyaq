-- =============================================================================
-- 費用メモ（Discord経費メモ）— miscellaneous_transactions に記録元/立替者/確認状態を追加
-- =============================================================================
-- 背景:
-- ・Discord の #経費メモ チャンネルに投げた費用メモ（テキスト/レシート画像）を
--   解析して miscellaneous_transactions に取り込む（C2 で Edge Function を追加）。
-- ・新規テーブルは作らない。既存の収支調整エントリと同じ表に入れることで、
--   売上管理の変動費・粗利にそのまま反映される。
-- ・オーナー指示: 個人立替と会社払いを区別する必要がある。
--
-- 追加カラム:
--   payer           会社払い / 個人立替 の区分
--   payer_staff_id  個人立替のときの立替者（誰に精算するかが分からないと運用できない）
--   source          手入力 / Discord経由 の記録元
--   review_status   confirmed=確定 / pending=要確認（AI解析結果は誤読があり得る）
--   source_ref      Discord メッセージID。二重取り込み防止 + 元投稿への追跡用
--
-- 既定値の設計:
-- ・payer='company' / source='manual' / review_status='confirmed' を既定にすることで、
--   既存行と管理画面からの手入力の挙動は一切変わらない（後方互換）。
-- ・Discord 経由の行だけが source='discord' / review_status='pending' で入る。
--
-- ⚠️ 順序の注意:
--   review_status='pending' の行も既存の集計クエリからは見えてしまうため、
--   C2（Discord取り込み）を入れる前に、売上集計側で pending を除外すること。
--   このマイグレーション単体では既定値が confirmed のみのため影響はない。
--
-- RLS / GRANT は既存（20260704100539 で org 境界封鎖 + GRANT 最小化済み）を
-- そのまま踏襲する。本 migration はカラム/制約/インデックスのみで権限は変更しない。
--
-- 冪等: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS + 制約は事前 DROP で再実行安全。
-- =============================================================================

ALTER TABLE public.miscellaneous_transactions
  ADD COLUMN IF NOT EXISTS payer text NOT NULL DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS payer_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS source_ref text;

-- 値の制約（再実行安全にするため DROP してから ADD）
ALTER TABLE public.miscellaneous_transactions
  DROP CONSTRAINT IF EXISTS misc_transactions_payer_check;
ALTER TABLE public.miscellaneous_transactions
  ADD CONSTRAINT misc_transactions_payer_check
  CHECK (payer IN ('company', 'personal'));

ALTER TABLE public.miscellaneous_transactions
  DROP CONSTRAINT IF EXISTS misc_transactions_source_check;
ALTER TABLE public.miscellaneous_transactions
  ADD CONSTRAINT misc_transactions_source_check
  CHECK (source IN ('manual', 'discord'));

ALTER TABLE public.miscellaneous_transactions
  DROP CONSTRAINT IF EXISTS misc_transactions_review_status_check;
ALTER TABLE public.miscellaneous_transactions
  ADD CONSTRAINT misc_transactions_review_status_check
  CHECK (review_status IN ('confirmed', 'pending'));

-- 同じ Discord メッセージから二重に取り込まないための一意制約
-- （source_ref が NULL の手入力行は対象外にするため部分インデックス）
CREATE UNIQUE INDEX IF NOT EXISTS idx_misc_transactions_source_ref_unique
  ON public.miscellaneous_transactions(source_ref)
  WHERE source_ref IS NOT NULL;

-- 要確認キューの一覧用（pending は常に少数なので部分インデックス）
CREATE INDEX IF NOT EXISTS idx_misc_transactions_pending
  ON public.miscellaneous_transactions(organization_id, date)
  WHERE review_status = 'pending';

-- 個人立替の精算対象を引くため
CREATE INDEX IF NOT EXISTS idx_misc_transactions_payer_staff
  ON public.miscellaneous_transactions(payer_staff_id)
  WHERE payer_staff_id IS NOT NULL;

COMMENT ON COLUMN public.miscellaneous_transactions.payer IS
  '支払い元: company=会社払い / personal=個人立替（既定 company）';
COMMENT ON COLUMN public.miscellaneous_transactions.payer_staff_id IS
  '個人立替のときの立替者。payer=personal のときに設定する（精算先の特定用）';
COMMENT ON COLUMN public.miscellaneous_transactions.source IS
  '記録元: manual=管理画面の手入力 / discord=#経費メモ からの自動取り込み（既定 manual）';
COMMENT ON COLUMN public.miscellaneous_transactions.review_status IS
  'confirmed=確定（集計に反映）/ pending=要確認（AI解析直後・承認待ち）。既定 confirmed';
COMMENT ON COLUMN public.miscellaneous_transactions.source_ref IS
  'Discord メッセージID。二重取り込み防止の一意キー兼、元投稿への追跡用';
