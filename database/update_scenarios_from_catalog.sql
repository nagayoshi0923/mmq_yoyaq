-- カタログ情報でシナリオを更新
-- 生成日時: 2026-01-08T08:53:41.185113
-- マッチしたシナリオ: 133 件

BEGIN;

-- 1. その白衣は誰が為に
UPDATE scenarios SET
  author = 'ドニパン', player_count_min = 7, player_count_max = 7, duration = 240, genre = ARRAY['新作', '情報量多め'],
  updated_at = NOW()
WHERE id = '4f0c3914-5b61-41ab-bfaf-cba0d7006f41';

UPDATE scenario_masters SET
  author = 'ドニパン', player_count_min = 7, player_count_max = 7, official_duration = 240, genre = ARRAY['新作', '情報量多め'],
  updated_at = NOW()
WHERE id = '4f0c3914-5b61-41ab-bfaf-cba0d7006f41';

-- 2. 曙光のエテルナ
UPDATE scenarios SET
  author = 'りにょり', player_count_min = 8, player_count_max = 8, duration = 240, genre = ARRAY['新作', 'RP重視'],
  updated_at = NOW()
WHERE id = 'b02468ef-750d-4d21-a93e-59c84bb038ea';

UPDATE scenario_masters SET
  author = 'りにょり', player_count_min = 8, player_count_max = 8, official_duration = 240, genre = ARRAY['新作', 'RP重視'],
  updated_at = NOW()
WHERE id = 'b02468ef-750d-4d21-a93e-59c84bb038ea';

-- 3. コロシタバッドエンド
UPDATE scenarios SET
  author = 'とんとん', player_count_min = 5, player_count_max = 5, duration = 150, genre = ARRAY['新作', 'RP重視'],
  updated_at = NOW()
WHERE id = '53b4035e-ea8b-4118-8cb5-6dd1e7786928';

UPDATE scenario_masters SET
  author = 'とんとん', player_count_min = 5, player_count_max = 5, official_duration = 150, genre = ARRAY['新作', 'RP重視'],
  updated_at = NOW()
WHERE id = '53b4035e-ea8b-4118-8cb5-6dd1e7786928';

-- 4. ゼロ・オルビット
UPDATE scenarios SET
  author = '七夕ドグラ', player_count_min = 6, player_count_max = 6, duration = 180,
  updated_at = NOW()
WHERE id = '34a34ba3-5bf4-45e8-be1f-f21791f47c16';

UPDATE scenario_masters SET
  author = '七夕ドグラ', player_count_min = 6, player_count_max = 6, official_duration = 180,
  updated_at = NOW()
WHERE id = '34a34ba3-5bf4-45e8-be1f-f21791f47c16';

-- 5. OVER KILL
UPDATE scenarios SET
  author = 'WorLd Holic', player_count_min = 10, player_count_max = 10, duration = 240, genre = ARRAY['デスゲーム'],
  updated_at = NOW()
WHERE id = '08025326-0d6b-41d5-917b-f9c0fa482869';

UPDATE scenario_masters SET
  author = 'WorLd Holic', player_count_min = 10, player_count_max = 10, official_duration = 240, genre = ARRAY['デスゲーム'],
  updated_at = NOW()
WHERE id = '08025326-0d6b-41d5-917b-f9c0fa482869';

-- 6. テセウスの方舟
UPDATE scenarios SET
  author = 'ほがらか', player_count_min = 7, player_count_max = 7, duration = 240, genre = ARRAY['新作', 'オススメ'],
  updated_at = NOW()
WHERE id = '66d2b382-a25d-4208-8812-bbe4b5d2eff2';

UPDATE scenario_masters SET
  author = 'ほがらか', player_count_min = 7, player_count_max = 7, official_duration = 240, genre = ARRAY['新作', 'オススメ'],
  updated_at = NOW()
WHERE id = '66d2b382-a25d-4208-8812-bbe4b5d2eff2';

-- 7. 妖怪たちと月夜の刀
UPDATE scenarios SET
  author = 'ぶるーそにあ', player_count_min = 8, player_count_max = 8, duration = 210, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = 'a066805d-0fbe-4893-ba74-4900f5661e27';

UPDATE scenario_masters SET
  author = 'ぶるーそにあ', player_count_min = 8, player_count_max = 8, official_duration = 210, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = 'a066805d-0fbe-4893-ba74-4900f5661e27';

-- 8. 異能特区シンギュラリティ
UPDATE scenarios SET
  author = 'イキザマエンジン', player_count_min = 7, player_count_max = 7, duration = 210, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = 'a9504f21-34fb-4d23-9dcf-b7b0e9d23fb0';

UPDATE scenario_masters SET
  author = 'イキザマエンジン', player_count_min = 7, player_count_max = 7, official_duration = 210, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = 'a9504f21-34fb-4d23-9dcf-b7b0e9d23fb0';

-- 9. 凪の鬼籍
UPDATE scenarios SET
  author = 'そがべ', player_count_min = 7, player_count_max = 7, duration = 270, genre = ARRAY['新作'],
  updated_at = NOW()
WHERE id = '2fa12d15-5c27-462d-b1eb-33bf8f739c07';

UPDATE scenario_masters SET
  author = 'そがべ', player_count_min = 7, player_count_max = 7, official_duration = 270, genre = ARRAY['新作'],
  updated_at = NOW()
WHERE id = '2fa12d15-5c27-462d-b1eb-33bf8f739c07';

-- 10. 絆の永逝
UPDATE scenarios SET
  author = 'そがべ', player_count_min = 7, player_count_max = 7, duration = 270, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = 'df56c405-cd2d-49dc-9e34-3fa0d8657eef';

UPDATE scenario_masters SET
  author = 'そがべ', player_count_min = 7, player_count_max = 7, official_duration = 270, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = 'df56c405-cd2d-49dc-9e34-3fa0d8657eef';

-- 11. ブルーダイヤの不在証明
UPDATE scenarios SET
  author = 'うろん堂', player_count_min = 4, player_count_max = 4, duration = 180, genre = ARRAY['新作', 'ミステリー重視'],
  updated_at = NOW()
WHERE id = '8f352b2f-2824-44b7-a068-3e9daf477974';

UPDATE scenario_masters SET
  author = 'うろん堂', player_count_min = 4, player_count_max = 4, official_duration = 180, genre = ARRAY['新作', 'ミステリー重視'],
  updated_at = NOW()
WHERE id = '8f352b2f-2824-44b7-a068-3e9daf477974';

-- 12. ある悪魔の儀式について
UPDATE scenarios SET
  author = '東大マーダーミステリーサークル', player_count_min = 6, player_count_max = 6, duration = 120,
  updated_at = NOW()
WHERE id = '81f5ab85-7ea1-4743-be3b-5d7d1ad478ae';

UPDATE scenario_masters SET
  author = '東大マーダーミステリーサークル', player_count_min = 6, player_count_max = 6, official_duration = 120,
  updated_at = NOW()
WHERE id = '81f5ab85-7ea1-4743-be3b-5d7d1ad478ae';

-- 13. 蟻集
UPDATE scenarios SET
  author = '幸田幸', player_count_min = 7, player_count_max = 7, duration = 240, genre = ARRAY['新作', '情報量多め'],
  updated_at = NOW()
WHERE id = '10f8465f-b078-401a-bc96-437dd522e9f4';

UPDATE scenario_masters SET
  author = '幸田幸', player_count_min = 7, player_count_max = 7, official_duration = 240, genre = ARRAY['新作', '情報量多め'],
  updated_at = NOW()
WHERE id = '10f8465f-b078-401a-bc96-437dd522e9f4';

-- 14. 蝉散
UPDATE scenarios SET
  author = '幸田幸', player_count_min = 7, player_count_max = 7, duration = 270, genre = ARRAY['新作', '情報量多め'],
  updated_at = NOW()
WHERE id = 'd2d4a483-2c57-4180-854e-87ac6f34f770';

UPDATE scenario_masters SET
  author = '幸田幸', player_count_min = 7, player_count_max = 7, official_duration = 270, genre = ARRAY['新作', '情報量多め'],
  updated_at = NOW()
WHERE id = 'd2d4a483-2c57-4180-854e-87ac6f34f770';

-- 15. オペレーション：ゴーストウィング
UPDATE scenarios SET
  author = '坊', player_count_min = 6, player_count_max = 6, duration = 180, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = '8ea6b586-3d71-40a1-be84-b79dc211db33';

UPDATE scenario_masters SET
  author = '坊', player_count_min = 6, player_count_max = 6, official_duration = 180, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = '8ea6b586-3d71-40a1-be84-b79dc211db33';

-- 16. REDRUM4アルテミスの断罪
UPDATE scenarios SET
  author = 'タンブルウィード レッドラム', player_count_min = 7, player_count_max = 7, duration = 240, genre = ARRAY['デスゲーム'],
  updated_at = NOW()
