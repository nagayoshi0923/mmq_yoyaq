-- シナリオ給料一括更新SQL
-- 計算式: 正規料金 = 基本給2,000円 + 時給1,300円 × 時間
--         GMテスト = 時給1,300円 × 時間（基本給なし）
-- 生成日時: 2025/12/26 9:41:21

BEGIN;

-- 00テスト (2h): 正規4600円, GMテスト2600円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":4600,"category":"normal"}]'::jsonb WHERE id = '56409641-61f3-4dfa-964f-d4b4366f1eb8';

-- 02てすとぴょん (2h): 正規4600円, GMテスト2600円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":4600,"category":"normal"}]'::jsonb WHERE id = '6f5a9f19-6b25-4a59-a450-79a25bcbf79e';

-- 5DIVE (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '6eb2ba57-0008-4924-b0fc-d30eaef3da56';

-- BBA (5h): 正規8500円, GMテスト6500円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":8500,"category":"normal"},{"role":"main","reward":6500,"category":"gmtest"}]'::jsonb WHERE id = '0590541a-97dd-45e4-9746-c2efb4c8a99a';

-- BeatSpecter (3h): 正規5900円, GMテスト3900円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5900,"category":"normal"},{"role":"main","reward":3900,"category":"gmtest"}]'::jsonb WHERE id = '8f3b37b5-5d0b-413b-aac9-99676be53aa1';

-- BrightChoice (4.5h): 正規7850円, GMテスト5850円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7850,"category":"normal"},{"role":"main","reward":5850,"category":"gmtest"}]'::jsonb WHERE id = '3099fb6f-3969-404f-a50d-7eec273aec72';

-- DearmyD (4.5h): 正規7850円, GMテスト5850円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7850,"category":"normal"},{"role":"main","reward":5850,"category":"gmtest"}]'::jsonb WHERE id = 'ec36c967-930f-473a-acf1-3a35e6bcf615';

-- ENIGMACODE廃棄ミライの犠牲者たち (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '2f2a3b0e-662c-4c0b-ace0-52b57eb40912';

-- Factor (3h): 正規5900円, GMテスト3900円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5900,"category":"normal"},{"role":"main","reward":3900,"category":"gmtest"}]'::jsonb WHERE id = 'ad7fcbe8-462b-4303-bbd9-ba22be71e48c';

-- GARDENリーガー殺人事件 (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '73912835-b208-4c20-a97d-bcc7b4784053';

-- GM殺人事件 (3h): 正規5900円, GMテスト3900円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5900,"category":"normal"},{"role":"main","reward":3900,"category":"gmtest"}]'::jsonb WHERE id = '8df79260-4732-462f-a5e9-2bf32e8523e1';

-- Grape (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = 'afd5d814-f3d3-4e4f-b7a3-cb6526fbd012';

-- inthebox～長い熱病 (5.5h): 正規9150円, GMテスト7150円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":9150,"category":"normal"},{"role":"main","reward":7150,"category":"gmtest"}]'::jsonb WHERE id = '0e28345d-de75-423f-a431-935ecf148bd0';

-- Invisible-亡霊列車- (2h): 正規4600円, GMテスト2600円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":4600,"category":"normal"},{"role":"main","reward":2600,"category":"gmtest"}]'::jsonb WHERE id = 'f853524a-c859-411b-b4a7-c2fad5f6af8f';

-- Iwillex- (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '4f2cd320-530c-4e53-9fe5-72f37314f966';

-- Jazzy (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '51f6624d-32d8-4435-a6ec-ea9658cea64e';

-- MERCHANT (5.5h): 正規9150円, GMテスト7150円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":9150,"category":"normal"},{"role":"main","reward":7150,"category":"gmtest"}]'::jsonb WHERE id = '2e453711-80f9-4f7c-b822-785ba406d302';

-- MissingLink（ミッシングリンク） (3h): 正規5900円, GMテスト3900円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5900,"category":"normal"},{"role":"main","reward":3900,"category":"gmtest"}]'::jsonb WHERE id = 'cc2d8bfa-f23a-4d34-8419-22292ae7daa3';

-- OVER KILL (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"}]'::jsonb WHERE id = '08025326-0d6b-41d5-917b-f9c0fa482869';

-- readme.txt (3.3333333333333335h): 正規6333円, GMテスト4333円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6333,"category":"normal"},{"role":"main","reward":4333,"category":"gmtest"}]'::jsonb WHERE id = '5e9b20fd-773d-42bc-9cd7-5a331e6951c6';

-- Recollection (4.5h): 正規7850円, GMテスト5850円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7850,"category":"normal"},{"role":"main","reward":5850,"category":"gmtest"}]'::jsonb WHERE id = 'ec504083-10d1-45b7-9cec-6bdb438a5dbb';

