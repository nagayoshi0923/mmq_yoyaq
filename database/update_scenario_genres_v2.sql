-- Queens Waltz シナリオ カテゴリー更新SQL
-- 生成日: 2026-01-08
-- カタログから抽出: https://queenswaltz.jp/catalog
-- 対象シナリオ数: 133

-- organization_id の取得
-- SELECT id FROM organizations WHERE name ILIKE '%クインズワルツ%' OR name ILIKE '%queens%';

-- ============================================
-- シナリオごとのgenre更新
-- ============================================

-- その白衣は誰が為に
UPDATE scenarios SET genre = ARRAY['新作', '情報量多め', 'RP重視'], participation_fee = 4500, player_count_min = 7, player_count_max = 7, duration = 4.0
WHERE title = 'その白衣は誰が為に' OR title ILIKE '%その白衣は誰が為に%';

-- 曙光のエテルナ
UPDATE scenarios SET genre = ARRAY['新作', 'RP重視', 'オススメ'], participation_fee = 4500, player_count_min = 8, player_count_max = 8, duration = 4.0
WHERE title = '曙光のエテルナ' OR title ILIKE '%曙光のエテルナ%';

-- コロシタバッドエンド
UPDATE scenarios SET genre = ARRAY['新作', 'RP重視'], participation_fee = 4000, player_count_min = 5, player_count_max = 5
WHERE title = 'コロシタバッドエンド' OR title ILIKE '%コロシタバッドエンド%';

-- ゼロ・オルビット
UPDATE scenarios SET genre = ARRAY['新作', 'RP重視'], participation_fee = 4500, player_count_min = 6, player_count_max = 6
WHERE title = 'ゼロ・オルビット' OR title ILIKE '%ゼロ・オルビット%';

-- OVER KILL
UPDATE scenarios SET genre = ARRAY['デスゲーム', 'RP重視', '新作'], player_count_min = 10, player_count_max = 10, duration = 4.0
WHERE title = 'OVER KILL' OR title ILIKE '%OVER KILL%';

-- テセウスの方舟
UPDATE scenarios SET genre = ARRAY['新作', 'オススメ'], participation_fee = 4500, player_count_min = 7, player_count_max = 7, duration = 4.0
WHERE title = 'テセウスの方舟' OR title ILIKE '%テセウスの方舟%';

-- 妖怪たちと月夜の刀
UPDATE scenarios SET genre = ARRAY['RP重視', 'オススメ', '新作'], participation_fee = 4500, player_count_min = 8, player_count_max = 8
WHERE title = '妖怪たちと月夜の刀' OR title ILIKE '%妖怪たちと月夜の刀%';

-- 異能特区シンギュラリティ
UPDATE scenarios SET genre = ARRAY['RP重視'], participation_fee = 4500, player_count_min = 7, player_count_max = 7
WHERE title = '異能特区シンギュラリティ' OR title ILIKE '%異能特区シンギュラリティ%';

-- 凪の鬼籍
UPDATE scenarios SET genre = ARRAY['新作'], participation_fee = 5000, player_count_min = 7, player_count_max = 7
WHERE title = '凪の鬼籍' OR title ILIKE '%凪の鬼籍%';

-- 絆の永逝
UPDATE scenarios SET genre = ARRAY['ロングセラー'], participation_fee = 5000, player_count_min = 7, player_count_max = 7
WHERE title = '絆の永逝' OR title ILIKE '%絆の永逝%';

-- ブルーダイヤの不在証明
UPDATE scenarios SET genre = ARRAY['新作', 'ミステリー'], player_count_min = 4, player_count_max = 4, duration = 3.0
WHERE title = 'ブルーダイヤの不在証明' OR title ILIKE '%ブルーダイヤの不在証明%';

-- ある悪魔の儀式について
UPDATE scenarios SET genre = ARRAY['新作', '経験者限定', 'ミステリー'], player_count_min = 6, player_count_max = 6
WHERE title = 'ある悪魔の儀式について' OR title ILIKE '%ある悪魔の儀式について%';

-- 蟻集
UPDATE scenarios SET genre = ARRAY['新作', '事前読み込み可能', '情報量多め', 'ロングセラー'], participation_fee = 5000, player_count_min = 7, player_count_max = 7, duration = 4.0
WHERE title = '蟻集' OR title ILIKE '%蟻集%';

-- 蝉散
UPDATE scenarios SET genre = ARRAY['新作', '事前読み込み可能', '情報量多め', 'ロングセラー'], player_count_min = 7, player_count_max = 7
WHERE title = '蝉散' OR title ILIKE '%蝉散%';

