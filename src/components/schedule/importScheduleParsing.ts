import { getTimeSlot } from '@/utils/scheduleUtils'

/**
 * スケジュール取り込み（スプレッドシートの公演の文字）の読み取り規則。
 * ImportScheduleModal.tsx から、規則を変えずに切り出した純粋な関数。
 * 作品名・スタッフ名の照合（あいまい一致）は呼び出し側から渡す。
 */

/** カテゴリを判定 */
export function determineImportCategory(title: string): string {
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

/** シナリオ名を抽出（照合できればその作品名、できなければ整えた文字） */
export function extractImportScenarioName(title: string, findBestScenarioMatch: (input: string) => string | null): string {
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

/** 予約情報を抽出 */
export function extractImportReservationInfo(title: string): string | undefined {
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

/** 注記を抽出 */
export function extractImportNotes(title: string): string | undefined {
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

/** 中止かどうかを判定 */
export function isImportCancelled(title: string): boolean {
  return title.includes('🙅‍♀️') || title.includes('🙅')
}

/** GM名を解析（マッピングで正規化） */
export function parseImportGmNames(gmText: string, findBestStaffMatch: (input: string) => string | null): string[] {
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

/** マッピング情報付きでGM名をパース */
export function parseImportGmNamesWithMapping(gmText: string, findBestStaffMatch: (input: string) => string | null): { gms: string[]; mappings: Array<{ from: string; to: string }> } {
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

/**
 * 店舗の列を探す（3 列目か 4 列目）。どちらにも店舗名が無い行は取り込まない（null）。
 * 3 列目: 日付|曜日|店舗|…、4 列目: 日付|曜日|担当Mg|店舗|…
 */
export function detectImportVenueColumn(parts: string[], validVenues: string[]): { venueIdx: 2 | 3; venue: string } | null {
  if (parts[2] && validVenues.includes(parts[2])) return { venueIdx: 2, venue: parts[2] }
  if (parts[3] && validVenues.includes(parts[3])) return { venueIdx: 3, venue: parts[3] }
  return null
}

/** 時間帯（朝・昼・夜）ごとのタイトル列・GM 列と既定の時刻。店舗列の次から 2 列ずつ */
export function importTimeSlotColumns(venueIdx: 2 | 3): Array<{ titleIdx: number; gmIdx: number; defaultStart: string; defaultEnd: string; slotName: string }> {
  const base = venueIdx + 1
  return [
    { titleIdx: base, gmIdx: base + 1, defaultStart: '09:00', defaultEnd: '13:00', slotName: '朝' },
    { titleIdx: base + 2, gmIdx: base + 3, defaultStart: '13:00', defaultEnd: '18:00', slotName: '昼' },
    { titleIdx: base + 4, gmIdx: base + 5, defaultStart: '19:00', defaultEnd: '23:00', slotName: '夜' }
  ]
}

/** 照合前の元のシナリオ名（記号・時間・印・価格の前まで） */
export function rawImportScenarioText(title: string): string {
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
  return rawScenarioText.split(/\d+円/)[0].trim()
}

/** 取り込みのセルのキー（日付・店舗・時間帯） */
export function importCellKey(date: string, storeId: string | null, startTime: string): string {
  return `${date}|${storeId || 'null'}|${getTimeSlot(startTime)}`
}

/** 下見の画面で直した値（作品・GM・カテゴリ・備考・メモ扱い・役割）を取り込む行に反映する */
export function mergePreviewEdits<E extends { notes?: string }, P extends { scenario: string; gms: string[]; category: string; notes?: string; isMemo?: boolean; gmRoles?: Record<string, string> }>(parsedEvents: E[], previewEvents: Array<P | undefined>) {
  return parsedEvents.map((event, i) => {
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
}

/**
 * 同じセル（日付・店舗・時間帯）に 2 つ以上あれば最初のものを使い、残りは知らせて外す。中止の行は比べない。
 */
export function dropDuplicateImportCells<E extends { date?: string; is_cancelled?: boolean; store_id?: string | null; start_time: string; scenario?: string; venue: string }>(events: E[]): { filteredEvents: E[]; duplicatesInImport: string[] } {
  const cellKey = importCellKey
  const importCellMap = new Map<string, { scenario: string; venue: string; index: number }>()
  const duplicatesInImport: string[] = []
  const duplicateIndices = new Set<number>()
  for (let i = 0; i < events.length; i++) {
    const event = events[i]
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
  return { filteredEvents: events.filter((_, index: number) => !duplicateIndices.has(index)), duplicatesInImport }
}
