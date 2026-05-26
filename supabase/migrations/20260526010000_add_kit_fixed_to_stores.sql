-- 店舗のキット固定ステータスを追加
-- kit_fixed = true の店舗からはキット移動計画が生成されない
alter table stores
  add column if not exists kit_fixed boolean default false;
