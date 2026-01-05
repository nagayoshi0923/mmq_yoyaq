-- シナリオキャラクターテーブル追加
-- 作成日: 2026-01-05
-- 概要: シナリオマスタに紐づくキャラクター情報（訴求画像含む）を管理

-- ============================================================
-- 1. scenario_characters テーブル作成
-- ============================================================
CREATE TABLE IF NOT EXISTS public.scenario_characters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scenario_master_id UUID NOT NULL REFERENCES public.scenario_masters(id) ON DELETE CASCADE,
  
  -- キャラクター情報
  name TEXT NOT NULL,                -- キャラクター名
  description TEXT,                   -- キャラクター説明（ネタバレなし）
  image_url TEXT,                     -- 訴求画像URL
  
  -- 表示設定
  sort_order INTEGER NOT NULL DEFAULT 0,  -- 表示順
  is_visible BOOLEAN NOT NULL DEFAULT true, -- 表示フラグ
  
  -- メタ情報
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_scenario_characters_master_id 
  ON public.scenario_characters(scenario_master_id);

CREATE INDEX IF NOT EXISTS idx_scenario_characters_sort 
  ON public.scenario_characters(scenario_master_id, sort_order);

-- updated_atトリガー
CREATE OR REPLACE FUNCTION update_scenario_characters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_scenario_characters_updated_at ON public.scenario_characters;
CREATE TRIGGER trigger_scenario_characters_updated_at
  BEFORE UPDATE ON public.scenario_characters
  FOR EACH ROW
  EXECUTE FUNCTION update_scenario_characters_updated_at();

-- ============================================================
-- 2. RLS ポリシー
-- ============================================================
ALTER TABLE public.scenario_characters ENABLE ROW LEVEL SECURITY;

-- 全員が読み取り可能（公開情報）
CREATE POLICY "scenario_characters_select_all" ON public.scenario_characters
  FOR SELECT
  USING (true);

-- スタッフ・管理者のみ作成・更新・削除可能
CREATE POLICY "scenario_characters_insert_staff" ON public.scenario_characters
  FOR INSERT
  WITH CHECK (is_staff_or_admin());

CREATE POLICY "scenario_characters_update_staff" ON public.scenario_characters
  FOR UPDATE
  USING (is_staff_or_admin());

CREATE POLICY "scenario_characters_delete_staff" ON public.scenario_characters
  FOR DELETE
  USING (is_staff_or_admin());

-- ============================================================
-- 3. コメント
-- ============================================================
COMMENT ON TABLE public.scenario_characters IS 'シナリオキャラクター情報（訴求用）';
COMMENT ON COLUMN public.scenario_characters.name IS 'キャラクター名';
COMMENT ON COLUMN public.scenario_characters.description IS 'キャラクター説明（ネタバレなし）';
COMMENT ON COLUMN public.scenario_characters.image_url IS '訴求画像URL';
COMMENT ON COLUMN public.scenario_characters.sort_order IS '表示順（小さい順）';
COMMENT ON COLUMN public.scenario_characters.is_visible IS '表示するかどうか';

-- ============================================================
-- 完了メッセージ
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE 'scenario_characters テーブルが正常に作成されました';
END $$;

