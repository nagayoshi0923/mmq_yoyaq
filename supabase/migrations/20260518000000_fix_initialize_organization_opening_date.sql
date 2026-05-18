-- =============================================================================
-- initialize_organization_data() の opening_date 型不一致を修正
-- =============================================================================
-- 背景:
--   organizations への INSERT 時に発火するトリガー initialize_organization_data() が
--   臨時会場1-5 を stores に挿入する際、opening_date (DATE 型) に
--   `CURRENT_DATE::text` を渡していたため、42804 (datatype_mismatch) で失敗する。
--
--   org セルフ登録 RPC (#register_organization_for_signup) が組織を INSERT する
--   段階でこのトリガーが呼ばれ、新規組織登録フローが 400 エラーで完全に止まる。
--
-- 修正:
--   `CURRENT_DATE::text` → `CURRENT_DATE` （DATE のまま渡す）
--
-- 影響範囲:
--   関数の他のロジック（organization_settings / global_settings の初期化、
--   SECURITY DEFINER + SET search_path = public）はそのまま維持。
-- =============================================================================

CREATE OR REPLACE FUNCTION public.initialize_organization_data()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.organization_settings (organization_id)
  VALUES (NEW.id)
  ON CONFLICT (organization_id) DO NOTHING;

  INSERT INTO public.global_settings (organization_id)
  VALUES (NEW.id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.stores (name, short_name, status, capacity, rooms, color, is_temporary, temporary_dates, organization_id, address, phone_number, email, opening_date, manager_name)
  VALUES
    ('臨時会場1', '臨時1', 'active', 8, 1, '#9E9E9E', true, '[]', NEW.id, '', '', '', CURRENT_DATE, ''),
    ('臨時会場2', '臨時2', 'active', 8, 1, '#9E9E9E', true, '[]', NEW.id, '', '', '', CURRENT_DATE, ''),
    ('臨時会場3', '臨時3', 'active', 8, 1, '#9E9E9E', true, '[]', NEW.id, '', '', '', CURRENT_DATE, ''),
    ('臨時会場4', '臨時4', 'active', 8, 1, '#9E9E9E', true, '[]', NEW.id, '', '', '', CURRENT_DATE, ''),
    ('臨時会場5', '臨時5', 'active', 8, 1, '#9E9E9E', true, '[]', NEW.id, '', '', '', CURRENT_DATE, '')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DO $$
BEGIN
  RAISE NOTICE '✅ initialize_organization_data() の opening_date 型不一致を修正しました';
END $$;