WHERE id = '5f055db3-751c-4493-afc3-041d8b8796ce';

UPDATE scenario_masters SET
  author = 'タンブルウィード レッドラム', player_count_min = 7, player_count_max = 7, official_duration = 240, genre = ARRAY['デスゲーム'],
  updated_at = NOW()
WHERE id = '5f055db3-751c-4493-afc3-041d8b8796ce';

-- 17. 藍雨廻逢
UPDATE scenarios SET
  author = 'すやてら', player_count_min = 8, player_count_max = 8, duration = 240, genre = ARRAY['新作', 'RP重視'],
  updated_at = NOW()
WHERE id = '044d9255-3588-4b43-80fb-33ef495c5792';

UPDATE scenario_masters SET
  author = 'すやてら', player_count_min = 8, player_count_max = 8, official_duration = 240, genre = ARRAY['新作', 'RP重視'],
  updated_at = NOW()
WHERE id = '044d9255-3588-4b43-80fb-33ef495c5792';

-- 18. 赤鬼が泣いた夜
UPDATE scenarios SET
  author = 'とんとん', player_count_min = 5, player_count_max = 5, duration = 180, genre = ARRAY['新作', 'ミステリー重視'],
  updated_at = NOW()
WHERE id = 'acba0bd2-6747-4cb2-a47f-bee67b765cee';

UPDATE scenario_masters SET
  author = 'とんとん', player_count_min = 5, player_count_max = 5, official_duration = 180, genre = ARRAY['新作', 'ミステリー重視'],
  updated_at = NOW()
WHERE id = 'acba0bd2-6747-4cb2-a47f-bee67b765cee';

-- 19. 超特急の呪いの館で撮れ高足りてますか？
UPDATE scenarios SET
  author = '秋山直太朗', player_count_min = 9, player_count_max = 9, duration = 210,
  updated_at = NOW()
WHERE id = '63e9b98a-870f-4851-aa7a-6e5c019b540b';

UPDATE scenario_masters SET
  author = '秋山直太朗', player_count_min = 9, player_count_max = 9, official_duration = 210,
  updated_at = NOW()
WHERE id = '63e9b98a-870f-4851-aa7a-6e5c019b540b';

-- 20. ENIGMACODE廃棄ミライの犠牲者たち
UPDATE scenarios SET
  author = 'ほがらか', player_count_min = 7, player_count_max = 7, duration = 240, genre = ARRAY['新作'],
  updated_at = NOW()
WHERE id = '2f2a3b0e-662c-4c0b-ace0-52b57eb40912';

UPDATE scenario_masters SET
  author = 'ほがらか', player_count_min = 7, player_count_max = 7, official_duration = 240, genre = ARRAY['新作'],
  updated_at = NOW()
WHERE id = '2f2a3b0e-662c-4c0b-ace0-52b57eb40912';

-- 21. 漣の向こう側
UPDATE scenarios SET
  author = 'MATH-GAME', player_count_min = 6, player_count_max = 6, duration = 180, genre = ARRAY['新作'],
  updated_at = NOW()
WHERE id = '311a0e25-7254-4510-808e-eafdb5a2c062';

UPDATE scenario_masters SET
  author = 'MATH-GAME', player_count_min = 6, player_count_max = 6, official_duration = 180, genre = ARRAY['新作'],
  updated_at = NOW()
WHERE id = '311a0e25-7254-4510-808e-eafdb5a2c062';

-- 22. ゼロの爆弾
UPDATE scenarios SET
  author = '綾部ヒサト', player_count_min = 5, player_count_max = 5, duration = 150, genre = ARRAY['新作'],
  updated_at = NOW()
WHERE id = 'b519ce76-fed0-45c4-9c12-0be0acbb650d';

UPDATE scenario_masters SET
  author = '綾部ヒサト', player_count_min = 5, player_count_max = 5, official_duration = 150, genre = ARRAY['新作'],
  updated_at = NOW()
WHERE id = 'b519ce76-fed0-45c4-9c12-0be0acbb650d';

-- 23. 境界線のカーサスベリ
UPDATE scenarios SET
  author = 'える', player_count_min = 8, player_count_max = 8, duration = 270, genre = ARRAY['新作', 'オススメ'],
  updated_at = NOW()
WHERE id = '5d3bd6a7-b4ec-4d38-8555-c0aa38daccda';

UPDATE scenario_masters SET
  author = 'える', player_count_min = 8, player_count_max = 8, official_duration = 270, genre = ARRAY['新作', 'オススメ'],
  updated_at = NOW()
WHERE id = '5d3bd6a7-b4ec-4d38-8555-c0aa38daccda';

-- 24. 月光の偽桜
UPDATE scenarios SET
  author = 'える', player_count_min = 8, player_count_max = 8, duration = 240, genre = ARRAY['新作', 'オススメ'],
  updated_at = NOW()
WHERE id = '06efd802-2f9a-4116-b5eb-684c4f480eef';

UPDATE scenario_masters SET
  author = 'える', player_count_min = 8, player_count_max = 8, official_duration = 240, genre = ARRAY['新作', 'オススメ'],
  updated_at = NOW()
WHERE id = '06efd802-2f9a-4116-b5eb-684c4f480eef';

-- 25. 新世界のユキサキ
UPDATE scenarios SET
  author = 'リン', player_count_min = 8, player_count_max = 8, duration = 240, genre = ARRAY['ミステリー重視', 'オススメ'],
  updated_at = NOW()
WHERE id = 'db71f4cb-2039-44d7-96dd-5e662a54b63b';

UPDATE scenario_masters SET
  author = 'リン', player_count_min = 8, player_count_max = 8, official_duration = 240, genre = ARRAY['ミステリー重視', 'オススメ'],
  updated_at = NOW()
WHERE id = 'db71f4cb-2039-44d7-96dd-5e662a54b63b';

-- 26. 彗星蘭の万朶
UPDATE scenarios SET
  author = 'KOH', player_count_min = 7, player_count_max = 7, duration = 270, genre = ARRAY['オススメ'],
  updated_at = NOW()
WHERE id = '2c35606f-f335-46ac-aea2-8db3b35f6f48';

UPDATE scenario_masters SET
  author = 'KOH', player_count_min = 7, player_count_max = 7, official_duration = 270, genre = ARRAY['オススメ'],
  updated_at = NOW()
WHERE id = '2c35606f-f335-46ac-aea2-8db3b35f6f48';

-- 27. Invisible-亡霊列車-
UPDATE scenarios SET
  author = 'apri la porta', player_count_min = 4, player_count_max = 4, duration = 120, genre = ARRAY['新作'],
  updated_at = NOW()
WHERE id = 'f853524a-c859-411b-b4a7-c2fad5f6af8f';

UPDATE scenario_masters SET
  author = 'apri la porta', player_count_min = 4, player_count_max = 4, official_duration = 120, genre = ARRAY['新作'],
  updated_at = NOW()
WHERE id = 'f853524a-c859-411b-b4a7-c2fad5f6af8f';

-- 28. REDRUM03致命的観測をもう一度
UPDATE scenarios SET
  author = 'タンブルウィード レッドラム', player_count_min = 6, player_count_max = 6, duration = 210, genre = ARRAY['オススメ'],
  updated_at = NOW()
WHERE id = '743184b3-e1ac-4170-8f57-0347b5eb526d';

UPDATE scenario_masters SET
  author = 'タンブルウィード レッドラム', player_count_min = 6, player_count_max = 6, official_duration = 210, genre = ARRAY['オススメ'],
  updated_at = NOW()
WHERE id = '743184b3-e1ac-4170-8f57-0347b5eb526d';

-- 29. REDRUM02虚像のF
UPDATE scenarios SET
  author = 'タンブルウィード レッドラム', player_count_min = 6, player_count_max = 6, duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '6e20bbfe-d97a-4388-ab5e-95b5a1d91bcd';

UPDATE scenario_masters SET
  author = 'タンブルウィード レッドラム', player_count_min = 6, player_count_max = 6, official_duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '6e20bbfe-d97a-4388-ab5e-95b5a1d91bcd';

-- 30. REDRUM01泉涌館の変転
UPDATE scenarios SET
  author = 'タンブルウィード レッドラム', player_count_min = 7, player_count_max = 7, duration = 210, genre = ARRAY['オススメ'],
  updated_at = NOW()
WHERE id = 'c75e086c-b30e-47f9-9143-ebd1bc74e5bc';

UPDATE scenario_masters SET
  author = 'タンブルウィード レッドラム', player_count_min = 7, player_count_max = 7, official_duration = 210, genre = ARRAY['オススメ'],
  updated_at = NOW()
WHERE id = 'c75e086c-b30e-47f9-9143-ebd1bc74e5bc';

