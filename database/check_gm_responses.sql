-- GM回答データの確認
SELECT 
  id,
  reservation_id,
  staff_id,
  gm_discord_id,
  gm_name,
  response_type,
  selected_candidate_index,
  response_datetime,
  notes
FROM gm_availability_responses
ORDER BY response_datetime DESC
LIMIT 10;

-- Discord IDとstaff_idの紐付け確認
SELECT 
  s.id as staff_id,
  s.name as staff_name,
  s.discord_id,
  s.discord_channel_id,
  s.role
FROM staff s
WHERE s.discord_id IS NOT NULL
ORDER BY s.name;
