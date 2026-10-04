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