-- REDRUM01泉涌館の変転 (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = 'c75e086c-b30e-47f9-9143-ebd1bc74e5bc';

-- REDRUM02虚像のF (3h): 正規5900円, GMテスト3900円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5900,"category":"normal"},{"role":"main","reward":3900,"category":"gmtest"}]'::jsonb WHERE id = '6e20bbfe-d97a-4388-ab5e-95b5a1d91bcd';

-- REDRUM03致命的観測をもう一度 (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '743184b3-e1ac-4170-8f57-0347b5eb526d';

-- REDRUM4アルテミスの断罪 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '5f055db3-751c-4493-afc3-041d8b8796ce';

-- SORCIER～賢者達の物語～ (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '74d2ce16-c782-4838-9833-e2c3a75c1a14';

-- TheRealFork30's (3h): 正規5900円, GMテスト3900円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5900,"category":"normal"},{"role":"main","reward":3900,"category":"gmtest"}]'::jsonb WHERE id = '33fa053e-00d0-4cc2-bca8-e7341b3fdf17';

-- TOOLS～ぎこちない椅子 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'fa48db32-8674-43a9-9ec8-ce38d306d735';

-- WANTEDz (3h): 正規5900円, GMテスト3900円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5900,"category":"normal"},{"role":"main","reward":3900,"category":"gmtest"}]'::jsonb WHERE id = 'b7a15822-ba0d-454d-b99a-e7b132f1086b';

-- WORLDEND (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = 'f7734911-e4bc-465b-ad52-79b2a1dcc2e1';

-- アオハルーツ (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '047f043b-3e7f-4221-a1e7-23a3490ef349';

-- アオハループ (4.5h): 正規7850円, GMテスト5850円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7850,"category":"normal"},{"role":"main","reward":5850,"category":"gmtest"}]'::jsonb WHERE id = '99fca6e5-dec8-45f3-b31f-4535a4502aae';

-- あくなき世界で嘘をうたう (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '6a38e3a8-c041-4704-a5e5-2af43b6f3466';

-- あの夏のアンタレス (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '3612e554-1761-4f1f-80e4-0a682dbbbf15';

-- あるマーダーミステリーについて (3h): 正規5900円, GMテスト3900円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5900,"category":"normal"},{"role":"main","reward":3900,"category":"gmtest"}]'::jsonb WHERE id = '5ff9a1b2-9433-4d34-9741-d84c702ba323';

-- ある悪魔の儀式について (2.5h): 正規5250円, GMテスト3250円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5250,"category":"normal"},{"role":"main","reward":3250,"category":"gmtest"}]'::jsonb WHERE id = '81f5ab85-7ea1-4743-be3b-5d7d1ad478ae';

-- アンシンメトリー (3h): 正規5900円, GMテスト3900円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5900,"category":"normal"},{"role":"main","reward":3900,"category":"gmtest"}]'::jsonb WHERE id = 'efb5f0f3-81ea-45c3-8ba0-2692abdc52d1';

-- アンドロイドは愛を知らない (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'a592c44e-be98-4fb5-a7ae-39c5ce688b6a';

-- アンフィスバエナと聖女の祈り (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'b13aefa8-f75c-4b85-97d1-5f4271c11565';

-- イナイコサガシ (2h): 正規4600円, GMテスト2600円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":4600,"category":"normal"},{"role":"main","reward":2600,"category":"gmtest"}]'::jsonb WHERE id = '2251580b-70f3-4676-a9c4-c787906be34a';

-- ウロボロスの眠り (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '7df8511d-895d-4494-9a22-c36af9445701';

-- エイダ (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '04f118f0-343d-46f2-a356-a6eee3efd59b';

-- エデンの審判 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'fc01e3ab-f548-4bc9-b0b3-156e0ace08a1';

-- エンドロールは流れない (4.5h): 正規7850円, GMテスト5850円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7850,"category":"normal"},{"role":"main","reward":5850,"category":"gmtest"}]'::jsonb WHERE id = '71be9c1d-b081-458f-9f6d-2360ff0d0133';

-- オペレーション：ゴーストウィング (3h): 正規5900円, GMテスト3900円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5900,"category":"normal"},{"role":"main","reward":3900,"category":"gmtest"}]'::jsonb WHERE id = '8ea6b586-3d71-40a1-be84-b79dc211db33';

-- キヲクの方舟 (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '87ec07a9-43da-44ea-bbdd-5127321abe92';

-- キングを殺すには (4.5h): 正規7850円, GMテスト5850円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7850,"category":"normal"},{"role":"main","reward":5850,"category":"gmtest"}]'::jsonb WHERE id = 'f814e4fd-d016-491f-b65e-8407dbadd5e8';

