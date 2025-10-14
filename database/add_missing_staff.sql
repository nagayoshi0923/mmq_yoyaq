-- 不足しているスタッフを追加
--
-- GMデータで使用されているが、データベースに存在しないスタッフを追加
-- 既に存在するスタッフはスキップされます（WHERE NOT EXISTS）


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  'BB' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = 'BB'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  'Remia（れみあ）' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = 'Remia（れみあ）'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  'kanade' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = 'kanade'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  'labo' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = 'labo'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  'あんころ' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = 'あんころ'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  'えりん' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = 'えりん'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  'きゅう' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = 'きゅう'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  'しらやま' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = 'しらやま'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  'だいこん' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = 'だいこん'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  'つばめ' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = 'つばめ'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  'ぴよな' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = 'ぴよな'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  'ほがらか' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = 'ほがらか'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  'ぽったー' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = 'ぽったー'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  'ぽん' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = 'ぽん'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  'みくみん' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = 'みくみん'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  'みずき' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = 'みずき'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  'らの' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = 'らの'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  'りえぞー' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = 'りえぞー'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  'りんな' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = 'りんな'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  'れいにー' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = 'れいにー'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  'イワセモリシ' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = 'イワセモリシ'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  'ソウタン' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = 'ソウタン'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  'ソラ' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = 'ソラ'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  'ミカノハ' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = 'ミカノハ'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  '八継じの' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = '八継じの'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  '古賀' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = '古賀'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  '奏兎' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = '奏兎'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  '崎' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = '崎'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  '松井（まつい）' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = '松井（まつい）'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  '江波（えなみん）' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = '江波（えなみん）'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  '渚咲' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = '渚咲'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  '温風リン' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = '温風リン'
);


INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  '藤崎ソルト' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = '藤崎ソルト'
);


SELECT '✅ 不足していたスタッフを追加しました' as status;

-- 追加結果の確認
SELECT 
  COUNT(*) as 追加されたスタッフ数
FROM staff
WHERE created_at >= NOW() - INTERVAL '1 minute';
