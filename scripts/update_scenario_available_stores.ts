/**
 * シナリオの公演可能店舗（available_stores）を一括更新するスクリプト
 * 
 * 使用方法: npx tsx scripts/update_scenario_available_stores.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// .envファイルを手動で読み込む
function loadEnv(): Record<string, string> {
  const envPaths = [
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), '.env')
  ]
  const envVars: Record<string, string> = {}
  
  for (const envPath of envPaths) {
    try {
      const content = fs.readFileSync(envPath, 'utf-8')
      console.log(`📁 ${envPath} を読み込みました`)
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [key, ...valueParts] = trimmed.split('=')
          envVars[key] = valueParts.join('=')
        }
      }
      break // 最初に見つかったファイルを使用
    } catch (e) {
      // 次のファイルを試す
    }
  }
  
  if (Object.keys(envVars).length === 0) {
    console.error('❌ .envファイルが見つかりません')
  }
  
  return envVars
}

const env = loadEnv()
const SUPABASE_URL = env['VITE_SUPABASE_URL'] || ''
const SUPABASE_KEY = env['VITE_SUPABASE_ANON_KEY'] || ''

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ VITE_SUPABASE_URL または VITE_SUPABASE_ANON_KEY が.envに設定されていません')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// 店舗IDマッピング
const STORE_IDS: Record<string, string> = {
  "大久保": "bef973a7-faa2-466d-afcc-c6466f24474f",
  "馬場": "45e39d14-061f-4d01-ae8a-5d4f8893e3cd",
  "別館①": "0269032f-6059-440b-a429-9a56dbb027be",
  "別館②": "95ac6d74-56df-4cac-a67f-59fff9ab89b9",
  "大塚": "f94256c3-e992-4723-b965-9df5cd54ea81",
  "埼玉大宮": "8a254b6d-9293-42c6-b634-e872c83fc4fd",
}

// 全店舗ID
const ALL_STORE_IDS = Object.values(STORE_IDS)

/**
 * 店舗テキストを解析してstore_idのリストを返す
 */
function parseStores(storeText: string): string[] {
  if (!storeText || storeText.trim() === "") {
    return ALL_STORE_IDS
  }
  
  storeText = storeText.trim()
  
  // 全店舗パターン
  if (storeText.includes("全店舗") || storeText === "保留") {
    return ALL_STORE_IDS
  }
  
  const storeIds = new Set<string>()
  
  // セパレータで分割（・、，,）
  const parts = storeText.split(/[・、，,\s]+/)
  
  for (let part of parts) {
    part = part.trim()
    if (!part) continue
    
    // 各パターンをマッチ
    if (["大久保", "大久保店"].includes(part)) {
      storeIds.add(STORE_IDS["大久保"])
    } else if (["馬場", "高田馬場", "馬場店", "高田馬場店"].includes(part)) {
      storeIds.add(STORE_IDS["馬場"])
    } else if (["大塚", "大塚店"].includes(part)) {
      storeIds.add(STORE_IDS["大塚"])
    } else if (["仮設", "仮説", "別館", "馬場仮設", "馬場別館"].includes(part)) {
      // 別館①②両方
      storeIds.add(STORE_IDS["別館①"])
      storeIds.add(STORE_IDS["別館②"])
    } else if (["別館①", "別館1"].includes(part)) {
      storeIds.add(STORE_IDS["別館①"])
    } else if (["別館②", "別館2"].includes(part)) {
      storeIds.add(STORE_IDS["別館②"])
    } else if (["埼玉", "大宮", "埼玉大宮", "埼玉大宮店"].includes(part)) {
      storeIds.add(STORE_IDS["埼玉大宮"])
    } else if (part.includes("非推奨") || part.startsWith("（") || part.startsWith("(")) {
      // コメントは無視
      continue
    } else if (part.includes("まで") || part.includes("限定")) {
      // 「５月まで」「平日限定」などは無視
      continue
    } else if (part === "※平日限定にしたい") {
      continue
    } else {
      console.log(`⚠️ 未知の店舗パターン: '${part}'`)
    }
  }
  
  return storeIds.size > 0 ? Array.from(storeIds) : ALL_STORE_IDS
}