-- くずの葉のもり (3h): 正規5900円, GMテスト3900円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5900,"category":"normal"},{"role":"main","reward":3900,"category":"gmtest"}]'::jsonb WHERE id = 'c918b1c9-1086-4e4c-8849-1f6927951751';

-- クリエイターズハイ (3.8333333333333335h): 正規6983円, GMテスト4983円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6983,"category":"normal"},{"role":"main","reward":4983,"category":"gmtest"}]'::jsonb WHERE id = '6ff3e69d-00f9-4eaa-86fe-1bc49d523d04';

-- クリムゾンアート (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'cdde674d-c71b-43d3-a016-18de263cd52c';

-- クロノフォビア (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'ea11f6c6-f687-409a-bef3-558d1e15f018';

-- グロリアメモリーズ (4.5h): 正規7850円, GMテスト5850円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7850,"category":"normal"},{"role":"main","reward":5850,"category":"gmtest"}]'::jsonb WHERE id = '9ff79eca-de9a-41b3-a7da-a12a59c560c6';

-- ゴージャスマンション (2.5h): 正規5250円, GMテスト3250円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5250,"category":"normal"},{"role":"main","reward":3250,"category":"gmtest"}]'::jsonb WHERE id = '268c96a6-7f04-4462-a100-69f686f2ff1d';

-- この闇をあなたと (4.5h): 正規7850円, GMテスト5850円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7850,"category":"normal"},{"role":"main","reward":5850,"category":"gmtest"}]'::jsonb WHERE id = 'bae919b3-cd0b-444a-8683-49c76b5d3a82';

-- こぼれた情景 (4.5h): 正規7850円, GMテスト5850円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7850,"category":"normal"},{"role":"main","reward":5850,"category":"gmtest"}]'::jsonb WHERE id = '400b9967-7999-473a-b607-9d626cf22f7a';

-- コロシタバッドエンド (2.5h): 正規5250円, GMテスト3250円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5250,"category":"normal"}]'::jsonb WHERE id = '53b4035e-ea8b-4118-8cb5-6dd1e7786928';

-- スターループ (2.75h): 正規5575円, GMテスト3575円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5575,"category":"normal"},{"role":"main","reward":3575,"category":"gmtest"}]'::jsonb WHERE id = 'ad91cc91-09cf-4800-af63-12e68d08d9db';

-- すべては山荘から始まる。 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'af7e4449-ffab-4f05-a20c-a5b20dd036de';

-- ゼロ・オルビット (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"}]'::jsonb WHERE id = '34a34ba3-5bf4-45e8-be1f-f21791f47c16';

-- ゼロの爆弾 (2.5h): 正規5250円, GMテスト3250円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5250,"category":"normal"},{"role":"main","reward":3250,"category":"gmtest"}]'::jsonb WHERE id = 'b519ce76-fed0-45c4-9c12-0be0acbb650d';

-- その白衣は誰が為に (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '4f0c3914-5b61-41ab-bfaf-cba0d7006f41';

-- ツイン号沈没事故に関する考察 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '86d53a83-8db3-4e46-baca-8dd47f1b3dce';

-- ツグミドリ (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '67f46fc2-1d54-492f-9f38-58201cdcff97';

-- つわものどもが夢のあと (3h): 正規5900円, GMテスト3900円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5900,"category":"normal"},{"role":"main","reward":3900,"category":"gmtest"}]'::jsonb WHERE id = 'b0659f27-7245-4870-b982-19b0fc43ef81';

-- テセウスの方舟 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '66d2b382-a25d-4208-8812-bbe4b5d2eff2';

