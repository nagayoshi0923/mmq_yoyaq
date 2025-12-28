import { useState, useEffect, useMemo, useRef } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { MultiSelect } from '@/components/ui/multi-select'
import { supabase } from '@/lib/supabase'
import { memoApi } from '@/lib/api/memoApi'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { logger } from '@/utils/logger'
import { getTimeSlot } from '@/utils/scheduleUtils'

interface ImportScheduleModalProps {
  isOpen: boolean
  onClose: () => void
  currentDisplayDate?: Date  // 現在表示中の年月
  onImportComplete: (targetMonth?: { year: number; month: number }) => void
}

// 組織ID（クインズワルツ）
const ORGANIZATION_ID = 'a0000000-0000-0000-0000-000000000001'

// 不正なUnicode文字（壊れたサロゲートペア）を除去する関数
const sanitizeText = (text: string | null | undefined): string => {
  if (!text) return ''
  // サロゲートペアの壊れた文字を除去
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
}

// 公演カテゴリ
const CATEGORY_OPTIONS = [
  { value: 'open', label: '募集' },
  { value: 'private', label: '貸切' },
  { value: 'gmtest', label: 'GMテスト' },
  { value: 'testplay', label: 'テストプレイ' },
  { value: 'offsite', label: '出張' },
  { value: 'venue_rental', label: '場所貸し' },
  { value: 'venue_rental_free', label: '場所貸し(無料)' },
  { value: 'package', label: 'パッケージ' },
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
  "オンライン": null,  // オンラインはstore_idなし
  // 追加の店舗・イベント種別
  "出張": null,  // 出張公演
  "ゲムマ": null,  // ゲームマーケット
  "SME": null,  // SME会場
  "制作打ち合わせ": null,  // 打ち合わせ
  "別会場": null,  // 別会場
  "オフィス": null  // オフィス
}

// シナリオ名の揺らぎを統一するマッピング（略称 → 正式名称）
const SCENARIO_NAME_MAPPING: Record<string, string> = {
  // 季節マダミス
  "カノケリ": "季節／カノケリ",
  "アニクシィ": "季節／アニクシィ",
  "シノポロ": "季節／シノポロ",
  "キモナス": "季節／キモナス",
  "ニィホン": "季節／ニィホン",
  // 略称
  "さきこさん": "裂き子さん",
  "サキコサン": "裂き子さん",
  "トレタリ": "超特急の呪いの館で撮れ高足りてますか？",
  "赤鬼": "赤鬼が泣いた夜",
  "invisible": "Invisible-亡霊列車-",
  "Invisible": "Invisible-亡霊列車-",
  "童話裁判": "傲慢女王とアリスの不条理裁判",
  "傲慢な女王とアリスの不条理裁判": "傲慢女王とアリスの不条理裁判",
  // 数字の揺らぎ
  "凍てつくあなたに6つの灯火": "凍てつくあなたに６つの灯火",
  // REDRUM
  "REDRUM1": "REDRUM01泉涌館の変転",
  "REDRUM2": "REDRUM02虚像のF",
  "REDRUM3": "REDRUM03致命的観測をもう一度",
  "REDRUM4": "REDRUM4アルテミスの断罪",
  // ナナイロ
  "ナナイロ橙": "ナナイロの迷宮 橙 オンラインゲーム殺人事件",
  "ナナイロ緑": "ナナイロの迷宮 緑 アペイロン研究所殺人事件",
  "ナナイロ黄": "ナナイロの迷宮 黄 エレクトリカル吹奏楽部殺人事件",
  // 狂気山脈
  "狂気山脈1": "狂気山脈　陰謀の分水嶺（１）",
  "狂気山脈2": "狂気山脈　星降る天辺（２）",
  "狂気山脈3": "狂気山脈　薄明三角点（３）",
  "狂気山脈２．５": "狂気山脈　2.5　頂上戦争",
  "狂気山脈2.5": "狂気山脈　2.5　頂上戦争",
  "狂気山脈１": "狂気山脈　陰謀の分水嶺（１）",
  "狂気山脈２": "狂気山脈　星降る天辺（２）",
  "狂気山脈３": "狂気山脈　薄明三角点（３）",
  // その他
  "TOOLS": "TOOLS〜ぎこちない椅子",
  "MTG": "MTG（マネージャーミーティング）",
  "ENIGMA CODE": "ENIGMACODE廃棄ミライの犠牲者たち",
  "ソルシエ": "SORCIER〜賢者達の物語〜",
  "SORCIER": "SORCIER〜賢者達の物語〜",
  "藍雨": "藍雨廻逢",
  "THEREALFOLK'30s": "TheRealFork30's",
  "THEREALFOLK": "TheRealFork30's",
  "TheRealFolk": "TheRealFork30's",
  // 表記ゆれ
  "真渋谷陰陽奇譚": "真・渋谷陰陽奇譚",
  "真渋谷陰陽綺譚": "真・渋谷陰陽奇譚",
  "渋谷陰陽奇譚": "真・渋谷陰陽奇譚",
  "渋谷陰陽綺譚": "真・渋谷陰陽奇譚",
  "真・渋谷陰陽綺譚": "真・渋谷陰陽奇譚",
  "土牢の悲鳴に谺して": "土牢に悲鳴は谺して",
  "ナナイロの迷宮-緑-アペイロン研究所殺人事件": "ナナイロの迷宮 緑 アペイロン研究所殺人事件",
  "ナナイロの迷宮・緑アペイロン研究所殺人事件": "ナナイロの迷宮 緑 アペイロン研究所殺人事件",
  "ナナイロの迷宮　緑　アペイロン研究所殺人事件": "ナナイロの迷宮 緑 アペイロン研究所殺人事件",
  "百鬼の夜月光の影": "百鬼の夜、月光の影",
  "インビジブル亡霊列車": "Invisible-亡霊列車-",
  "くずの葉の森": "くずの葉のもり",
  "ドクターテラスの秘密の実験": "ドクター・テラスの秘密の実験",
  "あるミステリーについて": "あるマーダーミステリーについて",
  "MurderWonderLand": "リアルマダミス-MurderWonderLand",
  "GROLIAMEMORIES": "グロリアメモリーズ",
  "グロリアメモリーズ": "グロリアメモリーズ",
  "REDRUM02「虚像のF」": "REDRUM02虚像のF",
  // 画像から追加
  "女皇の書架": "女皇の書架",
  "クロノフォビア": "クロノフォビア",
  "人類最後の皆様へ": "人類最後の皆様へ／終末の眠り姫",
  "人類最後の皆様へ／終末の眠り姫": "人類最後の皆様へ／終末の眠り姫",
  "終末の眠り姫": "人類最後の皆様へ／終末の眠り姫",
  "黒と白の狭間に": "黒と白の狭間に",
  "ナナイロの迷宮　緑　アペイロン研究所殺人事件": "ナナイロの迷宮 緑 アペイロン研究所殺人事件",
  "ナナイロの迷宮 緑 アペイロン研究所殺人事件": "ナナイロの迷宮 緑 アペイロン研究所殺人事件",
  "ナナイロ　緑": "ナナイロの迷宮 緑 アペイロン研究所殺人事件",
  "ナナイロ 緑": "ナナイロの迷宮 緑 アペイロン研究所殺人事件",
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
  "IDA": "Ida",
  // 画像から追加
  "ガッ": "がっちゃん",
  "ガツ": "がっちゃん",
  "ガッ経由": "がっちゃん",
  "えなさん": "えなみ",
  "えな": "えなみ"
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
  gmRoles: Record<string, string>  // GM役割 { "GM名": "main" | "sub" | "reception" | "staff" | "observer" }
  originalGms: string  // マッピング前の元のGM入力
  gmMappings: Array<{ from: string; to: string }>  // マッピング情報
  category: string
  isMemo: boolean
  hasExisting: boolean
  notes?: string  // メモ/備考
}