// シナリオと店舗のマッピングデータ
const SCENARIO_STORE_DATA = `
曙光のエテルナ	全店舗（大久保非推奨）
グロリアメモリーズ	大塚
マーダー・オブ・パイレーツ	
over kill	別館・大塚
BrightChoice	大塚
裁くもの、裁かれるもの	大塚
星	
清流館の秘宝	
奪うもの、奪われるもの	
超特急の呪いの館で撮れ高足りてますか？	馬場・仮設・大塚
BBA	保留
DearmyD	馬場・仮設
Iwillex-	馬場・仮設
Recollection	馬場・仮設
WANTEDz	大久保
アンフィスバエナと聖女の祈り	馬場・大塚
ウロボロスの眠り	馬場・仮設
クリエイターズハイ	馬場・仮設
つわものどもが夢のあと	馬場・仮設
ドクター・テラスの秘密の実験	馬場・仮設
バベルの末裔	
ヒーロースクランブル	
ひぐらしのなく頃に　恨返し編	
フェイクドナー	馬場・仮設・大久保
リアルマダミス-MurderWonderLand	大塚
リアルマダミス-盤上の教皇	大塚
リトルワンダー	大塚
悪意の岐路に立つ	
或ル胡蝶ノ夢	馬場・仮設・大塚
花街リグレット	馬場・仮設・大塚
銀世界のアシアト(５月まで）	全店舗
黒と白の狭間に	全店舗
裁判員の仮面	大塚
歯に噛むあなたに	馬場・仮設
鹿神館の罪人	
女皇の書架	馬場・仮設・大塚
新世界のユキサキ	全店舗
誠実な十字架	馬場・仮設
鉄紺の証言	馬場・仮設
霧に眠るは幾つの罪	馬場・仮設・大塚
野槌	馬場・仮設
贖罪のロザリオ	
機巧人形の心臓	全店舗
境界線のカーサスベリ	馬場・仮設・大塚
藍雨廻逢	馬場・仮設・大塚
月光の偽桜	馬場・仮設
アンシンメトリー	
妖怪たちと月夜の刀	馬場・仮設・大塚
九十九談 - 厄災の箱	
呪縛姫	
桜の散る夜に	
inthebox〜長い熱病	馬場・仮設
GARDENリーガー殺人事件	
Jazzy	
REDRUM01泉涌館の変転	馬場・馬場仮設
アオハルーツ	
アオハループ	馬場・仮設・大塚
あくなき世界で嘘をうたう	馬場・仮設
エデンの審判	馬場・仮設
キングを殺すには	
クロノフォビア	馬場・仮設・大塚
スターループ	大久保
ツグミドリ	馬場・仮設
ナナイロの迷宮 黄 エレクトリカル吹奏楽部殺人事件	馬場・仮設
ナナイロの迷宮 緑 アペイロン研究所殺人事件	馬場・仮設
ナナイロの迷宮 橙 オンラインゲーム殺人事件	全店舗
ピタゴラスの篝火	馬場・仮設
フェイクアブダクション	
ヤノハのフタリ	馬場・仮設
ロックドドア殺人	
一条家の人々	馬場・仮設
花咲の箱庭	馬場・仮設
学校の解談	馬場
岐路に降り立つ	馬場・仮設
季節のマーダーミステリー／ニィホン	馬場・仮設・大塚
季節マーダー／アニクシィ	馬場・仮設・大塚
季節マーダー／カノケリ	馬場・仮設・大塚
季節マーダー／キモナス	馬場・仮設・大塚
季節マーダー／シノポロ	馬場・仮設・大塚
鬼哭館の殺人事件	馬場・仮設
古鐘のなる頃に	馬場・仮設
荒廃のマリス	馬場・仮設
黒の眺望	馬場・仮設
今日も涙の雨が降る	
殺神罪	全店舗
殺人鬼イバラノミチの回想録	馬場・仮設・大塚
紫に染まる前に	馬場・仮設
七股高校	
朱き亡国に捧げる祈り	馬場・仮設
少年少女Aの独白	
真・渋谷陰陽奇譚	馬場・仮設
人狼を語る館	馬場・仮設
星空のマリス	馬場・仮設
全能のパラドックス	馬場・仮設
想いは満天の星に	
探偵撲滅	馬場・仮設・大久保
天邪河（あまのじゃく）	馬場・仮設
電脳の檻のアリス	大塚
白殺しType-K	馬場・仮設
百鬼の夜、月光の影	馬場・仮設
名探偵と四嶺館	
傲慢な女王とアリスの不条理裁判	馬場・仮設、大塚
彗星蘭の万朶	馬場・仮設
燔祭のジェミニ	馬場・仮設、大塚
絆の永逝	馬場・仮設
凪の鬼籍	馬場・仮設
異能特区シンギュラリティ	馬場・仮設
くずの葉のもり	大久保
REDRUM4アルテミスの断罪	馬場・仮設
ENIGMACODE廃棄ミライの犠牲者たち	馬場・仮設
テセウスの方舟	馬場・仮設、大塚
探ぱんマーダーミステリー・ノーショーツトルダム学園殺人事件	馬場・仮設
蟻集	大塚
蝉散	大塚
その白衣は誰が為に	
5DIVE	馬場・仮設・大塚
MERCHANT	馬場・仮設
readme.txt	馬場・仮設
REDRUM02虚像のF	馬場・仮設
REDRUM03致命的観測をもう一度	馬場・仮設
TOOLS〜ぎこちない椅子	馬場・仮設・大塚
アンドロイドは愛を知らない	大久保
キヲクの方舟	
クリムゾンアート	大久保
この闘をあなたと	馬場・仮設・大塚
デモンズボックス	馬場仮設
へっどぎあ★ぱにっく	大久保
モノクローム	馬場・仮設
ロスト／リメンブランス	大久保・馬場・仮設
愛する故に	
椅子戦争	大塚
違人	馬場・仮設
火ノ神様のいうとおり	大久保
紅く舞う	馬場・仮設
告別詩（取引中止）	
殺人鬼Xの独白	大久保・馬場・仮設
小暮事件に関する考察	馬場・仮設
赤の導線	馬場・仮設・大塚
凍てつくあなたに６つの灯火	大久保
彼とかじつとマシュマロウ	大久保
彼女といるかとチョコレート	大久保
不思議の国の童話裁判	馬場・仮設
鳴神様のいうとおり	大久保
立方館	馬場・仮設
裂き子さん	大久保
ゴージャスマンション	馬場・仮設
マーダーオブエクスプローラー失われし大秘宝	大久保
漣の向こう側	大久保
土牢に悲鳴は谺して	馬場・仮設・大久保
オペレーション：ゴーストウィング	馬場・馬場仮設
ある悪魔の儀式について	大久保・馬場・仮設
GM殺人事件	全店舗
BeatSpecter	
WORLDEND	大久保
あるマーダーミステリーについて	馬場・仮設・大久保
エイダ	大久保
ブラックナイトスレイヴ	
ユートピアース	大久保・馬場・仮設
狂気山脈　2.5　頂上戦争	大久保
狂気山脈　陰謀の分水嶺（１）	大久保
狂気山脈　星降る天辺（２）	大久保
狂気山脈　薄明三角点（３）	大久保
午前2時7分	
黒い森の獣part1	馬場・仮設
黒い森の獣part2人と狼	馬場・仮設
魂を運ぶ飛行船	馬場・仮設
人類最後の皆様へ／終末の眠り姫	大久保
正義はまた蘇る	
天使は花明かりの下で	大久保
南極地点X	馬場・仮設
僕らの未来について	馬場・仮設
魔女の聖餐式	
流年	馬場・仮設
廻る弾丸輪舞（ダンガンロンド）	大久保
TheRealFork30's	大久保
檻見る5人-（空色時箱セット公演）	大久保
空色時箱（ソライロタイムカプセル）-檻見る５人セット公演	大久保
MissingLink（ミッシングリンク）	
ゼロの爆弾	大久保
赤鬼が泣いた夜	馬場・仮設
親方の館	
SORCIER～賢者達の物語～	大久保
あの夏のアンタレス	
エンドロールは流れない	大久保
幻想のマリス	
Invisible-亡霊列車-	馬場
口裂け女の微笑み・Mの悪意	
Factor	
ブルーダイヤの不在証明	大久保・馬場・仮設
Grape	
ツイン号沈没事件に関する考察	
深海に沈む子供たち（水底のクオリア）	
人狼デスゲームへの挑戦	
すべては山荘から始まる。	
君が為の殺人	
`

