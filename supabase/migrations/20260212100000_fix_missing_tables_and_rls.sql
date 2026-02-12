-- ==========================================================
-- 1. schedule_event_history: RLSポリシーを追加
--    テーブルは存在するがポリシーが未定義のため全操作が拒否されている
-- ==========================================================

-- 既存ポリシーを削除（冪等性のため）
DROP POLICY IF EXISTS "schedule_event_history_select_policy" ON public.schedule_event_history;
DROP POLICY IF EXISTS "schedule_event_history_insert_policy" ON public.schedule_event_history;
DROP POLICY IF EXISTS "schedule_event_history_update_policy" ON public.schedule_event_history;
DROP POLICY IF EXISTS "schedule_event_history_delete_policy" ON public.schedule_event_history;

-- 閲覧: 同じ組織のスタッフのみ
CREATE POLICY "schedule_event_history_select_policy" ON public.schedule_event_history
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

-- 挿入: 認証済みユーザー（同じ組織のスタッフ）
CREATE POLICY "schedule_event_history_insert_policy" ON public.schedule_event_history
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

-- 更新: 同じ組織のスタッフのみ
CREATE POLICY "schedule_event_history_update_policy" ON public.schedule_event_history
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

-- 削除: 管理者のみ
CREATE POLICY "schedule_event_history_delete_policy" ON public.schedule_event_history
  FOR DELETE USING (
    is_admin()
  );


-- ==========================================================
-- 2. scenario_characters: テーブル修復
--    テーブルは存在するが scenario_master_id カラムが欠落している可能性
-- ==========================================================

DO $$
BEGIN
  -- テーブルが存在しない場合は作成
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'scenario_characters'
  ) THEN
    CREATE TABLE public.scenario_characters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      scenario_master_id UUID NOT NULL REFERENCES public.scenario_masters(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_visible BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    RAISE NOTICE 'scenario_characters テーブルを新規作成しました';
  ELSE
    -- テーブルは存在するがカラムが不足している場合は追加
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'scenario_characters' AND column_name = 'scenario_master_id'
    ) THEN
      ALTER TABLE public.scenario_characters ADD COLUMN scenario_master_id UUID REFERENCES public.scenario_masters(id) ON DELETE CASCADE;
      RAISE NOTICE 'scenario_master_id カラムを追加しました';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'scenario_characters' AND column_name = 'name'
    ) THEN
      ALTER TABLE public.scenario_characters ADD COLUMN name TEXT NOT NULL DEFAULT '';
      RAISE NOTICE 'name カラムを追加しました';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'scenario_characters' AND column_name = 'description'
    ) THEN
      ALTER TABLE public.scenario_characters ADD COLUMN description TEXT;
      RAISE NOTICE 'description カラムを追加しました';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'scenario_characters' AND column_name = 'image_url'
    ) THEN
      ALTER TABLE public.scenario_characters ADD COLUMN image_url TEXT;
      RAISE NOTICE 'image_url カラムを追加しました';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'scenario_characters' AND column_name = 'sort_order'
    ) THEN
      ALTER TABLE public.scenario_characters ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
      RAISE NOTICE 'sort_order カラムを追加しました';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'scenario_characters' AND column_name = 'is_visible'
    ) THEN
      ALTER TABLE public.scenario_characters ADD COLUMN is_visible BOOLEAN NOT NULL DEFAULT true;
      RAISE NOTICE 'is_visible カラムを追加しました';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'scenario_characters' AND column_name = 'created_at'
    ) THEN
      ALTER TABLE public.scenario_characters ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'scenario_characters' AND column_name = 'updated_at'
    ) THEN
      ALTER TABLE public.scenario_characters ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    END IF;

    RAISE NOTICE 'scenario_characters テーブルのカラムを確認/修復しました';
  END IF;
END $$;

-- インデックス（scenario_master_id が存在する場合のみ有効）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'scenario_characters' AND column_name = 'scenario_master_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_scenario_characters_master_id 
      ON public.scenario_characters(scenario_master_id);
    CREATE INDEX IF NOT EXISTS idx_scenario_characters_sort 
      ON public.scenario_characters(scenario_master_id, sort_order);
  END IF;
