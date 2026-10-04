-- 整備 6（2026-10-04 社長判断）: 作品とつながっていない今後の貸切公演（7月〜9/25 作成、277 件）を、
-- 申込み側の作品でつなぎ直す（承認で作る今の公演と同じく、作品の元 ID・旧 ID・組織の作品 ID の 3 つを入れる）。
-- 対象は、公演に作品の ID が 1 つも無く、申込み側の作品が組織の作品に 1 件だけ対応するもの。題名は変えない。
-- 退避表: archive.schedule_events_scenario_link_backup_20261004
CREATE TABLE IF NOT EXISTS archive.schedule_events_scenario_link_backup_20261004 AS
SELECT e.id, e.organization_id, e.scenario_master_id, e.scenario_id, e.organization_scenario_id, e.updated_at,
  r.scenario_master_id AS new_master_id, os.id AS new_org_scenario_id
FROM public.schedule_events e
JOIN public.reservations r ON r.id=e.reservation_id AND r.organization_id=e.organization_id
JOIN public.organization_scenarios os ON os.organization_id=e.organization_id AND os.scenario_master_id=r.scenario_master_id
WHERE e.category='private' AND e.date >= (now() AT TIME ZONE 'Asia/Tokyo')::date
  AND coalesce(e.scenario,'')<>'' AND e.scenario_master_id IS NULL AND e.scenario_id IS NULL AND e.organization_scenario_id IS NULL
  AND r.scenario_master_id IS NOT NULL
  AND (SELECT count(*) FROM public.organization_scenarios o2 WHERE o2.organization_id=e.organization_id AND o2.scenario_master_id=r.scenario_master_id)=1;
ALTER TABLE archive.schedule_events_scenario_link_backup_20261004 ENABLE ROW LEVEL SECURITY;

UPDATE public.schedule_events e
SET scenario_master_id=b.new_master_id, scenario_id=b.new_master_id, organization_scenario_id=b.new_org_scenario_id, updated_at=now()
FROM archive.schedule_events_scenario_link_backup_20261004 b
WHERE e.id=b.id AND e.organization_id=b.organization_id
  AND e.scenario_master_id IS NULL AND e.scenario_id IS NULL AND e.organization_scenario_id IS NULL;
