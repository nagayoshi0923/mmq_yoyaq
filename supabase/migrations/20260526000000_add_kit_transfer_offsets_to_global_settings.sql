-- キット移動ツールの曜日設定を組織共有で保存するカラムを追加
alter table global_settings
  add column if not exists kit_transfer_offsets integer[] default '{0,4}';