-- オペレーションゴーストウィング
UPDATE scenarios SET genre = ARRAY['RP重視', '新作'], participation_fee = 4500, player_count_min = 6, player_count_max = 6, duration = 3.0
WHERE title = 'オペレーションゴーストウィング' OR title ILIKE '%オペレーションゴーストウィング%';

-- REDRUM04 アルテミスの断罪
UPDATE scenarios SET genre = ARRAY['デスゲーム', '新作', '経験者限定', '駆け引き重視'], participation_fee = 4500, player_count_min = 7, player_count_max = 7, duration = 4.0
WHERE title = 'REDRUM04 アルテミスの断罪' OR title ILIKE '%REDRUM04 アルテミスの断罪%';

-- 藍雨廻逢
UPDATE scenarios SET genre = ARRAY['新作', 'RP重視'], participation_fee = 4500, player_count_min = 8, player_count_max = 8, duration = 4.0
WHERE title = '藍雨廻逢' OR title ILIKE '%藍雨廻逢%';

-- 怪異探偵倶楽部 case01:赤鬼が泣いた夜
UPDATE scenarios SET genre = ARRAY['新作', 'ミステリー'], participation_fee = 4500, player_count_min = 5, player_count_max = 5, duration = 3.0
WHERE title = '怪異探偵倶楽部 case01:赤鬼が泣いた夜' OR title ILIKE '%怪異探偵倶楽部 case01:赤鬼が泣いた夜%';

-- 超特急の呪いの館で撮れ高足りてますか？
UPDATE scenarios SET genre = ARRAY['新作'], participation_fee = 5000, player_count_min = 9, player_count_max = 9
WHERE title = '超特急の呪いの館で撮れ高足りてますか？' OR title ILIKE '%超特急の呪いの館で撮れ高足りてますか？%';

-- ENIGMA CODE 廃棄ミライの犠牲者たち
UPDATE scenarios SET genre = ARRAY['新作', '駆け引き重視'], participation_fee = 4500, player_count_min = 7, player_count_max = 7, duration = 4.0
WHERE title = 'ENIGMA CODE 廃棄ミライの犠牲者たち' OR title ILIKE '%ENIGMA CODE 廃棄ミライの犠牲者たち%';

-- 漣の向こう側
UPDATE scenarios SET genre = ARRAY['新作'], participation_fee = 4500, player_count_min = 6, player_count_max = 6, duration = 3.0
WHERE title = '漣の向こう側' OR title ILIKE '%漣の向こう側%';

-- ゼロの爆弾
UPDATE scenarios SET genre = ARRAY['新作'], participation_fee = 4000, player_count_min = 5, player_count_max = 5
WHERE title = 'ゼロの爆弾' OR title ILIKE '%ゼロの爆弾%';

-- 境界線のカーサスベリ
UPDATE scenarios SET genre = ARRAY['新作', 'オススメ', '駆け引き重視', 'RP重視'], participation_fee = 5000, player_count_min = 8, player_count_max = 8
WHERE title = '境界線のカーサスベリ' OR title ILIKE '%境界線のカーサスベリ%';

-- 月光の偽桜
UPDATE scenarios SET genre = ARRAY['新作', 'オススメ', '駆け引き重視', 'RP重視'], participation_fee = 4500, player_count_min = 8, player_count_max = 8, duration = 4.0
WHERE title = '月光の偽桜' OR title ILIKE '%月光の偽桜%';

-- 新世界のユキサキ
UPDATE scenarios SET genre = ARRAY['ミステリー', 'オススメ', '新作', 'RP重視', '経験者限定', '情報量多め', '期間限定6/1〜10/31まで'], participation_fee = 5000, player_count_min = 8, player_count_max = 8, duration = 4.0
WHERE title = '新世界のユキサキ' OR title ILIKE '%新世界のユキサキ%';

-- 彗星蘭の万朶
UPDATE scenarios SET genre = ARRAY['オススメ', '新作'], participation_fee = 5000, player_count_min = 7, player_count_max = 7
WHERE title = '彗星蘭の万朶' OR title ILIKE '%彗星蘭の万朶%';

-- invisible -亡霊列車-
UPDATE scenarios SET genre = ARRAY['新作'], participation_fee = 3500, player_count_min = 4, player_count_max = 4, duration = 2.0
WHERE title = 'invisible -亡霊列車-' OR title ILIKE '%invisible -亡霊列車-%';

-- REDRUM03 致命的観測をもう一度
UPDATE scenarios SET genre = ARRAY['オススメ', 'ミステリー'], participation_fee = 4500, player_count_min = 6, player_count_max = 6
WHERE title = 'REDRUM03 致命的観測をもう一度' OR title ILIKE '%REDRUM03 致命的観測をもう一度%';