-- 31. TheRealFork30's
UPDATE scenarios SET
  author = '週末倶楽部', player_count_min = 5, player_count_max = 5, duration = 180, genre = ARRAY['新作', 'RP重視'],
  updated_at = NOW()
WHERE id = '33fa053e-00d0-4cc2-bca8-e7341b3fdf17';

UPDATE scenario_masters SET
  author = '週末倶楽部', player_count_min = 5, player_count_max = 5, official_duration = 180, genre = ARRAY['新作', 'RP重視'],
  updated_at = NOW()
WHERE id = '33fa053e-00d0-4cc2-bca8-e7341b3fdf17';

-- 32. 廻る弾丸輪舞（ダンガンロンド）
UPDATE scenarios SET
  author = 'イキザマエンジン', player_count_min = 5, player_count_max = 5, duration = 120, genre = ARRAY['新作'],
  updated_at = NOW()
WHERE id = '315fe1b2-8ee3-4b19-a3bd-b7bd1f5698d1';

UPDATE scenario_masters SET
  author = 'イキザマエンジン', player_count_min = 5, player_count_max = 5, official_duration = 120, genre = ARRAY['新作'],
  updated_at = NOW()
WHERE id = '315fe1b2-8ee3-4b19-a3bd-b7bd1f5698d1';

-- 33. くずの葉のもり
UPDATE scenarios SET
  author = 'しゃみずい', player_count_min = 7, player_count_max = 7, duration = 180, genre = ARRAY['新作', 'RP重視'],
  updated_at = NOW()
WHERE id = 'c918b1c9-1086-4e4c-8849-1f6927951751';

UPDATE scenario_masters SET
  author = 'しゃみずい', player_count_min = 7, player_count_max = 7, official_duration = 180, genre = ARRAY['新作', 'RP重視'],
  updated_at = NOW()
WHERE id = 'c918b1c9-1086-4e4c-8849-1f6927951751';

-- 34. マーダーオブエクスプローラー失われし大秘宝
UPDATE scenarios SET
  author = '週末倶楽部', player_count_min = 6, player_count_max = 6, duration = 180, genre = ARRAY['新作'],
  updated_at = NOW()
WHERE id = 'e1816c25-0289-4da7-b681-5301e18c4aed';

UPDATE scenario_masters SET
  author = '週末倶楽部', player_count_min = 6, player_count_max = 6, official_duration = 180, genre = ARRAY['新作'],
  updated_at = NOW()
WHERE id = 'e1816c25-0289-4da7-b681-5301e18c4aed';

-- 35. 電脳の檻のアリス
UPDATE scenarios SET
  author = 'マダミステリカ', player_count_min = 7, player_count_max = 7, duration = 240, genre = ARRAY['オススメ'],
  updated_at = NOW()
WHERE id = '170b3bb2-201c-4c8e-bfcc-6421afa3a125';

UPDATE scenario_masters SET
  author = 'マダミステリカ', player_count_min = 7, player_count_max = 7, official_duration = 240, genre = ARRAY['オススメ'],
  updated_at = NOW()
WHERE id = '170b3bb2-201c-4c8e-bfcc-6421afa3a125';

-- 36. 魂を運ぶ飛行船
UPDATE scenarios SET
  author = 'える', player_count_min = 5, player_count_max = 5, duration = 210, genre = ARRAY['新作', 'RP重視'],
  updated_at = NOW()
WHERE id = '05265de3-432e-4680-8d59-bd85aa9ebeef';

UPDATE scenario_masters SET
  author = 'える', player_count_min = 5, player_count_max = 5, official_duration = 210, genre = ARRAY['新作', 'RP重視'],
  updated_at = NOW()
WHERE id = '05265de3-432e-4680-8d59-bd85aa9ebeef';

-- 37. アンドロイドは愛を知らない
UPDATE scenarios SET
  author = '久畑ばく', player_count_min = 6, player_count_max = 6, duration = 240, genre = ARRAY['新作', 'RP重視'],
  updated_at = NOW()
WHERE id = 'a592c44e-be98-4fb5-a7ae-39c5ce688b6a';

UPDATE scenario_masters SET
  author = '久畑ばく', player_count_min = 6, player_count_max = 6, official_duration = 240, genre = ARRAY['新作', 'RP重視'],
  updated_at = NOW()
WHERE id = 'a592c44e-be98-4fb5-a7ae-39c5ce688b6a';

-- 38. 真・渋谷陰陽奇譚
UPDATE scenarios SET
  author = 'UniteLink', player_count_min = 7, player_count_max = 7, duration = 210,
  updated_at = NOW()
WHERE id = 'a03eedc4-0f25-4a24-a9e1-03b617a33f45';

UPDATE scenario_masters SET
  author = 'UniteLink', player_count_min = 7, player_count_max = 7, official_duration = 210,
  updated_at = NOW()
WHERE id = 'a03eedc4-0f25-4a24-a9e1-03b617a33f45';

-- 39. 立方館
UPDATE scenarios SET
  author = 'ミステリーテリング', player_count_min = 6, player_count_max = 6, duration = 420, genre = ARRAY['新作', 'オススメ'],
  updated_at = NOW()
WHERE id = 'd6a863b6-86db-4698-8e67-afd0eb098393';

UPDATE scenario_masters SET
  author = 'ミステリーテリング', player_count_min = 6, player_count_max = 6, official_duration = 420, genre = ARRAY['新作', 'オススメ'],
  updated_at = NOW()
WHERE id = 'd6a863b6-86db-4698-8e67-afd0eb098393';

-- 40. 霧に眠るは幾つの罪
UPDATE scenarios SET
  author = 'リン', player_count_min = 8, player_count_max = 8, duration = 360, genre = ARRAY['オススメ'],
  updated_at = NOW()
WHERE id = 'ebbc7622-7657-437d-bf85-7c8477ef9454';

UPDATE scenario_masters SET
  author = 'リン', player_count_min = 8, player_count_max = 8, official_duration = 360, genre = ARRAY['オススメ'],
  updated_at = NOW()
WHERE id = 'ebbc7622-7657-437d-bf85-7c8477ef9454';

-- 41. 銀世界のアシアト
UPDATE scenarios SET
  author = 'リン', player_count_min = 8, player_count_max = 8, duration = 240, genre = ARRAY['新作', 'ミステリー重視', 'RP重視'],
  updated_at = NOW()
WHERE id = '941df533-8722-4db9-8aa3-ab86d537cdd1';

UPDATE scenario_masters SET
  author = 'リン', player_count_min = 8, player_count_max = 8, official_duration = 240, genre = ARRAY['新作', 'ミステリー重視', 'RP重視'],
  updated_at = NOW()
WHERE id = '941df533-8722-4db9-8aa3-ab86d537cdd1';

-- 42. ユートピアース
UPDATE scenarios SET
  author = 'イバラユーギ', player_count_min = 5, player_count_max = 5, duration = 150,
  updated_at = NOW()
WHERE id = '893cfaa8-cebf-46f2-be62-48bd7e70d7e8';

UPDATE scenario_masters SET
  author = 'イバラユーギ', player_count_min = 5, player_count_max = 5, official_duration = 150,
  updated_at = NOW()
WHERE id = '893cfaa8-cebf-46f2-be62-48bd7e70d7e8';

-- 43. 燔祭のジェミニ
UPDATE scenarios SET
  author = 'りにょり＆じる', player_count_min = 7, player_count_max = 7, duration = 210, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = 'cccfff62-3027-4784-866e-7f9fdd5fa9aa';

UPDATE scenario_masters SET
  author = 'りにょり＆じる', player_count_min = 7, player_count_max = 7, official_duration = 210, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = 'cccfff62-3027-4784-866e-7f9fdd5fa9aa';

-- 44. ツグミドリ
UPDATE scenarios SET
  player_count_min = 7, player_count_max = 7, duration = 210, genre = ARRAY['新作'],
  updated_at = NOW()
WHERE id = '67f46fc2-1d54-492f-9f38-58201cdcff97';

UPDATE scenario_masters SET
  player_count_min = 7, player_count_max = 7, official_duration = 210, genre = ARRAY['新作'],
  updated_at = NOW()
WHERE id = '67f46fc2-1d54-492f-9f38-58201cdcff97';

-- 45. この闇をあなたと
UPDATE scenarios SET
  author = 'さくべえ', player_count_min = 6, player_count_max = 6, duration = 240,
  updated_at = NOW()
WHERE id = 'bae919b3-cd0b-444a-8683-49c76b5d3a82';

UPDATE scenario_masters SET
  author = 'さくべえ', player_count_min = 6, player_count_max = 6, official_duration = 240,
  updated_at = NOW()
WHERE id = 'bae919b3-cd0b-444a-8683-49c76b5d3a82';

