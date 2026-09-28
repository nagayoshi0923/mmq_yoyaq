-- 組織共通のリマインドが未設定のまま残っている場合だけ、移行前の前日9時を補完する。
-- 明示的な false / 独自日程は上書きしない（defaults || settings で既存キー優先）。
UPDATE public.operating_setting_overrides AS o
SET settings = '{"reminder_enabled":true,"reminder_schedule":[{"days_before":1,"time":"09:00","enabled":true}]}'::jsonb || o.settings
WHERE o.store_id IS NULL
  AND o.organization_scenario_id IS NULL
  AND o.schedule_event_id IS NULL
  AND (
    NOT (o.settings ? 'reminder_enabled')
    OR o.settings->'reminder_enabled' = 'null'::jsonb
    OR (
      (NOT (o.settings ? 'reminder_schedule') OR o.settings->'reminder_schedule' = 'null'::jsonb OR o.settings->'reminder_schedule' = '[]'::jsonb)
      AND COALESCE((o.settings->>'reminder_enabled')::boolean, false) = true
    )
  );

INSERT INTO public.operating_setting_overrides(organization_id, settings)
SELECT o.id, '{"reminder_enabled":true,"reminder_schedule":[{"days_before":1,"time":"09:00","enabled":true}]}'::jsonb
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1
  FROM public.operating_setting_overrides x
  WHERE x.organization_id = o.id
    AND x.store_id IS NULL
    AND x.organization_scenario_id IS NULL
    AND x.schedule_event_id IS NULL
)
ON CONFLICT (organization_id, store_id, organization_scenario_id, schedule_event_id)
DO UPDATE SET settings = EXCLUDED.settings || public.operating_setting_overrides.settings;