-- REDRUM02 虚像のF
UPDATE scenarios SET genre = ARRAY['ロングセラー'], participation_fee = 4500, player_count_min = 6, player_count_max = 6
WHERE title = 'REDRUM02 虚像のF' OR title ILIKE '%REDRUM02 虚像のF%';

-- REDRUM01 泉涌館の変転
UPDATE scenarios SET genre = ARRAY['オススメ', 'ロングセラー', 'ミステリー'], participation_fee = 4000, player_count_min = 7, player_count_max = 7
WHERE title = 'REDRUM01 泉涌館の変転' OR title ILIKE '%REDRUM01 泉涌館の変転%';

-- THE REAL FOLK ''30s
UPDATE scenarios SET genre = ARRAY['新作', 'RP重視'], participation_fee = 4500, player_count_min = 5, player_count_max = 5, duration = 3.0
WHERE title = 'THE REAL FOLK ''30s' OR title ILIKE '%THE REAL FOLK ''30s%';

-- 廻る弾丸輪舞曲
UPDATE scenarios SET genre = ARRAY['新作', '駆け引き重視', 'RP重視'], participation_fee = 4000, player_count_min = 5, player_count_max = 5, duration = 2.0
WHERE title = '廻る弾丸輪舞曲' OR title ILIKE '%廻る弾丸輪舞曲%';

-- くずの葉のもり
UPDATE scenarios SET genre = ARRAY['新作', 'RP重視', '文章量多め'], participation_fee = 4500, player_count_min = 7, player_count_max = 7, duration = 3.0
WHERE title = 'くずの葉のもり' OR title ILIKE '%くずの葉のもり%';

-- マーダー・オブ・エクスプローラー　失われし大秘宝
UPDATE scenarios SET genre = ARRAY['新作'], participation_fee = 4500, player_count_min = 6, player_count_max = 6, duration = 3.0
WHERE title = 'マーダー・オブ・エクスプローラー　失われし大秘宝' OR title ILIKE '%マーダー・オブ・エクスプローラー　失われし大秘宝%';

-- 電脳の檻のアリス
UPDATE scenarios SET genre = ARRAY['オススメ', '新作', 'RP重視'], participation_fee = 5000, player_count_min = 7, player_count_max = 7, duration = 4.0
WHERE title = '電脳の檻のアリス' OR title ILIKE '%電脳の檻のアリス%';

-- 魂を運ぶ飛行船
UPDATE scenarios SET genre = ARRAY['新作', 'RP重視'], participation_fee = 4500, player_count_min = 5, player_count_max = 5
WHERE title = '魂を運ぶ飛行船' OR title ILIKE '%魂を運ぶ飛行船%';

-- アンドロイドは愛を知らない
UPDATE scenarios SET genre = ARRAY['新作', 'RP重視', 'オススメ'], participation_fee = 4500, player_count_min = 6, player_count_max = 6, duration = 4.0
WHERE title = 'アンドロイドは愛を知らない' OR title ILIKE '%アンドロイドは愛を知らない%';

-- 真・渋谷陰陽奇譚
UPDATE scenarios SET genre = ARRAY['新作', 'RP重視', 'オススメ'], participation_fee = 4500, player_count_min = 7, player_count_max = 7
WHERE title = '真・渋谷陰陽奇譚' OR title ILIKE '%真・渋谷陰陽奇譚%';

-- 立方館
UPDATE scenarios SET genre = ARRAY['新作', 'オススメ', 'ミステリー', '経験者限定', '情報量多め'], participation_fee = 9000, player_count_min = 6, player_count_max = 6, duration = 7.0
WHERE title = '立方館' OR title ILIKE '%立方館%';

-- 霧に眠るは幾つの罪
UPDATE scenarios SET genre = ARRAY['オススメ', 'ミステリー', '新作', '経験者限定', '情報量多め'], player_count_min = 8, player_count_max = 8, duration = 6.0
WHERE title = '霧に眠るは幾つの罪' OR title ILIKE '%霧に眠るは幾つの罪%';

-- 銀世界のアシアト
UPDATE scenarios SET genre = ARRAY['新作', 'ミステリー', 'RP重視', '情報量多め'], player_count_min = 8, player_count_max = 8, duration = 4.0
WHERE title = '銀世界のアシアト' OR title ILIKE '%銀世界のアシアト%';

-- ユートピアース
UPDATE scenarios SET genre = ARRAY['オススメ', '新作', '駆け引き重視'], player_count_min = 5, player_count_max = 5
WHERE title = 'ユートピアース' OR title ILIKE '%ユートピアース%';

-- 燔祭のジェミニ
UPDATE scenarios SET genre = ARRAY['RP重視', '新作'], player_count_min = 7, player_count_max = 7
WHERE title = '燔祭のジェミニ' OR title ILIKE '%燔祭のジェミニ%';