-- 46. 花街リグレット
UPDATE scenarios SET
  author = 'ドキサバ♡委員会', player_count_min = 8, player_count_max = 8, duration = 240, genre = ARRAY['オススメ'],
  updated_at = NOW()
WHERE id = 'b68123d4-5dfd-4b62-a736-852942544bd4';

UPDATE scenario_masters SET
  author = 'ドキサバ♡委員会', player_count_min = 8, player_count_max = 8, official_duration = 240, genre = ARRAY['オススメ'],
  updated_at = NOW()
WHERE id = 'b68123d4-5dfd-4b62-a736-852942544bd4';

-- 47. 天邪河（あまのじゃく）
UPDATE scenarios SET
  author = 'そがべ', player_count_min = 7, player_count_max = 7, duration = 240,
  updated_at = NOW()
WHERE id = '7120bfe9-b47f-44c2-99b6-3330eda55b19';

UPDATE scenario_masters SET
  author = 'そがべ', player_count_min = 7, player_count_max = 7, official_duration = 240,
  updated_at = NOW()
WHERE id = '7120bfe9-b47f-44c2-99b6-3330eda55b19';

-- 48. 誠実な十字架
UPDATE scenarios SET
  author = 'ドキサバ♡委員会', player_count_min = 8, player_count_max = 8, duration = 240, genre = ARRAY['オススメ'],
  updated_at = NOW()
WHERE id = 'bbb22474-d3da-4440-8007-63f309fcbfae';

UPDATE scenario_masters SET
  author = 'ドキサバ♡委員会', player_count_min = 8, player_count_max = 8, official_duration = 240, genre = ARRAY['オススメ'],
  updated_at = NOW()
WHERE id = 'bbb22474-d3da-4440-8007-63f309fcbfae';

-- 49. 季節／ニィホン
UPDATE scenarios SET
  author = 'イバラユーギ', player_count_min = 7, player_count_max = 7, duration = 210,
  updated_at = NOW()
WHERE id = 'cb802ffb-2f54-4136-8b4e-a30b25be585b';

UPDATE scenario_masters SET
  author = 'イバラユーギ', player_count_min = 7, player_count_max = 7, official_duration = 210,
  updated_at = NOW()
WHERE id = 'cb802ffb-2f54-4136-8b4e-a30b25be585b';

-- 50. 狂気山脈　薄明三角点（３）
UPDATE scenarios SET
  author = 'まだら牛', player_count_min = 5, player_count_max = 5, duration = 240, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '4d2db632-61df-4fc6-b971-fb371f613fbf';

UPDATE scenario_masters SET
  author = 'まだら牛', player_count_min = 5, player_count_max = 5, official_duration = 240, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '4d2db632-61df-4fc6-b971-fb371f613fbf';

-- 51. 狂気山脈　2.5　頂上戦争
UPDATE scenarios SET
  author = 'まだら牛', player_count_min = 5, player_count_max = 5, duration = 240, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '2dc57d0b-846f-4cf7-9958-9f4d39dcfdea';

UPDATE scenario_masters SET
  author = 'まだら牛', player_count_min = 5, player_count_max = 5, official_duration = 240, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '2dc57d0b-846f-4cf7-9958-9f4d39dcfdea';

-- 52. 小暮事件に関する考察
UPDATE scenarios SET
  author = '東大マーダーミステリーサークル', player_count_min = 6, player_count_max = 6, duration = 210, genre = ARRAY['ミステリー重視'],
  updated_at = NOW()
WHERE id = '2ee618a3-9848-43f9-8060-e6c4ba9468b0';

UPDATE scenario_masters SET
  author = '東大マーダーミステリーサークル', player_count_min = 6, player_count_max = 6, official_duration = 210, genre = ARRAY['ミステリー重視'],
  updated_at = NOW()
WHERE id = '2ee618a3-9848-43f9-8060-e6c4ba9468b0';

-- 53. あるマーダーミステリーについて
UPDATE scenarios SET
  author = '東大マーダーミステリーサークル', player_count_min = 5, player_count_max = 5, duration = 180, genre = ARRAY['ミステリー重視', '経験者向け'],
  updated_at = NOW()
WHERE id = '5ff9a1b2-9433-4d34-9741-d84c702ba323';

UPDATE scenario_masters SET
  author = '東大マーダーミステリーサークル', player_count_min = 5, player_count_max = 5, official_duration = 180, genre = ARRAY['ミステリー重視', '経験者向け'],
  updated_at = NOW()
WHERE id = '5ff9a1b2-9433-4d34-9741-d84c702ba323';

-- 54. 赤の導線
UPDATE scenarios SET
  author = 'min', player_count_min = 6, player_count_max = 6, duration = 240,
  updated_at = NOW()
WHERE id = 'f0241a55-814d-48b1-b0bb-61b298f7f077';

UPDATE scenario_masters SET
  author = 'min', player_count_min = 6, player_count_max = 6, official_duration = 240,
  updated_at = NOW()
WHERE id = 'f0241a55-814d-48b1-b0bb-61b298f7f077';

-- 55. 黒と白の狭間に
UPDATE scenarios SET
  author = 'min', player_count_min = 8, player_count_max = 8, duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = 'f517468f-f230-4069-8538-4058f1600052';

UPDATE scenario_masters SET
  author = 'min', player_count_min = 8, player_count_max = 8, official_duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = 'f517468f-f230-4069-8538-4058f1600052';

-- 56. 天使は花明かりの下で
UPDATE scenarios SET
  author = 'とんとん', player_count_min = 5, player_count_max = 5, duration = 240, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = 'eef3f87d-a591-47ae-ac2d-726b713eb66d';

UPDATE scenario_masters SET
  author = 'とんとん', player_count_min = 5, player_count_max = 5, official_duration = 240, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = 'eef3f87d-a591-47ae-ac2d-726b713eb66d';

-- 57. クロノフォビア
UPDATE scenarios SET
  author = 'ほがらか', player_count_min = 7, player_count_max = 7, duration = 240,
  updated_at = NOW()
WHERE id = 'ea11f6c6-f687-409a-bef3-558d1e15f018';

UPDATE scenario_masters SET
  author = 'ほがらか', player_count_min = 7, player_count_max = 7, official_duration = 240,
  updated_at = NOW()
WHERE id = 'ea11f6c6-f687-409a-bef3-558d1e15f018';

-- 58. 裂き子さん
UPDATE scenarios SET
  author = 'とんとん', player_count_min = 6, player_count_max = 6, duration = 180,
  updated_at = NOW()
WHERE id = '983cd9a9-6441-4f90-b179-0451b22cadd5';

UPDATE scenario_masters SET
  author = 'とんとん', player_count_min = 6, player_count_max = 6, official_duration = 180,
  updated_at = NOW()
WHERE id = '983cd9a9-6441-4f90-b179-0451b22cadd5';

-- 59. 歯に噛むあなたに
UPDATE scenarios SET
  author = '2U project', player_count_min = 8, player_count_max = 8, duration = 240, genre = ARRAY['経験者向け'],
  updated_at = NOW()
WHERE id = 'd022c755-dd94-45f4-af22-7f20371a3eba';

UPDATE scenario_masters SET
  author = '2U project', player_count_min = 8, player_count_max = 8, official_duration = 240, genre = ARRAY['経験者向け'],
  updated_at = NOW()
WHERE id = 'd022c755-dd94-45f4-af22-7f20371a3eba';

-- 60. モノクローム
UPDATE scenarios SET
  author = 'isayu & Bubble', player_count_min = 6, player_count_max = 6, duration = 240, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = 'aa97aa46-3ea7-4ff1-955d-49fdb4bdd96b';

UPDATE scenario_masters SET
  author = 'isayu & Bubble', player_count_min = 6, player_count_max = 6, official_duration = 240, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = 'aa97aa46-3ea7-4ff1-955d-49fdb4bdd96b';

-- 61. 5DIVE
UPDATE scenarios SET
  author = 'MATH-GAME', player_count_min = 6, player_count_max = 6, duration = 240, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = '6eb2ba57-0008-4924-b0fc-d30eaef3da56';

UPDATE scenario_masters SET
  author = 'MATH-GAME', player_count_min = 6, player_count_max = 6, official_duration = 240, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = '6eb2ba57-0008-4924-b0fc-d30eaef3da56';

-- 62. グロリアメモリーズ
UPDATE scenarios SET
  author = 'リン', player_count_min = 10, player_count_max = 10, duration = 240,
  updated_at = NOW()
WHERE id = '9ff79eca-de9a-41b3-a7da-a12a59c560c6';

UPDATE scenario_masters SET
  author = 'リン', player_count_min = 10, player_count_max = 10, official_duration = 240,
  updated_at = NOW()
WHERE id = '9ff79eca-de9a-41b3-a7da-a12a59c560c6';

