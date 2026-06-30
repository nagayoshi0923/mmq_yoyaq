import { useState, useEffect, useMemo, useRef } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import type { RpcAdminDeleteReservationsByScheduleEventIdsParams } from '@/lib/rpcTypes'
import { memoApi } from '@/lib/api/memoApi'
import { staffApi } from '@/lib/api/staffApi'
import { scenarioApi } from '@/lib/api/scenarioApi'
import { useOrganization } from '@/hooks/useOrganization'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { logger } from '@/utils/logger'
import { getTimeSlot } from '@/utils/scheduleUtils'
import { getScenarioAliases } from '@/lib/api/scenarioAliasApi'
import { parseTsvLines, parseTsvCells, parseTimeFromTitle, parseDate, mergeWrappedLines, detectTargetMonth } from './importSchedule/parsers'
import { matchStaffName, matchScenarioName } from './importSchedule/matchers'
import { ImportPreview } from './importSchedule/ImportPreview'
import type { PreviewEvent } from './importSchedule/types'
import { hiraganaToKatakana, katakanaToHiragana } from '@/utils/kanaUtils'

interface ImportScheduleModalProps {
  isOpen: boolean
  onClose: () => void
  currentDisplayDate?: Date  // 現在表示中の年月
  onImportComplete: (targetMonth?: { year: number; month: number }) => void
}

// 組織ID（デフォルト値はクインズワルツ - useOrganization フックで動的に取得）

// 不正なUnicode文字（壊れたサロゲートペア）を除去する関数
const sanitizeText = (text: string | null | undefined): string => {
  if (!text) return ''
  // サロゲートペアの壊れた文字を除去
   
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
}

// 公演カテゴリ

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

// インポート処理用の拡張型（内部フラグを含む）
interface ParsedImportEvent {
  date: string
  venue: string
  store_id?: string
  scenario: string
  start_time: string
  end_time: string
  gms: string[]
  category: string
  notes?: string
  is_cancelled?: boolean
  organization_id?: string
  reservation_info?: string
  gmRoles?: Record<string, string>
  gm_roles?: Record<string, string>
  // 内部フラグ（プレビュー・インポート処理用）
  isMemo?: boolean
  _isMemo?: boolean
  _memoText?: string
}

// GM役割オプション（公演ダイアログと色を統一）