-- ✨ 新作
UPDATE scenarios SET genre = ARRAY['新作', '和風', 'ミステリー'], player_count_min = 7, player_count_max = 7
WHERE title = '✨ 新作' OR title ILIKE '%✨ 新作%';

-- この闇をあなたと
UPDATE scenarios SET genre = ARRAY['オススメ', '経験者限定', '新作', '情報量多め'], player_count_min = 6, player_count_max = 6
WHERE title = 'この闇をあなたと' OR title ILIKE '%この闇をあなたと%';

-- 花街リグレット
UPDATE scenarios SET genre = ARRAY['オススメ', '和風', '新作'], player_count_min = 8, player_count_max = 8, duration = 4.0
WHERE title = '花街リグレット' OR title ILIKE '%花街リグレット%';

-- 天邪河
UPDATE scenarios SET genre = ARRAY['新作', 'RP重視', 'オススメ'], player_count_min = 7, player_count_max = 7
WHERE title = '天邪河' OR title ILIKE '%天邪河%';

-- 誠実な十字架
UPDATE scenarios SET genre = ARRAY['オススメ', '新作'], player_count_min = 8, player_count_max = 8, duration = 4.0
WHERE title = '誠実な十字架' OR title ILIKE '%誠実な十字架%';

-- 季節のマーダーミステリー「ニィホン」
UPDATE scenarios SET genre = ARRAY['ロングセラー', '新作'], player_count_min = 7, player_count_max = 7
WHERE title = '季節のマーダーミステリー「ニィホン」' OR title ILIKE '%季節のマーダーミステリー「ニィホン」%';

-- 狂気山脈 3.0 薄明三角点（第３弾）
UPDATE scenarios SET genre = ARRAY['ロングセラー', 'RP重視'], player_count_min = 5, player_count_max = 5, duration = 4.0
WHERE title = '狂気山脈 3.0 薄明三角点（第３弾）' OR title ILIKE '%狂気山脈 3.0 薄明三角点（第３弾）%';

-- 狂気山脈 2.5 頂上戦争（第４弾）
UPDATE scenarios SET genre = ARRAY['ロングセラー', 'RP重視'], player_count_min = 5, player_count_max = 5, duration = 4.0
WHERE title = '狂気山脈 2.5 頂上戦争（第４弾）' OR title ILIKE '%狂気山脈 2.5 頂上戦争（第４弾）%';

-- 小暮事件に関する考察
UPDATE scenarios SET genre = ARRAY['ミステリー'], player_count_min = 6, player_count_max = 6
WHERE title = '小暮事件に関する考察' OR title ILIKE '%小暮事件に関する考察%';

-- あるマーダーミステリーについて
UPDATE scenarios SET genre = ARRAY['ミステリー', '経験者限定'], player_count_min = 5, player_count_max = 5, duration = 3.0
WHERE title = 'あるマーダーミステリーについて' OR title ILIKE '%あるマーダーミステリーについて%';

-- 赤の導線
UPDATE scenarios SET genre = ARRAY['RP重視'], player_count_min = 6, player_count_max = 6
WHERE title = '赤の導線' OR title ILIKE '%赤の導線%';

-- 黒と白の狭間に
UPDATE scenarios SET genre = ARRAY['ロングセラー', 'RP重視', 'ミステリー'], player_count_min = 8, player_count_max = 8
WHERE title = '黒と白の狭間に' OR title ILIKE '%黒と白の狭間に%';

-- 天使は花明かりの下で
UPDATE scenarios SET genre = ARRAY['RP重視'], player_count_min = 5, player_count_max = 5, duration = 4.0
WHERE title = '天使は花明かりの下で' OR title ILIKE '%天使は花明かりの下で%';

-- クロノフォビア
UPDATE scenarios SET genre = ARRAY['駆け引き重視'], player_count_min = 7, player_count_max = 7, duration = 4.0
WHERE title = 'クロノフォビア' OR title ILIKE '%クロノフォビア%';

-- 裂き子さん
UPDATE scenarios SET genre = ARRAY['ロングセラー'], player_count_min = 6, player_count_max = 6
WHERE title = '裂き子さん' OR title ILIKE '%裂き子さん%';

-- 歯に噛むあなたに
UPDATE scenarios SET genre = ARRAY['経験者限定'], player_count_min = 8, player_count_max = 8, duration = 4.0
WHERE title = '歯に噛むあなたに' OR title ILIKE '%歯に噛むあなたに%';

-- モノクローム
UPDATE scenarios SET genre = ARRAY['RP重視', 'ミステリー'], player_count_min = 6, player_count_max = 6, duration = 4.0
WHERE title = 'モノクローム' OR title ILIKE '%モノクローム%';

