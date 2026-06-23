-- 店舗間移動時間マスタ
-- Google Maps API 等の外部課金に依存せず、組織ごとに店舗間の実運用移動時間を保持する。
-- A-B と B-A は同じ時間として扱うため、store_a_id < store_b_id の無向1レコードで保存する。

CREATE TABLE IF NOT EXISTS public.store_travel_times (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  store_a_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  store_b_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  minutes INTEGER NOT NULL CHECK (minutes > 0 AND minutes <= 1440),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT store_travel_times_distinct_stores CHECK (store_a_id <> store_b_id),
  CONSTRAINT store_travel_times_ordered_pair CHECK (store_a_id < store_b_id),
  CONSTRAINT store_travel_times_unique_pair UNIQUE (organization_id, store_a_id, store_b_id)
);

CREATE INDEX IF NOT EXISTS idx_store_travel_times_org
  ON public.store_travel_times (organization_id);
CREATE INDEX IF NOT EXISTS idx_store_travel_times_store_a
  ON public.store_travel_times (store_a_id);
CREATE INDEX IF NOT EXISTS idx_store_travel_times_store_b
  ON public.store_travel_times (store_b_id);

COMMENT ON TABLE public.store_travel_times IS '店舗間の移動時間マスタ（無向ペア、組織共有）';
COMMENT ON COLUMN public.store_travel_times.store_a_id IS '店舗ペアの片方。無向ペアのため store_a_id < store_b_id を強制';
COMMENT ON COLUMN public.store_travel_times.store_b_id IS '店舗ペアの片方。無向ペアのため store_a_id < store_b_id を強制';
COMMENT ON COLUMN public.store_travel_times.minutes IS '店舗間の移動時間（分）。未設定時はアプリ側で暫定30分として扱う';
COMMENT ON COLUMN public.store_travel_times.memo IS '移動経路や注意事項のメモ（例: 山手線、徒歩込み）';

CREATE OR REPLACE FUNCTION public.validate_store_travel_times_org()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.stores sa
    JOIN public.stores sb ON sb.id = NEW.store_b_id
    WHERE sa.id = NEW.store_a_id
      AND sa.organization_id = NEW.organization_id
      AND sb.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'store_travel_times stores must belong to the same organization';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_store_travel_times_org ON public.store_travel_times;
CREATE TRIGGER trigger_validate_store_travel_times_org
  BEFORE INSERT OR UPDATE ON public.store_travel_times
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_store_travel_times_org();

CREATE OR REPLACE FUNCTION public.update_store_travel_times_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_store_travel_times_updated_at ON public.store_travel_times;
CREATE TRIGGER trigger_update_store_travel_times_updated_at
  BEFORE UPDATE ON public.store_travel_times
  FOR EACH ROW
  EXECUTE FUNCTION public.update_store_travel_times_updated_at();

ALTER TABLE public.store_travel_times ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store_travel_times_select_policy" ON public.store_travel_times;
DROP POLICY IF EXISTS "store_travel_times_insert_policy" ON public.store_travel_times;
DROP POLICY IF EXISTS "store_travel_times_update_policy" ON public.store_travel_times;
DROP POLICY IF EXISTS "store_travel_times_delete_policy" ON public.store_travel_times;

CREATE POLICY "store_travel_times_select_policy" ON public.store_travel_times
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.organization_id = store_travel_times.organization_id
        AND u.role IN ('admin', 'staff', 'license_admin')
    )
  );

CREATE POLICY "store_travel_times_insert_policy" ON public.store_travel_times
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.organization_id = store_travel_times.organization_id
        AND u.role IN ('admin', 'license_admin')
    )
  );

CREATE POLICY "store_travel_times_update_policy" ON public.store_travel_times
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.organization_id = store_travel_times.organization_id
        AND u.role IN ('admin', 'license_admin')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.organization_id = store_travel_times.organization_id
        AND u.role IN ('admin', 'license_admin')
    )
  );

CREATE POLICY "store_travel_times_delete_policy" ON public.store_travel_times
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.organization_id = store_travel_times.organization_id
        AND u.role IN ('admin', 'license_admin')
    )
  );