interface ScenarioUpdate {
  id: string
  title: string
  storeText: string
  availableStores: string[]
}

async function main() {
  console.log("🚀 シナリオの公演可能店舗を一括更新します\n")
  
  // 既存シナリオを取得
  const { data: scenarios, error } = await supabase
    .from('scenarios')
    .select('id, title')
  
  if (error) {
    console.error("❌ シナリオ取得エラー:", error)
    return
  }
  
  const existingScenarios = new Map<string, string>()
  for (const s of scenarios || []) {
    existingScenarios.set(s.title, s.id)
  }
  
  console.log(`📚 データベース内のシナリオ数: ${existingScenarios.size}\n`)
  
  // データを解析
  const updates: ScenarioUpdate[] = []
  const notFound: string[] = []
  
  for (const line of SCENARIO_STORE_DATA.trim().split('\n')) {
    if (!line.trim()) continue
    
    const parts = line.split('\t')
    const title = parts[0].trim()
    const storeText = parts.length > 1 ? parts[1].trim() : ""
    
    if (!title) continue
    
    // シナリオIDを検索
    let scenarioId = existingScenarios.get(title)
    
    if (!scenarioId) {
      // 部分一致で検索
      for (const [existingTitle, existingId] of existingScenarios.entries()) {
        if (title.includes(existingTitle) || existingTitle.includes(title)) {
          scenarioId = existingId
          console.log(`🔄 「${title}」→「${existingTitle}」としてマッチ`)
          break
        }
      }
    }
    
    if (!scenarioId) {
      notFound.push(title)
      continue
    }
    
    // 店舗IDを解析
    const storeIds = parseStores(storeText)
    
    updates.push({
      id: scenarioId,
      title,
      storeText,
      availableStores: storeIds
    })
  }
  
  console.log(`\n✅ 更新対象: ${updates.length}件`)
  console.log(`❌ シナリオが見つからない: ${notFound.length}件`)
  
  if (notFound.length > 0) {
    console.log("\n=== シナリオが見つからないもの ===")
    for (const title of notFound) {
      console.log(`  - ${title}`)
    }
  }
  
  // 更新を実行
  console.log("\n=== 更新を実行 ===")
  let successCount = 0
  let failCount = 0
  
  for (const update of updates) {
    try {
      const { error: updateError } = await supabase
        .from('scenarios')
        .update({ available_stores: update.availableStores })
        .eq('id', update.id)
      
      if (updateError) throw updateError
      
      const storeCount = update.availableStores.length
      const isAll = storeCount === ALL_STORE_IDS.length
      const storeLabel = isAll ? "全店舗" : `${storeCount}店舗`
      console.log(`✅ ${update.title}: ${storeLabel}`)
      successCount++
    } catch (e) {
      console.log(`❌ ${update.title}: エラー - ${e}`)
      failCount++
    }
  }
  
  console.log(`\n=== 完了 ===`)
  console.log(`成功: ${successCount}件`)
  console.log(`失敗: ${failCount}件`)
  console.log(`未登録: ${notFound.length}件`)
}

main()