-- 5DIVE
UPDATE scenarios SET genre = ARRAY['RP重視', 'ミステリー'], player_count_min = 6, player_count_max = 6, duration = 4.0
WHERE title = '5DIVE' OR title ILIKE '%5DIVE%';

-- グロリアメモリーズ
UPDATE scenarios SET genre = ARRAY['RP重視'], participation_fee = 5000, player_count_min = 10, player_count_max = 10
WHERE title = 'グロリアメモリーズ' OR title ILIKE '%グロリアメモリーズ%';

-- Bright Choice
UPDATE scenarios SET genre = ARRAY['ロングセラー', 'RP重視'], participation_fee = 5000, player_count_min = 9, player_count_max = 9
WHERE title = 'Bright Choice' OR title ILIKE '%Bright Choice%';

-- 或ル胡蝶ノ夢
UPDATE scenarios SET genre = ARRAY['和風', 'RP重視'], player_count_min = 8, player_count_max = 8, duration = 4.0
WHERE title = '或ル胡蝶ノ夢' OR title ILIKE '%或ル胡蝶ノ夢%';

-- 野槌
UPDATE scenarios SET genre = ARRAY['ミステリー'], player_count_min = 8, player_count_max = 8, duration = 4.0
WHERE title = '野槌' OR title ILIKE '%野槌%';

-- 紅く舞う
UPDATE scenarios SET genre = ARRAY['ミステリー'], player_count_min = 6, player_count_max = 6
WHERE title = '紅く舞う' OR title ILIKE '%紅く舞う%';

-- 裁くもの、裁かれるもの
UPDATE scenarios SET genre = ARRAY['ロングセラー', 'ミステリー', 'RP重視'], participation_fee = 5000, player_count_min = 9, player_count_max = 9, duration = 4.0
WHERE title = '裁くもの、裁かれるもの' OR title ILIKE '%裁くもの、裁かれるもの%';

-- 盤上の教皇
UPDATE scenarios SET genre = ARRAY['RP重視'], duration = 3.0
WHERE title = '盤上の教皇' OR title ILIKE '%盤上の教皇%';

-- Murder Wonder land
UPDATE scenarios SET genre = ARRAY['RP重視'], duration = 3.0
WHERE title = 'Murder Wonder land' OR title ILIKE '%Murder Wonder land%';

-- LOST/Remembrance
UPDATE scenarios SET genre = ARRAY['新作', 'ミステリー'], player_count_min = 6, player_count_max = 6
WHERE title = 'LOST/Remembrance' OR title ILIKE '%LOST/Remembrance%';

-- 愛する故に
UPDATE scenarios SET genre = ARRAY['RP重視'], player_count_min = 6, player_count_max = 6, duration = 4.0
WHERE title = '愛する故に' OR title ILIKE '%愛する故に%';

-- エンドロールは流れない
UPDATE scenarios SET genre = ARRAY['RP重視'], player_count_min = 4, player_count_max = 4
WHERE title = 'エンドロールは流れない' OR title ILIKE '%エンドロールは流れない%';

-- エイダ
UPDATE scenarios SET genre = ARRAY['ロングセラー', 'RP重視'], participation_fee = 4500, player_count_min = 5, player_count_max = 5
WHERE title = 'エイダ' OR title ILIKE '%エイダ%';

-- 流年
UPDATE scenarios SET genre = ARRAY['RP重視'], player_count_min = 5, player_count_max = 5, duration = 6.0
WHERE title = '流年' OR title ILIKE '%流年%';

-- 殺神罪
UPDATE scenarios SET genre = ARRAY['ロングセラー', 'RP重視'], player_count_min = 7, player_count_max = 7
WHERE title = '殺神罪' OR title ILIKE '%殺神罪%';

-- アンフィスバエナと聖女の祈り
UPDATE scenarios SET genre = ARRAY['RP重視'], player_count_min = 8, player_count_max = 8
WHERE title = 'アンフィスバエナと聖女の祈り' OR title ILIKE '%アンフィスバエナと聖女の祈り%';

-- 女皇の書架
UPDATE scenarios SET genre = ARRAY['ロングセラー', 'ミステリー'], player_count_min = 8, player_count_max = 8
WHERE title = '女皇の書架' OR title ILIKE '%女皇の書架%';

-- 不思議の国の童話裁判
UPDATE scenarios SET genre = ARRAY['ロングセラー', 'RP重視'], player_count_min = 6, player_count_max = 6, duration = 4.0
WHERE title = '不思議の国の童話裁判' OR title ILIKE '%不思議の国の童話裁判%';