-- デモンズボックス (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '18d51b9f-f3be-4f81-87a3-a492fcc9e819';

-- ドクター・テラスの秘密の実験 (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = 'c9b1f709-5a48-471b-905b-b11bf0973cfc';

-- ナナイロの迷宮 橙 オンラインゲーム殺人事件 (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = 'cb357453-8efa-4174-a9e4-83a595d9db71';

-- ナナイロの迷宮 緑 アペイロン研究所殺人事件 (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '6dad00fd-4d84-4c77-8fc6-4bf5831b423e';

-- ナナイロの迷宮 黄 エレクトリカル吹奏楽部殺人事件 (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = 'deac793b-5a90-4478-89fb-b5e85e1cdde8';

-- バベルの末裔 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '7ff84521-fb7d-4951-9203-a61fdbfe7c29';

-- ヒーロースクランブル (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '32501334-298f-4266-9463-41df87c97549';

-- ひぐらしのなく頃に　恨返し編 (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '112554a2-b917-4860-9449-3f9826fb9b25';

-- ピタゴラスの篝火 (3h): 正規5900円, GMテスト3900円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5900,"category":"normal"},{"role":"main","reward":3900,"category":"gmtest"}]'::jsonb WHERE id = 'd55ecd37-cacf-4151-ab2f-b5a6d491c6ff';

-- ファレンデスライヒ (2h): 正規4600円, GMテスト2600円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":4600,"category":"normal"},{"role":"main","reward":2600,"category":"gmtest"}]'::jsonb WHERE id = 'f40e6db6-2d3d-4c28-9f3e-2b872f245785';

-- フェイクアブダクション (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'e9e20c84-f823-4365-a7f0-3137eb5b8396';

-- フェイクドナー (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '2995e68d-0a62-47bf-83cd-75cb8e367ad9';

-- ブラックナイトスレイヴ (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '87e82720-bb82-40c7-bd20-645fa328482b';

-- ブルーダイヤの不在証明 (3h): 正規5900円, GMテスト3900円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5900,"category":"normal"},{"role":"main","reward":3900,"category":"gmtest"}]'::jsonb WHERE id = '8f352b2f-2824-44b7-a068-3e9daf477974';

-- へっどぎあ★ぱにっく (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '7f56fe22-8745-4216-a7a2-efbe01dd8e44';

-- マーダー・オブ・パイレーツ (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'b30e19a2-558a-44cf-8439-b54f94de8a7a';

-- マーダーオブエクスプローラー失われし大秘宝 (3h): 正規5900円, GMテスト3900円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5900,"category":"normal"},{"role":"main","reward":3900,"category":"gmtest"}]'::jsonb WHERE id = 'e1816c25-0289-4da7-b681-5301e18c4aed';

-- モノクローム (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'aa97aa46-3ea7-4ff1-955d-49fdb4bdd96b';

-- ヤノハのフタリ (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '92fc276b-acd5-43c8-8c25-e82ffae414a6';

-- ユートピアース (2.75h): 正規5575円, GMテスト3575円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5575,"category":"normal"},{"role":"main","reward":3575,"category":"gmtest"}]'::jsonb WHERE id = '893cfaa8-cebf-46f2-be62-48bd7e70d7e8';

-- リアルマダミス-MurderWonderLand (3h): 正規5900円, GMテスト3900円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5900,"category":"normal"},{"role":"main","reward":3900,"category":"gmtest"}]'::jsonb WHERE id = '49a09dfd-e3ff-49f9-acc9-7fa8255adeec';

-- リアルマダミス-盤上の教皇 (3h): 正規5900円, GMテスト3900円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5900,"category":"normal"},{"role":"main","reward":3900,"category":"gmtest"}]'::jsonb WHERE id = 'b8b03a7f-0cee-44b3-9fe4-93ee2c7989ae';

-- リトルワンダー (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = 'f8380417-b995-4156-b9f4-a68cc966d1aa';

-- ロスト／リメンブランス (4.5h): 正規7850円, GMテスト5850円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7850,"category":"normal"},{"role":"main","reward":5850,"category":"gmtest"}]'::jsonb WHERE id = '5d58701c-5e4b-4973-95b2-bb587b7c437a';

-- ロックドドア殺人 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '3e296e1d-5cc3-422a-a708-de15c83010d1';

-- 一条家の人々 (3h): 正規5900円, GMテスト3900円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5900,"category":"normal"},{"role":"main","reward":3900,"category":"gmtest"}]'::jsonb WHERE id = 'cd09c1ed-75d9-4526-b6a4-1715837b82fa';

-- 七股高校 (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '3c95a12b-3cc0-41aa-8170-ba7c5453280b';

-- 不思議の国の童話裁判 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'c3206618-8947-4993-90bf-9b4677a4e636';

-- 九十九談 - 厄災の箱 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '5755382c-dcb6-4a13-8d41-efdf19b36322';

-- 人狼デスゲームからの挑戦 (2h): 正規4600円, GMテスト2600円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":4600,"category":"normal"},{"role":"main","reward":2600,"category":"gmtest"}]'::jsonb WHERE id = '0f1b8324-ae95-4841-ac17-733fb95c52f3';

-- 人狼を語る館 (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = 'a648771f-d46d-43e3-b3bb-251ed430acfb';

-- 人類最後の皆様へ／終末の眠り姫 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '6859853f-149c-4e07-9370-421f72ce5f1f';

-- 今日も涙の雨が降る (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '1cc5af53-553a-415d-bbd7-5d8e4ad3d1b9';

-- 傲慢女王とアリスの不条理裁判 (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = 'dad348bd-0443-4a77-bd9a-f793d415746b';

-- 僕らの未来について (3h): 正規5900円, GMテスト3900円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5900,"category":"normal"},{"role":"main","reward":3900,"category":"gmtest"}]'::jsonb WHERE id = 'cebb827f-9ee5-4cdd-b81a-8ee572e17410';

-- 全能のパラドックス (4.5h): 正規7850円, GMテスト5850円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7850,"category":"normal"},{"role":"main","reward":5850,"category":"gmtest"}]'::jsonb WHERE id = '69022b12-6f63-497d-8928-3eaa1e5f8002';

