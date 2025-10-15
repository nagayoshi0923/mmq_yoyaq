/**
 * かな・カナ・ローマ字の変換ユーティリティ
 */

/**
 * ひらがなをカタカナに変換
 */
export function hiraganaToKatakana(str: string): string {
  return str.replace(/[\u3041-\u3096]/g, (match) => {
    const chr = match.charCodeAt(0) + 0x60
    return String.fromCharCode(chr)
  })
}

/**
 * カタカナをひらがなに変換
 */
export function katakanaToHiragana(str: string): string {
  return str.replace(/[\u30a1-\u30f6]/g, (match) => {
    const chr = match.charCodeAt(0) - 0x60
    return String.fromCharCode(chr)
  })
}

/**
 * 文字列を正規化（検索用）
 * ひらがな・カタカナ・アルファベットを小文字に統一
 */
export function normalizeForSearch(str: string): string {
  return str
    .toLowerCase()
    .replace(/　/g, ' ') // 全角スペースを半角に
    .trim()
}

/**
 * 検索クエリが対象文字列にマッチするかチェック
 * ひらがな・カタカナ・アルファベットを考慮
 */
export function flexibleMatch(query: string, targets: string[]): boolean {
  if (!query) return true
  
  const normalizedQuery = normalizeForSearch(query)
  const hiraganaQuery = katakanaToHiragana(normalizedQuery)
  const katakanaQuery = hiraganaToKatakana(normalizedQuery)
  
  // 各対象文字列をチェック
  return targets.some(target => {
    if (!target) return false
    
    const normalizedTarget = normalizeForSearch(target)
    
    // 元のクエリ、ひらがな変換、カタカナ変換のいずれかでマッチ
    return normalizedTarget.includes(normalizedQuery) ||
           normalizedTarget.includes(hiraganaQuery) ||
           normalizedTarget.includes(katakanaQuery)
  })
}

/**
 * シナリオオブジェクトが検索クエリにマッチするかチェック
 */
export function matchScenario(
  query: string,
  scenario: {
    title: string
    reading_katakana?: string
    reading_alphabet?: string
    author?: string
  }
): boolean {
  if (!query) return true
  
  const searchTargets = [
    scenario.title,
    scenario.reading_katakana,
    scenario.reading_alphabet,
    scenario.author
  ].filter(Boolean) as string[]
  
  return flexibleMatch(query, searchTargets)
}

