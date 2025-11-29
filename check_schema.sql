SELECT 
    column_name, 
    data_type 
FROM information_schema.columns 
WHERE table_name = 'schedule_events' 
   OR table_name = 'scenarios';