-- 63. BrightChoice
UPDATE scenarios SET
  author = 'リン', player_count_min = 9, player_count_max = 9, duration = 240,
  updated_at = NOW()
WHERE id = '3099fb6f-3969-404f-a50d-7eec273aec72';

UPDATE scenario_masters SET
  author = 'リン', player_count_min = 9, player_count_max = 9, official_duration = 240,
  updated_at = NOW()
WHERE id = '3099fb6f-3969-404f-a50d-7eec273aec72';

-- 64. 或ル胡蝶ノ夢
UPDATE scenarios SET
  author = 'コノハナストーリー', player_count_min = 8, player_count_max = 8, duration = 240,
  updated_at = NOW()
WHERE id = 'c8d818e8-1826-46cb-b06a-dbae304e9103';

UPDATE scenario_masters SET
  author = 'コノハナストーリー', player_count_min = 8, player_count_max = 8, official_duration = 240,
  updated_at = NOW()
WHERE id = 'c8d818e8-1826-46cb-b06a-dbae304e9103';

-- 65. 野槌
UPDATE scenarios SET
  author = 'じくまる', player_count_min = 8, player_count_max = 8, duration = 240, genre = ARRAY['ミステリー重視'],
  updated_at = NOW()
WHERE id = '204b565a-8f35-45bb-99e8-ec435443a50b';

UPDATE scenario_masters SET
  author = 'じくまる', player_count_min = 8, player_count_max = 8, official_duration = 240, genre = ARRAY['ミステリー重視'],
  updated_at = NOW()
WHERE id = '204b565a-8f35-45bb-99e8-ec435443a50b';

-- 66. 紅く舞う
UPDATE scenarios SET
  author = 'EGG Mystery Club', player_count_min = 6, player_count_max = 6, duration = 210, genre = ARRAY['ミステリー重視'],
  updated_at = NOW()
WHERE id = '141cd049-2137-4b83-8b73-81418f99834e';

UPDATE scenario_masters SET
  author = 'EGG Mystery Club', player_count_min = 6, player_count_max = 6, official_duration = 210, genre = ARRAY['ミステリー重視'],
  updated_at = NOW()
WHERE id = '141cd049-2137-4b83-8b73-81418f99834e';

-- 67. 裁くもの、裁かれるもの
UPDATE scenarios SET
  author = 'のりっち', player_count_min = 9, player_count_max = 9, duration = 240, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = 'ae6f51ca-4d8d-4e4d-82ca-ffeaa539a88a';

UPDATE scenario_masters SET
  author = 'のりっち', player_count_min = 9, player_count_max = 9, official_duration = 240, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = 'ae6f51ca-4d8d-4e4d-82ca-ffeaa539a88a';

-- 68. リアルマダミス-盤上の教皇
UPDATE scenarios SET
  author = 'あそびばくろうさぎ', player_count_min = 5, player_count_max = 5,
  updated_at = NOW()
WHERE id = 'b8b03a7f-0cee-44b3-9fe4-93ee2c7989ae';

UPDATE scenario_masters SET
  author = 'あそびばくろうさぎ', player_count_min = 5, player_count_max = 5,
  updated_at = NOW()
WHERE id = 'b8b03a7f-0cee-44b3-9fe4-93ee2c7989ae';

-- 69. リアルマダミス-MurderWonderLand
UPDATE scenarios SET
  author = 'あそびばくろうさぎ', player_count_min = 5, player_count_max = 5,
  updated_at = NOW()
WHERE id = '49a09dfd-e3ff-49f9-acc9-7fa8255adeec';

UPDATE scenario_masters SET
  author = 'あそびばくろうさぎ', player_count_min = 5, player_count_max = 5,
  updated_at = NOW()
WHERE id = '49a09dfd-e3ff-49f9-acc9-7fa8255adeec';

-- 70. ロスト／リメンブランス
UPDATE scenarios SET
  author = '週末倶楽部', player_count_min = 6, player_count_max = 6, duration = 270, genre = ARRAY['新作', 'ミステリー重視'],
  updated_at = NOW()
WHERE id = '5d58701c-5e4b-4973-95b2-bb587b7c437a';

UPDATE scenario_masters SET
  author = '週末倶楽部', player_count_min = 6, player_count_max = 6, official_duration = 270, genre = ARRAY['新作', 'ミステリー重視'],
  updated_at = NOW()
WHERE id = '5d58701c-5e4b-4973-95b2-bb587b7c437a';

-- 71. 愛する故に
UPDATE scenarios SET
  author = 'マダミスHOUSE', player_count_min = 6, player_count_max = 6, duration = 240, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = '9f842705-df84-4110-9a87-14c9abfb08ac';

UPDATE scenario_masters SET
  author = 'マダミスHOUSE', player_count_min = 6, player_count_max = 6, official_duration = 240, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = '9f842705-df84-4110-9a87-14c9abfb08ac';

-- 72. TOOLS～ぎこちない椅子
UPDATE scenarios SET
  author = 'Light and Geek', player_count_min = 6, player_count_max = 6, duration = 240,
  updated_at = NOW()
WHERE id = 'fa48db32-8674-43a9-9ec8-ce38d306d735';

UPDATE scenario_masters SET
  author = 'Light and Geek', player_count_min = 6, player_count_max = 6, official_duration = 240,
  updated_at = NOW()
WHERE id = 'fa48db32-8674-43a9-9ec8-ce38d306d735';

-- 73. エンドロールは流れない
UPDATE scenarios SET
  author = 'さくべえ', player_count_min = 4, player_count_max = 4, duration = 240,
  updated_at = NOW()
WHERE id = '71be9c1d-b081-458f-9f6d-2360ff0d0133';

UPDATE scenario_masters SET
  author = 'さくべえ', player_count_min = 4, player_count_max = 4, official_duration = 240,
  updated_at = NOW()
WHERE id = '71be9c1d-b081-458f-9f6d-2360ff0d0133';

-- 74. エイダ
UPDATE scenarios SET
  author = 'いとはき', player_count_min = 5, player_count_max = 5, duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '04f118f0-343d-46f2-a356-a6eee3efd59b';

UPDATE scenario_masters SET
  author = 'いとはき', player_count_min = 5, player_count_max = 5, official_duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '04f118f0-343d-46f2-a356-a6eee3efd59b';

-- 75. 流年
UPDATE scenarios SET
  author = '週末倶楽部', player_count_min = 5, player_count_max = 5, duration = 360, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = '5c91242d-754a-4426-b468-5826f6ea2a2a';

UPDATE scenario_masters SET
  author = '週末倶楽部', player_count_min = 5, player_count_max = 5, official_duration = 360, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = '5c91242d-754a-4426-b468-5826f6ea2a2a';

-- 76. 殺神罪
UPDATE scenarios SET
  author = 'そがべ', player_count_min = 7, player_count_max = 7, duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '2b0dccc9-2617-4cac-90f6-1f9b7ffd7b9c';

UPDATE scenario_masters SET
  author = 'そがべ', player_count_min = 7, player_count_max = 7, official_duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '2b0dccc9-2617-4cac-90f6-1f9b7ffd7b9c';

-- 77. アンフィスバエナと聖女の祈り
UPDATE scenarios SET
  author = 'しゃみずい', player_count_min = 8, player_count_max = 8, duration = 240,
  updated_at = NOW()
WHERE id = 'b13aefa8-f75c-4b85-97d1-5f4271c11565';

UPDATE scenario_masters SET
  author = 'しゃみずい', player_count_min = 8, player_count_max = 8, official_duration = 240,
  updated_at = NOW()
WHERE id = 'b13aefa8-f75c-4b85-97d1-5f4271c11565';

-- 78. 女皇の書架
UPDATE scenarios SET
  author = 'OfficeKUMOKANA', player_count_min = 8, player_count_max = 8, duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '0526f828-de29-4b8f-bcde-1b1c44c436a5';

UPDATE scenario_masters SET
  author = 'OfficeKUMOKANA', player_count_min = 8, player_count_max = 8, official_duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '0526f828-de29-4b8f-bcde-1b1c44c436a5';

-- 79. 白殺しType-K
UPDATE scenarios SET
  author = 'OfficeKUMOKANA', player_count_min = 7, player_count_max = 7, duration = 150,
  updated_at = NOW()
WHERE id = '8caac8aa-0637-4724-9870-6bc558f52200';

UPDATE scenario_masters SET
  author = 'OfficeKUMOKANA', player_count_min = 7, player_count_max = 7, official_duration = 150,
  updated_at = NOW()
WHERE id = '8caac8aa-0637-4724-9870-6bc558f52200';

-- 80. 不思議の国の童話裁判
UPDATE scenarios SET
  author = 'みこ', player_count_min = 6, player_count_max = 6, duration = 240, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = 'c3206618-8947-4993-90bf-9b4677a4e636';