-- 凍てつくあなたに６つの灯火 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '26ba52e5-dd15-419e-8e3c-b8f6e403b8c5';

-- 凪の鬼籍 (4.5h): 正規7850円, GMテスト5850円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7850,"category":"normal"}]'::jsonb WHERE id = '2fa12d15-5c27-462d-b1eb-33bf8f739c07';

-- 午前2時7分 (3h): 正規5900円, GMテスト3900円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5900,"category":"normal"},{"role":"main","reward":3900,"category":"gmtest"}]'::jsonb WHERE id = 'df6fada5-03c9-4e37-b6b8-7b6ffb06b0cc';

-- 南極地点X (2.5h): 正規5250円, GMテスト3250円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5250,"category":"normal"},{"role":"main","reward":3250,"category":"gmtest"}]'::jsonb WHERE id = '1eed17f3-389c-405e-ba9c-ab3c286d4d7f';

-- 口裂け女の微笑み・Mの悪意 (3h): 正規5900円, GMテスト3900円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5900,"category":"normal"},{"role":"main","reward":3900,"category":"gmtest"}]'::jsonb WHERE id = '676dd3a9-f8c0-40bf-b139-fb0395ab78cd';

-- 古鐘のなる頃に (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '1e9052d7-3474-4ba1-9d9c-093a04e2dc13';

-- 名探偵と四嶺館 (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = 'c57d157d-9d7d-4d29-9235-00583994823f';

-- 告別詩（取引中止） (5h): 正規8500円, GMテスト6500円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":8500,"category":"normal"},{"role":"main","reward":6500,"category":"gmtest"}]'::jsonb WHERE id = '05239cbe-4d81-4ba4-9bf6-f5480ec0f008';

-- 呪縛姫 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'ec06f16a-e639-49cc-9f98-3780044236be';

-- 土牢に悲鳴は谺して (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'ea46f978-c6b8-43df-92bf-428f6a2a6537';

-- 境界線のカーサスベリ (4.5h): 正規7850円, GMテスト5850円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7850,"category":"normal"},{"role":"main","reward":5850,"category":"gmtest"}]'::jsonb WHERE id = '5d3bd6a7-b4ec-4d38-8555-c0aa38daccda';

-- 天使は花明かりの下で (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'eef3f87d-a591-47ae-ac2d-726b713eb66d';

-- 天邪河（あまのじゃく） (4.5h): 正規7850円, GMテスト5850円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7850,"category":"normal"},{"role":"main","reward":5850,"category":"gmtest"}]'::jsonb WHERE id = '7120bfe9-b47f-44c2-99b6-3330eda55b19';

-- 奪うもの、奪われるもの (5.5h): 正規9150円, GMテスト7150円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":9150,"category":"normal"},{"role":"main","reward":7150,"category":"gmtest"}]'::jsonb WHERE id = 'bd71b99e-710a-47a6-a0d0-75a0e3e80e67';