-- 悪意の岐路に立つ
UPDATE scenarios SET genre = ARRAY['ロングセラー', 'ミステリー', 'RP重視'], player_count_min = 8, player_count_max = 8
WHERE title = '悪意の岐路に立つ' OR title ILIKE '%悪意の岐路に立つ%';

-- 鳴神様のいうとおり
UPDATE scenarios SET genre = ARRAY['ロングセラー'], player_count_min = 6, player_count_max = 6
WHERE title = '鳴神様のいうとおり' OR title ILIKE '%鳴神様のいうとおり%';

-- 火ノ神様のいうとおり
UPDATE scenarios SET genre = ARRAY['RP重視'], player_count_min = 6, player_count_max = 6
WHERE title = '火ノ神様のいうとおり' OR title ILIKE '%火ノ神様のいうとおり%';

-- 朱き亡国に捧げる祈り
UPDATE scenarios SET genre = ARRAY['ロングセラー', 'RP重視'], player_count_min = 7, player_count_max = 7
WHERE title = '朱き亡国に捧げる祈り' OR title ILIKE '%朱き亡国に捧げる祈り%';

-- 紫に染まる前に
UPDATE scenarios SET genre = ARRAY['ロングセラー'], player_count_min = 7, player_count_max = 7
WHERE title = '紫に染まる前に' OR title ILIKE '%紫に染まる前に%';

-- 黒の眺望
UPDATE scenarios SET genre = ARRAY['ロングセラー'], player_count_min = 7, player_count_max = 7
WHERE title = '黒の眺望' OR title ILIKE '%黒の眺望%';

-- 岐路に降り立つ
UPDATE scenarios SET genre = ARRAY['ロングセラー', 'ミステリー'], player_count_min = 7, player_count_max = 7, duration = 4.0
WHERE title = '岐路に降り立つ' OR title ILIKE '%岐路に降り立つ%';

-- I will ex-
UPDATE scenarios SET genre = ARRAY['ロングセラー', 'RP重視', 'デスゲーム'], player_count_min = 8, player_count_max = 8, duration = 4.0
WHERE title = 'I will ex-' OR title ILIKE '%I will ex-%';

-- Dear my D
UPDATE scenarios SET genre = ARRAY['デスゲーム', '経験者限定'], player_count_min = 8, player_count_max = 8
WHERE title = 'Dear my D' OR title ILIKE '%Dear my D%';

-- アオハループ
UPDATE scenarios SET genre = ARRAY['ロングセラー', 'RP重視'], player_count_min = 7, player_count_max = 7
WHERE title = 'アオハループ' OR title ILIKE '%アオハループ%';

-- 傲慢女王とアリスの不条理裁判
UPDATE scenarios SET genre = ARRAY['ロングセラー', 'RP重視'], player_count_min = 7, player_count_max = 7
WHERE title = '傲慢女王とアリスの不条理裁判' OR title ILIKE '%傲慢女王とアリスの不条理裁判%';

-- BBA
UPDATE scenarios SET genre = ARRAY['デスゲーム'], player_count_min = 8, player_count_max = 8, duration = 5.0
WHERE title = 'BBA' OR title ILIKE '%BBA%';

-- 季節のマーダーミステリー「アニクシィ」
UPDATE scenarios SET genre = ARRAY['ロングセラー', '期間限定4/1〜6/31まで'], player_count_min = 7, player_count_max = 7
WHERE title = '季節のマーダーミステリー「アニクシィ」' OR title ILIKE '%季節のマーダーミステリー「アニクシィ」%';

-- 季節のマーダーミステリー「カノケリ」
UPDATE scenarios SET genre = ARRAY['ロングセラー', '期間限定7/1〜9/31まで'], player_count_min = 7, player_count_max = 7
WHERE title = '季節のマーダーミステリー「カノケリ」' OR title ILIKE '%季節のマーダーミステリー「カノケリ」%';

-- 季節のマーダーミステリー「シノポロ」
UPDATE scenarios SET genre = ARRAY['ロングセラー', '期間限定10/1〜12/31まで'], player_count_min = 7, player_count_max = 7
WHERE title = '季節のマーダーミステリー「シノポロ」' OR title ILIKE '%季節のマーダーミステリー「シノポロ」%';

-- 季節のマーダーミステリー「キモナス」
UPDATE scenarios SET genre = ARRAY['ロングセラー', '期間限定1/1〜3/31まで'], player_count_min = 7, player_count_max = 7
WHERE title = '季節のマーダーミステリー「キモナス」' OR title ILIKE '%季節のマーダーミステリー「キモナス」%';

-- 星空のマリス
UPDATE scenarios SET genre = ARRAY['ロングセラー', 'RP重視'], player_count_min = 7, player_count_max = 7
WHERE title = '星空のマリス' OR title ILIKE '%星空のマリス%';

