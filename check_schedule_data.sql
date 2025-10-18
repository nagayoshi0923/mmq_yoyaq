SELECT 
  date,
  venue,
  scenario,
  gms,
  start_time,
  end_time,
  category
FROM schedule_events 
WHERE date >= '2025-11-01' AND date <= '2025-11-08'
ORDER BY date, venue, start_time
LIMIT 10;
