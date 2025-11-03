-- シナリオテーブルのplayer_count_maxを確認
-- 特に「曙光のエテルナ」などの実際の最大人数を確認

SELECT 
  id,
  title,
  player_count_max,
  player_count_min,
  CASE 
    WHEN player_count_max = 8 THEN '⚠️ 8に設定されている（要確認）'
    ELSE '✅ 正常'
  END as status
FROM scenarios
WHERE title IN ('曙光のエテルナ', 'グロリアメモリーズ', '機巧人形の心臓', '花街リグレット')
   OR player_count_max != 8
ORDER BY title;

-- 全体の統計
SELECT 
  player_count_max,
  COUNT(*) as count
FROM scenarios
GROUP BY player_count_max
ORDER BY player_count_max DESC;