END $$;

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

-- RLS
ALTER TABLE public.scenario_characters ENABLE ROW LEVEL SECURITY;

-- 既存ポリシー削除
DROP POLICY IF EXISTS "scenario_characters_select_all" ON public.scenario_characters;
DROP POLICY IF EXISTS "scenario_characters_insert_staff" ON public.scenario_characters;
DROP POLICY IF EXISTS "scenario_characters_update_staff" ON public.scenario_characters;
DROP POLICY IF EXISTS "scenario_characters_delete_staff" ON public.scenario_characters;

-- 全員が読み取り可能（公開情報）
CREATE POLICY "scenario_characters_select_all" ON public.scenario_characters
  FOR SELECT USING (true);

-- スタッフ・管理者のみ作成・更新・削除可能
CREATE POLICY "scenario_characters_insert_staff" ON public.scenario_characters
  FOR INSERT WITH CHECK (is_staff_or_admin());

CREATE POLICY "scenario_characters_update_staff" ON public.scenario_characters
  FOR UPDATE USING (is_staff_or_admin());

CREATE POLICY "scenario_characters_delete_staff" ON public.scenario_characters
  FOR DELETE USING (is_staff_or_admin());


-- ==========================================================
-- 3. kit_transfer_completions: テーブル確認/修復
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.kit_transfer_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scenario_id UUID NOT NULL REFERENCES public.scenarios(id) ON DELETE CASCADE,
  kit_number INTEGER NOT NULL DEFAULT 1,
  performance_date DATE NOT NULL,
  from_store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  to_store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  picked_up_at TIMESTAMPTZ,
  picked_up_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  delivered_at TIMESTAMPTZ,
  delivered_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, scenario_id, kit_number, performance_date, to_store_id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_kit_transfer_completions_org ON public.kit_transfer_completions(organization_id);
CREATE INDEX IF NOT EXISTS idx_kit_transfer_completions_scenario ON public.kit_transfer_completions(scenario_id);
CREATE INDEX IF NOT EXISTS idx_kit_transfer_completions_perf_date ON public.kit_transfer_completions(performance_date);
CREATE INDEX IF NOT EXISTS idx_kit_transfer_completions_to_store ON public.kit_transfer_completions(to_store_id);

-- RLS
ALTER TABLE public.kit_transfer_completions ENABLE ROW LEVEL SECURITY;

-- 既存ポリシー削除
DROP POLICY IF EXISTS "kit_transfer_completions_select_policy" ON public.kit_transfer_completions;
DROP POLICY IF EXISTS "kit_transfer_completions_insert_policy" ON public.kit_transfer_completions;
DROP POLICY IF EXISTS "kit_transfer_completions_update_policy" ON public.kit_transfer_completions;
DROP POLICY IF EXISTS "kit_transfer_completions_delete_policy" ON public.kit_transfer_completions;

-- 組織メンバーは閲覧可能
CREATE POLICY "kit_transfer_completions_select_policy" ON public.kit_transfer_completions
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

-- 組織のスタッフは挿入可能
CREATE POLICY "kit_transfer_completions_insert_policy" ON public.kit_transfer_completions
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

-- 組織のスタッフは更新可能
CREATE POLICY "kit_transfer_completions_update_policy" ON public.kit_transfer_completions
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

-- 組織のスタッフは削除可能
CREATE POLICY "kit_transfer_completions_delete_policy" ON public.kit_transfer_completions
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_kit_transfer_completions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_kit_transfer_completions_updated_at ON public.kit_transfer_completions;
CREATE TRIGGER update_kit_transfer_completions_updated_at
  BEFORE UPDATE ON public.kit_transfer_completions
  FOR EACH ROW
  EXECUTE FUNCTION update_kit_transfer_completions_updated_at();


-- ==========================================================
-- 完了
-- ==========================================================
DO $$
BEGIN
  RAISE NOTICE '✅ schedule_event_history RLSポリシー追加完了';
  RAISE NOTICE '✅ scenario_characters テーブル修復完了';
  RAISE NOTICE '✅ kit_transfer_completions テーブル確認/修復完了';
END $$;
