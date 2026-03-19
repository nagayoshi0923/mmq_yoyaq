-- scenario_likes.scenario_id を nullable に変更し、scenario_master_id で管理できるようにする
-- scenario_masters 移行後、新規いいねは scenario_master_id のみ設定される

ALTER TABLE scenario_likes
  ALTER COLUMN scenario_id DROP NOT NULL;