-- 荒廃のマリス
UPDATE scenarios SET genre = ARRAY['ロングセラー', 'RP重視'], player_count_min = 7, player_count_max = 7
WHERE title = '荒廃のマリス' OR title ILIKE '%荒廃のマリス%';

-- 彼女といるかとチョコレート
UPDATE scenarios SET genre = ARRAY['RP重視'], player_count_min = 6, player_count_max = 6
WHERE title = '彼女といるかとチョコレート' OR title ILIKE '%彼女といるかとチョコレート%';

-- 鉄紺の証言
UPDATE scenarios SET genre = ARRAY['ミステリー'], player_count_min = 8, player_count_max = 8, duration = 4.0
WHERE title = '鉄紺の証言' OR title ILIKE '%鉄紺の証言%';

-- 彼とかじつとマシュマロウ
UPDATE scenarios SET genre = ARRAY['RP重視'], player_count_min = 6, player_count_max = 6, duration = 4.0
WHERE title = '彼とかじつとマシュマロウ' OR title ILIKE '%彼とかじつとマシュマロウ%';

-- 学校の解談
UPDATE scenarios SET genre = ARRAY['ロングセラー'], player_count_min = 7, player_count_max = 7
WHERE title = '学校の解談' OR title ILIKE '%学校の解談%';

-- 僕らの未来について
UPDATE scenarios SET genre = ARRAY['ミステリー'], player_count_min = 5, player_count_max = 5, duration = 3.0
WHERE title = '僕らの未来について' OR title ILIKE '%僕らの未来について%';

-- フェイクドナー
UPDATE scenarios SET genre = ARRAY['ロングセラー', '駆け引き重視']
WHERE title = 'フェイクドナー' OR title ILIKE '%フェイクドナー%';

-- エデンの審判
UPDATE scenarios SET genre = ARRAY['ミステリー', '経験者限定', '情報量多め'], player_count_min = 7, player_count_max = 7, duration = 4.0
WHERE title = 'エデンの審判' OR title ILIKE '%エデンの審判%';

-- 裁判員の仮面
UPDATE scenarios SET genre = ARRAY['ロングセラー', 'ミステリー'], player_count_min = 8, player_count_max = 8, duration = 4.0
WHERE title = '裁判員の仮面' OR title ILIKE '%裁判員の仮面%';

-- ソルシエ～賢者達の物語～
UPDATE scenarios SET genre = ARRAY['RP重視', 'ミステリー'], player_count_min = 4, player_count_max = 4
WHERE title = 'ソルシエ～賢者達の物語～' OR title ILIKE '%ソルシエ～賢者達の物語～%';

-- MERCHANT～罪科のネゴシエイション
UPDATE scenarios SET genre = ARRAY['RP重視'], player_count_min = 6, player_count_max = 6, duration = 5.0
WHERE title = 'MERCHANT～罪科のネゴシエイション' OR title ILIKE '%MERCHANT～罪科のネゴシエイション%';

-- 正義はまた蘇る
UPDATE scenarios SET genre = ARRAY['ミステリー', 'RP重視'], player_count_min = 5, player_count_max = 5, duration = 3.0
WHERE title = '正義はまた蘇る' OR title ILIKE '%正義はまた蘇る%';

-- 探偵撲滅 -死者からの依頼と機密文書-
UPDATE scenarios SET genre = ARRAY['RP重視'], player_count_min = 7, player_count_max = 7, duration = 5.0
WHERE title = '探偵撲滅 -死者からの依頼と機密文書-' OR title ILIKE '%探偵撲滅 -死者からの依頼と機密文書-%';

-- ドクターテラスの秘密の実験
UPDATE scenarios SET genre = ARRAY['ミステリー'], player_count_min = 8, player_count_max = 8
WHERE title = 'ドクターテラスの秘密の実験' OR title ILIKE '%ドクターテラスの秘密の実験%';

-- 全能のパラドックス
UPDATE scenarios SET genre = ARRAY['ミステリー', '経験者限定'], player_count_min = 7, player_count_max = 7
WHERE title = '全能のパラドックス' OR title ILIKE '%全能のパラドックス%';

-- リトルワンダー
UPDATE scenarios SET genre = ARRAY['RP重視'], player_count_min = 8, player_count_max = 8
WHERE title = 'リトルワンダー' OR title ILIKE '%リトルワンダー%';

-- 百鬼の夜、月光の影
UPDATE scenarios SET genre = ARRAY['RP重視', '和風'], player_count_min = 7, player_count_max = 7, duration = 4.0
WHERE title = '百鬼の夜、月光の影' OR title ILIKE '%百鬼の夜、月光の影%';