-- 女王と偽りのマテリアル (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'dfce6ae1-568d-4a06-89fc-950cac836398';

-- 女皇の書架 (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '0526f828-de29-4b8f-bcde-1b1c44c436a5';

-- 妖怪たちと月夜の刀 (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = 'a066805d-0fbe-4893-ba74-4900f5661e27';

-- 季節／アニクシィ (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '0bc3a791-cf08-462e-8561-f14c9901f612';

-- 季節／カノケリ (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '4ed4f1dd-e0d7-439a-8fe5-f3403105429a';

-- 季節／キモナス (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '5d38c7c8-c339-4c82-acd1-b1f5bb3da15d';

-- 季節／シノポロ (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '1e1904f6-086d-4f85-ae48-9d5042d67237';

-- 季節／ニィホン (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'cb802ffb-2f54-4136-8b4e-a30b25be585b';

-- 学校の解談 (4.5h): 正規7850円, GMテスト5850円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7850,"category":"normal"},{"role":"main","reward":5850,"category":"gmtest"}]'::jsonb WHERE id = '3d6c8409-52c0-4526-9e2f-0ffc6d0205e5';

-- 小暮事件に関する考察 (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '2ee618a3-9848-43f9-8060-e6c4ba9468b0';

-- 少年少女Aの独白 (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '8bcc833b-a801-4137-ae9b-469d3dca315c';

-- 岐路に降り立つ (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '718aef11-e6f6-4c54-ba0a-56843198a886';

-- 幻想のマリス (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'c016e05c-6cb9-4746-9c77-21ac72a70a74';

-- 廻る弾丸輪舞（ダンガンロンド） (2.5h): 正規5250円, GMテスト3250円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5250,"category":"normal"},{"role":"main","reward":3250,"category":"gmtest"}]'::jsonb WHERE id = '315fe1b2-8ee3-4b19-a3bd-b7bd1f5698d1';

-- 彗星蘭の万朶 (4.5h): 正規7850円, GMテスト5850円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7850,"category":"normal"},{"role":"main","reward":5850,"category":"gmtest"}]'::jsonb WHERE id = '2c35606f-f335-46ac-aea2-8db3b35f6f48';

-- 彼とかじつとマシュマロウ (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '411bcc9e-1cb7-49ed-8a06-e88bf1cf59c6';

-- 彼女といるかとチョコレート (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = 'a8e6bc75-dba2-48e9-9be4-d7ecc456edb2';

-- 悪意の岐路に立つ (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'e0c01e4c-0a3d-44ab-82eb-fd5c2458e3c8';

-- 想いは満天の星に (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '0f0147a1-da74-489b-a71d-0f8d6f38da1c';

-- 愛する故に (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '9f842705-df84-4110-9a87-14c9abfb08ac';

-- 或ル胡蝶ノ夢 (4.5h): 正規7850円, GMテスト5850円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7850,"category":"normal"},{"role":"main","reward":5850,"category":"gmtest"}]'::jsonb WHERE id = 'c8d818e8-1826-46cb-b06a-dbae304e9103';

-- 探ぱんマーダーミステリー・ノーショーツトルダム学園殺人事件 (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '4d540d6f-bab4-4b5d-8b29-17de9c431f6e';

-- 探偵撲滅 (5h): 正規8500円, GMテスト6500円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":8500,"category":"normal"},{"role":"main","reward":6500,"category":"gmtest"}]'::jsonb WHERE id = '8e519fde-6e54-4214-b82f-34ebc2b62cdb';

-- 新世界のユキサキ (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'db71f4cb-2039-44d7-96dd-5e662a54b63b';

-- 星 (4.5h): 正規7850円, GMテスト5850円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7850,"category":"normal"},{"role":"main","reward":5850,"category":"gmtest"}]'::jsonb WHERE id = '25650f94-b349-4c9c-a849-179b5d01f5b0';

-- 星空のマリス (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '23a23145-2ef9-4fb5-b437-805a8278962e';

-- 曙光のエテルナ (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'b02468ef-750d-4d21-a93e-59c84bb038ea';

-- 月光の偽桜 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '06efd802-2f9a-4116-b5eb-684c4f480eef';

-- 朱き亡国に捧げる祈り (3.8333333333333335h): 正規6983円, GMテスト4983円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6983,"category":"normal"},{"role":"main","reward":4983,"category":"gmtest"}]'::jsonb WHERE id = '22e6978b-1756-4d4d-b8dd-a418cafecc41';

-- 桜の散る夜に (2h): 正規4600円, GMテスト2600円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":4600,"category":"normal"},{"role":"main","reward":2600,"category":"gmtest"}]'::jsonb WHERE id = '1a2dc765-681c-491d-9ecf-e6b72e0749b4';

-- 椅子戦争 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '1f72c4c7-81a6-4449-8c5d-fddbeed4bd6e';

-- 機巧人形の心臓 (4.5h): 正規7850円, GMテスト5850円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7850,"category":"normal"},{"role":"main","reward":5850,"category":"gmtest"}]'::jsonb WHERE id = '4589f5d5-24b4-40f8-8743-769d91ad83bf';

-- 檻見る5人 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '579287ec-75e9-43ca-85d3-dd59bbc8969e';

-- 正義はまた蘇る (3h): 正規5900円, GMテスト3900円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5900,"category":"normal"},{"role":"main","reward":3900,"category":"gmtest"}]'::jsonb WHERE id = '5d7ef2e5-f41c-4099-a823-fa24ea1116de';

-- 歯に噛むあなたに (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'd022c755-dd94-45f4-af22-7f20371a3eba';

-- 殺人鬼Xの独白 (3h): 正規5900円, GMテスト3900円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5900,"category":"normal"},{"role":"main","reward":3900,"category":"gmtest"}]'::jsonb WHERE id = 'f58ee592-1253-43e0-a8e9-4c560777eba0';

-- 殺人鬼イバラノミチの回想録 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '53b93de4-2f9d-42ed-b0b8-e4ac6a0a379d';

-- 殺神罪 (3.8333333333333335h): 正規6983円, GMテスト4983円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6983,"category":"normal"},{"role":"main","reward":4983,"category":"gmtest"}]'::jsonb WHERE id = '2b0dccc9-2617-4cac-90f6-1f9b7ffd7b9c';

-- 流年 (6h): 正規9800円, GMテスト7800円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":9800,"category":"normal"},{"role":"main","reward":7800,"category":"gmtest"}]'::jsonb WHERE id = '5c91242d-754a-4426-b468-5826f6ea2a2a';

-- 深海に沈む子供たち（水底に生きる） (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'a7614da4-2ceb-4a6d-9de8-91f8999576ca';

-- 清流館の秘宝 (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = 'c370349c-3474-4085-b8b0-fd2eb5004236';

-- 漣の向こう側 (3h): 正規5900円, GMテスト3900円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5900,"category":"normal"},{"role":"main","reward":3900,"category":"gmtest"}]'::jsonb WHERE id = '311a0e25-7254-4510-808e-eafdb5a2c062';

-- 火ノ神様のいうとおり (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = 'e3683616-be38-4a58-a63a-0024da631cba';

-- 燔祭のジェミニ (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = 'cccfff62-3027-4784-866e-7f9fdd5fa9aa';

-- 狂気山脈　2.5　頂上戦争 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '2dc57d0b-846f-4cf7-9958-9f4d39dcfdea';

-- 狂気山脈　星降る天辺（２） (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'd97e7d5f-c1af-4047-ad9b-0b365922eb42';

-- 狂気山脈　薄明三角点（３） (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '4d2db632-61df-4fc6-b971-fb371f613fbf';

-- 狂気山脈　陰謀の分水嶺（１） (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'b04ee3a5-bf80-4beb-98c8-82bf24ccf8a4';

-- 異能特区シンギュラリティ (3.3333333333333335h): 正規6333円, GMテスト4333円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6333,"category":"normal"},{"role":"main","reward":4333,"category":"gmtest"}]'::jsonb WHERE id = 'a9504f21-34fb-4d23-9dcf-b7b0e9d23fb0';

-- 白殺しType-K (2.75h): 正規5575円, GMテスト3575円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5575,"category":"normal"},{"role":"main","reward":3575,"category":"gmtest"}]'::jsonb WHERE id = '8caac8aa-0637-4724-9870-6bc558f52200';

-- 百鬼の夜、月光の影 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'ab767606-ef03-44de-b087-8118a03bf152';

-- 真・渋谷陰陽奇譚 (3.8333333333333335h): 正規6983円, GMテスト4983円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6983,"category":"normal"},{"role":"main","reward":4983,"category":"gmtest"}]'::jsonb WHERE id = 'a03eedc4-0f25-4a24-a9e1-03b617a33f45';

-- 空色時箱 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '6f510774-efb1-46d9-b751-db2a6d13ca90';

-- 立方館 (6.75h): 正規10775円, GMテスト8775円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":10775,"category":"normal"},{"role":"main","reward":8775,"category":"gmtest"}]'::jsonb WHERE id = 'd6a863b6-86db-4698-8e67-afd0eb098393';

-- 紅く舞う (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '141cd049-2137-4b83-8b73-81418f99834e';

-- 紫に染まる前に (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = 'a14f585e-484c-4f72-9941-c16c9bd2bbb8';

-- 絆の永逝 (4.5h): 正規7850円, GMテスト5850円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7850,"category":"normal"},{"role":"main","reward":5850,"category":"gmtest"}]'::jsonb WHERE id = 'df56c405-cd2d-49dc-9e34-3fa0d8657eef';

-- 花咲の箱庭 (3h): 正規5900円, GMテスト3900円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5900,"category":"normal"},{"role":"main","reward":3900,"category":"gmtest"}]'::jsonb WHERE id = '4d785763-65d0-46e9-a5d4-de7eb8bb390c';