export function ImportScheduleModal({ isOpen, onClose, currentDisplayDate, onImportComplete }: ImportScheduleModalProps) {
  // 組織IDを動的に取得（マルチテナント対応）
  const { organizationId } = useOrganization()
  const ORGANIZATION_ID = organizationId
  
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
  const [parsedEvents, setParsedEvents] = useState<ParsedImportEvent[]>([])
  const [existingEventMap, setExistingEventMap] = useState<Map<string, any>>(new Map())
  const [importTargetMonth, setImportTargetMonth] = useState<{ year: number; month: number } | null>(null)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  
  // マスターデータ
  const [staffList, setStaffList] = useState<Array<{ id: string; name: string }>>([])
  const [scenarioList, setScenarioList] = useState<Array<{ id: string; title: string }>>([])
  // シナリオエイリアスマップ（DBから取得）
  const [scenarioAliasMap, setScenarioAliasMap] = useState<Record<string, string>>({})

  // マスターデータを取得（組織対応済み）
  useEffect(() => {
    if (isOpen) {
      // スタッフ一覧を取得
      staffApi.getAll().then((data) => {
        setStaffList(data.map(s => ({ id: s.id, name: s.name })))
      })

      // シナリオ一覧を取得
      scenarioApi.getAll().then((data) => {
        setScenarioList(data.map(s => ({ id: s.id, title: s.title })))
      })

      // シナリオエイリアスをDBから取得（scenarioAliasApiの共有キャッシュを使用）
      getScenarioAliases().then((aliasMap) => {
        setScenarioAliasMap(aliasMap)
        scenarioMatchCache.clear()
      })
    }
  }, [isOpen])
  
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
      const hiragana = katakanaToHiragana(name)
      const katakana = hiraganaToKatakana(name)
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
  
  // スタッフ名のファジーマッチ（純関数 matchStaffName をキャッシュでラップ）
  const findBestStaffMatch = (input: string): string | null => {
    if (!input || input.length === 0) return null
    const normalizedInput = input.trim()
    if (staffMatchCache.has(normalizedInput)) {
      return staffMatchCache.get(normalizedInput) || null
    }
    const result = matchStaffName(input, staffList, dynamicStaffMapping)
    staffMatchCache.set(normalizedInput, result)
    return result
  }

  // シナリオ名のファジーマッチ（純関数 matchScenarioName をキャッシュでラップ）
  const findBestScenarioMatch = (input: string): string | null => {
    if (!input || input.length === 0) return null
    const normalizedInput = input.trim()
    if (scenarioMatchCache.has(normalizedInput)) {
      return scenarioMatchCache.get(normalizedInput) || null
    }
    const result = matchScenarioName(input, scenarioList, scenarioAliasMap)
    scenarioMatchCache.set(normalizedInput, result)
    return result
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
    
    // お客様名を除去（「○○様」パターン）
    // 例: "シノポロ 後藤茜様" → "シノポロ"
    // 例: "ニィホン 田中様DM" → "ニィホン"
    const customerMatch = text.match(/^(.+?)[\s　]+[^(（\s]+様/)
    if (customerMatch) {
      text = customerMatch[1].trim()
    } else {
      // スペースの後に「様」がある場合も除去
      text = text.replace(/[\s　]+[^\s（(]+様.*$/, '').trim()
    }
    
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
        
        const key = cellKey(event.date, event.store_id ?? null, event.start_time)
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
        
        logger.log(`🗑️ 削除対象期間: ${startDate} 〜 ${endDate}`)
        
        // まず対象月のschedule_eventsのIDを取得（組織フィルタ付き）
        let deleteQuery = supabase
          .from('schedule_events')
          .select('id')
          .gte('date', startDate)
          .lte('date', endDate)
        
        if (ORGANIZATION_ID) {
          deleteQuery = deleteQuery.eq('organization_id', ORGANIZATION_ID)
        }
        
        const { data: eventsToDelete, error: fetchError } = await deleteQuery
        
        if (fetchError) {
          setResult({ success: 0, failed: 0, errors: [`❌ 既存データ取得エラー: ${fetchError.message}`] })
          setIsImporting(false)
          return
        }
        
        logger.log(`🗑️ 削除対象イベント数: ${eventsToDelete?.length || 0}件`)
        
        if (eventsToDelete && eventsToDelete.length > 0) {
          const eventIds = eventsToDelete.map(e => e.id)
          
          // バッチサイズ（Supabaseの制限対策）
          const BATCH_SIZE = 100
          
          // 関連するreservationsを先に削除（外部キー制約対策）
          for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
            const batchIds = eventIds.slice(i, i + BATCH_SIZE)
            const deleteByEventIdsParams: RpcAdminDeleteReservationsByScheduleEventIdsParams = {
              p_schedule_event_ids: batchIds,
            }
            const { error: resDeleteError } = await supabase.rpc('admin_delete_reservations_by_schedule_event_ids', deleteByEventIdsParams)
            
            if (resDeleteError) {
              logger.warn('予約削除警告:', resDeleteError.message)
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
          logger.log(`✅ ${deletedCount}件の既存イベントを削除しました`)
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

        const eventCellKey = cellKey(event.date, event.store_id ?? null, event.start_time)
        
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
        const isMemo = event.isMemo || event._isMemo
        const memoText = sanitizeText(event._memoText || event.notes || event.scenario)
        
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
        // マッピングできないシナリオはそのまま公演として作成（scenario_master_idは未設定）
        const shouldBeMemo = isMemo || event.category === 'memo'
        
        if (!matchedScenario && scenarioName && scenarioName.length > 0) {
          logger.log(`⚠️ シナリオ未マッピング（公演として作成）: ${scenarioName}`)
        }
        
        const eventData: any = {
          date: event.date,
          venue: sanitizeText(event.venue), // venueは必須
          store_id: event.store_id,
          scenario: shouldBeMemo ? '' : scenarioName, // MEMOの場合のみシナリオを空に
          scenario_master_id: matchedScenario?.id || null, // マッピングできなければnull
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
            dailyMemoMap.set(memoKey, { date: event.date, storeId: event.store_id ?? '', venue: event.venue, texts: [] })
          }
          if (memoText) {
            dailyMemoMap.get(memoKey)!.texts.push(memoText)
          }
          logger.log(`📝 MEMO: ${event.date} ${event.venue} - ${memoText}`)
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
              scenario_master_id: updatedMatchedScenario?.id || null,
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
      logger.log('📊 インポート分類結果:', {
        newInserts: newInserts.length,
        updates: updates.length,
        memoUpdates: memoUpdates.length,
        dailyMemos: dailyMemoMap.size,
        filteredEvents: filteredEvents.length
      })
      
      if (newInserts.length > 0) {
        logger.log('📝 新規挿入データサンプル:', newInserts[0])
      }
      
      // 1. 新規挿入（バッチ）
      if (newInserts.length > 0) {
        setImportProgress({ current: 0, total: newInserts.length + updates.length + memoUpdates.length + memoInserts.length })
        await new Promise(resolve => setTimeout(resolve, 0))
        
        const { error, data } = await supabase
          .from('schedule_events')
          .insert(newInserts)
          .select('id')
        
        logger.log('📥 新規挿入結果:', { error, insertedCount: data?.length })
        
        if (error) {
          logger.error('❌ 新規挿入エラー詳細:', JSON.stringify(error, null, 2))
          logger.error('❌ 挿入しようとしたデータ (最初の3件):', newInserts.slice(0, 3))
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
        logger.log(`📝 daily_memos保存: ${dailyMemoMap.size}件`)
        
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
            logger.log(`✅ MEMO保存: ${memoData.date} ${memoData.venue} - ${newText.substring(0, 30)}...`)
          } catch (error) {
            logger.error(`❌ MEMO保存エラー: ${key}`, error)
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
      
      logger.log('✅ インポート完了:', { totalSuccess, failedCount, errorsCount: resultErrors.length })
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
      const rawLines = parseTsvLines(scheduleText.trim())

      // セル内改行で分断された行を前の行に結合（純関数へ抽出）
      const lines = mergeWrappedLines(rawLines)

      logger.log(`📋 行結合: ${rawLines.length}行 → ${lines.length}行`)
      const events: any[] = []
      const errors: string[] = []
      let currentDate = ''
      let currentWeekday = ''
      
      // 現在表示中の年月を優先使用
      const displayYear = currentDisplayDate?.getFullYear() || new Date().getFullYear()
      const displayMonth = currentDisplayDate ? currentDisplayDate.getMonth() + 1 : new Date().getMonth() + 1

      // インポート対象の月を特定（純関数へ抽出。日付行が無ければ表示中の年月）
      const targetMonth = detectTargetMonth(lines, displayYear, displayMonth)

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
          .from('schedule_events_staff_view')
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
      logger.log('📋 有効な店舗リスト:', validVenues.join(', '))
      logger.log(`📋 パース対象: ${lines.length}行`)
      
      // パース処理（UIスレッドをブロックしないようにチャンク分割）
      let lineCount = 0
      let processedRows = 0
      let skippedRows = 0
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
          const col2 = parts[2] || ''
          const col3 = parts[3] || ''
          if (col2.length > 0 && col2.length < 30 && !col2.includes('タイトル') && !col2.includes('時間帯')) {
            logger.log(`⏭️ スキップ: 列2="${col2.substring(0, 20)}", 列3="${col3.substring(0, 20)}"`)
            skippedRows++
          }
          continue
        }
        processedRows++
        
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
      const venueCount = events.reduce((acc: Record<string, number>, e: any) => {
        acc[e.venue] = (acc[e.venue] || 0) + 1
        return acc
      }, {})
      const dateCount = events.reduce((acc: Record<string, number>, e: any) => {
        acc[e.date] = (acc[e.date] || 0) + 1
        return acc
      }, {})
      logger.log(`📊 インポート解析結果: 総行数=${lines.length}, 処理行=${processedRows}, スキップ行=${skippedRows}, イベント数=${events.length}`)
      logger.log('📊 店舗別:', JSON.stringify(venueCount))
      logger.log('📊 日付別:', JSON.stringify(dateCount))
      
      // 最初の10行の構造をデバッグ表示
      logger.log('📋 最初の10行の構造:')
      for (let i = 0; i < Math.min(10, lines.length); i++) {
        const parts = parseTsvCells(lines[i])
        logger.log(`  行${i}: 列数=${parts.length}, 列0="${(parts[0] || '').substring(0, 10)}", 列2="${(parts[2] || '').substring(0, 15)}"`)
      }
      
      // 11/9を含む行を探す
      const line9 = lines.findIndex(l => l.includes('11/9'))
      if (line9 >= 0) {
        logger.log(`📋 11/9が見つかった行: ${line9}`)
        const parts = parseTsvCells(lines[line9])
        logger.log(`  列数=${parts.length}, 列0="${parts[0]}", 列2="${parts[2]}"`)
        logger.log(`  全列: ${JSON.stringify(parts.map((p, i) => `${i}:${p.substring(0, 30)}`).slice(0, 9))}`)
        // 前後の行も表示
        if (line9 > 0) {
          const prevParts = parseTsvCells(lines[line9 - 1])
          logger.log(`  前行(${line9-1}): 列数=${prevParts.length}, 列2="${(prevParts[2] || '').substring(0, 20)}"`)
        }
        if (line9 < lines.length - 1) {
          const nextParts = parseTsvCells(lines[line9 + 1])
          logger.log(`  次行(${line9+1}): 列数=${nextParts.length}, 列2="${(nextParts[2] || '').substring(0, 20)}"`)
        }
      } else {
        logger.log('⚠️ 11/9が見つかりません - データが途中で切れている可能性')
      }
      
      // 11/10以降があるか確認
      const line10 = lines.findIndex(l => l.includes('11/10'))
      const line15 = lines.findIndex(l => l.includes('11/15'))
      const line20 = lines.findIndex(l => l.includes('11/20'))
      const line30 = lines.findIndex(l => l.includes('11/30'))
      logger.log(`📋 日付存在チェック: 11/10=${line10}, 11/15=${line15}, 11/20=${line20}, 11/30=${line30}`)
      
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
          {result ? (
            // インポート完了後は結果のみ表示
            <div className="flex flex-col items-center justify-center py-20">
              {result.failed > 0 ? (
                <AlertCircle className="h-12 w-12 text-orange-500 mb-4" />
              ) : (
                <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
              )}
              <h3 className="text-lg font-semibold mb-2">インポート完了</h3>
              <p className="text-sm text-gray-600 mb-4">
                成功: <span className="font-bold text-green-600">{result.success}件</span>
                {result.failed > 0 && (
                  <> / 失敗: <span className="font-bold text-red-600">{result.failed}件</span></>
                )}
              </p>
              {result.errors.length > 0 && (
                <div className="w-full max-w-md max-h-40 overflow-y-auto text-xs bg-gray-50 rounded p-3 border">
                  <div className="font-semibold mb-1">詳細:</div>
                  {result.errors.map((error, i) => (
                    <div key={i} className={error.startsWith('ℹ️') || error.startsWith('⚠️') ? 'text-gray-600' : 'text-red-600'}>{error}</div>
                  ))}
                </div>
              )}
            </div>
          ) : isLoadingPreview ? (
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
              <ImportPreview
                importTargetMonth={importTargetMonth}
                replaceExisting={replaceExisting}
                previewEvents={previewEvents}
                setPreviewEvents={setPreviewEvents}
                previewErrors={previewErrors}
                scenarioList={scenarioList}
                scenarioOptions={scenarioOptions}
                staffList={staffList}
                tableContainerRef={tableContainerRef}
              />
            </>
          )}

        </div>

        <DialogFooter className="flex-shrink-0 border-t pt-4 mt-4">
          {result ? (
            // インポート完了後は「完了」ボタンのみ表示
            <Button onClick={handleClose}>
              完了
            </Button>
          ) : isLoadingPreview ? (
            <Button disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              解析中...
            </Button>
          ) : !showPreview ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                キャンセル
              </Button>
              <Button 
                onClick={handlePreview} 
                disabled={!scheduleText.trim()}
              >
                プレビュー
              </Button>
            </>
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

