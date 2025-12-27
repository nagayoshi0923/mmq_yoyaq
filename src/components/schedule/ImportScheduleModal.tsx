import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { logger } from '@/utils/logger'
import { getTimeSlot } from '@/utils/scheduleUtils'

interface ImportScheduleModalProps {
  isOpen: boolean
  onClose: () => void
  onImportComplete: (targetMonth?: { year: number; month: number }) => void
}

// 組織ID（クインズワルツ）
const ORGANIZATION_ID = 'a0000000-0000-0000-0000-000000000001'

// 公演カテゴリ
const CATEGORY_OPTIONS = [
  { value: 'open', label: '募集' },
  { value: 'private', label: '貸切' },
  { value: 'gmtest', label: 'GMテスト' },
  { value: 'testplay', label: 'テストプレイ' },
  { value: 'offsite', label: '出張' },
  { value: 'mtg', label: 'MTG' },
  { value: 'memo', label: 'メモ' },
]

// 店舗名→store_id のマッピング
const STORE_MAPPING: Record<string, string | null> = {
  "大久保": "bef973a7-faa2-466d-afcc-c6466f24474f",
  "馬場": "45e39d14-061f-4d01-ae8a-5d4f8893e3cd",
  "別館①": "0269032f-6059-440b-a429-9a56dbb027be",
  "別館②": "95ac6d74-56df-4cac-a67f-59fff9ab89b9",
  "馬場別館①": "0269032f-6059-440b-a429-9a56dbb027be",
  "馬場別館②": "95ac6d74-56df-4cac-a67f-59fff9ab89b9",
  "馬場別館スタッフルーム": null,  // スタッフルームはstore_idなし
  "大塚": "f94256c3-e992-4723-b965-9df5cd54ea81",
  "埼玉大宮": "8a254b6d-9293-42c6-b634-e872c83fc4fd",
  "京都出張": null,  // 出張はstore_idなし（offsite）
  "オンライン": null  // オンラインはstore_idなし
}

// シナリオ名の揺らぎを統一するマッピング
const SCENARIO_NAME_MAPPING: Record<string, string> = {
  "赤鬼": "赤鬼が泣いた夜",
  "さきこ": "裂き子",
  "裂き子": "裂き子",
  "さん": "さん",
  "invisible": "Invisible-亡霊列車-",
  "Invisible": "Invisible-亡霊列車-",
  "エイダ": "エイダ",
  "カノケリ": "カノケリ",
  "ユートピアース": "ユートピアース",
  "燔祭のジェミニ": "燔祭のジェミニ",
  "ツグミドリ": "ツグミドリ",
  "電脳の檻のアリス": "電脳の檻のアリス",
  "ニィホン": "ニィホン",
  "機巧人形の心臓": "機巧人形の心臓",
  "黒と白の狭間に": "黒と白の狭間に",
  "新世界のユキサキ": "新世界のユキサキ",
  "銀世界のアシアト": "銀世界のアシアト",
  "この闇をあなたと": "この闇をあなたと",
  "あるマーダーミステリーについて": "あるマーダーミステリーについて",
  "或ル胡蝶ノ夢": "或ル胡蝶ノ夢",
  "MTG": "MTG（マネージャーミーティング）"
}

// スタッフ名の揺らぎを統一するマッピング
const STAFF_NAME_MAPPING: Record<string, string> = {
  // ひらがな・カタカナ・大文字小文字の揺らぎ
  "そら": "ソラ",
  "ソラ": "ソラ",
  "じの": "じの",
  "ジノ": "じの",
  "まつい": "松井",
  "マツイ": "松井",
  "松井": "松井",
  "きゅう": "きゅう",
  "キュウ": "きゅう",
  "つばめ": "つばめ",
  "ツバメ": "つばめ",
  "えりん": "えりん",
  "エリン": "えりん",
  "れみあ": "れみあ",
  "レミア": "れみあ",
  "しらやま": "しらやま",
  "シラヤマ": "しらやま",
  "ぴよな": "ぴよな",
  "ピヨナ": "ぴよな",
  "あんころ": "あんころ",
  "アンコロ": "あんころ",
  "ソルト": "ソルト",
  "そると": "ソルト",
  "もりし": "モリシ",
  "モリシ": "モリシ",
  "らぼ": "labo",
  "ラボ": "labo",
  "labo": "labo",
  "Labo": "labo",
  "LABO": "labo",
  "りんな": "りんな",
  "リンナ": "りんな",
  "だいこん": "だいこん",
  "ダイコン": "だいこん",
  "みずき": "みずき",
  "ミズキ": "みずき",
  "れいにー": "れいにー",
  "レイニー": "れいにー",
  "さき": "崎",
  "崎": "崎",
  "ぽったー": "ぽったー",
  "ポッター": "ぽったー",
  "bb": "BB",
  "BB": "BB",
  "Bb": "BB",
  "かなで": "kanade",
  "カナデ": "kanade",
  "kanade": "kanade",
  "Kanade": "kanade",
  "えいきち": "えいきち",
  "エイキチ": "えいきち",
  "n": "N",
  "N": "N",
  "おむ": "おむ",
  "オム": "おむ",
  "らの": "らの",
  "ラノ": "らの",
  "かなう": "かなう",
  "カナウ": "かなう",
  "凪": "凪",
  "なぎ": "凪",
  "ナギ": "凪",
  "みかのは": "みかのは",
  "ミカノハ": "みかのは",
  "温風リン": "温風リン",
  "おんぷりん": "温風リン",
  "松坊": "松坊",
  "まつぼう": "松坊",
  "まつかさ": "まつかさ",
  "マツカサ": "まつかさ",
  "渚咲": "渚咲",
  "なぎさ": "渚咲",
  "ナギサ": "渚咲",
  "楽": "楽",
  "らく": "楽",
  "ラク": "楽",
  "ひなどり": "ひなどり",
  "ヒナドリ": "ひなどり",
  "えなみ": "えなみ",
  "エナミ": "えなみ",
  "みくみん": "みくみん",
  "ミクミン": "みくみん",
  "小川はねか": "小川はねか",
  "はねか": "小川はねか",
  "ハネカ": "小川はねか",
  // 追加のGM名
  "サンジョウバ": "サンジョウバ",
  "さんじょうば": "サンジョウバ",
  "がっちゃん": "がっちゃん",
  "ガッチャン": "がっちゃん",
  "りえぞー": "りえぞー",
  "リエゾー": "りえぞー",
  "ソウタン": "ソウタン",
  "そうたん": "ソウタン",
  "ほがらか": "ほがらか",
  "ホガラカ": "ほがらか",
  "Ida": "Ida",
  "ida": "Ida",
  "IDA": "Ida"
}