-- 花街リグレット (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'b68123d4-5dfd-4b62-a736-852942544bd4';

-- 荒廃のマリス (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '56fc51d1-d0b8-488f-b41e-a9d41b817f0d';

-- 藍雨廻逢 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '044d9255-3588-4b43-80fb-33ef495c5792';

-- 蝉散 (4.5h): 正規7850円, GMテスト5850円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7850,"category":"normal"},{"role":"main","reward":5850,"category":"gmtest"}]'::jsonb WHERE id = 'd2d4a483-2c57-4180-854e-87ac6f34f770';

-- 蟻集 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '10f8465f-b078-401a-bc96-437dd522e9f4';

-- 裁くもの、裁かれるもの (4.5h): 正規7850円, GMテスト5850円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7850,"category":"normal"},{"role":"main","reward":5850,"category":"gmtest"}]'::jsonb WHERE id = 'ae6f51ca-4d8d-4e4d-82ca-ffeaa539a88a';

-- 裁判員の仮面 (3.8333333333333335h): 正規6983円, GMテスト4983円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6983,"category":"normal"},{"role":"main","reward":4983,"category":"gmtest"}]'::jsonb WHERE id = '02cfb898-9673-44d8-9bf6-a8df0d3738d5';

-- 裂き子さん (3.3333333333333335h): 正規6333円, GMテスト4333円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6333,"category":"normal"},{"role":"main","reward":4333,"category":"gmtest"}]'::jsonb WHERE id = '983cd9a9-6441-4f90-b179-0451b22cadd5';

