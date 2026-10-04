-- rollback: つなぎ直した貸切公演の作品 ID を元（空）に戻す
UPDATE public.schedule_events e
SET scenario_master_id=b.scenario_master_id, scenario_id=b.scenario_id, organization_scenario_id=b.organization_scenario_id, updated_at=b.updated_at
FROM archive.schedule_events_scenario_link_backup_20261004 b
WHERE e.id=b.id AND e.organization_id=b.organization_id;
