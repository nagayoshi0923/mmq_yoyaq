-- album_character_records: アルバムの配役記録
-- 作成日: 2026-03-29
-- 概要: 顧客が各公演でどの役を担当したかを記録するテーブル

-- ============================================================
-- 1. album_character_records テーブル作成
-- ============================================================
CREATE TABLE IF NOT EXISTS public.album_character_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  reservation_id UUID UNIQUE REFERENCES public.reservations(id) ON DELETE CASCADE,
  manual_play_history_id UUID UNIQUE REFERENCES public.manual_play_history(id) ON DELETE CASCADE,
  character_id UUID REFERENCES public.scenario_characters(id) ON DELETE SET NULL,
  character_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT album_character_records_source_check CHECK (
    (reservation_id IS NOT NULL AND manual_play_history_id IS NULL) OR
    (reservation_id IS NULL AND manual_play_history_id IS NOT NULL)
  )
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_album_character_records_customer_id
  ON public.album_character_records(customer_id);
CREATE INDEX IF NOT EXISTS idx_album_character_records_reservation_id
  ON public.album_character_records(reservation_id);
CREATE INDEX IF NOT EXISTS idx_album_character_records_manual_id
  ON public.album_character_records(manual_play_history_id);

-- ============================================================
-- 2. RLS
-- ============================================================
ALTER TABLE public.album_character_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "album_character_records_select" ON public.album_character_records;
CREATE POLICY "album_character_records_select" ON public.album_character_records
  FOR SELECT
  USING (customer_id IN (
    SELECT id FROM public.customers WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "album_character_records_insert" ON public.album_character_records;
CREATE POLICY "album_character_records_insert" ON public.album_character_records
  FOR INSERT
  WITH CHECK (customer_id IN (
    SELECT id FROM public.customers WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "album_character_records_update" ON public.album_character_records;
CREATE POLICY "album_character_records_update" ON public.album_character_records
  FOR UPDATE
  USING (customer_id IN (
    SELECT id FROM public.customers WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "album_character_records_delete" ON public.album_character_records;
CREATE POLICY "album_character_records_delete" ON public.album_character_records
  FOR DELETE
  USING (customer_id IN (
    SELECT id FROM public.customers WHERE user_id = auth.uid()
  ));

-- ============================================================
-- 3. コメント
-- ============================================================
COMMENT ON TABLE public.album_character_records IS '顧客のアルバム配役記録（各公演でどの役を担当したか）';
COMMENT ON COLUMN public.album_character_records.reservation_id IS '予約ID（予約から来たプレイ）';
COMMENT ON COLUMN public.album_character_records.manual_play_history_id IS '手動プレイ履歴ID';
COMMENT ON COLUMN public.album_character_records.character_id IS 'シナリオキャラクターID（削除されたらNULL）';
COMMENT ON COLUMN public.album_character_records.character_name IS 'キャラクター名（非正規化・キャラ削除後も表示用）';

-- ============================================================
-- 完了メッセージ
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '✅ マイグレーション完了: album_character_records テーブルを作成しました';
END $$;