UPDATE scenario_masters SET
  author = 'みこ', player_count_min = 6, player_count_max = 6, official_duration = 240, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = 'c3206618-8947-4993-90bf-9b4677a4e636';

-- 81. 悪意の岐路に立つ
UPDATE scenarios SET
  author = '明日森マリー', player_count_min = 8, player_count_max = 8, duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = 'e0c01e4c-0a3d-44ab-82eb-fd5c2458e3c8';

UPDATE scenario_masters SET
  author = '明日森マリー', player_count_min = 8, player_count_max = 8, official_duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = 'e0c01e4c-0a3d-44ab-82eb-fd5c2458e3c8';

-- 82. 鳴神様のいうとおり
UPDATE scenarios SET
  author = 'リン', player_count_min = 6, player_count_max = 6, duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '99af084f-c049-49ba-b26e-338c722e9b00';

UPDATE scenario_masters SET
  author = 'リン', player_count_min = 6, player_count_max = 6, official_duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '99af084f-c049-49ba-b26e-338c722e9b00';

-- 83. 火ノ神様のいうとおり
UPDATE scenarios SET
  author = 'リン', player_count_min = 6, player_count_max = 6, duration = 210, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = 'e3683616-be38-4a58-a63a-0024da631cba';

UPDATE scenario_masters SET
  author = 'リン', player_count_min = 6, player_count_max = 6, official_duration = 210, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = 'e3683616-be38-4a58-a63a-0024da631cba';

-- 84. 朱き亡国に捧げる祈り
UPDATE scenarios SET
  author = 'コズミックミステリー', player_count_min = 7, player_count_max = 7, duration = 210,
  updated_at = NOW()
WHERE id = '22e6978b-1756-4d4d-b8dd-a418cafecc41';

UPDATE scenario_masters SET
  author = 'コズミックミステリー', player_count_min = 7, player_count_max = 7, official_duration = 210,
  updated_at = NOW()
WHERE id = '22e6978b-1756-4d4d-b8dd-a418cafecc41';

-- 85. 紫に染まる前に
UPDATE scenarios SET
  author = 'コズミックミステリー', player_count_min = 7, player_count_max = 7, duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = 'a14f585e-484c-4f72-9941-c16c9bd2bbb8';

UPDATE scenario_masters SET
  author = 'コズミックミステリー', player_count_min = 7, player_count_max = 7, official_duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = 'a14f585e-484c-4f72-9941-c16c9bd2bbb8';

-- 86. 黒の眺望
UPDATE scenarios SET
  author = 'コズミックミステリー', player_count_min = 7, player_count_max = 7, duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = 'ac00b40f-49e6-4ac0-95d1-e6537d65ab42';

UPDATE scenario_masters SET
  author = 'コズミックミステリー', player_count_min = 7, player_count_max = 7, official_duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = 'ac00b40f-49e6-4ac0-95d1-e6537d65ab42';

-- 87. 岐路に降り立つ
UPDATE scenarios SET
  author = 'The Riverie', player_count_min = 7, player_count_max = 7, duration = 240, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '718aef11-e6f6-4c54-ba0a-56843198a886';

UPDATE scenario_masters SET
  author = 'The Riverie', player_count_min = 7, player_count_max = 7, official_duration = 240, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '718aef11-e6f6-4c54-ba0a-56843198a886';

-- 88. Iwillex-
UPDATE scenarios SET
  author = 'リン', player_count_min = 8, player_count_max = 8, duration = 240, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '4f2cd320-530c-4e53-9fe5-72f37314f966';

UPDATE scenario_masters SET
  author = 'リン', player_count_min = 8, player_count_max = 8, official_duration = 240, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '4f2cd320-530c-4e53-9fe5-72f37314f966';

-- 89. DearmyD
UPDATE scenarios SET
  author = 'リン', player_count_min = 8, player_count_max = 8, duration = 270, genre = ARRAY['デスゲーム'],
  updated_at = NOW()
WHERE id = 'ec36c967-930f-473a-acf1-3a35e6bcf615';

UPDATE scenario_masters SET
  author = 'リン', player_count_min = 8, player_count_max = 8, official_duration = 270, genre = ARRAY['デスゲーム'],
  updated_at = NOW()
WHERE id = 'ec36c967-930f-473a-acf1-3a35e6bcf615';

-- 90. アオハループ
UPDATE scenarios SET
  author = 'コノハナストーリー', player_count_min = 7, player_count_max = 7, duration = 270, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '99fca6e5-dec8-45f3-b31f-4535a4502aae';

UPDATE scenario_masters SET
  author = 'コノハナストーリー', player_count_min = 7, player_count_max = 7, official_duration = 270, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '99fca6e5-dec8-45f3-b31f-4535a4502aae';

-- 91. 傲慢女王とアリスの不条理裁判
UPDATE scenarios SET
  author = 'コノハナストーリー', player_count_min = 7, player_count_max = 7, duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = 'dad348bd-0443-4a77-bd9a-f793d415746b';

UPDATE scenario_masters SET
  author = 'コノハナストーリー', player_count_min = 7, player_count_max = 7, official_duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = 'dad348bd-0443-4a77-bd9a-f793d415746b';

-- 92. BBA
UPDATE scenarios SET
  author = '2U project', player_count_min = 8, player_count_max = 8, duration = 300, genre = ARRAY['デスゲーム'],
  updated_at = NOW()
WHERE id = '0590541a-97dd-45e4-9746-c2efb4c8a99a';

UPDATE scenario_masters SET
  author = '2U project', player_count_min = 8, player_count_max = 8, official_duration = 300, genre = ARRAY['デスゲーム'],
  updated_at = NOW()
WHERE id = '0590541a-97dd-45e4-9746-c2efb4c8a99a';

-- 93. 季節／アニクシィ
UPDATE scenarios SET
  author = 'イバラユーギ', player_count_min = 7, player_count_max = 7, duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '0bc3a791-cf08-462e-8561-f14c9901f612';

UPDATE scenario_masters SET
  author = 'イバラユーギ', player_count_min = 7, player_count_max = 7, official_duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '0bc3a791-cf08-462e-8561-f14c9901f612';

-- 94. 季節／カノケリ
UPDATE scenarios SET
  author = 'イバラユーギ', player_count_min = 7, player_count_max = 7, duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '4ed4f1dd-e0d7-439a-8fe5-f3403105429a';

UPDATE scenario_masters SET
  author = 'イバラユーギ', player_count_min = 7, player_count_max = 7, official_duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '4ed4f1dd-e0d7-439a-8fe5-f3403105429a';

-- 95. 季節／シノポロ
UPDATE scenarios SET
  author = 'イバラユーギ', player_count_min = 7, player_count_max = 7, duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '1e1904f6-086d-4f85-ae48-9d5042d67237';

UPDATE scenario_masters SET
  author = 'イバラユーギ', player_count_min = 7, player_count_max = 7, official_duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '1e1904f6-086d-4f85-ae48-9d5042d67237';

-- 96. 季節／キモナス
UPDATE scenarios SET
  author = 'イバラユーギ', player_count_min = 7, player_count_max = 7, duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '5d38c7c8-c339-4c82-acd1-b1f5bb3da15d';

UPDATE scenario_masters SET
  author = 'イバラユーギ', player_count_min = 7, player_count_max = 7, official_duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '5d38c7c8-c339-4c82-acd1-b1f5bb3da15d';

-- 97. 星空のマリス
UPDATE scenarios SET
  author = 'イバラユーギ', player_count_min = 7, player_count_max = 7, duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '23a23145-2ef9-4fb5-b437-805a8278962e';

UPDATE scenario_masters SET
  author = 'イバラユーギ', player_count_min = 7, player_count_max = 7, official_duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '23a23145-2ef9-4fb5-b437-805a8278962e';

-- 98. 荒廃のマリス
UPDATE scenarios SET
  author = 'イバラユーギ', player_count_min = 7, player_count_max = 7, duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '56fc51d1-d0b8-488f-b41e-a9d41b817f0d';

UPDATE scenario_masters SET
  author = 'イバラユーギ', player_count_min = 7, player_count_max = 7, official_duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '56fc51d1-d0b8-488f-b41e-a9d41b817f0d';

-- 99. 彼女といるかとチョコレート
UPDATE scenarios SET
  author = 'コノハナストーリー', player_count_min = 6, player_count_max = 6, duration = 210, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = 'a8e6bc75-dba2-48e9-9be4-d7ecc456edb2';

UPDATE scenario_masters SET
  author = 'コノハナストーリー', player_count_min = 6, player_count_max = 6, official_duration = 210, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = 'a8e6bc75-dba2-48e9-9be4-d7ecc456edb2';