// GM役割オプション（公演ダイアログと色を統一）
const GM_ROLE_OPTIONS = [
  { value: 'main', label: 'メインGM', color: 'bg-gray-100 text-gray-800' },
  { value: 'sub', label: 'サブGM', color: 'bg-blue-100 text-blue-800' },
  { value: 'reception', label: '受付', color: 'bg-orange-100 text-orange-800' },
  { value: 'staff', label: 'スタッフ', color: 'bg-green-100 text-green-800' },
  { value: 'observer', label: '見学', color: 'bg-purple-100 text-purple-800' },
]

export function ImportScheduleModal({ isOpen, onClose, currentDisplayDate, onImportComplete }: ImportScheduleModalProps) {
  const [scheduleText, setScheduleText] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [replaceExisting, setReplaceExisting] = useState(true)
  const [result, setResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null)
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null)
  
  // プレビュー用のステート
  const [showPreview, setShowPreview] = useState(false)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [previewEvents, setPreviewEvents] = useState<PreviewEvent[]>([])
  const [previewErrors, setPreviewErrors] = useState<string[]>([])
  const [parsedEvents, setParsedEvents] = useState<any[]>([])
  const [existingEventMap, setExistingEventMap] = useState<Map<string, any>>(new Map())
  const [importTargetMonth, setImportTargetMonth] = useState<{ year: number; month: number } | null>(null)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  
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
  // マッチング結果のキャッシュ
  const staffMatchCache = useMemo(() => new Map<string, string | null>(), [])
  const scenarioMatchCache = useMemo(() => new Map<string, string | null>(), [])
  
  // SearchableSelect用のオプション
  const scenarioOptions = useMemo(() => [
    { value: '__none__', label: '（なし）' },
    ...scenarioList.map(s => ({ value: s.title, label: s.title }))
  ], [scenarioList])
  
  const findBestStaffMatch = (input: string): string | null => {
    if (!input || input.length === 0) return null
    
    const normalizedInput = input.trim()
    
    // キャッシュをチェック
    if (staffMatchCache.has(normalizedInput)) {
      return staffMatchCache.get(normalizedInput) || null
    }
    
    // ヘルパー関数：結果をキャッシュに保存して返す
    const cacheAndReturn = (result: string | null): string | null => {
      staffMatchCache.set(normalizedInput, result)
      return result
    }
    
    // 1. 完全一致チェック（動的マッピング）
    if (dynamicStaffMapping[normalizedInput]) {
      return cacheAndReturn(dynamicStaffMapping[normalizedInput])
    }
    
    // 2. ひらがな/カタカナ変換して完全一致チェック
    const hiraganaInput = toHiragana(normalizedInput)
    const katakanaInput = toKatakana(normalizedInput)
    
    if (dynamicStaffMapping[hiraganaInput]) {
      return cacheAndReturn(dynamicStaffMapping[hiraganaInput])
    }
    if (dynamicStaffMapping[katakanaInput]) {
      return cacheAndReturn(dynamicStaffMapping[katakanaInput])
    }
    
    // 3. スタッフリストから完全一致チェック
    for (const staff of staffList) {
      if (staff.name === normalizedInput) {
        return cacheAndReturn(staff.name)
      }
      // ひらがな/カタカナで一致
      const staffHiragana = toHiragana(staff.name)
      const staffKatakana = toKatakana(staff.name)
      if (staffHiragana === hiraganaInput || staffKatakana === katakanaInput) {
        return cacheAndReturn(staff.name)
      }
    }
    
    // 4. 前方一致・部分一致チェック
    for (const staff of staffList) {
      const staffHiragana = toHiragana(staff.name)
      const staffKatakana = toKatakana(staff.name)
      
      // 入力がスタッフ名で始まる
      if (normalizedInput.startsWith(staff.name) && staff.name.length >= 2) {
        return cacheAndReturn(staff.name)
      }
      // スタッフ名が入力で始まる
      if (staff.name.startsWith(normalizedInput) && normalizedInput.length >= 2) {
        return cacheAndReturn(staff.name)
      }
      // ひらがな/カタカナで前方一致
      if (hiraganaInput.startsWith(staffHiragana) && staffHiragana.length >= 2) {
        return cacheAndReturn(staff.name)
      }
      if (staffHiragana.startsWith(hiraganaInput) && hiraganaInput.length >= 2) {
        return cacheAndReturn(staff.name)
      }
      if (katakanaInput.startsWith(staffKatakana) && staffKatakana.length >= 2) {
        return cacheAndReturn(staff.name)
      }
      if (staffKatakana.startsWith(katakanaInput) && katakanaInput.length >= 2) {
        return cacheAndReturn(staff.name)
      }
      // 入力がスタッフ名を含む
      if (normalizedInput.includes(staff.name) && staff.name.length >= 2) {
        return cacheAndReturn(staff.name)
      }
      // スタッフ名が入力を含む（逆方向）
      if (staff.name.includes(normalizedInput) && normalizedInput.length >= 2) {
        return cacheAndReturn(staff.name)
      }
      // ひらがな/カタカナで部分一致
      if (hiraganaInput.includes(staffHiragana) && staffHiragana.length >= 2) {
        return cacheAndReturn(staff.name)
      }
      if (staffHiragana.includes(hiraganaInput) && hiraganaInput.length >= 2) {
        return cacheAndReturn(staff.name)
      }
    }
    
    // 類似度マッチングは削除（パフォーマンス改善のため）
    // 上記の完全一致・部分一致で見つからない場合はnullを返す
    
    staffMatchCache.set(normalizedInput, null)
    return null
  }
  
  // 類似度マッチングでシナリオ名を検索
  const findBestScenarioMatch = (input: string): string | null => {
    if (!input || input.length === 0) return null
    
    const normalizedInput = input.trim()
    
    // キャッシュをチェック
    if (scenarioMatchCache.has(normalizedInput)) {
      return scenarioMatchCache.get(normalizedInput) || null
    }
    
    // 1. 静的マッピングチェック
    if (SCENARIO_NAME_MAPPING[normalizedInput]) {
      const result = SCENARIO_NAME_MAPPING[normalizedInput]
      scenarioMatchCache.set(normalizedInput, result)
      return result
    }
    
    // 2. シナリオリストから完全一致チェック
    for (const scenario of scenarioList) {
      if (scenario.title === normalizedInput) {
        scenarioMatchCache.set(normalizedInput, scenario.title)
        return scenario.title
      }
    }
    
    // 3. 部分一致チェック（入力がシナリオ名を含む、またはシナリオ名が入力を含む）
    for (const scenario of scenarioList) {
      const scenarioName = scenario.title
      // 入力がシナリオ名で始まる
      if (normalizedInput.startsWith(scenarioName)) {
        scenarioMatchCache.set(normalizedInput, scenarioName)
        return scenarioName
      }
      // シナリオ名が入力で始まる（短い入力でも長いシナリオ名にマッチ）
      if (scenarioName.startsWith(normalizedInput) && normalizedInput.length >= 3) {
        scenarioMatchCache.set(normalizedInput, scenarioName)
        return scenarioName
      }
      // 入力がシナリオ名を含む
      if (normalizedInput.includes(scenarioName) && scenarioName.length >= 3) {
        scenarioMatchCache.set(normalizedInput, scenarioName)
        return scenarioName
      }
    }
    
    // 類似度マッチングは削除（パフォーマンス改善のため）
    // 上記の完全一致・部分一致で見つからない場合はnullを返す
    
    scenarioMatchCache.set(normalizedInput, null)
    return null
  }

  // カテゴリを判定
  const determineCategory = (title: string): string => {
    // プレフィックスパターン（全角・半角両対応）
    if (title.startsWith('貸・') || title.startsWith('貸 ') || title.startsWith('貸/')) return 'private'
    if (title.startsWith('募・') || title.startsWith('募 ') || title.startsWith('募/')) return 'open'
    if (title.startsWith('出張・') || title.startsWith('出張 ')) return 'offsite'
    if (title.startsWith('GMテスト・') || title.startsWith('GMテスト ') || title.startsWith('GMテスト')) return 'gmtest'
    if (title.startsWith('テストプレイ・') || title.startsWith('テストプレイ ')) return 'testplay'
    if (title.startsWith('テスプ・') || title.startsWith('テスプ ')) return 'testplay'
    if (title.startsWith('場所貸')) return 'venue_rental'
    if (title.includes('MTG')) return 'mtg'
    // 内容でも判定
    if (title.includes('GMテスト')) return 'gmtest'
    if (title.includes('テストプレイ') || title.includes('テスプ')) return 'testplay'
    // 貸切は様付き（お客様名）があれば判定
    if (title.includes('様') && !title.startsWith('募')) return 'private'
    return 'open'
  }

  // シナリオ名を抽出
  const extractScenarioName = (title: string): string => {
    if (!title || title.trim() === '') return ''
    
    // プレフィックスを除去（全角・半角両対応）
    let text = title.replace(/^(貸・|貸 |貸\/|募・|募 |募\/|出張・|出張 |GMテスト・|GMテスト |テストプレイ・|テストプレイ |テスプ・|テスプ |場所貸・|場所貸 )/, '')
    
    // MTGの場合
    if (text.includes('MTG')) return 'MTG（マネージャーミーティング）'
    
    // 時間表記の括弧で区切って、最初の部分（シナリオ名）のみを取得
    // 例: "女皇の書架(14.5-18)ガッ経由" → "女皇の書架"
    const match = text.match(/^([^(（\d]+)/)
    if (match) {
      text = match[1].trim()
    } else {
      // 括弧がない場合は最初の括弧または数字の前まで
      const simpleMatch = text.match(/^([^(（]+)/)
      if (simpleMatch) {
        text = simpleMatch[1].trim()
      }
    }
    
    // 記号の前で切る
    text = text.split('※')[0]
    text = text.split('✅')[0]
    text = text.split('🈵')[0]
    text = text.split('🙅')[0]
    text = text.split('🈳')[0]
    text = text.split('空')[0] // "空4" などを除去
    
    // 円表記の前で切る（価格情報）
    text = text.split(/\d+円/)[0]
    
    // 様の前で切る場合は様も含める（お客様名は別途抽出）
    // お客様名がシナリオ名の後に続く場合を考慮
    
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
    if (title.includes('🈳')) {
      const emptyMatch = title.match(/🈳\s*(\d+)/)
      if (emptyMatch) {
        notes.push(`空き${emptyMatch[1]}`)
      } else {
        notes.push('空きあり')
      }
    }
    if (title.match(/空\s*(\d+)/)) {
      const emptyMatch = title.match(/空\s*(\d+)/)
      if (emptyMatch) notes.push(`空き${emptyMatch[1]}`)
    }
    if (title.includes('🙅‍♀️') || title.includes('🙅')) notes.push('中止')
    
    if (title.includes('@') && title.includes('人')) {
      const participantMatch = title.match(/@(\d+)(?:人)?/)
      if (participantMatch) notes.push(`参加者募集中(@${participantMatch[1]})`)
    }
    
    if (title.includes('指定')) notes.push('GM指定')
    if (title.includes('見学')) notes.push('見学あり')
    if (title.includes('完了')) notes.push('完了')
    if (title.includes('確認')) notes.push('要確認')
    if (title.includes('印刷')) notes.push('印刷必須')
    if (title.includes('経由')) {
      const viaMatch = title.match(/([^(\s]+)経由/)
      if (viaMatch) notes.push(`${viaMatch[1]}経由`)
    }
    
    // 金額情報を抽出
    const priceMatch = title.match(/(\d+)円/)
    if (priceMatch) notes.push(`${priceMatch[1]}円`)
    
    // 集まりました等のメモ
    if (title.includes('集まりました')) notes.push('集まりました')
    
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

  // 日付を解析（現在表示中の年を使用）
  const parseDate = (dateStr: string, year?: number): string => {
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
    const targetYear = year || currentDisplayDate?.getFullYear() || new Date().getFullYear()
    return `${targetYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // インポート処理（プレビュー済みのデータを使用）
  const handleImport = async () => {
    if (previewEvents.length === 0) {
      setResult({ success: 0, failed: 0, errors: ['インポートするデータがありません'] })
      return
    }
    
    setIsImporting(true)
    setResult(null)
    
    // previewEventsの変更をparsedEventsにマージ
    const mergedEvents = parsedEvents.map((event, i) => {
      const preview = previewEvents[i]
      if (!preview) return event
      return {
        ...event,
        scenario: preview.scenario,
        gms: preview.gms,
        category: preview.category,
        notes: preview.notes || event.notes,
        isMemo: preview.isMemo,
        gm_roles: preview.gmRoles
      }
    })
    
    setImportProgress({ current: 0, total: mergedEvents.length })

    // UIが更新されるのを待つ
    await new Promise(resolve => setTimeout(resolve, 50))

    try {
      const errors: string[] = []
      
      // インポートデータ内での重複チェック（同じセルに2つのシナリオがある場合、最初のものを使用）
      const cellKey = (date: string, storeId: string | null, startTime: string) => 
        `${date}|${storeId || 'null'}|${getTimeSlot(startTime)}`
      
      const importCellMap = new Map<string, { scenario: string; venue: string; index: number }>()
      const duplicatesInImport: string[] = []
      const duplicateIndices = new Set<number>()
      
      for (let i = 0; i < mergedEvents.length; i++) {
        const event = mergedEvents[i]
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
      const filteredEvents = mergedEvents.filter((_: any, index: number) => !duplicateIndices.has(index))

      // 既存データを削除するオプションが有効な場合
      let deletedCount = 0
      if (replaceExisting && importTargetMonth) {
        const startDate = `${importTargetMonth.year}-${String(importTargetMonth.month).padStart(2, '0')}-01`
        // 月末日を正しく計算（翌月の0日 = 当月の最終日）
        const lastDay = new Date(importTargetMonth.year, importTargetMonth.month, 0).getDate()
        const endDate = `${importTargetMonth.year}-${String(importTargetMonth.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
        
        console.log(`🗑️ 削除対象期間: ${startDate} 〜 ${endDate}`)
        
        // まず対象月のschedule_eventsのIDを取得
        const { data: eventsToDelete, error: fetchError } = await supabase
          .from('schedule_events')
          .select('id')
          .gte('date', startDate)
          .lte('date', endDate)
        
        if (fetchError) {
          setResult({ success: 0, failed: 0, errors: [`❌ 既存データ取得エラー: ${fetchError.message}`] })
          setIsImporting(false)
          return
        }
        
        console.log(`🗑️ 削除対象イベント数: ${eventsToDelete?.length || 0}件`)
        
        if (eventsToDelete && eventsToDelete.length > 0) {
          const eventIds = eventsToDelete.map(e => e.id)
          
          // バッチサイズ（Supabaseの制限対策）
          const BATCH_SIZE = 100
          
          // 関連するreservationsを先に削除（外部キー制約対策）
          for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
            const batchIds = eventIds.slice(i, i + BATCH_SIZE)
            const { error: resDeleteError } = await supabase
              .from('reservations')
              .delete()
              .in('schedule_event_id', batchIds)
            
            if (resDeleteError) {
              console.warn('予約削除警告:', resDeleteError.message)
            }
          }
          
          // schedule_eventsを削除
          for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
            const batchIds = eventIds.slice(i, i + BATCH_SIZE)
            const { error: deleteError } = await supabase
              .from('schedule_events')
              .delete()
              .in('id', batchIds)
            
            if (deleteError) {
              setResult({ success: 0, failed: 0, errors: [`❌ 既存データ削除エラー: ${deleteError.message}。インポートを中止しました。`] })
              setIsImporting(false)
              return
            }
          }
          
          deletedCount = eventIds.length
          console.log(`✅ ${deletedCount}件の既存イベントを削除しました`)
        }
      }

      // データベースに挿入/更新
      let successCount = 0
      let updatedCount = 0
      let failedCount = 0
      let memoCount = 0
      
      // 挿入済みのセルを追跡
      const processedCells = new Set<string>()
      
      // イベントを分類
      const newInserts: any[] = []
      const updates: Array<{ id: string; data: any; label: string }>  = []
      const memoUpdates: Array<{ id: string; notes: string; label: string }> = []
      const memoInserts: any[] = []
      // daily_memosテーブルに保存するメモを集約
      const dailyMemoMap = new Map<string, { date: string; storeId: string; venue: string; texts: string[] }>()
      
      setImportProgress({ current: 0, total: filteredEvents.length })
      await new Promise(resolve => setTimeout(resolve, 0))
      
      let eventIdx = 0
      for (const event of filteredEvents) {
        eventIdx++
        // 5件ごとにUIスレッドに制御を戻す（16msでアニメーションフレームを確保）
        if (eventIdx % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 16))
        }
        
        // 必須フィールドのチェック
        if (!event.date) {
          failedCount++
          errors.push(`${event.venue} - ${event.scenario}: 日付が不正です`)
          continue
        }
        
        // 店舗がマッピングに存在しない場合はスキップ
        if (event.store_id === undefined && !(event.venue in STORE_MAPPING)) {
          if (event.venue.includes('(') || event.venue.includes('✅') || 
              event.venue.length > 15 || event.venue.startsWith('募') || event.venue.startsWith('貸')) {
            continue
          }
          errors.push(`⚠️ ${event.date} ${event.venue}: 店舗不明のためスキップ`)
          continue
        }

        const eventCellKey = cellKey(event.date, event.store_id, event.start_time)
        
        // 今回のインポート内で既に同じセルを処理済みの場合はスキップ
        if (processedCells.has(eventCellKey)) {
          continue
        }
        processedCells.add(eventCellKey)
        
        // replaceExistingがtrueの場合は既存イベントを無視（削除済みのため）
        const existingEvent = replaceExisting ? null : existingEventMap.get(eventCellKey)
        // 内部用フィールドを除去してDBに保存するデータを作成
        // 必要なフィールドのみを明示的に抽出（文字列はサニタイズ）
        // isMemo はプレビューでカテゴリを「メモ」に変更した場合に true になる
        const isMemo = (event as any).isMemo || (event as any)._isMemo
        const memoText = sanitizeText((event as any)._memoText || event.notes || event.scenario)
        
        // DBで許可されているカテゴリのみを使用
        // memo と mtg は open にマッピング（DBに存在しないため）
        const DB_VALID_CATEGORIES = ['open', 'private', 'gmtest', 'testplay', 'offsite', 'venue_rental', 'venue_rental_free', 'package']
        let mappedCategory = event.category
        if (mappedCategory === 'memo' || mappedCategory === 'mtg') {
          mappedCategory = 'open'
        }
        if (!DB_VALID_CATEGORIES.includes(mappedCategory)) {
          mappedCategory = 'open'
        }
        
        // シナリオIDを検索
        const scenarioName = sanitizeText(event.scenario)
        const matchedScenario = scenarioList.find(s => s.title === scenarioName)
        
        // 明示的にMEMOカテゴリが選択された場合のみMEMOとして扱う
        // マッピングできないシナリオはそのまま公演として作成（scenario_idは未設定）
        const shouldBeMemo = isMemo || event.category === 'memo'
        
        if (!matchedScenario && scenarioName && scenarioName.length > 0) {
          console.log(`⚠️ シナリオ未マッピング（公演として作成）: ${scenarioName}`)
        }
        
        const eventData: any = {
          date: event.date,
          venue: sanitizeText(event.venue), // venueは必須
          store_id: event.store_id,
          scenario: shouldBeMemo ? '' : scenarioName, // MEMOの場合のみシナリオを空に
          scenario_id: matchedScenario?.id || null, // マッピングできなければnull
          gms: Array.isArray(event.gms) ? event.gms.map(sanitizeText) : [],
          gm_roles: event.gmRoles || {},
          start_time: event.start_time,
          end_time: event.end_time,
          category: mappedCategory,
          notes: shouldBeMemo ? memoText : sanitizeText(event.notes),
          reservation_info: sanitizeText(event.reservation_info),
          is_cancelled: event.is_cancelled,
          organization_id: event.organization_id
        }
        
        // undefined のフィールドを除去
        Object.keys(eventData).forEach(key => {
          if (eventData[key] === undefined) {
            delete eventData[key]
          }
        })
        
        // メモの場合（明示的にMEMOカテゴリが選択された場合のみ）
        // メモは公演として作成せず、daily_memosテーブルに保存
        if (shouldBeMemo) {
          // daily_memosに追加するためのデータを記録
          const memoKey = `${event.date}_${event.store_id}`
          if (!dailyMemoMap.has(memoKey)) {
            dailyMemoMap.set(memoKey, { date: event.date, storeId: event.store_id, venue: event.venue, texts: [] })
          }
          if (memoText) {
            dailyMemoMap.get(memoKey)!.texts.push(memoText)
          }
          console.log(`📝 MEMO: ${event.date} ${event.venue} - ${memoText}`)
          continue
        }
        
        // 通常の公演
        if (existingEvent && !replaceExisting) {
          const mergedGms = (eventData.gms && eventData.gms.length > 0) ? eventData.gms : (existingEvent.gms || [])
          const mergedScenario = eventData.scenario || existingEvent.scenario || ''
          const mergedReservationInfo = eventData.reservation_info || existingEvent.reservation_info
          const importNotes = eventData.notes || ''
          const existingNotes = existingEvent.notes || ''
          const mergedNotes = (importNotes && existingNotes && importNotes !== existingNotes)
            ? `${existingNotes}\n${importNotes}`
            : (importNotes || existingNotes)
          
          // 更新用のシナリオIDを検索
          const updatedMatchedScenario = scenarioList.find(s => s.title === mergedScenario)
          
          updates.push({
            id: existingEvent.id,
            data: {
              scenario: mergedScenario,
              scenario_id: updatedMatchedScenario?.id || null,
              gms: mergedGms,
              start_time: eventData.start_time,
              end_time: eventData.end_time,
              category: eventData.category,
              reservation_info: mergedReservationInfo,
              notes: mergedNotes,
              is_cancelled: eventData.is_cancelled
            },
            label: `${event.date} ${event.venue} - ${event.scenario}`
          })
        } else {
          newInserts.push(eventData)
        }
      }
      
      // デバッグログ
      console.log('📊 インポート分類結果:', {
        newInserts: newInserts.length,
        updates: updates.length,
        memoUpdates: memoUpdates.length,
        dailyMemos: dailyMemoMap.size,
        filteredEvents: filteredEvents.length
      })
      
      if (newInserts.length > 0) {
        console.log('📝 新規挿入データサンプル:', newInserts[0])
      }
      
      // 1. 新規挿入（バッチ）
      if (newInserts.length > 0) {
        setImportProgress({ current: 0, total: newInserts.length + updates.length + memoUpdates.length + memoInserts.length })
        await new Promise(resolve => setTimeout(resolve, 0))
        
        const { error, data } = await supabase
          .from('schedule_events')
          .insert(newInserts)
          .select()
        
        console.log('📥 新規挿入結果:', { error, insertedCount: data?.length })
        
        if (error) {
          console.error('❌ 新規挿入エラー詳細:', JSON.stringify(error, null, 2))
          console.error('❌ 挿入しようとしたデータ (最初の3件):', newInserts.slice(0, 3))
          failedCount += newInserts.length
          errors.push(`新規挿入エラー: ${error.message}`)
        } else {
          successCount += newInserts.length
        }
      }
      
      // 2. 更新（並列で10件ずつ）
      const BATCH_SIZE = 10
      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        setImportProgress({ current: newInserts.length + i, total: newInserts.length + updates.length + memoUpdates.length + memoInserts.length })
        
        const batch = updates.slice(i, i + BATCH_SIZE)
        const results = await Promise.all(
          batch.map(u => 
            supabase
              .from('schedule_events')
              .update(u.data)
              .eq('id', u.id)
              .then(({ error }) => ({ error, label: u.label }))
          )
        )
        
        for (const r of results) {
          if (r.error) {
            failedCount++
            errors.push(`${r.label}: 更新失敗 - ${r.error.message}`)
          } else {
            updatedCount++
          }
        }
      }
      
      // 3. メモ更新（並列で10件ずつ）
      for (let i = 0; i < memoUpdates.length; i += BATCH_SIZE) {
        const batch = memoUpdates.slice(i, i + BATCH_SIZE)
        const results = await Promise.all(
          batch.map(m => 
            supabase
              .from('schedule_events')
              .update({ notes: m.notes })
              .eq('id', m.id)
              .then(({ error }) => ({ error, label: m.label }))
          )
        )
        
        for (const r of results) {
          if (r.error) {
            failedCount++
            errors.push(`${r.label}: メモ追加失敗 - ${r.error.message}`)
          } else {
            memoCount++
          }
        }
      }
      
      // 4. メモ新規挿入（バッチ） - 現在は使用しない
      // memoInserts は常に空になる（daily_memosに保存するため）
      
      // 5. daily_memosテーブルにメモを保存
      let dailyMemoSavedCount = 0
      if (dailyMemoMap.size > 0) {
        console.log(`📝 daily_memos保存: ${dailyMemoMap.size}件`)
        
        for (const [key, memoData] of dailyMemoMap.entries()) {
          try {
            if (!memoData.storeId || !memoData.texts.length) continue
            
            // 既存のメモを取得
            const { data: existingMemo } = await supabase
              .from('daily_memos')
              .select('memo_text')
              .eq('date', memoData.date)
              .eq('venue_id', memoData.storeId)
              .maybeSingle()
            
            // 既存メモがあれば追記、なければ新規
            const existingText = existingMemo?.memo_text || ''
            const newText = memoData.texts.join('\n')
            const combinedText = existingText ? `${existingText}\n${newText}` : newText
            
            await memoApi.save(memoData.date, memoData.storeId, combinedText)
            dailyMemoSavedCount++
            console.log(`✅ MEMO保存: ${memoData.date} ${memoData.venue} - ${newText.substring(0, 30)}...`)
          } catch (error) {
            console.error(`❌ MEMO保存エラー: ${key}`, error)
            errors.push(`メモ保存エラー (${memoData.date} ${memoData.venue}): ${error instanceof Error ? error.message : String(error)}`)
          }
        }
        memoCount += dailyMemoSavedCount
      }

      // 結果にすべての情報を含める
      const totalSuccess = successCount + updatedCount + memoCount
      const resultErrors = [...errors]
      if (deletedCount > 0) {
        resultErrors.unshift(`🗑️ ${deletedCount}件の既存データを削除しました`)
      }
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
      
      console.log('✅ インポート完了:', { totalSuccess, failedCount, errorsCount: resultErrors.length })
      setResult({ success: totalSuccess, failed: failedCount, errors: resultErrors })
      // プレビューを非表示にして結果を見やすくする
      setShowPreview(false)
      
      // インポート対象の月を通知（自動クローズはしない）
      if (totalSuccess > 0) {
        onImportComplete(importTargetMonth || undefined)
      }
    } catch (error) {
      setResult({ 
        success: 0, 
        failed: 0, 
        errors: [`解析エラー: ${error instanceof Error ? error.message : String(error)}`] 
      })
    } finally {
      setIsImporting(false)
      setImportProgress(null)
    }
  }

  const handleClose = () => {
    setScheduleText('')
    setResult(null)
    setShowPreview(false)
    setIsLoadingPreview(false)
    setPreviewEvents([])
    setPreviewErrors([])
    setParsedEvents([])
    setExistingEventMap(new Map())
    setImportTargetMonth(null)
    onClose()
  }
  
  // プレビュー処理（パースのみ）
  const handlePreview = async () => {
    setShowPreview(false)
    setPreviewEvents([])
    setPreviewErrors([])
    setIsLoadingPreview(true)
    
    // UIが更新されるのを待ってから処理を開始
    await new Promise(resolve => setTimeout(resolve, 50))
    
    try {
      // セル内改行を含むTSVを正しくパースする（行を分割）
      const parseTsvLines = (text: string): string[] => {
        const result: string[] = []
        let currentLine = ''
        let inQuotes = false
        
        for (let i = 0; i < text.length; i++) {
          const char = text[i]
          
          if (char === '"') {
            inQuotes = !inQuotes
            currentLine += char
          } else if (char === '\n' && !inQuotes) {
            result.push(currentLine)
            currentLine = ''
          } else {
            currentLine += char
          }
        }
        
        if (currentLine) {
          result.push(currentLine)
        }
        
        return result
      }
      
      // 行をタブ区切りでセルに分割（ダブルクォート内のタブも考慮）
      const parseTsvCells = (line: string): string[] => {
        const cells: string[] = []
        let currentCell = ''
        let inQuotes = false
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i]
          
          if (char === '"') {
            inQuotes = !inQuotes
            // ダブルクォートは含めない（後で除去）
          } else if (char === '\t' && !inQuotes) {
            // セル内改行を空白に置換してトリム
            cells.push(currentCell.replace(/\n/g, ' ').trim())
            currentCell = ''
          } else {
            currentCell += char
          }
        }
        
        // 最後のセル
        cells.push(currentCell.replace(/\n/g, ' ').trim())
        
        return cells
      }
      
      const lines = parseTsvLines(scheduleText.trim())
      const events: any[] = []
      const errors: string[] = []
      let currentDate = ''
      let currentWeekday = ''
      
      // インポート対象の月を特定（現在表示中の年月を使用）
      let targetMonth: { year: number; month: number } | null = null
      
      // 現在表示中の年月を優先使用
      const displayYear = currentDisplayDate?.getFullYear() || new Date().getFullYear()
      const displayMonth = currentDisplayDate ? currentDisplayDate.getMonth() + 1 : new Date().getMonth() + 1
      
      for (const line of lines) {
        if (!line.trim()) continue
        const parts = parseTsvCells(line)
        if (parts.length < 2) continue
        const dateStr = parts[0]
        if (dateStr && dateStr.includes('/')) {
          const dateParts = dateStr.split('/')
          if (dateParts.length === 2) {
            const month = parseInt(dateParts[0])
            // 現在表示中の年を使用（スプレッドシートのMM/DD形式）
            targetMonth = { year: displayYear, month }
            break
          } else if (dateParts.length === 3) {
            // YYYY/MM/DD または MM/DD/YYYY 形式
            const first = parseInt(dateParts[0])
            if (first > 100) {
              // YYYY/MM/DD
              targetMonth = { year: first, month: parseInt(dateParts[1]) }
            } else {
              // MM/DD/YYYY
              targetMonth = { year: parseInt(dateParts[2]), month: first }
            }
            break
          }
        }
      }
      
      // 月が特定できなかった場合は表示中の年月を使用
      if (!targetMonth) {
        targetMonth = { year: displayYear, month: displayMonth }
      }
      
      // ターゲット月をステートに保存
      setImportTargetMonth(targetMonth)
      
      // 既存イベントを取得
      let existingEvents: Array<{ id: string; date: string; store_id: string | null; start_time: string; is_cancelled: boolean; scenario?: string; notes?: string; gms?: string[]; reservation_info?: string }> = []
      if (targetMonth) {
        const startDate = `${targetMonth.year}-${String(targetMonth.month).padStart(2, '0')}-01`
        // 月末日を正しく計算（翌月の0日 = 当月の最終日）
        const lastDay = new Date(targetMonth.year, targetMonth.month, 0).getDate()
        const endDate = `${targetMonth.year}-${String(targetMonth.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
        
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
      
      // パース処理（UIスレッドをブロックしないようにチャンク分割）
      let lineCount = 0
      for (const line of lines) {
        lineCount++
        // 10行ごとにUIスレッドに制御を戻す（16msでアニメーションフレームを確保）
        if (lineCount % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 16))
        }
        
        if (!line.trim()) continue
        const parts = parseTsvCells(line)
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
          // スキップされる行をログ出力（デバッグ用）
          if (parts[2] && parts[2].length > 0 && parts[2].length < 20) {
            console.log('⏭️ スキップ（店舗不明）:', parts[2], '|', parts.slice(0, 5).join(' | '))
          }
          continue
        }
        
        // 時間帯インデックス
        let timeSlots: Array<{ titleIdx: number; gmIdx: number; defaultStart: string; defaultEnd: string; slotName: string }>
        
        if (venueIdx === 2) {
          // 店舗が3列目(index 2)の場合: 日付|曜日|店舗|朝タイトル|朝GM|昼タイトル|昼GM|夜タイトル|夜GM
          timeSlots = [
            { titleIdx: 3, gmIdx: 4, defaultStart: '09:00', defaultEnd: '13:00', slotName: '朝' },
            { titleIdx: 5, gmIdx: 6, defaultStart: '13:00', defaultEnd: '18:00', slotName: '昼' },
            { titleIdx: 7, gmIdx: 8, defaultStart: '19:00', defaultEnd: '23:00', slotName: '夜' }
          ]
        } else {
          // 店舗が4列目(index 3)の場合: 日付|曜日|担当Mg|店舗|朝タイトル|朝GM|昼タイトル|昼GM|夜タイトル|夜GM
          timeSlots = [
            { titleIdx: 4, gmIdx: 5, defaultStart: '09:00', defaultEnd: '13:00', slotName: '朝' },
            { titleIdx: 6, gmIdx: 7, defaultStart: '13:00', defaultEnd: '18:00', slotName: '昼' },
            { titleIdx: 8, gmIdx: 9, defaultStart: '19:00', defaultEnd: '23:00', slotName: '夜' }
          ]
        }
        
        for (const slot of timeSlots) {
          // 各スロット処理前にUIスレッドに制御を戻す（16msでアニメーションフレームを確保）
          await new Promise(resolve => setTimeout(resolve, 16))
          
          const title = parts[slot.titleIdx]
          if (!title || title.trim() === '') continue
          
          const gmText = parts[slot.gmIdx] || ''
          const times = parseTimeFromTitle(title)
          const storeId = STORE_MAPPING[venue]
          
          // 元のシナリオ名（マッピング前）を抽出
          let rawScenarioText = title.replace(/^(貸・|貸 |貸\/|募・|募 |募\/|出張・|出張 |GMテスト・|GMテスト |テストプレイ・|テストプレイ |テスプ・|テスプ |場所貸・|場所貸 )/, '')
          const scenarioMatch = rawScenarioText.match(/^([^(（\d]+)/)
          if (scenarioMatch) {
            rawScenarioText = scenarioMatch[1].trim()
          } else {
            const simpleMatch = rawScenarioText.match(/^([^(（]+)/)
            if (simpleMatch) {
              rawScenarioText = simpleMatch[1].trim()
            }
          }
          rawScenarioText = rawScenarioText.split('※')[0].split('✅')[0].split('🈵')[0].split('🙅')[0].split('🈳')[0].trim()
          // 円表記の前で切る
          rawScenarioText = rawScenarioText.split(/\d+円/)[0].trim()
          
          // マッピング後のシナリオ名
          const scenarioName = extractScenarioName(title)
          const scenarioMapped = rawScenarioText !== scenarioName && scenarioName !== ''
          
          const isMemo = (!scenarioName || scenarioName.length <= 1) && !times
          
          const cellKey = `${parseDate(currentDate, displayYear)}|${storeId || 'null'}|${getTimeSlot(times?.start || slot.defaultStart)}`
          const hasExisting = existingMap.has(cellKey)
          
          const gmResult = parseGmNamesWithMapping(gmText)
          
          events.push({
            date: parseDate(currentDate, displayYear),
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
      const preview: PreviewEvent[] = events.map(e => {
        // デフォルトでは全員メインGM
        const gmRoles: Record<string, string> = {}
        e.gms.forEach((gm: string) => { gmRoles[gm] = 'main' })
        
        return {
          date: e.date,
          venue: e.venue,
          timeSlot: e._slotName,
          scenario: e._isMemo ? `[メモ] ${e._rawTitle}` : e.scenario,
          originalScenario: e._originalScenario || '',
          scenarioMapped: e._scenarioMapped || false,
          gms: e.gms,
          gmRoles,
          originalGms: e._originalGmText || '',
          gmMappings: e._gmMappings || [],
          category: e.category,
          isMemo: e._isMemo,
          hasExisting: e._hasExisting
        }
      })
      
      // デバッグ情報をコンソールに出力
      console.log('📊 インポート解析結果:', {
        総行数: lines.length,
        イベント数: events.length,
        店舗別: Object.entries(
          events.reduce((acc: Record<string, number>, e: any) => {
            acc[e.venue] = (acc[e.venue] || 0) + 1
            return acc
          }, {})
        ),
        日付別: Object.entries(
          events.reduce((acc: Record<string, number>, e: any) => {
            acc[e.date] = (acc[e.date] || 0) + 1
            return acc
          }, {})
        )
      })
      
      setParsedEvents(events)
      setPreviewEvents(preview)
      setPreviewErrors(errors)
      setShowPreview(true)
      setIsLoadingPreview(false)
      
    } catch (error) {
      setPreviewErrors([`解析エラー: ${error instanceof Error ? error.message : String(error)}`])
      setShowPreview(true)
      setIsLoadingPreview(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="!max-w-[1100px] w-[1100px] h-[95vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>スケジュールデータのインポート</DialogTitle>
          <DialogDescription>
            スプレッドシートからコピーしたデータを貼り付けてください（タブ区切り形式）
            {currentDisplayDate && (
              <span className="ml-2 text-blue-600 font-medium">
                → {currentDisplayDate.getFullYear()}年{currentDisplayDate.getMonth() + 1}月にインポート
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0 space-y-4">
          {isLoadingPreview ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-sm text-gray-600">データを解析中...</p>
              <p className="text-xs text-gray-400 mt-1">シナリオとGMのマッピングを行っています</p>
            </div>
          ) : !showPreview ? (
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
                  disabled={isImporting || isLoadingPreview}
                />
                <p className="text-xs text-gray-500 mt-2">
                  ※ スプレッドシートで範囲を選択してコピー（Ctrl+C / Cmd+C）し、ここに貼り付けてください
                </p>
              </div>
              
              <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <input
                  type="checkbox"
                  id="replaceExisting"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                  className="h-4 w-4"
                />
                <label htmlFor="replaceExisting" className="text-sm">
                  <span className="font-medium text-yellow-800">対象月の既存データを削除してインポート</span>
                  <span className="text-xs text-yellow-600 ml-2">（チェックを外すと上書きマージ）</span>
                </label>
              </div>
            </>
          ) : (
            <>
              {/* プレビューフェーズ */}
              <div className="border rounded-lg p-3 bg-gray-50 flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-sm">インポートプレビュー</h3>
                    {importTargetMonth && (
                      <span className="text-xs text-blue-600">
                        対象: {importTargetMonth.year}年{importTargetMonth.month}月
                        {replaceExisting && ' （既存データ削除後にインポート）'}
                      </span>
                    )}
                  </div>
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
                
                <div ref={tableContainerRef} className="flex-1 overflow-y-auto min-h-0">
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
                        <tr 
                          key={i} 
                          className={event.hasExisting ? 'bg-yellow-50' : event.isMemo ? 'bg-blue-50' : ''}
                          style={{ contentVisibility: 'auto', containIntrinsicSize: '0 60px' }}
                        >
                          <td className="p-1 border-b text-nowrap align-top">
                            <div className="min-h-[14px]">&nbsp;</div>
                            <div>{event.date}</div>
                          </td>
                          <td className="p-1 border-b text-nowrap align-top">
                            <div className="min-h-[14px]">&nbsp;</div>
                            <div>{event.venue}</div>
                          </td>
                          <td className="p-1 border-b text-nowrap align-top">
                            <div className="min-h-[14px]">&nbsp;</div>
                            <div>{event.timeSlot}</div>
                          </td>
                          <td className="p-1 border-b min-w-[80px] align-top">
                            <div className="min-h-[14px]">&nbsp;</div>
                            <Select
                              value={event.category}
                              onValueChange={(value) => {
                                setPreviewEvents(prev => {
                                  const newPreview = [...prev]
                                  const updatedEvent = { ...newPreview[i], category: value }
                                  
                                  // メモを選択したら、シナリオをnotesに移動してisMemo=true
                                  if (value === 'memo') {
                                    updatedEvent.isMemo = true
                                    if (updatedEvent.scenario && !updatedEvent.notes) {
                                      updatedEvent.notes = updatedEvent.scenario
                                    }
                                  } else {
                                    updatedEvent.isMemo = false
                                  }
                                  
                                  // テストプレイを選択したら、GMの役割をすべて「参加」に設定
                                  if (value === 'test') {
                                    const newRoles: Record<string, string> = {}
                                    updatedEvent.gms.forEach(gm => {
                                      newRoles[gm] = 'staff'
                                    })
                                    updatedEvent.gmRoles = newRoles
                                  }
                                  
                                  newPreview[i] = updatedEvent
                                  return newPreview
                                })
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
                          <td className="p-1 border-b min-w-[180px] align-top">
                            {event.isMemo ? (
                              <span className="text-gray-500">{event.scenario}</span>
                            ) : (
                              <div>
                                <div className="text-[10px] text-purple-600 mb-0.5 min-h-[14px]">
                                  {event.originalScenario ? `${event.originalScenario}${event.scenarioMapped ? '→' : ''}` : '\u00A0'}
                                </div>
                                <SearchableSelect
                                  options={scenarioOptions}
                                  value={event.scenario || '__none__'}
                                  onValueChange={(value) => {
                                    setPreviewEvents(prev => {
                                      const newPreview = [...prev]
                                      newPreview[i] = { ...newPreview[i], scenario: value === '__none__' ? '' : value, scenarioMapped: true }
                                      return newPreview
                                    })
                                  }}
                                  placeholder="シナリオを選択"
                                  searchPlaceholder="シナリオ検索..."
                                  className="h-6 text-xs"
                                />
                              </div>
                            )}
                          </td>
                          <td className="p-1 border-b min-w-[140px] align-top">
                            <div className="space-y-1">
                              <div className="text-[10px] text-purple-600 min-h-[14px]">
                                {event.originalGms || '\u00A0'}
                              </div>
                              <MultiSelect
                                options={staffList.map(s => s.name)}
                                selectedValues={event.gms}
                                onSelectionChange={(values) => {
                                  setPreviewEvents(prev => {
                                    const newPreview = [...prev]
                                    const newRoles = { ...newPreview[i].gmRoles }
                                    values.forEach(gm => {
                                      if (!newRoles[gm]) newRoles[gm] = 'main'
                                    })
                                    Object.keys(newRoles).forEach(gm => {
                                      if (!values.includes(gm)) delete newRoles[gm]
                                    })
                                    newPreview[i] = { ...newPreview[i], gms: values, gmRoles: newRoles }
                                    return newPreview
                                  })
                                }}
                                placeholder="GMを選択"
                                searchPlaceholder="スタッフ検索..."
                                className="text-xs"
                                showBadges={false}
                              />
                              {/* 選択済みGM（クリックで役割変更、×で削除） */}
                              {event.gms.length > 0 && (
                                <div className="flex flex-wrap gap-0.5">
                                  {event.gms.map((gm, gmIdx) => {
                                    const role = event.gmRoles[gm] || 'main'
                                    const roleOption = GM_ROLE_OPTIONS.find(r => r.value === role) || GM_ROLE_OPTIONS[0]
                                    const shortLabel = role === 'main' ? '' : role === 'sub' ? 'サブ' : role === 'reception' ? '受付' : role === 'staff' ? '参加' : '見学'
                                    return (
                                      <span
                                        key={gmIdx}
                                        className={`text-[10px] px-1 py-0 rounded inline-flex items-center gap-0.5 ${roleOption.color}`}
                                      >
                                        <span
                                          className="cursor-pointer hover:opacity-70"
                                          onClick={() => {
                                            const currentIdx = GM_ROLE_OPTIONS.findIndex(r => r.value === role)
                                            const nextIdx = (currentIdx + 1) % GM_ROLE_OPTIONS.length
                                            const nextRole = GM_ROLE_OPTIONS[nextIdx].value
                                            setPreviewEvents(prev => {
                                              const newPreview = [...prev]
                                              newPreview[i] = {
                                                ...newPreview[i],
                                                gmRoles: { ...newPreview[i].gmRoles, [gm]: nextRole }
                                              }
                                              return newPreview
                                            })
                                          }}
                                          title="クリックで役割変更"
                                        >
                                          {gm}{shortLabel && `(${shortLabel})`}
                                        </span>
                                        <span
                                          className="cursor-pointer opacity-50 hover:opacity-100 hover:text-red-600"
                                          onClick={() => {
                                            setPreviewEvents(prev => {
                                              const newPreview = [...prev]
                                              const newGms = newPreview[i].gms.filter(g => g !== gm)
                                              const newRoles = { ...newPreview[i].gmRoles }
                                              delete newRoles[gm]
                                              newPreview[i] = { ...newPreview[i], gms: newGms, gmRoles: newRoles }
                                              return newPreview
                                            })
                                          }}
                                          title="削除"
                                        >×</span>
                                      </span>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-1 border-b text-nowrap align-top">
                            <div className="min-h-[14px]">&nbsp;</div>
                            <div>
                              {event.isMemo ? (
                                <span className="text-blue-600">メモ</span>
                              ) : event.hasExisting ? (
                                <span className="text-yellow-600">上書き</span>
                              ) : (
                                <span className="text-green-600">新規</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {/* 件数表示 */}
                <div className="text-xs text-gray-500 mt-2 px-2">
                  全{previewEvents.length}件
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

        <DialogFooter className="flex-shrink-0 border-t pt-4 mt-4">
          <Button variant="outline" onClick={handleClose} disabled={isImporting}>
            キャンセル
          </Button>
          
          {isLoadingPreview ? null : !showPreview ? (
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
                    {importProgress 
                      ? `インポート中... ${importProgress.current}/${importProgress.total}`
                      : 'インポート中...'
                    }
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

