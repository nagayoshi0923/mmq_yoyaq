-- scenariosテーブルのスキーマを確認
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'scenarios'
ORDER BY ordinal_position;

-- production_costs と required_props カラムの存在確認
SELECT 
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'scenarios'
  AND column_name IN ('production_costs', 'required_props');
