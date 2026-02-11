-- =============================================================================
-- P1-14: 新規組織作成時に必要な初期データを自動生成するトリガー
--
-- 問題: 組織を作成しても organization_settings, global_settings, 臨時会場ストア
--       が作成されず、スケジュール画面で406エラー、臨時会場追加不可になる
-- 修正: organizations テーブルへの INSERT 後に自動で初期データを作成
-- =============================================================================

CREATE OR REPLACE FUNCTION public.initialize_organization_data()
RETURNS TRIGGER AS $$
BEGIN
  -- 1. organization_settings を作成
  INSERT INTO public.organization_settings (organization_id)
  VALUES (NEW.id)
  ON CONFLICT (organization_id) DO NOTHING;

  -- 2. global_settings を作成
  INSERT INTO public.global_settings (organization_id)
  VALUES (NEW.id)
  ON CONFLICT DO NOTHING;

  -- 3. 臨時会場ストア 1〜5 を作成
  INSERT INTO public.stores (name, short_name, status, capacity, rooms, color, is_temporary, temporary_dates, organization_id, address, phone_number, email, opening_date, manager_name)
  VALUES
    ('臨時会場1', '臨時1', 'active', 8, 1, '#9E9E9E', true, '[]', NEW.id, '', '', '', CURRENT_DATE::text, ''),
    ('臨時会場2', '臨時2', 'active', 8, 1, '#9E9E9E', true, '[]', NEW.id, '', '', '', CURRENT_DATE::text, ''),
    ('臨時会場3', '臨時3', 'active', 8, 1, '#9E9E9E', true, '[]', NEW.id, '', '', '', CURRENT_DATE::text, ''),
    ('臨時会場4', '臨時4', 'active', 8, 1, '#9E9E9E', true, '[]', NEW.id, '', '', '', CURRENT_DATE::text, ''),
    ('臨時会場5', '臨時5', 'active', 8, 1, '#9E9E9E', true, '[]', NEW.id, '', '', '', CURRENT_DATE::text, '')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- トリガーを作成（既存があれば置換）
DROP TRIGGER IF EXISTS trigger_initialize_organization ON public.organizations;
CREATE TRIGGER trigger_initialize_organization
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.initialize_organization_data();
