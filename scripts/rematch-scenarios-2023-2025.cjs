/**
 * 2023-2025年のマッチング不完全なシナリオを再マッチングするスクリプト
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('環境変数が設定されていません')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// シナリオ名のマッピング（略称 → 正式名称）
const SCENARIO_NAME_MAPPING = {
  // 季節マダミス
  "カノケリ": "季節／カノケリ",
  "アニクシィ": "季節／アニクシィ",
  "シノポロ": "季節／シノポロ",
  "キモナス": "季節／キモナス",
  "ニィホン": "季節／ニィホン",
  "季節カノケリ": "季節／カノケリ",
  "季節アニクシィ": "季節／アニクシィ",
  "季節シノポロ": "季節／シノポロ",
  "季節キモナス": "季節／キモナス",
  "季節ニィホン": "季節／ニィホン",
  "季節／カノケリ": "季節／カノケリ",
  "季節／アニクシィ": "季節／アニクシィ",
  "季節／シノポロ": "季節／シノポロ",
  "季節／キモナス": "季節／キモナス",
  "季節／ニィホン": "季節／ニィホン",
  "季節/カノケリ": "季節／カノケリ",
  "季節/アニクシィ": "季節／アニクシィ",
  "季節/シノポロ": "季節／シノポロ",
  "季節/キモナス": "季節／キモナス",
  "季節/ニィホン": "季節／ニィホン",
  "季節マーダー／カノケリ": "季節／カノケリ",
  "季節マーダー／アニクシィ": "季節／アニクシィ",
  "季節マーダー／シノポロ": "季節／シノポロ",
  "季節マーダー／キモナス": "季節／キモナス",
  "季節のマーダーミステリー／ニィホン": "季節／ニィホン",
  // 略称
  "さきこさん": "裂き子さん",
  "サキコサン": "裂き子さん",
  "トレタリ": "超特急の呪いの館で撮れ高足りてますか？",
  "赤鬼": "赤鬼が泣いた夜",
  "invisible": "Invisible-亡霊列車-",
  "Invisible": "Invisible-亡霊列車-",
  "童話裁判": "傲慢女王とアリスの不条理裁判",
  // ナナイロ
  "ナナイロ橙": "ナナイロの迷宮 橙 オンラインゲーム殺人事件",
  "ナナイロ緑": "ナナイロの迷宮 緑 アペイロン研究所殺人事件",
  "ナナイロ黄": "ナナイロの迷宮 黄 エレクトリカル吹奏楽部殺人事件",
  "ナナイロの迷宮黄": "ナナイロの迷宮 黄 エレクトリカル吹奏楽部殺人事件",
  "ナナイロの迷宮橙": "ナナイロの迷宮 橙 オンラインゲーム殺人事件",
  "ナナイロの迷宮緑": "ナナイロの迷宮 緑 アペイロン研究所殺人事件",
  // 狂気山脈
  "狂気山脈1": "狂気山脈　陰謀の分水嶺（１）",
  "狂気山脈2": "狂気山脈　星降る天辺（２）",
  "狂気山脈3": "狂気山脈　薄明三角点（３）",
  "狂気山脈２．５": "狂気山脈　2.5　頂上戦争",
  "狂気山脈2.5": "狂気山脈　2.5　頂上戦争",
  // その他
  "TOOLS": "TOOLS〜ぎこちない椅子",
  "TOOLS〜ぎこちない椅子〜": "TOOLS〜ぎこちない椅子",
  "ソルシエ": "SORCIER〜賢者達の物語〜",
  "SORCIER": "SORCIER〜賢者達の物語〜",
  "藍雨": "藍雨廻逢",
  "真渋谷陰陽奇譚": "真・渋谷陰陽奇譚",
  "真渋谷陰陽綺譚": "真・渋谷陰陽奇譚",
  "渋谷陰陽奇譚": "真・渋谷陰陽奇譚",
  "百鬼の夜月光の影": "百鬼の夜、月光の影",
  "百鬼月光": "百鬼の夜、月光の影",
  "インビジブル亡霊列車": "Invisible-亡霊列車-",
  "くずの葉の森": "くずの葉のもり",
  "ドクターテラスの秘密の実験": "ドクター・テラスの秘密の実験",
  "ドクターテラス": "ドクター・テラスの秘密の実験",
  "あるミステリーについて": "あるマーダーミステリーについて",
  // 追加の略称
  "ロスリメ": "ロスト／リメンブランス",
  "ロストリメンブランス": "ロスト／リメンブランス",
  "Lost/Remembrance": "ロスト／リメンブランス",
  "lost/remembrance": "ロスト／リメンブランス",
  "Lost/Remebrance": "ロスト／リメンブランス",
  "へっぱに": "へっどぎあ★ぱにっく",
  "ヘッパニ": "へっどぎあ★ぱにっく",
  "JAZZY": "Jazzy",
  "brightchoice": "BrightChoice",
  "BrightChoice": "BrightChoice",
  "MurderWonderland": "リアルマダミス-MurderWonderLand",
  "鳴神様の言う通り": "鳴神様のいうとおり",
  "小暮時件に関する考察": "小暮事件に関する考察",
  "名探偵の四嶺館": "名探偵と四嶺館",
  "merchant": "MERCHANT",
  "merhchant": "MERCHANT",
  "MERCHANT": "MERCHANT",
  "黒い森part": "黒い森の獣part1",
  "黒い森の獣Part": "黒い森の獣part1",
  "人類終末": "人類最後の皆様へ／終末の眠り姫",
  "狂気山脈-陰謀の分水嶺": "狂気山脈　陰謀の分水嶺（１）",
  "狂気山脈陰謀": "狂気山脈　陰謀の分水嶺（１）",
  "狂気山脈薄明三角点": "狂気山脈　薄明三角点（３）",
  "傲慢な女王とアリスの不条理裁判": "傲慢女王とアリスの不条理裁判",
  "ピタゴラス": "ピタゴラスの篝火",
  "人形の心臓": "機巧人形の心臓",
  // さらに追加
  "Iwillex-": "Iwillex-",
  "I will ex-": "Iwillex-",
  "不思議の国童話裁判": "不思議の国の童話裁判",
  "狂気山脈  ～星降る天辺～": "狂気山脈　星降る天辺（２）",
  "狂気山脈～星降る天辺～": "狂気山脈　星降る天辺（２）",
  "狂気山脈星降る天辺": "狂気山脈　星降る天辺（２）",
  "Murder Wonder Land": "リアルマダミス-MurderWonderLand",
  "Murder wonder land": "リアルマダミス-MurderWonderLand",
  "火の神様のいうとおり": "火ノ神様のいうとおり",
  "火の神様": "火ノ神様のいうとおり",
  "或ル胡蝶": "或ル胡蝶ノ夢",
  "黒い森の獣 part": "黒い森の獣part1",
  "黒い森の獣part": "黒い森の獣part1",
  "キロに降り立つ": "岐路に降り立つ",
  // さらに追加バリエーション
  "WORLD END": "WORLDEND",
  "Dear my D": "DearmyD",
  "Bright Choice": "BrightChoice",
  "bright choice": "BrightChoice",
  "TOOLs": "TOOLS〜ぎこちない椅子",
  "TOOLS〜ぎこちない椅子〜": "TOOLS〜ぎこちない椅子",
  "へっどぎあぱにっく": "へっどぎあ★ぱにっく",
  "ヘッドギアパニック": "へっどぎあ★ぱにっく",
  "白殺し": "白殺しType-K",
  "赤の動線": "赤の導線",
  "狂気山脈 陰謀の分水嶺": "狂気山脈　陰謀の分水嶺（１）",
  "狂気山脈・陰謀の分水嶺": "狂気山脈　陰謀の分水嶺（１）",
  "ナナイロの迷宮 \"橙\" - オンラインゲーム殺人事件": "ナナイロの迷宮 橙 オンラインゲーム殺人事件",
  "ナナイロの迷宮\"橙\"-オンラインゲーム殺人事件": "ナナイロの迷宮 橙 オンラインゲーム殺人事件",
  // 最終追加
  "TOOLS〜ぎこちない椅子": "TOOLS〜ぎこちない椅子",
  "Murder Wonder land": "リアルマダミス-MurderWonderLand",
  "Dear my D": "DearmyD",
  "盤上": "リアルマダミス-盤上の教皇",
  "赤の動線": "赤の導線",
  "急募：赤の動線に切り替えて公演": "赤の導線",
}

// シナリオ名をクリーンアップ
function cleanScenarioName(name) {
  if (!name) return ''
  let text = name.trim()
  
  // プレフィックスを除去
  text = text.replace(/^(貸・|貸 |貸\/|募・|募 |募\/|出張・|出張 |GMテスト・|GMテスト |テストプレイ・|テストプレイ |テスプ・|テスプ |場所貸・|場所貸 |打診・|打診 )/, '')
  
  // 時間表記を除去
  text = text.replace(/\([^)]*\)/g, '')
  text = text.replace(/（[^）]*）/g, '')
  
  // ダブルクォートを除去
  text = text.replace(/["「」『』]/g, '')
  
  // ハイフンと前後のスペースを除去 (ナナイロ用)
  text = text.replace(/ - /g, ' ')
  
  // 記号を除去
  text = text.split('※')[0]
  text = text.split('✅')[0]
  text = text.split('🈵')[0]
  text = text.split('🙅')[0]
  text = text.split('🈳')[0]
  
  // お客様名を除去（スペースの後に人名っぽいもの）
  // 例: "カノケリ 羽柴" → "カノケリ"
  // 例: "ナナイロ 長谷川" → "ナナイロ"
  text = text.replace(/[\s　]+[^\s（(\-]+$/, '')
  
  // 様付きお客様名を除去
  text = text.replace(/[\s　]+[^\s（(]+様.*$/, '')
  
  return text.trim()
}

// ベストマッチを検索
function findBestMatch(input, scenarios) {
  if (!input || input.length === 0) return null
  
  const cleaned = cleanScenarioName(input)
  if (!cleaned) return null
  
  // 1. 静的マッピングチェック
  if (SCENARIO_NAME_MAPPING[cleaned]) {
    const mappedName = SCENARIO_NAME_MAPPING[cleaned]
    const scenario = scenarios.find(s => s.title === mappedName)
    if (scenario) return scenario
  }
  
  // 2. 完全一致
  const exactMatch = scenarios.find(s => s.title === cleaned)
  if (exactMatch) return exactMatch
  
  // 3. 部分一致
  for (const scenario of scenarios) {
    if (scenario.title.startsWith(cleaned) || cleaned.startsWith(scenario.title)) {
      return scenario
    }
    if (scenario.title.includes(cleaned) && cleaned.length >= 3) {
      return scenario
    }
    if (cleaned.includes(scenario.title) && scenario.title.length >= 3) {
      return scenario
    }
  }
  
  // 4. 季節プレフィックスを除去してリトライ
  const seasonStripped = cleaned.replace(/^季節(マーダー)?[／/・]?/, '')
  if (seasonStripped !== cleaned && seasonStripped.length >= 2) {
    if (SCENARIO_NAME_MAPPING[seasonStripped]) {
      const mappedName = SCENARIO_NAME_MAPPING[seasonStripped]
      const scenario = scenarios.find(s => s.title === mappedName)
      if (scenario) return scenario
    }
    for (const scenario of scenarios) {
      if (scenario.title.includes(seasonStripped)) {
        return scenario
      }
    }
  }
  
  // 5. 逆引き
  for (const scenario of scenarios) {
    if (scenario.title.includes(cleaned) && cleaned.length >= 3) {
      return scenario
    }
  }
  
  return null
}

async function main() {
  console.log('📊 シナリオ再マッチング開始...')
  
  // シナリオ一覧を取得
  const { data: scenarios, error: scenarioError } = await supabase
    .from('scenarios')
    .select('id, title')
  
  if (scenarioError) {
    console.error('シナリオ取得エラー:', scenarioError)
    process.exit(1)
  }
  
  console.log(`📋 シナリオマスタ: ${scenarios.length}件`)
  
  // 2023-2025年のイベントを取得（ページネーションで全件取得）
  let allEvents = []
  let page = 0
  const pageSize = 1000
  
  while (true) {
    const { data: events, error: eventError } = await supabase
      .from('schedule_events')
      .select('id, date, scenario, scenario_id, scenarios(title)')
      .gte('date', '2023-01-01')
      .lte('date', '2025-12-31')
      .order('date', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1)
    
    if (eventError) {
      console.error('イベント取得エラー:', eventError)
      process.exit(1)
    }
    
    if (!events || events.length === 0) break
    
    allEvents = allEvents.concat(events)
    page++
    
    if (events.length < pageSize) break
  }
  
  const events = allEvents
  
  console.log(`📅 対象イベント: ${events.length}件`)
  
  // マッチング不完全なイベントを抽出
  const unmatchedEvents = events.filter(e => {
    // シナリオ名があるがscenario_idがない
    if (e.scenario && !e.scenario_id) return true
    // scenario_idはあるがscenariosがない（参照切れ）
    if (e.scenario_id && !e.scenarios) return true
    // シナリオ名とマスタのタイトルが異なる
    if (e.scenario && e.scenarios && e.scenario !== e.scenarios.title) return true
    return false
  })
  
  console.log(`⚠️ マッチング不完全: ${unmatchedEvents.length}件`)
  
  if (unmatchedEvents.length === 0) {
    console.log('✅ 全てのイベントがマッチング済みです')
    return
  }
  
  // 再マッチング
  let updatedCount = 0
  let failedCount = 0
  const failed = []
  
  for (const event of unmatchedEvents) {
    const match = findBestMatch(event.scenario, scenarios)
    
    if (match) {
      const { error: updateError } = await supabase
        .from('schedule_events')
        .update({
          scenario_id: match.id,
          scenario: match.title
        })
        .eq('id', event.id)
      
      if (updateError) {
        console.error(`❌ 更新エラー (${event.id}):`, updateError.message)
        failedCount++
        failed.push({ date: event.date, scenario: event.scenario, error: updateError.message })
      } else {
        updatedCount++
        if (event.scenario !== match.title) {
          console.log(`✅ ${event.date}: "${event.scenario}" → "${match.title}"`)
        } else {
          console.log(`✅ ${event.date}: "${event.scenario}" (IDのみ更新)`)
        }
      }
    } else {
      failedCount++
      failed.push({ date: event.date, scenario: event.scenario, error: 'マッチなし' })
    }
  }
  
  console.log('\n📊 結果:')
  console.log(`  更新成功: ${updatedCount}件`)
  console.log(`  更新失敗: ${failedCount}件`)
  
  if (failed.length > 0) {
    // ユニークなシナリオ名を抽出
    const uniqueScenarios = [...new Set(failed.map(f => f.scenario).filter(s => s))]
    console.log(`\n❌ マッチングできなかったシナリオ (ユニーク ${uniqueScenarios.length}件):`)
    uniqueScenarios.slice(0, 100).forEach(s => {
      console.log(`  "${s}"`)
    })
  }
}

main().catch(console.error)