-- 100. 鉄紺の証言
UPDATE scenarios SET
  author = '滝崎はじめ', player_count_min = 8, player_count_max = 8, duration = 240, genre = ARRAY['ミステリー重視'],
  updated_at = NOW()
WHERE id = 'f8f555db-b75d-4cbb-9d87-d7f9e6d7fb8f';

UPDATE scenario_masters SET
  author = '滝崎はじめ', player_count_min = 8, player_count_max = 8, official_duration = 240, genre = ARRAY['ミステリー重視'],
  updated_at = NOW()
WHERE id = 'f8f555db-b75d-4cbb-9d87-d7f9e6d7fb8f';

-- 101. 彼とかじつとマシュマロウ
UPDATE scenarios SET
  author = 'コノハナストーリー', player_count_min = 6, player_count_max = 6, duration = 240, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = '411bcc9e-1cb7-49ed-8a06-e88bf1cf59c6';

UPDATE scenario_masters SET
  author = 'コノハナストーリー', player_count_min = 6, player_count_max = 6, official_duration = 240, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = '411bcc9e-1cb7-49ed-8a06-e88bf1cf59c6';

-- 102. 学校の解談
UPDATE scenarios SET
  author = 'コノハナストーリー', player_count_min = 7, player_count_max = 7, duration = 270, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '3d6c8409-52c0-4526-9e2f-0ffc6d0205e5';

UPDATE scenario_masters SET
  author = 'コノハナストーリー', player_count_min = 7, player_count_max = 7, official_duration = 270, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '3d6c8409-52c0-4526-9e2f-0ffc6d0205e5';

-- 103. 僕らの未来について
UPDATE scenarios SET
  author = 'ねこまみれ', player_count_min = 5, player_count_max = 5, duration = 180, genre = ARRAY['ミステリー重視'],
  updated_at = NOW()
WHERE id = 'cebb827f-9ee5-4cdd-b81a-8ee572e17410';

UPDATE scenario_masters SET
  author = 'ねこまみれ', player_count_min = 5, player_count_max = 5, official_duration = 180, genre = ARRAY['ミステリー重視'],
  updated_at = NOW()
WHERE id = 'cebb827f-9ee5-4cdd-b81a-8ee572e17410';

-- 104. フェイクドナー
UPDATE scenarios SET
  author = 'ジョイマダ', player_count_min = 6, player_count_max = 6,
  updated_at = NOW()
WHERE id = '2995e68d-0a62-47bf-83cd-75cb8e367ad9';

UPDATE scenario_masters SET
  author = 'ジョイマダ', player_count_min = 6, player_count_max = 6,
  updated_at = NOW()
WHERE id = '2995e68d-0a62-47bf-83cd-75cb8e367ad9';

-- 105. エデンの審判
UPDATE scenarios SET
  author = 'いの', player_count_min = 7, player_count_max = 7, duration = 240, genre = ARRAY['ミステリー重視', '経験者向け'],
  updated_at = NOW()
WHERE id = 'fc01e3ab-f548-4bc9-b0b3-156e0ace08a1';

UPDATE scenario_masters SET
  author = 'いの', player_count_min = 7, player_count_max = 7, official_duration = 240, genre = ARRAY['ミステリー重視', '経験者向け'],
  updated_at = NOW()
WHERE id = 'fc01e3ab-f548-4bc9-b0b3-156e0ace08a1';

-- 106. 裁判員の仮面
UPDATE scenarios SET
  author = 'OfficeKUMOKANA', player_count_min = 8, player_count_max = 8, duration = 240, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '02cfb898-9673-44d8-9bf6-a8df0d3738d5';

UPDATE scenario_masters SET
  author = 'OfficeKUMOKANA', player_count_min = 8, player_count_max = 8, official_duration = 240, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '02cfb898-9673-44d8-9bf6-a8df0d3738d5';

-- 107. SORCIER～賢者達の物語～
UPDATE scenarios SET
  author = 'グーニーカフェ', player_count_min = 4, player_count_max = 4, duration = 210, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = '74d2ce16-c782-4838-9833-e2c3a75c1a14';

UPDATE scenario_masters SET
  author = 'グーニーカフェ', player_count_min = 4, player_count_max = 4, official_duration = 210, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = '74d2ce16-c782-4838-9833-e2c3a75c1a14';

-- 108. MERCHANT
UPDATE scenarios SET
  author = 'そがべ', player_count_min = 6, player_count_max = 6, duration = 300, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = '2e453711-80f9-4f7c-b822-785ba406d302';

UPDATE scenario_masters SET
  author = 'そがべ', player_count_min = 6, player_count_max = 6, official_duration = 300, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = '2e453711-80f9-4f7c-b822-785ba406d302';

-- 109. 正義はまた蘇る
UPDATE scenarios SET
  author = '前原白夜', player_count_min = 5, player_count_max = 5, duration = 180, genre = ARRAY['ミステリー重視', 'RP重視'],
  updated_at = NOW()
WHERE id = '5d7ef2e5-f41c-4099-a823-fa24ea1116de';

UPDATE scenario_masters SET
  author = '前原白夜', player_count_min = 5, player_count_max = 5, official_duration = 180, genre = ARRAY['ミステリー重視', 'RP重視'],
  updated_at = NOW()
WHERE id = '5d7ef2e5-f41c-4099-a823-fa24ea1116de';

-- 110. 探偵撲滅
UPDATE scenarios SET
  author = 'そがべ', player_count_min = 7, player_count_max = 7, duration = 300, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = '8e519fde-6e54-4214-b82f-34ebc2b62cdb';

UPDATE scenario_masters SET
  author = 'そがべ', player_count_min = 7, player_count_max = 7, official_duration = 300, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = '8e519fde-6e54-4214-b82f-34ebc2b62cdb';

-- 111. readme.txt
UPDATE scenarios SET
  author = 'ほがらか', player_count_min = 6, player_count_max = 6, duration = 210,
  updated_at = NOW()
WHERE id = '5e9b20fd-773d-42bc-9cd7-5a331e6951c6';

UPDATE scenario_masters SET
  author = 'ほがらか', player_count_min = 6, player_count_max = 6, official_duration = 210,
  updated_at = NOW()
WHERE id = '5e9b20fd-773d-42bc-9cd7-5a331e6951c6';

-- 112. ドクター・テラスの秘密の実験
UPDATE scenarios SET
  author = '前原白夜 & 藤野将壱', player_count_min = 8, player_count_max = 8, duration = 210, genre = ARRAY['ミステリー重視'],
  updated_at = NOW()
WHERE id = 'c9b1f709-5a48-471b-905b-b11bf0973cfc';

UPDATE scenario_masters SET
  author = '前原白夜 & 藤野将壱', player_count_min = 8, player_count_max = 8, official_duration = 210, genre = ARRAY['ミステリー重視'],
  updated_at = NOW()
WHERE id = 'c9b1f709-5a48-471b-905b-b11bf0973cfc';

-- 113. 全能のパラドックス
UPDATE scenarios SET
  author = 'ほがらか', player_count_min = 7, player_count_max = 7, duration = 270, genre = ARRAY['ミステリー重視', '経験者向け'],
  updated_at = NOW()
WHERE id = '69022b12-6f63-497d-8928-3eaa1e5f8002';

UPDATE scenario_masters SET
  author = 'ほがらか', player_count_min = 7, player_count_max = 7, official_duration = 270, genre = ARRAY['ミステリー重視', '経験者向け'],
  updated_at = NOW()
WHERE id = '69022b12-6f63-497d-8928-3eaa1e5f8002';

-- 114. リトルワンダー
UPDATE scenarios SET
  author = 'へむへむ', player_count_min = 8, player_count_max = 8, duration = 210, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = 'f8380417-b995-4156-b9f4-a68cc966d1aa';

UPDATE scenario_masters SET
  author = 'へむへむ', player_count_min = 8, player_count_max = 8, official_duration = 210, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = 'f8380417-b995-4156-b9f4-a68cc966d1aa';

-- 115. 百鬼の夜、月光の影
UPDATE scenarios SET
  author = 'へむへむ', player_count_min = 7, player_count_max = 7, duration = 240, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = 'ab767606-ef03-44de-b087-8118a03bf152';

UPDATE scenario_masters SET
  author = 'へむへむ', player_count_min = 7, player_count_max = 7, official_duration = 240, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = 'ab767606-ef03-44de-b087-8118a03bf152';

-- 116. つわものどもが夢のあと
UPDATE scenarios SET
  author = '青鬼才', player_count_min = 8, player_count_max = 8, duration = 180,
  updated_at = NOW()
WHERE id = 'b0659f27-7245-4870-b982-19b0fc43ef81';

UPDATE scenario_masters SET
  author = '青鬼才', player_count_min = 8, player_count_max = 8, official_duration = 180,
  updated_at = NOW()
WHERE id = 'b0659f27-7245-4870-b982-19b0fc43ef81';

