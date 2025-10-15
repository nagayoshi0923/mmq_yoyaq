-- シナリオ名の表記ゆれを修正し、scenario_idを設定する

-- 1. 「季節マーダー／カノケリ」→ マスタに存在する正しいタイトルに修正
-- シナリオマスタのタイトルを確認
SELECT id, title FROM scenarios WHERE title LIKE '%季節%' OR title LIKE '%カノケリ%';

-- 2. 「人狼村の悲劇」→ マスタのタイトルを確認
SELECT id, title FROM scenarios WHERE title LIKE '%人狼%';

-- 3. 「学園の秘密」→ マスタのタイトルを確認
SELECT id, title FROM scenarios WHERE title LIKE '%学園%';

-- 4. 「企業の陰謀」→ マスタのタイトルを確認
SELECT id, title FROM scenarios WHERE title LIKE '%企業%';

-- 5. 「古代遺跡の秘密」→ マスタのタイトルを確認
SELECT id, title FROM scenarios WHERE title LIKE '%古代%' OR title LIKE '%遺跡%';

-- 6. 「古城の呪い」→ マスタのタイトルを確認
SELECT id, title FROM scenarios WHERE title LIKE '%古城%';

-- 7. 「密室の謎」→ マスタのタイトルを確認
SELECT id, title FROM scenarios WHERE title LIKE '%密室%';

-- 8. 「戦国武将の陰謀」→ マスタのタイトルを確認
SELECT id, title FROM scenarios WHERE title LIKE '%戦国%';

-- 9. 「季節のマーダーミステリー／ニィホン」→ マスタのタイトルを確認
SELECT id, title FROM scenarios WHERE title LIKE '%ニィホン%';

-- 10. 「時をかける少女」→ マスタのタイトルを確認
SELECT id, title FROM scenarios WHERE title LIKE '%時をかける%';

-- ===== 全シナリオマスタ一覧 =====
SELECT id, title, author FROM scenarios ORDER BY title;

