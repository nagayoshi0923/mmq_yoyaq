-- rollback: 2026-10-06 に「クインズワルツ」へ直した 11 行だけを元の「クイーンズワルツ」に戻す（行は本番・検証環境で同じ ID）
UPDATE public.email_settings SET company_name = 'クイーンズワルツ', updated_at = now()
 WHERE id IN ('6ad85be4-4ad1-4fe2-848c-7926605e11a9','d01defd2-bdce-4117-9e14-0b87486864cf','91479011-b852-47d9-a9c6-a505ecc1188f')
   AND company_name = 'クインズワルツ';
UPDATE public.operating_setting_overrides
   SET settings = jsonb_set(settings, '{company_name}', to_jsonb('クイーンズワルツ'::text)), revision = revision + 1, updated_at = now()
 WHERE id IN ('a4e2a860-299b-45dd-b8db-0378a586caa7','8a0bf0d4-a0fc-4744-942b-eaf5a2b03c37','eeddfd88-d357-4818-8ed2-b12e1b0eda7c','5c16be8c-ab33-43fb-93a2-42042526f8e2',
              '6061e9a9-79cb-4abe-9d2f-f6682b413981','b5807fc1-ed53-4c8a-887f-146dde29258b','984953d6-a431-48ea-a163-57a6d071a09f','c09fec88-eb0e-4c05-92d2-017fcddbaf46')
   AND settings->>'company_name' = 'クインズワルツ';