-- 117. ウロボロスの眠り
UPDATE scenarios SET
  author = 'リン', player_count_min = 8, player_count_max = 8, duration = 240,
  updated_at = NOW()
WHERE id = '7df8511d-895d-4494-9a22-c36af9445701';

UPDATE scenario_masters SET
  author = 'リン', player_count_min = 8, player_count_max = 8, official_duration = 240,
  updated_at = NOW()
WHERE id = '7df8511d-895d-4494-9a22-c36af9445701';

-- 118. 凍てつくあなたに６つの灯火
UPDATE scenarios SET
  author = '檜木田正史', player_count_min = 6, player_count_max = 6, duration = 240, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = '26ba52e5-dd15-419e-8e3c-b8f6e403b8c5';

UPDATE scenario_masters SET
  author = '檜木田正史', player_count_min = 6, player_count_max = 6, official_duration = 240, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = '26ba52e5-dd15-419e-8e3c-b8f6e403b8c5';

-- 119. へっどぎあ★ぱにっく
UPDATE scenarios SET
  author = 'じゅもく', player_count_min = 6, player_count_max = 6, duration = 210, genre = ARRAY['デスゲーム'],
  updated_at = NOW()
WHERE id = '7f56fe22-8745-4216-a7a2-efbe01dd8e44';

UPDATE scenario_masters SET
  author = 'じゅもく', player_count_min = 6, player_count_max = 6, official_duration = 210, genre = ARRAY['デスゲーム'],
  updated_at = NOW()
WHERE id = '7f56fe22-8745-4216-a7a2-efbe01dd8e44';

-- 120. ピタゴラスの篝火
UPDATE scenarios SET
  author = 'ましー', player_count_min = 7, player_count_max = 7, duration = 150,
  updated_at = NOW()
WHERE id = 'd55ecd37-cacf-4151-ab2f-b5a6d491c6ff';

UPDATE scenario_masters SET
  author = 'ましー', player_count_min = 7, player_count_max = 7, official_duration = 150,
  updated_at = NOW()
WHERE id = 'd55ecd37-cacf-4151-ab2f-b5a6d491c6ff';

-- 121. 狂気山脈　陰謀の分水嶺（１）
UPDATE scenarios SET
  author = 'まだら牛', player_count_min = 5, player_count_max = 5, duration = 240, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = 'b04ee3a5-bf80-4beb-98c8-82bf24ccf8a4';

UPDATE scenario_masters SET
  author = 'まだら牛', player_count_min = 5, player_count_max = 5, official_duration = 240, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = 'b04ee3a5-bf80-4beb-98c8-82bf24ccf8a4';

-- 122. 狂気山脈　星降る天辺（２）
UPDATE scenarios SET
  author = 'まだら牛', player_count_min = 5, player_count_max = 5, duration = 240, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = 'd97e7d5f-c1af-4047-ad9b-0b365922eb42';

UPDATE scenario_masters SET
  author = 'まだら牛', player_count_min = 5, player_count_max = 5, official_duration = 240, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = 'd97e7d5f-c1af-4047-ad9b-0b365922eb42';

-- 123. WORLDEND
UPDATE scenarios SET
  author = 'とんとん', player_count_min = 5, player_count_max = 5, duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = 'f7734911-e4bc-465b-ad52-79b2a1dcc2e1';

UPDATE scenario_masters SET
  author = 'とんとん', player_count_min = 5, player_count_max = 5, official_duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = 'f7734911-e4bc-465b-ad52-79b2a1dcc2e1';

-- 124. クリムゾンアート
UPDATE scenarios SET
  author = 'にっし＠ー', player_count_min = 6, player_count_max = 6, duration = 240, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = 'cdde674d-c71b-43d3-a016-18de263cd52c';

UPDATE scenario_masters SET
  author = 'にっし＠ー', player_count_min = 6, player_count_max = 6, official_duration = 240, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = 'cdde674d-c71b-43d3-a016-18de263cd52c';

-- 125. デモンズボックス
UPDATE scenarios SET
  author = '桜眠都', player_count_min = 6, player_count_max = 6, duration = 240, genre = ARRAY['デスゲーム'],
  updated_at = NOW()
WHERE id = '18d51b9f-f3be-4f81-87a3-a492fcc9e819';

UPDATE scenario_masters SET
  author = '桜眠都', player_count_min = 6, player_count_max = 6, official_duration = 240, genre = ARRAY['デスゲーム'],
  updated_at = NOW()
WHERE id = '18d51b9f-f3be-4f81-87a3-a492fcc9e819';

-- 126. 椅子戦争
UPDATE scenarios SET
  author = '桜眠都', player_count_min = 6, player_count_max = 6, duration = 240, genre = ARRAY['デスゲーム'],
  updated_at = NOW()
WHERE id = '1f72c4c7-81a6-4449-8c5d-fddbeed4bd6e';

UPDATE scenario_masters SET
  author = '桜眠都', player_count_min = 6, player_count_max = 6, official_duration = 240, genre = ARRAY['デスゲーム'],
  updated_at = NOW()
WHERE id = '1f72c4c7-81a6-4449-8c5d-fddbeed4bd6e';

-- 127. あくなき世界で嘘をうたう
UPDATE scenarios SET
  author = '小鳥谷びび', player_count_min = 7, player_count_max = 7, duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '6a38e3a8-c041-4704-a5e5-2af43b6f3466';

UPDATE scenario_masters SET
  author = '小鳥谷びび', player_count_min = 7, player_count_max = 7, official_duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '6a38e3a8-c041-4704-a5e5-2af43b6f3466';

-- 128. クリエイターズハイ
UPDATE scenarios SET
  author = 'イバラユーギ', player_count_min = 8, player_count_max = 8, duration = 210, genre = ARRAY['経験者向け'],
  updated_at = NOW()
WHERE id = '6ff3e69d-00f9-4eaa-86fe-1bc49d523d04';

UPDATE scenario_masters SET
  author = 'イバラユーギ', player_count_min = 8, player_count_max = 8, official_duration = 210, genre = ARRAY['経験者向け'],
  updated_at = NOW()
WHERE id = '6ff3e69d-00f9-4eaa-86fe-1bc49d523d04';

-- 129. ヤノハのフタリ
UPDATE scenarios SET
  author = 'しゃみずい', player_count_min = 7, player_count_max = 7, duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '92fc276b-acd5-43c8-8c25-e82ffae414a6';

UPDATE scenario_masters SET
  author = 'しゃみずい', player_count_min = 7, player_count_max = 7, official_duration = 210, genre = ARRAY['ロングセラー'],
  updated_at = NOW()
WHERE id = '92fc276b-acd5-43c8-8c25-e82ffae414a6';

-- 130. Recollection
UPDATE scenarios SET
  author = 'いの', player_count_min = 8, player_count_max = 8, duration = 240,
  updated_at = NOW()
WHERE id = 'ec504083-10d1-45b7-9cec-6bdb438a5dbb';

UPDATE scenario_masters SET
  author = 'いの', player_count_min = 8, player_count_max = 8, official_duration = 240,
  updated_at = NOW()
WHERE id = 'ec504083-10d1-45b7-9cec-6bdb438a5dbb';

-- 131. WANTEDz
UPDATE scenarios SET
  author = 'Scape Goat', player_count_min = 8, player_count_max = 8, duration = 210,
  updated_at = NOW()
WHERE id = 'b7a15822-ba0d-454d-b99a-e7b132f1086b';

UPDATE scenario_masters SET
  author = 'Scape Goat', player_count_min = 8, player_count_max = 8, official_duration = 210,
  updated_at = NOW()
WHERE id = 'b7a15822-ba0d-454d-b99a-e7b132f1086b';

-- 132. スターループ
UPDATE scenarios SET
  author = 'イバラユーギ', player_count_min = 7, player_count_max = 7, duration = 150,
  updated_at = NOW()
WHERE id = 'ad91cc91-09cf-4800-af63-12e68d08d9db';

UPDATE scenario_masters SET
  author = 'イバラユーギ', player_count_min = 7, player_count_max = 7, official_duration = 150,
  updated_at = NOW()
WHERE id = 'ad91cc91-09cf-4800-af63-12e68d08d9db';

-- 133. 南極地点X
UPDATE scenarios SET
  author = 'ココフォリア', player_count_min = 5, player_count_max = 5, duration = 180, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = '1eed17f3-389c-405e-ba9c-ab3c286d4d7f';

UPDATE scenario_masters SET
  author = 'ココフォリア', player_count_min = 5, player_count_max = 5, official_duration = 180, genre = ARRAY['RP重視'],
  updated_at = NOW()
WHERE id = '1eed17f3-389c-405e-ba9c-ab3c286d4d7f';

COMMIT;

-- 合計 133 件のシナリオを更新