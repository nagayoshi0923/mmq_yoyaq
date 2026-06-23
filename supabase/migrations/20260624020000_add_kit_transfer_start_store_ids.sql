-- キット移動計画: 移動日ごとの起点店舗（組織共有）
ALTER TABLE public.global_settings
  ADD COLUMN IF NOT EXISTS kit_transfer_start_store_ids JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.global_settings.kit_transfer_start_store_ids IS
  'キット移動計画の移動日ごとの起点店舗。キー=YYYY-MM-DD、値=store_id。未指定日は自動おすすめ。';