// プレビュー用の型
interface PreviewEvent {
  date: string
  venue: string
  timeSlot: string
  scenario: string
  originalScenario: string  // マッピング前の元のシナリオ名
  scenarioMapped: boolean  // マッピングが行われたか
  gms: string[]
  originalGms: string  // マッピング前の元のGM入力
  gmMappings: Array<{ from: string; to: string }>  // マッピング情報
  category: string
  isMemo: boolean
  hasExisting: boolean
}

export function ImportScheduleModal({ isOpen, onClose, onImportComplete }: ImportScheduleModalProps) {
  const [scheduleText, setScheduleText] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [replaceExisting, setReplaceExisting] = useState(true)
  const [result, setResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null)
  
  // プレビュー用のステート
  const [showPreview, setShowPreview] = useState(false)
  const [previewEvents, setPreviewEvents] = useState<PreviewEvent[]>([])
  const [previewErrors, setPreviewErrors] = useState<string[]>([])
  const [parsedEvents, setParsedEvents] = useState<any[]>([])
  const [existingEventMap, setExistingEventMap] = useState<Map<string, any>>(new Map())
  
  // マスターデータ
  const [staffList, setStaffList] = useState<Array<{ id: string; name: string }>>([])
  const [scenarioList, setScenarioList] = useState<Array<{ id: string; title: string }>>([])
  
  // マスターデータを取得
  useEffect(() => {
    if (isOpen) {
      // スタッフ一覧を取得
      supabase
        .from('staff')
        .select('id, name')
        .order('name')
        .then(({ data }) => {
          if (data) setStaffList(data)
        })
      
      // シナリオ一覧を取得
      supabase
        .from('scenarios')
        .select('id, title')
        .order('title')
        .then(({ data }) => {
          if (data) setScenarioList(data)
        })
    }
  }, [isOpen])
  
  // ひらがな→カタカナ変換
  const toKatakana = (str: string): string => {
    return str.replace(/[\u3041-\u3096]/g, (match) => 
      String.fromCharCode(match.charCodeAt(0) + 0x60)
    )
  }
  
  // カタカナ→ひらがな変換
  const toHiragana = (str: string): string => {
    return str.replace(/[\u30A1-\u30F6]/g, (match) => 
      String.fromCharCode(match.charCodeAt(0) - 0x60)
    )
  }
  
  // 文字列の類似度を計算（レーベンシュタイン距離）
  const getLevenshteinDistance = (a: string, b: string): number => {
    const matrix: number[][] = []
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i]
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        }
      }
    }
    return matrix[b.length][a.length]
  }
  
  // スタッフ名からマッピングを動的に生成
  const dynamicStaffMapping = useMemo(() => {
    const mapping: Record<string, string> = { ...STAFF_NAME_MAPPING }
    
    // スタッフリストから追加のマッピングを生成
    for (const staff of staffList) {
      const name = staff.name
      // 名前がまだマッピングにない場合は追加
      if (!mapping[name]) {
        mapping[name] = name
      }
      // ひらがな・カタカナ変換も追加
      const hiragana = toHiragana(name)
      const katakana = toKatakana(name)
      if (hiragana !== name && !mapping[hiragana]) {
        mapping[hiragana] = name
      }
      if (katakana !== name && !mapping[katakana]) {
        mapping[katakana] = name
      }
      // 小文字も追加
      const lower = name.toLowerCase()
      if (lower !== name && !mapping[lower]) {
        mapping[lower] = name
      }
    }
    
    return mapping
  }, [staffList])
  
  // 類似度マッチングでスタッフ名を検索
  const findBestStaffMatch = (input: string): string | null => {
    if (!input || input.length === 0) return null
    
    const normalizedInput = input.trim()
    
    // 1. 完全一致チェック（動的マッピング）
    if (dynamicStaffMapping[normalizedInput]) {
      return dynamicStaffMapping[normalizedInput]
    }
    
    // 2. ひらがな/カタカナ変換して完全一致チェック
    const hiraganaInput = toHiragana(normalizedInput)
    const katakanaInput = toKatakana(normalizedInput)
    
    if (dynamicStaffMapping[hiraganaInput]) {
      return dynamicStaffMapping[hiraganaInput]
    }
    if (dynamicStaffMapping[katakanaInput]) {
      return dynamicStaffMapping[katakanaInput]
    }
    
    // 3. スタッフリストから完全一致チェック
    for (const staff of staffList) {
      if (staff.name === normalizedInput) {
        return staff.name
      }
      // ひらがな/カタカナで一致
      const staffHiragana = toHiragana(staff.name)
      const staffKatakana = toKatakana(staff.name)
      if (staffHiragana === hiraganaInput || staffKatakana === katakanaInput) {
        return staff.name
      }
    }
    
    // 4. 前方一致・部分一致チェック
    for (const staff of staffList) {
      const staffHiragana = toHiragana(staff.name)
      const staffKatakana = toKatakana(staff.name)
      
      // 入力がスタッフ名で始まる
      if (normalizedInput.startsWith(staff.name) && staff.name.length >= 2) {
        return staff.name
      }
      // スタッフ名が入力で始まる
      if (staff.name.startsWith(normalizedInput) && normalizedInput.length >= 2) {
        return staff.name
      }
      // ひらがな/カタカナで前方一致
      if (hiraganaInput.startsWith(staffHiragana) && staffHiragana.length >= 2) {
        return staff.name
      }
      if (staffHiragana.startsWith(hiraganaInput) && hiraganaInput.length >= 2) {
        return staff.name
      }
      // 入力がスタッフ名を含む
      if (normalizedInput.includes(staff.name) && staff.name.length >= 2) {
        return staff.name
      }
    }
    
    // 4. 類似度マッチング（短い名前のみ、2文字以上）
    if (normalizedInput.length >= 2 && staffList.length > 0) {
      let bestMatch: string | null = null
      let bestDistance = Infinity
      
      for (const staff of staffList) {
        // ひらがな化して比較
        const staffHiragana = toHiragana(staff.name)
        const distance = getLevenshteinDistance(hiraganaInput, staffHiragana)
        
        // 類似度閾値: 入力文字数の半分以下の編集距離なら候補
        const threshold = Math.max(1, Math.floor(normalizedInput.length / 2))
        
        if (distance <= threshold && distance < bestDistance) {
          bestDistance = distance
          bestMatch = staff.name
        }
      }
      
      if (bestMatch) {
        return bestMatch
      }
    }
    
    return null
  }
  
  // 類似度マッチングでシナリオ名を検索
  const findBestScenarioMatch = (input: string): string | null => {
    if (!input || input.length === 0) return null
    
    const normalizedInput = input.trim()
    
    // 1. 静的マッピングチェック
    if (SCENARIO_NAME_MAPPING[normalizedInput]) {
      return SCENARIO_NAME_MAPPING[normalizedInput]
    }
    
    // 2. シナリオリストから完全一致チェック
    for (const scenario of scenarioList) {
      if (scenario.title === normalizedInput) {
        return scenario.title
      }
    }
    
    // 3. 部分一致チェック（入力がシナリオ名を含む、またはシナリオ名が入力を含む）
    for (const scenario of scenarioList) {
      const scenarioName = scenario.title
      // 入力がシナリオ名で始まる
      if (normalizedInput.startsWith(scenarioName)) {
        return scenarioName
      }
      // シナリオ名が入力で始まる（短い入力でも長いシナリオ名にマッチ）
      if (scenarioName.startsWith(normalizedInput) && normalizedInput.length >= 3) {
        return scenarioName
      }
      // 入力がシナリオ名を含む
      if (normalizedInput.includes(scenarioName) && scenarioName.length >= 3) {
        return scenarioName
      }
    }
    
    // 4. 類似度マッチング（3文字以上）
    if (normalizedInput.length >= 3 && scenarioList.length > 0) {
      let bestMatch: string | null = null
      let bestDistance = Infinity
      let bestLengthDiff = Infinity
      
      for (const scenario of scenarioList) {
        const scenarioName = scenario.title
        const distance = getLevenshteinDistance(normalizedInput, scenarioName)
        const lengthDiff = Math.abs(normalizedInput.length - scenarioName.length)
        
        // 類似度閾値: 入力文字数の1/3以下の編集距離なら候補
        const threshold = Math.max(2, Math.floor(normalizedInput.length / 3))
        
        if (distance <= threshold) {
          // 同じ編集距離なら長さが近いものを優先
          if (distance < bestDistance || (distance === bestDistance && lengthDiff < bestLengthDiff)) {
            bestDistance = distance
            bestLengthDiff = lengthDiff
            bestMatch = scenarioName
          }
        }
      }
      
      if (bestMatch) {
        return bestMatch
      }
    }
    
    return null
  }

  // カテゴリを判定
  const determineCategory = (title: string): string => {
    if (title.startsWith('貸・')) return 'private'
    if (title.startsWith('募・')) return 'open'
    if (title.includes('MTG')) return 'mtg'
    if (title.includes('GMテスト') || title.includes('テスト')) return 'gmtest'
    if (title.includes('テストプレイ') || title.includes('テスプ')) return 'testplay'
    if (title.startsWith('出張・')) return 'offsite'
    return 'open'
  }

  // シナリオ名を抽出
  const extractScenarioName = (title: string): string => {
    if (!title || title.trim() === '') return ''
    
    // プレフィックスを除去
    let text = title.replace(/^(貸・|募・|出張・|GMテスト・|テストプレイ・)/, '')
    
    // MTGの場合
    if (text.includes('MTG')) return 'MTG（マネージャーミーティング）'
    
    // 時間表記の括弧で区切って、最初の部分（シナリオ名）のみを取得
    const match = text.match(/^([^(（]+)/)
    if (match) {
      text = match[1].trim()
    }
    
    // 記号の前で切る
    text = text.split('※')[0]
    text = text.split('✅')[0]
    text = text.split('🈵')[0]
    
    text = text.trim()
    
    // 類似度マッチングでシナリオを検索
    const matched = findBestScenarioMatch(text)
    if (matched) {
      return matched
    }
    
    return text
  }

  // 予約情報を抽出
  const extractReservationInfo = (title: string): string | undefined => {
    const infoParts: string[] = []
    
    // お客様名を抽出
    const customerMatch = title.match(/([^(]+様)/)
    if (customerMatch) {
      const customer = customerMatch[1].replace(/\d+円/g, '').trim()
      infoParts.push(customer)
    }
    
    // 価格を抽出
    const priceMatch = title.match(/(\d+円)/)
    if (priceMatch) {
      infoParts.push(priceMatch[1])
    }
    
    return infoParts.length > 0 ? infoParts.join(' / ') : undefined
  }

  // 注記を抽出
  const extractNotes = (title: string): string | undefined => {
    const notes: string[] = []
    
    if (title.includes('※')) {
      const noteMatch = title.match(/※([^※]+)/)
      if (noteMatch) notes.push('※' + noteMatch[1].trim())
    }
    
    if (title.includes('✅')) notes.push('告知済み')
    if (title.includes('🈵')) notes.push('満席')
    if (title.includes('🙅‍♀️') || title.includes('🙅')) notes.push('中止')
    
    if (title.includes('@') && title.includes('人')) {
      const participantMatch = title.match(/@(\d+)(?:人)?/)
      if (participantMatch) notes.push(`参加者募集中(@${participantMatch[1]})`)
    }
    
    if (title.includes('指定')) notes.push('GM指定')
    if (title.includes('見学')) notes.push('見学あり')
    
    return notes.length > 0 ? notes.join(' / ') : undefined
  }

  // 中止かどうかを判定
  const isCancelled = (title: string): boolean => {
    return title.includes('🙅‍♀️') || title.includes('🙅')
  }

  // GM名を解析（マッピングで正規化）
  const parseGmNames = (gmText: string): string[] => {
    if (!gmText || gmText.trim() === '') return []
    
    // 括弧内の情報を除去
    let text = gmText.replace(/\([^)]+\)/g, '').replace(/（[^）]+）/g, '')
    
    // 絵文字を除去
    text = text.replace(/[🈵✅@]/g, '')
    
    // 矢印で分割（GM変更の場合）
    if (text.includes('→')) {
      text = text.split('→').pop() || ''
    }
    
    // カンマやスラッシュで分割
    const gms = text.split(/[,、/]/)
    
    // マッピングで正規化（類似度マッチングも使用）
    return gms
      .map(gm => gm.trim())
      .filter(gm => gm)
      .map(gm => findBestStaffMatch(gm) || gm)
  }
  
  // マッピング情報付きでGM名をパース
  const parseGmNamesWithMapping = (gmText: string): { gms: string[]; mappings: Array<{ from: string; to: string }> } => {
    if (!gmText || gmText.trim() === '') return { gms: [], mappings: [] }
    
    // 括弧内の情報を除去
    let text = gmText.replace(/\([^)]+\)/g, '').replace(/（[^）]+）/g, '')
    
    // 絵文字を除去
    text = text.replace(/[🈵✅@]/g, '')
    
    // 矢印で分割（GM変更の場合）
    if (text.includes('→')) {
      text = text.split('→').pop() || ''
    }
    
    // カンマやスラッシュで分割
    const rawGms = text.split(/[,、/]/).map(gm => gm.trim()).filter(gm => gm)
    
    const mappings: Array<{ from: string; to: string }> = []
    const gms = rawGms.map(gm => {
      // 類似度マッチングを使用
      const matched = findBestStaffMatch(gm)
      if (matched && matched !== gm) {
        mappings.push({ from: gm, to: matched })
        return matched
      }
      return gm
    })
    
    return { gms, mappings }
  }

  // 時間を抽出
  const parseTimeFromTitle = (title: string): { start: string; end: string } | null => {
    const timeMatch = title.match(/\((\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\)/)
    if (timeMatch) {
      const start = parseFloat(timeMatch[1])
      const end = parseFloat(timeMatch[2])
      
      const startHour = Math.floor(start)
      const startMin = Math.round((start - startHour) * 60)
      const endHour = Math.floor(end)
      const endMin = Math.round((end - endHour) * 60)
      
      return {
        start: `${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}`,
        end: `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`
      }
    }
    return null
  }

  // 日付を解析
  const parseDate = (dateStr: string): string => {
    if (!dateStr || !dateStr.includes('/')) {
      return ''
    }
    const parts = dateStr.split('/')
    if (parts.length !== 2) {
      return ''
    }
    const month = parts[0].trim()
    const day = parts[1].trim()
    if (!month || !day) {
      return ''
    }
    return `2025-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // インポート処理（プレビュー済みのデータを使用）
  const handleImport = async () => {
    if (parsedEvents.length === 0) {
      setResult({ success: 0, failed: 0, errors: ['インポートするデータがありません'] })
      return
    }
    
    setIsImporting(true)
    setResult(null)

    try {
      const errors: string[] = []
      
      // インポートデータ内での重複チェック（同じセルに2つのシナリオがある場合、最初のものを使用）
      const cellKey = (date: string, storeId: string | null, startTime: string) => 
        `${date}|${storeId || 'null'}|${getTimeSlot(startTime)}`
      
      const importCellMap = new Map<string, { scenario: string; venue: string; index: number }>()
      const duplicatesInImport: string[] = []
      const duplicateIndices = new Set<number>()
      
      for (let i = 0; i < parsedEvents.length; i++) {
        const event = parsedEvents[i]
        if (!event.date || event.is_cancelled) continue
        
        const key = cellKey(event.date, event.store_id, event.start_time)
        const existing = importCellMap.get(key)
        
        if (existing) {
          // 重複があっても警告のみ、最初のイベントを優先
          duplicatesInImport.push(
            `${event.date} ${event.venue} ${getTimeSlot(event.start_time)}: 「${event.scenario || '(空)'}」をスキップ（「${existing.scenario}」が既にあります）`
          )
          duplicateIndices.add(i)
        } else {
          importCellMap.set(key, { scenario: event.scenario || '', venue: event.venue, index: i })
        }
      }
      
      // 重複したイベントを除外
      const filteredEvents = parsedEvents.filter((_: any, index: number) => !duplicateIndices.has(index))

      // データベースに挿入/更新
      let successCount = 0
      let updatedCount = 0
      let failedCount = 0
      let memoCount = 0
      
      // 挿入済みのセルを追跡
      const insertedCells = new Set<string>()

      for (const event of filteredEvents) {
        try {
          // 必須フィールドのチェック
          if (!event.date) {
            failedCount++
            errors.push(`${event.venue} - ${event.scenario}: 日付が不正です`)
            continue
          }
          
          // 店舗がマッピングに存在しない場合はスキップ（警告のみ）
          if (event.store_id === undefined && !(event.venue in STORE_MAPPING)) {
            // 店舗名が明らかにパースエラーの場合（シナリオ名っぽい）はサイレントスキップ
            if (event.venue.includes('(') || event.venue.includes('✅') || 
                event.venue.length > 15 || event.venue.startsWith('募') || event.venue.startsWith('貸')) {
              continue
            }
            errors.push(`⚠️ ${event.date} ${event.venue}: 店舗不明のためスキップ`)
            continue
          }

          const eventCellKey = cellKey(event.date, event.store_id, event.start_time)
          
          // 既存イベントを取得
          const existingEvent = existingEventMap.get(eventCellKey)
          
          // _isMemo, _memoTextフラグを除去してDBに保存するデータを作成
          const { _isMemo, _memoText, ...eventData } = event as typeof event & { _memoText?: string }
          
          // メモの場合の処理
          if (_isMemo) {
            if (existingEvent) {
              // 既存イベントがある場合、notesフィールドに追加
              const existingNotes = existingEvent.notes || ''
              const newNotes = existingNotes ? `${existingNotes}\n${_memoText}` : _memoText
              
              const { error } = await supabase
                .from('schedule_events')
                .update({ notes: newNotes })
                .eq('id', existingEvent.id)
              
              if (error) {
                failedCount++
                errors.push(`${event.date} ${event.venue}: メモ追加失敗 - ${error.message}`)
              } else {
                memoCount++
              }
            } else {
              // 既存イベントがない場合、メモのみのイベントとして新規作成
              const { error } = await supabase
                .from('schedule_events')
                .insert(eventData)
              
              if (error) {
                failedCount++
                errors.push(`${event.date} ${event.venue}: メモ作成失敗 - ${error.message}`)
              } else {
                memoCount++
                insertedCells.add(eventCellKey)
              }
            }
            continue
          }
          
          // 今回のインポート内で既に同じセルに挿入済みの場合はスキップ
          if (insertedCells.has(eventCellKey)) {
            failedCount++
            errors.push(`${event.date} ${event.venue} - ${event.scenario}: 同じセルに既にインポート済みのためスキップ`)
            continue
          }
          
          // 通常の公演の処理
          if (existingEvent) {
            // 既存イベントがある場合、情報をマージして更新
            
            // GM情報のマージ: インポートにGMがあればそれを使用、なければ既存を保持
            const mergedGms = (eventData.gms && eventData.gms.length > 0)
              ? eventData.gms
              : (existingEvent.gms || [])
            
            // シナリオ: インポートにあればそれを使用、なければ既存を保持
            const mergedScenario = eventData.scenario || existingEvent.scenario || ''
            
            // 予約情報: インポートにあればそれを使用、なければ既存を保持
            const mergedReservationInfo = eventData.reservation_info || existingEvent.reservation_info
            
            // notes: 両方あればマージ、片方だけならそれを使用
            const mergedNotes = (() => {
              const importNotes = eventData.notes || ''
              const existingNotes = existingEvent.notes || ''
              if (importNotes && existingNotes && importNotes !== existingNotes) {
                return `${existingNotes}\n${importNotes}`
              }
              return importNotes || existingNotes
            })()
            
            const { error } = await supabase
              .from('schedule_events')
              .update({
                scenario: mergedScenario,
                gms: mergedGms,
                start_time: eventData.start_time,
                end_time: eventData.end_time,
                category: eventData.category,
                reservation_info: mergedReservationInfo,
                notes: mergedNotes,
                is_cancelled: eventData.is_cancelled
              })
              .eq('id', existingEvent.id)
            
            if (error) {
              failedCount++
              errors.push(`${event.date} ${event.venue} - ${event.scenario}: 更新失敗 - ${error.message}`)
            } else {
              updatedCount++
              insertedCells.add(eventCellKey)
            }
          } else {
            // 新規挿入
            const { error } = await supabase
              .from('schedule_events')
              .insert(eventData)

            if (error) {
              failedCount++
              errors.push(`${event.date} ${event.venue} - ${event.scenario}: ${error.message}`)
            } else {
              successCount++
              insertedCells.add(eventCellKey)
            }
          }
        } catch (err) {
          failedCount++
          errors.push(`${event.date} ${event.venue} - ${event.scenario}: ${String(err)}`)
        }
      }

      // 結果にすべての情報を含める
      const totalSuccess = successCount + updatedCount + memoCount
      const resultErrors = [...errors]
      if (duplicatesInImport.length > 0) {
        resultErrors.unshift(`⚠️ ${duplicatesInImport.length}件の重複をスキップしました`)
        resultErrors.push(...duplicatesInImport)
      }
      if (updatedCount > 0) {
        resultErrors.unshift(`ℹ️ ${updatedCount}件の既存公演を上書き更新しました`)
      }
      if (memoCount > 0) {
        resultErrors.unshift(`ℹ️ ${memoCount}件のメモを処理しました`)
      }
      
      setResult({ success: totalSuccess, failed: failedCount, errors: resultErrors })

      if (successCount > 0) {
        setTimeout(() => {
          // インポート対象の月を通知して、その月に切り替えられるようにする
          onImportComplete(targetMonth || undefined)
          handleClose()
        }, 2000)
      }
    } catch (error) {
      setResult({ 
        success: 0, 
        failed: 0, 
        errors: [`解析エラー: ${error instanceof Error ? error.message : String(error)}`] 
      })
    } finally {
      setIsImporting(false)
    }
  }

  const handleClose = () => {
    setScheduleText('')
    setResult(null)
    setShowPreview(false)
    setPreviewEvents([])
    setPreviewErrors([])
    setParsedEvents([])
    setExistingEventMap(new Map())
    onClose()
  }
  
  // プレビュー処理（パースのみ）
  const handlePreview = async () => {
    setShowPreview(false)
    setPreviewEvents([])
    setPreviewErrors([])
    
    try {
      const lines = scheduleText.trim().split('\n')
      const events: any[] = []
      const errors: string[] = []
      let currentDate = ''
      let currentWeekday = ''
      
      // インポート対象の月を特定
      let targetMonth: { year: number; month: number } | null = null
      
      for (const line of lines) {
        if (!line.trim()) continue
        const parts = line.split('\t').map(p => p.trim())
        if (parts.length < 2) continue
        const dateStr = parts[0]
        if (dateStr && dateStr.includes('/')) {
          const dateParts = dateStr.split('/')
          if (dateParts.length === 2) {
            targetMonth = { year: 2025, month: parseInt(dateParts[0]) }
            break
          }
        }
      }
      
      // 既存イベントを取得
      let existingEvents: Array<{ id: string; date: string; store_id: string | null; start_time: string; is_cancelled: boolean; scenario?: string; notes?: string; gms?: string[]; reservation_info?: string }> = []
      if (targetMonth) {
        const startDate = `${targetMonth.year}-${String(targetMonth.month).padStart(2, '0')}-01`
        const endDate = `${targetMonth.year}-${String(targetMonth.month).padStart(2, '0')}-31`
        
        const { data } = await supabase
          .from('schedule_events')
          .select('id, date, store_id, start_time, is_cancelled, scenario, notes, gms, reservation_info')
          .gte('date', startDate)
          .lte('date', endDate)
        
        existingEvents = data || []
      }
      
      // 既存イベントをセルキーでインデックス化
      const existingMap = new Map<string, typeof existingEvents[0]>()
      for (const existing of existingEvents) {
        if (existing.is_cancelled) continue
        const key = `${existing.date}|${existing.store_id || 'null'}|${getTimeSlot(existing.start_time)}`
        existingMap.set(key, existing)
      }
      setExistingEventMap(existingMap)
      
      // 店舗名のリスト
      const validVenues = Object.keys(STORE_MAPPING)
      
      // パース処理
      for (const line of lines) {
        if (!line.trim()) continue
        const parts = line.split('\t').map(p => p.trim())
        if (parts.length < 3) continue
        
        const dateStr = parts[0]
        if (dateStr && dateStr.includes('/')) {
          currentDate = dateStr
          currentWeekday = parts[1] || currentWeekday
        }
        
        if (!currentDate) continue
        
        // 店舗列を自動検出
        let venueIdx = -1
        let venue = ''
        
        if (parts[2] && validVenues.includes(parts[2])) {
          venueIdx = 2
          venue = parts[2]
        } else if (parts[3] && validVenues.includes(parts[3])) {
          venueIdx = 3
          venue = parts[3]
        } else {
          continue
        }
        
        // 時間帯インデックス
        let timeSlots: Array<{ titleIdx: number; gmIdx: number; defaultStart: string; defaultEnd: string; slotName: string }>
        
        if (venueIdx === 2) {
          timeSlots = [
            { titleIdx: 3, gmIdx: 4, defaultStart: '13:00', defaultEnd: '17:00', slotName: '昼' },
            { titleIdx: 5, gmIdx: 6, defaultStart: '19:00', defaultEnd: '23:00', slotName: '夜' }
          ]
        } else {
          timeSlots = [
            { titleIdx: 4, gmIdx: 5, defaultStart: '09:00', defaultEnd: '13:00', slotName: '朝' },
            { titleIdx: 6, gmIdx: 7, defaultStart: '13:00', defaultEnd: '18:00', slotName: '昼' },
            { titleIdx: 8, gmIdx: 9, defaultStart: '19:00', defaultEnd: '23:00', slotName: '夜' }
          ]
        }
        
        for (const slot of timeSlots) {
          const title = parts[slot.titleIdx]
          if (!title || title.trim() === '') continue
          
          const gmText = parts[slot.gmIdx] || ''
          const times = parseTimeFromTitle(title)
          const storeId = STORE_MAPPING[venue]
          
          // 元のシナリオ名（マッピング前）を抽出
          let rawScenarioText = title.replace(/^(貸・|募・|出張・|GMテスト・|テストプレイ・)/, '')
          const scenarioMatch = rawScenarioText.match(/^([^(（]+)/)
          if (scenarioMatch) {
            rawScenarioText = scenarioMatch[1].trim()
          }
          rawScenarioText = rawScenarioText.split('※')[0].split('✅')[0].split('🈵')[0].trim()
          
          // マッピング後のシナリオ名
          const scenarioName = extractScenarioName(title)
          const scenarioMapped = rawScenarioText !== scenarioName && scenarioName !== ''
          
          const isMemo = (!scenarioName || scenarioName.length <= 1) && !times
          
          const cellKey = `${parseDate(currentDate)}|${storeId || 'null'}|${getTimeSlot(times?.start || slot.defaultStart)}`
          const hasExisting = existingMap.has(cellKey)
          
          const gmResult = parseGmNamesWithMapping(gmText)
          
          events.push({
            date: parseDate(currentDate),
            venue,
            store_id: storeId,
            scenario: scenarioName,
            gms: gmResult.gms,
            start_time: times?.start || slot.defaultStart,
            end_time: times?.end || slot.defaultEnd,
            category: isMemo ? 'memo' : determineCategory(title),
            notes: extractNotes(title),
            reservation_info: extractReservationInfo(title),
            is_cancelled: isCancelled(title),
            organization_id: ORGANIZATION_ID,
            _isMemo: isMemo,
            _memoText: isMemo ? title.trim() : undefined,
            _slotName: slot.slotName,
            _hasExisting: hasExisting,
            _rawTitle: title,
            _originalScenario: rawScenarioText,
            _scenarioMapped: scenarioMapped,
            _originalGmText: gmText,
            _gmMappings: gmResult.mappings
          })
        }
      }
      
      // プレビュー用データ作成
      const preview: PreviewEvent[] = events.map(e => ({
        date: e.date,
        venue: e.venue,
        timeSlot: e._slotName,
        scenario: e._isMemo ? `[メモ] ${e._rawTitle}` : e.scenario,
        originalScenario: e._originalScenario || '',
        scenarioMapped: e._scenarioMapped || false,
        gms: e.gms,
        originalGms: e._originalGmText || '',
        gmMappings: e._gmMappings || [],
        category: e.category,
        isMemo: e._isMemo,
        hasExisting: e._hasExisting
      }))
      
      setParsedEvents(events)
      setPreviewEvents(preview)
      setPreviewErrors(errors)
      setShowPreview(true)
      
    } catch (error) {
      setPreviewErrors([`解析エラー: ${error instanceof Error ? error.message : String(error)}`])
      setShowPreview(true)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="!max-w-none w-[95vw] h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>スケジュールデータのインポート</DialogTitle>
          <DialogDescription>
            スプレッドシートからコピーしたデータを貼り付けてください（タブ区切り形式）
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!showPreview ? (
            <>
              {/* 入力フェーズ */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  スケジュールデータ（Excel/Googleスプレッドシートからコピー）
                </label>
                <Textarea
                  value={scheduleText}
                  onChange={(e) => setScheduleText(e.target.value)}
                  placeholder="10/1&#9;火&#9;馬場&#9;シナリオ名（13:00-17:00）&#9;GM名&#9;夜シナリオ（19:00-22:00）&#9;夜GM..."
                  className="min-h-[300px] font-mono text-xs"
                  disabled={isImporting}
                />
                <p className="text-xs text-gray-500 mt-2">
                  ※ スプレッドシートで範囲を選択してコピー（Ctrl+C / Cmd+C）し、ここに貼り付けてください
                </p>
              </div>
            </>
          ) : (
            <>
              {/* プレビューフェーズ */}
              <div className="border rounded-lg p-3 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm">インポートプレビュー</h3>
                  <span className="text-xs text-gray-600">
                    {previewEvents.length}件のイベント
                    （上書き: {previewEvents.filter(e => e.hasExisting).length}件）
                  </span>
                </div>
                
                {previewErrors.length > 0 && (
                  <Alert variant="destructive" className="mb-3">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="text-xs">
                        {previewErrors.map((err, i) => (
                          <div key={i}>{err}</div>
                        ))}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
                
                <div className="max-h-[400px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-100">
                      <tr>
                        <th className="text-left p-1 border-b">日付</th>
                        <th className="text-left p-1 border-b">店舗</th>
                        <th className="text-left p-1 border-b">時間帯</th>
                        <th className="text-left p-1 border-b">カテゴリ</th>
                        <th className="text-left p-1 border-b">シナリオ</th>
                        <th className="text-left p-1 border-b">GM</th>
                        <th className="text-left p-1 border-b">状態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewEvents.map((event, i) => (
                        <tr key={i} className={event.hasExisting ? 'bg-yellow-50' : event.isMemo ? 'bg-blue-50' : ''}>
                          <td className="p-1 border-b text-nowrap">{event.date}</td>
                          <td className="p-1 border-b text-nowrap">{event.venue}</td>
                          <td className="p-1 border-b text-nowrap">{event.timeSlot}</td>
                          <td className="p-1 border-b min-w-[80px]">
                            <Select
                              value={event.category}
                              onValueChange={(value) => {
                                const newPreview = [...previewEvents]
                                newPreview[i] = { ...newPreview[i], category: value }
                                setPreviewEvents(newPreview)
                                const newParsed = [...parsedEvents]
                                newParsed[i] = { ...newParsed[i], category: value }
                                setParsedEvents(newParsed)
                              }}
                            >
                              <SelectTrigger className="h-6 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CATEGORY_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-1 border-b min-w-[180px]">
                            {event.isMemo ? (
                              <span className="text-gray-500">{event.scenario}</span>
                            ) : (
                              <div>
                                <Select
                                  value={event.scenario || '__none__'}
                                  onValueChange={(value) => {
                                    const newPreview = [...previewEvents]
                                    newPreview[i] = { ...newPreview[i], scenario: value === '__none__' ? '' : value, scenarioMapped: true }
                                    setPreviewEvents(newPreview)
                                    // parsedEventsも更新
                                    const newParsed = [...parsedEvents]
                                    newParsed[i] = { ...newParsed[i], scenario: value === '__none__' ? '' : value }
                                    setParsedEvents(newParsed)
                                  }}
                                >
                                  <SelectTrigger className="h-6 text-xs">
                                    <SelectValue placeholder="シナリオを選択" />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-[300px]">
                                    <SelectItem value="__none__">（なし）</SelectItem>
                                    {scenarioList.map((s) => (
                                      <SelectItem key={s.id} value={s.title}>
                                        {s.title}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {event.scenarioMapped && event.originalScenario && (
                                  <div className="text-[10px] text-purple-600 mt-0.5">
                                    {event.originalScenario}→
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-1 border-b min-w-[140px]">
                            <div className="space-y-1">
                              {event.gms.map((gm, gmIdx) => (
                                <Select
                                  key={gmIdx}
                                  value={gm || '__none__'}
                                  onValueChange={(value) => {
                                    const newGms = [...event.gms]
                                    if (value === '__none__') {
                                      newGms.splice(gmIdx, 1)
                                    } else {
                                      newGms[gmIdx] = value
                                    }
                                    const newPreview = [...previewEvents]
                                    newPreview[i] = { ...newPreview[i], gms: newGms }
                                    setPreviewEvents(newPreview)
                                    // parsedEventsも更新
                                    const newParsed = [...parsedEvents]
                                    newParsed[i] = { ...newParsed[i], gms: newGms }
                                    setParsedEvents(newParsed)
                                  }}
                                >
                                  <SelectTrigger className="h-6 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-[300px]">
                                    <SelectItem value="__none__">（削除）</SelectItem>
                                    {staffList.map((s) => (
                                      <SelectItem key={s.id} value={s.name}>
                                        {s.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ))}
                              {/* GMを追加するボタン */}
                              <Select
                                value=""
                                onValueChange={(value) => {
                                  if (value && value !== '__add__') {
                                    const newGms = [...event.gms, value]
                                    const newPreview = [...previewEvents]
                                    newPreview[i] = { ...newPreview[i], gms: newGms }
                                    setPreviewEvents(newPreview)
                                    // parsedEventsも更新
                                    const newParsed = [...parsedEvents]
                                    newParsed[i] = { ...newParsed[i], gms: newGms }
                                    setParsedEvents(newParsed)
                                  }
                                }}
                              >
                                <SelectTrigger className="h-5 text-[10px] text-gray-400 border-dashed">
                                  <span>+ GM追加</span>
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                  {staffList.map((s) => (
                                    <SelectItem key={s.id} value={s.name}>
                                      {s.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {event.gmMappings.length > 0 && (
                                <div className="text-[10px] text-purple-600 mt-0.5">
                                  {event.originalGms}→
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-1 border-b text-nowrap">
                            {event.isMemo ? (
                              <span className="text-blue-600">メモ</span>
                            ) : event.hasExisting ? (
                              <span className="text-yellow-600">上書き</span>
                            ) : (
                              <span className="text-green-600">新規</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <div className="mt-3 flex gap-2 text-xs">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-3 bg-green-100 border border-green-300 rounded"></span>
                    新規追加
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-3 bg-yellow-100 border border-yellow-300 rounded"></span>
                    既存を上書き
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-3 bg-blue-100 border border-blue-300 rounded"></span>
                    メモ
                  </span>
                </div>
              </div>
            </>
          )}

          {result && (
            <Alert variant={result.failed > 0 ? "destructive" : "default"}>
              {result.failed > 0 ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <AlertDescription>
                <div className="font-semibold mb-2">
                  インポート完了: 成功 {result.success}件 / 失敗 {result.failed}件
                </div>
                {result.errors.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto text-xs">
                    <div className="font-semibold mb-1">詳細:</div>
                    {result.errors.map((error, i) => (
                      <div key={i} className={error.startsWith('ℹ️') || error.startsWith('⚠️') ? 'text-gray-600' : 'text-red-600'}>{error}</div>
                    ))}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isImporting}>
            キャンセル
          </Button>
          
          {!showPreview ? (
            <Button 
              onClick={handlePreview} 
              disabled={!scheduleText.trim()}
            >
              プレビュー
            </Button>
          ) : (
            <>
              <Button 
                variant="outline"
                onClick={() => setShowPreview(false)}
                disabled={isImporting}
              >
                戻る
              </Button>
              <Button 
                onClick={handleImport} 
                disabled={previewEvents.length === 0 || isImporting}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    インポート中...
                  </>
                ) : (
                  `${previewEvents.length}件をインポート`
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

