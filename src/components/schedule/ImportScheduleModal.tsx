import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
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

export function ImportScheduleModal({ isOpen, onClose, onImportComplete }: ImportScheduleModalProps) {
  const [scheduleText, setScheduleText] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [replaceExisting, setReplaceExisting] = useState(true)
  const [result, setResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null)

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
    
    // シナリオ名の揺らぎを統一
    if (SCENARIO_NAME_MAPPING[text]) {
      return SCENARIO_NAME_MAPPING[text]
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
    
    // マッピングで正規化
    return gms
      .map(gm => gm.trim())
      .filter(gm => gm)
      .map(gm => STAFF_NAME_MAPPING[gm] || gm)
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

  // インポート処理
  const handleImport = async () => {
    setIsImporting(true)
    setResult(null)

    try {
      const lines = scheduleText.trim().split('\n')
      const events: Array<{ date: string; venue: string; store_id: string | null; category: string; start_time: string; end_time: string; scenario?: string; gms?: string[] }> = []
      const errors: string[] = []

      let currentDate = ''
      let currentWeekday = ''
      
      // インポート対象の月を特定（最初の日付から判定）
      let targetMonth: { year: number; month: number } | null = null
      
      for (const line of lines) {
        if (!line.trim()) continue
        const parts = line.split('\t').map(p => p.trim())
        if (parts.length < 2) continue
        const dateStr = parts[0]
        if (dateStr && dateStr.includes('/')) {
          const dateParts = dateStr.split('/')
          if (dateParts.length === 2) {
            targetMonth = {
              year: 2025,
              month: parseInt(dateParts[0])
            }
            break
          }
        }
      }
      
      // 既存イベントを取得（上書き用にIDも含む）
      // 注: 削除はせず、既存イベントがある場合はマージ更新する
      let existingEvents: Array<{ id: string; date: string; store_id: string | null; start_time: string; is_cancelled: boolean; scenario?: string; notes?: string; gms?: string[]; reservation_info?: string }> = []
      if (targetMonth) {
        try {
          const startDate = `${targetMonth.year}-${String(targetMonth.month).padStart(2, '0')}-01`
          const endDate = `${targetMonth.year}-${String(targetMonth.month).padStart(2, '0')}-31`
          
          const { data, error: fetchError } = await supabase
            .from('schedule_events')
            .select('id, date, store_id, start_time, is_cancelled, scenario, notes, gms, reservation_info')
            .gte('date', startDate)
            .lte('date', endDate)
          
          if (fetchError) {
            logger.error('既存データの取得エラー:', fetchError)
            errors.push(`既存データの取得に失敗: ${fetchError.message}`)
          } else {
            existingEvents = data || []
          }
        } catch (err) {
          logger.error('既存データ取得処理エラー:', err)
          errors.push(`既存データ取得処理エラー: ${String(err)}`)
        }
      }
      
      // 既存イベントをセルキーでインデックス化
      const existingEventMap = new Map<string, typeof existingEvents[0]>()
      for (const existing of existingEvents) {
        if (existing.is_cancelled) continue
        const key = `${existing.date}|${existing.store_id || 'null'}|${getTimeSlot(existing.start_time)}`
        existingEventMap.set(key, existing)
      }

      for (const line of lines) {
        if (!line.trim()) continue

        const parts = line.split('\t').map(p => p.trim())
        if (parts.length < 3) continue

        // 日付が入っている場合は更新、空の場合は前の日付を使う
        const dateStr = parts[0]
        if (dateStr && dateStr.includes('/')) {
          currentDate = dateStr
          currentWeekday = parts[1] || currentWeekday
        }
        
        // 日付がない場合はスキップ
        if (!currentDate) continue
        
        // 店舗名のリスト（STORE_MAPPINGのキー）
        const validVenues = Object.keys(STORE_MAPPING)
        
        // 店舗列を自動検出（parts[2]またはparts[3]のどちらかに店舗がある）
        let venueIdx = -1
        let venue = ''
        
        // まずparts[2]をチェック
        if (parts[2] && validVenues.includes(parts[2])) {
          venueIdx = 2
          venue = parts[2]
        } 
        // 次にparts[3]をチェック
        else if (parts[3] && validVenues.includes(parts[3])) {
          venueIdx = 3
          venue = parts[3]
        }
        // どちらにも店舗がない場合はスキップ
        else {
          continue
        }
        
        // 店舗列に基づいて時間帯のインデックスを決定
        // venueIdx = 2 の場合: 日付(0), 曜日(1), 店舗(2), 昼シナリオ(3), 昼GM(4), 夜シナリオ(5), 夜GM(6)
        // venueIdx = 3 の場合: 日付(0), 曜日(1), 担当(2), 店舗(3), 朝(4,5), 昼(6,7), 夜(8,9)
        
        let timeSlots: Array<{ titleIdx: number; gmIdx: number; defaultStart: string; defaultEnd: string }>
        
        if (venueIdx === 2) {
          // 新しい構造: 店舗が3列目（昼・夜のみ）
          timeSlots = [
            { titleIdx: 3, gmIdx: 4, defaultStart: '13:00', defaultEnd: '17:00' },
            { titleIdx: 5, gmIdx: 6, defaultStart: '19:00', defaultEnd: '23:00' }
          ]
        } else {
          // 既存の構造: 店舗が4列目（朝・昼・夜）
          timeSlots = [
            { titleIdx: 4, gmIdx: 5, defaultStart: '09:00', defaultEnd: '13:00' },
            { titleIdx: 6, gmIdx: 7, defaultStart: currentWeekday === '土' || currentWeekday === '日' ? '14:00' : '13:00', defaultEnd: '18:00' },
            { titleIdx: 8, gmIdx: 9, defaultStart: '19:00', defaultEnd: '23:00' }
          ]
        }

        for (const slot of timeSlots) {
          const title = parts[slot.titleIdx]
          if (!title || title.trim() === '') continue

          const gmText = parts[slot.gmIdx] || ''
          const times = parseTimeFromTitle(title)
          const storeId = STORE_MAPPING[venue]
          const scenarioName = extractScenarioName(title)
          
          // メモかどうかを判定
          // 条件: シナリオ名が空または短すぎる、かつ時間が指定されていない
          const isMemo = (!scenarioName || scenarioName.length <= 1) && !times
          
          if (isMemo) {
            // メモとして処理（既存イベントがあればそのnotesフィールドに追加）
            const event = {
              date: parseDate(currentDate),
              venue,
              store_id: storeId,
              scenario: '',
              gms: parseGmNames(gmText),
              start_time: slot.defaultStart,
              end_time: slot.defaultEnd,
              category: 'memo' as const,
              notes: title.trim(),  // 元のテキストをメモとして保存
              is_cancelled: false,
              organization_id: ORGANIZATION_ID,
              _isMemo: true,  // メモフラグ（後で処理するため）
              _memoText: title.trim()  // メモのテキストを保持
            }
            events.push(event)
          } else {
            // 通常の公演として処理
            const event = {
              date: parseDate(currentDate),
              venue,
              store_id: storeId,
              scenario: scenarioName,
              gms: parseGmNames(gmText),
              start_time: times?.start || slot.defaultStart,
              end_time: times?.end || slot.defaultEnd,
              category: determineCategory(title),
              reservation_info: extractReservationInfo(title),
              notes: extractNotes(title),
              is_cancelled: isCancelled(title),
              organization_id: ORGANIZATION_ID,
              _isMemo: false
            }
            events.push(event)
          }
        }
      }

      // インポートデータ内での重複チェック（同じセルに2つのシナリオがある場合、最初のものを使用）
      const cellKey = (date: string, storeId: string | null, startTime: string) => 
        `${date}|${storeId || 'null'}|${getTimeSlot(startTime)}`
      
      const importCellMap = new Map<string, { scenario: string; venue: string; index: number }>()
      const duplicatesInImport: string[] = []
      const duplicateIndices = new Set<number>()
      
      for (let i = 0; i < events.length; i++) {
        const event = events[i]
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
      const filteredEvents = events.filter((_, index) => !duplicateIndices.has(index))

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
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>スケジュールデータのインポート</DialogTitle>
          <DialogDescription>
            スプレッドシートからコピーしたデータを貼り付けてください（タブ区切り形式）
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">
              スケジュールデータ（Excel/Googleスプレッドシートからコピー）
            </label>
            <Textarea
              value={scheduleText}
              onChange={(e) => setScheduleText(e.target.value)}
              placeholder="11/1&#9;土&#9;ジノ&#9;馬場&#9;GMテスト・エイダ（9-13)3000円&#9;渚咲(そら）🈵..."
              className="min-h-[300px] font-mono text-xs"
              disabled={isImporting}
            />
            <p className="text-xs text-gray-500 mt-2">
              ※ スプレッドシートで範囲を選択してコピー（Ctrl+C / Cmd+C）し、ここに貼り付けてください
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="replaceExisting"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
              disabled={isImporting}
              className="w-4 h-4"
            />
            <label htmlFor="replaceExisting" className="text-sm font-medium">
              既存の同月データを削除してから登録（推奨）
            </label>
          </div>

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
                    <div className="font-semibold mb-1">エラー詳細:</div>
                    {result.errors.map((error, i) => (
                      <div key={i} className="text-red-600">{error}</div>
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
          <Button 
            onClick={handleImport} 
            disabled={!scheduleText.trim() || isImporting}
          >
            {isImporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                インポート中...
              </>
            ) : (
              'インポート実行'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