-- 親方の館 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'b3fedcea-b5ab-4ace-b41b-4ea5c8c86325';

-- 誠実な十字架 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'bbb22474-d3da-4440-8007-63f309fcbfae';

-- 贖罪のロザリオ (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'd37c1624-1afd-48a2-81cd-b8838062c99f';

-- 赤の導線 (4.5h): 正規7850円, GMテスト5850円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7850,"category":"normal"},{"role":"main","reward":5850,"category":"gmtest"}]'::jsonb WHERE id = 'f0241a55-814d-48b1-b0bb-61b298f7f077';

-- 赤鬼が泣いた夜 (3h): 正規5900円, GMテスト3900円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":5900,"category":"normal"},{"role":"main","reward":3900,"category":"gmtest"}]'::jsonb WHERE id = 'acba0bd2-6747-4cb2-a47f-bee67b765cee';

-- 超特急の呪いの館で撮れ高足りてますか？ (3.8333333333333335h): 正規6983円, GMテスト4983円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6983,"category":"normal"},{"role":"main","reward":4983,"category":"gmtest"}]'::jsonb WHERE id = '63e9b98a-870f-4851-aa7a-6e5c019b540b';

-- 違人 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '812c0d26-65ac-427a-8da9-16bbabfc89c9';

-- 野槌 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '204b565a-8f35-45bb-99e8-ec435443a50b';

-- 鉄紺の証言 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'f8f555db-b75d-4cbb-9d87-d7f9e6d7fb8f';

-- 銀世界のアシアト (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '941df533-8722-4db9-8aa3-ab86d537cdd1';

-- 電脳の檻のアリス (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = '170b3bb2-201c-4c8e-bfcc-6421afa3a125';

-- 霧に眠るは幾つの罪 (5.75h): 正規9475円, GMテスト7475円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":9475,"category":"normal"},{"role":"main","reward":7475,"category":"gmtest"}]'::jsonb WHERE id = 'ebbc7622-7657-437d-bf85-7c8477ef9454';

-- 鬼哭館の殺人事件 (4.5h): 正規7850円, GMテスト5850円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7850,"category":"normal"},{"role":"main","reward":5850,"category":"gmtest"}]'::jsonb WHERE id = '5a5b7b2f-50e1-4789-bd37-c63d5d59d31d';

-- 魂を運ぶ飛行船 (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '05265de3-432e-4680-8d59-bd85aa9ebeef';

-- 魔女の聖餐式 (4h): 正規7200円, GMテスト5200円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7200,"category":"normal"},{"role":"main","reward":5200,"category":"gmtest"}]'::jsonb WHERE id = 'ac57db06-614d-481a-823e-c6f75f621575';

-- 鳴神様のいうとおり (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '99af084f-c049-49ba-b26e-338c722e9b00';

-- 鹿神館の罪人 (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = '5bd57e45-b35e-459a-afcf-329daf5215de';

-- 黒い森の獣part1 (4.5h): 正規7850円, GMテスト5850円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7850,"category":"normal"},{"role":"main","reward":5850,"category":"gmtest"}]'::jsonb WHERE id = '694639d4-bf5e-49c2-ae20-9862a0e225c4';

-- 黒い森の獣part2人と狼 (4.5h): 正規7850円, GMテスト5850円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":7850,"category":"normal"},{"role":"main","reward":5850,"category":"gmtest"}]'::jsonb WHERE id = '117c11e8-8414-4789-9f40-e1ab4b68a61c';

-- 黒と白の狭間に (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = 'f517468f-f230-4069-8538-4058f1600052';

-- 黒の眺望 (3.5h): 正規6550円, GMテスト4550円
UPDATE scenarios SET gm_costs = '[{"role":"main","reward":6550,"category":"normal"},{"role":"main","reward":4550,"category":"gmtest"}]'::jsonb WHERE id = 'ac00b40f-49e6-4ac0-95d1-e6537d65ab42';

COMMIT;

-- 確認用クエリ
-- SELECT title, duration, gm_costs FROM scenarios ORDER BY title;