-- つわものどもが夢のあと
UPDATE scenarios SET genre = ARRAY['ミステリー'], player_count_min = 8, player_count_max = 8
WHERE title = 'つわものどもが夢のあと' OR title ILIKE '%つわものどもが夢のあと%';

-- ウロボロスの眠り
UPDATE scenarios SET genre = ARRAY['ミステリー', 'ロングセラー', '経験者限定'], player_count_min = 8, player_count_max = 8
WHERE title = 'ウロボロスの眠り' OR title ILIKE '%ウロボロスの眠り%';

-- 凍てつくあなたに６つの灯火
UPDATE scenarios SET genre = ARRAY['RP重視'], player_count_min = 6, player_count_max = 6, duration = 4.0
WHERE title = '凍てつくあなたに６つの灯火' OR title ILIKE '%凍てつくあなたに６つの灯火%';

-- へっどぎあ☆ぱにっく
UPDATE scenarios SET genre = ARRAY['デスゲーム'], player_count_min = 6, player_count_max = 6
WHERE title = 'へっどぎあ☆ぱにっく' OR title ILIKE '%へっどぎあ☆ぱにっく%';

-- 狂気山脈　陰謀の分水嶺（第１弾）
UPDATE scenarios SET genre = ARRAY['ロングセラー', 'RP重視'], player_count_min = 5, player_count_max = 5, duration = 4.0
WHERE title = '狂気山脈　陰謀の分水嶺（第１弾）' OR title ILIKE '%狂気山脈　陰謀の分水嶺（第１弾）%';

-- 狂気山脈　星降る天辺（第２弾）
UPDATE scenarios SET genre = ARRAY['ロングセラー', 'RP重視'], player_count_min = 5, player_count_max = 5, duration = 4.0
WHERE title = '狂気山脈　星降る天辺（第２弾）' OR title ILIKE '%狂気山脈　星降る天辺（第２弾）%';

-- WORLD END
UPDATE scenarios SET genre = ARRAY['ロングセラー', 'RP重視'], player_count_min = 5, player_count_max = 5
WHERE title = 'WORLD END' OR title ILIKE '%WORLD END%';

-- クリムゾンアート
UPDATE scenarios SET genre = ARRAY['RP重視'], player_count_min = 6, player_count_max = 6, duration = 4.0
WHERE title = 'クリムゾンアート' OR title ILIKE '%クリムゾンアート%';

-- デモンズボックス
UPDATE scenarios SET genre = ARRAY['デスゲーム'], player_count_min = 6, player_count_max = 6, duration = 4.0
WHERE title = 'デモンズボックス' OR title ILIKE '%デモンズボックス%';

-- 椅子戦争
UPDATE scenarios SET genre = ARRAY['デスゲーム'], player_count_min = 6, player_count_max = 6, duration = 4.0
WHERE title = '椅子戦争' OR title ILIKE '%椅子戦争%';

-- あくなき世界で嘘をうたう
UPDATE scenarios SET genre = ARRAY['ロングセラー', 'RP重視', '和風'], player_count_min = 7, player_count_max = 7
WHERE title = 'あくなき世界で嘘をうたう' OR title ILIKE '%あくなき世界で嘘をうたう%';

-- クリエイターズハイ
UPDATE scenarios SET genre = ARRAY['経験者限定'], player_count_min = 8, player_count_max = 8
WHERE title = 'クリエイターズハイ' OR title ILIKE '%クリエイターズハイ%';

-- ヤノハのフタリ
UPDATE scenarios SET genre = ARRAY['ロングセラー'], player_count_min = 7, player_count_max = 7
WHERE title = 'ヤノハのフタリ' OR title ILIKE '%ヤノハのフタリ%';

-- Recollection
UPDATE scenarios SET genre = ARRAY['RP重視', '情報量多め'], player_count_min = 8, player_count_max = 8
WHERE title = 'Recollection' OR title ILIKE '%Recollection%';

-- WANTEDz
UPDATE scenarios SET genre = ARRAY['駆け引き重視'], player_count_min = 8, player_count_max = 8
WHERE title = 'WANTEDz' OR title ILIKE '%WANTEDz%';

-- スター☆ループ
UPDATE scenarios SET genre = ARRAY['RP重視'], player_count_min = 7, player_count_max = 7
WHERE title = 'スター☆ループ' OR title ILIKE '%スター☆ループ%';

-- 南極地点X
UPDATE scenarios SET genre = ARRAY['RP重視'], player_count_min = 5, player_count_max = 5, duration = 3.0
WHERE title = '南極地点X' OR title ILIKE '%南極地点X%';

-- ============================================
-- 合計 129 シナリオの更新対象